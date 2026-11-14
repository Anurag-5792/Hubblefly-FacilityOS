-- HFT R77 RECEIVE — EXACT-SCOPE DISPOSABLE QUALIFICATION GATEWAY CANDIDATE.
-- SOURCE ONLY. Never run without independently admitted PostgreSQL 18.6
-- resource, approved migration, verified role/ACL installer and fixture registry.
-- THIS IS NOT A MIGRATION, RUNTIME ENDPOINT OR POSTING AUTHORIZATION.
-- Do NOT grant ordinary app-runtime login EXECUTE on hft protected functions.
-- Separately admitted non-LOGIN hft_r77_gateway_owner receives only exact
-- EXECUTE on the three protected entrypoints and SELECT on the limited QA
-- evidence tables. Exact grants/owner transfers require Chat 10 approval.
-- The QA login must be a member of hft_r1_app_runtime for protected
-- session_user checks, but must not inherit the gateway owner or posting owner.
BEGIN;
DO $STOP_R77_GATEWAY$ BEGIN
 RAISE EXCEPTION 'HFT_R77_RECEIVE_QUALIFICATION_INSTALLATION_HOLD';
END $STOP_R77_GATEWAY$;

CREATE SCHEMA hft_qa077;
REVOKE ALL ON SCHEMA hft_qa077 FROM PUBLIC;

-- Independent installer inserts approved fixtures. Ordinary QA never inserts,
-- modifies, impersonates a signer or creates GRN/invoice/QC/approval authority.
-- The SHA values MUST be externally verified, not self-attested by a test.
CREATE TABLE hft_qa077.receive_fixture_v1(
 fixture_id uuid PRIMARY KEY,
 case_id text NOT NULL CHECK(case_id IN(
  'BULK_5','SERIAL_1','LATE_ROLLBACK','INVALID_ACTOR',
  'WRONG_BIN','CHANGED_QUANTITY','FORGED_RECEIPT',
  'INVALID_APPROVAL','REPLAY')),
 qa_login name NOT NULL,
 approved_payload jsonb NOT NULL,
 original_proof_sha256 text NOT NULL
   CHECK(original_proof_sha256~'^[0-9a-f]{64}$'),
 legal_entity_id text NOT NULL,site_id text NOT NULL,
 warehouse_id text NOT NULL,item_code text NOT NULL,
 product_version_code text NOT NULL,grn_id uuid NOT NULL,
 physical_receipt_uuid uuid NOT NULL,invoice_id uuid NOT NULL,
 invoice_line_uuid uuid NOT NULL,grn_line_no integer NOT NULL
   CHECK(grn_line_no>0),
 account_uuid uuid NOT NULL,leaf_location_id text NOT NULL,
 control_type text NOT NULL CHECK(control_type IN('NONE','BATCH','SERIAL')),
 serial_no text NOT NULL,batch_no text NOT NULL,
 expected_quantity_micro bigint NOT NULL CHECK(expected_quantity_micro>0),
 approval_id text NOT NULL,approval_revision bigint NOT NULL,
 approval_decision_sha256 text NOT NULL
  CHECK(approval_decision_sha256~'^[0-9a-f]{64}$'),
 approved_migration_sha256 text NOT NULL
  CHECK(approved_migration_sha256~'^[0-9a-f]{64}$'),
 approved_acl_sha256 text NOT NULL
  CHECK(approved_acl_sha256~'^[0-9a-f]{64}$'),
 independent_admission_sha256 text NOT NULL
  CHECK(independent_admission_sha256~'^[0-9a-f]{64}$'),
 admission_authority text NOT NULL CHECK(length(admission_authority)>1),
 admitted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 CHECK(expires_at>admitted_at),
 CHECK((case_id='BULK_5' AND expected_quantity_micro=5000000
        AND control_type<>'SERIAL') OR
       (case_id='SERIAL_1' AND expected_quantity_micro=1000000
        AND control_type='SERIAL' AND serial_no<>''
        AND batch_no='') OR
       (case_id NOT IN('BULK_5','SERIAL_1')))
);
REVOKE ALL ON hft_qa077.receive_fixture_v1 FROM PUBLIC,hft_r1_app_runtime;

-- The admission is immutable installer-owned evidence, not a user-submitted
-- arbitrary SQL payload. An out-of-band signed technical admission must match
-- the registered source/migration/ACL digests before execution is permitted.
CREATE OR REPLACE FUNCTION hft_qa077.assert_receive_fixture_v1(
 p_fixture uuid,p_case text,p jsonb,original_proof jsonb)
RETURNS hft_qa077.receive_fixture_v1 LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,pg_temp AS $assert_fixture$
DECLARE f hft_qa077.receive_fixture_v1%ROWTYPE;
BEGIN
 IF pg_catalog.current_setting('server_version_num')::integer<>180006
 OR pg_catalog.current_database() NOT LIKE 'hft_r1_disposable_%'
 OR pg_catalog.pg_is_in_recovery()
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r77_gateway_owner','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'R77_DISPOSABLE_SESSION_OR_ROLE_NOT_QUALIFIED'; END IF;
 SELECT * INTO f FROM hft_qa077.receive_fixture_v1
 WHERE fixture_id=p_fixture AND case_id=p_case AND qa_login=session_user
 AND admitted_at<=pg_catalog.clock_timestamp()
 AND expires_at>pg_catalog.clock_timestamp();
 IF f.fixture_id IS NULL
 THEN RAISE EXCEPTION 'R77_INDEPENDENT_ADMISSION_REQUIRED'; END IF;
 IF f.approved_payload IS DISTINCT FROM p
 OR f.original_proof_sha256 IS DISTINCT FROM
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   original_proof::text,'UTF8')),'hex')
 OR p->>'kind'<>'RECEIVE'
 OR p->>'legalEntityId'<>f.legal_entity_id
 OR p->>'siteId'<>f.site_id
 OR p->>'warehouseId'<>f.warehouse_id
 OR p->>'itemCode'<>f.item_code
 OR p->>'productVersion'<>f.product_version_code
 OR p->>'controlType'<>f.control_type
 OR p->>'serialNo'<>f.serial_no OR p->>'batchNo'<>f.batch_no
 OR p->>'approvalId'<>f.approval_id
 OR (p->>'approvalRevision')::bigint<>f.approval_revision
 OR p->>'quantityMicro'<>f.expected_quantity_micro::text
 OR original_proof->>'payloadSha256' !~ '^[0-9a-f]{64}$'
 OR original_proof->>'nonce' !~ '^[0-9a-f]{48}$'
 THEN RAISE EXCEPTION 'R77_ADMITTED_ORIGINAL_PAYLOAD_PROOF_SCOPE_MISMATCH'; END IF;
 RETURN f;
END $assert_fixture$;

-- The *only* protected posting call exposed to the QA driver. The gateway
-- owner is a separate NOLOGIN role, not an app login nor the posting owner.
-- Original proof/session, policy, source binding and writer constraints remain
-- verified by the unchanged hft.ops_a2_post_stock_command_v2().
CREATE OR REPLACE FUNCTION hft_qa077.post_receive_v1(
 p_fixture uuid,p_case text,p jsonb,original_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $r77_post$
DECLARE f hft_qa077.receive_fixture_v1%ROWTYPE;result jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'off'
 OR pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR p_case NOT IN('BULK_5','SERIAL_1','LATE_ROLLBACK')
 THEN RAISE EXCEPTION 'R77_POST_SERIALIZABLE_POSITIVE_CASE_REQUIRED'; END IF;
 f:=hft_qa077.assert_receive_fixture_v1(
   p_fixture,p_case,p,original_proof);
 -- A production admission must prove original invoice/GRN/QC/approval.
 -- Do not manufacture source records or change source counters here.
 IF p->>'sourceDocumentId'<>f.grn_id::text
 OR p->>'destinationLeafId'<>f.leaf_location_id
 OR p->>'destinationAccountId'<>f.account_uuid::text
 OR p->>'inspectionEvidenceId'=''
 OR p->>'approvedBy'=''
 THEN RAISE EXCEPTION 'R77_POSITIVE_ORIGINAL_SOURCE_IDENTITY_REQUIRED'; END IF;
 result:=hft.ops_a2_post_stock_command_v2(p,original_proof);
 IF result->>'state'<>'POSTED_PENDING_READBACK'
 OR result->>'commandId'<>p->>'commandId'
 THEN RAISE EXCEPTION 'R77_PROTECTED_WRITER_RESULT_UNVERIFIED'; END IF;
 RETURN result;
END $r77_post$;

-- Each independently pre-signed negative case MUST be externally admitted.
-- A REAL protected-writer refusal is required; a gateway/ACL denial cannot
-- count as a passed negative. Exception block is a SQL subtransaction.
CREATE OR REPLACE FUNCTION hft_qa077.challenge_receive_v1(
 p_fixture uuid,p_case text,p jsonb,original_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $r77_challenge$
DECLARE f hft_qa077.receive_fixture_v1%ROWTYPE;
 sqlstate_seen text;message_seen text;result jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'off'
 OR pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR p_case NOT IN('INVALID_ACTOR','WRONG_BIN','CHANGED_QUANTITY',
  'FORGED_RECEIPT','INVALID_APPROVAL','REPLAY')
 THEN RAISE EXCEPTION 'R77_NEGATIVE_CASE_SERIALIZABLE_REQUIRED'; END IF;
 f:=hft_qa077.assert_receive_fixture_v1(
   p_fixture,p_case,p,original_proof);
 BEGIN
  result:=hft.ops_a2_post_stock_command_v2(p,original_proof);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS sqlstate_seen=RETURNED_SQLSTATE,
    message_seen=MESSAGE_TEXT;
  IF sqlstate_seen='42501' OR sqlstate_seen='42883'
   OR message_seen LIKE 'R77_%'
  THEN RAISE EXCEPTION 'R77_NEGATIVE_GATEWAY_OR_PRIVILEGE_FAILURE'; END IF;
  RETURN pg_catalog.jsonb_build_object(
   'state','PROTECTED_WRITER_REJECTED','caseId',p_case,
   'sqlstate',sqlstate_seen,'reason',message_seen,
   'attemptWasRolledBack',true);
 END;
 -- An unexpected successful writer must abort the outer SQL transaction.
 RAISE EXCEPTION 'R77_UNEXPECTED_NEGATIVE_WRITER_ACCEPTANCE';
END $r77_challenge$;

-- Fresh current HMAC readproofs are authenticated by the protected reader,
-- not by possession of the original posting proof. No arbitrary SQL access.
CREATE OR REPLACE FUNCTION hft_qa077.read_receive_v1(
 p_fixture uuid,p_case text,q jsonb,fresh_read_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $r77_read$
DECLARE f hft_qa077.receive_fixture_v1%ROWTYPE; result jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR pg_catalog.current_setting('transaction_isolation')<>'repeatable read'
 THEN RAISE EXCEPTION 'R77_FRESH_READ_ONLY_SNAPSHOT_REQUIRED'; END IF;
 SELECT * INTO f FROM hft_qa077.receive_fixture_v1
 WHERE fixture_id=p_fixture AND case_id=p_case
 AND qa_login=session_user AND admitted_at<=pg_catalog.clock_timestamp()
 AND expires_at>pg_catalog.clock_timestamp();
 IF f.fixture_id IS NULL
 THEN RAISE EXCEPTION 'R77_READ_INDEPENDENT_ADMISSION_REQUIRED'; END IF;
 IF q->>'legalEntityId'<>f.legal_entity_id
 OR q->>'siteId'<>f.site_id OR q->>'warehouseId'<>f.warehouse_id
 OR q->>'itemCode'<>f.item_code
 OR q->>'productVersion'<>f.product_version_code
 OR q->>'employeeId'<>''
 OR q->>'cursor'<>''
 OR q->>'limit'<>'100'
 OR NOT (q->>'intent'='BALANCES' AND
          q->>'leafLocationId'=f.leaf_location_id
         OR q->>'intent'='MOVEMENTS' AND q->>'leafLocationId'='')
 THEN RAISE EXCEPTION 'R77_READ_NOT_EXACT_ADMITTED_SOURCE'; END IF;
 result:=hft.ops_a2_read_authoritative_v2(q,fresh_read_proof);
 IF result->>'state'<>'AUTHORITATIVE_VERSIONED_READ'
 OR result->>'auditVerified'<>'true'
 OR result->>'synthetic'<>'false'
 OR result->>'nextCursor'<>''
 THEN RAISE EXCEPTION 'R77_READ_AUTHORITY_INCOMPLETE'; END IF;
 RETURN result;
END $r77_read$;

-- Snapshot proves source counters + immutable effects outside the posting
-- transaction. A separately signed BALANCES read grants source authority.
CREATE OR REPLACE FUNCTION hft_qa077.observe_receive_v1(
 p_fixture uuid,p_case text,q jsonb,fresh_read_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $r77_observe$
DECLARE f hft_qa077.receive_fixture_v1%ROWTYPE;
 authenticated_balance jsonb;result jsonb;
BEGIN
 authenticated_balance:=hft_qa077.read_receive_v1(
   p_fixture,p_case,q,fresh_read_proof);
 SELECT * INTO f FROM hft_qa077.receive_fixture_v1
 WHERE fixture_id=p_fixture AND case_id=p_case AND qa_login=session_user;
 -- Deliberately include source and target facts even if command not posted.
 SELECT pg_catalog.jsonb_build_object(
 'state','R77_AUTHENTICATED_POSTGRESQL_OBSERVATION_NOT_ACCEPTANCE',
 'database',pg_catalog.current_database(),
 'sessionUser',session_user,'fixtureId',p_fixture,'caseId',p_case,
 'independentAdmissionSha256',f.independent_admission_sha256,
 'migrationSha256',f.approved_migration_sha256,
 'aclSha256',f.approved_acl_sha256,
 'grn',(SELECT pg_catalog.jsonb_build_object(
   'status',g.status,'authorizationRevision',g.authorization_revision,
   'authorizedBy',g.authorized_by,'invoiceId',g.invoice_id,
   'physicalReceiptId',g.physical_receipt_id)
   FROM hft.grn g WHERE g.id=f.grn_id AND g.legal_entity_id=f.legal_entity_id
    AND g.warehouse_id=f.warehouse_id),
 'allGrnLines',(SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('lineNo',gl.line_no,
    'acceptedMicro',gl.accepted_micro::text,'orderedMicro',gl.ordered_micro::text,
    'invoiceLineId',gl.invoice_line_id) ORDER BY gl.line_no),'[]'::jsonb)
   FROM hft.grn_line gl WHERE gl.grn_id=f.grn_id
    AND gl.legal_entity_id=f.legal_entity_id),
 'invoice',(SELECT pg_catalog.jsonb_build_object(
   'status',i.status,'supplierId',i.supplier_id,'invoiceKey',i.invoice_key)
   FROM hft.supplier_invoice i WHERE i.id=f.invoice_id
    AND i.legal_entity_id=f.legal_entity_id),
 'invoiceLine',(SELECT pg_catalog.jsonb_build_object(
   'authorizedMicro',il.authorized_micro::text,
   'receivedMicro',il.received_micro::text,'itemCode',il.item_code)
   FROM hft.supplier_invoice_line il WHERE il.id=f.invoice_line_uuid
    AND il.invoice_id=f.invoice_id AND il.legal_entity_id=f.legal_entity_id),
 'sourceBinding',(SELECT pg_catalog.jsonb_build_object(
   'status',sb.status,'sourceDocumentId',sb.source_document_id,
   'sourceActionKey',sb.source_action_key,'authorizedMicro',sb.authorized_micro::text,
   'approvalId',sb.approval_id,'approvalRevision',sb.approval_revision,
   'sourceRevision',sb.source_revision,'actorSubject',sb.actor_subject,
   'approvedBy',sb.approver_subject,'issuedBy',sb.issued_by,
   'issuerDecisionSha256',sb.issuer_decision_sha256)
   FROM hft.ops_a2_source_binding sb
   WHERE sb.request_id=(f.approved_payload->>'commandId')::uuid
    AND sb.legal_entity_id=f.legal_entity_id),
 'approval',(SELECT pg_catalog.jsonb_build_object(
   'approved',pa.approved,'documentId',pa.document_id,
   'sourceActionKey',pa.source_action_key,'quantityMicro',pa.quantity_micro::text,
   'approverSubject',pa.approver_subject,'actorSubject',pa.actor_subject,
   'inspectionEvidenceId',pa.inspection_evidence_id,
   'payloadSha256',pa.payload_sha256)
   FROM hft.protected_stock_approval pa
   WHERE pa.legal_entity_id=f.legal_entity_id
    AND pa.approval_id=f.approval_id
    AND pa.approval_revision=f.approval_revision),
 'approvalDecision',(SELECT pg_catalog.jsonb_build_object(
   'decisionEvidenceSha256',pd.decision_evidence_sha256,
   'sourceRevision',pd.source_revision,'payloadSha256',pd.payload_sha256)
   FROM hft.protected_approval_decision pd
   WHERE pd.legal_entity_id=f.legal_entity_id
    AND pd.approval_id=f.approval_id
    AND pd.approval_revision=f.approval_revision),
 'receipt',(SELECT pg_catalog.jsonb_build_object(
   'id',r.id,'grnId',r.grn_id,'lineNo',r.line_no,
   'acceptedMicro',r.accepted_micro::text,'qcState',r.qc_state,
   'qcEvidenceId',r.evidence_reference,'bin',r.location_id,
   'itemCode',r.ops_a2_item_code,'productVersion',r.ops_a2_product_version_code,
   'serialNo',r.serial_no,'batchNo',r.batch_no)
   FROM hft.grn_partial_receipt r WHERE r.id=f.physical_receipt_uuid
   AND r.grn_id=f.grn_id AND r.legal_entity_id=f.legal_entity_id),
 'account',(SELECT pg_catalog.jsonb_build_object(
   'accountId',a.id,'quantityMicro',a.qty_micro::text,
   'revision',a.version,'reservedMicro',a.reserved_micro::text,
   'bin',a.location_key,'kind',a.account_kind,'condition',a.condition,
   'itemCode',a.item_code,'productVersion',a.product_version_code,
   'serialNo',a.serial_key,'batchNo',a.batch_key)
   FROM hft.stock_account a WHERE a.id=f.account_uuid
    AND a.legal_entity_id=f.legal_entity_id AND a.site_id=f.site_id
    AND a.warehouse_id=f.warehouse_id),
 'serial',(SELECT pg_catalog.to_jsonb(s) FROM hft.serial_registry s
    WHERE f.control_type='SERIAL' AND s.legal_entity_id=f.legal_entity_id
     AND s.item_code=f.item_code AND s.serial_no=f.serial_no),
 'effects',(SELECT pg_catalog.jsonb_build_object(
   'commands',(SELECT count(*) FROM hft.stock_command c
     WHERE c.legal_entity_id=f.legal_entity_id
       AND c.command_id=f.approved_payload->>'commandId'),
   'receiptCommands',(SELECT count(*) FROM hft.stock_command c
     WHERE c.source_receipt_id=f.physical_receipt_uuid),
   'entries',(SELECT count(*) FROM hft.stock_entry e
     JOIN hft.stock_command c ON c.id=e.command_id
     WHERE c.legal_entity_id=f.legal_entity_id
      AND c.command_id=f.approved_payload->>'commandId'),
   'nonce',(SELECT count(*) FROM hft.posting_invocation_nonce n
     WHERE n.legal_entity_id=f.legal_entity_id
      AND n.command_id=f.approved_payload->>'commandId'),
   'seals',(SELECT count(*) FROM hft.stock_command_seal s
     JOIN hft.stock_command c ON c.id=s.command_id
     WHERE c.legal_entity_id=f.legal_entity_id
       AND c.command_id=f.approved_payload->>'commandId'),
   'audit',(SELECT count(*) FROM hft.audit_outbox a
     JOIN hft.stock_command c ON c.id=a.command_id
     WHERE c.legal_entity_id=f.legal_entity_id
      AND c.command_id=f.approved_payload->>'commandId'),
   'envelopes',(SELECT count(*) FROM hft.ops_a2_command_envelope v
     JOIN hft.stock_command c ON c.id=v.command_uuid
     WHERE c.legal_entity_id=f.legal_entity_id
      AND c.command_id=f.approved_payload->>'commandId'),
   'outcomes',(SELECT count(*) FROM hft.stock_command_outcome o
     JOIN hft.stock_command c ON c.id=o.command_id
     WHERE c.legal_entity_id=f.legal_entity_id
      AND c.command_id=f.approved_payload->>'commandId'),
   'auditDelivery',(SELECT count(*) FROM hft.audit_delivery d
     JOIN hft.audit_outbox a ON a.id=d.outbox_id
     JOIN hft.stock_command c ON c.id=a.command_id
     WHERE c.legal_entity_id=f.legal_entity_id
      AND c.command_id=f.approved_payload->>'commandId'),
   'auditDigest',(SELECT a.canonical_sha256 FROM hft.audit_outbox a
     JOIN hft.stock_command c ON c.id=a.command_id
     WHERE c.legal_entity_id=f.legal_entity_id
      AND c.command_id=f.approved_payload->>'commandId'),
   'internalCommandUuid',(SELECT c.id FROM hft.stock_command c
     WHERE c.legal_entity_id=f.legal_entity_id
       AND c.command_id=f.approved_payload->>'commandId'))),
 'balances',authenticated_balance)
 INTO result;
 RETURN result;
END $r77_observe$;

-- READ-ONLY reconciliation is independent of the posting transaction. It
-- still requires a genuinely fresh authenticated read proof and either the
-- original actor or approved cross-actor recovery-review entitlement.
CREATE OR REPLACE FUNCTION hft_qa077.reconcile_receive_v1(
 p_fixture uuid,p_case text,p jsonb,original_proof jsonb,
 q jsonb,fresh_read_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $r77_reconcile$
DECLARE f hft_qa077.receive_fixture_v1%ROWTYPE;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR pg_catalog.current_setting('transaction_isolation')<>'repeatable read'
 OR q->>'intent'<>'MOVEMENTS' OR q->>'limit'<>'1'
 OR q->>'cursor'<>''
 THEN RAISE EXCEPTION 'R77_RECOVERY_FRESH_READ_ONLY_PROOF_REQUIRED'; END IF;
 f:=hft_qa077.assert_receive_fixture_v1(
   p_fixture,p_case,p,original_proof);
 RETURN hft.ops_a2_reconcile_post_v3(
  p,original_proof,q,fresh_read_proof);
END $r77_reconcile$;

-- The independently qualified installer MUST (1) create the isolated NOLOGIN
-- hft_r77_gateway_owner, (2) transfer only these four SECDEF functions,
-- (3) grant exact protected EXECUTE to that owner ONLY, (4) grant only
-- hft_qa077 gateway EXECUTE to named, admitted QA LOGIN, (5) grant
-- confined table SELECT and assert helper execution to the gateway owner,
-- (6) deny PUBLIC, all app logins and QA direct protected EXECUTE/DML,
-- (7) verify all trust roots, source hashes and role inheritance post-install.
-- Do not put a generic "GRANT ... TO hft_r1_app_runtime" here.
REVOKE ALL ON FUNCTION
 hft_qa077.assert_receive_fixture_v1(uuid,text,jsonb,jsonb),
 hft_qa077.post_receive_v1(uuid,text,jsonb,jsonb),
 hft_qa077.challenge_receive_v1(uuid,text,jsonb,jsonb),
 hft_qa077.read_receive_v1(uuid,text,jsonb,jsonb),
 hft_qa077.observe_receive_v1(uuid,text,jsonb,jsonb),
 hft_qa077.reconcile_receive_v1(uuid,text,jsonb,jsonb,jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;
COMMIT;
