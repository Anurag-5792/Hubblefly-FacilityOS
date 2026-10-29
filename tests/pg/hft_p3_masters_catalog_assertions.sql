-- HFT P3 EMPLOYEE ACL — SQL ACCEPTANCE SOURCE, NOT RUN.
-- Independently qualified disposable PG15+ after authorized P3 migration.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $p3catalog$
DECLARE who record;obj record;fn record;owners bigint;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version>=7)
 THEN RAISE EXCEPTION 'P3_MIGRATION_OR_DB_NOT_QUALIFIED'; END IF;
 SELECT pg_catalog.count(*) INTO owners FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_roles o ON o.oid=p.proowner
 WHERE p.oid IN (
  'hft.p3_submit_master_change_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
  'hft.p3_read_masters_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
  'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'::pg_catalog.regprocedure)
 AND o.rolname='hft_r1_p3_master_owner' AND NOT o.rolcanlogin AND NOT o.rolsuper
 AND p.prosecdef AND EXISTS(
 SELECT 1 FROM pg_catalog.unnest(p.proconfig) cfg
 WHERE pg_catalog.replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF owners<>3 THEN RAISE EXCEPTION 'P3_PROTECTED_OWNERS_INVALID:%',owners; END IF;
 IF NOT pg_catalog.has_schema_privilege('hft_r1_p3_master_owner','hft_crypto','USAGE')
  OR NOT pg_catalog.has_function_privilege('hft_r1_p3_master_owner',
   'hft_crypto.digest(bytea,text)','EXECUTE')
  OR NOT pg_catalog.has_function_privilege('hft_r1_p3_master_owner',
   'hft_crypto.hmac(bytea,bytea,text)','EXECUTE')
 THEN RAISE EXCEPTION 'P3_SIGNED_ENTRYPOINT_OWNER_CRYPTO_GRANTS_MISSING'; END IF;
 IF pg_catalog.has_schema_privilege('hft_r1_p3_master_owner','hft','CREATE')
 OR pg_catalog.has_schema_privilege('hft_r1_p3_master_runtime','hft','CREATE')
 OR pg_catalog.has_schema_privilege('hft_r1_p3_master_runtime','hft_secret','USAGE')
 THEN RAISE EXCEPTION 'P3_UNAUTHORIZED_SCHEMA_PRIVILEGE'; END IF;
 FOR who IN SELECT oid,rolname FROM pg_catalog.pg_roles
 WHERE rolname='hft_r1_p3_master_runtime' OR (rolcanlogin AND
 pg_catalog.pg_has_role(oid,'hft_r1_p3_master_runtime'::pg_catalog.regrole,'MEMBER'))
 LOOP
  IF pg_catalog.pg_has_role(who.oid,'hft_engineering'::pg_catalog.regrole,'MEMBER')
  OR pg_catalog.pg_has_role(who.oid,'hft_r1_p3_master_owner'::pg_catalog.regrole,'MEMBER')
  OR pg_catalog.pg_has_role(who.oid,'hft_r1_governance_issuer'::pg_catalog.regrole,'MEMBER')
  OR pg_catalog.pg_has_role(who.oid,'hft_r1_posting_owner'::pg_catalog.regrole,'MEMBER')
  THEN RAISE EXCEPTION 'P3_UNAUTHORIZED_RUNTIME_ROLE_MEMBERSHIP:%',who.rolname; END IF;
  FOR obj IN SELECT c.oid,c.relkind,c.relname,n.nspname FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('hft','hft_secret') AND c.relkind IN ('r','p','v','m','f','S')
  LOOP
   IF obj.relkind='S' THEN
    IF pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'SELECT')
    OR pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'UPDATE')
    OR pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'USAGE')
    THEN RAISE EXCEPTION 'P3_RUNTIME_SEQUENCE_PRIVILEGE:%:%.%',
      who.rolname,obj.nspname,obj.relname; END IF;
   ELSIF pg_catalog.has_table_privilege(who.rolname,obj.oid,'SELECT')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'INSERT')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'UPDATE')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'DELETE')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'TRUNCATE')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'REFERENCES')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'TRIGGER')
    THEN RAISE EXCEPTION 'P3_RUNTIME_RELATION_PRIVILEGE:%:%.%',
      who.rolname,obj.nspname,obj.relname; END IF;
  END LOOP;
  FOR fn IN SELECT p.oid,p.proname FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('hft','hft_secret')
  LOOP
   IF pg_catalog.has_function_privilege(who.rolname,fn.oid,'EXECUTE')
   AND fn.oid NOT IN (
    'hft.p3_submit_master_change_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
    'hft.p3_read_masters_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
    'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'::pg_catalog.regprocedure)
   THEN RAISE EXCEPTION 'P3_RUNTIME_HELPER_PRIVILEGE:%:%',who.rolname,fn.proname;
   END IF;
  END LOOP;
 END LOOP;
END $p3catalog$;
SELECT 'P3_FULL_EFFECTIVE_ACL_SOURCE_PASS' AS result;
COMMIT;
