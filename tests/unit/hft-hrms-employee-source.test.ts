import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proposeHftEmployeeFromHrms,proposeHftEmployeeBatchFromHrms,
  type HrmsReferenceBinding} from '../../lib/hft/integrations/hrms-employee-source.ts';

const binding:HrmsReferenceBinding={source:'DDL_SBAI_HRMS',
  sourceRevision:'ec1f2d49e147c1148c359097c5a16cb38bbdd45f',
  expectedCompanyName:'Hubblefly Technologies Limited',
  scope:{legalEntityId:'HFT',siteId:'SITE1',warehouseId:'STORE1'},
  requestId:'11111111-1111-4111-8111-111111111111'};
const source={employeeId:'EMP-001',name:'Synthetic Worker',
  company:'Hubblefly Technologies Limited',department:'Stores',
  position:'Technician',isActive:true,
  phoneNumber:'PRIVATE_PHONE',email:'PRIVATE_EMAIL',
  bankDetails:{accountNumber:'PRIVATE_BANK'},aadharCardNumber:'PRIVATE_ID',salary:998};

test('SBAI employee becomes pending inactive P3 CREATE candidate, not active employee',()=>{
  const result=proposeHftEmployeeFromHrms(source,binding);
  assert.equal(result.state,'UNVERIFIED_HRMS_REFERENCE');
  assert.equal(result.change.kind,'EMPLOYEE');assert.equal(result.change.operation,'CREATE');
  assert.equal(result.change.expectedVersion,'0');
  assert.equal(result.change.values.fullName,'Synthetic Worker');
  assert.equal(result.change.values.designation,'Technician');
  assert.equal(result.change.siteId,'SITE1');
  assert.equal(result.sourceWasActive,true);
  assert.equal(result.autoActivationAllowed,false);
  assert.equal(result.sourceAuthenticityEstablished,false);
});
test('never emits bank, identity documents, salary, phone, email or attendance',()=>{
  const candidate=proposeHftEmployeeFromHrms(source,binding);
  const output=JSON.stringify(candidate);
  for(const token of ['PRIVATE_PHONE','PRIVATE_EMAIL','PRIVATE_BANK','PRIVATE_ID','998',
    'bankDetails','aadharCardNumber','salary'])assert.equal(output.includes(token),false,token);
});
test('exact source company binding prevents cross-entity or DDL field staff import',()=>{
  assert.throws(()=>proposeHftEmployeeFromHrms({...source,company:'Drone Destination Limited'},binding),
    /HRMS_LEGAL_COMPANY_MISMATCH/);
  assert.throws(()=>proposeHftEmployeeFromHrms({...source,company:undefined},binding),
    /HRMS_COMPANY_INVALID/);
});
test('missing or implicit active state is rejected, not treated as active',()=>{
  assert.throws(()=>proposeHftEmployeeFromHrms({...source,isActive:undefined},binding),
    /HRMS_EXPLICIT_ACTIVE_STATE_REQUIRED/);
  const inactive=proposeHftEmployeeFromHrms({...source,isActive:false},binding);
  assert.equal(inactive.sourceWasActive,false);
  assert.equal(inactive.change.operation,'CREATE');
});
test('AIMIS employee is only a reference with explicit employer and employment state',()=>{
  const aimis={empId:'EMP-100',name:'Synthetic Engineer',
    company:'Hubblefly Technologies Limited',department:'Engineering',
    designation:'Operator',status:'Active',panNumber:'NEVER_COPY'};
  const result=proposeHftEmployeeFromHrms(aimis,{...binding,source:'DDL_AIMIS_HRMS'});
  assert.equal(result.change.recordId,'EMP-100');
  assert.equal(result.change.values.department,'Engineering');
  assert.equal(result.sourceWasActive,true);
  assert.equal(JSON.stringify(result).includes('NEVER_COPY'),false);
});
test('absence of legal company reference in legacy AIMIS stops import',()=>{
  assert.throws(()=>proposeHftEmployeeFromHrms({empId:'EMP-100',name:'Synthetic Engineer',
    department:'Engineering',designation:'Operator',status:'Active',clientName:'HFT'},
    {...binding,source:'DDL_AIMIS_HRMS'}),/HRMS_COMPANY_INVALID/);
});
test('rejects invalid HFT scope, source revision, P3 UUID or source employee ID',()=>{
  assert.throws(()=>proposeHftEmployeeFromHrms(source,{...binding,scope:{...binding.scope,siteId:'wrong'}}),/HRMS_SITEID_INVALID/);
  assert.throws(()=>proposeHftEmployeeFromHrms(source,{...binding,sourceRevision:'main'}),/HRMS_SOURCE_REVISION_REQUIRED/);
  assert.throws(()=>proposeHftEmployeeFromHrms(source,{...binding,requestId:'123'}),/HRMS_P3_REQUEST_UUID_REQUIRED/);
  assert.throws(()=>proposeHftEmployeeFromHrms({...source,employeeId:'bad/ID'},binding),/HRMS_EMPLOYEE_ID_INVALID/);
});
test('fingerprint is deterministic and changes with source revision/field/active state',()=>{
  const a=proposeHftEmployeeFromHrms(source,binding);
  const b=proposeHftEmployeeFromHrms({...source},binding);
  assert.equal(a.sourceFingerprintSha256,b.sourceFingerprintSha256);
  assert.notEqual(a.sourceFingerprintSha256,
    proposeHftEmployeeFromHrms({...source,isActive:false},binding).sourceFingerprintSha256);
  assert.notEqual(a.sourceFingerprintSha256,
    proposeHftEmployeeFromHrms(source,{...binding,sourceRevision:'1'.repeat(40)}).sourceFingerprintSha256);
});
test('proposed batch rejects duplicate identity or repeated request ID',()=>{
  assert.throws(()=>proposeHftEmployeeBatchFromHrms([source,source],[binding,binding]),
    /HRMS_DUPLICATE_EMPLOYEE_OR_REQUEST/);
  assert.throws(()=>proposeHftEmployeeBatchFromHrms([source],[]),/HRMS_BATCH_SIZE_OR_BINDINGS_INVALID/);
});
test('batch never posts any stock or activates records',()=>{
  const more={...source,employeeId:'EMP-002',isActive:false};
  const list=proposeHftEmployeeBatchFromHrms([source,more],[binding,
    {...binding,requestId:'22222222-2222-4222-8222-222222222222'}]);
  assert.equal(list.length,2);
  for(const item of list){
    assert.equal(item.change.operation,'CREATE');
    assert.equal(item.autoActivationAllowed,false);
  }
});
