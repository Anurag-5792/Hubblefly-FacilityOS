-- P2-SEC-T04 B: assertion test AFTER governance Session A commits Hold.
-- NOT RUN. A must run hft_p2_sec_t04_session_a.sql first.
-- Runtime must use actual restricted LOGIN + separately signed synthetic proof.
\set ON_ERROR_STOP on
\if :{?payload_json}
\else
 \echo 'STOP P2_T04_NO_SIGNED_PAYLOAD'
 \quit
\endif
\if :{?proof_json}
\else
 \echo 'STOP P2_T04_NO_SIGNED_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.payload',:'payload_json',true);
SELECT pg_catalog.set_config('hft.test.proof',:'proof_json',true);
DO $hold_test$
DECLARE status text;message text;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user OR
 NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T04_RESTRICTED_RUNTIME_LOGIN_REQUIRED'; END IF;
 BEGIN
   PERFORM hft.post_stock_command_protected_v1(
    pg_catalog.current_setting('hft.test.payload')::jsonb,
    pg_catalog.current_setting('hft.test.proof')::jsonb);
   RAISE EXCEPTION 'P2_T04_HOLD_BYPASS';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS status=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   IF status<>'P0001' OR message NOT IN ('P2_PARENT_SCOPE_HOLD_ACTIVE',
      'P2_BLOCKING_HOLD','P2_POLICY_GENERATION_INVALID') THEN
      RAISE EXCEPTION 'P2_T04_UNEXPECTED_HOLD_RESULT:%:%',status,message;
   END IF;
 END;
END $hold_test$;
ROLLBACK;
-- Verify via independent audit LOGIN: zero command/nonce/ledger/outbox/seal
-- for denied payload; capture backend PID, txid, clock and SQLSTATE.
