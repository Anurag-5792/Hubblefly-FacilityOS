-- P2-SEC-T02: actual restricted LOGIN, not migration owner or SET ROLE simulation.
-- NOT RUN. Must be executed only on accepted disposable PostgreSQL.
\set ON_ERROR_STOP on
BEGIN;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T02_REAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
END $pre$;
DO $denial$
DECLARE blocked boolean; sql text;
BEGIN
 FOREACH sql IN ARRAY ARRAY[
  'SELECT hft.seal_stock_command_v1(NULL::uuid)',
  'SELECT hft.lock_seal_posting_dependencies_v2(NULL::uuid)',
  'SELECT hft.assert_command_seal_v1(NULL::uuid)',
  'INSERT INTO hft.stock_entry DEFAULT VALUES',
  'INSERT INTO hft.protected_stock_approval DEFAULT VALUES',
  'INSERT INTO hft.protected_approval_decision DEFAULT VALUES',
  'INSERT INTO hft.posting_parent_hold DEFAULT VALUES',
  'INSERT INTO hft.custody_ack_pending DEFAULT VALUES',
  'UPDATE hft.stock_account SET qty_micro=qty_micro',
  'DELETE FROM hft.audit_outbox',
  'ALTER TABLE hft.stock_entry DISABLE TRIGGER ALL'
 ] LOOP
  blocked:=false;
  BEGIN EXECUTE sql;
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'P2_T02_UNAUTHORIZED_SQL_NOT_DENIED:%',sql; END IF;
 END LOOP;
END $denial$;
-- Test role assumption at the SQL session level, not inside PL/pgSQL.
-- Exactly 42501 demonstrates permission denial; a different error
-- (including prohibited SET ROLE in DO) must fail this qualification.
SAVEPOINT p2_owner_role_attempt;
\set ON_ERROR_STOP off
SET ROLE hft_r1_posting_owner;
\set p2_owner_role_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT p2_owner_role_attempt;
SELECT 1 / CASE WHEN :'p2_owner_role_sqlstate' = '42501' THEN 1 ELSE 0 END
 AS p2_owner_set_role_denied;
SAVEPOINT p2_migration_role_attempt;
\set ON_ERROR_STOP off
SET ROLE hft_engineering;
\set p2_migration_role_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT p2_migration_role_attempt;
SELECT 1 / CASE WHEN :'p2_migration_role_sqlstate' = '42501' THEN 1 ELSE 0 END
 AS p2_migration_set_role_denied;
SELECT 'P2_SEC_T02_DENIALS_PASS' AS denied_without_mutation;
ROLLBACK;
