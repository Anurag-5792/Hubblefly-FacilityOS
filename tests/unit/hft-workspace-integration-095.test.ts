import assert from 'node:assert/strict';
import test from 'node:test';
import {HOSTED_OPERATOR_PROFILE,HOSTED_OPERATOR_ISSUER,HOSTED_OPERATOR_AUDIENCE,RETAINED_ROLE_PROFILE,RETAINED_STORE_PROFILE,
 hostedOperatorPathAdmitted} from '../../lib/hft/roles/hosted-operator-profile.ts';
import {type OperatorActor} from '../../lib/hft/roles/hosted-operator-identity.ts';
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

import {loginDestination,assertLoginDestination,workspaceModules,loginPath,misPresentationAdmitted} from '../../lib/hft/ui-reuse/workspace-profile.ts';
import {encodeFlow,decodeFlow,clearAuthCookies} from '../../lib/hft/live/live-oidc.ts';
import {randomBytes} from 'node:crypto';
const live={NODE_ENV:'production',VERCEL_ENV:'preview',HFT_ENVIRONMENT:'production-qualification',HFT_LIVE_R1_PROFILE:'HFT_R1_PRODUCTION_LIVE_MASTERS_V1',HFT_LIVE_POSTING_ENABLED:'false',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database'};
const intake={...live,HFT_INTAKE_PROFILE:'HFT_INTAKE_OWNER_REVIEW_V1'};
test('profile-aware root never links to incompatible deployments',()=>{
 const paths=(e:Record<string,string|undefined>)=>workspaceModules(e).flatMap(m=>m.href?[m.href]:[]);
 assert.deepEqual(paths(live),['/masters/live','/mis']);assert.deepEqual(paths(intake),['/masters/live','/stores/intake','/mis']);
 assert.deepEqual(paths(base),['/settings/users-roles']);assert.deepEqual(paths(receive),['/settings/users-roles','/stores/operations']);
 assert.deepEqual(paths({...base,HFT_INTAKE_PROFILE:intake.HFT_INTAKE_PROFILE}),[]);
 assert.deepEqual(paths({...live,HFT_LIVE_R1_IDENTITY_PROOF_MODE:'qualification-only'}),[]);
 assert.equal(hostedOperatorPathAdmitted('/api/hft/intake',receive),false);
});
test('Masters MIS route is presentation-only and excludes incompatible profiles',()=>{
 assert.equal(misPresentationAdmitted(live),true);
 assert.equal(misPresentationAdmitted(intake),true);
 const module=workspaceModules(live).find(m=>m.href==='/mis');
 assert.equal(module?.status,'Presentation only · data unavailable');
 for(const delta of [{HFT_LIVE_POSTING_ENABLED:'true'},{HFT_AUTH_SOURCE:'unverified'},
  {HFT_OPERATIONS_SOURCE:'fixture'},{HFT_MIS_REQUIREMENTS_PROFILE:'HFT_R1_MIS_REQUIREMENTS_RETAINED_V1'},
  {HFT_LIVE_R1_IDENTITY_PROOF_MODE:'qualification-only'},{HFT_HOSTED_OPERATOR_PROFILE:HOSTED_OPERATOR_PROFILE},
  {HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:RETAINED_ROLE_PROFILE},{VERCEL_ENV:'production'},
  {HFT_ENVIRONMENT:'production',VERCEL_ENV:'production'},{HFT_LIVE_R1_PROFILE:'invalid'}]){
  const e={...live,...delta};assert.equal(misPresentationAdmitted(e),false);
  assert.equal(workspaceModules(e).some(m=>m.href==='/mis'),false);
 }
 assert.equal(misPresentationAdmitted(base),false);
 assert.throws(()=>loginDestination(live,['mis']),/DENIED/);
});
test('return destinations cannot cross profile',()=>{
 assert.equal(loginDestination(live,[]),'masters');assert.equal(loginDestination(intake,['intake']),'intake');assert.equal(loginPath('intake'),'/stores/intake');
 assert.equal(loginDestination(base,[]),'roles');assert.equal(loginDestination(receive,['stores']),'stores');
 for(const [e,d] of [[live,'intake'],[live,'roles'],[intake,'stores'],[base,'stores'],[base,'intake'],[receive,'masters']] as const)assert.throws(()=>assertLoginDestination(e,d),/DENIED/);
 for(const v of [['//outside.invalid'],['roles','roles'],['proof'],['https://outside.invalid']])assert.throws(()=>loginDestination(live,v),/DENIED/);
});
test('encrypted flow cannot mix destinations and logout clears every module cookie',()=>{
 const k=randomBytes(32),f={state:'fixture-state',nonce:'fixture-nonce',verifier:'fixture-verifier',issuedAt:Date.now()};
 assert.equal(decodeFlow(encodeFlow({...f,intakeReturn:true},k),k).intakeReturn,true);
 assert.throws(()=>decodeFlow(encodeFlow({...f,intakeReturn:true,operatorReturn:'roles'},k),k),/INVALID/);
 assert.throws(()=>decodeFlow(encodeFlow({...f,intakeReturn:true,identityProofOnly:true},k),k),/INVALID/);
 assert.deepEqual(clearAuthCookies.map(c=>c.split('=')[0]),['__Host-hft_session','__Host-hft_live_oauth','__Host-hft_intake_review']);
 assert.ok(clearAuthCookies.every(c=>c.includes('Max-Age=0')));
});
