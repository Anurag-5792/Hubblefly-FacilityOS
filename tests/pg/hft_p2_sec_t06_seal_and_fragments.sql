-- P2-SEC-T06: AUTHORIZED SYNTHETIC POSITIVE AND NEGATIVE FRAGMENTS.
-- NOT EXECUTED. Only approved disposable PG15+, real restricted runtime
-- LOGIN, separately qualified human approval and fixture-issued HMAC proofs.
-- Fixture must provide all six exact payload/proof pairs, nonce-unique:
-- RECEIVE 5; ISSUE-A 2; ISSUE-B 3; RETURN-A1 1; RETURN-A2 1;
-- ISSUE-C 1 (over ceiling); RETURN-A3 1 (over original custody).
\set ON_ERROR_STOP on
\if :{?receive_payload}
\else
 \echo 'STOP P2_T06_RECEIVE_FIXTURE_MISSING'
 \quit
\endif
\if :{?receive_proof}
\else
 \echo 'STOP P2_T06_RECEIVE_PROOF_MISSING'
 \quit
\endif
\if :{?issue_a_payload}
\else
 \echo 'STOP P2_T06_ISSUE_A_FIXTURE_MISSING'
 \quit
\endif
\if :{?issue_a_proof}
\else
 \echo 'STOP P2_T06_ISSUE_A_PROOF_MISSING'
 \quit
\endif
\if :{?issue_b_payload}
\else
 \echo 'STOP P2_T06_ISSUE_B_FIXTURE_MISSING'
 \quit
\endif
\if :{?issue_b_proof}
\else
 \echo 'STOP P2_T06_ISSUE_B_PROOF_MISSING'
 \quit
\endif
\if :{?return_a1_payload}
\else
 \echo 'STOP P2_T06_RETURN_A1_FIXTURE_MISSING'
 \quit
\endif
\if :{?return_a1_proof}
\else
 \echo 'STOP P2_T06_RETURN_A1_PROOF_MISSING'
 \quit
\endif
\if :{?return_a2_payload}
\else
 \echo 'STOP P2_T06_RETURN_A2_FIXTURE_MISSING'
 \quit
\endif
\if :{?return_a2_proof}
\else
 \echo 'STOP P2_T06_RETURN_A2_PROOF_MISSING'
 \quit
\endif
\if :{?issue_c_payload}
\else
 \echo 'STOP P2_T06_ISSUE_C_NEGATIVE_FIXTURE_MISSING'
 \quit
\endif
\if :{?issue_c_proof}
\else
 \echo 'STOP P2_T06_ISSUE_C_NEGATIVE_PROOF_MISSING'
 \quit
\endif
\if :{?return_a3_payload}
\else
 \echo 'STOP P2_T06_RETURN_A3_NEGATIVE_FIXTURE_MISSING'
 \quit
\endif
\if :{?return_a3_proof}
\else
 \echo 'STOP P2_T06_RETURN_A3_NEGATIVE_PROOF_MISSING'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user OR NOT pg_catalog.pg_has_role(
 session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T06_RESTRICTED_DISPOSABLE_RUNTIME_REQUIRED'; END IF;
END $pre$;
COMMIT;
-- Each positive movement is a separate committed command and fresh nonce.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.post_stock_command_protected_v1(:'receive_payload'::jsonb,:'receive_proof'::jsonb);
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.post_stock_command_protected_v1(:'issue_a_payload'::jsonb,:'issue_a_proof'::jsonb);
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.post_stock_command_protected_v1(:'issue_b_payload'::jsonb,:'issue_b_proof'::jsonb);
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.post_stock_command_protected_v1(:'return_a1_payload'::jsonb,:'return_a1_proof'::jsonb);
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.post_stock_command_protected_v1(:'return_a2_payload'::jsonb,:'return_a2_proof'::jsonb);
COMMIT;
-- Negative commands must fail before any additional durable command/fragment.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.bad_issue_payload',:'issue_c_payload',true);
SELECT pg_catalog.set_config('hft.test.bad_issue_proof',:'issue_c_proof',true);
SELECT pg_catalog.set_config('hft.test.bad_return_payload',:'return_a3_payload',true);
SELECT pg_catalog.set_config('hft.test.bad_return_proof',:'return_a3_proof',true);
DO $negative$
DECLARE state text;message text;
BEGIN
 BEGIN
  PERFORM hft.post_stock_command_protected_v1(
   pg_catalog.current_setting('hft.test.bad_issue_payload')::jsonb,
   pg_catalog.current_setting('hft.test.bad_issue_proof')::jsonb);
  RAISE EXCEPTION 'P2_T06_ISSUE_OVERCEILING_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF state<>'P0001' OR message NOT IN
   ('P2_PARTIAL_ISSUE_CEILING_EXCEEDED','P2_INSUFFICIENT_AVAILABLE_QUANTITY')
  THEN RAISE EXCEPTION 'P2_T06_ISSUE_WRONG_FAILURE:%:%',state,message; END IF;
 END;
 BEGIN
  PERFORM hft.post_stock_command_protected_v1(
   pg_catalog.current_setting('hft.test.bad_return_payload')::jsonb,
   pg_catalog.current_setting('hft.test.bad_return_proof')::jsonb);
  RAISE EXCEPTION 'P2_T06_RETURN_OVERCUSTODY_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF state<>'P0001' OR message NOT IN
   ('P2_PARTIAL_RETURN_CEILING_EXCEEDED','P2_EMPLOYEE_CUSTODY_CEILING_EXCEEDED')
  THEN RAISE EXCEPTION 'P2_T06_RETURN_WRONG_FAILURE:%:%',state,message; END IF;
 END;
END $negative$;
ROLLBACK;
-- Run hft_p2_sec_t06_audit_verify.sql with an independent verifier LOGIN.
-- Rejection is accepted ONLY when command, fragment, custody, balances,
-- account ledger, nonce, outcome, audit/outbox and seal reconstruct exactly.
