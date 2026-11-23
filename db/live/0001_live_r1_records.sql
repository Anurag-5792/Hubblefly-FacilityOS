-- HFT LIVE R1 / 0001 — distinct production master RECORD store, never protected hft/P3 ledger.
-- Apply only in a separately admitted production/production-like dedicated database.
-- Requires precreated nonlogin hft_r1_live_owner, no default owner/admin grant or enrollment.
BEGIN;
DO $live_boundary$ BEGIN
 IF current_database() !~ '^hft_r1_live_[a-z0-9_]{6,40}$'
    OR current_database()='hft_r1_retained_masters_np077'
    OR current_user <> 'hft_r1_live_owner'
 THEN RAISE EXCEPTION 'LIVE_R1_WRONG_DATABASE_OR_INSTALLER'; END IF;
END $live_boundary$;
CREATE SCHEMA hft_live_r1;
REVOKE ALL ON SCHEMA hft_live_r1 FROM PUBLIC;
CREATE TABLE hft_live_r1.schema_revision(
 version integer PRIMARY KEY CHECK(version>0),source_sha256 text NOT NULL
 CHECK(source_sha256~'^[0-9a-f]{64}$'),
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),applied_by name NOT NULL DEFAULT session_user);
CREATE TABLE hft_live_r1.installation(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 target_admission_sha256 text NOT NULL CHECK(target_admission_sha256~'^[0-9a-f]{64}$'),
 installer_sha256 text NOT NULL CHECK(installer_sha256~'^[0-9a-f]{64}$'),
 release_sha256 text NOT NULL CHECK(release_sha256~'^[0-9a-f]{64}$'),
 target_project text NOT NULL,target_branch text NOT NULL,
 database_oid oid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Separate corporate enrollment from business record content and from ROLE077.
-- The service login receives no DML, ownership, membership or direct SELECT.
CREATE TABLE hft_live_r1.actor_scope(
 subject text NOT NULL,legal_entity_id text NOT NULL,site_id text NOT NULL,
 warehouse_id text NOT NULL,person_id text NOT NULL,
 permission_codes text[] NOT NULL CHECK(cardinality(permission_codes)<=40),
 active boolean NOT NULL DEFAULT false,
 valid_from timestamptz NOT NULL,valid_until timestamptz,
 enrollment_reference text NOT NULL CHECK(length(enrollment_reference)>=8),
 PRIMARY KEY(subject,legal_entity_id,site_id,warehouse_id),
 CHECK(valid_until IS NULL OR valid_until>valid_from),
 CHECK(subject<>'' AND person_id<>'')
);
CREATE TABLE hft_live_r1.master_record(
 kind text NOT NULL CHECK(kind IN('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION','SITE')),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 record_id text NOT NULL,revision bigint NOT NULL CHECK(revision>0),
 values_json jsonb NOT NULL CHECK(jsonb_typeof(values_json)='object'),
 deleted boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'RECORDED_UNAPPROVED'
 CHECK(state='RECORDED_UNAPPROVED'),
 created_by text NOT NULL,updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(kind,legal_entity_id,site_id,warehouse_id,record_id),
 CHECK(legal_entity_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
  AND site_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
  AND warehouse_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
  AND record_id~'^[A-Z0-9][A-Z0-9._-]{1,63}$')
);
CREATE TABLE hft_live_r1.revision_event(
 request_id uuid PRIMARY KEY,
 kind text NOT NULL,legal_entity_id text NOT NULL,
 site_id text NOT NULL,warehouse_id text NOT NULL,record_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 action text NOT NULL CHECK(action IN('CREATE','UPDATE','DELETE')),
 before_snapshot jsonb,after_snapshot jsonb NOT NULL,
 actor_subject text NOT NULL,actor_person_id text NOT NULL,
 actor_session_id text NOT NULL,reason text NOT NULL CHECK(length(reason)>=8),
 event_sha256 text NOT NULL CHECK(event_sha256~'^[a-f0-9]{64}$'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(kind,legal_entity_id,site_id,warehouse_id,record_id)
  REFERENCES hft_live_r1.master_record,
 UNIQUE(kind,legal_entity_id,site_id,warehouse_id,record_id,revision)
);
CREATE FUNCTION hft_live_r1.deny_audit_mutation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $immut$
BEGIN RAISE EXCEPTION 'LIVE_R1_IMMUTABLE_AUDIT'; END $immut$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE
 ON hft_live_r1.revision_event FOR EACH STATEMENT
 EXECUTE FUNCTION hft_live_r1.deny_audit_mutation();
ALTER TABLE hft_live_r1.revision_event ENABLE ALWAYS TRIGGER immutable_audit;
CREATE FUNCTION hft_live_r1.require_revision_event() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $event$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hft_live_r1.revision_event e WHERE
  e.kind=NEW.kind AND e.legal_entity_id=NEW.legal_entity_id
  AND e.site_id=NEW.site_id AND e.warehouse_id=NEW.warehouse_id
  AND e.record_id=NEW.record_id AND e.revision=NEW.revision
  AND e.after_snapshot=to_jsonb(NEW))
 THEN RAISE EXCEPTION 'LIVE_R1_REVISION_AUDIT_MISSING'; END IF;
 RETURN NULL;
END $event$;
CREATE CONSTRAINT TRIGGER record_requires_audit AFTER INSERT OR UPDATE
 ON hft_live_r1.master_record DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft_live_r1.require_revision_event();
ALTER TABLE hft_live_r1.master_record ENABLE ALWAYS TRIGGER record_requires_audit;
CREATE INDEX live_master_scope_kind_list ON hft_live_r1.master_record
 (legal_entity_id,site_id,warehouse_id,kind,record_id);
CREATE INDEX live_revision_order ON hft_live_r1.revision_event
 (kind,legal_entity_id,site_id,warehouse_id,record_id,revision DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA hft_live_r1 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_live_r1 FROM PUBLIC;
-- Installer must append an actual sha256-pinned schema_revision and exact
-- signed target-binding row; no placeholder hashes or actor enrollment here.
COMMIT;
