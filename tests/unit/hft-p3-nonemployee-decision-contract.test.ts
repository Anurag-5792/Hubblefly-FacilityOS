import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNonEmployeeDecision,nonEmployeeDecisionFields,
 nonEmployeeDecisionDigest,issueNonEmployeeDecisionProof,
 NONEMPLOYEE_DECISION_FIELDS,NONEMPLOYEE_KINDS}
 from '../../lib/hft/masters/p3-nonemployee-decision-proofs.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
const base={decisionVersion:'HFT-R1-P3-NONEMPLOYEE-DECISION-V1',
 kind:'SUPPLIER',requestId:'11111111-1111-4111-8111-111111111111',
 requestPayloadSha256:'a'.repeat(64),recordId:'SUP001',
 expectedVersion:'0',policyRevision:'1',decision:'APPROVED',
 evidenceSha256:'b'.repeat(64),reason:'Independent original supplier evidence',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
test('nonemployee source contract covers exactly four kinds, not Employee',()=>{
 assert.deepEqual(NONEMPLOYEE_KINDS,['ITEM','SUPPLIER','WAREHOUSE','LOCATION']);
 assert.equal(NONEMPLOYEE_DECISION_FIELDS.length,13);
 for(const kind of NONEMPLOYEE_KINDS){
  const d=validateNonEmployeeDecision({...base,kind});
  assert.equal(nonEmployeeDecisionFields(d)[1],kind);
  assert.match(nonEmployeeDecisionDigest(d),/^[a-f0-9]{64}$/);
 }
 assert.throws(()=>validateNonEmployeeDecision({...base,kind:'EMPLOYEE'}));
});
test('nonemployee proof is domain-separated and scoped to verified signed session',()=>{
 const d=validateNonEmployeeDecision(base);
 const proof=issueNonEmployeeDecisionProof(d,verifiedFixtureOperator(),
  Buffer.alloc(32,11),1,1700000000);
 assert.equal(proof.proofVersion,'HFT-R1-P3-NONEMPLOYEE-DECISION-HMAC-V1');
 assert.equal(proof.actorSubject,'STORE1');
 assert.equal(proof.payloadSha256,nonEmployeeDecisionDigest(d));
 assert.equal(proof.expiresAt,'1700000040');
 assert.match(proof.nonce,/^[a-f0-9]{48}$/);
 assert.match(proof.macSha256,/^[a-f0-9]{64}$/);
});
test('forged principal and cross-site approval are rejected before proof issuance',()=>{
 const operator=verifiedFixtureOperator();
 const d=validateNonEmployeeDecision(base);
 assert.throws(()=>issueNonEmployeeDecisionProof(d,{...operator},Buffer.alloc(32,11),1),
  /VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 assert.throws(()=>issueNonEmployeeDecisionProof(
  validateNonEmployeeDecision({...base,siteId:'SITE2'}),operator,
  Buffer.alloc(32,11),1),/SIGNED_SCOPE_DENIED/);
});
test('rejects extra field, missing original evidence and invalid revisions',()=>{
 for(const bad of [
  {...base,active:true},{...base,requestPayloadSha256:'bad'},
  {...base,evidenceSha256:'0'},{...base,policyRevision:'0'},
  {...base,reason:'short'},{...base,recordId:'bad lowercase'},
  {...base,decision:'AUTO_APPLY'},{...base,requestId:'wrong'}])
  assert.throws(()=>validateNonEmployeeDecision(bad));
});
test('nonemployee signed decision cannot silently mutate the Employee SQL protocol',()=>{
 const d=validateNonEmployeeDecision(base);
 assert.notEqual(nonEmployeeDecisionDigest(d),
  nonEmployeeDecisionDigest(validateNonEmployeeDecision({...base,kind:'ITEM'})));
 assert.throws(()=>validateNonEmployeeDecision({
  ...base,decisionVersion:'HFT-R1-P3-EMPLOYEE-DECISION-V1'}));
});
