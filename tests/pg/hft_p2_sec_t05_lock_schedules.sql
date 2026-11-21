-- P2-SEC-T05 session B: exact two-session opposing gate, NOT RUN.
-- Begin only after A_GATE_HELD. A must keep its transaction open until
-- B reports its outcome. Obtain fresh signed synthetic proof under 60 s.
\set ON_ERROR_STOP on
\if :{?gate_key}
\else
 \echo 'STOP T05_B_MISSING_GATE'
 \quit
\endif
\if :{?payload_json}
\else
 \echo 'STOP T05_B_MISSING_PAYLOAD'
 \quit
\endif
\if :{?proof_json}
\else
 \echo 'STOP T05_B_MISSING_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.t05.expected_gate',:'gate_key',true);
SET LOCAL lock_timeout = '1200ms';
SET LOCAL statement_timeout = '3500ms';
SELECT pg_catalog.set_config('hft.t05.payload',:'payload_json',true);
SELECT pg_catalog.set_config('hft.t05.proof',:'proof_json',true);
DO $guard$
DECLARE p jsonb:=pg_catalog.current_setting('hft.t05.payload')::jsonb;
 gate text:='HFT:GATE:'||p->>'legalEntityId'||':'||p->>'siteId'||':'||p->>'warehouseId';
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user OR
 NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR gate<>pg_catalog.current_setting('hft.t05.expected_gate')
 THEN RAISE EXCEPTION 'P2_T05_REAL_RUNTIME_AND_EXACT_GATE_REQUIRED'; END IF;
 IF pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(gate,0))
 THEN RAISE EXCEPTION 'P2_T05_GATE_NOT_HELD_BY_A'; END IF;
END $guard$;
DO $opposition$
DECLARE st text;msg text;res jsonb;
BEGIN
 BEGIN
  res:=hft.post_stock_command_protected_v1(
   pg_catalog.current_setting('hft.t05.payload')::jsonb,
   pg_catalog.current_setting('hft.t05.proof')::jsonb);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
 END;
 IF res IS NOT NULL THEN
  IF res->>'commandId'<>(pg_catalog.current_setting('hft.t05.payload')::jsonb)->>'commandId'
  THEN RAISE EXCEPTION 'P2_T05_SERIALIZED_RESULT_NOT_BOUND'; END IF;
  RAISE NOTICE 'P2_T05_SERIALIZED_SUCCESS_REQUIRES_INDEPENDENT_AUDIT';
 ELSIF st IN ('55P03','40P01','40001','57014') THEN
  RAISE NOTICE 'P2_T05_EXPECTED_ROLLBACK_SQLSTATE:%',st;
 ELSE
  RAISE EXCEPTION 'P2_T05_WRONG_CONCURRENCY_RESULT:%:%',st,msg;
 END IF;
END $opposition$;
COMMIT;
-- If successful, audit reader verifies exactly one sealed movement.
-- If timed out/aborted, audit snapshot must be unchanged and no nonce left.
