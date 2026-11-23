import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import {lengthPrefixedUtf8} from '../../lib/hft/security/posting-invocation-proof.ts';
import {issueReturnProof,assertSyntheticReturnProof,returnPayloadSha256,
 returnPayloadFields,OPS_A2_RETURN_PROOF_V1}
 from '../../lib/hft/security/ops-a2-return-proof.ts';
const op={contractVersion:'HFT-R1-OPS-A2-RETURN-PREPARE-V1',kind:'RETURN',
 requestId:'123e4567-e89b-42d3-a456-426614174000',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',controlType:'SERIAL',quantity:'1',
 uom:'PCS',serialNo:'SER1',batchNo:'',leafLocationId:'BIN2',
 employeeId:'EMP1',returnDocumentId:'A123E456-E89B-42D3-A456-426614174001',
 returnLineKey:'LINE1',originalIssueId:'123e4567-e89b-42d3-a456-426614174002',
 inspectionEvidenceId:'QC1',inspectedCondition:'GOOD'};
test('RETURN P0 V1 fixed-order digest matches independent Python u32BE UTF-8 vector',()=>{
 assert.equal(returnPayloadFields(op).length,20);
 assert.equal(returnPayloadSha256(op),
  '66e6a1f31b69c3e42c0bd0950f4d0558f10937ccd53b210d7c99405c2443e2bb');
});
test('RETURN HMAC authenticates actor, session, original ISSUE and nonce',()=>{
 const actor=verifiedFixtureOperator(),at=Math.floor(Date.now()/1000);
 const key=new Uint8Array(32).fill(9);
 const proof=issueReturnProof(op,actor,key,1,at,'ab'.repeat(24));
 assert.equal(proof.proofVersion,OPS_A2_RETURN_PROOF_V1);
 assert.equal(proof.payloadSha256,returnPayloadSha256(op));
 assertSyntheticReturnProof(op,proof,key,at);
 const independent=createHmac('sha256',key).update(lengthPrefixedUtf8([
  OPS_A2_RETURN_PROOF_V1,actor.subject,actor.sessionId,proof.payloadSha256,
  proof.issuedAt,proof.expiresAt,proof.nonce,proof.keyVersion
 ])).digest('hex');
 assert.equal(proof.macSha256,independent);
 for(const changed of [
  {...op,originalIssueId:'223e4567-e89b-42d3-a456-426614174002'},
  {...op,employeeId:'EMP2'},{...op,returnLineKey:'LINE2'},
  {...op,inspectedCondition:'DAMAGED'},{...op,leafLocationId:'BIN3'},
  {...op,productVersion:'PV2'}
 ])assert.throws(()=>assertSyntheticReturnProof(changed,proof,key,at));
 assert.throws(()=>assertSyntheticReturnProof(op,{...proof,macSha256:'0'.repeat(64)},key,at));
 assert.throws(()=>assertSyntheticReturnProof(op,proof,key,at+41));
 assert.throws(()=>assertSyntheticReturnProof(op,proof,new Uint8Array(32).fill(8),at));
});
