-- HFT R1 QA-CORRECT-002 candidate, isolated NONPRODUCTION only.
-- Original db/migrations/0005_hft_quantitative_accounts_receipts.sql is retained
-- byte-for-byte because governed-environment application has NOT been attested.
-- The guarded migrator selects THIS replacement only for explicitly authorized
-- disposable databases with no v5 revision. Never reinterpret an applied v5.
-- Versions 0001-0004 MUST retain their original immutable SHA256 checksums.
BEGIN;
-- QA-013: Do not silently migrate historical commands, GRNs, custody, inventory
-- or audit evidence. A separately approved, rehearsed historical cutover must
-- reconcile all records BEFORE this candidate can be used.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM hft.stock_account)
 OR EXISTS (SELECT 1 FROM hft.stock_entry)
 OR EXISTS (SELECT 1 FROM hft.stock_command)
 OR EXISTS (SELECT 1 FROM hft.employee_custody)
 OR EXISTS (SELECT 1 FROM hft.audit_outbox)
 OR EXISTS (SELECT 1 FROM hft.audit_delivery)
 OR EXISTS (SELECT 1 FROM hft.serial_registry)
 OR EXISTS (SELECT 1 FROM hft.reversal_link)
 OR EXISTS (SELECT 1 FROM hft.stock_approval)
 OR EXISTS (SELECT 1 FROM hft.stock_hold)
 OR EXISTS (SELECT 1 FROM hft.grn)
 OR EXISTS (SELECT 1 FROM hft.grn_line)
 OR EXISTS (SELECT 1 FROM hft.grn_partial_receipt)
 OR EXISTS (SELECT 1 FROM hft.material_issue)
 OR EXISTS (SELECT 1 FROM hft.material_return)
 OR EXISTS (SELECT 1 FROM hft.opening_count_session)
 THEN RAISE EXCEPTION 'HISTORICAL_OPERATIONAL_DATA_REQUIRES_APPROVED_CUTOVER'; END IF;
END $$;
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
-- QA-011: PostgreSQL requires an exact qualifying key for the two-column FK.
-- A four-column unique key is not sufficient even when id is a primary key.
ALTER TABLE hft.supplier_invoice ADD CONSTRAINT supplier_invoice_entity_identity_v2
 UNIQUE(id,legal_entity_id);
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
-- QA-012: invoice line identity must be both invoice-scoped and item-scoped.
ALTER TABLE hft.supplier_invoice_line ADD CONSTRAINT invoice_line_scoped_item_v3
 UNIQUE(id,invoice_id,legal_entity_id,item_code);
ALTER TABLE hft.grn ADD COLUMN invoice_id uuid REFERENCES hft.supplier_invoice(id);
ALTER TABLE hft.grn ADD COLUMN physical_receipt_id text;
ALTER TABLE hft.grn ADD CONSTRAINT grn_invoice_binding_v2
 FOREIGN KEY(invoice_id,legal_entity_id,supplier_id,invoice_key)
 REFERENCES hft.supplier_invoice(id,legal_entity_id,supplier_id,invoice_key);
-- Historical GRNs are blocked above. No fabricated receipt identities or
-- silent rewrites are permitted; new physical receipts must be real identities.
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
-- QA-012 parent/child links: a GRN line cannot impersonate a different legal
-- entity, or bind an invoice line from another invoice or another item.
ALTER TABLE hft.grn ADD CONSTRAINT grn_parent_entity_v3 UNIQUE(id,legal_entity_id);
ALTER TABLE hft.grn ADD CONSTRAINT grn_parent_entity_warehouse_v3 UNIQUE(id,legal_entity_id,warehouse_id);
ALTER TABLE hft.grn ADD CONSTRAINT grn_parent_invoice_v3 UNIQUE(id,legal_entity_id,invoice_id);
ALTER TABLE hft.grn_line ADD COLUMN invoice_line_id uuid REFERENCES hft.supplier_invoice_line(id),
 ADD COLUMN invoice_id uuid;
ALTER TABLE hft.grn_line ADD CONSTRAINT grn_line_scoped_identity_v3
 UNIQUE(grn_id,line_no,legal_entity_id);
ALTER TABLE hft.grn_line ADD CONSTRAINT grn_line_parent_entity_v3
 FOREIGN KEY(grn_id,legal_entity_id) REFERENCES hft.grn(id,legal_entity_id);
ALTER TABLE hft.grn_line ADD CONSTRAINT grn_line_invoice_pair_v3
 CHECK ((invoice_id IS NULL)=(invoice_line_id IS NULL));
ALTER TABLE hft.grn_line ADD CONSTRAINT grn_line_parent_invoice_v3
 FOREIGN KEY(grn_id,legal_entity_id,invoice_id)
 REFERENCES hft.grn(id,legal_entity_id,invoice_id);
ALTER TABLE hft.grn_line ADD CONSTRAINT grn_line_invoice_item_v3
 FOREIGN KEY(invoice_line_id,invoice_id,legal_entity_id,item_code)
 REFERENCES hft.supplier_invoice_line(id,invoice_id,legal_entity_id,item_code);
ALTER TABLE hft.grn_partial_receipt
 ADD COLUMN location_id text, ADD COLUMN legal_entity_id text, ADD COLUMN warehouse_id text,
 ADD COLUMN batch_no text NOT NULL DEFAULT '',
 ADD COLUMN serial_no text NOT NULL DEFAULT '';
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_parent_warehouse_v3
 FOREIGN KEY(grn_id,legal_entity_id,warehouse_id)
 REFERENCES hft.grn(id,legal_entity_id,warehouse_id);
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_parent_line_entity_v3
 FOREIGN KEY(grn_id,line_no,legal_entity_id)
 REFERENCES hft.grn_line(grn_id,line_no,legal_entity_id);
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_scoped_location_v2
 CHECK(legal_entity_id IS NOT NULL AND warehouse_id IS NOT NULL AND location_id IS NOT NULL) NOT VALID;
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_location_fk_v2
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id) NOT VALID;
-- Scope a receipt's identity to legal ownership, warehouse, physical location
-- and lot/serial before it may be referenced by a stock command.
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT receipt_scope_identity_v3
 UNIQUE(id,legal_entity_id,warehouse_id,location_id,batch_no,serial_no);
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
ALTER TABLE hft.stock_command ADD COLUMN site_id text NOT NULL;
ALTER TABLE hft.warehouse ADD CONSTRAINT warehouse_entity_site_identity_v3
 UNIQUE(legal_entity_id,warehouse_id,site_id);
ALTER TABLE hft.stock_command ADD CONSTRAINT stock_command_warehouse_site_v3
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id);
ALTER TABLE hft.stock_command ADD CONSTRAINT stock_command_scoped_item_v3
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code);
ALTER TABLE hft.stock_command ADD CONSTRAINT stock_command_receipt_scope_v3
 FOREIGN KEY(source_receipt_id,legal_entity_id,warehouse_id,location_id,batch_no,serial_no)
 REFERENCES hft.grn_partial_receipt(id,legal_entity_id,warehouse_id,location_id,batch_no,serial_no);
-- New custody accounts must reference a real employee without changing the
-- original noncustody empty-string identity convention.
ALTER TABLE hft.stock_account ADD COLUMN custodian_employee_fk_v3 text
 GENERATED ALWAYS AS(NULLIF(custodian_employee_id,'')) STORED;
ALTER TABLE hft.stock_account ADD CONSTRAINT stock_account_employee_fk_v3
 FOREIGN KEY(legal_entity_id,custodian_employee_fk_v3)
 REFERENCES hft.employee(legal_entity_id,employee_id);

-- The issue document binds permitted item, location, serial/batch and quantity.
ALTER TABLE hft.material_issue ADD CONSTRAINT issue_parent_scope_v3
 UNIQUE(id,legal_entity_id,warehouse_id);
CREATE TABLE hft.material_issue_line (
 issue_id uuid NOT NULL REFERENCES hft.material_issue(id),
 legal_entity_id text NOT NULL,warehouse_id text NOT NULL,
 source_action_key text NOT NULL CHECK(length(trim(source_action_key))>=2),
 item_code text NOT NULL, location_id text NOT NULL,
 batch_no text NOT NULL DEFAULT '', serial_no text NOT NULL DEFAULT '',
 authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 issued_micro bigint NOT NULL DEFAULT 0 CHECK(issued_micro>=0 AND issued_micro<=authorized_micro),
 PRIMARY KEY(issue_id,source_action_key),
 FOREIGN KEY(issue_id,legal_entity_id,warehouse_id)
  REFERENCES hft.material_issue(id,legal_entity_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
  REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
-- The return header repeats immutable parent entity/warehouse attributes and
-- binds them to its originating issue; historical headers are never auto-filled.
ALTER TABLE hft.material_return ADD COLUMN legal_entity_id text NOT NULL,
 ADD COLUMN warehouse_id text NOT NULL;
ALTER TABLE hft.material_return ADD CONSTRAINT return_parent_issue_scope_v3
 FOREIGN KEY(issue_id,legal_entity_id,warehouse_id)
 REFERENCES hft.material_issue(id,legal_entity_id,warehouse_id);
ALTER TABLE hft.material_return ADD CONSTRAINT return_parent_scope_v3
 UNIQUE(id,legal_entity_id,warehouse_id);
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
 FOREIGN KEY(return_id,legal_entity_id,warehouse_id)
  REFERENCES hft.material_return(id,legal_entity_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,original_issue_command_id)
  REFERENCES hft.stock_command(legal_entity_id,command_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
  REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
-- Empty-only preflight ensures no inherited orphan custody. Any historical
-- reconciliation must happen in a different, separately authorized revision.
ALTER TABLE hft.employee_custody ADD COLUMN location_id text;
ALTER TABLE hft.employee_custody ADD CONSTRAINT custody_location_fk_v2
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id);

-- QA-012 transactional checks: typed command source must match exactly one
-- scoped header+line, never only a caller-controlled source_document_id string.
CREATE OR REPLACE FUNCTION hft.enforce_stock_command_parent_v3()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='RECEIVE' THEN
   PERFORM 1 FROM hft.grn_partial_receipt r
     JOIN hft.grn_line gl ON gl.grn_id=r.grn_id AND gl.line_no=r.line_no
     JOIN hft.grn g ON g.id=r.grn_id
     JOIN hft.supplier_invoice_line il ON il.id=gl.invoice_line_id
   WHERE r.id=NEW.source_receipt_id AND r.grn_id::text=NEW.source_document_id
     AND r.line_no=NEW.source_line_no
     AND r.receipt_key||':'||r.line_no::text=NEW.source_action_key
     AND r.legal_entity_id=NEW.legal_entity_id AND r.warehouse_id=NEW.warehouse_id
     AND r.location_id=NEW.location_id AND r.batch_no=NEW.batch_no AND r.serial_no=NEW.serial_no
     AND r.qc_state='ACCEPTED' AND length(trim(r.evidence_reference))>0
     AND g.legal_entity_id=NEW.legal_entity_id AND g.warehouse_id=NEW.warehouse_id
     AND g.invoice_id=gl.invoice_id AND gl.legal_entity_id=NEW.legal_entity_id
     AND il.invoice_id=g.invoice_id AND il.legal_entity_id=NEW.legal_entity_id
     AND gl.item_code=NEW.item_code AND il.item_code=NEW.item_code
   FOR SHARE OF r,gl,g,il;
   IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_COMMAND_GRN_SCOPE_OR_LINE_MISMATCH'; END IF;
 ELSIF NEW.kind='ISSUE' THEN
   PERFORM 1 FROM hft.material_issue i
     JOIN hft.material_issue_line l ON l.issue_id=i.id
   WHERE i.id::text=NEW.source_document_id
     AND i.legal_entity_id=NEW.legal_entity_id AND i.warehouse_id=NEW.warehouse_id
     AND l.legal_entity_id=NEW.legal_entity_id AND l.warehouse_id=NEW.warehouse_id
     AND l.source_action_key=NEW.source_action_key
     AND l.item_code=NEW.item_code AND l.location_id=NEW.location_id
     AND l.batch_no=NEW.batch_no AND l.serial_no=NEW.serial_no
   FOR SHARE OF i,l;
   IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_COMMAND_ISSUE_SCOPE_OR_LINE_MISMATCH'; END IF;
 ELSIF NEW.kind='RETURN' THEN
   PERFORM 1 FROM hft.material_return mr
     JOIN hft.material_issue i ON i.id=mr.issue_id
     JOIN hft.material_return_line l ON l.return_id=mr.id
   WHERE mr.id::text=NEW.source_document_id
     AND mr.legal_entity_id=NEW.legal_entity_id AND mr.warehouse_id=NEW.warehouse_id
     AND i.legal_entity_id=NEW.legal_entity_id AND i.warehouse_id=NEW.warehouse_id
     AND l.legal_entity_id=NEW.legal_entity_id AND l.warehouse_id=NEW.warehouse_id
     AND l.source_action_key=NEW.source_action_key
     AND l.item_code=NEW.item_code AND l.location_id=NEW.location_id
     AND l.batch_no=NEW.batch_no AND l.serial_no=NEW.serial_no
   FOR SHARE OF mr,i,l;
   IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_COMMAND_RETURN_SCOPE_OR_LINE_MISMATCH'; END IF;
 ELSE
   -- OPENING/REVERSAL are not implemented in this isolated adapter and may not
   -- use a generic source string to bypass typed-document governance.
   RAISE EXCEPTION 'UNQUALIFIED_STOCK_COMMAND_KIND';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_command_scoped_parent_v3 BEFORE INSERT ON hft.stock_command
 FOR EACH ROW EXECUTE FUNCTION hft.enforce_stock_command_parent_v3();

-- QA-012: verify that a return line's claimed original ISSUE command belongs
-- to this exact return's parent issue and same item/warehouse/location/lot.
CREATE OR REPLACE FUNCTION hft.enforce_original_issue_line_v3()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin hft.stock_command%ROWTYPE; parent_issue uuid;
BEGIN
 SELECT mr.issue_id INTO parent_issue FROM hft.material_return mr
 WHERE mr.id=NEW.return_id AND mr.legal_entity_id=NEW.legal_entity_id
 AND mr.warehouse_id=NEW.warehouse_id FOR KEY SHARE;
 SELECT * INTO origin FROM hft.stock_command
 WHERE legal_entity_id=NEW.legal_entity_id
   AND command_id=NEW.original_issue_command_id FOR SHARE;
 IF parent_issue IS NULL OR origin.id IS NULL OR origin.kind<>'ISSUE'
   OR origin.source_document_id<>parent_issue::text
   OR origin.warehouse_id<>NEW.warehouse_id OR origin.item_code<>NEW.item_code
   OR origin.location_id<>NEW.location_id OR origin.batch_no<>NEW.batch_no
   OR origin.serial_no<>NEW.serial_no THEN
   RAISE EXCEPTION 'RETURN_ORIGINAL_ISSUE_SCOPE_MISMATCH';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER material_return_line_origin_v3 BEFORE INSERT OR UPDATE ON hft.material_return_line
 FOR EACH ROW EXECUTE FUNCTION hft.enforce_original_issue_line_v3();

-- QA-013: constraints originally marked NOT VALID are validated in the fresh,
-- empty-only candidate. No latent unverified rows are carried forward.
ALTER TABLE hft.grn_partial_receipt VALIDATE CONSTRAINT receipt_scoped_location_v2;
ALTER TABLE hft.grn_partial_receipt VALIDATE CONSTRAINT receipt_location_fk_v2;

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
