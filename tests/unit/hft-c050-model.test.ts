import {test} from 'node:test';
import assert from 'node:assert/strict';
import {C047_EXISTING_ROUTES,mayDisplayRoute,mayPerformProtectedOperation}
 from '../../lib/hft/ui-reuse/route-registry.ts';
import {readEmployeeDirectory,filterEmployeeDirectory,proposeEmployeeEdit,toP3EmployeeRequest}
 from '../../lib/hft/ui-reuse/employee-view-model.ts';
import {proposeRouteAccess} from '../../lib/hft/ui-reuse/access-proposal-model.ts';
import {validateMasterChange} from '../../lib/hft/masters/p3-contract.ts';

const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const owner={subject:'OWNER_PERSON',active:true,systemRoles:['OWNER_SUPERADMIN'],
 viewPermissions:[],grantableScopes:[scope],policyGeneration:7};
const requestId='11111111-1111-4111-8111-111111111111';
const sample=[
 {kind:'EMPLOYEE',record_id:'EMP001',legal_entity_id:'HFT',site_id:'SITE1',warehouse_id:'',
  version:'4',active:true,master_values:{fullName:'Employee One',department:'Stores',
   designation:'Stores Officer',siteId:'SITE1'}},
 {kind:'EMPLOYEE',record_id:'EMP002',legal_entity_id:'HFT',site_id:'SITE1',warehouse_id:'',
  version:2,active:false,master_values:{fullName:'Employee Two',department:'Quality',
   designation:'Inspector',siteId:'SITE1'}}
];
const draft=(changes:Record<string,unknown>={})=>proposeRouteAccess({
 actor:owner,targetSubject:'STAFF_B',...scope,routePermissions:['stores.workspace.view'],
 reason:'Requires Stores route visibility',expectedPolicyGeneration:7,...changes
});
test('C050 page inventory exactly seven routes and no admin or API route',()=>{
 assert.equal(C047_EXISTING_ROUTES.length,7);
 assert.equal(new Set(C047_EXISTING_ROUTES.map(r=>r.path)).size,7);
 assert.equal(C047_EXISTING_ROUTES.some(r=>r.path==='/admin/access'),false);
 assert.equal(C047_EXISTING_ROUTES.some(r=>r.path.startsWith('/api')),false);
});
test('OWNER presentation sees all registered pages, never protected actions',()=>{
 for(const route of C047_EXISTING_ROUTES)
  assert.equal(mayDisplayRoute(owner,route.path),true);
 for(const action of ['stock.post','hold.clear','gate.r','gate.a','audit.override'])
  assert.equal(mayPerformProtectedOperation(owner,action),false);
});
test('unknown route is denied even to OWNER',()=>{
 assert.equal(mayDisplayRoute(owner,'/admin/access'),false);
 assert.equal(mayDisplayRoute(owner,'/stores/unknown'),false);
});
test('inactive OWNER cannot display registered pages',()=>{
 assert.equal(mayDisplayRoute({...owner,active:false},'/stores'),false);
});
test('ordinary staff route permission is exact, not wildcard',()=>{
 const user={subject:'STAFF_A',active:true,systemRoles:[],
  viewPermissions:['stores.workspace.view']};
 assert.equal(mayDisplayRoute(user,'/stores'),true);
 assert.equal(mayDisplayRoute(user,'/stores/masters'),false);
 assert.equal(mayDisplayRoute({...user,viewPermissions:['*']},'/stores'),false);
});
test('P3 Employee LIST normalizer preserves only four approved master values',()=>{
 const rows=readEmployeeDirectory(sample,scope);
 assert.equal(rows.length,2);
 assert.deepEqual(Object.keys(rows[0]).sort(),
  ['recordId','version','active','legalEntityId','siteId',
   'fullName','department','designation'].sort());
 assert.equal(rows[0].designation,'Stores Officer');
 assert.equal('email' in rows[0],false);
});
test('Employee directory filters by text, department, designation and active status',()=>{
 const rows=readEmployeeDirectory(sample,scope);
 const f={search:'',department:'',designation:'',status:'ALL' as const};
 assert.deepEqual(filterEmployeeDirectory(rows,{...f,search:'one'}).map(r=>r.recordId),['EMP001']);
 assert.deepEqual(filterEmployeeDirectory(rows,{...f,department:'Quality'}).map(r=>r.recordId),['EMP002']);
 assert.deepEqual(filterEmployeeDirectory(rows,{...f,designation:'Inspector'}).map(r=>r.recordId),['EMP002']);
 assert.deepEqual(filterEmployeeDirectory(rows,{...f,status:'ACTIVE'}).map(r=>r.recordId),['EMP001']);
});
test('out-of-scope employee row aborts entire list',()=>{
 assert.throws(()=>readEmployeeDirectory([...sample,{...sample[0],record_id:'EMP003',legal_entity_id:'DDL'}],scope),
 /CROSS_SCOPE/);
});
test('employee site mismatch and private HR field injection denied',()=>{
 assert.throws(()=>readEmployeeDirectory([{
  ...sample[0],master_values:{...sample[0].master_values,siteId:'SITE2'}}],scope),/SITE_MISMATCH/);
 assert.throws(()=>readEmployeeDirectory([{
  ...sample[0],master_values:{...sample[0].master_values,privateSalary:'100'}}],scope),/PRIVATE_FIELDS/);
});
test('wrong kind and missing scope values never become a verified directory',()=>{
 assert.throws(()=>readEmployeeDirectory([{...sample[0],kind:'SUPPLIER'}],scope),/KIND_INVALID/);
 assert.throws(()=>readEmployeeDirectory([{...sample[0],warehouse_id:'WH2'}],scope),/CROSS_SCOPE/);
});
test('duplicate employee and malformed record or version fail closed',()=>{
 assert.throws(()=>readEmployeeDirectory([sample[0],sample[0]],scope),/DUPLICATE/);
 assert.throws(()=>readEmployeeDirectory([{...sample[0],record_id:'bad id'}],scope),/INVALID_ID/);
 assert.throws(()=>readEmployeeDirectory([{...sample[0],version:0}],scope),/REVISION/);
});
test('Employee EDIT draft uses existing exact P3 contract',()=>{
 const row=readEmployeeDirectory(sample,scope)[0];
 const edit=proposeEmployeeEdit(row,scope,requestId,'Correct assignment metadata');
 assert.equal(edit.draftState,'PROPOSED_NOT_APPLIED');
 assert.equal(edit.expectedVersion,'4');
 assert.equal(edit.operation,'EDIT');
 const payload=toP3EmployeeRequest(edit);
 assert.equal('draftState' in payload.change,false);
 assert.deepEqual(validateMasterChange(payload.change).values,
  {fullName:'Employee One',department:'Stores',designation:'Stores Officer',siteId:'SITE1'});
});
test('Employee designation never grants role or approval',()=>{
 const row=readEmployeeDirectory(sample,scope)[0];
 const edit=proposeEmployeeEdit(row,scope,requestId,'Update employee record');
 assert.equal('permission' in edit,false);
 assert.equal('role' in edit,false);
 assert.equal('approval' in edit,false);
});
test('Employee edit requires current scope and valid audit reason',()=>{
 const row=readEmployeeDirectory(sample,scope)[0];
 assert.throws(()=>proposeEmployeeEdit(row,{...scope,siteId:'SITE2'},requestId,'Valid reason'),/CROSS_SCOPE/);
 assert.throws(()=>proposeEmployeeEdit(row,scope,requestId,'short'),/REASON/);
 assert.throws(()=>proposeEmployeeEdit(row,scope,'fake uuid','Valid reason'),/REQUEST_ID/);
});
test('OWNER proposal remains non-effective and independently reviewable',()=>{
 const p=draft();assert.equal(p.state,'PROPOSED_NOT_APPLIED');
 assert.equal(p.independentReviewRequired,true);
 assert.equal('approved' in p,false);
 assert.equal('grantApplied' in p,false);
});
test('owner identity cannot self-grant or use an unqualified role label',()=>{
 assert.throws(()=>draft({targetSubject:owner.subject}),/SELF_OR_UNKNOWN/);
 assert.throws(()=>draft({actor:{...owner,systemRoles:['DIRECTOR']}}),/OWNER_NOT_QUALIFIED/);
});
test('cross-entity, cross-site and warehouse privilege assignments denied',()=>{
 for(const x of [{legalEntityId:'DDL'},{siteId:'SITE2'},{warehouseId:'WH2'}])
  assert.throws(()=>draft(x),/CROSS_SCOPE/);
});
test('stale generation cannot be submitted as current access policy',()=>{
 assert.throws(()=>draft({expectedPolicyGeneration:6}),/STALE_POLICY/);
 assert.throws(()=>draft({expectedPolicyGeneration:0}),/STALE_POLICY/);
});
test('unknown, duplicate and protected-action permissions fail closed',()=>{
 for(const p of [['*'],['stock.post'],['route.unknown'],
  ['stores.workspace.view','stores.workspace.view']])
  assert.throws(()=>draft({routePermissions:p}),/PERMISSION_NOT_REGISTERED/);
});
test('missing verified owner scope denies even a syntactically valid request',()=>{
 assert.throws(()=>draft({actor:{...owner,grantableScopes:undefined}}),/CROSS_SCOPE/);
});
