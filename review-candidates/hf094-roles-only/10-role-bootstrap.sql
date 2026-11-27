-- HF094 Roles-only exact retained target. NOT authorized by this file.
-- Execute ONLY inside guarded runner's single transaction; no standalone apply.
-- SQL session markers are defense in depth, not signatures or DBA authority.
DO $hf094_stop$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR (SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())<>16397
 OR current_setting('server_version_num')<>'180007'
 OR session_user<>'hft_r1_retained_masters_np077_owner' OR current_user<>session_user
 OR pg_catalog.pg_is_in_recovery()
 OR current_setting('hft.hf094_admitted',true) IS DISTINCT FROM 'roles-only-v1'
 OR COALESCE(current_setting('hft.hf094_order_sha256',true),'') !~ '^[0-9a-f]{64}$'
 OR COALESCE(current_setting('hft.hf094_technical_sha256',true),'') !~ '^[0-9a-f]{64}$'
 OR COALESCE(current_setting('hft.hf094_expires_at',true),'')=''
 THEN RAISE EXCEPTION 'HF094_INSTALLATION_NOT_ADMITTED'; END IF;
 IF pg_catalog.clock_timestamp()>=current_setting('hft.hf094_expires_at')::timestamptz
 THEN RAISE EXCEPTION 'HF094_INSTALLATION_ADMISSION_EXPIRED'; END IF;
END $hf094_stop$;

DO $fresh$ BEGIN
 IF to_regnamespace('hft') IS NOT NULL OR to_regnamespace('hft_app_roles') IS NOT NULL
 OR to_regnamespace('hft_secret') IS NOT NULL OR to_regnamespace('hft_crypto') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema')
  AND nspname !~ '^pg_(toast|temp)')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
 ('hft_engineering','hft_r1_roles_owner','hft_r1_roles_np_login','hft_r1_stores_np_login',
 'hft_r1_posting_owner','hft_r1_stores_gateway_owner','hft_r1_app_runtime','hft_r1_governance_issuer'))
 OR NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=(SELECT oid FROM pg_roles WHERE rolname=session_user))
 THEN RAISE EXCEPTION 'HF094_TARGET_NOT_FRESH_OR_ROLE_COLLISION'; END IF;
END $fresh$;
CREATE ROLE hft_engineering NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE hft_r1_roles_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE hft_r1_roles_np_login NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
-- Only the existing DB owner may temporarily assume the two DDL owners.
GRANT hft_engineering,hft_r1_roles_owner TO hft_r1_retained_masters_np077_owner
 WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
GRANT CREATE ON DATABASE hft_r1_retained_masters_np077 TO hft_engineering,hft_r1_roles_owner;
GRANT CONNECT ON DATABASE hft_r1_retained_masters_np077 TO hft_r1_roles_np_login;
-- Before canonical 0001–0006; revoke PUBLIC default function EXECUTE globally for actual creators.
SET LOCAL ROLE hft_engineering;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Runner now appends exact canonical migration bodies and revision rows, in order.
