-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- Object ACL changes must be made by the actual migration/object owner.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $pre$
BEGIN
 IF current_database()<>'neondb'
 OR current_user<>'hft_staging_migration_owner' OR session_user<>current_user
 OR current_setting('server_version_num')::integer<>180006
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
   AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 THEN RAISE EXCEPTION 'HFT_BOOTSTRAP019_OWNER_CLOSE_PRECONDITION'; END IF;
END $pre$;
REVOKE ALL ON ALL TABLES IN SCHEMA hft
 FROM PUBLIC,hft_r1_app_runtime,hft_staging_app_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft
 FROM PUBLIC,hft_r1_app_runtime,hft_staging_app_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft
 FROM PUBLIC,hft_r1_app_runtime,hft_staging_app_runtime;
REVOKE CREATE ON SCHEMA hft
 FROM PUBLIC,hft_r1_app_runtime,hft_staging_app_runtime,
      hft_r1_audit_verify,hft_staging_audit_verify;
GRANT USAGE ON SCHEMA hft TO hft_r1_audit_verify;
GRANT SELECT ON hft.schema_revision TO hft_r1_audit_verify;
DO $v$
BEGIN
 IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='hft')
      <>'hft_staging_migration_owner'
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='hft' AND c.relkind IN ('r','p','v','m','S')
   AND pg_get_userbyid(c.relowner)<>'hft_staging_migration_owner')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hft'
   AND pg_get_userbyid(p.proowner)<>'hft_staging_migration_owner')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
   LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
   WHERE n.nspname='hft' AND a.grantee=0 AND a.privilege_type='EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='hft' AND c.relkind IN ('r','p','v','m','S')
   AND (CASE WHEN c.relkind='S' THEN
      has_sequence_privilege('hft_staging_app_runtime',c.oid,'USAGE,SELECT,UPDATE')
    ELSE has_table_privilege('hft_staging_app_runtime',c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
 THEN RAISE EXCEPTION 'HFT019_OWNER_ACL_VERIFICATION_FAILED'; END IF;
END $v$;
COMMIT;
SELECT 'HFT_OWNER_CLOSE_ACK';
