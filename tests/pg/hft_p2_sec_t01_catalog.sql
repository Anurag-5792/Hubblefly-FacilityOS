-- P2 SEC-T01 — full function and inherited ACL assertions, NOT RUN.
-- Requires separately authorized disposable P2 migration and real roles.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $t01$
DECLARE v_count integer; v_bad integer; who record; obj record; fn record;
BEGIN
 IF pg_catalog.current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
  OR pg_catalog.current_setting('server_version_num')::integer<150000
  OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=7)
 THEN RAISE EXCEPTION 'P2_T01_PREREQUISITES_MISSING'; END IF;
 SELECT pg_catalog.count(*) INTO v_count FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
 WHERE p.oid IN (
  'hft.post_stock_command_protected_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
  'hft.reconcile_protected_stock_command_v1(jsonb,jsonb)'::pg_catalog.regprocedure)
 AND n.nspname='hft' AND owner.rolname='hft_r1_posting_owner'
 AND NOT owner.rolcanlogin AND NOT owner.rolsuper AND p.prosecdef
 AND EXISTS(SELECT 1 FROM pg_catalog.unnest(p.proconfig) cfg
     WHERE pg_catalog.replace(cfg,' ','')='search_path=pg_catalog,pg_temp')
 AND (CASE WHEN p.proname='post_stock_command_protected_v1'
   THEN p.provolatile='v' ELSE p.provolatile='s' END);
 IF v_count<>2 THEN RAISE EXCEPTION 'P2_T01_BOTH_PROTECTED_FUNCTIONS_INVALID:%',v_count; END IF;
 -- Direct PUBLIC helper grants and creator defaults must both be denied.
 SELECT pg_catalog.count(*) INTO v_bad FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('hft','hft_secret') AND EXISTS(
 SELECT 1 FROM pg_catalog.aclexplode(
   pg_catalog.coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
 WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE');
 IF v_bad<>0 THEN RAISE EXCEPTION 'P2_T01_PUBLIC_EXECUTE:%',v_bad; END IF;
 SELECT pg_catalog.count(*) INTO v_bad FROM pg_catalog.pg_default_acl a
 JOIN pg_catalog.pg_roles creator ON creator.oid=a.defaclrole
 WHERE creator.rolname IN ('hft_engineering','hft_r1_posting_owner')
 AND a.defaclobjtype='f' AND EXISTS(
 SELECT 1 FROM pg_catalog.aclexplode(a.defaclacl) acl
 WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE');
 IF v_bad<>0 THEN RAISE EXCEPTION 'P2_T01_CREATOR_DEFAULT_EXECUTE:%',v_bad; END IF;
 FOR who IN SELECT oid,rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_catalog.pg_roles
 WHERE rolname='hft_r1_app_runtime' OR (rolcanlogin AND
  pg_catalog.pg_has_role(oid,'hft_r1_app_runtime'::pg_catalog.regrole,'MEMBER'))
 LOOP
  IF who.rolsuper OR who.rolcreatedb OR who.rolcreaterole
   OR pg_catalog.pg_has_role(who.oid,'hft_engineering'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.pg_has_role(who.oid,'hft_r1_posting_owner'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.has_schema_privilege(who.rolname,'hft','CREATE')
   OR pg_catalog.has_schema_privilege(who.rolname,'hft_secret','USAGE')
   OR pg_catalog.has_schema_privilege(who.rolname,'hft_secret','CREATE')
   OR pg_catalog.has_schema_privilege(who.rolname,'public','CREATE')
  THEN RAISE EXCEPTION 'P2_T01_RUNTIME_ESCALATION:%',who.rolname; END IF;
  FOR obj IN SELECT c.oid,c.relkind,n.nspname,c.relname FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('hft','hft_secret') AND c.relkind IN ('r','p','v','m','f','S')
  LOOP
   IF obj.relkind='S' THEN
    IF pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'USAGE')
     OR pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'SELECT')
     OR pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'UPDATE')
    THEN RAISE EXCEPTION 'P2_T01_SEQUENCE_LEAK:%:%.%',
       who.rolname,obj.nspname,obj.relname; END IF;
   ELSE
    IF pg_catalog.has_table_privilege(who.rolname,obj.oid,'SELECT')
     OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'INSERT')
     OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'UPDATE')
     OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'DELETE')
     OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'TRUNCATE')
     OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'REFERENCES')
     OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'TRIGGER')
    THEN RAISE EXCEPTION 'P2_T01_RELATION_LEAK:%:%.%',
       who.rolname,obj.nspname,obj.relname; END IF;
   END IF;
  END LOOP;
  FOR fn IN SELECT p.oid,n.nspname,p.proname FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('hft','hft_secret')
  LOOP
   IF pg_catalog.has_function_privilege(who.rolname,fn.oid,'EXECUTE')
    AND fn.oid NOT IN (
     'hft.post_stock_command_protected_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
     'hft.reconcile_protected_stock_command_v1(jsonb,jsonb)'::pg_catalog.regprocedure)
   THEN RAISE EXCEPTION 'P2_T01_HELPER_LEAK:%:%.%',
      who.rolname,fn.nspname,fn.proname; END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege(who.rolname,
   'hft.post_stock_command_protected_v1(jsonb,jsonb)'::pg_catalog.regprocedure,'EXECUTE')
   OR NOT pg_catalog.has_function_privilege(who.rolname,
   'hft.reconcile_protected_stock_command_v1(jsonb,jsonb)'::pg_catalog.regprocedure,'EXECUTE')
  THEN RAISE EXCEPTION 'P2_T01_EXACT_ALLOWLIST_MISSING:%',who.rolname; END IF;
 END LOOP;
 IF pg_catalog.has_schema_privilege('hft_r1_posting_owner','hft','CREATE')
 THEN RAISE EXCEPTION 'P2_T01_POSTING_OWNER_CREATE_LEAK'; END IF;
END $t01$;
SELECT 'P2_T01_FULL_CATALOG_ASSERTIONS_PASS' AS result;
COMMIT;
