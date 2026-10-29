-- SOURCE-ONLY P3 catalog test; NOT RUN. Qualified disposable PG15+ only.
-- Must be run with actual independent runtime and auditor logins after
-- separate P3 executable migration authorization and qualified key/session.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $p3catalog$
DECLARE r record; bad integer;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version>=7)
 THEN RAISE EXCEPTION 'P3_SOURCE_NOT_MIGRATED_OR_ISOLATED'; END IF;
 PERFORM 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner
 ON owner.oid=p.proowner WHERE p.oid='hft.p3_submit_master_change_v1(jsonb,jsonb)'::regprocedure
 AND owner.rolname='hft_r1_p3_master_owner' AND p.prosecdef
 AND EXISTS(SELECT 1 FROM pg_catalog.unnest(p.proconfig) cfg
  WHERE pg_catalog.replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_PROTECTED_MASTER_SUBMIT_FUNCTION_INVALID'; END IF;
 IF pg_catalog.has_schema_privilege('hft_r1_p3_master_runtime','hft','CREATE')
 OR pg_catalog.has_schema_privilege('hft_r1_p3_master_runtime','hft_secret','USAGE')
 OR pg_catalog.has_schema_privilege('hft_r1_p3_master_owner','hft','CREATE')
 THEN RAISE EXCEPTION 'P3_SCHEMA_OR_SECRET_PRIVILEGES_INVALID'; END IF;
 SELECT count(*) INTO bad FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n
 ON n.oid=c.relnamespace WHERE n.nspname IN ('hft','hft_secret')
 AND c.relkind IN ('r','p') AND c.relname IN
 ('employee','item','supplier','warehouse','location','p3_master_change_request',
  'p3_master_decision','p3_master_revision','p3_master_audit','p3_master_invocation_nonce')
 AND (pg_catalog.has_table_privilege('hft_r1_p3_master_runtime',c.oid,'INSERT')
 OR pg_catalog.has_table_privilege('hft_r1_p3_master_runtime',c.oid,'UPDATE')
 OR pg_catalog.has_table_privilege('hft_r1_p3_master_runtime',c.oid,'DELETE')
 OR pg_catalog.has_table_privilege('hft_r1_p3_master_runtime',c.oid,'TRUNCATE'));
 IF bad<>0 THEN RAISE EXCEPTION 'P3_DIRECT_MASTER_WRITE_ROLE_LEAK:%',bad; END IF;
END $p3catalog$;
SELECT 'P3_MASTER_ACL_CATALOG_SOURCE_PASS' AS result;
COMMIT;
