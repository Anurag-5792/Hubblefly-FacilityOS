/** LIVE R1 source qualification only: synthetic credentials and SQL rows. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {identityEnv,signedToken} from '../support/signed-session-fixture.ts';
import {resolveVerifiedRequestOperator} from '../../lib/hft/security/verified-request.ts';
import {LIVE_R1_VERSION,LIVE_KINDS,validateLiveRequest} from '../../lib/hft/live/live-contract.ts';
import {LIVE_PROFILE,assertLiveProfile,livePgOptions} from '../../lib/hft/live/live-profile.ts';
import {LIVE_ADMISSION_SQL,admitLiveConnection,executeLive,type LivePool}
 from '../../lib/hft/live/live-service.ts';
const hex=(ch:string)=>ch.repeat(64);
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const origin='https://facilityos-live.example.org';
const env={...identityEnv,NODE_ENV:'production',HFT_ENVIRONMENT:'production-qualification',
 HFT_LIVE_R1_PROFILE:LIVE_PROFILE,HFT_LIVE_POSTING_ENABLED:'false',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_R1_TARGET_ADMISSION_SHA256:hex('a'),HFT_LIVE_R1_INSTALLER_SHA256:hex('b'),
 HFT_LIVE_R1_MIGRATION_0001_SHA256:'72e3d0801ba29c156596a148e599e39256e7b05fadc3407ea9d139aed70bc898',
 HFT_LIVE_R1_MIGRATION_0002_SHA256:'6e26f6970a8963c16f279bd332b6b58391b4551a60f5809419af32afba4d559d',
 HFT_LIVE_R1_OIDC_ADMISSION_SHA256:hex('c'),
 HFT_LIVE_R1_BACKUP_RESTORE_SHA256:hex('d'),HFT_LIVE_R1_RELEASE_SHA256:hex('e'),
 HFT_LIVE_R1_PROJECT:'qualified-live-project',HFT_LIVE_R1_BRANCH:'br-independent-fixture',
 HFT_LIVE_R1_DATABASE:'hft_r1_live_fixture_077',HFT_LIVE_R1_DATABASE_OID:'12345',
 HFT_LIVE_R1_PG_VERSION:'180007',HFT_LIVE_R1_HOST:'fixture.db.example.org',
 HFT_LIVE_R1_APPROVED_HOST:'fixture.db.example.org',HFT_LIVE_R1_PORT:'5432',
 HFT_LIVE_R1_LOGIN:'hft_r1_live_api_login',HFT_LIVE_R1_PASSWORD:'SYNTHETIC_NOT_REAL_CREDENTIAL_1234',
 HFT_LIVE_R1_CA_PEM:rootCertificates[0],HFT_PUBLIC_ORIGIN:origin};
const actor=()=>resolveVerifiedRequestOperator(new Request(origin+'/api/hft/live-masters',{
 method:'POST',headers:{origin,'sec-fetch-site':'same-origin',
 cookie:'__Host-hft_session='+signedToken()}}),env,'LIVE_R1_MASTERS');
const req={contractVersion:LIVE_R1_VERSION,intent:'SAVE',action:'CREATE',kind:'EMPLOYEE',scope,
 recordId:'EMP001',expectedRevision:0,requestId:'11111111-1111-4111-8111-111111111111',
 reason:'Authorized fixture-only record',values:{fullName:'Sample Employee',
 department:'Stores',designation:'Operator'}} as const;
const catalog={database_name:env.HFT_LIVE_R1_DATABASE,login:env.HFT_LIVE_R1_LOGIN,
 current_role:env.HFT_LIVE_R1_LOGIN,database_oid:'12345',
 server_address:'127.0.0.1',server_port:5432,version_num:'180007',
 replica:false,tls:true,tls_version:'TLSv1.3',schema_usage:true,schema_create:false,
 missing_functions:[],secure_function_count:4,extra_execute:0,table_access:0,column_access:0,
 protected_execute:0,owner_memberships:0,restricted_login:true,table_count:5,protected_triggers:2,
 installed_binding:[{target_admission_sha256:env.HFT_LIVE_R1_TARGET_ADMISSION_SHA256,
 installer_sha256:env.HFT_LIVE_R1_INSTALLER_SHA256,release_sha256:env.HFT_LIVE_R1_RELEASE_SHA256,
 target_project:env.HFT_LIVE_R1_PROJECT,target_branch:env.HFT_LIVE_R1_BRANCH,database_oid:'12345'}],
 migrations:[{version:1,source_sha256:env.HFT_LIVE_R1_MIGRATION_0001_SHA256},
 {version:2,source_sha256:env.HFT_LIVE_R1_MIGRATION_0002_SHA256}]};
// Synthetic stream models the Node client TLS properties; it is NOT external TLS proof.
const fakeTls=(patch:Record<string,unknown>={})=>({encrypted:true,authorized:true,
 authorizationError:null,servername:env.HFT_LIVE_R1_HOST,
 remoteAddress:'192.0.2.15',remotePort:5432,getProtocol:()=> 'TLSv1.3',
 getCipher:()=>({name:'TLS_AES_256_GCM_SHA384'}),
 getPeerCertificate:()=>({raw:Buffer.from('synthetic-fixture'),
  subjectaltname:'DNS:'+env.HFT_LIVE_R1_HOST}),...patch});
const row={kind:'EMPLOYEE',legal_entity_id:'HFT',site_id:'SITE1',warehouse_id:'WH1',
 record_id:'EMP001',revision:1,values_json:req.values,deleted:false,
 state:'RECORDED_UNAPPROVED',created_by:'STORE1',updated_by:'STORE1',
 created_at:'2026-11-23T00:00:00Z',updated_at:'2026-11-23T00:00:00Z'};
function mock(patch:Record<string,unknown>={},failReadback=false,
 tlsPatch:Record<string,unknown>={}){
 let commits=0,writes=0,connections=0,denied=0;
 const pool:LivePool={connect:async()=>{connections++;return {
 connection:{stream:fakeTls(tlsPatch)},
 async query<Row=Record<string,unknown>>(sql:string,params?:unknown[]){
  let rows:Record<string,unknown>[]=[];
  if(sql===LIVE_ADMISSION_SQL)rows=[{...catalog,...patch}];
  else if(sql.includes('save_v1')){writes++;rows=[{evidence:{state:'COMMITTED_UNAPPROVED',
   record:row,auditSha256:hex('f'),requestId:req.requestId}}];}
  else if(sql.includes('get_v1'))rows=[{evidence:{state:'AUTHORITATIVE_UNAPPROVED',
    record:failReadback?null:row}}];
  else if(sql.includes('history_v1'))rows=[{evidence:{state:'AUTHORITATIVE_UNAPPROVED',
   history:[{request_id:req.requestId,event_sha256:hex('f'),revision:1}]}}];
  else if(sql.includes('list_v1'))rows=[{evidence:{state:'AUTHORITATIVE_UNAPPROVED',records:[row]}}];
  else if(sql==='COMMIT')commits++;
  else if(!['ROLLBACK'].includes(sql)&&!sql.startsWith('BEGIN')&&!sql.startsWith('SET LOCAL'))
   {denied++;throw Error('UNEXPECTED_SQL');}
  void params;
  return {rows:rows as unknown as Row[]};
 },release(){}};
 },end:async()=>{}};
 return {pool,commits:()=>commits,writes:()=>writes,connections:()=>connections,denied:()=>denied};
}
test('production profile is distinct from retained and Draft and requires TLS, OIDC, backup and target admission',()=>{
 assert.doesNotThrow(()=>assertLiveProfile(env));
 assert.equal(livePgOptions(env).database,env.HFT_LIVE_R1_DATABASE);
 for(const p of [{HFT_LIVE_R1_PROFILE:undefined},{HFT_ENVIRONMENT:'production',VERCEL_ENV:'preview'},
  {HFT_LIVE_R1_DATABASE:'hft_r1_retained_masters_np077'},
  {HFT_LIVE_R1_PROJECT:'wandering-cake-50222227'},
  {HFT_DRAFT_RUNTIME_PROFILE:'HFT_R1_DRAFT'}, {HFT_STORES_RUNTIME_PROFILE:'retained'},
  {HFT_LIVE_POSTING_ENABLED:'true'},{HFT_LIVE_R1_BACKUP_RESTORE_SHA256:undefined},
  {HFT_LIVE_R1_OIDC_ADMISSION_SHA256:undefined},{HFT_LIVE_R1_CA_PEM:'INVALID'},
  {PGUSER:'postgres'},{HFT_LIVE_R1_LOGIN:'hft_r1_posting_owner'}])
  assert.throws(()=>assertLiveProfile({...env,...p}));
});
test('all six kinds validate exact values and delete means soft delete only',()=>{
 assert.equal(LIVE_KINDS.length,6);
 for(const kind of LIVE_KINDS){
  const values:Record<string,string>=
   kind==='EMPLOYEE'?{fullName:'Test',department:'Stores',designation:'Operator'}:
   kind==='ITEM'?{uom:'PCS',controlType:'NONE'}:kind==='SUPPLIER'?{legalName:'Vendor'}:
   kind==='WAREHOUSE'?{name:'Main'}:kind==='LOCATION'?{parentLocationId:''}:{siteName:'Primary'};
  const id=kind==='SITE'?'SITE1':kind==='WAREHOUSE'?'WH1':'EMP001';
  assert.equal(validateLiveRequest({...req,kind,recordId:id,values}).kind,kind);
 }
 assert.throws(()=>validateLiveRequest({...req,values:{...req.values,approved:true}}));
 assert.throws(()=>validateLiveRequest({...req,values:{...req.values,active:true}}));
 assert.equal((validateLiveRequest({...req,action:'DELETE',expectedRevision:1,values:{}}) as {action:string}).action,'DELETE');
 assert.throws(()=>validateLiveRequest({...req,action:'DELETE',expectedRevision:1}));
});
test('restricted catalog denies absent functions, TLS/owner and table or column privileges',async()=>{
 for(const patch of [{missing_functions:['hft_live_r1.save_v1']},
 {schema_create:true},{table_access:1},{column_access:1},
 {protected_execute:1},{owner_memberships:1},{secure_function_count:3},
 {installed_binding:[]},{protected_triggers:0},{migrations:[]},{restricted_login:false}]){
  const m=mock(patch);await assert.rejects(admitLiveConnection(await m.pool.connect(),env),
   /NOT_ADMITTED/);assert.equal(m.writes(),0);
 }
});
test('Neon proxy backend TLS flag is diagnostic; client TLS must independently verify',async()=>{
 const good=mock({tls:false,tls_version:null});
 await assert.doesNotReject(admitLiveConnection(await good.pool.connect(),env));
 for(const tlsPatch of [{authorized:false},{encrypted:false},{servername:'wrong.example.org'},
  {getProtocol:()=> 'TLSv1.1'},
  {getPeerCertificate:()=>({raw:Buffer.from('synthetic-fixture'),
   subjectaltname:'DNS:wrong.example.org'})}]){
  const bad=mock({tls:false,tls_version:null},false,tlsPatch);
  await assert.rejects(admitLiveConnection(await bad.pool.connect(),env),
   /CLIENT_TLS_NOT_VERIFIED/);
  assert.equal(bad.writes(),0);
 }
});
test('source Employee CREATE commits then independently reads record and audit revision',async()=>{
 const m=mock(),r=await executeLive(m.pool,env,actor(),req) as {state:string;record:{revision:number}};
 assert.equal(r.state,'SAVED_VERIFIED');assert.equal(r.record.revision,1);
 assert.equal(m.commits(),3);assert.equal(m.connections(),3);assert.equal(m.writes(),1);
});
test('lost post-commit readback returns reconciliation/no retry with one write',async()=>{
 const m=mock({},true);
 await assert.rejects(executeLive(m.pool,env,actor(),req),/NO_RETRY/);
 assert.equal(m.writes(),1);
});
test('validated signed scope prevents cross-warehouse operation before PostgreSQL',async()=>{
 const m=mock();
 await assert.rejects(executeLive(m.pool,env,actor(),{...req,scope:{...scope,warehouseId:'OTHER'}}),/SIGNED_SCOPE_DENIED/);
 assert.equal(m.connections(),0);
});
