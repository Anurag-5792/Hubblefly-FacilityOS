-- HFT R1 P1 additional BEFORE-COMMIT shape tests: AUTHOR ONLY / NOT EXECUTED.
-- Requires the first synthetic RECEIVE fixture from hft_r1_posted_fact_integrity_negative.sql.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('hft.p1.account_uuid', :'account_uuid', true);
DO $shape$
DECLARE
 scenario text;
 p_account uuid := current_setting('hft.p1.account_uuid')::uuid;
 invoice_uuid uuid; invoice_line_uuid uuid; grn_uuid uuid;
 receipt_uuid uuid; cmd_uuid uuid; outbox_uuid uuid;
 qty bigint;
 source_action text;
BEGIN
 FOR scenario IN SELECT unnest(ARRAY['WRONG_SIZE','EXTRA_LEGS','MISSING_LEG','WRONG_BUCKET']) LOOP
  BEGIN
   source_action:='DLP1-'||scenario;
   INSERT INTO hft.supplier_invoice(legal_entity_id,supplier_id,invoice_key,invoice_date,status)
    VALUES('HFTP1','SUPP1','INV-P1-'||scenario,'2026-10-28','VERIFIED')
    RETURNING id INTO invoice_uuid;
   INSERT INTO hft.supplier_invoice_line(invoice_id,legal_entity_id,line_no,item_code,authorized_micro)
    VALUES(invoice_uuid,'HFTP1',1,'ITEMP1',5000000) RETURNING id INTO invoice_line_uuid;
   INSERT INTO hft.grn(legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,
      status,prepared_by,checked_by,authorized_by,invoice_id,physical_receipt_id)
    VALUES('HFTP1','SUPP1','INV-P1-'||scenario,'2026-10-28','WHP1',
      'AUTHORIZED','PREPP1','CHECKP1','APPROVP1',invoice_uuid,'PHYSICAL-'||scenario)
    RETURNING id INTO grn_uuid;
   INSERT INTO hft.grn_line(grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id)
    VALUES(grn_uuid,1,'HFTP1','ITEMP1',5000000,invoice_uuid,invoice_line_uuid);
   INSERT INTO hft.grn_partial_receipt(grn_id,receipt_key,line_no,accepted_micro,
      qc_state,evidence_reference,location_id,legal_entity_id,warehouse_id,batch_no,serial_no)
    VALUES(grn_uuid,source_action,1,5000000,'ACCEPTED','QC-P1',
      'LOCP1','HFTP1','WHP1','','') RETURNING id INTO receipt_uuid;
   INSERT INTO hft.stock_approval(legal_entity_id,site_id,warehouse_id,source_document_id,
      approval_id,revision,approved,prepared_by,checked_by,approved_by)
    VALUES('HFTP1','SITEP1','WHP1',grn_uuid::text,'APPROV-'||scenario,1,true,
      'PREPP1','CHECKP1','APPROVP1');
   INSERT INTO hft.stock_command(legal_entity_id,command_id,idempotency_key,payload_sha256,
      kind,source_document_id,source_action_key,actor_subject,approval_id,approval_revision,
      source_receipt_id,source_line_no,warehouse_id,item_code,location_id,batch_no,serial_no,site_id,quantity_micro)
    VALUES('HFTP1','CMD-'||scenario,'KEY-'||scenario,repeat('b',64),
      'RECEIVE',grn_uuid::text,source_action||':1','STAFFP1','APPROV-'||scenario,1,
      receipt_uuid,1,'WHP1','ITEMP1','LOCP1','','','SITEP1',5000000)
    RETURNING id INTO cmd_uuid;
   IF scenario='WRONG_SIZE' THEN
     INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
       VALUES(cmd_uuid,NULL,'EXTERNAL',-4000000),(cmd_uuid,p_account,'AVAILABLE',4000000);
   ELSIF scenario='EXTRA_LEGS' THEN
     INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
       VALUES(cmd_uuid,NULL,'EXTERNAL',-5000000),(cmd_uuid,p_account,'AVAILABLE',5000000),
             (cmd_uuid,NULL,'EXTERNAL',-1000000),(cmd_uuid,p_account,'AVAILABLE',1000000);
   ELSIF scenario='MISSING_LEG' THEN
     INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
       VALUES(cmd_uuid,NULL,'EXTERNAL',-5000000);
   ELSE
     INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
       VALUES(cmd_uuid,NULL,'EXTERNAL',-5000000);
     INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,location_key,
       account_kind,condition)
       VALUES('HFTP1','WHP1','ITEMP1','LOCP1','QUARANTINE','QUARANTINE');
     INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
       SELECT cmd_uuid,id,'QUARANTINE',5000000 FROM hft.stock_account
       WHERE legal_entity_id='HFTP1' AND warehouse_id='WHP1' AND item_code='ITEMP1'
         AND location_key='LOCP1' AND account_kind='QUARANTINE';
   END IF;
   INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,canonical_sha256)
     VALUES(cmd_uuid,'{}'::jsonb,'{}',encode(sha256(convert_to('{}','UTF8')),'hex'))
     RETURNING id INTO outbox_uuid;
   INSERT INTO hft.audit_delivery(outbox_id,state) VALUES(outbox_uuid,'PENDING');
   INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
     VALUES(cmd_uuid,'{}'::jsonb,'STAFFP1');
   PERFORM hft.seal_stock_command_v1(cmd_uuid);
   RAISE EXCEPTION 'P1_BAD_SHAPE_WAS_ACCEPTED:%',scenario;
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'POSTED_MOVEMENT_SHAPE_OR_AMOUNT_INVALID' THEN RAISE; END IF;
  END;
 END LOOP;
END $shape$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
