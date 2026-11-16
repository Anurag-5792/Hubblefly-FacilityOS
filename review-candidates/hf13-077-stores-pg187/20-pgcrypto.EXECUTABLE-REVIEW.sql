-- HF13 077 STORES PG18.7 ONLY -- TRUSTED pgcrypto DEPENDENCY CANDIDATE.
-- Unreviewed source. Requires a separately approved external TLS session.
BEGIN;
DO $hf13_crypto_preflight$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::int<>180007
 OR current_user<>'hft_engineering' OR session_user<>current_user
 OR pg_is_in_recovery()
 OR to_regnamespace('hft') IS NULL
 OR to_regnamespace('hft_crypto') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto')
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
  AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl
  WHERE pid=pg_backend_pid() AND ssl
  AND version IN ('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR NOT pg_has_role('hft_engineering','hft_r1_posting_owner','MEMBER')
 THEN RAISE EXCEPTION 'HF13_STORES_PGCRYPTO_TRUST_OR_REVISION_NOT_ADMITTED'; END IF;
END $hf13_crypto_preflight$;
CREATE SCHEMA hft_crypto AUTHORIZATION hft_r1_posting_owner;
GRANT CREATE,USAGE ON SCHEMA hft_crypto TO hft_engineering;
CREATE EXTENSION pgcrypto WITH SCHEMA hft_crypto;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft_crypto
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime;
REVOKE CREATE ON SCHEMA hft_crypto FROM hft_engineering;
GRANT USAGE ON SCHEMA hft_crypto TO hft_r1_posting_owner;
GRANT EXECUTE ON FUNCTION hft_crypto.digest(bytea,text),
 hft_crypto.hmac(bytea,bytea,text) TO hft_r1_posting_owner;
COMMIT;
