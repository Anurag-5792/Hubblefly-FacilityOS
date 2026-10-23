-- HFT-R1-ENG-EXEC-005 protected posting DESIGN CANDIDATE.
-- Not a canonical migration. DO NOT APPLY until DBA/QA review and disposable PG.
-- This DDL must later be promoted as an independently reviewed, checksummed
-- forward-only migration. Deliberately not discovered by the migration runner.
BEGIN;
DO $preflight$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
    OR current_user <> 'hft_engineering'
    OR current_setting('server_version_num')::integer < 150000 THEN
   RAISE EXCEPTION 'HFT_NONPRODUCTION_DDL_IDENTITY_REQUIRED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM hft.schema_revision WHERE version=5
    AND sha256='01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf') THEN
   RAISE EXCEPTION 'HFT_CANONICAL_V5_REQUIRED';
 END IF;
 IF EXISTS(SELECT 1 FROM hft.stock_command)
    OR EXISTS(SELECT 1 FROM hft.stock_approval)
    OR EXISTS(SELECT 1 FROM hft.stock_hold)
    OR EXISTS(SELECT 1 FROM hft.grn)
    OR EXISTS(SELECT 1 FROM hft.material_issue)
    OR EXISTS(SELECT 1 FROM hft.material_return) THEN
   RAISE EXCEPTION 'HFT_HISTORICAL_RECORDS_REQUIRE_SEPARATE_CUTOVER';
 END IF;
END $preflight$;

-- The SOURCE authorization revision is independent of operational version,
-- which may advance when a legitimate partial posting is completed.
ALTER TABLE hft.grn ADD COLUMN authorization_revision bigint NOT NULL DEFAULT 1
  CHECK (authorization_revision>0);
ALTER TABLE hft.material_issue ADD COLUMN authorization_revision bigint NOT NULL DEFAULT 1
  CHECK (authorization_revision>0);
ALTER TABLE hft.material_return ADD COLUMN authorization_revision bigint NOT NULL DEFAULT 1
  CHECK (authorization_revision>0);

CREATE TABLE hft.posting_scope_policy (
 legal_entity_id text NOT NULL, site_id text NOT NULL, warehouse_id text NOT NULL,
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id)
);
-- Any Hold or actor-grant mutation invalidates approvals issued under the
-- previous policy generation. Existing BEFORE triggers serialize these changes.
CREATE OR REPLACE FUNCTION hft.bump_scope_policy_generation_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_row record;
BEGIN
 IF TG_OP='DELETE' THEN subject_row:=OLD; ELSE subject_row:=NEW; END IF;
 INSERT INTO hft.posting_scope_policy(legal_entity_id,site_id,warehouse_id,generation)
 VALUES(subject_row.legal_entity_id,subject_row.site_id,subject_row.warehouse_id,2)
 ON CONFLICT(legal_entity_id,site_id,warehouse_id)
 DO UPDATE SET generation=hft.posting_scope_policy.generation+1;
 RETURN NULL;
END $$;
CREATE TRIGGER posting_policy_hold_generation_v1
 AFTER INSERT OR UPDATE OR DELETE ON hft.stock_hold
 FOR EACH ROW EXECUTE FUNCTION hft.bump_scope_policy_generation_v1();
CREATE TRIGGER posting_policy_actor_generation_v1
 AFTER INSERT OR UPDATE OR DELETE ON hft.actor_warehouse_grant
 FOR EACH ROW EXECUTE FUNCTION hft.bump_scope_policy_generation_v1();

-- Privileged governance identity, not application runtime, controls these.
CREATE TABLE hft.bound_stock_approval (
 approval_id text NOT NULL,
 approval_revision bigint NOT NULL CHECK(approval_revision>0),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 document_type text NOT NULL CHECK(document_type IN ('GRN','ISSUE','RETURN')),
 command_kind text NOT NULL CHECK(command_kind IN ('RECEIVE','ISSUE','RETURN')),
 source_document_id text NOT NULL,
 source_action_key text NOT NULL,
 document_revision bigint NOT NULL CHECK(document_revision>0),
 item_code text NOT NULL,location_id text NOT NULL,
 batch_no text NOT NULL DEFAULT '',serial_no text NOT NULL DEFAULT '',
 quantity_micro bigint NOT NULL CHECK(quantity_micro>0),
 actor_subject text NOT NULL,approver_subject text NOT NULL,
 prepared_by text NOT NULL,checked_by text NOT NULL,
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 inspection_condition text NOT NULL DEFAULT ''
  CHECK(inspection_condition IN ('','GOOD','DAMAGED','QUARANTINE')),
 inspection_evidence_id text NOT NULL DEFAULT '',
 canonical_sha256 text NOT NULL CHECK(canonical_sha256~'^[0-9a-f]{64}$'),
 approved boolean NOT NULL CHECK(approved=true),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(legal_entity_id,approval_id,approval_revision),
 UNIQUE(legal_entity_id,site_id,warehouse_id,source_document_id,source_action_key,approval_revision),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
  REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
  REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code),
 CHECK(actor_subject<>approver_subject AND
       prepared_by<>checked_by AND prepared_by<>approver_subject AND
       checked_by<>approver_subject),
 CHECK((document_type='GRN' AND command_kind='RECEIVE') OR
       (document_type='ISSUE' AND command_kind='ISSUE') OR
       (document_type='RETURN' AND command_kind='RETURN'))
);
CREATE TRIGGER immutable_bound_stock_approval_v1 BEFORE UPDATE OR DELETE
 ON hft.bound_stock_approval FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

CREATE TABLE hft.bound_approval_revocation (
 legal_entity_id text NOT NULL,approval_id text NOT NULL,approval_revision bigint NOT NULL,
 revoked_by text NOT NULL,reason text NOT NULL CHECK(length(trim(reason))>0),
 revoked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(legal_entity_id,approval_id,approval_revision),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
  REFERENCES hft.bound_stock_approval(legal_entity_id,approval_id,approval_revision)
);
CREATE TRIGGER immutable_bound_approval_revocation_v1 BEFORE UPDATE OR DELETE
 ON hft.bound_approval_revocation FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- DB connection identity MUST be independently mapped to an employee. A
-- caller-supplied actor_subject or SET LOCAL session variable is not identity.
CREATE TABLE hft.posting_database_identity (
 database_login text NOT NULL,
 actor_subject text NOT NULL,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(database_login,legal_entity_id,site_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
  REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id)
);

-- Identical versioned canonical V1 tuple as
-- lib/hft/security/approval-binding.ts::canonicalApprovalText.
CREATE OR REPLACE FUNCTION hft.bound_approval_digest_v1(a hft.bound_stock_approval)
RETURNS text LANGUAGE sql STABLE AS $$
 SELECT encode(sha256(convert_to(array_to_string(ARRAY[
  'HFT_APPROVAL_V1',a.document_type,a.command_kind,a.source_document_id,
  a.document_revision::text,a.source_action_key,a.legal_entity_id,a.site_id,
  a.warehouse_id,a.item_code,a.location_id,a.batch_no,a.serial_no,
  a.quantity_micro::text,a.actor_subject,a.approver_subject,
  a.policy_generation::text,a.inspection_condition,a.inspection_evidence_id
 ],'|'),'UTF8')),'hex')
$$;
CREATE OR REPLACE FUNCTION hft.validate_bound_approval_insert_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE generation_now bigint;
BEGIN
 -- All delimiter-bearing or otherwise noncanonical fields are forbidden.
 IF EXISTS (SELECT 1 FROM unnest(ARRAY[
  NEW.approval_id,NEW.legal_entity_id,NEW.site_id,NEW.warehouse_id,
  NEW.source_document_id,NEW.source_action_key,NEW.item_code,NEW.location_id,
  NEW.actor_subject,NEW.approver_subject,NEW.prepared_by,NEW.checked_by
 ]) AS x(value) WHERE value !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
 OR NEW.batch_no !~ '^[A-Za-z0-9._:-]{0,128}$'
 OR NEW.serial_no !~ '^[A-Za-z0-9._:-]{0,128}$'
 OR NEW.inspection_evidence_id !~ '^[A-Za-z0-9._:-]{0,128}$' THEN
   RAISE EXCEPTION 'NONCANONICAL_APPROVAL_FIELD';
 END IF;
 IF NEW.command_kind='RETURN' AND
    (NEW.inspection_condition='' OR NEW.inspection_evidence_id='') THEN
   RAISE EXCEPTION 'RETURN_INSPECTION_BINDING_REQUIRED';
 END IF;
 SELECT generation INTO generation_now FROM hft.posting_scope_policy
 WHERE legal_entity_id=NEW.legal_entity_id AND site_id=NEW.site_id
 AND warehouse_id=NEW.warehouse_id FOR SHARE;
 IF generation_now IS NULL OR generation_now<>NEW.policy_generation THEN
   RAISE EXCEPTION 'APPROVAL_POLICY_GENERATION_STALE';
 END IF;
 IF NEW.canonical_sha256 <> hft.bound_approval_digest_v1(NEW) THEN
   RAISE EXCEPTION 'APPROVAL_CANONICAL_DIGEST_INVALID';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_bound_approval_v1 BEFORE INSERT ON hft.bound_stock_approval
 FOR EACH ROW EXECUTE FUNCTION hft.validate_bound_approval_insert_v1();

ALTER TABLE hft.stock_command
 ADD COLUMN quantity_micro bigint NOT NULL CHECK(quantity_micro>0),
 ADD COLUMN approved_payload_sha256 text NOT NULL
  CHECK(approved_payload_sha256~'^[0-9a-f]{64}$'),
 ADD COLUMN document_authorization_revision bigint NOT NULL
  CHECK(document_authorization_revision>0),
 ADD COLUMN policy_generation bigint NOT NULL CHECK(policy_generation>0);

-- Source-record modifications require renewed approval, distinct from stock
-- counters updated during legitimate GRN and employee issue posting.
CREATE OR REPLACE FUNCTION hft.bump_header_authorization_revision_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='grn' AND
   (NEW.supplier_id,NEW.invoice_id,NEW.invoice_key,NEW.invoice_date,
    NEW.warehouse_id,NEW.authorized_by,NEW.physical_receipt_id)
   IS DISTINCT FROM
   (OLD.supplier_id,OLD.invoice_id,OLD.invoice_key,OLD.invoice_date,
    OLD.warehouse_id,OLD.authorized_by,OLD.physical_receipt_id)
 THEN NEW.authorization_revision:=OLD.authorization_revision+1;
 ELSIF TG_TABLE_NAME='material_issue' AND
   (NEW.employee_id,NEW.warehouse_id,NEW.purpose,NEW.approved_by)
   IS DISTINCT FROM (OLD.employee_id,OLD.warehouse_id,OLD.purpose,OLD.approved_by)
 THEN NEW.authorization_revision:=OLD.authorization_revision+1;
 ELSIF TG_TABLE_NAME='material_return' AND
   (NEW.issue_id,NEW.condition,NEW.accepted_by,NEW.evidence_reference)
   IS DISTINCT FROM (OLD.issue_id,OLD.condition,OLD.accepted_by,OLD.evidence_reference)
 THEN NEW.authorization_revision:=OLD.authorization_revision+1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grn_auth_revision_v1 BEFORE UPDATE ON hft.grn
 FOR EACH ROW EXECUTE FUNCTION hft.bump_header_authorization_revision_v1();
CREATE TRIGGER issue_auth_revision_v1 BEFORE UPDATE ON hft.material_issue
 FOR EACH ROW EXECUTE FUNCTION hft.bump_header_authorization_revision_v1();
CREATE TRIGGER return_auth_revision_v1 BEFORE UPDATE ON hft.material_return
 FOR EACH ROW EXECUTE FUNCTION hft.bump_header_authorization_revision_v1();

-- Protected line mutation invalidates approval. Ordinary posted counters
-- (accepted_micro/issued_micro/returned_micro) do not invalidate it.
CREATE OR REPLACE FUNCTION hft.bump_line_authorization_revision_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid;
BEGIN
 IF TG_TABLE_NAME='grn_line' THEN
   IF TG_OP='UPDATE' AND
     (NEW.item_code,NEW.ordered_micro,NEW.invoice_id,NEW.invoice_line_id)
     IS NOT DISTINCT FROM
     (OLD.item_code,OLD.ordered_micro,OLD.invoice_id,OLD.invoice_line_id) THEN
       RETURN NULL;
   END IF;
   parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.grn_id ELSE NEW.grn_id END;
   UPDATE hft.grn SET authorization_revision=authorization_revision+1 WHERE id=parent_id;
 ELSIF TG_TABLE_NAME='material_issue_line' THEN
   IF TG_OP='UPDATE' AND
    (NEW.item_code,NEW.location_id,NEW.batch_no,NEW.serial_no,
     NEW.authorized_micro,NEW.source_action_key)
    IS NOT DISTINCT FROM
    (OLD.item_code,OLD.location_id,OLD.batch_no,OLD.serial_no,
     OLD.authorized_micro,OLD.source_action_key) THEN
      RETURN NULL;
   END IF;
   parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.issue_id ELSE NEW.issue_id END;
   UPDATE hft.material_issue SET authorization_revision=authorization_revision+1
    WHERE id=parent_id;
 ELSIF TG_TABLE_NAME='material_return_line' THEN
   IF TG_OP='UPDATE' AND
    (NEW.item_code,NEW.location_id,NEW.batch_no,NEW.serial_no,
     NEW.authorized_micro,NEW.original_issue_command_id,NEW.source_action_key)
    IS NOT DISTINCT FROM
    (OLD.item_code,OLD.location_id,OLD.batch_no,OLD.serial_no,
     OLD.authorized_micro,OLD.original_issue_command_id,OLD.source_action_key) THEN
      RETURN NULL;
   END IF;
   parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.return_id ELSE NEW.return_id END;
   UPDATE hft.material_return SET authorization_revision=authorization_revision+1
    WHERE id=parent_id;
 ELSE
   RAISE EXCEPTION 'UNEXPECTED_AUTH_REVISION_SOURCE';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER grn_line_revision_v1 AFTER INSERT OR UPDATE OR DELETE ON hft.grn_line
 FOR EACH ROW EXECUTE FUNCTION hft.bump_line_authorization_revision_v1();
CREATE TRIGGER issue_line_revision_v1 AFTER INSERT OR UPDATE OR DELETE ON hft.material_issue_line
 FOR EACH ROW EXECUTE FUNCTION hft.bump_line_authorization_revision_v1();
CREATE TRIGGER return_line_revision_v1 AFTER INSERT OR UPDATE OR DELETE ON hft.material_return_line
 FOR EACH ROW EXECUTE FUNCTION hft.bump_line_authorization_revision_v1();

-- Revocation and policy changes must acquire the posting advisory lock from
-- 0004. Do not grant runtime direct DML on these tables.
CREATE OR REPLACE FUNCTION hft.lock_bound_approval_governance_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec record;
BEGIN
 IF TG_TABLE_NAME='bound_approval_revocation' THEN
  SELECT legal_entity_id,site_id,warehouse_id INTO rec
  FROM hft.bound_stock_approval
  WHERE legal_entity_id=NEW.legal_entity_id AND approval_id=NEW.approval_id
  AND approval_revision=NEW.approval_revision;
 ELSE
  rec:=NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'HFT:GATE:'||rec.legal_entity_id||':'||rec.site_id||':'||rec.warehouse_id,0));
 RETURN NEW;
END $$;
CREATE TRIGGER lock_bound_approval_before_v1 BEFORE INSERT ON hft.bound_stock_approval
 FOR EACH ROW EXECUTE FUNCTION hft.lock_bound_approval_governance_v1();
CREATE TRIGGER lock_approval_revocation_before_v1 BEFORE INSERT ON hft.bound_approval_revocation
 FOR EACH ROW EXECUTE FUNCTION hft.lock_bound_approval_governance_v1();

-- Core DB-side authorizer is required even if API already validated it.
-- This does NOT grant any SQL principal permission to insert stock commands.
CREATE OR REPLACE FUNCTION hft.enforce_bound_stock_command_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a hft.bound_stock_approval%ROWTYPE;
 policy_epoch bigint; source_revision bigint; source_approver text;
 source_qty bigint; role_actor text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'HFT:GATE:'||NEW.legal_entity_id||':'||NEW.site_id||':'||NEW.warehouse_id,0));
 SELECT actor_subject INTO role_actor FROM hft.posting_database_identity
 WHERE database_login=session_user AND active=true AND
 legal_entity_id=NEW.legal_entity_id AND site_id=NEW.site_id
 AND warehouse_id=NEW.warehouse_id FOR SHARE;
 IF role_actor IS NULL OR role_actor<>NEW.actor_subject THEN
   RAISE EXCEPTION 'DATABASE_LOGIN_ACTOR_NOT_AUTHENTICATED';
 END IF;
 PERFORM 1 FROM hft.actor_warehouse_grant
 WHERE legal_entity_id=NEW.legal_entity_id AND site_id=NEW.site_id
 AND warehouse_id=NEW.warehouse_id AND actor_subject=NEW.actor_subject
 AND active=true AND may_post=true FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DATABASE_ACTOR_GRANT_DENIED'; END IF;
 SELECT generation INTO policy_epoch FROM hft.posting_scope_policy
 WHERE legal_entity_id=NEW.legal_entity_id AND site_id=NEW.site_id
 AND warehouse_id=NEW.warehouse_id FOR SHARE;
 IF policy_epoch IS NULL OR policy_epoch<>NEW.policy_generation THEN
   RAISE EXCEPTION 'DATABASE_POLICY_GENERATION_STALE';
 END IF;
 PERFORM 1 FROM hft.stock_hold
 WHERE legal_entity_id=NEW.legal_entity_id AND site_id=NEW.site_id
 AND warehouse_id=NEW.warehouse_id AND active=true
 AND (item_code IS NULL OR item_code=NEW.item_code)
 AND (source_document_id IS NULL OR source_document_id=NEW.source_document_id)
 FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'DATABASE_BLOCKING_HOLD'; END IF;
 SELECT * INTO a FROM hft.bound_stock_approval
 WHERE legal_entity_id=NEW.legal_entity_id AND approval_id=NEW.approval_id
 AND approval_revision=NEW.approval_revision FOR SHARE;
 IF a.approval_id IS NULL OR NOT a.approved OR
  EXISTS(SELECT 1 FROM hft.bound_approval_revocation
   WHERE legal_entity_id=a.legal_entity_id AND approval_id=a.approval_id
   AND approval_revision=a.approval_revision) OR
  a.canonical_sha256<>hft.bound_approval_digest_v1(a) OR
  NEW.approved_payload_sha256<>a.canonical_sha256 OR
  a.command_kind<>NEW.kind OR a.source_document_id<>NEW.source_document_id OR
  a.source_action_key<>NEW.source_action_key OR
  a.legal_entity_id<>NEW.legal_entity_id OR a.site_id<>NEW.site_id OR
  a.warehouse_id<>NEW.warehouse_id OR a.item_code<>NEW.item_code OR
  a.location_id<>NEW.location_id OR a.batch_no<>NEW.batch_no OR
  a.serial_no<>NEW.serial_no OR a.actor_subject<>NEW.actor_subject OR
  a.quantity_micro<>NEW.quantity_micro OR
  a.policy_generation<>NEW.policy_generation OR
  a.document_revision<>NEW.document_authorization_revision THEN
    RAISE EXCEPTION 'DATABASE_EXACT_BOUND_APPROVAL_REQUIRED';
 END IF;
 IF NEW.kind='RECEIVE' THEN
   SELECT g.authorization_revision,g.authorized_by,r.accepted_micro
   INTO source_revision,source_approver,source_qty
   FROM hft.grn g JOIN hft.grn_partial_receipt r ON r.grn_id=g.id
   WHERE g.id::text=NEW.source_document_id AND r.id=NEW.source_receipt_id
   AND g.status IN ('AUTHORIZED','PARTIALLY_RECEIVED') AND r.qc_state='ACCEPTED'
   FOR SHARE OF g,r;
 ELSIF NEW.kind='ISSUE' THEN
   SELECT i.authorization_revision,i.approved_by,l.authorized_micro
   INTO source_revision,source_approver,source_qty
   FROM hft.material_issue i JOIN hft.material_issue_line l ON l.issue_id=i.id
   WHERE i.id::text=NEW.source_document_id AND l.source_action_key=NEW.source_action_key
   AND i.status IN ('AUTHORIZED','ISSUED') FOR SHARE OF i,l;
 ELSIF NEW.kind='RETURN' THEN
   SELECT m.authorization_revision,m.accepted_by,l.authorized_micro
   INTO source_revision,source_approver,source_qty
   FROM hft.material_return m JOIN hft.material_return_line l ON l.return_id=m.id
   WHERE m.id::text=NEW.source_document_id AND l.source_action_key=NEW.source_action_key
   AND m.status IN ('AUTHORIZED','RETURNED') FOR SHARE OF m,l;
 ELSE RAISE EXCEPTION 'UNQUALIFIED_POSTING_KIND'; END IF;
 IF source_revision IS NULL OR source_revision<>a.document_revision OR
    source_approver IS DISTINCT FROM a.approver_subject OR
    source_qty IS NULL OR source_qty<NEW.quantity_micro OR
    a.approver_subject=NEW.actor_subject THEN
   RAISE EXCEPTION 'DATABASE_SOURCE_REVISION_OR_QUANTITY_CHANGED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_command_bound_approval_v1
 BEFORE INSERT ON hft.stock_command FOR EACH ROW
 EXECUTE FUNCTION hft.enforce_bound_stock_command_v1();

-- REVOKE privilege by default. No production-grade posting function exists,
-- so hft_app_runtime must have ZERO direct stock command/entry write grants.
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA hft REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
