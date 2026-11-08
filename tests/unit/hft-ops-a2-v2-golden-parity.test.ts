/** Fixed independent Python vectors for OPS-A V2 length-prefixed bytes.
 * SQL functions use the same ordered fields, but have NOT been executed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {proposedOpsAPayload,opsAPayloadSha256,opsATestOnlyMac,
 OPS_A_POST_PROOF_V2,type OpsAProofFields}
 from '../../lib/hft/security/ops-a-versioned-invocation.ts';
import {OPS_A_EVIDENCE_V1,versionedAccountIdentityKey,
 versionedMovementDigest,versionedFactAuditText,verifyVersionedImmutableFact,
 type VersionedCommand,type StockAccountIdentity,type VersionedImmutableFact}
 from '../../lib/hft/persistence/ops-a-versioned-evidence.ts';

const cmd:VersionedCommand={
 commandId:'CMD1',idempotencyKey:'KEY1',kind:'RECEIVE',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',controlType:'NONE',
 serialNo:'',batchNo:'',requestQuantity:'2',sourceLeafId:'',
 destinationLeafId:'BIN1',expectedSourceAccountVersion:null,
 expectedDestinationAccountVersion:0,employeeId:'',originalIssueId:'',
 sourceDocumentId:'GRN1',sourceActionKey:'RECEIPT1',fragmentId:'',
 sourceRevision:1,approvalId:'APP1',approvalRevision:1,policyGeneration:5,
 approvedBy:'CHECKER1',actorSubject:'STORE1',inspectedCondition:'GOOD',
 inspectionEvidenceId:'QC1'
};
const account:StockAccountIdentity={
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',
 productVersion:'PV1',controlType:'NONE',serialNo:'',batchNo:'',
 leafLocationId:'BIN1',kind:'AVAILABLE',condition:'GOOD',custodianEmployeeId:''
};
const provisional:VersionedImmutableFact={
 schema:OPS_A_EVIDENCE_V1,command:cmd,
 ledgerEntryIds:['ENTRY-1','ENTRY-2'],
 movements:[
  {entryId:'ENTRY-1',commandId:'CMD1',bucket:'EXTERNAL',
   accountId:null,account:null,accountBeforeVersion:null,
   accountAfterVersion:null,signedQuantity:'-2'},
  {entryId:'ENTRY-2',commandId:'CMD1',bucket:'AVAILABLE',
   accountId:'ACCT1',account,accountBeforeVersion:0,
   accountAfterVersion:1,signedQuantity:'2'}
 ],movementSha256:'',auditCanonicalText:'',auditSha256:''
};
test('Python V2 payload SHA-256 and 8-field proof MAC match TypeScript byte-exact',()=>{
 const p=proposedOpsAPayload(cmd,'','ACCT1','a'.repeat(64));
 assert.equal(opsAPayloadSha256(p),
  '3a428034c3de3896c84eab58a31cd8b9cd7c9f39cd44ee232a2e6e90099b7e1f');
 const proof:OpsAProofFields={
  proofVersion:OPS_A_POST_PROOF_V2,actorSubject:'STORE1',
  sessionId:'SESSION1',payloadSha256:opsAPayloadSha256(p),
  issuedAt:'1750000000',expiresAt:'1750000040',
  nonce:'a'.repeat(48),keyVersion:'1'
 };
 assert.equal(opsATestOnlyMac(p,proof,new Uint8Array(32).fill(17)),
  'c2bf6c4dfbbf15874bb19df5f66d56a1e85cfb17a6f4aec30b0854a625a81927');
});
test('Independent Python versioned account, movement and audit digests match TS',()=>{
 assert.equal(versionedAccountIdentityKey(account),
  'c01fe8029aee913dd2bd6ad6c0c3ef3a943f0b544be2d99ce3bde2a15bfec40b');
 const movementSha256=versionedMovementDigest(provisional);
 assert.equal(movementSha256,
  '208ce574a5ef1c74e168c4cd06a2322c3be12522033bf83e9485781aebc51905');
 const auditCanonicalText=versionedFactAuditText(provisional);
 const auditSha256=createHash('sha256').update(auditCanonicalText,'utf8').digest('hex');
 assert.equal(auditSha256,'ae26f9b500df1c8f90497cd735251c21f13eca628e8cf184751b72ac049a7608');
 const checked={...provisional,movementSha256,auditCanonicalText,auditSha256};
 assert.doesNotThrow(()=>verifyVersionedImmutableFact(checked));
 assert.throws(()=>verifyVersionedImmutableFact({
  ...checked,movements:[{...checked.movements[0],signedQuantity:'-3'},checked.movements[1]]}),
  /UNBALANCED_COMMAND|MOVEMENT_SEAL_MISMATCH/);
});
