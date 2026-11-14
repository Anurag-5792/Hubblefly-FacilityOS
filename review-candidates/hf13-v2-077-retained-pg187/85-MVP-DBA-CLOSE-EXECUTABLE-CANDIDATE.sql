-- EXACT-DERIVED EXECUTABLE SQL REVIEW CANDIDATE, NOT ADMITTED OR EXECUTED.
-- Original STOP-GUARDED DBA close source remains unchanged. Verify hash before admission.
-- HF13-V2 R77 retained Masters: DBA PRIVILEGE CLOSE, STOP-GUARDED.
-- Source only: executed by privileged Neon DBA after installer + one-time
-- corporate bootstrap with signed original and qualified runtime role.
BEGIN;
-- STOP guard omitted only in this separately reviewable derivative.
DO $HF13_MVP_CLOSE_PREFLIGHT$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_r1_retained_masters_np077_owner'
 OR current_user<>session_user
 OR to_regprocedure('hft.p3_submit_master_change_v1(jsonb,jsonb)') IS NULL
 OR to_regprocedure('hft.p3_read_masters_v1(jsonb,jsonb)') IS NULL
 OR to_regprocedure('hft.p3_decide_apply_employee_v1(jsonb,jsonb)') IS NULL
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_engineering','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_p3_master_owner','MEMBER')
 OR has_table_privilege('hft_r1_retained_p3_login','hft.stock_entry','INSERT,UPDATE,DELETE')
 OR has_table_privilege('hft_r1_retained_p3_login','hft.stock_account','INSERT,UPDATE,DELETE')
 OR has_function_privilege('hft_r1_retained_p3_login',
     'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'HF13_MVP_PRIVILEGED_ROLE_OR_RUNTIME_LEAK'; END IF;
END $HF13_MVP_CLOSE_PREFLIGHT$;
REVOKE CREATE ON DATABASE hft_r1_retained_masters_np077 FROM hft_engineering;
REVOKE hft_r1_posting_owner FROM hft_engineering;
REVOKE hft_r1_p3_master_owner FROM hft_engineering;
REVOKE hft_r1_p3_corporate_bootstrap_owner FROM hft_engineering;
ALTER ROLE hft_engineering NOLOGIN;
-- The one-time corporate bootstrap login is disabled only once the original
-- signed source was independently enrolled, committed and freshly read back.
ALTER ROLE hft_r1_corporate077_login NOLOGIN;
DO $HF13_MVP_CLOSE_POSTFLIGHT$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('hft_engineering','hft_r1_corporate077_login') AND rolcanlogin)
 OR pg_has_role('hft_engineering','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_engineering','hft_r1_p3_master_owner','MEMBER')
 OR pg_has_role('hft_engineering','hft_r1_p3_corporate_bootstrap_owner','MEMBER')
 OR has_database_privilege('hft_engineering','hft_r1_retained_masters_np077','CREATE')
 THEN RAISE EXCEPTION 'HF13_MVP_TEMPORARY_INSTALLER_PRIVILEGES_REMAIN'; END IF;
END $HF13_MVP_CLOSE_POSTFLIGHT$;
COMMIT;
