-- HFT-R1 Package 1. Forward-only, nonproduction; NO production authority.
-- Requires canonical, checksummed revisions 0001 through 0005.
BEGIN;
-- This revision introduces mandatory quantitative seals. Historical posted
-- commands cannot be silently backfilled from mutable documents/audit text.
DO $preflight$
BEGIN
  IF EXISTS(SELECT 1 FROM hft.stock_command) OR EXISTS(SELECT 1 FROM hft.stock_entry)
     OR EXISTS(SELECT 1 FROM hft.stock_command_outcome)
     OR EXISTS(SELECT 1 FROM hft.audit_outbox) THEN
    RAISE EXCEPTION 'HFT_0006_POSTED_HISTORY_REQUIRES_APPROVED_RECONCILIATION';
  END IF;
  IF EXISTS(SELECT 1 FROM hft.stock_account_reconstruction_v2
            WHERE persisted_micro <> reconstructed_micro) THEN
    RAISE EXCEPTION 'HFT_0006_ACCOUNT_RECONSTRUCTION_FAILED';
  END IF;
  IF EXISTS(SELECT 1 FROM hft.stock_account WHERE qty_micro <> 0 OR reserved_micro <> 0) THEN
    RAISE EXCEPTION 'HFT_0006_NONZERO_LEGACY_ACCOUNT_REQUIRES_APPROVED_CUTOVER';
  END IF;
  IF EXISTS(SELECT 1 FROM hft.invoice_line_receipt_reconstruction_v2
            WHERE received_micro <> reconstructed_received_micro) THEN
    RAISE EXCEPTION 'HFT_0006_INVOICE_RECEIPT_RECONSTRUCTION_FAILED';
  END IF;
END $preflight$;

-- Quantity is the immutable, typed command-level fact against which EACH
-- movement is validated. Partial fragments in Package 2 require new commands.
ALTER TABLE hft.stock_command ADD COLUMN quantity_micro bigint NOT NULL
  CHECK(quantity_micro > 0);

-- A stock-account UUID never changes its legal owner or item/custody identity.
-- Operational balance/reservation/version changes remain subject to the
-- existing per-account reconstruction and future protected-writer controls.
CREATE OR REPLACE FUNCTION hft.deny_stock_account_identity_change_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'STOCK_ACCOUNT_DELETE_REQUIRES_GOVERNED_TRANSFER';
  END IF;
  IF (NEW.id,NEW.legal_entity_id,NEW.warehouse_id,NEW.item_code,
      NEW.location_key,NEW.batch_key,NEW.serial_key,NEW.condition,
      NEW.account_kind,NEW.custodian_employee_id)
     IS DISTINCT FROM
     (OLD.id,OLD.legal_entity_id,OLD.warehouse_id,OLD.item_code,
      OLD.location_key,OLD.batch_key,OLD.serial_key,OLD.condition,
      OLD.account_kind,OLD.custodian_employee_id) THEN
    RAISE EXCEPTION 'STOCK_ACCOUNT_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_stock_account_identity_v1
 BEFORE UPDATE OR DELETE ON hft.stock_account FOR EACH ROW
 EXECUTE FUNCTION hft.deny_stock_account_identity_change_v1();

-- The seal belongs to ONE immutable posting command and may never be edited.
CREATE TABLE hft.stock_command_seal (
  command_id uuid PRIMARY KEY REFERENCES hft.stock_command(id),
  movement_sha256 text NOT NULL CHECK(movement_sha256 ~ '^[0-9a-f]{64}$'),
  audit_sha256 text NOT NULL CHECK(audit_sha256 ~ '^[0-9a-f]{64}$'),
  outcome_sha256 text NOT NULL CHECK(outcome_sha256 ~ '^[0-9a-f]{64}$'),
  quantity_micro bigint NOT NULL CHECK(quantity_micro > 0),
  sealed_by text NOT NULL CHECK(length(trim(sealed_by)) > 0),
  sealed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_stock_command_seal_v1
 BEFORE UPDATE OR DELETE ON hft.stock_command_seal FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();

-- Serialize competing entry append / seal activity on the command row.
-- The seal cannot be bypassed by supplying a session flag.
CREATE OR REPLACE FUNCTION hft.block_postseal_entry_insert_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hft.stock_command WHERE id=NEW.command_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STOCK_ENTRY_COMMAND_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM hft.stock_command_seal WHERE command_id=NEW.command_id) THEN
    RAISE EXCEPTION 'STOCK_COMMAND_MOVEMENTS_SEALED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER block_stock_entry_after_seal_v1 BEFORE INSERT ON hft.stock_entry
 FOR EACH ROW EXECUTE FUNCTION hft.block_postseal_entry_insert_v1();

-- Reconstruct the exact immutable two-leg set, with explicit bucket, sign,
-- quantity, lot/serial and account identity. Zero-sum alone is insufficient.
CREATE OR REPLACE FUNCTION hft.assert_command_seal_v1(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  c hft.stock_command%ROWTYPE;
  s hft.stock_command_seal%ROWTYPE;
  a hft.audit_outbox%ROWTYPE;
  o hft.stock_command_outcome%ROWTYPE;
  target_bucket text;
  debit_bucket text;
  result_count bigint;
  debit_count bigint;
  credit_count bigint;
  receipt_qty bigint;
  reconstructed_digest text;
  audit_digest text;
  outcome_digest text;
  mismatch_count bigint;
BEGIN
  SELECT * INTO c FROM hft.stock_command WHERE id=p_id FOR SHARE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'STOCK_COMMAND_NOT_FOUND_FOR_SEAL'; END IF;
  SELECT * INTO s FROM hft.stock_command_seal WHERE command_id=p_id;
  IF s.command_id IS NULL THEN RAISE EXCEPTION 'UNSEALED_STOCK_COMMAND'; END IF;
  IF c.quantity_micro <= 0 OR s.quantity_micro <> c.quantity_micro
     OR s.sealed_by <> c.actor_subject THEN
    RAISE EXCEPTION 'STOCK_COMMAND_SEAL_IDENTITY_OR_QUANTITY_MISMATCH';
  END IF;

  IF c.kind='RECEIVE' THEN
    debit_bucket:='EXTERNAL'; target_bucket:='AVAILABLE';
    SELECT r.accepted_micro INTO receipt_qty
      FROM hft.grn_partial_receipt r WHERE r.id=c.source_receipt_id FOR SHARE;
    IF receipt_qty IS NULL OR receipt_qty<>c.quantity_micro THEN
      RAISE EXCEPTION 'SEALED_RECEIPT_QUANTITY_MISMATCH';
    END IF;
  ELSIF c.kind='ISSUE' THEN
    debit_bucket:='AVAILABLE'; target_bucket:='CUSTODY';
  ELSIF c.kind='RETURN' THEN
    debit_bucket:='CUSTODY';
    SELECT CASE WHEN mr.condition='GOOD' THEN 'AVAILABLE'
                WHEN mr.condition='DAMAGED' THEN 'DAMAGED'
                WHEN mr.condition='QUARANTINE' THEN 'QUARANTINE'
                ELSE NULL END INTO target_bucket
      FROM hft.material_return mr WHERE mr.id::text=c.source_document_id FOR SHARE;
    IF target_bucket IS NULL THEN RAISE EXCEPTION 'SEALED_RETURN_CONDITION_INVALID'; END IF;
  ELSE
    RAISE EXCEPTION 'UNQUALIFIED_STOCK_COMMAND_KIND_FOR_SEAL';
  END IF;

  SELECT count(*),
         count(*) FILTER(WHERE e.bucket=debit_bucket AND e.qty_delta_micro=-c.quantity_micro),
         count(*) FILTER(WHERE e.bucket=target_bucket AND e.qty_delta_micro=c.quantity_micro)
    INTO result_count,debit_count,credit_count
    FROM hft.stock_entry e WHERE e.command_id=c.id;
  IF result_count<>2 OR debit_count<>1 OR credit_count<>1 THEN
    RAISE EXCEPTION 'POSTED_MOVEMENT_SHAPE_OR_AMOUNT_INVALID';
  END IF;

  -- Recheck attribution even when accounts existed before this command.
  SELECT count(*) INTO mismatch_count
  FROM hft.stock_entry e LEFT JOIN hft.stock_account acct ON acct.id=e.account_id
  WHERE e.command_id=c.id AND (
    (e.bucket='EXTERNAL' AND e.account_id IS NOT NULL) OR
    (e.bucket<>'EXTERNAL' AND (
      acct.id IS NULL OR acct.account_kind<>e.bucket OR
      acct.legal_entity_id<>c.legal_entity_id OR acct.warehouse_id<>c.warehouse_id OR
      acct.item_code<>c.item_code OR acct.location_key<>c.location_id OR
      acct.batch_key<>c.batch_no OR acct.serial_key<>c.serial_no OR
      (e.bucket='CUSTODY' AND acct.custodian_employee_id<>COALESCE(e.employee_id,'')))) OR
    COALESCE(e.batch_no,'')<>c.batch_no OR COALESCE(e.serial_no,'')<>c.serial_no OR
    (c.kind IN ('ISSUE','RETURN') AND COALESCE(e.employee_id,'')='')
  );
  IF mismatch_count<>0 THEN RAISE EXCEPTION 'POSTED_MOVEMENT_ACCOUNT_ATTRIBUTION_INVALID'; END IF;

  -- The canonical digest uses immutable entry PKs in insertion order.
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
    e.id::text||'/'||e.bucket||'/'||COALESCE(e.account_id::text,'-')||'/'||
    e.qty_delta_micro::text||'/'||COALESCE(e.employee_id,'')||'/'||
    COALESCE(e.batch_no,'')||'/'||COALESCE(e.serial_no,''),
    E'\n' ORDER BY e.id),'') ,'UTF8')),'hex')
  INTO reconstructed_digest FROM hft.stock_entry e WHERE e.command_id=c.id;
  IF s.movement_sha256<>reconstructed_digest THEN
    RAISE EXCEPTION 'POSTED_MOVEMENT_SEAL_DIGEST_MISMATCH';
  END IF;

  SELECT * INTO a FROM hft.audit_outbox WHERE command_id=c.id;
  SELECT * INTO o FROM hft.stock_command_outcome WHERE command_id=c.id;
  IF a.id IS NULL OR o.command_id IS NULL THEN
    RAISE EXCEPTION 'POSTED_OUTCOME_OR_AUDIT_MISSING';
  END IF;
  audit_digest:=encode(sha256(convert_to(a.canonical_text,'UTF8')),'hex');
  outcome_digest:=encode(sha256(convert_to(o.result::text,'UTF8')),'hex');
  IF a.canonical_sha256<>audit_digest OR s.audit_sha256<>audit_digest OR
     s.outcome_sha256<>outcome_digest OR
     a.canonical_text::jsonb<>a.canonical_event OR
     (a.canonical_event->>'commandId') IS DISTINCT FROM c.command_id OR
     (a.canonical_event->>'actor') IS DISTINCT FROM c.actor_subject OR
     (a.canonical_event->>'approvalId') IS DISTINCT FROM c.approval_id OR
     a.canonical_event->'fact' IS DISTINCT FROM o.result->'fact' OR
     (a.canonical_event->>'entity') IS DISTINCT FROM c.legal_entity_id OR
     (a.canonical_event->>'approvalRevision')::bigint IS DISTINCT FROM c.approval_revision OR
     (o.result->>'commandId') IS DISTINCT FROM c.command_id THEN
    RAISE EXCEPTION 'POSTED_SEAL_AUDIT_OR_OUTCOME_MISMATCH';
  END IF;
  IF jsonb_typeof(o.result->'fact'->'movements')<>'array'
    OR jsonb_array_length(o.result->'fact'->'movements')<>2 THEN
    RAISE EXCEPTION 'POSTED_OUTCOME_MOVEMENT_SET_MISMATCH';
  END IF;
  -- Every outcome movement must map to a uniquely typed database leg.
  SELECT count(*) INTO mismatch_count
  FROM jsonb_array_elements(o.result->'fact'->'movements') m
  WHERE (m->>'delta') !~ '^-?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
    OR NOT EXISTS(
      SELECT 1 FROM hft.stock_entry e WHERE e.command_id=c.id
        AND e.bucket=m->>'bucket'
        AND e.qty_delta_micro=(m->>'delta')::numeric*1000000
    );
  IF mismatch_count<>0 THEN RAISE EXCEPTION 'POSTED_OUTCOME_MOVEMENT_AMOUNTS_MISMATCH'; END IF;
END $$;

-- The current function is SECURITY INVOKER, NOT a trusted runtime posting API.
-- Package 2 must restrict its EXECUTE privilege and invoke it only from the
-- single protected writer after authorization; no caller-controlled seal flag.
-- The future protected writer must own authorization and invoke
-- this function after inserting entries, outcome, and audit in one transaction.
CREATE OR REPLACE FUNCTION hft.seal_stock_command_v1(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  c hft.stock_command%ROWTYPE;
  movement_digest text;
  audit_digest text;
  outcome_digest text;
BEGIN
  SELECT * INTO c FROM hft.stock_command WHERE id=p_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'STOCK_COMMAND_NOT_FOUND_FOR_SEAL'; END IF;
  IF EXISTS (SELECT 1 FROM hft.stock_command_seal WHERE command_id=p_id) THEN
    RAISE EXCEPTION 'STOCK_COMMAND_ALREADY_SEALED';
  END IF;
  SELECT encode(sha256(convert_to(COALESCE(string_agg(
    e.id::text||'/'||e.bucket||'/'||COALESCE(e.account_id::text,'-')||'/'||
    e.qty_delta_micro::text||'/'||COALESCE(e.employee_id,'')||'/'||
    COALESCE(e.batch_no,'')||'/'||COALESCE(e.serial_no,''),
    E'\n' ORDER BY e.id),'') ,'UTF8')),'hex')
  INTO movement_digest FROM hft.stock_entry e WHERE e.command_id=p_id;
  SELECT canonical_sha256 INTO audit_digest FROM hft.audit_outbox WHERE command_id=p_id;
  SELECT encode(sha256(convert_to(result::text,'UTF8')),'hex') INTO outcome_digest
    FROM hft.stock_command_outcome WHERE command_id=p_id;
  IF audit_digest IS NULL OR outcome_digest IS NULL THEN
    RAISE EXCEPTION 'SEAL_REQUIRES_OUTCOME_AND_AUDIT';
  END IF;
  INSERT INTO hft.stock_command_seal(command_id,movement_sha256,audit_sha256,
         outcome_sha256,quantity_micro,sealed_by)
  VALUES(p_id,movement_digest,audit_digest,outcome_digest,c.quantity_micro,c.actor_subject);
  PERFORM hft.assert_command_seal_v1(p_id);
END $$;

-- A command cannot commit without its immutable movement seal. The deferred
-- check also runs after all other same-transaction entries/outcomes are present.
CREATE OR REPLACE FUNCTION hft.require_stock_command_seal_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM hft.assert_command_seal_v1(NEW.id);
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_command_requires_seal_v1
 AFTER INSERT ON hft.stock_command DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.require_stock_command_seal_v1();

-- Freeze posted physical receipts, including source/line, QC and evidence.
-- Unposted receipts may still be edited by the separately governed workflow.
CREATE OR REPLACE FUNCTION hft.deny_posted_receipt_mutation_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hft.stock_command WHERE source_receipt_id=OLD.id FOR SHARE;
  IF FOUND THEN RAISE EXCEPTION 'POSTED_RECEIPT_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posted_receipt_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.grn_partial_receipt FOR EACH ROW
 EXECUTE FUNCTION hft.deny_posted_receipt_mutation_v1();

-- Freeze referenced GRN line source identity, but not legitimate accepted
-- quantity counters advanced by a different approved physical receipt.
CREATE OR REPLACE FUNCTION hft.deny_posted_grn_line_rewrite_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hft.stock_command c JOIN hft.grn_partial_receipt r
    ON r.id=c.source_receipt_id
    WHERE r.grn_id=OLD.grn_id AND r.line_no=OLD.line_no FOR SHARE OF c,r;
  IF FOUND THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'POSTED_GRN_LINE_IDENTITY_IMMUTABLE'; END IF;
    IF (NEW.grn_id,NEW.line_no,NEW.legal_entity_id,NEW.item_code,
        NEW.ordered_micro,NEW.invoice_id,NEW.invoice_line_id)
       IS DISTINCT FROM
       (OLD.grn_id,OLD.line_no,OLD.legal_entity_id,OLD.item_code,
        OLD.ordered_micro,OLD.invoice_id,OLD.invoice_line_id) THEN
      RAISE EXCEPTION 'POSTED_GRN_LINE_IDENTITY_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posted_grn_line_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.grn_line FOR EACH ROW
 EXECUTE FUNCTION hft.deny_posted_grn_line_rewrite_v1();

CREATE OR REPLACE FUNCTION hft.deny_posted_grn_header_rewrite_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hft.stock_command c JOIN hft.grn_partial_receipt r ON r.id=c.source_receipt_id
   WHERE r.grn_id=OLD.id FOR SHARE OF c,r;
  IF FOUND THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'POSTED_GRN_HEADER_IDENTITY_IMMUTABLE'; END IF;
    IF (NEW.id,NEW.legal_entity_id,NEW.supplier_id,NEW.invoice_key,
        NEW.invoice_date,NEW.warehouse_id,NEW.invoice_id,
        NEW.physical_receipt_id,NEW.authorized_by)
       IS DISTINCT FROM
       (OLD.id,OLD.legal_entity_id,OLD.supplier_id,OLD.invoice_key,
        OLD.invoice_date,OLD.warehouse_id,OLD.invoice_id,
        OLD.physical_receipt_id,OLD.authorized_by) THEN
      RAISE EXCEPTION 'POSTED_GRN_HEADER_IDENTITY_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posted_grn_header_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.grn FOR EACH ROW
 EXECUTE FUNCTION hft.deny_posted_grn_header_rewrite_v1();

-- Supplier/invoice identities cannot be replaced after stock has been received.
CREATE OR REPLACE FUNCTION hft.deny_posted_invoice_line_rewrite_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hft.stock_command c JOIN hft.grn_partial_receipt r ON r.id=c.source_receipt_id
    JOIN hft.grn_line l ON l.grn_id=r.grn_id AND l.line_no=r.line_no
   WHERE l.invoice_line_id=OLD.id FOR SHARE OF c,r,l;
  IF FOUND THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'POSTED_INVOICE_LINE_IDENTITY_IMMUTABLE'; END IF;
    IF (NEW.id,NEW.invoice_id,NEW.legal_entity_id,NEW.line_no,NEW.item_code,
        NEW.authorized_micro)
       IS DISTINCT FROM
       (OLD.id,OLD.invoice_id,OLD.legal_entity_id,OLD.line_no,OLD.item_code,
        OLD.authorized_micro) THEN
      RAISE EXCEPTION 'POSTED_INVOICE_LINE_IDENTITY_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posted_invoice_line_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.supplier_invoice_line FOR EACH ROW
 EXECUTE FUNCTION hft.deny_posted_invoice_line_rewrite_v1();

CREATE OR REPLACE FUNCTION hft.deny_posted_invoice_header_rewrite_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM hft.stock_command c JOIN hft.grn_partial_receipt r ON r.id=c.source_receipt_id
    JOIN hft.grn g ON g.id=r.grn_id
   WHERE g.invoice_id=OLD.id FOR SHARE OF c,r,g;
  IF FOUND THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'POSTED_INVOICE_HEADER_IDENTITY_IMMUTABLE'; END IF;
    IF (NEW.id,NEW.legal_entity_id,NEW.supplier_id,NEW.invoice_key,NEW.invoice_date)
       IS DISTINCT FROM
       (OLD.id,OLD.legal_entity_id,OLD.supplier_id,OLD.invoice_key,OLD.invoice_date) THEN
      RAISE EXCEPTION 'POSTED_INVOICE_HEADER_IDENTITY_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posted_invoice_header_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.supplier_invoice FOR EACH ROW
 EXECUTE FUNCTION hft.deny_posted_invoice_header_rewrite_v1();

-- Independent read-only attribution failure view (not merely balance sums).
CREATE VIEW hft.stock_entry_attribution_errors_v1 AS
SELECT e.id AS entry_id,c.command_id,c.legal_entity_id,c.warehouse_id,
       c.item_code,c.location_id,c.batch_no,c.serial_no,e.bucket,e.account_id,
       a.account_kind,a.custodian_employee_id
FROM hft.stock_entry e JOIN hft.stock_command c ON c.id=e.command_id
LEFT JOIN hft.stock_account a ON a.id=e.account_id
WHERE (e.bucket='EXTERNAL' AND e.account_id IS NOT NULL)
   OR (e.bucket<>'EXTERNAL' AND (
         a.id IS NULL OR a.account_kind<>e.bucket OR
         a.legal_entity_id<>c.legal_entity_id OR a.warehouse_id<>c.warehouse_id OR
         a.item_code<>c.item_code OR a.location_key<>c.location_id OR
         a.batch_key<>c.batch_no OR a.serial_key<>c.serial_no OR
         (e.bucket='CUSTODY' AND a.custodian_employee_id<>COALESCE(e.employee_id,''))))
   OR COALESCE(e.batch_no,'')<>c.batch_no OR COALESCE(e.serial_no,'')<>c.serial_no;

CREATE VIEW hft.stock_command_seal_reconstruction_v1 AS
SELECT c.command_id,c.id AS command_uuid,c.legal_entity_id,c.kind,c.quantity_micro,
       s.movement_sha256 AS sealed_movement_sha256,
       x.movement_sha256 AS reconstructed_movement_sha256,
       (s.command_id IS NULL) AS seal_missing,
       (s.movement_sha256 IS DISTINCT FROM x.movement_sha256) AS seal_mismatch,
       x.leg_count,x.net_micro
FROM hft.stock_command c LEFT JOIN hft.stock_command_seal s ON s.command_id=c.id
LEFT JOIN LATERAL (
 SELECT count(*) AS leg_count, COALESCE(sum(e.qty_delta_micro),0) AS net_micro,
        encode(sha256(convert_to(COALESCE(string_agg(
          e.id::text||'/'||e.bucket||'/'||COALESCE(e.account_id::text,'-')||'/'||
          e.qty_delta_micro::text||'/'||COALESCE(e.employee_id,'')||'/'||
          COALESCE(e.batch_no,'')||'/'||COALESCE(e.serial_no,''),
          E'\n' ORDER BY e.id),'') ,'UTF8')),'hex') AS movement_sha256
 FROM hft.stock_entry e WHERE e.command_id=c.id
) x ON true;
COMMIT;
