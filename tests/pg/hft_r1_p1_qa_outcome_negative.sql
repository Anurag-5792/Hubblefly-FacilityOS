-- SOURCE-ONLY QA-CORRECT-001, NOT EXECUTED.
-- Run only on an explicitly approved disposable PG15+ with canonical 0001-0006.
-- Prerequisite: hft_r1_posted_fact_integrity_negative.sql committed fixture CMDP1.
-- Each deliberately invalid posting occurs inside an exception subtransaction;
-- only its expected seal exception permits the test to continue.
\set ON_ERROR_STOP on
BEGIN;
DO $qa$
DECLARE scenario text; inv uuid; inv_line uuid; grn uuid; receipt uuid;
  command_uuid uuid; account_uuid uuid; outbox_uuid uuid;
  before_qty bigint; before_version bigint;
  fact jsonb; event_json jsonb; outcome jsonb; movements jsonb;
  expected_error text; source_name text;
BEGIN
  SELECT id,qty_micro,version INTO account_uuid,before_qty,before_version
  FROM hft.stock_account WHERE legal_entity_id='HFTP1' AND warehouse_id='WHP1'
  AND item_code='ITEMP1' AND location_key='LOCP1' AND account_kind='AVAILABLE'
  FOR UPDATE;
  IF account_uuid IS NULL THEN RAISE EXCEPTION 'HFT_QA_ORIGINAL_RECEIVE_REQUIRED'; END IF;
  FOR scenario IN SELECT unnest(ARRAY[
    'DUPLICATED_LEG','MISSING_LEG','WRONG_ACTION','WRONG_SOURCE',
    'WRONG_ACTOR','FABRICATED_AVAILABLE','WRONG_VERSION'
  ]) LOOP
    BEGIN
      source_name:='HFT-QA-'||scenario;
      INSERT INTO hft.supplier_invoice(legal_entity_id,supplier_id,invoice_key,invoice_date,status)
      VALUES('HFTP1','SUPP1',source_name,'2026-10-28','VERIFIED') RETURNING id INTO inv;
      INSERT INTO hft.supplier_invoice_line(invoice_id,legal_entity_id,line_no,item_code,authorized_micro)
      VALUES(inv,'HFTP1',1,'ITEMP1',1000000) RETURNING id INTO inv_line;
      INSERT INTO hft.grn(legal_entity_id,supplier_id,invoice_key,invoice_date,warehouse_id,
        status,prepared_by,checked_by,authorized_by,invoice_id,physical_receipt_id)
      VALUES('HFTP1','SUPP1',source_name,'2026-10-28','WHP1','AUTHORIZED',
        'PREPP1','CHECKP1','APPROVP1',inv,'PHYS-'||scenario) RETURNING id INTO grn;
      INSERT INTO hft.grn_line(grn_id,line_no,legal_entity_id,item_code,ordered_micro,invoice_id,invoice_line_id)
      VALUES(grn,1,'HFTP1','ITEMP1',1000000,inv,inv_line);
      INSERT INTO hft.grn_partial_receipt(grn_id,receipt_key,line_no,accepted_micro,qc_state,
        evidence_reference,location_id,legal_entity_id,warehouse_id,batch_no,serial_no)
      VALUES(grn,'DEL-'||scenario,1,1000000,'ACCEPTED','QC-P1','LOCP1','HFTP1','WHP1','','')
      RETURNING id INTO receipt;
      INSERT INTO hft.stock_command(legal_entity_id,command_id,idempotency_key,payload_sha256,
        kind,source_document_id,source_action_key,actor_subject,approval_id,approval_revision,
        source_receipt_id,source_line_no,warehouse_id,item_code,location_id,batch_no,serial_no,site_id,quantity_micro)
      VALUES('HFTP1','CMD-'||scenario,'KEY-'||scenario,repeat('f',64),
        'RECEIVE',grn::text,'DEL-'||scenario||':1','STAFFP1','APPROVP1',1,
        receipt,1,'WHP1','ITEMP1','LOCP1','','','SITEP1',1000000)
      RETURNING id INTO command_uuid;
      INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro)
      VALUES(command_uuid,NULL,'EXTERNAL',-1000000),(command_uuid,account_uuid,'AVAILABLE',1000000);
      UPDATE hft.stock_account SET qty_micro=qty_micro+1000000,version=version+1 WHERE id=account_uuid;
      UPDATE hft.grn_line SET accepted_micro=1000000 WHERE grn_id=grn AND line_no=1;
      UPDATE hft.supplier_invoice_line SET received_micro=1000000 WHERE id=inv_line;
      UPDATE hft.grn SET status='RECEIVED',version=version+1 WHERE id=grn;
      movements:=jsonb_build_array(
        jsonb_build_object('bucket','EXTERNAL','delta','-1'),
        jsonb_build_object('bucket','AVAILABLE','delta','1'));
      IF scenario='DUPLICATED_LEG' THEN
        movements:=jsonb_build_array(
          jsonb_build_object('bucket','EXTERNAL','delta','-1'),
          jsonb_build_object('bucket','EXTERNAL','delta','-1'));
      ELSIF scenario='MISSING_LEG' THEN
        movements:=jsonb_build_array(jsonb_build_object('bucket','EXTERNAL','delta','-1'));
      END IF;
      fact:=jsonb_build_object('commandId','CMD-'||scenario,
         'sourceDocumentId',CASE WHEN scenario='WRONG_SOURCE' THEN 'OTHER-DOC' ELSE grn::text END,
         'kind',CASE WHEN scenario='WRONG_ACTION' THEN 'ISSUE' ELSE 'RECEIVE' END,
         'entityId','HFTP1','warehouseId','WHP1','itemCode','ITEMP1','locationId','LOCP1',
         'operatorId',CASE WHEN scenario='WRONG_ACTOR' THEN 'FORGED' ELSE 'STAFFP1' END,
         'movements',movements);
      outcome:=jsonb_build_object('commandId','CMD-'||scenario,'fact',fact,
         'available',CASE WHEN scenario='FABRICATED_AVAILABLE' THEN '999'
             ELSE hft.format_signed_micro_v2(before_qty+1000000) END,
         'accountVersion',CASE WHEN scenario='WRONG_VERSION' THEN 999 ELSE before_version+1 END,
         'replay',false);
      event_json:=jsonb_build_object('schema','HFT_STOCK_EVENT_V2',
         'commandId','CMD-'||scenario,'entity','HFTP1','actor','STAFFP1',
         'approvalId','APPROVP1','approvalRevision',1,'fact',fact,
         'available',outcome->>'available','accountVersion',outcome->'accountVersion');
      INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,canonical_sha256)
      VALUES(command_uuid,event_json,event_json::text,
        encode(sha256(convert_to(event_json::text,'UTF8')),'hex'))
      RETURNING id INTO outbox_uuid;
      INSERT INTO hft.audit_delivery(outbox_id,state) VALUES(outbox_uuid,'PENDING');
      INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
      VALUES(command_uuid,outcome,'STAFFP1');
      expected_error:=CASE
        WHEN scenario IN ('DUPLICATED_LEG','MISSING_LEG') THEN 'POSTED_OUTCOME_MOVEMENT_SET_MISMATCH'
        WHEN scenario IN ('WRONG_ACTION','WRONG_SOURCE','WRONG_ACTOR') THEN 'POSTED_OUTCOME_SOURCE_ACTOR_OR_SCOPE_MISMATCH'
        ELSE 'POSTED_OUTCOME_HISTORICAL_BALANCE_OR_VERSION_MISMATCH' END;
      PERFORM hft.seal_stock_command_v1(command_uuid);
      RAISE EXCEPTION 'HFT_NEGATIVE_OUTCOME_WAS_ACCEPTED';
    EXCEPTION WHEN OTHERS THEN
      -- The duplicate-leg scenario has two entries but wrong bucket mapping.
      IF scenario='DUPLICATED_LEG' THEN expected_error:='POSTED_OUTCOME_MOVEMENT_BIJECTION_FAILED'; END IF;
      IF SQLERRM<>expected_error THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT qty_micro FROM hft.stock_account WHERE id=account_uuid)<>before_qty OR
     (SELECT version FROM hft.stock_account WHERE id=account_uuid)<>before_version OR
     (SELECT count(*) FROM hft.stock_command WHERE legal_entity_id='HFTP1')<>1 THEN
    RAISE EXCEPTION 'HFT_NEGATIVE_SCENARIO_MUTATED_COMMITTED_STOCK';
  END IF;
END $qa$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
