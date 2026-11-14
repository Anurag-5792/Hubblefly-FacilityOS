-- HF13-V2-077 PG18.7 RETAINED INSTALLATION SOURCE CANDIDATE; NO EXECUTION AUTHORIZATION.
-- Exact source commit: 5fe71565a2b0343ffd4a2ec5a25be5e0dfce27cc
-- Original STOP-guarded files remain untouched; this derived source is isolated outside db/migrations.
-- NOT VALIDATED by PostgreSQL parser/catalog; requires independent security, governance, QA and MASTER protected SQL admission.
-- HFT R77 FIRST LEGAL ENTITY/SITE/WAREHOUSE BOOTSTRAP REVIEW CANDIDATE
-- STOP GUARDED, NONEXECUTABLE, NOT INSTALLED OR ENROLLED.
-- NOT a generic Master SUBMIT bypass. Original human corporate authority,
-- corporate signatures and source bytes MUST be independently verified by
-- authorized corporate governance BEFORE any order enrollment.
-- The installer must separately qualify key custody, role grants, DDL and
-- rejection of every default/public/app-runtime direct relation privilege.
BEGIN;
DO $HF13_PG187_PREFLIGHT$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_engineering'
 OR current_user<>session_user
 OR pg_is_in_recovery()
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
     AND ssl AND version IN ('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
    AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 OR EXISTS(SELECT 1 FROM hft.stock_command)
 OR EXISTS(SELECT 1 FROM hft.stock_entry)
 THEN RAISE EXCEPTION 'HF13_PG187_RESOURCE_MIGRATION_OR_SECURITY_NOT_ADMITTED'; END IF;
END $HF13_PG187_PREFLIGHT$;

-- Trust root and order insert must be independently administered.
CREATE TABLE hft_secret.p3_corporate_bootstrap_key_v1(
 key_version integer PRIMARY KEY CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(pg_catalog.octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,not_after timestamptz NOT NULL,
 revoked_at timestamptz,CHECK(not_before<not_after)
);
REVOKE ALL ON hft_secret.p3_corporate_bootstrap_key_v1 FROM PUBLIC,
 hft_r1_p3_master_runtime,hft_r1_app_runtime;

CREATE TABLE hft.p3_corporate_bootstrap_order_v1(
 order_id uuid PRIMARY KEY,
 legal_entity_id text NOT NULL,entity_name text NOT NULL,
 site_id text NOT NULL,site_name text NOT NULL,
 warehouse_id text NOT NULL,warehouse_name text NOT NULL,
 corporate_approval_id text NOT NULL,
 original_corporate_document_sha256 text NOT NULL
 CHECK(original_corporate_document_sha256~'^[0-9a-f]{64}$'),
 original_corporate_signature_sha256 text NOT NULL
 CHECK(original_corporate_signature_sha256~'^[0-9a-f]{64}$'),
 independent_enrollment_sha256 text NOT NULL
 CHECK(independent_enrollment_sha256~'^[0-9a-f]{64}$'),
 maker_person_id text NOT NULL,approver_person_id text NOT NULL,
 admitted_issuer_subject text NOT NULL,
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 enrolled_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CHECK(maker_person_id<>approver_person_id),
 CHECK(valid_from<valid_until),
 CHECK(legal_entity_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$'),
 CHECK(site_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$'),
 CHECK(warehouse_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$'),
 CHECK(pg_catalog.length(entity_name) BETWEEN 2 AND 160),
 CHECK(pg_catalog.length(site_name) BETWEEN 2 AND 160),
 CHECK(pg_catalog.length(warehouse_name) BETWEEN 2 AND 160),
 UNIQUE(legal_entity_id,site_id,warehouse_id)
);
REVOKE ALL ON hft.p3_corporate_bootstrap_order_v1 FROM PUBLIC,
 hft_r1_p3_master_runtime,hft_r1_app_runtime;

CREATE TABLE hft.p3_corporate_bootstrap_receipt_v1(
 order_id uuid PRIMARY KEY REFERENCES hft.p3_corporate_bootstrap_order_v1(order_id),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 original_approval_sha256 text NOT NULL
 CHECK(original_approval_sha256~'^[0-9a-f]{64}$'),
 scope_snapshot_sha256 text NOT NULL
 CHECK(scope_snapshot_sha256~'^[0-9a-f]{64}$'),
 posted_by text NOT NULL,posted_session text NOT NULL,
 key_version integer NOT NULL,nonce text NOT NULL
 CHECK(nonce~'^[0-9a-f]{48}$'),
 executed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 UNIQUE(key_version,nonce)
);
REVOKE ALL ON hft.p3_corporate_bootstrap_receipt_v1 FROM PUBLIC,
 hft_r1_p3_master_runtime,hft_r1_app_runtime;

CREATE FUNCTION hft.p3_bootstrap_first_approved_scope_v1(
 p_order uuid,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $bootstrap$
DECLARE source hft.p3_corporate_bootstrap_order_v1%ROWTYPE;
 k hft_secret.p3_corporate_bootstrap_key_v1%ROWTYPE;
 source_digest text;canonical bytea;mac bytea;claimed bytea;
 diff integer:=0;i integer;version integer;issued bigint;expires bigint;
 now_epoch bigint;scope_hash text;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_corporate_bootstrap_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_engineering','MEMBER')
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_PRIVILEGE_ISOLATION_REQUIRED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:R77:CORPORATE:BOOTSTRAP',0));
 SELECT * INTO source FROM hft.p3_corporate_bootstrap_order_v1
 WHERE order_id=p_order AND valid_from<=pg_catalog.clock_timestamp()
 AND valid_until>pg_catalog.clock_timestamp() FOR UPDATE;
 IF source.order_id IS NULL
 OR EXISTS(SELECT 1 FROM hft.p3_corporate_bootstrap_receipt_v1 r
    WHERE r.order_id=p_order)
 OR EXISTS(SELECT 1 FROM hft.legal_entity e WHERE e.id=source.legal_entity_id)
 OR EXISTS(SELECT 1 FROM hft.site s WHERE s.legal_entity_id=source.legal_entity_id)
 OR EXISTS(SELECT 1 FROM hft.warehouse w WHERE w.legal_entity_id=source.legal_entity_id)
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_NOT_FIRST_OR_ALREADY_APPLIED'; END IF;
 -- Original documents, independent approval signers and enrollment SHA
 -- have to be verified OFF DATABASE before inserting the order. This
 -- function never interprets a bare hash as corporate authorization.
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 OR proof->>'proofVersion'<>'HFT-R1-P3-CORPORATE-BOOTSTRAP-HMAC-V1'
 OR proof->>'actorSubject'<>source.admitted_issuer_subject
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 OR proof->>'payloadSha256' !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_ORIGINAL_PROOF_REQUIRED'; END IF;
 canonical:=hft.p2_length_prefixed_v1(ARRAY[
  'HFT-R1-P3-CORPORATE-SCOPE-V1',source.order_id::text,
  source.legal_entity_id,source.entity_name,
  source.site_id,source.site_name,source.warehouse_id,
  source.warehouse_name,source.corporate_approval_id,
  source.original_corporate_document_sha256,
  source.original_corporate_signature_sha256,
  source.independent_enrollment_sha256,
  source.maker_person_id,source.approver_person_id,
  source.admitted_issuer_subject]);
 source_digest:=pg_catalog.encode(hft_crypto.digest(canonical,'sha256'),'hex');
 IF proof->>'payloadSha256'<>source_digest
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_SCOPE_DIGEST_MISMATCH'; END IF;
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 version:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM
  pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expires<=now_epoch OR expires<=issued
 OR expires-issued>40
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_PROOF_EXPIRED'; END IF;
 SELECT * INTO k FROM hft_secret.p3_corporate_bootstrap_key_v1
 WHERE key_version=version FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<k.not_before
 OR pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_KEY_UNAVAILABLE'; END IF;
 mac:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  source_digest,proof->>'issuedAt',proof->>'expiresAt',
  proof->>'nonce',proof->>'keyVersion']),k.key_bytes,'sha256');
 claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(mac)<>32
 OR pg_catalog.octet_length(claimed)<>32
 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_MAC_LENGTH'; END IF;
 FOR i IN 0..31 LOOP
  diff:=diff | (pg_catalog.get_byte(mac,i) # pg_catalog.get_byte(claimed,i));
 END LOOP;
 IF diff<>0 THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_MAC_MISMATCH'; END IF;
 PERFORM 1 FROM hft.posting_session sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3_CORPORATE_BOOTSTRAP_SESSION_REVOKED'; END IF;
 -- Only this independently verified one-time corporate order can establish
 -- the first ACTIVE legal entity, site and warehouse; not a P3 SUBMIT.
 INSERT INTO hft.legal_entity(id,name,active,version)
 VALUES(source.legal_entity_id,source.entity_name,true,1);
 INSERT INTO hft.site(legal_entity_id,id,name,active)
 VALUES(source.legal_entity_id,source.site_id,source.site_name,true);
 INSERT INTO hft.warehouse(legal_entity_id,warehouse_id,site_id,name,active,version)
 VALUES(source.legal_entity_id,source.warehouse_id,source.site_id,
 source.warehouse_name,true,1);
 scope_hash:=pg_catalog.encode(hft_crypto.digest(hft.p2_length_prefixed_v1(
  ARRAY[source.legal_entity_id,source.site_id,source.warehouse_id,
   source.corporate_approval_id,source_digest]),'sha256'),'hex');
 INSERT INTO hft.p3_corporate_bootstrap_receipt_v1(
  order_id,legal_entity_id,site_id,warehouse_id,original_approval_sha256,
  scope_snapshot_sha256,posted_by,posted_session,key_version,nonce)
 VALUES(p_order,source.legal_entity_id,source.site_id,source.warehouse_id,
  source.original_corporate_document_sha256,scope_hash,
  proof->>'actorSubject',proof->>'sessionId',version,proof->>'nonce');
 RETURN pg_catalog.jsonb_build_object('state','BOOTSTRAP_SOURCE_COMMITTED_PENDING_INDEPENDENT_READBACK',
  'orderId',p_order,'scopeSha256',scope_hash,'stockPosted',false);
END $bootstrap$;

-- Corporate source and execution receipt are append-only. A corrected
-- original authority requires a separately enrolled new order, never an
-- UPDATE that silently changes the scope or enrolled corporate signers.
CREATE TRIGGER p3_corporate_bootstrap_order_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.p3_corporate_bootstrap_order_v1
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER p3_corporate_bootstrap_receipt_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.p3_corporate_bootstrap_receipt_v1
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- NO installer, runtime, PUBLIC or QA access is granted here.
-- The separately approved installer must transfer this function to a
-- dedicated NOLOGIN corporate bootstrap owner with exact DML ONLY on
-- hft.legal_entity, hft.site, hft.warehouse and receipt, not stock.
-- Do not enroll corporate keys, persons, policies, orders or credentials
-- in a source-only build. No generic owner/app login may SELECT order data.
REVOKE ALL ON FUNCTION hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)
 FROM PUBLIC,hft_r1_p3_master_runtime,hft_r1_app_runtime;
COMMIT;
