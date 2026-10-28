-- HFT R1 P2 restricted function entrypoint foundation; NONPRODUCTION ONLY.
-- No production posting permission is granted. PostgreSQL execution NOT RUN.
BEGIN;
DO $guard$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
    OR current_setting('server_version_num')::integer < 150000
    OR current_user <> 'hft_engineering'
    OR NOT EXISTS (SELECT 1 FROM hft.schema_revision WHERE version=6
       AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 THEN RAISE EXCEPTION 'P2_CANONICAL_DISPOSABLE_MIGRATION_OWNER_REQUIRED'; END IF;
END $guard$;

-- No unqualified direct sealing or lock orchestration through PUBLIC or app.
REVOKE ALL ON SCHEMA hft FROM PUBLIC;
REVOKE CREATE ON SCHEMA hft FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hft.seal_stock_command_v1(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hft.lock_seal_posting_dependencies_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hft.assert_command_seal_v1(uuid) FROM PUBLIC;

-- Default privileges apply to objects CREATED BY the migration owner,
-- not arbitrary other roles. Future owner roles must repeat these rules.
ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering IN SCHEMA hft
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering IN SCHEMA hft
 REVOKE ALL ON TABLES FROM PUBLIC;

-- Intentionally fail closed. This function is NOT the final protected writer:
-- no verified actor-proof contract, no SECURITY DEFINER, no runtime EXECUTE.
-- A later reviewed additive migration must replace the blocked entrypoint
-- atomically with complete approval/fragment/lock/integrity enforcement.
CREATE OR REPLACE FUNCTION hft.post_stock_command_protected_v1(payload jsonb, proof jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'PROTECTED_POSTING_NOT_ACTIVATED'
   USING ERRCODE='42501';
END $$;
REVOKE EXECUTE ON FUNCTION hft.post_stock_command_protected_v1(jsonb,jsonb) FROM PUBLIC;
-- Runtime and auditor have no EXECUTE grant here; no table DML granted.
COMMIT;
