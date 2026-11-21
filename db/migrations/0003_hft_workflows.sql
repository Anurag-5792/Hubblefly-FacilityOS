-- Workflow documents are preparation/approval records; no live posting is permitted.
BEGIN;
CREATE TABLE hft.grn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_entity_id text NOT NULL,
  supplier_id text NOT NULL, invoice_key text NOT NULL, invoice_date date NOT NULL,
  warehouse_id text NOT NULL, status text NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','PREPARED','CHECKED','AUTHORIZED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
  prepared_by text, checked_by text, authorized_by text, version bigint NOT NULL DEFAULT 1,
  UNIQUE(legal_entity_id,supplier_id,invoice_key),
  FOREIGN KEY(legal_entity_id,supplier_id) REFERENCES hft.supplier(legal_entity_id,supplier_id),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  CHECK(prepared_by IS NULL OR authorized_by IS NULL OR prepared_by <> authorized_by),
  CHECK(checked_by IS NULL OR authorized_by IS NULL OR checked_by <> authorized_by)
);
CREATE TABLE hft.grn_line (
  grn_id uuid NOT NULL REFERENCES hft.grn(id), line_no integer NOT NULL CHECK(line_no>0),
  legal_entity_id text NOT NULL, item_code text NOT NULL,
  ordered_micro bigint NOT NULL CHECK(ordered_micro>0), accepted_micro bigint NOT NULL DEFAULT 0 CHECK(accepted_micro>=0 AND accepted_micro<=ordered_micro),
  PRIMARY KEY(grn_id,line_no), FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
CREATE TABLE hft.grn_partial_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grn_id uuid NOT NULL REFERENCES hft.grn(id),
  receipt_key text NOT NULL, line_no integer NOT NULL,
  accepted_micro bigint NOT NULL CHECK(accepted_micro>0),
  qc_state text NOT NULL CHECK(qc_state IN ('PENDING','ACCEPTED','REJECTED')),
  evidence_reference text NOT NULL,
  UNIQUE(grn_id,receipt_key,line_no),
  FOREIGN KEY(grn_id,line_no) REFERENCES hft.grn_line(grn_id,line_no)
);
CREATE TABLE hft.material_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_entity_id text NOT NULL, warehouse_id text NOT NULL,
  employee_id text NOT NULL, work_order_id text, purpose text NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','CHECKED','AUTHORIZED','ISSUED','CANCELLED')),
  prepared_by text NOT NULL, approved_by text, version bigint NOT NULL DEFAULT 1,
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id),
  CHECK(approved_by IS NULL OR approved_by <> prepared_by)
);
CREATE TABLE hft.material_return (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issue_id uuid NOT NULL REFERENCES hft.material_issue(id),
  condition text NOT NULL CHECK(condition IN ('PENDING_INSPECTION','GOOD','DAMAGED','QUARANTINE')),
  accepted_by text, status text NOT NULL CHECK(status IN ('DRAFT','INSPECTED','AUTHORIZED','RETURNED','REJECTED')),
  evidence_reference text
);
CREATE TABLE hft.opening_count_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_entity_id text NOT NULL, warehouse_id text NOT NULL,
  stock_epoch text NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','COUNTED','RECONCILED','APPROVED','POSTED','REJECTED')),
  counted_by text, reviewed_by text, approved_by text,
  UNIQUE(legal_entity_id,warehouse_id,stock_epoch),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  CHECK(counted_by IS NULL OR approved_by IS NULL OR counted_by <> approved_by)
);
CREATE TABLE hft.opening_count_line (
  session_id uuid NOT NULL REFERENCES hft.opening_count_session(id), line_no integer NOT NULL,
  item_code text NOT NULL, inventory_state text NOT NULL
    CHECK(inventory_state IN ('LOOSE','INSTALLED_WIP','QUARANTINE','OTHER')),
  location_key text NOT NULL DEFAULT '', serial_key text NOT NULL DEFAULT '', batch_key text NOT NULL DEFAULT '',
  counted_micro bigint NOT NULL CHECK(counted_micro>=0), variance_micro bigint,
  PRIMARY KEY(session_id,line_no)
);
COMMIT;
