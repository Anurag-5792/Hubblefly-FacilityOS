-- P2-SEC-T02 — NOT RUN; use real restricted LOGIN credentials, not SET ROLE
-- as the sole acceptance evidence. Requires approved disposable PG15+.
\set ON_ERROR_STOP on
BEGIN;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
  OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_REAL_RUNTIME_LOGIN_REQUIRED'; END IF;
END $pre$;
DO $denied$
DECLARE stopped boolean;
BEGIN
 stopped:=false;
 BEGIN PERFORM hft.seal_stock_command_v1('00000000-0000-0000-0000-000000000000'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_DIRECT_SEAL_EXECUTE_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN PERFORM hft.lock_seal_posting_dependencies_v2('00000000-0000-0000-0000-000000000000'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_DIRECT_LOCK_EXECUTE_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN PERFORM hft.assert_command_seal_v1('00000000-0000-0000-0000-000000000000'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_DIRECT_VERIFY_EXECUTE_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN EXECUTE 'INSERT INTO hft.stock_entry DEFAULT VALUES';
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_DIRECT_ENTRY_INSERT_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN EXECUTE 'UPDATE hft.stock_account SET qty_micro=qty_micro';
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_DIRECT_ACCOUNT_UPDATE_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN EXECUTE 'DELETE FROM hft.audit_outbox';
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_DIRECT_AUDIT_DELETE_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN EXECUTE 'ALTER TABLE hft.stock_entry DISABLE TRIGGER ALL';
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_TRIGGER_DISABLE_NOT_DENIED'; END IF;
 stopped:=false;
 BEGIN EXECUTE 'SET ROLE hft_r1_posting_owner';
 EXCEPTION WHEN insufficient_privilege THEN stopped:=true; END;
 IF NOT stopped THEN RAISE EXCEPTION 'P2_OWNER_ROLE_SWITCH_NOT_DENIED'; END IF;
END $denied$;
ROLLBACK;
