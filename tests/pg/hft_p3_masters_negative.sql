-- SOURCE ONLY, NOT RUN. Dedicated synthetic test requires signed P3 proof.
-- One denied attempt must leave nonce/draft/master/audit/revision unchanged.
\set ON_ERROR_STOP on
\if :{?p3_payload}
\else
 \echo 'STOP P3_SYNTHETIC_PAYLOAD_REQUIRED'
 \quit
\endif
\if :{?p3_proof}
\else
 \echo 'STOP P3_SYNTHETIC_PROOF_REQUIRED'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.p3_payload',:'p3_payload',true);
SELECT pg_catalog.set_config('hft.test.p3_proof',:'p3_proof',true);
DO $negative$
DECLARE p jsonb:=pg_catalog.current_setting('hft.test.p3_payload')::jsonb;
 proof jsonb:=pg_catalog.current_setting('hft.test.p3_proof')::jsonb;
 broken jsonb;state text;message text;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P3_ACTUAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
 FOR broken IN SELECT v.value FROM pg_catalog.jsonb_array_elements(
  pg_catalog.jsonb_build_array(
  p||pg_catalog.jsonb_build_object('warehouseId','WRONG_SCOPE'),
  p||pg_catalog.jsonb_build_object('expectedVersion','999999'),
  p||pg_catalog.jsonb_build_object('operation','ACTIVATE'),
  p||pg_catalog.jsonb_build_object('values',
    (p->'values')||pg_catalog.jsonb_build_object('active',true))
  )) AS v(value)
 LOOP
  BEGIN
   PERFORM hft.p3_submit_master_change_v1(broken,proof);
   RAISE EXCEPTION 'P3_FORGED_MASTER_REQUEST_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   IF state<>'P0001' OR message='P3_FORGED_MASTER_REQUEST_ACCEPTED'
   THEN RAISE EXCEPTION 'P3_WRONG_REJECTION:%:%',state,message; END IF;
  END;
 END LOOP;
END $negative$;
ROLLBACK;
-- Independent auditor MUST compare immutable nonce, request, revision,
-- audit, master row and balance fingerprints before and after. NOT RUN.
