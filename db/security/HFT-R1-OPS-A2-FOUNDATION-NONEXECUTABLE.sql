-- OPS-A2 PROTECTED FOUNDATION CANDIDATE — NONEXECUTABLE SOURCE ONLY
-- HF16-OPS-A2-DELIVERY-049 | 7 November 2026
-- This is NOT an installed migration or a signed database authority.
-- Installation sequence requires separately qualified OPS-A version schema,
-- canonical 0001–0006, P2 governance, P0, P3, item-photo and original cutover.
-- Never remove this STOP without new MASTER Gate A, Chat 10/11/17 review and
-- a source-hash-bound forward migration. NO PRODUCTION OR NEON EXECUTION.
BEGIN;
DO $STOP_OPS_A2$
BEGIN
 RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED';
END $STOP_OPS_A2$;

-- BEFORE any ALTER, reject historical rows rather than invent versions,
-- source identities, custody, seals, count snapshots or receipt references.
DO $preflight$
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR session_user<>'hft_engineering'
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6)
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR pg_catalog.to_regprocedure('hft.ops_a_payload_fields_v2(jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('hft.p0_verify_stores_proof_v1(jsonb,jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('hft.p2_qualified_human_v1(text,text,text,text,text,timestamptz)') IS NULL
 OR pg_catalog.to_regclass('hft.item_version_photo_coverage_v1') IS NULL
 OR EXISTS(SELECT 1 FROM hft.stock_command)
 OR EXISTS(SELECT 1 FROM hft.stock_entry)
 OR EXISTS(SELECT 1 FROM hft.stock_account)
 OR EXISTS(SELECT 1 FROM hft.serial_registry)
 OR EXISTS(SELECT 1 FROM hft.employee_custody)
 OR EXISTS(SELECT 1 FROM hft.audit_outbox)
 OR EXISTS(SELECT 1 FROM hft.stock_command_seal)
 OR EXISTS(SELECT 1 FROM hft.posting_invocation_nonce)
 OR EXISTS(SELECT 1 FROM hft.protected_stock_approval)
 OR EXISTS(SELECT 1 FROM hft.protected_approval_decision)
 OR EXISTS(SELECT 1 FROM hft.grn_partial_receipt)
 OR EXISTS(SELECT 1 FROM hft.material_issue_line)
 OR EXISTS(SELECT 1 FROM hft.material_return_line)
 OR EXISTS(SELECT 1 FROM hft.opening_count_session)
 THEN RAISE EXCEPTION 'OPS_A2_HISTORICAL_CUTOVER_AND_SOURCE_NOT_QUALIFIED';
 END IF;
END $preflight$;

-- All quantitative inventory continues in hft.stock_account/stock_entry.
-- Enable the new command kind only after source and seal controls are installed.
ALTER TABLE hft.stock_command DROP CONSTRAINT stock_command_kind_check;
ALTER TABLE hft.stock_command ADD CONSTRAINT stock_command_kind_check
 CHECK(kind IN('RECEIVE','ISSUE','RETURN','TRANSFER','OPENING','REVERSAL'));
ALTER TABLE hft.stock_command DROP CONSTRAINT p2_payload_contract_version;
ALTER TABLE hft.stock_command ADD CONSTRAINT p2_payload_contract_version
 CHECK(payload_contract_version IN('HFT_STOCK_COMMAND_V2','HFT_STOCK_POST_V1',
  'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'));
ALTER TABLE hft.protected_stock_approval DROP CONSTRAINT protected_stock_approval_kind_check;
ALTER TABLE hft.protected_stock_approval ADD CONSTRAINT protected_stock_approval_kind_check
 CHECK(kind IN('RECEIVE','ISSUE','RETURN','TRANSFER'));
ALTER TABLE hft.posting_action_policy DROP CONSTRAINT posting_action_policy_action_kind_check;
ALTER TABLE hft.posting_action_policy ADD CONSTRAINT posting_action_policy_action_kind_check
 CHECK(action_kind IN('RECEIVE','ISSUE','RETURN','TRANSFER'));
ALTER TABLE hft.approval_role_qualification DROP CONSTRAINT approval_role_qualification_action_kind_check;
ALTER TABLE hft.approval_role_qualification ADD CONSTRAINT approval_role_qualification_action_kind_check
 CHECK(action_kind IN('RECEIVE','ISSUE','RETURN','TRANSFER','ACK_EXCEPTION','HOLD_CLEARANCE'));

-- Existing command has one legacy location identity. Keep it for the V1
-- contract; add both exact leaf locations for the V2 transfer/custody source.
ALTER TABLE hft.stock_command ADD COLUMN ops_a2_source_leaf text NOT NULL DEFAULT '';
ALTER TABLE hft.stock_command ADD COLUMN ops_a2_destination_leaf text NOT NULL DEFAULT '';
ALTER TABLE hft.stock_command ADD COLUMN ops_a2_source_account_id uuid;
ALTER TABLE hft.stock_command ADD COLUMN ops_a2_destination_account_id uuid;
ALTER TABLE hft.stock_command ADD CONSTRAINT ops_a2_stock_command_account_identity
 CHECK(payload_contract_version<>'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
  OR (ops_a2_destination_leaf<>'' AND ops_a2_destination_account_id IS NOT NULL));
ALTER TABLE hft.stock_command ADD CONSTRAINT ops_a2_command_source_account_fk
 FOREIGN KEY(ops_a2_source_account_id) REFERENCES hft.stock_account(id);
ALTER TABLE hft.stock_command ADD CONSTRAINT ops_a2_command_dest_account_fk
 FOREIGN KEY(ops_a2_destination_account_id) REFERENCES hft.stock_account(id);

-- Typed source documents are reviewed/approved separately; these are NOT a
-- second ledger. Warehouse/site/item/version/leaf/source identities are exact.
ALTER TABLE hft.grn_partial_receipt
 ADD COLUMN ops_a2_item_code text NOT NULL,
 ADD COLUMN ops_a2_product_version_code text NOT NULL;
ALTER TABLE hft.material_issue_line
 ADD COLUMN ops_a2_product_version_code text NOT NULL;
ALTER TABLE hft.material_return_line
 ADD COLUMN ops_a2_product_version_code text NOT NULL;
ALTER TABLE hft.grn_partial_receipt ADD CONSTRAINT ops_a2_receipt_version_fk
 FOREIGN KEY(legal_entity_id,ops_a2_item_code,ops_a2_product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);
ALTER TABLE hft.material_issue_line ADD CONSTRAINT ops_a2_issue_line_version_fk
 FOREIGN KEY(legal_entity_id,item_code,ops_a2_product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);
ALTER TABLE hft.material_return_line ADD CONSTRAINT ops_a2_return_line_version_fk
 FOREIGN KEY(legal_entity_id,item_code,ops_a2_product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code);
-- Physical receipt item must also equal the scoped GRN line item, checked
-- by the future V2 protected writer using the locked exact GRN line.

-- Governed warehouse-local transfer document, NOT a stock balance table.
CREATE TABLE hft.ops_a2_transfer_document(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 item_code text NOT NULL,product_version_code text NOT NULL,
 source_leaf text NOT NULL,destination_leaf text NOT NULL,
 batch_no text NOT NULL DEFAULT '',serial_no text NOT NULL DEFAULT '',
 authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 moved_micro bigint NOT NULL DEFAULT 0 CHECK(moved_micro>=0 AND moved_micro<=authorized_micro),
 revision bigint NOT NULL CHECK(revision>0),
 status text NOT NULL CHECK(status IN ('DRAFT','AUTHORIZED','PARTIALLY_MOVED','MOVED','CANCELLED')),
 prepared_by text NOT NULL,checked_by text NOT NULL,approved_by text NOT NULL,
 approved_at timestamptz NOT NULL,approval_evidence_sha256 text NOT NULL
 CHECK(approval_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 UNIQUE(legal_entity_id,id),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 FOREIGN KEY(legal_entity_id,warehouse_id,source_leaf)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,destination_leaf)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 CHECK(source_leaf<>destination_leaf),
 CHECK(prepared_by<>checked_by AND prepared_by<>approved_by AND checked_by<>approved_by)
);
-- Governance 060: authorize exactly the writer's cumulative movement transition.
-- Every corporate identity, signed approval and source document field is
-- immutable. No arbitrary authorized-document edit or document deletion.
CREATE OR REPLACE FUNCTION hft.ops_a2_protect_transfer_document_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $protect_transfer$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'OPS_A2_TRANSFER_DOCUMENT_DELETION_DENIED';
 END IF;
 IF current_user<>'hft_r1_posting_owner'
 OR ROW(NEW.id,NEW.legal_entity_id,NEW.site_id,NEW.warehouse_id,
  NEW.item_code,NEW.product_version_code,NEW.source_leaf,NEW.destination_leaf,
  NEW.batch_no,NEW.serial_no,NEW.authorized_micro,NEW.revision,
  NEW.prepared_by,NEW.checked_by,NEW.approved_by,NEW.approved_at,
  NEW.approval_evidence_sha256)
 IS DISTINCT FROM ROW(OLD.id,OLD.legal_entity_id,OLD.site_id,OLD.warehouse_id,
  OLD.item_code,OLD.product_version_code,OLD.source_leaf,OLD.destination_leaf,
  OLD.batch_no,OLD.serial_no,OLD.authorized_micro,OLD.revision,
  OLD.prepared_by,OLD.checked_by,OLD.approved_by,OLD.approved_at,
  OLD.approval_evidence_sha256)
 OR OLD.status NOT IN('AUTHORIZED','PARTIALLY_MOVED')
 OR NEW.moved_micro<=OLD.moved_micro
 OR NEW.moved_micro>OLD.authorized_micro
 OR NEW.status<>CASE WHEN NEW.moved_micro=OLD.authorized_micro
  THEN 'MOVED' ELSE 'PARTIALLY_MOVED' END
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION'; END IF;
 RETURN NEW;
END $protect_transfer$;
CREATE TRIGGER ops_a2_transfer_document_immutable_v2
 BEFORE UPDATE OR DELETE ON hft.ops_a2_transfer_document
 FOR EACH ROW EXECUTE FUNCTION hft.ops_a2_protect_transfer_document_v2();
REVOKE EXECUTE ON FUNCTION hft.ops_a2_protect_transfer_document_v2()
 FROM PUBLIC,hft_r1_app_runtime;

-- 060: extend the EXISTING deferred P2 V1 approval validator to TRANSFER.
-- The existing trigger is retained unchanged. V1 action logic is preserved;
-- TRANSFER requires original approved document, evidence and corporate persons.
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
 ELSIF NEW.kind='TRANSFER' THEN
   SELECT t.revision,t.prepared_by,t.checked_by,t.approved_by
   INTO v_rev,v_maker,v_checker,v_approver
   FROM hft.ops_a2_transfer_document AS t
   WHERE t.id::text=NEW.document_id
   AND t.legal_entity_id=NEW.legal_entity_id
   AND t.site_id=NEW.site_id AND t.warehouse_id=NEW.warehouse_id
   AND t.status IN('AUTHORIZED','PARTIALLY_MOVED','MOVED')
   AND t.approval_evidence_sha256=d.decision_evidence_sha256
   FOR SHARE;
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
 -- TRANSFER requires three independent qualified corporate people irrespective
 -- of a legacy policy row permitting weaker V1 role separation.
 IF NEW.kind='TRANSFER' AND (
   maker_person IS NULL OR checker_person IS NULL OR approver_person IS NULL
   OR actor_person IS NULL OR maker_person=checker_person
   OR maker_person=approver_person OR checker_person=approver_person
   OR approver_person=actor_person OR maker_person=actor_person
   OR checker_person=actor_person)
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_HUMAN_PERSON_SEPARATION_DENIED'; END IF;
 IF pol.require_independent_inspector AND NEW.kind='RETURN' AND
 (inspector_person IS NULL OR inspector_person=approver_person OR
  inspector_person=actor_person OR inspector_person=maker_person OR
  inspector_person=checker_person)
 THEN RAISE EXCEPTION 'P2_INSPECTOR_HUMAN_NOT_INDEPENDENT'; END IF;
 IF NEW.kind='RETURN' AND (
 NEW.inspection_evidence_id='' OR v_evidence<>NEW.inspection_evidence_id
 OR d.inspection_evidence_id<>NEW.inspection_evidence_id OR
 inspector_person IS NULL OR NOT EXISTS (
 SELECT 1 FROM hft.return_inspection_attestation AS att
 JOIN hft.governance_evidence_manifest AS signed
 ON signed.manifest_id=att.manifest_id AND signed.purpose='RETURN_INSPECTION'
 WHERE att.legal_entity_id=NEW.legal_entity_id
 AND att.return_document_id=NEW.document_id
 AND att.approval_id=NEW.approval_id AND att.approval_revision=NEW.approval_revision
 AND att.evidence_id=NEW.inspection_evidence_id
 AND signed.payload->>'evidenceSha256'=att.evidence_sha256
 AND signed.payload->>'decisionSha256'=d.decision_evidence_sha256
 AND att.inspector_subject=d.inspector_subject
 AND att.inspector_session_id=d.inspector_session_id)
 ) THEN RAISE EXCEPTION 'P2_RETURN_INSPECTION_AUTHORITY_INVALID'; END IF;
 RETURN NULL;
END $gov$;
-- Only a protected, approved source-governance process may create/authorize.
-- Direct runtime DML and approval-state transition rights remain revoked.
REVOKE ALL ON hft.ops_a2_transfer_document FROM PUBLIC,hft_r1_app_runtime;

-- Immutable independent approval extension. Never supplied by a browser.
-- Must be created by a separately qualified GOVERNANCE issuer. Its unique
-- request and exact approvals bind an original P0 HMAC to the new V2 bytes.
CREATE TABLE hft.ops_a2_source_binding(
 request_id uuid PRIMARY KEY,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 item_code text NOT NULL,product_version_code text NOT NULL,
 action_kind text NOT NULL CHECK(action_kind IN('RECEIVE','ISSUE','RETURN','TRANSFER')),
 source_document_id text NOT NULL,source_action_key text NOT NULL,
 source_revision bigint NOT NULL CHECK(source_revision>0),
 p0_payload_sha256 text NOT NULL CHECK(p0_payload_sha256~'^[0-9a-f]{64}$'),
 approved_scope_sha256 text NOT NULL CHECK(approved_scope_sha256~'^[0-9a-f]{64}$'),
 approval_id text NOT NULL,approval_revision bigint NOT NULL CHECK(approval_revision>0),
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 actor_subject text NOT NULL,approver_subject text NOT NULL,
 source_leaf text NOT NULL DEFAULT '',destination_leaf text NOT NULL DEFAULT '',
 source_account_id uuid,destination_account_id uuid NOT NULL,
 source_account_before_version bigint CHECK(source_account_before_version>=0),
 dest_account_before_version bigint NOT NULL CHECK(dest_account_before_version>=0),
 employee_id text NOT NULL DEFAULT '',original_issue_id text NOT NULL DEFAULT '',
 fragment_id text NOT NULL DEFAULT '',inspection_evidence_id text NOT NULL DEFAULT '',
 authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 status text NOT NULL CHECK(status='APPROVED'),
 issued_by text NOT NULL,issuer_decision_sha256 text NOT NULL
  CHECK(issuer_decision_sha256 ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
  REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision),
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
  REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
  REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(source_account_id) REFERENCES hft.stock_account(id),
 FOREIGN KEY(destination_account_id) REFERENCES hft.stock_account(id),
 CHECK(actor_subject<>approver_subject),
 CHECK((action_kind='RECEIVE' AND source_account_id IS NULL
  AND source_account_before_version IS NULL AND source_leaf='') OR
  (action_kind<>'RECEIVE' AND source_account_id IS NOT NULL
  AND source_account_before_version IS NOT NULL AND source_leaf<>'')),
 CHECK(action_kind<>'TRANSFER' OR
  (source_leaf<>destination_leaf AND source_account_id<>destination_account_id))
);
CREATE TRIGGER immutable_ops_a2_source_binding BEFORE UPDATE OR DELETE
 ON hft.ops_a2_source_binding FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_source_binding FROM PUBLIC,hft_r1_app_runtime;

-- Original nonce, payload, version and actor provenance is append-only;
-- this is an authorization envelope, NOT a separate stock ledger/balance.
CREATE TABLE hft.ops_a2_command_envelope(
 command_uuid uuid PRIMARY KEY REFERENCES hft.stock_command(id),
 exact_payload jsonb NOT NULL,payload_sha256 text NOT NULL
 CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 nonce text NOT NULL CHECK(nonce~'^[0-9a-f]{48}$'),
 proof_mac_sha256 text NOT NULL CHECK(proof_mac_sha256~'^[0-9a-f]{64}$'),
 actor_session_id text NOT NULL,source_binding_request_id uuid NOT NULL
 REFERENCES hft.ops_a2_source_binding(request_id),
 version_movement_sha256 text NOT NULL CHECK(version_movement_sha256~'^[0-9a-f]{64}$'),
 posting_policy_generation bigint NOT NULL CHECK(posting_policy_generation>0),
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TRIGGER immutable_ops_a2_command_envelope BEFORE UPDATE OR DELETE
 ON hft.ops_a2_command_envelope FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_command_envelope FROM PUBLIC,hft_r1_app_runtime;

-- Each future V2 stock command must be fully sealed at COMMIT, never merely
-- present in a caller response. V1 trigger remains for exact historical V1
-- semantics. A separate accepted seal function must own V2 validation.
DROP TRIGGER stock_command_requires_seal_v1 ON hft.stock_command;
CREATE CONSTRAINT TRIGGER stock_command_requires_seal_v1
 AFTER INSERT ON hft.stock_command DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN
 (NEW.payload_contract_version<>'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED')
 EXECUTE FUNCTION hft.require_stock_command_seal_v1();

-- Pre-existing V1 source-parent function is unchanged; only V2 commands
-- may use a new exact-source trigger. Its function is in the separate
-- protected writer source under the SAME migration transaction.
DROP TRIGGER stock_command_scoped_parent_v3 ON hft.stock_command;
CREATE TRIGGER stock_command_scoped_parent_v3 BEFORE INSERT ON hft.stock_command
 FOR EACH ROW WHEN
 (NEW.payload_contract_version<>'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED')
 EXECUTE FUNCTION hft.enforce_stock_command_parent_v3();
-- ops_a2_source_parent_v2 trigger and ops_a2_versioned_seal must be created
-- in this SAME transaction before COMMIT, not by a second deployment.
-- The unrestricted legacy stock_entry_account_identity_v2 trigger also
-- requires exact V2 destination-leaf handling and V1 compatibility.
-- This file deliberately has no runtime GRANT and no authorization.
COMMIT;
