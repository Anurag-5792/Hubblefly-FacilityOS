-- DERIVED EXACT-SOURCE EXECUTABLE SQL CANDIDATE, REVIEW/TECHNICAL ADMISSION REQUIRED.
-- Original STOP-GUARDED source preserved in 20-MVP-PGCRYPTO-STOP.sql.
-- Standalone source candidate; do not execute without approved signer/role/backup/TLS admission.
-- HF13-V2-077 RETAINED MASTERS PG18.7: HMAC/PGCRYPTO ONLY, STOP-GUARDED
-- Not a stock installation, key enrollment, or production admission.
-- Exact endpoint must be externally authenticated by TLS hostname + CA.
BEGIN;
-- STOP guard omitted in this separate review derivative; all preflight checks preserved.
DO $HF13_MVP_CRYPTO_PREFLIGHT$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_engineering' OR current_user<>session_user
 OR pg_is_in_recovery()
 OR to_regnamespace('hft_crypto') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto')
 OR NOT pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
     AND ssl AND version IN ('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 THEN RAISE EXCEPTION 'HF13_MVP_CRYPTO_RESOURCE_OR_CREATOR_NOT_QUALIFIED'; END IF;
END $HF13_MVP_CRYPTO_PREFLIGHT$;
CREATE SCHEMA hft_crypto AUTHORIZATION hft_r1_posting_owner;
REVOKE ALL ON SCHEMA hft_crypto FROM PUBLIC,hft_r1_app_runtime,
 hft_r1_p3_master_runtime;
CREATE EXTENSION pgcrypto WITH SCHEMA hft_crypto;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft_crypto
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime;
GRANT USAGE ON SCHEMA hft_crypto TO hft_r1_p3_master_owner;
GRANT EXECUTE ON FUNCTION hft_crypto.digest(bytea,text),
 hft_crypto.hmac(bytea,bytea,text) TO hft_r1_p3_master_owner;
-- No HMAC keys, signer privilege or user session has been enrolled.
COMMIT;
