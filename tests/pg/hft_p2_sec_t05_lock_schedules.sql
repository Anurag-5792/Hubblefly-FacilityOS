-- P2-SEC-T05 B: assertion test under a controlled opposing-lock schedule.
-- NOT RUN; Session A must hold gate/stock using the companion script.
-- Run ONLY on accepted disposable PG under actual restricted LOGIN.
\set ON_ERROR_STOP on
\if :{?payload_json}
\else
 \echo 'STOP P2_T05_NO_PAYLOAD'
 \quit
\endif
\if :{?proof_json}
\else
 \echo 'STOP P2_T05_NO_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.test.payload',:'payload_json',true);
SELECT pg_catalog.set_config('hft.test.proof',:'proof_json',true);
DO $opposition$
DECLARE st text;msg text;
BEGIN
 BEGIN
   PERFORM hft.post_stock_command_protected_v1(
    pg_catalog.current_setting('hft.test.payload')::jsonb,
    pg_catalog.current_setting('hft.test.proof')::jsonb);
   RAISE EXCEPTION 'P2_T05_UNEXPECTED_COMMIT_BEFORE_BARRIER_RELEASE';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  IF st NOT IN ('40001','40P01','55P03','57014') OR
      msg='P2_T05_UNEXPECTED_COMMIT_BEFORE_BARRIER_RELEASE' THEN
    RAISE EXCEPTION 'P2_T05_UNEXPECTED_SQLSTATE:%:%',st,msg;
  END IF;
 END;
END $opposition$;
ROLLBACK;
-- Independent audit LOGIN verifies zero partial stock/custody/nonce/audit.
-- A valid posting-first schedule is a SEPARATE case with own fresh proof.
