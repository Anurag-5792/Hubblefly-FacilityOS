-- DERIVED EXACT-SOURCE EXECUTABLE SQL CANDIDATE, REVIEW/TECHNICAL ADMISSION REQUIRED.
-- Original STOP-GUARDED source preserved in 10-MVP-DBA-ROLES-STOP.sql.
-- Standalone source candidate; do not execute without approved signer/role/backup/TLS admission.
-- HF13 R77 RETAINED PG18.7: STRICT MVP ROLE CREATION CANDIDATE.
-- STOP-GUARDED, NOT ADMITTED. Must execute under separately qualified Neon DBA.
-- Credentials are NEVER generated in SQL/source; passwordless LOGIN roles
-- remain unusable until approved managed secret issuance.
BEGIN;
-- STOP guard omitted in this separate review derivative; all preflight checks preserved.
DO $HF13_MVP_DBA_PREFLIGHT$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_r1_retained_masters_np077_owner'
 OR current_user<>session_user
 OR pg_is_in_recovery()
 OR (SELECT count(*) FROM pg_roles WHERE rolname IN(
 'hft_engineering','hft_r1_posting_owner','hft_r1_p3_master_owner',
 'hft_r1_p3_master_runtime','hft_r1_p3_corporate_bootstrap_owner',
 'hft_r1_p3_corporate_bootstrap_runtime','hft_r1_corporate077_login',
 'hft_r1_retained_p3_login','hft_r1_governance_issuer',
 'hft_r1_audit_verify','hft_r1_app_runtime'))<>0
 THEN RAISE EXCEPTION 'HF13_MVP_DBA_OR_EMPTY_ROLES_NOT_QUALIFIED'; END IF;
END $HF13_MVP_DBA_PREFLIGHT$;

-- PG18 separate role groups. All group owners are NOLOGIN.
CREATE ROLE hft_r1_posting_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_master_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_master_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_corporate_bootstrap_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_corporate_bootstrap_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_governance_issuer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_audit_verify NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_app_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Installer is NOT app runtime; password remains NULL pending separate
-- managed credential issuance. Temporary SET-TRUE owner memberships are
-- required only for restricted CREATE SCHEMA/ALTER FUNCTION and revoked at close.
CREATE ROLE hft_engineering LOGIN INHERIT PASSWORD NULL
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT hft_r1_posting_owner TO hft_engineering WITH ADMIN FALSE,INHERIT TRUE,SET TRUE;
GRANT hft_r1_p3_master_owner TO hft_engineering WITH ADMIN FALSE,INHERIT TRUE,SET TRUE;
GRANT hft_r1_p3_corporate_bootstrap_owner TO hft_engineering
 WITH ADMIN FALSE,INHERIT TRUE,SET TRUE;
GRANT CREATE,CONNECT ON DATABASE hft_r1_retained_masters_np077 TO hft_engineering;

-- Distinct runtime and corporate-bootstrap login identities, no credentials.
CREATE ROLE hft_r1_retained_p3_login LOGIN INHERIT PASSWORD NULL
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_corporate077_login LOGIN INHERIT PASSWORD NULL
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT hft_r1_p3_master_runtime TO hft_r1_retained_p3_login
 WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT hft_r1_p3_corporate_bootstrap_runtime TO hft_r1_corporate077_login
 WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
GRANT CONNECT ON DATABASE hft_r1_retained_masters_np077 TO
 hft_r1_retained_p3_login,hft_r1_corporate077_login;

-- At separately approved installation close, DBA MUST revoke all three
-- temporary owner memberships from hft_engineering and revoke CREATE on DB.
-- Do not register any stock/posting runtime login or insert any master row.
COMMIT;
