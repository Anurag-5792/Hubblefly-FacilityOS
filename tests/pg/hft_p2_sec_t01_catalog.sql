-- P2-SEC-T01 — SOURCE ONLY / NOT RUN. Execute under authorized read-only
-- DBA verifier after source/role approval, never on a business database.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database(),session_user,current_user,current_setting('server_version_num');
SELECT r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,
       r.rolcanlogin,r.rolreplication
 FROM pg_catalog.pg_roles r
 WHERE r.rolname IN ('hft_engineering','hft_r1_posting_owner',
                    'hft_r1_app_runtime','hft_r1_audit_verify') ORDER BY r.rolname;
SELECT grantor.rolname AS granted_role, member.rolname AS member_role
 FROM pg_catalog.pg_auth_members m
 JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.roleid
 JOIN pg_catalog.pg_roles member ON member.oid=m.member
 WHERE member.rolname IN ('hft_r1_app_runtime','hft_r1_posting_owner')
 ORDER BY member.rolname,grantor.rolname;
SELECT n.nspname,pg_catalog.has_schema_privilege('hft_r1_app_runtime',n.oid,'CREATE')
  AS runtime_can_create,pg_catalog.has_schema_privilege('hft_r1_audit_verify',n.oid,'CREATE')
  AS audit_can_create FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('hft','hft_secret','hft_crypto');
SELECT p.oid::pg_catalog.regprocedure AS signature,r.rolname AS owner,p.prosecdef,p.proconfig,
       pg_catalog.has_function_privilege('hft_r1_app_runtime',p.oid,'EXECUTE') AS runtime_execute,
       pg_catalog.has_function_privilege('hft_r1_audit_verify',p.oid,'EXECUTE') AS audit_execute,
       pg_catalog.has_function_privilege('PUBLIC',p.oid,'EXECUTE') AS public_execute
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='hft' AND p.proname IN
 ('seal_stock_command_v1','lock_seal_posting_dependencies_v2',
  'assert_command_seal_v1','post_stock_command_protected_v1',
  'p2_verify_invocation_v1','p2_payload_digest_v1') ORDER BY 1;
SELECT rel.oid::pg_catalog.regclass, owner.rolname AS owner,
 pg_catalog.has_table_privilege('hft_r1_app_runtime',rel.oid,'INSERT') AS runtime_insert,
 pg_catalog.has_table_privilege('hft_r1_app_runtime',rel.oid,'UPDATE') AS runtime_update,
 pg_catalog.has_table_privilege('hft_r1_app_runtime',rel.oid,'DELETE') AS runtime_delete,
 pg_catalog.has_table_privilege('hft_r1_audit_verify',rel.oid,'INSERT') AS audit_insert
 FROM pg_catalog.pg_class rel JOIN pg_catalog.pg_namespace ns ON ns.oid=rel.relnamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=rel.relowner
 WHERE ns.nspname='hft' AND rel.relname IN
 ('stock_account','stock_entry','stock_command','stock_command_seal',
  'audit_outbox','stock_command_outcome','stock_approval','stock_hold',
  'protected_stock_approval','posting_invocation_nonce','posting_fragment') ORDER BY 1;
SELECT owner.rolname AS creator,ns.nspname AS schema_name,d.defaclobjtype,
  d.defaclacl::text AS default_acl
 FROM pg_catalog.pg_default_acl d
 JOIN pg_catalog.pg_roles owner ON owner.oid=d.defaclrole
 LEFT JOIN pg_catalog.pg_namespace ns ON ns.oid=d.defaclnamespace
 WHERE owner.rolname IN ('hft_engineering','hft_r1_posting_owner') ORDER BY 1,2,3;
COMMIT;
-- Acceptance: runtime has ONLY protected-writer EXECUTE, zero helper/other
-- function EXECUTE, zero direct table write, zero owner/CREATE privileges;
-- posting_owner is non-superuser NOLOGIN; defaults globally revoke PUBLIC.
