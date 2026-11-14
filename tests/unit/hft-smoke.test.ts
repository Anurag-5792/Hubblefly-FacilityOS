import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantity, formatQuantity } from '../../lib/hft/domain/quantity.ts';
import { validateEmployeeCsv, validateItem, requireActiveItem } from '../../lib/hft/domain/masters.ts';
import { assertSecureStartup, authorize, type VerifiedPrincipal } from '../../lib/hft/security/authorization.ts';
import { applyCommand, emptyEngineState, type StockCommand, type TrustedApprovalGate, type TrustedMasterSnapshot } from '../../lib/hft/domain/ledger.ts';

const principal: VerifiedPrincipal = { subject: 'OP1', authenticated: true, active: true,
  scope: { legalEntityId: 'HFT', siteId: 'SITE1', warehouseIds: ['WH1'] }, permissions: ['stock:post'] };
const masters: TrustedMasterSnapshot = {
  item: { legalEntityId: 'HFT', itemCode: 'ITEM1', uom: 'NOS', control: 'NONE', active: true, version: 1 },
  warehouse: { legalEntityId: 'HFT', siteId: 'SITE1', warehouseId: 'WH1', active: true, version: 1 },
  employee: { legalEntityId: 'HFT', siteId: 'SITE1', employeeId: 'EMP1', active: true,
    version: 1, fullName: 'Synthetic Worker', department: 'OPS', designation: 'Operator' }
};
function cmd(kind: StockCommand['kind'], suffix: string, qty: string, version: number, extra: Partial<StockCommand> = {}): StockCommand {
  return { commandId:'CMD-'+suffix, idempotencyKey:'KEY-'+suffix, sourceDocumentId:'DOC-'+suffix,
    sourceActionKey:'ACT-'+suffix, kind, quantity:qty, expectedBalanceVersion:version,
    legalEntityId:'HFT', siteId:'SITE1', warehouseId:'WH1', itemCode:'ITEM1', ...extra };
}
function approval(c: StockCommand, extra: Partial<TrustedApprovalGate> = {}): TrustedApprovalGate {
  return { verifiedByServer:true, approvalId:'APR1', documentId:c.sourceDocumentId,
    revision:1, approved:true, approvedBy:'APPROVER2', blockingHolds:[],
    legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',...extra };
}
function post(state: ReturnType<typeof emptyEngineState>, c: StockCommand, more: Partial<TrustedApprovalGate> = {}, m = masters) {
  return applyCommand(state,c,principal,approval(c,more),m);
}

test('fixed-point quantities reject exponent, negative and excessive precision', () => {
  assert.equal(formatQuantity(parseQuantity('12.000001')),'12.000001');
  for (const input of ['-1','1e4','1.0000001','01']) assert.throws(()=>parseQuantity(input),/QUANTITY_INVALID/);
});
test('employee CSV validates identity and duplicate, preserving inactive records', () => {
  const csv='employee_id,full_name,department,designation,site_id,active\nEMP1,"Synthetic, Worker",OPS,Tech,SITE1,true\nEMP1,Duplicate,OPS,Tech,SITE1,true\nEMP2,Inactive,OPS,Tech,SITE1,false';
  const r=validateEmployeeCsv(csv,'HFT');
  assert.equal(r.valid.length,2); assert.equal(r.errors[0].code,'EMPLOYEE_ID_DUPLICATE');
  assert.equal(r.valid[1].active,false);
});
test('inactive master can be retained but is blocked from posting', () => {
  assert.equal(validateItem({...masters.item,active:false}).active,false);
  assert.throws(()=>requireActiveItem({...masters.item,active:false}),/ITEM_INACTIVE/);
});
test('security blocks production and cross-entity or untrusted actors', () => {
  assert.throws(()=>assertSecureStartup({NODE_ENV:'production'}),/PRODUCTION_STARTUP_NOT_AUTHORIZED/);
  assert.throws(()=>assertSecureStartup({HFT_AUTH_SOURCE:'preview'}),/INSECURE_AUTH_SOURCE_REJECTED/);
  assert.throws(()=>authorize(null,'stock:post',{legalEntityId:'HFT',siteId:'SITE1'}),/AUTHENTICATION_REQUIRED/);
  assert.throws(()=>authorize(principal,'stock:post',{legalEntityId:'OTHER',siteId:'SITE1'}),/CROSS_ENTITY_DENIED/);
});
test('receipt conserves stock; retries replay without duplicate; holds and self-approval block', () => {
  const c=cmd('RECEIVE','R','5',0);
  assert.throws(()=>post(emptyEngineState(),c,{blockingHolds:['HOLD1']}),/BLOCKING_HOLD/);
  assert.throws(()=>post(emptyEngineState(),c,{approvedBy:'OP1'}),/SEGREGATION_OF_DUTIES/);
  const r=post(emptyEngineState(),c);
  assert.equal(r.result.available,'5');
  assert.deepEqual(r.result.fact.movements.map(m=>m.delta),['-5','5']);
  assert.equal(post(r.state,c).result.replay,true);
  assert.throws(()=>post(r.state,{...c,idempotencyKey:'KEY2',commandId:'CMD2'}),/SOURCE_ACTION_ALREADY_POSTED/);
});
test('issue and inspected return preserve custody; uninspected and excessive returns blocked', () => {
  const receipt=post(emptyEngineState(),cmd('RECEIVE','RR','5',0));
  const issue=post(receipt.state,cmd('ISSUE','I','4',1,{employeeId:'EMP1'}));
  assert.equal(issue.result.available,'1');
  const ret=cmd('RETURN','T','2',2,{employeeId:'EMP1',originalIssueId:'CMD-I',condition:'GOOD'});
  assert.throws(()=>post(issue.state,ret),/RETURN_INSPECTION_REQUIRED/);
  const returned=post(issue.state,ret,{inspectedCondition:'GOOD',inspectionEvidenceId:'QC-1'});
  assert.equal(returned.result.available,'3');
  const tooMuch=cmd('RETURN','T2','3',3,{employeeId:'EMP1',originalIssueId:'CMD-I',condition:'GOOD'});
  assert.throws(()=>post(returned.state,tooMuch,{inspectedCondition:'GOOD',inspectionEvidenceId:'QC-2'}),/RETURN_EXCEEDS_CUSTODY/);
});
test('optimistic stale snapshot and inactive employees fail closed', () => {
  const received=post(emptyEngineState(),cmd('RECEIVE','C','5',0));
  const a=cmd('ISSUE','A','4',1,{employeeId:'EMP1'});
  const first=post(received.state,a);
  assert.equal(first.result.available,'1');
  assert.throws(()=>post(first.state,cmd('ISSUE','B','4',1,{employeeId:'EMP1'})),/STALE_BALANCE_VERSION/);
  assert.throws(()=>post(received.state,a,{}, { ...masters, employee:{...masters.employee!,active:false} }),/EMPLOYEE_INACTIVE/);
});
