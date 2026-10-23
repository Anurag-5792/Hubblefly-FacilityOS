-- HFT-R1 bounded READ-ONLY qualification query for an authorized disposable PG DB.
-- REQUIRE: migrations 0001-0005 checksums verified; real database and real
-- posting commands executed. This script intentionally does not mutate stock.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
-- Every legally-owned account must equal its own immutable movement history.
SELECT legal_entity_id,warehouse_id,location_key,item_code,batch_key,serial_key,
       account_kind,condition,custodian_employee_id,
       persisted_micro,reconstructed_micro,(persisted_micro-reconstructed_micro) AS difference_micro
  FROM hft.stock_account_reconstruction_v2
 ORDER BY legal_entity_id,warehouse_id,location_key,item_code,
          batch_key,serial_key,account_kind,custodian_employee_id;
-- A NONZERO row count fails independent account-level acceptance.
SELECT count(*) AS reconstructed_account_mismatch_count
  FROM hft.stock_account_reconstruction_v2
 WHERE persisted_micro<>reconstructed_micro;
-- Stock remains owned by its legal entity while held by employees.
SELECT legal_entity_id,item_code,account_kind,
       SUM(persisted_micro)::numeric AS micro_owned_by_account_kind
  FROM hft.stock_account_reconstruction_v2
 GROUP BY legal_entity_id,item_code,account_kind
 ORDER BY legal_entity_id,item_code,account_kind;
-- EXTERNAL is a movement boundary, never a company-owned stock account.
SELECT COALESCE(SUM(e.qty_delta_micro),0)::numeric AS unbalanced_command_delta_micro
  FROM hft.stock_command c JOIN hft.stock_entry e ON e.command_id=c.id
 GROUP BY c.id HAVING SUM(e.qty_delta_micro)<>0;
-- No internal leg may be wrongly attributed (e.g. CUSTODY to AVAILABLE).
SELECT count(*) AS misattributed_internal_leg_count
  FROM hft.stock_entry e JOIN hft.stock_account a ON e.account_id=a.id
 WHERE e.bucket<>a.account_kind;
-- Each materialized custody stock account must be tied to its true holder.
SELECT count(*) AS bad_custody_account_count
  FROM hft.stock_account
 WHERE (account_kind='CUSTODY' AND custodian_employee_id='') OR
       (account_kind<>'CUSTODY' AND custodian_employee_id<>'');
-- Reconcile invoice-line accepted quantity against committed physical receipts.
SELECT invoice_id,invoice_line_id,line_no,item_code,authorized_micro,received_micro,
       reconstructed_received_micro
 FROM hft.invoice_line_receipt_reconstruction_v2
 WHERE received_micro<>reconstructed_received_micro;
COMMIT;
