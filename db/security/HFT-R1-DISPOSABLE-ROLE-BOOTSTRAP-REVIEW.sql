-- Security-owner review-only NONPRODUCTION role plan (no credentials).
-- Run only with authorized DBA on an approved disposable PG database,
-- after a separately reviewed and versioned approval-boundary migration.
-- The migration user hft_engineering must NOT be given CREATEROLE.
BEGIN;
DO $guard$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_setting('server_version_num')::integer<150000 THEN
   RAISE EXCEPTION 'DISPOSABLE_PG_REQUIRED';
 END IF;
END $guard$;
-- These roles are NOLOGIN group roles. Operator provisions their member
-- identities separately; never store passwords in source control.
DO $roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_app_runtime') THEN
   CREATE ROLE hft_r1_app_runtime NOLOGIN NOINHERIT;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_audit_verify') THEN
   CREATE ROLE hft_r1_audit_verify NOLOGIN NOINHERIT;
 END IF;
END $roles$;
-- Table owner is hft_engineering; application runtime is NEVER a table owner.
-- A separate owner-role execution must apply the following after role creation.
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM hft_r1_app_runtime,hft_r1_audit_verify;
GRANT USAGE ON SCHEMA hft TO hft_r1_app_runtime,hft_r1_audit_verify;
GRANT SELECT ON hft.legal_entity,hft.site,hft.item,hft.warehouse,hft.location
 TO hft_r1_app_runtime;
GRANT SELECT ON hft.stock_entry,hft.stock_command,hft.stock_account,
 hft.audit_outbox,hft.stock_command_outcome TO hft_r1_audit_verify;
-- Do NOT grant INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER to runtime.
-- Do NOT grant CREATE on schema; no EXECUTE on posting/security functions yet.
-- Until a checked SECURITY DEFINER single posting function exists,
-- runtime stock posting intentionally fails closed.
COMMIT;
