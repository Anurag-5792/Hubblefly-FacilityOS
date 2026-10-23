-- Only an additional disposable database at revision 0004. This script
-- intentionally persists SYNTHETIC legacy records for a subsequent negative
-- migration attempt. Destroy this disposable database after the test.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user <> 'hft_engineering'
 OR EXISTS(SELECT 1 FROM hft.schema_revision WHERE version>=5)
 OR (SELECT count(*) FROM hft.schema_revision)<>4 THEN
  RAISE EXCEPTION 'QA002_HISTORICAL_TEST_MUST_START_AT_DISPOSABLE_REV4';
 END IF;
END $$;
INSERT INTO hft.legal_entity(id,name) VALUES('HFT','Synthetic Legacy Company');
INSERT INTO hft.site(legal_entity_id,id,name) VALUES('HFT','SITE1','Synthetic Site');
INSERT INTO hft.warehouse(legal_entity_id,warehouse_id,site_id,name) VALUES
 ('HFT','WH1','SITE1','Synthetic Warehouse');
INSERT INTO hft.supplier(legal_entity_id,supplier_id,legal_name) VALUES
 ('HFT','SUP1','Synthetic Supplier');
INSERT INTO hft.grn(id,legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,status)
VALUES('00000000-0000-4000-8000-000000000201','HFT','SUP1','LEGACY-ONLY','2026-10-23','WH1','DRAFT');
COMMIT;
