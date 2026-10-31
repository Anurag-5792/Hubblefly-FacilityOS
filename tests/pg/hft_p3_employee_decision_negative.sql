-- HFT P3 Employee decision negatives: SOURCE ONLY / PG NOT RUN.
-- Real restricted disposable P3 login, immutable independently provisioned
-- synthetic policy/person data, short-lived, valid original signed proof.
-- Required psql variables: decision_json,decision_proof_json,self_decision_json,
-- self_decision_proof_json. Self proof MUST authenticate the request maker as
-- the decision actor; SQL must reject the same human even with login aliases.
\set ON_ERROR_STOP on
\if :{?decision_json}
\else
 \echo 'STOP P3_DECISION_FIXTURE_MISSING'
 \quit
\endif
\if :{?decision_proof_json}
\else
 \echo 'STOP P3_DECISION_PROOF_MISSING'
 \quit
\endif
\if :{?self_decision_json}
\else
 \echo 'STOP P3_SAME_HUMAN_DECISION_MISSING'
 \quit
\endif
\if :{?self_decision_proof_json}
\else
 \echo 'STOP P3_SAME_HUMAN_PROOF_MISSING'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.p3.neg.decision',:'decision_json',true);
SELECT pg_catalog.set_config('hft.p3.neg.proof',:'decision_proof_json',true);
SELECT pg_catalog.set_config('hft.p3.neg.self',:'self_decision_json',true);
SELECT pg_catalog.set_config('hft.p3.neg.selfproof',:'self_decision_proof_json',true);
DO $p3_negative$
DECLARE d jsonb:=pg_catalog.current_setting('hft.p3.neg.decision')::jsonb;
 proof jsonb:=pg_catalog.current_setting('hft.p3.neg.proof')::jsonb;
 forged jsonb; state text;detail text;
BEGIN
 IF pg_catalog.current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P3_REAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
 FOR forged IN SELECT value FROM pg_catalog.jsonb_array_elements(
 pg_catalog.jsonb_build_array(
  d||pg_catalog.jsonb_build_object('requestPayloadSha256',
   pg_catalog.repeat('f',64)),
  d||pg_catalog.jsonb_build_object('expectedVersion','999'),
  d||pg_catalog.jsonb_build_object('siteId','WRONG'),
  d||pg_catalog.jsonb_build_object('policyRevision','999')
 )) AS x(value)
 LOOP
  BEGIN
   PERFORM hft.p3_decide_apply_employee_v1(forged,proof);
   RAISE EXCEPTION 'P3_FORGED_DECISION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,detail=MESSAGE_TEXT;
   IF state<>'P0001' OR detail='P3_FORGED_DECISION_ACCEPTED'
   THEN RAISE EXCEPTION 'P3_NEGATIVE_DECISION_WRONG_SQLSTATE:%:%',state,detail; END IF;
  END;
 END LOOP;
 BEGIN
  PERFORM hft.p3_decide_apply_employee_v1(
   d,proof||pg_catalog.jsonb_build_object('macSha256',pg_catalog.repeat('0',64)));
  RAISE EXCEPTION 'P3_FORGED_MAC_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,detail=MESSAGE_TEXT;
  IF state<>'P0001' OR detail='P3_FORGED_MAC_ACCEPTED'
  THEN RAISE EXCEPTION 'P3_NEGATIVE_MAC_WRONG_SQLSTATE:%:%',state,detail; END IF;
 END;
 BEGIN
  PERFORM hft.p3_decide_apply_employee_v1(
   pg_catalog.current_setting('hft.p3.neg.self')::jsonb,
   pg_catalog.current_setting('hft.p3.neg.selfproof')::jsonb);
  RAISE EXCEPTION 'P3_SELF_APPROVAL_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,detail=MESSAGE_TEXT;
  IF state<>'P0001' OR detail<>'P3_ELIGIBLE_INDEPENDENT_PERSON_REQUIRED'
  THEN RAISE EXCEPTION 'P3_SELF_APPROVAL_WRONG_SQLSTATE:%:%',state,detail; END IF;
 END;
END $p3_negative$;
ROLLBACK;
-- Independent audit LOGIN must compare pending request/nonce, Employee,
-- employee_revision, p3_master_decision/revision/audit snapshots BEFORE
-- and AFTER; every rejected proof produces zero durable changes. NOT RUN.
