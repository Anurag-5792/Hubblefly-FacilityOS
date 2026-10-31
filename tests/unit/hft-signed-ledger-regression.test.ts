import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantity, formatQuantity, formatSignedQuantity, requirePositive } from '../../lib/hft/domain/quantity.ts';
import { applyCommand, emptyEngineState, type StockCommand, type TrustedApprovalGate, type TrustedMasterSnapshot } from '../../lib/hft/domain/ledger.ts';
import { reconcileOpeningCount, type OpeningCountSession } from '../../lib/hft/domain/opening-stock.ts';
import type { VerifiedPrincipal } from '../../lib/hft/security/authorization.ts';

const actor: VerifiedPrincipal = { subject: 'STORE1', authenticated: true, active: true,
  permissions: ['stock:post', 'stock:prepare'],
  scope: { legalEntityId: 'HFT', siteId: 'SITE1', warehouseIds: ['WH1'] } };
const masters: TrustedMasterSnapshot = {
  item: { legalEntityId: 'HFT', itemCode: 'ITEM1', uom: 'NOS', control: 'NONE', active: true, version: 1 },
  warehouse: { legalEntityId: 'HFT', siteId: 'SITE1', warehouseId: 'WH1', active: true, version: 1 },
  employee: { legalEntityId: 'HFT', siteId: 'SITE1', employeeId: 'EMP1', fullName: 'Synthetic Employee',
    department: 'STORES', designation: 'ASSOCIATE', active: true, version: 1 }
};
function command(kind: StockCommand['kind'], id: string, quantity: string, version: number, additions: Partial<StockCommand> = {}): StockCommand {
  return { kind, commandId: id, idempotencyKey: 'I-' + id, quantity,
    sourceDocumentId: 'DOC-' + id, sourceActionKey: 'POST', expectedBalanceVersion: version,
    legalEntityId: 'HFT', siteId: 'SITE1', warehouseId: 'WH1', itemCode: 'ITEM1', ...additions };
}
function gate(c: StockCommand, additions: Partial<TrustedApprovalGate> = {}): TrustedApprovalGate {
  return { verifiedByServer: true, approved: true, approvedBy: 'APPROVER2',
    approvalId: 'AP-' + c.commandId, documentId: c.sourceDocumentId, revision: 1,
    legalEntityId: c.legalEntityId, siteId: c.siteId, warehouseId: c.warehouseId,
    blockingHolds: [], ...additions };
}
function sumDeltas(fact: { movements: readonly {delta: string}[] }): bigint {
  return fact.movements.reduce((acc, {delta}) => acc + (delta.startsWith('-') ? -1n : 1n) * parseQuantity(delta.replace(/^-/, '')), 0n);
}
test('signed ledger formatter is separate from unsigned stock format', () => {
  assert.equal(formatSignedQuantity(-1_234_567n), '-1.234567');
  assert.equal(formatSignedQuantity(0n), '0');
  assert.equal(formatSignedQuantity(123n), '0.000123');
  assert.throws(() => formatQuantity(-1n), /QUANTITY_INVALID/);
  assert.throws(() => parseQuantity('-0.000001'), /QUANTITY_INVALID/);
  assert.throws(() => requirePositive(0n), /QUANTITY_MUST_BE_POSITIVE/);
});
test('RECEIVE -> ISSUE -> RETURN signs, custody, and per-command conservation', () => {
  const receive = command('RECEIVE', 'REC1', '5.5', 0);
  const r = applyCommand(emptyEngineState(), receive, actor, gate(receive), masters);
  assert.equal(r.result.available, '5.5');
  assert.deepEqual(r.result.fact.movements.map(x => x.delta), ['-5.5', '5.5']);
  const issue = command('ISSUE', 'ISS1', '3', 1, { employeeId: 'EMP1' });
  const i = applyCommand(r.state, issue, actor, gate(issue), masters);
  assert.equal(i.result.available, '2.5');
  assert.deepEqual(i.result.fact.movements.map(x => x.delta), ['-3', '3']);
  const returning = command('RETURN', 'RET1', '1.25', 2,
    { employeeId: 'EMP1', originalIssueId: 'ISS1', condition: 'GOOD' });
  const ret = applyCommand(i.state, returning, actor,
    gate(returning, { inspectedCondition: 'GOOD', inspectionEvidenceId: 'QC1' }), masters);
  assert.equal(ret.result.available, '3.75');
  assert.deepEqual(ret.result.fact.movements.map(x => x.delta), ['-1.25', '1.25']);
  assert.equal(ret.state.issueRecords.get('ISS1')?.remaining, 1_750_000n);
  assert.equal(ret.state.facts.length, 3);
  for (const fact of ret.state.facts) assert.equal(sumDeltas(fact), 0n);
  assert.equal(r.state.facts.length, 1, 'original immutable state not mutated');
});
test('idempotent replay preserves original facts and balances', () => {
  const cmd = command('RECEIVE', 'REC2', '7', 0);
  const first = applyCommand(emptyEngineState(), cmd, actor, gate(cmd), masters);
  const replay = applyCommand(first.state, cmd, actor, gate(cmd), masters);
  assert.equal(replay.result.replay, true);
  assert.equal(replay.result.available, '7');
  assert.equal(replay.state, first.state);
  assert.equal(replay.state.facts.length, 1);
  assert.throws(() => applyCommand(first.state, { ...cmd, quantity: '8' }, actor, gate(cmd), masters), /IDEMPOTENCY_CONFLICT/);
});
test('negative, zero, positive opening-stock variance retains exact six decimals', () => {
  const key = JSON.stringify(['HFT','SITE1','WH1','EPOCH1','ITEM1','BIN1','LOOSE','','']);
  const session: OpeningCountSession = { sessionId: 'SESSION1', stockEpoch: 'EPOCH1', legalEntityId: 'HFT',
    siteId: 'SITE1', warehouseId: 'WH1',
    lines: [{ lineId: 'LN1', itemCode: 'ITEM1', locationId: 'BIN1', inventoryState: 'LOOSE', quantity: '2.000001' }] };
  const lookup = new Map([['ITEM1', masters.item]]);
  for (const [reference, expected] of [['3.123456','-1.123455'], ['2.000001','0'], ['1.000002','0.999999']] as const) {
    const result = reconcileOpeningCount(session, actor, lookup, new Map([[key, reference]]));
    assert.equal(result[0].variance, expected);
    assert.equal(result[0].physicalQuantity, '2.000001');
    assert.equal(result[0].referenceQuantity, reference);
  }
});
test('blocking hold and self approval reject without mutating original state', () => {
  const state = emptyEngineState();
  const c = command('RECEIVE', 'REC3', '1', 0);
  assert.throws(() => applyCommand(state, c, actor, gate(c, {blockingHolds: ['HOLD1']}), masters), /BLOCKING_HOLD/);
  assert.throws(() => applyCommand(state, c, actor, gate(c, {approvedBy: 'STORE1'}), masters), /SEGREGATION_OF_DUTIES/);
  assert.equal(state.facts.length, 0);
  assert.equal(state.balances.size, 0);
});

test('M2: fresh idempotency key cannot reuse already-posted commandId',()=>{
  const cmd=command('RECEIVE','REC-M2','2',0);
  const first=applyCommand(emptyEngineState(),cmd,actor,gate(cmd),masters);
  const collision={...command('RECEIVE','NEW-ID','1',1),commandId:cmd.commandId};
  assert.throws(()=>applyCommand(first.state,collision,actor,gate(collision),masters),/COMMAND_ID_ALREADY_POSTED/);
  assert.equal(first.state.facts.length,1);
});

test('M1: separate approved ISSUE fragments share one source line without double-posting',()=>{
  const receive=command('RECEIVE','FRAG-REC','5',0);
  let state=applyCommand(emptyEngineState(),receive,actor,gate(receive),masters).state;
  const a=command('ISSUE','FRAG-ISS1','2',1,{employeeId:'EMP1',sourceDocumentId:'ISSUE-DOC',
    sourceActionKey:'LINE-1',fragmentId:'FRAGMENT-1'});
  state=applyCommand(state,a,actor,gate(a),masters).state;
  const b=command('ISSUE','FRAG-ISS2','3',2,{employeeId:'EMP1',sourceDocumentId:'ISSUE-DOC',
    sourceActionKey:'LINE-1',fragmentId:'FRAGMENT-2'});
  state=applyCommand(state,b,actor,gate(b),masters).state;
  assert.equal(state.issueRecords.get('FRAG-ISS1')?.remaining,2000000n);
  assert.equal(state.issueRecords.get('FRAG-ISS2')?.remaining,3000000n);
  assert.equal(state.facts.length,3);
  const replay={...command('ISSUE','FRAG-ISS3','1',3,{employeeId:'EMP1',
    sourceDocumentId:'ISSUE-DOC',sourceActionKey:'LINE-1'}),fragmentId:'FRAGMENT-2'};
  assert.throws(()=>applyCommand(state,replay,actor,gate(replay),masters),/SOURCE_ACTION_ALREADY_POSTED/);
});
