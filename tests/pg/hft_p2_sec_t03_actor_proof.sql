-- P2-SEC-T03: assertion-based proof negatives under REAL runtime login.
-- NOT RUN; psql inputs synthetic JSON from approved separate fixture service.
-- Before execution: \set valid_payload_json '...'
--                   \set valid_proof_json '...'
\set ON_ERROR_STOP on
\if :{?valid_payload_json}
\else
 \echo 'STOP P2_T03_MISSING_AUTHORIZED_TEST_PAYLOAD'
 \quit
\endif
\if :{?valid_proof_json}
\else
 \echo 'STOP P2_T03_MISSING_AUTHORIZED_TEST_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.payload',:'valid_payload_json',true);
SELECT pg_catalog.set_config('hft.test.proof',:'valid_proof_json',true);
DO $test$
DECLARE payload jsonb:=pg_catalog.current_setting('hft.test.payload')::jsonb;
 original_proof jsonb:=pg_catalog.current_setting('hft.test.proof')::jsonb;
 variant jsonb; state text; msg text; item jsonb;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T03_RESTRICTED_DISPOSABLE_LOGIN_REQUIRED'; END IF;
 -- Only fixture transport uses set_config; writer must NEVER read it as identity.
 PERFORM pg_catalog.set_config('hft.actor_subject','FORGED',true);
 FOR item IN SELECT pg_catalog.jsonb_build_object('payload',payload,'proof',original_proof||
    pg_catalog.jsonb_build_object('actorSubject','FORGED'))
 UNION ALL SELECT pg_catalog.jsonb_build_object('payload',payload||
    pg_catalog.jsonb_build_object('quantityMicro','4000000'),'proof',original_proof)
 UNION ALL SELECT pg_catalog.jsonb_build_object('payload',payload||
    pg_catalog.jsonb_build_object('sourceRevision','999'),'proof',original_proof)
 UNION ALL SELECT pg_catalog.jsonb_build_object('payload',payload,'proof',original_proof||
    pg_catalog.jsonb_build_object('nonce',pg_catalog.repeat('0',48)))
 UNION ALL SELECT pg_catalog.jsonb_build_object('payload',payload,'proof',original_proof||
    pg_catalog.jsonb_build_object('expiresAt','1'))
 LOOP
  BEGIN
   PERFORM hft.post_stock_command_protected_v1(item->'payload',item->'proof');
   RAISE EXCEPTION 'P2_T03_FORGED_REQUEST_WAS_POSTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
   IF state<>'P0001' OR msg='P2_T03_FORGED_REQUEST_WAS_POSTED'
   THEN RAISE EXCEPTION 'P2_T03_WRONG_REJECTION:%:%',state,msg; END IF;
  END;
 END LOOP;
END $test$;
ROLLBACK;
-- Separate audit-role before/after readback MUST prove zero new command,
-- nonce, fragment, balance, custody, outbox and seal effects.
