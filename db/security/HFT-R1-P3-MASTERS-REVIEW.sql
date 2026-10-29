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
-- Keys installed only by separate authorized governance/key authority.
CREATE TABLE hft_secret.p3_master_invocation_key(
 key_version integer PRIMARY KEY CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,not_after timestamptz NOT NULL,
 revoked_at timestamptz,CHECK(not_before<not_after)
);
REVOKE ALL ON hft_secret.p3_master_invocation_key FROM PUBLIC,hft_r1_p3_master_runtime;

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
 reason text NOT NULL,values jsonb NOT NULL,payload_sha256 text NOT NULL,
 requester_subject text NOT NULL,requester_session_id text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 CHECK(jsonb_typeof(values)='object'),
 CHECK((operation='CREATE' AND expected_version=0) OR
       (operation<>'CREATE' AND expected_version>0))
);
-- A future separately authorized independent governance service must issue
-- exact immutable APPROVED/DENIED/BLOCKED decisions. Runtime has zero DML.
CREATE TABLE hft.p3_master_decision(
 request_id uuid PRIMARY KEY REFERENCES hft.p3_master_change_request(request_id),
 decision text NOT NULL CHECK(decision IN ('APPROVED','DENIED','BLOCKED')),
 approver_subject text NOT NULL,approver_person_id text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
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
 'p3_master_decision','p3_master_revision','p3_master_audit']
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
  'designation',designation,'siteId',site_id) AS values FROM hft.employee
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
 pg_catalog.coalesce(d.decision,'PENDING_APPROVAL') AS state
 FROM hft.p3_master_change_request r LEFT JOIN hft.p3_master_decision d
 ON d.request_id=r.request_id;
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
 AND wh.active AND site.active AND le.active FOR SHARE OF wh,site,le;
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
 WHERE sk.key_version=ver FOR SHARE;
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
 AND ps.revoked_at IS NULL AND ps.expires_at>pg_catalog.clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_SESSION_REVOKED_OR_UNKNOWN'; END IF;
 PERFORM 1 FROM hft.p3_master_actor_grant g
 WHERE g.legal_entity_id=e AND g.site_id=s AND g.warehouse_id=w
 AND g.actor_subject=actor AND g.active AND g.may_submit AND g.may_read FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_MASTER_SUBMIT_NOT_AUTHORIZED'; END IF;
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
 site_id,warehouse_id,record_id,expected_version,reason,values,payload_sha256,
 requester_subject,requester_session_id)
 VALUES((p->>'requestId')::uuid,p->>'kind',p->>'operation',e,s,w,p->>'recordId',
 (p->>'expectedVersion')::bigint,p->>'reason',p->'values',digest,actor,proof->>'sessionId');
 INSERT INTO hft.p3_master_audit(request_id,event_type,evidence_sha256,actor_subject)
 VALUES((p->>'requestId')::uuid,'REQUESTED',digest,actor);
 RETURN (p->>'requestId')::uuid;
END $p3submit$;
-- Explicit ownership + least privilege. Runtime cannot bypass approval by
-- directly editing masters, decisions, audit, nonce, revisions or role grants.
GRANT USAGE ON SCHEMA hft TO hft_r1_p3_master_runtime,hft_r1_p3_master_owner;
GRANT USAGE ON SCHEMA hft_secret TO hft_r1_p3_master_owner;
GRANT SELECT ON hft.posting_session,hft.p3_master_actor_grant,
 hft.p3_master_read_v1,hft.p3_master_request_status_v1
 TO hft_r1_p3_master_owner;
GRANT SELECT ON hft.legal_entity,hft.site,hft.warehouse
 TO hft_r1_p3_master_owner;
GRANT SELECT ON hft_secret.p3_master_invocation_key TO hft_r1_p3_master_owner;
GRANT INSERT ON hft.p3_master_invocation_nonce,hft.p3_master_change_request,
 hft.p3_master_audit TO hft_r1_p3_master_owner;
GRANT SELECT ON hft.p3_master_actor_grant,hft.p3_master_read_v1,
 hft.p3_master_request_status_v1 TO hft_r1_p3_master_runtime;
GRANT EXECUTE ON FUNCTION hft.p3_master_fields_v1(jsonb),
 hft.p3_master_digest_v1(jsonb),hft.p2_length_prefixed_v1(text[])
 TO hft_r1_p3_master_owner;
GRANT CREATE ON SCHEMA hft TO hft_r1_p3_master_owner;
ALTER FUNCTION hft.p3_submit_master_change_v1(jsonb,jsonb)
 OWNER TO hft_r1_p3_master_owner;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_p3_master_owner;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC,hft_r1_p3_master_runtime;
GRANT EXECUTE ON FUNCTION hft.p3_submit_master_change_v1(jsonb,jsonb)
 TO hft_r1_p3_master_runtime;
REVOKE ALL ON hft_secret.p3_master_invocation_key FROM PUBLIC,hft_r1_p3_master_runtime;
-- A future separately reviewed approval writer is mandatory to apply
-- APPROVED decisions, enforce independent humans and append master revisions.
-- No runtime INSERT privilege exists on decisions/revisions or master tables.
COMMIT;
