-- HFT P3 Employee CREATE / ACTIVATE synthetic two-human acceptance, NOT RUN.
-- Requires real restricted P3 runtime login, disposable qualified PG15+,
-- independent approved key custody and freshly signed synthetic fixtures.
\set ON_ERROR_STOP on
\if :{?create_request}
\else
 \echo 'STOP P3_CREATE_REQUEST_REQUIRED'
 \quit
\endif
\if :{?create_request_proof}
\else
 \echo 'STOP P3_CREATE_SIGNED_PROOF_REQUIRED'
 \quit
\endif
\if :{?create_decision}
\else
 \echo 'STOP P3_CREATE_INDEPENDENT_DECISION_REQUIRED'
 \quit
\endif
\if :{?create_decision_proof}
\else
 \echo 'STOP P3_CREATE_DECISION_PROOF_REQUIRED'
 \quit
\endif
\if :{?activation_request}
\else
 \echo 'STOP P3_ACTIVATION_REQUEST_REQUIRED'
 \quit
\endif
\if :{?activation_request_proof}
\else
 \echo 'STOP P3_ACTIVATION_PROOF_REQUIRED'
 \quit
\endif
\if :{?activation_decision}
\else
 \echo 'STOP P3_ACTIVATION_INDEPENDENT_DECISION_REQUIRED'
 \quit
\endif
\if :{?activation_decision_proof}
\else
 \echo 'STOP P3_ACTIVATION_DECISION_PROOF_REQUIRED'
 \quit
\endif
\if :{?employee_read_query}
\else
 \echo 'STOP P3_EMPLOYEE_READ_QUERY_REQUIRED'
 \quit
\endif
\if :{?employee_read_proof}
\else
 \echo 'STOP P3_EMPLOYEE_READ_PROOF_REQUIRED'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $pre$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P3_QUALIFIED_SYNTHETIC_RUNTIME_REQUIRED'; END IF;
END $pre$;
SELECT hft.p3_submit_master_change_v1(
 :'create_request'::jsonb,:'create_request_proof'::jsonb)::text AS create_request_id \gset
SELECT 1 / CASE WHEN :'create_request_id'=(:'create_request'::jsonb->>'requestId')
 THEN 1 ELSE 0 END AS exact_pending_request_id;
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.p3_decide_apply_employee_v1(
 :'create_decision'::jsonb,:'create_decision_proof'::jsonb) AS created \gset
SELECT 1 / CASE WHEN :'created'::jsonb->>'state'='APPLIED' AND
 (:'created'::jsonb->>'active')::boolean=false AND
 :'created'::jsonb->>'version'='1' THEN 1 ELSE 0 END
 AS independently_approved_creation_inactive;
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.p3_submit_master_change_v1(
 :'activation_request'::jsonb,:'activation_request_proof'::jsonb)::text AS activation_request_id \gset
COMMIT;
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.p3_decide_apply_employee_v1(
 :'activation_decision'::jsonb,:'activation_decision_proof'::jsonb) AS activated \gset
SELECT 1 / CASE WHEN :'activated'::jsonb->>'state'='APPLIED' AND
 (:'activated'::jsonb->>'active')::boolean=true AND
 :'activated'::jsonb->>'version'='2' THEN 1 ELSE 0 END
 AS independently_approved_activation;
COMMIT;
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT hft.p3_read_masters_v1(
 :'employee_read_query'::jsonb,:'employee_read_proof'::jsonb) AS observed \gset
SELECT 1 / CASE WHEN :'observed'::jsonb->>'state'='AVAILABLE'
 AND pg_catalog.jsonb_array_length(:'observed'::jsonb->'records')=1
 AND (:'observed'::jsonb->'records'->0->>'active')::boolean=true
 AND (:'observed'::jsonb->'records'->0->>'version')::bigint=2
 THEN 1 ELSE 0 END AS committed_scoped_employee_readback;
COMMIT;
-- Auditor separately checks exact 2 Employee revisions, REQUESTED x2,
-- APPROVED x2, APPLIED x2 and immutable evidence digests, with no custody
-- changes. This is NOT accepted until real PG audit results are captured.
