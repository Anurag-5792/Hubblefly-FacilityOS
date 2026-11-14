-- P2 SEC-T03 exact forged-proof negative outcomes under real runtime login.
-- PostgreSQL NOT RUN. The companion independent audit snapshot script MUST
-- compare committed facts before/after this test, not assume ROLLBACK is proof.
\set ON_ERROR_STOP on
\if :{?valid_payload_json}
\else
 \echo 'STOP P2_T03_NO_SYNTHETIC_PAYLOAD'
 \quit
\endif
\if :{?valid_proof_json}
\else
 \echo 'STOP P2_T03_NO_SYNTHETIC_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.payload',:'valid_payload_json',true);
SELECT pg_catalog.set_config('hft.test.proof',:'valid_proof_json',true);
DO $t03$
DECLARE p jsonb:=pg_catalog.current_setting('hft.test.payload')::jsonb;
 proof jsonb:=pg_catalog.current_setting('hft.test.proof')::jsonb;
 v record; got_state text; got_message text; accepted boolean;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T03_ACTUAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
 -- Custom GUC is deliberately not trusted as an actor identity.
 PERFORM pg_catalog.set_config('hft.actor_subject','FORGED',true);
 FOR v IN SELECT * FROM (VALUES
  ('ACTOR',p,proof||pg_catalog.jsonb_build_object('actorSubject','FORGED'),
     'P2_INVOCATION_PROOF_MAC_INVALID'),
  ('SESSION',p,proof||pg_catalog.jsonb_build_object('sessionId','FORGED'),
     'P2_INVOCATION_PROOF_MAC_INVALID'),
  ('QUANTITY',p||pg_catalog.jsonb_build_object('quantityMicro','4000000'),proof,
     'P2_PROOF_PAYLOAD_MISMATCH'),
  ('REVISION',p||pg_catalog.jsonb_build_object('sourceRevision','999'),proof,
     'P2_PROOF_PAYLOAD_MISMATCH'),
  ('NONCE',p,proof||pg_catalog.jsonb_build_object('nonce',pg_catalog.repeat('0',48)),
     'P2_INVOCATION_PROOF_MAC_INVALID'),
  ('MAC',p,proof||pg_catalog.jsonb_build_object('macSha256',
   (CASE WHEN pg_catalog.left(proof->>'macSha256',1)='0' THEN '1' ELSE '0' END)
     ||pg_catalog.substr(proof->>'macSha256',2)), 'P2_INVOCATION_PROOF_MAC_INVALID'),
  ('EXPIRED',p,proof||pg_catalog.jsonb_build_object('expiresAt','1'),
     'P2_PROOF_EXPIRED_OR_FUTURE')
 ) AS variants(label,payload,original_proof,expected)
 LOOP
  accepted:=false; got_state:=NULL; got_message:=NULL;
  BEGIN
   PERFORM hft.post_stock_command_protected_v1(v.payload,v.original_proof);
   accepted:=true;
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS got_state=RETURNED_SQLSTATE,
      got_message=MESSAGE_TEXT;
  END;
  IF accepted OR got_state IS DISTINCT FROM 'P0001'
    OR got_message IS DISTINCT FROM v.expected
  THEN RAISE EXCEPTION 'P2_T03_WRONG_RESULT:%:state=%:message=%:accepted=%',
    v.label,got_state,got_message,accepted; END IF;
 END LOOP;
END $t03$;
-- A failed command's nonce/ledger/custody/outbox must not commit.
ROLLBACK;
-- MANDATORY separately run hft_p2_sec_t03_audit_snapshot.sql before
-- and after, with exact identical fingerprint and no target command.
