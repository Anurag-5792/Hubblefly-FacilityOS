-- SOURCE-ONLY QA-CORRECT-001: NOT RUN. Only on separately approved
-- disposable PG15+ after 0001-0006 and first persisted CMDP1 RECEIVE 5.
-- Positive: RECEIVE 5, then ISSUE 2, then verify both historical seals
-- from a REPEATABLE READ READ ONLY snapshot (NO row/advisory locks).
\set ON_ERROR_STOP on
BEGIN;
DO $preflight$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$' OR
    NOT EXISTS(SELECT 1 FROM hft.stock_command WHERE command_id='CMDP1'
        AND legal_entity_id='HFTP1' AND kind='RECEIVE') THEN
   RAISE EXCEPTION 'HFT_P1_FIRST_RECEIVE_REQUIRED';
 END IF;
END $preflight$;
INSERT INTO hft.material_issue(legal_entity_id,warehouse_id,employee_id,purpose,status,
 prepared_by,approved_by)
VALUES('HFTP1','WHP1','EMPP1','Synthetic custodied stock','AUTHORIZED','PREPP1','APPROVP1')
RETURNING id::text AS issue_uuid \gset
INSERT INTO hft.material_issue_line(issue_id,legal_entity_id,warehouse_id,source_action_key,
 item_code,location_id,batch_no,serial_no,authorized_micro)
VALUES(:'issue_uuid'::uuid,'HFTP1','WHP1','ISS-P1-L1','ITEMP1','LOCP1','','',2000000);
INSERT INTO hft.stock_approval(legal_entity_id,site_id,warehouse_id,source_document_id,
 approval_id,revision,approved,prepared_by,checked_by,approved_by)
VALUES('HFTP1','SITEP1','WHP1',:'issue_uuid','APPROV-ISSUE-P1',1,true,
 'PREPP1','CHECKP1','APPROVP1');
INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,location_key,
 account_kind,condition,custodian_employee_id)
VALUES('HFTP1','WHP1','ITEMP1','LOCP1','CUSTODY','GOOD','EMPP1')
RETURNING id::text AS custody_acct_uuid \gset
SELECT id::text AS available_acct_uuid FROM hft.stock_account
WHERE legal_entity_id='HFTP1' AND warehouse_id='WHP1' AND item_code='ITEMP1'
 AND location_key='LOCP1' AND account_kind='AVAILABLE' \gset
INSERT INTO hft.stock_command(legal_entity_id,command_id,idempotency_key,payload_sha256,
 kind,source_document_id,source_action_key,actor_subject,approval_id,approval_revision,
 warehouse_id,item_code,location_id,batch_no,serial_no,site_id,quantity_micro)
VALUES('HFTP1','CMD-ISSUE-P1','KEY-ISSUE-P1',repeat('c',64),
 'ISSUE',:'issue_uuid','ISS-P1-L1','STAFFP1','APPROV-ISSUE-P1',1,
 'WHP1','ITEMP1','LOCP1','','','SITEP1',2000000)
RETURNING id::text AS issue_command_uuid \gset
INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro,employee_id)
VALUES(:'issue_command_uuid'::uuid,:'available_acct_uuid'::uuid,'AVAILABLE',-2000000,'EMPP1'),
      (:'issue_command_uuid'::uuid,:'custody_acct_uuid'::uuid,'CUSTODY',2000000,'EMPP1');
UPDATE hft.stock_account SET qty_micro=3000000,version=version+1
 WHERE id=:'available_acct_uuid'::uuid;
UPDATE hft.stock_account SET qty_micro=2000000,version=version+1
 WHERE id=:'custody_acct_uuid'::uuid;
INSERT INTO hft.employee_custody(legal_entity_id,employee_id,issue_command_id,
 item_code,warehouse_id,issued_micro,location_id)
VALUES('HFTP1','EMPP1',:'issue_command_uuid'::uuid,'ITEMP1','WHP1',2000000,'LOCP1');
UPDATE hft.material_issue_line SET issued_micro=2000000
 WHERE issue_id=:'issue_uuid'::uuid AND source_action_key='ISS-P1-L1';
UPDATE hft.material_issue SET status='ISSUED',version=version+1
 WHERE id=:'issue_uuid'::uuid;
WITH f AS (
 SELECT jsonb_build_object('commandId','CMD-ISSUE-P1','kind','ISSUE',
   'sourceDocumentId',:'issue_uuid','entityId','HFTP1','warehouseId','WHP1',
   'locationId','LOCP1','itemCode','ITEMP1','operatorId','STAFFP1','employeeId','EMPP1',
   'movements',jsonb_build_array(
    jsonb_build_object('bucket','AVAILABLE','delta','-2'),
    jsonb_build_object('bucket','CUSTODY','delta','2'))) AS fact
), e AS (
 SELECT jsonb_build_object('schema','HFT_STOCK_EVENT_V2','commandId','CMD-ISSUE-P1',
  'entity','HFTP1','actor','STAFFP1','approvalId','APPROV-ISSUE-P1',
  'approvalRevision',1,'available','3','accountVersion',2,'fact',fact) AS event FROM f
)
INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,canonical_sha256)
SELECT :'issue_command_uuid'::uuid,event,event::text,
  encode(sha256(convert_to(event::text,'UTF8')),'hex') FROM e
RETURNING id::text AS issue_outbox_uuid \gset
INSERT INTO hft.audit_delivery(outbox_id,state)
VALUES(:'issue_outbox_uuid'::uuid,'PENDING');
WITH f AS (
 SELECT canonical_event->'fact' AS fact FROM hft.audit_outbox
 WHERE command_id=:'issue_command_uuid'::uuid
)
INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
SELECT :'issue_command_uuid'::uuid,jsonb_build_object('commandId','CMD-ISSUE-P1',
 'accountVersion',2,'available','3','fact',fact,'replay',false),'STAFFP1' FROM f;
SELECT hft.seal_stock_command_v1(:'issue_command_uuid'::uuid);
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

-- Fail if the reader attempts row locks on committed commands, receipts,
-- outcome, account, seal, invoice or audit tables.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT hft.assert_command_seal_v1(id) FROM hft.stock_command
 WHERE command_id IN ('CMDP1','CMD-ISSUE-P1') ORDER BY committed_at,id;
SELECT hft.assert_grn_receipt_cumulative_v2(id) FROM hft.grn
 WHERE legal_entity_id='HFTP1';
DO $assert$
DECLARE old_post bigint;old_ver bigint; current_qty bigint; current_ver bigint;
BEGIN
 SELECT s.available_after_micro,s.available_after_version INTO old_post,old_ver
 FROM hft.stock_command_seal s JOIN hft.stock_command c ON c.id=s.command_id
 WHERE c.command_id='CMDP1';
 SELECT qty_micro,version INTO current_qty,current_ver FROM hft.stock_account a
 WHERE a.legal_entity_id='HFTP1' AND a.warehouse_id='WHP1'
 AND a.item_code='ITEMP1' AND a.location_key='LOCP1' AND a.account_kind='AVAILABLE';
 IF old_post<>5000000 OR old_ver<>1 OR current_qty<>3000000 OR current_ver<>2 THEN
  RAISE EXCEPTION 'HFT_P1_HISTORIC_SEAL_MUST_NOT_USE_CURRENT_BALANCE';
 END IF;
 IF (SELECT count(*) FROM hft.stock_command_seal s JOIN hft.stock_command c ON c.id=s.command_id
     WHERE c.command_id IN ('CMDP1','CMD-ISSUE-P1'))<>2 THEN
  RAISE EXCEPTION 'HFT_P1_TWO_COMMAND_SEALS_REQUIRED';
 END IF;
END $assert$;
COMMIT;
