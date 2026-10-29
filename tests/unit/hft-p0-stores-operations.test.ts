import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareP0Nonposting,validateP0Operation,type P0Kind} from '../../lib/hft/stores/p0-operations.ts';
const base={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1',
 requestId:'11111111-1111-4111-8111-111111111111',legalEntityId:'HFT',
 siteId:'SITE1',warehouseId:'WH1',itemCode:'MTR100',productVersion:'V1',
 controlType:'NONE',quantity:'5',uom:'PCS',serialNo:'',batchNo:''} as const;
function op(kind:P0Kind):Record<string,unknown>{
 if(kind==='IN')return {...base,kind,leafLocationId:'BN04',grnId:'GRN1',receiptKey:'REC1',
  supplierId:'SUP1',invoiceNumber:'INV-123',qcState:'ACCEPTED',qcEvidenceId:'EVID1'};
 if(kind==='OUT')return {...base,kind,quantity:'2',leafLocationId:'BN04',employeeId:'EMP1',
  workOrderId:'',issueDocumentId:'ISSUE1',fragmentId:'FRAG1',purpose:'Assembly manufacturing material'};
 if(kind==='COUNT')return {...base,kind,quantity:'3',leafLocationId:'BN04',sessionId:'COUNT1',
  stockEpoch:'EPOCH1',lineId:'LINE1',condition:'GOOD',inventoryState:'LOOSE',evidenceId:'EVID1'};
 return {...base,kind,sourceLeafId:'BN04',destinationLeafId:'BN05',
  transferDocumentId:'MOVE1',reason:'Authorized bin reorganization'};
}
const rejects=(value:unknown,code:string)=>assert.throws(()=>validateP0Operation(value),new RegExp(code));
for(const kind of ['IN','OUT','COUNT','TRANSFER'] as const){
 test(`${kind} is strictly validated, never persisted or authorized by preparation`,()=>{
  const request=op(kind),valid=validateP0Operation(request),p=prepareP0Nonposting(request);
  assert.equal(valid.kind,kind);assert.equal(p.kind,kind);assert.equal(p.requestId,base.requestId);
  assert.equal(p.state,'VALIDATED_NOT_POSTED');assert.equal(p.durable,false);
  assert.equal(p.stockChanged,false);assert.equal(p.locationVerified,false);
  assert.equal(p.businessAuthorityVerified,false);
  assert.equal(p.requiredNextStep,kind==='COUNT'?'QUALIFIED_COUNT_EVIDENCE_PERSISTENCE':'QUALIFIED_AUTHORITY_AND_DATABASE_POSTING');
 });
}
test('rejects added approval, posting and spoofed actor fields rather than trusting them',()=>{
 for(const extraneous of [{approved:true},{posted:true},{actorSubject:'ADMIN'},{locationVerified:true},
  {balance:'9000'},{proof:'FAKE'}])rejects({...op('IN'),...extraneous},'P0_EXACT_KEYS_REQUIRED');
});
test('requires a scoped legal entity/site/warehouse and a real version key',()=>{
 for(const key of ['legalEntityId','siteId','warehouseId','productVersion'] as const)
  rejects({...op('IN'),[key]:''},'P0_');
});
test('strict UUID and contract version enforced',()=>{
 rejects({...op('OUT'),requestId:'1'},'P0_REQUEST_ID_INVALID');
 rejects({...op('OUT'),contractVersion:'V2'},'P0_VERSION_INVALID');
});
test('positive 6-decimal quantity enforced for IN/OUT/TRANSFER',()=>{
 for(const kind of ['IN','OUT','TRANSFER'] as const){
  rejects({...op(kind),quantity:'0'},'P0_POST_QUANTITY_MUST_BE_POSITIVE');
  rejects({...op(kind),quantity:'-1'},'QUANTITY_INVALID');
  rejects({...op(kind),quantity:'0.0000001'},'QUANTITY_INVALID');
 }
});
test('COUNT supports zero as evidence without posting any movement',()=>{
 const a=prepareP0Nonposting({...op('COUNT'),quantity:'0'});
 assert.equal(a.quantity,'0');assert.equal(a.stockChanged,false);assert.equal(a.durable,false);
});
test('SERIAL requires exact single unit for IN, OUT and TRANSFER',()=>{
 for(const kind of ['IN','OUT','TRANSFER'] as const){
  const p={...op(kind),controlType:'SERIAL',serialNo:'SN1',quantity:'1'};
  assert.equal(validateP0Operation(p).controlType,'SERIAL');
  rejects({...p,quantity:'2'},'P0_SERIAL_UNIT_REQUIRED');
 }
});
test('COUNT serialized absence may be zero but not fractional or >1',()=>{
 const p={...op('COUNT'),controlType:'SERIAL',serialNo:'SN1',quantity:'0'};
 assert.equal(validateP0Operation(p).quantity,'0');
 rejects({...p,quantity:'0.5'},'P0_SERIAL_UNIT_REQUIRED');
 rejects({...p,quantity:'2'},'P0_SERIAL_UNIT_REQUIRED');
});
test('BATCH requires batch, forbids serial; NONE forbids both',()=>{
 for(const kind of ['IN','OUT','COUNT','TRANSFER'] as const){
  rejects({...op(kind),controlType:'BATCH'},'P0_BATCH_REQUIRED_SERIAL_FORBIDDEN');
  rejects({...op(kind),controlType:'NONE',serialNo:'SN1'},'P0_UNEXPECTED_SERIAL_OR_BATCH');
  assert.equal(validateP0Operation({...op(kind),controlType:'BATCH',batchNo:'LOT1'}).controlType,'BATCH');
 }
});
test('QC accepted requires evidence; QC state is not a trusted approval',()=>{
 rejects({...op('IN'),qcState:'ACCEPTED',qcEvidenceId:''},'P0_QC_EVIDENCE_REQUIRED');
 rejects({...op('IN'),qcState:'TRUSTED'},'P0_QC_STATE_INVALID');
 assert.equal(prepareP0Nonposting({...op('IN'),qcState:'ACCEPTED'}).businessAuthorityVerified,false);
});
test('OUT cannot silently issue solely against a work order',()=>{
 rejects({...op('OUT'),employeeId:'',workOrderId:'WO1'},'P0_EMPLOYEE_INVALID');
});
test('TRANSFER rejects same source and destination and blank reason',()=>{
 rejects({...op('TRANSFER'),destinationLeafId:'BN04'},'P0_TRANSFER_IDENTICAL_LOCATION');
 rejects({...op('TRANSFER'),reason:''},'P0_TRANSFER_REASON_INVALID');
});
test('stated leaf is unverified until trusted DB scope/path lookup',()=>{
 const p=prepareP0Nonposting({...op('COUNT'),leafLocationId:'RACK1'});
 assert.equal(p.destinationLocationId,'RACK1');assert.equal(p.locationVerified,false);
});
test('invalid or extra identity cannot bypass strict shape',()=>{
 rejects({...op('IN'),kind:'RETURN'},'P0_KIND_INVALID');
 rejects({...op('IN'),extra:'ALTER'},'P0_EXACT_KEYS_REQUIRED');
 rejects({ ...op('OUT'),issueDocumentId:'../escape'},'P0_ISSUE_DOCUMENT_INVALID');
 rejects(null,'P0_OBJECT_REQUIRED');
});
test('precise decimal canonicalization preserves quantity',()=>{
 assert.equal(prepareP0Nonposting({...op('COUNT'),quantity:'1.500000'}).quantity,'1.5');
});
