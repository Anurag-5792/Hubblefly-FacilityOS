-- Read-only SQL for authorized disposable database after corrected migration.
SELECT current_database() AS database, current_user AS role,
 current_setting('server_version') AS pg_version,
 current_setting('server_version_num') AS pg_version_num;
SELECT version,sha256,applied_at,applied_by
FROM hft.schema_revision ORDER BY version;
SELECT c.conrelid::regclass::text AS child_table, c.conname,
 c.contype, c.convalidated, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.connamespace='hft'::regnamespace AND
 (c.conname LIKE '%_v2' OR c.conname LIKE '%_v3'
  OR c.conrelid IN('hft.supplier_invoice'::regclass,'hft.supplier_invoice_line'::regclass))
ORDER BY child_table, conname;
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='hft' AND
 (tablename IN('supplier_invoice','supplier_invoice_line','grn','grn_line',
    'grn_partial_receipt','stock_command','stock_account','material_issue_line','material_return_line'))
ORDER BY tablename,indexname;
-- Accounts reconstructed from immutable facts; any returned row is a blocker.
SELECT legal_entity_id,warehouse_id,location_key,item_code,batch_key,serial_key,
 account_kind,custodian_employee_id,account_id,persisted_micro,reconstructed_micro
FROM hft.stock_account_reconstruction_v2
WHERE persisted_micro::numeric<>reconstructed_micro;
-- Empty view under no posted inventory is NOT evidence of transactional correctness.
