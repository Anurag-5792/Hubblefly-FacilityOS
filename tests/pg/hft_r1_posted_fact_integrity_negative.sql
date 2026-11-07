-- HFT R1 P1 authoring only: NOT EXECUTED. Use ONLY approved disposable PG15+
-- database and authorized migration/test role after separate Chat13 approval.
-- Clean 0001-0006 required. Does not provide production DML authority.
\set ON_ERROR_STOP on
BEGIN;
DO $environment$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
    OR current_user<>'hft_engineering'
    OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6) THEN
   RAISE EXCEPTION 'HFT_P1_DISPOSABLE_0006_REQUIRED';
 END IF;
END $environment$;
INSERT INTO hft.legal_entity(id,name) VALUES('HFTP1','HFT P1 Synthetic');
INSERT INTO hft.site(legal_entity_id,id,name) VALUES('HFTP1','SITEP1','Synthetic site');
INSERT INTO hft.employee(legal_entity_id,employee_id,site_id,full_name,department,designation,active)
 VALUES('HFTP1','EMPP1','SITEP1','Synthetic employee','QA','Test',true);
INSERT INTO hft.item(legal_entity_id,item_code,uom,control_type) VALUES
 ('HFTP1','ITEMP1','Nos','NONE'),('HFTP1','ITEMP2','Nos','NONE');
INSERT INTO hft.supplier(legal_entity_id,supplier_id,legal_name)
 VALUES('HFTP1','SUPP1','Synthetic supplier');
INSERT INTO hft.warehouse(legal_entity_id,warehouse_id,site_id,name)
 VALUES('HFTP1','WHP1','SITEP1','Synthetic warehouse');
INSERT INTO hft.location(legal_entity_id,warehouse_id,location_id)
 VALUES('HFTP1','WHP1','LOCP1'),('HFTP1','WHP1','LOCP2');
INSERT INTO hft.actor_warehouse_grant
 (legal_entity_id,site_id,warehouse_id,actor_subject,active,may_post)
 VALUES('HFTP1','SITEP1','WHP1','STAFFP1',true,true);
INSERT INTO hft.supplier_invoice
 (legal_entity_id,supplier_id,invoice_key,invoice_date,status)
 VALUES('HFTP1','SUPP1','INV-P1','2026-10-28','VERIFIED')
 RETURNING id::text AS invoice_uuid \gset
INSERT INTO hft.supplier_invoice_line
 (invoice_id,legal_entity_id,line_no,item_code,authorized_micro)
 VALUES(:'invoice_uuid'::uuid,'HFTP1',1,'ITEMP1',5000000)
 RETURNING id::text AS invoice_line_uuid \gset
INSERT INTO hft.grn
 (legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,status,
  prepared_by,checked_by,authorized_by,invoice_id,physical_receipt_id)
 VALUES('HFTP1','SUPP1','INV-P1','2026-10-28','WHP1','AUTHORIZED',
 'PREPP1','CHECKP1','APPROVP1',:'invoice_uuid'::uuid,'PHYSICAL-P1')
 RETURNING id::text AS grn_uuid \gset
INSERT INTO hft.grn_line
 (grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id)
 VALUES(:'grn_uuid'::uuid,1,'HFTP1','ITEMP1',5000000,:'invoice_uuid'::uuid,:'invoice_line_uuid'::uuid);
INSERT INTO hft.grn_partial_receipt
 (grn_id,receipt_key,line_no,accepted_micro,qc_state,evidence_reference,
  location_id,legal_entity_id,warehouse_id,batch_no,serial_no)
 VALUES(:'grn_uuid'::uuid,'DEL-P1',1,5000000,'ACCEPTED','QC-P1',
 'LOCP1','HFTP1','WHP1','','') RETURNING id::text AS receipt_uuid \gset
INSERT INTO hft.stock_approval
 (legal_entity_id,site_id,warehouse_id,source_document_id,approval_id,revision,
  approved,prepared_by,checked_by,approved_by)
 VALUES('HFTP1','SITEP1','WHP1',:'grn_uuid','APPROVP1',1,true,
 'PREPP1','CHECKP1','APPROVP1');
INSERT INTO hft.stock_account
 (legal_entity_id,warehouse_id,item_code,location_key,account_kind,condition)
 VALUES('HFTP1','WHP1','ITEMP1','LOCP1','AVAILABLE','GOOD')
 RETURNING id::text AS account_uuid \gset
INSERT INTO hft.stock_command
 (legal_entity_id,command_id,idempotency_key,payload_sha256,kind,source_document_id,
  source_action_key,actor_subject,approval_id,approval_revision,source_receipt_id,
  source_line_no,warehouse_id,item_code,location_id,batch_no,serial_no,site_id,quantity_micro)
 VALUES('HFTP1','CMDP1','KEYP1',repeat('a',64),'RECEIVE',:'grn_uuid',
  'DEL-P1:1','STAFFP1','APPROVP1',1,:'receipt_uuid'::uuid,1,'WHP1',
  'ITEMP1','LOCP1','','','SITEP1',5000000) RETURNING id::text AS command_uuid \gset
INSERT INTO hft.stock_entry
 (command_id,account_id,bucket,qty_delta_micro)
 VALUES(:'command_uuid'::uuid,NULL,'EXTERNAL',-5000000),
       (:'command_uuid'::uuid,:'account_uuid'::uuid,'AVAILABLE',5000000);
UPDATE hft.stock_account SET qty_micro=5000000,version=version+1
 WHERE id=:'account_uuid'::uuid;
UPDATE hft.grn_line SET accepted_micro=5000000
 WHERE grn_id=:'grn_uuid'::uuid AND line_no=1;
UPDATE hft.supplier_invoice_line SET received_micro=5000000
 WHERE id=:'invoice_line_uuid'::uuid;
UPDATE hft.grn SET status='RECEIVED',version=version+1 WHERE id=:'grn_uuid'::uuid;
WITH fact AS (
 SELECT jsonb_build_object(
  'commandId','CMDP1','sourceDocumentId',:'grn_uuid','kind','RECEIVE',
  'entityId','HFTP1','warehouseId','WHP1','itemCode','ITEMP1',
  'locationId','LOCP1','operatorId','STAFFP1','movements',
  jsonb_build_array(jsonb_build_object('bucket','EXTERNAL','delta','-5'),
                    jsonb_build_object('bucket','AVAILABLE','delta','5'))) AS f
), ev AS (
 SELECT jsonb_build_object('schema','HFT_STOCK_EVENT_V2','commandId','CMDP1',
  'entity','HFTP1','actor','STAFFP1','approvalId','APPROVP1',
  'approvalRevision',1,'available','5','accountVersion',1,'fact',f) AS e FROM fact
)
INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,canonical_sha256)
SELECT :'command_uuid'::uuid,e,e::text,
       encode(sha256(convert_to(e::text,'UTF8')),'hex') FROM ev
 RETURNING id::text AS outbox_uuid \gset
INSERT INTO hft.audit_delivery(outbox_id,state)
 VALUES(:'outbox_uuid'::uuid,'PENDING');
WITH f AS (
 SELECT canonical_event->'fact' AS fact FROM hft.audit_outbox
 WHERE command_id=:'command_uuid'::uuid
)
INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
SELECT :'command_uuid'::uuid,
       jsonb_build_object('commandId','CMDP1','accountVersion',1,
         'available','5','fact',fact,'replay',false),'STAFFP1' FROM f;
SELECT hft.seal_stock_command_v1(:'command_uuid'::uuid);
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

-- This is genuine post-COMMIT test authoring, not a rollback-only claim.
BEGIN;
SELECT set_config('hft.p1.command_uuid', :'command_uuid', true),
       set_config('hft.p1.account_uuid', :'account_uuid', true),
       set_config('hft.p1.receipt_uuid', :'receipt_uuid', true),
       set_config('hft.p1.grn_uuid', :'grn_uuid', true);
DO $negative$
DECLARE
 p_cmd uuid := current_setting('hft.p1.command_uuid')::uuid;
 p_account uuid := current_setting('hft.p1.account_uuid')::uuid;
 p_receipt uuid := current_setting('hft.p1.receipt_uuid')::uuid;
 before_legs bigint;
 after_legs bigint;
 before_qty bigint;
 after_qty bigint;
BEGIN
 SELECT count(*) INTO before_legs FROM hft.stock_entry WHERE command_id=p_cmd;
 SELECT qty_micro INTO before_qty FROM hft.stock_account WHERE id=p_account;
 IF before_legs<>2 OR before_qty<>5000000 THEN
   RAISE EXCEPTION 'P1_VALID_RECEIVE_MISSING_OR_WRONG';
 END IF;
 -- A balanced extra EXTERNAL/AVAILABLE pair cannot be appended after seal.
 BEGIN
   INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
   VALUES(p_cmd,NULL,'EXTERNAL',-1000000),
         (p_cmd,p_account,'AVAILABLE',1000000);
   UPDATE hft.stock_account SET qty_micro=qty_micro+1000000 WHERE id=p_account;
   RAISE EXCEPTION 'P1_UNEXPECTED_APPEND_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'STOCK_COMMAND_MOVEMENTS_SEALED' THEN RAISE; END IF;
 END;
 -- Even a valid, noncolliding new item/location must not reattribute the account.
 BEGIN
   UPDATE hft.stock_account SET item_code='ITEMP2',location_key='LOCP2'
    WHERE id=p_account;
   RAISE EXCEPTION 'P1_UNEXPECTED_ACCOUNT_REATTRIBUTION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'STOCK_ACCOUNT_IDENTITY_IMMUTABLE' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE hft.grn_partial_receipt SET accepted_micro=4000000 WHERE id=p_receipt;
   RAISE EXCEPTION 'P1_UNEXPECTED_RECEIPT_QUANTITY_MUTATION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'POSTED_RECEIPT_IMMUTABLE' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE hft.grn_partial_receipt SET qc_state='REJECTED',evidence_reference='CHANGED'
    WHERE id=p_receipt;
   RAISE EXCEPTION 'P1_UNEXPECTED_RECEIPT_QC_MUTATION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'POSTED_RECEIPT_IMMUTABLE' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE hft.grn_line SET item_code='ITEMP2'
    WHERE grn_id=current_setting('hft.p1.grn_uuid')::uuid AND line_no=1;
   RAISE EXCEPTION 'P1_UNEXPECTED_POSTED_LINE_REATTRIBUTION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'POSTED_GRN_LINE_IDENTITY_IMMUTABLE' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO after_legs FROM hft.stock_entry WHERE command_id=p_cmd;
 SELECT qty_micro INTO after_qty FROM hft.stock_account WHERE id=p_account;
 IF after_legs<>before_legs OR after_qty<>before_qty OR
   (SELECT count(*) FROM hft.stock_command_seal WHERE command_id=p_cmd)<>1 OR
   (SELECT count(*) FROM hft.audit_outbox WHERE command_id=p_cmd)<>1 OR
   (SELECT count(*) FROM hft.stock_command_outcome WHERE command_id=p_cmd)<>1 THEN
   RAISE EXCEPTION 'P1_NEGATIVE_ATTEMPT_ALTERED_DURABLE_FACT';
 END IF;
END $negative$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

-- Independent audit query: all must be zero for this synthetic fixture.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT count(*) AS account_reconstruction_mismatch
 FROM hft.stock_account_reconstruction_v2 WHERE persisted_micro<>reconstructed_micro;
SELECT count(*) AS attribution_mismatch FROM hft.stock_entry_attribution_errors_v1;
SELECT count(*) AS seal_mismatch FROM hft.stock_command_seal_reconstruction_v1
 WHERE seal_missing OR seal_mismatch OR leg_count<>2 OR net_micro<>0;
COMMIT;
