-- HFT OPS-A2 CONSOLIDATED FORWARD MIGRATION CANDIDATE (NONEXECUTABLE)
-- Directive HFT-R1-MASTER-V4-OPS-A2-PG18-REMAINDER-059
-- One atomic SQL transaction, dependency order: foundation -> proof -> writer -> resolver/read.
-- Requires canonical 0001-0006, separately reviewed OPS-A versioned candidate,
-- P0/P2 governance and proof functions, P3/item-photo source and inspected catalog.
-- No production, staging, disposable PostgreSQL or Neon execution is authorized.
-- Original four SQL source files preserved verbatim as independent review inputs.
-- An authorized future installation requires a different separately approved,
-- exact-hash-bound artifact. Do not strip the STOP in this candidate.
BEGIN;
DO $OPS_A2_CONSOLIDATED_STOP$
BEGIN
 RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED';
END $OPS_A2_CONSOLIDATED_STOP$;

-- ===== BEGIN SOURCE 1/4: FOUNDATION =====
-- OPS-A2 PROTECTED FOUNDATION CANDIDATE — NONEXECUTABLE SOURCE ONLY
-- HF16-OPS-A2-DELIVERY-049 | 7 November 2026
-- This is NOT an installed migration or a signed database authority.
-- Installation sequence requires separately qualified OPS-A version schema,
-- canonical 0001–0006, P2 governance, P0, P3, item-photo and original cutover.
-- Never remove this STOP without new MASTER Gate A, Chat 10/11/17 review and
-- a source-hash-bound forward migration. NO PRODUCTION OR NEON EXECUTION.
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
  OR (ops_a2_destination_account_id IS NOT NULL
   AND ((kind='ISSUE' AND ops_a2_source_leaf<>''
     AND ops_a2_destination_leaf='')
    OR (kind<>'ISSUE' AND ops_a2_destination_leaf<>''))));
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
 OR COALESCE(v_maker,'')<>NEW.prepared_by
 OR COALESCE(v_checker,'')<>NEW.checked_by
 OR d.prepared_subject IS DISTINCT FROM NULLIF(NEW.prepared_by,'')
 OR d.checked_subject IS DISTINCT FROM NULLIF(NEW.checked_by,'')
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

-- OPS-A2 061: ZERO-ONLY ACCOUNT PROVISIONING, SOURCE-ONLY CANDIDATE.
-- The independent governance issuer records the ORIGINAL, approved source
-- order. Ordinary runtime can neither insert orders nor provision accounts.
-- The order is NOT stock and cannot declare opening quantity.
CREATE TABLE hft.ops_a2_account_provision_order(
 order_id uuid PRIMARY KEY,account_id uuid NOT NULL UNIQUE,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 item_code text NOT NULL,product_version_code text NOT NULL,
 leaf_location_id text NOT NULL,account_kind text NOT NULL
 CHECK(account_kind IN('AVAILABLE','CUSTODY','QUARANTINE','DAMAGED','WIP','INSTALLED')),
 condition text NOT NULL CHECK(condition IN('GOOD','DAMAGED','QUARANTINE')),
 serial_no text NOT NULL DEFAULT '',batch_no text NOT NULL DEFAULT '',
 custodian_employee_id text NOT NULL DEFAULT '',
 action_kind text NOT NULL CHECK(action_kind IN('RECEIVE','ISSUE','RETURN','TRANSFER')),
 source_document_id text NOT NULL,source_revision bigint NOT NULL CHECK(source_revision>0),
 approval_id text NOT NULL,approval_revision bigint NOT NULL CHECK(approval_revision>0),
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 prepared_subject text NOT NULL,prepared_session_id text NOT NULL,
 checked_subject text NOT NULL,checked_session_id text NOT NULL,
 approved_subject text NOT NULL,approved_session_id text NOT NULL,
 decision_evidence_sha256 text NOT NULL
 CHECK(decision_evidence_sha256~'^[0-9a-f]{64}$'),
 approved_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status='AUTHORIZED'),
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,leaf_location_id)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision),
 CHECK((account_kind='CUSTODY' AND custodian_employee_id<>'' AND condition='GOOD')
 OR (account_kind<>'CUSTODY' AND custodian_employee_id='' AND
   ((account_kind='QUARANTINE' AND condition='QUARANTINE')
    OR (account_kind='DAMAGED' AND condition='DAMAGED')
    OR (account_kind NOT IN('DAMAGED','QUARANTINE') AND condition='GOOD')))),
 CHECK(prepared_subject<>checked_subject AND
  prepared_subject<>approved_subject AND checked_subject<>approved_subject)
);
CREATE TABLE hft.ops_a2_account_provision_receipt(
 order_id uuid PRIMARY KEY REFERENCES hft.ops_a2_account_provision_order(order_id),
 account_id uuid NOT NULL UNIQUE REFERENCES hft.stock_account(id),
 provisioned_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 provisioned_by text NOT NULL,source_evidence_sha256 text NOT NULL
 CHECK(source_evidence_sha256~'^[0-9a-f]{64}$')
);
CREATE TRIGGER immutable_ops_a2_account_order
 BEFORE UPDATE OR DELETE ON hft.ops_a2_account_provision_order
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER immutable_ops_a2_account_receipt
 BEFORE UPDATE OR DELETE ON hft.ops_a2_account_provision_receipt
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_account_provision_order,
 hft.ops_a2_account_provision_receipt FROM PUBLIC,hft_r1_app_runtime;

-- Caller is independently controlled governance, not a posting operator.
-- Zero balance, reserved quantity and revision are CONSTANTS, not parameters.
CREATE OR REPLACE FUNCTION hft.ops_a2_provision_zero_account_v2(p_order uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $provision$
DECLARE
 o hft.ops_a2_account_provision_order%ROWTYPE;
 a hft.protected_stock_approval%ROWTYPE;
 d hft.protected_approval_decision%ROWTYPE;
 maker text;checker text;approver text;
 leaf_name text;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_INDEPENDENT_GOVERNANCE_LOGIN_REQUIRED'; END IF;
 SELECT * INTO o FROM hft.ops_a2_account_provision_order
 WHERE order_id=p_order AND status='AUTHORIZED' FOR SHARE;
 IF o.order_id IS NULL OR EXISTS(
  SELECT 1 FROM hft.ops_a2_account_provision_receipt WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_ORDER_ABSENT_OR_CONSUMED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||o.legal_entity_id||':'||o.site_id||':'||o.warehouse_id,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:STOCK:'||o.legal_entity_id||':'||o.warehouse_id||':'||
  o.item_code||':'||o.batch_no||':'||o.serial_no,0));
 SELECT * INTO a FROM hft.protected_stock_approval
 WHERE legal_entity_id=o.legal_entity_id
 AND approval_id=o.approval_id AND approval_revision=o.approval_revision
 FOR SHARE;
 SELECT * INTO d FROM hft.protected_approval_decision
 WHERE legal_entity_id=o.legal_entity_id
 AND approval_id=o.approval_id AND approval_revision=o.approval_revision
 FOR SHARE;
 IF a.approval_id IS NULL OR d.approval_id IS NULL OR NOT a.approved
 OR a.kind<>o.action_kind OR a.document_id<>o.source_document_id
 OR a.document_revision<>o.source_revision OR
 a.policy_generation<>o.policy_generation OR
 a.legal_entity_id<>o.legal_entity_id OR a.site_id<>o.site_id
 OR a.warehouse_id<>o.warehouse_id OR a.item_code<>o.item_code
 OR d.decision_evidence_sha256<>o.decision_evidence_sha256
 OR d.prepared_subject IS DISTINCT FROM o.prepared_subject
 OR d.checked_subject IS DISTINCT FROM o.checked_subject
 OR d.approver_subject<>o.approved_subject
 OR d.prepared_session_id IS DISTINCT FROM o.prepared_session_id
 OR d.checked_session_id IS DISTINCT FROM o.checked_session_id
 OR d.approver_session_id<>o.approved_session_id
 OR EXISTS(SELECT 1 FROM hft.protected_approval_revocation AS rev
  WHERE rev.legal_entity_id=o.legal_entity_id
    AND rev.approval_id=o.approval_id
    AND rev.approval_revision=o.approval_revision)
 OR EXISTS(SELECT 1 FROM hft.protected_approval_supersession AS sup
  WHERE sup.legal_entity_id=o.legal_entity_id
    AND sup.approval_id=o.approval_id
    AND sup.approval_revision=o.approval_revision)
 THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_APPROVAL_PROVENANCE_INVALID'; END IF;
 maker:=hft.p2_qualified_human_v1(o.legal_entity_id,o.prepared_subject,
  o.prepared_session_id,o.action_kind,'PREPARER',pg_catalog.clock_timestamp());
 checker:=hft.p2_qualified_human_v1(o.legal_entity_id,o.checked_subject,
  o.checked_session_id,o.action_kind,'CHECKER',pg_catalog.clock_timestamp());
 approver:=hft.p2_qualified_human_v1(o.legal_entity_id,o.approved_subject,
  o.approved_session_id,o.action_kind,'APPROVER',pg_catalog.clock_timestamp());
 IF maker IS NULL OR checker IS NULL OR approver IS NULL OR maker=checker
  OR maker=approver OR checker=approver
 THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_CORPORATE_PERSON_SEPARATION_DENIED'; END IF;
 PERFORM 1 FROM hft.posting_policy_epoch AS policy
 WHERE policy.legal_entity_id=o.legal_entity_id
 AND policy.site_id=o.site_id AND policy.warehouse_id=o.warehouse_id
 AND policy.generation=o.policy_generation FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_STALE_POLICY'; END IF;
 PERFORM 1 FROM hft.stock_hold AS hold
 WHERE hold.legal_entity_id=o.legal_entity_id
 AND hold.site_id=o.site_id AND hold.warehouse_id=o.warehouse_id
 AND hold.active AND (hold.item_code IS NULL OR hold.item_code=o.item_code)
 FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_ACTIVE_HOLD'; END IF;
 PERFORM 1 FROM hft.posting_parent_hold AS hold
 WHERE hold.legal_entity_id=o.legal_entity_id AND hold.active
 AND (hold.scope_kind='ENTITY' OR
  (hold.scope_kind='SITE' AND hold.site_id=o.site_id))
 AND (hold.expires_at IS NULL OR hold.expires_at>pg_catalog.clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM hft.posting_parent_hold_clearance AS clear
  WHERE clear.legal_entity_id=hold.legal_entity_id AND clear.hold_id=hold.hold_id)
 FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_PARENT_HOLD_ACTIVE'; END IF;
 SELECT hft.p0_resolve_count_leaf_v1(
  o.legal_entity_id,o.warehouse_id,o.leaf_location_id) INTO leaf_name;
 PERFORM 1 FROM hft.item_version_catalog AS v
 JOIN hft.item AS i ON i.legal_entity_id=v.legal_entity_id
  AND i.item_code=v.item_code
 WHERE v.legal_entity_id=o.legal_entity_id AND v.item_code=o.item_code
 AND v.version_code=o.product_version_code AND i.active
 AND (v.state='ACTIVE' OR v.state='RETIRED' AND o.action_kind='RETURN')
 FOR SHARE OF v,i;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_VERSION_NOT_ACTIVE'; END IF;
 IF o.custodian_employee_id<>'' THEN
  PERFORM 1 FROM hft.employee AS employee
  WHERE employee.legal_entity_id=o.legal_entity_id
   AND employee.employee_id=o.custodian_employee_id
   AND employee.site_id=o.site_id AND employee.active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_CUSTODIAN_NOT_ACTIVE'; END IF;
 END IF;
 IF o.serial_no<>'' AND EXISTS(SELECT 1 FROM hft.serial_registry AS serial
  WHERE serial.legal_entity_id=o.legal_entity_id
   AND serial.item_code=o.item_code AND serial.serial_no=o.serial_no
   AND serial.product_version_code<>o.product_version_code)
 THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_CROSS_VERSION_SERIAL_DENIED'; END IF;
 IF o.serial_no<>'' AND EXISTS(SELECT 1 FROM hft.stock_account AS other
  WHERE other.legal_entity_id=o.legal_entity_id
   AND other.item_code=o.item_code AND other.serial_key=o.serial_no
   AND other.product_version_code<>o.product_version_code)
 THEN RAISE EXCEPTION 'OPS_A2_ACCOUNT_CROSS_VERSION_ACCOUNT_DENIED'; END IF;
 INSERT INTO hft.stock_account(id,legal_entity_id,site_id,warehouse_id,
  item_code,product_version_code,location_key,account_kind,condition,
  custodian_employee_id,serial_key,batch_key,qty_micro,reserved_micro,version)
 VALUES(o.account_id,o.legal_entity_id,o.site_id,o.warehouse_id,
  o.item_code,o.product_version_code,o.leaf_location_id,o.account_kind,
  o.condition,o.custodian_employee_id,o.serial_no,o.batch_no,0,0,0);
 INSERT INTO hft.ops_a2_account_provision_receipt(
  order_id,account_id,provisioned_by,source_evidence_sha256)
 VALUES(o.order_id,o.account_id,session_user,o.decision_evidence_sha256);
 RETURN o.account_id;
END $provision$;
ALTER FUNCTION hft.ops_a2_provision_zero_account_v2(uuid)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_provision_zero_account_v2(uuid)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

-- Independently pre-enrolled TRANSFER issuance order. It is an approval
-- authority reference, NOT an account and NOT a stock movement. Its issuer
-- must independently attest the original document and corporate people.
CREATE TABLE hft.ops_a2_transfer_issuance_order(
 order_id uuid PRIMARY KEY,document_id uuid NOT NULL UNIQUE,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 item_code text NOT NULL,product_version_code text NOT NULL,
 source_leaf text NOT NULL,destination_leaf text NOT NULL,
 batch_no text NOT NULL DEFAULT '',serial_no text NOT NULL DEFAULT '',
 authorized_micro bigint NOT NULL CHECK(authorized_micro>0),
 revision bigint NOT NULL CHECK(revision>0),
 prepared_subject text NOT NULL,prepared_session_id text NOT NULL,
 checked_subject text NOT NULL,checked_session_id text NOT NULL,
 approved_subject text NOT NULL,approved_session_id text NOT NULL,
 approved_at timestamptz NOT NULL,
 decision_evidence_sha256 text NOT NULL
 CHECK(decision_evidence_sha256~'^[0-9a-f]{64}$'),
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 status text NOT NULL CHECK(status='AUTHORIZED'),
 FOREIGN KEY(legal_entity_id,warehouse_id,site_id)
 REFERENCES hft.warehouse(legal_entity_id,warehouse_id,site_id),
 FOREIGN KEY(legal_entity_id,item_code,product_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 FOREIGN KEY(legal_entity_id,warehouse_id,source_leaf)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 FOREIGN KEY(legal_entity_id,warehouse_id,destination_leaf)
 REFERENCES hft.location(legal_entity_id,warehouse_id,location_id),
 CHECK(source_leaf<>destination_leaf),
 CHECK(prepared_subject<>checked_subject AND
 prepared_subject<>approved_subject AND checked_subject<>approved_subject)
);
CREATE TABLE hft.ops_a2_transfer_issuance_receipt(
 order_id uuid PRIMARY KEY REFERENCES hft.ops_a2_transfer_issuance_order(order_id),
 document_id uuid NOT NULL UNIQUE REFERENCES hft.ops_a2_transfer_document(id),
 issued_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 issuer_login text NOT NULL,original_decision_sha256 text NOT NULL
 CHECK(original_decision_sha256~'^[0-9a-f]{64}$')
);
CREATE TRIGGER immutable_ops_a2_transfer_order BEFORE UPDATE OR DELETE
 ON hft.ops_a2_transfer_issuance_order FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();
CREATE TRIGGER immutable_ops_a2_transfer_issuance_receipt BEFORE UPDATE OR DELETE
 ON hft.ops_a2_transfer_issuance_receipt FOR EACH ROW
 EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_transfer_issuance_order,
 hft.ops_a2_transfer_issuance_receipt FROM PUBLIC,hft_r1_app_runtime;

-- Only the independently governed issuance order may create an AUTHORIZED
-- transfer document; there is no DRAFT->AUTHORIZED runtime shortcut.
CREATE OR REPLACE FUNCTION hft.ops_a2_issue_transfer_document_v2(p_order uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $issue_transfer$
DECLARE
 o hft.ops_a2_transfer_issuance_order%ROWTYPE;
 maker text;checker text;approver text;policy_generation bigint;
 leaf_name text;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_INDEPENDENT_ISSUER_LOGIN_REQUIRED'; END IF;
 SELECT * INTO o FROM hft.ops_a2_transfer_issuance_order
 WHERE order_id=p_order AND status='AUTHORIZED' FOR SHARE;
 IF o.order_id IS NULL OR EXISTS(
  SELECT 1 FROM hft.ops_a2_transfer_issuance_receipt WHERE order_id=p_order)
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_ORDER_ABSENT_OR_CONSUMED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||o.legal_entity_id||':'||o.site_id||':'||o.warehouse_id,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:STOCK:'||o.legal_entity_id||':'||o.warehouse_id||':'||
   o.item_code||':'||o.batch_no||':'||o.serial_no,0));
 maker:=hft.p2_qualified_human_v1(o.legal_entity_id,o.prepared_subject,
  o.prepared_session_id,'TRANSFER','PREPARER',pg_catalog.clock_timestamp());
 checker:=hft.p2_qualified_human_v1(o.legal_entity_id,o.checked_subject,
  o.checked_session_id,'TRANSFER','CHECKER',pg_catalog.clock_timestamp());
 approver:=hft.p2_qualified_human_v1(o.legal_entity_id,o.approved_subject,
  o.approved_session_id,'TRANSFER','APPROVER',pg_catalog.clock_timestamp());
 IF maker IS NULL OR checker IS NULL OR approver IS NULL OR
 maker=checker OR maker=approver OR checker=approver
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_STABLE_PERSON_INDEPENDENCE_REQUIRED'; END IF;
 SELECT generation INTO policy_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=o.legal_entity_id AND site_id=o.site_id
 AND warehouse_id=o.warehouse_id FOR SHARE;
 IF policy_generation IS NULL OR policy_generation<>o.policy_generation
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_POLICY_STALE'; END IF;
 PERFORM 1 FROM hft.posting_action_policy AS pol
 WHERE pol.legal_entity_id=o.legal_entity_id AND pol.site_id=o.site_id
 AND pol.warehouse_id=o.warehouse_id AND pol.action_kind='TRANSFER'
 AND pol.require_preparer AND pol.require_checker
 AND pol.require_independent_approver
 AND pg_catalog.clock_timestamp()>=pol.valid_from
 AND pg_catalog.clock_timestamp()<pol.valid_until
 ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_CURRENT_POLICY_MISSING'; END IF;
 PERFORM 1 FROM hft.stock_hold AS hold WHERE hold.active
 AND hold.legal_entity_id=o.legal_entity_id
 AND hold.site_id=o.site_id AND hold.warehouse_id=o.warehouse_id
 AND (hold.item_code IS NULL OR hold.item_code=o.item_code) FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_STOCK_HOLD_ACTIVE'; END IF;
 PERFORM 1 FROM hft.posting_parent_hold AS hold
 WHERE hold.active AND hold.legal_entity_id=o.legal_entity_id
 AND (hold.scope_kind='ENTITY' OR hold.scope_kind='SITE' AND hold.site_id=o.site_id)
 AND (hold.expires_at IS NULL OR hold.expires_at>pg_catalog.clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM hft.posting_parent_hold_clearance AS clear
  WHERE clear.legal_entity_id=hold.legal_entity_id AND clear.hold_id=hold.hold_id)
 FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_PARENT_HOLD_ACTIVE'; END IF;
 SELECT hft.p0_resolve_count_leaf_v1(o.legal_entity_id,o.warehouse_id,
  o.source_leaf) INTO leaf_name;
 SELECT hft.p0_resolve_count_leaf_v1(o.legal_entity_id,o.warehouse_id,
  o.destination_leaf) INTO leaf_name;
 PERFORM 1 FROM hft.item_version_catalog AS v
 WHERE v.legal_entity_id=o.legal_entity_id AND v.item_code=o.item_code
 AND v.version_code=o.product_version_code AND v.state='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_VERSION_INACTIVE'; END IF;
 INSERT INTO hft.ops_a2_transfer_document(
  id,legal_entity_id,site_id,warehouse_id,item_code,product_version_code,
  source_leaf,destination_leaf,batch_no,serial_no,authorized_micro,
  moved_micro,revision,status,prepared_by,checked_by,approved_by,
  approved_at,approval_evidence_sha256)
 VALUES(o.document_id,o.legal_entity_id,o.site_id,o.warehouse_id,
  o.item_code,o.product_version_code,o.source_leaf,o.destination_leaf,
  o.batch_no,o.serial_no,o.authorized_micro,0,o.revision,'AUTHORIZED',
  o.prepared_subject,o.checked_subject,o.approved_subject,o.approved_at,
  o.decision_evidence_sha256);
 INSERT INTO hft.ops_a2_transfer_issuance_receipt(
  order_id,document_id,issuer_login,original_decision_sha256)
 VALUES(o.order_id,o.document_id,session_user,o.decision_evidence_sha256);
 RETURN o.document_id;
END $issue_transfer$;
ALTER FUNCTION hft.ops_a2_issue_transfer_document_v2(uuid)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_issue_transfer_document_v2(uuid)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

-- Independently authorized SOURCE BINDING issuance. Reads a genuine P0 HMAC,
-- P2 payload and immutable human approval/decision records. It cannot CREATE
-- an approval or provision stock or use a browser-provided approver.
-- RETURN is intentionally separate until the signed RETURN source verifier
-- is independently installed; never reinterpret the legacy P0 HMAC kind.
CREATE OR REPLACE FUNCTION hft.ops_a2_issue_source_binding_v2(
 p0 jsonb,p0_proof jsonb,p2 jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $issue_binding$
DECLARE
 actor text;source_kind text;doc text;action text;
 source_leaf text;destination_leaf text;qty bigint;
 a hft.protected_stock_approval%ROWTYPE;
 d hft.protected_approval_decision%ROWTYPE;
 issuer_person text;approver_person text;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_SOURCE_INDEPENDENT_ISSUER_LOGIN_REQUIRED'; END IF;
 PERFORM hft.ops_a_payload_fields_v2(p2);
 IF p0->>'kind'='RETURN' THEN
  actor:=hft.ops_a2_verify_return_proof_v1(p0,p0_proof);
 ELSE
  actor:=hft.p0_verify_stores_proof_v1(p0,p0_proof);
 END IF;
 IF p0->>'kind' NOT IN('IN','OUT','TRANSFER','RETURN') OR
 p2->>'actorSubject'<>actor OR
 p2->>'commandId'<>p0->>'requestId' OR
 p2->>'idempotencyKey'<>p0->>'requestId' OR
 p2->>'legalEntityId'<>p0->>'legalEntityId' OR
 p2->>'siteId'<>p0->>'siteId' OR
 p2->>'warehouseId'<>p0->>'warehouseId' OR
 p2->>'itemCode'<>p0->>'itemCode' OR
 p2->>'productVersion'<>p0->>'productVersion' OR
 p2->>'controlType'<>p0->>'controlType' OR
 p2->>'serialNo'<>p0->>'serialNo' OR
 p2->>'batchNo'<>p0->>'batchNo' OR
 (p2->>'quantityMicro')::bigint<>(
  (p0->>'quantity')::numeric*1000000)::bigint
 THEN RAISE EXCEPTION 'OPS_A2_ISSUER_ORIGINAL_SIGNED_P0_MISMATCH'; END IF;
 source_kind:=CASE p0->>'kind'
 WHEN 'IN' THEN 'RECEIVE' WHEN 'OUT' THEN 'ISSUE'
 WHEN 'RETURN' THEN 'RETURN' ELSE 'TRANSFER' END;
 IF p2->>'kind'<>source_kind
 THEN RAISE EXCEPTION 'OPS_A2_ISSUER_KIND_MISMATCH'; END IF;
 doc:=CASE p0->>'kind' WHEN 'IN' THEN p0->>'grnId'
  WHEN 'OUT' THEN p0->>'issueDocumentId'
  WHEN 'RETURN' THEN p0->>'returnDocumentId'
  ELSE p0->>'transferDocumentId' END;
 IF doc !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
 OR p2->>'sourceDocumentId'<>pg_catalog.lower(doc)
 THEN RAISE EXCEPTION 'OPS_A2_ISSUER_CANONICAL_UUID_INVALID'; END IF;
 source_leaf:=CASE p0->>'kind' WHEN 'IN' THEN ''
 WHEN 'OUT' THEN p0->>'leafLocationId'
 WHEN 'RETURN' THEN p2->>'sourceLeafId'
 ELSE p0->>'sourceLeafId' END;
 destination_leaf:=CASE p0->>'kind' WHEN 'IN' THEN p0->>'leafLocationId'
 WHEN 'OUT' THEN '' WHEN 'RETURN' THEN p0->>'leafLocationId'
 ELSE p0->>'destinationLeafId' END;
 IF p2->>'sourceLeafId'<>source_leaf
 OR p2->>'destinationLeafId'<>destination_leaf
 THEN RAISE EXCEPTION 'OPS_A2_ISSUER_PHYSICAL_LEAF_MISMATCH'; END IF;
 IF source_kind='RECEIVE' THEN
  IF p0->>'qcState'<>'ACCEPTED'
  OR p2->>'inspectionEvidenceId'<>p0->>'qcEvidenceId'
  OR NOT EXISTS(
   SELECT 1 FROM hft.grn_partial_receipt AS r
   WHERE r.grn_id::text=pg_catalog.lower(doc)
    AND r.legal_entity_id=p2->>'legalEntityId'
    AND r.warehouse_id=p2->>'warehouseId'
    AND r.receipt_key=p0->>'receiptKey'
    AND r.receipt_key||':'||r.line_no::text=p2->>'sourceActionKey'
    AND r.location_id=destination_leaf
    AND r.ops_a2_item_code=p2->>'itemCode'
    AND r.ops_a2_product_version_code=p2->>'productVersion'
    AND r.qc_state='ACCEPTED'
    AND r.evidence_reference=p0->>'qcEvidenceId')
  THEN RAISE EXCEPTION 'OPS_A2_ISSUER_GRN_RECEIPT_LINE_NOT_AUTHORIZED'; END IF;
 ELSIF source_kind='ISSUE' THEN
  IF p2->>'sourceActionKey'<>p0->>'fragmentId'
  OR p2->>'fragmentId'<>p0->>'fragmentId'
  OR p2->>'employeeId'<>p0->>'employeeId'
  OR p2->>'destinationLeafId'<>''
  THEN RAISE EXCEPTION 'OPS_A2_ISSUER_EMPLOYEE_CUSTODY_MISMATCH'; END IF;
 ELSIF source_kind='RETURN' THEN
  IF p2->>'sourceActionKey'<>p0->>'returnLineKey'
  OR p2->>'fragmentId'<>p0->>'returnLineKey'
  OR p2->>'employeeId'<>p0->>'employeeId'
  OR p2->>'originalIssueId'<>p0->>'originalIssueId'
  OR p2->>'inspectionEvidenceId'<>p0->>'inspectionEvidenceId'
  OR p2->>'inspectedCondition'<>p0->>'inspectedCondition'
  OR p2->>'sourceAccountId'=p2->>'destinationAccountId'
  OR NOT EXISTS(SELECT 1 FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS issued ON issued.id=cu.issue_command_id
   WHERE issued.legal_entity_id=p2->>'legalEntityId'
   AND issued.site_id=p2->>'siteId'
   AND issued.warehouse_id=p2->>'warehouseId'
   AND issued.command_id=p2->>'originalIssueId'
   AND issued.kind='ISSUE'
   AND issued.product_version_code=p2->>'productVersion'
   AND cu.legal_entity_id=issued.legal_entity_id
   AND cu.employee_id=p2->>'employeeId'
   AND cu.item_code=p2->>'itemCode'
   AND cu.product_version_code=p2->>'productVersion'
   AND cu.location_id=p2->>'sourceLeafId'
   AND cu.serial_no=p2->>'serialNo'
   AND cu.batch_no=p2->>'batchNo'
   AND cu.issued_micro-cu.returned_micro>=(p2->>'quantityMicro')::bigint)
  THEN RAISE EXCEPTION 'OPS_A2_ISSUER_ORIGINAL_CUSTODY_OR_INSPECTION_DENIED'; END IF;
 ELSE
  IF p2->>'sourceActionKey'<>p2->>'fragmentId'
  OR p2->>'sourceLeafId'=p2->>'destinationLeafId'
  OR p2->>'sourceAccountId'=p2->>'destinationAccountId'
  THEN RAISE EXCEPTION 'OPS_A2_ISSUER_TRANSFER_SOURCE_INVALID'; END IF;
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 'HFT:GATE:'||(p2->>'legalEntityId')||':'||(p2->>'siteId')||':'||
  (p2->>'warehouseId'),0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
 'HFT:STOCK:'||(p2->>'legalEntityId')||':'||(p2->>'warehouseId')||':'||
  (p2->>'itemCode')||':'||(p2->>'batchNo')||':'||(p2->>'serialNo'),0));
 SELECT * INTO a FROM hft.protected_stock_approval
 WHERE legal_entity_id=p2->>'legalEntityId'
 AND approval_id=p2->>'approvalId'
 AND approval_revision=(p2->>'approvalRevision')::bigint FOR SHARE;
 SELECT * INTO d FROM hft.protected_approval_decision
 WHERE legal_entity_id=p2->>'legalEntityId'
 AND approval_id=p2->>'approvalId'
 AND approval_revision=(p2->>'approvalRevision')::bigint FOR SHARE;
 IF a.approval_id IS NULL OR d.approval_id IS NULL OR NOT a.approved
 OR a.kind<>p2->>'kind'
 OR a.site_id<>p2->>'siteId' OR a.warehouse_id<>p2->>'warehouseId'
 OR a.item_code<>p2->>'itemCode'
 OR a.document_id<>p2->>'sourceDocumentId'
 OR a.source_action_key<>p2->>'sourceActionKey'
 OR a.fragment_id<>p2->>'fragmentId'
 OR a.document_revision<>(p2->>'sourceRevision')::bigint
 OR a.approval_revision<>(p2->>'approvalRevision')::bigint
 OR a.policy_generation<>(p2->>'policyGeneration')::bigint
 OR a.actor_subject<>actor OR a.approver_subject<>p2->>'approvedBy'
 OR a.payload_sha256<>hft.ops_a_payload_digest_v2(p2)
 OR a.approved_scope_sha256<>p2->>'approvedPayloadSha256'
 OR a.inspection_evidence_id<>p2->>'inspectionEvidenceId'
 OR a.quantity_micro<>(p2->>'quantityMicro')::bigint
 OR d.payload_sha256<>a.payload_sha256
 OR d.approver_subject<>a.approver_subject
 OR pg_catalog.clock_timestamp()<a.valid_from
 OR pg_catalog.clock_timestamp()>=a.valid_until
 OR EXISTS(SELECT 1 FROM hft.protected_approval_revocation AS rev
  WHERE rev.legal_entity_id=a.legal_entity_id
   AND rev.approval_id=a.approval_id
   AND rev.approval_revision=a.approval_revision)
 OR EXISTS(SELECT 1 FROM hft.protected_approval_supersession AS sup
  WHERE sup.legal_entity_id=a.legal_entity_id
   AND sup.approval_id=a.approval_id
   AND sup.approval_revision=a.approval_revision)
 THEN RAISE EXCEPTION 'OPS_A2_ISSUER_ORIGINAL_APPROVAL_NOT_CURRENT'; END IF;
 SELECT login.person_id INTO issuer_person FROM hft.approval_human_login AS login
 WHERE login.legal_entity_id=a.legal_entity_id AND login.actor_subject=actor;
 approver_person:=hft.p2_qualified_human_v1(a.legal_entity_id,
  d.approver_subject,d.approver_session_id,a.kind,'APPROVER',
  pg_catalog.clock_timestamp());
 IF issuer_person IS NULL OR approver_person IS NULL
 OR issuer_person=approver_person
 THEN RAISE EXCEPTION 'OPS_A2_ISSUER_MAKER_CHECKER_PERSON_DENIED'; END IF;
 INSERT INTO hft.ops_a2_source_binding(
  request_id,legal_entity_id,site_id,warehouse_id,item_code,product_version_code,
  action_kind,source_document_id,source_action_key,source_revision,
  p0_payload_sha256,approved_scope_sha256,approval_id,approval_revision,
  policy_generation,actor_subject,approver_subject,source_leaf,destination_leaf,
  source_account_id,destination_account_id,source_account_before_version,
  dest_account_before_version,employee_id,original_issue_id,fragment_id,
  inspection_evidence_id,authorized_micro,status,issued_by,issuer_decision_sha256)
 VALUES((p2->>'commandId')::uuid,p2->>'legalEntityId',p2->>'siteId',
  p2->>'warehouseId',p2->>'itemCode',p2->>'productVersion',source_kind,
  p2->>'sourceDocumentId',p2->>'sourceActionKey',
  (p2->>'sourceRevision')::bigint,
  CASE WHEN source_kind='RETURN' THEN hft.ops_a2_return_payload_sha256_v1(p0)
   ELSE hft.p0_stores_payload_sha256_v1(p0) END,
  p2->>'approvedPayloadSha256',p2->>'approvalId',
  (p2->>'approvalRevision')::bigint,(p2->>'policyGeneration')::bigint,
  actor,p2->>'approvedBy',source_leaf,destination_leaf,
  NULLIF(p2->>'sourceAccountId','')::uuid,
  (p2->>'destinationAccountId')::uuid,
  NULLIF(p2->>'sourceAccountBeforeVersion','')::bigint,
  (p2->>'destinationAccountBeforeVersion')::bigint,
  p2->>'employeeId',p2->>'originalIssueId',p2->>'fragmentId',
  p2->>'inspectionEvidenceId',(p2->>'quantityMicro')::bigint,
  'APPROVED',session_user,d.decision_evidence_sha256);
 -- Recheck the typed source, source ceiling, original human approvals, QC,
 -- Holds, actor grants, account revisions and location after INSERT. Any
 -- failure rolls the immutable binding INSERT back inside this transaction.
 PERFORM hft.ops_a2_authorized_source_v2(p2);
 RETURN (p2->>'commandId')::uuid;
END $issue_binding$;
ALTER FUNCTION hft.ops_a2_issue_source_binding_v2(jsonb,jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_issue_source_binding_v2(jsonb,jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

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

-- ===== END SOURCE 1/4 =====

-- ===== BEGIN SOURCE 2/4: PROOF-AUTHORITY =====
-- HFT OPS-A2 V2 PROOF, HUMAN, SOURCE/HOLD AUTHORITY — NONEXECUTABLE.
-- Requires OPS-A2 foundation, P2 and P0 approved source in same staged rollout.
-- THIS FILE IS NOT AUTHORIZED FOR DATABASE EXECUTION.
-- Validate exact 33 field payload and 9 string field proof, then enforce the
-- original-byte domain and session HMAC within the protected transaction.
-- On PostgreSQL failure ALL nonce/source/ledger effects ROLLBACK atomically.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_invocation_v2(p jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp
AS $verify$
DECLARE
 names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 f text; version bigint;issued bigint;expires bigint;at_epoch bigint;
 k hft_secret.invocation_key%ROWTYPE;
 payload_sha text; mac_data bytea;expected bytea;claimed bytea;
 xor_value integer:=0;i integer; qty numeric;
BEGIN
 PERFORM hft.ops_a_payload_fields_v2(p);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_EXACT_KEYS_REQUIRED'; END IF;
 FOREACH f IN ARRAY names LOOP
  IF NOT(proof ? f) OR pg_catalog.jsonb_typeof(proof->f)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_STRING_REQUIRED'; END IF;
 END LOOP;
 IF p->>'contractVersion'<>'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
 OR p->>'kind' NOT IN('RECEIVE','ISSUE','RETURN','TRANSFER')
 OR proof->>'proofVersion'<>'HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED'
 OR proof->>'actorSubject'<>p->>'actorSubject'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_ENCODING_OR_SCOPE_INVALID'; END IF;
 FOREACH f IN ARRAY ARRAY[
  'quantityMicro','sourceRevision','approvalRevision','policyGeneration',
  'destinationAccountBeforeVersion'] LOOP
   IF p->>f !~ '^(0|[1-9][0-9]*)$'
   OR pg_catalog.length(p->>f)>19
   OR (p->>f)::numeric>9223372036854775807
   THEN RAISE EXCEPTION 'OPS_A2_V2_NUMERIC_FIELD_INVALID:%',f; END IF;
 END LOOP;
 IF (p->>'quantityMicro')::numeric<=0
 OR (p->>'sourceRevision')::numeric<=0
 OR (p->>'approvalRevision')::numeric<=0
 OR (p->>'policyGeneration')::numeric<=0
 THEN RAISE EXCEPTION 'OPS_A2_V2_NONPOSITIVE_QUANTITY_OR_REVISION'; END IF;
 IF p->>'sourceAccountBeforeVersion'<>'' AND
  (p->>'sourceAccountBeforeVersion' !~ '^(0|[1-9][0-9]*)$'
   OR pg_catalog.length(p->>'sourceAccountBeforeVersion')>19
   OR (p->>'sourceAccountBeforeVersion')::numeric>9223372036854775807)
 THEN RAISE EXCEPTION 'OPS_A2_V2_SOURCE_VERSION_INVALID'; END IF;
 IF p->>'approvedBy'=p->>'actorSubject' OR
    (p->>'approvedPayloadSha256') !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'OPS_A2_V2_SELF_APPROVAL_OR_DIGEST_DENIED'; END IF;
 qty:=(p->>'quantityMicro')::numeric;
 IF p->>'controlType' NOT IN ('NONE','SERIAL','BATCH')
 OR p->>'controlType'='SERIAL' AND (
  p->>'serialNo'='' OR p->>'batchNo'<>'' OR qty<>1000000)
 OR p->>'controlType'='BATCH' AND(
  p->>'batchNo'='' OR p->>'serialNo'<>'')
 OR p->>'controlType'='NONE' AND(
  p->>'serialNo'<>'' OR p->>'batchNo'<>'')
 THEN RAISE EXCEPTION 'OPS_A2_V2_TRACEABILITY_INVALID'; END IF;
 IF p->>'kind'='RECEIVE' AND(
  p->>'sourceAccountId'<>'' OR p->>'sourceLeafId'<>''
  OR p->>'sourceAccountBeforeVersion'<>'' OR
  p->>'employeeId'<>'' OR p->>'originalIssueId'<>''
  OR p->>'fragmentId'<>'' OR p->>'inspectionEvidenceId'='')
 THEN RAISE EXCEPTION 'OPS_A2_V2_RECEIPT_SOURCE_INVALID'; END IF;
 IF p->>'kind'='ISSUE' AND(
  p->>'sourceAccountId'='' OR p->>'sourceLeafId'='' OR
  p->>'employeeId'='' OR p->>'fragmentId'='' OR
  p->>'originalIssueId'<>'' OR p->>'destinationLeafId'<>'')
 THEN RAISE EXCEPTION 'OPS_A2_V2_ISSUE_SOURCE_INVALID'; END IF;
 IF p->>'kind'='RETURN' AND(
  p->>'sourceAccountId'='' OR p->>'sourceLeafId'='' OR
  p->>'destinationLeafId'='' OR p->>'employeeId'='' OR
  p->>'fragmentId'='' OR p->>'originalIssueId'='' OR
  p->>'inspectionEvidenceId'='' OR
  p->>'inspectedCondition' NOT IN ('GOOD','DAMAGED','QUARANTINE'))
 THEN RAISE EXCEPTION 'OPS_A2_V2_RETURN_SOURCE_INVALID'; END IF;
 IF p->>'kind'='TRANSFER' AND(
  p->>'sourceAccountId'='' OR p->>'sourceLeafId'='' OR
  p->>'destinationLeafId'='' OR p->>'fragmentId'='' OR
  p->>'sourceLeafId'=p->>'destinationLeafId' OR
  p->>'sourceAccountId'=p->>'destinationAccountId' OR
  p->>'employeeId'<>'' OR p->>'originalIssueId'<>'' OR
  p->>'inspectedCondition'<>'GOOD')
 THEN RAISE EXCEPTION 'OPS_A2_V2_TRANSFER_SCOPE_INVALID'; END IF;
 IF p->>'destinationAccountId'=''
 THEN RAISE EXCEPTION 'OPS_A2_V2_DESTINATION_ACCOUNT_REQUIRED'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expires:=(proof->>'expiresAt')::bigint;
 version:=(proof->>'keyVersion')::bigint;
 IF version>2147483647 OR
  (proof->>'issuedAt')::numeric>9223372036854775807 OR
  (proof->>'expiresAt')::numeric>9223372036854775807
 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_NUMBER_OVERFLOW'; END IF;
 at_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM
  pg_catalog.clock_timestamp()))::bigint;
 IF issued>at_epoch+30 OR expires<=at_epoch OR expires<=issued OR
  expires-issued>60 THEN RAISE EXCEPTION 'OPS_A2_V2_PROOF_EXPIRED'; END IF;
 payload_sha:=hft.ops_a_payload_digest_v2(p);
 IF proof->>'payloadSha256'<>payload_sha
 THEN RAISE EXCEPTION 'OPS_A2_V2_PAYLOAD_DIGEST_MISMATCH'; END IF;
 SELECT * INTO k FROM hft_secret.invocation_key
 WHERE key_version=version::integer FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL OR
  pg_catalog.clock_timestamp()<k.not_before OR
  pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_V2_SIGNING_KEY_REVOKED_OR_UNKNOWN'; END IF;
 -- Mirrors the V2 source codec, not the old P2 V1 19-field MAC.
 mac_data:=hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  proof->>'payloadSha256',proof->>'issuedAt',proof->>'expiresAt',
  proof->>'nonce',proof->>'keyVersion']);
 expected:=hft_crypto.hmac(mac_data,k.key_bytes,'sha256');
 claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 IF pg_catalog.octet_length(expected)<>32 OR
  pg_catalog.octet_length(claimed)<>32 THEN
  RAISE EXCEPTION 'OPS_A2_V2_HMAC_BYTES_INVALID'; END IF;
 FOR i IN 0..31 LOOP
  xor_value:=xor_value | (pg_catalog.get_byte(expected,i) #
                           pg_catalog.get_byte(claimed,i));
 END LOOP;
 IF xor_value<>0 THEN RAISE EXCEPTION 'OPS_A2_V2_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session AS sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_SESSION_REVOKED'; END IF;
 -- Unique key_version + nonce is the only live replay authority.
 -- Normal reauthorization must use a new independently signed nonce, never
 -- resubmit the old proof after an uncertain COMMIT.
 INSERT INTO hft.posting_invocation_nonce(key_version,nonce,actor_subject,
  session_id,command_id,payload_sha256,legal_entity_id,proof_mac_sha256,
  proof_issued_at_epoch,expires_at)
 VALUES(version::integer,proof->>'nonce',proof->>'actorSubject',
  proof->>'sessionId',p->>'commandId',payload_sha,p->>'legalEntityId',
  pg_catalog.encode(hft_crypto.digest(claimed,'sha256'),'hex'),
  issued,pg_catalog.to_timestamp(expires));
 RETURN proof->>'actorSubject';
END $verify$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_verify_invocation_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Bind an existing independent human approval, its immutable source envelope,
-- current policy generation, active human qualifications, exact source
-- document and current Holds. Do NOT trust the client-provided role.
-- SECURITY INVOKER; callable only by privately owned protected writer/reader.
CREATE OR REPLACE FUNCTION hft.ops_a2_authorized_source_v2(p jsonb)
RETURNS hft.ops_a2_source_binding
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp
AS $authorized$
DECLARE
 b hft.ops_a2_source_binding%ROWTYPE;
 a hft.protected_stock_approval%ROWTYPE;
 d hft.protected_approval_decision%ROWTYPE;
 policy hft.posting_policy_epoch%ROWTYPE;
 action_policy hft.posting_action_policy%ROWTYPE;
 actor_person text;approver_person text;
 inspector_person text;location_name text;source_rev bigint;
 source_approver text;source_qty bigint;source_used bigint;source_version text;
BEGIN
 PERFORM hft.ops_a_payload_fields_v2(p);
 SELECT * INTO b FROM hft.ops_a2_source_binding AS sb
 WHERE sb.request_id=(p->>'commandId')::uuid FOR SHARE;
 IF b.request_id IS NULL OR b.status<>'APPROVED'
  OR b.legal_entity_id<>p->>'legalEntityId'
  OR b.site_id<>p->>'siteId' OR b.warehouse_id<>p->>'warehouseId'
  OR b.item_code<>p->>'itemCode'
  OR b.product_version_code<>p->>'productVersion'
  OR b.action_kind<>p->>'kind'
  OR b.source_document_id<>p->>'sourceDocumentId'
  OR b.source_action_key<>p->>'sourceActionKey'
  OR b.source_revision<>(p->>'sourceRevision')::bigint
  OR b.approval_id<>p->>'approvalId'
  OR b.approval_revision<>(p->>'approvalRevision')::bigint
  OR b.policy_generation<>(p->>'policyGeneration')::bigint
  OR b.actor_subject<>p->>'actorSubject'
  OR b.approver_subject<>p->>'approvedBy'
  OR b.source_leaf<>p->>'sourceLeafId'
  OR b.destination_leaf<>p->>'destinationLeafId'
  OR COALESCE(b.source_account_id::text,'')<>p->>'sourceAccountId'
  OR b.destination_account_id::text<>p->>'destinationAccountId'
  OR COALESCE(b.source_account_before_version::text,'')<>
     p->>'sourceAccountBeforeVersion'
  OR b.dest_account_before_version::text<>p->>'destinationAccountBeforeVersion'
  OR b.employee_id<>p->>'employeeId'
  OR b.original_issue_id<>p->>'originalIssueId'
  OR b.fragment_id<>p->>'fragmentId'
  OR b.inspection_evidence_id<>p->>'inspectionEvidenceId'
  OR b.authorized_micro<>(p->>'quantityMicro')::bigint
  OR b.approved_scope_sha256<>p->>'approvedPayloadSha256'
 THEN RAISE EXCEPTION 'OPS_A2_V2_SIGNED_SOURCE_BINDING_STALE_OR_FORGED'; END IF;
 SELECT * INTO a FROM hft.protected_stock_approval AS approval
 WHERE approval.legal_entity_id=b.legal_entity_id
 AND approval.approval_id=b.approval_id
 AND approval.approval_revision=b.approval_revision FOR SHARE;
 IF a.approval_id IS NULL OR NOT a.approved
 OR a.kind<>b.action_kind OR a.site_id<>b.site_id
 OR a.warehouse_id<>b.warehouse_id OR a.item_code<>b.item_code
 OR a.document_id<>b.source_document_id
 OR a.source_action_key<>b.source_action_key
 OR a.fragment_id<>b.fragment_id OR a.approver_subject<>b.approver_subject
 OR a.actor_subject<>b.actor_subject OR
  a.approved_scope_sha256<>b.approved_scope_sha256 OR
  a.document_revision<>b.source_revision OR
  a.policy_generation<>b.policy_generation OR
  a.payload_sha256<>hft.ops_a_payload_digest_v2(p) OR
  a.quantity_micro<>b.authorized_micro OR
  a.inspection_evidence_id<>b.inspection_evidence_id OR
  a.location_id<>CASE WHEN b.action_kind='RECEIVE' THEN b.destination_leaf ELSE b.source_leaf END
 OR pg_catalog.clock_timestamp()<a.valid_from
 OR pg_catalog.clock_timestamp()>=a.valid_until
 OR EXISTS(SELECT 1 FROM hft.protected_approval_revocation x
  WHERE x.legal_entity_id=b.legal_entity_id
   AND x.approval_id=b.approval_id
   AND x.approval_revision=b.approval_revision)
 OR EXISTS(SELECT 1 FROM hft.protected_approval_supersession x
  WHERE x.legal_entity_id=b.legal_entity_id
   AND x.approval_id=b.approval_id
   AND x.approval_revision=b.approval_revision)
 THEN RAISE EXCEPTION 'OPS_A2_V2_APPROVAL_NOT_CURRENT'; END IF;
 SELECT * INTO policy FROM hft.posting_policy_epoch AS epoch
 WHERE epoch.legal_entity_id=b.legal_entity_id
 AND epoch.site_id=b.site_id AND epoch.warehouse_id=b.warehouse_id FOR SHARE;
 IF policy.generation IS NULL OR policy.generation<>b.policy_generation
 THEN RAISE EXCEPTION 'OPS_A2_V2_POLICY_GENERATION_STALE'; END IF;
 SELECT * INTO d FROM hft.protected_approval_decision AS dec
 WHERE dec.legal_entity_id=b.legal_entity_id
 AND dec.approval_id=b.approval_id AND dec.approval_revision=b.approval_revision FOR SHARE;
 SELECT * INTO action_policy FROM hft.posting_action_policy AS pol
 WHERE pol.legal_entity_id=b.legal_entity_id AND pol.site_id=b.site_id
 AND pol.warehouse_id=b.warehouse_id AND pol.action_kind=b.action_kind
 ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;
 IF d.approval_id IS NULL OR
  d.policy_revision IS DISTINCT FROM a.policy_revision OR
  d.source_revision<>b.source_revision OR
  d.payload_sha256<>hft.ops_a_payload_digest_v2(p) OR
  action_policy.policy_revision IS DISTINCT FROM d.policy_revision OR
  pg_catalog.clock_timestamp()<action_policy.valid_from OR
  pg_catalog.clock_timestamp()>=action_policy.valid_until OR
  d.approver_subject<>b.approver_subject
 THEN RAISE EXCEPTION 'OPS_A2_V2_APPROVAL_DECISION_POLICY_STALE'; END IF;
 -- Real-person identity, not distinct usernames. No same human as maker and
 -- checker/approver even when multiple active accounts belong to that person.
 SELECT person_id INTO actor_person FROM hft.approval_human_login
 WHERE legal_entity_id=b.legal_entity_id AND actor_subject=b.actor_subject;
 SELECT person_id INTO approver_person FROM hft.approval_human_login
 WHERE legal_entity_id=b.legal_entity_id AND actor_subject=b.approver_subject;
 IF actor_person IS NULL OR approver_person IS NULL OR
  actor_person=approver_person OR
  hft.p2_qualified_human_v1(b.legal_entity_id,b.approver_subject,
   d.approver_session_id,b.action_kind,'APPROVER',
   pg_catalog.clock_timestamp()) IS DISTINCT FROM approver_person
 THEN RAISE EXCEPTION 'OPS_A2_V2_MAKER_CHECKER_PERSON_INDEPENDENCE_DENIED'; END IF;
 IF action_policy.require_checker THEN
  IF d.checked_subject IS NULL OR d.checked_session_id IS NULL OR
   d.checked_subject=b.actor_subject OR d.checked_subject=b.approver_subject OR
   (SELECT person_id FROM hft.approval_human_login
    WHERE legal_entity_id=b.legal_entity_id
    AND actor_subject=d.checked_subject) IN(actor_person,approver_person)
   OR hft.p2_qualified_human_v1(b.legal_entity_id,d.checked_subject,
    d.checked_session_id,b.action_kind,'CHECKER',
    pg_catalog.clock_timestamp()) IS NULL
  THEN RAISE EXCEPTION 'OPS_A2_V2_INDEPENDENT_CHECKER_REQUIRED'; END IF;
 END IF;
 IF b.action_kind='RETURN' THEN
  inspector_person:=hft.p2_qualified_human_v1(b.legal_entity_id,
   d.inspector_subject,d.inspector_session_id,b.action_kind,'INSPECTOR',
   pg_catalog.clock_timestamp());
  IF inspector_person IS NULL OR inspector_person=actor_person OR
   inspector_person=approver_person OR
   NOT EXISTS(SELECT 1 FROM hft.return_inspection_attestation AS inspection
    WHERE inspection.legal_entity_id=b.legal_entity_id
    AND inspection.return_document_id=b.source_document_id
    AND inspection.evidence_id=b.inspection_evidence_id
    AND inspection.approval_id=b.approval_id
    AND inspection.approval_revision=b.approval_revision
    AND inspection.inspector_subject=d.inspector_subject)
  THEN RAISE EXCEPTION 'OPS_A2_V2_RETURN_INSPECTION_NOT_INDEPENDENT'; END IF;
 END IF;
 -- Bounded persisted grant and warehouse/entity/site activation.
 PERFORM 1 FROM hft.actor_warehouse_grant AS g
 WHERE g.legal_entity_id=b.legal_entity_id AND g.site_id=b.site_id
 AND g.warehouse_id=b.warehouse_id AND g.actor_subject=b.actor_subject
 AND g.active AND g.may_post FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_ACTOR_SCOPE_NOT_AUTHORIZED'; END IF;
 PERFORM 1 FROM hft.warehouse AS w
 JOIN hft.site AS s ON s.legal_entity_id=w.legal_entity_id AND s.id=w.site_id
 JOIN hft.legal_entity AS le ON le.id=w.legal_entity_id
 WHERE w.legal_entity_id=b.legal_entity_id AND w.site_id=b.site_id
 AND w.warehouse_id=b.warehouse_id AND w.active AND s.active AND le.active
 FOR SHARE OF w,s,le;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_WAREHOUSE_INACTIVE'; END IF;
 PERFORM 1 FROM hft.item AS i
 JOIN hft.item_version_catalog AS v ON v.legal_entity_id=i.legal_entity_id
 AND v.item_code=i.item_code AND v.version_code=b.product_version_code
 JOIN hft.item_version_photo_coverage_v1 AS photo
 ON photo.legal_entity_id=v.legal_entity_id AND photo.item_code=v.item_code
 AND photo.version_code=v.version_code
 WHERE i.legal_entity_id=b.legal_entity_id AND i.item_code=b.item_code
 AND i.active AND i.control_type=p->>'controlType'
 AND (v.state='ACTIVE' OR (v.state='RETIRED' AND b.action_kind='RETURN'))
 AND photo.approved_primary_count=1
 FOR SHARE OF i,v;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_ITEM_VERSION_PHOTO_NOT_QUALIFIED'; END IF;
 -- Only certified, currently active exact leaf nodes; never trust caller path.
 IF b.source_leaf<>'' THEN
  SELECT hft.p0_resolve_count_leaf_v1(b.legal_entity_id,b.warehouse_id,b.source_leaf)
   INTO location_name;
 END IF;
 -- ISSUE has NO destination leaf. Its credited account is employee custody,
 -- retaining the physical SOURCE leaf. Never resolve an empty leaf as stock.
 IF b.action_kind='ISSUE' THEN
  IF b.destination_leaf<>'' OR b.source_leaf='' THEN
   RAISE EXCEPTION 'OPS_A2_ISSUE_PHYSICAL_DESTINATION_FORBIDDEN'; END IF;
  PERFORM 1 FROM hft.stock_account AS custody
  WHERE custody.id=b.destination_account_id
    AND custody.legal_entity_id=b.legal_entity_id
    AND custody.site_id=b.site_id AND custody.warehouse_id=b.warehouse_id
    AND custody.item_code=b.item_code
    AND custody.product_version_code=b.product_version_code
    AND custody.location_key=b.source_leaf
    AND custody.account_kind='CUSTODY'
    AND custody.condition='GOOD'
    AND custody.custodian_employee_id=b.employee_id
    AND custody.batch_key=p->>'batchNo'
    AND custody.serial_key=p->>'serialNo'
    AND custody.version=b.dest_account_before_version
  FOR SHARE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'OPS_A2_ISSUE_CUSTODY_DESTINATION_NOT_BOUND'; END IF;
 ELSE
  IF b.destination_leaf='' THEN
   RAISE EXCEPTION 'OPS_A2_PHYSICAL_DESTINATION_REQUIRED'; END IF;
  SELECT hft.p0_resolve_count_leaf_v1(
   b.legal_entity_id,b.warehouse_id,b.destination_leaf)
   INTO location_name;
 END IF;
 -- Parent holds plus exact item/warehouse Holds are checked after shared GATE
 -- advisory lock acquired by the protected writer.
 PERFORM 1 FROM hft.posting_parent_hold AS h
 WHERE h.legal_entity_id=b.legal_entity_id AND h.active
 AND (h.scope_kind='ENTITY' OR (h.scope_kind='SITE' AND h.site_id=b.site_id))
 AND (h.expires_at IS NULL OR h.expires_at>pg_catalog.clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM hft.posting_parent_hold_clearance AS cleared
  WHERE cleared.legal_entity_id=h.legal_entity_id
    AND cleared.hold_id=h.hold_id)
 FOR SHARE OF h;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_PARENT_HOLD_ACTIVE'; END IF;
 PERFORM 1 FROM hft.stock_hold AS h WHERE h.active
  AND h.legal_entity_id=b.legal_entity_id
  AND h.site_id=b.site_id AND h.warehouse_id=b.warehouse_id
  AND (h.item_code IS NULL OR h.item_code=b.item_code)
  AND (h.employee_id IS NULL OR h.employee_id=NULLIF(b.employee_id,''))
  AND (h.source_document_id IS NULL OR h.source_document_id=b.source_document_id)
 FOR SHARE OF h;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_V2_STOCK_HOLD_ACTIVE'; END IF;
 -- Recheck exact typed original source revisions and cumulative line ceilings.
 IF b.action_kind='RECEIVE' THEN
  SELECT g.authorization_revision,g.authorized_by,r.accepted_micro,
   r.ops_a2_product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.grn AS g
  JOIN hft.grn_partial_receipt AS r ON r.grn_id=g.id
  JOIN hft.grn_line AS gl ON gl.grn_id=r.grn_id AND gl.line_no=r.line_no
  JOIN hft.supplier AS sup ON sup.legal_entity_id=g.legal_entity_id
    AND sup.supplier_id=g.supplier_id
  JOIN hft.supplier_invoice AS inv ON inv.id=g.invoice_id
  WHERE g.id::text=b.source_document_id AND g.legal_entity_id=b.legal_entity_id
  AND g.warehouse_id=b.warehouse_id
  AND r.receipt_key||':'||r.line_no::text=b.source_action_key
  AND r.legal_entity_id=b.legal_entity_id AND r.warehouse_id=b.warehouse_id
  AND r.location_id=b.destination_leaf
  AND r.ops_a2_item_code=b.item_code
  AND r.ops_a2_product_version_code=b.product_version_code
  AND r.batch_no=p->>'batchNo' AND r.serial_no=p->>'serialNo'
  AND gl.item_code=b.item_code AND r.qc_state='ACCEPTED'
  AND r.evidence_reference=b.inspection_evidence_id
  AND g.status IN('AUTHORIZED','PARTIALLY_RECEIVED')
  AND sup.active AND inv.status='VERIFIED'
  FOR SHARE OF g,r,gl,sup,inv;
 ELSIF b.action_kind='ISSUE' THEN
  SELECT i.authorization_revision,i.approved_by,l.authorized_micro-l.issued_micro,
   l.ops_a2_product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.material_issue AS i
  JOIN hft.material_issue_line AS l ON l.issue_id=i.id
  JOIN hft.employee AS emp ON emp.legal_entity_id=i.legal_entity_id
    AND emp.employee_id=i.employee_id
  WHERE i.id::text=b.source_document_id AND i.legal_entity_id=b.legal_entity_id
   AND i.warehouse_id=b.warehouse_id AND i.employee_id=b.employee_id
   AND emp.active AND emp.site_id=b.site_id
   AND i.status IN('AUTHORIZED','ISSUED')
   AND l.source_action_key=b.source_action_key
   AND l.item_code=b.item_code AND l.location_id=b.source_leaf
   AND l.ops_a2_product_version_code=b.product_version_code
   AND l.batch_no=p->>'batchNo' AND l.serial_no=p->>'serialNo'
  FOR SHARE OF i,l,emp;
 ELSIF b.action_kind='RETURN' THEN
  SELECT mr.authorization_revision,mr.accepted_by,l.authorized_micro-l.returned_micro,
   l.ops_a2_product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.material_return AS mr
  JOIN hft.material_issue AS i ON i.id=mr.issue_id
  JOIN hft.material_return_line AS l ON l.return_id=mr.id
  WHERE mr.id::text=b.source_document_id AND mr.legal_entity_id=b.legal_entity_id
    AND mr.warehouse_id=b.warehouse_id AND mr.condition=p->>'inspectedCondition'
    AND mr.status IN('AUTHORIZED','RETURNED') AND i.employee_id=b.employee_id
    AND l.source_action_key=b.source_action_key
    AND l.original_issue_command_id=b.original_issue_id
    AND l.item_code=b.item_code AND l.location_id=b.source_leaf
    AND l.ops_a2_product_version_code=b.product_version_code
    AND l.batch_no=p->>'batchNo' AND l.serial_no=p->>'serialNo'
  FOR SHARE OF mr,i,l;
 ELSE
  SELECT x.revision,x.approved_by,x.authorized_micro-x.moved_micro,
   x.product_version_code
   INTO source_rev,source_approver,source_qty,source_version
  FROM hft.ops_a2_transfer_document AS x
  WHERE x.id::text=b.source_document_id
  AND x.legal_entity_id=b.legal_entity_id
  AND x.site_id=b.site_id AND x.warehouse_id=b.warehouse_id
  AND x.item_code=b.item_code AND x.product_version_code=b.product_version_code
  AND x.source_leaf=b.source_leaf AND x.destination_leaf=b.destination_leaf
  AND x.batch_no=p->>'batchNo' AND x.serial_no=p->>'serialNo'
  AND x.status IN('AUTHORIZED','PARTIALLY_MOVED')
  FOR SHARE OF x;
 END IF;
 IF source_rev IS NULL OR source_rev<>b.source_revision
 OR source_approver IS DISTINCT FROM b.approver_subject
 OR source_version IS DISTINCT FROM b.product_version_code
 OR source_qty IS NULL OR source_qty<b.authorized_micro
 THEN RAISE EXCEPTION 'OPS_A2_V2_SOURCE_REVISION_OR_CEILING_CHANGED'; END IF;
 RETURN b;
END $authorized$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_authorized_source_v2(jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- ===== END SOURCE 2/4 =====

-- ===== BEGIN SOURCE 3/4: WRITER =====
-- HFT OPS-A2 — SINGLE VERSIONED P2 WRITER AND ATOMIC SEAL CANDIDATE
-- Source review only. SQL execution, migrations, role grants, Neon and
-- production remain UNAUTHORIZED (Gate R / Gate A HOLD).
-- Requires the OPS-A2 foundation and proof/authorization source in the
-- same independently approved transaction; never install files separately.
-- V1 triggers remain in force for historic V1 entries; only the V2
-- command is allowed two distinct leaf locations. No silent overwrite
-- of P1/0005 immutable source validation is permitted.
CREATE OR REPLACE FUNCTION hft.ops_a2_check_stock_entry_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $identity$
DECLARE c hft.stock_command%ROWTYPE; a hft.stock_account%ROWTYPE;
 expected_leaf text; required_custodian text;
BEGIN
 SELECT * INTO c FROM hft.stock_command WHERE id=NEW.command_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'OPS_A2_ENTRY_COMMAND_MISSING'; END IF;
 IF NEW.bucket='EXTERNAL' THEN
  IF NEW.account_id IS NOT NULL OR NEW.account_before_version IS NOT NULL
   OR NEW.account_after_version IS NOT NULL
  THEN RAISE EXCEPTION 'OPS_A2_EXTERNAL_ACCOUNT_FORBIDDEN'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM hft.stock_account WHERE id=NEW.account_id;
 IF a.id IS NULL OR a.account_kind<>NEW.bucket
  OR a.legal_entity_id<>c.legal_entity_id
  OR a.site_id<>c.site_id OR a.warehouse_id<>c.warehouse_id
  OR a.item_code<>c.item_code
  OR a.serial_key<>COALESCE(NEW.serial_no,'')
  OR a.batch_key<>COALESCE(NEW.batch_no,'')
  OR (NEW.bucket='CUSTODY' AND a.custodian_employee_id<>COALESCE(NEW.employee_id,''))
 THEN RAISE EXCEPTION 'OPS_A2_ENTRY_OWNER_VERSION_OR_HOLDER_MISMATCH'; END IF;
 IF c.payload_contract_version='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED' THEN
  IF NEW.product_version_code<>c.product_version_code
   OR a.product_version_code<>c.product_version_code
   OR NEW.account_before_version IS NULL
   OR NEW.account_after_version<>NEW.account_before_version+1
  THEN RAISE EXCEPTION 'OPS_A2_LEDGER_VERSION_OR_ACCOUNT_SEQUENCE_INVALID'; END IF;
  expected_leaf:=CASE WHEN NEW.qty_delta_micro<0 OR c.kind='ISSUE'
     THEN c.ops_a2_source_leaf ELSE c.ops_a2_destination_leaf END;
  IF a.location_key<>expected_leaf OR
    (NEW.qty_delta_micro<0 AND NEW.account_id<>c.ops_a2_source_account_id)
    OR (NEW.qty_delta_micro>0 AND NEW.account_id<>c.ops_a2_destination_account_id)
  THEN RAISE EXCEPTION 'OPS_A2_IMMUTABLE_LEAF_OR_LEG_IDENTITY_INVALID'; END IF;
 ELSE
  IF a.location_key<>c.location_id
  THEN RAISE EXCEPTION 'OPS_A2_LEGACY_LOCATION_IDENTITY_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $identity$;
DROP TRIGGER stock_entry_account_identity_v2 ON hft.stock_entry;
CREATE TRIGGER stock_entry_account_identity_v2 BEFORE INSERT ON hft.stock_entry
 FOR EACH ROW EXECUTE FUNCTION hft.ops_a2_check_stock_entry_v2();

-- Existing scoped V1 parent remains unchanged for V1. This V2 trigger
-- protects source row shape at INSERT, independently of the app resolver.
CREATE OR REPLACE FUNCTION hft.ops_a2_source_parent_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $parent$
DECLARE b hft.ops_a2_source_binding%ROWTYPE;
BEGIN
 SELECT * INTO b FROM hft.ops_a2_source_binding
  WHERE request_id=NEW.command_id::uuid
  AND legal_entity_id=NEW.legal_entity_id
  AND site_id=NEW.site_id AND warehouse_id=NEW.warehouse_id
  AND item_code=NEW.item_code
  AND product_version_code=NEW.product_version_code
  AND source_document_id=NEW.source_document_id
  AND source_action_key=NEW.source_action_key
  AND action_kind=NEW.kind
  AND source_leaf=NEW.ops_a2_source_leaf
  AND destination_leaf=NEW.ops_a2_destination_leaf
  AND COALESCE(source_account_id::text,'')=
       COALESCE(NEW.ops_a2_source_account_id::text,'')
  AND destination_account_id=NEW.ops_a2_destination_account_id
  FOR SHARE;
 IF b.request_id IS NULL THEN
  RAISE EXCEPTION 'OPS_A2_POSTED_PARENT_SOURCE_BINDING_MISSING'; END IF;
 RETURN NEW;
END $parent$;
CREATE TRIGGER ops_a2_stock_command_parent_v2
 BEFORE INSERT ON hft.stock_command
 FOR EACH ROW WHEN
  (NEW.payload_contract_version='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED')
 EXECUTE FUNCTION hft.ops_a2_source_parent_v2();

-- V2 immutable double-entry and exact post-state are sealed on the canonical
-- stock_command_seal, not duplicated in a new balance authority.
-- Existing source's "seal" rows are immutable facts.
CREATE OR REPLACE FUNCTION hft.ops_a2_assert_command_seal_v2(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $assertseal$
DECLARE
 c hft.stock_command%ROWTYPE;
 seal hft.stock_command_seal%ROWTYPE;
 envelope hft.ops_a2_command_envelope%ROWTYPE;
 outbox hft.audit_outbox%ROWTYPE;
 outcome hft.stock_command_outcome%ROWTYPE;
 nlegs bigint;delta bigint;missing bigint;
 ledger_digest text;
BEGIN
 SELECT * INTO c FROM hft.stock_command WHERE id=p_id;
 SELECT * INTO seal FROM hft.stock_command_seal WHERE command_id=p_id;
 SELECT * INTO envelope FROM hft.ops_a2_command_envelope WHERE command_uuid=p_id;
 SELECT * INTO outbox FROM hft.audit_outbox WHERE command_id=p_id;
 SELECT * INTO outcome FROM hft.stock_command_outcome WHERE command_id=p_id;
 IF c.id IS NULL OR seal.command_id IS NULL OR envelope.command_uuid IS NULL
 OR outbox.id IS NULL OR outcome.command_id IS NULL
 OR c.payload_contract_version<>'HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
 OR c.payload_sha256<>envelope.payload_sha256
 OR envelope.payload_sha256<>hft.ops_a_payload_digest_v2(envelope.exact_payload)
 OR c.product_version_code<>envelope.exact_payload->>'productVersion'
 OR c.ops_a2_source_leaf<>envelope.exact_payload->>'sourceLeafId'
 OR c.ops_a2_destination_leaf<>envelope.exact_payload->>'destinationLeafId'
 OR seal.product_version_code<>c.product_version_code
 OR seal.quantity_micro<>c.quantity_micro
 OR seal.sealed_by<>c.actor_subject
 OR outbox.canonical_text::jsonb<>outbox.canonical_event
 OR outbox.canonical_sha256<>pg_catalog.encode(hft_crypto.digest(
    pg_catalog.convert_to(outbox.canonical_text,'UTF8'),'sha256'),'hex')
 OR seal.audit_sha256<>outbox.canonical_sha256
 OR seal.outcome_sha256<>pg_catalog.encode(hft_crypto.digest(
    pg_catalog.convert_to(outcome.result::text,'UTF8'),'sha256'),'hex')
 OR (outcome.result->>'commandId')<>c.command_id
 OR (outcome.result->>'payloadSha256')<>c.payload_sha256
 OR outcome.committed_by<>c.actor_subject
 OR NOT EXISTS(SELECT 1 FROM hft.audit_delivery d WHERE d.outbox_id=outbox.id)
 THEN RAISE EXCEPTION 'OPS_A2_V2_IMMUTABLE_SEAL_AUDIT_OR_OUTCOME_INVALID'; END IF;
 SELECT count(*),COALESCE(sum(qty_delta_micro),0)
 INTO nlegs,delta FROM hft.stock_entry WHERE command_id=p_id;
 -- A zero net delta alone is not conservation: forged equal-and-opposite
 -- legs of the wrong magnitude must be rejected at deferred COMMIT.
 IF nlegs<>2 OR delta<>0 OR
   (SELECT count(*) FROM hft.stock_entry AS debit
    WHERE debit.command_id=p_id AND debit.qty_delta_micro=-c.quantity_micro
    AND (debit.account_id IS NOT DISTINCT FROM c.ops_a2_source_account_id)
    AND (debit.account_before_version IS NOT DISTINCT FROM
      NULLIF(envelope.exact_payload->>'sourceAccountBeforeVersion','')::bigint
      OR c.kind='RECEIVE' AND debit.account_before_version IS NULL)
    AND (debit.account_after_version=debit.account_before_version+1
      OR c.kind='RECEIVE' AND debit.account_after_version IS NULL))<>1 OR
   (SELECT count(*) FROM hft.stock_entry AS credit
    WHERE credit.command_id=p_id AND credit.qty_delta_micro=c.quantity_micro
    AND credit.account_id=c.ops_a2_destination_account_id
    AND credit.account_before_version=
      (envelope.exact_payload->>'destinationAccountBeforeVersion')::bigint
    AND credit.account_after_version=credit.account_before_version+1)<>1
 THEN RAISE EXCEPTION 'OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS'; END IF;
 SELECT count(*) INTO missing FROM hft.stock_entry AS leg
 LEFT JOIN hft.stock_account AS acct ON acct.id=leg.account_id
 WHERE leg.command_id=p_id AND (
  leg.product_version_code<>c.product_version_code OR
  (leg.qty_delta_micro<0 AND
   (leg.account_id IS DISTINCT FROM c.ops_a2_source_account_id OR
    leg.bucket<>CASE WHEN c.kind='RETURN' THEN 'CUSTODY'
      WHEN c.kind='RECEIVE' THEN 'EXTERNAL' ELSE 'AVAILABLE' END))
  OR (leg.qty_delta_micro>0 AND
   (leg.account_id IS DISTINCT FROM c.ops_a2_destination_account_id OR
    leg.bucket<>CASE c.kind WHEN 'ISSUE' THEN 'CUSTODY'
      WHEN 'RETURN' THEN (SELECT CASE WHEN mr.condition='GOOD'
        THEN 'AVAILABLE' ELSE mr.condition END FROM hft.material_return mr
        WHERE mr.id::text=c.source_document_id)
      ELSE 'AVAILABLE' END))
  OR (leg.account_id IS NOT NULL AND
   (acct.id IS NULL OR acct.legal_entity_id<>c.legal_entity_id
    OR acct.site_id<>c.site_id OR acct.warehouse_id<>c.warehouse_id
    OR acct.item_code<>c.item_code
    OR acct.product_version_code<>c.product_version_code
    OR acct.account_kind<>leg.bucket
    OR acct.location_key<>CASE WHEN leg.qty_delta_micro<0 OR c.kind='ISSUE' THEN
      c.ops_a2_source_leaf ELSE c.ops_a2_destination_leaf END))
 );
 IF missing<>0 THEN RAISE EXCEPTION 'OPS_A2_V2_IMMUTABLE_LEDGER_ATTRIBUTION_INVALID'; END IF;
 SELECT pg_catalog.encode(hft_crypto.digest(pg_catalog.convert_to(
  COALESCE(pg_catalog.string_agg(
   leg.id::text||'/'||leg.bucket||'/'||
   COALESCE(leg.account_id::text,'-')||'/'||
   leg.qty_delta_micro::text||'/'||
   COALESCE(leg.employee_id,'')||'/'||
   COALESCE(leg.batch_no,'')||'/'||
   COALESCE(leg.serial_no,''),E'\n' ORDER BY leg.id),''),
  'UTF8'),'sha256'),'hex')
 INTO ledger_digest FROM hft.stock_entry leg WHERE leg.command_id=p_id;
 IF ledger_digest IS DISTINCT FROM seal.movement_sha256
 THEN RAISE EXCEPTION 'OPS_A2_V2_IMMUTABLE_MOVEMENT_SHA_DRIFT'; END IF;
 IF outbox.canonical_event->>'schema'<>'HFT_STOCK_EVENT_OPS_A2_V2'
 OR outbox.canonical_event->>'commandId'<>c.command_id
 OR outbox.canonical_event->>'productVersion'<>c.product_version_code
 OR outbox.canonical_event->>'approvalId'<>c.approval_id
 THEN RAISE EXCEPTION 'OPS_A2_V2_AUDIT_SOURCE_MISMATCH'; END IF;
END $assertseal$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_assert_command_seal_v2(uuid)
 FROM PUBLIC,hft_r1_app_runtime;

-- V2 deferred commitment must have a real matching seal, outcome and audit.
CREATE OR REPLACE FUNCTION hft.ops_a2_require_command_seal_v2()
RETURNS trigger LANGUAGE plpgsql AS $verify$
BEGIN
 PERFORM hft.ops_a2_assert_command_seal_v2(NEW.id);
 RETURN NULL;
END $verify$;
CREATE CONSTRAINT TRIGGER ops_a2_command_requires_seal_v2
 AFTER INSERT ON hft.stock_command
 DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN
 (NEW.payload_contract_version='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED')
 EXECUTE FUNCTION hft.ops_a2_require_command_seal_v2();

-- Exact versioned immutable fact in the same original P1/P2 stock ledger.
-- Output matches the HFT OPS-A source-only account/entry fields. The full
-- proposal must receive independent PostgreSQL/TypeScript byte-vector review.
CREATE OR REPLACE FUNCTION hft.ops_a2_fact_v2(p_command_uuid uuid,p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $fact$
DECLARE
 c hft.stock_command%ROWTYPE;
 envelope hft.ops_a2_command_envelope%ROWTYPE;
 p jsonb;entry record;
 fields text[];delta_fields text[];
 movements jsonb:='[]'::jsonb; ids jsonb:='[]'::jsonb;
 acc jsonb;acc_key text; leg jsonb; leg_fields text[];
 debit text;source_quantity text;command_fact jsonb;
 movement_sha text;audit_text text;audit_sha text;
 one text;
BEGIN
 SELECT * INTO c FROM hft.stock_command WHERE id=p_command_uuid;
 IF p_payload IS NULL THEN
  SELECT * INTO envelope FROM hft.ops_a2_command_envelope
   WHERE command_uuid=p_command_uuid;
  IF envelope.command_uuid IS NULL THEN
   RAISE EXCEPTION 'OPS_A2_FACT_ENVELOPE_MISSING'; END IF;
  p:=envelope.exact_payload;
 ELSE
  p:=p_payload;
 END IF;
 IF c.id IS NULL THEN
  RAISE EXCEPTION 'OPS_A2_FACT_COMMAND_MISSING'; END IF;
 PERFORM hft.ops_a_payload_fields_v2(p);
 fields:=ARRAY['HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1',c.command_id];
 delta_fields:=ARRAY[];
 FOR entry IN
  SELECT e.id,e.bucket,e.qty_delta_micro,e.account_id,e.employee_id,
   e.batch_no,e.serial_no,e.account_before_version,e.account_after_version,
   a.legal_entity_id,a.site_id,a.warehouse_id,a.item_code,
   a.product_version_code,a.location_key,a.condition,a.account_kind,
   a.custodian_employee_id
  FROM hft.stock_entry AS e
  LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
  WHERE e.command_id=p_command_uuid ORDER BY e.id
 LOOP
  IF entry.account_id IS NULL THEN
   IF entry.bucket<>'EXTERNAL' OR entry.account_before_version IS NOT NULL
   OR entry.account_after_version IS NOT NULL
   THEN RAISE EXCEPTION 'OPS_A2_UNOWNED_ENTRY_IDENTITY_INVALID'; END IF;
   acc:=NULL;acc_key:='';
  ELSE
   IF entry.legal_entity_id IS NULL OR
     entry.product_version_code<>c.product_version_code OR
     entry.legal_entity_id<>c.legal_entity_id OR
     entry.site_id<>c.site_id OR
     entry.warehouse_id<>c.warehouse_id OR
     entry.item_code<>c.item_code OR
     entry.account_kind<>entry.bucket
   THEN RAISE EXCEPTION 'OPS_A2_FACT_ACCOUNT_SCOPE_INVALID'; END IF;
   acc:=pg_catalog.jsonb_build_object(
     'legalEntityId',entry.legal_entity_id,'siteId',entry.site_id,
     'warehouseId',entry.warehouse_id,'itemCode',entry.item_code,
     'productVersion',entry.product_version_code,
     'controlType',p->>'controlType','serialNo',COALESCE(entry.serial_no,''),
     'batchNo',COALESCE(entry.batch_no,''),
     'leafLocationId',entry.location_key,'kind',entry.account_kind,
     'condition',entry.condition,'custodianEmployeeId',entry.custodian_employee_id);
   acc_key:=pg_catalog.encode(hft_crypto.digest(hft.p2_length_prefixed_v1(
     ARRAY['HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1',
       entry.legal_entity_id,entry.site_id,entry.warehouse_id,
       entry.item_code,entry.product_version_code,p->>'controlType',
       COALESCE(entry.serial_no,''),
       COALESCE(entry.batch_no,''),
       entry.location_key,entry.account_kind,entry.condition,
       entry.custodian_employee_id]),'sha256'),'hex');
  END IF;
  debit:=hft.format_signed_micro_v2(entry.qty_delta_micro);
  leg:=pg_catalog.jsonb_build_object(
   'entryId','ENTRY-'||entry.id::text,'commandId',c.command_id,
   'accountId',entry.account_id,'account',acc,'bucket',entry.bucket,
   'signedQuantity',debit,
   'accountBeforeVersion',entry.account_before_version,
   'accountAfterVersion',entry.account_after_version);
  movements:=movements||pg_catalog.jsonb_build_array(leg);
  ids:=ids||pg_catalog.jsonb_build_array('ENTRY-'||entry.id::text);
  leg_fields:=ARRAY['ENTRY-'||entry.id::text,c.command_id,entry.bucket,
    COALESCE(entry.account_id::text,''),acc_key,
    COALESCE(entry.account_before_version::text,''),
    COALESCE(entry.account_after_version::text,''),debit];
  delta_fields:=delta_fields||leg_fields;
 END LOOP;
 IF pg_catalog.jsonb_array_length(movements)<>2
 THEN RAISE EXCEPTION 'OPS_A2_FACT_TWO_IMMUTABLE_LEGS_REQUIRED'; END IF;
 movement_sha:=pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(fields||delta_fields),'sha256'),'hex');
 source_quantity:=hft.format_signed_micro_v2(c.quantity_micro);
 command_fact:=pg_catalog.jsonb_build_object(
  'commandId',c.command_id,'idempotencyKey',c.idempotency_key,
  'kind',c.kind,'legalEntityId',c.legal_entity_id,
  'siteId',c.site_id,'warehouseId',c.warehouse_id,
  'itemCode',c.item_code,'productVersion',c.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo','requestQuantity',source_quantity,
  'sourceLeafId',p->>'sourceLeafId',
  'destinationLeafId',p->>'destinationLeafId',
  'expectedSourceAccountVersion',
   CASE WHEN p->>'sourceAccountBeforeVersion'='' THEN NULL
    ELSE (p->>'sourceAccountBeforeVersion')::bigint END,
  'expectedDestinationAccountVersion',(p->>'destinationAccountBeforeVersion')::bigint,
  'employeeId',p->>'employeeId',
  'originalIssueId',p->>'originalIssueId',
  'sourceDocumentId',p->>'sourceDocumentId',
  'sourceActionKey',p->>'sourceActionKey',
  'fragmentId',p->>'fragmentId',
  'sourceRevision',(p->>'sourceRevision')::bigint,
  'approvalId',p->>'approvalId',
  'approvalRevision',(p->>'approvalRevision')::bigint,
  'policyGeneration',(p->>'policyGeneration')::bigint,
  'approvedBy',p->>'approvedBy','actorSubject',p->>'actorSubject',
  'inspectedCondition',p->>'inspectedCondition',
  'inspectionEvidenceId',p->>'inspectionEvidenceId');
 -- JavaScript canonical factFields in the separate OPS-A evidence verifier.
 fields:=ARRAY[
  'HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1',c.command_id,c.idempotency_key,
  c.kind,c.legal_entity_id,c.site_id,c.warehouse_id,c.item_code,
  c.product_version_code,p->>'controlType',p->>'serialNo',p->>'batchNo',
  p->>'sourceDocumentId',p->>'sourceActionKey',p->>'fragmentId',source_quantity,
  p->>'sourceLeafId',p->>'destinationLeafId',
  p->>'sourceAccountBeforeVersion',p->>'destinationAccountBeforeVersion',
  p->>'employeeId',p->>'originalIssueId',
  p->>'sourceRevision',p->>'approvalId',p->>'approvalRevision',
  p->>'policyGeneration',p->>'approvedBy',p->>'actorSubject',
  p->>'inspectedCondition',p->>'inspectionEvidenceId'];
 fields:=ARRAY['OPS_A_AUDIT_V1']||fields||delta_fields;
 SELECT pg_catalog.string_agg(pg_catalog.to_jsonb(f)::text,'|' ORDER BY ord)
 INTO audit_text FROM pg_catalog.unnest(fields) WITH ORDINALITY AS x(f,ord);
 audit_sha:=pg_catalog.encode(hft_crypto.digest(
  pg_catalog.convert_to(audit_text,'UTF8'),'sha256'),'hex');
 RETURN pg_catalog.jsonb_build_object(
  'schema','HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1',
  'command',command_fact,'ledgerEntryIds',ids,'movements',movements,
  'movementSha256',movement_sha,'auditCanonicalText',audit_text,
  'auditSha256',audit_sha);
END $fact$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_fact_v2(uuid,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Single P2 writer: checks complete signed session, independent source,
-- policy, Hold, human governance and original typed source again under
-- GATE + STOCK locks. Both legs and source counters are ONE PG transaction.
CREATE OR REPLACE FUNCTION hft.ops_a2_post_stock_command_v2(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $writer$
DECLARE
 e text:=p->>'legalEntityId'; site text:=p->>'siteId';
 wh text:=p->>'warehouseId';item text:=p->>'itemCode';
 ver text:=p->>'productVersion'; serial text:=p->>'serialNo';
 lot text:=p->>'batchNo'; action text:=p->>'kind';
 actor text; qty bigint;
 binding hft.ops_a2_source_binding%ROWTYPE;
 source hft.stock_account%ROWTYPE;target hft.stock_account%ROWTYPE;
 src_version bigint;dst_version bigint;
 source_uuid uuid;target_uuid uuid;receipt_uuid uuid;receipt_line integer;
 cmd_uuid uuid;outbox_uuid uuid;
 before_source bigint;before_target bigint;
 source_after bigint;target_after bigint;
 source_bucket text;target_bucket text;custodian text:=p->>'employeeId';
 audit_event jsonb;fact jsonb;outcome jsonb;
 audit_text text;audit_digest text;movement_digest text;
 source_binding_digest text;
 n integer;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_SERIALIZABLE_ATTESTED_RUNTIME_REQUIRED'; END IF;
 PERFORM hft.ops_a_payload_fields_v2(p);
 IF (p->>'commandId') !~ '^[0-9a-f]{8}-[0-9a-f-]{27,28}$'
 THEN RAISE EXCEPTION 'OPS_A2_COMMAND_UUID_REQUIRED'; END IF;
 qty:=(p->>'quantityMicro')::bigint;
 -- Same exact serialization order as P2 V1, preserving the posting gate:
 -- GATE -> scoped stock -> verified key/session -> actor/policy/source/holds
 -- -> deterministic UUID account locks -> both legs/related source -> seal.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:GATE:'||e||':'||site||':'||wh,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'HFT:STOCK:'||e||':'||wh||':'||item||':'||lot||':'||serial,0));
 -- Authentic proof is checked BEFORE any mutable quantity or source update.
 actor:=hft.ops_a2_verify_invocation_v2(p,proof);
 binding:=hft.ops_a2_authorized_source_v2(p);
 -- A fresh signed proof for an already posted exact idempotency key never
 -- posts again; explicit reconciliation is a separate READ-ONLY call.
 PERFORM 1 FROM hft.stock_command sc WHERE sc.legal_entity_id=e
  AND (sc.command_id=p->>'commandId' OR
       sc.idempotency_key=p->>'idempotencyKey')
 FOR SHARE;
 IF FOUND THEN RAISE EXCEPTION 'OPS_A2_DUPLICATE_COMMAND_RECONCILE_ONLY'; END IF;
 IF p->>'sourceAccountId'<>'' THEN
  source_uuid:=(p->>'sourceAccountId')::uuid;
 END IF;
 target_uuid:=(p->>'destinationAccountId')::uuid;
 -- Lock all affected identities by UUID with a stable order across sessions.
 PERFORM 1 FROM hft.stock_account a WHERE
  a.id=source_uuid OR a.id=target_uuid ORDER BY a.id FOR UPDATE;
 IF p->>'kind'='RECEIVE' THEN
  src_version:=NULL;
  source_bucket:='EXTERNAL';
 ELSE
  SELECT * INTO source FROM hft.stock_account WHERE id=source_uuid FOR UPDATE;
  src_version:=(p->>'sourceAccountBeforeVersion')::bigint;
  source_bucket:=CASE WHEN action='RETURN' THEN 'CUSTODY' ELSE 'AVAILABLE' END;
  IF source.id IS NULL OR source.version<>src_version
   OR source.qty_micro-source.reserved_micro<qty
   OR source.legal_entity_id<>e OR source.site_id<>site
   OR source.warehouse_id<>wh OR source.item_code<>item
   OR source.product_version_code<>ver
   OR source.location_key<>p->>'sourceLeafId'
   OR source.batch_key<>lot OR source.serial_key<>serial
   OR source.account_kind<>source_bucket
   OR source.custodian_employee_id<>
       CASE WHEN action='RETURN' THEN custodian ELSE '' END
  THEN RAISE EXCEPTION 'OPS_A2_SOURCE_ACCOUNT_SCOPE_BALANCE_OR_VERSION_INVALID'; END IF;
 END IF;
 SELECT * INTO target FROM hft.stock_account
 WHERE id=target_uuid FOR UPDATE;
 dst_version:=(p->>'destinationAccountBeforeVersion')::bigint;
 target_bucket:=CASE action WHEN 'ISSUE' THEN 'CUSTODY'
  WHEN 'RETURN' THEN p->>'inspectedCondition' ELSE 'AVAILABLE' END;
 IF target_bucket='GOOD' THEN target_bucket:='AVAILABLE'; END IF;
 IF target.id IS NULL OR target.version<>dst_version
 OR target.legal_entity_id<>e OR target.site_id<>site
 OR target.warehouse_id<>wh OR target.item_code<>item
 OR target.product_version_code<>ver
 OR target.location_key<>CASE WHEN action='ISSUE' THEN p->>'sourceLeafId'
   ELSE p->>'destinationLeafId' END
 OR target.batch_key<>lot OR target.serial_key<>serial
 OR target.account_kind<>target_bucket
 OR target.custodian_employee_id<>CASE WHEN action='ISSUE' THEN custodian ELSE '' END
 OR target.condition<>CASE WHEN target_bucket IN('DAMAGED','QUARANTINE')
  THEN target_bucket ELSE 'GOOD' END
 THEN RAISE EXCEPTION 'OPS_A2_DESTINATION_ACCOUNT_SCOPE_OR_VERSION_INVALID'; END IF;
 IF source_uuid IS NOT NULL AND source_uuid=target_uuid
 THEN RAISE EXCEPTION 'OPS_A2_SOURCE_DESTINATION_IDENTICAL'; END IF;
 before_source:=source.qty_micro;
 before_target:=target.qty_micro;
 IF source_uuid IS NOT NULL THEN
  UPDATE hft.stock_account SET qty_micro=qty_micro-qty,version=version+1
  WHERE id=source_uuid AND version=src_version
   AND qty_micro-qty>=reserved_micro;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'OPS_A2_SOURCE_OPTIMISTIC_CAS_FAILED'; END IF;
  source_after:=before_source-qty;
 END IF;
 UPDATE hft.stock_account SET qty_micro=qty_micro+qty,version=version+1
 WHERE id=target_uuid AND version=dst_version
  AND qty_micro+qty<=9223372036854775807;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'OPS_A2_DESTINATION_OPTIMISTIC_CAS_FAILED'; END IF;
 target_after:=before_target+qty;
 -- Persist full immutable identity in the canonical command only. A future
 -- independently approved schema cutover must qualify the V2 column/parent
 -- constraints for this exact insert, not silently accept V1 columns.
 IF action='RECEIVE' THEN
  SELECT r.id,r.line_no INTO receipt_uuid,receipt_line
  FROM hft.grn_partial_receipt r
  WHERE r.grn_id::text=p->>'sourceDocumentId'
   AND r.receipt_key||':'||r.line_no::text=p->>'sourceActionKey'
   AND r.legal_entity_id=e AND r.warehouse_id=wh
   AND r.location_id=p->>'destinationLeafId'
   AND r.ops_a2_product_version_code=ver
   AND r.ops_a2_item_code=item
   AND r.qc_state='ACCEPTED'
  FOR SHARE;
  IF receipt_uuid IS NULL THEN
   RAISE EXCEPTION 'OPS_A2_ORIGINAL_GRN_RECEIPT_NOT_VERIFIED'; END IF;
 END IF;
 INSERT INTO hft.stock_command(legal_entity_id,command_id,idempotency_key,
  payload_sha256,kind,source_document_id,source_action_key,
  fragment_id,actor_subject,approval_id,approval_revision,
  source_receipt_id,source_line_no,warehouse_id,item_code,location_id,
  batch_no,serial_no,site_id,quantity_micro,payload_contract_version,
  product_version_code,ops_a2_source_leaf,ops_a2_destination_leaf,
  ops_a2_source_account_id,ops_a2_destination_account_id)
 VALUES(e,p->>'commandId',p->>'idempotencyKey',
  hft.ops_a_payload_digest_v2(p),action,p->>'sourceDocumentId',
  p->>'sourceActionKey',p->>'fragmentId',actor,p->>'approvalId',
  (p->>'approvalRevision')::bigint,receipt_uuid,receipt_line,
  wh,item,CASE WHEN action='RECEIVE' THEN p->>'destinationLeafId'
       ELSE p->>'sourceLeafId' END,
  lot,serial,site,qty,p->>'contractVersion',ver,
  p->>'sourceLeafId',p->>'destinationLeafId',source_uuid,target_uuid)
 RETURNING id INTO cmd_uuid;
 IF action IN('ISSUE','RETURN') THEN
  INSERT INTO hft.posting_fragment(legal_entity_id,fragment_id,kind,
   document_id,source_action_key,command_uuid,quantity_micro,
   employee_id,original_issue_id)
  VALUES(e,p->>'fragmentId',action,p->>'sourceDocumentId',
   p->>'sourceActionKey',cmd_uuid,qty,custodian,p->>'originalIssueId');
 END IF;
 INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro,
   employee_id,batch_no,serial_no,product_version_code,
   account_before_version,account_after_version)
 VALUES(cmd_uuid,source_uuid,source_bucket,-qty,NULLIF(custodian,''),
    NULLIF(lot,''),NULLIF(serial,''),ver,src_version,
    CASE WHEN source_uuid IS NULL THEN NULL ELSE src_version+1 END),
   (cmd_uuid,target_uuid,target_bucket,qty,NULLIF(custodian,''),
    NULLIF(lot,''),NULLIF(serial,''),ver,dst_version,dst_version+1);
 -- Source fragments + custody/serial are also protected by the same COMMIT.
 IF action='RECEIVE' THEN
  UPDATE hft.grn_line SET accepted_micro=accepted_micro+qty
   WHERE grn_id=(p->>'sourceDocumentId')::uuid
     AND line_no=receipt_line AND accepted_micro+qty<=ordered_micro;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_GRN_OVER_RECEIPT'; END IF;
  UPDATE hft.supplier_invoice_line AS inv
  SET received_micro=received_micro+qty
  FROM hft.grn_line gl
  WHERE gl.grn_id=(p->>'sourceDocumentId')::uuid
  AND gl.line_no=receipt_line AND inv.id=gl.invoice_line_id
  AND inv.received_micro+qty<=inv.authorized_micro;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_INVOICE_OVER_RECEIPT'; END IF;
 ELSIF action='ISSUE' THEN
  UPDATE hft.material_issue_line SET issued_micro=issued_micro+qty
  WHERE issue_id=(p->>'sourceDocumentId')::uuid
   AND source_action_key=p->>'sourceActionKey'
   AND ops_a2_product_version_code=ver AND issued_micro+qty<=authorized_micro;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_ISSUE_FRAGMENT_CEILING'; END IF;
  INSERT INTO hft.employee_custody(legal_entity_id,employee_id,issue_command_id,
   item_code,warehouse_id,issued_micro,serial_no,batch_no,location_id,
   product_version_code)
  VALUES(e,custodian,cmd_uuid,item,wh,qty,serial,lot,p->>'sourceLeafId',ver);
  INSERT INTO hft.custody_ack_pending(issue_command_uuid,legal_entity_id,employee_id)
  VALUES(cmd_uuid,e,custodian);
 ELSIF action='RETURN' THEN
  UPDATE hft.material_return_line SET returned_micro=returned_micro+qty
   WHERE return_id=(p->>'sourceDocumentId')::uuid
   AND source_action_key=p->>'sourceActionKey'
   AND ops_a2_product_version_code=ver
   AND returned_micro+qty<=authorized_micro;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_RETURN_FRAGMENT_CEILING'; END IF;
  UPDATE hft.employee_custody AS cu
  SET returned_micro=returned_micro+qty,version=version+1
  FROM hft.stock_command orig
  WHERE cu.issue_command_id=orig.id AND orig.legal_entity_id=e
    AND orig.command_id=p->>'originalIssueId'
    AND orig.kind='ISSUE' AND orig.product_version_code=ver
    AND cu.employee_id=custodian AND cu.item_code=item
    AND cu.location_id=p->>'sourceLeafId'
    AND cu.returned_micro+qty<=cu.issued_micro;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_RETURN_ORIGINAL_CUSTODY_MISMATCH'; END IF;
 ELSIF action='TRANSFER' THEN
  UPDATE hft.ops_a2_transfer_document SET moved_micro=moved_micro+qty,
   status=CASE WHEN moved_micro+qty=authorized_micro THEN 'MOVED'
     ELSE 'PARTIALLY_MOVED' END
   WHERE id=(p->>'sourceDocumentId')::uuid
   AND legal_entity_id=e AND site_id=site AND warehouse_id=wh
   AND product_version_code=ver
   AND moved_micro+qty<=authorized_micro;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_SOURCE_CEILING'; END IF;
 END IF;
 -- Global serialized identity remains (legal entity,item,serial) independent
 -- of version, warehouse and leaf. A version may never be reassigned.
 IF p->>'controlType'='SERIAL' THEN
  IF action='RECEIVE' THEN
   INSERT INTO hft.serial_registry(legal_entity_id,item_code,serial_no,
    warehouse_id,state,product_version_code)
   VALUES(e,item,serial,wh,'AVAILABLE',ver);
  ELSIF action='ISSUE' THEN
   UPDATE hft.serial_registry SET state='CUSTODY',
    custodian_employee_id=custodian,version=version+1
    WHERE legal_entity_id=e AND item_code=item AND serial_no=serial
    AND product_version_code=ver AND warehouse_id=wh
    AND state='AVAILABLE' AND custodian_employee_id IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_SERIAL_UNAVAILABLE'; END IF;
  ELSIF action='RETURN' THEN
   UPDATE hft.serial_registry SET state=CASE WHEN p->>'inspectedCondition'='GOOD'
       THEN 'AVAILABLE' ELSE p->>'inspectedCondition' END,
    custodian_employee_id=NULL,version=version+1
    WHERE legal_entity_id=e AND item_code=item AND serial_no=serial
    AND product_version_code=ver AND warehouse_id=wh AND state='CUSTODY'
    AND custodian_employee_id=custodian;
   IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_SERIAL_CUSTODY_CONFLICT'; END IF;
  ELSE
   PERFORM 1 FROM hft.serial_registry
    WHERE legal_entity_id=e AND item_code=item AND serial_no=serial
     AND product_version_code=ver AND warehouse_id=wh AND state='AVAILABLE'
    FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_SERIAL_TRANSFER_NOT_AVAILABLE'; END IF;
  END IF;
 END IF;
 -- The fact is reconstructed from ACTUAL ledger entry IDs/quantities and
 -- account versions, never from client-supplied claimed movements.
 fact:=hft.ops_a2_fact_v2(cmd_uuid,p);
 INSERT INTO hft.ops_a2_command_envelope(command_uuid,exact_payload,
  payload_sha256,nonce,proof_mac_sha256,actor_session_id,
  source_binding_request_id,version_movement_sha256,posting_policy_generation)
 VALUES(cmd_uuid,p,hft.ops_a_payload_digest_v2(p),proof->>'nonce',
  pg_catalog.encode(hft_crypto.digest(pg_catalog.decode(
   proof->>'macSha256','hex'),'sha256'),'hex'),
  proof->>'sessionId',binding.request_id,
  fact->>'movementSha256',(p->>'policyGeneration')::bigint);
 outcome:=pg_catalog.jsonb_build_object(
  'state','POSTED_PENDING_READBACK','commandId',p->>'commandId',
  'payloadSha256',hft.ops_a_payload_digest_v2(p),
  'sourceAccountBeforeVersion',p->>'sourceAccountBeforeVersion',
  'destinationAccountBeforeVersion',p->>'destinationAccountBeforeVersion',
  'stockChanged',true,'durable',true);
 audit_event:=pg_catalog.jsonb_build_object(
  'schema','HFT_STOCK_EVENT_OPS_A2_V2',
  'commandId',p->>'commandId','entity',e,'site',site,'warehouse',wh,
  'item',item,'productVersion',ver,'actor',actor,
  'approvalId',p->>'approvalId',
  'approvalRevision',(p->>'approvalRevision')::bigint,
  'fact',fact);
 audit_text:=audit_event::text;
 audit_digest:=pg_catalog.encode(hft_crypto.digest(
  pg_catalog.convert_to(audit_text,'UTF8'),'sha256'),'hex');
 INSERT INTO hft.audit_outbox(command_id,canonical_event,canonical_text,
   canonical_sha256)
 VALUES(cmd_uuid,audit_event,audit_text,audit_digest)
 RETURNING id INTO outbox_uuid;
 INSERT INTO hft.audit_delivery(outbox_id,state) VALUES(outbox_uuid,'PENDING');
 INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
 VALUES(cmd_uuid,outcome,actor);
 -- Historical seal from existing canonical stock_command_seal, with the
 -- accepted V1 movement byte convention PLUS the new V2 digest envelope.
 SELECT pg_catalog.encode(hft_crypto.digest(pg_catalog.convert_to(
  COALESCE(pg_catalog.string_agg(
   leg.id::text||'/'||leg.bucket||'/'||
   COALESCE(leg.account_id::text,'-')||'/'||
   leg.qty_delta_micro::text||'/'||
   COALESCE(leg.employee_id,'')||'/'||
   COALESCE(leg.batch_no,'')||'/'||
   COALESCE(leg.serial_no,''),E'\n' ORDER BY leg.id),''),
  'UTF8'),'sha256'),'hex')
 INTO movement_digest FROM hft.stock_entry leg WHERE leg.command_id=cmd_uuid;
 -- Required AVAILABLE poststate is original source for OUT/TRANSFER,
 -- destination for IN/GOOD RETURN; damaged returns must retain the old
 -- company-owned AVAILABLE position as a separate preexisting account.
 IF action='RECEIVE' OR (action='RETURN' AND p->>'inspectedCondition'='GOOD')
 THEN source_uuid:=target_uuid;
 ELSIF action='RETURN' THEN
  SELECT id INTO source_uuid FROM hft.stock_account
   WHERE legal_entity_id=e AND site_id=site AND warehouse_id=wh
     AND item_code=item AND product_version_code=ver
     AND location_key=p->>'sourceLeafId'
     AND batch_key=lot AND serial_key=serial
     AND account_kind='AVAILABLE' AND condition='GOOD'
     AND custodian_employee_id='' FOR SHARE;
 END IF;
 IF source_uuid IS NULL THEN
  RAISE EXCEPTION 'OPS_A2_HISTORIC_AVAILABLE_ACCOUNT_FOR_SEAL_MISSING'; END IF;
 SELECT * INTO source FROM hft.stock_account WHERE id=source_uuid FOR SHARE;
 IF source.id IS NULL OR source.account_kind<>'AVAILABLE'
 THEN RAISE EXCEPTION 'OPS_A2_SEAL_AVAILABLE_IDENTITY_INVALID'; END IF;
 INSERT INTO hft.stock_command_seal(command_id,movement_sha256,
  audit_sha256,outcome_sha256,quantity_micro,available_account_id,
  available_after_micro,available_after_version,employee_id,
  original_issue_command_id,sealed_by,product_version_code)
 VALUES(cmd_uuid,movement_digest,audit_digest,
  pg_catalog.encode(hft_crypto.digest(
   pg_catalog.convert_to(outcome::text,'UTF8'),'sha256'),'hex'),
  qty,source_uuid,source.qty_micro,source.version,custodian,
  p->>'originalIssueId',actor,ver);
 PERFORM hft.ops_a2_assert_command_seal_v2(cmd_uuid);
 RETURN outcome;
END $writer$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_post_stock_command_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- ===== END SOURCE 3/4 =====

-- ===== BEGIN SOURCE 4/4: RESOLVER-READ =====
-- HFT OPS-A2 — AUTHENTICATED P0 SOURCE RESOLVER, READBACK AND
-- UNCERTAIN-COMMIT RECOVERY — SOURCE ONLY, NOT EXECUTABLE.
-- Strict, separately domain-separated RETURN HMAC for signed P0 transport.
-- Canonical order matches lib/hft/security/ops-a2-return-proof.ts. This is
-- NOT the existing P0 IN/OUT/TRANSFER signing contract.
CREATE OR REPLACE FUNCTION hft.ops_a2_return_payload_fields_v1(p jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $return_fields$
DECLARE
 keys text[]:=ARRAY['contractVersion','kind','requestId','legalEntityId',
 'siteId','warehouseId','itemCode','productVersion','controlType','quantity',
 'uom','serialNo','batchNo','leafLocationId','employeeId',
 'returnDocumentId','returnLineKey','originalIssueId',
 'inspectionEvidenceId','inspectedCondition'];
 f text;
BEGIN
 IF pg_catalog.jsonb_typeof(p)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p))<>20
 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p) AS k
    WHERE NOT k=ANY(keys))
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_EXACT_P0_SOURCE_REQUIRED'; END IF;
 FOREACH f IN ARRAY keys LOOP
  IF pg_catalog.jsonb_typeof(p->f)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_RETURN_P0_FIELDS_MUST_BE_STRINGS'; END IF;
 END LOOP;
 IF p->>'contractVersion'<>'HFT-R1-OPS-A2-RETURN-PREPARE-V1'
 OR p->>'kind'<>'RETURN'
 OR p->>'returnDocumentId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
 OR p->>'originalIssueId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR p->>'quantity' !~ '^(0|[1-9][0-9]*)([.][0-9]{1,6})?$'
 OR (p->>'quantity')::numeric<=0
 OR p->>'inspectedCondition' NOT IN('GOOD','DAMAGED','QUARANTINE')
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_P0_CANONICAL_IDENTITY_INVALID'; END IF;
 RETURN ARRAY(SELECT p->>k FROM pg_catalog.unnest(keys) AS k);
END $return_fields$;
CREATE OR REPLACE FUNCTION hft.ops_a2_return_payload_sha256_v1(p jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp
AS $return_digest$
 SELECT pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(hft.ops_a2_return_payload_fields_v1(p)),
  'sha256'),'hex');
$return_digest$;
REVOKE ALL ON FUNCTION hft.ops_a2_return_payload_fields_v1(jsonb),
 hft.ops_a2_return_payload_sha256_v1(jsonb) FROM PUBLIC,hft_r1_app_runtime;

CREATE OR REPLACE FUNCTION hft.ops_a2_verify_return_proof_v1(p jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,pg_temp AS $return_proof$
DECLARE
 k hft_secret.p0_stores_proof_key%ROWTYPE;
 f text;names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
  'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 expected bytea;claimed bytea;difference integer:=0;i integer;v integer;
 issued bigint;expires bigint;at_epoch bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR pg_catalog.jsonb_typeof(proof)<>'object'
 OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_PROTECTED_PROOF_REQUIRED'; END IF;
 FOREACH f IN ARRAY names LOOP
  IF pg_catalog.jsonb_typeof(proof->f)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_RETURN_PROOF_STRING_FIELDS_REQUIRED'; END IF;
 END LOOP;
 IF proof->>'proofVersion'<>'HFT-R1-OPS-A2-RETURN-HMAC-V1'
 OR proof->>'payloadSha256'<>hft.ops_a2_return_payload_sha256_v1(p)
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_ORIGINAL_HMAC_FORMAT_INVALID'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expires:=(proof->>'expiresAt')::bigint;
 v:=(proof->>'keyVersion')::integer;
 at_epoch:=pg_catalog.floor(
  pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>at_epoch+30 OR expires<=at_epoch
 OR expires<=issued OR expires-issued>40
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_HMAC_EXPIRED'; END IF;
 SELECT * INTO k FROM hft_secret.p0_stores_proof_key
 WHERE key_version=v FOR SHARE;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<k.not_before
 OR pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_KEY_REVOKED'; END IF;
 expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  proof->>'payloadSha256',proof->>'issuedAt',proof->>'expiresAt',
  proof->>'nonce',proof->>'keyVersion']),k.key_bytes,'sha256');
 claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 FOR i IN 0..31 LOOP
  difference:=difference | (
    pg_catalog.get_byte(expected,i) # pg_catalog.get_byte(claimed,i));
 END LOOP;
 IF difference<>0 THEN RAISE EXCEPTION 'OPS_A2_RETURN_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session AS sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp()
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_RETURN_SIGNED_SESSION_INVALID'; END IF;
 PERFORM 1 FROM hft.actor_warehouse_grant AS g
 WHERE g.legal_entity_id=p->>'legalEntityId' AND g.site_id=p->>'siteId'
 AND g.warehouse_id=p->>'warehouseId'
 AND g.actor_subject=proof->>'actorSubject' AND g.active AND g.may_post
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_RETURN_ACTOR_SCOPE_DENIED'; END IF;
 RETURN proof->>'actorSubject';
END $return_proof$;
REVOKE ALL ON FUNCTION hft.ops_a2_verify_return_proof_v1(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- P0 browser command is authenticated using the existing P0 proof, then
-- compared against a persisted, independently approved exact source binding.
-- P2 writer independently rechecks the same original source and governance.
-- The runtime resolver call MUST use an isolated SERIALIZABLE transaction
-- because P0 human/key verification includes FOR SHARE row locks.
CREATE OR REPLACE FUNCTION hft.ops_a2_resolve_authorized_v2(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $resolve$
DECLARE
 actor text;b hft.ops_a2_source_binding%ROWTYPE;
 action text;doc text;source_action text;payload jsonb;cmd jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'OPS_A2_RESOLVER_PROTECTED_TRANSACTION_REQUIRED'; END IF;
 -- No nonce consumed here; the separate P2 V2 writer consumes the signed
 -- source-bound original posting nonce only inside its own atomic transaction.
 actor:=hft.p0_verify_stores_proof_v1(p,proof);
 IF p->>'kind' NOT IN ('IN','OUT','TRANSFER')
 THEN RAISE EXCEPTION 'OPS_A2_P0_OPERATION_NOT_QUALIFIED'; END IF;
 action:=CASE p->>'kind' WHEN 'IN' THEN 'RECEIVE'
  WHEN 'OUT' THEN 'ISSUE' ELSE 'TRANSFER' END;
 SELECT * INTO b FROM hft.ops_a2_source_binding AS src
  WHERE src.request_id=(p->>'requestId')::uuid
   AND src.legal_entity_id=p->>'legalEntityId'
   AND src.site_id=p->>'siteId'
   AND src.warehouse_id=p->>'warehouseId'
   AND src.item_code=p->>'itemCode'
   AND src.product_version_code=p->>'productVersion'
   AND src.actor_subject=actor
   AND src.action_kind=action
   AND src.p0_payload_sha256=hft.p0_stores_payload_sha256_v1(p)
   AND src.status='APPROVED'
  FOR SHARE;
 IF b.request_id IS NULL THEN
  RAISE EXCEPTION 'OPS_A2_AUTHENTICATED_P0_SOURCE_NOT_IN_APPROVED_RECORD'; END IF;
 IF p->>'kind'='IN' THEN
  IF p->>'qcState'<>'ACCEPTED' OR b.inspection_evidence_id<>p->>'qcEvidenceId'
  -- Original P0 uppercase UUID maps only to typed lowercase PostgreSQL UUID.
  -- Persisted receipt_key + line_no, never an arbitrary browser action alias.
  OR p->>'grnId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  OR b.source_document_id<>pg_catalog.lower(p->>'grnId')
  OR NOT EXISTS(SELECT 1 FROM hft.grn_partial_receipt AS r
    WHERE r.grn_id::text=b.source_document_id
    AND r.legal_entity_id=b.legal_entity_id
    AND r.warehouse_id=b.warehouse_id
    AND r.location_id=b.destination_leaf
    AND r.receipt_key=p->>'receiptKey'
    AND b.source_action_key=r.receipt_key||':'||r.line_no::text
    AND r.ops_a2_item_code=b.item_code
    AND r.ops_a2_product_version_code=b.product_version_code)
  OR b.destination_leaf<>p->>'leafLocationId'
  THEN RAISE EXCEPTION 'OPS_A2_GRN_QC_SOURCE_NOT_VERIFIED'; END IF;
 ELSIF p->>'kind'='OUT' THEN
  IF p->>'issueDocumentId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  OR b.source_document_id<>pg_catalog.lower(p->>'issueDocumentId')
  OR b.source_action_key<>p->>'fragmentId'
  OR b.employee_id<>p->>'employeeId'
  OR b.source_leaf<>p->>'leafLocationId'
  THEN RAISE EXCEPTION 'OPS_A2_EMPLOYEE_ISSUE_SOURCE_NOT_VERIFIED'; END IF;
 ELSE
  IF p->>'transferDocumentId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
  OR b.source_document_id<>pg_catalog.lower(p->>'transferDocumentId')
  OR b.source_leaf<>p->>'sourceLeafId'
  OR b.destination_leaf<>p->>'destinationLeafId'
  OR b.source_leaf=b.destination_leaf
  THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_SOURCE_NOT_VERIFIED'; END IF;
 END IF;
 -- Distinct signed account identities and expected account versions are
 -- resolved from independently governed DB records, never browser fields.
 cmd:=pg_catalog.jsonb_build_object(
  'commandId',p->>'requestId','idempotencyKey',p->>'requestId',
  'kind',action,'legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo',
  'requestQuantity',hft.format_signed_micro_v2(b.authorized_micro),
  'sourceLeafId',b.source_leaf,'destinationLeafId',b.destination_leaf,
  'expectedSourceAccountVersion',b.source_account_before_version,
  'expectedDestinationAccountVersion',b.dest_account_before_version,
  'employeeId',b.employee_id,'originalIssueId',b.original_issue_id,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,'fragmentId',b.fragment_id,
  'sourceRevision',b.source_revision,'approvalId',b.approval_id,
  'approvalRevision',b.approval_revision,
  'policyGeneration',b.policy_generation,
  'actorSubject',actor,'approvedBy',b.approver_subject,
  'inspectedCondition','GOOD',
  'inspectionEvidenceId',b.inspection_evidence_id);
 payload:=pg_catalog.jsonb_build_object(
  'contractVersion','HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED',
  'commandId',p->>'requestId','idempotencyKey',p->>'requestId',
  'kind',action,'legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo','sourceLeafId',b.source_leaf,
  'destinationLeafId',b.destination_leaf,
  'sourceAccountId',COALESCE(b.source_account_id::text,''),
  'destinationAccountId',b.destination_account_id::text,
  'sourceAccountBeforeVersion',COALESCE(b.source_account_before_version::text,''),
  'destinationAccountBeforeVersion',b.dest_account_before_version::text,
  'employeeId',b.employee_id,'originalIssueId',b.original_issue_id,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,'fragmentId',b.fragment_id,
  'quantityMicro',b.authorized_micro::text,
  'sourceRevision',b.source_revision::text,
  'approvalId',b.approval_id,'approvalRevision',b.approval_revision::text,
  'policyGeneration',b.policy_generation::text,
  'approvedPayloadSha256',b.approved_scope_sha256,
  'approvedBy',b.approver_subject,'actorSubject',actor,
  'inspectedCondition','GOOD',
  'inspectionEvidenceId',b.inspection_evidence_id);
 -- Recheck persisted approval/person/Holds/typed source BEFORE releasing
 -- the prospective V2 bytes to the trusted server signer.
 PERFORM hft.ops_a2_authorized_source_v2(payload);
 RETURN pg_catalog.jsonb_build_object(
  'state','OPS_A2_AUTHORIZED_SOURCE_V2',
  'issuer','HFT_P2_PROTECTED_DATABASE','actorSubject',actor,
  'sessionId',proof->>'sessionId','legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,
  'approvalPayloadSha256',b.approved_scope_sha256,
  'sourceAccountId',COALESCE(b.source_account_id::text,''),
  'destinationAccountId',b.destination_account_id::text,
  'command',cmd);
END $resolve$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- RETURN is separately authenticated: old P0 HMAC does not support RETURN.
-- No original-ISSUE/source leaf is accepted from a browser. It is resolved
-- from the independently governed source binding and still rechecked by
-- hft.ops_a2_authorized_source_v2 and the protected writer at posting time.
CREATE OR REPLACE FUNCTION hft.ops_a2_resolve_return_authorized_v2(
 p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $return_resolve$
DECLARE
 actor text;b hft.ops_a2_source_binding%ROWTYPE;
 action text:='RETURN';payload jsonb;cmd jsonb;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_ISOLATED_RUNTIME_REQUIRED'; END IF;
 actor:=hft.ops_a2_verify_return_proof_v1(p,proof);
 SELECT * INTO b FROM hft.ops_a2_source_binding AS src
 WHERE src.request_id=(p->>'requestId')::uuid
 AND src.legal_entity_id=p->>'legalEntityId'
 AND src.site_id=p->>'siteId'
 AND src.warehouse_id=p->>'warehouseId'
 AND src.item_code=p->>'itemCode'
 AND src.product_version_code=p->>'productVersion'
 AND src.actor_subject=actor
 AND src.action_kind='RETURN'
 AND src.status='APPROVED'
 AND src.p0_payload_sha256=hft.ops_a2_return_payload_sha256_v1(p)
 FOR SHARE;
 IF b.request_id IS NULL OR
 b.source_document_id<>pg_catalog.lower(p->>'returnDocumentId')
 OR b.source_action_key<>p->>'returnLineKey'
 OR b.fragment_id<>p->>'returnLineKey'
 OR b.original_issue_id<>p->>'originalIssueId'
 OR b.employee_id<>p->>'employeeId'
 OR b.destination_leaf<>p->>'leafLocationId'
 OR b.inspection_evidence_id<>p->>'inspectionEvidenceId'
 OR b.authorized_micro<>((p->>'quantity')::numeric*1000000)::bigint
 OR NOT EXISTS(SELECT 1 FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS original ON original.id=cu.issue_command_id
   WHERE original.legal_entity_id=b.legal_entity_id
   AND original.site_id=b.site_id
   AND original.warehouse_id=b.warehouse_id
   AND original.command_id=b.original_issue_id AND original.kind='ISSUE'
   AND original.product_version_code=b.product_version_code
   AND cu.legal_entity_id=b.legal_entity_id AND cu.employee_id=b.employee_id
   AND cu.item_code=b.item_code
   AND cu.product_version_code=b.product_version_code
   AND cu.location_id=b.source_leaf
   AND cu.issued_micro-cu.returned_micro>=b.authorized_micro)
 THEN RAISE EXCEPTION 'OPS_A2_RETURN_ORIGINAL_CUSTODY_OR_SOURCE_UNVERIFIED'; END IF;
 cmd:=pg_catalog.jsonb_build_object(
  'commandId',p->>'requestId','idempotencyKey',p->>'requestId',
  'kind',action,'legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo',
  'requestQuantity',hft.format_signed_micro_v2(b.authorized_micro),
  'sourceLeafId',b.source_leaf,'destinationLeafId',b.destination_leaf,
  'expectedSourceAccountVersion',b.source_account_before_version,
  'expectedDestinationAccountVersion',b.dest_account_before_version,
  'employeeId',b.employee_id,'originalIssueId',b.original_issue_id,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,'fragmentId',b.fragment_id,
  'sourceRevision',b.source_revision,'approvalId',b.approval_id,
  'approvalRevision',b.approval_revision,
  'policyGeneration',b.policy_generation,
  'actorSubject',actor,'approvedBy',b.approver_subject,
  'inspectedCondition',p->>'inspectedCondition',
  'inspectionEvidenceId',b.inspection_evidence_id);
 payload:=pg_catalog.jsonb_build_object(
  'contractVersion','HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED',
  'commandId',p->>'requestId','idempotencyKey',p->>'requestId',
  'kind',action,'legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'controlType',p->>'controlType','serialNo',p->>'serialNo',
  'batchNo',p->>'batchNo','sourceLeafId',b.source_leaf,
  'destinationLeafId',b.destination_leaf,
  'sourceAccountId',COALESCE(b.source_account_id::text,''),
  'destinationAccountId',b.destination_account_id::text,
  'sourceAccountBeforeVersion',COALESCE(b.source_account_before_version::text,''),
  'destinationAccountBeforeVersion',b.dest_account_before_version::text,
  'employeeId',b.employee_id,'originalIssueId',b.original_issue_id,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,'fragmentId',b.fragment_id,
  'quantityMicro',b.authorized_micro::text,
  'sourceRevision',b.source_revision::text,
  'approvalId',b.approval_id,'approvalRevision',b.approval_revision::text,
  'policyGeneration',b.policy_generation::text,
  'approvedPayloadSha256',b.approved_scope_sha256,
  'approvedBy',b.approver_subject,'actorSubject',actor,
  'inspectedCondition',p->>'inspectedCondition',
  'inspectionEvidenceId',b.inspection_evidence_id);
 -- Recheck persisted approval/person/Holds/typed source BEFORE releasing
 -- the prospective V2 bytes to the trusted server signer.
 PERFORM hft.ops_a2_authorized_source_v2(payload);
 RETURN pg_catalog.jsonb_build_object(
  'state','OPS_A2_AUTHORIZED_SOURCE_V2',
  'issuer','HFT_P2_PROTECTED_DATABASE','actorSubject',actor,
  'sessionId',proof->>'sessionId','legalEntityId',b.legal_entity_id,
  'siteId',b.site_id,'warehouseId',b.warehouse_id,
  'itemCode',b.item_code,'productVersion',b.product_version_code,
  'sourceDocumentId',b.source_document_id,
  'sourceActionKey',b.source_action_key,
  'approvalPayloadSha256',b.approved_scope_sha256,
  'sourceAccountId',COALESCE(b.source_account_id::text,''),
  'destinationAccountId',b.destination_account_id::text,
  'command',cmd);
END $return_resolve$;
ALTER FUNCTION hft.ops_a2_resolve_return_authorized_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_resolve_return_authorized_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Uncertain COMMIT: original proof and persisted nonce identity ONLY.
-- This is STRICTLY READ ONLY, even if original signer key was retired.
CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v2(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $deny_old_recovery$
BEGIN
 RAISE EXCEPTION 'OPS_A2_RECOVERY_FRESH_AUTHENTICATION_V3_REQUIRED';
END $deny_old_recovery$;
REVOKE ALL ON FUNCTION hft.ops_a2_reconcile_post_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,pg_temp AS $reconcile$
DECLARE
 c hft.stock_command%ROWTYPE;
 n hft.posting_invocation_nonce%ROWTYPE;
 envelope hft.ops_a2_command_envelope%ROWTYPE;
 sess hft.posting_session%ROWTYPE;
 sha text;fact jsonb;policy_generation bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'OPS_A2_READ_ONLY_RUNTIME_REQUIRED'; END IF;
 PERFORM hft.ops_a_payload_fields_v2(p);
 IF pg_catalog.jsonb_typeof(proof)<>'object'
 OR proof->>'proofVersion'<>'HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED'
 OR (proof->>'nonce') !~ '^[0-9a-f]{48}$'
 OR (proof->>'macSha256') !~ '^[0-9a-f]{64}$'
 OR (proof->>'keyVersion') !~ '^[1-9][0-9]{0,8}$'
 OR (proof->>'issuedAt') !~ '^[1-9][0-9]{0,18}$'
 OR (proof->>'expiresAt') !~ '^[1-9][0-9]{0,18}$'
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_ORIGINAL_PROOF_REQUIRED'; END IF;
 sha:=hft.ops_a_payload_digest_v2(p);
 IF sha<>proof->>'payloadSha256'
 OR proof->>'actorSubject'<>p->>'actorSubject'
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_ORIGINAL_PAYLOAD_MISMATCH'; END IF;
 SELECT * INTO c FROM hft.stock_command WHERE
  legal_entity_id=p->>'legalEntityId' AND command_id=p->>'commandId';
 IF c.id IS NULL THEN
  PERFORM 1 FROM hft.stock_command WHERE
   legal_entity_id=p->>'legalEntityId'
   AND idempotency_key=p->>'idempotencyKey';
  IF FOUND THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object(
   'state','INDETERMINATE_NOT_FOUND','automaticRetryAllowed',false);
 END IF;
 SELECT * INTO envelope FROM hft.ops_a2_command_envelope
 WHERE command_uuid=c.id;
 SELECT * INTO n FROM hft.posting_invocation_nonce
 WHERE key_version=(proof->>'keyVersion')::integer
 AND nonce=proof->>'nonce' AND command_id=c.command_id
 AND legal_entity_id=c.legal_entity_id
 AND payload_sha256=sha
 AND actor_subject=proof->>'actorSubject'
 AND session_id=proof->>'sessionId'
 AND proof_issued_at_epoch=(proof->>'issuedAt')::bigint
 AND expires_at=pg_catalog.to_timestamp((proof->>'expiresAt')::bigint)
 AND proof_mac_sha256=pg_catalog.encode(hft_crypto.digest(
  pg_catalog.decode(proof->>'macSha256','hex'),'sha256'),'hex');
 SELECT * INTO sess FROM hft.posting_session
 WHERE session_id=proof->>'sessionId'
 AND actor_subject=proof->>'actorSubject';
 IF envelope.command_uuid IS NULL OR n.nonce IS NULL OR sess.session_id IS NULL
 OR c.payload_sha256<>sha OR c.idempotency_key<>p->>'idempotencyKey'
 OR c.product_version_code<>p->>'productVersion'
 OR c.kind<>p->>'kind' OR c.actor_subject<>proof->>'actorSubject'
 OR envelope.exact_payload<>p OR envelope.payload_sha256<>sha
 OR envelope.nonce<>proof->>'nonce'
 OR envelope.proof_mac_sha256<>n.proof_mac_sha256
 OR envelope.actor_session_id<>proof->>'sessionId'
 OR NOT EXISTS(SELECT 1 FROM hft.audit_outbox a
  JOIN hft.audit_delivery d ON d.outbox_id=a.id
  WHERE a.command_id=c.id)
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_SOURCE_NONCE_OR_AUDIT_MISMATCH'; END IF;
 PERFORM hft.ops_a2_assert_command_seal_v2(c.id);
 fact:=hft.ops_a2_fact_v2(c.id);
 IF fact->>'movementSha256'<>envelope.version_movement_sha256
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_VERSIONED_MOVEMENT_DRIFT'; END IF;
 SELECT generation INTO policy_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=c.legal_entity_id AND site_id=c.site_id
 AND warehouse_id=c.warehouse_id;
 IF policy_generation IS NULL THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_POLICY_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object('state','COMMITTED_VERIFIED',
  'automaticRetryAllowed',false,'payloadSha256',sha,
  'originalNonce',proof->>'nonce',
  'sourceEpoch','POLICY-'||policy_generation::text,
  'auditVerified',true,'fact',fact);
END $reconcile$;
ALTER FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;
CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v3(
 p jsonb,original_proof jsonb,q jsonb,fresh_read_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $reconcile_v3$
DECLARE authenticated_actor text;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR session_user IN('hft_engineering','hft_r1_posting_owner')
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_SEPARATE_READ_ONLY_RUNTIME_REQUIRED'; END IF;
 authenticated_actor:=hft.ops_a2_verify_readproof_v2(q,fresh_read_proof);
 IF authenticated_actor IS NULL OR q->>'intent'<>'MOVEMENTS'
 OR q->>'cursor'<>''
 OR q->>'legalEntityId'<>p->>'legalEntityId'
 OR q->>'siteId'<>p->>'siteId'
 OR q->>'warehouseId'<>p->>'warehouseId'
 OR q->>'itemCode'<>p->>'itemCode'
 OR q->>'productVersion'<>p->>'productVersion'
 OR q->>'leafLocationId'<>''
 OR q->>'employeeId'<>''
 OR q->>'limit'<>'1'
 THEN RAISE EXCEPTION 'OPS_A2_RECOVERY_NEW_ACTOR_SOURCE_SCOPE_MISMATCH'; END IF;
 RETURN hft.ops_a2_reconcile_original_attempt_private_v3(p,original_proof);
END $reconcile_v3$;
ALTER FUNCTION hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON FUNCTION hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

-- Readback test/source contract: the current P0 READ HMAC is verified
-- in a REPEATABLE READ READ ONLY transaction. No nonce write or direct
-- runtime table grants are permitted.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_readproof_v2(q jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $readproof$
DECLARE names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 k hft_secret.p0_stores_proof_key%ROWTYPE;
 field text;digest text;mac_expected bytea;mac_claimed bytea;
 i integer;v integer;xor_bits integer:=0;issued bigint;expiry bigint;now_epoch bigint;
 fields text[];
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 OR pg_catalog.jsonb_typeof(q)<>'object' OR
 (SELECT count(*) FROM pg_catalog.jsonb_object_keys(q))<>11
 OR pg_catalog.jsonb_typeof(proof)<>'object' OR
 (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_OR_QUERY_INVALID'; END IF;
 FOREACH field IN ARRAY names LOOP
  IF NOT(proof?field) OR pg_catalog.jsonb_typeof(proof->field)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_FIELDS_INVALID'; END IF;
 END LOOP;
 IF proof->>'proofVersion'<>'HFT-R1-P0-STORES-READ-HMAC-V1'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_FORMAT_INVALID'; END IF;
 fields:=ARRAY[q->>'contractVersion',q->>'intent',
  q->>'legalEntityId',q->>'siteId',q->>'warehouseId',
  q->>'itemCode',q->>'productVersion',q->>'leafLocationId',
  q->>'employeeId',q->>'cursor',q->>'limit'];
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(fields) AS v WHERE v IS NULL)
 OR q->>'contractVersion'<>'HFT-R1-P0-READ-V1'
 OR q->>'intent' NOT IN('BALANCES','MOVEMENTS','CUSTODY')
 OR q->>'cursor'<>'' OR
 q->>'limit' !~ '^[1-9][0-9]{0,2}$' OR
 (q->>'limit')::integer>100 OR
 (q->>'intent')='CUSTODY' AND q->>'employeeId'=''
 THEN RAISE EXCEPTION 'OPS_A2_READ_SCOPE_OR_UNQUALIFIED_CURSOR'; END IF;
 digest:=pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(fields),'sha256'),'hex');
 IF digest<>proof->>'payloadSha256'
 THEN RAISE EXCEPTION 'OPS_A2_READ_QUERY_DIGEST_MISMATCH'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expiry:=(proof->>'expiresAt')::bigint;
 v:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expiry<=now_epoch OR expiry<=issued OR expiry-issued>40
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_EXPIRED_OR_FUTURE'; END IF;
 SELECT * INTO k FROM hft_secret.p0_stores_proof_key WHERE key_version=v;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL OR
 pg_catalog.clock_timestamp()<k.not_before OR
 pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_READ_SIGNING_KEY_UNAVAILABLE'; END IF;
 mac_expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(
  ARRAY[proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  digest,proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',
  proof->>'keyVersion']),k.key_bytes,'sha256');
 mac_claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 FOR i IN 0..31 LOOP
  xor_bits:=xor_bits | (pg_catalog.get_byte(mac_expected,i) #
                        pg_catalog.get_byte(mac_claimed,i));
 END LOOP;
 IF xor_bits<>0 THEN RAISE EXCEPTION 'OPS_A2_READ_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_READ_SESSION_REVOKED'; END IF;
 PERFORM 1 FROM hft.actor_warehouse_grant g
 WHERE g.actor_subject=proof->>'actorSubject'
 AND g.legal_entity_id=q->>'legalEntityId'
 AND g.site_id=q->>'siteId' AND g.warehouse_id=q->>'warehouseId'
 AND g.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_READ_PERSISTED_SCOPE_DENIED'; END IF;
 RETURN proof->>'actorSubject';
END $readproof$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_verify_readproof_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- Bounded (<100 rows), NO PARTIAL INVENTORY DISGUISED AS A FULL COUNT.
-- No silent cursor drift: until source-bound snapshot pagination is
-- independently qualified, any request requiring a second page DENIES.
CREATE OR REPLACE FUNCTION hft.ops_a2_read_authoritative_v2(q jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read$
DECLARE actor text;scope_count bigint;reconstructed bigint;
 a record;c record;row jsonb;rows jsonb:='[]'::jsonb;
 latest_audit text;last_move text;ack text;source_epoch text;
 digest_input text;command_record record;scope_generation bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'OPS_A2_READ_ONLY_TRANSACTION_REQUIRED'; END IF;
 actor:=hft.ops_a2_verify_readproof_v2(q,proof);
 -- True original immutable account reconstruction precedes every response.
 FOR a IN SELECT id,qty_micro,version FROM hft.stock_account
  WHERE legal_entity_id=q->>'legalEntityId' AND site_id=q->>'siteId'
   AND warehouse_id=q->>'warehouseId'
 LOOP
  SELECT COALESCE(sum(qty_delta_micro),0),
    COALESCE(count(*),0)
  INTO reconstructed,scope_count FROM hft.stock_entry
  WHERE account_id=a.id;
  IF a.qty_micro<>reconstructed OR a.version<>scope_count
  THEN RAISE EXCEPTION 'OPS_A2_READ_ACCOUNT_RECONSTRUCTION_INVALID'; END IF;
 END LOOP;
 -- Every source command in the requested scope must have an authentic
 -- immutable seal, audit, original nonce and exactly two matching ledger legs.
 FOR command_record IN SELECT id,payload_contract_version
  FROM hft.stock_command
 WHERE legal_entity_id=q->>'legalEntityId'
  AND site_id=q->>'siteId'
  AND warehouse_id=q->>'warehouseId'
 LOOP
  IF command_record.payload_contract_version='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
  THEN PERFORM hft.ops_a2_assert_command_seal_v2(command_record.id);
  ELSE PERFORM hft.assert_command_seal_v1(command_record.id);
  END IF;
 END LOOP;
 IF q->>'intent'='MOVEMENTS' THEN
  -- Scope via immutable COMMAND; LEFT JOIN preserves the legitimate EXTERNAL
  -- debit leg. Account history comes from the ENTRY, never current versions.
  FOR c IN
   SELECT e.id AS entry_id,e.command_id AS command_uuid,
    e.account_id,e.account_before_version,e.account_after_version,
    e.qty_delta_micro,e.bucket AS account_kind,
    cmd.legal_entity_id,cmd.site_id,cmd.warehouse_id,cmd.item_code,
    e.product_version_code,
    COALESCE(a.location_key,cmd.location_id) AS location_key,
    COALESCE(a.condition,'GOOD') AS condition,
    COALESCE(a.serial_key,COALESCE(e.serial_no,'')) AS serial_key,
    COALESCE(a.batch_key,COALESCE(e.batch_no,'')) AS batch_key,
    COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,'')) AS custodian_employee_id,
    audit.canonical_sha256
   FROM hft.stock_entry AS e
   JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
   LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
   WHERE cmd.legal_entity_id=q->>'legalEntityId'
    AND cmd.site_id=q->>'siteId' AND cmd.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR cmd.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR e.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR
      COALESCE(a.location_key,cmd.location_id)=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR
      COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,''))=q->>'employeeId')
   ORDER BY e.id LIMIT (q->>'limit')::integer+1
  LOOP
   IF c.account_kind='EXTERNAL' AND
      (c.account_id IS NOT NULL OR c.account_before_version IS NOT NULL
       OR c.account_after_version IS NOT NULL)
   THEN RAISE EXCEPTION 'OPS_A2_EXTERNAL_LEDGER_OWNERSHIP_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_key,
    'accountKind',c.account_kind,'condition',c.condition,
    'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_delta_micro),
    'accountVersion',COALESCE(c.account_after_version,0),
    'accountBeforeVersion',c.account_before_version,
    'accountAfterVersion',c.account_after_version,
    'commandUuid',c.command_uuid::text,'entryId',c.entry_id::text,
    'movementId','ENTRY-'||c.entry_id::text,
    'auditSha256',c.canonical_sha256,
    'humanAcknowledgement','NOT_APPLICABLE'));
  END LOOP;
 ELSIF q->>'intent'='CUSTODY' THEN
  -- One row per ORIGINAL ISSUE, never a latest-ACK inference on an
  -- aggregate CUSTODY account. Separate issue/fragment provenance survives.
  FOR c IN
   SELECT cu.issue_command_id,cu.legal_entity_id,issue.site_id,
    cu.warehouse_id,cu.item_code,cu.product_version_code,
    cu.location_id,cu.employee_id,cu.serial_no,cu.batch_no,
    cu.issued_micro-cu.returned_micro AS outstanding_micro,
    a.version AS account_version,ack.state AS ack_state,
    audit.canonical_sha256 AS source_audit,issue.command_id AS original_issue_id
   FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS issue ON issue.id=cu.issue_command_id
   JOIN hft.custody_ack_status_v1 AS ack
    ON ack.issue_command_uuid=cu.issue_command_id
    AND ack.legal_entity_id=cu.legal_entity_id
    AND ack.employee_id=cu.employee_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cu.issue_command_id
   JOIN hft.stock_account AS a
    ON a.legal_entity_id=cu.legal_entity_id
    AND a.site_id=issue.site_id AND a.warehouse_id=cu.warehouse_id
    AND a.item_code=cu.item_code
    AND a.product_version_code=cu.product_version_code
    AND a.location_key=cu.location_id
    AND a.account_kind='CUSTODY'
    AND a.custodian_employee_id=cu.employee_id
    AND a.serial_key=cu.serial_no AND a.batch_key=cu.batch_no
   WHERE cu.legal_entity_id=q->>'legalEntityId'
    AND issue.site_id=q->>'siteId'
    AND cu.warehouse_id=q->>'warehouseId'
    AND cu.employee_id=q->>'employeeId'
    AND cu.issued_micro>cu.returned_micro
    AND (q->>'itemCode'='' OR cu.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR cu.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR cu.location_id=q->>'leafLocationId')
   ORDER BY cu.issue_command_id LIMIT (q->>'limit')::integer+1
  LOOP
   IF c.ack_state NOT IN('ACK_PENDING','ACKNOWLEDGED','DISPUTED')
   THEN RAISE EXCEPTION 'OPS_A2_CUSTODY_ACK_STATE_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_id,
    'accountKind','CUSTODY','condition','GOOD',
    'serialNo',c.serial_no,'batchNo',c.batch_no,'employeeId',c.employee_id,
    'quantity',hft.format_signed_micro_v2(c.outstanding_micro),
    'accountVersion',c.account_version,
    'movementId','ISSUE-'||c.issue_command_id::text,
    'originalIssueId',c.original_issue_id,
    'auditSha256',c.source_audit,'humanAcknowledgement',c.ack_state));
  END LOOP;
 ELSE
  FOR c IN
   SELECT a.*,COALESCE(
    (SELECT audit.canonical_sha256 FROM hft.stock_entry e
     JOIN hft.audit_outbox audit ON audit.command_id=e.command_id
     WHERE e.account_id=a.id ORDER BY e.id DESC LIMIT 1),
    (SELECT receipt.source_evidence_sha256
     FROM hft.ops_a2_account_provision_receipt AS receipt
     WHERE receipt.account_id=a.id),
    repeat('0',64)) AS source_audit
   FROM hft.stock_account a
   WHERE a.legal_entity_id=q->>'legalEntityId'
    AND a.site_id=q->>'siteId' AND a.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR a.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR a.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR a.location_key=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR a.custodian_employee_id=q->>'employeeId')
    AND (q->>'intent'<>'CUSTODY' OR
      a.account_kind='CUSTODY' AND a.custodian_employee_id=q->>'employeeId')
   ORDER BY a.item_code,a.product_version_code,a.location_key,a.id
   LIMIT (q->>'limit')::integer+1
  LOOP
   IF c.qty_micro=0 AND c.version=0 AND NOT EXISTS(
    SELECT 1 FROM hft.ops_a2_account_provision_receipt AS receipt
    JOIN hft.ops_a2_account_provision_order AS approved
     ON approved.order_id=receipt.order_id
    WHERE receipt.account_id=c.id
     AND approved.account_id=c.id
     AND approved.legal_entity_id=c.legal_entity_id
     AND approved.site_id=c.site_id
     AND approved.warehouse_id=c.warehouse_id
     AND approved.item_code=c.item_code
     AND approved.product_version_code=c.product_version_code
     AND approved.leaf_location_id=c.location_key
     AND approved.account_kind=c.account_kind
     AND approved.condition=c.condition
     AND approved.serial_no=c.serial_key AND approved.batch_no=c.batch_key
     AND approved.custodian_employee_id=c.custodian_employee_id)
   THEN RAISE EXCEPTION 'OPS_A2_UNATTESTED_ZERO_OPENING_ACCOUNT'; END IF;
   ack:='NOT_APPLICABLE';
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,
    'leafLocationId',c.location_key,'accountKind',c.account_kind,
    'condition',c.condition,'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_micro),
    'accountVersion',c.version,'movementId','ACCOUNT-'||c.id::text,
    'auditSha256',c.source_audit,'humanAcknowledgement',ack));
  END LOOP;
 END IF;
 IF pg_catalog.jsonb_array_length(rows)>(q->>'limit')::integer
 THEN RAISE EXCEPTION 'OPS_A2_READ_UNQUALIFIED_MULTI_PAGE_SNAPSHOT'; END IF;
 SELECT generation INTO scope_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=q->>'legalEntityId'
 AND site_id=q->>'siteId' AND warehouse_id=q->>'warehouseId';
 IF scope_generation IS NULL THEN RAISE EXCEPTION 'OPS_A2_READ_POLICY_EPOCH_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'state','AUTHORITATIVE_VERSIONED_READ',
  'versionAuthority','OPS_A2_VERSION_AWARE_V2',
  'intent',q->>'intent','sourceEpoch','POLICY-'||scope_generation::text,
  'nextCursor','','durable',true,'synthetic',false,'auditVerified',true,
  'rows',rows);
END $read$;
REVOKE EXECUTE ON FUNCTION hft.ops_a2_read_authoritative_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;
-- 061 source-only: independent page HMAC, SQL filters and ordering are
-- rechecked per query. The only qualified usage is a single pinned
-- REPEATABLE READ READ ONLY transaction that exhausts every page before
-- returning a result. A browser cannot resume these offsets in a new
-- transaction and claim snapshot completeness.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_paged_readproof_v3(q jsonb,proof jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp
AS $readproof$
DECLARE names text[]:=ARRAY['proofVersion','actorSubject','sessionId',
 'payloadSha256','issuedAt','expiresAt','nonce','keyVersion','macSha256'];
 k hft_secret.p0_stores_proof_key%ROWTYPE;
 field text;digest text;mac_expected bytea;mac_claimed bytea;
 i integer;v integer;xor_bits integer:=0;issued bigint;expiry bigint;now_epoch bigint;
 fields text[];
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'repeatable read'
 OR pg_catalog.current_setting('transaction_read_only')<>'on'
 OR pg_catalog.jsonb_typeof(q)<>'object' OR
 (SELECT count(*) FROM pg_catalog.jsonb_object_keys(q))<>11
 OR pg_catalog.jsonb_typeof(proof)<>'object' OR
 (SELECT count(*) FROM pg_catalog.jsonb_object_keys(proof))<>9
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_OR_QUERY_INVALID'; END IF;
 FOREACH field IN ARRAY names LOOP
  IF NOT(proof?field) OR pg_catalog.jsonb_typeof(proof->field)<>'string'
  THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_FIELDS_INVALID'; END IF;
 END LOOP;
 IF proof->>'proofVersion'<>'HFT-R1-P0-STORES-READ-HMAC-V1'
 OR proof->>'nonce' !~ '^[0-9a-f]{48}$'
 OR proof->>'macSha256' !~ '^[0-9a-f]{64}$'
 OR proof->>'keyVersion' !~ '^[1-9][0-9]{0,8}$'
 OR proof->>'issuedAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'expiresAt' !~ '^[1-9][0-9]{0,18}$'
 OR proof->>'actorSubject' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 OR proof->>'sessionId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_FORMAT_INVALID'; END IF;
 fields:=ARRAY[q->>'contractVersion',q->>'intent',
  q->>'legalEntityId',q->>'siteId',q->>'warehouseId',
  q->>'itemCode',q->>'productVersion',q->>'leafLocationId',
  q->>'employeeId',q->>'cursor',q->>'limit'];
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(fields) AS v WHERE v IS NULL)
 OR q->>'contractVersion'<>'HFT-R1-P0-READ-V1'
 OR q->>'intent' NOT IN('BALANCES','MOVEMENTS','CUSTODY')
 OR (q->>'cursor'<>'' AND (
  q->>'cursor' !~ '^[1-9][0-9]{0,4}$'
  OR (q->>'cursor')::integer>10000)) OR
 q->>'limit' !~ '^[1-9][0-9]{0,2}$' OR
 (q->>'limit')::integer>100 OR
 (q->>'intent')='CUSTODY' AND q->>'employeeId'=''
 THEN RAISE EXCEPTION 'OPS_A2_READ_SCOPE_OR_UNQUALIFIED_CURSOR'; END IF;
 digest:=pg_catalog.encode(hft_crypto.digest(
  hft.p2_length_prefixed_v1(fields),'sha256'),'hex');
 IF digest<>proof->>'payloadSha256'
 THEN RAISE EXCEPTION 'OPS_A2_READ_QUERY_DIGEST_MISMATCH'; END IF;
 issued:=(proof->>'issuedAt')::bigint;
 expiry:=(proof->>'expiresAt')::bigint;
 v:=(proof->>'keyVersion')::integer;
 now_epoch:=pg_catalog.floor(pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF issued>now_epoch+30 OR expiry<=now_epoch OR expiry<=issued OR expiry-issued>40
 THEN RAISE EXCEPTION 'OPS_A2_READ_PROOF_EXPIRED_OR_FUTURE'; END IF;
 SELECT * INTO k FROM hft_secret.p0_stores_proof_key WHERE key_version=v;
 IF k.key_version IS NULL OR k.revoked_at IS NOT NULL OR
 pg_catalog.clock_timestamp()<k.not_before OR
 pg_catalog.clock_timestamp()>=k.not_after
 THEN RAISE EXCEPTION 'OPS_A2_READ_SIGNING_KEY_UNAVAILABLE'; END IF;
 mac_expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(
  ARRAY[proof->>'proofVersion',proof->>'actorSubject',proof->>'sessionId',
  digest,proof->>'issuedAt',proof->>'expiresAt',proof->>'nonce',
  proof->>'keyVersion']),k.key_bytes,'sha256');
 mac_claimed:=pg_catalog.decode(proof->>'macSha256','hex');
 FOR i IN 0..31 LOOP
  xor_bits:=xor_bits | (pg_catalog.get_byte(mac_expected,i) #
                        pg_catalog.get_byte(mac_claimed,i));
 END LOOP;
 IF xor_bits<>0 THEN RAISE EXCEPTION 'OPS_A2_READ_HMAC_INVALID'; END IF;
 PERFORM 1 FROM hft.posting_session sess
 WHERE sess.session_id=proof->>'sessionId'
 AND sess.actor_subject=proof->>'actorSubject'
 AND sess.revoked_at IS NULL AND sess.expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_READ_SESSION_REVOKED'; END IF;
 PERFORM 1 FROM hft.actor_warehouse_grant g
 WHERE g.actor_subject=proof->>'actorSubject'
 AND g.legal_entity_id=q->>'legalEntityId'
 AND g.site_id=q->>'siteId' AND g.warehouse_id=q->>'warehouseId'
 AND g.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_READ_PERSISTED_SCOPE_DENIED'; END IF;
 RETURN proof->>'actorSubject';
END $readproof$;

REVOKE ALL ON FUNCTION hft.ops_a2_verify_paged_readproof_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

CREATE OR REPLACE FUNCTION hft.ops_a2_read_snapshot_page_v3(q jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $read$
DECLARE actor text;scope_count bigint;reconstructed bigint;
 a record;c record;row jsonb;rows jsonb:='[]'::jsonb;
 latest_audit text;last_move text;ack text;source_epoch text;
 digest_input text;command_record record;scope_generation bigint;
 offset_num integer:=COALESCE(NULLIF(q->>'cursor','')::integer,0);
 next_offset text:='';
 expected_total bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'OPS_A2_READ_ONLY_TRANSACTION_REQUIRED'; END IF;
 actor:=hft.ops_a2_verify_paged_readproof_v3(q,proof);
 -- True original immutable account reconstruction precedes every response.
 FOR a IN SELECT id,qty_micro,version FROM hft.stock_account
  WHERE legal_entity_id=q->>'legalEntityId' AND site_id=q->>'siteId'
   AND warehouse_id=q->>'warehouseId'
 LOOP
  SELECT COALESCE(sum(qty_delta_micro),0),
    COALESCE(count(*),0)
  INTO reconstructed,scope_count FROM hft.stock_entry
  WHERE account_id=a.id;
  IF a.qty_micro<>reconstructed OR a.version<>scope_count
  THEN RAISE EXCEPTION 'OPS_A2_READ_ACCOUNT_RECONSTRUCTION_INVALID'; END IF;
 END LOOP;
 -- Every source command in the requested scope must have an authentic
 -- immutable seal, audit, original nonce and exactly two matching ledger legs.
 FOR command_record IN SELECT id,payload_contract_version
  FROM hft.stock_command
 WHERE legal_entity_id=q->>'legalEntityId'
  AND site_id=q->>'siteId'
  AND warehouse_id=q->>'warehouseId'
 LOOP
  IF command_record.payload_contract_version='HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED'
  THEN PERFORM hft.ops_a2_assert_command_seal_v2(command_record.id);
  ELSE PERFORM hft.assert_command_seal_v1(command_record.id);
  END IF;
 END LOOP;
 -- Count the EXACT same source rows as each page on this one transaction
 -- snapshot. A forged premature terminal cursor cannot certify completeness.
 IF q->>'intent'='MOVEMENTS' THEN
  SELECT count(*) INTO expected_total
  FROM hft.stock_entry AS e
  JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
  LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
  JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
  WHERE cmd.legal_entity_id=q->>'legalEntityId'
   AND cmd.site_id=q->>'siteId' AND cmd.warehouse_id=q->>'warehouseId'
   AND (q->>'itemCode'='' OR cmd.item_code=q->>'itemCode')
   AND (q->>'productVersion'='' OR e.product_version_code=q->>'productVersion')
   AND (q->>'leafLocationId'='' OR
    COALESCE(a.location_key,cmd.location_id)=q->>'leafLocationId')
   AND (q->>'employeeId'='' OR
    COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,''))=q->>'employeeId');
 ELSIF q->>'intent'='CUSTODY' THEN
  SELECT count(*) INTO expected_total
  FROM hft.employee_custody AS cu
  JOIN hft.stock_command AS issue ON issue.id=cu.issue_command_id
  JOIN hft.custody_ack_status_v1 AS ack
   ON ack.issue_command_uuid=cu.issue_command_id
   AND ack.legal_entity_id=cu.legal_entity_id
   AND ack.employee_id=cu.employee_id
  JOIN hft.audit_outbox AS audit ON audit.command_id=cu.issue_command_id
  JOIN hft.stock_account AS a
   ON a.legal_entity_id=cu.legal_entity_id
   AND a.site_id=issue.site_id AND a.warehouse_id=cu.warehouse_id
   AND a.item_code=cu.item_code
   AND a.product_version_code=cu.product_version_code
   AND a.location_key=cu.location_id
   AND a.account_kind='CUSTODY'
   AND a.custodian_employee_id=cu.employee_id
   AND a.serial_key=cu.serial_no AND a.batch_key=cu.batch_no
  WHERE cu.legal_entity_id=q->>'legalEntityId'
   AND issue.site_id=q->>'siteId'
   AND cu.warehouse_id=q->>'warehouseId'
   AND cu.employee_id=q->>'employeeId'
   AND cu.issued_micro>cu.returned_micro
   AND (q->>'itemCode'='' OR cu.item_code=q->>'itemCode')
   AND (q->>'productVersion'='' OR cu.product_version_code=q->>'productVersion')
   AND (q->>'leafLocationId'='' OR cu.location_id=q->>'leafLocationId');
 ELSE
  SELECT count(*) INTO expected_total FROM hft.stock_account AS a
  WHERE a.legal_entity_id=q->>'legalEntityId'
   AND a.site_id=q->>'siteId' AND a.warehouse_id=q->>'warehouseId'
   AND (q->>'itemCode'='' OR a.item_code=q->>'itemCode')
   AND (q->>'productVersion'='' OR a.product_version_code=q->>'productVersion')
   AND (q->>'leafLocationId'='' OR a.location_key=q->>'leafLocationId')
   AND (q->>'employeeId'='' OR a.custodian_employee_id=q->>'employeeId');
 END IF;
 IF expected_total>10000 OR offset_num>expected_total
 THEN RAISE EXCEPTION 'OPS_A2_SNAPSHOT_SCOPE_LIMIT_OR_OFFSET_INVALID'; END IF;
 IF q->>'intent'='MOVEMENTS' THEN
  -- Scope via immutable COMMAND; LEFT JOIN preserves the legitimate EXTERNAL
  -- debit leg. Account history comes from the ENTRY, never current versions.
  FOR c IN
   SELECT e.id AS entry_id,e.command_id AS command_uuid,
    e.account_id,e.account_before_version,e.account_after_version,
    e.qty_delta_micro,e.bucket AS account_kind,
    cmd.legal_entity_id,cmd.site_id,cmd.warehouse_id,cmd.item_code,
    e.product_version_code,
    COALESCE(a.location_key,cmd.location_id) AS location_key,
    COALESCE(a.condition,'GOOD') AS condition,
    COALESCE(a.serial_key,COALESCE(e.serial_no,'')) AS serial_key,
    COALESCE(a.batch_key,COALESCE(e.batch_no,'')) AS batch_key,
    COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,'')) AS custodian_employee_id,
    audit.canonical_sha256
   FROM hft.stock_entry AS e
   JOIN hft.stock_command AS cmd ON cmd.id=e.command_id
   LEFT JOIN hft.stock_account AS a ON a.id=e.account_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cmd.id
   WHERE cmd.legal_entity_id=q->>'legalEntityId'
    AND cmd.site_id=q->>'siteId' AND cmd.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR cmd.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR e.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR
      COALESCE(a.location_key,cmd.location_id)=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR
      COALESCE(a.custodian_employee_id,COALESCE(e.employee_id,''))=q->>'employeeId')
   ORDER BY e.id LIMIT (q->>'limit')::integer+1 OFFSET offset_num
  LOOP
   IF c.account_kind='EXTERNAL' AND
      (c.account_id IS NOT NULL OR c.account_before_version IS NOT NULL
       OR c.account_after_version IS NOT NULL)
   THEN RAISE EXCEPTION 'OPS_A2_EXTERNAL_LEDGER_OWNERSHIP_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_key,
    'accountKind',c.account_kind,'condition',c.condition,
    'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_delta_micro),
    'accountVersion',COALESCE(c.account_after_version,0),
    'accountBeforeVersion',c.account_before_version,
    'accountAfterVersion',c.account_after_version,
    'commandUuid',c.command_uuid::text,'entryId',c.entry_id::text,
    'movementId','ENTRY-'||c.entry_id::text,
    'auditSha256',c.canonical_sha256,
    'humanAcknowledgement','NOT_APPLICABLE'));
  END LOOP;
 ELSIF q->>'intent'='CUSTODY' THEN
  -- One row per ORIGINAL ISSUE, never a latest-ACK inference on an
  -- aggregate CUSTODY account. Separate issue/fragment provenance survives.
  FOR c IN
   SELECT cu.issue_command_id,cu.legal_entity_id,issue.site_id,
    cu.warehouse_id,cu.item_code,cu.product_version_code,
    cu.location_id,cu.employee_id,cu.serial_no,cu.batch_no,
    cu.issued_micro-cu.returned_micro AS outstanding_micro,
    a.version AS account_version,ack.state AS ack_state,
    audit.canonical_sha256 AS source_audit,issue.command_id AS original_issue_id
   FROM hft.employee_custody AS cu
   JOIN hft.stock_command AS issue ON issue.id=cu.issue_command_id
   JOIN hft.custody_ack_status_v1 AS ack
    ON ack.issue_command_uuid=cu.issue_command_id
    AND ack.legal_entity_id=cu.legal_entity_id
    AND ack.employee_id=cu.employee_id
   JOIN hft.audit_outbox AS audit ON audit.command_id=cu.issue_command_id
   JOIN hft.stock_account AS a
    ON a.legal_entity_id=cu.legal_entity_id
    AND a.site_id=issue.site_id AND a.warehouse_id=cu.warehouse_id
    AND a.item_code=cu.item_code
    AND a.product_version_code=cu.product_version_code
    AND a.location_key=cu.location_id
    AND a.account_kind='CUSTODY'
    AND a.custodian_employee_id=cu.employee_id
    AND a.serial_key=cu.serial_no AND a.batch_key=cu.batch_no
   WHERE cu.legal_entity_id=q->>'legalEntityId'
    AND issue.site_id=q->>'siteId'
    AND cu.warehouse_id=q->>'warehouseId'
    AND cu.employee_id=q->>'employeeId'
    AND cu.issued_micro>cu.returned_micro
    AND (q->>'itemCode'='' OR cu.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR cu.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR cu.location_id=q->>'leafLocationId')
   ORDER BY cu.issue_command_id LIMIT (q->>'limit')::integer+1 OFFSET offset_num
  LOOP
   IF c.ack_state NOT IN('ACK_PENDING','ACKNOWLEDGED','DISPUTED')
   THEN RAISE EXCEPTION 'OPS_A2_CUSTODY_ACK_STATE_INVALID'; END IF;
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,'leafLocationId',c.location_id,
    'accountKind','CUSTODY','condition','GOOD',
    'serialNo',c.serial_no,'batchNo',c.batch_no,'employeeId',c.employee_id,
    'quantity',hft.format_signed_micro_v2(c.outstanding_micro),
    'accountVersion',c.account_version,
    'movementId','ISSUE-'||c.issue_command_id::text,
    'originalIssueId',c.original_issue_id,
    'auditSha256',c.source_audit,'humanAcknowledgement',c.ack_state));
  END LOOP;
 ELSE
  FOR c IN
   SELECT a.*,COALESCE(
    (SELECT audit.canonical_sha256 FROM hft.stock_entry e
     JOIN hft.audit_outbox audit ON audit.command_id=e.command_id
     WHERE e.account_id=a.id ORDER BY e.id DESC LIMIT 1),
    (SELECT receipt.source_evidence_sha256
     FROM hft.ops_a2_account_provision_receipt AS receipt
     WHERE receipt.account_id=a.id),
    repeat('0',64)) AS source_audit
   FROM hft.stock_account a
   WHERE a.legal_entity_id=q->>'legalEntityId'
    AND a.site_id=q->>'siteId' AND a.warehouse_id=q->>'warehouseId'
    AND (q->>'itemCode'='' OR a.item_code=q->>'itemCode')
    AND (q->>'productVersion'='' OR a.product_version_code=q->>'productVersion')
    AND (q->>'leafLocationId'='' OR a.location_key=q->>'leafLocationId')
    AND (q->>'employeeId'='' OR a.custodian_employee_id=q->>'employeeId')
    AND (q->>'intent'<>'CUSTODY' OR
      a.account_kind='CUSTODY' AND a.custodian_employee_id=q->>'employeeId')
   ORDER BY a.item_code,a.product_version_code,a.location_key,a.id
   LIMIT (q->>'limit')::integer+1 OFFSET offset_num
  LOOP
   IF c.qty_micro=0 AND c.version=0 AND NOT EXISTS(
    SELECT 1 FROM hft.ops_a2_account_provision_receipt AS receipt
    JOIN hft.ops_a2_account_provision_order AS approved
     ON approved.order_id=receipt.order_id
    WHERE receipt.account_id=c.id
     AND approved.account_id=c.id
     AND approved.legal_entity_id=c.legal_entity_id
     AND approved.site_id=c.site_id
     AND approved.warehouse_id=c.warehouse_id
     AND approved.item_code=c.item_code
     AND approved.product_version_code=c.product_version_code
     AND approved.leaf_location_id=c.location_key
     AND approved.account_kind=c.account_kind
     AND approved.condition=c.condition
     AND approved.serial_no=c.serial_key AND approved.batch_no=c.batch_key
     AND approved.custodian_employee_id=c.custodian_employee_id)
   THEN RAISE EXCEPTION 'OPS_A2_UNATTESTED_ZERO_OPENING_ACCOUNT'; END IF;
   ack:='NOT_APPLICABLE';
   rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'legalEntityId',c.legal_entity_id,'siteId',c.site_id,
    'warehouseId',c.warehouse_id,'itemCode',c.item_code,
    'productVersion',c.product_version_code,
    'leafLocationId',c.location_key,'accountKind',c.account_kind,
    'condition',c.condition,'serialNo',c.serial_key,'batchNo',c.batch_key,
    'employeeId',c.custodian_employee_id,
    'quantity',hft.format_signed_micro_v2(c.qty_micro),
    'accountVersion',c.version,'movementId','ACCOUNT-'||c.id::text,
    'auditSha256',c.source_audit,'humanAcknowledgement',ack));
  END LOOP;
 END IF;
 IF pg_catalog.jsonb_array_length(rows)>(q->>'limit')::integer THEN
  next_offset:=(offset_num+(q->>'limit')::integer)::text;
  SELECT COALESCE(pg_catalog.jsonb_agg(x.value ORDER BY x.ordinality),'[]'::jsonb)
  INTO rows FROM pg_catalog.jsonb_array_elements(rows)
   WITH ORDINALITY AS x(value,ordinality)
   WHERE x.ordinality<=(q->>'limit')::integer;
 END IF;
 SELECT generation INTO scope_generation FROM hft.posting_policy_epoch
 WHERE legal_entity_id=q->>'legalEntityId'
 AND site_id=q->>'siteId' AND warehouse_id=q->>'warehouseId';
 IF scope_generation IS NULL THEN RAISE EXCEPTION 'OPS_A2_READ_POLICY_EPOCH_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'state','AUTHORITATIVE_VERSIONED_READ',
  'versionAuthority','OPS_A2_VERSION_AWARE_V2',
  'intent',q->>'intent','sourceEpoch','POLICY-'||scope_generation::text,
  'nextCursor',next_offset,'snapshotTotalRows',expected_total,
  'durable',true,'synthetic',false,'auditVerified',true,
  'rows',rows);
END $read$;

REVOKE ALL ON FUNCTION hft.ops_a2_read_snapshot_page_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

-- No grants in this candidate. The actual future runtime allowlist MUST
-- include exactly the vetted resolver, writer, reconcile and readback
-- functions under distinct qualified nonowner logins after independent
-- privilege proofs. No PUBLIC inherited EXECUTE or direct protected table DML.

-- ===== END SOURCE 4/4 =====

-- No automatic runtime grants: protected ACL acceptance remains an independent prerequisite.
COMMIT;
