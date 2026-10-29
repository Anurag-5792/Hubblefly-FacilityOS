/** Pure synthetic P3 cryptographic contract tests; no real approval issued. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {lengthPrefixedUtf8} from '../../lib/hft/security/posting-invocation-proof.ts';
import {issueMasterReadProof,issueEmployeeDecisionProof,validateEmployeeDecision,
 readFields,decisionFields,masterReadDigest,employeeDecisionDigest}
 from '../../lib/hft/masters/p3-employee-proofs.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';

const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const key=Buffer.alloc(32,13);
const request={intent:'REVIEW_QUEUE' as const,kind:'EMPLOYEE' as const,...scope,search:''};
const decision={decisionVersion:'HFT-R1-P3-EMPLOYEE-DECISION-V1',
 requestId:'11111111-1111-4111-8111-111111111111',recordId:'EMP1',
 requestPayloadSha256:'a'.repeat(64),expectedVersion:'0',policyRevision:'1',
 decision:'APPROVED',evidenceSha256:'b'.repeat(64),
 reason:'Independent verified qualification',...scope};
test('read proof signs exact query, verified actor and expiry',()=>{
 const actor=verifiedFixtureOperator();
 const proof=issueMasterReadProof(request,actor,key,2,1700000000);
 assert.equal(proof.actorSubject,'STORE1');
 assert.equal(proof.sessionId,actor.sessionId);
 assert.equal(proof.payloadSha256,masterReadDigest(request));
 assert.equal(proof.expiresAt,'1700000040');
 assert.match(proof.macSha256,/^[0-9a-f]{64}$/);
 const independent=createHmac('sha256',key).update(lengthPrefixedUtf8([
  proof.proofVersion,proof.actorSubject,proof.sessionId,proof.payloadSha256,
  proof.issuedAt,proof.expiresAt,proof.nonce,proof.keyVersion])).digest('hex');
 assert.equal(proof.macSha256,independent);
});
test('read digest changes with site, warehouse, kind, search and query intent',()=>{
 const orig=masterReadDigest(request);
 for(const variant of [{...request,siteId:'SITE2'}, {...request,warehouseId:'WH2'},
  {...request,kind:'ITEM' as const,intent:'LIST' as const},
  {...request,search:'EMP1'}, {...request,intent:'REQUESTS' as const}]){
  assert.notEqual(masterReadDigest(variant),orig);
 }
 assert.equal(readFields(request)[0],'HFT-R1-P3-MASTER-READ-V1');
});
test('decision digest binds approved source, policy, evidence and action',()=>{
 const d=validateEmployeeDecision(decision);
 assert.equal(decisionFields(d).length,12);
 const orig=employeeDecisionDigest(d);
 for(const edit of [{decision:'DENIED'},{policyRevision:'2'},
  {expectedVersion:'1'},{requestPayloadSha256:'c'.repeat(64)},
  {evidenceSha256:'d'.repeat(64)},{reason:'Different independent reason'}]){
  const updated=validateEmployeeDecision({...decision,...edit});
  assert.notEqual(employeeDecisionDigest(updated),orig);
 }
 assert.equal(createHash('sha256').update(lengthPrefixedUtf8(decisionFields(d)))
  .digest('hex'),orig);
});
test('decision proof uses the existing verified session identity, not a second user',()=>{
 const actor=verifiedFixtureOperator();
 const d=validateEmployeeDecision(decision);
 const proof=issueEmployeeDecisionProof(d,actor,key,4,1700000000);
 assert.equal(proof.actorSubject,'STORE1');
 assert.equal(proof.payloadSha256,employeeDecisionDigest(d));
 assert.throws(()=>issueEmployeeDecisionProof(d,{...actor},key,4),
  /VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 assert.throws(()=>issueEmployeeDecisionProof(validateEmployeeDecision({...decision,siteId:'SITE2'}),
  actor,key,4),/SIGNED_SCOPE_DENIED/);
});
test('missing evidence, stale shape, extra role or malformed revision fail before signing',()=>{
 for(const bad of [{...decision,evidenceSha256:''},
  {...decision,policyRevision:'0'},
  {...decision,requestPayloadSha256:'not-a-sha256'},
  {...decision,decision:'SELF_APPROVED'},
  {...decision,role:'SUPERUSER'},
  {...decision,expectedVersion:'-1'}])
  assert.throws(()=>validateEmployeeDecision(bad));
 assert.throws(()=>issueEmployeeDecisionProof(validateEmployeeDecision(decision),
  verifiedFixtureOperator(),Buffer.alloc(8),1),/P3_PROOF_KEY_OR_CLOCK_UNAVAILABLE/);
});
