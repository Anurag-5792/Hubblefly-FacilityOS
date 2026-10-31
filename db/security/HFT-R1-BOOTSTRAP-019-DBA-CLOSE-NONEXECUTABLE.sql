-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- NEVER execute or automatically discover via db/migrations. Chat 13 owner + Chat 10/11 approval required.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $pre$ BEGIN IF current_database()<>'neondb' OR current_user<>'neondb_owner'
 OR current_user<>session_user OR current_setting('server_version_num')::integer<>180006
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
 AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 THEN RAISE EXCEPTION 'HFT_BOOTSTRAP019_FINALIZE_PRECONDITION'; END IF;
END $pre$;
REVOKE CREATE ON DATABASE neondb FROM hft_staging_migration_owner;
REVOKE CREATE ON DATABASE neondb FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime,hft_staging_app_runtime,hft_staging_masters_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime,hft_staging_app_runtime,hft_staging_masters_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime,hft_staging_app_runtime,hft_staging_masters_runtime;
REVOKE CREATE ON SCHEMA hft FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime,hft_staging_app_runtime,hft_staging_masters_runtime;
GRANT USAGE ON SCHEMA hft TO hft_r1_audit_verify;
GRANT SELECT ON hft.schema_revision TO hft_r1_audit_verify;
DO $v$ DECLARE owner_name text;who text;role_oid oid; BEGIN
 SELECT pg_get_userbyid(nspowner) INTO owner_name FROM pg_namespace WHERE nspname='hft';
 IF owner_name<>'hft_staging_migration_owner' OR has_database_privilege('hft_staging_migration_owner','neondb','CREATE')
 THEN RAISE EXCEPTION 'HFT019_OWNER_OR_DB_CREATE_NOT_REVOKED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='hft' AND c.relkind IN ('r','p','v','m','f','S') AND
  (CASE WHEN c.relkind='S' THEN
   has_sequence_privilege('hft_staging_app_runtime',c.oid,'USAGE,SELECT,UPDATE') OR
   has_sequence_privilege('hft_staging_masters_runtime',c.oid,'USAGE,SELECT,UPDATE')
   ELSE has_table_privilege('hft_staging_app_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
   has_table_privilege('hft_staging_masters_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
 THEN RAISE EXCEPTION 'HFT019_RUNTIME_DIRECT_TABLE_PRIVILEGE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='hft' AND EXISTS(SELECT 1 FROM
   aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
 THEN RAISE EXCEPTION 'HFT019_PUBLIC_FUNCTION_EXECUTE_NOT_REVOKED'; END IF;
 FOREACH who IN ARRAY ARRAY['hft_staging_migration_owner','hft_r1_posting_owner','hft_r1_p3_master_owner'] LOOP
  SELECT oid INTO role_oid FROM pg_roles WHERE rolname=who;
  IF role_oid IS NULL OR NOT EXISTS(
   SELECT 1 FROM pg_default_acl d WHERE d.defaclrole=role_oid
   AND d.defaclobjtype='f' AND d.defaclnamespace=0 AND NOT EXISTS(
    SELECT 1 FROM aclexplode(d.defaclacl) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  THEN RAISE EXCEPTION 'HFT019_PUBLIC_EXECUTE_DEFAULT_NOT_REVOKED'; END IF;
 END LOOP;
END $v$;
COMMIT; SELECT 'HFT_FINALIZE_ACK';
