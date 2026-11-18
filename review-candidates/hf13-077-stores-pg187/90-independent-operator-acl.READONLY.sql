-- HF13-077 POST-INSTALL INDEPENDENT EFFECTIVE ACL READBACK.
-- READ-ONLY catalog check. NO GRANTS, NO LOGIN ENROLLMENT, NO DATA POSTING.
-- Requires independently accepted verifier and external authenticated TLS,
-- not provider internal loopback SQL inspection with ssl=false.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $hf13_operator_independent_acl$
DECLARE f text; r record; n integer;
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl
   WHERE pid=pg_backend_pid() AND ssl
   AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR to_regnamespace('hft_qa077') IS NOT NULL
 OR to_regclass('hft.stock_entry') IS NULL
 OR to_regclass('hft.stock_account') IS NULL
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision
   WHERE version=6 AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 THEN RAISE EXCEPTION 'HF13_POSTFLIGHT_DATABASE_MIGRATION_TLS_OR_LEDGER_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles
     WHERE rolname='hft_r1_stores_gateway_owner'
     AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
     AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls)
 OR EXISTS(SELECT 1 FROM pg_roles
     WHERE rolname='hft_engineering' AND rolcanlogin)
 OR pg_has_role('hft_engineering','hft_r1_stores_gateway_owner','MEMBER')
 OR pg_has_role('hft_engineering','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_governance_issuer','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_stores_gateway_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_governance_issuer','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_stores_gateway_owner','SET')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_posting_owner','SET')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_governance_issuer','SET')
 OR pg_has_role('hft_r1_stores_np_login','hft_engineering','SET')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_posting_owner','SET')
 OR NOT EXISTS(SELECT 1 FROM pg_auth_members m
     JOIN pg_roles member ON member.oid=m.member
     JOIN pg_roles inherited ON inherited.oid=m.roleid
     WHERE member.rolname='hft_r1_stores_np_login'
       AND inherited.rolname='hft_r1_app_runtime'
       AND m.inherit_option AND NOT m.set_option AND NOT m.admin_option)
 THEN RAISE EXCEPTION 'HF13_POSTFLIGHT_ROLE_OR_INHERITED_SET_ROLE_FAILURE'; END IF;
 SELECT count(*) INTO n FROM pg_proc p
 JOIN pg_namespace ns ON ns.oid=p.pronamespace
 JOIN pg_roles owner ON owner.oid=p.proowner
 WHERE ns.nspname='hft'
 AND p.proname IN(
  'ops_a2_operator_resolve_receive_v1','ops_a2_operator_post_receive_v1',
  'ops_a2_operator_reconcile_receive_v1','ops_a2_operator_read_receive_v1')
 AND owner.rolname='hft_r1_stores_gateway_owner' AND p.prosecdef
 AND EXISTS(SELECT 1 FROM unnest(p.proconfig) cfg
     WHERE replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF n<>4 THEN RAISE EXCEPTION 'HF13_POSTFLIGHT_FOUR_GATEWAY_SECDEF_MISSING'; END IF;
 FOREACH f IN ARRAY ARRAY[
   'hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)',
   'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)',
   'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)',
   'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)'] LOOP
  IF NOT has_function_privilege('hft_r1_stores_gateway_owner',f,'EXECUTE')
   OR has_function_privilege('hft_r1_app_runtime',f,'EXECUTE')
   OR has_function_privilege('hft_r1_stores_np_login',f,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p
     JOIN pg_roles owner ON owner.oid=p.proowner
     WHERE p.oid=to_regprocedure(f) AND
      (owner.rolname<>'hft_r1_posting_owner' OR NOT p.prosecdef
       OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,
          acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE')))
  THEN RAISE EXCEPTION 'HF13_POSTFLIGHT_PRIVATE_FUNCTION_RIGHTS_INVALID:%',f; END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY[
   'hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb)',
   'hft.ops_a2_operator_post_receive_v1(jsonb,jsonb)',
   'hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)',
   'hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)'] LOOP
  IF NOT has_function_privilege('hft_r1_stores_np_login',f,'EXECUTE')
   OR has_function_privilege('hft_r1_app_runtime',f,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f)
     AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,
       acldefault('f',p.proowner))) a
       WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  THEN RAISE EXCEPTION 'HF13_POSTFLIGHT_OPERATOR_EXECUTE_INVALID:%',f; END IF;
 END LOOP;
 FOR r IN SELECT c.oid,c.relkind,n.nspname,c.relname
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN('hft','hft_secret','hft_crypto')
    AND c.relkind IN('r','p','v','m','S')
 LOOP
  IF (r.relkind='S' AND (
       has_sequence_privilege('hft_r1_stores_np_login',r.oid,'SELECT,UPDATE,USAGE')
       OR has_sequence_privilege('hft_r1_stores_gateway_owner',r.oid,'SELECT,UPDATE,USAGE')))
   OR (r.relkind<>'S' AND (
       has_table_privilege('hft_r1_stores_np_login',r.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('hft_r1_stores_gateway_owner',r.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
  THEN RAISE EXCEPTION 'HF13_POSTFLIGHT_DIRECT_RELATION_PRIVILEGE:%:%',
   r.nspname,r.relname; END IF;
 END LOOP;
END $hf13_operator_independent_acl$;
SELECT current_database() AS database_name,session_user AS verifier_login,
 current_setting('server_version_num')::integer AS pg_version,
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
 (SELECT count(*)::integer FROM hft.schema_revision) AS canonical_migrations,
 (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace ns
   ON ns.oid=p.pronamespace WHERE ns.nspname='hft'
   AND p.proname LIKE 'ops_a2_operator_%_v1') AS operator_functions;
COMMIT;
