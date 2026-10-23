-- HFT R1 QA-001/002/003/004/008/009 additive, isolated NONPRODUCTION migration.
-- Versions 0001-0004 MUST retain their original immutable SHA256 checksums.
BEGIN;
-- Never auto-reclassify previously attributed CUSTODY facts; manual provenance
-- reconciliation is required before this additive migration can proceed.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM hft.stock_entry WHERE bucket='CUSTODY') THEN
   RAISE EXCEPTION 'LEGACY_CUSTODY_LEDGER_RECONCILIATION_REQUIRED';
 END IF;
 IF EXISTS (SELECT 1 FROM hft.stock_account WHERE location_key='' ) THEN
   RAISE EXCEPTION 'UNLOCATED_LEGACY_BALANCE_RECONCILIATION_REQUIRED';
 END IF;
END $$;

-- A quantitative account represents a DISTINCT legal-entity-owned inventory
-- position. Custody preserves company ownership; it is NOT a warehouse balance.
ALTER TABLE hft.stock_account
  ADD COLUMN account_kind text NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN custodian_employee_id text NOT NULL DEFAULT '';
ALTER TABLE hft.stock_account ADD CONSTRAINT stock_account_kind_valid
  CHECK(account_kind IN ('AVAILABLE','CUSTODY','QUARANTINE','DAMAGED','WIP','INSTALLED'));
ALTER TABLE hft.stock_account ADD CONSTRAINT stock_account_condition_owner_consistent
  CHECK (
    (account_kind='AVAILABLE' AND condition='GOOD' AND custodian_employee_id='') OR
    (account_kind='CUSTODY' AND condition='GOOD' AND custodian_employee_id<>'') OR
    (account_kind='QUARANTINE' AND condition='QUARANTINE' AND custodian_employee_id='') OR
    (account_kind='DAMAGED' AND condition='DAMAGED' AND custodian_employee_id='') OR
    (account_kind IN ('WIP','INSTALLED') AND condition='GOOD' AND custodian_employee_id='')
  );
ALTER TABLE hft.stock_account ADD CONSTRAINT stock_account_location_required
  CHECK(length(trim(location_key))>0);
-- The original unique account key omits custodian/kind and would collapse custody
-- into available inventory. Drop only the original key after explicit discovery.
DO $$ DECLARE old_key text;
BEGIN
  SELECT c.conname INTO old_key FROM pg_constraint c
   WHERE c.conrelid='hft.stock_account'::regclass AND c.contype='u';
  IF old_key IS NULL THEN RAISE EXCEPTION 'LEGACY_ACCOUNT_UNIQUE_KEY_MISSING'; END IF;
  EXECUTE format('ALTER TABLE hft.stock_account DROP CONSTRAINT %I',old_key);
END $$;
CREATE UNIQUE INDEX stock_account_full_identity_v2 ON hft.stock_account
  (legal_entity_id,warehouse_id,item_code,location_key,batch_key,serial_key,condition,account_kind,custodian_employee_id);
CREATE INDEX stock_account_custody_v2 ON hft.stock_account
  (legal_entity_id,custodian_employee_id,item_code,serial_key)
  WHERE account_kind='CUSTODY' AND qty_micro>0;
-- Enforce physical location existence for every quantity account. Custody
-- retains the originating location while its custodian defines exclusive holder.
ALTER TABLE hft.stock_account ADD CONSTRAINT stock_account_location_fk_v2
 FOREIGN KEY(legal_entity_id,warehouse_id,location_key)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id);

-- Full movement classification. Every internal ledger leg MUST have an account;
-- every EXTERNAL leg MUST have no account, preventing double ownership.
ALTER TABLE hft.stock_entry DROP CONSTRAINT stock_entry_bucket_check;
ALTER TABLE hft.stock_entry ADD CONSTRAINT stock_entry_bucket_check
 CHECK(bucket IN ('EXTERNAL','AVAILABLE','CUSTODY','QUARANTINE','DAMAGED','WIP','INSTALLED'));
ALTER TABLE hft.stock_entry ADD CONSTRAINT stock_entry_account_boundary_check
 CHECK ((bucket='EXTERNAL' AND account_id IS NULL) OR (bucket<>'EXTERNAL' AND account_id IS NOT NULL));

-- A delivery/GRN is distinct from its supplier invoice. Multiple deliveries may
-- consume one invoice-line ceiling, never count the same physical receipt twice.
CREATE TABLE hft.supplier_invoice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 legal_entity_id text NOT NULL, supplier_id text NOT NULL,
 invoice_key text NOT NULL, invoice_date date NOT NULL,
 status text NOT NULL CHECK(status IN ('VERIFIED','HOLD','CANCELLED')),
 UNIQUE(legal_entity_id,supplier_id,invoice_key),
 FOREIGN KEY(legal_entity_id,supplier_id) REFERENCES hft.supplier(legal_entity_id,supplier_id)
);
ALTER TABLE hft.supplier_invoice ADD CONSTRAINT supplier_invoice_scoped_identity_v2
 UNIQUE(id,legal_entity_id,supplier_id,invoice_key);
CREATE TABLE hft.supplier_invoice_line (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES hft.supplier_invoice(id),
 legal_entity_id text NOT NULL, line_no integer NOT NULL CHECK(line_no>0),
 item_code text NOT NULL, authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 received_micro bigint NOT NULL DEFAULT 0 CHECK(received_micro>=0 AND received_micro<=authorized_micro),
 UNIQUE(invoice_id,line_no),
 FOREIGN KEY(invoice_id,legal_entity_id) REFERENCES hft.supplier_invoice(id,legal_entity_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
ALTER TABLE hft.grn ADD COLUMN invoice_id uuid REFERENCES hft.supplier_invoice(id);
ALTER TABLE hft.grn ADD COLUMN physical_receipt_id text;
ALTER TABLE hft.grn ADD CONSTRAINT grn_invoice_binding_v2
 FOREIGN KEY(invoice_id,legal_entity_id,supplier_id,invoice_key)
 REFERENCES hft.supplier_invoice(id,legal_entity_id,supplier_id,invoice_key);
-- Legacy synthetic/unlinked GRNs remain identifiable but cannot be posted until
-- linked to a verified invoice and replaced with a genuine delivery reference.
UPDATE hft.grn SET physical_receipt_id='UNRECONCILED-'||id::text
 WHERE physical_receipt_id IS NULL;
ALTER TABLE hft.grn ALTER COLUMN physical_receipt_id SET NOT NULL;
ALTER TABLE hft.grn ADD CONSTRAINT grn_physical_receipt_id_present CHECK(length(trim(physical_receipt_id))>=2);
DO $$ DECLARE old_key text;
BEGIN
 SELECT c.conname INTO old_key FROM pg_constraint c
 WHERE c.conrelid='hft.grn'::regclass AND c.contype='u';
 IF old_key IS NULL THEN RAISE EXCEPTION 'LEGACY_GRN_UNIQUE_KEY_MISSING'; END IF;
 EXECUTE format('ALTER TABLE hft.grn DROP CONSTRAINT %I',old_key);
END $$;
CREATE UNIQUE INDEX grn_unique_physical_delivery_v2 ON hft.grn
 (legal_entity_id,supplier_id,invoice_key,physical_receipt_id);
CREATE UNIQUE INDEX grn_unique_supplier_delivery_v2 ON hft.grn
 (legal_entity_id,supplier_id,physical_receipt_id);
ALTER TABLE hft.grn_line ADD COLUMN invoice_line_id uuid REFERENCES hft.supplier_invoice_line(id);
ALTER TABLE hft.grn_partial_receipt
 ADD COLUMN location_id text, ADD COLUMN legal_entity_id text, ADD COLUMN warehouse_id text,
 ADD COLUMN batch_no text NOT NULL DEFAULT '',
 ADD COLUMN serial_no text NOT NULL DEFAULT '';
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_scoped_location_v2
 CHECK(legal_entity_id IS NOT NULL AND warehouse_id IS NOT NULL AND location_id IS NOT NULL) NOT VALID;
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_location_fk_v2
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id) NOT VALID;
-- Source receipt identity pinned to the persisted command and independently
-- unique, even if a caller chooses another idempotency key.
ALTER TABLE hft.stock_command
 ADD COLUMN payload_contract_version text NOT NULL DEFAULT 'HFT_STOCK_COMMAND_V2'
  CHECK(payload_contract_version='HFT_STOCK_COMMAND_V2'),
 ADD COLUMN source_receipt_id uuid REFERENCES hft.grn_partial_receipt(id),
 ADD COLUMN source_line_no integer CHECK(source_line_no>0),
 ADD COLUMN warehouse_id text,
 ADD COLUMN item_code text,
 ADD COLUMN location_id text,
 ADD COLUMN batch_no text NOT NULL DEFAULT '',
 ADD COLUMN serial_no text NOT NULL DEFAULT '';
ALTER TABLE hft.stock_command ADD CONSTRAINT stock_command_location_fk_v2
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id);
ALTER TABLE hft.stock_command ADD CONSTRAINT stock_command_scope_and_receipt_v2 CHECK (
  warehouse_id IS NOT NULL AND item_code IS NOT NULL AND location_id IS NOT NULL AND
  length(trim(location_id))>0 AND
  ((kind='RECEIVE' AND source_receipt_id IS NOT NULL AND source_line_no IS NOT NULL) OR
   (kind<>'RECEIVE' AND source_receipt_id IS NULL AND source_line_no IS NULL))
);
CREATE UNIQUE INDEX stock_command_unique_receipt_v2 ON hft.stock_command(source_receipt_id)
 WHERE source_receipt_id IS NOT NULL;

-- The issue document binds permitted item, location, serial/batch and quantity.
CREATE TABLE hft.material_issue_line (
 issue_id uuid NOT NULL REFERENCES hft.material_issue(id),
 legal_entity_id text NOT NULL,warehouse_id text NOT NULL,
 source_action_key text NOT NULL CHECK(length(trim(source_action_key))>=2),
 item_code text NOT NULL, location_id text NOT NULL,
 batch_no text NOT NULL DEFAULT '', serial_no text NOT NULL DEFAULT '',
 authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 issued_micro bigint NOT NULL DEFAULT 0 CHECK(issued_micro>=0 AND issued_micro<=authorized_micro),
 PRIMARY KEY(issue_id,source_action_key),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
  REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
CREATE TABLE hft.material_return_line (
 return_id uuid NOT NULL REFERENCES hft.material_return(id),
 legal_entity_id text NOT NULL,warehouse_id text NOT NULL,
 source_action_key text NOT NULL CHECK(length(trim(source_action_key))>=2),
 original_issue_command_id text NOT NULL,
 item_code text NOT NULL, location_id text NOT NULL,
 batch_no text NOT NULL DEFAULT '', serial_no text NOT NULL DEFAULT '',
 authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 returned_micro bigint NOT NULL DEFAULT 0 CHECK(returned_micro>=0 AND returned_micro<=authorized_micro),
 PRIMARY KEY(return_id,source_action_key),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
  REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
ALTER TABLE hft.employee_custody ADD COLUMN location_id text;
ALTER TABLE hft.employee_custody ADD CONSTRAINT custody_location_fk_v2
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id);

-- Independent cumulative invoice-line reconstruction across every GRN/physical
-- receipt referencing that invoice. Duplicate receipts cannot inflate accepted stock.
CREATE VIEW hft.invoice_line_receipt_reconstruction_v2 AS
SELECT il.id AS invoice_line_id,il.invoice_id,il.line_no,il.item_code,
 il.authorized_micro,il.received_micro,
 COALESCE(SUM(CASE WHEN sc.id IS NOT NULL THEN r.accepted_micro ELSE 0 END),0)::numeric
  AS reconstructed_received_micro
 FROM hft.supplier_invoice_line il
 LEFT JOIN hft.grn_line gl ON gl.invoice_line_id=il.id
 LEFT JOIN hft.grn_partial_receipt r ON r.grn_id=gl.grn_id AND r.line_no=gl.line_no
 LEFT JOIN hft.stock_command sc ON sc.source_receipt_id=r.id
 GROUP BY il.id;
CREATE OR REPLACE FUNCTION hft.verify_invoice_line_reconstruction_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual bigint; expected numeric;
BEGIN
 SELECT received_micro INTO actual FROM hft.supplier_invoice_line WHERE id=NEW.id;
 SELECT reconstructed_received_micro INTO expected
   FROM hft.invoice_line_receipt_reconstruction_v2 WHERE invoice_line_id=NEW.id;
 IF actual::numeric<>expected THEN
   RAISE EXCEPTION 'INVOICE_RECEIPT_RECONSTRUCTION_FAILED:%',NEW.id;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_line_reconstruction_v2
 AFTER UPDATE ON hft.supplier_invoice_line
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.verify_invoice_line_reconstruction_v2();
CREATE CONSTRAINT TRIGGER invoice_line_insert_reconstruction_v2
 AFTER INSERT ON hft.supplier_invoice_line
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.verify_invoice_line_reconstruction_v2();
CREATE OR REPLACE FUNCTION hft.verify_posted_invoice_receipt_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_line_uuid uuid; mismatch boolean;
BEGIN
 IF NEW.source_receipt_id IS NULL THEN RETURN NULL; END IF;
 SELECT gl.invoice_line_id INTO invoice_line_uuid
 FROM hft.grn_partial_receipt r JOIN hft.grn_line gl ON r.grn_id=gl.grn_id AND r.line_no=gl.line_no
 WHERE r.id=NEW.source_receipt_id;
 IF invoice_line_uuid IS NULL THEN RAISE EXCEPTION 'POSTED_GRN_INVOICE_LINE_REQUIRED'; END IF;
 SELECT received_micro<>reconstructed_received_micro INTO mismatch
 FROM hft.invoice_line_receipt_reconstruction_v2 WHERE invoice_line_id=invoice_line_uuid;
 IF mismatch IS DISTINCT FROM false THEN RAISE EXCEPTION 'POSTED_GRN_INVOICE_RECONSTRUCTION_FAILED'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER posted_receipt_reconstruction_v2 AFTER INSERT ON hft.stock_command
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.verify_posted_invoice_receipt_v2();

-- Protect account attribution, including location, serial/batch, legal ownership,
-- and custody holder, at the DATABASE boundary, not merely in TypeScript.
CREATE OR REPLACE FUNCTION hft.verify_stock_entry_account_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a hft.stock_account%ROWTYPE; cmd hft.stock_command%ROWTYPE;
BEGIN
 IF NEW.bucket='EXTERNAL' THEN
   IF NEW.account_id IS NOT NULL THEN RAISE EXCEPTION 'EXTERNAL_MUST_NOT_OWN_STOCK'; END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO a FROM hft.stock_account WHERE id=NEW.account_id;
 SELECT * INTO cmd FROM hft.stock_command WHERE id=NEW.command_id;
 IF cmd.id IS NULL OR a.id IS NULL OR a.account_kind<>NEW.bucket OR a.serial_key<>COALESCE(NEW.serial_no,'')
    OR a.batch_key<>COALESCE(NEW.batch_no,'') OR
    a.legal_entity_id<>cmd.legal_entity_id OR a.warehouse_id<>cmd.warehouse_id OR
    a.item_code<>cmd.item_code OR a.location_key<>cmd.location_id OR
    (NEW.bucket='CUSTODY' AND a.custodian_employee_id<>COALESCE(NEW.employee_id,'')) THEN
    RAISE EXCEPTION 'STOCK_ENTRY_ACCOUNT_IDENTITY_MISMATCH';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_entry_account_identity_v2 BEFORE INSERT ON hft.stock_entry
 FOR EACH ROW EXECUTE FUNCTION hft.verify_stock_entry_account_v2();

-- At COMMIT the materialized balance must exactly equal the sum of immutable
-- entries targeting the account. Prevent unjournaled balance edits as well.
CREATE OR REPLACE FUNCTION hft.assert_account_reconstruction_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; persisted bigint; reconstructed numeric;
BEGIN
 IF TG_TABLE_NAME='stock_entry' THEN target_id:=NEW.account_id;
 ELSE target_id:=NEW.id; END IF;
 IF target_id IS NULL THEN RETURN NULL; END IF;
 SELECT qty_micro INTO persisted FROM hft.stock_account WHERE id=target_id;
 SELECT COALESCE(SUM(qty_delta_micro),0) INTO reconstructed FROM hft.stock_entry WHERE account_id=target_id;
 IF persisted IS NULL OR persisted::numeric<>reconstructed THEN
   RAISE EXCEPTION 'ACCOUNT_LEDGER_RECONSTRUCTION_FAILED:%',target_id;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_entry_reconstruction_v2 AFTER INSERT ON hft.stock_entry
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.assert_account_reconstruction_v2();
CREATE CONSTRAINT TRIGGER stock_account_insert_reconstruction_v2 AFTER INSERT ON hft.stock_account
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.assert_account_reconstruction_v2();
CREATE CONSTRAINT TRIGGER stock_account_reconstruction_v2 AFTER UPDATE ON hft.stock_account
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.assert_account_reconstruction_v2();

-- Read-only ledger reconciliation query used by independent QA; returns ONLY
-- mismatched accounts (zero rows is necessary, not sufficient, for GO).
CREATE VIEW hft.stock_account_reconstruction_v2 AS
SELECT a.legal_entity_id,a.warehouse_id,a.location_key,a.item_code,a.batch_key,a.serial_key,
 a.account_kind,a.condition,a.custodian_employee_id,a.id AS account_id,
 a.qty_micro AS persisted_micro,COALESCE(SUM(e.qty_delta_micro),0)::numeric AS reconstructed_micro
FROM hft.stock_account a LEFT JOIN hft.stock_entry e ON e.account_id=a.id
GROUP BY a.id;
COMMIT;
