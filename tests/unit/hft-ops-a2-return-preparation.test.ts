import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOpsA2ReturnRequest,prepareOpsA2Return}
 from '../../lib/hft/stores/ops-a2-return-preparation.ts';
const sample={contractVersion:'HFT-R1-OPS-A2-RETURN-PREPARE-V1',kind:'RETURN',
 requestId:'123e4567-e89b-42d3-a456-426614174000',legalEntityId:'LE01',
 siteId:'S01',warehouseId:'WH01',itemCode:'ITEM01',productVersion:'V01',
 controlType:'SERIAL',quantity:'1',uom:'EA',serialNo:'SER01',batchNo:'',
 leafLocationId:'BIN01',employeeId:'EMP01',returnDocumentId:'A123E456-E89B-42D3-A456-426614174001',
 returnLineKey:'LINE01',originalIssueId:'123e4567-e89b-42d3-a456-426614174002',
 inspectionEvidenceId:'QC01',inspectedCondition:'GOOD'};
test('RETURN preflight is nonposting and never claims DB authority',()=>{
 const v=validateOpsA2ReturnRequest(sample);
 assert.equal(v.quantity,'1');
 const result=prepareOpsA2Return(sample);
 assert.equal(result.state,'VALIDATED_NOT_POSTED');
 assert.equal(result.durable,false);
 assert.equal(result.stockChanged,false);
 assert.equal(result.inspectionVerified,false);
 assert.equal(result.originalIssueVerified,false);
});
test('RETURN rejects forged keys and identity switches',()=>{
 for(const bad of [
  {...sample,approvedBy:'SELF'}, {...sample,kind:'OUT'},
  {...sample,contractVersion:'HFT-R1-STORES-P0-PREPARE-V1'},
  {...sample,requestId:'not-a-uuid'},
  {...sample,returnDocumentId:'RET01'},
  {...sample,returnDocumentId:'a123e456-e89b-42d3-a456-426614174001'},
  {...sample,originalIssueId:'ISSUE01'}, {...sample,originalIssueId:''},
  {...sample,inspectionEvidenceId:''}, {...sample,quantity:'-1'},
  {...sample,quantity:'2'}, {...sample,serialNo:'',batchNo:'LOT01'},
  {...sample,inspectedCondition:'NOT_INSPECTED'},
  {...sample,employeeId:'OTHER ENTITY'}
 ])assert.throws(()=>validateOpsA2ReturnRequest(bad));
});
test('RETURN permits explicit batch or untracked only with compatible traceability',()=>{
 const batch={...sample,controlType:'BATCH',serialNo:'',batchNo:'LOT01',quantity:'2.500000'};
 assert.equal(validateOpsA2ReturnRequest(batch).quantity,'2.5');
 assert.equal(validateOpsA2ReturnRequest({...batch,controlType:'NONE',batchNo:''}).quantity,'2.5');
});
