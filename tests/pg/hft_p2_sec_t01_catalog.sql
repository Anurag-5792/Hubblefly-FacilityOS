-- P2-SEC-T01: assertion-based privileges; NOT EXECUTED.
-- Run only on qualified disposable PostgreSQL 15+, after independently
-- reviewed P2 migration and real role/key/session provisioning. Read only.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_setting('server_version_num')::integer<150000
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=7)
 THEN RAISE EXCEPTION 'P2_T01_PREREQUISITES_NOT_MET'; END IF;
END $pre$;
DO $checks$
DECLARE bad integer;
BEGIN
 IF pg_catalog.has_schema_privilege('hft_r1_posting_owner','hft','CREATE')
 OR pg_catalog.has_schema_privilege('hft_r1_app_runtime','hft','CREATE')
 OR pg_catalog.has_schema_privilege('hft_r1_app_runtime','hft_secret','USAGE')
 THEN RAISE EXCEPTION 'P2_T01_SCHEMA_CREATE_OR_SECRET_LEAK'; END IF;
 SELECT pg_catalog.count(*) INTO bad
 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS ns
 ON p.pronamespace=ns.oid
 WHERE ns.nspname='hft' AND
 (pg_catalog.has_function_privilege('hft_r1_app_runtime',p.oid,'EXECUTE')
   AND p.proname NOT IN ('post_stock_command_protected_v1',
    'reconcile_protected_stock_command_v1')
  OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
   pg_catalog.coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) AS acl
   WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'));
 IF bad<>0 THEN RAISE EXCEPTION 'P2_T01_HELPER_OR_PUBLIC_EXECUTE_EXPOSED:%',bad; END IF;
 SELECT pg_catalog.count(*) INTO bad
 FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='hft' AND c.relkind IN ('r','p')
 AND (pg_catalog.has_table_privilege('hft_r1_app_runtime',c.oid,'INSERT')
  OR pg_catalog.has_table_privilege('hft_r1_app_runtime',c.oid,'UPDATE')
  OR pg_catalog.has_table_privilege('hft_r1_app_runtime',c.oid,'DELETE')
  OR pg_catalog.has_table_privilege('hft_r1_app_runtime',c.oid,'TRUNCATE'));
 IF bad<>0 THEN RAISE EXCEPTION 'P2_T01_RUNTIME_TABLE_WRITE:%',bad; END IF;
 PERFORM 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS ns
 ON p.pronamespace=ns.oid JOIN pg_catalog.pg_roles AS owner ON owner.oid=p.proowner
 WHERE ns.nspname='hft' AND p.proname IN
 ('post_stock_command_protected_v1','reconcile_protected_stock_command_v1')
 AND p.prosecdef=true AND owner.rolname='hft_r1_posting_owner'
 AND NOT owner.rolcanlogin AND NOT owner.rolsuper
 AND EXISTS (SELECT 1 FROM pg_catalog.unnest(p.proconfig) AS cfg
    WHERE cfg LIKE 'search_path=pg_catalog%');
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_T01_PROTECTED_FUNCTION_OWNER_INVALID'; END IF;
 SELECT pg_catalog.count(*) INTO bad FROM pg_catalog.pg_roles AS login
 WHERE login.rolcanlogin AND
  pg_catalog.pg_has_role(login.oid,'hft_r1_app_runtime'::pg_catalog.regrole,'MEMBER')
  AND (login.rolsuper OR login.rolcreaterole OR
   pg_catalog.pg_has_role(login.oid,'hft_engineering'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.pg_has_role(login.oid,'hft_r1_posting_owner'::pg_catalog.regrole,'MEMBER'));
 IF bad<>0 THEN RAISE EXCEPTION 'P2_T01_RUNTIME_CAN_ASSUME_OWNER_ROLE'; END IF;
END $checks$;
SELECT 'P2_SEC_T01_ASSERTIONS_PASS' AS verified_role_catalog;
COMMIT;
