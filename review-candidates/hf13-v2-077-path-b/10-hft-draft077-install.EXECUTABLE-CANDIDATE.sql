-- HF13 V2 / R77 PATH B: isolated retained DRAFT-ONLY Masters data entry.
-- REVIEW CANDIDATE ONLY. Installation, roles, key/scope enrollment and deployment
-- require a separate, exact-hash, independently accepted technical admission.
-- Target Neon wandering-cake-50222227/br-shiny-night-b3qgsj8t,
-- database hft_r1_retained_masters_np077; PostgreSQL server_version_num 180007.
-- Does NOT create/alter/grant on hft, stock, P0/P2/P3, or approved masters.
-- Does NOT seed real data, passwords, identities, keys or scope authority.
BEGIN;
DO $admission_preflight$
BEGIN
  IF current_database() <> 'hft_r1_retained_masters_np077'
    OR current_setting('server_version_num')::int <> 180007
    OR session_user <> 'hft_r1_retained_masters_np077_owner'
    OR current_user <> session_user
    OR pg_is_in_recovery()
    OR to_regnamespace('hft_draft077') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN (
      'hft_r1_draft_owner','hft_draft077_api_login','hft_draft077_enroller_login'))
    OR EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto')
  THEN RAISE EXCEPTION 'DRAFT077_INSTALL_RESOURCE_OR_CLEAN_CATALOG_REQUIRED'; END IF;
END $admission_preflight$;

-- Credentials are deliberately NULL. Real passwords are separately issued via
-- approved managed-secret enrollment; both roles remain NOLOGIN until admitted.
CREATE ROLE hft_r1_draft_owner NOLOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_draft077_api_login NOLOGIN NOINHERIT PASSWORD NULL NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE hft_draft077_enroller_login NOLOGIN NOINHERIT PASSWORD NULL NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT hft_r1_draft_owner TO hft_r1_retained_masters_np077_owner
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
CREATE SCHEMA hft_draft077 AUTHORIZATION hft_r1_draft_owner;
REVOKE ALL ON SCHEMA hft_draft077 FROM PUBLIC;
-- pgcrypto functions are isolated to the draft schema. No other extension
-- or existing tenant schema is modified. If pgcrypto is already installed,
-- fail above and require an exact revised installation admission.
CREATE EXTENSION pgcrypto WITH SCHEMA hft_draft077;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft_draft077 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hft_draft077.digest(bytea,text),
  hft_draft077.hmac(bytea,bytea,text) TO hft_r1_draft_owner;

SET ROLE hft_r1_draft_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE hft_draft077.provisional_scope (
  scope_id uuid PRIMARY KEY,
  legal_entity_ref text NOT NULL CHECK(legal_entity_ref ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  site_ref text NOT NULL CHECK(site_ref ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  warehouse_ref text NOT NULL CHECK(warehouse_ref ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  scope_state text NOT NULL DEFAULT 'PROVISIONAL_UNVERIFIED'
    CHECK(scope_state='PROVISIONAL_UNVERIFIED'),
  enrolled_by text NOT NULL,
  enrollment_evidence_sha256 text NOT NULL
    CHECK(enrollment_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(legal_entity_ref,site_ref,warehouse_ref)
);
-- A provisional scope is not a legal/corporate approval. This registry is
-- populated only by a genuine, independently identified draft administrator.
CREATE TABLE hft_draft077.actor_scope_grant (
  scope_id uuid NOT NULL REFERENCES hft_draft077.provisional_scope(scope_id),
  actor_subject text NOT NULL
    CHECK(actor_subject ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'),
  can_read boolean NOT NULL,
  can_write boolean NOT NULL,
  enrolled_by text NOT NULL,
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_id,actor_subject),
  CHECK(can_read OR can_write)
);
CREATE TABLE hft_draft077.actor_scope_revocation (
  scope_id uuid NOT NULL,
  actor_subject text NOT NULL,
  revoked_by text NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason))>=8),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_id,actor_subject),
  FOREIGN KEY(scope_id,actor_subject)
    REFERENCES hft_draft077.actor_scope_grant(scope_id,actor_subject)
);
CREATE TABLE hft_draft077.signing_key (
  key_version integer PRIMARY KEY CHECK(key_version>0),
  key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)>=32),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  enrolled_by text NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(valid_from<valid_until)
);
CREATE TABLE hft_draft077.key_revocation (
  key_version integer PRIMARY KEY REFERENCES hft_draft077.signing_key(key_version),
  revoked_by text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- A signed one-use write nonce prevents request replay. READ proofs do not
-- mutate this table and are short-lived / bound to exact query bytes.
CREATE TABLE hft_draft077.write_nonce (
  key_version integer NOT NULL,
  nonce text NOT NULL CHECK(nonce ~ '^[0-9a-f]{48}$'),
  actor_subject text NOT NULL,
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(key_version,nonce)
);
CREATE TABLE hft_draft077.draft_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL REFERENCES hft_draft077.provisional_scope(scope_id),
  kind text NOT NULL CHECK(kind IN
    ('LEGAL_ENTITY','SITE','EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')),
  record_key text NOT NULL CHECK(record_key ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  values_json jsonb NOT NULL CHECK(jsonb_typeof(values_json)='object'),
  record_state text NOT NULL DEFAULT 'DRAFT_NOT_APPROVED'
    CHECK(record_state='DRAFT_NOT_APPROVED'),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by text NOT NULL,
  edited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_type text NOT NULL CHECK(source_type IN('MANUAL','CSV','XLSX')),
  UNIQUE(scope_id,kind,record_key)
);
CREATE INDEX draft_scope_kind_key_idx
  ON hft_draft077.draft_record(scope_id,kind,record_key);
CREATE TABLE hft_draft077.draft_revision (
  record_id uuid NOT NULL REFERENCES hft_draft077.draft_record(id),
  revision bigint NOT NULL CHECK(revision>0),
  request_id uuid NOT NULL UNIQUE,
  action text NOT NULL CHECK(action IN('CREATE','EDIT')),
  previous_json jsonb,
  current_json jsonb NOT NULL,
  changed_by text NOT NULL,
  source_type text NOT NULL CHECK(source_type IN('MANUAL','CSV','XLSX')),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(record_id,revision)
);
CREATE FUNCTION hft_draft077.deny_fact_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $deny$
BEGIN RAISE EXCEPTION 'DRAFT077_IMMUTABLE_FACT'; END $deny$;
DO $immutable$ DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
  'provisional_scope','actor_scope_grant','actor_scope_revocation',
  'signing_key','key_revocation','write_nonce','draft_revision'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON hft_draft077.%I '
    ||'FOR EACH ROW EXECUTE FUNCTION hft_draft077.deny_fact_mutation_v1()',
    'immutable_'||relation,relation);
 END LOOP;
END $immutable$;
CREATE FUNCTION hft_draft077.prevent_record_delete_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $deny$
BEGIN RAISE EXCEPTION 'DRAFT077_RECORD_DELETE_DENIED'; END $deny$;
CREATE TRIGGER no_delete_draft_record BEFORE DELETE ON hft_draft077.draft_record
FOR EACH ROW EXECUTE FUNCTION hft_draft077.prevent_record_delete_v1();

-- Canonical fixed-length-prefixed UTF-8 HMAC; same byte contract as Node
-- lengthPrefixedUtf8([...]) used by the FacilityOS server after verified JWT.
CREATE FUNCTION hft_draft077.length_prefixed_v1(parts text[]) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,pg_temp AS $codec$
DECLARE field text; raw bytea; size_bytes bytea; result bytea:=''::bytea;
BEGIN
 IF cardinality(parts)<>9 THEN RAISE EXCEPTION 'DRAFT077_HMAC_FIELD_COUNT'; END IF;
 FOREACH field IN ARRAY parts LOOP
  IF field IS NULL THEN RAISE EXCEPTION 'DRAFT077_HMAC_NULL'; END IF;
  raw:=convert_to(field,'UTF8');
  IF octet_length(raw)>65535 THEN RAISE EXCEPTION 'DRAFT077_HMAC_FIELD_TOO_LARGE'; END IF;
  size_bytes:=decode(lpad(to_hex(octet_length(raw)),8,'0'),'hex');
  result:=result||size_bytes||raw;
 END LOOP;
 RETURN result;
END $codec$;

-- Helper only callable by definer owner. Never expose key tables or helper
-- to ordinary runtime. Chat 16 must issue HMAC only after validating the
-- genuine Ed25519 __Host-hft_session and exact actor/scope in the request.
CREATE FUNCTION hft_draft077.verify_proof_v1(
  body_text text, proof jsonb, duty text, scope uuid)
RETURNS text LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,pg_temp AS $proof$
DECLARE actor text; session_id text; digest_hex text; claimed bytea;
        expected bytea; k hft_draft077.signing_key%ROWTYPE;
        issued bigint; expires bigint; now_sec bigint; version integer;
        mismatch integer:=0; i integer;
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_draft077_api_login'
 OR current_user<>'hft_r1_draft_owner'
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 THEN RAISE EXCEPTION 'DRAFT077_RUNTIME_SQL_IDENTITY_TLS_REQUIRED'; END IF;
 IF duty NOT IN ('WRITE','READ') OR body_text IS NULL
 OR octet_length(body_text)>8192 OR length(body_text)<2
 OR jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM jsonb_object_keys(proof))<>9
 OR NOT (proof ?& ARRAY['proofVersion','actorSubject','sessionId',
  'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'])
 THEN RAISE EXCEPTION 'DRAFT077_PROOF_FORMAT_DENIED'; END IF;
 IF proof->>'proofVersion'<>'HFT-DRAFT077-HMAC-V1'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'payloadSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,17}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,17}$'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,7}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR EXISTS(SELECT 1 FROM jsonb_each(proof) AS x(k,v)
   WHERE jsonb_typeof(x.v)<>'string')
 THEN RAISE EXCEPTION 'DRAFT077_PROOF_INVALID'; END IF;
 actor:=proof->>'actorSubject';session_id:=proof->>'sessionId';
 digest_hex:=encode(hft_draft077.digest(convert_to(body_text,'UTF8'),'sha256'),'hex');
 IF digest_hex IS DISTINCT FROM proof->>'payloadSha256'
 THEN RAISE EXCEPTION 'DRAFT077_PAYLOAD_CHANGED'; END IF;
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 version:=(proof->>'keyVersion')::integer;
 now_sec:=floor(extract(epoch FROM clock_timestamp()))::bigint;
 IF issued>now_sec+30 OR expires<=now_sec OR expires<=issued
 OR expires-issued>60 THEN RAISE EXCEPTION 'DRAFT077_PROOF_EXPIRED'; END IF;
 SELECT * INTO k FROM hft_draft077.signing_key
 WHERE key_version=version AND valid_from<=clock_timestamp()
 AND valid_until>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM hft_draft077.key_revocation r
   WHERE r.key_version=version);
 IF k.key_version IS NULL THEN RAISE EXCEPTION 'DRAFT077_KEY_UNAVAILABLE'; END IF;
 expected:=hft_draft077.hmac(hft_draft077.length_prefixed_v1(ARRAY[
  'HFT-DRAFT077-HMAC-V1',duty,actor,session_id,digest_hex,
  proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',
  proof->>'keyVersion']),k.key_bytes,'sha256');
 claimed:=decode(proof->>'macSha256','hex');
 IF octet_length(expected)<>32 OR octet_length(claimed)<>32
 THEN RAISE EXCEPTION 'DRAFT077_MAC_LENGTH'; END IF;
 FOR i IN 0..31 LOOP
  mismatch:=mismatch | (get_byte(expected,i) # get_byte(claimed,i));
 END LOOP;
 IF mismatch<>0 THEN RAISE EXCEPTION 'DRAFT077_MAC_INVALID'; END IF;
 PERFORM 1 FROM hft_draft077.provisional_scope s
 JOIN hft_draft077.actor_scope_grant g ON g.scope_id=s.scope_id
 WHERE s.scope_id=scope AND s.scope_state='PROVISIONAL_UNVERIFIED'
 AND g.actor_subject=actor AND g.can_read
 AND (duty='READ' OR g.can_write)
 AND NOT EXISTS(SELECT 1 FROM hft_draft077.actor_scope_revocation v
   WHERE v.scope_id=s.scope_id AND v.actor_subject=actor);
 IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT077_ACTOR_SCOPE_DENIED'; END IF;
 RETURN actor;
END $proof$;

CREATE FUNCTION hft_draft077.validate_fields_v1(kind text, vals jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $fields$
DECLARE k text; val text;
BEGIN
 IF jsonb_typeof(vals)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(vals))>24
 OR (SELECT count(*) FROM jsonb_object_keys(vals))=0
 OR pg_column_size(vals)>4096
 THEN RAISE EXCEPTION 'DRAFT077_FIELDS_SHAPE_OR_SIZE'; END IF;
 FOR k,val IN SELECT key,value FROM jsonb_each_text(vals) LOOP
  IF k !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
   OR jsonb_typeof(vals->k)<>'string'
   OR length(val)>256 OR val<>btrim(val)
  THEN RAISE EXCEPTION 'DRAFT077_FIELD_INVALID:%',k; END IF;
 END LOOP;
 IF (kind='LEGAL_ENTITY' AND nullif(vals->>'legalName','') IS NULL)
 OR (kind='SITE' AND nullif(vals->>'siteName','') IS NULL)
 OR (kind='EMPLOYEE' AND (nullif(vals->>'fullName','') IS NULL
    OR nullif(vals->>'department','') IS NULL
    OR nullif(vals->>'designation','') IS NULL))
 OR (kind='ITEM' AND (nullif(vals->>'uom','') IS NULL
    OR coalesce(vals->>'controlType','') NOT IN ('NONE','SERIAL','BATCH')))
 OR (kind='SUPPLIER' AND nullif(vals->>'legalName','') IS NULL)
 OR (kind='WAREHOUSE' AND nullif(vals->>'name','') IS NULL)
 THEN RAISE EXCEPTION 'DRAFT077_REQUIRED_FIELD_MISSING'; END IF;
END $fields$;

-- CREATE and EDIT are the only permitted mutations; no ACTIVATE, APPROVE,
-- P3 SUBMIT or stock command. Each request commits one immutable revision.
CREATE FUNCTION hft_draft077.save_v1(body_text text,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $save$
DECLARE b jsonb; actor text; scope uuid; req uuid;
 v_kind text; v_action text; v_record_key text; src text;
 expected_revision bigint; rec hft_draft077.draft_record%ROWTYPE;
 previous jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'serializable'
 THEN RAISE EXCEPTION 'DRAFT077_SERIALIZABLE_WRITE_REQUIRED'; END IF;
 IF octet_length(body_text)>8192 THEN RAISE EXCEPTION 'DRAFT077_BODY_TOO_LARGE'; END IF;
 b:=body_text::jsonb;
 IF jsonb_typeof(b)<>'object'
 OR (SELECT count(*) FROM jsonb_object_keys(b))<>8
 OR NOT (b ?& ARRAY['operation','scopeId','kind','recordKey','expectedVersion',
   'values','requestId','source'])
 OR EXISTS(SELECT 1 FROM jsonb_each(b) AS x(k,v)
   WHERE x.k<>'values' AND jsonb_typeof(x.v)<>'string')
 THEN RAISE EXCEPTION 'DRAFT077_CHANGE_EXACT_FIELDS_REQUIRED'; END IF;
 IF b->>'scopeId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR b->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR b->>'recordKey' !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
 OR b->>'kind' NOT IN
  ('LEGAL_ENTITY','SITE','EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')
 OR b->>'operation' NOT IN ('CREATE','EDIT')
 OR b->>'source' NOT IN ('MANUAL','CSV','XLSX')
 OR b->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,16})$'
 THEN RAISE EXCEPTION 'DRAFT077_CHANGE_SCOPE_OR_TYPE_INVALID'; END IF;
 scope:=(b->>'scopeId')::uuid;req:=(b->>'requestId')::uuid;
 v_kind:=b->>'kind';v_action:=b->>'operation';v_record_key:=b->>'recordKey';
 src:=b->>'source';expected_revision:=(b->>'expectedVersion')::bigint;
 PERFORM hft_draft077.validate_fields_v1(v_kind,b->'values');
 actor:=hft_draft077.verify_proof_v1(body_text,proof,'WRITE',scope);
 -- Scope anchors remain provisional, but may not be silently reassigned by
 -- browser values or a signed payload with inconsistent entity/site identity.
 IF (v_kind='LEGAL_ENTITY' AND v_record_key IS DISTINCT FROM
     (SELECT legal_entity_ref FROM hft_draft077.provisional_scope WHERE scope_id=scope))
 OR (v_kind='SITE' AND v_record_key IS DISTINCT FROM
     (SELECT site_ref FROM hft_draft077.provisional_scope WHERE scope_id=scope))
 OR (v_kind IN('EMPLOYEE','WAREHOUSE') AND
     b->'values'->>'siteId' IS DISTINCT FROM
     (SELECT site_ref FROM hft_draft077.provisional_scope WHERE scope_id=scope))
 OR (v_kind='LOCATION' AND coalesce(b->'values'->>'parentLocationId','')<>''
   AND (b->'values'->>'parentLocationId' !~ '^[A-Z0-9][A-Z0-9._-]{1,63}
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'HFT:DRAFT077:'||scope::text||':'||v_kind||':'||v_record_key,0));
 INSERT INTO hft_draft077.write_nonce(key_version,nonce,actor_subject,request_sha256)
 VALUES((proof->>'keyVersion')::integer,proof->>'nonce',actor,
  proof->>'payloadSha256');
 IF v_action='CREATE' THEN
  IF expected_revision<>0 THEN RAISE EXCEPTION 'DRAFT077_CREATE_EXPECTS_ZERO'; END IF;
  INSERT INTO hft_draft077.draft_record
   (scope_id,kind,record_key,values_json,created_by,edited_by,source_type)
  VALUES(scope,v_kind,v_record_key,b->'values',actor,actor,src) RETURNING * INTO rec;
  previous:=NULL;
 ELSE
  SELECT * INTO rec FROM hft_draft077.draft_record
  WHERE scope_id=scope AND kind=v_kind AND record_key=v_record_key FOR UPDATE;
  IF rec.id IS NULL OR rec.revision<>expected_revision
  THEN RAISE EXCEPTION 'DRAFT077_STALE_OR_MISSING_REVISION'; END IF;
  previous:=rec.values_json;
  UPDATE hft_draft077.draft_record
  SET values_json=b->'values',revision=revision+1,edited_by=actor,
   updated_at=clock_timestamp(),source_type=src
  WHERE id=rec.id AND revision=expected_revision RETURNING * INTO rec;
  IF rec.id IS NULL THEN RAISE EXCEPTION 'DRAFT077_COMPARE_AND_SET_FAILED'; END IF;
 END IF;
 INSERT INTO hft_draft077.draft_revision
  (record_id,revision,request_id,action,previous_json,current_json,changed_by,source_type)
 VALUES(rec.id,rec.revision,req,v_action,previous,rec.values_json,actor,src);
 RETURN jsonb_build_object('state','DRAFT_NOT_APPROVED',
   'displayStatus','DRAFT — NOT APPROVED',
   'scopeProvisional',true,'internalUuid',rec.id::text,'scopeId',scope::text,
   'kind',rec.kind,'recordKey',rec.record_key,'recordId',rec.record_key,
   'revision',rec.revision,'writeId',req::text,
   'requestId',req::text,'updatedAt',rec.updated_at);
END $save$;

-- A fresh READ uses exactly the same authenticated actor/scope HMAC. The
-- application performs READ after COMMIT on a different database transaction.
CREATE FUNCTION hft_draft077.read_v1(body_text text,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read$
DECLARE b jsonb; scope uuid; actor text; result jsonb; n integer; skipped integer;
BEGIN
 IF current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'DRAFT077_FRESH_READ_ONLY_REQUIRED'; END IF;
 IF octet_length(body_text)>4096 THEN RAISE EXCEPTION 'DRAFT077_READ_TOO_LARGE'; END IF;
 b:=body_text::jsonb;
 IF jsonb_typeof(b)<>'object'
 OR (SELECT count(*) FROM jsonb_object_keys(b))<>7
 OR NOT (b ?& ARRAY['intent','scopeId','kind','recordKey','search','limit','offset'])
 OR EXISTS(SELECT 1 FROM jsonb_each(b) AS x(k,v)
   WHERE jsonb_typeof(x.v)<>'string')
 OR b->>'scopeId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR b->>'intent' NOT IN('GET','LIST','HISTORY')
 OR b->>'kind' NOT IN
 ('ALL','LEGAL_ENTITY','SITE','EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')
 OR b->>'recordKey' !~ '^[A-Z0-9._-]{0,64}$'
 OR length(b->>'search')>80 OR b->>'search' !~ '^[A-Za-z0-9 ._-]*$'
 OR b->>'limit' !~ '^[1-9][0-9]{0,2}$'
 OR b->>'offset' !~ '^(0|[1-9][0-9]{0,5})$'
 THEN RAISE EXCEPTION 'DRAFT077_READ_EXACT_FIELDS_REQUIRED'; END IF;
 n:=(b->>'limit')::integer;skipped:=(b->>'offset')::integer;
 IF n>100 OR skipped>100000 OR
 ((b->>'intent' IN('GET','HISTORY')) AND
 (b->>'kind'='ALL' OR length(b->>'recordKey')<2))
 THEN RAISE EXCEPTION 'DRAFT077_READ_WINDOW_INVALID'; END IF;
 scope:=(b->>'scopeId')::uuid;
 actor:=hft_draft077.verify_proof_v1(body_text,proof,'READ',scope);
 IF b->>'intent'='HISTORY' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.revision),'[]'::jsonb)
  INTO result FROM (
   SELECT h.revision,h.action,h.previous_json,h.current_json,
    h.changed_by,h.source_type,h.changed_at
   FROM hft_draft077.draft_record r
   JOIN hft_draft077.draft_revision h ON h.record_id=r.id
   WHERE r.scope_id=scope AND r.kind=b->>'kind'
   AND r.record_key=b->>'recordKey'
   ORDER BY h.revision LIMIT n OFFSET skipped
  ) t;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.kind,t.record_key),'[]'::jsonb)
  INTO result FROM (
   SELECT r.kind,sc.legal_entity_ref AS legal_entity_id,
    sc.site_ref AS site_id,sc.warehouse_ref AS warehouse_id,
    r.record_key AS record_id,r.revision,r.values_json AS "values",
    r.created_by,r.edited_by AS updated_by,r.created_at,r.updated_at,
    r.source_type,'DRAFT_NOT_APPROVED'::text AS state,
    true AS "scopeProvisional"
   FROM hft_draft077.draft_record r
   JOIN hft_draft077.provisional_scope sc ON sc.scope_id=r.scope_id
   WHERE r.scope_id=scope
   AND (b->>'kind'='ALL' OR r.kind=b->>'kind')
   AND (b->>'intent'<>'GET' OR r.record_key=b->>'recordKey')
   AND (b->>'intent'<>'LIST' OR
    strpos(lower(r.record_key),lower(b->>'search'))>0)
   ORDER BY r.kind,r.record_key LIMIT n OFFSET skipped
  ) t;
 END IF;
 RETURN jsonb_build_object('state','DRAFT_ONLY',
  'displayStatus','DRAFT — NOT APPROVED',
  'scopeProvisional',true,'actor',actor,'scopeId',scope::text,
  'records',result,'limit',n,'offset',skipped);
END $read$;

-- Relations and internal helpers must NEVER be callable by the HTTP login.
REVOKE ALL ON ALL TABLES IN SCHEMA hft_draft077
 FROM PUBLIC,hft_draft077_api_login,hft_draft077_enroller_login;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft_draft077
 FROM PUBLIC,hft_draft077_api_login,hft_draft077_enroller_login;
REVOKE EXECUTE ON FUNCTION
 hft_draft077.deny_fact_mutation_v1(),
 hft_draft077.prevent_record_delete_v1(),
 hft_draft077.length_prefixed_v1(text[]),
 hft_draft077.verify_proof_v1(text,jsonb,text,uuid),
 hft_draft077.validate_fields_v1(text,jsonb),
 hft_draft077.save_v1(text,jsonb),
 hft_draft077.read_v1(text,jsonb)
 FROM PUBLIC,hft_draft077_api_login,hft_draft077_enroller_login;
GRANT USAGE ON SCHEMA hft_draft077 TO hft_draft077_api_login,
 hft_draft077_enroller_login;
GRANT EXECUTE ON FUNCTION hft_draft077.save_v1(text,jsonb),
 hft_draft077.read_v1(text,jsonb)
 TO hft_draft077_api_login;
-- Genuine external issuance of a provisional scope, scope grant and HMAC
-- key is permitted ONLY via a separately approved enroller credential.
GRANT INSERT,SELECT ON hft_draft077.provisional_scope,
 hft_draft077.actor_scope_grant TO hft_draft077_enroller_login;
GRANT INSERT ON hft_draft077.actor_scope_revocation,
 hft_draft077.signing_key,hft_draft077.key_revocation
 TO hft_draft077_enroller_login;

RESET ROLE;
-- Remove elevated temporary NOLOGIN owner membership after installation.
REVOKE hft_r1_draft_owner FROM hft_r1_retained_masters_np077_owner;

-- Catalog postflight: no unintended direct runtime relation privileges or
-- extra execute; no runtime ability to become the owner or modify P3/stock.
DO $postflight$
DECLARE t record; p record; n integer;
BEGIN
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(
    'hft_r1_draft_owner','hft_draft077_api_login','hft_draft077_enroller_login'))<>3
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
    ('hft_draft077_api_login','hft_draft077_enroller_login') AND rolcanlogin)
 OR pg_has_role('hft_draft077_api_login','hft_r1_draft_owner','MEMBER')
 OR pg_has_role('hft_draft077_api_login','hft_draft077_enroller_login','MEMBER')
 OR has_schema_privilege('hft_draft077_api_login','hft_draft077','CREATE')
 OR EXISTS(SELECT 1 FROM pg_namespace ns WHERE ns.nspname='hft'
    AND has_schema_privilege('hft_draft077_api_login',ns.oid,'USAGE'))
 THEN RAISE EXCEPTION 'DRAFT077_ROLE_OR_SCHEMA_ISOLATION_FAILED'; END IF;
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
 JOIN pg_roles r ON r.oid=p.proowner
 WHERE s.nspname='hft_draft077' AND p.proname IN
 ('save_v1','read_v1')
 AND p.prosecdef AND r.rolname='hft_r1_draft_owner'
 AND EXISTS(SELECT 1 FROM unnest(p.proconfig) cfg
  WHERE replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF n<>2 THEN RAISE EXCEPTION 'DRAFT077_FUNCTION_OWNER_OR_SEARCH_PATH_FAILED'; END IF;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c
 JOIN pg_namespace s ON s.oid=c.relnamespace
 WHERE s.nspname='hft_draft077' AND c.relkind IN('r','p','v','m','S') LOOP
  IF (t.relname IS NOT NULL AND
   (CASE WHEN (SELECT relkind FROM pg_class WHERE oid=t.oid)='S' THEN
     has_sequence_privilege('hft_draft077_api_login',t.oid,'USAGE,SELECT,UPDATE')
   ELSE has_table_privilege('hft_draft077_api_login',t.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
  THEN RAISE EXCEPTION 'DRAFT077_DIRECT_RUNTIME_DML:%',t.relname; END IF;
 END LOOP;
 FOR p IN SELECT f.oid,f.proname FROM pg_proc f
 JOIN pg_namespace s ON s.oid=f.pronamespace
 WHERE s.nspname='hft_draft077' LOOP
  IF has_function_privilege('hft_draft077_api_login',p.oid,'EXECUTE')
  AND p.oid NOT IN ('hft_draft077.save_v1(text,jsonb)'::regprocedure,
   'hft_draft077.read_v1(text,jsonb)'::regprocedure)
  THEN RAISE EXCEPTION 'DRAFT077_RUNTIME_HELPER_LEAK:%',p.proname; END IF;
 END LOOP;
END $postflight$;
COMMIT;

    OR b->'values'->>'parentLocationId'=v_record_key))
 THEN RAISE EXCEPTION 'DRAFT077_PROVISIONAL_SCOPE_FIELD_MISMATCH'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'HFT:DRAFT077:'||scope::text||':'||v_kind||':'||v_record_key,0));
 INSERT INTO hft_draft077.write_nonce(key_version,nonce,actor_subject,request_sha256)
 VALUES((proof->>'keyVersion')::integer,proof->>'nonce',actor,
  proof->>'payloadSha256');
 IF v_action='CREATE' THEN
  IF expected_revision<>0 THEN RAISE EXCEPTION 'DRAFT077_CREATE_EXPECTS_ZERO'; END IF;
  INSERT INTO hft_draft077.draft_record
   (scope_id,kind,record_key,values_json,created_by,edited_by,source_type)
  VALUES(scope,v_kind,v_record_key,b->'values',actor,actor,src) RETURNING * INTO rec;
  previous:=NULL;
 ELSE
  SELECT * INTO rec FROM hft_draft077.draft_record
  WHERE scope_id=scope AND kind=v_kind AND record_key=v_record_key FOR UPDATE;
  IF rec.id IS NULL OR rec.revision<>expected_revision
  THEN RAISE EXCEPTION 'DRAFT077_STALE_OR_MISSING_REVISION'; END IF;
  previous:=rec.values_json;
  UPDATE hft_draft077.draft_record
  SET values_json=b->'values',revision=revision+1,edited_by=actor,
   updated_at=clock_timestamp(),source_type=src
  WHERE id=rec.id AND revision=expected_revision RETURNING * INTO rec;
  IF rec.id IS NULL THEN RAISE EXCEPTION 'DRAFT077_COMPARE_AND_SET_FAILED'; END IF;
 END IF;
 INSERT INTO hft_draft077.draft_revision
  (record_id,revision,request_id,action,previous_json,current_json,changed_by,source_type)
 VALUES(rec.id,rec.revision,req,v_action,previous,rec.values_json,actor,src);
 RETURN jsonb_build_object('state','DRAFT_NOT_APPROVED',
   'displayStatus','DRAFT — NOT APPROVED',
   'scopeProvisional',true,'internalUuid',rec.id::text,'scopeId',scope::text,
   'kind',rec.kind,'recordKey',rec.record_key,'recordId',rec.record_key,
   'revision',rec.revision,'writeId',req::text,
   'requestId',req::text,'updatedAt',rec.updated_at);
END $save$;

-- A fresh READ uses exactly the same authenticated actor/scope HMAC. The
-- application performs READ after COMMIT on a different database transaction.
CREATE FUNCTION hft_draft077.read_v1(body_text text,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read$
DECLARE b jsonb; scope uuid; actor text; result jsonb; n integer; skipped integer;
BEGIN
 IF current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'DRAFT077_FRESH_READ_ONLY_REQUIRED'; END IF;
 IF octet_length(body_text)>4096 THEN RAISE EXCEPTION 'DRAFT077_READ_TOO_LARGE'; END IF;
 b:=body_text::jsonb;
 IF jsonb_typeof(b)<>'object'
 OR (SELECT count(*) FROM jsonb_object_keys(b))<>7
 OR NOT (b ?& ARRAY['intent','scopeId','kind','recordKey','search','limit','offset'])
 OR EXISTS(SELECT 1 FROM jsonb_each(b) AS x(k,v)
   WHERE jsonb_typeof(x.v)<>'string')
 OR b->>'scopeId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR b->>'intent' NOT IN('GET','LIST','HISTORY')
 OR b->>'kind' NOT IN
 ('ALL','LEGAL_ENTITY','SITE','EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION')
 OR b->>'recordKey' !~ '^[A-Z0-9._-]{0,64}$'
 OR length(b->>'search')>80 OR b->>'search' !~ '^[A-Za-z0-9 ._-]*$'
 OR b->>'limit' !~ '^[1-9][0-9]{0,2}$'
 OR b->>'offset' !~ '^(0|[1-9][0-9]{0,5})$'
 THEN RAISE EXCEPTION 'DRAFT077_READ_EXACT_FIELDS_REQUIRED'; END IF;
 n:=(b->>'limit')::integer;skipped:=(b->>'offset')::integer;
 IF n>100 OR skipped>100000 OR
 ((b->>'intent' IN('GET','HISTORY')) AND
 (b->>'kind'='ALL' OR length(b->>'recordKey')<2))
 THEN RAISE EXCEPTION 'DRAFT077_READ_WINDOW_INVALID'; END IF;
 scope:=(b->>'scopeId')::uuid;
 actor:=hft_draft077.verify_proof_v1(body_text,proof,'READ',scope);
 IF b->>'intent'='HISTORY' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.revision),'[]'::jsonb)
  INTO result FROM (
   SELECT h.revision,h.action,h.previous_json,h.current_json,
    h.changed_by,h.source_type,h.changed_at
   FROM hft_draft077.draft_record r
   JOIN hft_draft077.draft_revision h ON h.record_id=r.id
   WHERE r.scope_id=scope AND r.kind=b->>'kind'
   AND r.record_key=b->>'recordKey'
   ORDER BY h.revision LIMIT n OFFSET skipped
  ) t;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.kind,t.record_key),'[]'::jsonb)
  INTO result FROM (
   SELECT r.kind,sc.legal_entity_ref AS legal_entity_id,
    sc.site_ref AS site_id,sc.warehouse_ref AS warehouse_id,
    r.record_key AS record_id,r.revision,r.values_json AS "values",
    r.created_by,r.edited_by AS updated_by,r.created_at,r.updated_at,
    r.source_type,'DRAFT_NOT_APPROVED'::text AS state,
    true AS "scopeProvisional"
   FROM hft_draft077.draft_record r
   JOIN hft_draft077.provisional_scope sc ON sc.scope_id=r.scope_id
   WHERE r.scope_id=scope
   AND (b->>'kind'='ALL' OR r.kind=b->>'kind')
   AND (b->>'intent'<>'GET' OR r.record_key=b->>'recordKey')
   AND (b->>'intent'<>'LIST' OR
    strpos(lower(r.record_key),lower(b->>'search'))>0)
   ORDER BY r.kind,r.record_key LIMIT n OFFSET skipped
  ) t;
 END IF;
 RETURN jsonb_build_object('state','DRAFT_ONLY',
  'displayStatus','DRAFT — NOT APPROVED',
  'scopeProvisional',true,'actor',actor,'scopeId',scope::text,
  'records',result,'limit',n,'offset',skipped);
END $read$;

-- Relations and internal helpers must NEVER be callable by the HTTP login.
REVOKE ALL ON ALL TABLES IN SCHEMA hft_draft077
 FROM PUBLIC,hft_draft077_api_login,hft_draft077_enroller_login;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft_draft077
 FROM PUBLIC,hft_draft077_api_login,hft_draft077_enroller_login;
REVOKE EXECUTE ON FUNCTION
 hft_draft077.deny_fact_mutation_v1(),
 hft_draft077.prevent_record_delete_v1(),
 hft_draft077.length_prefixed_v1(text[]),
 hft_draft077.verify_proof_v1(text,jsonb,text,uuid),
 hft_draft077.validate_fields_v1(text,jsonb),
 hft_draft077.save_v1(text,jsonb),
 hft_draft077.read_v1(text,jsonb)
 FROM PUBLIC,hft_draft077_api_login,hft_draft077_enroller_login;
GRANT USAGE ON SCHEMA hft_draft077 TO hft_draft077_api_login,
 hft_draft077_enroller_login;
GRANT EXECUTE ON FUNCTION hft_draft077.save_v1(text,jsonb),
 hft_draft077.read_v1(text,jsonb)
 TO hft_draft077_api_login;
-- Genuine external issuance of a provisional scope, scope grant and HMAC
-- key is permitted ONLY via a separately approved enroller credential.
GRANT INSERT,SELECT ON hft_draft077.provisional_scope,
 hft_draft077.actor_scope_grant TO hft_draft077_enroller_login;
GRANT INSERT ON hft_draft077.actor_scope_revocation,
 hft_draft077.signing_key,hft_draft077.key_revocation
 TO hft_draft077_enroller_login;

RESET ROLE;
-- Remove elevated temporary NOLOGIN owner membership after installation.
REVOKE hft_r1_draft_owner FROM hft_r1_retained_masters_np077_owner;

-- Catalog postflight: no unintended direct runtime relation privileges or
-- extra execute; no runtime ability to become the owner or modify P3/stock.
DO $postflight$
DECLARE t record; p record; n integer;
BEGIN
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN(
    'hft_r1_draft_owner','hft_draft077_api_login','hft_draft077_enroller_login'))<>3
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
    ('hft_draft077_api_login','hft_draft077_enroller_login') AND rolcanlogin)
 OR pg_has_role('hft_draft077_api_login','hft_r1_draft_owner','MEMBER')
 OR pg_has_role('hft_draft077_api_login','hft_draft077_enroller_login','MEMBER')
 OR has_schema_privilege('hft_draft077_api_login','hft_draft077','CREATE')
 OR EXISTS(SELECT 1 FROM pg_namespace ns WHERE ns.nspname='hft'
    AND has_schema_privilege('hft_draft077_api_login',ns.oid,'USAGE'))
 THEN RAISE EXCEPTION 'DRAFT077_ROLE_OR_SCHEMA_ISOLATION_FAILED'; END IF;
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
 JOIN pg_roles r ON r.oid=p.proowner
 WHERE s.nspname='hft_draft077' AND p.proname IN
 ('save_v1','read_v1')
 AND p.prosecdef AND r.rolname='hft_r1_draft_owner'
 AND EXISTS(SELECT 1 FROM unnest(p.proconfig) cfg
  WHERE replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF n<>2 THEN RAISE EXCEPTION 'DRAFT077_FUNCTION_OWNER_OR_SEARCH_PATH_FAILED'; END IF;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c
 JOIN pg_namespace s ON s.oid=c.relnamespace
 WHERE s.nspname='hft_draft077' AND c.relkind IN('r','p','v','m','S') LOOP
  IF (t.relname IS NOT NULL AND
   (CASE WHEN (SELECT relkind FROM pg_class WHERE oid=t.oid)='S' THEN
     has_sequence_privilege('hft_draft077_api_login',t.oid,'USAGE,SELECT,UPDATE')
   ELSE has_table_privilege('hft_draft077_api_login',t.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
  THEN RAISE EXCEPTION 'DRAFT077_DIRECT_RUNTIME_DML:%',t.relname; END IF;
 END LOOP;
 FOR p IN SELECT f.oid,f.proname FROM pg_proc f
 JOIN pg_namespace s ON s.oid=f.pronamespace
 WHERE s.nspname='hft_draft077' LOOP
  IF has_function_privilege('hft_draft077_api_login',p.oid,'EXECUTE')
  AND p.oid NOT IN ('hft_draft077.save_v1(text,jsonb)'::regprocedure,
   'hft_draft077.read_v1(text,jsonb)'::regprocedure)
  THEN RAISE EXCEPTION 'DRAFT077_RUNTIME_HELPER_LEAK:%',p.proname; END IF;
 END LOOP;
END $postflight$;
COMMIT;
