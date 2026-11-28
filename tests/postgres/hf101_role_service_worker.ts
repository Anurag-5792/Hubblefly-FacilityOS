/** CI-local disposable PG18 only. No live runtime bypass or corporate identity. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,basename,join} from 'node:path';
import {issueEmployeeCookie,readEmployeeSession,employeeRoleIdentity} from '../../lib/hft/live/employee-login-session.ts';
import {EMPLOYEE_LOGIN_PROFILE,EMPLOYEE_LOGIN_ISSUER,EMPLOYEE_LOGIN_AUDIENCE} from '../../lib/hft/live/employee-login-profile.ts';
import type {EmployeeLoginContext} from '../../lib/hft/live/employee-login-core.ts';
import {PostgresRoleStore,type RoleSqlClient,type RoleSqlPool} from '../../lib/hft/roles/role-postgres.ts';
import {handleRoleApi} from '../../lib/hft/roles/role-service.ts';
const pg=createRequire(import.meta.url)('pg') as typeof import('pg');
const database='hft_r1_disposable_hf101',origin='https://hf101-fixture.example.invalid';
async function main(){
 const dir=process.argv[2];
 assert.ok(dir&&isAbsolute(dir)&&basename(dir).startsWith('hf101-pg-socket-')&&realpathSync(dir)===dir&&lstatSync(join(dir,'.s.PGSQL.5432')).isSocket(),'DISPOSABLE_SOCKET_REQUIRED');
 const options={host:dir,port:5432,database,ssl:false,max:2,connectionTimeoutMillis:2500,statement_timeout:5000};
 const role=new pg.Pool({...options,user:'hf101_role_runtime'}),identity=new pg.Pool({...options,user:'hf101_gateway'}),admin=new pg.Pool({...options,user:'postgres'});
 try{
  const probe=await admin.query("SELECT current_database() AS db,current_setting('server_version_num') AS version,inet_server_addr() IS NULL AS unix");
  assert.deepEqual(probe.rows,[{db:database,version:'180007',unix:true}]);
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const env:Record<string,string>={NODE_ENV:'production',VERCEL_ENV:'preview',HFT_ENVIRONMENT:'retained-stores-nonproduction',
   HFT_EMPLOYEE_LOGIN_PROFILE:EMPLOYEE_LOGIN_PROFILE,HFT_EMPLOYEE_LOGIN_SOURCE_COMMIT:'a'.repeat(40),VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
   HFT_EMPLOYEE_LOGIN_ADMISSION_SHA256:'b'.repeat(64),HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
   HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:'HFT_R1_APP_ROLES_RETAINED_NP_077_V1',HFT_ROLE_RESOURCE_PROJECT:'wandering-cake-50222227',
   HFT_ROLE_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t',HFT_ROLE_PG_DATABASE:'hft_r1_retained_masters_np077',HFT_ROLE_PG_SERVER_VERSION_NUM:'180007',
   HFT_SESSION_ISSUER:EMPLOYEE_LOGIN_ISSUER,HFT_SESSION_AUDIENCE:EMPLOYEE_LOGIN_AUDIENCE,HFT_PUBLIC_ORIGIN:origin,
   HFT_SESSION_ED25519_PUBLIC_KEY_PEM:publicKey.export({format:'pem',type:'spki'}).toString(),
   HFT_LIVE_R1_SESSION_ED25519_PRIVATE_KEY_PEM:privateKey.export({format:'pem',type:'pkcs8'}).toString()};
  const scope={legalEntityId:'HF101-HFT',siteId:'HF101-SITE',warehouseId:'HF101-WH'};
  const claim=async(email:string,sub:string)=>{
   const r=await identity.query<{value:EmployeeLoginContext}>('SELECT hft_employee_login.employee_google_claim_v1($1,$2) AS value',[email,sub]);
   assert.equal(r.rows.length,1);return issueEmployeeCookie(env,r.rows[0].value).split(';')[0];
  };
  const request=(cookie:string,body:unknown,contextId?:string)=>new Request(origin+'/api/hft/settings/roles',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json','sec-fetch-site':'same-origin',...(contextId?{'x-hft-operator-context':contextId}:{})},body:JSON.stringify(body)});
  const current=async(req:Request)=>{
   const a=readEmployeeSession(req,env),r=await identity.query<{value:EmployeeLoginContext}>('SELECT hft_employee_login.employee_login_context_v1($1,$2,$3,$4,$5::bigint,$6::bigint) AS value',[a.legalEntityId,a.employeeId,a.subject,a.personId,a.loginVersion,a.employeeVersion]);
   assert.equal(r.rows.length,1);return employeeRoleIdentity(a,r.rows[0].value);
  };
  // This connection admission is ONLY for the nonnetworked disposable fixture.
  // The real route continues to enforce the production-profile exact TLS and
  // catalog admission; no fixture flag or fallback is added to runtime code.
  const admit=async(c:RoleSqlClient)=>{
   const r=await c.query("SELECT current_database() AS db,current_user AS actor,session_user AS login,inet_server_addr() IS NULL AS unix,has_table_privilege(current_user,'hft.employee','INSERT,UPDATE,DELETE') AS employee_write,has_table_privilege(current_user,'hft_employee_login.employee_login_registration','SELECT,INSERT,UPDATE,DELETE') AS identity_access,has_table_privilege(current_user,'hft.stock_entry','SELECT,INSERT,UPDATE,DELETE') AS stock_access");
   assert.deepEqual(r.rows,[{db:database,actor:'hf101_role_runtime',login:'hf101_role_runtime',unix:true,employee_write:false,identity_access:false,stock_access:false}]);
  };
  const store=new PostgresRoleStore(role as unknown as RoleSqlPool,admit,true);
  const invoke=async(cookie:string,body:unknown,contextId?:string)=>{
   const req=request(cookie,body,contextId);
   let session:Awaited<ReturnType<typeof current>>;
   try{session=await current(req);}catch{return {status:401,data:{state:'UNAVAILABLE',code:'HF101_SESSION_REQUIRED'}};}
   const res=await handleRoleApi(req,{authenticate:async()=>session,store:()=>store});return {status:res.status,data:await res.json()};
  };
  const owner=await claim('owner@example.invalid','10001'),employee=await claim('b@example.invalid','20002');
  const bootstrap=await invoke(owner,{action:'BOOTSTRAP'});
  assert.equal(bootstrap.status,200);assert.equal(bootstrap.data.state,'CONNECTED');assert.deepEqual(bootstrap.data.scopes,[scope]);
  const contextId=String(bootstrap.data.contextId);
  assert.equal((await invoke(employee,{action:'BOOTSTRAP'})).status,401);
  const change={requestId:randomUUID(),action:'ASSIGN',employeeId:'HF101-B',employeeVersion:1,scope,roles:['ROLE_ADMINISTRATOR'],
   expectedRevision:0,effectiveFrom:new Date(Date.now()-2000).toISOString(),effectiveTo:null,reason:'Disposable verified owner role assignment'};
  const grant=await invoke(owner,change,contextId);
  assert.equal(grant.status,200,JSON.stringify(grant));assert.equal(grant.data.state,'SAVED_VERIFIED');assert.equal(grant.data.revision,1);
  const assigned=await invoke(employee,{action:'BOOTSTRAP'});
  assert.equal(assigned.status,200);assert.equal(assigned.data.actorEmployeeId,'HF101-B');assert.deepEqual(assigned.data.scopes,[scope]);
  const employeeContext=String(assigned.data.contextId);
  const denied=await invoke(employee,{...change,requestId:randomUUID(),employeeId:'HF101-A',reason:'Disposable denied escalation'},employeeContext);
  assert.equal(denied.status,403);
  assert.equal((await invoke(owner,{action:'SEARCH',scope:{...scope,warehouseId:'OTHER-WH'},query:'Synthetic'},contextId)).status,403);
  // Canonical employment mutation is simulated by the disposable owner only.
  // It must invalidate the existing signed employee session immediately.
  await admin.query("UPDATE hft.employee SET active=false,version=version+1 WHERE legal_entity_id='HF101-HFT' AND employee_id='HF101-B'");
  assert.equal((await invoke(employee,{action:'BOOTSTRAP'})).status,401);
  await assert.rejects(current(request(employee,{action:'BOOTSTRAP'})),/HF101_EMPLOYEE_SESSION_DENIED/);
  await admin.query("UPDATE hft.employee SET active=true,version=version+1 WHERE legal_entity_id='HF101-HFT' AND employee_id='HF101-B'");
  assert.equal((await invoke(employee,{action:'BOOTSTRAP'})).status,401);
  const renewed=await claim('b@example.invalid','20002');
  assert.equal((await invoke(renewed,{action:'BOOTSTRAP'})).status,200);
  const revoke=await invoke(owner,{...change,requestId:randomUUID(),action:'REVOKE',employeeVersion:3,expectedRevision:1,roles:[],
   effectiveFrom:new Date().toISOString(),reason:'Disposable verified owner role revocation'},contextId);
  assert.equal(revoke.status,200,JSON.stringify(revoke));assert.equal(revoke.data.state,'SAVED_VERIFIED');assert.equal(revoke.data.revision,2);
  assert.equal((await invoke(renewed,{action:'BOOTSTRAP'})).status,401);
  const history=await invoke(owner,{action:'VIEW',scope,employeeId:'HF101-B',beforeRevision:3},contextId);
  assert.equal(history.status,200);assert.equal(history.data.state,'READ_VERIFIED');assert.equal(history.data.status,'REVOKED');
  assert.deepEqual(history.data.history.map((x:{action:string})=>x.action),['REVOKE','ASSIGN']);
  assert.deepEqual(history.data.effectivePermissions,[]);
  console.log('HF101_ROLE_SERVICE_PG18=PASS; actual handleRoleApi/PostgresRoleStore, signed fixture cookies, role grant/revoke persistence, cross-scope and escalation denial, deactivation/reactivation stale-session rejection and audit readback');
 }finally{await Promise.all([role.end(),identity.end(),admin.end()]);}
}
main().catch(e=>{console.error('HF101_ROLE_SERVICE_PG18=FAIL',e);process.exitCode=1;});
