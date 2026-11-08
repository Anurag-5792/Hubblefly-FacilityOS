-- HFT OPS-A2 — AUTHENTICATED P0 SOURCE RESOLVER, READBACK AND
-- UNCERTAIN-COMMIT RECOVERY — SOURCE ONLY, NOT EXECUTABLE.
BEGIN;
DO $STOP_OPS_A2_READ$
BEGIN RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'; END
$STOP_OPS_A2_READ$;

-- P0 browser command is authenticated using the existing P0 proof, then
-- compared against a persisted, independently approved exact source binding.
-- P2 writer independently rechecks the same original source and governance.
-- The runtime resolver call MUST use an isolated SERIALIZABLE transaction
-- because P0 human/key verification includes FOR SHARE row locks.
CREATE OR REPLACE FUNCTION hft.ops_a2_resolve_authorized_v2(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $resolve$
DECLARE
 actor text;b hft.ops_a2_source_binding%ROWTYPE;
 action text;doc text;source_action text;payload jsonb;cmd jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'OPS_A2_RESOLVER_PROTECTED_TRANSACTION_REQUIRED'; END IF;
 -- No nonce consumed here; the separate P2 V2 writer consumes the signed
 -- source-bound original posting nonce only inside its own atomic transaction.
 actor:=hft.p0_verify_stores_proof_v1(p,proof);
 IF p->>'kind' NOT IN ('IN','OUT','TRANSFER')
 THEN RAISE EXCEPTION 'OPS_A2_P0_OPERATION_NOT_QUALIFIED'; END IF;
 action:=CASE p->>'kind' WHEN 'IN' THEN 'RECEIVE'
  WHEN 'OUT' THEN 'ISSUE' ELSE 'TRANSFER' END;
 SELECT * INTO b FROM hft.ops_a2_source_binding AS src
  WHERE src.request_id=(p->>'requestId')::uuid
   AND src.legal_entity_id=p->>'legalEntityId'
   AND src.site_id=p->>'siteId'
   AND src.warehouse_id=p->>'warehouseId'
   AND src.item_code=p->>'itemCode'
   AND src.product_version_code=p->>'productVersion'
   AND src.actor_subject=actor
   AND src.action_kind=action
   AND src.p0_payload_sha256=hft.p0_stores_payload_sha256_v1(p)
   AND src.status='APPROVED'
  FOR SHARE;
 IF b.request_id IS NULL THEN
  RAISE EXCEPTION 'OPS_A2_AUTHENTICATED_P0_SOURCE_NOT_IN_APPROVED_RECORD'; END IF;
 IF p->>'kind'='IN' THEN
  IF p->>'qcState'<>'ACCEPTED' OR b.inspection_evidence_id<>p->>'qcEvidenceId'
  -- Original P0 uppercase UUID maps only to typed lowercase PostgreSQL UUID.
  -- Persisted receipt_key + line_no, never an arbitrary browser action alias.
  OR p->>'grnId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  OR b.source_document_id<>pg_catalog.lower(p->>'grnId')
  OR NOT EXISTS(SELECT 1 FROM hft.grn_partial_receipt AS r
    WHERE r.grn_id::text=b.source_document_id
    AND r.legal_entity_id=b.legal_entity_id
    AND r.warehouse_id=b.warehouse_id
    AND r.location_id=b.destination_leaf
    AND r.receipt_key=p->>'receiptKey'
    AND b.source_action_key=r.receipt_key||':'||r.line_no::text
    AND r.ops_a2_item_code=b.item_code
    AND r.ops_a2_product_version_code=b.product_version_code)
  OR b.destination_leaf<>p->>'leafLocationId'
  THEN RAISE EXCEPTION 'OPS_A2_GRN_QC_SOURCE_NOT_VERIFIED'; END IF;
 ELSIF p->>'kind'='OUT' THEN
  IF p->>'issueDocumentId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  OR b.source_document_id<>pg_catalog.lower(p->>'issueDocumentId')
  OR b.source_action_key<>p->>'fragmentId'
  OR b.employee_id<>p->>'employeeId'
  OR b.source_leaf<>p->>'leafLocationId'
  THEN RAISE EXCEPTION 'OPS_A2_EMPLOYEE_ISSUE_SOURCE_NOT_VERIFIED'; END IF;
 ELSE
  IF p->>'transferDocumentId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  OR b.source_document_id<>pg_catalog.lower(p->>'transferDocumentId')
  OR b.source_leaf<>p->>'sourceLeafId'
  OR b.destination_leaf<>p->>'destinationLeafId'
  OR b.source_leaf=b.destination_leaf
  THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_SOURCE_NOT_VERIFIED'; END IF;
 END IF;
 -- Distinct signed account identities and expected account versions are
 -- resolved from independently governed DB records, never browser fields.
 cmd:=pg_catalog.jsonb_build_object(
  'commandId',p->>'requestId','idempotencyKey',p->>'requestId',
  'kind',action,'legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo',
  'requestQuantity',hft.format_signed_micro_v2(b.authorized_micro),
  'sourceLeafId',b.source_leaf,'destinationLeafId',b.destination_leaf,
  'expectedSourceAccountVersion',b.source_account_before_version,
  'expectedDestinationAccountVersion',b.dest_account_before_version,
  'employeeId',b.employee_id,'originalIssueId',b.original_issue_id,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,'fragmentId',b.fragment_id,
  'sourceRevision',b.source_revision,'approvalId',b.approval_id,
  'approvalRevision',b.approval_revision,
  'policyGeneration',b.policy_generation,
  'actorSubject',actor,'approvedBy',b.approver_subject,
  'inspectedCondition','GOOD',
  'inspectionEvidenceId',b.inspection_evidence_id);
 payload:=pg_catalog.jsonb_build_object(
  'contractVersion','HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED',
  'commandId',p->>'requestId','idempotencyKey',p->>'requestId',
  'kind',action,'legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo','sourceLeafId',b.source_leaf,
  'destinationLeafId',b.destination_leaf,
  'sourceAccountId',COALESCE(b.source_account_id::text,''),
  'destinationAccountId',b.destination_account_id::text,
  'sourceAccountBeforeVersion',COALESCE(b.source_account_before_version::text,''),
  'destinationAccountBeforeVersion',b.dest_account_before_version::text,
  'employeeId',b.employee_id,'originalIssueId',b.original_issue_id,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,'fragmentId',b.fragment_id,
  'quantityMicro',b.authorized_micro::text,
  'sourceRevision',b.source_revision::text,
  'approvalId',b.approval_id,'approvalRevision',b.approval_revision::text,
  'policyGeneration',b.policy_generation::text,
  'approvedPayloadSha256',b.approved_scope_sha256,
  'approvedBy',b.approver_subject,'actorSubject',actor,
  'inspectedCondition','GOOD',
  'inspectionEvidenceId',b.inspection_evidence_id);
 -- Recheck persisted approval/person/Holds/typed source BEFORE releasing
 -- the prospective V2 bytes to the trusted server signer.
 PERFORM hft.ops_a2_authorized_source_v2(payload);
 RETURN pg_catalog.jsonb_build_object(
  'state','OPS_A2_AUTHORIZED_SOURCE_V2',
  'issuer','HFT_P2_PROTECTED_DATABASE','actorSubject',actor,
  'sessionId',proof->>'sessionId','legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,
  'approvalPayloadSha256',b.approved_scope_sha256,
  'sourceAccountId',COALESCE(b.source_account_id::text,''),
  'destinationAccountId',b.destination_account_id::text,
  'command',cmd);
END $resolve$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Uncertain COMMIT: original proof and persisted nonce identity ONLY.
-- This is STRICTLY READ ONLY, even if original signer key was retired.
CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v2(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $reconcile$
DECLARE
 c hft.stock_command%ROWTYPE;
 n hft.posting_invocation_nonce%ROWTYPE;
 envelope hft.ops_a2_command_envelope%ROWTYPE;
 sess hft.posting_session%ROWTYPE;
 sha text;fact jsonb;policy_generation bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'OPS_A2_READ_ONLY_RUNTIME_REQUIRED'; END IF;
 PERFORM hft.ops_a_payload_fields_v2(p);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR proof->>'proofVersion'<>'HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED'
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,8}$'
 OR (proof->>'issuedAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,18}$'
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_ORIGINAL_PROOF_REQUIRED'; END IF;
 sha:=hft.ops_a_payload_digest_v2(p);
 IF sha<>proof->>'payloadSha256'
 OR proof->>'actorSubject'<>p->>'actorSubject'
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_ORIGINAL_PAYLOAD_MISMATCH'; END IF;
 SELECT * INTO c FROM hft.stock_command WHERE
  legal_entity_id=p->>'legalEntityId' AND command_id=p->>'commandId';
 IF c.id IS NULL THEN
  PERFORM 1 FROM hft.stock_command WHERE
   legal_entity_id=p->>'legalEntityId'
   AND idempotency_key=p->>'idempotencyKey';
  IF FOUND THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object(
   'state','INDETERMINATE_NOT_FOUND','automaticRetryAllowed',false);
 END IF;
 SELECT * INTO envelope FROM hft.ops_a2_command_envelope
 WHERE command_uuid=c.id;
 SELECT * INTO n FROM hft.posting_invocation_nonce
 WHERE key_version=(proof->>'keyVersion')::integer
 AND nonce=proof->>'nonce' AND command_id=c.command_id
 AND legal_entity_id=c.legal_entity_id
 AND payload_sha256=sha
 AND actor_subject=proof->>'actorSubject'
 AND session_id=proof->>'sessionId'
 AND proof_issued_at_epoch=(proof->>'issuedAt')::bigint
 AND expires_at=pg_catalog.to_timestamp((proof->>'expiresAt')::bigint)
 AND proof_mac_sha256=pg_catalog.encode(hft_crypto.digest(
  pg_catalog.decode(proof->>'macSha256','hex'),'sha256'),'hex');
 SELECT * INTO sess FROM hft.posting_session
 WHERE session_id=proof->>'sessionId'
 AND actor_subject=proof->>'actorSubject'
 AND revoked_at IS NULL AND expires_at>pg_catalog.clock_timestamp();
 IF envelope.command_uuid IS NULL OR n.nonce IS NULL OR sess.session_id IS NULL
 OR c.payload_sha256<>sha OR c.idempotency_key<>p->>'idempotencyKey'
 OR c.product_version_code<>p->>'productVersion'
 OR c.kind<>p->>'kind' OR c.actor_subject<>proof->>'actorSubject'
 OR envelope.exact_payload<>p OR envelope.payload_sha256<>sha
 OR envelope.nonce<>proof->>'nonce'
 OR envelope.proof_mac_sha256<>n.proof_mac_sha256
 OR envelope.actor_session_id<>proof->>'sessionId'
 OR NOT EXISTS(SELECT 1 FROM hft.audit_outbox a
  JOIN hft.audit_delivery d ON d.outbox_id=a.id
  WHERE a.command_id=c.id)
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_SOURCE_NONCE_OR_AUDIT_MISMATCH'; END IF;
 PERFORM hft.ops_a2_assert_command_seal_v2(c.id);
 fact:=hft.ops_a2_fact_v2(c.id);
 IF fact->>'movementSha256'<>envelope.version_movement_sha256
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_VERSIONED_MOVEMENT_DRIFT'; END IF;
 SELECT generation INTO policy_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=c.legal_entity_id AND site_id=c.site_id
 AND warehouse_id=c.warehouse_id;
 IF policy_generation IS NULL THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_POLICY_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object('state','COMMITTED_VERIFIED',
  'automaticRetryAllowed',false,'payloadSha256',sha,
  'originalNonce',proof->>'nonce',
  'sourceEpoch','POLICY-'||policy_generation::text,
  'auditVerified',true,'fact',fact);
END $reconcile$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_reconcile_post_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Readback test/source contract: the current P0 READ HMAC is verified
-- in a REPEATABLE READ READ ONLY transaction. No nonce write or direct
-- runtime table grants are permitted.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_readproof_v2(q jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $readproof$
DECLARE names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 k hft_secret.p0_stores_proof_key%ROWTYPE;
 field text;digest text;mac_expected bytea;mac_claimed bytea;
 i integer;v integer;xor_bits integer:=0;issued bigint;expiry bigint;now_epoch bigint;
 fields text[];
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR pg_catalog.jsonb_typeof(q)<>'object' OR
 (SELECT count(*) FROM pg_catalog.jsonb_object_keys(q))<>11
 OR pg_catalog.jsonb_typeof(proof)<>'object' OR
 (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_OR_QUERY_INVALID'; END IF;
 FOREACH field IN ARRAY names LOOP
  IF NOT(proof?field) OR pg_catalog.jsonb_typeof(proof->field)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_FIELDS_INVALID'; END IF;
 END LOOP;
 IF proof->>'proofVersion'<>'HFT-R1-P0-STORES-READ-HMAC-V1'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_FORMAT_INVALID'; END IF;
 fields:=ARRAY[q->>'contractVersion',q->>'intent',
  q->>'legalEntityId',q->>'siteId',q->>'warehouseId',
  q->>'itemCode',q->>'productVersion',q->>'leafLocationId',
  q->>'employeeId',q->>'cursor',q->>'limit'];
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(fields) AS v WHERE v IS NULL)
 OR q->>'contractVersion'<>'HFT-R1-P0-READ-V1'
 OR q->>'intent' NOT IN('BALANCES','MOVEMENTS','CUSTODY')
 OR q->>'cursor'<>'' OR
 q->>'limit' !~ '^[1-9][0-9]{0,2}$' OR
 (q->>'limit')::integer>100 OR
 (q->>'intent')='CUSTODY' AND q->>'employeeId'=''
 THEN RAISE EXCEPTION 'OPS_A2_READ_SCOPE_OR_UNQUALIFIED_CURSOR'; END IF;
 digest:=pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(fields),'sha256'),'hex');
 IF digest<>proof->>'payloadSha256'
 THEN RAISE EXCEPTION 'OPS_A2_READ_QUERY_DIGEST_MISMATCH'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expiry:=(proof->>'expiresAt')::bigint;
 v:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expiry<=now_epoch OR expiry<=issued OR expiry-issued>40
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_EXPIRED_OR_FUTURE'; END IF;
 SELECT * INTO k FROM hft_secret.p0_stores_proof_key WHERE key_version=v;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL OR
 pg_catalog.clock_timestamp()<k.not_before OR
 pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_READ_SIGNING_KEY_UNAVAILABLE'; END IF;
 mac_expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(
  ARRAY[proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  digest,proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',
  proof->>'keyVersion']),k.key_bytes,'sha256');
 mac_claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 FOR i IN 0..31 LOOP
  xor_bits:=xor_bits | (pg_catalog.get_byte(mac_expected,i) #
                        pg_catalog.get_byte(mac_claimed,i));
 END LOOP;
 IF xor_bits<>0 THEN RAISE EXCEPTION 'OPS_A2_READ_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_READ_SESSION_REVOKED'; END IF;
 PERFORM 1 FROM hft.actor_warehouse_grant g
 WHERE g.actor_subject=proof->>'actorSubject'
 AND g.legal_entity_id=q->>'legalEntityId'
 AND g.site_id=q->>'siteId' AND g.warehouse_id=q->>'warehouseId'
 AND g.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_READ_PERSISTED_SCOPE_DENIED'; END IF;
 RETURN proof->>'actorSubject';
END $readproof$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_verify_readproof_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Bounded (<100 rows), NO PARTIAL INVENTORY DISGUISED AS A FULL COUNT.
-- No silent cursor drift: until source-bound snapshot pagination is
-- independently qualified, any request requiring a second page DENIES.
CREATE OR REPLACE FUNCTION hft.ops_a2_read_authoritative_v2(q jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read$
DECLARE actor text;scope_count bigint;reconstructed bigint;
 a record;c record;row jsonb;rows jsonb:='[]'::jsonb;
 latest_audit text;last_move text;ack text;source_epoch text;
 digest_input text;command_record record;scope_generation bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'OPS_A2_READ_ONLY_TRANSACTION_REQUIRED'; END IF;
 actor:=hft.ops_a2_verify_readproof_v2(q,proof);
 -- True original immutable account reconstruction precedes every response.
 FOR a IN SELECT id,qty_micro,version FROM hft.stock_account
  WHERE legal_entity_id=q->>'legalEntityId' AND site_id=q->>'siteId'
   AND warehouse_id=q->>'warehouseId'
 LOOP
  SELECT COALESCE(sum(qty_delta_micro),0),
    COALESCE(count(*),0)
  INTO reconstructed,scope_count FROM hft.stock_entry
  WHERE account_id=a.id;
  IF a.qty_micro<>reconstructed OR a.version<>scope_count
  THEN RAISE EXCEPTION 'OPS_A2_READ_ACCOUNT_RECONSTRUCTION_INVALID'; END IF;
 END LOOP;
 -- Every source command in the requested scope must have an authentic
 -- immutable seal, audit, original nonce and exactly two matching ledger legs.
 FOR command_record IN SELECT id,payload_contract_version
  FROM hft.stock_command
 WHERE legal_entity_id=q->>'legalEntityId'
  AND site_id=q->>'siteId'
  AND warehouse_id=q->>'warehouseId'
 LOOP
  IF command_record.payload_contract_version='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
  THEN PERFORM hft.ops_a2_assert_command_seal_v2(command_record.id);
  ELSE PERFORM hft.assert_command_seal_v1(command_record.id);
  END IF;
 END LOOP;
 IF q->>'intent'='MOVEMENTS' THEN
  FOR c IN
   SELECT e.id AS entry_id,e.qty_delta_micro,a.*,
    audit.canonical_sha256
   FROM hft.stock_entry AS e
   JOIN hft.stock_account AS a ON a.id=e.account_id
   JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
   WHERE a.legal_entity_id=q->>'legalEntityId'
    AND a.site_id=q->>'siteId' AND a.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR a.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR a.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR a.location_key=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR a.custodian_employee_id=q->>'employeeId')
   ORDER BY e.id LIMIT (q->>'limit')::integer+1
  LOOP
   rows:=rows||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
      'warehouseId',c.warehouse_id,'itemCode',c.item_code,
      'productVersion',c.product_version_code,'leafLocationId',c.location_key,
      'accountKind',c.account_kind,'condition',c.condition,
      'serialNo',c.serial_key,'batchNo',c.batch_key,
      'employeeId',c.custodian_employee_id,
      'quantity',hft.format_signed_micro_v2(c.qty_delta_micro),
      'accountVersion',c.version,'movementId','ENTRY-'||c.entry_id::text,
      'auditSha256',c.canonical_sha256,
      'humanAcknowledgement','NOT_APPLICABLE'));
  END LOOP;
 ELSIF q->>'intent'='CUSTODY' THEN
  -- One row per ORIGINAL ISSUE, never a latest-ACK inference on an
  -- aggregate CUSTODY account. Separate issue/fragment provenance survives.
  FOR c IN
   SELECT cu.issue_command_id,cu.legal_entity_id,issue.site_id,
    cu.warehouse_id,cu.item_code,cu.product_version_code,
    cu.location_id,cu.employee_id,cu.serial_no,cu.batch_no,
    cu.issued_micro-cu.returned_micro AS outstanding_micro,
    a.version AS account_version,ack.state AS ack_state,
    audit.canonical_sha256 AS source_audit,issue.command_id AS original_issue_id
   FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS issue ON issue.id=cu.issue_command_id
   JOIN hft.custody_ack_status_v1 AS ack
    ON ack.issue_command_uuid=cu.issue_command_id
    AND ack.legal_entity_id=cu.legal_entity_id
    AND ack.employee_id=cu.employee_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cu.issue_command_id
   JOIN hft.stock_account AS a
    ON a.legal_entity_id=cu.legal_entity_id
    AND a.site_id=issue.site_id AND a.warehouse_id=cu.warehouse_id
    AND a.item_code=cu.item_code
    AND a.product_version_code=cu.product_version_code
    AND a.location_key=cu.location_id
    AND a.account_kind='CUSTODY'
    AND a.custodian_employee_id=cu.employee_id
    AND a.serial_key=cu.serial_no AND a.batch_key=cu.batch_no
   WHERE cu.legal_entity_id=q->>'legalEntityId'
    AND issue.site_id=q->>'siteId'
    AND cu.warehouse_id=q->>'warehouseId'
    AND cu.employee_id=q->>'employeeId'
    AND cu.issued_micro>cu.returned_micro
    AND (q->>'itemCode'='' OR cu.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR cu.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR cu.location_id=q->>'leafLocationId')
   ORDER BY cu.issue_command_id LIMIT (q->>'limit')::integer+1
  LOOP
   IF c.ack_state NOT IN('ACK_PENDING','ACKNOWLEDGED','DISPUTED')
   THEN RAISE EXCEPTION 'OPS_A2_CUSTODY_ACK_STATE_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_id,
    'accountKind','CUSTODY','condition','GOOD',
    'serialNo',c.serial_no,'batchNo',c.batch_no,'employeeId',c.employee_id,
    'quantity',hft.format_signed_micro_v2(c.outstanding_micro),
    'accountVersion',c.account_version,
    'movementId','ISSUE-'||c.issue_command_id::text,
    'originalIssueId',c.original_issue_id,
    'auditSha256',c.source_audit,'humanAcknowledgement',c.ack_state));
  END LOOP;
 ELSE
  FOR c IN
   SELECT a.*,COALESCE(
    (SELECT audit.canonical_sha256 FROM hft.stock_entry e
     JOIN hft.audit_outbox audit ON audit.command_id=e.command_id
     WHERE e.account_id=a.id ORDER BY e.id DESC LIMIT 1),repeat('0',64))
      AS source_audit
   FROM hft.stock_account a
   WHERE a.legal_entity_id=q->>'legalEntityId'
    AND a.site_id=q->>'siteId' AND a.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR a.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR a.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR a.location_key=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR a.custodian_employee_id=q->>'employeeId')
    AND (q->>'intent'<>'CUSTODY' OR
      a.account_kind='CUSTODY' AND a.custodian_employee_id=q->>'employeeId')
   ORDER BY a.item_code,a.product_version_code,a.location_key,a.id
   LIMIT (q->>'limit')::integer+1
  LOOP
   IF c.qty_micro=0 AND c.version=0 THEN
    RAISE EXCEPTION 'OPS_A2_UNATTESTED_ZERO_OPENING_ACCOUNT'; END IF;
   ack:='NOT_APPLICABLE';
   IF q->>'intent'='CUSTODY' THEN
    SELECT status.state INTO ack FROM hft.employee_custody AS cust
    JOIN hft.stock_command AS issue ON issue.id=cust.issue_command_id
    JOIN hft.custody_ack_status_v1 AS status ON
     status.issue_command_uuid=cust.issue_command_id
    WHERE cust.legal_entity_id=c.legal_entity_id
    AND cust.employee_id=c.custodian_employee_id
    AND cust.item_code=c.item_code
    AND cust.product_version_code=c.product_version_code
    AND cust.location_id=c.location_key
    AND cust.serial_no=c.serial_key AND cust.batch_no=c.batch_key
    AND cust.issued_micro>cust.returned_micro
    AND issue.legal_entity_id=c.legal_entity_id
    ORDER BY issue.committed_at DESC LIMIT 1;
    IF ack IS NULL THEN RAISE EXCEPTION 'OPS_A2_CUSTODY_ACK_READBACK_MISSING'; END IF;
   END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,
    'leafLocationId',c.location_key,'accountKind',c.account_kind,
    'condition',c.condition,'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_micro),
    'accountVersion',c.version,'movementId','ACCOUNT-'||c.id::text,
    'auditSha256',c.source_audit,'humanAcknowledgement',ack));
  END LOOP;
 END IF;
 IF pg_catalog.jsonb_array_length(rows)>(q->>'limit')::integer
 THEN RAISE EXCEPTION 'OPS_A2_READ_UNQUALIFIED_MULTI_PAGE_SNAPSHOT'; END IF;
 SELECT generation INTO scope_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=q->>'legalEntityId'
 AND site_id=q->>'siteId' AND warehouse_id=q->>'warehouseId';
 IF scope_generation IS NULL THEN RAISE EXCEPTION 'OPS_A2_READ_POLICY_EPOCH_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'state','AUTHORITATIVE_VERSIONED_READ',
  'versionAuthority','OPS_A2_VERSION_AWARE_V2',
  'intent',q->>'intent','sourceEpoch','POLICY-'||scope_generation::text,
  'nextCursor','','durable',true,'synthetic',false,'auditVerified',true,
  'rows',rows);
END $read$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_read_authoritative_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;
-- No grants in this candidate. The actual future runtime allowlist MUST
-- include exactly the vetted resolver, writer, reconcile and readback
-- functions under distinct qualified nonowner logins after independent
-- privilege proofs. No PUBLIC inherited EXECUTE or direct protected table DML.
COMMIT;
