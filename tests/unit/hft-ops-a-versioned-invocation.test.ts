/** OPS-A prospective P2 V2 source-only codec; ephemeral synthetic HMAC keys.
 * No API, SQL, IAM or production proof is created by these tests.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lengthPrefixedUtf8} from '../../lib/hft/security/posting-invocation-proof.ts';
import {OPS_A_POST_V2,OPS_A_POST_PROOF_V2,OPS_A_PAYLOAD_FIELDS,
 canonicalOpsAPayloadFields,proposedOpsAPayload,opsAPayloadSha256,
 opsATestOnlyMac,verifyOpsATestVector,type OpsAPayload,
 type OpsAProofFields} from '../../lib/hft/security/ops-a-versioned-invocation.ts';
import type {VersionedCommand} from '../../lib/hft/persistence/ops-a-versioned-evidence.ts';
const approval='a'.repeat(64);
const key=new Uint8Array(32).fill(17);
const base:VersionedCommand={
 commandId:'CMD1',idempotencyKey:'KEY1',kind:'RECEIVE',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',
 productVersion:'PV1',controlType:'NONE',serialNo:'',batchNo:'',
 sourceDocumentId:'GRN1',sourceActionKey:'RECEIPT1',fragmentId:'',
 sourceRevision:1,approvalId:'APP1',approvalRevision:1,policyGeneration:5,
 actorSubject:'STORE1',approvedBy:'CHECKER1',
 requestQuantity:'2',sourceLeafId:'',destinationLeafId:'BIN1',
 expectedSourceAccountVersion:null,expectedDestinationAccountVersion:0,
 employeeId:'',originalIssueId:'',inspectedCondition:'GOOD',
 inspectionEvidenceId:'QC1'
};
const issued=(c:Partial<VersionedCommand>={},
 from='',to='ACCT1')=>proposedOpsAPayload({...base,...c},from,to,approval);
const proofFields=(p:OpsAPayload):OpsAProofFields=>({
 proofVersion:OPS_A_POST_PROOF_V2,actorSubject:p.actorSubject,
 sessionId:'SESSION1',payloadSha256:opsAPayloadSha256(p),
 issuedAt:'1750000000',expiresAt:'1750000040',
 nonce:'a'.repeat(48),keyVersion:'1'
});
test('OPS-A proposed signed V2 has exactly 33 separately ordered string fields',()=>{
 const p=issued();
 assert.equal(OPS_A_PAYLOAD_FIELDS.length,33);
 assert.equal(Object.keys(p).length,OPS_A_PAYLOAD_FIELDS.length);
 assert.deepEqual(canonicalOpsAPayloadFields(p),
  OPS_A_PAYLOAD_FIELDS.map(k=>p[k]));
 assert.equal(p.contractVersion,OPS_A_POST_V2);
 assert.equal(p.quantityMicro,'2000000');
 assert.equal(p.productVersion,'PV1');
 assert.equal(p.sourceAccountBeforeVersion,'');
 assert.equal(p.destinationAccountBeforeVersion,'0');
});
test('OPS-A payload binds product version, location and serial/batch without alternative ledger',()=>{
 const first=issued();
 for(const change of [
  {productVersion:'PV2'},
  {destinationLeafId:'BIN2'},
  {legalEntityId:'DDL'},
  {warehouseId:'WH2'},
  {siteId:'SITE2'},
  {sourceDocumentId:'GRN2'},
  {sourceActionKey:'RECEIPT2'},
  {approvalRevision:2},
  {policyGeneration:6},
  {quantityMicro:'2000001'},
 ]){
  const varied={...first,...change} as OpsAPayload;
  assert.notEqual(opsAPayloadSha256(varied),opsAPayloadSha256(first));
 }
});
test('OPS-A transfer has one version and two distinct signed account/revision identities',()=>{
 const p=issued({kind:'TRANSFER',sourceLeafId:'BIN1',destinationLeafId:'BIN2',
  fragmentId:'LINE1',sourceDocumentId:'MOVE1',sourceActionKey:'MOVE1',
  requestQuantity:'1',expectedSourceAccountVersion:4,
  expectedDestinationAccountVersion:0,inspectionEvidenceId:''},
  'SOURCEACCT','DESTACCT');
 assert.equal(p.kind,'TRANSFER');
 assert.equal(p.sourceAccountBeforeVersion,'4');
 assert.equal(p.destinationAccountBeforeVersion,'0');
 assert.equal(p.sourceLeafId,'BIN1');
 assert.equal(p.destinationLeafId,'BIN2');
 for(const change of [
  {sourceAccountBeforeVersion:'3'},
  {destinationAccountBeforeVersion:'1'},
  {sourceAccountId:'ANOTHER'},
  {destinationAccountId:'ANOTHER'},
 ]){
  assert.notEqual(opsAPayloadSha256({...p,...change}),opsAPayloadSha256(p));
 }
});
test('OPS-A V2 source-only HMAC reference matches raw length-prefixed SHA-256 bytes',()=>{
 const p=issued();
 const digest=createHash('sha256').update(lengthPrefixedUtf8(
  OPS_A_PAYLOAD_FIELDS.map(k=>p[k]))).digest('hex');
 assert.equal(opsAPayloadSha256(p),digest);
 assert.match(digest,/^[0-9a-f]{64}$/);
});
test('OPS-A valid generated TEST-ONLY HMAC vector passes but has no runtime issuer',()=>{
 const p=issued(),fields=proofFields(p);
 const macSha256=opsATestOnlyMac(p,fields,key);
 assert.match(macSha256,/^[0-9a-f]{64}$/);
 verifyOpsATestVector(p,{...fields,macSha256},key,1750000001);
});
test('OPS-A invalid MAC, wrong key or changed payload cannot validate test proof',()=>{
 const p=issued(),fields=proofFields(p),macSha256=opsATestOnlyMac(p,fields,key);
 assert.throws(()=>verifyOpsATestVector(p,{...fields,macSha256:'f'.repeat(64)},
  key,1750000001),/TEST_MAC_INVALID/);
 assert.throws(()=>verifyOpsATestVector(p,{...fields,macSha256},
  new Uint8Array(32).fill(18),1750000001),/TEST_MAC_INVALID/);
 const changed=issued({productVersion:'PV2'});
 assert.throws(()=>verifyOpsATestVector(changed,{...fields,macSha256},
  key,1750000001),/PROOF_BINDING_INVALID/);
});
test('OPS-A replay/expired/future proof and unqualified keys denied',()=>{
 const p=issued(),fields=proofFields(p),macSha256=opsATestOnlyMac(p,fields,key);
 assert.throws(()=>verifyOpsATestVector(p,{...fields,macSha256},
  key,1750000050),/EXPIRED_OR_FUTURE/);
 assert.throws(()=>verifyOpsATestVector(p,{...fields,macSha256},
  key,1749999900),/EXPIRED_OR_FUTURE/);
 assert.throws(()=>opsATestOnlyMac(p,fields,new Uint8Array(3)),
  /KEY_NOT_QUALIFIED/);
 const excessive={...fields,expiresAt:'1750001200'};
 assert.throws(()=>opsATestOnlyMac(p,excessive,key),/PROOF_LIFETIME_INVALID/);
});
test('OPS-A unknown/wildcard/missing payload fields rejected, never forward-compatible by default',()=>{
 const p=issued();
 assert.throws(()=>canonicalOpsAPayloadFields({...p,admin:'*'} as OpsAPayload),
  /PAYLOAD_EXACT_KEYS_REQUIRED/);
 const missing={...p} as Record<string,unknown>;delete missing.productVersion;
 assert.throws(()=>canonicalOpsAPayloadFields(missing as OpsAPayload),
  /PAYLOAD_EXACT_KEYS_REQUIRED/);
 const legacy={...p,contractVersion:'HFT_STOCK_POST_V1'};
 assert.throws(()=>canonicalOpsAPayloadFields(legacy as OpsAPayload),/ACTION_INVALID/);
});
test('OPS-A protected application action never self-approves',()=>{
 assert.throws(()=>issued({approvedBy:'STORE1'}),/SELF_APPROVAL_DENIED/);
});
test('OPS-A serialized stock binds one unit and exact serial without lot',()=>{
 const serial=issued({controlType:'SERIAL',serialNo:'SER1',requestQuantity:'1'});
 assert.equal(serial.quantityMicro,'1000000');
 assert.throws(()=>issued({controlType:'SERIAL',serialNo:'SER1',requestQuantity:'2'}),
  /SERIAL_UNIT_REQUIRED/);
 assert.throws(()=>issued({controlType:'SERIAL',serialNo:'SER1',batchNo:'LOT1'}),
  /TRACEABILITY_INVALID/);
});
test('OPS-A invalid external source, missing destination, same-account and no transfer reason identity denied',()=>{
 assert.throws(()=>issued({expectedSourceAccountVersion:1}),/SOURCE_ACCOUNT_REQUIRED|RECEIPT_EVIDENCE_INVALID/);
 assert.throws(()=>issued({destinationLeafId:''}),/RECEIPT_EVIDENCE_INVALID/);
 assert.throws(()=>issued({kind:'TRANSFER',sourceLeafId:'BIN1',
  destinationLeafId:'BIN1',fragmentId:'FRAG1',expectedSourceAccountVersion:1},
  'ACCOUNT1','ACCOUNT2'),/TRANSFER_SCOPE_INVALID/);
 assert.throws(()=>issued({kind:'TRANSFER',sourceLeafId:'BIN1',
  destinationLeafId:'BIN2',fragmentId:'FRAG1',expectedSourceAccountVersion:1},
  'ACCOUNT1','ACCOUNT1'),/IDENTICAL_ACCOUNTS_DENIED/);
});
test('OPS-A employee issue and independently inspected return source fields validated',()=>{
 const issue=issued({kind:'ISSUE',sourceLeafId:'BIN1',destinationLeafId:'',
  employeeId:'EMP1',fragmentId:'FRAG1',inspectionEvidenceId:'',
  expectedSourceAccountVersion:2},'SOURCEACCT','CUSTACCT');
 assert.equal(issue.employeeId,'EMP1');
 assert.throws(()=>issued({kind:'ISSUE',sourceLeafId:'BIN1',employeeId:'',
  fragmentId:'FRAG1',expectedSourceAccountVersion:2},
  'SOURCEACCT','CUSTACCT'),/ISSUE_SCOPE_INVALID/);
 const returned=issued({kind:'RETURN',sourceLeafId:'BIN1',
  destinationLeafId:'BIN1',employeeId:'EMP1',originalIssueId:'ISS1',
  fragmentId:'RET1',inspectedCondition:'DAMAGED',
  inspectionEvidenceId:'QC-RETURN',expectedSourceAccountVersion:1,
  expectedDestinationAccountVersion:3},'CUSTACCT','DAMAGEDACCT');
 assert.equal(returned.inspectedCondition,'DAMAGED');
 assert.throws(()=>issued({kind:'RETURN',sourceLeafId:'BIN1',
  destinationLeafId:'BIN1',employeeId:'EMP1',originalIssueId:'',
  fragmentId:'RET1',inspectedCondition:'GOOD',
  inspectionEvidenceId:'QC-RETURN',expectedSourceAccountVersion:1},
  'CUSTACCT','AVAILABLEACCT'),/RETURN_INSPECTION_INVALID/);
});
