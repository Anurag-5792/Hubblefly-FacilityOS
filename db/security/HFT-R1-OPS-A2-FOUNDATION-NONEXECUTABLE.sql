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
 OR pg_catalog.to_regrole('hft_r1_posting_owner') IS NULL
 OR pg_catalog.to_regrole('hft_r1_governance_issuer') IS NULL
 OR pg_catalog.to_regrole('hft_r1_app_runtime') IS NULL
 OR pg_catalog.to_regprocedure('hft.ops_a_payload_digest_v2(jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('hft.p2_length_prefixed_v1(text[])') IS NULL
 OR pg_catalog.to_regprocedure('hft_crypto.hmac(bytea,bytea,text)') IS NULL
 OR pg_catalog.to_regclass('hft_secret.p0_stores_proof_key') IS NULL
 OR pg_catalog.to_regclass('hft.protected_approval_decision') IS NULL
 OR pg_catalog.to_regclass('hft.posting_action_policy') IS NULL
 OR pg_catalog.to_regclass('hft.actor_warehouse_grant') IS NULL
 OR pg_catalog.to_regclass('hft.stock_hold') IS NULL
 OR pg_catalog.to_regclass('hft.posting_parent_hold') IS NULL
 OR pg_catalog.to_regclass('hft.return_inspection_attestation') IS NULL
 OR pg_catalog.to_regclass('hft.custody_ack_status_v1') IS NULL
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
-- 063: one immutable counter transition per immutable TRANSFER command.
-- No counter-only privileged edit is valid without a unique matching command.
CREATE TABLE hft.ops_a2_transfer_counter_link(
 command_uuid uuid PRIMARY KEY REFERENCES hft.stock_command(id),
 transfer_document_id uuid NOT NULL
 REFERENCES hft.ops_a2_transfer_document(id),
 quantity_micro bigint NOT NULL CHECK(quantity_micro>0),
 before_micro bigint NOT NULL CHECK(before_micro>=0),
 after_micro bigint NOT NULL CHECK(after_micro>before_micro),
 UNIQUE(transfer_document_id,after_micro),
 CHECK(after_micro=before_micro+quantity_micro)
);
CREATE TRIGGER immutable_ops_a2_transfer_counter_link
 BEFORE UPDATE OR DELETE ON hft.ops_a2_transfer_counter_link
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_transfer_counter_link FROM PUBLIC,hft_r1_app_runtime;

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
 OR NOT EXISTS(
  SELECT 1 FROM hft.ops_a2_transfer_counter_link AS link
  JOIN hft.stock_command AS command ON command.id=link.command_uuid
  WHERE link.transfer_document_id=OLD.id
   AND link.before_micro=OLD.moved_micro
   AND link.after_micro=NEW.moved_micro
   AND link.quantity_micro=NEW.moved_micro-OLD.moved_micro
   AND command.kind='TRANSFER' AND command.id=link.command_uuid
   AND command.source_document_id=OLD.id::text
   AND command.legal_entity_id=OLD.legal_entity_id
   AND command.site_id=OLD.site_id AND command.warehouse_id=OLD.warehouse_id
   AND command.item_code=OLD.item_code
   AND command.product_version_code=OLD.product_version_code
   AND command.ops_a2_source_leaf=OLD.source_leaf
   AND command.ops_a2_destination_leaf=OLD.destination_leaf
   AND command.quantity_micro=link.quantity_micro
   AND (SELECT count(*) FROM hft.stock_entry AS leg
    WHERE leg.command_id=command.id)=2)
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION'; END IF;
 RETURN NEW;
END $protect_transfer$;
CREATE TRIGGER ops_a2_transfer_document_immutable_v2
 BEFORE UPDATE OR DELETE ON hft.ops_a2_transfer_document
 FOR EACH ROW EXECUTE FUNCTION hft.ops_a2_protect_transfer_document_v2();
REVOKE EXECUTE ON FUNCTION hft.ops_a2_protect_transfer_document_v2()
 FROM PUBLIC,hft_r1_app_runtime;
-- A deferred link guard rejects privileged counter-only tampering, stale
-- cumulative status, missing immutable command, and forged linked quantity.
CREATE OR REPLACE FUNCTION hft.ops_a2_verify_transfer_counter_link_v3()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp
AS $transfer_link_commit$
DECLARE d hft.ops_a2_transfer_document%ROWTYPE;
 c hft.stock_command%ROWTYPE;
 l hft.ops_a2_transfer_counter_link%ROWTYPE;
 linked_total bigint;
BEGIN
 IF TG_OP='INSERT' THEN l:=NEW;
 ELSE
  SELECT * INTO l FROM hft.ops_a2_transfer_counter_link
  WHERE transfer_document_id=NEW.id AND after_micro=NEW.moved_micro;
  IF l.command_uuid IS NULL THEN
   RAISE EXCEPTION 'OPS_A2_TRANSFER_COUNTER_UNBACKED_BY_COMMAND'; END IF;
 END IF;
 SELECT * INTO d FROM hft.ops_a2_transfer_document
 WHERE id=l.transfer_document_id;
 SELECT * INTO c FROM hft.stock_command WHERE id=l.command_uuid;
 IF d.id IS NULL OR c.id IS NULL OR c.kind<>'TRANSFER'
 OR c.source_document_id<>d.id::text
 OR c.legal_entity_id<>d.legal_entity_id OR c.site_id<>d.site_id
 OR c.warehouse_id<>d.warehouse_id OR c.item_code<>d.item_code
 OR c.product_version_code<>d.product_version_code
 OR c.ops_a2_source_leaf<>d.source_leaf
 OR c.ops_a2_destination_leaf<>d.destination_leaf
 OR c.quantity_micro<>l.quantity_micro
 OR NOT EXISTS(SELECT 1 FROM hft.ops_a2_command_envelope AS env
    WHERE env.command_uuid=c.id
    AND env.exact_payload->>'sourceDocumentId'=d.id::text
    AND (env.exact_payload->>'quantityMicro')::bigint=l.quantity_micro)
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_ORIGINAL_COMMAND_BINDING_INVALID'; END IF;
 -- The exact command/ledger/evidence checks include both legs and V2 digest.
 PERFORM hft.ops_a2_assert_command_seal_v2(c.id);
 SELECT COALESCE(sum(quantity_micro),0) INTO linked_total
 FROM hft.ops_a2_transfer_counter_link WHERE transfer_document_id=d.id;
 IF linked_total<>d.moved_micro OR d.moved_micro>d.authorized_micro
 OR (d.moved_micro=d.authorized_micro AND d.status<>'MOVED')
 OR (d.moved_micro<d.authorized_micro AND d.status<>'PARTIALLY_MOVED')
 OR EXISTS(SELECT 1 FROM hft.ops_a2_transfer_counter_link AS x
  WHERE x.transfer_document_id=d.id AND x.before_micro<>
   COALESCE((SELECT max(y.after_micro)
      FROM hft.ops_a2_transfer_counter_link AS y
      WHERE y.transfer_document_id=d.id AND y.after_micro<x.after_micro),0))
 THEN RAISE EXCEPTION 'OPS_A2_TRANSFER_COUNTER_LEDGER_CHAIN_MISMATCH'; END IF;
 RETURN NULL;
END $transfer_link_commit$;
CREATE CONSTRAINT TRIGGER ops_a2_transfer_counter_link_requires_command_v3
 AFTER INSERT ON hft.ops_a2_transfer_counter_link
 DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.ops_a2_verify_transfer_counter_link_v3();
CREATE CONSTRAINT TRIGGER ops_a2_transfer_counter_change_requires_command_v3
 AFTER UPDATE ON hft.ops_a2_transfer_document
 DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION hft.ops_a2_verify_transfer_counter_link_v3();
REVOKE EXECUTE ON FUNCTION hft.ops_a2_verify_transfer_counter_link_v3()
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

-- 067: the original P2 approval does NOT authorize an arbitrary zero
-- account or new transfer solely because its document ID matches an order.
-- Independently protected, cryptographically scoped ORIGINAL authorization is
-- mandatory for every extra identity dimension. No keys are enrolled here.
-- A separate technical key-custody approval is REQUIRED before installation.
CREATE TABLE hft_secret.ops_a2_scope_key_v1(
 purpose text NOT NULL CHECK(purpose IN('ACCOUNT_ZERO','TRANSFER_ISSUE','RECOVERY_REVIEW')),
 key_version integer NOT NULL CHECK(key_version>0),
 key_bytes bytea NOT NULL CHECK(pg_catalog.octet_length(key_bytes)>=32),
 not_before timestamptz NOT NULL,not_after timestamptz NOT NULL,
 revoked_at timestamptz,
 PRIMARY KEY(purpose,key_version),CHECK(not_before<not_after)
);
ALTER TABLE hft_secret.ops_a2_scope_key_v1 OWNER TO hft_r1_posting_owner;
REVOKE ALL ON hft_secret.ops_a2_scope_key_v1 FROM
 PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer,hft_r1_audit_verify;

-- These facts are issued by a separately protected ORIGINAL scope authority,
-- NOT by the account/transfer issuer executing this function. No role receives
-- INSERT from this migration. The original signer/key custody remain external.
CREATE TABLE hft.ops_a2_independent_scope_v1(
 purpose text NOT NULL CHECK(purpose IN('ACCOUNT_ZERO','TRANSFER_ISSUE','RECOVERY_REVIEW')),
 order_id uuid NOT NULL,
 legal_entity_id text NOT NULL,
 approval_id text NOT NULL,approval_revision bigint NOT NULL CHECK(approval_revision>0),
 approved_scope jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(approved_scope)='object'),
 scope_sha256 text NOT NULL CHECK(scope_sha256~'^[0-9a-f]{64}$'),
 original_decision_sha256 text NOT NULL CHECK(original_decision_sha256~'^[0-9a-f]{64}$'),
 signer_subject text NOT NULL,signer_session_id text NOT NULL,
 signer_person_id text NOT NULL,
 key_version integer NOT NULL CHECK(key_version>0),
 nonce text NOT NULL CHECK(nonce~'^[0-9a-f]{48}$'),
 issued_epoch bigint NOT NULL CHECK(issued_epoch>0),
 expires_epoch bigint NOT NULL CHECK(expires_epoch>issued_epoch),
 mac_sha256 text NOT NULL CHECK(mac_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(purpose,order_id),
 UNIQUE(purpose,key_version,nonce),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision),
 FOREIGN KEY(legal_entity_id,signer_person_id)
 REFERENCES hft.approval_human(legal_entity_id,person_id),
 FOREIGN KEY(purpose,key_version)
 REFERENCES hft_secret.ops_a2_scope_key_v1(purpose,key_version)
);
CREATE TRIGGER immutable_ops_a2_independent_scope
 BEFORE UPDATE OR DELETE ON hft.ops_a2_independent_scope_v1
 FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation();
REVOKE ALL ON hft.ops_a2_independent_scope_v1
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

CREATE OR REPLACE FUNCTION hft.ops_a2_assert_independent_scope_v1(
 p_purpose text,p_order uuid,p_scope jsonb,p_entity text,
 p_approval text,p_revision bigint,p_decision_sha text,
 p_kind text,p_prohibited_people text[])
RETURNS void LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,pg_temp AS $scope067$
DECLARE
 att hft.ops_a2_independent_scope_v1%ROWTYPE;
 signed_key hft_secret.ops_a2_scope_key_v1%ROWTYPE;
 scoped_hash text; signer_person text;
 expected bytea;claimed bytea;diff integer:=0;i integer;
 now_epoch bigint;
BEGIN
 IF pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR p_purpose NOT IN('ACCOUNT_ZERO','TRANSFER_ISSUE','RECOVERY_REVIEW')
 OR pg_catalog.jsonb_typeof(p_scope)<>'object'
 THEN RAISE EXCEPTION 'OPS_A2_067_SCOPE_PROTECTED_TRANSACTION_REQUIRED'; END IF;
 SELECT * INTO att FROM hft.ops_a2_independent_scope_v1
 WHERE purpose=p_purpose AND order_id=p_order
 AND legal_entity_id=p_entity AND approval_id=p_approval
 AND approval_revision=p_revision FOR SHARE;
 scoped_hash:=pg_catalog.encode(hft_crypto.digest(
  pg_catalog.convert_to(p_scope::text,'UTF8'),'sha256'),'hex');
 IF att.order_id IS NULL OR att.approved_scope IS DISTINCT FROM p_scope
 OR att.scope_sha256 IS DISTINCT FROM scoped_hash
 OR att.original_decision_sha256 IS DISTINCT FROM p_decision_sha
 OR att.mac_sha256 !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'OPS_A2_067_ORIGINAL_SIGNED_SCOPE_NOT_BOUND'; END IF;
 SELECT * INTO signed_key FROM hft_secret.ops_a2_scope_key_v1
 WHERE purpose=att.purpose AND key_version=att.key_version FOR SHARE;
 now_epoch:=pg_catalog.floor(
  pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()))::bigint;
 IF signed_key.key_version IS NULL OR signed_key.revoked_at IS NOT NULL
 OR pg_catalog.clock_timestamp()<signed_key.not_before
 OR pg_catalog.clock_timestamp()>=signed_key.not_after
 OR att.issued_epoch>now_epoch+30 OR att.expires_epoch<=now_epoch
 OR att.expires_epoch-att.issued_epoch>300
 THEN RAISE EXCEPTION 'OPS_A2_067_ORIGINAL_SCOPE_KEY_OR_WINDOW_INVALID'; END IF;
 signer_person:=hft.p2_qualified_human_v1(p_entity,
  att.signer_subject,att.signer_session_id,p_kind,'APPROVER',
  pg_catalog.clock_timestamp());
 IF signer_person IS NULL OR signer_person<>att.signer_person_id
 OR att.signer_person_id=ANY(p_prohibited_people)
 THEN RAISE EXCEPTION 'OPS_A2_067_SIGNER_NOT_INDEPENDENT_CORPORATE_PERSON'; END IF;
 expected:=hft_crypto.hmac(hft.p2_length_prefixed_v1(ARRAY[
  'HFT-OPS-A2-ORIGINAL-SCOPE-HMAC-V1',att.purpose,att.order_id::text,
  att.legal_entity_id,att.approval_id,att.approval_revision::text,
  att.approved_scope::text,att.scope_sha256,att.original_decision_sha256,
  att.signer_subject,att.signer_session_id,att.signer_person_id,
  att.key_version::text,att.nonce,att.issued_epoch::text,
  att.expires_epoch::text]),signed_key.key_bytes,'sha256');
 claimed:=pg_catalog.decode(att.mac_sha256,'hex');
 FOR i IN 0..31 LOOP
  diff:=diff | (pg_catalog.get_byte(expected,i) # pg_catalog.get_byte(claimed,i));
 END LOOP;
 IF diff<>0 THEN
  RAISE EXCEPTION 'OPS_A2_067_ORIGINAL_SIGNED_SCOPE_MAC_INVALID'; END IF;
END $scope067$;
REVOKE ALL ON FUNCTION hft.ops_a2_assert_independent_scope_v1(
 text,uuid,jsonb,text,text,bigint,text,text,text[])
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_governance_issuer;

-- Caller is independently controlled governance, not a posting operator.
-- Zero balance, reserved quantity and revision are CONSTANTS, not parameters.
CREATE OR REPLACE FUNCTION hft.ops_a2_provision_zero_account_v2(p_order uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $provision$
DECLARE
 o hft.ops_a2_account_provision_order%ROWTYPE;
 a hft.protected_stock_approval%ROWTYPE;
 d hft.protected_approval_decision%ROWTYPE;
 pol hft.posting_action_policy%ROWTYPE;
 maker text;checker text;approver text;
 leaf_name text;track_type text;original_exists boolean;scope_payload jsonb;
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
 OR a.approver_subject<>o.approved_subject
 OR a.condition<>o.condition
 OR a.serial_no<>o.serial_no OR a.batch_no<>o.batch_no
 OR (o.account_kind='CUSTODY' AND a.employee_id<>o.custodian_employee_id)
 OR a.approved_scope_sha256 !~ '^[0-9a-f]{64}$'
 OR a.payload_sha256 IS DISTINCT FROM d.payload_sha256
 OR a.policy_revision IS DISTINCT FROM d.policy_revision
 OR d.source_revision<>o.source_revision
 OR pg_catalog.clock_timestamp()<a.valid_from
 OR pg_catalog.clock_timestamp()>=a.valid_until
 OR d.recorded_at<a.valid_from OR d.recorded_at>=a.valid_until
 OR o.approved_at<a.valid_from OR o.approved_at>=a.valid_until
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
 -- The latest policy revision must be selected BEFORE any validity/flag
 -- filtering; an older permissive policy must never regain authority.
 SELECT * INTO pol FROM hft.posting_action_policy AS p
 WHERE p.legal_entity_id=o.legal_entity_id AND p.site_id=o.site_id
 AND p.warehouse_id=o.warehouse_id AND p.action_kind=o.action_kind
 ORDER BY p.policy_revision DESC LIMIT 1 FOR SHARE;
 IF pol.policy_revision IS NULL OR pol.policy_revision<>a.policy_revision
 OR pol.policy_revision<>d.policy_revision
 OR pg_catalog.clock_timestamp()<pol.valid_from
 OR pg_catalog.clock_timestamp()>=pol.valid_until
 OR d.recorded_at<pol.valid_from OR d.recorded_at>=pol.valid_until
 OR NOT pol.require_preparer OR NOT pol.require_checker
 OR NOT pol.require_independent_approver
 THEN RAISE EXCEPTION 'OPS_A2_067_ACCOUNT_LATEST_POLICY_OR_APPROVAL_EXPIRED'; END IF;
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
 -- A legitimate approval must still resolve to a real current typed source.
 original_exists:=CASE o.action_kind
  WHEN 'RECEIVE' THEN EXISTS(
   SELECT 1 FROM hft.grn AS g WHERE g.id::text=o.source_document_id
    AND g.legal_entity_id=o.legal_entity_id
    AND g.warehouse_id=o.warehouse_id
    AND g.authorization_revision=o.source_revision
    AND g.status IN('AUTHORIZED','PARTIALLY_RECEIVED'))
  WHEN 'ISSUE' THEN EXISTS(
   SELECT 1 FROM hft.material_issue AS i
   WHERE i.id::text=o.source_document_id
    AND i.legal_entity_id=o.legal_entity_id
    AND i.warehouse_id=o.warehouse_id
    AND i.authorization_revision=o.source_revision
    AND i.status IN('AUTHORIZED','ISSUED'))
  WHEN 'RETURN' THEN EXISTS(
   SELECT 1 FROM hft.material_return AS mr
   WHERE mr.id::text=o.source_document_id
    AND mr.legal_entity_id=o.legal_entity_id
    AND mr.warehouse_id=o.warehouse_id
    AND mr.authorization_revision=o.source_revision
    AND mr.status IN('AUTHORIZED','RETURNED'))
  WHEN 'TRANSFER' THEN EXISTS(
   SELECT 1 FROM hft.ops_a2_transfer_document AS x
   WHERE x.id::text=o.source_document_id
    AND x.legal_entity_id=o.legal_entity_id
    AND x.site_id=o.site_id AND x.warehouse_id=o.warehouse_id
    AND x.revision=o.source_revision
    AND x.status IN('AUTHORIZED','PARTIALLY_MOVED'))
  ELSE false END;
 IF NOT original_exists THEN
  RAISE EXCEPTION 'OPS_A2_067_ACCOUNT_TYPED_SOURCE_REVISION_NOT_AUTHORIZED'; END IF;
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
 SELECT i.control_type INTO track_type FROM hft.item AS i
 WHERE i.legal_entity_id=o.legal_entity_id AND i.item_code=o.item_code
 AND i.active FOR SHARE;
 IF track_type IS NULL OR (track_type='NONE' AND (o.serial_no<>'' OR o.batch_no<>''))
 OR (track_type='SERIAL' AND (o.serial_no='' OR o.batch_no<>''))
 OR (track_type='BATCH' AND (o.batch_no='' OR o.serial_no<>''))
 THEN RAISE EXCEPTION 'OPS_A2_067_ACCOUNT_TRACEABILITY_NOT_AUTHORIZED'; END IF;
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
 -- Order fields cannot confer authority. Compare the entire account
 -- identity, source, policy and original approval digest to a separate
 -- HMAC-authenticated original record from independent signing custody.
 scope_payload:=pg_catalog.jsonb_build_object(
  'contract','HFT-OPS-A2-ACCOUNT-ZERO-SCOPE-067-V1',
  'orderId',o.order_id::text,'accountId',o.account_id::text,
  'legalEntityId',o.legal_entity_id,'siteId',o.site_id,
  'warehouseId',o.warehouse_id,'itemCode',o.item_code,
  'productVersion',o.product_version_code,'leaf',o.leaf_location_id,
  'accountKind',o.account_kind,'condition',o.condition,
  'serialNo',o.serial_no,'batchNo',o.batch_no,'controlType',track_type,
  'custodianEmployeeId',o.custodian_employee_id,'actionKind',o.action_kind,
  'sourceDocumentId',o.source_document_id,'sourceRevision',o.source_revision,
  'approvalId',o.approval_id,'approvalRevision',o.approval_revision,
  'approvedPayloadSha256',a.payload_sha256,
  'approvedScopeSha256',a.approved_scope_sha256,
  'decisionSha256',d.decision_evidence_sha256,
  'policyRevision',pol.policy_revision,'policyGeneration',o.policy_generation,
  'makerPerson',maker,'checkerPerson',checker,'approverPerson',approver,
  'approvedAt',pg_catalog.extract(epoch FROM o.approved_at)::bigint);
 PERFORM hft.ops_a2_assert_independent_scope_v1(
  'ACCOUNT_ZERO',o.order_id,scope_payload,o.legal_entity_id,
  o.approval_id,o.approval_revision,d.decision_evidence_sha256,
  o.action_kind,ARRAY[maker,checker,approver]);
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
 approval_id text NOT NULL,approval_revision bigint NOT NULL
 CHECK(approval_revision>0),
 source_action_key text NOT NULL,
 approved_scope_sha256 text NOT NULL
 CHECK(approved_scope_sha256~'^[0-9a-f]{64} text NOT NULL,prepared_session_id text NOT NULL,
 checked_subject text NOT NULL,checked_session_id text NOT NULL,
 approved_subject text NOT NULL,approved_session_id text NOT NULL,
 approved_at timestamptz NOT NULL,
 decision_evidence_sha256 text NOT NULL
 CHECK(decision_evidence_sha256~'^[0-9a-f]{64}$'),
 policy_generation bigint NOT NULL CHECK(policy_generation>0),
 status text NOT NULL CHECK(status='AUTHORIZED'),
 FOREIGN KEY(legal_entity_id,approval_id,approval_revision)
 REFERENCES hft.protected_stock_approval(legal_entity_id,approval_id,approval_revision),
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
),
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
 a hft.protected_stock_approval%ROWTYPE;
 d hft.protected_approval_decision%ROWTYPE;
 latest_policy hft.posting_action_policy%ROWTYPE;
 leaf_name text;scope_payload jsonb;
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
 -- The original protected approval/decision must independently authorize
 -- this exact document and current source revision. A matching document ID
 -- alone is not an authorization to create an arbitrary transfer.
 SELECT * INTO a FROM hft.protected_stock_approval AS approved
 WHERE approved.legal_entity_id=o.legal_entity_id
 AND approved.document_id=o.document_id::text
 AND approved.approval_id=o.approval_id
 AND approved.approval_revision=o.approval_revision
 AND approved.kind='TRANSFER'
 AND approved.document_revision=o.revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPS_A2_067_TRANSFER_ORIGINAL_APPROVAL_MISSING'; END IF;
 SELECT * INTO d FROM hft.protected_approval_decision AS decision
 WHERE decision.legal_entity_id=a.legal_entity_id
 AND decision.approval_id=a.approval_id
 AND decision.approval_revision=a.approval_revision FOR SHARE;
 IF d.approval_id IS NULL OR NOT a.approved
 OR a.site_id<>o.site_id OR a.warehouse_id<>o.warehouse_id
 OR a.item_code<>o.item_code OR a.location_id<>o.source_leaf
 OR a.source_action_key<>o.source_action_key
 OR a.approved_scope_sha256<>o.approved_scope_sha256
 OR a.condition<>'GOOD' OR a.batch_no<>o.batch_no
 OR a.serial_no<>o.serial_no OR a.quantity_micro<>o.authorized_micro
 OR a.actor_subject IS NULL
 OR a.approver_subject<>o.approved_subject
 OR a.prepared_by<>o.prepared_subject OR a.checked_by<>o.checked_subject
 OR a.document_revision<>o.revision OR a.policy_generation<>o.policy_generation
 OR a.approved_scope_sha256 !~ '^[0-9a-f]{64}$'
 OR d.source_revision<>o.revision
 OR d.payload_sha256 IS DISTINCT FROM a.payload_sha256
 OR d.decision_evidence_sha256<>o.decision_evidence_sha256
 OR d.prepared_subject IS DISTINCT FROM o.prepared_subject
 OR d.checked_subject IS DISTINCT FROM o.checked_subject
 OR d.approver_subject<>o.approved_subject
 OR d.prepared_session_id IS DISTINCT FROM o.prepared_session_id
 OR d.checked_session_id IS DISTINCT FROM o.checked_session_id
 OR d.approver_session_id<>o.approved_session_id
 OR pg_catalog.clock_timestamp()<a.valid_from
 OR pg_catalog.clock_timestamp()>=a.valid_until
 OR d.recorded_at<a.valid_from OR d.recorded_at>=a.valid_until
 OR o.approved_at<a.valid_from OR o.approved_at>=a.valid_until
 OR EXISTS(SELECT 1 FROM hft.protected_approval_revocation AS revoked
  WHERE revoked.legal_entity_id=a.legal_entity_id
  AND revoked.approval_id=a.approval_id
  AND revoked.approval_revision=a.approval_revision)
 OR EXISTS(SELECT 1 FROM hft.protected_approval_supersession AS superseded
  WHERE superseded.legal_entity_id=a.legal_entity_id
  AND superseded.approval_id=a.approval_id
  AND superseded.approval_revision=a.approval_revision)
 THEN RAISE EXCEPTION 'OPS_A2_067_TRANSFER_ORIGINAL_DECISION_SCOPE_FORGED'; END IF;
 -- Crucial policy freshness: SELECT the ACTUAL latest revision first,
 -- then reject it if expired/weakened. Never prefilter valid policy rows.
 SELECT * INTO latest_policy FROM hft.posting_action_policy AS pol
 WHERE pol.legal_entity_id=o.legal_entity_id AND pol.site_id=o.site_id
 AND pol.warehouse_id=o.warehouse_id AND pol.action_kind='TRANSFER'
 ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;
 IF latest_policy.policy_revision IS NULL
 OR latest_policy.policy_revision<>a.policy_revision
 OR latest_policy.policy_revision<>d.policy_revision
 OR pg_catalog.clock_timestamp()<latest_policy.valid_from
 OR pg_catalog.clock_timestamp()>=latest_policy.valid_until
 OR d.recorded_at<latest_policy.valid_from
 OR d.recorded_at>=latest_policy.valid_until
 OR NOT latest_policy.require_preparer
 OR NOT latest_policy.require_checker
 OR NOT latest_policy.require_independent_approver
 THEN RAISE EXCEPTION 'OPS_A2_067_TRANSFER_LATEST_POLICY_REJECTED'; END IF;
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
 -- The destination leaf, version, exact quantity and people are missing
 -- from portions of the legacy approval: require an independent signed
 -- original scope MAC with those exact dimensions before document INSERT.
 scope_payload:=pg_catalog.jsonb_build_object(
  'contract','HFT-OPS-A2-TRANSFER-ISSUE-SCOPE-067-V1',
  'orderId',o.order_id::text,'documentId',o.document_id::text,
  'legalEntityId',o.legal_entity_id,'siteId',o.site_id,
  'warehouseId',o.warehouse_id,'itemCode',o.item_code,
  'productVersion',o.product_version_code,'sourceLeaf',o.source_leaf,
  'destinationLeaf',o.destination_leaf,'batchNo',o.batch_no,
  'serialNo',o.serial_no,'authorizedMicro',o.authorized_micro,
  'sourceRevision',o.revision,'policyGeneration',o.policy_generation,
  'policyRevision',latest_policy.policy_revision,
  'approvalId',a.approval_id,'approvalRevision',a.approval_revision,
  'originalOrderApprovalId',o.approval_id,
  'originalOrderApprovalRevision',o.approval_revision,
  'originalOrderApprovedScopeSha256',o.approved_scope_sha256,
  'approvedPayloadSha256',a.payload_sha256,
  'approvedScopeSha256',a.approved_scope_sha256,
  'decisionSha256',d.decision_evidence_sha256,
  'sourceActionKey',a.source_action_key,'fragmentId',a.fragment_id,
  'makerPerson',maker,'checkerPerson',checker,'approverPerson',approver,
  'approvedAt',pg_catalog.extract(epoch FROM o.approved_at)::bigint);
 PERFORM hft.ops_a2_assert_independent_scope_v1(
  'TRANSFER_ISSUE',o.order_id,scope_payload,o.legal_entity_id,
  a.approval_id,a.approval_revision,d.decision_evidence_sha256,
  'TRANSFER',ARRAY[maker,checker,approver]);
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

-- Independently derive one unambiguous typed GRN receipt-line identity from
-- the ORIGINAL signed P0 fields, not an arbitrary client-provided alias.
-- Multiple legitimate GRN lines work when each has its own receiptKey. A
-- repeated receiptKey with identical signed scope is ambiguous and DENIED.
CREATE OR REPLACE FUNCTION hft.ops_a2_resolve_signed_grn_line_v3(
 p0 jsonb,p2 jsonb)
RETURNS text LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,pg_temp AS $grn_bridge$
DECLARE typed_line text;matches bigint;
BEGIN
 IF p0->>'kind'<>'IN'
 OR p0->>'grnId' !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
 OR p2->>'sourceDocumentId'<>pg_catalog.lower(p0->>'grnId')
 OR p0->>'qcState'<>'ACCEPTED'
 OR p0->>'legalEntityId' IS DISTINCT FROM p2->>'legalEntityId'
 OR p0->>'siteId' IS DISTINCT FROM p2->>'siteId'
 OR p0->>'warehouseId' IS DISTINCT FROM p2->>'warehouseId'
 OR p0->>'itemCode' IS DISTINCT FROM p2->>'itemCode'
 OR p0->>'productVersion' IS DISTINCT FROM p2->>'productVersion'
 OR p0->>'leafLocationId' IS DISTINCT FROM p2->>'destinationLeafId'
 OR p0->>'controlType' IS DISTINCT FROM p2->>'controlType'
 OR p0->>'serialNo' IS DISTINCT FROM p2->>'serialNo'
 OR p0->>'batchNo' IS DISTINCT FROM p2->>'batchNo'
 OR p0->>'qcEvidenceId' IS DISTINCT FROM p2->>'inspectionEvidenceId'
 OR (p0->>'quantity')::numeric*1000000<>(p2->>'quantityMicro')::bigint
 THEN RAISE EXCEPTION 'OPS_A2_GRN_SIGNED_RAW_CANONICAL_SOURCE_MISMATCH'; END IF;
 SELECT count(*),max(r.receipt_key||':'||r.line_no::text)
 INTO matches,typed_line
 FROM hft.grn_partial_receipt AS r
 JOIN hft.grn AS g ON g.id=r.grn_id
 JOIN hft.grn_line AS gl ON gl.grn_id=r.grn_id AND gl.line_no=r.line_no
 JOIN hft.supplier_invoice AS inv ON inv.id=g.invoice_id
 WHERE g.id::text=pg_catalog.lower(p0->>'grnId')
 AND g.legal_entity_id=p2->>'legalEntityId'
 AND g.warehouse_id=p2->>'warehouseId'
 AND g.supplier_id=p0->>'supplierId'
 AND g.invoice_key=p0->>'invoiceNumber'
 AND g.status IN('AUTHORIZED','PARTIALLY_RECEIVED')
 AND inv.legal_entity_id=g.legal_entity_id AND inv.supplier_id=g.supplier_id
 AND inv.invoice_key=g.invoice_key AND inv.status='VERIFIED'
 AND r.legal_entity_id=g.legal_entity_id AND r.warehouse_id=g.warehouse_id
 AND r.receipt_key=p0->>'receiptKey'
 AND r.location_id=p2->>'destinationLeafId'
 AND r.ops_a2_item_code=p2->>'itemCode'
 AND r.ops_a2_product_version_code=p2->>'productVersion'
 AND r.batch_no=p2->>'batchNo' AND r.serial_no=p2->>'serialNo'
 AND r.qc_state='ACCEPTED' AND r.evidence_reference=p0->>'qcEvidenceId'
 AND r.accepted_micro>=(p2->>'quantityMicro')::bigint
 AND gl.legal_entity_id=g.legal_entity_id
 AND gl.item_code=p2->>'itemCode';
 IF matches<>1 OR typed_line IS DISTINCT FROM p2->>'sourceActionKey'
 THEN RAISE EXCEPTION 'OPS_A2_GRN_RAW_RECEIPT_LINE_AMBIGUOUS_OR_FORGED'; END IF;
 RETURN typed_line;
END $grn_bridge$;
REVOKE ALL ON FUNCTION hft.ops_a2_resolve_signed_grn_line_v3(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime;

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
  IF hft.ops_a2_resolve_signed_grn_line_v3(p0,p2)
    IS DISTINCT FROM p2->>'sourceActionKey'
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
COMMIT;
