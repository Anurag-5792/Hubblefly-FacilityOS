-- HFT OPS-A2 — AUTHENTICATED P0 SOURCE RESOLVER, READBACK AND
-- UNCERTAIN-COMMIT RECOVERY — SOURCE ONLY, NOT EXECUTABLE.
BEGIN;
DO $STOP_OPS_A2_READ$
BEGIN RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'; END
$STOP_OPS_A2_READ$;

-- Strict, separately domain-separated RETURN HMAC for signed P0 transport.
-- Canonical order matches lib/hft/security/ops-a2-return-proof.ts. This is
-- NOT the existing P0 IN/OUT/TRANSFER signing contract.
CREATE OR REPLACE FUNCTION hft.ops_a2_return_payload_fields_v1(p jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $return_fields$
DECLARE
 keys text[]:=ARRAY['contractVersion','kind','requestId','legalEntityId',
 'siteId','warehouseId','itemCode','productVersion','controlType','quantity',
 'uom','serialNo','batchNo','leafLocationId','employeeId',
 'returnDocumentId','returnLineKey','originalIssueId',
 'inspectionEvidenceId','inspectedCondition'];
 f text;
BEGIN
 IF pg_catalog.jsonb_typeof(p)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p))<>20
 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p) AS k
    WHERE NOT k=ANY(keys))
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_EXACT_P0_SOURCE_REQUIRED'; END IF;
 FOREACH f IN ARRAY keys LOOP
  IF pg_catalog.jsonb_typeof(p->f)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_RETURN_P0_FIELDS_MUST_BE_STRINGS'; END IF;
 END LOOP;
 IF p->>'contractVersion'<>'HFT-R1-OPS-A2-RETURN-PREPARE-V1'
 OR p->>'kind'<>'RETURN'
 OR p->>'returnDocumentId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
 OR p->>'originalIssueId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR p->>'quantity' !~ '^(0|[1-9][0-9]*)([.][0-9]{1,6})?$'
 OR (p->>'quantity')::numeric<=0
 OR p->>'inspectedCondition' NOT IN('GOOD','DAMAGED','QUARANTINE')
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_P0_CANONICAL_IDENTITY_INVALID'; END IF;
 RETURN ARRAY(SELECT p->>k FROM pg_catalog.unnest(keys) AS k);
END $return_fields$;
CREATE OR REPLACE FUNCTION hft.ops_a2_return_payload_sha256_v1(p jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp
AS $return_digest$
 SELECT pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(hft.ops_a2_return_payload_fields_v1(p)),
  'sha256'),'hex');
$return_digest$;
REVOKE ALL ON FUNCTION hft.ops_a2_return_payload_fields_v1(jsonb),
 hft.ops_a2_return_payload_sha256_v1(jsonb) FROM PUBLIC,hft_r1_app_runtime;

CREATE OR REPLACE FUNCTION hft.ops_a2_verify_return_proof_v1(p jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,pg_temp AS $return_proof$
DECLARE
 k hft_secret.p0_stores_proof_key%ROWTYPE;
 f text;names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
  'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 expected bytea;claimed bytea;difference integer:=0;i integer;v integer;
 issued bigint;expires bigint;at_epoch bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_PROTECTED_PROOF_REQUIRED'; END IF;
 FOREACH f IN ARRAY names LOOP
  IF pg_catalog.jsonb_typeof(proof->f)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_RETURN_PROOF_STRING_FIELDS_REQUIRED'; END IF;
 END LOOP;
 IF proof->>'proofVersion'<>'HFT-R1-OPS-A2-RETURN-HMAC-V1'
 OR proof->>'payloadSha256'<>hft.ops_a2_return_payload_sha256_v1(p)
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_ORIGINAL_HMAC_FORMAT_INVALID'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expires:=(proof->>'expiresAt')::bigint;
 v:=(proof->>'keyVersion')::integer;
 at_epoch:=pg_catalog.floor(
  pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>at_epoch+30 OR expires<=at_epoch
 OR expires<=issued OR expires-issued>40
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_HMAC_EXPIRED'; END IF;
 SELECT * INTO k FROM hft_secret.p0_stores_proof_key
 WHERE key_version=v FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<k.not_before
 OR pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_KEY_REVOKED'; END IF;
 expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  proof->>'payloadSha256',proof->>'issuedAt',proof->>'expiresAt',
  proof->>'nonce',proof->>'keyVersion']),k.key_bytes,'sha256');
 claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 FOR i IN 0..31 LOOP
  difference:=difference | (
    pg_catalog.get_byte(expected,i) # pg_catalog.get_byte(claimed,i));
 END LOOP;
 IF difference<>0 THEN RAISE EXCEPTION 'OPS_A2_RETURN_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session AS sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_RETURN_SIGNED_SESSION_INVALID'; END IF;
 PERFORM 1 FROM hft.actor_warehouse_grant AS g
 WHERE g.legal_entity_id=p->>'legalEntityId' AND g.site_id=p->>'siteId'
 AND g.warehouse_id=p->>'warehouseId'
 AND g.actor_subject=proof->>'actorSubject' AND g.active AND g.may_post
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_RETURN_ACTOR_SCOPE_DENIED'; END IF;
 RETURN proof->>'actorSubject';
END $return_proof$;
REVOKE ALL ON FUNCTION hft.ops_a2_verify_return_proof_v1(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

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
  OR hft.ops_a2_resolve_signed_grn_line_v3(p,
    pg_catalog.jsonb_build_object(
      'sourceDocumentId',b.source_document_id,
      'sourceActionKey',b.source_action_key,
      'legalEntityId',b.legal_entity_id,'siteId',b.site_id,
      'warehouseId',b.warehouse_id,'itemCode',b.item_code,
      'productVersion',b.product_version_code,
      'controlType',p->>'controlType','serialNo',p->>'serialNo',
      'batchNo',p->>'batchNo',
      'destinationLeafId',b.destination_leaf,
      'inspectionEvidenceId',b.inspection_evidence_id,
      'quantityMicro',b.authorized_micro::text))
    IS DISTINCT FROM b.source_action_key
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

-- RETURN is separately authenticated: old P0 HMAC does not support RETURN.
-- No original-ISSUE/source leaf is accepted from a browser. It is resolved
-- from the independently governed source binding and still rechecked by
-- hft.ops_a2_authorized_source_v2 and the protected writer at posting time.
CREATE OR REPLACE FUNCTION hft.ops_a2_resolve_return_authorized_v2(
 p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $return_resolve$
DECLARE
 actor text;b hft.ops_a2_source_binding%ROWTYPE;
 action text:='RETURN';payload jsonb;cmd jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_ISOLATED_RUNTIME_REQUIRED'; END IF;
 actor:=hft.ops_a2_verify_return_proof_v1(p,proof);
 SELECT * INTO b FROM hft.ops_a2_source_binding AS src
 WHERE src.request_id=(p->>'requestId')::uuid
 AND src.legal_entity_id=p->>'legalEntityId'
 AND src.site_id=p->>'siteId'
 AND src.warehouse_id=p->>'warehouseId'
 AND src.item_code=p->>'itemCode'
 AND src.product_version_code=p->>'productVersion'
 AND src.actor_subject=actor
 AND src.action_kind='RETURN'
 AND src.status='APPROVED'
 AND src.p0_payload_sha256=hft.ops_a2_return_payload_sha256_v1(p)
 FOR SHARE;
 IF b.request_id IS NULL OR
 b.source_document_id<>pg_catalog.lower(p->>'returnDocumentId')
 OR b.source_action_key<>p->>'returnLineKey'
 OR b.fragment_id<>p->>'returnLineKey'
 OR b.original_issue_id<>p->>'originalIssueId'
 OR b.employee_id<>p->>'employeeId'
 OR b.destination_leaf<>p->>'leafLocationId'
 OR b.inspection_evidence_id<>p->>'inspectionEvidenceId'
 OR b.authorized_micro<>((p->>'quantity')::numeric*1000000)::bigint
 OR NOT EXISTS(SELECT 1 FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS original ON original.id=cu.issue_command_id
   WHERE original.legal_entity_id=b.legal_entity_id
   AND original.site_id=b.site_id
   AND original.warehouse_id=b.warehouse_id
   AND original.command_id=b.original_issue_id AND original.kind='ISSUE'
   AND original.product_version_code=b.product_version_code
   AND cu.legal_entity_id=b.legal_entity_id AND cu.employee_id=b.employee_id
   AND cu.item_code=b.item_code
   AND cu.product_version_code=b.product_version_code
   AND cu.location_id=b.source_leaf
   AND cu.issued_micro-cu.returned_micro>=b.authorized_micro)
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_ORIGINAL_CUSTODY_OR_SOURCE_UNVERIFIED'; END IF;
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
  'inspectedCondition',p->>'inspectedCondition',
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
  'inspectedCondition',p->>'inspectedCondition',
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
END $return_resolve$;
ALTER FUNCTION hft.ops_a2_resolve_return_authorized_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_resolve_return_authorized_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Uncertain COMMIT: original proof and persisted nonce identity ONLY.
-- This is STRICTLY READ ONLY, even if original signer key was retired.
CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v2(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $deny_old_recovery$
BEGIN
 RAISE EXCEPTION 'OPS_A2_RECOVERY_FRESH_AUTHENTICATION_V3_REQUIRED';
END $deny_old_recovery$;
REVOKE ALL ON FUNCTION hft.ops_a2_reconcile_post_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE
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
 AND actor_subject=proof->>'actorSubject';
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
ALTER FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;
-- 067: cross-actor historical verification requires a separately signed
-- CURRENT exact-scope recovery entitlement. It is NOT inferred from a
-- warehouse read grant or possession of the original posting proof.
-- Separate approved original issuer/key custody is externally qualified.
CREATE TABLE hft.ops_a2_recovery_reviewer_entitlement_v1(
 grant_id uuid PRIMARY KEY,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 item_code text NOT NULL,product_version_code text NOT NULL,
 original_command_id text NOT NULL,original_actor_subject text NOT NULL,
 original_payload_sha256 text NOT NULL
 CHECK(original_payload_sha256~'^[0-9a-f]{64}$'),
 original_nonce text NOT NULL CHECK(original_nonce~'^[0-9a-f]{48}$'),
 reviewer_subject text NOT NULL,reviewer_person_id text NOT NULL,
 approval_id text NOT NULL,approval_revision bigint NOT NULL
 CHECK(approval_revision>0),
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 decision_evidence_sha256 text NOT NULL
 CHECK(decision_evidence_sha256~'^[0-9a-f]{64}$'),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 CHECK(valid_from<valid_until),
 CHECK(reviewer_subject<>original_actor_subject),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(legal_entity_id,reviewer_person_id)
 REFERENCES hft.approval_human(legal_entity_id,person_id),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision)
);
CREATE TABLE hft.ops_a2_recovery_reviewer_revocation_v1(
 grant_id uuid PRIMARY KEY REFERENCES hft.ops_a2_recovery_reviewer_entitlement_v1(grant_id),
 revoked_by text NOT NULL,reason text NOT NULL,
 revoked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TRIGGER immutable_ops_a2_recovery_entitlement
 BEFORE UPDATE OR DELETE ON hft.ops_a2_recovery_reviewer_entitlement_v1
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER immutable_ops_a2_recovery_reviewer_revocation
 BEFORE UPDATE OR DELETE ON hft.ops_a2_recovery_reviewer_revocation_v1
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_recovery_reviewer_entitlement_v1,
 hft.ops_a2_recovery_reviewer_revocation_v1
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v3(
 p jsonb,original_proof jsonb,q jsonb,fresh_read_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $reconcile_v3$
DECLARE authenticated_actor text;
 grant hft.ops_a2_recovery_reviewer_entitlement_v1%ROWTYPE;
 original_approval hft.protected_stock_approval%ROWTYPE;
 original_decision hft.protected_approval_decision%ROWTYPE;
 reviewer_person text;original_person text;policy_epoch bigint;
 signed_scope jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_SEPARATE_READ_ONLY_RUNTIME_REQUIRED'; END IF;
 authenticated_actor:=hft.ops_a2_verify_readproof_v2(q,fresh_read_proof);
 IF authenticated_actor IS NULL OR q->>'intent'<>'MOVEMENTS'
 OR q->>'cursor'<>''
 OR q->>'legalEntityId' IS DISTINCT FROM p->>'legalEntityId'
 OR q->>'siteId' IS DISTINCT FROM p->>'siteId'
 OR q->>'warehouseId' IS DISTINCT FROM p->>'warehouseId'
 OR q->>'itemCode' IS DISTINCT FROM p->>'itemCode'
 OR q->>'productVersion' IS DISTINCT FROM p->>'productVersion'
 OR q->>'leafLocationId'<>''
 OR q->>'employeeId'<>''
 OR q->>'limit'<>'1'
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_NEW_ACTOR_SOURCE_SCOPE_MISMATCH'; END IF;
 IF authenticated_actor IS DISTINCT FROM p->>'actorSubject' THEN
  -- A stolen original posting proof and ordinary warehouse READ grant are
  -- insufficient. The new actor requires a current separately SIGNED
  -- recovery entitlement bound to this exact original command and nonce.
  SELECT * INTO grant FROM hft.ops_a2_recovery_reviewer_entitlement_v1 AS g
  WHERE g.legal_entity_id=q->>'legalEntityId'
  AND g.site_id=q->>'siteId' AND g.warehouse_id=q->>'warehouseId'
  AND g.item_code=p->>'itemCode'
  AND g.product_version_code=p->>'productVersion'
  AND g.original_command_id=p->>'commandId'
  AND g.original_actor_subject=p->>'actorSubject'
  AND g.original_payload_sha256=hft.ops_a_payload_digest_v2(p)
  AND g.original_nonce=original_proof->>'nonce'
  AND g.reviewer_subject=authenticated_actor
  AND g.approval_id=p->>'approvalId'
  AND g.approval_revision=(p->>'approvalRevision')::bigint
  AND pg_catalog.clock_timestamp()>=g.valid_from
  AND pg_catalog.clock_timestamp()<g.valid_until
  AND NOT EXISTS(SELECT 1 FROM hft.ops_a2_recovery_reviewer_revocation_v1 AS revoked
   WHERE revoked.grant_id=g.grant_id);
  IF grant.grant_id IS NULL
  THEN RAISE EXCEPTION 'OPS_A2_067_DIFFERENT_ACTOR_RECOVERY_ENTITLEMENT_REQUIRED'; END IF;
  SELECT reviewer.person_id INTO reviewer_person
  FROM hft.approval_human_login AS reviewer
  JOIN hft.approval_human AS human
    ON human.legal_entity_id=reviewer.legal_entity_id
    AND human.person_id=reviewer.person_id
  WHERE reviewer.legal_entity_id=grant.legal_entity_id
   AND reviewer.actor_subject=authenticated_actor
   AND human.revoked_at IS NULL
   AND human.valid_from<=pg_catalog.clock_timestamp()
   AND human.valid_until>pg_catalog.clock_timestamp()
   AND NOT EXISTS(SELECT 1 FROM hft.approval_human_revocation AS r
     WHERE r.legal_entity_id=human.legal_entity_id
     AND r.person_id=human.person_id);
  SELECT original.person_id INTO original_person
  FROM hft.approval_human_login AS original
  WHERE original.legal_entity_id=grant.legal_entity_id
    AND original.actor_subject=grant.original_actor_subject;
  SELECT generation INTO policy_epoch FROM hft.posting_policy_epoch
  WHERE legal_entity_id=grant.legal_entity_id AND site_id=grant.site_id
    AND warehouse_id=grant.warehouse_id;
  SELECT * INTO original_approval FROM hft.protected_stock_approval
  WHERE legal_entity_id=grant.legal_entity_id
  AND approval_id=grant.approval_id
  AND approval_revision=grant.approval_revision;
  SELECT * INTO original_decision FROM hft.protected_approval_decision
  WHERE legal_entity_id=grant.legal_entity_id
  AND approval_id=grant.approval_id
  AND approval_revision=grant.approval_revision;
  IF reviewer_person IS NULL OR original_person IS NULL
  OR reviewer_person<>grant.reviewer_person_id
  OR reviewer_person=original_person
  OR policy_epoch IS NULL OR policy_epoch<>grant.policy_generation
  OR original_approval.approval_id IS NULL OR original_decision.approval_id IS NULL
  OR original_approval.kind<>p->>'kind'
  OR original_approval.document_id<>p->>'sourceDocumentId'
  OR original_decision.decision_evidence_sha256<>grant.decision_evidence_sha256
  THEN RAISE EXCEPTION 'OPS_A2_067_RECOVERY_REVIEW_PERSON_POLICY_OR_SOURCE_INVALID'; END IF;
  signed_scope:=pg_catalog.jsonb_build_object(
   'contract','HFT-OPS-A2-RECOVERY-REVIEW-SCOPE-067-V1',
   'grantId',grant.grant_id::text,
   'legalEntityId',grant.legal_entity_id,'siteId',grant.site_id,
   'warehouseId',grant.warehouse_id,'itemCode',grant.item_code,
   'productVersion',grant.product_version_code,
   'originalCommandId',grant.original_command_id,
   'originalActor',grant.original_actor_subject,
   'originalPayloadSha256',grant.original_payload_sha256,
   'originalNonce',grant.original_nonce,
   'reviewerSubject',grant.reviewer_subject,
   'reviewerPerson',reviewer_person,'originalPerson',original_person,
   'originalApprovalId',grant.approval_id,
   'originalApprovalRevision',grant.approval_revision,
   'policyGeneration',grant.policy_generation,
   'decisionSha256',grant.decision_evidence_sha256,
   'validFromEpoch',pg_catalog.extract(epoch FROM grant.valid_from)::bigint,
   'validUntilEpoch',pg_catalog.extract(epoch FROM grant.valid_until)::bigint);
  PERFORM hft.ops_a2_assert_independent_scope_v1('RECOVERY_REVIEW',
   grant.grant_id,signed_scope,grant.legal_entity_id,
   grant.approval_id,grant.approval_revision,grant.decision_evidence_sha256,
   p->>'kind',ARRAY[reviewer_person,original_person]);
 END IF;
 -- Matching original-actor recovery can use its own newly authenticated,
 -- current session. No posting-session reactivation and no blind repost.
 RETURN hft.ops_a2_reconcile_original_attempt_private_v3(p,original_proof);
END $reconcile_v3$;
ALTER FUNCTION hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

-- SOURCE FIRST: enumerate every outstanding ISSUE custody record from the
-- BASE table, without first joining audit/ACK/account tables. Every missing
-- signed receipt must make the complete census fail, not silently disappear.
CREATE OR REPLACE FUNCTION hft.ops_a2_assert_outstanding_custody_census_v3(q jsonb)
RETURNS bigint LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,pg_temp AS $custody_census$
DECLARE base_count bigint;qualified_count bigint;balance_mismatch bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR q->>'intent'<>'CUSTODY' OR q->>'employeeId'=''
 THEN RAISE EXCEPTION 'OPS_A2_CUSTODY_CENSUS_READ_ONLY_SCOPE_REQUIRED'; END IF;
 SELECT count(*) INTO base_count FROM hft.employee_custody AS cu
 JOIN hft.warehouse AS w ON w.legal_entity_id=cu.legal_entity_id
  AND w.warehouse_id=cu.warehouse_id
 WHERE cu.legal_entity_id=q->>'legalEntityId'
  AND cu.warehouse_id=q->>'warehouseId'
  AND w.site_id=q->>'siteId'
  AND cu.employee_id=q->>'employeeId'
  AND cu.issued_micro>cu.returned_micro
  AND (q->>'itemCode'='' OR cu.item_code=q->>'itemCode')
  AND (q->>'productVersion'='' OR cu.product_version_code=q->>'productVersion')
  AND (q->>'leafLocationId'='' OR cu.location_id=q->>'leafLocationId');
 -- Independent qualified count: no nullable left-side evidence can hide a
 -- base ISSUE. Require original immutable command, exact P2 ISSUE fragment,
 -- pending ACK record (including DISPUTED) and authentic audit and account.
 SELECT count(*) INTO qualified_count
 FROM hft.employee_custody AS cu
 JOIN hft.warehouse AS w ON w.legal_entity_id=cu.legal_entity_id
  AND w.warehouse_id=cu.warehouse_id
 JOIN hft.stock_command AS original ON original.id=cu.issue_command_id
 JOIN hft.posting_fragment AS fragment ON fragment.command_uuid=original.id
 JOIN hft.custody_ack_pending AS pending ON
  pending.issue_command_uuid=original.id
  AND pending.legal_entity_id=cu.legal_entity_id
  AND pending.employee_id=cu.employee_id
 JOIN hft.custody_ack_status_v1 AS ack ON ack.issue_command_uuid=original.id
  AND ack.legal_entity_id=cu.legal_entity_id
  AND ack.employee_id=cu.employee_id
 JOIN hft.audit_outbox AS audit ON audit.command_id=original.id
 JOIN hft.stock_account AS acct ON
  acct.legal_entity_id=cu.legal_entity_id
  AND acct.site_id=w.site_id AND acct.warehouse_id=cu.warehouse_id
  AND acct.item_code=cu.item_code
  AND acct.product_version_code=cu.product_version_code
  AND acct.location_key=cu.location_id
  AND acct.account_kind='CUSTODY' AND acct.condition='GOOD'
  AND acct.custodian_employee_id=cu.employee_id
  AND acct.serial_key=cu.serial_no AND acct.batch_key=cu.batch_no
 WHERE cu.legal_entity_id=q->>'legalEntityId'
  AND cu.warehouse_id=q->>'warehouseId'
  AND w.site_id=q->>'siteId'
  AND cu.employee_id=q->>'employeeId'
  AND cu.issued_micro>cu.returned_micro
  AND (q->>'itemCode'='' OR cu.item_code=q->>'itemCode')
  AND (q->>'productVersion'='' OR cu.product_version_code=q->>'productVersion')
  AND (q->>'leafLocationId'='' OR cu.location_id=q->>'leafLocationId')
  AND original.legal_entity_id=cu.legal_entity_id
  AND original.site_id=w.site_id
  AND original.warehouse_id=cu.warehouse_id
  AND original.item_code=cu.item_code
  AND original.product_version_code=cu.product_version_code
  AND original.kind='ISSUE'
  AND fragment.legal_entity_id=cu.legal_entity_id
  AND fragment.kind='ISSUE' AND fragment.employee_id=cu.employee_id
  AND fragment.quantity_micro=cu.issued_micro
  AND ack.state IN('ACK_PENDING','ACKNOWLEDGED','DISPUTED')
  AND audit.canonical_sha256~'^[0-9a-f]{64}$'
  AND acct.qty_micro>=cu.issued_micro-cu.returned_micro;
 IF qualified_count<>base_count THEN
  RAISE EXCEPTION 'OPS_A2_CUSTODY_BASE_CENSUS_MISSING_ISSUE_ACK_AUDIT_FRAGMENT_OR_ACCOUNT'; END IF;
 -- Aggregate custody account must equal the sum of ALL outstanding original
 -- issues sharing the exact account identity, not the most recent ACK.
 SELECT count(*) INTO balance_mismatch FROM hft.stock_account AS acct
 WHERE acct.legal_entity_id=q->>'legalEntityId'
 AND acct.site_id=q->>'siteId' AND acct.warehouse_id=q->>'warehouseId'
 AND acct.account_kind='CUSTODY' AND acct.custodian_employee_id=q->>'employeeId'
 AND (q->>'itemCode'='' OR acct.item_code=q->>'itemCode')
 AND (q->>'productVersion'='' OR acct.product_version_code=q->>'productVersion')
 AND (q->>'leafLocationId'='' OR acct.location_key=q->>'leafLocationId')
 AND acct.qty_micro IS DISTINCT FROM (
  SELECT COALESCE(sum(cu.issued_micro-cu.returned_micro),0)
  FROM hft.employee_custody AS cu
  WHERE cu.legal_entity_id=acct.legal_entity_id
   AND cu.warehouse_id=acct.warehouse_id
   AND cu.employee_id=acct.custodian_employee_id
   AND cu.item_code=acct.item_code
   AND cu.product_version_code=acct.product_version_code
   AND cu.location_id=acct.location_key
   AND cu.serial_no=acct.serial_key AND cu.batch_no=acct.batch_key);
 IF balance_mismatch<>0 THEN
  RAISE EXCEPTION 'OPS_A2_CUSTODY_CENSUS_ACCOUNT_OUTSTANDING_MISMATCH'; END IF;
 RETURN base_count;
END $custody_census$;
REVOKE ALL ON FUNCTION hft.ops_a2_assert_outstanding_custody_census_v3(jsonb)
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
 IF q->>'intent'='CUSTODY' THEN
  PERFORM hft.ops_a2_assert_outstanding_custody_census_v3(q);
 END IF;
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
  -- Scope via immutable COMMAND; LEFT JOIN preserves the legitimate EXTERNAL
  -- debit leg. Account history comes from the ENTRY, never current versions.
  FOR c IN
   SELECT e.id AS entry_id,e.command_id AS command_uuid,
    e.account_id,e.account_before_version,e.account_after_version,
    e.qty_delta_micro,e.bucket AS account_kind,
    cmd.legal_entity_id,cmd.site_id,cmd.warehouse_id,cmd.item_code,
    e.product_version_code,
    COALESCE(a.location_key,cmd.location_id) AS location_key,
    COALESCE(a.condition,'GOOD') AS condition,
    COALESCE(a.serial_key,COALESCE(e.serial_no,'')) AS serial_key,
    COALESCE(a.batch_key,COALESCE(e.batch_no,'')) AS batch_key,
    COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,'')) AS custodian_employee_id,
    audit.canonical_sha256
   FROM hft.stock_entry AS e
   JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
   LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
   WHERE cmd.legal_entity_id=q->>'legalEntityId'
    AND cmd.site_id=q->>'siteId' AND cmd.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR cmd.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR e.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR
      COALESCE(a.location_key,cmd.location_id)=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR
      COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,''))=q->>'employeeId')
   ORDER BY e.id LIMIT (q->>'limit')::integer+1
  LOOP
   IF c.account_kind='EXTERNAL' AND
      (c.account_id IS NOT NULL OR c.account_before_version IS NOT NULL
       OR c.account_after_version IS NOT NULL)
   THEN RAISE EXCEPTION 'OPS_A2_EXTERNAL_LEDGER_OWNERSHIP_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_key,
    'accountKind',c.account_kind,'condition',c.condition,
    'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_delta_micro),
    'accountVersion',COALESCE(c.account_after_version,0),
    'accountBeforeVersion',c.account_before_version,
    'accountAfterVersion',c.account_after_version,
    'commandUuid',c.command_uuid::text,'entryId',c.entry_id::text,
    'movementId','ENTRY-'||c.entry_id::text,
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
    ack.signed_evidence_sha256 AS ack_evidence_sha256,
    fragment.fragment_id AS original_fragment_id,
    audit.canonical_sha256 AS source_audit,issue.command_id AS original_issue_id
   FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS issue ON issue.id=cu.issue_command_id
   JOIN hft.posting_fragment AS fragment ON
    fragment.command_uuid=issue.id AND fragment.kind='ISSUE'
    AND fragment.legal_entity_id=cu.legal_entity_id
    AND fragment.employee_id=cu.employee_id
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
    'originalFragmentId',c.original_fragment_id,
    'ackEvidenceSha256',COALESCE(c.ack_evidence_sha256,''),
    'auditSha256',c.source_audit,'humanAcknowledgement',c.ack_state));
  END LOOP;
 ELSE
  FOR c IN
   SELECT a.*,COALESCE(
    (SELECT audit.canonical_sha256 FROM hft.stock_entry e
     JOIN hft.audit_outbox audit ON audit.command_id=e.command_id
     WHERE e.account_id=a.id ORDER BY e.id DESC LIMIT 1),
    (SELECT receipt.source_evidence_sha256
     FROM hft.ops_a2_account_provision_receipt AS receipt
     WHERE receipt.account_id=a.id),
    repeat('0',64)) AS source_audit
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
   IF c.qty_micro=0 AND c.version=0 AND NOT EXISTS(
    SELECT 1 FROM hft.ops_a2_account_provision_receipt AS receipt
    JOIN hft.ops_a2_account_provision_order AS approved
     ON approved.order_id=receipt.order_id
    WHERE receipt.account_id=c.id
     AND approved.account_id=c.id
     AND approved.legal_entity_id=c.legal_entity_id
     AND approved.site_id=c.site_id
     AND approved.warehouse_id=c.warehouse_id
     AND approved.item_code=c.item_code
     AND approved.product_version_code=c.product_version_code
     AND approved.leaf_location_id=c.location_key
     AND approved.account_kind=c.account_kind
     AND approved.condition=c.condition
     AND approved.serial_no=c.serial_key AND approved.batch_no=c.batch_key
     AND approved.custodian_employee_id=c.custodian_employee_id)
   THEN RAISE EXCEPTION 'OPS_A2_UNATTESTED_ZERO_OPENING_ACCOUNT'; END IF;
   ack:='NOT_APPLICABLE';
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
-- 061 source-only: independent page HMAC, SQL filters and ordering are
-- rechecked per query. The only qualified usage is a single pinned
-- REPEATABLE READ READ ONLY transaction that exhausts every page before
-- returning a result. A browser cannot resume these offsets in a new
-- transaction and claim snapshot completeness.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_paged_readproof_v3(q jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $readproof$
DECLARE names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 k hft_secret.p0_stores_proof_key%ROWTYPE;
 field text;digest text;mac_expected bytea;mac_claimed bytea;
 i integer;v integer;xor_bits integer:=0;issued bigint;expiry bigint;now_epoch bigint;
 fields text[];
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'repeatable read'
 OR pg_catalog.current_setting('transaction_read_only')<>'on'
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
 OR (q->>'cursor'<>'' AND (
  q->>'cursor' !~ '^[1-9][0-9]{0,4}$'
  OR (q->>'cursor')::integer>10000)) OR
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

REVOKE ALL ON FUNCTION hft.ops_a2_verify_paged_readproof_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

CREATE OR REPLACE FUNCTION hft.ops_a2_read_snapshot_page_v3(q jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read$
DECLARE actor text;scope_count bigint;reconstructed bigint;
 a record;c record;row jsonb;rows jsonb:='[]'::jsonb;
 latest_audit text;last_move text;ack text;source_epoch text;
 digest_input text;command_record record;scope_generation bigint;
 offset_num integer:=COALESCE(NULLIF(q->>'cursor','')::integer,0);
 next_offset text:='';
 expected_total bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'OPS_A2_READ_ONLY_TRANSACTION_REQUIRED'; END IF;
 actor:=hft.ops_a2_verify_paged_readproof_v3(q,proof);
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
 -- Count the EXACT same source rows as each page on this one transaction
 -- snapshot. A forged premature terminal cursor cannot certify completeness.
 IF q->>'intent'='MOVEMENTS' THEN
  SELECT count(*) INTO expected_total
  FROM hft.stock_entry AS e
  JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
  LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
  JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
  WHERE cmd.legal_entity_id=q->>'legalEntityId'
   AND cmd.site_id=q->>'siteId' AND cmd.warehouse_id=q->>'warehouseId'
   AND (q->>'itemCode'='' OR cmd.item_code=q->>'itemCode')
   AND (q->>'productVersion'='' OR e.product_version_code=q->>'productVersion')
   AND (q->>'leafLocationId'='' OR
    COALESCE(a.location_key,cmd.location_id)=q->>'leafLocationId')
   AND (q->>'employeeId'='' OR
    COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,''))=q->>'employeeId');
 ELSIF q->>'intent'='CUSTODY' THEN
  expected_total:=hft.ops_a2_assert_outstanding_custody_census_v3(q);
 ELSE
  SELECT count(*) INTO expected_total FROM hft.stock_account AS a
  WHERE a.legal_entity_id=q->>'legalEntityId'
   AND a.site_id=q->>'siteId' AND a.warehouse_id=q->>'warehouseId'
   AND (q->>'itemCode'='' OR a.item_code=q->>'itemCode')
   AND (q->>'productVersion'='' OR a.product_version_code=q->>'productVersion')
   AND (q->>'leafLocationId'='' OR a.location_key=q->>'leafLocationId')
   AND (q->>'employeeId'='' OR a.custodian_employee_id=q->>'employeeId');
 END IF;
 IF expected_total>10000 OR offset_num>expected_total
 THEN RAISE EXCEPTION 'OPS_A2_SNAPSHOT_SCOPE_LIMIT_OR_OFFSET_INVALID'; END IF;
 IF q->>'intent'='MOVEMENTS' THEN
  -- Scope via immutable COMMAND; LEFT JOIN preserves the legitimate EXTERNAL
  -- debit leg. Account history comes from the ENTRY, never current versions.
  FOR c IN
   SELECT e.id AS entry_id,e.command_id AS command_uuid,
    e.account_id,e.account_before_version,e.account_after_version,
    e.qty_delta_micro,e.bucket AS account_kind,
    cmd.legal_entity_id,cmd.site_id,cmd.warehouse_id,cmd.item_code,
    e.product_version_code,
    COALESCE(a.location_key,cmd.location_id) AS location_key,
    COALESCE(a.condition,'GOOD') AS condition,
    COALESCE(a.serial_key,COALESCE(e.serial_no,'')) AS serial_key,
    COALESCE(a.batch_key,COALESCE(e.batch_no,'')) AS batch_key,
    COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,'')) AS custodian_employee_id,
    audit.canonical_sha256
   FROM hft.stock_entry AS e
   JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
   LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
   WHERE cmd.legal_entity_id=q->>'legalEntityId'
    AND cmd.site_id=q->>'siteId' AND cmd.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR cmd.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR e.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR
      COALESCE(a.location_key,cmd.location_id)=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR
      COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,''))=q->>'employeeId')
   ORDER BY e.id LIMIT (q->>'limit')::integer+1 OFFSET offset_num
  LOOP
   IF c.account_kind='EXTERNAL' AND
      (c.account_id IS NOT NULL OR c.account_before_version IS NOT NULL
       OR c.account_after_version IS NOT NULL)
   THEN RAISE EXCEPTION 'OPS_A2_EXTERNAL_LEDGER_OWNERSHIP_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_key,
    'accountKind',c.account_kind,'condition',c.condition,
    'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_delta_micro),
    'accountVersion',COALESCE(c.account_after_version,0),
    'accountBeforeVersion',c.account_before_version,
    'accountAfterVersion',c.account_after_version,
    'commandUuid',c.command_uuid::text,'entryId',c.entry_id::text,
    'movementId','ENTRY-'||c.entry_id::text,
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
    ack.signed_evidence_sha256 AS ack_evidence_sha256,
    fragment.fragment_id AS original_fragment_id,
    audit.canonical_sha256 AS source_audit,issue.command_id AS original_issue_id
   FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS issue ON issue.id=cu.issue_command_id
   JOIN hft.posting_fragment AS fragment ON
    fragment.command_uuid=issue.id AND fragment.kind='ISSUE'
    AND fragment.legal_entity_id=cu.legal_entity_id
    AND fragment.employee_id=cu.employee_id
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
   ORDER BY cu.issue_command_id LIMIT (q->>'limit')::integer+1 OFFSET offset_num
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
    'originalFragmentId',c.original_fragment_id,
    'ackEvidenceSha256',COALESCE(c.ack_evidence_sha256,''),
    'auditSha256',c.source_audit,'humanAcknowledgement',c.ack_state));
  END LOOP;
 ELSE
  FOR c IN
   SELECT a.*,COALESCE(
    (SELECT audit.canonical_sha256 FROM hft.stock_entry e
     JOIN hft.audit_outbox audit ON audit.command_id=e.command_id
     WHERE e.account_id=a.id ORDER BY e.id DESC LIMIT 1),
    (SELECT receipt.source_evidence_sha256
     FROM hft.ops_a2_account_provision_receipt AS receipt
     WHERE receipt.account_id=a.id),
    repeat('0',64)) AS source_audit
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
   LIMIT (q->>'limit')::integer+1 OFFSET offset_num
  LOOP
   IF c.qty_micro=0 AND c.version=0 AND NOT EXISTS(
    SELECT 1 FROM hft.ops_a2_account_provision_receipt AS receipt
    JOIN hft.ops_a2_account_provision_order AS approved
     ON approved.order_id=receipt.order_id
    WHERE receipt.account_id=c.id
     AND approved.account_id=c.id
     AND approved.legal_entity_id=c.legal_entity_id
     AND approved.site_id=c.site_id
     AND approved.warehouse_id=c.warehouse_id
     AND approved.item_code=c.item_code
     AND approved.product_version_code=c.product_version_code
     AND approved.leaf_location_id=c.location_key
     AND approved.account_kind=c.account_kind
     AND approved.condition=c.condition
     AND approved.serial_no=c.serial_key AND approved.batch_no=c.batch_key
     AND approved.custodian_employee_id=c.custodian_employee_id)
   THEN RAISE EXCEPTION 'OPS_A2_UNATTESTED_ZERO_OPENING_ACCOUNT'; END IF;
   ack:='NOT_APPLICABLE';
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
 IF pg_catalog.jsonb_array_length(rows)>(q->>'limit')::integer THEN
  next_offset:=(offset_num+(q->>'limit')::integer)::text;
  SELECT COALESCE(pg_catalog.jsonb_agg(x.value ORDER BY x.ordinality),'[]'::jsonb)
  INTO rows FROM pg_catalog.jsonb_array_elements(rows)
   WITH ORDINALITY AS x(value,ordinality)
   WHERE x.ordinality<=(q->>'limit')::integer;
 END IF;
 SELECT generation INTO scope_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=q->>'legalEntityId'
 AND site_id=q->>'siteId' AND warehouse_id=q->>'warehouseId';
 IF scope_generation IS NULL THEN RAISE EXCEPTION 'OPS_A2_READ_POLICY_EPOCH_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'state','AUTHORITATIVE_VERSIONED_READ',
  'versionAuthority','OPS_A2_VERSION_AWARE_V2',
  'intent',q->>'intent','sourceEpoch','POLICY-'||scope_generation::text,
  'nextCursor',next_offset,'snapshotTotalRows',expected_total,
  'durable',true,'synthetic',false,'auditVerified',true,
  'rows',rows);
END $read$;

REVOKE ALL ON FUNCTION hft.ops_a2_read_snapshot_page_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- No grants in this candidate. The actual future runtime allowlist MUST
-- include exactly the vetted resolver, writer, reconcile and readback
-- functions under distinct qualified nonowner logins after independent
-- privilege proofs. No PUBLIC inherited EXECUTE or direct protected table DML.
COMMIT;
