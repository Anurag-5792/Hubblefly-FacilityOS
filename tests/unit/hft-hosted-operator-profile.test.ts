import assert from 'node:assert/strict';
import test from 'node:test';
import {HOSTED_OPERATOR_PROFILE,HOSTED_OPERATOR_ISSUER,HOSTED_OPERATOR_AUDIENCE,RETAINED_ROLE_PROFILE,RETAINED_STORE_PROFILE,
 hostedOperatorMode,hostedOperatorPathAdmitted,assertHostedOperatorDuty} from '../../lib/hft/roles/hosted-operator-profile.ts';
import {operatorRoster,operatorBinding,hostedActorForClaims,assertCanonicalOperator,type OperatorActor} from '../../lib/hft/roles/hosted-operator-identity.ts';
import {parseOperatorContext,operatorPending,operatorOtherPending,writeOperatorPending,clearOperatorPending} from '../../lib/hft/roles/hosted-operator-client.ts';
const mail='employee@example.invalid',actor:OperatorActor={identityClass:'CANONICAL_EMPLOYEE',subject:'ACTOR-A',
 providerSubject:'123456789012345678901',employeeId:'EMP-001',personId:'PERSON-001',legalEntityId:'HFT',
 siteId:'SITE-A',warehouseIds:['WH-A','WH-B']};
const roster=(a:unknown=actor)=>JSON.stringify({[mail]:a});
const base={NODE_ENV:'production',VERCEL_ENV:'preview',HFT_ENVIRONMENT:'retained-stores-nonproduction',
 HFT_HOSTED_OPERATOR_PROFILE:HOSTED_OPERATOR_PROFILE,HFT_HOSTED_OPERATOR_MODE:'ROLES_ONLY',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:RETAINED_ROLE_PROFILE,HFT_SESSION_ISSUER:HOSTED_OPERATOR_ISSUER,
 HFT_SESSION_AUDIENCE:HOSTED_OPERATOR_AUDIENCE,HFT_HOSTED_OPERATOR_ADMISSION_SHA256:'a'.repeat(64),
 HFT_HOSTED_OPERATOR_SOURCE_COMMIT:'b'.repeat(40),VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),
 HFT_ROLE_RESOURCE_PROJECT:'wandering-cake-50222227',HFT_ROLE_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t',
 HFT_ROLE_PG_DATABASE:'hft_r1_retained_masters_np077',HFT_ROLE_PG_HOST:'retained.example.invalid',HFT_ROLE_PG_PORT:'5432',
 HFT_PUBLIC_ORIGIN:'https://operator.example.invalid',HFT_HOSTED_OPERATOR_ACTORS_JSON:roster()};
const receive={...base,HFT_HOSTED_OPERATOR_MODE:'ROLES_RECEIVE',HFT_STORES_RUNTIME_PROFILE:RETAINED_STORE_PROFILE,
 HFT_STORES_RESOURCE_PROJECT:base.HFT_ROLE_RESOURCE_PROJECT,HFT_STORES_RESOURCE_BRANCH:base.HFT_ROLE_RESOURCE_BRANCH,
 HFT_STORES_APPROVED_DATABASE:base.HFT_ROLE_PG_DATABASE,PGDATABASE:base.HFT_ROLE_PG_DATABASE,
 PGHOST:base.HFT_ROLE_PG_HOST,PGPORT:base.HFT_ROLE_PG_PORT};
test('Roles-only hosted profile opens existing role and auth paths but no stock path',()=>{
 assert.equal(hostedOperatorMode(base),'ROLES_ONLY');
 for(const path of ['/settings/users-roles','/api/hft/settings/roles','/api/hft/live-masters/auth/start','/api/hft/live-masters/signout'])
  assert.equal(hostedOperatorPathAdmitted(path,base),true);
 for(const path of ['/stores/operations','/api/hft/stores/read','/api/hft/stores/receive','/api/hft/intake','/api/hft/live-masters','/masters/live','/api/hft/stores/submit'])
  assert.equal(hostedOperatorPathAdmitted(path,base),false);
 assert.doesNotThrow(()=>assertHostedOperatorDuty(base,'role'));
 assert.throws(()=>assertHostedOperatorDuty(base,'stock'));
 assert.throws(()=>assertHostedOperatorDuty({...base,HFT_HOSTED_OPERATOR_PROFILE:undefined},'role'));
});
test('hosted RECEIVE requires the same canonical endpoint and independent exact preview mode',()=>{
 assert.equal(hostedOperatorMode(receive),'ROLES_RECEIVE');
 assert.equal(hostedOperatorPathAdmitted('/api/hft/stores/receive',receive),true);
 for(const path of ['/api/hft/stores/submit','/api/hft/stores/prepare','/api/hft/stores/return-prepare','/api/hft/intake','/api/hft/live-masters'])
  assert.equal(hostedOperatorPathAdmitted(path,receive),false);
 for(const patch of [{PGHOST:'other.example.invalid'},{PGPORT:'5433'},{PGDATABASE:'other'},
  {HFT_STORES_RESOURCE_PROJECT:'other'},{HFT_STORES_RESOURCE_BRANCH:'other'},{HFT_STORES_RUNTIME_PROFILE:undefined}])
  assert.throws(()=>hostedOperatorMode({...receive,...patch}));
});
test('mixed Masters, CLI fixture, intake, production, source and identity configurations are rejected',()=>{
 for(const patch of [{HFT_LIVE_R1_PROFILE:'HFT_R1_PRODUCTION_LIVE_MASTERS_V1'},{HFT_LIVE_R1_IDENTITY_PROOF_MODE:'qualification-only'},
  {HFT_DRAFT_RUNTIME_PROFILE:'draft'},{HFT_MASTERS_RUNTIME_PROFILE:'retained'},{HFT_INTAKE_PROFILE:'intake'},
  {HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:'HFT_R1_ROLE077_ISOLATED_POSTGRES_V1'},{HFT_QUAL077_ADMISSION_FILE:'/fixture'},
  {HFT_STORES_RUNTIME_PROFILE:RETAINED_STORE_PROFILE},{VERCEL_ENV:'production'},{HFT_ENVIRONMENT:'production'},
  {HFT_LIVE_POSTING_ENABLED:'true'},{HFT_SESSION_AUDIENCE:'QUAL077-SYNTHETIC-FIXTURE'},
  {HFT_HOSTED_OPERATOR_ADMISSION_SHA256:'0'.repeat(64)},{VERCEL_GIT_COMMIT_SHA:'c'.repeat(40)},
  {HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON:roster()},{HFT_PUBLIC_ORIGIN:'https://operator.example.invalid/path'}]){
  const e={...base,...patch};assert.throws(()=>hostedOperatorMode(e));assert.equal(hostedOperatorPathAdmitted('/api/hft/settings/roles',e),false);
 }
});
test('provider binding and canonical employee/person/scope are exact and cannot be inherited from a fixture',()=>{
 const parsed=operatorRoster(base)[mail],binding=operatorBinding(mail,parsed);
 const claims={sub:actor.subject,operatorBinding:binding,legalEntityId:'HFT',siteId:'SITE-A',warehouseIds:['WH-B','WH-A']};
 assert.deepEqual(hostedActorForClaims(base,claims),actor);
 for(const change of [{providerSubject:'987654321012345678901'},{personId:'PERSON-002'},{employeeId:'EMP-002'},
  {warehouseIds:['WH-A']},{siteId:'SITE-B'}])
  assert.throws(()=>hostedActorForClaims({...base,HFT_HOSTED_OPERATOR_ACTORS_JSON:roster({...actor,...change})},claims));
 for(const change of [{sub:'QUAL077-ACTOR'},{operatorBinding:undefined},{warehouseIds:['WH-C']},{legalEntityId:'OTHER'}])
  assert.throws(()=>hostedActorForClaims(base,{...claims,...change}));
 for(const change of [{identityClass:'SYNTHETIC'},{subject:'QUAL077-ACTOR'},{personId:'R1Q-PERSON'},
  {employeeId:'FIXTURE-EMP'},{warehouseIds:['SYNTHETIC-WH']},{providerSubject:'synthetic-provider'}])
  assert.throws(()=>operatorRoster({...base,HFT_HOSTED_OPERATOR_ACTORS_JSON:roster({...actor,...change})}));
 const p={subject:actor.subject,employeeId:actor.employeeId,personId:actor.personId};
 const scopes=actor.warehouseIds.map(warehouseId=>({legalEntityId:'HFT',siteId:'SITE-A',warehouseId}));
 assert.doesNotThrow(()=>assertCanonicalOperator(actor,p,scopes));
 assert.throws(()=>assertCanonicalOperator(actor,{...p,personId:'PERSON-002'},scopes));
 assert.throws(()=>assertCanonicalOperator(actor,p,scopes.slice(0,1)));
});
test('capabilities and original request references are validated and actor-isolated',()=>{
 const A='a'.repeat(64),B='b'.repeat(64),scope={legalEntityId:'HFT',siteId:'SITE-A',warehouseId:'WH-A'};
 const response={state:'OPERATOR_CONTEXT',contextId:A,expiresAt:200,capabilities:[{scope,rolesRead:true,stockRead:false,receive:false}]};
 assert.equal(parseOperatorContext(response,100).capabilities[0].receive,false);
 assert.throws(()=>parseOperatorContext(response,200));
 assert.throws(()=>parseOperatorContext({...response,capabilities:[{scope,rolesRead:true,stockRead:'yes',receive:false}]},100));
 const m=new Map<string,string>(),reads:string[]=[];
 const s={get length(){return m.size;},key:(i:number)=>[...m.keys()][i]??null,getItem:(k:string)=>{reads.push(k);return m.get(k)??null;},setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};
 const p={requestId:'00000000-0000-4000-8000-000000000094',scope};
 writeOperatorPending(s,'role',A,p);writeOperatorPending(s,'receive',A,p);
 reads.length=0;assert.equal(operatorPending(s,'role',B),null);assert.equal(operatorOtherPending(s,'role',B),true);
 assert.ok(!reads.some(k=>k.endsWith(A)));
 assert.throws(()=>writeOperatorPending(s,'role',B,p));assert.deepEqual(operatorPending(s,'role',A),p);
 assert.throws(()=>clearOperatorPending(s,'role',A,{...p,scope:{...scope,warehouseId:'WH-B'}}));
 clearOperatorPending(s,'role',A,p);assert.equal(operatorPending(s,'role',A),null);
 assert.deepEqual(operatorPending(s,'receive',A),p);
});
