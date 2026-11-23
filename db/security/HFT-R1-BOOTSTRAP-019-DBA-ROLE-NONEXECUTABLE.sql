-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- Execute only under a later exact MASTER authorization.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $g$
BEGIN
 IF current_database()<>'neondb' OR current_user<>'neondb_owner'
 OR current_user<>session_user
 OR current_setting('server_version_num')::int<>180006
 OR to_regnamespace('hft') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
   ('hft_staging_migration_owner','hft_r1_app_runtime',
    'hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify'))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S'))
 THEN RAISE EXCEPTION 'HFT_SECURITY_PREFLIGHT'; END IF;
END $g$;
REVOKE CONNECT,TEMPORARY,CREATE ON DATABASE neondb FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE hft_staging_migration_owner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_app_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_staging_app_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_audit_verify NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_staging_audit_verify LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT hft_r1_app_runtime TO hft_staging_app_runtime WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT hft_r1_audit_verify TO hft_staging_audit_verify WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT CONNECT,CREATE ON DATABASE neondb TO hft_staging_migration_owner;
GRANT CONNECT ON DATABASE neondb TO hft_staging_app_runtime,hft_staging_audit_verify;
DO $v$
BEGIN
 IF EXISTS(
  SELECT 1 FROM pg_roles r
  WHERE r.rolname IN ('hft_staging_migration_owner','hft_r1_app_runtime',
    'hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify')
  AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls))
 OR EXISTS(
  SELECT 1 FROM pg_auth_members m
  JOIN pg_roles member ON member.oid=m.member
  JOIN pg_roles parent ON parent.oid=m.roleid
  WHERE member.rolname IN ('hft_staging_migration_owner','hft_r1_app_runtime',
    'hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify')
  AND parent.rolname='neon_superuser')
 THEN RAISE EXCEPTION 'HFT_RESTRICTED_ROLE_ELEVATION'; END IF;
END $v$;
COMMIT;
SELECT 'HFT_SECURITY_BOOTSTRAP_ACK';
