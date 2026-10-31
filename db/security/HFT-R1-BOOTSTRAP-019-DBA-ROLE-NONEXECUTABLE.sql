-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- NEVER execute or automatically discover via db/migrations. Chat 13 owner + Chat 10/11 approval required.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $g$ BEGIN IF current_database()<>'neondb' OR current_user<>'neondb_owner' OR current_setting('server_version_num')::int<>180006 to_regnamespace('hft') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('hft_staging_migration_owner','hft_r1_app_runtime','hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify','hft_r1_posting_owner','hft_r1_p3_master_owner','hft_r1_p3_master_runtime','hft_staging_masters_runtime','hft_r1_governance_issuer')) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')) THEN RAISE EXCEPTION 'HFT_SECURITY_PREFLIGHT'; END IF; END $g$;
REVOKE CONNECT,TEMPORARY,CREATE ON DATABASE neondb FROM PUBLIC;
CREATE ROLE hft_staging_migration_owner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_app_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_staging_app_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_audit_verify NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_staging_audit_verify LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Function owners are NOLOGIN; master runtime is isolated from Stores.
CREATE ROLE hft_r1_posting_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_master_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_master_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_governance_issuer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_staging_masters_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT hft_r1_app_runtime TO hft_staging_app_runtime WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT hft_r1_audit_verify TO hft_staging_audit_verify WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT hft_r1_p3_master_runtime TO hft_staging_masters_runtime WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT hft_r1_posting_owner TO hft_staging_migration_owner WITH ADMIN FALSE,INHERIT FALSE,SET TRUE;
GRANT hft_r1_p3_master_owner TO hft_staging_migration_owner WITH ADMIN FALSE,INHERIT FALSE,SET TRUE;
GRANT CONNECT,CREATE ON DATABASE neondb TO hft_staging_migration_owner;
GRANT CONNECT ON DATABASE neondb TO hft_staging_app_runtime,hft_staging_audit_verify,hft_staging_masters_runtime;
COMMIT; SELECT 'HFT_SECURITY_BOOTSTRAP_ACK';
