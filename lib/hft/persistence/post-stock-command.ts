/**
 * HFT R1 - NONPRODUCTION PostgreSQL posting adapter candidate.
 * Not reachable from an HTTP route. Its caller MUST already have authenticated the
 * operator; this internal contract cannot establish the real session identity.
 * The public runtime has no production posting path or enabled posting gate.
 */
import { createHash } from 'node:crypto';
import { applyCommand, emptyEngineState, type StockCommand, type PostResult,
  type TrustedApprovalGate, type TrustedMasterSnapshot } from '../domain/ledger.ts';
import { parseQuantity } from '../domain/quantity.ts';
import type { Item, Employee, Warehouse } from '../domain/masters.ts';
import { authorize, type VerifiedPrincipal } from '../security/authorization.ts';
import { assertVerifiedRequestOperator, type VerifiedRequestOperator } from '../security/verified-request.ts';
import { withIsolatedPgTransaction, type PgPool, type PgQueryClient,
  type IsolatedPgEnvironment } from './isolated-pg-transaction.ts';

export type NonproductionOperator = VerifiedRequestOperator;
type Row = Record<string, unknown>;
function str(v: unknown): string { if (typeof v !== 'string') throw new Error('DATABASE_STRING_INVALID'); return v; }
function bool(v: unknown): boolean { if (typeof v !== 'boolean') throw new Error('DATABASE_BOOLEAN_INVALID'); return v; }
function bigint(v: unknown): bigint {
  if (typeof v !== 'string' && typeof v !== 'bigint' && !(typeof v === 'number' && Number.isSafeInteger(v))) throw new Error('DATABASE_BIGINT_INVALID');
  return BigInt(v);
}
function int(v: unknown): number {
  const x = bigint(v);
  if (x < 0n || x > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('DATABASE_VERSION_INVALID');
  return Number(x);
}
async function one<T extends Row>(q: PgQueryClient, sql: string, parameters: readonly (string|number|bigint|boolean|null)[]): Promise<T> {
  const result=await q.query<T>(sql,parameters);
  if (result.rows.length !== 1) throw new Error('DATABASE_EXPECTED_ONE_ROW');
  return result.rows[0];
}
async function optional<T extends Row>(q: PgQueryClient, sql: string, parameters: readonly (string|number|bigint|boolean|null)[]): Promise<T|null> {
  const result=await q.query<T>(sql,parameters);
  if (result.rows.length > 1) throw new Error('DATABASE_DUPLICATE_RESULT');
  return result.rows[0] ?? null;
}
const sha256=(text:string) => createHash('sha256').update(text).digest('hex');
function fingerprint(c: StockCommand, actor: string):string {
  return sha256(JSON.stringify([actor,c.commandId,c.idempotencyKey,c.kind,c.legalEntityId,c.siteId,
    c.warehouseId,c.itemCode,c.quantity,c.sourceDocumentId,c.sourceActionKey,c.expectedBalanceVersion,
    c.employeeId??'',c.originalIssueId??'',c.serialNo??'',c.batchNo??'',c.condition??'']));
}
function canonicalKey(c: StockCommand): string { return JSON.stringify([c.legalEntityId,c.siteId,c.warehouseId,c.itemCode,c.batchNo||'',c.serialNo||'']); }
function requireIdentifier(v: string): void {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(v)) throw new Error('POSTING_IDENTIFIER_INVALID');
}
function accountParams(c: StockCommand, condition: string): readonly string[] {
  return [c.legalEntityId,c.warehouseId,c.itemCode,c.batchNo??'',c.serialNo??'',condition];
}
type Account = { id: string; qty_micro: string; reserved_micro: string; version: string };
async function getAccount(q: PgQueryClient, c: StockCommand, condition: 'GOOD'|'DAMAGED'|'QUARANTINE'): Promise<Account> {
  const keys=accountParams(c,condition);
  await q.query(`INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,batch_key,serial_key,condition)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,keys);
  return one<Account>(q,`SELECT id,qty_micro::text,reserved_micro::text,version::text
    FROM hft.stock_account WHERE legal_entity_id=$1 AND warehouse_id=$2 AND item_code=$3
    AND batch_key=$4 AND serial_key=$5 AND condition=$6 AND location_key='' FOR UPDATE`,keys);
}
async function applyAccountUpdate(q: PgQueryClient, a: Account, next: bigint): Promise<void> {
  if (next < 0n || next < bigint(a.reserved_micro)) throw new Error('INSUFFICIENT_AVAILABLE_STOCK');
  const updated=await q.query(`UPDATE hft.stock_account SET qty_micro=$2::bigint,version=version+1
     WHERE id=$1::uuid AND version=$3::bigint AND reserved_micro<=$2::bigint RETURNING id`,
    [a.id,next.toString(),a.version]);
  if (updated.rowCount!==1) throw new Error('STALE_STOCK_ACCOUNT');
}
async function loadDocument(q: PgQueryClient,c:StockCommand, qty:bigint):Promise<null|{grnId:string;lineNo:number;authorizedBy:string}> {
  if (c.kind==='RECEIVE') {
    const grn=await optional<Row>(q,`SELECT g.id::text,g.status,g.authorized_by,s.active AS supplier_active
      FROM hft.grn g JOIN hft.supplier s ON s.legal_entity_id=g.legal_entity_id AND s.supplier_id=g.supplier_id
      WHERE g.id::text=$1 AND g.legal_entity_id=$2 AND g.warehouse_id=$3 FOR UPDATE OF g`,
      [c.sourceDocumentId,c.legalEntityId,c.warehouseId]);
    if(!grn || !['AUTHORIZED','PARTIALLY_RECEIVED'].includes(str(grn.status)) || !bool(grn.supplier_active) || !grn.authorized_by)
      throw new Error('GRN_NOT_AUTHORIZED_OR_SUPPLIER_INACTIVE');
    const fragment=await optional<Row>(q,`SELECT r.line_no,r.accepted_micro::text,l.item_code
      FROM hft.grn_partial_receipt r JOIN hft.grn_line l ON l.grn_id=r.grn_id AND l.line_no=r.line_no
      WHERE r.grn_id=$1::uuid AND (r.receipt_key||':'||r.line_no::text)=$2 AND r.qc_state='ACCEPTED'
        AND length(trim(r.evidence_reference))>0 FOR UPDATE OF r,l`,[c.sourceDocumentId,c.sourceActionKey]);
    if(!fragment || fragment.item_code!==c.itemCode || bigint(fragment.accepted_micro)!==qty)
      throw new Error('GRN_RECEIPT_NOT_QC_ACCEPTED_OR_QUANTITY_MISMATCH');
    return {grnId:c.sourceDocumentId,lineNo:int(fragment.line_no),authorizedBy:str(grn.authorized_by)};
  }
  if(c.kind==='ISSUE') {
    const doc=await optional<Row>(q,`SELECT status,employee_id,approved_by,purpose FROM hft.material_issue
      WHERE id::text=$1 AND legal_entity_id=$2 AND warehouse_id=$3 FOR UPDATE`,
      [c.sourceDocumentId,c.legalEntityId,c.warehouseId]);
    if(!doc || doc.status!=='AUTHORIZED' || doc.employee_id!==c.employeeId || !doc.approved_by || !str(doc.purpose).trim())
      throw new Error('MATERIAL_ISSUE_NOT_AUTHORIZED');
    return null;
  }
  if(c.kind==='RETURN') {
    const doc=await optional<Row>(q,`SELECT mr.status,mr.condition,mr.evidence_reference,mi.employee_id,mi.id::text AS linked_issue_document
      FROM hft.material_return mr JOIN hft.material_issue mi ON mi.id=mr.issue_id
      WHERE mr.id::text=$1 AND mi.legal_entity_id=$2 AND mi.warehouse_id=$3 FOR UPDATE OF mr`,
      [c.sourceDocumentId,c.legalEntityId,c.warehouseId]);
    if(!doc || doc.status!=='AUTHORIZED' || doc.condition!==c.condition || doc.employee_id!==c.employeeId || !doc.evidence_reference)
      throw new Error('MATERIAL_RETURN_NOT_INSPECTED_AND_AUTHORIZED');
    if(!c.originalIssueId) throw new Error('ORIGINAL_ISSUE_AND_EMPLOYEE_REQUIRED');
    const issue=await optional<Row>(q,`SELECT source_document_id FROM hft.stock_command WHERE legal_entity_id=$1 AND command_id=$2`,
      [c.legalEntityId,c.originalIssueId]);
    if(!issue || issue.source_document_id !== doc.linked_issue_document) throw new Error('RETURN_ORIGINAL_DOCUMENT_MISMATCH');
    return null;
  }
  throw new Error('COMMAND_KIND_INVALID');
}

export async function postIsolatedStockCommand(pool: PgPool, env: IsolatedPgEnvironment,
  command: StockCommand, operator: NonproductionOperator): Promise<PostResult> {
  const verifiedSubject = assertVerifiedRequestOperator(operator,command);
  requireIdentifier(verifiedSubject); requireIdentifier(command.commandId);
  requireIdentifier(command.idempotencyKey); requireIdentifier(command.sourceDocumentId);
  requireIdentifier(command.sourceActionKey);
  const payloadHash=fingerprint(command,operator.subject);
  return withIsolatedPgTransaction(pool,env,async q=>{
    const c=command;
    await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`HFT:GATE:${c.legalEntityId}:${c.siteId}:${c.warehouseId}`]);
    const grant=await optional<Row>(q,`SELECT active,may_post FROM hft.actor_warehouse_grant
      WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3 AND actor_subject=$4 FOR SHARE`,
      [c.legalEntityId,c.siteId,c.warehouseId,operator.subject]);
    if(!grant || !bool(grant.active) || !bool(grant.may_post)) throw new Error('PERSISTED_PERMISSION_DENIED');
    const principal:VerifiedPrincipal={subject:operator.subject,authenticated:true,active:true,
      scope:{legalEntityId:c.legalEntityId,siteId:c.siteId,warehouseIds:[c.warehouseId]},permissions:['stock:post']};
    authorize(principal,'stock:post',c);
    await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`HFT:STOCK:${c.legalEntityId}:${c.warehouseId}:${c.itemCode}:${c.batchNo??''}:${c.serialNo??''}`]);
    const found=await optional<Row>(q,`SELECT sc.payload_sha256,o.result FROM hft.stock_command sc
       JOIN hft.stock_command_outcome o ON o.command_id=sc.id
       WHERE sc.legal_entity_id=$1 AND sc.idempotency_key=$2 FOR SHARE OF sc,o`,
       [c.legalEntityId,c.idempotencyKey]);
    if(found) {
      if(found.payload_sha256!==payloadHash) throw new Error('IDEMPOTENCY_CONFLICT');
      return {...(found.result as PostResult),replay:true};
    }
    const source=await optional<Row>(q,`SELECT id FROM hft.stock_command
      WHERE legal_entity_id=$1 AND source_document_id=$2 AND source_action_key=$3 FOR SHARE`,
      [c.legalEntityId,c.sourceDocumentId,c.sourceActionKey]);
    if(source) throw new Error('SOURCE_ACTION_ALREADY_POSTED');
    const approval=await optional<Row>(q,`SELECT approval_id,revision::text,approved,approved_by,
      inspected_condition,inspection_evidence_id FROM hft.stock_approval
      WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3 AND source_document_id=$4 FOR SHARE`,
      [c.legalEntityId,c.siteId,c.warehouseId,c.sourceDocumentId]);
    if(!approval || !bool(approval.approved)) throw new Error('APPROVAL_REQUIRED');
    const holds=await q.query<Row>(`SELECT hold_id FROM hft.stock_hold
      WHERE active=true AND legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3
      AND (item_code IS NULL OR item_code=$4) AND (employee_id IS NULL OR employee_id=$5)
      AND (source_document_id IS NULL OR source_document_id=$6) FOR SHARE`,
      [c.legalEntityId,c.siteId,c.warehouseId,c.itemCode,c.employeeId??null,c.sourceDocumentId]);
    const gate:TrustedApprovalGate={verifiedByServer:true,approved:true,approvalId:str(approval.approval_id),
      documentId:c.sourceDocumentId,revision:int(approval.revision),approvedBy:str(approval.approved_by),
      blockingHolds:holds.rows.map(x=>str(x.hold_id)),legalEntityId:c.legalEntityId,siteId:c.siteId,
      warehouseId:c.warehouseId,
      ...(approval.inspected_condition?{inspectedCondition:str(approval.inspected_condition) as 'GOOD'|'DAMAGED'|'QUARANTINE'}:{}),
      ...(approval.inspection_evidence_id?{inspectionEvidenceId:str(approval.inspection_evidence_id)}:{})};
    const item=await optional<Row>(q,`SELECT control_type,active,version::text,uom FROM hft.item
       WHERE legal_entity_id=$1 AND item_code=$2 FOR SHARE`,[c.legalEntityId,c.itemCode]);
    const warehouse=await optional<Row>(q,`SELECT active,version::text FROM hft.warehouse
      WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3 FOR SHARE`,
      [c.legalEntityId,c.siteId,c.warehouseId]);
    if(!item || !warehouse) throw new Error('MASTER_NOT_FOUND');
    const masters:TrustedMasterSnapshot={
      item:{legalEntityId:c.legalEntityId,itemCode:c.itemCode,control:str(item.control_type) as Item['control'],
        uom:str(item.uom),active:bool(item.active),version:int(item.version)},
      warehouse:{legalEntityId:c.legalEntityId,warehouseId:c.warehouseId,siteId:c.siteId,
        active:bool(warehouse.active),version:int(warehouse.version)} as Warehouse,
    };
    if(c.employeeId && c.kind==='ISSUE') {
      const employee=await optional<Row>(q,`SELECT active,version::text,full_name,department,designation FROM hft.employee
        WHERE legal_entity_id=$1 AND site_id=$2 AND employee_id=$3 FOR SHARE`,
        [c.legalEntityId,c.siteId,c.employeeId]);
      if(!employee) throw new Error('EMPLOYEE_NOT_FOUND');
      (masters as {employee:Employee}).employee={legalEntityId:c.legalEntityId,siteId:c.siteId,employeeId:c.employeeId,
        active:bool(employee.active),version:int(employee.version),fullName:str(employee.full_name),
        department:str(employee.department),designation:str(employee.designation)};
    }
    const qty=parseQuantity(c.quantity);
    if(item.control_type==='NONE' && c.batchNo) throw new Error('UNEXPECTED_BATCH');
    const document=await loadDocument(q,c,qty);
    if(document && document.authorizedBy!==gate.approvedBy) throw new Error('GRN_APPROVER_MISMATCH');
    if(c.kind==='ISSUE') {
      const issueApprover=await optional<Row>(q,`SELECT approved_by FROM hft.material_issue WHERE id::text=$1 FOR SHARE`,[c.sourceDocumentId]);
      if(!issueApprover || issueApprover.approved_by!==gate.approvedBy) throw new Error('ISSUE_APPROVER_MISMATCH');
    }
    const good=await getAccount(q,c,'GOOD');
    const engine=emptyEngineState();
    const key=canonicalKey(c);
    engine.balances.set(key,bigint(good.qty_micro)); engine.versions.set(key,int(good.version));
    if(c.serialNo) {
      const serial=await optional<Row>(q,`SELECT state,custodian_employee_id FROM hft.serial_registry
        WHERE legal_entity_id=$1 AND item_code=$2 AND serial_no=$3 FOR UPDATE`,
        [c.legalEntityId,c.itemCode,c.serialNo]);
      if(serial) engine.serialLocations.set(JSON.stringify([c.legalEntityId,c.itemCode,c.serialNo]),
        serial.state==='CUSTODY'?`CUSTODY:${str(serial.custodian_employee_id)}`:str(serial.state));
    }
    let custodyRow:Row|null=null;
    if(c.kind==='RETURN' && c.originalIssueId) {
      custodyRow=await optional<Row>(q,`SELECT ec.issued_micro::text,ec.returned_micro::text,ec.employee_id,
        ec.item_code,ec.warehouse_id,ec.legal_entity_id,ec.serial_no,ec.batch_no,
        sc.source_document_id FROM hft.employee_custody ec
        JOIN hft.stock_command sc ON sc.id=ec.issue_command_id
        WHERE sc.legal_entity_id=$1 AND sc.command_id=$2 FOR UPDATE OF ec`,
        [c.legalEntityId,c.originalIssueId]);
      if(!custodyRow) throw new Error('ISSUE_REFERENCE_MISMATCH');
      engine.issueRecords.set(c.originalIssueId,{employeeId:str(custodyRow.employee_id),itemCode:str(custodyRow.item_code),
        warehouseId:str(custodyRow.warehouse_id),legalEntityId:str(custodyRow.legal_entity_id),siteId:c.siteId,
        original:bigint(custodyRow.issued_micro),remaining:bigint(custodyRow.issued_micro)-bigint(custodyRow.returned_micro),
        ...(custodyRow.serial_no?{serialNo:str(custodyRow.serial_no)}:{}),
        ...(custodyRow.batch_no?{batchNo:str(custodyRow.batch_no)}:{})});
    }
    const simulated=applyCommand(engine,c,principal,gate,masters);
    const nextQty=simulated.state.balances.get(key);
    if(nextQty===undefined) throw new Error('POSTING_BALANCE_MISSING');
    await applyAccountUpdate(q,good,nextQty);
    let quarantine:Account|null=null;
    if(c.kind==='RETURN' && c.condition && c.condition!=='GOOD') {
      quarantine=await getAccount(q,c,c.condition);
      await applyAccountUpdate(q,quarantine,bigint(quarantine.qty_micro)+qty);
    }
    if(c.serialNo) {
      if(c.kind==='RECEIVE') {
        const result=await q.query(`INSERT INTO hft.serial_registry(legal_entity_id,item_code,serial_no,warehouse_id,state)
          VALUES($1,$2,$3,$4,'AVAILABLE') ON CONFLICT DO NOTHING RETURNING serial_no`,
          [c.legalEntityId,c.itemCode,c.serialNo,c.warehouseId]);
        if(result.rowCount!==1) throw new Error('SERIAL_ALREADY_REGISTERED');
      } else {
        const toState=c.kind==='ISSUE'?'CUSTODY':c.condition==='GOOD'?'AVAILABLE':'QUARANTINE';
        const result=await q.query(`UPDATE hft.serial_registry SET state=$4,custodian_employee_id=$5,version=version+1
          WHERE legal_entity_id=$1 AND item_code=$2 AND serial_no=$3 RETURNING serial_no`,
          [c.legalEntityId,c.itemCode,c.serialNo,toState,c.kind==='ISSUE'?c.employeeId??null:null]);
        if(result.rowCount!==1) throw new Error('SERIAL_STATE_UPDATE_MISSING');
      }
    }
    // UUID-backed command and all dependent entries live in the same transaction.
    const posted=await one<{id:string}>(q,`INSERT INTO hft.stock_command(legal_entity_id,command_id,
      idempotency_key,payload_sha256,kind,source_document_id,source_action_key,actor_subject,approval_id,approval_revision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text AS id`,
      [c.legalEntityId,c.commandId,c.idempotencyKey,payloadHash,c.kind,c.sourceDocumentId,c.sourceActionKey,
       operator.subject,gate.approvalId,gate.revision]);
    if(c.kind==='ISSUE') {
      await q.query(`INSERT INTO hft.employee_custody(legal_entity_id,employee_id,issue_command_id,
        item_code,warehouse_id,issued_micro,serial_no,batch_no) VALUES($1,$2,$3::uuid,$4,$5,$6::bigint,$7,$8)`,
        [c.legalEntityId,c.employeeId??null,posted.id,c.itemCode,c.warehouseId,qty.toString(),c.serialNo??'',c.batchNo??'']);
    } else if(c.kind==='RETURN' && c.originalIssueId) {
      const updated=await q.query(`UPDATE hft.employee_custody SET returned_micro=returned_micro+$3::bigint,
        version=version+1 WHERE legal_entity_id=$1 AND issue_command_id=(SELECT id FROM hft.stock_command
        WHERE legal_entity_id=$1 AND command_id=$2) AND returned_micro+$3::bigint<=issued_micro RETURNING issue_command_id`,
        [c.legalEntityId,c.originalIssueId,qty.toString()]);
      if(updated.rowCount!==1) throw new Error('RETURN_EXCEEDS_CUSTODY');
    }
    for(const movement of simulated.result.fact.movements) {
      const negative=movement.delta.startsWith('-');
      const micro=parseQuantity(negative?movement.delta.slice(1):movement.delta);
      const signed=negative?-micro:micro;
      const account=movement.bucket==='EXTERNAL'?null:movement.bucket==='QUARANTINE'?quarantine:good;
      if(movement.bucket!=='EXTERNAL' && !account) throw new Error('ENTRY_ACCOUNT_MISSING');
      await q.query(`INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro,employee_id,serial_no,batch_no)
        VALUES($1::uuid,$2::uuid,$3,$4::bigint,$5,$6,$7)`,
        [posted.id,account?.id??null,movement.bucket,signed.toString(),c.employeeId??null,c.serialNo??null,c.batchNo??null]);
    }
    if(document) {
      const updated=await q.query(`UPDATE hft.grn_line SET accepted_micro=accepted_micro+$3::bigint
        WHERE grn_id=$1::uuid AND line_no=$2 AND accepted_micro+$3::bigint<=ordered_micro RETURNING line_no`,
        [document.grnId,document.lineNo,qty.toString()]);
      if(updated.rowCount!==1) throw new Error('GRN_ACCEPTANCE_EXCEEDS_ORDER');
      await q.query(`UPDATE hft.grn SET status=CASE WHEN NOT EXISTS(
        SELECT 1 FROM hft.grn_line WHERE grn_id=$1::uuid AND accepted_micro<ordered_micro)
        THEN 'RECEIVED' ELSE 'PARTIALLY_RECEIVED' END,version=version+1 WHERE id=$1::uuid`,[document.grnId]);
    } else if(c.kind==='ISSUE') {
      await q.query(`UPDATE hft.material_issue SET status='ISSUED',version=version+1 WHERE id::text=$1`,[c.sourceDocumentId]);
    } else if(c.kind==='RETURN') {
      await q.query(`UPDATE hft.material_return SET status='RETURNED' WHERE id::text=$1`,[c.sourceDocumentId]);
    }
    const result=simulated.result;
    const canonicalText=JSON.stringify({schema:'HFT_STOCK_EVENT_V1',commandId:c.commandId,entity:c.legalEntityId,
      actor:operator.subject,approvalId:gate.approvalId,approvalRevision:gate.revision,fact:result.fact});
    const auditHash=sha256(canonicalText);
    const event=JSON.parse(canonicalText) as Record<string,unknown>;
    const outbox=await one<{id:string}>(q,`INSERT INTO hft.audit_outbox(command_id,canonical_event,
      canonical_text,canonical_sha256) VALUES($1::uuid,$2::jsonb,$3,$4) RETURNING id::text AS id`,
      [posted.id,JSON.stringify(event),canonicalText,auditHash]);
    await q.query(`INSERT INTO hft.audit_delivery(outbox_id,state) VALUES($1::uuid,'PENDING')`,[outbox.id]);
    await q.query(`INSERT INTO hft.stock_command_outcome(command_id,result,committed_by)
       VALUES($1::uuid,$2::jsonb,$3)`,[posted.id,JSON.stringify(result),operator.subject]);
    return result;
  });
}
