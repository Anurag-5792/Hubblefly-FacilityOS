-- HF13 077 STORES PG18.7 TEMPORARY INSTALLER CLOSE -- DBA review only.
-- This stage is not an operational posting admission, does not enroll a signer.
BEGIN;
DO $hf13_dba_close_preflight$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_r1_retained_masters_np077_owner'
 OR current_user<>session_user
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6)
 OR to_regprocedure('hft.ops_a2_post_stock_command_v2(jsonb,jsonb)') IS NULL
 OR to_regprocedure('hft.ops_a2_read_authoritative_v2(jsonb,jsonb)') IS NULL
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_governance_issuer','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_engineering','MEMBER')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_r1_stores_np_login' AND rolcanlogin)
 THEN RAISE EXCEPTION 'HF13_STORES_OWNER_OR_TEMPORARY_LOGIN_NOT_QUALIFIED'; END IF;
END $hf13_dba_close_preflight$;
REVOKE CREATE ON DATABASE hft_r1_retained_masters_np077 FROM hft_engineering;
REVOKE hft_r1_posting_owner FROM hft_engineering;
REVOKE hft_r1_p3_master_owner FROM hft_engineering;
ALTER ROLE hft_engineering NOLOGIN;
DO $hf13_dba_close_postflight$ BEGIN
 IF pg_has_role('hft_engineering','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_engineering','hft_r1_p3_master_owner','MEMBER')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_engineering' AND rolcanlogin)
 OR has_database_privilege('hft_engineering','hft_r1_retained_masters_np077','CREATE')
 THEN RAISE EXCEPTION 'HF13_STORES_TEMPORARY_INSTALLER_ACCESS_REMAINED'; END IF;
END $hf13_dba_close_postflight$;
COMMIT;
