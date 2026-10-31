-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- NEVER execute or automatically discover via db/migrations. Chat 13 owner + Chat 10/11 approval required.
BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $g$ BEGIN IF current_user<>'hft_staging_migration_owner' OR current_setting('server_version_num')::int<>180006 OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) OR NOT has_database_privilege(current_user,current_database(),'CREATE') OR has_database_privilege(current_user,current_database(),'TEMP') OR to_regnamespace('hft') IS NOT NULL THEN RAISE EXCEPTION 'HFT_MIGRATION_ROLE_PREFLIGHT'; END IF; END $g$;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_staging_migration_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SET LOCAL ROLE hft_r1_posting_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_r1_posting_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
SET LOCAL ROLE hft_r1_p3_master_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_r1_p3_master_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
DO $v$ DECLARE who text; oid_role oid; BEGIN
 IF current_user<>'hft_staging_migration_owner' THEN RAISE EXCEPTION 'MIGRATION_ROLE_NOT_RESTORED'; END IF;
 FOREACH who IN ARRAY ARRAY['hft_staging_migration_owner','hft_r1_posting_owner','hft_r1_p3_master_owner'] LOOP
  SELECT oid INTO oid_role FROM pg_roles WHERE rolname=who;
  IF oid_role IS NULL OR NOT EXISTS(
   SELECT 1 FROM pg_default_acl d WHERE d.defaclrole=oid_role
    AND d.defaclnamespace=0 AND d.defaclobjtype='f' AND NOT EXISTS(
      SELECT 1 FROM aclexplode(d.defaclacl) x
      WHERE x.grantee=0 AND x.privilege_type='EXECUTE'))
  THEN RAISE EXCEPTION 'PUBLIC_FUNCTION_EXECUTE_DEFAULT_NOT_REVOKED'; END IF;
 END LOOP;
END $v$;
COMMIT; SELECT 'HFT_MIGRATION_OWNER_PREPARED_ACK';
