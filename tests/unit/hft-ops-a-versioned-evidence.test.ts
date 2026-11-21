/** OPS-A versioned ledger source-only regressions. No PostgreSQL execution.
 * Candidate immutable rows are synthetic projections of hft.stock_command,
 * hft.stock_entry, hft.stock_account, seal and audit, never a second ledger.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {OPS_A_EVIDENCE_V1,OPS_A_READBACK_V1,
 versionedAccountIdentityKey,versionedMovementDigest,versionedFactAuditText,
 verifyVersionedImmutableFact,verifyVersionedLedgerReadback,
 type VersionScope,type VersionedCommand,type StockAccountIdentity,
 type VersionedLedgerEntry,type VersionedImmutableFact,
 type VersionedLedgerReadback,type VersionedStockAccountRow}
 from '../../lib/hft/persistence/ops-a-versioned-evidence.ts';

const scope:VersionScope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',controlType:'NONE',serialNo:'',batchNo:''};
function account(id:string,leaf:string,kind:StockAccountIdentity['kind']='AVAILABLE',
 employee='',custom:Partial<VersionScope>={}):VersionedStockAccountRow{
 const identity:StockAccountIdentity={...scope,...custom,leafLocationId:leaf,kind,
  condition:kind==='DAMAGED'?'DAMAGED':kind==='QUARANTINE'?'QUARANTINE':'GOOD',
  custodianEmployeeId:employee};
 return {accountId:id,identity,persistedQuantity:'0',persistedVersion:0};
}
let line=0;
function movement(commandId:string,accountRow:VersionedStockAccountRow|null,
 amount:string, before:number):VersionedLedgerEntry{
 return {entryId:'E'+String(++line),commandId,accountId:accountRow?.accountId??null,
  account:accountRow?.identity??null,
  bucket:accountRow?.identity.kind??'EXTERNAL',
  signedQuantity:amount,accountBeforeVersion:accountRow?before:null,
  accountAfterVersion:accountRow?before+1:null};
}
function command(kind:VersionedCommand['kind'],id:string,qty:string,
 more:Partial<VersionedCommand>={}):VersionedCommand{
 return {...scope,kind,commandId:id,idempotencyKey:'IDEMP-'+id,
  sourceDocumentId:'DOC-'+id,sourceActionKey:'ACTION-'+id,
  sourceRevision:1,approvalId:'APP-'+id,approvalRevision:1,
  policyGeneration:2,actorSubject:'STORE1',approvedBy:'CHECKER1',
  requestQuantity:qty,sourceLeafId:'',destinationLeafId:'',
  expectedSourceAccountVersion:null,expectedDestinationAccountVersion:0,
  fragmentId:'',employeeId:'',originalIssueId:'',
  inspectedCondition:'GOOD',inspectionEvidenceId:'',...more};
}
function sealed(c:VersionedCommand,entries:readonly VersionedLedgerEntry[]):VersionedImmutableFact{
 const provisional:VersionedImmutableFact={schema:OPS_A_EVIDENCE_V1,
  command:c,ledgerEntryIds:entries.map(x=>x.entryId),movements:entries,
  movementSha256:'',auditCanonicalText:'',auditSha256:''};
 const movementSha256=versionedMovementDigest(provisional);
 const auditCanonicalText=versionedFactAuditText(provisional);
 const auditSha256=createHash('sha256').update(auditCanonicalText).digest('hex');
 return {...provisional,movementSha256,auditCanonicalText,auditSha256};
}
type MutableVersionedReadback=VersionedLedgerReadback&{
 immutableFacts:VersionedImmutableFact[];accounts:VersionedStockAccountRow[];
};
const mutable=(raw:VersionedLedgerReadback):MutableVersionedReadback=>
 structuredClone(raw) as MutableVersionedReadback;
function fresh(){
 line=0;
 const a=account('ACC-AVAIL-BIN1','BIN1');
 const b=account('ACC-AVAIL-BIN2','BIN2');
 const custody=account('ACC-CUST-EMP1','BIN1','CUSTODY','EMP1');
 const version2=account('ACC-PV2-BIN1','BIN1','AVAILABLE','',{productVersion:'PV2'});
 const receive=command('RECEIVE','RCV1','5',{
  destinationLeafId:'BIN1',inspectionEvidenceId:'QC-ACCEPTED'});
 const issue=command('ISSUE','ISS1','2',{sourceLeafId:'BIN1',
  employeeId:'EMP1',fragmentId:'ISSUE-LINE1',
  expectedSourceAccountVersion:1,expectedDestinationAccountVersion:0});
 const ret=command('RETURN','RET1','1',{sourceLeafId:'BIN1',
  destinationLeafId:'BIN1',employeeId:'EMP1',originalIssueId:'ISS1',
  fragmentId:'RETURN-LINE1',inspectionEvidenceId:'QC-RETURN1',
  expectedSourceAccountVersion:1,expectedDestinationAccountVersion:2});
 const transfer=command('TRANSFER','MOV1','1',{sourceLeafId:'BIN1',
  destinationLeafId:'BIN2',fragmentId:'TRANSFER-LINE1',
  expectedSourceAccountVersion:3,expectedDestinationAccountVersion:0});
 const receiveV2=command('RECEIVE','RCV2','2',{
  productVersion:'PV2',destinationLeafId:'BIN1',
  inspectionEvidenceId:'QC-ACCEPTED2'});
 const facts=[
  sealed(receive,[movement('RCV1',null,'-5',0),movement('RCV1',a,'5',0)]),
  sealed(issue,[movement('ISS1',a,'-2',1),movement('ISS1',custody,'2',0)]),
  sealed(ret,[movement('RET1',custody,'-1',1),movement('RET1',a,'1',2)]),
  sealed(transfer,[movement('MOV1',a,'-1',3),movement('MOV1',b,'1',0)]),
  sealed(receiveV2,[movement('RCV2',null,'-2',0),movement('RCV2',version2,'2',0)])
 ];
 const rows:VersionedStockAccountRow[]=[
  {...a,persistedQuantity:'3',persistedVersion:4},
  {...b,persistedQuantity:'1',persistedVersion:1},
  {...custody,persistedQuantity:'1',persistedVersion:2},
  {...version2,persistedQuantity:'2',persistedVersion:1}
 ];
 const readback:VersionedLedgerReadback={schema:OPS_A_READBACK_V1,
  legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
  completeUnfilteredHistory:true,immutableFacts:facts,accounts:rows};
 return {a,b,custody,version2,facts,readback};
}
function fail(f:VersionedImmutableFact,regexp:RegExp){
 assert.throws(()=>verifyVersionedImmutableFact(f),regexp);
}
test('OPS-A valid RECEIVE, employee ISSUE/RETURN, atomic TRANSFER and another version reconstruct one ledger',()=>{
 const {readback,facts,a,version2}=fresh();
 for(const f of facts)verifyVersionedImmutableFact(f);
 assert.notEqual(versionedAccountIdentityKey(a.identity),
  versionedAccountIdentityKey(version2.identity));
 const totals=verifyVersionedLedgerReadback(readback);
 assert.equal(totals.get('ACC-AVAIL-BIN1'),3_000_000n);
 assert.equal(totals.get('ACC-AVAIL-BIN2'),1_000_000n);
 assert.equal(totals.get('ACC-CUST-EMP1'),1_000_000n);
 assert.equal(totals.get('ACC-PV2-BIN1'),2_000_000n);
 assert.equal([...totals.values()].reduce((n,x)=>n+x,0n),7_000_000n);
});
test('OPS-A item version is part of exact account identity, not master revision',()=>{
 const {a}=fresh();
 for(const version of ['PV1','PV2','PV3']){
  assert.match(versionedAccountIdentityKey({...a.identity,productVersion:version}),/^[a-f0-9]{64}$/);
 }
 assert.notEqual(versionedAccountIdentityKey(a.identity),
  versionedAccountIdentityKey({...a.identity,productVersion:'PV2'}));
});
test('OPS-A location, custody holder, batch and state uniquely identify accounts',()=>{
 const {a}=fresh();const original=versionedAccountIdentityKey(a.identity);
 for(const candidate of [
  {...a.identity,leafLocationId:'BIN2'},
  {...a.identity,kind:'CUSTODY' as const,custodianEmployeeId:'EMP1'},
  {...a.identity,kind:'DAMAGED' as const,condition:'DAMAGED' as const},
  {...a.identity,controlType:'BATCH' as const,batchNo:'LOT1'},
 ]){
  assert.notEqual(versionedAccountIdentityKey(candidate),original);
 }
});
test('OPS-A forged source item version on an owned movement is rejected even after re-sealing',()=>{
 const {facts}=fresh();
 const receive=facts[0];
 const leg=receive.movements[1];
 const bad=sealed(receive.command,[receive.movements[0],
  {...leg,account:{...leg.account!,productVersion:'PV2'}}]);
 fail(bad,/ENTRY_ITEM_VERSION_SCOPE_DRIFT/);
});
test('OPS-A cross entity, site, warehouse or different leaf cannot masquerade as same account',()=>{
 const {facts}=fresh();
 for(const x of [{legalEntityId:'DDL'},{siteId:'SITE2'},{warehouseId:'WH2'}]){
  const changed={...facts[0].movements[1],
   account:{...facts[0].movements[1].account!,...x}};
  const bad=sealed(facts[0].command,[facts[0].movements[0],changed]);
  fail(bad,/ENTRY_ITEM_VERSION_SCOPE_DRIFT/);
 }
 const leg=facts[1].movements[0];
 fail(sealed(facts[1].command,[{...leg,account:{...leg.account!,leafLocationId:'BIN2'}},
  facts[1].movements[1]]),/ISSUE_CUSTODY_SCOPE_INVALID/);
});
test('OPS-A valid batch traceability is isolated and serial unit must equal one',()=>{
 line=0;
 const batch:VersionScope={...scope,controlType:'BATCH',batchNo:'LOT1'};
 const a=account('LOT-ONE','BIN1','AVAILABLE','',batch);
 const c=command('RECEIVE','LOT-RECEIVE','5',{...batch,
  destinationLeafId:'BIN1',inspectionEvidenceId:'QC-LOT'});
 verifyVersionedImmutableFact(sealed(c,[
  movement(c.commandId,null,'-5',0),movement(c.commandId,a,'5',0)]));
 assert.notEqual(versionedAccountIdentityKey(a.identity),
  versionedAccountIdentityKey({...a.identity,batchNo:'LOT2'}));
 const serialScope:VersionScope={...scope,controlType:'SERIAL',serialNo:'SER1'};
 const serialA=account('SER-AVAIL','BIN1','AVAILABLE','',serialScope);
 const serialized=command('RECEIVE','SER-RECEIVE','2',{...serialScope,
  destinationLeafId:'BIN1',inspectionEvidenceId:'QC-SER'});
 fail(sealed(serialized,[movement(serialized.commandId,null,'-2',0),
  movement(serialized.commandId,serialA,'2',0)]),/SERIAL_UNIT_REQUIRED/);
});
test('OPS-A unbalanced two-leg movement cannot be concealed with matching digest',()=>{
 const {facts}=fresh();
 const x=facts[0],leg=x.movements[1];
 fail(sealed(x.command,[x.movements[0],{...leg,signedQuantity:'4'}]),
  /UNBALANCED_COMMAND/);
});
test('OPS-A stale source or destination revision cannot be masked by a new seal',()=>{
 const {facts}=fresh();
 const transfer=facts[3];
 for(const change of [{expectedSourceAccountVersion:2},
  {expectedDestinationAccountVersion:1}]){
  fail(sealed({...transfer.command,...change},transfer.movements),
   /STALE_AUTHORIZED_ACCOUNT_REVISION/);
 }
 fail(sealed({...transfer.command,expectedDestinationAccountVersion:-1},
  transfer.movements),/AUTHORIZED_ACCOUNT_REVISION_INVALID/);
});
test('OPS-A malformed account ownership EXTERNAL and CUSTODY conditions rejected',()=>{
 const {facts}=fresh();const x=facts[0];
 fail(sealed(x.command,[{...x.movements[0],accountId:'ACC1'},
  x.movements[1]]),/EXTERNAL_OWNERSHIP_FORBIDDEN/);
 const y=facts[1],leg=y.movements[1];
 fail(sealed(y.command,[y.movements[0],
  {...leg,account:{...leg.account!,custodianEmployeeId:'EMP2'}}]),
  /ISSUE_CUSTODY_SCOPE_INVALID/);
});
test('OPS-A same-bin transfer and separate-bucket fake transfer denied',()=>{
 const {facts}=fresh(),fact=facts[3];
 const changed=sealed({...fact.command,destinationLeafId:'BIN1'},fact.movements);
 fail(changed,/TRANSFER_ONE_WRITER_LOCATIONS_INVALID/);
 const fake=sealed(fact.command,[fact.movements[0],
  {...fact.movements[1],bucket:'CUSTODY'}]);
 fail(fake,/ENTRY_BUCKET_ACCOUNT_MISMATCH/);
});
test('OPS-A approved person cannot approve own posting',()=>{
 const {facts}=fresh(),f=facts[1];
 fail(sealed({...f.command,approvedBy:f.command.actorSubject},f.movements),
  /SELF_APPROVAL/);
});
test('OPS-A immutable sealed movement and audit bytes are checked',()=>{
 const {facts}=fresh(),f=facts[0];
 fail({...f,movementSha256:'a'.repeat(64)},/MOVEMENT_SEAL_MISMATCH/);
 fail({...f,auditCanonicalText:'forged'},/IMMUTABLE_AUDIT_MISMATCH/);
 fail({...f,auditSha256:'b'.repeat(64)},/IMMUTABLE_AUDIT_MISMATCH/);
});
test('OPS-A entry IDs and command IDs must bind immutable movement order',()=>{
 const {facts}=fresh(),f=facts[0];
 fail({...f,ledgerEntryIds:[...f.ledgerEntryIds].reverse()},/ENTRY_ORDER_MISMATCH/);
 const moved=sealed(f.command,[{...f.movements[0],commandId:'OTHER'},
  f.movements[1]]);
 fail(moved,/ENTRY_COMMAND_MISMATCH/);
});
test('OPS-A stale account version, skipped version and forged persisted version fail',()=>{
 const {readback,facts}=fresh(),f=facts[1];
 const changedSourceLeg={...f.movements[0],
  accountBeforeVersion:0,accountAfterVersion:1};
 // The original signed expected version itself first rejects the attempt.
 const rejected=sealed(f.command,[changedSourceLeg,f.movements[1]]);
 assert.throws(()=>verifyVersionedImmutableFact(rejected),
  /STALE_AUTHORIZED_ACCOUNT_REVISION/);
 // Even if the claimed expected revision is fraudulently realigned with the
 // stale leg, full immutable history exposes a skipped account revision.
 const altered=sealed({...f.command,expectedSourceAccountVersion:0},
  [changedSourceLeg,f.movements[1]]);
 const contaminated=mutable(readback);
 contaminated.immutableFacts[1]=altered;
 assert.throws(()=>verifyVersionedLedgerReadback(contaminated),
  /ACCOUNT_VERSION_STALE_OR_SKIPPED/);
 const wrong=mutable(readback);
 wrong.accounts[0]={...wrong.accounts[0],persistedVersion:99};
 assert.throws(()=>verifyVersionedLedgerReadback(wrong),/ACCOUNT_VERSION_RECONSTRUCTION_MISMATCH/);
});
test('OPS-A duplicated command, idempotency, action or immutable entry never double-counts',()=>{
 const {readback,facts}=fresh();
 for(const field of ['commandId','idempotencyKey','sourceActionKey'] as const){
  const wrong=mutable(readback);
  // Insert second copy of receipt against different version without changing balances.
  const prev=facts[0],second=facts[4];
  const duplicate=sealed({...second.command,[field]:prev.command[field],
   ...(field==='sourceActionKey'?{sourceDocumentId:prev.command.sourceDocumentId}:{})},
   second.movements);
  wrong.immutableFacts[4]=duplicate;
  assert.throws(()=>verifyVersionedLedgerReadback(wrong),
   /DUPLICATE_COMMAND_OR_SOURCE_ACTION|ENTRY_COMMAND_MISMATCH/);
 }
 const bad=mutable(readback);
 const f=facts[3];
 bad.immutableFacts[3]=sealed(f.command,[{...f.movements[0],entryId:facts[0].movements[0].entryId},
  f.movements[1]]);
 assert.throws(()=>verifyVersionedLedgerReadback(bad),/DUPLICATE_IMMUTABLE_ENTRY_ID/);
});
test('OPS-A missing committed entry, mismatched persisted balance or extra account fails',()=>{
 const {readback}=fresh();
 const missing=mutable(readback);
 missing.immutableFacts.splice(3,1);
 assert.throws(()=>verifyVersionedLedgerReadback(missing),/ACCOUNT_LEDGER_RECONSTRUCTION_MISMATCH/);
 const changed=mutable(readback);
 changed.accounts[1]={...changed.accounts[1],persistedQuantity:'99'};
 assert.throws(()=>verifyVersionedLedgerReadback(changed),/ACCOUNT_LEDGER_RECONSTRUCTION_MISMATCH/);
 const extra=mutable(readback);
 extra.accounts.push({...account('ACC-EXTRA','BIN3'),persistedQuantity:'1'});
 assert.throws(()=>verifyVersionedLedgerReadback(extra),/ACCOUNT_LEDGER_RECONSTRUCTION_MISMATCH/);
});
test('OPS-A snapshot explicitly partial cannot masquerade as authoritative history',()=>{
 const {readback}=fresh();
 assert.throws(()=>verifyVersionedLedgerReadback(
  {...readback,completeUnfilteredHistory:false as unknown as true}),
  /COMPLETE_AUTHORITATIVE_HISTORY_REQUIRED/);
});
test('OPS-A cross-site, cross-warehouse, cross-company readback fails closed',()=>{
 const {readback}=fresh();
 for(const changes of [{siteId:'SITE2'},{warehouseId:'WH2'},{legalEntityId:'DDL'}]){
  assert.throws(()=>verifyVersionedLedgerReadback({...readback,...changes}),
   /ACCOUNT_OUT_OF_SCOPE|COMMAND_OUT_OF_SCOPE/);
 }
});
test('OPS-A wrong-version returned against another original ISSUE is rejected',()=>{
 const {readback,facts}=fresh();
 const bad=mutable(readback);
 // Receipt PV2 exists but RETURN must bind the original ISSUE's exact scope.
 const ret=facts[2];
 bad.immutableFacts[2]=sealed({...ret.command,productVersion:'PV2'},ret.movements);
 assert.throws(()=>verifyVersionedLedgerReadback(bad),/ENTRY_ITEM_VERSION_SCOPE_DRIFT/);
});
test('OPS-A damaged/quarantined RETURN must never inflate AVAILABLE',()=>{
 const {facts}=fresh();
 const ret=facts[2],to=ret.movements[1];
 const fake=sealed({...ret.command,inspectedCondition:'DAMAGED'},[ret.movements[0],to]);
 fail(fake,/RETURN_CUSTODY_INSPECTION_INVALID/);
});
test('OPS-A duplicate serial across versions requires the same global registry identity',()=>{
 line=0;
 const serial:VersionScope={...scope,controlType:'SERIAL',serialNo:'SER-A'};
 const a=account('ACC-SER-A','BIN1','AVAILABLE','',serial);
 const c=command('RECEIVE','SER-1','1',{...serial,
  destinationLeafId:'BIN1',inspectionEvidenceId:'QC-A'});
 const b=account('ACC-SER-B','BIN1','AVAILABLE','',
  {...serial,productVersion:'PV2'});
 const d=command('RECEIVE','SER-2','1',{...serial,productVersion:'PV2',
  destinationLeafId:'BIN1',inspectionEvidenceId:'QC-B'});
 const facts=[
  sealed(c,[movement('SER-1',null,'-1',0),movement('SER-1',a,'1',0)]),
  sealed(d,[movement('SER-2',null,'-1',0),movement('SER-2',b,'1',0)])
 ];
 const rb:VersionedLedgerReadback={schema:OPS_A_READBACK_V1,
  legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
  completeUnfilteredHistory:true,immutableFacts:facts,
  accounts:[{...a,persistedQuantity:'1',persistedVersion:1},
   {...b,persistedQuantity:'1',persistedVersion:1}]};
 assert.throws(()=>verifyVersionedLedgerReadback(rb),/SERIAL_VERSION_REASSIGNMENT/);
});
test('OPS-A serial GOOD inspected RETURN restores availability for subsequent approved ISSUE',()=>{
 line=0;
 const sr:VersionScope={...scope,controlType:'SERIAL',serialNo:'SER-ONE'};
 const a=account('ACC-SER-AVAIL','BIN1','AVAILABLE','',sr);
 const firstCustody=account('ACC-SER-CUST1','BIN1','CUSTODY','EMP1',sr);
 const nextCustody=account('ACC-SER-CUST2','BIN1','CUSTODY','EMP2',sr);
 const receive=command('RECEIVE','SR-RECEIPT','1',{...sr,
  destinationLeafId:'BIN1',inspectionEvidenceId:'QC-RECV1'});
 const issue=command('ISSUE','SR-ISSUE1','1',{...sr,
  sourceLeafId:'BIN1',employeeId:'EMP1',fragmentId:'FRAG-1',
  expectedSourceAccountVersion:1,expectedDestinationAccountVersion:0});
 const ret=command('RETURN','SR-RETURN1','1',{...sr,sourceLeafId:'BIN1',
  destinationLeafId:'BIN1',employeeId:'EMP1',originalIssueId:'SR-ISSUE1',
  fragmentId:'FRAG-RET',inspectionEvidenceId:'QC-RETURN1',
  expectedSourceAccountVersion:1,expectedDestinationAccountVersion:2});
 const again=command('ISSUE','SR-ISSUE2','1',{...sr,sourceLeafId:'BIN1',
  employeeId:'EMP2',fragmentId:'FRAG-2',
  expectedSourceAccountVersion:3,expectedDestinationAccountVersion:0});
 const history=[
  sealed(receive,[movement('SR-RECEIPT',null,'-1',0),
   movement('SR-RECEIPT',a,'1',0)]),
  sealed(issue,[movement('SR-ISSUE1',a,'-1',1),
   movement('SR-ISSUE1',firstCustody,'1',0)]),
  sealed(ret,[movement('SR-RETURN1',firstCustody,'-1',1),
   movement('SR-RETURN1',a,'1',2)]),
  sealed(again,[movement('SR-ISSUE2',a,'-1',3),
   movement('SR-ISSUE2',nextCustody,'1',0)]),
 ];
 const p:VersionedLedgerReadback={schema:OPS_A_READBACK_V1,
  legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
  completeUnfilteredHistory:true,immutableFacts:history,
  accounts:[{...a,persistedQuantity:'0',persistedVersion:4},
   {...firstCustody,persistedQuantity:'0',persistedVersion:2},
   {...nextCustody,persistedQuantity:'1',persistedVersion:1}]};
 assert.equal(verifyVersionedLedgerReadback(p).get('ACC-SER-CUST2'),1_000_000n);
});
test('OPS-A original ISSUE quantity, employee and source identity bound to RETURN',()=>{
 const {readback,facts}=fresh();
 const wrong=mutable(readback),ret=facts[2];
 wrong.immutableFacts[2]=sealed({...ret.command,employeeId:'EMP2'},
  [{...ret.movements[0],account:{...ret.movements[0].account!,
   custodianEmployeeId:'EMP2'}},ret.movements[1]]);
 assert.throws(()=>verifyVersionedLedgerReadback(wrong),
  /RETURN_ORIGINAL_ISSUE_IDENTITY_MISMATCH/);
});
test('OPS-A current P0 SQL rejecting stubs and P2 V1 payload must remain blocked',()=>{
 const candidate=readFileSync('db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql','utf8');
 const p2=readFileSync('lib/hft/security/posting-invocation-proof.ts','utf8');
 const p0=readFileSync('lib/hft/stores/p0-persistence.ts','utf8');
 assert.match(candidate,/RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED'/);
 assert.match(candidate,/RAISE EXCEPTION 'P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED'/);
 assert.match(p2,/HFT_STOCK_POST_V1/);
 assert.doesNotMatch(p2,/['"]productVersion['"],?/);
 assert.match(p0,/P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION/);
});

test('063 balanced but wrong-magnitude TRANSFER with recomputed digest fails signed quantity',()=>{
 const {facts}=fresh(),original=facts[3];
 const forged=sealed(original.command,[
  {...original.movements[0],signedQuantity:'-2'},
  {...original.movements[1],signedQuantity:'2'}]);
 fail(forged,/UNBALANCED_COMMAND/);
});
test('063 forged historical entry revision after re-sealing is refused',()=>{
 const {facts}=fresh(),x=facts[3];
 const forged=sealed(x.command,[x.movements[0],{
  ...x.movements[1],accountBeforeVersion:8,accountAfterVersion:9}]);
 fail(forged,/STALE_AUTHORIZED_ACCOUNT_REVISION/);
});
test('063 tampered poststate balance and version never pass complete ledger reconstruction',()=>{
 const {readback}=fresh();
 const wrongBalance=mutable(readback);
 wrongBalance.accounts[0]={...wrongBalance.accounts[0],persistedQuantity:'4'};
 assert.throws(()=>verifyVersionedLedgerReadback(wrongBalance),
  /ACCOUNT_LEDGER_RECONSTRUCTION_MISMATCH/);
 const wrongRevision=mutable(readback);
 wrongRevision.accounts[0]={...wrongRevision.accounts[0],persistedVersion:7};
 assert.throws(()=>verifyVersionedLedgerReadback(wrongRevision),
  /ACCOUNT_VERSION|REVISION/);
});
test('063 changing full movement digest or audit fact while preserving two legs is rejected',()=>{
 const {facts}=fresh(),x=facts[3];
 assert.throws(()=>verifyVersionedImmutableFact({...x,
  movementSha256:'f'.repeat(64)}),/MOVEMENT_SEAL_MISMATCH/);
 assert.throws(()=>verifyVersionedImmutableFact({...x,
  auditCanonicalText:'forged-but-balanced'}),/IMMUTABLE_AUDIT_MISMATCH/);
});
