-- HF13-V2-077: review-only independent retained Masters catalog/ACL postflight.
-- READ ONLY; run after independently admitted P3 installation and credential enrollment.
-- NO RESULT claimed by merely publishing this file.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $HF13_MASTERS_POSTFLIGHT$
DECLARE f text; r record; n integer;
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180006
 OR pg_is_in_recovery()
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl
    WHERE pid=pg_backend_pid() AND ssl
      AND version IN ('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
    AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 THEN RAISE EXCEPTION 'HF13_MASTERS_RESOURCE_TLS_OR_MIGRATIONS_UNQUALIFIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='hft_r1_p3_master_owner'
    AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='hft_r1_p3_master_runtime'
    AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='hft_r1_retained_p3_login'
    AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolbypassrls)
 OR NOT pg_has_role('hft_r1_retained_p3_login','hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'HF13_P3_ACTUAL_OWNER_RUNTIME_LOGIN_NOT_QUALIFIED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles u ON u.oid=m.member
   WHERE u.rolname='hft_r1_retained_p3_login'
   AND (m.set_option OR m.admin_option OR
     m.roleid<>(SELECT oid FROM pg_roles WHERE rolname='hft_r1_p3_master_runtime')))
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_governance_issuer','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_p3_master_owner','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_engineering','MEMBER')
 OR has_schema_privilege('hft_r1_retained_p3_login','hft','CREATE')
 OR has_schema_privilege('hft_r1_retained_p3_login','hft_secret','USAGE')
 OR has_schema_privilege('hft_r1_retained_p3_login','hft_crypto','USAGE')
 THEN RAISE EXCEPTION 'HF13_P3_RUNTIME_INHERITED_PRIVILEGE_OR_SCHEMA_LEAK'; END IF;
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.oid IN (
    'hft.p3_submit_master_change_v1(jsonb,jsonb)'::regprocedure,
    'hft.p3_read_masters_v1(jsonb,jsonb)'::regprocedure,
    'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'::regprocedure)
  AND p.prosecdef AND r.rolname='hft_r1_p3_master_owner'
  AND EXISTS(SELECT 1 FROM unnest(p.proconfig) x
      WHERE replace(x,' ','')='search_path=pg_catalog,pg_temp');
 IF n<>3 THEN RAISE EXCEPTION 'HF13_P3_SECDEF_OWNER_OR_PATH_INVALID'; END IF;
 FOREACH f IN ARRAY ARRAY[
  'hft.p3_submit_master_change_v1(jsonb,jsonb)',
  'hft.p3_read_masters_v1(jsonb,jsonb)',
  'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'] LOOP
   IF NOT has_function_privilege('hft_r1_retained_p3_login',f,'EXECUTE')
   THEN RAISE EXCEPTION 'HF13_P3_REQUIRED_EXECUTE_MISSING:%',f; END IF;
 END LOOP;
 FOR r IN SELECT p.oid,n.nspname,p.proname FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('hft','hft_secret','hft_crypto')
 LOOP
  IF has_function_privilege('hft_r1_retained_p3_login',r.oid,'EXECUTE')
  AND r.oid NOT IN (
    'hft.p3_submit_master_change_v1(jsonb,jsonb)'::regprocedure,
    'hft.p3_read_masters_v1(jsonb,jsonb)'::regprocedure,
    'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'::regprocedure)
  THEN RAISE EXCEPTION 'HF13_P3_EXTRA_FUNCTION_EXECUTE:%:%',r.nspname,r.proname; END IF;
 END LOOP;
 FOR r IN SELECT c.oid,c.relkind,n.nspname,c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('hft','hft_secret') AND c.relkind IN ('r','p','v','m','f','S')
 LOOP
  IF (r.relkind='S' AND has_sequence_privilege('hft_r1_retained_p3_login',r.oid,
      'USAGE,SELECT,UPDATE'))
  OR (r.relkind<>'S' AND has_table_privilege('hft_r1_retained_p3_login',r.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  THEN RAISE EXCEPTION 'HF13_P3_DIRECT_TABLE_OR_SEQUENCE_ACCESS:%:%',
    r.nspname,r.relname; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM hft.legal_entity l JOIN hft.site s
  ON s.legal_entity_id=l.id AND s.active
  JOIN hft.warehouse w ON w.legal_entity_id=s.legal_entity_id
   AND w.site_id=s.id AND w.active
  WHERE l.active)
 THEN RAISE EXCEPTION 'HF13_P3_FIRST_ACTIVE_LEGAL_SITE_WAREHOUSE_NOT_ESTABLISHED'; END IF;
END $HF13_MASTERS_POSTFLIGHT$;
SELECT current_database() AS db,session_user AS sql_session_user,
 current_setting('server_version_num')::integer AS pg_version,
 current_timestamp AS evidence_at;
COMMIT;
