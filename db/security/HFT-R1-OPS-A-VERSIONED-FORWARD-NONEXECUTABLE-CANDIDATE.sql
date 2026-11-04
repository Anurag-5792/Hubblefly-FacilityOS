-- HFT OPS-A — VERSION COUPLED P2/P0 FORWARD CANDIDATE, NONEXECUTABLE.
-- Directive HFT-R1-MASTER-V4-OPS-A-SOURCE-018. REVIEW SOURCE ONLY.
-- Not db/migrations/0007; NOT an approved migration; no provider execution.
-- Only the authorized PostgreSQL migration owner may install a separately
-- accepted source identity, under independent Gate A and witnessed QA.
-- Initial STOP is intentional and MUST NOT be removed by a source-only PR.
BEGIN;
DO $ops_a_unapproved$
BEGIN
 RAISE EXCEPTION 'OPS_A_PROTECTED_MIGRATION_NOT_AUTHORIZED';
END $ops_a_unapproved$;

-- PROSPECTIVE FIRST-CUTOVER PRECONDITIONS (unreachable under STOP above):
--  1. Qualified PostgreSQL 18.6, exact schema revisions 0001-0006.
--  2. Separate P2/P3/ITEM_VERSION_PHOTO source and effective grants.
--  3. Independently approved opening data/cutover. Nonempty historical
--     stock, custody, GRN or audit requires a separately reviewed migration;
--     NEVER backfill imaginary product versions into existing facts.
--  4. Existing hft.item_version_catalog and future source-only protected
--     P2 payload V2, signer, writer, seal, audit, nonce, readback all accepted.
--  5. No runtime login inherits direct hft table DML or SECURITY DEFINER
--     ownership; no temporary PUBLIC EXECUTE exposure.
DO $preflight$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR session_user<>'hft_engineering'
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6)
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR pg_catalog.to_regclass('hft.item_version_catalog') IS NULL
 OR pg_catalog.to_regclass('hft.stock_command_seal') IS NULL
 OR pg_catalog.to_regclass('hft.stock_account') IS NULL
 OR pg_catalog.to_regprocedure('hft.post_stock_command_protected_v1(jsonb,jsonb)') IS NULL
 OR EXISTS(SELECT 1 FROM hft.stock_account)
 OR EXISTS(SELECT 1 FROM hft.stock_command)
 OR EXISTS(SELECT 1 FROM hft.stock_entry)
 OR EXISTS(SELECT 1 FROM hft.serial_registry)
 OR EXISTS(SELECT 1 FROM hft.employee_custody)
 OR EXISTS(SELECT 1 FROM hft.audit_outbox)
 OR EXISTS(SELECT 1 FROM hft.grn_partial_receipt)
 OR EXISTS(SELECT 1 FROM hft.stock_approval)
 OR EXISTS(SELECT 1 FROM hft.stock_hold)
 OR EXISTS(SELECT 1 FROM hft.opening_count_session)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='hft' AND tablename='stock_account'
    AND indexname='stock_account_full_identity_v2')
 THEN RAISE EXCEPTION 'OPS_A_VERSIONED_CUTOVER_PRECONDITIONS_UNQUALIFIED';
 END IF;
END $preflight$;

-- Add version to the EXISTING ledger's canonical account and immutable facts.
-- There is no new balance table or second movement writer.
-- The item_version_catalog candidate must expose the exact triple key:
-- (legal_entity_id,item_code,version_code), including retired versions.
ALTER TABLE hft.stock_account
 ADD COLUMN site_id text NOT NULL,
 ADD COLUMN product_version_code text NOT NULL;
ALTER TABLE hft.stock_account ADD CONSTRAINT ops_a_stock_scope_v1
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id);
ALTER TABLE hft.stock_account ADD CONSTRAINT ops_a_stock_version_fk_v1
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);
DROP INDEX hft.stock_account_full_identity_v2;
CREATE UNIQUE INDEX ops_a_versioned_stock_account_identity_v1
 ON hft.stock_account(legal_entity_id,site_id,warehouse_id,item_code,
   product_version_code,location_key,batch_key,serial_key,condition,
   account_kind,custodian_employee_id);
-- Serial uniqueness remains global per entity/item/serial across product
-- versions and warehouses; NEVER include version in serial registry PK.
ALTER TABLE hft.serial_registry ADD COLUMN product_version_code text NOT NULL;
ALTER TABLE hft.serial_registry ADD CONSTRAINT ops_a_serial_version_fk_v1
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);

ALTER TABLE hft.stock_command ADD COLUMN product_version_code text NOT NULL;
ALTER TABLE hft.stock_command ADD CONSTRAINT ops_a_command_version_fk_v1
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);
-- Existing unique command/idempotency/source-action constraints are preserved.
ALTER TABLE hft.stock_entry
 ADD COLUMN product_version_code text NOT NULL,
 ADD COLUMN account_before_version bigint,
 ADD COLUMN account_after_version bigint,
 ADD CONSTRAINT ops_a_entry_version_boundary_v1 CHECK(
  (account_id IS NULL AND bucket='EXTERNAL' AND
   account_before_version IS NULL AND account_after_version IS NULL)
  OR
  (account_id IS NOT NULL AND bucket<>'EXTERNAL' AND
   account_before_version IS NOT NULL AND account_after_version IS NOT NULL
   AND account_after_version=account_before_version+1
   AND account_before_version>=0));
CREATE UNIQUE INDEX ops_a_account_sequential_version_v1
 ON hft.stock_entry(account_id,account_after_version)
 WHERE account_id IS NOT NULL;

ALTER TABLE hft.employee_custody
 ADD COLUMN product_version_code text NOT NULL;
ALTER TABLE hft.employee_custody ADD CONSTRAINT ops_a_custody_version_fk_v1
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);
ALTER TABLE hft.stock_command_seal ADD COLUMN product_version_code text NOT NULL;

-- Exact version identity and existing site/location/traceability must agree
-- on every immutable entry, not just on the mutable current stock account.
CREATE OR REPLACE FUNCTION hft.ops_a_assert_immutable_versioned_entry_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE
 SET search_path=pg_catalog,pg_temp AS $entry$
DECLARE c hft.stock_command%ROWTYPE;a hft.stock_account%ROWTYPE;
BEGIN
 SELECT * INTO c FROM hft.stock_command WHERE id=NEW.command_id;
 IF c.id IS NULL OR NEW.product_version_code<>c.product_version_code THEN
  RAISE EXCEPTION 'OPS_A_COMMAND_ENTRY_VERSION_MISMATCH';
 END IF;
 IF NEW.account_id IS NOT NULL THEN
  SELECT * INTO a FROM hft.stock_account WHERE id=NEW.account_id;
  IF a.id IS NULL
   OR a.legal_entity_id<>c.legal_entity_id
   OR a.site_id<>c.site_id OR a.warehouse_id<>c.warehouse_id
   OR a.item_code<>c.item_code
   OR a.product_version_code<>NEW.product_version_code
   OR a.batch_key<>c.batch_no OR a.serial_key<>c.serial_no
   OR a.account_kind<>NEW.bucket
  THEN RAISE EXCEPTION 'OPS_A_LEDGER_ACCOUNT_VERSION_SCOPE_MISMATCH'; END IF;
 END IF;
 RETURN NULL;
END $entry$;
CREATE CONSTRAINT TRIGGER ops_a_entry_version_commit_gate_v1
 AFTER INSERT ON hft.stock_entry DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.ops_a_assert_immutable_versioned_entry_v1();

-- Version/site become immutable parts of an account UUID's original identity.
-- Existing canonical immutability trigger remains in place as defense in depth.
CREATE OR REPLACE FUNCTION hft.ops_a_deny_versioned_account_identity_change_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $ident$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OPS_A_ACCOUNT_DELETE_DENIED'; END IF;
 IF (NEW.site_id,NEW.product_version_code) IS DISTINCT FROM
    (OLD.site_id,OLD.product_version_code)
 THEN RAISE EXCEPTION 'OPS_A_ACCOUNT_VERSION_OR_SITE_IMMUTABLE'; END IF;
 RETURN NEW;
END $ident$;
CREATE TRIGGER ops_a_account_identity_version_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.stock_account FOR EACH ROW
 EXECUTE FUNCTION hft.ops_a_deny_versioned_account_identity_change_v1();

-- Existing command kind constraint must be replaced through a separately
-- accepted protected writer contract, which must also update the canonical
-- seal validator and all kind-specific source/approval/hold checks.
-- A standalone DROP/ADD of the kind CHECK is NEVER sufficient authorization.
-- There is intentionally NO executable ALTER to add TRANSFER here.

-- For internal source-only auditor use: reconstruct from existing IMMUTABLE
-- stock_entry facts, not a separate stock account / balance store.
-- This is NOT the runtime SECURITY DEFINER reader and is NOT granted.
CREATE OR REPLACE VIEW hft.ops_a_versioned_reconstruction_review_v1 AS
SELECT a.id AS account_id,a.legal_entity_id,a.site_id,a.warehouse_id,
 a.item_code,a.product_version_code,a.location_key,a.batch_key,a.serial_key,
 a.condition,a.account_kind,a.custodian_employee_id,
 a.qty_micro AS persisted_micro,a.version AS persisted_version,
 COALESCE(SUM(e.qty_delta_micro),0)::numeric AS reconstructed_micro,
 COALESCE(MAX(e.account_after_version),0) AS reconstructed_version
FROM hft.stock_account a
LEFT JOIN hft.stock_entry e ON e.account_id=a.id
GROUP BY a.id;
REVOKE ALL ON hft.ops_a_versioned_reconstruction_review_v1
 FROM PUBLIC,hft_r1_app_runtime;

-- REQUIRED NEXT PROTECTED SOURCE PACKAGE, NOT FABRICATED HERE:
-- * exact P2 V2 26+field MAC codec including productVersion and BOTH location
--   identities, signed actor, source/revision, approval, current policy, nonce;
-- * locked source/destination account rows IN DETERMINISTIC order; immutable
--   stock_command + 2 balanced stock_entry rows + both account version CAS;
-- * approved serial registry and employee custody transitions; return
--   inspection/ACK, parent Holds and maker-checker checked IN SAME transaction;
-- * revised movement/outcome/audit SHA seals, changed kind validation and
--   no transaction leg may commit separately;
-- * fresh restricted SECURITY DEFINER readback: version, serial/batch, leaf,
--   custody, movement IDs, full audit reconstruction and scope/pagination;
-- * exact nonce retry rules: uncertain COMMIT -> original proof readback only.
-- * independent concurrency, ACL/RLS, read-only and restore tests.
-- Existing rejecting P0 resolver/readback MUST REMAIN rejecting until all
-- those replacement functions are independently accepted and Gate A approved.
COMMIT;
