-- HFT-R1-ENG-EXEC-005: ACTUAL SQL authorization negative fixture.
-- NOT EXECUTED. Run ONLY on operator-approved disposable PostgreSQL 15+,
-- after reviewed role/bootstrap migration and with DBA SET ROLE permission.
-- Expected: every direct SQL write/schema alteration fails SQLSTATE 42501.
BEGIN;
DO $preflight$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_app_runtime')
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_audit_verify') THEN
   RAISE EXCEPTION 'AUTHORIZED_DISPOSABLE_DB_AND_ROLE_REQUIRED';
 END IF;
END $preflight$;
SET LOCAL ROLE hft_r1_app_runtime;
DO $deny$
DECLARE denied boolean;
BEGIN
 denied:=false;
 BEGIN
   INSERT INTO hft.stock_command DEFAULT VALUES;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'RUNTIME_INSERT_COMMAND_MUST_BE_DENIED'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO hft.stock_entry DEFAULT VALUES;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'RUNTIME_INSERT_ENTRY_MUST_BE_DENIED'; END IF;

 denied:=false;
 BEGIN
   UPDATE hft.stock_account SET qty_micro=qty_micro;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'RUNTIME_BALANCE_MUTATION_MUST_BE_DENIED'; END IF;

 denied:=false;
 BEGIN
   DELETE FROM hft.audit_outbox;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'RUNTIME_AUDIT_DELETION_MUST_BE_DENIED'; END IF;

 denied:=false;
 BEGIN
   EXECUTE 'ALTER TABLE hft.stock_entry DISABLE TRIGGER ALL';
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'RUNTIME_TRIGGER_DISABLE_MUST_BE_DENIED'; END IF;
END $deny$;
RESET ROLE;
SET LOCAL ROLE hft_r1_audit_verify;
DO $audit$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
   INSERT INTO hft.stock_entry DEFAULT VALUES;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'AUDIT_READER_MUST_NOT_POST_STOCK'; END IF;
END $audit$;
RESET ROLE;
ROLLBACK;
-- Note: this fixture deliberately has no production credentials or data.
