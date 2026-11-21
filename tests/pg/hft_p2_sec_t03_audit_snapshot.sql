-- T03/T07 independent READ-ONLY durable-fact fingerprint, NOT RUN.
-- Run under real hft_r1_audit_verify LOGIN BEFORE negatives. Record output
-- fingerprint; then rerun AFTER with -v audit_expected_hash=<previous>.
-- The fixture entity is isolated: another active session mutating it is
-- a test blocker, not reason to waive a difference.
\set ON_ERROR_STOP on
\if :{?audit_entity}
\else
 \echo 'STOP P2_AUDIT_SNAPSHOT_MISSING_ENTITY'
 \quit
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $prereq$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_audit_verify','MEMBER')
 THEN RAISE EXCEPTION 'P2_INDEPENDENT_AUDITOR_REQUIRED'; END IF;
END $prereq$;
SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
 'commands',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.id)
   FROM hft.stock_command x WHERE x.legal_entity_id=:'audit_entity'),
 'entries',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.id)
   FROM hft.stock_entry x JOIN hft.stock_command c ON c.id=x.command_id
   WHERE c.legal_entity_id=:'audit_entity'),
 'accounts',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.id)
   FROM hft.stock_account x WHERE x.legal_entity_id=:'audit_entity'),
 'custody',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.issue_command_id)
   FROM hft.employee_custody x WHERE x.legal_entity_id=:'audit_entity'),
 'fragments',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.fragment_id)
   FROM hft.posting_fragment x WHERE x.legal_entity_id=:'audit_entity'),
 'nonce_counts',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.command_id)
   FROM hft.posting_nonce_audit_v1 x WHERE x.legal_entity_id=:'audit_entity'),
 'outcomes',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.command_id)
   FROM hft.stock_command_outcome x JOIN hft.stock_command c ON c.id=x.command_id
   WHERE c.legal_entity_id=:'audit_entity'),
 'audit',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.id)
   FROM hft.audit_outbox x JOIN hft.stock_command c ON c.id=x.command_id
   WHERE c.legal_entity_id=:'audit_entity'),
 'delivery',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.outbox_id)
   FROM hft.audit_delivery x JOIN hft.audit_outbox a ON a.id=x.outbox_id
   JOIN hft.stock_command c ON c.id=a.command_id WHERE c.legal_entity_id=:'audit_entity'),
 'seals',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.command_id)
   FROM hft.stock_command_seal x JOIN hft.stock_command c ON c.id=x.command_id
   WHERE c.legal_entity_id=:'audit_entity')
 )::text) AS audit_observed_hash \gset
\echo P2_AUDIT_OBSERVED_HASH :audit_observed_hash
\if :{?audit_expected_hash}
 SELECT 1 / CASE WHEN :'audit_observed_hash'=:'audit_expected_hash' THEN 1 ELSE 0 END
   AS independent_no_durable_mutation;
\else
 \echo P2_AUDIT_BASELINE_CAPTURED_REPEAT_WITH_audit_expected_hash
\endif
COMMIT;
