-- HFT OPS-A2 V2 PROOF, HUMAN, SOURCE/HOLD AUTHORITY — NONEXECUTABLE.
-- Requires OPS-A2 foundation, P2 and P0 approved source in same staged rollout.
-- THIS FILE IS NOT AUTHORIZED FOR DATABASE EXECUTION.
BEGIN;
DO $STOP_OPS_A2_PROOF$
BEGIN
 RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED';
END $STOP_OPS_A2_PROOF$;

-- Validate exact 33 field payload and 9 string field proof, then enforce the
-- original-byte domain and session HMAC within the protected transaction.
-- On PostgreSQL failure ALL nonce/source/ledger effects ROLLBACK atomically.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_invocation_v2(p jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp
AS $verify$
DECLARE
 names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 f text; version bigint;issued bigint;expires bigint;at_epoch bigint;
 k hft_secret.invocation_key%ROWTYPE;
 payload_sha text; mac_data bytea;expected bytea;claimed bytea;
 xor_value integer:=0;i integer; qty numeric;
BEGIN
 PERFORM hft.ops_a_payload_fields_v2(p);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_EXACT_KEYS_REQUIRED'; END IF;
 FOREACH f IN ARRAY names LOOP
  IF NOT(proof ? f) OR pg_catalog.jsonb_typeof(proof->f)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_STRING_REQUIRED'; END IF;
 END LOOP;
 IF p->>'contractVersion'<>'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
 OR p->>'kind' NOT IN('RECEIVE','ISSUE','RETURN','TRANSFER')
 OR proof->>'proofVersion'<>'HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED'
 OR proof->>'actorSubject'<>p->>'actorSubject'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_ENCODING_OR_SCOPE_INVALID'; END IF;
 FOREACH f IN ARRAY ARRAY[
  'quantityMicro','sourceRevision','approvalRevision','policyGeneration',
  'destinationAccountBeforeVersion'] LOOP
   IF p->>f !~ '^(0|[1-9][0-9]*)$'
   OR pg_catalog.length(p->>f)>19
   OR (p->>f)::numeric>9223372036854775807
   THEN RAISE EXCEPTION 'OPS_A2_V2_NUMERIC_FIELD_INVALID:%',f; END IF;
 END LOOP;
 IF (p->>'quantityMicro')::numeric<=0
 OR (p->>'sourceRevision')::numeric<=0
 OR (p->>'approvalRevision')::numeric<=0
 OR (p->>'policyGeneration')::numeric<=0
 THEN RAISE EXCEPTION 'OPS_A2_V2_NONPOSITIVE_QUANTITY_OR_REVISION'; END IF;
 IF p->>'sourceAccountBeforeVersion'<>'' AND
  (p->>'sourceAccountBeforeVersion' !~ '^(0|[1-9][0-9]*)$'
   OR pg_catalog.length(p->>'sourceAccountBeforeVersion')>19
   OR (p->>'sourceAccountBeforeVersion')::numeric>9223372036854775807)
 THEN RAISE EXCEPTION 'OPS_A2_V2_SOURCE_VERSION_INVALID'; END IF;
 IF p->>'approvedBy'=p->>'actorSubject' OR
    (p->>'approvedPayloadSha256') !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'OPS_A2_V2_SELF_APPROVAL_OR_DIGEST_DENIED'; END IF;
 qty:=(p->>'quantityMicro')::numeric;
 IF p->>'controlType' NOT IN ('NONE','SERIAL','BATCH')
 OR p->>'controlType'='SERIAL' AND (
  p->>'serialNo'='' OR p->>'batchNo'<>'' OR qty<>1000000)
 OR p->>'controlType'='BATCH' AND(
  p->>'batchNo'='' OR p->>'serialNo'<>'')
 OR p->>'controlType'='NONE' AND(
  p->>'serialNo'<>'' OR p->>'batchNo'<>'')
 THEN RAISE EXCEPTION 'OPS_A2_V2_TRACEABILITY_INVALID'; END IF;
 IF p->>'kind'='RECEIVE' AND(
  p->>'sourceAccountId'<>'' OR p->>'sourceLeafId'<>''
  OR p->>'sourceAccountBeforeVersion'<>'' OR
  p->>'employeeId'<>'' OR p->>'originalIssueId'<>''
  OR p->>'fragmentId'<>'' OR p->>'inspectionEvidenceId'='')
 THEN RAISE EXCEPTION 'OPS_A2_V2_RECEIPT_SOURCE_INVALID'; END IF;
 IF p->>'kind'='ISSUE' AND(
  p->>'sourceAccountId'='' OR p->>'sourceLeafId'='' OR
  p->>'employeeId'='' OR p->>'fragmentId'='' OR
  p->>'originalIssueId'<>'' OR p->>'destinationLeafId'<>'')
 THEN RAISE EXCEPTION 'OPS_A2_V2_ISSUE_SOURCE_INVALID'; END IF;
 IF p->>'kind'='RETURN' AND(
  p->>'sourceAccountId'='' OR p->>'sourceLeafId'='' OR
  p->>'destinationLeafId'='' OR p->>'employeeId'='' OR
  p->>'fragmentId'='' OR p->>'originalIssueId'='' OR
  p->>'inspectionEvidenceId'='' OR
  p->>'inspectedCondition' NOT IN ('GOOD','DAMAGED','QUARANTINE'))
 THEN RAISE EXCEPTION 'OPS_A2_V2_RETURN_SOURCE_INVALID'; END IF;
 IF p->>'kind'='TRANSFER' AND(
  p->>'sourceAccountId'='' OR p->>'sourceLeafId'='' OR
  p->>'destinationLeafId'='' OR p->>'fragmentId'='' OR
  p->>'sourceLeafId'=p->>'destinationLeafId' OR
  p->>'sourceAccountId'=p->>'destinationAccountId' OR
  p->>'employeeId'<>'' OR p->>'originalIssueId'<>'' OR
  p->>'inspectedCondition'<>'GOOD')
 THEN RAISE EXCEPTION 'OPS_A2_V2_TRANSFER_SCOPE_INVALID'; END IF;
 IF p->>'destinationAccountId'=''
 THEN RAISE EXCEPTION 'OPS_A2_V2_DESTINATION_ACCOUNT_REQUIRED'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expires:=(proof->>'expiresAt')::bigint;
 version:=(proof->>'keyVersion')::bigint;
 IF version>2147483647 OR
  (proof->>'issuedAt')::numeric>9223372036854775807 OR
  (proof->>'expiresAt')::numeric>9223372036854775807
 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_NUMBER_OVERFLOW'; END IF;
 at_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM
  pg_catalog.clock_timestamp()))::bigint;
 IF issued>at_epoch+30 OR expires<=at_epoch OR expires<=issued OR
  expires-issued>60 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_EXPIRED'; END IF;
 payload_sha:=hft.ops_a_payload_digest_v2(p);
 IF proof->>'payloadSha256'<>payload_sha
 THEN RAISE EXCEPTION 'OPS_A2_V2_PAYLOAD_DIGEST_MISMATCH'; END IF;
 SELECT * INTO k FROM hft_secret.invocation_key
 WHERE key_version=version::integer FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL OR
  pg_catalog.clock_timestamp()<k.not_before OR
  pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_V2_SIGNING_KEY_REVOKED_OR_UNKNOWN'; END IF;
 -- Mirrors the V2 source codec, not the old P2 V1 19-field MAC.
 mac_data:=hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  proof->>'payloadSha256',proof->>'issuedAt',proof->>'expiresAt',
  proof->>'nonce',proof->>'keyVersion']);
 expected:=hft_crypto.hmac(mac_data,k.key_bytes,'sha256');
 claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(expected)<>32 OR
  pg_catalog.octet_length(claimed)<>32 THEN
  RAISE EXCEPTION 'OPS_A2_V2_HMAC_BYTES_INVALID'; END IF;
 FOR i IN 0..31 LOOP
  xor_value:=xor_value | (pg_catalog.get_byte(expected,i) #
                           pg_catalog.get_byte(claimed,i));
 END LOOP;
 IF xor_value<>0 THEN RAISE EXCEPTION 'OPS_A2_V2_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session AS sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_SESSION_REVOKED'; END IF;
 -- Unique key_version + nonce is the only live replay authority.
 -- Normal reauthorization must use a new independently signed nonce, never
 -- resubmit the old proof after an uncertain COMMIT.
 INSERT INTO hft.posting_invocation_nonce(key_version,nonce,actor_subject,
  session_id,command_id,payload_sha256,legal_entity_id,proof_mac_sha256,
  proof_issued_at_epoch,expires_at)
 VALUES(version::integer,proof->>'nonce',proof->>'actorSubject',
  proof->>'sessionId',p->>'commandId',payload_sha,p->>'legalEntityId',
  pg_catalog.encode(hft_crypto.digest(claimed,'sha256'),'hex'),
  issued,pg_catalog.to_timestamp(expires));
 RETURN proof->>'actorSubject';
END $verify$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_verify_invocation_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Bind an existing independent human approval, its immutable source envelope,
-- current policy generation, active human qualifications, exact source
-- document and current Holds. Do NOT trust the client-provided role.
-- SECURITY INVOKER; callable only by privately owned protected writer/reader.
CREATE OR REPLACE FUNCTION hft.ops_a2_authorized_source_v2(p jsonb)
RETURNS hft.ops_a2_source_binding
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp
AS $authorized$
DECLARE
 b hft.ops_a2_source_binding%ROWTYPE;
 a hft.protected_stock_approval%ROWTYPE;
 d hft.protected_approval_decision%ROWTYPE;
 policy hft.posting_policy_epoch%ROWTYPE;
 action_policy hft.posting_action_policy%ROWTYPE;
 actor_person text;approver_person text;
 inspector_person text;location_name text;source_rev bigint;
 source_approver text;source_qty bigint;source_used bigint;source_version text;
BEGIN
 PERFORM hft.ops_a_payload_fields_v2(p);
 SELECT * INTO b FROM hft.ops_a2_source_binding AS sb
 WHERE sb.request_id=(p->>'commandId')::uuid FOR SHARE;
 IF b.request_id IS NULL OR b.status<>'APPROVED'
  OR b.legal_entity_id<>p->>'legalEntityId'
  OR b.site_id<>p->>'siteId' OR b.warehouse_id<>p->>'warehouseId'
  OR b.item_code<>p->>'itemCode'
  OR b.product_version_code<>p->>'productVersion'
  OR b.action_kind<>p->>'kind'
  OR b.source_document_id<>p->>'sourceDocumentId'
  OR b.source_action_key<>p->>'sourceActionKey'
  OR b.source_revision<>(p->>'sourceRevision')::bigint
  OR b.approval_id<>p->>'approvalId'
  OR b.approval_revision<>(p->>'approvalRevision')::bigint
  OR b.policy_generation<>(p->>'policyGeneration')::bigint
  OR b.actor_subject<>p->>'actorSubject'
  OR b.approver_subject<>p->>'approvedBy'
  OR b.source_leaf<>p->>'sourceLeafId'
  OR b.destination_leaf<>p->>'destinationLeafId'
  OR pg_catalog.coalesce(b.source_account_id::text,'')<>p->>'sourceAccountId'
  OR b.destination_account_id::text<>p->>'destinationAccountId'
  OR pg_catalog.coalesce(b.source_account_before_version::text,'')<>
     p->>'sourceAccountBeforeVersion'
  OR b.dest_account_before_version::text<>p->>'destinationAccountBeforeVersion'
  OR b.employee_id<>p->>'employeeId'
  OR b.original_issue_id<>p->>'originalIssueId'
  OR b.fragment_id<>p->>'fragmentId'
  OR b.inspection_evidence_id<>p->>'inspectionEvidenceId'
  OR b.authorized_micro<>(p->>'quantityMicro')::bigint
  OR b.approved_scope_sha256<>p->>'approvedPayloadSha256'
 THEN RAISE EXCEPTION 'OPS_A2_V2_SIGNED_SOURCE_BINDING_STALE_OR_FORGED'; END IF;
 SELECT * INTO a FROM hft.protected_stock_approval AS approval
 WHERE approval.legal_entity_id=b.legal_entity_id
 AND approval.approval_id=b.approval_id
 AND approval.approval_revision=b.approval_revision FOR SHARE;
 IF a.approval_id IS NULL OR NOT a.approved
 OR a.kind<>b.action_kind OR a.site_id<>b.site_id
 OR a.warehouse_id<>b.warehouse_id OR a.item_code<>b.item_code
 OR a.document_id<>b.source_document_id
 OR a.source_action_key<>b.source_action_key
 OR a.fragment_id<>b.fragment_id OR a.approver_subject<>b.approver_subject
 OR a.actor_subject<>b.actor_subject OR
  a.approved_scope_sha256<>b.approved_scope_sha256 OR
  a.document_revision<>b.source_revision OR
  a.policy_generation<>b.policy_generation OR
  a.payload_sha256<>hft.ops_a_payload_digest_v2(p) OR
  a.quantity_micro<>b.authorized_micro OR
  a.inspection_evidence_id<>b.inspection_evidence_id OR
  a.location_id<>CASE WHEN b.action_kind='RECEIVE' THEN b.destination_leaf ELSE b.source_leaf END
 OR pg_catalog.clock_timestamp()<a.valid_from
 OR pg_catalog.clock_timestamp()>=a.valid_until
 OR EXISTS(SELECT 1 FROM hft.protected_approval_revocation x
  WHERE x.legal_entity_id=b.legal_entity_id
   AND x.approval_id=b.approval_id
   AND x.approval_revision=b.approval_revision)
 OR EXISTS(SELECT 1 FROM hft.protected_approval_supersession x
  WHERE x.legal_entity_id=b.legal_entity_id
   AND x.approval_id=b.approval_id
   AND x.approval_revision=b.approval_revision)
 THEN RAISE EXCEPTION 'OPS_A2_V2_APPROVAL_NOT_CURRENT'; END IF;
 SELECT * INTO policy FROM hft.posting_policy_epoch AS epoch
 WHERE epoch.legal_entity_id=b.legal_entity_id
 AND epoch.site_id=b.site_id AND epoch.warehouse_id=b.warehouse_id FOR SHARE;
 IF policy.generation IS NULL OR policy.generation<>b.policy_generation
 THEN RAISE EXCEPTION 'OPS_A2_V2_POLICY_GENERATION_STALE'; END IF;
 SELECT * INTO d FROM hft.protected_approval_decision AS dec
 WHERE dec.legal_entity_id=b.legal_entity_id
 AND dec.approval_id=b.approval_id AND dec.approval_revision=b.approval_revision FOR SHARE;
 SELECT * INTO action_policy FROM hft.posting_action_policy AS pol
 WHERE pol.legal_entity_id=b.legal_entity_id AND pol.site_id=b.site_id
 AND pol.warehouse_id=b.warehouse_id AND pol.action_kind=b.action_kind
 ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;
 IF d.approval_id IS NULL OR
  d.policy_revision IS DISTINCT FROM a.policy_revision OR
  d.source_revision<>b.source_revision OR
  d.payload_sha256<>hft.ops_a_payload_digest_v2(p) OR
  action_policy.policy_revision IS DISTINCT FROM d.policy_revision OR
  pg_catalog.clock_timestamp()<action_policy.valid_from OR
  pg_catalog.clock_timestamp()>=action_policy.valid_until OR
  d.approver_subject<>b.approver_subject
 THEN RAISE EXCEPTION 'OPS_A2_V2_APPROVAL_DECISION_POLICY_STALE'; END IF;
 -- Real-person identity, not distinct usernames. No same human as maker and
 -- checker/approver even when multiple active accounts belong to that person.
 SELECT person_id INTO actor_person FROM hft.approval_human_login
 WHERE legal_entity_id=b.legal_entity_id AND actor_subject=b.actor_subject;
 SELECT person_id INTO approver_person FROM hft.approval_human_login
 WHERE legal_entity_id=b.legal_entity_id AND actor_subject=b.approver_subject;
 IF actor_person IS NULL OR approver_person IS NULL OR
  actor_person=approver_person OR
  hft.p2_qualified_human_v1(b.legal_entity_id,b.approver_subject,
   d.approver_session_id,b.action_kind,'APPROVER',
   pg_catalog.clock_timestamp()) IS DISTINCT FROM approver_person
 THEN RAISE EXCEPTION 'OPS_A2_V2_MAKER_CHECKER_PERSON_INDEPENDENCE_DENIED'; END IF;
 IF action_policy.require_checker THEN
  IF d.checked_subject IS NULL OR d.checked_session_id IS NULL OR
   d.checked_subject=b.actor_subject OR d.checked_subject=b.approver_subject OR
   (SELECT person_id FROM hft.approval_human_login
    WHERE legal_entity_id=b.legal_entity_id
    AND actor_subject=d.checked_subject) IN(actor_person,approver_person)
   OR hft.p2_qualified_human_v1(b.legal_entity_id,d.checked_subject,
    d.checked_session_id,b.action_kind,'CHECKER',
    pg_catalog.clock_timestamp()) IS NULL
  THEN RAISE EXCEPTION 'OPS_A2_V2_INDEPENDENT_CHECKER_REQUIRED'; END IF;
 END IF;
 IF b.action_kind='RETURN' THEN
  inspector_person:=hft.p2_qualified_human_v1(b.legal_entity_id,
   d.inspector_subject,d.inspector_session_id,b.action_kind,'INSPECTOR',
   pg_catalog.clock_timestamp());
  IF inspector_person IS NULL OR inspector_person=actor_person OR
   inspector_person=approver_person OR
   NOT EXISTS(SELECT 1 FROM hft.return_inspection_attestation AS inspection
    WHERE inspection.legal_entity_id=b.legal_entity_id
    AND inspection.return_document_id=b.source_document_id
    AND inspection.evidence_id=b.inspection_evidence_id
    AND inspection.approval_id=b.approval_id
    AND inspection.approval_revision=b.approval_revision
    AND inspection.inspector_subject=d.inspector_subject)
  THEN RAISE EXCEPTION 'OPS_A2_V2_RETURN_INSPECTION_NOT_INDEPENDENT'; END IF;
 END IF;
 -- Bounded persisted grant and warehouse/entity/site activation.
 PERFORM 1 FROM hft.actor_warehouse_grant AS g
 WHERE g.legal_entity_id=b.legal_entity_id AND g.site_id=b.site_id
 AND g.warehouse_id=b.warehouse_id AND g.actor_subject=b.actor_subject
 AND g.active AND g.may_post FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_ACTOR_SCOPE_NOT_AUTHORIZED'; END IF;
 PERFORM 1 FROM hft.warehouse AS w
 JOIN hft.site AS s ON s.legal_entity_id=w.legal_entity_id AND s.id=w.site_id
 JOIN hft.legal_entity AS le ON le.id=w.legal_entity_id
 WHERE w.legal_entity_id=b.legal_entity_id AND w.site_id=b.site_id
 AND w.warehouse_id=b.warehouse_id AND w.active AND s.active AND le.active
 FOR SHARE OF w,s,le;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_WAREHOUSE_INACTIVE'; END IF;
 PERFORM 1 FROM hft.item AS i
 JOIN hft.item_version_catalog AS v ON v.legal_entity_id=i.legal_entity_id
 AND v.item_code=i.item_code AND v.version_code=b.product_version_code
 JOIN hft.item_version_photo_coverage_v1 AS photo
 ON photo.legal_entity_id=v.legal_entity_id AND photo.item_code=v.item_code
 AND photo.version_code=v.version_code
 WHERE i.legal_entity_id=b.legal_entity_id AND i.item_code=b.item_code
 AND i.active AND i.control_type=p->>'controlType'
 AND (v.state='ACTIVE' OR (v.state='RETIRED' AND b.action_kind='RETURN'))
 AND photo.approved_primary_count=1
 FOR SHARE OF i,v;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_ITEM_VERSION_PHOTO_NOT_QUALIFIED'; END IF;
 -- Only certified, currently active exact leaf nodes; never trust caller path.
 IF b.source_leaf<>'' THEN
  SELECT hft.p0_resolve_count_leaf_v1(b.legal_entity_id,b.warehouse_id,b.source_leaf)
   INTO location_name;
 END IF;
 -- ISSUE has NO destination leaf. Its credited account is employee custody,
 -- retaining the physical SOURCE leaf. Never resolve an empty leaf as stock.
 IF b.action_kind='ISSUE' THEN
  IF b.destination_leaf<>'' OR b.source_leaf='' THEN
   RAISE EXCEPTION 'OPS_A2_ISSUE_PHYSICAL_DESTINATION_FORBIDDEN'; END IF;
  PERFORM 1 FROM hft.stock_account AS custody
  WHERE custody.id=b.destination_account_id
    AND custody.legal_entity_id=b.legal_entity_id
    AND custody.site_id=b.site_id AND custody.warehouse_id=b.warehouse_id
    AND custody.item_code=b.item_code
    AND custody.product_version_code=b.product_version_code
    AND custody.location_key=b.source_leaf
    AND custody.account_kind='CUSTODY'
    AND custody.condition='GOOD'
    AND custody.custodian_employee_id=b.employee_id
    AND custody.batch_key=p->>'batchNo'
    AND custody.serial_key=p->>'serialNo'
    AND custody.version=b.dest_account_before_version
  FOR SHARE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'OPS_A2_ISSUE_CUSTODY_DESTINATION_NOT_BOUND'; END IF;
 ELSE
  IF b.destination_leaf='' THEN
   RAISE EXCEPTION 'OPS_A2_PHYSICAL_DESTINATION_REQUIRED'; END IF;
  SELECT hft.p0_resolve_count_leaf_v1(
   b.legal_entity_id,b.warehouse_id,b.destination_leaf)
   INTO location_name;
 END IF;
 -- Parent holds plus exact item/warehouse Holds are checked after shared GATE
 -- advisory lock acquired by the protected writer.
 PERFORM 1 FROM hft.posting_parent_hold AS h
 WHERE h.legal_entity_id=b.legal_entity_id AND h.active
 AND (h.scope_kind='ENTITY' OR (h.scope_kind='SITE' AND h.site_id=b.site_id))
 AND (h.expires_at IS NULL OR h.expires_at>pg_catalog.clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM hft.posting_parent_hold_clearance AS cleared
  WHERE cleared.legal_entity_id=h.legal_entity_id
    AND cleared.hold_id=h.hold_id)
 FOR SHARE OF h;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_PARENT_HOLD_ACTIVE'; END IF;
 PERFORM 1 FROM hft.stock_hold AS h WHERE h.active
  AND h.legal_entity_id=b.legal_entity_id
  AND h.site_id=b.site_id AND h.warehouse_id=b.warehouse_id
  AND (h.item_code IS NULL OR h.item_code=b.item_code)
  AND (h.employee_id IS NULL OR h.employee_id=NULLIF(b.employee_id,''))
  AND (h.source_document_id IS NULL OR h.source_document_id=b.source_document_id)
 FOR SHARE OF h;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_STOCK_HOLD_ACTIVE'; END IF;
 -- Recheck exact typed original source revisions and cumulative line ceilings.
 IF b.action_kind='RECEIVE' THEN
  SELECT g.authorization_revision,g.authorized_by,r.accepted_micro,
   r.ops_a2_product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.grn AS g
  JOIN hft.grn_partial_receipt AS r ON r.grn_id=g.id
  JOIN hft.grn_line AS gl ON gl.grn_id=r.grn_id AND gl.line_no=r.line_no
  JOIN hft.supplier AS sup ON sup.legal_entity_id=g.legal_entity_id
    AND sup.supplier_id=g.supplier_id
  JOIN hft.supplier_invoice AS inv ON inv.id=g.invoice_id
  WHERE g.id::text=b.source_document_id AND g.legal_entity_id=b.legal_entity_id
  AND g.warehouse_id=b.warehouse_id
  AND r.receipt_key||':'||r.line_no::text=b.source_action_key
  AND r.legal_entity_id=b.legal_entity_id AND r.warehouse_id=b.warehouse_id
  AND r.location_id=b.destination_leaf
  AND r.ops_a2_item_code=b.item_code
  AND r.ops_a2_product_version_code=b.product_version_code
  AND r.batch_no=p->>'batchNo' AND r.serial_no=p->>'serialNo'
  AND gl.item_code=b.item_code AND r.qc_state='ACCEPTED'
  AND r.evidence_reference=b.inspection_evidence_id
  AND g.status IN('AUTHORIZED','PARTIALLY_RECEIVED')
  AND sup.active AND inv.status='VERIFIED'
  FOR SHARE OF g,r,gl,sup,inv;
 ELSIF b.action_kind='ISSUE' THEN
  SELECT i.authorization_revision,i.approved_by,l.authorized_micro-l.issued_micro,
   l.ops_a2_product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.material_issue AS i
  JOIN hft.material_issue_line AS l ON l.issue_id=i.id
  JOIN hft.employee AS emp ON emp.legal_entity_id=i.legal_entity_id
    AND emp.employee_id=i.employee_id
  WHERE i.id::text=b.source_document_id AND i.legal_entity_id=b.legal_entity_id
   AND i.warehouse_id=b.warehouse_id AND i.employee_id=b.employee_id
   AND emp.active AND emp.site_id=b.site_id
   AND i.status IN('AUTHORIZED','ISSUED')
   AND l.source_action_key=b.source_action_key
   AND l.item_code=b.item_code AND l.location_id=b.source_leaf
   AND l.ops_a2_product_version_code=b.product_version_code
   AND l.batch_no=p->>'batchNo' AND l.serial_no=p->>'serialNo'
  FOR SHARE OF i,l,emp;
 ELSIF b.action_kind='RETURN' THEN
  SELECT mr.authorization_revision,mr.accepted_by,l.authorized_micro-l.returned_micro,
   l.ops_a2_product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.material_return AS mr
  JOIN hft.material_issue AS i ON i.id=mr.issue_id
  JOIN hft.material_return_line AS l ON l.return_id=mr.id
  WHERE mr.id::text=b.source_document_id AND mr.legal_entity_id=b.legal_entity_id
    AND mr.warehouse_id=b.warehouse_id AND mr.condition=p->>'inspectedCondition'
    AND mr.status IN('AUTHORIZED','RETURNED') AND i.employee_id=b.employee_id
    AND l.source_action_key=b.source_action_key
    AND l.original_issue_command_id=b.original_issue_id
    AND l.item_code=b.item_code AND l.location_id=b.source_leaf
    AND l.ops_a2_product_version_code=b.product_version_code
    AND l.batch_no=p->>'batchNo' AND l.serial_no=p->>'serialNo'
  FOR SHARE OF mr,i,l;
 ELSE
  SELECT x.revision,x.approved_by,x.authorized_micro-x.moved_micro,
   x.product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.ops_a2_transfer_document AS x
  WHERE x.id::text=b.source_document_id
  AND x.legal_entity_id=b.legal_entity_id
  AND x.site_id=b.site_id AND x.warehouse_id=b.warehouse_id
  AND x.item_code=b.item_code AND x.product_version_code=b.product_version_code
  AND x.source_leaf=b.source_leaf AND x.destination_leaf=b.destination_leaf
  AND x.batch_no=p->>'batchNo' AND x.serial_no=p->>'serialNo'
  AND x.status IN('AUTHORIZED','PARTIALLY_MOVED')
  FOR SHARE OF x;
 END IF;
 IF source_rev IS NULL OR source_rev<>b.source_revision
 OR source_approver IS DISTINCT FROM b.approver_subject
 OR source_version IS DISTINCT FROM b.product_version_code
 OR source_qty IS NULL OR source_qty<b.authorized_micro
 THEN RAISE EXCEPTION 'OPS_A2_V2_SOURCE_REVISION_OR_CEILING_CHANGED'; END IF;
 RETURN b;
END $authorized$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_authorized_source_v2(jsonb)
 FROM PUBLIC,hft_r1_app_runtime;
COMMIT;
