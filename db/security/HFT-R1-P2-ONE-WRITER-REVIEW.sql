-- HFT R1 P2 ONE PROTECTED WRITER: SOURCE REVIEW CANDIDATE, NOT EXECUTABLE.
-- NO DATABASE EXECUTION AUTHORIZED; DO NOT COPY TO db/migrations/ UNTIL
-- Chat 10/17/11 review, role/key custody acceptance and manifest sign-off.
-- This proposes a *single* SECURITY DEFINER app posting entry point.
-- Requires approved role provisioning, pgcrypto in trusted hft_crypto schema,
-- source migration 0001-0006, and a separately authorized release migration.
BEGIN;
DO $preflight$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user <> 'hft_engineering'
 OR current_setting('server_version_num')::integer < 150000
 OR NOT EXISTS (SELECT 1 FROM hft.schema_revision WHERE version=6
     AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_posting_owner'
     AND NOT rolsuper AND NOT rolcanlogin AND NOT rolcreaterole AND NOT rolcreatedb)
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_app_runtime'
     AND NOT rolsuper AND NOT rolcanlogin AND NOT rolcreaterole AND NOT rolcreatedb)
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hft_r1_audit_verify'
     AND NOT rolsuper AND NOT rolcanlogin AND NOT rolcreaterole AND NOT rolcreatedb)
 OR NOT pg_has_role(current_user,'hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_app_runtime','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_app_runtime','hft_engineering','MEMBER')
 OR NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n
      ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname='hft_crypto')
 THEN RAISE EXCEPTION 'P2_APPROVED_ROLE_PGCRYPTO_AND_V6_PREREQUISITES_REQUIRED'; END IF;
END $preflight$;
-- P2-QA-007: refuse historic ISSUE/RETURN commands before fragment ALTER.
DO $legacy_fragments$ BEGIN
 IF EXISTS(SELECT 1 FROM hft.stock_command WHERE kind IN ('ISSUE','RETURN'))
 THEN RAISE EXCEPTION 'P2_HISTORICAL_ISSUE_RETURN_FRAGMENT_CUTOVER_REQUIRED'; END IF;
END $legacy_fragments$;

-- Global FUNCTION defaults are essential. Per-schema REVOKE does NOT cancel
-- PostgreSQL's global PUBLIC EXECUTE defaults. These act for the real creators.
ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_r1_posting_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering IN SCHEMA hft
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE hft_r1_posting_owner IN SCHEMA hft
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON SCHEMA hft FROM PUBLIC;
REVOKE CREATE ON SCHEMA hft FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime;
REVOKE EXECUTE ON FUNCTION hft.seal_stock_command_v1(uuid)
 FROM PUBLIC,hft_r1_app_runtime;
REVOKE EXECUTE ON FUNCTION hft.lock_seal_posting_dependencies_v2(uuid)
 FROM PUBLIC,hft_r1_app_runtime;
REVOKE EXECUTE ON FUNCTION hft.assert_command_seal_v1(uuid)
 FROM PUBLIC,hft_r1_app_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- No application or auditor USAGE on hft_secret or its contents.
CREATE SCHEMA hft_secret AUTHORIZATION hft_r1_posting_owner;
GRANT USAGE,CREATE ON SCHEMA hft_secret TO hft_engineering;
REVOKE ALL ON SCHEMA hft_secret FROM PUBLIC,hft_r1_app_runtime,hft_r1_audit_verify;
-- Keys are provisioned under a separately approved DBA/key-custody operation.
-- This migration must not create, generate or contain real key material.
CREATE TABLE hft_secret.invocation_key (
 key_version integer PRIMARY KEY CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,
 not_after timestamptz NOT NULL,
 revoked_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(not_before<not_after)
);
ALTER TABLE hft_secret.invocation_key OWNER TO hft_r1_posting_owner;
REVOKE CREATE ON SCHEMA hft_secret FROM hft_engineering;
REVOKE ALL ON hft_secret.invocation_key FROM PUBLIC,hft_r1_app_runtime,hft_r1_audit_verify;

CREATE TABLE hft.posting_session (
 session_id text NOT NULL,actor_subject text NOT NULL,
 expires_at timestamptz NOT NULL,revoked_at timestamptz,
 PRIMARY KEY(session_id),
 UNIQUE(session_id,actor_subject),
 CHECK(length(session_id)>0 AND length(actor_subject)>0)
);
CREATE TABLE hft.posting_policy_epoch (
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 generation bigint NOT NULL CHECK(generation>0),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id)
);
-- P2-QA-006: audited bootstrap of every preexisting warehouse scope,
-- including scopes with existing actor grants or Holds. This is an observed
-- initial snapshot, not authorization of any individual decision.
CREATE TABLE hft.posting_policy_bootstrap (
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 initial_generation bigint NOT NULL CHECK(initial_generation=1),
 existing_actor_grants bigint NOT NULL CHECK(existing_actor_grants>=0),
 existing_holds bigint NOT NULL CHECK(existing_holds>=0),
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 recorded_by text NOT NULL DEFAULT pg_catalog.session_user,
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id)
 REFERENCES hft.posting_policy_epoch(legal_entity_id,site_id,warehouse_id)
);
CREATE TRIGGER p2_immutable_policy_bootstrap BEFORE UPDATE OR DELETE
 ON hft.posting_policy_bootstrap FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();
INSERT INTO hft.posting_policy_epoch(legal_entity_id,site_id,warehouse_id,generation)
 SELECT w.legal_entity_id,w.site_id,w.warehouse_id,1
 FROM hft.warehouse AS w ORDER BY w.legal_entity_id,w.site_id,w.warehouse_id;
INSERT INTO hft.posting_policy_bootstrap(legal_entity_id,site_id,warehouse_id,
 initial_generation,existing_actor_grants,existing_holds)
 SELECT w.legal_entity_id,w.site_id,w.warehouse_id,1,
 (SELECT pg_catalog.count(*) FROM hft.actor_warehouse_grant AS ag
  WHERE ag.legal_entity_id=w.legal_entity_id AND ag.site_id=w.site_id
    AND ag.warehouse_id=w.warehouse_id),
 (SELECT pg_catalog.count(*) FROM hft.stock_hold AS hh
  WHERE hh.legal_entity_id=w.legal_entity_id AND hh.site_id=w.site_id
    AND hh.warehouse_id=w.warehouse_id)
 FROM hft.warehouse AS w ORDER BY w.legal_entity_id,w.site_id,w.warehouse_id;
-- New warehouse scopes bootstrap once; no missing default policy generation.
CREATE OR REPLACE FUNCTION hft.p2_bootstrap_new_warehouse_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 INSERT INTO hft.posting_policy_epoch(legal_entity_id,site_id,warehouse_id,generation)
 VALUES(NEW.legal_entity_id,NEW.site_id,NEW.warehouse_id,1);
 INSERT INTO hft.posting_policy_bootstrap(legal_entity_id,site_id,warehouse_id,
 initial_generation,existing_actor_grants,existing_holds)
 VALUES(NEW.legal_entity_id,NEW.site_id,NEW.warehouse_id,1,0,0);
 RETURN NULL;
END $$;
CREATE TRIGGER p2_new_warehouse_epoch AFTER INSERT ON hft.warehouse
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bootstrap_new_warehouse_v1();
CREATE TABLE hft.protected_stock_approval (
 legal_entity_id text NOT NULL,approval_id text NOT NULL,
 approval_revision bigint NOT NULL CHECK(approval_revision>0),
 approved boolean NOT NULL CHECK(approved=true),
 kind text NOT NULL CHECK(kind IN ('RECEIVE','ISSUE','RETURN')),
 document_id text NOT NULL,source_action_key text NOT NULL,
 fragment_id text NOT NULL DEFAULT '',document_revision bigint NOT NULL CHECK(document_revision>0),
 site_id text NOT NULL,warehouse_id text NOT NULL,item_code text NOT NULL,
 location_id text NOT NULL,batch_no text NOT NULL DEFAULT '',serial_no text NOT NULL DEFAULT '',
 employee_id text NOT NULL DEFAULT '',original_issue_id text NOT NULL DEFAULT '',
 quantity_micro bigint NOT NULL CHECK(quantity_micro>0),
 actor_subject text NOT NULL,approver_subject text NOT NULL,
 prepared_by text NOT NULL,checked_by text NOT NULL,
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 condition text NOT NULL CHECK(condition IN ('GOOD','DAMAGED','QUARANTINE')),
 inspection_evidence_id text NOT NULL DEFAULT '',
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 approved_scope_sha256 text NOT NULL CHECK(approved_scope_sha256 ~ '^[0-9a-f]{64}$'),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 policy_revision bigint NOT NULL CHECK(policy_revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(legal_entity_id,approval_id,approval_revision),
 UNIQUE(legal_entity_id,document_id,source_action_key,fragment_id,approval_revision),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code),
 CHECK(actor_subject<>approver_subject AND valid_from<valid_until)
);
CREATE TRIGGER immutable_protected_stock_approval BEFORE UPDATE OR DELETE
 ON hft.protected_stock_approval FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();

-- P2-G11: provenance requires stable PERSON identity, not distinct usernames.
-- All enrollment and policy rows are independently governed. No records
-- or real people are provisioned by this source migration.
CREATE TABLE hft.approval_human (
 legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
 person_id text NOT NULL,identity_evidence_sha256 text NOT NULL
   CHECK(identity_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_by text NOT NULL,valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,revoked_at timestamptz,
 PRIMARY KEY(legal_entity_id,person_id),
 CHECK(valid_from<valid_until)
);
CREATE TABLE hft.approval_human_login (
 legal_entity_id text NOT NULL,actor_subject text NOT NULL,person_id text NOT NULL,
 PRIMARY KEY(legal_entity_id,actor_subject),
 FOREIGN KEY(legal_entity_id,person_id) REFERENCES hft.approval_human(legal_entity_id,person_id)
);
CREATE TABLE hft.approval_role_qualification (
 legal_entity_id text NOT NULL,person_id text NOT NULL,
 action_kind text NOT NULL CHECK(action_kind IN ('RECEIVE','ISSUE','RETURN')),
 duty text NOT NULL CHECK(duty IN ('PREPARER','CHECKER','APPROVER','INSPECTOR')),
 qualified_from timestamptz NOT NULL,qualified_until timestamptz NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(legal_entity_id,person_id,action_kind,duty),
 FOREIGN KEY(legal_entity_id,person_id) REFERENCES hft.approval_human(legal_entity_id,person_id),
 CHECK(qualified_from<qualified_until)
);
CREATE TABLE hft.posting_action_policy (
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 action_kind text NOT NULL CHECK(action_kind IN ('RECEIVE','ISSUE','RETURN')),
 policy_revision bigint NOT NULL CHECK(policy_revision>0),
 require_checker boolean NOT NULL,require_independent_approver boolean NOT NULL,
 require_inspector boolean NOT NULL,require_preparer boolean NOT NULL,
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 decision_evidence_sha256 text NOT NULL CHECK(decision_evidence_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,action_kind,policy_revision),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 CHECK(valid_from<valid_until)
);
-- Entirely append-only: prospective new revisions supersede previous rules.
CREATE TABLE hft.protected_approval_decision (
 legal_entity_id text NOT NULL,approval_id text NOT NULL,approval_revision bigint NOT NULL,
 policy_revision bigint NOT NULL,source_revision bigint NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 prepared_subject text,prepared_session_id text,
 checked_subject text,checked_session_id text,
 approver_subject text NOT NULL,approver_session_id text NOT NULL,
 inspector_subject text,inspector_session_id text,
 inspection_evidence_id text NOT NULL DEFAULT '',
 decision_evidence_sha256 text NOT NULL CHECK(decision_evidence_sha256~'^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,approval_id,approval_revision),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision)
 DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE hft.protected_approval_supersession (
 legal_entity_id text NOT NULL,approval_id text NOT NULL,approval_revision bigint NOT NULL,
 superseded_by text NOT NULL,reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,approval_id,approval_revision),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision)
);
CREATE TABLE hft.return_inspection_attestation (
 legal_entity_id text NOT NULL,return_document_id text NOT NULL,evidence_id text NOT NULL,
 inspector_subject text NOT NULL,inspector_session_id text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 inspected_at timestamptz NOT NULL,
 PRIMARY KEY(legal_entity_id,return_document_id,evidence_id)
);
-- Physical Stores release creates ACK_PENDING, never an invented employee ACK.
CREATE TABLE hft.custody_ack_pending (
 issue_command_uuid uuid PRIMARY KEY REFERENCES hft.stock_command(id),
 legal_entity_id text NOT NULL,employee_id text NOT NULL,
 posted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
CREATE TABLE hft.custody_employee_ack_event (
 issue_command_uuid uuid PRIMARY KEY REFERENCES hft.custody_ack_pending(issue_command_uuid),
 actor_subject text NOT NULL,session_id text NOT NULL,
 acknowledgement text NOT NULL CHECK(acknowledgement IN ('ACKNOWLEDGED','DISPUTED')),
 signed_evidence_sha256 text NOT NULL CHECK(signed_evidence_sha256~'^[0-9a-f]{64}$'),
 acknowledged_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE VIEW hft.custody_ack_status_v1 AS
 SELECT p.issue_command_uuid,p.legal_entity_id,p.employee_id,
 COALESCE(a.acknowledgement,'ACK_PENDING') AS state,
 a.signed_evidence_sha256,a.acknowledged_at
 FROM hft.custody_ack_pending AS p LEFT JOIN hft.custody_employee_ack_event AS a
 ON a.issue_command_uuid=p.issue_command_uuid;
-- An independently governed parent Hold may block every warehouse in an
-- entity or site; no null/empty warehouse workaround in legacy stock_hold.
CREATE TABLE hft.posting_parent_hold (
 legal_entity_id text NOT NULL REFERENCES hft.legal_entity(id),
 hold_id text NOT NULL,scope_kind text NOT NULL CHECK(scope_kind IN ('ENTITY','SITE')),
 site_id text,active boolean NOT NULL DEFAULT true,
 reason text NOT NULL CHECK(length(pg_catalog.btrim(reason))>0),
 placed_by text NOT NULL,placed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 expires_at timestamptz,
 PRIMARY KEY(legal_entity_id,hold_id),
 FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
 CHECK((scope_kind='ENTITY' AND site_id IS NULL) OR
       (scope_kind='SITE' AND site_id IS NOT NULL))
);
-- Provenance is immutable; revocation/supersession are append-only decisions.
DO $immutable_governance$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['approval_human','approval_human_login',
  'approval_role_qualification','posting_action_policy',
  'protected_approval_decision','protected_approval_supersession',
  'return_inspection_attestation','custody_ack_pending','custody_employee_ack_event']
 LOOP
  EXECUTE pg_catalog.format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON hft.%I FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation()',
    'immutable_'||tab||'_v1',tab);
 END LOOP;
END $immutable_governance$;


-- Parent Hold lifecycle is append-only. Cancellation/clearance is a separate
-- governed fact, never a silent UPDATE of the original block.
CREATE TABLE hft.posting_parent_hold_clearance (
 legal_entity_id text NOT NULL,hold_id text NOT NULL,
 cleared_by text NOT NULL,clearance_evidence_sha256 text NOT NULL
 CHECK(clearance_evidence_sha256~'^[0-9a-f]{64}$'),
 cleared_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,hold_id),
 FOREIGN KEY(legal_entity_id,hold_id)
 REFERENCES hft.posting_parent_hold(legal_entity_id,hold_id)
);
CREATE TRIGGER p2_parent_hold_immutable BEFORE UPDATE OR DELETE
 ON hft.posting_parent_hold FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER p2_parent_hold_clearance_immutable BEFORE UPDATE OR DELETE
 ON hft.posting_parent_hold_clearance FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();

CREATE TABLE hft.protected_approval_revocation (
 legal_entity_id text NOT NULL,approval_id text NOT NULL,approval_revision bigint NOT NULL,
 revoked_by text NOT NULL,reason text NOT NULL,revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(legal_entity_id,approval_id,approval_revision),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision)
);
CREATE TRIGGER immutable_protected_approval_revocation BEFORE UPDATE OR DELETE
 ON hft.protected_approval_revocation FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- Admission is CLOSED unless independently governed human IDs, signing-session
-- custody, source role evidence and per-action policy have been enrolled.
CREATE OR REPLACE FUNCTION hft.p2_qualified_human_v1(
 p_entity text,p_subject text,p_session text,p_kind text,p_duty text,p_at timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $qual$
DECLARE v_id text;
BEGIN
 SELECT human.person_id INTO v_id
 FROM hft.approval_human_login AS login
 JOIN hft.approval_human AS human ON human.legal_entity_id=login.legal_entity_id
 AND human.person_id=login.person_id
 JOIN hft.approval_role_qualification AS q ON q.legal_entity_id=human.legal_entity_id
 AND q.person_id=human.person_id AND q.action_kind=p_kind AND q.duty=p_duty
 JOIN hft.posting_session AS sess ON sess.session_id=p_session
 AND sess.actor_subject=login.actor_subject
 WHERE login.legal_entity_id=p_entity AND login.actor_subject=p_subject
 AND human.revoked_at IS NULL AND human.valid_from<=p_at AND human.valid_until>p_at
 AND q.qualified_from<=p_at AND q.qualified_until>p_at
 AND sess.revoked_at IS NULL AND sess.expires_at>p_at;
 IF v_id IS NULL THEN RAISE EXCEPTION 'P2_UNQUALIFIED_HUMAN_OR_SESSION:%',p_duty; END IF;
 RETURN v_id;
END $qual$;

CREATE OR REPLACE FUNCTION hft.p2_assert_governed_approval_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $gov$
DECLARE
 d hft.protected_approval_decision%ROWTYPE;
 pol hft.posting_action_policy%ROWTYPE;
 v_rev bigint; v_maker text:='';v_checker text:='';v_approver text;v_evidence text:='';
 maker_person text;checker_person text;approver_person text;inspector_person text;actor_person text;
BEGIN
 SELECT * INTO d FROM hft.protected_approval_decision
 WHERE legal_entity_id=NEW.legal_entity_id AND approval_id=NEW.approval_id
 AND approval_revision=NEW.approval_revision FOR SHARE;
 IF d.approval_id IS NULL OR d.policy_revision<>NEW.policy_revision
 OR d.source_revision<>NEW.document_revision
 OR d.payload_sha256<>NEW.payload_sha256
 OR d.approver_subject<>NEW.approver_subject
 OR d.inspection_evidence_id<>NEW.inspection_evidence_id
 THEN RAISE EXCEPTION 'P2_GOVERNED_APPROVAL_DECISION_MISSING_OR_FORGED'; END IF;
 SELECT * INTO pol FROM hft.posting_action_policy AS x
 WHERE x.legal_entity_id=NEW.legal_entity_id AND x.site_id=NEW.site_id
 AND x.warehouse_id=NEW.warehouse_id AND x.action_kind=NEW.kind
 ORDER BY x.policy_revision DESC LIMIT 1 FOR SHARE;
 IF pol.policy_revision IS NULL OR pol.policy_revision<>NEW.policy_revision
 OR d.recorded_at<pol.valid_from OR d.recorded_at>=pol.valid_until
 OR d.recorded_at<NEW.valid_from OR d.recorded_at>=NEW.valid_until
 OR NEW.valid_until>pol.valid_until THEN
   RAISE EXCEPTION 'P2_ACTION_POLICY_MISSING_OR_EXPIRED'; END IF;
 IF NEW.kind='RECEIVE' THEN
   SELECT g.authorization_revision,g.prepared_by,g.checked_by,g.authorized_by
   INTO v_rev,v_maker,v_checker,v_approver
   FROM hft.grn AS g WHERE g.id::text=NEW.document_id
   AND g.legal_entity_id=NEW.legal_entity_id
   AND g.warehouse_id=NEW.warehouse_id
   AND g.status IN ('AUTHORIZED','PARTIALLY_RECEIVED') FOR SHARE;
 ELSIF NEW.kind='ISSUE' THEN
   SELECT i.authorization_revision,i.prepared_by,i.approved_by
   INTO v_rev,v_maker,v_approver
   FROM hft.material_issue AS i WHERE i.id::text=NEW.document_id
   AND i.legal_entity_id=NEW.legal_entity_id AND i.warehouse_id=NEW.warehouse_id
   AND i.status IN ('AUTHORIZED','ISSUED') FOR SHARE;
 ELSIF NEW.kind='RETURN' THEN
   SELECT mr.authorization_revision,mr.accepted_by,mr.evidence_reference
   INTO v_rev,v_approver,v_evidence
   FROM hft.material_return AS mr WHERE mr.id::text=NEW.document_id
   AND mr.legal_entity_id=NEW.legal_entity_id AND mr.warehouse_id=NEW.warehouse_id
   AND mr.status IN ('AUTHORIZED','RETURNED') FOR SHARE;
 ELSE RAISE EXCEPTION 'P2_UNKNOWN_APPROVAL_ACTION'; END IF;
 IF v_rev IS NULL OR v_rev<>NEW.document_revision
 OR v_approver IS DISTINCT FROM NEW.approver_subject
 OR pg_catalog.coalesce(v_maker,'')<>NEW.prepared_by
 OR pg_catalog.coalesce(v_checker,'')<>NEW.checked_by
 OR d.prepared_subject IS DISTINCT FROM pg_catalog.nullif(NEW.prepared_by,'')
 OR d.checked_subject IS DISTINCT FROM pg_catalog.nullif(NEW.checked_by,'')
 THEN RAISE EXCEPTION 'P2_APPROVAL_SOURCE_ROLE_OR_REVISION_MISMATCH'; END IF;
 IF (pol.require_preparer AND (d.prepared_subject IS NULL OR d.prepared_session_id IS NULL))
 OR (pol.require_checker AND (d.checked_subject IS NULL OR d.checked_session_id IS NULL))
 OR (pol.require_inspector AND (d.inspector_subject IS NULL OR d.inspector_session_id IS NULL))
 THEN RAISE EXCEPTION 'P2_MANDATORY_HUMAN_DUTY_ABSENT'; END IF;
 IF d.prepared_subject IS NOT NULL THEN
 maker_person:=hft.p2_qualified_human_v1(NEW.legal_entity_id,
 d.prepared_subject,d.prepared_session_id,NEW.kind,'PREPARER',d.recorded_at); END IF;
 IF d.checked_subject IS NOT NULL THEN
 checker_person:=hft.p2_qualified_human_v1(NEW.legal_entity_id,
 d.checked_subject,d.checked_session_id,NEW.kind,'CHECKER',d.recorded_at); END IF;
 approver_person:=hft.p2_qualified_human_v1(NEW.legal_entity_id,
 d.approver_subject,d.approver_session_id,NEW.kind,'APPROVER',d.recorded_at);
 IF d.inspector_subject IS NOT NULL THEN
 inspector_person:=hft.p2_qualified_human_v1(NEW.legal_entity_id,
 d.inspector_subject,d.inspector_session_id,NEW.kind,'INSPECTOR',d.recorded_at); END IF;
 SELECT login.person_id INTO actor_person FROM hft.approval_human_login AS login
 WHERE login.legal_entity_id=NEW.legal_entity_id
 AND login.actor_subject=NEW.actor_subject;
 IF actor_person IS NULL THEN RAISE EXCEPTION 'P2_ACTOR_HUMAN_NOT_REGISTERED'; END IF;
 IF pol.require_checker AND maker_person=checker_person THEN
   RAISE EXCEPTION 'P2_CHECKER_HUMAN_NOT_INDEPENDENT'; END IF;
 IF pol.require_independent_approver AND
 (approver_person=actor_person OR approver_person=maker_person
 OR approver_person=checker_person) THEN
   RAISE EXCEPTION 'P2_APPROVER_HUMAN_NOT_INDEPENDENT'; END IF;
 IF NEW.kind='RETURN' AND (
 NEW.inspection_evidence_id='' OR v_evidence<>NEW.inspection_evidence_id
 OR d.inspection_evidence_id<>NEW.inspection_evidence_id OR
 inspector_person IS NULL OR NOT EXISTS (
 SELECT 1 FROM hft.return_inspection_attestation AS att
 WHERE att.legal_entity_id=NEW.legal_entity_id
 AND att.return_document_id=NEW.document_id
 AND att.evidence_id=NEW.inspection_evidence_id
 AND att.inspector_subject=d.inspector_subject
 AND att.inspector_session_id=d.inspector_session_id)
 ) THEN RAISE EXCEPTION 'P2_RETURN_INSPECTION_AUTHORITY_INVALID'; END IF;
 RETURN NULL;
END $gov$;
CREATE CONSTRAINT TRIGGER p2_requires_governed_approval
 AFTER INSERT ON hft.protected_stock_approval
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION hft.p2_assert_governed_approval_v1();
-- Real approval issuance requires separately qualified governance service
-- authentication and decision signatures. No runtime INSERT privilege here.

CREATE TABLE hft.posting_invocation_nonce (
 key_version integer NOT NULL,nonce text NOT NULL,
 actor_subject text NOT NULL,session_id text NOT NULL,
 command_id text NOT NULL,payload_sha256 text NOT NULL,
 expires_at timestamptz NOT NULL,used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(key_version,nonce),
 CHECK(nonce ~ '^[0-9a-f]{48}$')
);
CREATE TRIGGER immutable_posting_invocation_nonce BEFORE UPDATE OR DELETE
 ON hft.posting_invocation_nonce FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TABLE hft.posting_fragment (
 legal_entity_id text NOT NULL,fragment_id text NOT NULL,kind text NOT NULL
 CHECK(kind IN ('ISSUE','RETURN')),
 document_id text NOT NULL,source_action_key text NOT NULL,
 command_uuid uuid NOT NULL UNIQUE REFERENCES hft.stock_command(id),
 quantity_micro bigint NOT NULL CHECK(quantity_micro>0),
 employee_id text NOT NULL,original_issue_id text NOT NULL DEFAULT '',
 PRIMARY KEY(legal_entity_id,fragment_id),
 UNIQUE(legal_entity_id,document_id,source_action_key,fragment_id),
 FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
CREATE TRIGGER immutable_posting_fragment BEFORE UPDATE OR DELETE
 ON hft.posting_fragment FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();

-- Freeze authorization revision separately from operational posting counters.
ALTER TABLE hft.grn ADD COLUMN authorization_revision bigint NOT NULL DEFAULT 1 CHECK(authorization_revision>0);
ALTER TABLE hft.material_issue ADD COLUMN authorization_revision bigint NOT NULL DEFAULT 1 CHECK(authorization_revision>0);
ALTER TABLE hft.material_return ADD COLUMN authorization_revision bigint NOT NULL DEFAULT 1 CHECK(authorization_revision>0);
-- Protected header edits increment revision; operational status/counters do not.
CREATE OR REPLACE FUNCTION hft.p2_bump_source_revision_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
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
   IS DISTINCT FROM
   (OLD.employee_id,OLD.warehouse_id,OLD.purpose,OLD.approved_by)
 THEN NEW.authorization_revision:=OLD.authorization_revision+1;
 ELSIF TG_TABLE_NAME='material_return' AND
   (NEW.issue_id,NEW.condition,NEW.accepted_by,NEW.evidence_reference)
   IS DISTINCT FROM
   (OLD.issue_id,OLD.condition,OLD.accepted_by,OLD.evidence_reference)
 THEN NEW.authorization_revision:=OLD.authorization_revision+1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p2_grn_revision BEFORE UPDATE ON hft.grn FOR EACH ROW
 EXECUTE FUNCTION hft.p2_bump_source_revision_v1();
CREATE TRIGGER p2_issue_revision BEFORE UPDATE ON hft.material_issue FOR EACH ROW
 EXECUTE FUNCTION hft.p2_bump_source_revision_v1();
CREATE TRIGGER p2_return_revision BEFORE UPDATE ON hft.material_return FOR EACH ROW
 EXECUTE FUNCTION hft.p2_bump_source_revision_v1();
CREATE OR REPLACE FUNCTION hft.p2_bump_line_revision_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE parent_id uuid;
BEGIN
 IF TG_TABLE_NAME='grn_line' THEN
   IF TG_OP='UPDATE' AND (NEW.item_code,NEW.ordered_micro,NEW.invoice_id,NEW.invoice_line_id)
      IS NOT DISTINCT FROM (OLD.item_code,OLD.ordered_micro,OLD.invoice_id,OLD.invoice_line_id)
   THEN RETURN NULL; END IF;
   parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.grn_id ELSE NEW.grn_id END;
   UPDATE hft.grn SET authorization_revision=authorization_revision+1 WHERE id=parent_id;
 ELSIF TG_TABLE_NAME='material_issue_line' THEN
   IF TG_OP='UPDATE' AND
      (NEW.item_code,NEW.location_id,NEW.batch_no,NEW.serial_no,NEW.authorized_micro,NEW.source_action_key)
      IS NOT DISTINCT FROM
      (OLD.item_code,OLD.location_id,OLD.batch_no,OLD.serial_no,OLD.authorized_micro,OLD.source_action_key)
   THEN RETURN NULL; END IF;
   parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.issue_id ELSE NEW.issue_id END;
   UPDATE hft.material_issue SET authorization_revision=authorization_revision+1 WHERE id=parent_id;
 ELSIF TG_TABLE_NAME='material_return_line' THEN
   IF TG_OP='UPDATE' AND
      (NEW.item_code,NEW.location_id,NEW.batch_no,NEW.serial_no,NEW.authorized_micro,
       NEW.original_issue_command_id,NEW.source_action_key)
      IS NOT DISTINCT FROM
      (OLD.item_code,OLD.location_id,OLD.batch_no,OLD.serial_no,OLD.authorized_micro,
       OLD.original_issue_command_id,OLD.source_action_key)
   THEN RETURN NULL; END IF;
   parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.return_id ELSE NEW.return_id END;
   UPDATE hft.material_return SET authorization_revision=authorization_revision+1 WHERE id=parent_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER p2_grn_line_revision AFTER INSERT OR UPDATE OR DELETE ON hft.grn_line
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_line_revision_v1();
-- Legitimate unposted receipt changes are allowed by P1, but invalidate any
-- old authorization; posted receipts remain immutable through P1's trigger.
CREATE OR REPLACE FUNCTION hft.p2_bump_unposted_receipt_revision_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE source_grn uuid;
BEGIN
 IF TG_OP='UPDATE' AND
   (NEW.receipt_key,NEW.line_no,NEW.accepted_micro,NEW.qc_state,
    NEW.evidence_reference,NEW.location_id,NEW.batch_no,NEW.serial_no)
   IS NOT DISTINCT FROM
   (OLD.receipt_key,OLD.line_no,OLD.accepted_micro,OLD.qc_state,
    OLD.evidence_reference,OLD.location_id,OLD.batch_no,OLD.serial_no)
 THEN RETURN NULL; END IF;
 source_grn:=CASE WHEN TG_OP='DELETE' THEN OLD.grn_id ELSE NEW.grn_id END;
 UPDATE hft.grn SET authorization_revision=authorization_revision+1
 WHERE id=source_grn;
 RETURN NULL;
END $$;
CREATE TRIGGER p2_grn_receipt_revision AFTER INSERT OR UPDATE OR DELETE
 ON hft.grn_partial_receipt FOR EACH ROW
 EXECUTE FUNCTION hft.p2_bump_unposted_receipt_revision_v1();
CREATE TRIGGER p2_issue_line_revision AFTER INSERT OR UPDATE OR DELETE ON hft.material_issue_line
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_line_revision_v1();
CREATE TRIGGER p2_return_line_revision AFTER INSERT OR UPDATE OR DELETE ON hft.material_return_line
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_line_revision_v1();
-- Enforce global Hold/grant generation under existing 0004 scope advisory lock.
CREATE OR REPLACE FUNCTION hft.p2_bump_scope_epoch_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE v record;
BEGIN
 IF TG_OP='DELETE' THEN v:=OLD; ELSE v:=NEW; END IF;
 UPDATE hft.posting_policy_epoch SET generation=generation+1
 WHERE legal_entity_id=v.legal_entity_id AND site_id=v.site_id
 AND warehouse_id=v.warehouse_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_POLICY_GENERATION_NOT_BOOTSTRAPPED'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER p2_hold_epoch AFTER INSERT OR UPDATE OR DELETE ON hft.stock_hold
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_scope_epoch_v1();
CREATE TRIGGER p2_actor_epoch AFTER INSERT OR UPDATE OR DELETE ON hft.actor_warehouse_grant
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_scope_epoch_v1();

-- HFT:GATE is the same key acquired by posting. Parent Hold placement and
-- clearance lock ALL affected descendants in canonical sorted order before
-- publication. A Hold-first transaction blocks the next posting; posting-first
-- is ordered and auditable. Real two-session schedules remain NOT RUN.
CREATE OR REPLACE FUNCTION hft.p2_lock_parent_governance_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $parent_gate$
DECLARE rec record;w record;
BEGIN
 IF TG_TABLE_NAME='posting_parent_hold_clearance' THEN
   SELECT legal_entity_id,scope_kind,site_id INTO rec
   FROM hft.posting_parent_hold
   WHERE legal_entity_id=NEW.legal_entity_id AND hold_id=NEW.hold_id;
 ELSE rec:=NEW; END IF;
 IF rec.legal_entity_id IS NULL THEN
   RAISE EXCEPTION 'P2_PARENT_HOLD_SCOPE_MISSING'; END IF;
 FOR w IN SELECT legal_entity_id,site_id,warehouse_id FROM hft.warehouse
   WHERE legal_entity_id=rec.legal_entity_id
   AND (rec.scope_kind='ENTITY' OR site_id=rec.site_id)
   ORDER BY legal_entity_id,site_id,warehouse_id
 LOOP
   PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('HFT:GATE:'||w.legal_entity_id||':'||
       w.site_id||':'||w.warehouse_id,0));
 END LOOP;
 RETURN NEW;
END $parent_gate$;
CREATE OR REPLACE FUNCTION hft.p2_bump_parent_epoch_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $parent_epoch$
DECLARE rec record;w record;
BEGIN
 IF TG_TABLE_NAME='posting_parent_hold_clearance' THEN
  SELECT legal_entity_id,scope_kind,site_id INTO rec FROM hft.posting_parent_hold
  WHERE legal_entity_id=NEW.legal_entity_id AND hold_id=NEW.hold_id;
 ELSE rec:=NEW; END IF;
 FOR w IN SELECT legal_entity_id,site_id,warehouse_id FROM hft.warehouse
   WHERE legal_entity_id=rec.legal_entity_id
   AND (rec.scope_kind='ENTITY' OR site_id=rec.site_id)
   ORDER BY legal_entity_id,site_id,warehouse_id
 LOOP
  UPDATE hft.posting_policy_epoch SET generation=generation+1
  WHERE legal_entity_id=w.legal_entity_id AND site_id=w.site_id
  AND warehouse_id=w.warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'P2_PARENT_HOLD_POLICY_EPOCH_MISSING'; END IF;
 END LOOP;
 RETURN NULL;
END $parent_epoch$;
CREATE TRIGGER p2_parent_hold_gate BEFORE INSERT ON hft.posting_parent_hold
 FOR EACH ROW EXECUTE FUNCTION hft.p2_lock_parent_governance_v1();
CREATE TRIGGER p2_parent_clearance_gate BEFORE INSERT ON hft.posting_parent_hold_clearance
 FOR EACH ROW EXECUTE FUNCTION hft.p2_lock_parent_governance_v1();
CREATE TRIGGER p2_parent_hold_epoch AFTER INSERT ON hft.posting_parent_hold
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_parent_epoch_v1();
CREATE TRIGGER p2_parent_clearance_epoch AFTER INSERT ON hft.posting_parent_hold_clearance
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_parent_epoch_v1();

-- New action policies are append-only revisions. Any policy change bumps
-- relevant scope generation and invalidates stale approvals.
CREATE OR REPLACE FUNCTION hft.p2_lock_new_action_policy_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $policy_gate$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 'HFT:GATE:'||NEW.legal_entity_id||':'||NEW.site_id||':'||NEW.warehouse_id,0));
 PERFORM 1 FROM hft.posting_action_policy WHERE legal_entity_id=NEW.legal_entity_id
 AND site_id=NEW.site_id AND warehouse_id=NEW.warehouse_id
 AND action_kind=NEW.action_kind AND policy_revision>=NEW.policy_revision;
 IF FOUND THEN RAISE EXCEPTION 'P2_POLICY_REVISION_NOT_MONOTONIC'; END IF;
 RETURN NEW;
END $policy_gate$;
CREATE OR REPLACE FUNCTION hft.p2_bump_action_policy_epoch_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $policy_epoch$
BEGIN
 UPDATE hft.posting_policy_epoch SET generation=generation+1
 WHERE legal_entity_id=NEW.legal_entity_id AND site_id=NEW.site_id
 AND warehouse_id=NEW.warehouse_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_ACTION_POLICY_EPOCH_MISSING'; END IF;
 RETURN NULL;
END $policy_epoch$;
CREATE TRIGGER p2_policy_lock BEFORE INSERT ON hft.posting_action_policy
 FOR EACH ROW EXECUTE FUNCTION hft.p2_lock_new_action_policy_v1();
CREATE TRIGGER p2_policy_epoch AFTER INSERT ON hft.posting_action_policy
 FOR EACH ROW EXECUTE FUNCTION hft.p2_bump_action_policy_epoch_v1();

CREATE OR REPLACE FUNCTION hft.p2_revoke_scope_lock_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE a hft.protected_stock_approval%ROWTYPE;
BEGIN
 -- Immutable approval scope is read without holding a row lock.
 -- Lock the scope gate first, then lock the approval row as in the writer.
 SELECT * INTO a FROM hft.protected_stock_approval WHERE legal_entity_id=NEW.legal_entity_id
  AND approval_id=NEW.approval_id AND approval_revision=NEW.approval_revision;
 IF a.approval_id IS NULL THEN RAISE EXCEPTION 'P2_APPROVAL_NOT_FOUND'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||a.legal_entity_id||':'||a.site_id||':'||a.warehouse_id,0));
 PERFORM 1 FROM hft.protected_stock_approval WHERE legal_entity_id=a.legal_entity_id
  AND approval_id=a.approval_id AND approval_revision=a.approval_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_APPROVAL_MISSING_AFTER_GATE'; END IF;
 UPDATE hft.posting_policy_epoch SET generation=generation+1
 WHERE legal_entity_id=a.legal_entity_id AND site_id=a.site_id AND warehouse_id=a.warehouse_id;
 RETURN NEW;
END $$;
CREATE TRIGGER p2_revoke_lock BEFORE INSERT ON hft.protected_approval_revocation
 FOR EACH ROW EXECUTE FUNCTION hft.p2_revoke_scope_lock_v1();

-- One original source line may have distinct, immutable fragments.
-- Existing unique(source_document_id,source_action_key) would strand partials.
ALTER TABLE hft.stock_command ADD COLUMN fragment_id text NOT NULL DEFAULT '';
ALTER TABLE hft.stock_command ADD CONSTRAINT p2_fragment_identity_check
 CHECK((kind='RECEIVE' AND fragment_id='') OR
       (kind IN ('ISSUE','RETURN') AND fragment_id<>''));
DO $drop_old$ DECLARE k text;
BEGIN
 SELECT c.conname INTO k FROM pg_catalog.pg_constraint c
 WHERE c.conrelid='hft.stock_command'::pg_catalog.regclass AND c.contype='u'
 AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%(legal_entity_id, source_document_id, source_action_key)%';
 IF k IS NULL THEN RAISE EXCEPTION 'P2_ORIGINAL_SOURCE_UNIQUE_NOT_FOUND'; END IF;
 EXECUTE pg_catalog.format('ALTER TABLE hft.stock_command DROP CONSTRAINT %I',k);
END $drop_old$;
ALTER TABLE hft.stock_command ADD CONSTRAINT p2_unique_source_fragment
 UNIQUE(legal_entity_id,source_document_id,source_action_key,fragment_id);
DO $drop_contract$ DECLARE k text;
BEGIN
 SELECT c.conname INTO k FROM pg_catalog.pg_constraint c
 WHERE c.conrelid='hft.stock_command'::pg_catalog.regclass AND c.contype='c'
 AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%payload_contract_version%';
 IF k IS NULL THEN RAISE EXCEPTION 'P2_PAYLOAD_CONTRACT_CHECK_NOT_FOUND'; END IF;
 EXECUTE pg_catalog.format('ALTER TABLE hft.stock_command DROP CONSTRAINT %I',k);
END $drop_contract$;
ALTER TABLE hft.stock_command ADD CONSTRAINT p2_payload_contract_version
 CHECK(payload_contract_version IN ('HFT_STOCK_COMMAND_V2','HFT_STOCK_POST_V1'));

-- V1 payload: 25 string-only fields, in the exact TypeScript field order.
CREATE OR REPLACE FUNCTION hft.p2_payload_fields_v1(p jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE names text[]:=ARRAY['contractVersion','commandId','idempotencyKey','kind',
 'legalEntityId','siteId','warehouseId','itemCode','locationId','batchNo','serialNo',
 'condition','employeeId','originalIssueId','sourceDocumentId','sourceActionKey',
 'fragmentId','quantityMicro','sourceRevision','approvalId','approvalRevision',
 'policyGeneration','expectedBalanceVersion','approvedPayloadSha256','inspectionEvidenceId'];
 k text; v text;
BEGIN
 IF pg_catalog.jsonb_typeof(p)<>'object' OR
    (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p))<>25
 THEN RAISE EXCEPTION 'P2_PAYLOAD_FIELDS_INVALID'; END IF;
 FOREACH k IN ARRAY names LOOP
   IF NOT (p?k) OR pg_catalog.jsonb_typeof(p->k)<>'string'
   THEN RAISE EXCEPTION 'P2_PAYLOAD_STRING_REQUIRED:%',k; END IF;
 END LOOP;
 IF p->>'contractVersion'<>'HFT_STOCK_POST_V1' OR
    p->>'kind' NOT IN ('RECEIVE','ISSUE','RETURN')
 THEN RAISE EXCEPTION 'P2_PAYLOAD_CONTRACT_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['commandId','idempotencyKey','legalEntityId','siteId',
   'warehouseId','itemCode','locationId','sourceDocumentId','sourceActionKey','approvalId']
 LOOP
  IF (p->>k) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  THEN RAISE EXCEPTION 'P2_IDENTIFIER_INVALID:%',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['batchNo','serialNo','employeeId','originalIssueId',
   'fragmentId','inspectionEvidenceId'] LOOP
  v:=p->>k;
  IF v<>'' AND v !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  THEN RAISE EXCEPTION 'P2_OPTIONAL_IDENTIFIER_INVALID:%',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['quantityMicro','sourceRevision','approvalRevision',
   'policyGeneration'] LOOP
   v:=p->>k;
   IF v !~ '^[1-9][0-9]*$' OR length(v)>19 OR v::numeric>9223372036854775807
   THEN RAISE EXCEPTION 'P2_NUMERIC_STRING_INVALID:%',k; END IF;
 END LOOP;
 v:=p->>'expectedBalanceVersion';
 IF v !~ '^(0|[1-9][0-9]*)$' OR length(v)>19 OR v::numeric>9223372036854775807
 THEN RAISE EXCEPTION 'P2_BALANCE_VERSION_INVALID'; END IF;
 IF (p->>'approvedPayloadSha256') !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'P2_APPROVED_DIGEST_INVALID'; END IF;
 IF (p->>'kind')='RECEIVE' AND ((p->>'fragmentId')<>'' OR (p->>'condition')<>'GOOD'
    OR (p->>'employeeId')<>'' OR (p->>'originalIssueId')<>'')
 THEN RAISE EXCEPTION 'P2_RECEIVE_SCOPE_INVALID'; END IF;
 IF (p->>'kind')='ISSUE' AND ((p->>'fragmentId')='' OR (p->>'employeeId')=''
    OR (p->>'condition')<>'GOOD' OR (p->>'originalIssueId')<>'')
 THEN RAISE EXCEPTION 'P2_ISSUE_SCOPE_INVALID'; END IF;
 IF (p->>'kind')='RETURN' AND ((p->>'fragmentId')='' OR (p->>'employeeId')=''
    OR (p->>'originalIssueId')='' OR (p->>'inspectionEvidenceId')=''
    OR p->>'condition' NOT IN ('GOOD','DAMAGED','QUARANTINE'))
 THEN RAISE EXCEPTION 'P2_RETURN_SCOPE_INVALID'; END IF;
 -- Explicit proof-field order. Never depend on unnest planner output order.
 RETURN ARRAY(SELECT p->>x.field
    FROM pg_catalog.unnest(names) WITH ORDINALITY AS x(field,ordinality)
    ORDER BY x.ordinality);
END $$;
CREATE OR REPLACE FUNCTION hft.p2_length_prefixed_v1(fields text[]) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,pg_temp AS $$
DECLARE value text; part bytea; length_bytes bytea; combined bytea:=''::bytea;
BEGIN
 IF cardinality(fields)>64 THEN RAISE EXCEPTION 'P2_TOO_MANY_MAC_FIELDS'; END IF;
 FOREACH value IN ARRAY fields LOOP
   IF value IS NULL THEN RAISE EXCEPTION 'P2_NULL_MAC_FIELD'; END IF;
   part:=pg_catalog.convert_to(value,'UTF8');
   IF pg_catalog.octet_length(part)>65535 THEN RAISE EXCEPTION 'P2_MAC_FIELD_TOO_LARGE'; END IF;
   length_bytes:=pg_catalog.decode(pg_catalog.lpad(pg_catalog.to_hex(pg_catalog.octet_length(part)),8,'0'),'hex');
   combined:=combined||length_bytes||part;
 END LOOP;
 RETURN combined;
END $$;
CREATE OR REPLACE FUNCTION hft.p2_payload_digest_v1(p jsonb) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT pg_catalog.encode(hft_crypto.digest(hft.p2_length_prefixed_v1(hft.p2_payload_fields_v1(p)),'sha256'),'hex')
$$;
CREATE OR REPLACE FUNCTION hft.p2_verify_invocation_v1(p jsonb, proof jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text; names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 v text; issued bigint; expires bigint; ver integer; now_epoch bigint;
 key hft_secret.invocation_key%ROWTYPE; payload_sha text; mac_data bytea; mac_expected bytea;
 mac_claimed bytea; mac_difference integer:=0; mac_offset integer;
BEGIN
 IF pg_catalog.jsonb_typeof(proof)<>'object' OR
  (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'P2_PROOF_FIELDS_INVALID'; END IF;
 FOREACH k IN ARRAY names LOOP
  IF NOT (proof?k) OR pg_catalog.jsonb_typeof(proof->k)<>'string'
  THEN RAISE EXCEPTION 'P2_PROOF_STRING_REQUIRED:%',k; END IF;
 END LOOP;
 PERFORM hft.p2_payload_fields_v1(p);
 IF proof->>'proofVersion'<>'HFT-R1-P2-HMAC-SHA256-V1'
 OR (proof->>'actorSubject') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
 OR (proof->>'sessionId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'P2_PROOF_FORMAT_INVALID'; END IF;
 payload_sha:=hft.p2_payload_digest_v1(p);
 IF proof->>'payloadSha256' IS DISTINCT FROM payload_sha
 THEN RAISE EXCEPTION 'P2_PROOF_PAYLOAD_MISMATCH'; END IF;
 FOREACH k IN ARRAY ARRAY['issuedAt','expiresAt','keyVersion'] LOOP
  v:=proof->>k;
  IF v !~ '^[1-9][0-9]*$' OR length(v)>19 OR v::numeric>9223372036854775807
  THEN RAISE EXCEPTION 'P2_PROOF_TIME_OR_VERSION_INVALID'; END IF;
 END LOOP;
 issued:=(proof->>'issuedAt')::bigint;expires:=(proof->>'expiresAt')::bigint;
 IF (proof->>'keyVersion')::numeric>2147483647 THEN RAISE EXCEPTION 'P2_KEY_VERSION_INVALID'; END IF;
 ver:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expires<=now_epoch OR expires<=issued OR expires-issued>60
 THEN RAISE EXCEPTION 'P2_PROOF_EXPIRED_OR_FUTURE'; END IF;
 SELECT * INTO key FROM hft_secret.invocation_key WHERE key_version=ver FOR SHARE;
 IF key.key_version IS NULL OR key.revoked_at IS NOT NULL OR
  pg_catalog.clock_timestamp()<key.not_before OR pg_catalog.clock_timestamp()>=key.not_after
 THEN RAISE EXCEPTION 'P2_INVOCATION_SIGNING_KEY_UNAVAILABLE'; END IF;
 mac_data:=hft.p2_length_prefixed_v1(ARRAY[
  'HFT-R1-P2-HMAC-SHA256-V1', proof->>'actorSubject',proof->>'sessionId',
  p->>'commandId',p->>'idempotencyKey',p->>'kind',payload_sha,
  p->>'sourceRevision',p->>'legalEntityId',p->>'siteId',p->>'warehouseId',
  p->>'sourceDocumentId',p->>'sourceActionKey',p->>'fragmentId',p->>'quantityMicro',
  proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',proof->>'keyVersion']);
 mac_expected:=hft_crypto.hmac(mac_data,key.key_bytes,'sha256');
 mac_claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(mac_expected)<>32 OR
    pg_catalog.octet_length(mac_claimed)<>32 THEN
   RAISE EXCEPTION 'P2_INVOCATION_MAC_LENGTH_INVALID';
 END IF;
 -- Fixed-work 32-byte comparison; actual timing needs independent acceptance.
 FOR mac_offset IN 0..31 LOOP
   mac_difference:=mac_difference |
     (pg_catalog.get_byte(mac_expected,mac_offset) #
      pg_catalog.get_byte(mac_claimed,mac_offset));
 END LOOP;
 IF mac_difference<>0 THEN RAISE EXCEPTION 'P2_INVOCATION_PROOF_MAC_INVALID'; END IF;
 -- Shared runtime login does not establish a human. HMAC + active session do.
 PERFORM 1 FROM hft.posting_session s
 WHERE s.session_id=proof->>'sessionId' AND s.actor_subject=proof->>'actorSubject'
 AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_SESSION_REVOKED_OR_UNKNOWN'; END IF;
 INSERT INTO hft.posting_invocation_nonce(key_version,nonce,actor_subject,session_id,
  command_id,payload_sha256,expires_at)
 VALUES(ver,proof->>'nonce',proof->>'actorSubject',proof->>'sessionId',
  p->>'commandId',payload_sha,pg_catalog.to_timestamp(expires));
 -- Unique (version,nonce) forbids signed request replay regardless of idempotency.
 RETURN proof->>'actorSubject';
END $$;

-- This is the ONLY callable runtime writer. Source proposals must not publish
-- an alternative INSERT/UPDATE path. After this candidate is independently
-- qualified, the old isolated TypeScript table writer is disabled/replaced.
CREATE OR REPLACE FUNCTION hft.post_stock_command_protected_v1(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $writer$
DECLARE
 e text:=p->>'legalEntityId'; site text:=p->>'siteId'; wh text:=p->>'warehouseId';
 item text:=p->>'itemCode'; location text:=p->>'locationId';
 lot text:=p->>'batchNo'; serial text:=p->>'serialNo';
 action text:=p->>'kind'; actor text;
 doc_id text:=p->>'sourceDocumentId'; line_id text:=p->>'sourceActionKey';
 fragment text:=p->>'fragmentId'; holder text:=p->>'employeeId';
 origin_issue text:=p->>'originalIssueId'; v_condition text:=p->>'condition';
 qty bigint; expected_version bigint; doc_revision bigint; generation bigint;
 grant_row hft.actor_warehouse_grant%ROWTYPE;
 approval hft.protected_stock_approval%ROWTYPE;
 approval_decision hft.protected_approval_decision%ROWTYPE;
 action_policy hft.posting_action_policy%ROWTYPE;
 policy hft.posting_policy_epoch%ROWTYPE;
 available hft.stock_account%ROWTYPE; target hft.stock_account%ROWTYPE;
 source_revision bigint; source_approver text; ceiling bigint; cumulative bigint;
 v_control_type text; source_uuid uuid; receipt_uuid uuid; invoice_line_uuid uuid; receipt_line_no integer;
 origin_custody hft.employee_custody%ROWTYPE;
 command_uuid uuid; outbox_uuid uuid; result jsonb; fact jsonb; event jsonb; audit_text text;
 audit_sha text; payload_sha text; debit_bucket text; credit_bucket text;
 debit_account uuid; credit_account uuid; before_available bigint; after_available bigint;
 next_available_version bigint; outcome_count integer;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 THEN RAISE EXCEPTION 'P2_SERIALIZABLE_TRANSACTION_REQUIRED'; END IF;
 IF NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
    OR session_user IN ('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'P2_UNAUTHORIZED_RUNTIME_DATABASE_IDENTITY'; END IF;
 -- Validate all payload types before casting, decrypting or locking data.
 PERFORM hft.p2_payload_fields_v1(p);
 qty:=(p->>'quantityMicro')::bigint;
 doc_revision:=(p->>'sourceRevision')::bigint;
 expected_version:=(p->>'expectedBalanceVersion')::bigint;
 payload_sha:=hft.p2_payload_digest_v1(p);
 -- Canonical transaction order: GATE -> STOCK -> proof/session ->
 -- persisted source/approval/Hold -> deterministic accounts/custody ->
 -- command, legs, outcome, audit and P1 seal. No early nonce write.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||e||':'||site||':'||wh,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:STOCK:'||e||':'||wh||':'||item||':'||lot||':'||serial,0));
 actor:=hft.p2_verify_invocation_v1(p,proof);
 SELECT * INTO grant_row FROM hft.actor_warehouse_grant
 WHERE legal_entity_id=e AND site_id=site AND warehouse_id=wh
 AND actor_subject=actor FOR SHARE;
 IF grant_row.actor_subject IS NULL OR NOT grant_row.active OR NOT grant_row.may_post
 THEN RAISE EXCEPTION 'P2_PERSISTED_ACTOR_NOT_AUTHORIZED'; END IF;
 SELECT * INTO policy FROM hft.posting_policy_epoch
 WHERE legal_entity_id=e AND site_id=site AND warehouse_id=wh FOR SHARE;
 IF policy.generation IS NULL OR policy.generation<>(p->>'policyGeneration')::bigint
 THEN RAISE EXCEPTION 'P2_POLICY_GENERATION_INVALID'; END IF;
 -- Replay of a distinct signed proof for an existing command may return the
 -- existing committed result only if exact persisted fingerprint/actor match.
 PERFORM 1 FROM hft.stock_command sc WHERE sc.legal_entity_id=e
   AND sc.command_id=p->>'commandId' FOR SHARE;
 IF FOUND THEN
   SELECT outcome.result INTO result FROM hft.stock_command sc
    JOIN hft.stock_command_outcome outcome ON outcome.command_id=sc.id
    WHERE sc.legal_entity_id=e AND sc.command_id=p->>'commandId'
     AND sc.payload_sha256=payload_sha AND sc.actor_subject=actor;
   IF result IS NULL THEN RAISE EXCEPTION 'P2_COMMAND_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN result||pg_catalog.jsonb_build_object('replay',true);
 END IF;
 SELECT * INTO approval FROM hft.protected_stock_approval
 WHERE legal_entity_id=e AND approval_id=p->>'approvalId'
 AND approval_revision=(p->>'approvalRevision')::bigint FOR SHARE;
 IF approval.approval_id IS NULL OR NOT approval.approved OR
   pg_catalog.clock_timestamp()<approval.valid_from OR
   pg_catalog.clock_timestamp()>=approval.valid_until OR
   EXISTS(SELECT 1 FROM hft.protected_approval_supersession AS sx
    WHERE sx.legal_entity_id=approval.legal_entity_id
      AND sx.approval_id=approval.approval_id
      AND sx.approval_revision=approval.approval_revision) OR
   EXISTS(SELECT 1 FROM hft.protected_approval_revocation rev
    WHERE rev.legal_entity_id=e AND rev.approval_id=approval.approval_id
       AND rev.approval_revision=approval.approval_revision)
 OR approval.payload_sha256<>payload_sha OR
    approval.approved_scope_sha256<>p->>'approvedPayloadSha256' OR
    (approval.kind,approval.document_id,approval.source_action_key,approval.fragment_id,
     approval.site_id,approval.warehouse_id,approval.item_code,approval.location_id,
     approval.batch_no,approval.serial_no,approval.employee_id,approval.original_issue_id,
     approval.quantity_micro,approval.actor_subject,approval.document_revision,
     approval.policy_generation,approval.condition,approval.inspection_evidence_id)
    IS DISTINCT FROM
    (action,doc_id,line_id,fragment,site,wh,item,location,lot,serial,holder,
     origin_issue,qty,actor,doc_revision,policy.generation,v_condition,p->>'inspectionEvidenceId')
 OR approval.approver_subject=actor
 THEN RAISE EXCEPTION 'P2_EXACT_PERSISTED_APPROVAL_REQUIRED'; END IF;

 -- P2-G11-01/05: review current immutable decision and action-policy
 -- generation at POSTING, not only when the approval was originally issued.
 SELECT * INTO approval_decision FROM hft.protected_approval_decision AS d
 WHERE d.legal_entity_id=e AND d.approval_id=approval.approval_id
 AND d.approval_revision=approval.approval_revision FOR SHARE;
 SELECT * INTO action_policy FROM hft.posting_action_policy AS pol
 WHERE pol.legal_entity_id=e AND pol.site_id=site AND pol.warehouse_id=wh
 AND pol.action_kind=action ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;
 IF approval_decision.approval_id IS NULL
 OR action_policy.policy_revision IS NULL
 OR action_policy.policy_revision<>approval.policy_revision
 OR approval_decision.policy_revision<>approval.policy_revision
 OR approval_decision.payload_sha256<>payload_sha
 OR approval_decision.source_revision<>approval.document_revision
 OR approval_decision.approver_subject<>approval.approver_subject
 OR pg_catalog.clock_timestamp()<action_policy.valid_from
 OR pg_catalog.clock_timestamp()>=action_policy.valid_until
 OR approval.valid_until>action_policy.valid_until
 THEN RAISE EXCEPTION 'P2_ACTION_POLICY_OR_GOVERNANCE_DECISION_STALE'; END IF;
 -- Human registry revocation/qualification is rechecked at action time.
 PERFORM 1 FROM hft.approval_human_login AS l
 JOIN hft.approval_human AS h ON h.person_id=l.person_id
  AND h.legal_entity_id=l.legal_entity_id
 JOIN hft.approval_role_qualification AS q ON q.person_id=h.person_id
  AND q.legal_entity_id=h.legal_entity_id AND q.action_kind=action
  AND q.duty='APPROVER'
 WHERE l.legal_entity_id=e AND l.actor_subject=approval.approver_subject
 AND h.revoked_at IS NULL AND h.valid_from<=pg_catalog.clock_timestamp()
 AND h.valid_until>pg_catalog.clock_timestamp()
 AND q.qualified_from<=pg_catalog.clock_timestamp()
 AND q.qualified_until>pg_catalog.clock_timestamp() FOR SHARE OF l,h,q;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_APPROVER_NO_LONGER_QUALIFIED'; END IF;
 -- Parent ENTITY and SITE Holds must be projected and locked, even when
 -- no exact warehouse-level Hold exists.
 PERFORM 1 FROM hft.posting_parent_hold AS parent_hold
 WHERE parent_hold.legal_entity_id=e AND parent_hold.active
   AND (parent_hold.scope_kind='ENTITY'
       OR parent_hold.scope_kind='SITE' AND parent_hold.site_id=site)
   AND (parent_hold.expires_at IS NULL
        OR parent_hold.expires_at>pg_catalog.clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM hft.posting_parent_hold_clearance AS cleared
     WHERE cleared.legal_entity_id=parent_hold.legal_entity_id
     AND cleared.hold_id=parent_hold.hold_id)
 FOR SHARE OF parent_hold;
 IF FOUND THEN RAISE EXCEPTION 'P2_PARENT_SCOPE_HOLD_ACTIVE'; END IF;

 PERFORM 1 FROM hft.stock_hold h WHERE h.active AND h.legal_entity_id=e
 AND h.site_id=site AND h.warehouse_id=wh
 AND (h.item_code IS NULL OR h.item_code=item)
 AND (h.employee_id IS NULL OR h.employee_id=NULLIF(holder,''))
 AND (h.source_document_id IS NULL OR h.source_document_id=doc_id) FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'P2_BLOCKING_HOLD'; END IF;
 PERFORM 1 FROM hft.location l WHERE l.legal_entity_id=e AND l.warehouse_id=wh
 AND l.location_id=location AND l.active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_LOCATION_NOT_ACTIVE'; END IF;
 SELECT i.control_type INTO v_control_type FROM hft.item i
 WHERE i.legal_entity_id=e AND i.item_code=item AND i.active FOR SHARE;
 IF v_control_type IS NULL THEN RAISE EXCEPTION 'P2_ITEM_NOT_ACTIVE'; END IF;
 IF (v_control_type='SERIAL' AND (serial='' OR qty<>1000000)) OR
    (v_control_type='BATCH' AND (lot='' OR serial<>'')) OR
    (v_control_type='NONE' AND (lot<>'' OR serial<>''))
 THEN RAISE EXCEPTION 'P2_ITEM_SERIAL_BATCH_INVALID'; END IF;
 IF action IN ('ISSUE','RETURN') THEN
  PERFORM 1 FROM hft.employee emp WHERE emp.legal_entity_id=e
    AND emp.site_id=site AND emp.employee_id=holder AND emp.active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P2_EMPLOYEE_NOT_ACTIVE'; END IF;
 END IF;
 -- Lock typed source document and line, enforce exact authorization revision.
 IF action='RECEIVE' THEN
   SELECT g.authorization_revision,g.authorized_by,r.accepted_micro,r.id,
      gl.invoice_line_id,r.line_no
   INTO source_revision,source_approver,ceiling,receipt_uuid,invoice_line_uuid,receipt_line_no
   FROM hft.grn g
   JOIN hft.grn_partial_receipt r ON r.grn_id=g.id
   JOIN hft.grn_line gl ON gl.grn_id=r.grn_id AND gl.line_no=r.line_no
   JOIN hft.supplier AS supplier ON supplier.legal_entity_id=g.legal_entity_id
        AND supplier.supplier_id=g.supplier_id
   JOIN hft.supplier_invoice AS invoice ON invoice.id=g.invoice_id
        AND invoice.legal_entity_id=g.legal_entity_id
        AND invoice.supplier_id=g.supplier_id
        AND invoice.invoice_key=g.invoice_key AND invoice.invoice_date=g.invoice_date
   JOIN hft.supplier_invoice_line AS invline ON invline.id=gl.invoice_line_id
        AND invline.invoice_id=invoice.id AND invline.legal_entity_id=g.legal_entity_id
        AND invline.item_code=gl.item_code
   WHERE g.id::text=doc_id AND g.legal_entity_id=e AND g.warehouse_id=wh
     AND r.receipt_key||':'||r.line_no::text=line_id
     AND r.legal_entity_id=e AND r.warehouse_id=wh AND r.location_id=location
     AND r.batch_no=lot AND r.serial_no=serial AND gl.item_code=item
     AND r.qc_state='ACCEPTED' AND length(trim(r.evidence_reference))>0
     AND r.evidence_reference=p->>'inspectionEvidenceId'
     AND supplier.active=true AND invoice.status='VERIFIED'
     AND g.status IN ('AUTHORIZED','PARTIALLY_RECEIVED')
     FOR UPDATE OF g,r,gl FOR SHARE OF supplier,invoice,invline;
   IF source_revision IS NULL OR ceiling<>qty
   THEN RAISE EXCEPTION 'P2_GRN_PHYSICAL_RECEIPT_UNVERIFIED'; END IF;
 ELSIF action='ISSUE' THEN
   SELECT i.authorization_revision,i.approved_by,l.authorized_micro,l.issued_micro
   INTO source_revision,source_approver,ceiling,cumulative
   FROM hft.material_issue i JOIN hft.material_issue_line l ON l.issue_id=i.id
   WHERE i.id::text=doc_id AND i.legal_entity_id=e AND i.warehouse_id=wh
      AND i.employee_id=holder AND i.status IN ('AUTHORIZED','ISSUED')
      AND l.source_action_key=line_id AND l.legal_entity_id=e AND l.warehouse_id=wh
      AND l.item_code=item AND l.location_id=location AND l.batch_no=lot
      AND l.serial_no=serial FOR UPDATE OF i,l;
   IF source_revision IS NULL OR ceiling<cumulative+qty
   THEN RAISE EXCEPTION 'P2_PARTIAL_ISSUE_CEILING_EXCEEDED'; END IF;
 ELSIF action='RETURN' THEN
   SELECT mr.authorization_revision,mr.accepted_by,l.authorized_micro,l.returned_micro
   INTO source_revision,source_approver,ceiling,cumulative
   FROM hft.material_return mr JOIN hft.material_issue origin ON origin.id=mr.issue_id
   JOIN hft.material_return_line l ON l.return_id=mr.id
   WHERE mr.id::text=doc_id AND mr.legal_entity_id=e AND mr.warehouse_id=wh
      AND origin.employee_id=holder AND mr.status IN ('AUTHORIZED','RETURNED')
      AND mr.condition=v_condition
      AND mr.evidence_reference=p->>'inspectionEvidenceId'
      AND mr.evidence_reference=approval.inspection_evidence_id
      AND length(trim(mr.evidence_reference))>0
      AND l.source_action_key=line_id AND l.legal_entity_id=e AND l.warehouse_id=wh
      AND l.item_code=item AND l.location_id=location AND l.batch_no=lot
      AND l.serial_no=serial AND l.original_issue_command_id=origin_issue
   FOR UPDATE OF mr,l,origin;
   IF source_revision IS NULL OR ceiling<cumulative+qty
   THEN RAISE EXCEPTION 'P2_PARTIAL_RETURN_CEILING_EXCEEDED'; END IF;
   SELECT ec.* INTO origin_custody FROM hft.employee_custody ec
    JOIN hft.stock_command sc ON sc.id=ec.issue_command_id
    WHERE sc.legal_entity_id=e AND sc.command_id=origin_issue
      AND sc.kind='ISSUE' AND sc.item_code=item AND sc.warehouse_id=wh
      AND sc.location_id=location AND sc.batch_no=lot AND sc.serial_no=serial
      AND ec.employee_id=holder FOR UPDATE OF ec;
   IF origin_custody.issue_command_id IS NULL OR
     origin_custody.returned_micro+qty>origin_custody.issued_micro
   THEN RAISE EXCEPTION 'P2_EMPLOYEE_CUSTODY_CEILING_EXCEEDED'; END IF;
 ELSE RAISE EXCEPTION 'P2_UNSUPPORTED_POSTING_ACTION'; END IF;
 IF source_revision<>doc_revision OR source_approver IS DISTINCT FROM approval.approver_subject
 THEN RAISE EXCEPTION 'P2_DOCUMENT_REVISION_OR_APPROVER_CHANGED'; END IF;
 -- An idempotency key claimed by a different command is never reused.
 PERFORM 1 FROM hft.stock_command sc WHERE sc.legal_entity_id=e
   AND sc.idempotency_key=p->>'idempotencyKey' FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'P2_IDEMPOTENCY_KEY_CONFLICT'; END IF;
 -- Ensure distinct fragments cannot double-post the same source action.
 IF action IN ('ISSUE','RETURN') THEN
   PERFORM 1 FROM hft.posting_fragment pf WHERE pf.legal_entity_id=e
    AND pf.fragment_id=fragment FOR SHARE;
   IF FOUND THEN RAISE EXCEPTION 'P2_FRAGMENT_ALREADY_POSTED'; END IF;
 END IF;
 -- Account identity rows and locks are ordered before any stock command writes.
 INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,location_key,
   batch_key,serial_key,condition,account_kind,custodian_employee_id)
 VALUES(e,wh,item,location,lot,serial,'GOOD','AVAILABLE','') ON CONFLICT DO NOTHING;
 SELECT * INTO available FROM hft.stock_account AS a
 WHERE legal_entity_id=e AND warehouse_id=wh AND item_code=item AND location_key=location
   AND batch_key=lot AND serial_key=serial AND a.condition='GOOD' AND account_kind='AVAILABLE'
   AND custodian_employee_id='' FOR UPDATE;
 IF available.id IS NULL OR available.version<>expected_version
 THEN RAISE EXCEPTION 'P2_STALE_AVAILABLE_VERSION'; END IF;
 before_available:=available.qty_micro;
 debit_bucket:=CASE action WHEN 'RECEIVE' THEN 'EXTERNAL' WHEN 'ISSUE' THEN 'AVAILABLE' ELSE 'CUSTODY' END;
 credit_bucket:=CASE action WHEN 'ISSUE' THEN 'CUSTODY'
   WHEN 'RETURN' THEN (CASE WHEN v_condition='GOOD' THEN 'AVAILABLE' ELSE v_condition END)
   ELSE 'AVAILABLE' END;
 IF action='ISSUE' AND before_available-qty<available.reserved_micro
 THEN RAISE EXCEPTION 'P2_INSUFFICIENT_AVAILABLE_QUANTITY'; END IF;
 IF action='RETURN' AND v_condition='GOOD' THEN after_available:=before_available+qty;
 ELSIF action='RECEIVE' THEN after_available:=before_available+qty;
 ELSIF action='ISSUE' THEN after_available:=before_available-qty;
 ELSE after_available:=before_available; END IF;
 -- Each nonexternal destination account is explicit and never reuses AVAILABLE
 -- for employee custody/damaged/quarantine.
 IF credit_bucket<>'AVAILABLE' THEN
   INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,location_key,
     batch_key,serial_key,condition,account_kind,custodian_employee_id)
   VALUES(e,wh,item,location,lot,serial,
     CASE WHEN credit_bucket IN ('DAMAGED','QUARANTINE') THEN credit_bucket ELSE 'GOOD' END,
     credit_bucket,CASE WHEN credit_bucket='CUSTODY' THEN holder ELSE '' END)
   ON CONFLICT DO NOTHING;
 END IF;
 IF debit_bucket='CUSTODY' THEN
   INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,location_key,
      batch_key,serial_key,condition,account_kind,custodian_employee_id)
   VALUES(e,wh,item,location,lot,serial,'GOOD','CUSTODY',holder) ON CONFLICT DO NOTHING;
 END IF;
 -- Lock the exact affected account rows in deterministic UUID order.
 PERFORM 1 FROM hft.stock_account a WHERE a.legal_entity_id=e AND a.warehouse_id=wh
    AND a.item_code=item AND a.location_key=location AND a.batch_key=lot
    AND a.serial_key=serial AND
    (a.account_kind='AVAILABLE' OR (a.account_kind='CUSTODY' AND a.custodian_employee_id=holder)
      OR (a.account_kind=credit_bucket AND credit_bucket IN ('DAMAGED','QUARANTINE')))
 ORDER BY a.id FOR UPDATE;
 SELECT * INTO target FROM hft.stock_account a
 WHERE a.legal_entity_id=e AND a.warehouse_id=wh AND a.item_code=item
  AND a.location_key=location AND a.batch_key=lot AND a.serial_key=serial
  AND a.account_kind=CASE WHEN action='ISSUE' THEN 'CUSTODY'
    WHEN action='RETURN' THEN 'CUSTODY' ELSE credit_bucket END
  AND a.custodian_employee_id=CASE WHEN action IN ('ISSUE','RETURN') THEN holder ELSE '' END;
 IF action='ISSUE' AND target.id IS NULL THEN RAISE EXCEPTION 'P2_CUSTODY_ACCOUNT_NOT_FOUND'; END IF;
 -- Preserve account optimistic post-command version for H3 seals.
 UPDATE hft.stock_account SET qty_micro=after_available,version=version+1
 WHERE id=available.id AND reserved_micro<=after_available;
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_AVAILABLE_BALANCE_UPDATE_FAILED'; END IF;
 next_available_version:=available.version+1;
 IF action='ISSUE' THEN
   UPDATE hft.stock_account SET qty_micro=qty_micro+qty,version=version+1 WHERE id=target.id;
 ELSIF action='RETURN' THEN
   UPDATE hft.stock_account SET qty_micro=qty_micro-qty,version=version+1
    WHERE id=target.id AND qty_micro>=qty;
   IF NOT FOUND THEN RAISE EXCEPTION 'P2_CUSTODY_ACCOUNT_UNDERFLOW'; END IF;
   IF credit_bucket IN ('DAMAGED','QUARANTINE') THEN
     UPDATE hft.stock_account SET qty_micro=qty_micro+qty,version=version+1
     WHERE legal_entity_id=e AND warehouse_id=wh AND item_code=item AND location_key=location
       AND batch_key=lot AND serial_key=serial AND account_kind=credit_bucket;
   END IF;
 END IF;
 -- Persist one immutable command, two exact legs, source updates and evidence.
 INSERT INTO hft.stock_command(legal_entity_id,command_id,idempotency_key,
   payload_sha256,kind,source_document_id,source_action_key,fragment_id,
   actor_subject,approval_id,approval_revision,source_receipt_id,source_line_no,
   warehouse_id,item_code,location_id,batch_no,serial_no,site_id,quantity_micro,payload_contract_version)
 VALUES(e,p->>'commandId',p->>'idempotencyKey',payload_sha,action,doc_id,line_id,fragment,
   actor,approval.approval_id,approval.approval_revision,
   CASE WHEN action='RECEIVE' THEN receipt_uuid ELSE NULL END,
   CASE WHEN action='RECEIVE' THEN receipt_line_no ELSE NULL END,
   wh,item,location,lot,serial,site,qty,'HFT_STOCK_POST_V1') RETURNING id INTO command_uuid;
 IF action IN ('ISSUE','RETURN') THEN
  INSERT INTO hft.posting_fragment(legal_entity_id,fragment_id,kind,document_id,
   source_action_key,command_uuid,quantity_micro,employee_id,original_issue_id)
  VALUES(e,fragment,action,doc_id,line_id,command_uuid,qty,holder,origin_issue);
 END IF;
 IF debit_bucket='EXTERNAL' THEN debit_account:=NULL;
 ELSIF debit_bucket='AVAILABLE' THEN debit_account:=available.id;
 ELSE debit_account:=target.id; END IF;
 IF credit_bucket='AVAILABLE' THEN credit_account:=available.id;
 ELSIF credit_bucket='CUSTODY' THEN credit_account:=target.id;
 ELSE SELECT id INTO credit_account FROM hft.stock_account a
  WHERE a.legal_entity_id=e AND a.warehouse_id=wh AND a.item_code=item
   AND a.location_key=location AND a.batch_key=lot AND a.serial_key=serial
   AND a.account_kind=credit_bucket; END IF;
 INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro,employee_id,batch_no,serial_no)
 VALUES(command_uuid,debit_account,debit_bucket,-qty,NULLIF(holder,''),NULLIF(lot,''),NULLIF(serial,'')),
       (command_uuid,credit_account,credit_bucket,qty,NULLIF(holder,''),NULLIF(lot,''),NULLIF(serial,''));
 IF action='RECEIVE' THEN
    UPDATE hft.grn_line SET accepted_micro=accepted_micro+qty
     WHERE grn_id=doc_id::uuid AND line_no=receipt_line_no
       AND accepted_micro+qty<=ordered_micro;
    IF NOT FOUND THEN RAISE EXCEPTION 'P2_GRN_ACCEPTED_EXCEEDED'; END IF;
    UPDATE hft.supplier_invoice_line SET received_micro=received_micro+qty
      WHERE id=invoice_line_uuid AND received_micro+qty<=authorized_micro;
    IF NOT FOUND THEN RAISE EXCEPTION 'P2_INVOICE_CEILING_EXCEEDED'; END IF;
    UPDATE hft.grn SET status=CASE WHEN EXISTS(SELECT 1 FROM hft.grn_line gl
      WHERE gl.grn_id=doc_id::uuid AND gl.accepted_micro<gl.ordered_micro)
      THEN 'PARTIALLY_RECEIVED' ELSE 'RECEIVED' END,version=version+1 WHERE id=doc_id::uuid;
 ELSIF action='ISSUE' THEN
    UPDATE hft.material_issue_line SET issued_micro=issued_micro+qty
     WHERE issue_id=doc_id::uuid AND source_action_key=line_id
       AND issued_micro+qty<=authorized_micro;
    IF NOT FOUND THEN RAISE EXCEPTION 'P2_ISSUE_LINE_CEILING_EXCEEDED'; END IF;
    INSERT INTO hft.employee_custody(legal_entity_id,employee_id,issue_command_id,
     item_code,warehouse_id,issued_micro,serial_no,batch_no,location_id)
    VALUES(e,holder,command_uuid,item,wh,qty,serial,lot,location);
    -- Physical posting is NOT receiving-employee acknowledgement. Pending
    -- state remains until a separate authenticated, audited ACK event exists.
    INSERT INTO hft.custody_ack_pending(issue_command_uuid,legal_entity_id,employee_id)
    VALUES(command_uuid,e,holder);
    UPDATE hft.material_issue SET status=CASE WHEN EXISTS(SELECT 1 FROM hft.material_issue_line l
      WHERE l.issue_id=doc_id::uuid AND l.issued_micro<l.authorized_micro)
      THEN 'AUTHORIZED' ELSE 'ISSUED' END,version=version+1 WHERE id=doc_id::uuid;
 ELSE
    UPDATE hft.material_return_line SET returned_micro=returned_micro+qty
     WHERE return_id=doc_id::uuid AND source_action_key=line_id
       AND returned_micro+qty<=authorized_micro;
    IF NOT FOUND THEN RAISE EXCEPTION 'P2_RETURN_LINE_CEILING_EXCEEDED'; END IF;
    UPDATE hft.employee_custody SET returned_micro=returned_micro+qty,version=version+1
     WHERE issue_command_id=origin_custody.issue_command_id
       AND returned_micro+qty<=issued_micro;
    IF NOT FOUND THEN RAISE EXCEPTION 'P2_CUSTODY_RETURN_FAILED'; END IF;
    UPDATE hft.material_return SET status=CASE WHEN EXISTS(SELECT 1 FROM hft.material_return_line l
      WHERE l.return_id=doc_id::uuid AND l.returned_micro<l.authorized_micro)
      THEN 'AUTHORIZED' ELSE 'RETURNED' END WHERE id=doc_id::uuid;
 END IF;
 -- Lock+check serial state, once per unique asset. Partial SERIAL is forbidden.
 IF v_control_type='SERIAL' AND serial<>'' THEN
   IF action='RECEIVE' THEN
     INSERT INTO hft.serial_registry(legal_entity_id,item_code,serial_no,warehouse_id,state)
     VALUES(e,item,serial,wh,'AVAILABLE');
   ELSE
     UPDATE hft.serial_registry SET state=CASE WHEN action='ISSUE' THEN 'CUSTODY'
       WHEN v_condition='GOOD' THEN 'AVAILABLE' ELSE v_condition END,
       custodian_employee_id=CASE WHEN action='ISSUE' THEN holder ELSE NULL END,
       version=version+1 WHERE legal_entity_id=e AND item_code=item AND serial_no=serial
       AND state=CASE WHEN action='ISSUE' THEN 'AVAILABLE' ELSE 'CUSTODY' END;
     IF NOT FOUND THEN RAISE EXCEPTION 'P2_SERIAL_CUSTODY_CONFLICT'; END IF;
   END IF;
 END IF;
 -- Immutable audit/outcome share same fact; historical poststate captured in seal.
 fact:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
   'commandId',p->>'commandId','kind',action,'sourceDocumentId',doc_id,
   'entityId',e,'warehouseId',wh,'itemCode',item,'locationId',location,
   'operatorId',actor,'employeeId',NULLIF(holder,''),
   'issueId',NULLIF(origin_issue,''),
   'movements',pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_object('bucket',debit_bucket,'delta',hft.format_signed_micro_v2(-qty)),
     pg_catalog.jsonb_build_object('bucket',credit_bucket,'delta',hft.format_signed_micro_v2(qty)))));
 result:=pg_catalog.jsonb_build_object('commandId',p->>'commandId',
  'accountVersion',next_available_version,'available',hft.format_signed_micro_v2(after_available),
  'fact',fact,'replay',false);
 event:=pg_catalog.jsonb_build_object('schema','HFT_STOCK_EVENT_V2','commandId',p->>'commandId',
  'entity',e,'actor',actor,'approvalId',approval.approval_id,
  'approvalRevision',approval.approval_revision,
  'available',hft.format_signed_micro_v2(after_available),
  'accountVersion',next_available_version,'fact',fact);
 audit_text:=event::text;
 audit_sha:=pg_catalog.encode(hft_crypto.digest(pg_catalog.convert_to(audit_text,'UTF8'),'sha256'),'hex');
 INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,canonical_sha256)
 VALUES(command_uuid,event,audit_text,audit_sha) RETURNING id INTO outbox_uuid;
 INSERT INTO hft.audit_delivery(outbox_id,state) VALUES(outbox_uuid,'PENDING');
 INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
 VALUES(command_uuid,result,actor);
 PERFORM hft.seal_stock_command_v1(command_uuid);
 RETURN result;
END $writer$;


-- P2-QA-003: readback is NOT a writer and does not consume a nonce.
-- An original committed nonce is evidence the server-side proof verifier ran
-- within the same atomic transaction. Absent nonce/command is INDETERMINATE,
-- never a license to repost. This function itself uses SELECT-only operations.
CREATE OR REPLACE FUNCTION hft.reconcile_protected_stock_command_v1(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $recovery$
DECLARE
 cmd hft.stock_command%ROWTYPE;
 nonce_row hft.posting_invocation_nonce%ROWTYPE;
 outbox hft.audit_outbox%ROWTYPE;
 outcome hft.stock_command_outcome%ROWTYPE;
 seal hft.stock_command_seal%ROWTYPE;
 payload_digest text; cnt bigint;
BEGIN
 PERFORM hft.p2_payload_fields_v1(p);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
   OR (proof->>'actorSubject') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
   OR (proof->>'sessionId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
   OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
   OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'P2_RECOVERY_PROOF_ENCODING_INVALID'; END IF;
 payload_digest:=hft.p2_payload_digest_v1(p);
 IF payload_digest IS DISTINCT FROM proof->>'payloadSha256' THEN
   RAISE EXCEPTION 'P2_RECOVERY_PAYLOAD_DIGEST_MISMATCH'; END IF;
 SELECT * INTO cmd FROM hft.stock_command AS sc
 WHERE sc.legal_entity_id=p->>'legalEntityId'
   AND sc.command_id=p->>'commandId';
 IF cmd.id IS NULL THEN
   PERFORM 1 FROM hft.stock_command AS existing
   WHERE existing.legal_entity_id=p->>'legalEntityId'
    AND existing.idempotency_key=p->>'idempotencyKey';
   IF FOUND THEN RAISE EXCEPTION 'P2_RECOVERY_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN pg_catalog.jsonb_build_object('state','INDETERMINATE_NOT_FOUND',
                                      'automaticRetryAllowed',false);
 END IF;
 IF cmd.payload_sha256<>payload_digest
  OR cmd.actor_subject<>proof->>'actorSubject'
  OR cmd.idempotency_key<>p->>'idempotencyKey'
  OR cmd.kind<>p->>'kind'
  OR cmd.source_document_id<>p->>'sourceDocumentId'
  OR cmd.source_action_key<>p->>'sourceActionKey'
  OR cmd.fragment_id<>p->>'fragmentId'
  OR cmd.legal_entity_id<>p->>'legalEntityId'
  OR cmd.site_id<>p->>'siteId'
  OR cmd.warehouse_id<>p->>'warehouseId'
  OR cmd.item_code<>p->>'itemCode'
  OR cmd.location_id<>p->>'locationId'
  OR cmd.batch_no<>p->>'batchNo'
  OR cmd.serial_no<>p->>'serialNo'
  OR cmd.quantity_micro::text<>p->>'quantityMicro'
 THEN RAISE EXCEPTION 'P2_RECOVERY_PROTECTED_COMMAND_CONFLICT'; END IF;
 SELECT * INTO nonce_row FROM hft.posting_invocation_nonce AS used
 WHERE used.key_version=(proof->>'keyVersion')::integer
   AND used.nonce=proof->>'nonce'
   AND used.actor_subject=proof->>'actorSubject'
   AND used.session_id=proof->>'sessionId'
   AND used.command_id=cmd.command_id
   AND used.payload_sha256=payload_digest;
 IF nonce_row.nonce IS NULL THEN
   RAISE EXCEPTION 'P2_RECOVERY_ORIGINAL_SIGNED_NONCE_NOT_COMMITTED'; END IF;
 -- Current human session must still be active; recovered data stays scoped.
 PERFORM 1 FROM hft.posting_session AS s
 WHERE s.session_id=nonce_row.session_id
 AND s.actor_subject=nonce_row.actor_subject
 AND s.revoked_at IS NULL AND s.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'P2_RECOVERY_VERIFIED_SESSION_REVOKED'; END IF;
 SELECT * INTO outcome FROM hft.stock_command_outcome
 WHERE command_id=cmd.id;
 SELECT * INTO outbox FROM hft.audit_outbox WHERE command_id=cmd.id;
 SELECT * INTO seal FROM hft.stock_command_seal WHERE command_id=cmd.id;
 IF outcome.command_id IS NULL OR outbox.id IS NULL OR seal.command_id IS NULL
 OR outcome.committed_by<>nonce_row.actor_subject
 OR outbox.canonical_sha256<>seal.audit_sha256
 OR seal.outcome_sha256 IS DISTINCT FROM
   pg_catalog.encode(hft_crypto.digest(pg_catalog.convert_to(outcome.result::text,'UTF8'),'sha256'),'hex')
 OR NOT EXISTS (SELECT 1 FROM hft.audit_delivery d WHERE d.outbox_id=outbox.id)
 THEN RAISE EXCEPTION 'P2_RECOVERY_IMMUTABLE_EVIDENCE_INCOMPLETE'; END IF;
 IF cmd.kind IN ('ISSUE','RETURN') THEN
   SELECT pg_catalog.count(*) INTO cnt FROM hft.posting_fragment AS fragment
   WHERE fragment.command_uuid=cmd.id
     AND fragment.legal_entity_id=cmd.legal_entity_id
     AND fragment.fragment_id=cmd.fragment_id
     AND fragment.quantity_micro=cmd.quantity_micro
     AND fragment.document_id=cmd.source_document_id
     AND fragment.source_action_key=cmd.source_action_key;
   IF cnt<>1 THEN RAISE EXCEPTION 'P2_RECOVERY_FRAGMENT_INTEGRITY_FAILED'; END IF;
 END IF;
 -- P1 proof is lock-free and checks exact ledger legs/immutable attribution,
 -- historic post-command available/version, audit/outcome and seal shape.
 PERFORM hft.assert_command_seal_v1(cmd.id);
 RETURN pg_catalog.jsonb_build_object('state','COMMITTED_VERIFIED',
      'result',outcome.result);
END $recovery$;

-- Audit readers verify nonce cardinality without viewing nonce secrets.
CREATE VIEW hft.posting_nonce_audit_v1 AS
 SELECT cmd.legal_entity_id,cmd.command_id,pg_catalog.count(*) AS nonce_count
 FROM hft.posting_invocation_nonce AS nonce
 JOIN hft.stock_command AS cmd ON cmd.command_id=nonce.command_id
   AND cmd.payload_sha256=nonce.payload_sha256
   AND cmd.actor_subject=nonce.actor_subject
 GROUP BY cmd.legal_entity_id,cmd.command_id;

-- Owner may access only the protected tables and internal helpers required to
-- apply this single writer. Runtime has NO direct DML, no schema DDL and no
-- individual seal/lock/assert helper EXECUTE.
GRANT USAGE ON SCHEMA hft TO hft_r1_posting_owner,hft_r1_app_runtime,hft_r1_audit_verify;
GRANT USAGE ON SCHEMA hft_crypto TO hft_r1_posting_owner;
GRANT SELECT,INSERT,UPDATE ON hft.stock_account,hft.employee_custody,
 hft.serial_registry TO hft_r1_posting_owner;
GRANT SELECT,UPDATE ON hft.grn,hft.grn_line,hft.supplier_invoice_line,
 hft.material_issue,hft.material_issue_line,hft.material_return,
 hft.material_return_line TO hft_r1_posting_owner;
GRANT SELECT,INSERT ON hft.stock_command,hft.stock_entry,
 hft.audit_outbox,hft.audit_delivery,hft.stock_command_outcome,
 hft.stock_command_seal TO hft_r1_posting_owner;
GRANT SELECT ON hft.legal_entity,hft.site,hft.item,hft.supplier,hft.warehouse,
 hft.location,hft.employee,hft.actor_warehouse_grant,hft.stock_hold,
 hft.supplier_invoice,hft.grn_partial_receipt,hft.protected_stock_approval,
 hft.protected_approval_revocation,hft.posting_policy_epoch,hft.posting_session,
 hft.posting_fragment,hft.posting_action_policy,hft.protected_approval_decision,
 hft.protected_approval_supersession,hft.approval_human,hft.approval_human_login,
 hft.approval_role_qualification,hft.return_inspection_attestation,
 hft.posting_parent_hold,hft.posting_parent_hold_clearance,
 hft.posting_policy_bootstrap TO hft_r1_posting_owner;
GRANT INSERT ON hft.posting_invocation_nonce,hft.posting_fragment,
 hft.custody_ack_pending TO hft_r1_posting_owner;
GRANT SELECT ON hft.posting_invocation_nonce TO hft_r1_posting_owner;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hft TO hft_r1_posting_owner;
-- Private SECURITY INVOKER validators are callable ONLY by the vetted
-- non-login function owner, never by the app runtime or PUBLIC.
GRANT EXECUTE ON FUNCTION hft.p2_length_prefixed_v1(text[]),
 hft.p2_payload_fields_v1(jsonb),hft.p2_payload_digest_v1(jsonb),
 hft.p2_verify_invocation_v1(jsonb,jsonb),
 hft.p2_qualified_human_v1(text,text,text,text,text,timestamptz)
 TO hft_r1_posting_owner;
GRANT EXECUTE ON FUNCTION hft.seal_stock_command_v1(uuid) TO hft_r1_posting_owner;
GRANT EXECUTE ON FUNCTION hft.lock_seal_posting_dependencies_v2(uuid) TO hft_r1_posting_owner;
GRANT EXECUTE ON FUNCTION hft.assert_command_seal_v1(uuid) TO hft_r1_posting_owner;
REVOKE EXECUTE ON FUNCTION hft.seal_stock_command_v1(uuid) FROM PUBLIC,hft_r1_app_runtime;
REVOKE EXECUTE ON FUNCTION hft.lock_seal_posting_dependencies_v2(uuid) FROM PUBLIC,hft_r1_app_runtime;
REVOKE EXECUTE ON FUNCTION hft.assert_command_seal_v1(uuid) FROM PUBLIC,hft_r1_app_runtime;

-- P2-SEC-003-01: ownership transfer requires schema CREATE on PostgreSQL.
-- Grant narrowly for this same transaction, revoke before COMMIT. No
-- runtime CREATE privilege is ever issued.
GRANT CREATE ON SCHEMA hft TO hft_r1_posting_owner;
ALTER FUNCTION hft.post_stock_command_protected_v1(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
ALTER FUNCTION hft.reconcile_protected_stock_command_v1(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_posting_owner;
DO $verify_owner_acl$ BEGIN
 IF (SELECT p.proowner<>r.oid FROM pg_catalog.pg_proc AS p
     JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
     JOIN pg_catalog.pg_roles AS r ON r.rolname='hft_r1_posting_owner'
     WHERE n.nspname='hft' AND p.proname='post_stock_command_protected_v1'
       AND p.pronargs=2) IS DISTINCT FROM false
    OR (SELECT p.proowner<>r.oid FROM pg_catalog.pg_proc AS p
     JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
     JOIN pg_catalog.pg_roles AS r ON r.rolname='hft_r1_posting_owner'
     WHERE n.nspname='hft' AND p.proname='reconcile_protected_stock_command_v1'
       AND p.pronargs=2) IS DISTINCT FROM false
    OR pg_catalog.has_schema_privilege('hft_r1_posting_owner','hft','CREATE')
 THEN RAISE EXCEPTION 'P2_FUNCTION_OWNER_OR_SCHEMA_CREATE_NOT_REVOKED'; END IF;
END $verify_owner_acl$;
-- SECURITY DEFINER owner fixed; runtime gets EXECUTE on ONE writer only.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime;
GRANT EXECUTE ON FUNCTION hft.post_stock_command_protected_v1(jsonb,jsonb)
 TO hft_r1_app_runtime;
-- A distinct READ-ONLY reconciliation function is permitted; it never
-- updates ledger facts or consumes a new invocation nonce.
GRANT EXECUTE ON FUNCTION hft.reconcile_protected_stock_command_v1(jsonb,jsonb)
 TO hft_r1_app_runtime;
GRANT SELECT ON hft.stock_command,hft.stock_entry,hft.stock_account,
 hft.audit_outbox,hft.stock_command_outcome,hft.stock_command_seal,
 hft.stock_account_reconstruction_v2,hft.stock_command_seal_reconstruction_v1,
 hft.invoice_line_receipt_reconstruction_v2,
 hft.custody_ack_status_v1,hft.posting_nonce_audit_v1,
 hft.posting_fragment
 TO hft_r1_audit_verify;
REVOKE ALL ON SCHEMA hft_secret FROM PUBLIC,hft_r1_app_runtime,hft_r1_audit_verify;
REVOKE ALL ON ALL TABLES IN SCHEMA hft_secret FROM PUBLIC,hft_r1_app_runtime,hft_r1_audit_verify;
-- New governance tables are private by default; reassert explicit current
-- restrictions after all CREATE TABLE operations.
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft FROM PUBLIC,hft_r1_app_runtime;
-- P2-SEC-003-02: inspect ACTUAL login membership and effective privileges,
-- not only the NOLOGIN group itself. Conservatively deny any membership in
-- administrative roles, even if role inheritance/SET options vary by PG15+.
DO $runtime_login_review$
DECLARE login_row record; protected_table text; runtime_count integer:=0;
BEGIN
 FOR login_row IN SELECT oid,rolname,rolsuper,rolcreatedb,rolcreaterole
     FROM pg_catalog.pg_roles
     WHERE rolcanlogin AND
       pg_catalog.pg_has_role(oid,'hft_r1_app_runtime'::pg_catalog.regrole,'MEMBER')
 LOOP
   runtime_count:=runtime_count+1;
   IF login_row.rolsuper OR login_row.rolcreatedb OR login_row.rolcreaterole
     OR pg_catalog.pg_has_role(login_row.oid,'hft_engineering'::pg_catalog.regrole,'MEMBER')
     OR pg_catalog.pg_has_role(login_row.oid,'hft_r1_posting_owner'::pg_catalog.regrole,'MEMBER')
     OR pg_catalog.has_schema_privilege(login_row.rolname,'hft','CREATE')
     OR pg_catalog.has_schema_privilege(login_row.rolname,'hft_secret','USAGE')
   THEN RAISE EXCEPTION 'P2_PRIVILEGED_RUNTIME_LOGIN_REFUSED:%',login_row.rolname; END IF;
   FOREACH protected_table IN ARRAY ARRAY['hft.stock_command','hft.stock_entry',
     'hft.stock_account','hft.stock_command_seal','hft.protected_stock_approval',
     'hft.protected_approval_revocation','hft.stock_hold','hft.audit_outbox',
     'hft.posting_invocation_nonce','hft.posting_fragment',
     'hft.custody_ack_pending','hft.posting_parent_hold',
     'hft.protected_approval_decision','hft.posting_action_policy']
   LOOP
     IF pg_catalog.has_table_privilege(login_row.rolname,protected_table,'INSERT')
        OR pg_catalog.has_table_privilege(login_row.rolname,protected_table,'UPDATE')
        OR pg_catalog.has_table_privilege(login_row.rolname,protected_table,'DELETE')
        OR pg_catalog.has_table_privilege(login_row.rolname,protected_table,'TRUNCATE')
     THEN RAISE EXCEPTION 'P2_EFFECTIVE_RUNTIME_DML_REFUSED:%:%',
       login_row.rolname,protected_table; END IF;
   END LOOP;
 END LOOP;
 IF runtime_count=0 THEN RAISE EXCEPTION 'P2_NO_ATTESTED_RUNTIME_LOGIN'; END IF;
 IF pg_catalog.has_schema_privilege('hft_r1_posting_owner','hft','CREATE')
 THEN RAISE EXCEPTION 'P2_OWNER_CREATE_PRIVILEGE_STILL_EFFECTIVE'; END IF;
END $runtime_login_review$;
COMMIT;
