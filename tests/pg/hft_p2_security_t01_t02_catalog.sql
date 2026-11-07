-- HFT-R1 P2 SEC-T01/T02: source-only SQL test; NOT EXECUTED.
-- Requires separately authorized disposable PG 15+, distinct actual roles.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT p.oid::regprocedure::text AS function,
       has_function_privilege('PUBLIC', p.oid,'EXECUTE') AS public_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='hft' AND p.proname IN
 ('seal_stock_command_v1','lock_seal_posting_dependencies_v2',
  'assert_command_seal_v1','post_stock_command_protected_v1');
SELECT r.rolname,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolinherit
FROM pg_roles r
WHERE r.rolname IN ('hft_engineering','hft_r1_app_runtime','hft_r1_audit_verify');
COMMIT;
-- Separate restricted-login test must attempt invoking each helper and
-- direct protected-table DML, ALTER TABLE, SET ROLE; expect 42501.
-- Do not count this catalog SELECT as actual denial evidence.
