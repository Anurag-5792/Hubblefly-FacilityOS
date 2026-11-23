-- P3 real restricted-login negative test source — NOT RUN.
-- Run with actual P3 runtime login and no privileged SET ROLE. Never
-- use migration owner or execute as a function owner.
\set ON_ERROR_STOP on
BEGIN;
DO $pre$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P3_ACTUAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
END $pre$;
-- A direct runtime SELECT must fail with 42501, not a parser error.
SAVEPOINT employee_read;
\set ON_ERROR_STOP off
SELECT employee_id FROM hft.employee LIMIT 1;
\set read_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT employee_read;
SELECT 1 / CASE WHEN :'read_state'='42501' THEN 1 ELSE 0 END
 AS employee_direct_read_denied;
SAVEPOINT view_read;
\set ON_ERROR_STOP off
SELECT record_id FROM hft.p3_master_read_v1 LIMIT 1;
\set view_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT view_read;
SELECT 1 / CASE WHEN :'view_state'='42501' THEN 1 ELSE 0 END
 AS master_view_direct_read_denied;
SAVEPOINT grant_read;
\set ON_ERROR_STOP off
SELECT actor_subject FROM hft.p3_master_actor_grant LIMIT 1;
\set grant_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT grant_read;
SELECT 1 / CASE WHEN :'grant_state'='42501' THEN 1 ELSE 0 END
 AS master_grant_direct_read_denied;
SAVEPOINT master_update;
\set ON_ERROR_STOP off
UPDATE hft.employee SET active=false WHERE legal_entity_id='SYNTHETIC';
\set update_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT master_update;
SELECT 1 / CASE WHEN :'update_state'='42501' THEN 1 ELSE 0 END
 AS direct_employee_mutation_denied;
SAVEPOINT owner_role;
\set ON_ERROR_STOP off
SET ROLE hft_r1_p3_master_owner;
\set owner_role_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT owner_role;
SELECT 1 / CASE WHEN :'owner_role_state'='42501' THEN 1 ELSE 0 END
 AS owner_role_assumption_denied;
ROLLBACK;
