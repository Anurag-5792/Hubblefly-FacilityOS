-- HFT-R1-P3-MASTERS-REVIEW — NONEXECUTABLE DESIGN SOURCE / PRODUCTION NO-GO.
-- NEVER execute as part of migrations 0001–0006 or introduce manifest 0007.
-- This source depends on separately qualified P2 posting_session, length-prefix
-- codec, hft_crypto pgcrypto, roles, key custody and real isolated PG15+.
-- No key, person, credential, approval, database or stock posting is provisioned.
-- Apply only after independent source acceptance + separate MASTER migration approval.
BEGIN;
DO $preflight$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
  OR session_user<>'hft_engineering'
  OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6)
  OR to_regclass('hft.posting_session') IS NULL
  OR to_regprocedure('hft.p2_length_prefixed_v1(text[])') IS NULL
  OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_owner','MEMBER')
  OR to_regclass('hft.approval_human_login') IS NULL
  OR to_regclass('hft.approval_human_revocation') IS NULL
  OR to_regclass('hft.employee_custody') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname='hft_r1_p3_master_owner' AND NOT rolsuper AND NOT rolcanlogin)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname='hft_r1_p3_master_runtime' AND NOT rolsuper AND NOT rolcanlogin)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension
    WHERE extname='pgcrypto')
 THEN RAISE EXCEPTION 'P3_MASTER_ROLE_P2_CODEC_AND_DISPOSABLE_DB_REQUIRED'; END IF;
END $preflight$;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_r1_p3_master_owner
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Temporary secret-schema CREATE for migration owner, revoked before COMMIT.
GRANT CREATE ON SCHEMA hft_secret TO hft_engineering;
-- Keys installed only by separate authorized governance/key authority.
CREATE TABLE hft_secret.p3_master_invocation_key(
 key_version integer PRIMARY KEY CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,not_after timestamptz NOT NULL,
 revoked_at timestamptz,CHECK(not_before<not_after)
);
-- The decision proof is separately purpose-bound; it does not create
-- a second login/identity authority. Both bind existing verified sessions.
CREATE TABLE hft_secret.p3_master_decision_key(
 key_version integer PRIMARY KEY CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,not_after timestamptz NOT NULL,
 revoked_at timestamptz,CHECK(not_before<not_after)
);
REVOKE ALL ON hft_secret.p3_master_invocation_key,
 hft_secret.p3_master_decision_key FROM PUBLIC,hft_r1_p3_master_runtime;
REVOKE CREATE ON SCHEMA hft_secret FROM hft_engineering;

-- Scope grants are governed facts; P3 runtime never INSERTs/UPDATEs them.
CREATE TABLE hft.p3_master_actor_grant(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 actor_subject text NOT NULL,may_read boolean NOT NULL,may_submit boolean NOT NULL,
 active boolean NOT NULL,grant_evidence_sha256 text NOT NULL
 CHECK(grant_evidence_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,actor_subject),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id)
);
-- Append-only grant revocations serialize using the warehouse scope gate.
-- Grant rows themselves are immutable; no unaudited active-status rewrite.
CREATE TABLE hft.p3_master_actor_grant_revocation(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 actor_subject text NOT NULL,revoked_by text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 revoked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,actor_subject),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,actor_subject)
 REFERENCES hft.p3_master_actor_grant(legal_entity_id,site_id,warehouse_id,actor_subject)
);
CREATE TABLE hft.p3_master_invocation_nonce(
 key_version integer NOT NULL,nonce text NOT NULL CHECK(nonce~'^[0-9a-f]{48}$'),
 request_id uuid NOT NULL UNIQUE,payload_sha256 text NOT NULL,
 actor_subject text NOT NULL,session_id text NOT NULL,used_at timestamptz
 NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(key_version,nonce)
);
CREATE TABLE hft.p3_master_change_request(
 request_id uuid PRIMARY KEY,kind text NOT NULL
 CHECK(kind IN ('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')),
 operation text NOT NULL CHECK(operation IN ('CREATE','EDIT','ACTIVATE','DEACTIVATE')),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 record_id text NOT NULL,expected_version bigint NOT NULL CHECK(expected_version>=0),
 reason text NOT NULL,proposed_values jsonb NOT NULL,payload_sha256 text NOT NULL,
 requester_subject text NOT NULL,requester_session_id text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 CHECK(jsonb_typeof(proposed_values)='object'),
 CHECK((operation='CREATE' AND expected_version=0) OR
       (operation<>'CREATE' AND expected_version>0))
);
-- Missing policy means DENY. No mandatory independent person is invented.
-- Policies and human qualifications are governed, append-only source facts.
CREATE TABLE hft.p3_master_action_policy(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')),
 operation text NOT NULL CHECK(operation IN ('CREATE','EDIT','ACTIVATE','DEACTIVATE')),
 policy_revision bigint NOT NULL CHECK(policy_revision>0),
 allow_action boolean NOT NULL,require_independent_person boolean NOT NULL,
 require_checker boolean NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,kind,operation,policy_revision),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 CHECK(valid_from<valid_until)
);
CREATE TABLE hft.p3_master_approver_qualification(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 person_id text NOT NULL,kind text NOT NULL CHECK(kind='EMPLOYEE'),
 operation text NOT NULL CHECK(operation IN ('CREATE','EDIT','ACTIVATE','DEACTIVATE')),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,person_id,kind,operation),
 FOREIGN KEY(legal_entity_id,person_id)
 REFERENCES hft.approval_human(legal_entity_id,person_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 CHECK(valid_from<valid_until)
);
CREATE TABLE hft.p3_master_qualification_revocation(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 person_id text NOT NULL,kind text NOT NULL,operation text NOT NULL,
 revoked_by text NOT NULL,revocation_evidence_sha256 text NOT NULL
 CHECK(revocation_evidence_sha256~'^[0-9a-f]{64}$'),
 revoked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,person_id,kind,operation),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,person_id,kind,operation)
 REFERENCES hft.p3_master_approver_qualification
 (legal_entity_id,site_id,warehouse_id,person_id,kind,operation)
);
CREATE TABLE hft.p3_master_decision_nonce(
 key_version integer NOT NULL,nonce text NOT NULL CHECK(nonce~'^[0-9a-f]{48}$'),
 request_id uuid NOT NULL UNIQUE REFERENCES hft.p3_master_change_request(request_id),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 actor_subject text NOT NULL,session_id text NOT NULL,
 proof_mac_sha256 text NOT NULL CHECK(proof_mac_sha256~'^[0-9a-f]{64}$'),
 used_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(key_version,nonce)
);
-- Decisions are never UPDATEd or deleted and bind an actual verified
-- person, session, signed exact source revision and current policy.
CREATE TABLE hft.p3_master_decision(
 request_id uuid PRIMARY KEY REFERENCES hft.p3_master_change_request(request_id),
 decision text NOT NULL CHECK(decision IN ('APPROVED','DENIED')),
 approver_subject text NOT NULL,approver_session_id text NOT NULL,
 approver_person_id text NOT NULL,policy_revision bigint NOT NULL,
 request_payload_sha256 text NOT NULL CHECK(request_payload_sha256~'^[0-9a-f]{64}$'),
 signed_decision_sha256 text NOT NULL CHECK(signed_decision_sha256~'^[0-9a-f]{64}$'),
 signed_proof_mac_sha256 text NOT NULL CHECK(signed_proof_mac_sha256~'^[0-9a-f]{64}$'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 reason text NOT NULL CHECK(pg_catalog.length(reason) BETWEEN 8 AND 300),
 decided_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 FOREIGN KEY(request_id) REFERENCES hft.p3_master_decision_nonce(request_id)
);
-- Every eventually APPLIED approved master revision must be captured here,
-- in the SAME transaction as the authoritative master-table mutation.
CREATE TABLE hft.p3_master_revision(
 legal_entity_id text NOT NULL,kind text NOT NULL,record_id text NOT NULL,
 version bigint NOT NULL CHECK(version>0),request_id uuid NOT NULL UNIQUE
 REFERENCES hft.p3_master_change_request(request_id),
 before_snapshot jsonb,after_snapshot jsonb NOT NULL,actor_subject text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(legal_entity_id,kind,record_id,version)
);
CREATE TABLE hft.p3_master_audit(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES hft.p3_master_change_request(request_id),
 event_type text NOT NULL CHECK(event_type IN ('REQUESTED','DENIED','BLOCKED','APPROVED','APPLIED')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 actor_subject text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $facts$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['p3_master_invocation_nonce','p3_master_change_request',
 'p3_master_decision','p3_master_revision','p3_master_audit',
  'p3_master_decision_nonce','p3_master_action_policy',
  'p3_master_approver_qualification','p3_master_qualification_revocation',
  'p3_master_actor_grant','p3_master_actor_grant_revocation']
 LOOP
 EXECUTE pg_catalog.format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON hft.%I '||
  'FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation()',
  'p3_immutable_'||t,t);
 END LOOP;
END $facts$;
-- Single read projection, no fabricated metric or row. Existing master rows
-- remain authoritative until a separately approved writer applies revisions.
CREATE VIEW hft.p3_master_read_v1 AS
 SELECT 'EMPLOYEE'::text kind,legal_entity_id,site_id,''::text warehouse_id,
 employee_id record_id,version,active,
 pg_catalog.jsonb_build_object('fullName',full_name,'department',department,
  'designation',designation,'siteId',site_id) AS master_values FROM hft.employee
 UNION ALL SELECT 'ITEM',legal_entity_id,''::text,''::text,item_code,
 version,active,pg_catalog.jsonb_build_object('uom',uom,'controlType',control_type)
 FROM hft.item
 UNION ALL SELECT 'SUPPLIER',legal_entity_id,''::text,''::text,supplier_id,
 version,active,pg_catalog.jsonb_build_object('legalName',legal_name)
 FROM hft.supplier
 UNION ALL SELECT 'WAREHOUSE',legal_entity_id,site_id,warehouse_id,warehouse_id,
 version,active,pg_catalog.jsonb_build_object('name',name,'siteId',site_id)
 FROM hft.warehouse
 UNION ALL SELECT 'LOCATION',l.legal_entity_id,w.site_id,l.warehouse_id,l.location_id,
 l.version,l.active,pg_catalog.jsonb_build_object('parentLocationId',
 pg_catalog.coalesce(l.parent_location_id,''))
 FROM hft.location l JOIN hft.warehouse w ON
 w.legal_entity_id=l.legal_entity_id AND w.warehouse_id=l.warehouse_id;
CREATE VIEW hft.p3_master_request_status_v1 AS
 SELECT r.request_id,r.kind,r.operation,r.legal_entity_id,r.site_id,r.warehouse_id,
 r.record_id,r.expected_version,r.reason,r.requester_subject,r.requested_at,
 CASE WHEN a.request_id IS NOT NULL THEN 'APPLIED'
 WHEN d.decision IS NOT NULL THEN d.decision ELSE 'PENDING_APPROVAL' END AS state,
 r.payload_sha256,r.proposed_values,d.approver_subject,d.policy_revision
 FROM hft.p3_master_change_request r LEFT JOIN hft.p3_master_decision d
 ON d.request_id=r.request_id
 LEFT JOIN hft.p3_master_revision a ON a.request_id=r.request_id;
-- Match EXACT TypeScript P3 contract field order and key set, including
-- per-kind source field order; never hash PostgreSQL JSONB display text.
CREATE FUNCTION hft.p3_master_fields_v1(p jsonb) RETURNS text[]
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $p3fields$
DECLARE names text[]:=ARRAY['contractVersion','requestId','kind','operation',
 'legalEntityId','siteId','warehouseId','recordId','expectedVersion','reason','values'];
 extra text[];k text;result text[];v text;
BEGIN
 IF pg_catalog.jsonb_typeof(p)<>'object'
  OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p))<>11
 THEN RAISE EXCEPTION 'P3_PAYLOAD_SHAPE_INVALID'; END IF;
 FOREACH k IN ARRAY names LOOP
  IF NOT (p?k) THEN RAISE EXCEPTION 'P3_FIELD_MISSING:%',k; END IF;
 END LOOP;
 IF p->>'contractVersion'<>'HFT-R1-P3-MASTER-V1'
  OR p->>'kind' NOT IN ('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')
  OR p->>'operation' NOT IN ('CREATE','EDIT','ACTIVATE','DEACTIVATE')
  OR (p->>'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'P3_PAYLOAD_ACTION_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['legalEntityId','siteId','warehouseId','recordId'] LOOP
  IF pg_catalog.jsonb_typeof(p->k)<>'string' OR
   (p->>k) !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
  THEN RAISE EXCEPTION 'P3_SCOPE_IDENTIFIER_INVALID:%',k; END IF;
 END LOOP;
 IF pg_catalog.jsonb_typeof(p->'expectedVersion')<>'string'
 OR (p->>'expectedVersion') !~ '^(0|[1-9][0-9]*)$'
 OR pg_catalog.length(p->>'expectedVersion')>19
 OR (p->>'expectedVersion')::numeric>9223372036854775807
 OR ((p->>'operation'='CREATE')<>(p->>'expectedVersion'='0'))
 THEN RAISE EXCEPTION 'P3_EXPECTED_VERSION_INVALID'; END IF;
 IF pg_catalog.jsonb_typeof(p->'reason')<>'string'
 OR pg_catalog.length(p->>'reason') NOT BETWEEN 8 AND 300
 OR pg_catalog.btrim(p->>'reason')<>p->>'reason'
 THEN RAISE EXCEPTION 'P3_REASON_INVALID'; END IF;
 IF pg_catalog.jsonb_typeof(p->'values')<>'object'
 THEN RAISE EXCEPTION 'P3_VALUES_SHAPE_INVALID'; END IF;
 extra:=CASE WHEN p->>'operation' IN ('ACTIVATE','DEACTIVATE') THEN ARRAY[]::text[]
 WHEN p->>'kind'='EMPLOYEE' THEN ARRAY['fullName','department','designation','siteId']
 WHEN p->>'kind'='ITEM' THEN ARRAY['uom','controlType']
 WHEN p->>'kind'='SUPPLIER' THEN ARRAY['legalName']
 WHEN p->>'kind'='WAREHOUSE' THEN ARRAY['name','siteId']
 ELSE ARRAY['parentLocationId'] END;
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p->'values'))<>
    pg_catalog.cardinality(extra) THEN RAISE EXCEPTION 'P3_VALUES_COUNT_INVALID'; END IF;
 FOREACH k IN ARRAY extra LOOP
  IF NOT (p->'values'?k) OR pg_catalog.jsonb_typeof(p->'values'->k)<>'string'
  THEN RAISE EXCEPTION 'P3_VALUE_MISSING_OR_NOT_STRING:%',k; END IF;
  v:=p->'values'->>k;
  IF NOT (k='parentLocationId' AND v='') AND
    (v='' OR pg_catalog.length(v)>160 OR v<>pg_catalog.btrim(v))
  THEN RAISE EXCEPTION 'P3_VALUE_INVALID:%',k; END IF;
  IF k IN ('siteId','uom','parentLocationId') AND v<>'' AND
    v !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
  THEN RAISE EXCEPTION 'P3_VALUE_REFERENCE_INVALID:%',k; END IF;
 END LOOP;
 IF p->>'kind'='ITEM' AND p->>'operation' IN ('CREATE','EDIT')
 AND p->'values'->>'controlType' NOT IN ('NONE','BATCH','SERIAL')
 THEN RAISE EXCEPTION 'P3_CONTROL_TYPE_INVALID'; END IF;
 IF p->>'kind'='WAREHOUSE' AND p->>'recordId'<>p->>'warehouseId'
 OR p->>'kind' IN ('EMPLOYEE','WAREHOUSE') AND p->>'operation' IN ('CREATE','EDIT')
   AND p->'values'->>'siteId'<>p->>'siteId'
 OR p->>'kind'='LOCATION' AND p->'values'->>'parentLocationId'=p->>'recordId'
 THEN RAISE EXCEPTION 'P3_SCOPE_FIELD_MISMATCH'; END IF;
 result:=ARRAY[p->>'contractVersion',p->>'requestId',p->>'kind',p->>'operation',
 p->>'legalEntityId',p->>'siteId',p->>'warehouseId',p->>'recordId',
 p->>'expectedVersion',p->>'reason'];
 RETURN result||ARRAY(SELECT p->'values'->>x.key
  FROM pg_catalog.unnest(extra) WITH ORDINALITY AS x(key,ordinality)
  ORDER BY x.ordinality);
END $p3fields$;
CREATE FUNCTION hft.p3_master_digest_v1(p jsonb) RETURNS text
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(hft.p3_master_fields_v1(p)),'sha256'),'hex')
$$;

-- Cryptographic read capability: a stolen shared database login alone
-- cannot query any master rows. No runtime SELECT on views, tables or
-- grants. READ ONLY transactions call just this SECURITY DEFINER function.
CREATE FUNCTION hft.p3_master_read_fields_v1(q jsonb) RETURNS text[]
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $readfields$
DECLARE field text;expected text[]:=ARRAY['intent','kind','legalEntityId',
 'siteId','warehouseId','search'];v text;
BEGIN
 IF pg_catalog.jsonb_typeof(q)<>'object' THEN
  RAISE EXCEPTION 'P3_READ_SHAPE_INVALID'; END IF;
 IF q->>'intent' NOT IN ('LIST','GET','REQUESTS','REVIEW_QUEUE')
  OR q->>'kind' NOT IN ('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')
 THEN RAISE EXCEPTION 'P3_READ_KIND_INVALID'; END IF;
 IF q->>'intent'='REVIEW_QUEUE' AND q->>'kind'<>'EMPLOYEE'
 THEN RAISE EXCEPTION 'P3_EMPLOYEE_ONLY_REVIEW_QUEUE'; END IF;
 IF q->>'intent'='GET' THEN expected:=expected||ARRAY['recordId']; END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(q))<>pg_catalog.cardinality(expected)
 THEN RAISE EXCEPTION 'P3_READ_FIELD_COUNT_INVALID'; END IF;
 FOREACH field IN ARRAY expected LOOP
  IF NOT (q?field) OR pg_catalog.jsonb_typeof(q->field)<>'string'
  THEN RAISE EXCEPTION 'P3_READ_FIELD_MISSING:%',field; END IF;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['legalEntityId','siteId','warehouseId'] LOOP
  IF (q->>field) !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
  THEN RAISE EXCEPTION 'P3_READ_SCOPE_INVALID:%',field; END IF;
 END LOOP;
 v:=q->>'search';
 IF pg_catalog.length(v)>80 OR v !~ '^[A-Za-z0-9 ._-]*$'
 THEN RAISE EXCEPTION 'P3_READ_SEARCH_INVALID'; END IF;
 IF q->>'intent'='GET' AND (q->>'recordId') !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
 THEN RAISE EXCEPTION 'P3_READ_RECORD_INVALID'; END IF;
 IF q->>'intent'='GET' AND q->>'kind'='WAREHOUSE' AND
 q->>'recordId'<>q->>'warehouseId'
 THEN RAISE EXCEPTION 'P3_READ_WAREHOUSE_CROSS_SCOPE'; END IF;
 RETURN ARRAY['HFT-R1-P3-MASTER-READ-V1',q->>'intent',q->>'kind',
 q->>'legalEntityId',q->>'siteId',q->>'warehouseId',q->>'search',
 pg_catalog.coalesce(q->>'recordId','')];
END $readfields$;
CREATE FUNCTION hft.p3_master_read_digest_v1(q jsonb) RETURNS text
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $readsha$
 SELECT pg_catalog.encode(hft_crypto.digest(
 hft.p2_length_prefixed_v1(hft.p3_master_read_fields_v1(q)),'sha256'),'hex')
$readsha$;
CREATE FUNCTION hft.p3_read_masters_v1(q jsonb,proof jsonb) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $reader$
DECLARE
 e text:=q->>'legalEntityId';s text:=q->>'siteId';w text:=q->>'warehouseId';
 actor text; digest text;given bytea;expected bytea;difference integer:=0; idx integer;
 issued bigint;expires bigint;ver integer;now_epoch bigint;
 secret hft_secret.p3_master_invocation_key%ROWTYPE;
 rows_json jsonb:='[]'::jsonb; who text; decision_person text;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_engineering','MEMBER')
 THEN RAISE EXCEPTION 'P3_RESTRICTED_READ_ONLY_LOGIN_REQUIRED'; END IF;
 PERFORM hft.p3_master_read_fields_v1(q);
 digest:=hft.p3_master_read_digest_v1(q);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 OR proof->>'proofVersion'<>'HFT-R1-P3-MASTER-READ-HMAC-V1'
 OR proof->>'payloadSha256' IS DISTINCT FROM digest
 OR (proof->>'actorSubject') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR (proof->>'sessionId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 OR (proof->>'issuedAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'P3_READ_PROOF_FORMAT_INVALID'; END IF;
 FOR who IN SELECT x.name FROM pg_catalog.unnest(ARRAY['proofVersion',
 'actorSubject','sessionId','payloadSha256','issuedAt','expiresAt',
 'nonce','keyVersion','macSha256']) AS x(name) LOOP
 IF pg_catalog.jsonb_typeof(proof->who)<>'string'
 THEN RAISE EXCEPTION 'P3_READ_PROOF_NOT_STRING'; END IF; END LOOP;
 IF (proof->>'issuedAt')::numeric>9223372036854775807
 OR (proof->>'expiresAt')::numeric>9223372036854775807
 OR (proof->>'keyVersion')::numeric>2147483647
 THEN RAISE EXCEPTION 'P3_READ_PROOF_NUMBER_RANGE'; END IF;
 actor:=proof->>'actorSubject';
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 ver:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expires<=now_epoch OR expires<=issued OR expires-issued>60
 THEN RAISE EXCEPTION 'P3_READ_PROOF_EXPIRED'; END IF;
 SELECT * INTO secret FROM hft_secret.p3_master_invocation_key key
 WHERE key.key_version=ver;
 IF secret.key_version IS NULL OR secret.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<secret.not_before OR
 pg_catalog.clock_timestamp()>=secret.not_after
 THEN RAISE EXCEPTION 'P3_READ_SIGNING_KEY_INACTIVE'; END IF;
 expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
 'HFT-R1-P3-MASTER-READ-HMAC-V1',actor,proof->>'sessionId',digest,
 proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',proof->>'keyVersion']),
 secret.key_bytes,'sha256');
 given:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(expected)<>32 OR pg_catalog.octet_length(given)<>32
 THEN RAISE EXCEPTION 'P3_READ_MAC_LENGTH_INVALID'; END IF;
 FOR idx IN 0..31 LOOP difference:=difference |
  (pg_catalog.get_byte(expected,idx) # pg_catalog.get_byte(given,idx)); END LOOP;
 IF difference<>0 THEN RAISE EXCEPTION 'P3_READ_MAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session sess
 WHERE sess.session_id=proof->>'sessionId' AND sess.actor_subject=actor
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_READ_SESSION_NOT_ACTIVE'; END IF;
 PERFORM 1 FROM hft.p3_master_actor_grant grant_row
 WHERE grant_row.legal_entity_id=e AND grant_row.site_id=s
 AND grant_row.warehouse_id=w AND grant_row.actor_subject=actor
 AND grant_row.active AND grant_row.may_read
 AND NOT EXISTS (SELECT 1 FROM hft.p3_master_actor_grant_revocation rev
  WHERE rev.legal_entity_id=e AND rev.site_id=s AND rev.warehouse_id=w
   AND rev.actor_subject=actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_READ_PERSISTED_SCOPE_DENIED'; END IF;
 PERFORM 1 FROM hft.warehouse wh JOIN hft.site site
  ON site.legal_entity_id=wh.legal_entity_id AND site.id=wh.site_id
 JOIN hft.legal_entity le ON le.id=wh.legal_entity_id
 WHERE wh.legal_entity_id=e AND wh.site_id=s AND wh.warehouse_id=w
 AND wh.active AND site.active AND le.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_READ_SCOPE_INACTIVE'; END IF;
 IF q->>'intent' IN ('LIST','GET') THEN
  SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)
   ORDER BY t.record_id),'[]'::jsonb) INTO rows_json
  FROM (SELECT record_id,kind,legal_entity_id,site_id,warehouse_id,
   version,active,master_values AS "values"
   FROM hft.p3_master_read_v1
   WHERE legal_entity_id=e AND kind=q->>'kind'
   AND site_id IN ('',s) AND warehouse_id IN ('',w)
   AND (q->>'intent'<>'GET' OR record_id=q->>'recordId')
   AND (q->>'intent'<>'LIST' OR
     pg_catalog.strpos(pg_catalog.lower(record_id),pg_catalog.lower(q->>'search'))>0)
   ORDER BY record_id LIMIT 50) t;
 ELSIF q->>'intent'='REQUESTS' THEN
  SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)
   ORDER BY t.requested_at DESC,t.request_id DESC),'[]'::jsonb) INTO rows_json
  FROM (SELECT request_id::text AS request_id,kind,operation,record_id,
   expected_version,state,reason,requested_at,requester_subject,
   legal_entity_id,site_id,warehouse_id,payload_sha256
   FROM hft.p3_master_request_status_v1
   WHERE legal_entity_id=e AND site_id=s AND warehouse_id=w
     AND kind=q->>'kind' AND requester_subject=actor
   ORDER BY requested_at DESC,request_id DESC LIMIT 50) t;
 ELSIF q->>'intent'='REVIEW_QUEUE' THEN
  -- P2 human IDs prevent two login aliases being counted as two people.
  -- A reviewer sees only pending Employee requests they are eligible to
  -- decide, under a currently effective action-specific policy.
  SELECT l.person_id INTO decision_person FROM hft.approval_human_login l
  JOIN hft.approval_human h ON h.legal_entity_id=l.legal_entity_id
  AND h.person_id=l.person_id
  WHERE l.legal_entity_id=e AND l.actor_subject=actor
  AND h.revoked_at IS NULL AND h.valid_from<=pg_catalog.clock_timestamp()
  AND h.valid_until>pg_catalog.clock_timestamp()
  AND NOT EXISTS(SELECT 1 FROM hft.approval_human_revocation hr
    WHERE hr.legal_entity_id=e AND hr.person_id=h.person_id);
  IF decision_person IS NULL THEN RAISE EXCEPTION 'P3_REVIEWER_IDENTITY_NOT_VERIFIED'; END IF;
  SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)
   ORDER BY t.requested_at DESC,t.request_id DESC),'[]'::jsonb) INTO rows_json
  FROM (
  SELECT r.request_id::text AS request_id,r.legal_entity_id,r.site_id,
   r.warehouse_id,r.kind,r.operation,r.record_id,r.expected_version,
   r.reason,r.requested_at,r.requester_subject,r.payload_sha256,
   r.proposed_values,pol.policy_revision::text AS policy_revision,
   'PENDING_APPROVAL'::text AS state
  FROM hft.p3_master_change_request r
  JOIN hft.approval_human_login maker ON maker.legal_entity_id=r.legal_entity_id
   AND maker.actor_subject=r.requester_subject
  JOIN hft.p3_master_action_policy pol ON pol.legal_entity_id=r.legal_entity_id
   AND pol.site_id=r.site_id AND pol.warehouse_id=r.warehouse_id
   AND pol.kind=r.kind AND pol.operation=r.operation
   AND pol.policy_revision=(SELECT pg_catalog.max(p2.policy_revision)
     FROM hft.p3_master_action_policy p2
     WHERE p2.legal_entity_id=pol.legal_entity_id AND p2.site_id=pol.site_id
     AND p2.warehouse_id=pol.warehouse_id AND p2.kind=pol.kind
     AND p2.operation=pol.operation)
  JOIN hft.p3_master_approver_qualification qual ON
   qual.legal_entity_id=r.legal_entity_id AND qual.site_id=r.site_id
   AND qual.warehouse_id=r.warehouse_id AND qual.kind=r.kind
   AND qual.operation=r.operation AND qual.person_id=decision_person
  WHERE r.legal_entity_id=e AND r.site_id=s AND r.warehouse_id=w
   AND r.kind='EMPLOYEE' AND maker.person_id<>decision_person
   AND pol.allow_action AND pol.require_independent_person
   AND NOT pol.require_checker
   AND pol.valid_from<=pg_catalog.clock_timestamp()
   AND pol.valid_until>pg_catalog.clock_timestamp()
   AND qual.valid_from<=pg_catalog.clock_timestamp()
   AND qual.valid_until>pg_catalog.clock_timestamp()
   AND NOT EXISTS(SELECT 1 FROM hft.p3_master_qualification_revocation rev
     WHERE rev.legal_entity_id=e AND rev.site_id=s AND rev.warehouse_id=w
       AND rev.person_id=decision_person AND rev.kind=r.kind
       AND rev.operation=r.operation)
   AND NOT EXISTS(SELECT 1 FROM hft.p3_master_decision d
      WHERE d.request_id=r.request_id)
  ORDER BY r.requested_at DESC,r.request_id DESC LIMIT 50
  ) t;
 ELSE RAISE EXCEPTION 'P3_READ_INTENT_DENIED'; END IF;
 RETURN pg_catalog.jsonb_build_object('state','AVAILABLE','records',rows_json);
END $reader$;

-- Exact one protected P3 DRAFT writer. It cannot mutate employee, item,
-- supplier, warehouse, location, P2 stock accounts, ledger or audit.
CREATE FUNCTION hft.p3_submit_master_change_v1(p jsonb,proof jsonb) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $p3submit$
DECLARE
 e text:=p->>'legalEntityId';s text:=p->>'siteId';w text:=p->>'warehouseId';
 actor text;mac bytea;claim bytea;diff integer:=0;i integer;digest text;
 now_epoch bigint;iat bigint;exp bigint;ver integer;existing record;
 secret hft_secret.p3_master_invocation_key%ROWTYPE;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
  OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
  OR pg_catalog.pg_has_role(session_user,'hft_engineering','MEMBER')
  OR pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_owner','MEMBER')
 THEN RAISE EXCEPTION 'P3_SIGNED_ISOLATED_RUNTIME_REQUIRED'; END IF;
 PERFORM hft.p3_master_fields_v1(p);
 digest:=hft.p3_master_digest_v1(p);
 -- Gate first; master identity second; source/actor/session third; write last.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||e||':'||s||':'||w,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:P3:MASTER:'||e||':'||p->>'kind'||':'||p->>'recordId',0));
 PERFORM 1 FROM hft.warehouse wh JOIN hft.site site
  ON site.legal_entity_id=wh.legal_entity_id AND site.id=wh.site_id
 JOIN hft.legal_entity le ON le.id=wh.legal_entity_id
 WHERE wh.legal_entity_id=e AND wh.site_id=s AND wh.warehouse_id=w
 AND wh.active AND site.active AND le.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_MASTER_SCOPE_INACTIVE'; END IF;
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 OR proof->>'proofVersion'<>'HFT-R1-P3-MASTER-HMAC-V1'
 OR proof->>'payloadSha256' IS DISTINCT FROM digest
 OR (proof->>'actorSubject') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR (proof->>'sessionId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 OR (proof->>'issuedAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'P3_INVOCATION_PROOF_INVALID'; END IF;
 FOREACH actor IN ARRAY ARRAY['actorSubject','sessionId','payloadSha256',
  'issuedAt','expiresAt','nonce','keyVersion','macSha256']
 LOOP
  IF pg_catalog.jsonb_typeof(proof->actor)<>'string'
  THEN RAISE EXCEPTION 'P3_PROOF_NONSTRING_FIELD'; END IF;
 END LOOP;
 actor:=proof->>'actorSubject';
 IF (proof->>'issuedAt')::numeric>9223372036854775807
 OR (proof->>'expiresAt')::numeric>9223372036854775807
 OR (proof->>'keyVersion')::numeric>2147483647
 THEN RAISE EXCEPTION 'P3_PROOF_NUMBER_OUT_OF_RANGE'; END IF;
 iat:=(proof->>'issuedAt')::bigint;exp:=(proof->>'expiresAt')::bigint;
 ver:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF iat>now_epoch+30 OR exp<=now_epoch OR exp<=iat OR exp-iat>60
 THEN RAISE EXCEPTION 'P3_PROOF_EXPIRED_OR_FUTURE'; END IF;
 SELECT * INTO secret FROM hft_secret.p3_master_invocation_key sk
 WHERE sk.key_version=ver;
 IF secret.key_version IS NULL OR secret.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<secret.not_before OR
 pg_catalog.clock_timestamp()>=secret.not_after
 THEN RAISE EXCEPTION 'P3_SIGNING_KEY_UNAVAILABLE'; END IF;
 mac:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  'HFT-R1-P3-MASTER-HMAC-V1',actor,proof->>'sessionId',digest,
  proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',proof->>'keyVersion']),
  secret.key_bytes,'sha256');
 claim:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(mac)<>32 OR pg_catalog.octet_length(claim)<>32
 THEN RAISE EXCEPTION 'P3_MAC_LENGTH_INVALID'; END IF;
 FOR i IN 0..31 LOOP
  diff:=diff | (pg_catalog.get_byte(mac,i) # pg_catalog.get_byte(claim,i));
 END LOOP;
 IF diff<>0 THEN RAISE EXCEPTION 'P3_MAC_MISMATCH'; END IF;
 PERFORM 1 FROM hft.posting_session ps
 WHERE ps.session_id=proof->>'sessionId' AND ps.actor_subject=actor
 AND ps.revoked_at IS NULL AND ps.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_SESSION_REVOKED_OR_UNKNOWN'; END IF;
 PERFORM 1 FROM hft.p3_master_actor_grant g
 WHERE g.legal_entity_id=e AND g.site_id=s AND g.warehouse_id=w
 AND g.actor_subject=actor AND g.active AND g.may_submit AND g.may_read
 AND NOT EXISTS(SELECT 1 FROM hft.p3_master_actor_grant_revocation rev
 WHERE rev.legal_entity_id=e AND rev.site_id=s AND rev.warehouse_id=w
 AND rev.actor_subject=actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_MASTER_SUBMIT_NOT_AUTHORIZED'; END IF;
 -- Independent approval cannot be issued for an unverifiable maker.
 -- Reuse the P2 verified person/login registry, never a submitted human ID.
 PERFORM 1 FROM hft.approval_human_login login
 JOIN hft.approval_human human ON
  human.legal_entity_id=login.legal_entity_id AND human.person_id=login.person_id
 WHERE login.legal_entity_id=e AND login.actor_subject=actor
 AND human.revoked_at IS NULL AND human.valid_from<=pg_catalog.clock_timestamp()
 AND human.valid_until>pg_catalog.clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM hft.approval_human_revocation rev
  WHERE rev.legal_entity_id=e AND rev.person_id=human.person_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_VERIFIED_REGISTERED_MAKER_REQUIRED'; END IF;
 SELECT * INTO existing FROM hft.p3_master_read_v1 rec WHERE
 rec.legal_entity_id=e AND rec.kind=p->>'kind' AND rec.record_id=p->>'recordId'
 AND (rec.site_id=s OR rec.site_id='')
 AND (rec.warehouse_id=w OR rec.warehouse_id='');
 IF p->>'operation'='CREATE' AND existing.record_id IS NOT NULL
 THEN RAISE EXCEPTION 'P3_MASTER_ALREADY_EXISTS'; END IF;
 IF p->>'operation'<>'CREATE' AND (
 existing.record_id IS NULL OR existing.version::text<>p->>'expectedVersion'
 OR (p->>'operation'='ACTIVATE' AND existing.active)
 OR (p->>'operation'='DEACTIVATE' AND NOT existing.active))
 THEN RAISE EXCEPTION 'P3_MASTER_REVISION_OR_STATE_CONFLICT'; END IF;
 -- No direct master-table INSERT/UPDATE: only immutable draft request + audit.
 INSERT INTO hft.p3_master_invocation_nonce(key_version,nonce,request_id,payload_sha256,
 actor_subject,session_id) VALUES(ver,proof->>'nonce',(p->>'requestId')::uuid,digest,
 actor,proof->>'sessionId');
 INSERT INTO hft.p3_master_change_request(request_id,kind,operation,legal_entity_id,
 site_id,warehouse_id,record_id,expected_version,reason,proposed_values,payload_sha256,
 requester_subject,requester_session_id)
 VALUES((p->>'requestId')::uuid,p->>'kind',p->>'operation',e,s,w,p->>'recordId',
 (p->>'expectedVersion')::bigint,p->>'reason',p->'values',digest,actor,proof->>'sessionId');
 INSERT INTO hft.p3_master_audit(request_id,event_type,evidence_sha256,actor_subject)
 VALUES((p->>'requestId')::uuid,'REQUESTED',digest,actor);
 RETURN (p->>'requestId')::uuid;
END $p3submit$;

-- Exact signed decision fields; no JSONB text-render hash or loose actor IDs.
CREATE FUNCTION hft.p3_employee_decision_fields_v1(d jsonb) RETURNS text[]
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $decision_fields$
DECLARE
 names text[]:=ARRAY['decisionVersion','requestId','requestPayloadSha256',
 'recordId','expectedVersion','policyRevision','decision','evidenceSha256',
 'reason','legalEntityId','siteId','warehouseId'];name text;v text;
BEGIN
 IF pg_catalog.jsonb_typeof(d)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(d))<>12
 THEN RAISE EXCEPTION 'P3_DECISION_SHAPE_INVALID'; END IF;
 FOREACH name IN ARRAY names LOOP
  IF NOT (d?name) OR pg_catalog.jsonb_typeof(d->name)<>'string'
  THEN RAISE EXCEPTION 'P3_DECISION_FIELD_MISSING:%',name; END IF;
 END LOOP;
 IF d->>'decisionVersion'<>'HFT-R1-P3-EMPLOYEE-DECISION-V1'
 OR d->>'decision' NOT IN ('APPROVED','DENIED')
 OR (d->>'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR (d->>'requestPayloadSha256') !~ '^[0-9a-f]{64}$'
 OR (d->>'evidenceSha256') !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'P3_DECISION_IDENTITY_INVALID'; END IF;
 FOREACH name IN ARRAY ARRAY['recordId','legalEntityId','siteId','warehouseId'] LOOP
  IF (d->>name) !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
  THEN RAISE EXCEPTION 'P3_DECISION_SCOPE_INVALID:%',name; END IF;
 END LOOP;
 IF (d->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,17})$'
 OR (d->>'policyRevision') !~ '^[1-9][0-9]{0,17}$'
 OR pg_catalog.length(d->>'reason') NOT BETWEEN 8 AND 300
 OR pg_catalog.btrim(d->>'reason')<>d->>'reason'
 THEN RAISE EXCEPTION 'P3_DECISION_REVISION_OR_REASON_INVALID'; END IF;
 RETURN ARRAY(SELECT d->>x.name
 FROM pg_catalog.unnest(names) WITH ORDINALITY AS x(name,ordinality)
 ORDER BY x.ordinality);
END $decision_fields$;
CREATE FUNCTION hft.p3_employee_decision_digest_v1(d jsonb) RETURNS text
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $decision_sha$
 SELECT pg_catalog.encode(hft_crypto.digest(hft.p2_length_prefixed_v1(
 hft.p3_employee_decision_fields_v1(d)),'sha256'),'hex')
$decision_sha$;

-- Governance enrollment/revocation uses the same warehouse gate as decisions,
-- otherwise a decision could pass against an already committed revocation.
CREATE FUNCTION hft.p3_lock_policy_authority_gate_v1()
 RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $policy_gate$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 'HFT:GATE:'||NEW.legal_entity_id||':'||NEW.site_id||':'||NEW.warehouse_id,0));
 IF TG_TABLE_NAME='p3_master_action_policy' AND EXISTS(
  SELECT 1 FROM hft.p3_master_action_policy p
  WHERE p.legal_entity_id=NEW.legal_entity_id
   AND p.site_id=NEW.site_id AND p.warehouse_id=NEW.warehouse_id
   AND p.kind=NEW.kind AND p.operation=NEW.operation
   AND p.policy_revision>=NEW.policy_revision)
 THEN RAISE EXCEPTION 'P3_POLICY_REVISION_NOT_MONOTONIC'; END IF;
 RETURN NEW;
END $policy_gate$;
CREATE TRIGGER p3_policy_gate BEFORE INSERT ON hft.p3_master_action_policy
 FOR EACH ROW EXECUTE FUNCTION hft.p3_lock_policy_authority_gate_v1();
CREATE TRIGGER p3_qualify_gate BEFORE INSERT ON hft.p3_master_approver_qualification
 FOR EACH ROW EXECUTE FUNCTION hft.p3_lock_policy_authority_gate_v1();
CREATE TRIGGER p3_qualification_revoke_gate BEFORE INSERT ON hft.p3_master_qualification_revocation
 FOR EACH ROW EXECUTE FUNCTION hft.p3_lock_policy_authority_gate_v1();
CREATE TRIGGER p3_master_actor_revoke_gate BEFORE INSERT
 ON hft.p3_master_actor_grant_revocation FOR EACH ROW
 EXECUTE FUNCTION hft.p3_lock_policy_authority_gate_v1();

-- This is the ONLY P3 Employee decision + apply entrypoint.
-- It neither updates P2 stock ledgers nor rewrites historical custody.
-- A denied decision is an immutable fact, never an Employee mutation.
CREATE FUNCTION hft.p3_decide_apply_employee_v1(d jsonb,proof jsonb)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $employee_apply$
DECLARE
 entity_id text:=d->>'legalEntityId';site_id_input text:=d->>'siteId';
 warehouse_id_input text:=d->>'warehouseId';actor text;
 proof_digest text;mac_expected bytea;mac_given bytea;difference integer:=0;
 mac_index integer;issued bigint;expires bigint;ver integer;now_epoch bigint;
 decision_key hft_secret.p3_master_decision_key%ROWTYPE;
 req hft.p3_master_change_request%ROWTYPE;
 policy hft.p3_master_action_policy%ROWTYPE;
 previous_employee hft.employee%ROWTYPE;applied_employee hft.employee%ROWTYPE;
 requester_person text;approver_person text;
 before_fact jsonb;after_fact jsonb;after_sha text;v_version bigint;
 count_revision integer;count_audit integer;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_engineering','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 THEN RAISE EXCEPTION 'P3_EMPLOYEE_RESTRICTED_RUNTIME_REQUIRED'; END IF;
 PERFORM hft.p3_employee_decision_fields_v1(d);
 proof_digest:=hft.p3_employee_decision_digest_v1(d);
 -- Gate -> exact employee master identity -> pending source/policy/human ->
 -- employee row and immutable decision, revision and audit in one COMMIT.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 'HFT:GATE:'||entity_id||':'||site_id_input||':'||warehouse_id_input,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 'HFT:P3:MASTER:'||entity_id||':EMPLOYEE:'||d->>'recordId',0));
 PERFORM 1 FROM hft.warehouse w JOIN hft.site s
   ON s.legal_entity_id=w.legal_entity_id AND s.id=w.site_id
 JOIN hft.legal_entity le ON le.id=w.legal_entity_id
 WHERE w.legal_entity_id=entity_id AND w.site_id=site_id_input
 AND w.warehouse_id=warehouse_id_input AND w.active AND s.active AND le.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_DECISION_WAREHOUSE_SCOPE_INACTIVE'; END IF;
 SELECT * INTO req FROM hft.p3_master_change_request r
 WHERE r.request_id=(d->>'requestId')::uuid
 AND r.legal_entity_id=entity_id AND r.site_id=site_id_input
 AND r.warehouse_id=warehouse_id_input AND r.record_id=d->>'recordId'
 AND r.kind='EMPLOYEE';
 IF req.request_id IS NULL
 OR req.payload_sha256<>d->>'requestPayloadSha256'
 OR req.expected_version::text<>d->>'expectedVersion'
 OR EXISTS(SELECT 1 FROM hft.p3_master_decision dec WHERE dec.request_id=req.request_id)
 THEN RAISE EXCEPTION 'P3_DECISION_SOURCE_OR_REVISION_CONFLICT'; END IF;
 SELECT * INTO policy FROM hft.p3_master_action_policy pol
 WHERE pol.legal_entity_id=entity_id AND pol.site_id=site_id_input
 AND pol.warehouse_id=warehouse_id_input AND pol.kind='EMPLOYEE'
 AND pol.operation=req.operation ORDER BY pol.policy_revision DESC LIMIT 1;
 IF policy.policy_revision IS NULL OR NOT policy.allow_action
 OR NOT policy.require_independent_person
 OR policy.policy_revision::text<>d->>'policyRevision'
 OR pg_catalog.clock_timestamp()<policy.valid_from
 OR pg_catalog.clock_timestamp()>=policy.valid_until
 THEN RAISE EXCEPTION 'P3_INDEPENDENT_EMPLOYEE_POLICY_REQUIRED'; END IF;
 -- Approved action-specific policy may require a separate CHECKER. No
 -- unverified checker identity or fabricated second human is accepted.
 -- Until a trusted signed checker issuance contract is qualified, DENY.
 IF policy.require_checker THEN
  RAISE EXCEPTION 'P3_MANDATORY_INDEPENDENT_CHECKER_NOT_QUALIFIED';
 END IF;
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 OR proof->>'proofVersion'<>'HFT-R1-P3-EMPLOYEE-DECISION-HMAC-V1'
 OR proof->>'payloadSha256' IS DISTINCT FROM proof_digest
 OR (proof->>'actorSubject') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR (proof->>'sessionId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 OR (proof->>'issuedAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'P3_DECISION_PROOF_FORMAT_INVALID'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_each(proof) kv
  WHERE pg_catalog.jsonb_typeof(kv.value)<>'string')<>0
 THEN RAISE EXCEPTION 'P3_DECISION_PROOF_NONSTRING'; END IF;
 IF (proof->>'issuedAt')::numeric>9223372036854775807
 OR (proof->>'expiresAt')::numeric>9223372036854775807
 OR (proof->>'keyVersion')::numeric>2147483647
 THEN RAISE EXCEPTION 'P3_DECISION_PROOF_NUMBER_RANGE'; END IF;
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 ver:=(proof->>'keyVersion')::integer;actor:=proof->>'actorSubject';
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expires<=now_epoch OR expires<=issued OR expires-issued>60
 THEN RAISE EXCEPTION 'P3_DECISION_PROOF_EXPIRED'; END IF;
 SELECT * INTO decision_key FROM hft_secret.p3_master_decision_key k
 WHERE k.key_version=ver;
 IF decision_key.key_version IS NULL OR decision_key.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<decision_key.not_before
 OR pg_catalog.clock_timestamp()>=decision_key.not_after
 THEN RAISE EXCEPTION 'P3_DECISION_SIGNING_KEY_REVOKED_OR_ABSENT'; END IF;
 mac_expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
 'HFT-R1-P3-EMPLOYEE-DECISION-HMAC-V1',actor,proof->>'sessionId',proof_digest,
 proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',proof->>'keyVersion']),
 decision_key.key_bytes,'sha256');
 mac_given:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(mac_expected)<>32 OR pg_catalog.octet_length(mac_given)<>32
 THEN RAISE EXCEPTION 'P3_DECISION_MAC_LENGTH_INVALID'; END IF;
 FOR mac_index IN 0..31 LOOP difference:=difference |
  (pg_catalog.get_byte(mac_expected,mac_index) #
   pg_catalog.get_byte(mac_given,mac_index)); END LOOP;
 IF difference<>0 THEN RAISE EXCEPTION 'P3_DECISION_MAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=actor AND sess.revoked_at IS NULL
 AND sess.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_DECISION_SESSION_NOT_VERIFIED'; END IF;
 -- Authenticated humans, not usernames, establish maker/approver difference.
 SELECT maker.person_id INTO requester_person FROM hft.approval_human_login maker
 JOIN hft.approval_human hm ON hm.legal_entity_id=maker.legal_entity_id
 AND hm.person_id=maker.person_id
 WHERE maker.legal_entity_id=entity_id AND maker.actor_subject=req.requester_subject
 AND hm.revoked_at IS NULL AND hm.valid_from<=pg_catalog.clock_timestamp()
 AND hm.valid_until>pg_catalog.clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM hft.approval_human_revocation rev
  WHERE rev.legal_entity_id=entity_id AND rev.person_id=hm.person_id);
 SELECT reviewer.person_id INTO approver_person FROM hft.approval_human_login reviewer
 JOIN hft.approval_human ha ON ha.legal_entity_id=reviewer.legal_entity_id
 AND ha.person_id=reviewer.person_id
 JOIN hft.p3_master_approver_qualification qual
 ON qual.legal_entity_id=reviewer.legal_entity_id AND qual.person_id=reviewer.person_id
 AND qual.site_id=site_id_input AND qual.warehouse_id=warehouse_id_input
 AND qual.kind='EMPLOYEE' AND qual.operation=req.operation
 WHERE reviewer.legal_entity_id=entity_id AND reviewer.actor_subject=actor
 AND ha.revoked_at IS NULL AND ha.valid_from<=pg_catalog.clock_timestamp()
 AND ha.valid_until>pg_catalog.clock_timestamp()
 AND qual.valid_from<=pg_catalog.clock_timestamp()
 AND qual.valid_until>pg_catalog.clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM hft.approval_human_revocation rev
  WHERE rev.legal_entity_id=entity_id AND rev.person_id=ha.person_id)
 AND NOT EXISTS(SELECT 1 FROM hft.p3_master_qualification_revocation revoked
  WHERE revoked.legal_entity_id=entity_id
  AND revoked.site_id=site_id_input AND revoked.warehouse_id=warehouse_id_input
  AND revoked.kind='EMPLOYEE' AND revoked.operation=req.operation
  AND revoked.person_id=reviewer.person_id);
 IF requester_person IS NULL OR approver_person IS NULL
 OR requester_person=approver_person
 THEN RAISE EXCEPTION 'P3_ELIGIBLE_INDEPENDENT_PERSON_REQUIRED'; END IF;
 -- Role grants are separate from human qualification. The signer does not
 -- grant the approver access to other companies, sites or warehouses.
 PERFORM 1 FROM hft.p3_master_actor_grant g
 WHERE g.legal_entity_id=entity_id AND g.site_id=site_id_input
 AND g.warehouse_id=warehouse_id_input AND g.actor_subject=actor
 AND g.active AND g.may_read
 AND NOT EXISTS(SELECT 1 FROM hft.p3_master_actor_grant_revocation rev
  WHERE rev.legal_entity_id=entity_id AND rev.site_id=site_id_input
  AND rev.warehouse_id=warehouse_id_input AND rev.actor_subject=actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_APPROVER_SCOPE_GRANT_MISSING'; END IF;
 -- If approved, lock authoritative employee and require exact expected revision.
 IF d->>'decision'='APPROVED' THEN
  SELECT * INTO previous_employee FROM hft.employee employee_row
  WHERE employee_row.legal_entity_id=entity_id
  AND employee_row.employee_id=req.record_id FOR UPDATE;
  IF req.operation='CREATE' THEN
   IF previous_employee.employee_id IS NOT NULL OR req.expected_version<>0
   THEN RAISE EXCEPTION 'P3_EMPLOYEE_CREATE_ALREADY_EXISTS'; END IF;
   IF req.proposed_values->>'siteId'<>site_id_input
   OR pg_catalog.length(pg_catalog.btrim(req.proposed_values->>'fullName'))=0
   OR pg_catalog.length(pg_catalog.btrim(req.proposed_values->>'department'))=0
   OR pg_catalog.length(pg_catalog.btrim(req.proposed_values->>'designation'))=0
   THEN RAISE EXCEPTION 'P3_EMPLOYEE_REGISTRATION_INVALID'; END IF;
   INSERT INTO hft.employee(legal_entity_id,employee_id,site_id,
   full_name,department,designation,active,version)
   VALUES(entity_id,req.record_id,site_id_input,
   req.proposed_values->>'fullName',req.proposed_values->>'department',
   req.proposed_values->>'designation',false,1)
   RETURNING * INTO applied_employee;
   before_fact:=NULL;
  ELSE
   IF previous_employee.employee_id IS NULL
    OR previous_employee.site_id<>site_id_input
    OR previous_employee.version<>req.expected_version
   THEN RAISE EXCEPTION 'P3_EMPLOYEE_STALE_OR_CROSS_SITE_REVISION'; END IF;
   before_fact:=pg_catalog.to_jsonb(previous_employee);
   IF req.operation='EDIT' THEN
    IF req.proposed_values->>'siteId'<>site_id_input
    THEN RAISE EXCEPTION 'P3_EMPLOYEE_SITE_REHOME_DENIED'; END IF;
    UPDATE hft.employee SET
     full_name=req.proposed_values->>'fullName',
     department=req.proposed_values->>'department',
     designation=req.proposed_values->>'designation',
     version=version+1,updated_at=pg_catalog.clock_timestamp()
    WHERE legal_entity_id=entity_id AND employee_id=req.record_id
     AND version=req.expected_version
    RETURNING * INTO applied_employee;
   ELSIF req.operation='ACTIVATE' THEN
    IF previous_employee.active THEN RAISE EXCEPTION 'P3_EMPLOYEE_ALREADY_ACTIVE'; END IF;
    UPDATE hft.employee SET active=true,version=version+1,
      updated_at=pg_catalog.clock_timestamp()
    WHERE legal_entity_id=entity_id AND employee_id=req.record_id
    AND version=req.expected_version AND active=false
    RETURNING * INTO applied_employee;
   ELSIF req.operation='DEACTIVATE' THEN
    IF NOT previous_employee.active THEN RAISE EXCEPTION 'P3_EMPLOYEE_ALREADY_INACTIVE'; END IF;
    IF EXISTS(SELECT 1 FROM hft.employee_custody custody
      WHERE custody.legal_entity_id=entity_id AND custody.employee_id=req.record_id
      AND custody.issued_micro>custody.returned_micro)
    THEN RAISE EXCEPTION 'P3_OPEN_CUSTODY_DEACTIVATION_BLOCKED'; END IF;
    UPDATE hft.employee SET active=false,version=version+1,
      updated_at=pg_catalog.clock_timestamp()
    WHERE legal_entity_id=entity_id AND employee_id=req.record_id
    AND version=req.expected_version AND active=true
    RETURNING * INTO applied_employee;
   ELSE RAISE EXCEPTION 'P3_EMPLOYEE_UNSUPPORTED_OPERATION'; END IF;
  END IF;
  IF applied_employee.employee_id IS NULL
  THEN RAISE EXCEPTION 'P3_EMPLOYEE_ATOMIC_APPLY_FAILED'; END IF;
 END IF;
 -- The signed decision and proof nonce are append-only and irrevocable.
 INSERT INTO hft.p3_master_decision_nonce(key_version,nonce,request_id,
  payload_sha256,actor_subject,session_id,proof_mac_sha256)
 VALUES(ver,proof->>'nonce',req.request_id,proof_digest,actor,
  proof->>'sessionId',pg_catalog.encode(hft_crypto.digest(mac_given,'sha256'),'hex'));
 INSERT INTO hft.p3_master_decision(request_id,decision,approver_subject,
  approver_session_id,approver_person_id,policy_revision,
  request_payload_sha256,signed_decision_sha256,signed_proof_mac_sha256,
  evidence_sha256,reason)
 VALUES(req.request_id,d->>'decision',actor,proof->>'sessionId',
 approver_person,policy.policy_revision,req.payload_sha256,proof_digest,
 pg_catalog.encode(hft_crypto.digest(mac_given,'sha256'),'hex'),
 d->>'evidenceSha256',d->>'reason');
 INSERT INTO hft.p3_master_audit(request_id,event_type,evidence_sha256,actor_subject)
 VALUES(req.request_id,CASE WHEN d->>'decision'='APPROVED' THEN 'APPROVED' ELSE 'DENIED' END,
  proof_digest,actor);
 IF d->>'decision'='DENIED' THEN
  RETURN pg_catalog.jsonb_build_object('state','DENIED','requestId',req.request_id::text,
   'recordId',req.record_id,'version',NULL,'active',NULL);
 END IF;
 after_fact:=pg_catalog.jsonb_build_object(
  'legalEntityId',applied_employee.legal_entity_id,
  'employeeId',applied_employee.employee_id,'siteId',applied_employee.site_id,
  'fullName',applied_employee.full_name,'department',applied_employee.department,
  'designation',applied_employee.designation,'active',applied_employee.active,
  'version',applied_employee.version::text);
 after_sha:=pg_catalog.encode(hft_crypto.digest(
  pg_catalog.convert_to(after_fact::text,'UTF8'),'sha256'),'hex');
 INSERT INTO hft.employee_revision(legal_entity_id,employee_id,version,snapshot,actor_subject)
 VALUES(entity_id,req.record_id,applied_employee.version,after_fact,actor);
 INSERT INTO hft.p3_master_revision(legal_entity_id,kind,record_id,version,
  request_id,before_snapshot,after_snapshot,actor_subject)
 VALUES(entity_id,'EMPLOYEE',req.record_id,applied_employee.version,
  req.request_id,before_fact,after_fact,actor);
 INSERT INTO hft.p3_master_audit(request_id,event_type,evidence_sha256,actor_subject)
 VALUES(req.request_id,'APPLIED',after_sha,actor);
 SELECT pg_catalog.count(*) INTO count_revision FROM hft.p3_master_revision mr
 WHERE mr.request_id=req.request_id AND mr.version=applied_employee.version;
 SELECT pg_catalog.count(*) INTO count_audit FROM hft.p3_master_audit ma
 WHERE ma.request_id=req.request_id AND ma.event_type='APPLIED'
 AND ma.evidence_sha256=after_sha;
 IF count_revision<>1 OR count_audit<>1
 OR NOT EXISTS(SELECT 1 FROM hft.employee_revision er
 WHERE er.legal_entity_id=entity_id AND er.employee_id=req.record_id
 AND er.version=applied_employee.version AND er.snapshot=after_fact)
 THEN RAISE EXCEPTION 'P3_EMPLOYEE_REVISION_OR_AUDIT_INCOMPLETE'; END IF;
 RETURN pg_catalog.jsonb_build_object('state','APPLIED',
  'requestId',req.request_id::text,'recordId',req.record_id,
  'version',applied_employee.version::text,'active',applied_employee.active);
END $employee_apply$;

-- Do not allow historic Employee revision facts to be rewritten.
CREATE TRIGGER p3_employee_revision_immutable BEFORE UPDATE OR DELETE
 ON hft.employee_revision FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- P3 owner/runtime boundary. The migration-owner function transfer is
-- temporary; hft_r1_p3_master_owner has NOLOGIN and no schema CREATE at COMMIT.
GRANT USAGE ON SCHEMA hft TO hft_r1_p3_master_owner,hft_r1_p3_master_runtime;
GRANT USAGE ON SCHEMA hft_secret TO hft_r1_p3_master_owner;
GRANT SELECT ON hft.posting_session,hft.p3_master_actor_grant,
 hft.p3_master_read_v1,hft.p3_master_request_status_v1,
 hft.p3_master_change_request,hft.p3_master_decision,hft.p3_master_revision,
 hft.p3_master_audit,hft.p3_master_decision_nonce,hft.p3_master_invocation_nonce,
 hft.p3_master_action_policy,hft.p3_master_approver_qualification,
 hft.p3_master_qualification_revocation,hft.p3_master_actor_grant_revocation,
 hft.approval_human,
 hft.approval_human_login,hft.approval_human_revocation,
 hft.employee_revision,hft.employee_custody,hft.legal_entity,hft.site,
 hft.warehouse TO hft_r1_p3_master_owner;
GRANT SELECT,INSERT,UPDATE ON hft.employee TO hft_r1_p3_master_owner;
GRANT INSERT ON hft.employee_revision TO hft_r1_p3_master_owner;
GRANT SELECT ON hft_secret.p3_master_invocation_key,
 hft_secret.p3_master_decision_key TO hft_r1_p3_master_owner;
GRANT INSERT ON hft.p3_master_invocation_nonce,hft.p3_master_change_request,
 hft.p3_master_audit,hft.p3_master_decision_nonce,hft.p3_master_decision,
 hft.p3_master_revision TO hft_r1_p3_master_owner;
-- Existing qualified P2 governance authority only; no runtime policy DML.
-- Independent audit verifier has read access, never writer/issuer rights.
-- Separate audit retention and external integrity remain release gates.
GRANT SELECT ON hft.p3_master_change_request,hft.p3_master_decision,
 hft.p3_master_revision,hft.p3_master_audit,hft.p3_master_decision_nonce,
 hft.p3_master_actor_grant_revocation,hft.employee_revision TO hft_r1_audit_verify;
GRANT INSERT,SELECT ON hft.p3_master_actor_grant,
 hft.p3_master_actor_grant_revocation,hft.p3_master_action_policy,
 hft.p3_master_approver_qualification,hft.p3_master_qualification_revocation
 TO hft_r1_governance_issuer;
GRANT EXECUTE ON FUNCTION hft.p3_master_fields_v1(jsonb),
 hft.p3_master_digest_v1(jsonb),hft.p3_master_read_fields_v1(jsonb),
 hft.p3_master_read_digest_v1(jsonb),
 hft.p3_employee_decision_fields_v1(jsonb),
 hft.p3_employee_decision_digest_v1(jsonb),
 hft.p2_length_prefixed_v1(text[]) TO hft_r1_p3_master_owner;
GRANT CREATE ON SCHEMA hft TO hft_r1_p3_master_owner;
ALTER FUNCTION hft.p3_submit_master_change_v1(jsonb,jsonb)
 OWNER TO hft_r1_p3_master_owner;
ALTER FUNCTION hft.p3_read_masters_v1(jsonb,jsonb)
 OWNER TO hft_r1_p3_master_owner;
ALTER FUNCTION hft.p3_decide_apply_employee_v1(jsonb,jsonb)
 OWNER TO hft_r1_p3_master_owner;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_p3_master_owner;
-- No direct master SELECT, policy SELECT, table DML, sequence or helper
-- EXECUTE by shared runtime or PUBLIC. Force privileged reads through
-- the DB-verified signed-scope function, not through caller-supplied RLS vars.
REVOKE ALL ON ALL TABLES IN SCHEMA hft,hft_secret
 FROM PUBLIC,hft_r1_p3_master_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft,hft_secret
 FROM PUBLIC,hft_r1_p3_master_runtime;
REVOKE ALL ON SCHEMA hft_secret FROM PUBLIC,hft_r1_p3_master_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft,hft_secret
 FROM PUBLIC,hft_r1_p3_master_runtime;
GRANT EXECUTE ON FUNCTION hft.p3_submit_master_change_v1(jsonb,jsonb),
 hft.p3_read_masters_v1(jsonb,jsonb),
 hft.p3_decide_apply_employee_v1(jsonb,jsonb) TO hft_r1_p3_master_runtime;
-- Effective privileges include inherited roles and explicit SET ROLE.
-- Real-login adversarial acceptance remains required separately.
DO $p3_effective_acl$
DECLARE who record; obj record; fn record; owners integer;nlogin integer:=0;
BEGIN
 SELECT pg_catalog.count(*) INTO owners FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
 WHERE p.oid IN (
 'hft.p3_submit_master_change_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
 'hft.p3_read_masters_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
 'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'::pg_catalog.regprocedure)
 AND r.rolname='hft_r1_p3_master_owner' AND NOT r.rolcanlogin
 AND NOT r.rolsuper AND p.prosecdef
 AND EXISTS(SELECT 1 FROM pg_catalog.unnest(p.proconfig) cfg
  WHERE pg_catalog.replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF owners<>3 THEN RAISE EXCEPTION 'P3_FUNCTION_OWNER_OR_PATH_INVALID'; END IF;
 IF pg_catalog.has_schema_privilege('hft_r1_p3_master_owner','hft','CREATE')
 THEN RAISE EXCEPTION 'P3_FUNCTION_OWNER_CREATE_ESCALATION'; END IF;
 FOR who IN SELECT oid,rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole
  FROM pg_catalog.pg_roles
  WHERE rolname='hft_r1_p3_master_runtime' OR
  (rolcanlogin AND pg_catalog.pg_has_role(oid,
    'hft_r1_p3_master_runtime'::pg_catalog.regrole,'MEMBER'))
 LOOP
  IF who.rolcanlogin THEN nlogin:=nlogin+1; END IF;
  IF who.rolsuper OR who.rolcreatedb OR who.rolcreaterole OR
   pg_catalog.pg_has_role(who.oid,'hft_engineering'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.pg_has_role(who.oid,'hft_r1_p3_master_owner'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.pg_has_role(who.oid,'hft_r1_governance_issuer'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.pg_has_role(who.oid,'hft_r1_posting_owner'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.pg_has_role(who.oid,'hft_r1_app_runtime'::pg_catalog.regrole,'MEMBER')
   OR pg_catalog.has_schema_privilege(who.rolname,'hft','CREATE')
   OR pg_catalog.has_schema_privilege(who.rolname,'hft_secret','USAGE')
   OR pg_catalog.has_schema_privilege(who.rolname,'public','CREATE')
  THEN RAISE EXCEPTION 'P3_RUNTIME_ROLE_ESCALATION:%',who.rolname; END IF;
  FOR obj IN SELECT c.oid,c.relkind,c.relname,n.nspname
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('hft','hft_secret')
    AND c.relkind IN ('r','p','v','m','f','S')
  LOOP
   IF obj.relkind='S' THEN
    IF pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'USAGE')
    OR pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'SELECT')
    OR pg_catalog.has_sequence_privilege(who.rolname,obj.oid,'UPDATE')
    THEN RAISE EXCEPTION 'P3_RUNTIME_SEQUENCE_LEAK:%:%.%',who.rolname,
     obj.nspname,obj.relname; END IF;
   ELSIF pg_catalog.has_table_privilege(who.rolname,obj.oid,'SELECT')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'INSERT')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'UPDATE')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'DELETE')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'TRUNCATE')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'REFERENCES')
    OR pg_catalog.has_table_privilege(who.rolname,obj.oid,'TRIGGER')
   THEN RAISE EXCEPTION 'P3_RUNTIME_RELATION_LEAK:%:%.%',who.rolname,
     obj.nspname,obj.relname; END IF;
  END LOOP;
  FOR fn IN SELECT p.oid,p.proname FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('hft','hft_secret')
  LOOP
   IF pg_catalog.has_function_privilege(who.rolname,fn.oid,'EXECUTE')
    AND fn.oid NOT IN (
     'hft.p3_submit_master_change_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
     'hft.p3_read_masters_v1(jsonb,jsonb)'::pg_catalog.regprocedure,
     'hft.p3_decide_apply_employee_v1(jsonb,jsonb)'::pg_catalog.regprocedure)
   THEN RAISE EXCEPTION 'P3_RUNTIME_HELPER_LEAK:%:%',who.rolname,fn.proname; END IF;
  END LOOP;
 END LOOP;
 IF nlogin=0 THEN RAISE EXCEPTION 'P3_RUNTIME_LOGIN_NOT_ATTESTED'; END IF;
END $p3_effective_acl$;
-- No executable migration 0007, role/extension provision or production use.
COMMIT;
