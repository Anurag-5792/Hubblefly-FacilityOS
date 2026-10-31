import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMasterChange,validateMasterRequest,masterPayloadSha256,issueMasterProof}
 from '../../lib/hft/masters/p3-contract.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';

const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const requestId='11111111-1111-4111-8111-111111111111';
const values={
 EMPLOYEE:{fullName:'Receiving Operator',department:'Stores',designation:'Operator',siteId:'SITE1'},
 ITEM:{uom:'PCS',controlType:'SERIAL'},SUPPLIER:{legalName:'Synthetic Supplier'},
 WAREHOUSE:{name:'Synthetic Warehouse',siteId:'SITE1'},
 LOCATION:{parentLocationId:''}
} as const;
function change(kind:keyof typeof values,operation='CREATE',overrides:Record<string,unknown>={}){
 return {contractVersion:'HFT-R1-P3-MASTER-V1',requestId,kind,operation,...scope,
 recordId:kind==='WAREHOUSE'?'WH1':'RECORD1',expectedVersion:operation==='CREATE'?'0':'2',
 reason:'Authorized synthetic change request',values:operation==='ACTIVATE'||operation==='DEACTIVATE'?{}:values[kind],
 ...overrides};
}
test('all five master create requests are valid but never encode active=true',()=>{
 for(const kind of Object.keys(values) as (keyof typeof values)[]){
  const c=validateMasterChange(change(kind));
  assert.equal(c.kind,kind);
  assert.equal(c.operation,'CREATE');
  assert.equal(c.expectedVersion,'0');
  assert.equal(Object.hasOwn(c.values,'active'),false);
  assert.match(masterPayloadSha256(c),/^[0-9a-f]{64}$/);
 }
});
test('strict fields deny active injection, cross-site identifiers and changed scope',()=>{
 assert.throws(()=>validateMasterChange(change('EMPLOYEE','CREATE',{values:{...values.EMPLOYEE,active:true}})),/P3_UNEXPECTED_OR_MISSING_FIELD/);
 assert.throws(()=>validateMasterChange(change('EMPLOYEE','CREATE',{values:{...values.EMPLOYEE,siteId:'SITE2'}})),/P3_SITE_ANCHOR_MISMATCH/);
 assert.throws(()=>validateMasterChange(change('WAREHOUSE','CREATE',{recordId:'WH2'})),/P3_WAREHOUSE_ANCHOR_MISMATCH/);
 assert.throws(()=>validateMasterChange(change('LOCATION','CREATE',{values:{parentLocationId:'RECORD1'}})),/P3_LOCATION_SELF_PARENT/);
 assert.throws(()=>validateMasterChange(change('ITEM','CREATE',{values:{uom:'PCS',controlType:'OTHER'}})),/P3_CONTROL_TYPE_INVALID/);
});
test('revision conflicts and direct activation are never silently rewritten',()=>{
 assert.throws(()=>validateMasterChange(change('ITEM','CREATE',{expectedVersion:'1'})),/P3_EXPECTED_REVISION_REQUIRED/);
 assert.throws(()=>validateMasterChange(change('ITEM','EDIT',{expectedVersion:'0'})),/P3_EXPECTED_REVISION_REQUIRED/);
 assert.throws(()=>validateMasterChange(change('ITEM','ACTIVATE',{values:{active:'true'}})),/P3_UNEXPECTED_OR_MISSING_FIELD/);
 assert.equal(validateMasterChange(change('ITEM','ACTIVATE')).operation,'ACTIVATE');
 assert.equal(validateMasterChange(change('ITEM','DEACTIVATE')).operation,'DEACTIVATE');
});
test('request intent, exact keys and search validation fail closed',()=>{
 const list=validateMasterRequest({intent:'LIST',kind:'ITEM',...scope,search:'MOTOR'});
 assert.equal(list.intent,'LIST');
 assert.throws(()=>validateMasterRequest({intent:'LIST',kind:'ITEM',...scope,search:'%',role:'ADMIN'}),/P3_UNEXPECTED_OR_MISSING_FIELD/);
 assert.throws(()=>validateMasterRequest({intent:'LIST',kind:'ITEM',...scope,search:'%'}),/P3_SEARCH_INVALID/);
 assert.throws(()=>validateMasterRequest({intent:'GET',kind:'WAREHOUSE',...scope,search:'',recordId:'WH2'}),/P3_WAREHOUSE_ANCHOR_MISMATCH/);
 assert.throws(()=>validateMasterRequest({intent:'SUBMIT',change:change('ITEM'),approval:'AUTO'}),/P3_UNEXPECTED_OR_MISSING_FIELD/);
});
test('P3 proof is signed only for actual verified session and exact scope',()=>{
 const valid=validateMasterChange(change('ITEM'));
 const key=Buffer.alloc(32,7);const operator=verifiedFixtureOperator();
 const proof=issueMasterProof(valid,operator,key,1,1700000000);
 assert.equal(proof.actorSubject,'STORE1');assert.equal(proof.sessionId,operator.sessionId);
 assert.equal(proof.payloadSha256,masterPayloadSha256(valid));
 assert.equal(proof.expiresAt,'1700000040');
 assert.match(proof.macSha256,/^[0-9a-f]{64}$/);
 assert.throws(()=>issueMasterProof(valid,{...operator},key,1),/VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 assert.throws(()=>issueMasterProof(validateMasterChange(change('ITEM','CREATE',{warehouseId:'WH2'})),
 operator,key,1),/SIGNED_SCOPE_DENIED/);
 assert.throws(()=>issueMasterProof(valid,operator,Buffer.alloc(8),1),/P3_SIGNING_KEY_OR_CLOCK_UNAVAILABLE/);
});
