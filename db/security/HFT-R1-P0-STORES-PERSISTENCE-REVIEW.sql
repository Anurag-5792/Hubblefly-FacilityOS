-- HFT-R1 P0 STORES PERSISTENCE — REVIEW CANDIDATE / NOT AN AUTHORIZED MIGRATION.
-- This is NOT db/migrations/0007. Never execute without independent Chat 10/11/17,
-- approved P2 version-coupled writer, pgcrypto/key/roles and Chat 13 disposable PG gate.
-- No production data, account balance, stock movement or custody is modified here.
-- The existing P2 single stock writer remains sole ledger authority.
BEGIN;
DO $preflight$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR session_user<>'hft_engineering'
 OR NOT EXISTS (SELECT 1 FROM hft.schema_revision WHERE version=6)
 OR pg_catalog.to_regclass('hft.item_version_catalog') IS NULL
 OR pg_catalog.to_regclass('hft.approval_human_login') IS NULL
 OR pg_catalog.to_regclass('hft.posting_session') IS NULL
 OR pg_catalog.to_regprocedure('hft.p2_length_prefixed_v1(text[])') IS NULL
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension e
   JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
   WHERE e.extname='pgcrypto' AND n.nspname='hft_crypto')
 THEN RAISE EXCEPTION 'P0_DISPOSABLE_P2_P3_VERSION_AND_KEY_PREREQUISITES_UNQUALIFIED';
 END IF;
END $preflight$;
-- Role/key provisioning must be separately authorized. No CREATE ROLE or key seed.
ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering
 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE hft_secret.p0_stores_proof_key (
 key_version integer PRIMARY KEY CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,not_after timestamptz NOT NULL,
 revoked_at timestamptz,CHECK(not_before<not_after)
);
REVOKE ALL ON hft_secret.p0_stores_proof_key FROM PUBLIC,hft_r1_app_runtime;

-- Qualified physical metadata must be independently tied to actual P3 locations.
-- It may not invent non-existent rack, shelf, position or bin levels.
CREATE TABLE hft.p0_location_kind (
 legal_entity_id text NOT NULL,warehouse_id text NOT NULL,
 location_id text NOT NULL,kind text NOT NULL
 CHECK(kind IN ('RACK','AREA','LEVEL','POSITION','STACK_SLOT','BIN','CONTAINER')),
 floor_approved boolean NOT NULL DEFAULT false,
 floor_evidence_id text NOT NULL DEFAULT '',
 certified_location_version bigint NOT NULL CHECK(certified_location_version>0),
 certified_by text NOT NULL,certified_at timestamptz NOT NULL,
 PRIMARY KEY(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 CHECK((kind='AREA' AND floor_approved AND floor_evidence_id<>'')
       OR (NOT floor_approved AND floor_evidence_id=''))
);
CREATE TRIGGER p0_location_kind_immutable BEFORE UPDATE OR DELETE
 ON hft.p0_location_kind FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- A COUNT epoch is an independently captured, version-aware balance snapshot.
-- OPEN requires externally attested completeness: do not populate from P1's
-- non-versioned account alone or claim all missing keys have zero stock.
CREATE TABLE hft.p0_count_epoch (
 session_id text PRIMARY KEY, legal_entity_id text NOT NULL,
 site_id text NOT NULL,warehouse_id text NOT NULL,stock_epoch text NOT NULL,
 state text NOT NULL CHECK(state IN ('CAPTURING','OPEN','CLOSED','RECONCILED')),
 snapshot_complete boolean NOT NULL DEFAULT false,
 snapshot_watermark_sha256 text NOT NULL
 CHECK(snapshot_watermark_sha256~'^[0-9a-f]{64}$'),
 capture_evidence_sha256 text NOT NULL
 CHECK(capture_evidence_sha256~'^[0-9a-f]{64}$'),
 captured_by text NOT NULL,reviewed_by text NOT NULL,
 snapshot_at timestamptz NOT NULL,
 UNIQUE(legal_entity_id,site_id,warehouse_id,stock_epoch),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 CHECK(captured_by<>reviewed_by),
 CHECK(state<>'OPEN' OR snapshot_complete)
);
-- Epoch state transitions and snapshot capture need a separately reviewed,
-- independent approval/cutover function, not direct runtime table writes.
CREATE TABLE hft.p0_count_snapshot (
 session_id text NOT NULL REFERENCES hft.p0_count_epoch(session_id),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 leaf_location_id text NOT NULL,location_path text NOT NULL,
 item_code text NOT NULL,product_version text NOT NULL,
 batch_no text NOT NULL,serial_no text NOT NULL,
 condition text NOT NULL CHECK(condition IN ('GOOD','DAMAGED','QUARANTINE')),
 bucket text NOT NULL CHECK(bucket IN ('LOOSE','INSTALLED_WIP','QUARANTINE','OTHER')),
 reference_micro bigint NOT NULL CHECK(reference_micro>=0),
 snapshot_account_version bigint NOT NULL CHECK(snapshot_account_version>=0),
 PRIMARY KEY(session_id,leaf_location_id,item_code,product_version,batch_no,serial_no,condition,bucket),
 FOREIGN KEY(legal_entity_id,item_code,product_version)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code)
);
CREATE TRIGGER p0_count_snapshot_immutable BEFORE UPDATE OR DELETE
 ON hft.p0_count_snapshot FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

CREATE TABLE hft.p0_count_counter_grant (
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 person_id text NOT NULL,qualified_by text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 qualified_from timestamptz NOT NULL,qualified_until timestamptz NOT NULL,
 revoked_at timestamptz,
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,person_id),
 CHECK(qualified_from<qualified_until),
 CHECK(person_id<>qualified_by)
);
-- An independent governance process controls grants/revocations, not the P0 app.
CREATE TABLE hft.p0_count_observation (
 request_id uuid PRIMARY KEY,session_id text NOT NULL
 REFERENCES hft.p0_count_epoch(session_id),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 stock_epoch text NOT NULL,line_id text NOT NULL,
 leaf_location_id text NOT NULL,location_path text NOT NULL,
 item_code text NOT NULL,product_version text NOT NULL,
 batch_no text NOT NULL,serial_no text NOT NULL,
 condition text NOT NULL CHECK(condition IN ('GOOD','DAMAGED','QUARANTINE')),
 bucket text NOT NULL CHECK(bucket IN ('LOOSE','INSTALLED_WIP','QUARANTINE','OTHER')),
 counted_micro bigint NOT NULL CHECK(counted_micro>=0),
 reference_micro bigint NOT NULL CHECK(reference_micro>=0),
 variance_micro bigint NOT NULL,
 actor_subject text NOT NULL,actor_session_id text NOT NULL,
 counter_person_id text NOT NULL,evidence_id text NOT NULL,
 counted_at timestamptz NOT NULL,result jsonb NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 UNIQUE(session_id,line_id),
 UNIQUE(session_id,leaf_location_id,item_code,product_version,batch_no,serial_no,condition,bucket),
 FOREIGN KEY(legal_entity_id,item_code,product_version)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 CHECK(counted_micro-reference_micro=variance_micro)
);
CREATE UNIQUE INDEX p0_count_serial_unique_epoch ON hft.p0_count_observation
 (legal_entity_id,stock_epoch,item_code,serial_no) WHERE serial_no<>'';
CREATE TRIGGER p0_count_observation_immutable BEFORE UPDATE OR DELETE
 ON hft.p0_count_observation FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TABLE hft.p0_count_proof_nonce (
 key_version integer NOT NULL,nonce text NOT NULL,
 request_id uuid NOT NULL UNIQUE
 REFERENCES hft.p0_count_observation(request_id) DEFERRABLE INITIALLY DEFERRED,
 actor_subject text NOT NULL,session_id text NOT NULL,
 payload_sha256 text NOT NULL,mac_fingerprint text NOT NULL,
 issued_at bigint NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(key_version,nonce),
 CHECK(nonce~'^[0-9a-f]{48}$'),
 CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 CHECK(mac_fingerprint~'^[0-9a-f]{64}$')
);
CREATE TRIGGER p0_count_nonce_immutable BEFORE UPDATE OR DELETE
 ON hft.p0_count_proof_nonce FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TABLE hft.p0_count_audit (
 request_id uuid PRIMARY KEY REFERENCES hft.p0_count_observation(request_id),
 canonical_event jsonb NOT NULL,canonical_sha256 text NOT NULL
 CHECK(canonical_sha256~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TRIGGER p0_count_audit_immutable BEFORE UPDATE OR DELETE
 ON hft.p0_count_audit FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- Full and ordered P0 proof; no caller-supplied actor grants.
CREATE OR REPLACE FUNCTION hft.p0_stores_payload_fields_v1(p jsonb)
 RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fields$
DECLARE names text[]:=ARRAY['contractVersion','requestId','kind',
 'legalEntityId','siteId','warehouseId','itemCode','productVersion','controlType',
 'quantity','uom','serialNo','batchNo'];
 extra text[];f text;result text[];
BEGIN
 IF pg_catalog.jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'P0_PAYLOAD_OBJECT_REQUIRED'; END IF;
 extra:=CASE p->>'kind'
  WHEN 'IN' THEN ARRAY['leafLocationId','grnId','receiptKey','supplierId',
   'invoiceNumber','qcState','qcEvidenceId']
  WHEN 'OUT' THEN ARRAY['leafLocationId','employeeId','workOrderId',
   'issueDocumentId','fragmentId','purpose']
  WHEN 'COUNT' THEN ARRAY['leafLocationId','sessionId','stockEpoch','lineId',
   'condition','inventoryState','evidenceId']
  WHEN 'TRANSFER' THEN ARRAY['sourceLeafId','destinationLeafId','transferDocumentId','reason']
  ELSE NULL END;
 IF extra IS NULL OR p->>'contractVersion'<>'HFT-R1-STORES-P0-PREPARE-V1'
 THEN RAISE EXCEPTION 'P0_PAYLOAD_CONTRACT_INVALID'; END IF;
 names:=names||extra;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p))<>
   pg_catalog.cardinality(names) THEN RAISE EXCEPTION 'P0_PAYLOAD_FIELDS_INVALID'; END IF;
 FOREACH f IN ARRAY names LOOP
  IF NOT(p?f) OR pg_catalog.jsonb_typeof(p->f)<>'string'
  THEN RAISE EXCEPTION 'P0_PAYLOAD_STRING_REQUIRED:%',f; END IF;
 END LOOP;
 SELECT pg_catalog.array_agg(p->>n ORDER BY ordinal) INTO result
 FROM pg_catalog.unnest(names) WITH ORDINALITY AS t(n,ordinal);
 RETURN result;
END $fields$;

CREATE OR REPLACE FUNCTION hft.p0_stores_payload_sha256_v1(p jsonb)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $digest$
 SELECT pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(hft.p0_stores_payload_fields_v1(p)),'sha256'),'hex')
$digest$;

CREATE OR REPLACE FUNCTION hft.p0_verify_stores_proof_v1(p jsonb,proof jsonb)
 RETURNS text LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp AS $verify$
DECLARE names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 f text;issued bigint;expires bigint;now_epoch bigint;version integer;
 k hft_secret.p0_stores_proof_key%ROWTYPE;mac_expected bytea;mac_claimed bytea;
 xor_value integer:=0;i integer;
BEGIN
 PERFORM hft.p0_stores_payload_fields_v1(p);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'P0_PROOF_SHAPE_INVALID'; END IF;
 FOREACH f IN ARRAY names LOOP
  IF NOT(proof?f) OR pg_catalog.jsonb_typeof(proof->f)<>'string'
  THEN RAISE EXCEPTION 'P0_PROOF_FIELDS_INVALID'; END IF;
 END LOOP;
 IF proof->>'proofVersion'<>'HFT-R1-P0-STORES-HMAC-V1'
 OR proof->>'payloadSha256'<>hft.p0_stores_payload_sha256_v1(p)
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 OR (proof->>'actorSubject') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
 OR (proof->>'sessionId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
 OR (proof->>'issuedAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,8}$'
 THEN RAISE EXCEPTION 'P0_PROOF_FORMAT_INVALID'; END IF;
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 version:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF expires<=now_epoch OR issued>now_epoch+30 OR expires<=issued OR expires-issued>45
 THEN RAISE EXCEPTION 'P0_PROOF_EXPIRED_OR_FUTURE'; END IF;
 SELECT * INTO k FROM hft_secret.p0_stores_proof_key WHERE key_version=version FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<k.not_before
 OR pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'P0_PROOF_KEY_NOT_ACTIVE'; END IF;
 mac_expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  proof->>'payloadSha256',proof->>'issuedAt',proof->>'expiresAt',
  proof->>'nonce',proof->>'keyVersion']),k.key_bytes,'sha256');
 mac_claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 FOR i IN 0..31 LOOP
  xor_value:=xor_value | (pg_catalog.get_byte(mac_expected,i) #
                          pg_catalog.get_byte(mac_claimed,i));
 END LOOP;
 IF xor_value<>0 THEN RAISE EXCEPTION 'P0_PROOF_MAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session AS s
 WHERE s.actor_subject=proof->>'actorSubject'
 AND s.session_id=proof->>'sessionId'
 AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P0_VERIFIED_HUMAN_SESSION_REQUIRED'; END IF;
 RETURN proof->>'actorSubject';
END $verify$;

-- No second stock writer is introduced. The P2 SQL currently lacks a committed
-- product-version attribute and TRANSFER action. This resolver cannot certify
-- an IN/OUT stock post until the P2 writer itself enforces the version
-- binding and the independent reviewers accept its exact revision.
CREATE OR REPLACE FUNCTION hft.p0_resolve_authorized_stock_v1(p jsonb,proof jsonb)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $resolve$
BEGIN
 PERFORM hft.p0_verify_stores_proof_v1(p,proof);
 RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED';
END $resolve$;

-- A location path is resolved and locked from actual parent FK rows, never
-- accepted from untrusted browser path text.
CREATE OR REPLACE FUNCTION hft.p0_resolve_count_leaf_v1(
 e text,wh text,leaf text) RETURNS text
 LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp AS $leaf$
DECLARE cur hft.location%ROWTYPE;meta hft.p0_location_kind%ROWTYPE;
 path text[]:=ARRAY[]::text[];child_kind text:='';depth integer;
 root_kind text:='';leaf_kind text:='';floor_ok boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM hft.location
    WHERE legal_entity_id=e AND warehouse_id=wh AND parent_location_id=leaf)
 THEN RAISE EXCEPTION 'P0_COUNT_LOCATION_NOT_LEAF'; END IF;
 FOR depth IN 0..16 LOOP
  SELECT * INTO cur FROM hft.location
   WHERE legal_entity_id=e AND warehouse_id=wh AND location_id=leaf FOR SHARE;
  SELECT * INTO meta FROM hft.p0_location_kind
   WHERE legal_entity_id=e AND warehouse_id=wh AND location_id=leaf FOR SHARE;
  IF cur.location_id IS NULL OR meta.location_id IS NULL OR NOT cur.active
     OR meta.certified_location_version<>cur.version
  THEN RAISE EXCEPTION 'P0_COUNT_LOCATION_UNQUALIFIED'; END IF;
  IF depth=0 THEN leaf_kind:=meta.kind;floor_ok:=meta.floor_approved; END IF;
  IF child_kind<>'' AND NOT(
    (meta.kind='RACK' AND child_kind='LEVEL')
    OR (meta.kind='LEVEL' AND child_kind='POSITION')
    OR (meta.kind='POSITION' AND child_kind IN ('STACK_SLOT','BIN'))
    OR (meta.kind='STACK_SLOT' AND child_kind IN ('BIN','CONTAINER'))
    OR (meta.kind='BIN' AND child_kind='CONTAINER')
    OR (meta.kind='AREA' AND child_kind IN ('BIN','CONTAINER')))
  THEN RAISE EXCEPTION 'P0_COUNT_LOCATION_HIERARCHY_INVALID'; END IF;
  path:=pg_catalog.array_prepend(cur.location_id,path);
  child_kind:=meta.kind;
  IF cur.parent_location_id IS NULL THEN
   root_kind:=meta.kind;EXIT;
  END IF;
  leaf:=cur.parent_location_id;
 END LOOP;
 IF root_kind NOT IN ('RACK','AREA')
 OR NOT(leaf_kind IN ('BIN','CONTAINER') OR
   (leaf_kind='AREA' AND root_kind='AREA' AND floor_ok))
 THEN RAISE EXCEPTION 'P0_COUNT_LEAF_PATH_INCOMPLETE'; END IF;
 RETURN wh||'/'||pg_catalog.array_to_string(path,'/');
END $leaf$;

-- COUNT is append-only evidence, never a stock adjustment. It shares the
-- existing P2 warehouse gate and checks immutable snapshot + verified
-- counter authorization before inserting nonce/observation/audit atomically.
CREATE OR REPLACE FUNCTION hft.p0_append_count_observation_v1(p jsonb,proof jsonb)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $count$
DECLARE actor text;e text:=p->>'legalEntityId';site text:=p->>'siteId';
 wh text:=p->>'warehouseId';leaf text:=p->>'leafLocationId';
 epoch hft.p0_count_epoch%ROWTYPE;person text;loc_path text;control text;
 qty bigint;baseline bigint:=0;v bigint;baseline_path text;
 happened timestamptz;result jsonb;digest text;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P0_SERIALIZABLE_PROTECTED_RUNTIME_REQUIRED'; END IF;
 IF p->>'kind'<>'COUNT' THEN RAISE EXCEPTION 'P0_COUNT_KIND_REQUIRED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||e||':'||site||':'||wh,0));
 actor:=hft.p0_verify_stores_proof_v1(p,proof);
 SELECT * INTO epoch FROM hft.p0_count_epoch
 WHERE session_id=p->>'sessionId' AND legal_entity_id=e
 AND site_id=site AND warehouse_id=wh AND stock_epoch=p->>'stockEpoch'
 AND state='OPEN' AND snapshot_complete FOR SHARE;
 IF epoch.session_id IS NULL THEN RAISE EXCEPTION 'P0_COUNT_VERIFIED_EPOCH_REQUIRED'; END IF;
 PERFORM 1 FROM hft.warehouse AS w JOIN hft.site AS s
 ON s.legal_entity_id=w.legal_entity_id AND s.id=w.site_id
 WHERE w.legal_entity_id=e AND w.warehouse_id=wh AND w.site_id=site
 AND w.active AND s.active FOR SHARE OF w,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'P0_COUNT_WAREHOUSE_INACTIVE'; END IF;
 SELECT l.person_id INTO person FROM hft.approval_human_login AS l
 JOIN hft.approval_human AS h ON h.legal_entity_id=l.legal_entity_id
 AND h.person_id=l.person_id
 JOIN hft.p0_count_counter_grant AS g ON g.legal_entity_id=e AND g.person_id=h.person_id
 AND g.site_id=site AND g.warehouse_id=wh
 WHERE l.legal_entity_id=e AND l.actor_subject=actor AND h.revoked_at IS NULL
 AND g.revoked_at IS NULL AND g.qualified_from<=pg_catalog.clock_timestamp()
 AND g.qualified_until>pg_catalog.clock_timestamp()
 FOR SHARE OF l,h,g;
 IF person IS NULL THEN RAISE EXCEPTION 'P0_COUNT_COUNTER_NOT_QUALIFIED'; END IF;
 SELECT i.control_type INTO control FROM hft.item AS i
 JOIN hft.item_version_catalog AS ver ON ver.legal_entity_id=i.legal_entity_id
 AND ver.item_code=i.item_code AND ver.version_code=p->>'productVersion'
 WHERE i.legal_entity_id=e AND i.item_code=p->>'itemCode' FOR SHARE OF i,ver;
 IF control IS NULL OR control<>p->>'controlType'
 THEN RAISE EXCEPTION 'P0_COUNT_ITEM_VERSION_INVALID'; END IF;
 IF (control='SERIAL' AND
   ((p->>'serialNo')='' OR (p->>'batchNo')<>'' OR
     p->>'quantity' NOT IN ('0','1')))
 OR (control='BATCH' AND ((p->>'batchNo')='' OR (p->>'serialNo')<>''))
 OR (control='NONE' AND ((p->>'batchNo')<>'' OR (p->>'serialNo')<>''))
 THEN RAISE EXCEPTION 'P0_COUNT_TRACEABILITY_INVALID'; END IF;
 IF p->>'quantity' !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
 THEN RAISE EXCEPTION 'P0_COUNT_QTY_INVALID'; END IF;
 IF (p->>'quantity')::numeric*1000000>9223372036854775807
 THEN RAISE EXCEPTION 'P0_COUNT_QTY_OVERFLOW'; END IF;
 qty:=((p->>'quantity')::numeric*1000000)::bigint;
 loc_path:=hft.p0_resolve_count_leaf_v1(e,wh,leaf);
 SELECT s.reference_micro,s.location_path INTO baseline,baseline_path
 FROM hft.p0_count_snapshot AS s
 WHERE s.session_id=epoch.session_id AND s.legal_entity_id=e
 AND s.site_id=site AND s.warehouse_id=wh AND s.leaf_location_id=leaf
 AND s.item_code=p->>'itemCode' AND s.product_version=p->>'productVersion'
 AND s.serial_no=p->>'serialNo' AND s.batch_no=p->>'batchNo'
 AND s.condition=p->>'condition' AND s.bucket=p->>'inventoryState';
 IF baseline_path IS NOT NULL AND baseline_path<>loc_path
 THEN RAISE EXCEPTION 'P0_COUNT_SNAPSHOT_LOCATION_DRIFT'; END IF;
 baseline:=pg_catalog.coalesce(baseline,0);
 v:=qty-baseline;
 digest:=hft.p0_stores_payload_sha256_v1(p);
 happened:=pg_catalog.clock_timestamp();
 result:=pg_catalog.jsonb_build_object(
  'state','COUNT_OBSERVATION_COMMITTED','requestId',p->>'requestId',
  'sessionId',p->>'sessionId','stockEpoch',p->>'stockEpoch',
  'lineId',p->>'lineId','legalEntityId',e,'siteId',site,'warehouseId',wh,
  'leafLocationId',leaf,'locationPath',loc_path,'itemCode',p->>'itemCode',
  'productVersion',p->>'productVersion','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo','quantity',p->>'quantity',
  'referenceQuantity',pg_catalog.trim(trailing '.' FROM pg_catalog.trim(
     trailing '0' FROM pg_catalog.to_char(baseline::numeric/1000000,
       'FM9999999999999999990.000000'))),
  'variance',CASE WHEN v<0 THEN '-' ELSE '' END||
    pg_catalog.trim(trailing '.' FROM pg_catalog.trim(trailing '0' FROM
     pg_catalog.to_char(pg_catalog.abs(v)::numeric/1000000,'FM9999999999999999990.000000'))),
  'recordedBy',actor,
  'recordedAt',pg_catalog.to_char(happened AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'durable',true,'stockChanged',false,'postingAuthorized',false);
 INSERT INTO hft.p0_count_observation(request_id,session_id,legal_entity_id,site_id,
  warehouse_id,stock_epoch,line_id,leaf_location_id,location_path,item_code,product_version,
  batch_no,serial_no,condition,bucket,counted_micro,reference_micro,variance_micro,
  actor_subject,actor_session_id,counter_person_id,evidence_id,counted_at,result,payload_sha256)
 VALUES((p->>'requestId')::uuid,epoch.session_id,e,site,wh,p->>'stockEpoch',p->>'lineId',
  leaf,loc_path,p->>'itemCode',p->>'productVersion',p->>'batchNo',p->>'serialNo',
  p->>'condition',p->>'inventoryState',qty,baseline,v,actor,proof->>'sessionId',person,
  p->>'evidenceId',happened,result,digest);
 INSERT INTO hft.p0_count_proof_nonce(key_version,nonce,request_id,actor_subject,
  session_id,payload_sha256,mac_fingerprint,issued_at,expires_at)
 VALUES((proof->>'keyVersion')::integer,proof->>'nonce',(p->>'requestId')::uuid,
  actor,proof->>'sessionId',digest,
  pg_catalog.encode(hft_crypto.digest(
   pg_catalog.decode(proof->>'macSha256','hex'),'sha256'),'hex'),
  (proof->>'issuedAt')::bigint,pg_catalog.to_timestamp((proof->>'expiresAt')::bigint));
 INSERT INTO hft.p0_count_audit(request_id,canonical_event,canonical_sha256)
 VALUES((p->>'requestId')::uuid,result,
  pg_catalog.encode(hft_crypto.digest(pg_catalog.convert_to(result::text,'UTF8'),'sha256'),'hex'));
 RETURN result;
END $count$;

-- Read-only recovery uses exact committed original MAC fingerprint; no new
-- nonce and never repeats the append after a missing/ambiguous COMMIT.
CREATE OR REPLACE FUNCTION hft.p0_reconcile_count_observation_v1(p jsonb,proof jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $readback$
DECLARE o hft.p0_count_observation%ROWTYPE;
 n hft.p0_count_proof_nonce%ROWTYPE;a hft.p0_count_audit%ROWTYPE;
 digest text;
BEGIN
 IF p->>'kind'<>'COUNT' OR
 pg_catalog.jsonb_typeof(proof)<>'object' OR
 (proof->>'nonce') !~ '^[0-9a-f]{48}$' OR
 (proof->>'macSha256') !~ '^[0-9a-f]{64}$' OR
 (proof->>'keyVersion') !~ '^[1-9][0-9]{0,8}$'
 THEN RAISE EXCEPTION 'P0_COUNT_RECOVERY_PROOF_INVALID'; END IF;
 digest:=hft.p0_stores_payload_sha256_v1(p);
 IF digest<>proof->>'payloadSha256' THEN RAISE EXCEPTION 'P0_COUNT_RECOVERY_PAYLOAD_MISMATCH'; END IF;
 SELECT * INTO o FROM hft.p0_count_observation WHERE request_id=(p->>'requestId')::uuid;
 IF o.request_id IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('state','INDETERMINATE_NOT_FOUND',
                                      'automaticRetryAllowed',false);
 END IF;
 SELECT * INTO n FROM hft.p0_count_proof_nonce
 WHERE request_id=o.request_id AND nonce=proof->>'nonce'
 AND key_version=(proof->>'keyVersion')::integer
 AND actor_subject=proof->>'actorSubject'
 AND session_id=proof->>'sessionId'
 AND payload_sha256=digest
 AND mac_fingerprint=pg_catalog.encode(hft_crypto.digest(
   pg_catalog.decode(proof->>'macSha256','hex'),'sha256'),'hex');
 SELECT * INTO a FROM hft.p0_count_audit WHERE request_id=o.request_id;
 IF n.request_id IS NULL OR a.request_id IS NULL OR
  o.actor_subject<>n.actor_subject OR o.actor_session_id<>n.session_id OR
  o.payload_sha256<>digest OR a.canonical_event<>o.result OR
  a.canonical_sha256<>pg_catalog.encode(hft_crypto.digest(
    pg_catalog.convert_to(o.result::text,'UTF8'),'sha256'),'hex')
 THEN RAISE EXCEPTION 'P0_COUNT_RECOVERY_EVIDENCE_INCOMPLETE'; END IF;
 PERFORM 1 FROM hft.posting_session s
 WHERE s.actor_subject=n.actor_subject AND s.session_id=n.session_id
 AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'P0_COUNT_RECOVERY_SESSION_REVOKED'; END IF;
 RETURN pg_catalog.jsonb_build_object('state','COMMITTED_VERIFIED','result',o.result);
END $readback$;


-- Genuine location balances, movements and custody cannot be reconstructed
-- with trusted product-version attribution from current non-versioned P1/P2
-- account identities. Never return placeholder balances or expose raw tables.
-- The future version-aware P2 extension must supply a separately attested,
-- scope-limited SECURITY DEFINER projection and real audit reconstruction.
CREATE OR REPLACE FUNCTION hft.p0_read_authoritative_stores_v1(q jsonb,proof jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $p0read$
BEGIN
 RAISE EXCEPTION 'P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED';
END $p0read$;

-- The following ACLs are proposed, NOT approved. Re-review P2 effective
-- function allowlist, FUNCTION owners, SECURITY INVOKER helpers, hft_secret
-- and exact runtime roles before executing any forward migration.
REVOKE EXECUTE ON FUNCTION
 hft.p0_stores_payload_fields_v1(jsonb),
 hft.p0_stores_payload_sha256_v1(jsonb),
 hft.p0_verify_stores_proof_v1(jsonb,jsonb),
 hft.p0_resolve_count_leaf_v1(text,text,text),
 hft.p0_resolve_authorized_stock_v1(jsonb,jsonb),
 hft.p0_append_count_observation_v1(jsonb,jsonb),
 hft.p0_reconcile_count_observation_v1(jsonb,jsonb),
 hft.p0_read_authoritative_stores_v1(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;
-- Do not grant EXECUTE or direct relation DML to a login here.
-- The approved forward migration MUST give only vetted SECURITY DEFINER
-- functions to the attested non-owner runtime and verify no inherited DML.
COMMIT;
