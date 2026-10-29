-- HFT P3 pending-request conflict: real PG SOURCE ONLY / NOT RUN.
-- Requires an already COMMITTED synthetic pending Employee CREATE, and a
-- separately signed, distinct request UUID for the SAME entity/employee,
-- action and expected version. Do not reuse a nonce or signer MAC.
-- Run only with authorized disposable PG15+ and restricted P3 LOGIN.
\set ON_ERROR_STOP on
\if :{?duplicate_payload}
\else
 \echo 'STOP P3_DUPLICATE_PAYLOAD_REQUIRED'
 \quit
\endif
\if :{?duplicate_proof}
\else
 \echo 'STOP P3_DUPLICATE_PROOF_REQUIRED'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.duplicate_payload',:'duplicate_payload',true);
SELECT pg_catalog.set_config('hft.test.duplicate_proof',:'duplicate_proof',true);
DO $p3_duplicate$
DECLARE
 request_json jsonb:=pg_catalog.current_setting('hft.test.duplicate_payload')::jsonb;
 proof_json jsonb:=pg_catalog.current_setting('hft.test.duplicate_proof')::jsonb;
 state text;message text; existing_count bigint;request_id uuid;
BEGIN
 IF pg_catalog.current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P3_REAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
 -- We cannot SELECT protected tables under the runtime login; exact signed
 -- proof must reach the protected writer and be rejected for a pending row.
 BEGIN
  request_id:=hft.p3_submit_master_change_v1(request_json,proof_json);
  RAISE EXCEPTION 'P3_DUPLICATE_UNDECIDED_MASTER_REQUEST_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF state<>'P0001' OR message<>'P3_PENDING_MASTER_REQUEST_ALREADY_EXISTS'
  THEN RAISE EXCEPTION 'P3_UNEXPECTED_DUPLICATE_DECISION:%:%',state,message; END IF;
 END;
END $p3_duplicate$;
ROLLBACK;
-- Independent audit LOGIN compares count/digest of pending requests, proof
-- nonces, revisions and audit events BEFORE/AFTER this rejected transaction.
-- A denial that is already committed may be followed by a new governed
-- proposal, with a fresh request UUID and exact signed proof.
