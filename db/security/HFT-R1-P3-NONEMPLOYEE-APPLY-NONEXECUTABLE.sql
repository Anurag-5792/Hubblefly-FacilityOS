-- HFT R77 RETAINED MASTERS NON-EMPLOYEE APPLY — REVIEW ONLY.
-- NONEXECUTABLE / NOT INSTALLED. Do not add to canonical migrations 0001-0006.
-- Independent Security (10), Governance (11), QA (17), and deployment (13)
-- acceptance plus exact-hash technical authorization required.
-- No stock DML, no initial legal-entity/site/warehouse bootstrap, no key enrollment.
BEGIN;
DO $P3_R77_NONEMPLOYEE_STOP$ BEGIN
 RAISE EXCEPTION 'P3_R77_NONEMPLOYEE_APPLY_INSTALLATION_NOT_AUTHORIZED';
END $P3_R77_NONEMPLOYEE_STOP$;

-- Extend the pre-existing governed human qualification to four master kinds.
-- This schema correction is not a permission grant and cannot issue a human ID.
ALTER TABLE hft.p3_master_approver_qualification
 DROP CONSTRAINT p3_master_approver_qualification_kind_check;
ALTER TABLE hft.p3_master_approver_qualification
 ADD CONSTRAINT p3_master_approver_qualification_kind_check
 CHECK(kind IN('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION'));

-- Domain-separated exact contract. Never reuse the Employee decision domain.
CREATE FUNCTION hft.p3_nonemployee_decision_fields_v1(d jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp
AS $nonemployee_fields$
DECLARE keys text[]:=ARRAY['decisionVersion','kind','requestId',
 'requestPayloadSha256','recordId','expectedVersion','policyRevision',
 'decision','evidenceSha256','reason','legalEntityId','siteId','warehouseId'];
 k text;
BEGIN
 IF pg_catalog.jsonb_typeof(d)<>'object' OR
    (SELECT count(*) FROM pg_catalog.jsonb_object_keys(d))<>13
 THEN RAISE EXCEPTION 'P3_R77_NONEMPLOYEE_EXACT_DECISION_FIELDS'; END IF;
 FOREACH k IN ARRAY keys LOOP
  IF NOT(d?k) OR pg_catalog.jsonb_typeof(d->k)<>'string'
  THEN RAISE EXCEPTION 'P3_R77_NONEMPLOYEE_DECISION_FIELD_INVALID:%',k; END IF;
 END LOOP;
 IF d->>'decisionVersion'<>'HFT-R1-P3-NONEMPLOYEE-DECISION-V1'
 OR d->>'kind' NOT IN('ITEM','SUPPLIER','WAREHOUSE','LOCATION')
 OR d->>'decision' NOT IN('APPROVED','DENIED')
 OR d->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR d->>'requestPayloadSha256' !~ '^[0-9a-f]{64}$'
 OR d->>'evidenceSha256' !~ '^[0-9a-f]{64}$'
 OR d->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,17})$'
 OR d->>'policyRevision' !~ '^[1-9][0-9]{0,17}$'
 OR pg_catalog.length(d->>'reason') NOT BETWEEN 8 AND 300
 OR pg_catalog.btrim(d->>'reason')<>d->>'reason'
 THEN RAISE EXCEPTION 'P3_R77_NONEMPLOYEE_DECISION_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['recordId','legalEntityId','siteId','warehouseId'] LOOP
  IF d->>k !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
  THEN RAISE EXCEPTION 'P3_R77_NONEMPLOYEE_SCOPE_ID_INVALID:%',k; END IF;
 END LOOP;
 RETURN ARRAY(SELECT d->>v.field FROM
   pg_catalog.unnest(keys) WITH ORDINALITY v(field,ord) ORDER BY v.ord);
END $nonemployee_fields$;

CREATE FUNCTION hft.p3_nonemployee_decision_digest_v1(d jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp
AS $nonemployee_sha$
 SELECT pg_catalog.encode(hft_crypto.digest(
   hft.p2_length_prefixed_v1(hft.p3_nonemployee_decision_fields_v1(d)),
   'sha256'),'hex')
$nonemployee_sha$;

-- NO LOGIN may directly mutate masters; this stays a P3 owner function.
CREATE FUNCTION hft.p3_decide_apply_nonemployee_v1(d jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $nonemployee_apply$
DECLARE
 e text:=d->>'legalEntityId'; s text:=d->>'siteId';
 w text:=d->>'warehouseId'; actor text;
 req hft.p3_master_change_request%ROWTYPE;
 policy hft.p3_master_action_policy%ROWTYPE;
 k hft_secret.p3_master_decision_key%ROWTYPE;
 prior jsonb;after_value jsonb; applied_version bigint;
 prior_version bigint; prior_active boolean;
 maker_person text;reviewer_person text;updated_count integer;
 digest text;mac_expected bytea;mac_given bytea;diff integer:=0;
 i integer;v integer;issued bigint;expires bigint;now_epoch bigint;
 result_id text; parent text;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_engineering','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 THEN RAISE EXCEPTION 'P3_R77_RESTRICTED_RUNTIME_REQUIRED'; END IF;
 PERFORM hft.p3_nonemployee_decision_fields_v1(d);
 digest:=hft.p3_nonemployee_decision_digest_v1(d);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||e||':'||s||':'||w,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:P3:MASTER:'||e||':'||d->>'kind'||':'||d->>'recordId',0));
 SELECT * INTO req FROM hft.p3_master_change_request r
 WHERE r.request_id=(d->>'requestId')::uuid AND r.legal_entity_id=e
 AND r.site_id=s AND r.warehouse_id=w AND r.kind=d->>'kind'
 AND r.record_id=d->>'recordId'
 AND r.expected_version=(d->>'expectedVersion')::bigint
 AND r.payload_sha256=d->>'requestPayloadSha256' FOR UPDATE;
 IF req.request_id IS NULL OR
 EXISTS(SELECT 1 FROM hft.p3_master_decision dec WHERE dec.request_id=req.request_id)
 OR EXISTS(SELECT 1 FROM hft.p3_master_revision rev WHERE rev.request_id=req.request_id)
 THEN RAISE EXCEPTION 'P3_R77_SOURCE_ALREADY_DECIDED_OR_UNVERIFIED'; END IF;
 SELECT * INTO policy FROM hft.p3_master_action_policy pol
 WHERE pol.legal_entity_id=e AND pol.site_id=s AND pol.warehouse_id=w
 AND pol.kind=req.kind AND pol.operation=req.operation
 ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;
 IF policy.policy_revision IS NULL OR NOT policy.allow_action
 OR NOT policy.require_independent_person OR policy.require_checker
 OR policy.policy_revision::text<>d->>'policyRevision'
 OR pg_catalog.clock_timestamp()<policy.valid_from
 OR pg_catalog.clock_timestamp()>=policy.valid_until
 THEN RAISE EXCEPTION 'P3_R77_INDEPENDENT_POLICY_REQUIRED'; END IF;
 -- A checker-required policy remains DENIED until a separately qualified
 -- signed checker attestation and immutable chain exist. Never waive it.
 PERFORM 1 FROM hft.warehouse anchor
 JOIN hft.site site ON site.legal_entity_id=anchor.legal_entity_id
  AND site.id=anchor.site_id
 JOIN hft.legal_entity legal ON legal.id=anchor.legal_entity_id
 WHERE anchor.legal_entity_id=e AND anchor.site_id=s AND anchor.warehouse_id=w
 AND anchor.active AND site.active AND legal.active FOR SHARE OF anchor,site,legal;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_R77_ACTIVE_ANCHOR_REQUIRED'; END IF;
 IF pg_catalog.jsonb_typeof(proof)<>'object' OR
  (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 OR proof->>'proofVersion'<>'HFT-R1-P3-NONEMPLOYEE-DECISION-HMAC-V1'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'payloadSha256' IS DISTINCT FROM digest
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 THEN RAISE EXCEPTION 'P3_R77_SIGNED_PROOF_FORMAT_INVALID'; END IF;
 actor:=proof->>'actorSubject';
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 v:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expires<=now_epoch OR expires<=issued OR
 expires-issued>40 THEN RAISE EXCEPTION 'P3_R77_SIGNED_PROOF_EXPIRED'; END IF;
 SELECT * INTO k FROM hft_secret.p3_master_decision_key
 WHERE key_version=v FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL OR
 pg_catalog.clock_timestamp()<k.not_before OR
 pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'P3_R77_SIGNING_KEY_NOT_AUTHORIZED'; END IF;
 mac_expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',actor,proof->>'sessionId',digest,
  proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',
  proof->>'keyVersion']),k.key_bytes,'sha256');
 mac_given:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(mac_expected)<>32 OR
  pg_catalog.octet_length(mac_given)<>32
 THEN RAISE EXCEPTION 'P3_R77_HMAC_SIZE_DENIED'; END IF;
 FOR i IN 0..31 LOOP
  diff:=diff | (pg_catalog.get_byte(mac_expected,i) #
                pg_catalog.get_byte(mac_given,i));
 END LOOP;
 IF diff<>0 THEN RAISE EXCEPTION 'P3_R77_HMAC_MISMATCH'; END IF;
 PERFORM 1 FROM hft.posting_session ss
 WHERE ss.session_id=proof->>'sessionId' AND ss.actor_subject=actor
 AND ss.revoked_at IS NULL AND ss.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_R77_REVIEWER_SESSION_REVOKED'; END IF;
 SELECT hm.person_id INTO maker_person FROM hft.approval_human_login hm
 JOIN hft.approval_human human
 ON human.legal_entity_id=hm.legal_entity_id AND human.person_id=hm.person_id
 WHERE hm.legal_entity_id=e AND hm.actor_subject=req.requester_subject
 AND human.revoked_at IS NULL AND human.valid_from<=pg_catalog.clock_timestamp()
 AND human.valid_until>pg_catalog.clock_timestamp();
 SELECT hm.person_id INTO reviewer_person FROM hft.approval_human_login hm
 JOIN hft.approval_human human
 ON human.legal_entity_id=hm.legal_entity_id AND human.person_id=hm.person_id
 JOIN hft.p3_master_approver_qualification qual
 ON qual.legal_entity_id=hm.legal_entity_id AND qual.person_id=hm.person_id
 AND qual.site_id=s AND qual.warehouse_id=w AND qual.kind=req.kind
 AND qual.operation=req.operation
 WHERE hm.legal_entity_id=e AND hm.actor_subject=actor
 AND human.revoked_at IS NULL
 AND human.valid_from<=pg_catalog.clock_timestamp()
 AND human.valid_until>pg_catalog.clock_timestamp()
 AND qual.valid_from<=pg_catalog.clock_timestamp()
 AND qual.valid_until>pg_catalog.clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM hft.p3_master_qualification_revocation rev
 WHERE rev.legal_entity_id=e AND rev.site_id=s AND rev.warehouse_id=w
 AND rev.person_id=hm.person_id AND rev.kind=req.kind
 AND rev.operation=req.operation);
 IF maker_person IS NULL OR reviewer_person IS NULL OR
 maker_person=reviewer_person OR req.requester_subject=actor OR
 EXISTS(SELECT 1 FROM hft.approval_human_revocation rr
 WHERE rr.legal_entity_id=e AND rr.person_id IN(maker_person,reviewer_person))
 THEN RAISE EXCEPTION 'P3_R77_INDEPENDENT_HUMAN_REVIEW_REQUIRED'; END IF;
 PERFORM 1 FROM hft.p3_master_actor_grant g
 WHERE g.legal_entity_id=e AND g.site_id=s AND g.warehouse_id=w
 AND g.actor_subject=actor AND g.active AND g.may_read AND
 NOT EXISTS(SELECT 1 FROM hft.p3_master_actor_grant_revocation rev
 WHERE rev.legal_entity_id=e AND rev.site_id=s
 AND rev.warehouse_id=w AND rev.actor_subject=actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_R77_REVIEWER_SCOPE_NOT_GRANTED'; END IF;
 -- Identity state is loaded under the same advisory lock as P3 submission.
 SELECT v.version,v.active,pg_catalog.to_jsonb(v)
 INTO prior_version,prior_active,prior FROM hft.p3_master_read_v1 v
 WHERE v.legal_entity_id=e AND v.kind=req.kind AND v.record_id=req.record_id
 AND v.site_id IN('',s) AND v.warehouse_id IN('',w);
 IF req.operation='CREATE' THEN
  IF prior_version IS NOT NULL OR req.expected_version<>0
  THEN RAISE EXCEPTION 'P3_R77_DUPLICATE_MASTER_IDENTITY'; END IF;
 ELSE
  IF prior_version IS NULL OR prior_version<>req.expected_version OR
   (req.operation='ACTIVATE' AND prior_active) OR
   (req.operation='DEACTIVATE' AND NOT prior_active)
  THEN RAISE EXCEPTION 'P3_R77_STALE_MASTER_REVISION_OR_STATE'; END IF;
 END IF;
 IF req.kind='WAREHOUSE' AND req.operation='CREATE'
 THEN RAISE EXCEPTION 'P3_R77_FIRST_OR_NEW_WAREHOUSE_REQUIRES_SEPARATE_BOOTSTRAP'; END IF;
 IF req.kind='LOCATION' AND req.operation IN('EDIT','DEACTIVATE')
  AND EXISTS(SELECT 1 FROM hft.stock_account stock
   WHERE stock.legal_entity_id=e AND stock.warehouse_id=w
   AND stock.location_key=req.record_id)
 THEN RAISE EXCEPTION 'P3_R77_LOCATION_HAS_PROTECTED_STOCK_HISTORY'; END IF;
 IF req.kind='ITEM' AND req.operation IN('EDIT','DEACTIVATE')
 AND (EXISTS(SELECT 1 FROM hft.stock_command sc
   WHERE sc.legal_entity_id=e AND sc.item_code=req.record_id)
 OR EXISTS(SELECT 1 FROM hft.stock_account a
   WHERE a.legal_entity_id=e AND a.item_code=req.record_id)
 OR EXISTS(SELECT 1 FROM hft.serial_registry serial
   WHERE serial.legal_entity_id=e AND serial.item_code=req.record_id)
 OR EXISTS(SELECT 1 FROM hft.grn_line grn
   WHERE grn.legal_entity_id=e AND grn.item_code=req.record_id))
 THEN RAISE EXCEPTION 'P3_R77_ITEM_HAS_PROTECTED_STOCK_HISTORY'; END IF;
 IF req.kind='ITEM' AND req.operation='ACTIVATE' AND
  (pg_catalog.to_regclass('hft.item_version_photo_coverage_v1') IS NULL
   OR NOT EXISTS(SELECT 1 FROM hft.item_version_photo_coverage_v1 photo
    WHERE photo.legal_entity_id=e AND photo.item_code=req.record_id
    AND photo.state='ACTIVE' AND photo.approved_primary_count=1))
 THEN RAISE EXCEPTION 'P3_R77_ITEM_VERSION_PRIMARY_PHOTO_REQUIRED'; END IF;
 IF req.kind='WAREHOUSE' AND req.operation='DEACTIVATE'
 AND (EXISTS(SELECT 1 FROM hft.stock_account acct
   WHERE acct.legal_entity_id=e AND acct.warehouse_id=w)
 OR EXISTS(SELECT 1 FROM hft.location loc
   WHERE loc.legal_entity_id=e AND loc.warehouse_id=w AND loc.active)
 OR EXISTS(SELECT 1 FROM hft.grn doc
   WHERE doc.legal_entity_id=e AND doc.warehouse_id=w))
 THEN RAISE EXCEPTION 'P3_R77_WAREHOUSE_OPERATIONAL_HISTORY_HOLD'; END IF;
 IF req.kind='LOCATION' AND req.operation='ACTIVATE'
 THEN RAISE EXCEPTION 'P3_R77_LOCATION_P0_CERTIFICATION_APPLY_NOT_QUALIFIED'; END IF;
 IF req.kind='LOCATION' THEN
  parent:=COALESCE(req.proposed_values->>'parentLocationId','');
  IF req.operation IN('CREATE','EDIT') THEN
   IF parent=req.record_id THEN
    RAISE EXCEPTION 'P3_R77_LOCATION_SELF_PARENT_DENIED'; END IF;
   IF parent<>'' AND NOT EXISTS(
    SELECT 1 FROM hft.location loc
    WHERE loc.legal_entity_id=e AND loc.warehouse_id=w
    AND loc.location_id=parent AND loc.active)
   THEN RAISE EXCEPTION 'P3_R77_LOCATION_PARENT_NOT_ACTIVE'; END IF;
   -- Recursive walk of the proposed parent chain. A direct/self/indirect
   -- cycle is denied before the UPDATE, not repaired after posting.
   IF parent<>'' AND req.operation='EDIT' AND EXISTS(
    WITH RECURSIVE ancestor AS (
      SELECT l.location_id,l.parent_location_id,
       ARRAY[l.location_id]::text[] AS visited
      FROM hft.location l WHERE l.legal_entity_id=e
       AND l.warehouse_id=w AND l.location_id=parent
      UNION ALL
      SELECT l.location_id,l.parent_location_id,
       a.visited||l.location_id
      FROM ancestor a JOIN hft.location l
       ON l.legal_entity_id=e AND l.warehouse_id=w
       AND l.location_id=a.parent_location_id
      WHERE NOT l.location_id=ANY(a.visited)
    )
    SELECT 1 FROM ancestor WHERE location_id=req.record_id)
   THEN RAISE EXCEPTION 'P3_R77_LOCATION_INDIRECT_PARENT_CYCLE'; END IF;
  END IF;
  IF req.operation='DEACTIVATE' AND EXISTS(
   SELECT 1 FROM hft.location child WHERE child.legal_entity_id=e
   AND child.warehouse_id=w AND child.parent_location_id=req.record_id
   AND child.active)
  THEN RAISE EXCEPTION 'P3_R77_LOCATION_HAS_ACTIVE_CHILDREN'; END IF;
 END IF;
 IF d->>'decision'='APPROVED' THEN
  -- The master remains INACTIVE after CREATE. No stock effect is possible.
  IF req.kind='ITEM' THEN
   IF req.operation='CREATE' THEN
    INSERT INTO hft.item(legal_entity_id,item_code,uom,control_type,active,version)
    VALUES(e,req.record_id,req.proposed_values->>'uom',
     req.proposed_values->>'controlType',false,1);
   ELSIF req.operation='EDIT' THEN
    UPDATE hft.item SET uom=req.proposed_values->>'uom',
      control_type=req.proposed_values->>'controlType',version=version+1
    WHERE legal_entity_id=e AND item_code=req.record_id
      AND version=req.expected_version;
   ELSE
    UPDATE hft.item SET active=(req.operation='ACTIVATE'),version=version+1
    WHERE legal_entity_id=e AND item_code=req.record_id
      AND version=req.expected_version;
   END IF;
  ELSIF req.kind='SUPPLIER' THEN
   IF req.operation='CREATE' THEN
    INSERT INTO hft.supplier(legal_entity_id,supplier_id,legal_name,active,version)
    VALUES(e,req.record_id,req.proposed_values->>'legalName',false,1);
   ELSIF req.operation='EDIT' THEN
    UPDATE hft.supplier SET legal_name=req.proposed_values->>'legalName',
     version=version+1 WHERE legal_entity_id=e AND supplier_id=req.record_id
     AND version=req.expected_version;
   ELSE
    UPDATE hft.supplier SET active=(req.operation='ACTIVATE'),version=version+1
    WHERE legal_entity_id=e AND supplier_id=req.record_id
    AND version=req.expected_version;
   END IF;
  ELSIF req.kind='WAREHOUSE' THEN
   IF req.operation='EDIT' THEN
    IF req.proposed_values->>'siteId'<>s THEN
     RAISE EXCEPTION 'P3_R77_WAREHOUSE_SITE_REHOME_DENIED'; END IF;
    UPDATE hft.warehouse SET name=req.proposed_values->>'name',
     version=version+1 WHERE legal_entity_id=e AND warehouse_id=w
     AND site_id=s AND version=req.expected_version;
   ELSE
    UPDATE hft.warehouse SET active=(req.operation='ACTIVATE'),
      version=version+1 WHERE legal_entity_id=e AND warehouse_id=w
      AND site_id=s AND version=req.expected_version;
   END IF;
  ELSIF req.kind='LOCATION' THEN
   IF req.operation='CREATE' THEN
    INSERT INTO hft.location(legal_entity_id,warehouse_id,location_id,
      parent_location_id,active,version)
    VALUES(e,w,req.record_id,NULLIF(parent,''),false,1);
   ELSIF req.operation='EDIT' THEN
    UPDATE hft.location SET parent_location_id=NULLIF(parent,''),
     version=version+1 WHERE legal_entity_id=e AND warehouse_id=w
      AND location_id=req.record_id AND version=req.expected_version;
   ELSE
    UPDATE hft.location SET active=(req.operation='ACTIVATE'),version=version+1
    WHERE legal_entity_id=e AND warehouse_id=w AND location_id=req.record_id
    AND version=req.expected_version;
   END IF;
  END IF;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count<>1 THEN
   RAISE EXCEPTION 'P3_R77_MASTER_ATOMIC_COMPARE_AND_SET_FAILED'; END IF;
 END IF;
 -- Decision and its original nonce must be unique and immutable.
 INSERT INTO hft.p3_master_decision_nonce(key_version,nonce,request_id,
 payload_sha256,actor_subject,session_id,proof_mac_sha256)
 VALUES(v,proof->>'nonce',req.request_id,digest,actor,
 proof->>'sessionId',pg_catalog.encode(hft_crypto.digest(mac_given,'sha256'),'hex'));
 INSERT INTO hft.p3_master_decision(request_id,decision,approver_subject,
 approver_session_id,approver_person_id,policy_revision,
 request_payload_sha256,signed_decision_sha256,signed_proof_mac_sha256,
 evidence_sha256,reason)
 VALUES(req.request_id,d->>'decision',actor,proof->>'sessionId',
 reviewer_person,policy.policy_revision,req.payload_sha256,digest,
 pg_catalog.encode(hft_crypto.digest(mac_given,'sha256'),'hex'),
 d->>'evidenceSha256',d->>'reason');
 INSERT INTO hft.p3_master_audit(request_id,event_type,evidence_sha256,actor_subject)
 VALUES(req.request_id,CASE WHEN d->>'decision'='DENIED' THEN 'DENIED' ELSE 'APPROVED' END,
 digest,actor);
 IF d->>'decision'='DENIED' THEN
  RETURN pg_catalog.jsonb_build_object('state','DENIED','kind',req.kind,
   'requestId',req.request_id::text,'recordId',req.record_id,
   'version',NULL,'active',NULL);
 END IF;
 SELECT v.version,v.active,pg_catalog.to_jsonb(v)
 INTO applied_version,prior_active,after_value FROM hft.p3_master_read_v1 v
 WHERE v.legal_entity_id=e AND v.kind=req.kind AND v.record_id=req.record_id
 AND v.site_id IN('',s) AND v.warehouse_id IN('',w);
 IF applied_version IS NULL OR applied_version<>req.expected_version+1 OR
  (req.operation='CREATE' AND prior_active)
 THEN RAISE EXCEPTION 'P3_R77_APPLIED_REVISION_OR_INACTIVE_CREATE_FAILED'; END IF;
 INSERT INTO hft.p3_master_revision(legal_entity_id,kind,record_id,version,
  request_id,before_snapshot,after_snapshot,actor_subject)
 VALUES(e,req.kind,req.record_id,applied_version,req.request_id,
  prior,after_value,actor);
 INSERT INTO hft.p3_master_audit(request_id,event_type,evidence_sha256,actor_subject)
 VALUES(req.request_id,'APPLIED',pg_catalog.encode(hft_crypto.digest(
  pg_catalog.convert_to(after_value::text,'UTF8'),'sha256'),'hex'),actor);
 RETURN pg_catalog.jsonb_build_object('state','APPLIED','kind',req.kind,
  'requestId',req.request_id::text,'recordId',req.record_id,
  'version',applied_version::text,'active',prior_active);
END $nonemployee_apply$;

-- This file contains no runtime GRANT. A separately approved installer must:
-- 1. Grant precise table UPDATE/INSERT to NOLOGIN hft_r1_p3_master_owner only.
-- 2. Transfer this SECURITY DEFINER and exact digest/fields helpers.
-- 3. Keep runtime allowed EXECUTE to this function only after independent QA.
-- 4. Verify zero stock/approval-policy/secret direct runtime grants.
-- 5. Bind the exact installer SHA to an independent retained database admission.
-- The REVIEW candidate must never be copied into the canonical migrations.
REVOKE ALL ON FUNCTION
 hft.p3_nonemployee_decision_fields_v1(jsonb),
 hft.p3_nonemployee_decision_digest_v1(jsonb),
 hft.p3_decide_apply_nonemployee_v1(jsonb,jsonb)
 FROM PUBLIC,hft_r1_p3_master_runtime;
COMMIT;
