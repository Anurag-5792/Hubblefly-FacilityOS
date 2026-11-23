-- HFT-R1 experimental NONPRODUCTION persistence contract.
-- Controlled migration: wraps in transaction; revision checksum inserted by migrator.
BEGIN;
CREATE TABLE hft.actor_warehouse_grant (
  legal_entity_id text NOT NULL,
  site_id text NOT NULL,
  warehouse_id text NOT NULL,
  actor_subject text NOT NULL CHECK(length(trim(actor_subject)) > 0),
  active boolean NOT NULL DEFAULT false,
  may_post boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
  PRIMARY KEY(legal_entity_id,site_id,warehouse_id,actor_subject),
  FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id)
);
CREATE TABLE hft.stock_approval (
  legal_entity_id text NOT NULL,
  site_id text NOT NULL,
  warehouse_id text NOT NULL,
  source_document_id text NOT NULL,
  approval_id text NOT NULL,
  revision bigint NOT NULL CHECK(revision > 0),
  approved boolean NOT NULL DEFAULT false,
  prepared_by text NOT NULL,
  checked_by text NOT NULL,
  approved_by text NOT NULL,
  inspected_condition text CHECK(inspected_condition IN ('GOOD','DAMAGED','QUARANTINE')),
  inspection_evidence_id text,
  PRIMARY KEY(legal_entity_id,site_id,warehouse_id,source_document_id),
  UNIQUE(legal_entity_id,approval_id),
  FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  CHECK(prepared_by <> checked_by AND prepared_by <> approved_by AND checked_by <> approved_by),
  CHECK((inspected_condition IS NULL) = (inspection_evidence_id IS NULL))
);
CREATE TABLE hft.stock_hold (
  legal_entity_id text NOT NULL,
  site_id text NOT NULL,
  warehouse_id text NOT NULL,
  hold_id text NOT NULL,
  item_code text,
  employee_id text,
  source_document_id text,
  active boolean NOT NULL DEFAULT true,
  reason text NOT NULL CHECK(length(trim(reason)) > 0),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
  PRIMARY KEY(legal_entity_id,hold_id),
  FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
  FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id),
  FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code),
  FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
CREATE INDEX stock_hold_active_lookup ON hft.stock_hold(legal_entity_id,site_id,warehouse_id)
 WHERE active=true;
-- Domain gate writes and posting commands must acquire the same transaction advisory lock.
CREATE OR REPLACE FUNCTION hft.lock_posting_gate_for_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec record;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.legal_entity_id,NEW.site_id,NEW.warehouse_id)
    IS DISTINCT FROM (OLD.legal_entity_id,OLD.site_id,OLD.warehouse_id) THEN
    RAISE EXCEPTION 'HFT_GATE_SCOPE_IMMUTABLE';
  END IF;
  IF TG_OP='DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
     'HFT:GATE:' || rec.legal_entity_id || ':' || rec.site_id || ':' || rec.warehouse_id,0));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lock_actor_change BEFORE INSERT OR UPDATE OR DELETE ON hft.actor_warehouse_grant
  FOR EACH ROW EXECUTE FUNCTION hft.lock_posting_gate_for_mutation();
CREATE TRIGGER lock_approval_change BEFORE INSERT OR UPDATE OR DELETE ON hft.stock_approval
  FOR EACH ROW EXECUTE FUNCTION hft.lock_posting_gate_for_mutation();
CREATE TRIGGER lock_hold_change BEFORE INSERT OR UPDATE OR DELETE ON hft.stock_hold
  FOR EACH ROW EXECUTE FUNCTION hft.lock_posting_gate_for_mutation();

CREATE TABLE hft.stock_command_outcome (
  command_id uuid PRIMARY KEY REFERENCES hft.stock_command(id),
  result jsonb NOT NULL,
  committed_by text NOT NULL,
  CHECK(jsonb_typeof(result) = 'object')
);
CREATE TRIGGER no_stock_command_outcome_change BEFORE UPDATE OR DELETE ON hft.stock_command_outcome
  FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
ALTER TABLE hft.audit_outbox ADD COLUMN canonical_text text NOT NULL;
ALTER TABLE hft.audit_outbox ADD CONSTRAINT canonical_text_present CHECK(length(canonical_text)>0);
-- Every durable stock command is required to include outcome and audit facts.
CREATE OR REPLACE FUNCTION hft.require_command_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT count(*) FROM hft.stock_command_outcome WHERE command_id=NEW.id) <> 1
    OR (SELECT count(*) FROM hft.audit_outbox WHERE command_id=NEW.id) <> 1
    OR (SELECT count(*) FROM hft.audit_delivery d JOIN hft.audit_outbox a ON a.id=d.outbox_id WHERE a.command_id=NEW.id) <> 1 THEN
   RAISE EXCEPTION 'STOCK_COMMAND_OUTCOME_OR_AUDIT_MISSING';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER command_requires_completion AFTER INSERT ON hft.stock_command
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft.require_command_completion();
COMMIT;
