-- DERIVED EXACT-SOURCE EXECUTABLE SQL CANDIDATE, REVIEW/TECHNICAL ADMISSION REQUIRED.
-- Original STOP-GUARDED source preserved in 25-MVP-P2-IDENTITY-PREREQUISITES-STOP.sql.
-- Standalone source candidate; do not execute without approved signer/role/backup/TLS admission.
-- HFT-R1-R77: PG18.7 RETAINED MASTERS P3-ONLY P2 SUPPORT PREREQUISITES
-- REVIEW ONLY, UNEXECUTABLE. NO STOCK WRITER, NO STOCK GRANTS, NO KEY ENROLLMENT.
-- Exact original P2 contract source SHA256:
-- 2cef3309608781a5a02ac3158d3886e847bb7d6b2acd9e5f2007ef69d21bf443
-- Exact source commit 5fe71565a2b0343ffd4a2ec5a25be5e0dfce27cc.
-- Only hft.posting_session, corporate human identity records and exact fixed-order
-- p2_length_prefixed_v1 codec are derived from that full candidate. 
-- These are NOT enrolled trust facts. New code needs independent Chat10/11/17 review.
BEGIN;
-- STOP guard omitted in this separate review derivative; all preflight checks preserved.
DO $HF13_P2_SUPPORT_PREFLIGHT$
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_engineering' OR current_user<>session_user
 OR pg_is_in_recovery()
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
  AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
   AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 OR to_regrole('hft_r1_posting_owner') IS NULL
 OR to_regrole('hft_r1_p3_master_owner') IS NULL
 OR NOT pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR NOT pg_has_role(session_user,'hft_r1_p3_master_owner','MEMBER')
 OR to_regnamespace('hft_crypto') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='pgcrypto' AND n.nspname='hft_crypto')
 OR to_regclass('hft.posting_session') IS NOT NULL
 OR to_regclass('hft.approval_human') IS NOT NULL
 OR to_regclass('hft.approval_human_login') IS NOT NULL
 OR to_regclass('hft.approval_human_revocation') IS NOT NULL
 OR to_regprocedure('hft.p2_length_prefixed_v1(text[])') IS NOT NULL
 OR EXISTS(SELECT 1 FROM hft.stock_account)
 OR EXISTS(SELECT 1 FROM hft.stock_command)
 OR EXISTS(SELECT 1 FROM hft.stock_entry)
 THEN RAISE EXCEPTION 'HF13_P2_SUPPORT_RESOURCE_OR_EMPTY_CATALOG_NOT_QUALIFIED'; END IF;
END $HF13_P2_SUPPORT_PREFLIGHT$;

-- Required sealed namespace; created by installer, owned by NOLOGIN stock
-- owner (not by any app login). No stock runtime membership is enrolled.
CREATE SCHEMA hft_secret AUTHORIZATION hft_r1_posting_owner;
REVOKE ALL ON SCHEMA hft_secret FROM PUBLIC,hft_r1_app_runtime,
 hft_r1_p3_master_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Single enrolled short-lived session registry. Real signer/issuer and session
-- issuance remain separately approved, otherwise it is intentionally EMPTY.
CREATE TABLE hft.posting_session (
 session_id text NOT NULL,actor_subject text NOT NULL,
 expires_at timestamptz NOT NULL,revoked_at timestamptz,
 PRIMARY KEY(session_id),UNIQUE(session_id,actor_subject),
 CHECK(length(session_id)>0 AND length(actor_subject)>0)
);
-- Human identity cannot be self-attested by UI or inferred from username.
CREATE TABLE hft.approval_human (
 legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
 person_id text NOT NULL,identity_evidence_sha256 text NOT NULL
 CHECK(identity_evidence_sha256~'^[0-9a-f]{64}$'),
 verified_by text NOT NULL,valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,revoked_at timestamptz,
 PRIMARY KEY(legal_entity_id,person_id),CHECK(valid_from<valid_until)
);
CREATE TABLE hft.approval_human_login (
 legal_entity_id text NOT NULL,actor_subject text NOT NULL,person_id text NOT NULL,
 PRIMARY KEY(legal_entity_id,actor_subject),
 FOREIGN KEY(legal_entity_id,person_id)
 REFERENCES hft.approval_human(legal_entity_id,person_id)
);
CREATE TABLE hft.approval_human_revocation (
 legal_entity_id text NOT NULL,person_id text NOT NULL,
 revoked_by text NOT NULL,reason text NOT NULL
 CHECK(length(pg_catalog.btrim(reason))>0),
 revoked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,person_id),
 FOREIGN KEY(legal_entity_id,person_id)
 REFERENCES hft.approval_human(legal_entity_id,person_id)
);
CREATE TRIGGER hf13_approval_human_revocation_immutable_v1
 BEFORE UPDATE OR DELETE ON hft.approval_human_revocation
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- Byte-exact logical codec follows reviewed P2 contract; not a posting HMAC
-- function and does not issue any signature/key.
CREATE FUNCTION hft.p2_length_prefixed_v1(fields text[]) RETURNS bytea
 LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,pg_temp AS $lp$
DECLARE value text;part bytea;length_bytes bytea;combined bytea:=''::bytea;
BEGIN
 IF cardinality(fields)>64 THEN RAISE EXCEPTION 'P2_TOO_MANY_MAC_FIELDS'; END IF;
 FOREACH value IN ARRAY fields LOOP
  IF value IS NULL THEN RAISE EXCEPTION 'P2_NULL_MAC_FIELD'; END IF;
  part:=pg_catalog.convert_to(value,'UTF8');
  IF pg_catalog.octet_length(part)>65535
  THEN RAISE EXCEPTION 'P2_MAC_FIELD_TOO_LARGE'; END IF;
  length_bytes:=pg_catalog.decode(pg_catalog.lpad(
   pg_catalog.to_hex(pg_catalog.octet_length(part)),8,'0'),'hex');
  combined:=combined||length_bytes||part;
 END LOOP;
 RETURN combined;
END $lp$;
REVOKE ALL ON hft.posting_session,hft.approval_human,
 hft.approval_human_login,hft.approval_human_revocation
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime;
REVOKE EXECUTE ON FUNCTION hft.p2_length_prefixed_v1(text[])
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime;
-- P3's separate admitted installer grants specific SELECT/EXECUTE to
-- the NOLOGIN SECURITY DEFINER hft_r1_p3_master_owner; not to a LOGIN.
-- No direct posting/stock access is granted by this file.
COMMIT;
