import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReturnP2Source,type ProtectedReturnResolution}
 from '../../lib/hft/persistence/ops-a2-return-source.ts';
const request={
 contractVersion:'HFT-R1-OPS-A2-RETURN-PREPARE-V1',kind:'RETURN',
 requestId:'123e4567-e89b-42d3-a456-426614174000',
 legalEntityId:'LE01',siteId:'S01',warehouseId:'WH01',itemCode:'ITEM01',
 productVersion:'V01',controlType:'SERIAL',quantity:'1',uom:'EA',
 serialNo:'SER01',batchNo:'',leafLocationId:'BIN02',employeeId:'EMP01',
 returnDocumentId:'RET01',returnLineKey:'LINE01',originalIssueId:'ISSUE01',
 inspectionEvidenceId:'QC01',inspectedCondition:'GOOD'
} as const;
const resolved:ProtectedReturnResolution={
 issuer:'HFT_P2_PROTECTED_DATABASE',state:'OPS_A2_AUTHORIZED_SOURCE_V2',
 sourceAccountId:'ACCOUNT01',destinationAccountId:'ACCOUNT02',
 approvedPayloadSha256:'a'.repeat(64),
 command:{commandId:request.requestId,idempotencyKey:request.requestId,kind:'RETURN',
  legalEntityId:request.legalEntityId,siteId:request.siteId,warehouseId:request.warehouseId,
  itemCode:request.itemCode,productVersion:request.productVersion,
  controlType:'SERIAL',serialNo:request.serialNo,batchNo:'',
  requestQuantity:'1',sourceLeafId:'BIN01',destinationLeafId:'BIN02',
  expectedSourceAccountVersion:1,expectedDestinationAccountVersion:2,
  employeeId:'EMP01',originalIssueId:'ISSUE01',sourceDocumentId:'RET01',
  sourceActionKey:'LINE01',fragmentId:'LINE01',sourceRevision:1,
  approvalId:'APP01',approvalRevision:1,policyGeneration:1,
  approvedBy:'CHECKER01',actorSubject:'OPERATOR01',
  inspectedCondition:'GOOD',inspectionEvidenceId:'QC01'}
};
test('RETURN protected resolver mapping produces a V2 custody command, not a post',()=>{
 const p=verifyReturnP2Source(request,resolved);
 assert.equal(p.kind,'RETURN');assert.equal(p.originalIssueId,'ISSUE01');
 assert.equal(p.sourceLeafId,'BIN01');assert.equal(p.destinationLeafId,'BIN02');
 assert.equal(p.sourceAccountBeforeVersion,'1');
 assert.equal(p.destinationAccountBeforeVersion,'2');
 assert.equal(p.approvedPayloadSha256,'a'.repeat(64));
 assert.equal(p.quantityMicro,'1000000');
});
test('RETURN exact source, custody, inspection, revision and maker-checker mismatches deny',()=>{
 const changes=[
  {request:{...request,employeeId:'EMP02'}},
  {request:{...request,originalIssueId:'ISSUE02'}},
  {request:{...request,returnLineKey:'LINE02'}},
  {request:{...request,leafLocationId:'BIN03'}},
  {request:{...request,inspectionEvidenceId:'QC02'}},
  {request:{...request,productVersion:'V02'}},
  {resolved:{...resolved,issuer:'FAKE'}},
  {resolved:{...resolved,sourceAccountId:'ACCOUNT02'}},
  {resolved:{...resolved,command:{...resolved.command,approvedBy:'OPERATOR01'}}},
  {resolved:{...resolved,command:{...resolved.command,expectedSourceAccountVersion:null}}},
  {resolved:{...resolved,command:{...resolved.command,expectedDestinationAccountVersion:null}}},
  {resolved:{...resolved,command:{...resolved.command,inspectedCondition:'DAMAGED'}}}
 ];
 for(const c of changes)assert.throws(()=>verifyReturnP2Source(
  c.request??request,(c.resolved??resolved) as ProtectedReturnResolution));
});
