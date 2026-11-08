-- HFT OPS-A2 — SINGLE VERSIONED P2 WRITER AND ATOMIC SEAL CANDIDATE
-- Source review only. SQL execution, migrations, role grants, Neon and
-- production remain UNAUTHORIZED (Gate R / Gate A HOLD).
-- Requires the OPS-A2 foundation and proof/authorization source in the
-- same independently approved transaction; never install files separately.
BEGIN;
DO $STOP_OPS_A2_WRITER$
BEGIN RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'; END
$STOP_OPS_A2_WRITER$;

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
  AND pg_catalog.coalesce(source_account_id::text,'')=
       pg_catalog.coalesce(NEW.ops_a2_source_account_id::text,'')
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
 SELECT count(*),pg_catalog.coalesce(sum(qty_delta_micro),0)
 INTO nlegs,delta FROM hft.stock_entry WHERE command_id=p_id;
 -- A zero net delta alone is not conservation: forged equal-and-opposite
 -- legs of the wrong magnitude must be rejected at deferred COMMIT.
 IF nlegs<>2 OR delta<>0 OR
   (SELECT count(*) FROM hft.stock_entry AS debit
    WHERE debit.command_id=p_id AND debit.qty_delta_micro=-c.quantity_micro
    AND (debit.account_id IS NOT DISTINCT FROM c.ops_a2_source_account_id)
    AND (debit.account_before_version IS NOT DISTINCT FROM
      (envelope.exact_payload->>'sourceAccountBeforeVersion')::bigint
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
  pg_catalog.coalesce(pg_catalog.string_agg(
   leg.id::text||'/'||leg.bucket||'/'||
   pg_catalog.coalesce(leg.account_id::text,'-')||'/'||
   leg.qty_delta_micro::text||'/'||
   pg_catalog.coalesce(leg.employee_id,'')||'/'||
   pg_catalog.coalesce(leg.batch_no,'')||'/'||
   pg_catalog.coalesce(leg.serial_no,''),E'\n' ORDER BY leg.id),''),
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
     'controlType',p->>'controlType','serialNo',pg_catalog.coalesce(entry.serial_no,''),
     'batchNo',pg_catalog.coalesce(entry.batch_no,''),
     'leafLocationId',entry.location_key,'kind',entry.account_kind,
     'condition',entry.condition,'custodianEmployeeId',entry.custodian_employee_id);
   acc_key:=pg_catalog.encode(hft_crypto.digest(hft.p2_length_prefixed_v1(
     ARRAY['HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1',
       entry.legal_entity_id,entry.site_id,entry.warehouse_id,
       entry.item_code,entry.product_version_code,p->>'controlType',
       pg_catalog.coalesce(entry.serial_no,''),
       pg_catalog.coalesce(entry.batch_no,''),
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
    pg_catalog.coalesce(entry.account_id::text,''),acc_key,
    pg_catalog.coalesce(entry.account_before_version::text,''),
    pg_catalog.coalesce(entry.account_after_version::text,''),debit];
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
  pg_catalog.coalesce(pg_catalog.string_agg(
   leg.id::text||'/'||leg.bucket||'/'||
   pg_catalog.coalesce(leg.account_id::text,'-')||'/'||
   leg.qty_delta_micro::text||'/'||
   pg_catalog.coalesce(leg.employee_id,'')||'/'||
   pg_catalog.coalesce(leg.batch_no,'')||'/'||
   pg_catalog.coalesce(leg.serial_no,''),E'\n' ORDER BY leg.id),''),
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
COMMIT;
