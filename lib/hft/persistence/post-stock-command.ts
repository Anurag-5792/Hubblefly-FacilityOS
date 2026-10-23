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
import { stockRequestFingerprint } from './command-fingerprint.ts';
import { postingLegs, accountIdentity, type AccountIdentity, type AccountKind } from './account-model.ts';
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
function canonicalKey(c: StockCommand): string { return JSON.stringify([c.legalEntityId,c.siteId,c.warehouseId,c.itemCode,c.locationId??'',c.batchNo||'',c.serialNo||'']); }
function requireIdentifier(v: string): void {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(v)) throw new Error('POSTING_IDENTIFIER_INVALID');
}
type Account = { id: string; qty_micro: string; reserved_micro: string; version: string };
async function getAccount(q: PgQueryClient, identity: AccountIdentity): Promise<Account> {
  const keys=[identity.legalEntityId,identity.warehouseId,identity.itemCode,identity.locationId,
    identity.batchNo,identity.serialNo,identity.condition,identity.kind,identity.custodianEmployeeId];
  await q.query(`INSERT INTO hft.stock_account(legal_entity_id,warehouse_id,item_code,location_key,
    batch_key,serial_key,condition,account_kind,custodian_employee_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,keys);
  return one<Account>(q,`SELECT id,qty_micro::text,reserved_micro::text,version::text
    FROM hft.stock_account WHERE legal_entity_id=$1 AND warehouse_id=$2 AND item_code=$3
    AND location_key=$4 AND batch_key=$5 AND serial_key=$6 AND condition=$7
    AND account_kind=$8 AND custodian_employee_id=$9 FOR UPDATE`,keys);
}
async function applyAccountUpdate(q: PgQueryClient, a: Account, next: bigint): Promise<void> {
  if (next < 0n || next < bigint(a.reserved_micro)) throw new Error('INSUFFICIENT_AVAILABLE_STOCK');
  const updated=await q.query(`UPDATE hft.stock_account SET qty_micro=$2::bigint,version=version+1
     WHERE id=$1::uuid AND version=$3::bigint AND reserved_micro<=$2::bigint RETURNING id`,
    [a.id,next.toString(),a.version]);
  if (updated.rowCount!==1) throw new Error('STALE_STOCK_ACCOUNT');
}
type PostingDocument =
 | Readonly<{kind:'GRN';grnId:string;lineNo:number;invoiceLineId:string;receiptId:string;authorizedBy:string}>
 | Readonly<{kind:'ISSUE';issueId:string;actionKey:string;authorizedBy:string}>
 | Readonly<{kind:'RETURN';returnId:string;actionKey:string;authorizedBy:string}>;
async function loadDocument(q:PgQueryClient,c:StockCommand,qty:bigint):Promise<PostingDocument> {
  if(c.kind==='RECEIVE') {
    const grn=await optional<Row>(q,`SELECT g.id::text,g.status,g.authorized_by,g.invoice_id::text,
        g.physical_receipt_id,s.active AS supplier_active,
        inv.status AS invoice_status,inv.invoice_key AS verified_invoice_key
      FROM hft.grn g
      JOIN hft.supplier s ON s.legal_entity_id=g.legal_entity_id AND s.supplier_id=g.supplier_id
      JOIN hft.supplier_invoice inv ON inv.id=g.invoice_id AND inv.legal_entity_id=g.legal_entity_id
        AND inv.supplier_id=g.supplier_id AND inv.invoice_key=g.invoice_key AND inv.invoice_date=g.invoice_date
      WHERE g.id::text=$1 AND g.legal_entity_id=$2 AND g.warehouse_id=$3 FOR UPDATE OF g,inv`,
      [c.sourceDocumentId,c.legalEntityId,c.warehouseId]);
    if(!grn || !['AUTHORIZED','PARTIALLY_RECEIVED'].includes(str(grn.status)) || !bool(grn.supplier_active) ||
       grn.invoice_status!=='VERIFIED' || !grn.authorized_by || !grn.physical_receipt_id ||
       str(grn.physical_receipt_id).startsWith('UNRECONCILED-'))
      throw new Error('GRN_INVOICE_OR_RECEIPT_NOT_VERIFIED');
    const fragment=await optional<Row>(q,`SELECT r.id::text AS receipt_id,r.line_no,r.accepted_micro::text,
       r.location_id,r.batch_no,r.serial_no,l.item_code,l.invoice_line_id::text,
       il.received_micro::text AS invoice_received_micro,il.authorized_micro::text AS invoice_authorized_micro
      FROM hft.grn_partial_receipt r
      JOIN hft.grn_line l ON l.grn_id=r.grn_id AND l.line_no=r.line_no
      JOIN hft.supplier_invoice_line il ON il.id=l.invoice_line_id
        AND il.invoice_id=$3::uuid AND il.item_code=l.item_code AND il.legal_entity_id=$4
      WHERE r.grn_id=$1::uuid AND (r.receipt_key||':'||r.line_no::text)=$2 AND r.qc_state='ACCEPTED'
        AND length(trim(r.evidence_reference))>0 AND r.legal_entity_id=$4 AND r.warehouse_id=$5
      FOR UPDATE OF r,l,il`,
      [c.sourceDocumentId,c.sourceActionKey,str(grn.invoice_id),c.legalEntityId,c.warehouseId]);
    if(!fragment || fragment.item_code!==c.itemCode || bigint(fragment.accepted_micro)!==qty ||
       fragment.location_id!==c.locationId || fragment.batch_no!==(c.batchNo??'') ||
       fragment.serial_no!==(c.serialNo??'') ||
       bigint(fragment.invoice_received_micro)+qty>bigint(fragment.invoice_authorized_micro))
      throw new Error('GRN_RECEIPT_SCOPE_QC_LOT_OR_QUANTITY_MISMATCH');
    return {kind:'GRN',grnId:c.sourceDocumentId,lineNo:int(fragment.line_no),
      invoiceLineId:str(fragment.invoice_line_id),receiptId:str(fragment.receipt_id),
      authorizedBy:str(grn.authorized_by)};
  }
  if(c.kind==='ISSUE') {
    const doc=await optional<Row>(q,`SELECT status,employee_id,approved_by,purpose FROM hft.material_issue
      WHERE id::text=$1 AND legal_entity_id=$2 AND warehouse_id=$3 FOR UPDATE`,
      [c.sourceDocumentId,c.legalEntityId,c.warehouseId]);
    if(!doc || !['AUTHORIZED','ISSUED'].includes(str(doc.status)) ||
       doc.employee_id!==c.employeeId || !doc.approved_by || !str(doc.purpose).trim())
      throw new Error('MATERIAL_ISSUE_NOT_AUTHORIZED');
    const line=await optional<Row>(q,`SELECT item_code,location_id,batch_no,serial_no,
      authorized_micro::text,issued_micro::text FROM hft.material_issue_line
      WHERE issue_id=$1::uuid AND source_action_key=$2 AND legal_entity_id=$3 AND warehouse_id=$4
      FOR UPDATE`,[c.sourceDocumentId,c.sourceActionKey,c.legalEntityId,c.warehouseId]);
    if(!line || line.item_code!==c.itemCode || line.location_id!==c.locationId ||
       line.batch_no!==(c.batchNo??'') || line.serial_no!==(c.serialNo??'') ||
       bigint(line.issued_micro)+qty>bigint(line.authorized_micro))
      throw new Error('ISSUE_LINE_SCOPE_OR_AUTHORIZED_QTY_MISMATCH');
    return {kind:'ISSUE',issueId:c.sourceDocumentId,actionKey:c.sourceActionKey,
      authorizedBy:str(doc.approved_by)};
  }
  if(c.kind==='RETURN') {
    const doc=await optional<Row>(q,`SELECT mr.status,mr.condition,mr.evidence_reference,
      mi.employee_id,mi.id::text AS linked_issue_document,mi.approved_by AS original_authorizer
      FROM hft.material_return mr JOIN hft.material_issue mi ON mi.id=mr.issue_id
      WHERE mr.id::text=$1 AND mi.legal_entity_id=$2 AND mi.warehouse_id=$3 FOR UPDATE OF mr`,
      [c.sourceDocumentId,c.legalEntityId,c.warehouseId]);
    if(!doc || !['AUTHORIZED','RETURNED'].includes(str(doc.status)) || doc.condition!==c.condition ||
       doc.employee_id!==c.employeeId || !doc.evidence_reference)
      throw new Error('MATERIAL_RETURN_NOT_INSPECTED_AND_AUTHORIZED');
    if(!c.originalIssueId) throw new Error('ORIGINAL_ISSUE_AND_EMPLOYEE_REQUIRED');
    const issue=await optional<Row>(q,`SELECT source_document_id FROM hft.stock_command
      WHERE legal_entity_id=$1 AND command_id=$2`,[c.legalEntityId,c.originalIssueId]);
    if(!issue || issue.source_document_id!==doc.linked_issue_document)
      throw new Error('RETURN_ORIGINAL_DOCUMENT_MISMATCH');
    const line=await optional<Row>(q,`SELECT item_code,location_id,batch_no,serial_no,
       original_issue_command_id,authorized_micro::text,returned_micro::text
      FROM hft.material_return_line WHERE return_id=$1::uuid AND source_action_key=$2
        AND legal_entity_id=$3 AND warehouse_id=$4 FOR UPDATE`,
      [c.sourceDocumentId,c.sourceActionKey,c.legalEntityId,c.warehouseId]);
    if(!line || line.item_code!==c.itemCode || line.location_id!==c.locationId ||
       line.batch_no!==(c.batchNo??'') || line.serial_no!==(c.serialNo??'') ||
       line.original_issue_command_id!==c.originalIssueId ||
       bigint(line.returned_micro)+qty>bigint(line.authorized_micro))
      throw new Error('RETURN_LINE_SCOPE_OR_AUTHORIZED_QTY_MISMATCH');
    return {kind:'RETURN',returnId:c.sourceDocumentId,actionKey:c.sourceActionKey,
      authorizedBy:str(doc.original_authorizer)};
  }
  throw new Error('COMMAND_KIND_INVALID');
}

export async function postIsolatedStockCommand(pool: PgPool, env: IsolatedPgEnvironment,
  command: StockCommand, operator: NonproductionOperator): Promise<PostResult> {
  const verifiedSubject = assertVerifiedRequestOperator(operator,command);
  requireIdentifier(verifiedSubject); requireIdentifier(command.commandId);
  requireIdentifier(command.idempotencyKey); requireIdentifier(command.sourceDocumentId);
  requireIdentifier(command.sourceActionKey);
  requireIdentifier(command.locationId??'');
  const payloadHash=stockRequestFingerprint(command,operator.subject);
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
    const physicalLocation=await optional<Row>(q,`SELECT active FROM hft.location
      WHERE legal_entity_id=$1 AND warehouse_id=$2 AND location_id=$3 FOR SHARE`,
      [c.legalEntityId,c.warehouseId,c.locationId??'']);
    if(!physicalLocation || !bool(physicalLocation.active)) throw new Error('POSTING_LOCATION_MISSING_OR_INACTIVE');
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
    if(document.authorizedBy!==gate.approvedBy && document.kind!=='RETURN')
      throw new Error('DOCUMENT_APPROVER_MISMATCH');
    const good=await getAccount(q,accountIdentity(c,'AVAILABLE'));
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
        ec.item_code,ec.warehouse_id,ec.legal_entity_id,ec.serial_no,ec.batch_no,ec.location_id,
        sc.source_document_id FROM hft.employee_custody ec
        JOIN hft.stock_command sc ON sc.id=ec.issue_command_id
        WHERE sc.legal_entity_id=$1 AND sc.command_id=$2 FOR UPDATE OF ec`,
        [c.legalEntityId,c.originalIssueId]);
      if(!custodyRow || custodyRow.location_id!==c.locationId) throw new Error('ISSUE_REFERENCE_OR_LOCATION_MISMATCH');
      engine.issueRecords.set(c.originalIssueId,{employeeId:str(custodyRow.employee_id),itemCode:str(custodyRow.item_code),
        warehouseId:str(custodyRow.warehouse_id),legalEntityId:str(custodyRow.legal_entity_id),siteId:c.siteId,
        original:bigint(custodyRow.issued_micro),remaining:bigint(custodyRow.issued_micro)-bigint(custodyRow.returned_micro),
        ...(custodyRow.serial_no?{serialNo:str(custodyRow.serial_no)}:{}),
        ...(custodyRow.batch_no?{batchNo:str(custodyRow.batch_no)}:{})});
    }
    const simulated=applyCommand(engine,c,principal,gate,masters);
    const nextQty=simulated.state.balances.get(key);
    if(nextQty===undefined) throw new Error('POSTING_BALANCE_MISSING');
    const legs=postingLegs(c,simulated.result.fact);
    const accounts=new Map<AccountKind,Account>();
    accounts.set('AVAILABLE',good);
    const deltas=new Map<AccountKind,bigint>();
    for(const leg of legs) {
      if(leg.account===null) continue;
      const kind=leg.account.kind;
      deltas.set(kind,(deltas.get(kind)??0n)+leg.signedMicro);
      if(!accounts.has(kind)) accounts.set(kind,await getAccount(q,leg.account));
    }
    for(const [kind,delta] of deltas) {
      const account=accounts.get(kind);
      if(!account) throw new Error('ACCOUNT_NOT_RESOLVED');
      const desired=bigint(account.qty_micro)+delta;
      if(kind==='AVAILABLE' && desired!==nextQty) throw new Error('AVAILABLE_RECONSTRUCTION_MISMATCH');
      await applyAccountUpdate(q,account,desired);
    }
    // A damaged/quarantined return does not credit AVAILABLE quantity, but it
    // DOES advance the optimistic stock-command version. Persist that version
    // without creating a fictional AVAILABLE movement leg.
    if(!deltas.has('AVAILABLE')) {
      if(c.kind!=='RETURN' || c.condition==='GOOD' || bigint(good.qty_micro)!==nextQty)
        throw new Error('MISSING_AVAILABLE_VERSION_TRANSITION');
      await applyAccountUpdate(q,good,nextQty);
    }
    if(c.serialNo) {
      if(c.kind==='RECEIVE') {
        const result=await q.query(`INSERT INTO hft.serial_registry(legal_entity_id,item_code,serial_no,warehouse_id,state)
          VALUES($1,$2,$3,$4,'AVAILABLE') ON CONFLICT DO NOTHING RETURNING serial_no`,
          [c.legalEntityId,c.itemCode,c.serialNo,c.warehouseId]);
        if(result.rowCount!==1) throw new Error('SERIAL_ALREADY_REGISTERED');
      } else {
        const toState=c.kind==='ISSUE'?'CUSTODY':c.condition==='GOOD'?'AVAILABLE':c.condition==='DAMAGED'?'DAMAGED':'QUARANTINE';
        const result=await q.query(`UPDATE hft.serial_registry SET state=$4,custodian_employee_id=$5,version=version+1
          WHERE legal_entity_id=$1 AND item_code=$2 AND serial_no=$3 RETURNING serial_no`,
          [c.legalEntityId,c.itemCode,c.serialNo,toState,c.kind==='ISSUE'?c.employeeId??null:null]);
        if(result.rowCount!==1) throw new Error('SERIAL_STATE_UPDATE_MISSING');
      }
    }
    // UUID-backed command and all dependent entries live in the same transaction.
    const posted=await one<{id:string}>(q,`INSERT INTO hft.stock_command(legal_entity_id,command_id,
      idempotency_key,payload_sha256,kind,source_document_id,source_action_key,actor_subject,approval_id,approval_revision,
      source_receipt_id,source_line_no,warehouse_id,item_code,location_id,batch_no,serial_no,site_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12,$13,$14,$15,$16,$17,$18) RETURNING id::text AS id`,
      [c.legalEntityId,c.commandId,c.idempotencyKey,payloadHash,c.kind,c.sourceDocumentId,c.sourceActionKey,
       operator.subject,gate.approvalId,gate.revision,document.kind==='GRN'?document.receiptId:null,
       document.kind==='GRN'?document.lineNo:null,c.warehouseId,c.itemCode,c.locationId??null,c.batchNo??'',c.serialNo??'',c.siteId]);
    if(c.kind==='ISSUE') {
      await q.query(`INSERT INTO hft.employee_custody(legal_entity_id,employee_id,issue_command_id,
        item_code,warehouse_id,issued_micro,serial_no,batch_no,location_id) VALUES($1,$2,$3::uuid,$4,$5,$6::bigint,$7,$8,$9)`,
        [c.legalEntityId,c.employeeId??null,posted.id,c.itemCode,c.warehouseId,qty.toString(),c.serialNo??'',c.batchNo??'',c.locationId??'']);
    } else if(c.kind==='RETURN' && c.originalIssueId) {
      const updated=await q.query(`UPDATE hft.employee_custody SET returned_micro=returned_micro+$3::bigint,
        version=version+1 WHERE legal_entity_id=$1 AND issue_command_id=(SELECT id FROM hft.stock_command
        WHERE legal_entity_id=$1 AND command_id=$2) AND returned_micro+$3::bigint<=issued_micro RETURNING issue_command_id`,
        [c.legalEntityId,c.originalIssueId,qty.toString()]);
      if(updated.rowCount!==1) throw new Error('RETURN_EXCEEDS_CUSTODY');
    }
    for(const leg of legs) {
      const account=leg.account===null?null:accounts.get(leg.account.kind);
      if(leg.account!==null && !account) throw new Error('ENTRY_ACCOUNT_MISSING');
      await q.query(`INSERT INTO hft.stock_entry(command_id,account_id,bucket,qty_delta_micro,employee_id,serial_no,batch_no)
        VALUES($1::uuid,$2::uuid,$3,$4::bigint,$5,$6,$7)`,
        [posted.id,account?.id??null,leg.bucket,leg.signedMicro.toString(),c.employeeId??null,c.serialNo??null,c.batchNo??null]);
    }
    if(document.kind==='GRN') {
      const updated=await q.query(`UPDATE hft.grn_line SET accepted_micro=accepted_micro+$3::bigint
        WHERE grn_id=$1::uuid AND line_no=$2 AND accepted_micro+$3::bigint<=ordered_micro RETURNING line_no`,
        [document.grnId,document.lineNo,qty.toString()]);
      if(updated.rowCount!==1) throw new Error('GRN_ACCEPTANCE_EXCEEDS_ORDER');
      const invoiceUpdated=await q.query(`UPDATE hft.supplier_invoice_line
        SET received_micro=received_micro+$2::bigint
        WHERE id=$1::uuid AND received_micro+$2::bigint<=authorized_micro RETURNING id`,
        [document.invoiceLineId,qty.toString()]);
      if(invoiceUpdated.rowCount!==1) throw new Error('INVOICE_LINE_ACCEPTANCE_EXCEEDS_AUTHORIZED');
      await q.query(`UPDATE hft.grn SET status=CASE WHEN NOT EXISTS(
        SELECT 1 FROM hft.grn_line WHERE grn_id=$1::uuid AND accepted_micro<ordered_micro)
        THEN 'RECEIVED' ELSE 'PARTIALLY_RECEIVED' END,version=version+1 WHERE id=$1::uuid`,[document.grnId]);
    } else if(document.kind==='ISSUE') {
      const updated=await q.query(`UPDATE hft.material_issue_line SET issued_micro=issued_micro+$3::bigint
        WHERE issue_id=$1::uuid AND source_action_key=$2 AND issued_micro+$3::bigint<=authorized_micro
        RETURNING source_action_key`,[document.issueId,document.actionKey,qty.toString()]);
      if(updated.rowCount!==1) throw new Error('ISSUE_AUTHORIZED_LINE_EXCEEDED');
      await q.query(`UPDATE hft.material_issue SET status=CASE WHEN NOT EXISTS(
        SELECT 1 FROM hft.material_issue_line WHERE issue_id=$1::uuid AND issued_micro<authorized_micro)
        THEN 'ISSUED' ELSE 'AUTHORIZED' END,version=version+1 WHERE id=$1::uuid`,[document.issueId]);
    } else if(document.kind==='RETURN') {
      const updated=await q.query(`UPDATE hft.material_return_line SET returned_micro=returned_micro+$3::bigint
        WHERE return_id=$1::uuid AND source_action_key=$2 AND returned_micro+$3::bigint<=authorized_micro
        RETURNING source_action_key`,[document.returnId,document.actionKey,qty.toString()]);
      if(updated.rowCount!==1) throw new Error('RETURN_AUTHORIZED_LINE_EXCEEDED');
      await q.query(`UPDATE hft.material_return SET status=CASE WHEN NOT EXISTS(
        SELECT 1 FROM hft.material_return_line WHERE return_id=$1::uuid AND returned_micro<authorized_micro)
        THEN 'RETURNED' ELSE 'AUTHORIZED' END WHERE id=$1::uuid`,[document.returnId]);
    }
    const result=simulated.result;
    const canonicalText=JSON.stringify({schema:'HFT_STOCK_EVENT_V2',commandId:c.commandId,entity:c.legalEntityId,
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
