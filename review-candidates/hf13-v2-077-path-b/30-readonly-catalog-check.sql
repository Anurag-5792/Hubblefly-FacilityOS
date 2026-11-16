-- HF13 Path B: independent READ-ONLY postflight, not a DDL installer.
-- Execute after admitted draft install and restricted login enrollment.
-- Runtime TLS and source identity must be independently verified on the actual
-- external app SQL session; provider internal inspection is not sufficient.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database() AS db, session_user AS session_login,
 current_user AS active_role,
 current_setting('server_version_num')::integer AS pg_version_num,
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS sql_ssl,
 to_regnamespace('hft_draft077') IS NOT NULL AS draft_schema_present,
 to_regnamespace('hft') IS NOT NULL AS operational_hft_present;
SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
 FROM pg_roles WHERE rolname IN (
 'hft_draft077_owner','hft_draft077_api_login','hft_draft077_enroller_login')
 ORDER BY rolname;
SELECT p.oid::regprocedure::text AS signature,
 r.rolname AS function_owner,p.prosecdef AS security_definer,
 pg_get_functiondef(p.oid) LIKE '%search_path=pg_catalog,pg_temp%' AS pinned_path,
 has_function_privilege('hft_draft077_api_login',p.oid,'EXECUTE') AS api_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='hft_draft077'
 ORDER BY signature;
SELECT c.relname,
 has_table_privilege('hft_draft077_api_login',c.oid,
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS api_direct_privilege
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='hft_draft077' AND c.relkind IN('r','p','v','m')
 ORDER BY c.relname;
SELECT scope_state,count(*) AS scopes FROM hft_draft077.provisional_scope
 GROUP BY scope_state ORDER BY scope_state;
SELECT kind,record_state,count(*) AS retained_drafts FROM hft_draft077.draft_record
 GROUP BY kind,record_state ORDER BY kind,record_state;
COMMIT;
