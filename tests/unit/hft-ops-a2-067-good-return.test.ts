/** 067 GOOD RETURN leaf correction: synthetic source fact, not PG COMMIT proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OPS_A_EVIDENCE_V1,verifyVersionedImmutableFact,
 versionedMovementDigest,versionedFactAuditText,
 type VersionedCommand,type VersionedImmutableFact,type VersionedLedgerEntry,
 type StockAccountIdentity} from '../../lib/hft/persistence/ops-a-versioned-evidence.ts';

const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',controlType:'NONE' as const,
 serialNo:'',batchNo:''};
const identity=(leaf:string,kind:'AVAILABLE'|'CUSTODY'|'DAMAGED'|'QUARANTINE',
 employee=''):StockAccountIdentity=>({...scope,leafLocationId:leaf,kind,
  condition:kind==='DAMAGED'?'DAMAGED':kind==='QUARANTINE'?'QUARANTINE':'GOOD',
  custodianEmployeeId:employee});
const command:VersionedCommand={...scope,kind:'RETURN',
 commandId:'RET-CMD1',idempotencyKey:'RET-NONCE1',
 sourceDocumentId:'RETURN-DOC1',sourceActionKey:'LINE1',fragmentId:'LINE1',
 sourceRevision:1,approvalId:'APP1',approvalRevision:1,policyGeneration:1,
 actorSubject:'STORE1',approvedBy:'APPROVER1',requestQuantity:'1',
 sourceLeafId:'BIN01',destinationLeafId:'BIN02',
 expectedSourceAccountVersion:1,expectedDestinationAccountVersion:0,
 employeeId:'EMP01',originalIssueId:'ISSUE-CMD1',
 inspectedCondition:'GOOD',inspectionEvidenceId:'QC-INSPECT1'};
const source:VersionedLedgerEntry={
 entryId:'ENTRY-100',commandId:command.commandId,accountId:'ACC-CUST',
 account:identity('BIN01','CUSTODY','EMP01'),bucket:'CUSTODY',
 accountBeforeVersion:1,accountAfterVersion:2,signedQuantity:'-1'};
const destination:VersionedLedgerEntry={
 entryId:'ENTRY-101',commandId:command.commandId,accountId:'ACC-AVAIL',
 account:identity('BIN02','AVAILABLE'),bucket:'AVAILABLE',
 accountBeforeVersion:0,accountAfterVersion:1,signedQuantity:'1'};
function sealed(c:VersionedCommand,legs:readonly VersionedLedgerEntry[]){
 const base:VersionedImmutableFact={schema:OPS_A_EVIDENCE_V1,
  command:c,movements:legs,ledgerEntryIds:legs.map(x=>x.entryId),
  movementSha256:'',auditCanonicalText:'',auditSha256:''};
 const auditCanonicalText=versionedFactAuditText(base);
 return {...base,movementSha256:versionedMovementDigest(base),auditCanonicalText,
  auditSha256:createHash('sha256').update(auditCanonicalText).digest('hex')};
}
test('GOOD inspected RETURN from employee BIN01 custody to BIN02 available is valid',()=>{
 const proof=sealed(command,[source,destination]);
 assert.doesNotThrow(()=>verifyVersionedImmutableFact(proof));
 assert.equal(proof.command.originalIssueId,'ISSUE-CMD1');
 assert.equal(proof.movements[0].account?.leafLocationId,'BIN01');
 assert.equal(proof.movements[1].account?.leafLocationId,'BIN02');
});
test('wrong location, different AVAILABLE, forgery, ISSUE, condition and revision deny',()=>{
 const cases:[
  VersionedCommand,readonly VersionedLedgerEntry[],RegExp
 ][]=[
  [command,[source,{...destination,account:identity('BIN03','AVAILABLE')}],
   /RETURN_CUSTODY_INSPECTION_INVALID/],
  [command,[source,{...destination,account:{...destination.account!,kind:'CUSTODY'}}],
   /ENTRY_BUCKET_ACCOUNT_MISMATCH|CUSTODIAN_INVALID/],
  [command,[source,{...destination,bucket:'CUSTODY'}],
   /ENTRY_BUCKET_ACCOUNT_MISMATCH/],
  [{...command,originalIssueId:''},[source,destination],
   /RETURN_CUSTODY_INSPECTION_INVALID|ORIGINALISSUEID/],
  [{...command,inspectedCondition:'DAMAGED'},[source,destination],
   /RETURN_CUSTODY_INSPECTION_INVALID/],
  [{...command,inspectedCondition:'QUARANTINE'},[source,destination],
   /RETURN_CUSTODY_INSPECTION_INVALID/],
  [{...command,expectedDestinationAccountVersion:1},[source,destination],
   /STALE_AUTHORIZED_ACCOUNT_REVISION/],
  [command,[{...source,signedQuantity:'-2'},destination],
   /UNBALANCED_COMMAND/]
 ];
 for(const [cmd,legs,reason] of cases){
  assert.throws(()=>verifyVersionedImmutableFact(sealed(cmd,legs)),reason);
 }
});
test('DAMAGED and QUARANTINE credits may not masquerade as GOOD AVAILABLE',()=>{
 for(const kind of ['DAMAGED','QUARANTINE'] as const){
  const c={...command,inspectedCondition:kind};
  const correct={...destination,bucket:kind,account:identity('BIN02',kind)};
  assert.doesNotThrow(()=>verifyVersionedImmutableFact(sealed(c,[source,correct])));
  assert.throws(()=>verifyVersionedImmutableFact(sealed(c,[source,destination])),
   /RETURN_CUSTODY_INSPECTION_INVALID/);
 }
});
