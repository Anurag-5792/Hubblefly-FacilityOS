-- Execute with psql -X -v ON_ERROR_STOP=1 -f ... ONLY on approved
-- disposable PostgreSQL with corrected migration 0005 selected and recorded.
-- All synthetic records are rolled back. This is NOT a stock posting test.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
     OR current_user <> 'hft_engineering'
     OR current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'QA002_DISPOSABLE_DB_IDENTITY_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM hft.schema_revision WHERE version BETWEEN 1 AND 5)<>5 THEN
    RAISE EXCEPTION 'QA002_MIGRATIONS_0001_TO_0005_REQUIRED';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='hft'::regnamespace
      AND conname IN ('supplier_invoice_entity_identity_v2',
        'grn_line_parent_invoice_v3','grn_line_invoice_item_v3',
        'receipt_parent_warehouse_v3','issue_parent_scope_v3',
        'return_parent_issue_scope_v3','stock_command_receipt_scope_v3') AND NOT convalidated) THEN
    RAISE EXCEPTION 'QA002_UNVALIDATED_SCOPED_CONSTRAINTS';
  END IF;
END $$;
CREATE TEMP TABLE qa002_assertion(name text PRIMARY KEY);
INSERT INTO hft.legal_entity(id,name) VALUES('HFT','QA Synthetic HFT'),('OTHER','QA Synthetic Other');
INSERT INTO hft.site(legal_entity_id,id,name) VALUES('HFT','SITE1','Synthetic Site'),('OTHER','SITE2','Other Site');
INSERT INTO hft.warehouse(legal_entity_id,warehouse_id,site_id,name) VALUES
 ('HFT','WH1','SITE1','Main Synthetic'),('HFT','WH2','SITE1','Second Synthetic'),('OTHER','WH1','SITE2','Other Warehouse');
INSERT INTO hft.location(legal_entity_id,warehouse_id,location_id) VALUES
 ('HFT','WH1','LOC1'),('HFT','WH2','LOC1'),('OTHER','WH1','LOC1');
INSERT INTO hft.item(legal_entity_id,item_code,uom,control_type) VALUES
 ('HFT','ITEM1','NOS','NONE'),('HFT','ITEM2','NOS','NONE'),('OTHER','ITEM1','NOS','NONE');
INSERT INTO hft.supplier(legal_entity_id,supplier_id,legal_name) VALUES
 ('HFT','SUP1','Synthetic Supplier'),('OTHER','SUP1','Other Synthetic Supplier');
INSERT INTO hft.employee(legal_entity_id,employee_id,site_id,full_name,department,designation,active) VALUES
 ('HFT','EMP1','SITE1','Synthetic A','Test','Tester',true),('OTHER','EMP1','SITE2','Synthetic B','Test','Tester',true);
INSERT INTO hft.supplier_invoice(id,legal_entity_id,supplier_id,invoice_key,invoice_date,status) VALUES
 ('00000000-0000-4000-8000-000000000101','HFT','SUP1','INV1','2026-10-23','VERIFIED'),
 ('00000000-0000-4000-8000-000000000102','HFT','SUP1','INV2','2026-10-23','VERIFIED');
INSERT INTO hft.supplier_invoice_line(id,invoice_id,legal_entity_id,line_no,item_code,authorized_micro) VALUES
 ('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000101','HFT',1,'ITEM1',5000000),
 ('00000000-0000-4000-8000-000000000112','00000000-0000-4000-8000-000000000102','HFT',1,'ITEM1',5000000);
INSERT INTO hft.grn(id,legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,status,invoice_id,physical_receipt_id) VALUES
 ('00000000-0000-4000-8000-000000000121','HFT','SUP1','INV1','2026-10-23','WH1','AUTHORIZED','00000000-0000-4000-8000-000000000101','DELIVERY-1'),
 ('00000000-0000-4000-8000-000000000122','HFT','SUP1','INV1','2026-10-23','WH1','AUTHORIZED','00000000-0000-4000-8000-000000000101','DELIVERY-2');
INSERT INTO hft.grn_line(grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id) VALUES
 ('00000000-0000-4000-8000-000000000121',1,'HFT','ITEM1',5000000,'00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000111'),
 ('00000000-0000-4000-8000-000000000122',1,'HFT','ITEM1',5000000,'00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000111');
-- Same invoice, separate physical deliveries: permissible, quantities still
-- bound at posting to the single invoice-line cumulative ceiling.
DO $$ BEGIN
 IF (SELECT count(*) FROM hft.grn WHERE invoice_id='00000000-0000-4000-8000-000000000101')<>2
 THEN RAISE EXCEPTION 'QA002_MULTI_GRN_REJECTED'; END IF;
END $$;
INSERT INTO qa002_assertion VALUES('two_grns_one_invoice');
DO $$ BEGIN
  BEGIN
    INSERT INTO hft.supplier_invoice_line(invoice_id,legal_entity_id,line_no,item_code,authorized_micro)
    VALUES('00000000-0000-4000-8000-000000000101','OTHER',2,'ITEM1',1000000);
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO qa002_assertion VALUES('invoice_cross_entity_rejected');
  END;
  BEGIN
    INSERT INTO hft.grn_line(grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id)
    VALUES('00000000-0000-4000-8000-000000000121',2,'HFT','ITEM1',1000000,
      '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000112');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO qa002_assertion VALUES('wrong_invoice_line_rejected');
  END;
  BEGIN
    INSERT INTO hft.grn_line(grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id)
    VALUES('00000000-0000-4000-8000-000000000121',3,'OTHER','ITEM1',1000000,
      '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000111');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO qa002_assertion VALUES('grn_line_cross_entity_rejected');
  END;
  BEGIN
    INSERT INTO hft.grn_partial_receipt(grn_id,receipt_key,line_no,accepted_micro,qc_state,evidence_reference,legal_entity_id,warehouse_id,location_id)
    VALUES('00000000-0000-4000-8000-000000000121','WRONGWH',1,1000000,'ACCEPTED','QC-A','HFT','WH2','LOC1');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO qa002_assertion VALUES('receipt_wrong_warehouse_rejected');
  END;
  BEGIN
    INSERT INTO hft.grn(id,legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,status,invoice_id,physical_receipt_id)
    VALUES('00000000-0000-4000-8000-000000000123','HFT','SUP1','INV1','2026-10-23','WH1','AUTHORIZED',
      '00000000-0000-4000-8000-000000000101','DELIVERY-1');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO qa002_assertion VALUES('duplicate_physical_delivery_rejected');
  END;
  BEGIN
    UPDATE hft.supplier_invoice_line SET received_micro=authorized_micro+1
    WHERE id='00000000-0000-4000-8000-000000000111';
  EXCEPTION WHEN check_violation THEN
    INSERT INTO qa002_assertion VALUES('invoice_overreceipt_rejected');
  END;
END $$;
INSERT INTO hft.material_issue(id,legal_entity_id,warehouse_id,employee_id,purpose,status,prepared_by) VALUES
 ('00000000-0000-4000-8000-000000000131','HFT','WH1','EMP1','QA synthetic','DRAFT','PREP');
DO $$ BEGIN
 BEGIN
  INSERT INTO hft.material_issue_line(issue_id,legal_entity_id,warehouse_id,source_action_key,item_code,location_id,authorized_micro)
  VALUES('00000000-0000-4000-8000-000000000131','OTHER','WH1','LINE-1','ITEM1','LOC1',1000000);
 EXCEPTION WHEN foreign_key_violation THEN
  INSERT INTO qa002_assertion VALUES('issue_line_cross_entity_rejected');
 END;
 BEGIN
  INSERT INTO hft.material_issue_line(issue_id,legal_entity_id,warehouse_id,source_action_key,item_code,location_id,authorized_micro)
  VALUES('00000000-0000-4000-8000-000000000131','HFT','WH2','LINE-2','ITEM1','LOC1',1000000);
 EXCEPTION WHEN foreign_key_violation THEN
  INSERT INTO qa002_assertion VALUES('issue_line_cross_warehouse_rejected');
 END;
 BEGIN
  INSERT INTO hft.material_return(id,issue_id,condition,status,legal_entity_id,warehouse_id)
  VALUES('00000000-0000-4000-8000-000000000141','00000000-0000-4000-8000-000000000131','GOOD','DRAFT','OTHER','WH1');
 EXCEPTION WHEN foreign_key_violation THEN
  INSERT INTO qa002_assertion VALUES('return_header_cross_entity_rejected');
 END;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM qa002_assertion) <> 10 THEN
  RAISE EXCEPTION 'QA002_NEGATIVE_ASSERTIONS_INCOMPLETE got=%',(SELECT count(*) FROM qa002_assertion);
 END IF;
END $$;
SELECT name, 'PASS' AS status FROM qa002_assertion ORDER BY name;
-- Roll back fixture data. The migration revision table and DDL are untouched.
ROLLBACK;
