-- HFT-R1-P1. Read-only independent verification after canonical 0001-0006.
-- SOURCE ONLY: NOT RUN. Only on separately approved disposable PG15+.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $guard$
BEGIN
  IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$' OR
     NOT EXISTS (SELECT 1 FROM hft.schema_revision WHERE version=6) THEN
    RAISE EXCEPTION 'HFT_P1_APPROVED_DISPOSABLE_CANONICAL_0006_REQUIRED';
  END IF;
END $guard$;

-- Materialized balances versus legally-owned immutable account ledger.
SELECT legal_entity_id,warehouse_id,location_key,item_code,batch_key,serial_key,
       account_kind,condition,custodian_employee_id,account_id,
       persisted_micro,reconstructed_micro,persisted_micro-reconstructed_micro AS difference_micro
FROM hft.stock_account_reconstruction_v2
ORDER BY legal_entity_id,warehouse_id,location_key,item_code,batch_key,serial_key,
         account_kind,custodian_employee_id;

-- Append-only commands must be exact, immutable 2-leg sets, with validated
-- typed source, quantity, accounting signs and audit/outcome identity.
-- This function performs SELECT only: safe in REPEATABLE READ READ ONLY.
SELECT hft.assert_command_seal_v1(id) FROM hft.stock_command ORDER BY committed_at,id;
SELECT hft.assert_grn_receipt_cumulative_v2(id) FROM hft.grn ORDER BY id;
SELECT command_id,kind,quantity_micro,leg_count,net_micro,
       seal_missing,seal_mismatch,sealed_movement_sha256,reconstructed_movement_sha256
FROM hft.stock_command_seal_reconstruction_v1 ORDER BY legal_entity_id,command_id;

-- Internal movement attribution must still match original source identity.
SELECT * FROM hft.stock_entry_attribution_errors_v1 ORDER BY entry_id;
-- Legal ownership is conserved across available/custody/damaged/quarantine.
SELECT legal_entity_id,item_code,account_kind,SUM(persisted_micro)::numeric AS owned_micro
FROM hft.stock_account_reconstruction_v2 GROUP BY legal_entity_id,item_code,account_kind
ORDER BY legal_entity_id,item_code,account_kind;

-- Invoice-line totals reconstructed from posted, identified physical receipts.
SELECT invoice_id,invoice_line_id,line_no,item_code,authorized_micro,received_micro,
       reconstructed_received_micro
FROM hft.invoice_line_receipt_reconstruction_v2
WHERE received_micro<>reconstructed_received_micro;
SELECT c.command_id,c.quantity_micro,r.accepted_micro,r.qc_state,r.evidence_reference
FROM hft.stock_command c JOIN hft.grn_partial_receipt r ON r.id=c.source_receipt_id
WHERE c.kind='RECEIVE' AND (
 c.quantity_micro<>r.accepted_micro OR r.qc_state<>'ACCEPTED' OR
 length(trim(r.evidence_reference))=0
);

-- Explicit PASS/FAIL criteria instead of interpreting a list of rows manually.
DO $accept$
DECLARE account_mismatch bigint; attr_errors bigint; seal_errors bigint;
        receipt_errors bigint; invoice_errors bigint; audit_errors bigint;
BEGIN
 SELECT count(*) INTO account_mismatch FROM hft.stock_account_reconstruction_v2
 WHERE persisted_micro<>reconstructed_micro;
 SELECT count(*) INTO attr_errors FROM hft.stock_entry_attribution_errors_v1;
 SELECT count(*) INTO seal_errors FROM hft.stock_command_seal_reconstruction_v1
 WHERE seal_missing OR seal_mismatch OR leg_count<>2 OR net_micro<>0;
 SELECT count(*) INTO receipt_errors FROM hft.stock_command c
 JOIN hft.grn_partial_receipt r ON r.id=c.source_receipt_id
 WHERE c.kind='RECEIVE' AND (
   c.quantity_micro<>r.accepted_micro OR r.qc_state<>'ACCEPTED' OR
   length(trim(r.evidence_reference))=0);
 SELECT count(*) INTO invoice_errors FROM hft.invoice_line_receipt_reconstruction_v2
 WHERE received_micro<>reconstructed_received_micro;
 SELECT count(*) INTO audit_errors FROM hft.stock_command c
 LEFT JOIN hft.stock_command_seal s ON s.command_id=c.id
 LEFT JOIN hft.audit_outbox a ON a.command_id=c.id
 LEFT JOIN hft.stock_command_outcome o ON o.command_id=c.id
 LEFT JOIN hft.audit_delivery d ON d.outbox_id=a.id
 WHERE s.command_id IS NULL OR a.id IS NULL OR o.command_id IS NULL OR d.outbox_id IS NULL
    OR s.audit_sha256 IS DISTINCT FROM a.canonical_sha256
    OR a.canonical_sha256 IS DISTINCT FROM encode(sha256(convert_to(a.canonical_text,'UTF8')),'hex')
    OR s.outcome_sha256 IS DISTINCT FROM encode(sha256(convert_to(o.result::text,'UTF8')),'hex')
    OR a.canonical_event->'fact' IS DISTINCT FROM o.result->'fact';
 IF account_mismatch<>0 OR attr_errors<>0 OR seal_errors<>0 OR receipt_errors<>0
    OR invoice_errors<>0 OR audit_errors<>0 THEN
  RAISE EXCEPTION 'HFT_P1_RECONCILIATION_FAILED accounts=% attribution=% seal=% receipt=% invoice=% audit=%',
     account_mismatch,attr_errors,seal_errors,receipt_errors,invoice_errors,audit_errors;
 END IF;
 RAISE NOTICE 'HFT_P1_RECONCILIATION_PASS commands=%', (SELECT count(*) FROM hft.stock_command);
END $accept$;
COMMIT;
