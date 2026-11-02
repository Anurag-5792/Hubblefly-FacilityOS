-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- Execute only as the actual canonical object creator after attended credentials are set.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $g$
BEGIN
 IF current_database()<>'neondb'
 OR current_user<>'hft_staging_migration_owner' OR session_user<>current_user
 OR current_setting('server_version_num')::int<>180006
 OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
     FROM pg_roles WHERE rolname=current_user)
 OR pg_has_role(current_user,'neon_superuser','MEMBER')
 OR NOT has_database_privilege(current_user,current_database(),'CREATE')
 OR has_database_privilege(current_user,current_database(),'TEMP')
 OR to_regnamespace('hft') IS NOT NULL
 THEN RAISE EXCEPTION 'HFT_MIGRATION_ROLE_PREFLIGHT'; END IF;
END $g$;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_staging_migration_owner
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $v$
DECLARE role_oid oid;
BEGIN
 SELECT oid INTO role_oid FROM pg_roles WHERE rolname='hft_staging_migration_owner';
 IF role_oid IS NULL OR NOT EXISTS(
  SELECT 1 FROM pg_default_acl d
  WHERE d.defaclrole=role_oid AND d.defaclnamespace=0 AND d.defaclobjtype='f'
  AND NOT EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) x
    WHERE x.grantee=0 AND x.privilege_type='EXECUTE'))
 THEN RAISE EXCEPTION 'PUBLIC_FUNCTION_EXECUTE_DEFAULT_NOT_REVOKED'; END IF;
END $v$;
COMMIT;
SELECT 'HFT_MIGRATION_OWNER_PREPARED_ACK';
