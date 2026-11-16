-- HF13-077 PG18.7 NONPRODUCTION STORES ROLE INSTALLER CANDIDATE
-- NOT AUTHORIZED TO EXECUTE. Original owner designation + separate technical
-- admission, authenticated external TLS and baseline backup are mandatory.
-- No keys, passwords, actors, invoices, QC or GRN are fabricated here.
-- EXACT TARGET: Neon wandering-cake-50222227 / br-shiny-night-b3qgsj8t
-- DB hft_r1_retained_masters_np077; PostgreSQL 180007.
BEGIN;
DO $hf13_npstores_roles_preflight$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_r1_retained_masters_np077_owner'
 OR current_user<>session_user
 OR pg_is_in_recovery()
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN ('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR to_regnamespace('hft') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
 ('hft_engineering','hft_r1_posting_owner','hft_r1_app_runtime',
  'hft_r1_audit_verify','hft_r1_governance_issuer',
  'hft_r1_p3_master_owner','hft_r1_p3_master_runtime',
  'hft_r1_stores_np_login'))
 THEN RAISE EXCEPTION 'HF13_STORES_RESOURCE_PURPOSE_ROLE_OR_TLS_NOT_ADMITTED'; END IF;
END $hf13_npstores_roles_preflight$;

CREATE ROLE hft_r1_posting_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_app_runtime NOLOGIN INHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_audit_verify NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_governance_issuer NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- P3 photo schema references these otherwise INERT NOLOGIN groups.
-- No P3 function or P3 operational API is installed by Stores.
CREATE ROLE hft_r1_p3_master_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_p3_master_runtime NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- No SQL-source password. Approved secret issuance and independent DBA
-- enrollment are separate controls; installer credential is NOT created here.
CREATE ROLE hft_engineering LOGIN INHERIT PASSWORD NULL NOSUPERUSER
 NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_r1_stores_np_login NOLOGIN INHERIT PASSWORD NULL NOSUPERUSER
 NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT hft_r1_posting_owner TO hft_engineering
 WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
GRANT hft_r1_p3_master_owner TO hft_engineering
 WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
GRANT hft_r1_app_runtime TO hft_r1_stores_np_login
 WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
GRANT CONNECT,CREATE ON DATABASE hft_r1_retained_masters_np077
 TO hft_engineering;
GRANT CONNECT ON DATABASE hft_r1_retained_masters_np077
 TO hft_r1_stores_np_login;
-- Before operations: revoke CREATE/owner memberships from installer, disable
-- temporary login and independently verify NO app owner/issuer membership.
COMMIT;
