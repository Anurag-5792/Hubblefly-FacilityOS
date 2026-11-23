import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {INVOCATION_V1, canonicalPayloadFields, canonicalInvocationFields,
  protectedPayloadSha256,computeInvocationMac,lengthPrefixedUtf8,
  verifyInvocationTestVector,type ProtectedPostingPayload,type InvocationProofFields
} from '../../lib/hft/security/posting-invocation-proof.ts';
// Public synthetic fixture is not a production signing credential.
const key=Buffer.from('HFT-ONLY-TEST-KEY-UNUSABLE-FOR-REAL-SIGNING-2026');
const payload:ProtectedPostingPayload={
  contractVersion:'HFT_STOCK_POST_V1', commandId:'CMD-ISS-101',idempotencyKey:'IDEM-101',
  kind:'ISSUE', legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',
  locationId:'LOC1',batchNo:'',serialNo:'',condition:'GOOD',employeeId:'EMP1',
  originalIssueId:'',sourceDocumentId:'DOC-ISS-1',sourceActionKey:'LINE-1',
  fragmentId:'PART-A',quantityMicro:'2000000',sourceRevision:'7',approvalId:'APR-1',
  approvalRevision:'1',policyGeneration:'4',expectedBalanceVersion:'2',
  approvedPayloadSha256:'a'.repeat(64),inspectionEvidenceId:''
};
const proofFields:InvocationProofFields={proofVersion:INVOCATION_V1,
  actorSubject:'STORE1',sessionId:'SESSION-1',payloadSha256:protectedPayloadSha256(payload),
  issuedAt:'1793145600',expiresAt:'1793145660',nonce:'ab'.repeat(24),keyVersion:'3'};
test('length-prefix byte encoding is exact and ignores property key insertion order',()=>{
  const a=protectedPayloadSha256(payload);
  const b=protectedPayloadSha256(Object.fromEntries(Object.entries(payload).reverse()) as ProtectedPostingPayload);
  assert.equal(a,b);
  const bytes=lengthPrefixedUtf8(['A','λ']);
  assert.equal(bytes.toString('hex'),'000000014100000002cebb');
  assert.equal(createHash('sha256').update(lengthPrefixedUtf8(canonicalPayloadFields(payload))).digest('hex'),a);
});
test('HMAC invocation proof roundtrips and verifies the same ordered fields',()=>{
  const macSha256=computeInvocationMac(payload,proofFields,key);
  assert.equal(proofFields.payloadSha256,'f47bb860e5f36f6f4dd75cdaf22498c204f3279263a56e0c03c2e0a0b493174c');
  assert.equal(macSha256,'590eb06f5751d01cc0b6c07143f8bd9f99c38484c20149a5f10d71b20530eccb');
  assert.equal(canonicalInvocationFields(payload,proofFields).length,19);
  assert.doesNotThrow(()=>verifyInvocationTestVector(payload,{...proofFields,macSha256},key,1793145630));
});
test('tampering amount, action, source, fragment, entity or revision invalidates proof',()=>{
  const macSha256=computeInvocationMac(payload,proofFields,key);
  const proof={...proofFields,macSha256};
  for(const changed of [
    {...payload,quantityMicro:'4000000'}, {...payload,kind:'RETURN'},
    {...payload,sourceDocumentId:'FORGED'}, {...payload,fragmentId:'PART-B'},
    {...payload,warehouseId:'WH2'}, {...payload,sourceRevision:'8'},
    {...payload,approvedPayloadSha256:'b'.repeat(64)}
  ] as ProtectedPostingPayload[]){
    assert.throws(()=>verifyInvocationTestVector(changed,proof,key,1793145630),
      /INVOCATION_PAYLOAD_BINDING_INVALID|RETURN_SOURCE_INSPECTION_REQUIRED/);
  }
});
test('modified subject, session, nonce, key version or HMAC rejected',()=>{
  const macSha256=computeInvocationMac(payload,proofFields,key);
  for(const field of [
    {actorSubject:'FORGER'}, {sessionId:'DIFFERENT'}, {nonce:'cd'.repeat(24)},
    {keyVersion:'4'}
  ]){
    assert.throws(()=>verifyInvocationTestVector(payload,{...proofFields,...field,macSha256},key,1793145630),
      /INVOCATION_MAC_INVALID/);
  }
  assert.throws(()=>verifyInvocationTestVector(payload,{...proofFields,macSha256:'0'.repeat(64)},key,1793145630),/INVOCATION_MAC_INVALID/);
});
test('expired proof, future issue and oversized lifetime rejected',()=>{
  const macSha256=computeInvocationMac(payload,proofFields,key);
  assert.throws(()=>verifyInvocationTestVector(payload,{...proofFields,macSha256},key,1793145660),/INVOCATION_EXPIRED_OR_FUTURE/);
  assert.throws(()=>verifyInvocationTestVector(payload,{...proofFields,macSha256},key,1793145500),/INVOCATION_EXPIRED_OR_FUTURE/);
  assert.throws(()=>computeInvocationMac(payload,{...proofFields,expiresAt:'1793145700'},key),/INVOCATION_LIFETIME_INVALID/);
});
test('integer, amount, field and separator normalization reject ambiguity',()=>{
  const bad=[{...payload,quantityMicro:'02000000'}, {...payload,quantityMicro:'2.0'},
    {...payload,sourceRevision:'07'}, {...payload,sourceDocumentId:'x|admin'},
    {...payload,fragmentId:''}, {...payload,inspectionEvidenceId:'A|B'}];
  for(const x of bad){assert.throws(()=>protectedPayloadSha256(x as ProtectedPostingPayload));}
  assert.throws(()=>lengthPrefixedUtf8(['x'.repeat(70000)]),/MAC_FIELD_TOO_LARGE/);
});
