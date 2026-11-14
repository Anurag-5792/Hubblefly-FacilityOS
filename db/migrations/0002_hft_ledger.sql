-- HFT-R1 nonproduction ledger schema. No production-authoritative posting mode exists.
BEGIN;
CREATE TABLE hft.stock_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id text NOT NULL, warehouse_id text NOT NULL, item_code text NOT NULL,
  location_key text NOT NULL DEFAULT '', batch_key text NOT NULL DEFAULT '', serial_key text NOT NULL DEFAULT '',
  condition text NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('GOOD','QUARANTINE','DAMAGED')),
  qty_micro bigint NOT NULL DEFAULT 0 CHECK(qty_micro >= 0),
  reserved_micro bigint NOT NULL DEFAULT 0 CHECK(reserved_micro >= 0 AND reserved_micro <= qty_micro),
  version bigint NOT NULL DEFAULT 0 CHECK(version >= 0),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code),
  UNIQUE (legal_entity_id,warehouse_id,item_code,location_key,batch_key,serial_key,condition),
  CHECK (serial_key = '' OR qty_micro IN (0,1000000))
);
-- Unique serial identity across warehouses, conditions and employee custody.
CREATE TABLE hft.serial_registry (
  legal_entity_id text NOT NULL, item_code text NOT NULL, serial_no text NOT NULL,
  warehouse_id text NOT NULL, state text NOT NULL CHECK(state IN ('AVAILABLE','CUSTODY','QUARANTINE','DAMAGED')),
  custodian_employee_id text, version bigint NOT NULL DEFAULT 0 CHECK(version >= 0),
  PRIMARY KEY(legal_entity_id,item_code,serial_no),
  FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  FOREIGN KEY(legal_entity_id,custodian_employee_id) REFERENCES hft.employee(legal_entity_id,employee_id),
  CHECK ((state='CUSTODY') = (custodian_employee_id IS NOT NULL))
);
CREATE TABLE hft.stock_command (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
  command_id text NOT NULL, idempotency_key text NOT NULL, payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK(kind IN ('RECEIVE','ISSUE','RETURN','OPENING','REVERSAL')),
  source_document_id text NOT NULL, source_action_key text NOT NULL,
  posting_mode text NOT NULL DEFAULT 'NONPRODUCTION' CHECK(posting_mode = 'NONPRODUCTION'),
  actor_subject text NOT NULL, approval_id text NOT NULL, approval_revision bigint NOT NULL CHECK(approval_revision>0),
  committed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(legal_entity_id,command_id), UNIQUE(legal_entity_id,idempotency_key),
  UNIQUE(legal_entity_id,source_document_id,source_action_key)
);
CREATE TABLE hft.stock_entry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  command_id uuid NOT NULL REFERENCES hft.stock_command(id),
  account_id uuid REFERENCES hft.stock_account(id),
  bucket text NOT NULL CHECK(bucket IN ('EXTERNAL','AVAILABLE','CUSTODY','QUARANTINE')),
  qty_delta_micro bigint NOT NULL CHECK(qty_delta_micro <> 0),
  employee_id text, serial_no text, batch_no text,
  CHECK (bucket = 'EXTERNAL' OR account_id IS NOT NULL)
);
CREATE INDEX stock_entry_command_idx ON hft.stock_entry(command_id);
CREATE TABLE hft.employee_custody (
  legal_entity_id text NOT NULL, employee_id text NOT NULL, issue_command_id uuid NOT NULL REFERENCES hft.stock_command(id),
  item_code text NOT NULL, warehouse_id text NOT NULL, issued_micro bigint NOT NULL CHECK(issued_micro > 0),
  returned_micro bigint NOT NULL DEFAULT 0 CHECK(returned_micro >= 0 AND returned_micro <= issued_micro),
  serial_no text NOT NULL DEFAULT '', batch_no text NOT NULL DEFAULT '',
  version bigint NOT NULL DEFAULT 0, PRIMARY KEY(legal_entity_id,issue_command_id),
  FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id),
  FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
CREATE UNIQUE INDEX active_serial_custody ON hft.employee_custody(legal_entity_id,item_code,serial_no)
  WHERE serial_no <> '' AND returned_micro < issued_micro;
CREATE TABLE hft.audit_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL UNIQUE REFERENCES hft.stock_command(id),
  canonical_event jsonb NOT NULL, canonical_sha256 text NOT NULL CHECK(canonical_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hft.audit_delivery (
  outbox_id uuid PRIMARY KEY REFERENCES hft.audit_outbox(id),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','DELIVERED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_attempt_at timestamptz, integrity_receipt text
);
CREATE TABLE hft.reversal_link (
  original_command_id uuid NOT NULL REFERENCES hft.stock_command(id),
  reversal_command_id uuid NOT NULL UNIQUE REFERENCES hft.stock_command(id),
  reason text NOT NULL, PRIMARY KEY(original_command_id),
  CHECK(original_command_id <> reversal_command_id)
);
CREATE OR REPLACE FUNCTION hft.deny_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_HFT_FACT'; END $$;
CREATE TRIGGER no_stock_entry_change BEFORE UPDATE OR DELETE ON hft.stock_entry
FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER no_stock_command_change BEFORE UPDATE OR DELETE ON hft.stock_command
FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER no_audit_outbox_change BEFORE UPDATE OR DELETE ON hft.audit_outbox
FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
-- A deferred constraint verifies every posted command is balanced at commit.
CREATE OR REPLACE FUNCTION hft.require_balanced_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM hft.stock_entry WHERE command_id=NEW.command_id) < 2
     OR (SELECT COALESCE(sum(qty_delta_micro),0) FROM hft.stock_entry WHERE command_id=NEW.command_id) <> 0 THEN
    RAISE EXCEPTION 'STOCK_COMMAND_NOT_BALANCED_OR_INCOMPLETE';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_stock_command AFTER INSERT ON hft.stock_entry
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.require_balanced_command();
-- This also covers a command committed without any stock_entry rows.
CREATE OR REPLACE FUNCTION hft.require_command_entries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM hft.stock_entry WHERE command_id=NEW.id) < 2
     OR (SELECT COALESCE(sum(qty_delta_micro),0) FROM hft.stock_entry WHERE command_id=NEW.id) <> 0 THEN
    RAISE EXCEPTION 'STOCK_COMMAND_NOT_BALANCED_OR_INCOMPLETE';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER command_requires_entries AFTER INSERT ON hft.stock_command
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.require_command_entries();
COMMIT;
