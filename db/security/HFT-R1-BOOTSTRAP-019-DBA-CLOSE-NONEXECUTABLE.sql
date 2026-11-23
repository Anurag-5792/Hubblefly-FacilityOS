-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY; NOT an approved migration.
-- Database-level revocation and role-membership verification only; no object GRANTs.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $pre$
BEGIN
 IF current_database()<>'neondb' OR current_user<>'neondb_owner'
 OR current_user<>session_user
 OR current_setting('server_version_num')::integer<>180006
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
   AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 THEN RAISE EXCEPTION 'HFT_BOOTSTRAP019_DBA_CLOSE_PRECONDITION'; END IF;
END $pre$;
REVOKE CREATE ON DATABASE neondb FROM hft_staging_migration_owner;
REVOKE CONNECT,TEMPORARY,CREATE ON DATABASE neondb FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $v$
BEGIN
 IF has_database_privilege('hft_staging_migration_owner','neondb','CREATE')
 OR has_database_privilege('hft_staging_app_runtime','neondb','CREATE')
 OR has_database_privilege('hft_staging_app_runtime','neondb','TEMP')
 OR has_database_privilege('hft_staging_audit_verify','neondb','CREATE')
 OR EXISTS(
   SELECT 1 FROM pg_roles r WHERE r.rolname IN
    ('hft_staging_migration_owner','hft_r1_app_runtime',
     'hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify')
   AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls))
 OR EXISTS(
   SELECT 1 FROM pg_auth_members m
   JOIN pg_roles member ON member.oid=m.member
   JOIN pg_roles parent ON parent.oid=m.roleid
   WHERE member.rolname IN ('hft_staging_migration_owner','hft_r1_app_runtime',
    'hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify')
   AND parent.rolname='neon_superuser')
 OR (SELECT count(*) FROM pg_auth_members m
   JOIN pg_roles member ON member.oid=m.member
   JOIN pg_roles parent ON parent.oid=m.roleid
   WHERE member.rolname='hft_staging_app_runtime' AND parent.rolname='hft_r1_app_runtime'
   AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option)<>1
 OR (SELECT count(*) FROM pg_auth_members m
   JOIN pg_roles member ON member.oid=m.member
   JOIN pg_roles parent ON parent.oid=m.roleid
   WHERE member.rolname='hft_staging_audit_verify' AND parent.rolname='hft_r1_audit_verify'
   AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option)<>1
 OR EXISTS(
   SELECT 1 FROM pg_auth_members m
   JOIN pg_roles member ON member.oid=m.member
   WHERE member.rolname IN ('hft_staging_migration_owner','hft_staging_app_runtime',
     'hft_staging_audit_verify')
   AND NOT (
    member.rolname='hft_staging_app_runtime' AND m.roleid=(SELECT oid FROM pg_roles WHERE rolname='hft_r1_app_runtime')
    OR member.rolname='hft_staging_audit_verify' AND m.roleid=(SELECT oid FROM pg_roles WHERE rolname='hft_r1_audit_verify')))
 THEN RAISE EXCEPTION 'HFT019_DBA_PRIVILEGE_OR_MEMBERSHIP_FAILED'; END IF;
END $v$;
COMMIT;
SELECT 'HFT_DBA_CLOSE_ACK';
