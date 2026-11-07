-- SOURCE-ONLY, NOT EXECUTED: QA-CORRECT-001 H5 cumulative receipt evidence.
-- Prerequisite: canonical 0001-0006 and initial CMDP1 RECEIVE test fixture.
-- This is a TEST-ONLY synthetic DML helper, not another application writer.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO hft.supplier_invoice(legal_entity_id,supplier_id,invoice_key,invoice_date,status)
 VALUES('HFTP1','SUPP1','INV-H5-2PLUS3','2026-10-28','VERIFIED')
 RETURNING id::text AS h5_invoice \gset
INSERT INTO hft.supplier_invoice_line(invoice_id,legal_entity_id,line_no,item_code,authorized_micro)
 VALUES(:'h5_invoice'::uuid,'HFTP1',1,'ITEMP1',5000000)
 RETURNING id::text AS h5_invoice_line \gset
INSERT INTO hft.grn(legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,status,
 prepared_by,checked_by,authorized_by,invoice_id,physical_receipt_id)
 VALUES('HFTP1','SUPP1','INV-H5-2PLUS3','2026-10-28','WHP1','AUTHORIZED',
 'PREPP1','CHECKP1','APPROVP1',:'h5_invoice'::uuid,'PHYS-H5-2PLUS3')
 RETURNING id::text AS h5_grn \gset
INSERT INTO hft.grn_line(grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id)
 VALUES(:'h5_grn'::uuid,1,'HFTP1','ITEMP1',5000000,:'h5_invoice'::uuid,:'h5_invoice_line'::uuid);
INSERT INTO hft.grn_partial_receipt(grn_id,receipt_key,line_no,accepted_micro,qc_state,
 evidence_reference,location_id,legal_entity_id,warehouse_id,batch_no,serial_no)
 VALUES(:'h5_grn'::uuid,'H5-DEL-2',1,2000000,'ACCEPTED','QC-2',
        'LOCP1','HFTP1','WHP1','','')
 RETURNING id::text AS h5_receipt2 \gset
INSERT INTO hft.grn_partial_receipt(grn_id,receipt_key,line_no,accepted_micro,qc_state,
 evidence_reference,location_id,legal_entity_id,warehouse_id,batch_no,serial_no)
 VALUES(:'h5_grn'::uuid,'H5-DEL-3',1,3000000,'PENDING','QC-PENDING',
        'LOCP1','HFTP1','WHP1','','')
 RETURNING id::text AS h5_receipt3 \gset
-- Legitimate UNPOSTED receipt can change during preparation.
UPDATE hft.grn_partial_receipt SET accepted_micro=4000000,evidence_reference='QC-REVISED'
 WHERE id=:'h5_receipt3'::uuid;
UPDATE hft.grn_partial_receipt SET accepted_micro=3000000,qc_state='ACCEPTED',
 evidence_reference='QC-3-APPROVED' WHERE id=:'h5_receipt3'::uuid;
INSERT INTO hft.stock_approval(legal_entity_id,site_id,warehouse_id,source_document_id,
 approval_id,revision,approved,prepared_by,checked_by,approved_by)
 VALUES('HFTP1','SITEP1','WHP1',:'h5_grn','APPROV-H5',1,true,
 'PREPP1','CHECKP1','APPROVP1');
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

CREATE FUNCTION pg_temp.hft_qa_receive_fragment(p_receipt uuid,p_command text,p_micro bigint)
RETURNS void LANGUAGE plpgsql AS $test_writer$
DECLARE grn_uuid uuid; invoice_line uuid; action_key text;
 command_uuid uuid; account_uuid uuid; outbox_uuid uuid;
 updated_quantity bigint; updated_version bigint;
 f jsonb; ev jsonb; result_json jsonb;
BEGIN
 SELECT r.grn_id,l.invoice_line_id,r.receipt_key||':'||r.line_no::text
 INTO grn_uuid,invoice_line,action_key FROM hft.grn_partial_receipt r
 JOIN hft.grn_line l ON l.grn_id=r.grn_id AND l.line_no=r.line_no
 WHERE r.id=p_receipt FOR SHARE OF r,l;
 IF grn_uuid IS NULL THEN RAISE EXCEPTION 'TEST_RECEIPT_MISSING'; END IF;
 SELECT id INTO account_uuid FROM hft.stock_account
 WHERE legal_entity_id='HFTP1' AND warehouse_id='WHP1' AND item_code='ITEMP1'
  AND location_key='LOCP1' AND account_kind='AVAILABLE' FOR UPDATE;
 IF account_uuid IS NULL THEN RAISE EXCEPTION 'TEST_ACCOUNT_MISSING'; END IF;
 UPDATE hft.stock_account SET qty_micro=qty_micro+p_micro,version=version+1
 WHERE id=account_uuid RETURNING qty_micro,version INTO updated_quantity,updated_version;
 INSERT INTO hft.stock_command(legal_entity_id,command_id,idempotency_key,payload_sha256,
 kind,source_document_id,source_action_key,actor_subject,approval_id,approval_revision,
 source_receipt_id,source_line_no,warehouse_id,item_code,location_id,batch_no,serial_no,site_id,quantity_micro)
 SELECT 'HFTP1',p_command,'IDEMPOTENCY-'||p_command,repeat('d',64),
 'RECEIVE',r.grn_id::text,action_key,'STAFFP1','APPROV-H5',1,
 r.id,r.line_no,'WHP1','ITEMP1','LOCP1','','','SITEP1',p_micro
 FROM hft.grn_partial_receipt r WHERE r.id=p_receipt RETURNING id INTO command_uuid;
 INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
 VALUES(command_uuid,NULL,'EXTERNAL',-p_micro),
       (command_uuid,account_uuid,'AVAILABLE',p_micro);
 UPDATE hft.grn_line SET accepted_micro=accepted_micro+p_micro
 WHERE grn_id=grn_uuid AND line_no=1 AND accepted_micro+p_micro<=ordered_micro;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEST_LINE_RECEIPT_CEILING'; END IF;
 UPDATE hft.supplier_invoice_line SET received_micro=received_micro+p_micro
 WHERE id=invoice_line AND received_micro+p_micro<=authorized_micro;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEST_INVOICE_RECEIPT_CEILING'; END IF;
 UPDATE hft.grn SET status=CASE WHEN EXISTS(
  SELECT 1 FROM hft.grn_line WHERE grn_id=grn_uuid AND accepted_micro<ordered_micro)
  THEN 'PARTIALLY_RECEIVED' ELSE 'RECEIVED' END,version=version+1
 WHERE id=grn_uuid;
 f:=jsonb_build_object('commandId',p_command,'kind','RECEIVE','sourceDocumentId',grn_uuid::text,
 'entityId','HFTP1','warehouseId','WHP1','itemCode','ITEMP1','locationId','LOCP1',
 'operatorId','STAFFP1','movements',jsonb_build_array(
   jsonb_build_object('bucket','EXTERNAL','delta',hft.format_signed_micro_v2(-p_micro)),
   jsonb_build_object('bucket','AVAILABLE','delta',hft.format_signed_micro_v2(p_micro))));
 result_json:=jsonb_build_object('commandId',p_command,'fact',f,
 'available',hft.format_signed_micro_v2(updated_quantity),
 'accountVersion',updated_version,'replay',false);
 ev:=jsonb_build_object('schema','HFT_STOCK_EVENT_V2','commandId',p_command,
 'entity','HFTP1','actor','STAFFP1','approvalId','APPROV-H5',
 'approvalRevision',1,'available',result_json->>'available',
 'accountVersion',result_json->'accountVersion','fact',f);
 INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,canonical_sha256)
 VALUES(command_uuid,ev,ev::text,encode(sha256(convert_to(ev::text,'UTF8')),'hex'))
 RETURNING id INTO outbox_uuid;
 INSERT INTO hft.audit_delivery(outbox_id,state) VALUES(outbox_uuid,'PENDING');
 INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
 VALUES(command_uuid,result_json,'STAFFP1');
 PERFORM hft.seal_stock_command_v1(command_uuid);
END $test_writer$;

-- First distinct partial delivery of 2.
BEGIN;
SELECT pg_temp.hft_qa_receive_fragment(:'h5_receipt2'::uuid,'CMD-H5-RECEIVE-2',2000000);
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

-- Direct counter-only inflation to 5 is rejected by deferred COMMIT check.
BEGIN;
SELECT set_config('hft.h5.grn',:'h5_grn',true);
DO $counter_negative$
BEGIN
 BEGIN
  UPDATE hft.grn_line SET accepted_micro=5000000
  WHERE grn_id=current_setting('hft.h5.grn')::uuid AND line_no=1;
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  RAISE EXCEPTION 'UNBACKED_ACCEPTANCE_COUNTER_WAS_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'GRN_ACCEPTED_QTY_NOT_BACKED_BY_POSTED_RECEIPTS' THEN RAISE; END IF;
 END;
 IF (SELECT accepted_micro FROM hft.grn_line
   WHERE grn_id=current_setting('hft.h5.grn')::uuid AND line_no=1)<>2000000 THEN
  RAISE EXCEPTION 'FAILED_COUNTER_UPDATE_CHANGED_PERSISTED_LINE';
 END IF;
END $counter_negative$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

-- Distinct, QC-accepted physical delivery of 3 legitimately completes the line.
BEGIN;
SELECT pg_temp.hft_qa_receive_fragment(:'h5_receipt3'::uuid,'CMD-H5-RECEIVE-3',3000000);
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
BEGIN;
SELECT set_config('hft.h5.r2',:'h5_receipt2',true),
 set_config('hft.h5.r3',:'h5_receipt3',true),set_config('hft.h5.grn',:'h5_grn',true),
 set_config('hft.h5.invoice_line',:'h5_invoice_line',true);
DO $immutability$
DECLARE rid uuid; n bigint;
BEGIN
 FOREACH rid IN ARRAY ARRAY[current_setting('hft.h5.r2')::uuid,current_setting('hft.h5.r3')::uuid] LOOP
   BEGIN
     UPDATE hft.grn_partial_receipt SET evidence_reference='TAMPERED' WHERE id=rid;
     RAISE EXCEPTION 'POSTED_RECEIPT_EDIT_WAS_ALLOWED';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM<>'POSTED_RECEIPT_IMMUTABLE' THEN RAISE; END IF;
   END;
 END LOOP;
 SELECT accepted_micro INTO n FROM hft.grn_line WHERE grn_id=current_setting('hft.h5.grn')::uuid AND line_no=1;
 IF n<>5000000 THEN RAISE EXCEPTION 'HFT_H5_GRN_ACCEPTED_TOTAL_WRONG'; END IF;
 IF (SELECT received_micro FROM hft.supplier_invoice_line
      WHERE id=current_setting('hft.h5.invoice_line')::uuid)<>5000000 THEN
   RAISE EXCEPTION 'HFT_H5_INVOICE_RECEIVED_TOTAL_WRONG';
 END IF;
 IF (SELECT status FROM hft.grn WHERE id=current_setting('hft.h5.grn')::uuid)<>'RECEIVED' THEN
   RAISE EXCEPTION 'HFT_H5_GRN_STATUS_WRONG';
 END IF;
 IF (SELECT count(*) FROM hft.stock_command
     WHERE command_id IN ('CMD-H5-RECEIVE-2','CMD-H5-RECEIVE-3'))<>2 THEN
   RAISE EXCEPTION 'HFT_H5_DISTINCT_RECEIPTS_NOT_POSTED';
 END IF;
 PERFORM hft.assert_grn_receipt_cumulative_v2(current_setting('hft.h5.grn')::uuid);
END $immutability$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
