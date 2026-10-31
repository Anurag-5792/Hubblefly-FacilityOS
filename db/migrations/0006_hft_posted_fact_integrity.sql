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
  -- Captured while AVAILABLE account is locked during the posting transaction.
  -- These are historic post-command values; later transactions may change
  -- today's balance/version without invalidating this immutable seal.
  available_account_id uuid NOT NULL REFERENCES hft.stock_account(id),
  available_after_micro bigint NOT NULL CHECK(available_after_micro>=0),
  available_after_version bigint NOT NULL CHECK(available_after_version>=0),
  employee_id text NOT NULL DEFAULT '',
  original_issue_command_id text NOT NULL DEFAULT '',
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

-- Match the application's formatSignedQuantity exact fixed-point formatting.
-- Numeric absolute values prevent overflow for a theoretical minimum BIGINT.
CREATE OR REPLACE FUNCTION hft.format_signed_micro_v2(p_micro bigint)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $format$
  SELECT (CASE WHEN p_micro<0 THEN '-' ELSE '' END) ||
    trunc(abs(p_micro::numeric)/1000000)::text ||
    CASE WHEN mod(abs(p_micro::numeric),1000000)=0 THEN ''
         ELSE '.'||rtrim(lpad(mod(abs(p_micro::numeric),1000000)::bigint::text,6,'0'),'0') END
$format$;

-- Locking belongs ONLY in posting and deferred COMMIT paths.
-- The read-only assertion below must remain safe for REPEATABLE READ READ ONLY.
CREATE OR REPLACE FUNCTION hft.lock_seal_posting_dependencies_v2(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE c hft.stock_command%ROWTYPE;
BEGIN
 SELECT * INTO c FROM hft.stock_command WHERE id=p_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'STOCK_COMMAND_NOT_FOUND_FOR_SEAL'; END IF;
 IF c.kind='RECEIVE' THEN
   PERFORM 1 FROM hft.grn_partial_receipt WHERE id=c.source_receipt_id FOR SHARE;
 ELSIF c.kind='RETURN' THEN
   PERFORM 1 FROM hft.material_return WHERE id::text=c.source_document_id FOR SHARE;
 END IF;
 PERFORM 1 FROM hft.stock_account a
 WHERE a.legal_entity_id=c.legal_entity_id AND a.warehouse_id=c.warehouse_id
   AND a.location_key=c.location_id AND a.item_code=c.item_code
   AND a.batch_key=c.batch_no AND a.serial_key=c.serial_no
   AND a.account_kind='AVAILABLE' AND a.condition='GOOD'
   AND a.custodian_employee_id='' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AVAILABLE_ACCOUNT_REQUIRED_FOR_SEAL'; END IF;
 PERFORM 1 FROM hft.audit_outbox WHERE command_id=p_id FOR SHARE;
 PERFORM 1 FROM hft.stock_command_outcome WHERE command_id=p_id FOR SHARE;
END $$;

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
  available_identity hft.stock_account%ROWTYPE;
BEGIN
  SELECT * INTO c FROM hft.stock_command WHERE id=p_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'STOCK_COMMAND_NOT_FOUND_FOR_SEAL'; END IF;
  SELECT * INTO s FROM hft.stock_command_seal WHERE command_id=p_id;
  IF s.command_id IS NULL THEN RAISE EXCEPTION 'UNSEALED_STOCK_COMMAND'; END IF;
  IF c.quantity_micro <= 0 OR s.quantity_micro <> c.quantity_micro
     OR s.sealed_by <> c.actor_subject THEN
    RAISE EXCEPTION 'STOCK_COMMAND_SEAL_IDENTITY_OR_QUANTITY_MISMATCH';
  END IF;
  SELECT * INTO available_identity FROM hft.stock_account
    WHERE id=s.available_account_id;
  IF available_identity.id IS NULL
      OR available_identity.account_kind<>'AVAILABLE'
      OR available_identity.condition<>'GOOD'
      OR available_identity.custodian_employee_id<>''
      OR available_identity.legal_entity_id<>c.legal_entity_id
      OR available_identity.warehouse_id<>c.warehouse_id
      OR available_identity.item_code<>c.item_code
      OR available_identity.location_key<>c.location_id
      OR available_identity.batch_key<>c.batch_no
      OR available_identity.serial_key<>c.serial_no THEN
    RAISE EXCEPTION 'SEALED_AVAILABLE_ACCOUNT_ATTRIBUTION_INVALID';
  END IF;

  IF c.kind='RECEIVE' THEN
    debit_bucket:='EXTERNAL'; target_bucket:='AVAILABLE';
    SELECT r.accepted_micro INTO receipt_qty
      FROM hft.grn_partial_receipt r WHERE r.id=c.source_receipt_id;
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
      FROM hft.material_return mr WHERE mr.id::text=c.source_document_id;
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
    COALESCE(e.employee_id,'')<>s.employee_id
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
     (o.result->>'commandId') IS DISTINCT FROM c.command_id OR
     (a.canonical_event->>'schema') IS DISTINCT FROM 'HFT_STOCK_EVENT_V2' OR
     (a.canonical_event->>'available') IS DISTINCT FROM (o.result->>'available') OR
     (a.canonical_event->'accountVersion') IS DISTINCT FROM (o.result->'accountVersion') OR
     o.committed_by IS DISTINCT FROM c.actor_subject OR
     (o.result->'replay') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'POSTED_SEAL_AUDIT_OR_OUTCOME_MISMATCH';
  END IF;
  -- Post-state is sealed at the time of each command, never inferred from
  -- today's account balance (which later commands legitimately change).
  IF (o.result->>'available') IS DISTINCT FROM
       hft.format_signed_micro_v2(s.available_after_micro)
     OR jsonb_typeof(o.result->'accountVersion') IS DISTINCT FROM 'number'
     OR (o.result->'accountVersion')::text IS DISTINCT FROM
       s.available_after_version::text THEN
    RAISE EXCEPTION 'POSTED_OUTCOME_HISTORICAL_BALANCE_OR_VERSION_MISMATCH';
  END IF;
  -- Audit equality alone is not authoritative: each fact identity must agree
  -- with immutable command/source and the captured employee-custody identity.
  IF (o.result->'fact'->>'commandId') IS DISTINCT FROM c.command_id
     OR (o.result->'fact'->>'kind') IS DISTINCT FROM c.kind
     OR (o.result->'fact'->>'sourceDocumentId') IS DISTINCT FROM c.source_document_id
     OR (o.result->'fact'->>'operatorId') IS DISTINCT FROM c.actor_subject
     OR (o.result->'fact'->>'entityId') IS DISTINCT FROM c.legal_entity_id
     OR (o.result->'fact'->>'warehouseId') IS DISTINCT FROM c.warehouse_id
     OR (o.result->'fact'->>'itemCode') IS DISTINCT FROM c.item_code
     OR (o.result->'fact'->>'locationId') IS DISTINCT FROM c.location_id
     OR (o.result->'fact'->>'employeeId') IS DISTINCT FROM NULLIF(s.employee_id,'')
     OR (o.result->'fact'->>'issueId') IS DISTINCT FROM
        NULLIF(s.original_issue_command_id,'') THEN
    RAISE EXCEPTION 'POSTED_OUTCOME_SOURCE_ACTOR_OR_SCOPE_MISMATCH';
  END IF;
  IF jsonb_typeof(o.result->'fact'->'movements')<>'array'
    OR jsonb_array_length(o.result->'fact'->'movements')<>2 THEN
    RAISE EXCEPTION 'POSTED_OUTCOME_MOVEMENT_SET_MISMATCH';
  END IF;
  -- A strict bijection: ordinal position of immutable ledger PKs binds
  -- EXACTLY ONE outcome movement to EXACTLY ONE entry. Two repeated debit
  -- movements cannot both match the same debit entry.
  WITH ledger AS (
    SELECT e.bucket,e.qty_delta_micro,
           row_number() OVER (ORDER BY e.id) AS leg_ordinal
    FROM hft.stock_entry e WHERE e.command_id=c.id
  ), outcome_legs AS (
    SELECT m.movement,m.leg_ordinal
    FROM jsonb_array_elements(o.result->'fact'->'movements')
      WITH ORDINALITY AS m(movement,leg_ordinal)
  )
  SELECT count(*) INTO mismatch_count
    FROM ledger l FULL JOIN outcome_legs m USING(leg_ordinal)
   WHERE l.leg_ordinal IS NULL OR m.leg_ordinal IS NULL
      OR jsonb_typeof(m.movement) IS DISTINCT FROM 'object'
      OR (m.movement->>'bucket') IS DISTINCT FROM l.bucket
      OR (m.movement->>'delta') IS DISTINCT FROM
         hft.format_signed_micro_v2(l.qty_delta_micro)
      OR (SELECT count(*) FROM jsonb_object_keys(m.movement))<>2;
  IF mismatch_count<>0 THEN
    RAISE EXCEPTION 'POSTED_OUTCOME_MOVEMENT_BIJECTION_FAILED';
  END IF;
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
  available_now hft.stock_account%ROWTYPE;
  holder_id text := '';
  origin_issue_id text := '';
BEGIN
  PERFORM hft.lock_seal_posting_dependencies_v2(p_id);
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
  SELECT * INTO available_now FROM hft.stock_account
   WHERE legal_entity_id=c.legal_entity_id AND warehouse_id=c.warehouse_id
     AND item_code=c.item_code AND location_key=c.location_id
     AND batch_key=c.batch_no AND serial_key=c.serial_no
     AND account_kind='AVAILABLE' AND condition='GOOD' AND custodian_employee_id=''
   FOR SHARE;
  IF available_now.id IS NULL THEN RAISE EXCEPTION 'SEAL_AVAILABLE_ACCOUNT_MISSING'; END IF;
  IF c.kind='ISSUE' THEN
    SELECT mi.employee_id INTO holder_id FROM hft.material_issue mi
     WHERE mi.id::text=c.source_document_id AND mi.legal_entity_id=c.legal_entity_id
       AND mi.warehouse_id=c.warehouse_id FOR SHARE;
  ELSIF c.kind='RETURN' THEN
    SELECT mi.employee_id,l.original_issue_command_id INTO holder_id,origin_issue_id
     FROM hft.material_return mr
     JOIN hft.material_issue mi ON mi.id=mr.issue_id
     JOIN hft.material_return_line l ON l.return_id=mr.id
     WHERE mr.id::text=c.source_document_id
       AND mr.legal_entity_id=c.legal_entity_id
       AND mr.warehouse_id=c.warehouse_id
       AND l.source_action_key=c.source_action_key
       AND l.legal_entity_id=c.legal_entity_id
       AND l.warehouse_id=c.warehouse_id FOR SHARE OF mr,mi,l;
  END IF;
  IF c.kind IN ('ISSUE','RETURN') AND
     (holder_id IS NULL OR holder_id='' OR
      (c.kind='RETURN' AND (origin_issue_id IS NULL OR origin_issue_id=''))) THEN
    RAISE EXCEPTION 'SEAL_EMPLOYEE_OR_ORIGINAL_ISSUE_MISSING';
  END IF;
  INSERT INTO hft.stock_command_seal(command_id,movement_sha256,audit_sha256,
         outcome_sha256,quantity_micro,available_account_id,available_after_micro,
         available_after_version,employee_id,original_issue_command_id,sealed_by)
  VALUES(p_id,movement_digest,audit_digest,outcome_digest,c.quantity_micro,
         available_now.id,available_now.qty_micro,available_now.version,
         holder_id,origin_issue_id,c.actor_subject);
  PERFORM hft.assert_command_seal_v1(p_id);
END $$;

-- A command cannot commit without its immutable movement seal. The deferred
-- check also runs after all other same-transaction entries/outcomes are present.
CREATE OR REPLACE FUNCTION hft.require_stock_command_seal_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM hft.lock_seal_posting_dependencies_v2(NEW.id);
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

-- H5: every GRN accepted counter is reconstructed from uniquely committed,
-- typed physical receipt commands, not from operator-updated source counters.
-- The existing unique receipt key and posting row lock serialize duplicates.
CREATE OR REPLACE FUNCTION hft.assert_grn_receipt_cumulative_v2(p_grn uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE g hft.grn%ROWTYPE;
  li record;
  posted_total numeric := 0;
  ordered_total numeric := 0;
  line_total bigint := 0;
BEGIN
 SELECT * INTO g FROM hft.grn WHERE id=p_grn;
 IF g.id IS NULL THEN RETURN; END IF;
 FOR li IN
   SELECT gl.line_no,gl.accepted_micro,gl.ordered_micro,
     COALESCE(SUM(c.quantity_micro),0)::numeric AS posted_micro,
     COUNT(c.id) AS posted_count
   FROM hft.grn_line gl LEFT JOIN hft.grn_partial_receipt r
      ON r.grn_id=gl.grn_id AND r.line_no=gl.line_no
     LEFT JOIN hft.stock_command c ON c.source_receipt_id=r.id
   WHERE gl.grn_id=p_grn
   GROUP BY gl.grn_id,gl.line_no,gl.accepted_micro,gl.ordered_micro
 LOOP
   IF li.accepted_micro::numeric<>li.posted_micro OR
      li.posted_micro>li.ordered_micro THEN
      RAISE EXCEPTION 'GRN_ACCEPTED_QTY_NOT_BACKED_BY_POSTED_RECEIPTS';
   END IF;
   line_total:=line_total+1;
   posted_total:=posted_total+li.posted_micro;
   ordered_total:=ordered_total+li.ordered_micro;
 END LOOP;
 -- Each posted physical receipt must still be authorized, identified,
 -- QC-accepted, supported by exact evidence and match its immutable quantity.
 IF EXISTS (
   SELECT 1 FROM hft.grn_partial_receipt r
     JOIN hft.stock_command c ON c.source_receipt_id=r.id
     WHERE r.grn_id=p_grn AND (
       c.kind<>'RECEIVE' OR c.source_document_id<>p_grn::text
       OR c.source_line_no<>r.line_no
       OR c.quantity_micro<>r.accepted_micro
       OR r.qc_state<>'ACCEPTED' OR length(trim(r.evidence_reference))=0
       OR g.authorized_by IS NULL
     )
 ) THEN RAISE EXCEPTION 'GRN_POSTED_RECEIPT_AUTHORIZATION_OR_QC_INVALID'; END IF;
 -- Only zero-receipt source documents may remain in pre-receipt states.
 IF (posted_total=0 AND g.status IN ('RECEIVED','PARTIALLY_RECEIVED')) OR
    (posted_total>0 AND (line_total=0 OR
      (posted_total=ordered_total AND g.status<>'RECEIVED') OR
      (posted_total<ordered_total AND g.status<>'PARTIALLY_RECEIVED'))) THEN
    RAISE EXCEPTION 'GRN_STATUS_NOT_BACKED_BY_CUMULATIVE_RECEIPTS';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION hft.enforce_grn_cumulative_trigger_v2()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_grn uuid;
BEGIN
 IF TG_TABLE_NAME='grn_line' THEN
   target_grn:=CASE WHEN TG_OP='DELETE' THEN OLD.grn_id ELSE NEW.grn_id END;
 ELSIF TG_TABLE_NAME='grn_partial_receipt' THEN
   target_grn:=CASE WHEN TG_OP='DELETE' THEN OLD.grn_id ELSE NEW.grn_id END;
 ELSIF TG_TABLE_NAME='stock_command' THEN
   IF NEW.kind<>'RECEIVE' THEN RETURN NULL; END IF;
   SELECT grn_id INTO target_grn FROM hft.grn_partial_receipt
     WHERE id=NEW.source_receipt_id;
 ELSE
   target_grn:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 END IF;
 IF target_grn IS NOT NULL THEN
   PERFORM hft.assert_grn_receipt_cumulative_v2(target_grn);
 END IF;
 RETURN NULL;
END $$;
-- Deferred checks run after all legitimate posting counter/status mutations.
-- Ordinary DML alone cannot inflate accepted quantity at COMMIT.
CREATE CONSTRAINT TRIGGER grn_line_requires_posted_receipts_v2
 AFTER INSERT OR UPDATE OR DELETE ON hft.grn_line DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.enforce_grn_cumulative_trigger_v2();
CREATE CONSTRAINT TRIGGER grn_header_requires_posted_receipts_v2
 AFTER INSERT OR UPDATE ON hft.grn DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.enforce_grn_cumulative_trigger_v2();
CREATE CONSTRAINT TRIGGER physical_receipt_requires_posting_consistency_v2
 AFTER INSERT OR UPDATE OR DELETE ON hft.grn_partial_receipt
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION hft.enforce_grn_cumulative_trigger_v2();
CREATE CONSTRAINT TRIGGER stock_command_receipt_counter_v2
 AFTER INSERT ON hft.stock_command DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.enforce_grn_cumulative_trigger_v2();

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
