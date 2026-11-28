import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAuthoritativeGoogleEmail,employeeAccess,type EmployeeLoginContext} from '../../lib/hft/live/employee-login-core.ts';
const at='2026-11-28T00:00:00.000Z';
const c:EmployeeLoginContext={legalEntityId:'HFT',employeeId:'EMP-A',personId:'PERSON-A',subject:'SUB-A',siteId:'SITE-A',fullName:'Synthetic employee',email:'employee@example.invalid',employeeVersion:1,loginVersion:2,assignments:[]};
test('Google mailbox authority is required independently of email_verified',()=>{
 assert.equal(assertAuthoritativeGoogleEmail('USER@GMAIL.COM',true,undefined),'user@gmail.com');
 assert.equal(assertAuthoritativeGoogleEmail('employee@example.invalid',true,'example.invalid'),'employee@example.invalid');
 for(const args of [['employee@example.invalid',true,undefined],['employee@example.invalid',true,'other.invalid'],['user@gmail.com',false,undefined]])assert.throws(()=>assertAuthoritativeGoogleEmail(args[0],args[1],args[2]),/HF101_/);
});
test('no default privileges and only fresh scoped persisted roles',()=>{
 assert.deepEqual(employeeAccess(c,at),{state:'PENDING_ROLE',scopes:[]});
 const assignment={employeeId:c.employeeId,scope:{legalEntityId:c.legalEntityId,siteId:c.siteId,warehouseId:'WH-A'},revision:1,revokedFrom:null,periods:[{from:at,to:null,roles:['VIEWER' as const]}]};
 assert.deepEqual(employeeAccess({...c,assignments:[assignment]},at),{state:'ROLE_ASSIGNED',scopes:[{warehouseId:'WH-A',permissions:['stock.read']}]});
 assert.deepEqual(employeeAccess({...c,assignments:[{...assignment,periods:[]}]},at),{state:'PENDING_ROLE',scopes:[]});
 assert.throws(()=>employeeAccess({...c,assignments:[{...assignment,scope:{...assignment.scope,siteId:'OTHER'}}]},at),/SCOPE_DENIED/);
});

import {generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {employeeLoginProfileAdmitted,employeeLoginPathAdmitted,EMPLOYEE_LOGIN_PROFILE,EMPLOYEE_LOGIN_ISSUER,EMPLOYEE_LOGIN_AUDIENCE} from '../../lib/hft/live/employee-login-profile.ts';
import {oidcConfig,startUrl,decodeFlow,cookieValue,verifyGoogleIdentity,completeLogin} from '../../lib/hft/live/live-oidc.ts';
import {issueEmployeeCookie,readEmployeeSession,clearEmployeeCookie,completeEmployeeLogin} from '../../lib/hft/live/employee-login-session.ts';
import {loginDestination} from '../../lib/hft/ui-reuse/workspace-profile.ts';
import {resolveVerifiedRequestOperator} from '../../lib/hft/security/verified-request.ts';
const ed=generateKeyPairSync('ed25519'),rsa=generateKeyPairSync('rsa',{modulusLength:2048});
const env:Record<string,string>={NODE_ENV:'production',VERCEL_ENV:'preview',HFT_ENVIRONMENT:'retained-stores-nonproduction',
 HFT_EMPLOYEE_LOGIN_PROFILE:EMPLOYEE_LOGIN_PROFILE,HFT_EMPLOYEE_LOGIN_SOURCE_COMMIT:'a'.repeat(40),VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
 HFT_EMPLOYEE_LOGIN_ADMISSION_SHA256:'b'.repeat(64),HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:'HFT_R1_APP_ROLES_RETAINED_NP_077_V1',HFT_ROLE_RESOURCE_PROJECT:'wandering-cake-50222227',
 HFT_ROLE_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t',HFT_ROLE_PG_DATABASE:'hft_r1_retained_masters_np077',HFT_ROLE_PG_SERVER_VERSION_NUM:'180007',
 HFT_SESSION_ISSUER:EMPLOYEE_LOGIN_ISSUER,HFT_SESSION_AUDIENCE:EMPLOYEE_LOGIN_AUDIENCE,HFT_PUBLIC_ORIGIN:'https://fixture.example.invalid',
 HFT_SESSION_ED25519_PUBLIC_KEY_PEM:ed.publicKey.export({format:'pem',type:'spki'}).toString(),
 HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM:ed.privateKey.export({format:'pem',type:'pkcs8'}).toString(),
 HFT_LIVE_R1_OIDC_ISSUER:'https://accounts.google.com',HFT_LIVE_R1_OIDC_AUTHORIZE_URL:'https://accounts.google.com/o/oauth2/v2/auth',
 HFT_LIVE_R1_OIDC_TOKEN_URL:'https://oauth2.googleapis.com/token',HFT_LIVE_R1_OIDC_JWKS_URL:'https://www.googleapis.com/oauth2/v3/certs',
 HFT_LIVE_R1_OIDC_CLIENT_ID:'fixture-client',HFT_LIVE_R1_OIDC_CLIENT_SECRET:'fixture-client-secret',HFT_LIVE_R1_OIDC_STATE_KEY_BASE64:randomBytes(32).toString('base64')};
test('employee profile is exact nonproduction, roster-free and denies protected routes',()=>{
 assert.equal(employeeLoginProfileAdmitted(env),true);assert.equal(loginDestination(env,[]),'employee');
 assert.equal(loginDestination(env,['roles']),'roles');
 for(const path of ['/employee/account','/settings/users-roles','/api/hft/live-masters/auth/start'])assert.equal(employeeLoginPathAdmitted(path,'GET',env),true);
 for(const path of ['/api/hft/employee-account','/api/hft/settings/roles','/api/hft/live-masters/signout'])assert.equal(employeeLoginPathAdmitted(path,'POST',env),true);
 for(const path of ['/api/hft/live-masters','/masters/live','/api/hft/stores/receive','/api/hft/mis','/api/hft/intake','/stores/operations','/draft'])for(const method of ['GET','POST'])assert.equal(employeeLoginPathAdmitted(path,method,env),false);
 for(const patch of [{HFT_HOSTED_OPERATOR_PROFILE:'x'},{HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON:'{}'},{HFT_HOSTED_OPERATOR_ACTORS_JSON:'{}'},{HFT_LIVE_POSTING_ENABLED:'true'},{VERCEL_ENV:'production'},{HFT_MIS_REQUIREMENTS_PROFILE:'x'},{VERCEL_GIT_COMMIT_SHA:'c'.repeat(40)}]){
  const x={...env,...patch};assert.equal(employeeLoginProfileAdmitted(x),false);assert.throws(()=>oidcConfig(x));
 }
});
const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
test('existing Google token verifier accepts only fresh authoritative mailbox claims in HF101',async t=>{
 const config=oidcConfig(env);
 assert.equal(config.employee,true);assert.deepEqual(config.actors,{});
 const start=startUrl(config,env.HFT_PUBLIC_ORIGIN);
 const flow=decodeFlow(cookieValue(start.cookie,'__Host-hft_live_oauth'),config.stateKey);
 const u=new URL(start.location);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('redirect_uri'),env.HFT_PUBLIC_ORIGIN+'/api/hft/live-masters/auth/callback');
 assert.throws(()=>decodeFlow(cookieValue(start.cookie,'__Host-hft_live_oauth'),Buffer.from(env.HFT_LIVE_R1_OIDC_STATE_KEY_BASE64,'base64')));
 let override:Record<string,unknown>={},badSignature=false;
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input)===config.token){
   assert.ok(init?.body instanceof URLSearchParams);assert.equal(init.body.get('code_verifier'),flow.verifier);
   const now=Math.floor(Date.now()/1000),body=enc({alg:'RS256',kid:'fixture'})+'.'+enc({iss:config.issuer,aud:config.clientId,sub:'20001',email:'employee@example.invalid',hd:'example.invalid',email_verified:true,nonce:flow.nonce,iat:now,exp:now+120,...override});
   return Response.json({id_token:body+'.'+(badSignature?randomBytes(256):sign('RSA-SHA256',Buffer.from(body,'ascii'),rsa.privateKey)).toString('base64url')});
  }
  if(String(input)===config.jwks)return Response.json({keys:[{...rsa.publicKey.export({format:'jwk'}),kid:'fixture'}]});
  throw Error('unexpected provider');
 });
 assert.deepEqual(await verifyGoogleIdentity(config,env,flow,'fixture-code'),{email:'employee@example.invalid',providerSubject:'20001'});
 for(const patch of [{hd:undefined},{hd:'wrong.invalid'},{email_verified:false},{nonce:'wrong'},{iss:'https://wrong.invalid'},{aud:'wrong'},{iat:Math.floor(flow.issuedAt/1000)-120}]){
  override=patch;await assert.rejects(verifyGoogleIdentity(config,env,flow,'fixture-code'));
 }
 override={};badSignature=true;await assert.rejects(verifyGoogleIdentity(config,env,flow,'fixture-code'));
 badSignature=false;await assert.rejects(completeLogin(config,env,flow,'fixture-code'),/CANNOT_CREATE_SESSION/);
 await assert.rejects(completeEmployeeLogin(config,env,{...flow,operatorReturn:'roles'},'fixture-code'),/HF101_FLOW_DENIED/);
 // No live gateway credentials in CI: no session is minted from identity alone.
 await assert.rejects(completeEmployeeLogin(config,env,flow,'fixture-code'),/HF101_GATEWAY_NOT_ADMITTED/);
});
test('employee cookie contains identity/version only and rejects forged, expired, cross-origin and legacy requests',()=>{
 const cookie=issueEmployeeCookie(env,c),value=cookie.split(';')[0];
 assert.match(cookie,/Secure; HttpOnly; SameSite=Lax; Max-Age=600/);
 const req=(v:string=value,origin=env.HFT_PUBLIC_ORIGIN)=>new Request(env.HFT_PUBLIC_ORIGIN+'/api/hft/employee-account',{method:'POST',headers:{cookie:v,origin,'sec-fetch-site':'same-origin'}});
 const p=readEmployeeSession(req(),env);assert.equal(p.employeeId,c.employeeId);assert.equal(p.loginVersion,2);assert.equal(p.employeeVersion,1);
 assert.equal(Object.hasOwn(p,'assignments'),false);assert.equal(Object.hasOwn(p,'warehouseIds'),false);assert.equal(Object.hasOwn(p,'permissions'),false);assert.equal(Object.hasOwn(p,'email'),false);
 assert.throws(()=>readEmployeeSession(req(value,'https://evil.invalid'),env));
 assert.throws(()=>readEmployeeSession(req(value+'; '+value),env));
 assert.throws(()=>readEmployeeSession(req(value.replace('__Host-hft_employee_session','__Host-hft_session')),env));
 assert.throws(()=>resolveVerifiedRequestOperator(req(value),env,'RETAINED_APP_ROLES'),/HF101_LEGACY_SESSION_DENIED/);
 const [head,body,sig]=value.split('=')[1].split('.');
 assert.throws(()=>readEmployeeSession(req('__Host-hft_employee_session='+head+'.'+enc({...p,employeeId:'EMP-B'})+'.'+sig),env));
 const expired=enc({...p,iat:p.iat-700,exp:p.iat-100}),raw=head+'.'+expired;
 const signed=raw+'.'+sign(null,Buffer.from(raw,'ascii'),ed.privateKey).toString('base64url');
 assert.throws(()=>readEmployeeSession(req('__Host-hft_employee_session='+signed),env));
 assert.match(clearEmployeeCookie,/Max-Age=0/);
});
