import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvedPayloadDigest,assertBoundApproval,type ApprovalScope} from '../../lib/hft/security/approval-binding.ts';
const original:ApprovalScope={documentType:'ISSUE',action:'ISSUE',documentId:'ISSUE-001',documentRevision:5,
 sourceActionKey:'ISSUE-LINE-001',legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',locationId:'LOC1',batchNo:'',serialNo:'',quantityMicro:'2000000',
 actorSubject:'STORE1',approverSubject:'APPROVER2',policyGeneration:7,
 inspectionCondition:'',inspectionEvidenceId:''};
const a={approvalId:'APPR-001',revision:3,approved:true,revoked:false,approvedPayloadSha256:approvedPayloadDigest(original),scope:original};
const ctx={source:original,currentPolicyGeneration:7,blockingHoldIds:[],actorGrantActive:true,verifiedActorSubject:'STORE1'};
test('unchanged approved issue of 2 succeeds',()=>assert.doesNotThrow(()=>assertBoundApproval(original,a,ctx)));
test('increase approved issue from 2 to 4 rejects replayed approval',()=>{
 assert.throws(()=>assertBoundApproval({...original,quantityMicro:'4000000'},a,ctx),/APPROVAL_DOCUMENT_REVISION_OR_PAYLOAD_CHANGED/);
});
test('protected source revision change invalidates approval',()=>{
 assert.throws(()=>assertBoundApproval(original,a,{...ctx,source:{...original,documentRevision:6}}),/APPROVAL_DOCUMENT_REVISION_OR_PAYLOAD_CHANGED/);
});
test('different item and warehouse both rejected',()=>{
 for(const c of [{...original,itemCode:'ITEM2'},{...original,warehouseId:'WH2'}])
  assert.throws(()=>assertBoundApproval(c,a,ctx),/APPROVAL_DOCUMENT_REVISION_OR_PAYLOAD_CHANGED/);
});
test('policy generation or live Hold cannot use older approval',()=>{
 assert.throws(()=>assertBoundApproval(original,a,{...ctx,currentPolicyGeneration:8}),/POSTING_POLICY_GENERATION_STALE/);
 assert.throws(()=>assertBoundApproval(original,a,{...ctx,blockingHoldIds:['HOLD1']}),/POSTING_POLICY_OR_HOLD_BLOCKED/);
});
test('forged actor, revoked approval and invalid digest fail closed',()=>{
 assert.throws(()=>assertBoundApproval(original,a,{...ctx,verifiedActorSubject:'FORGED'}),/POSTING_ACTOR_BINDING_FAILED/);
 assert.throws(()=>assertBoundApproval(original,{...a,revoked:true},ctx),/BOUND_APPROVAL_REQUIRED/);
 assert.throws(()=>assertBoundApproval(original,{...a,approvedPayloadSha256:'0'.repeat(64)},ctx),/APPROVAL_CANONICAL_DIGEST_MISMATCH/);
});
