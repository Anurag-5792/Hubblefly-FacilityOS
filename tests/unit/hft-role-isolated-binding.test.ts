/** Source tests ONLY: real signature checks, synthetic SQL rows, zero DB use. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {offlineQualificationFixture,offlineSessionRequest} from '../support/role077-isolated-fixture.ts';
import {assertRoleQualificationProfile,verifyQualificationAdmission,assertQualificationConnection,QUAL077_BINDING_SQL}
 from '../../lib/hft/roles/role-isolated-profile.ts';
import {assertRoleBackendProfile,rolePoolOptions} from '../../lib/hft/roles/role-backend.ts';
import {assertRetainedStoresProfile} from '../../lib/hft/stores/ops-a2-retained-profile.ts';
import {assertProtectedPostingEnvironment,withProtectedPostingTransaction}
 from '../../lib/hft/persistence/protected-posting-transaction.ts';
import {assertOnlinePgTransport} from '../../lib/hft/persistence/online-pg-transport.ts';
import {resolveVerifiedRequestOperator} from '../../lib/hft/security/verified-request.ts';
import {requireBoundRoleOperationFence,bindRoleOperationFence} from '../../lib/hft/roles/role-operation-fence.ts';
import type {PgPool,PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';

test('isolated admission uses distinct real validators, never a retained profile alias (offline signature)',()=>{
 const f=offlineQualificationFixture();try{
  assert.deepEqual(assertRoleQualificationProfile(f.env),f.admission);
  assert.doesNotThrow(()=>assertRoleBackendProfile(f.env));
  assert.equal(rolePoolOptions(f.env).user,f.admission.logins.role);
  assert.equal(assertProtectedPostingEnvironment(f.env).login,f.admission.logins.stock);
  assert.equal(assertOnlinePgTransport(f.env,'P2_STORES').database,f.admission.target.database);
  assert.throws(()=>assertOnlinePgTransport(f.env,'P3_MASTERS'));
  assert.throws(()=>assertRetainedStoresProfile(f.env));
 }finally{f.cleanup();}
});
test('isolated profile denies production, retained spoof, test bypass, missing role and shared credentials before connection',async()=>{
 const f=offlineQualificationFixture();try{
  for(const patch of [{NODE_ENV:'test'},{VERCEL:'1'},{VERCEL_ENV:'production'},{HFT_ENVIRONMENT:'production'},
   {HFT_ENVIRONMENT:'test'},{HFT_STORES_RUNTIME_PROFILE:undefined},{HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:undefined},
   {HFT_ROLE_PG_DATABASE:'hft_r1_retained_masters_np077'},{HFT_STORES_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t'},
   {HFT_P2_RUNTIME_LOGIN:f.admission.logins.role},{HFT_QUAL077_SOURCE_TREE:'0'.repeat(40)},
   {HFT_QUAL077_ADMISSION_FILE:undefined},{HFT_POSTING_RUN_MODE:'ISOLATED_ONLINE_DB_TEST'},
   {HFT_TEST_PG_DATABASE:f.admission.target.database},{HFT_LIVE_POSTING_ENABLED:'true'}]){
   const env={...f.env,...patch};let calls=0;
   const pool:PgPool={connect:async()=>{calls++;throw Error('must not connect');}};
   await assert.rejects(withProtectedPostingTransaction(pool,env,async()=>{throw Error('callback must not run');}));
   assert.equal(calls,0);assert.throws(()=>assertRoleBackendProfile(env));
  }
 }finally{f.cleanup();}
});
test('signed admission rejects expiry, malformed fixture identity, tampering and an unassigned executor',()=>{
 const f=offlineQualificationFixture();try{
  for(const a of [{...f.admission,executor:'UNASSIGNED'},{...f.admission,fixtureOnly:false},
   {...f.admission,expiresAt:new Date(Date.now()-1).toISOString()},
   {...f.admission,target:{...f.admission.target,branch:'br-shiny-night-b3qgsj8t'}},
   {...f.admission,permissions:['catalog']},
   {...f.admission,logins:{...f.admission.logins,role:'hft_r1_owner_qual077'}}]){
   const bytes=f.resign(a as typeof f.admission);assert.throws(()=>verifyQualificationAdmission(bytes,f.env));
  }
  f.resign(f.admission);writeFileSync(f.env.HFT_QUAL077_ADMISSION_FILE!,'{}');
  assert.throws(()=>assertRoleQualificationProfile(f.env));
 }finally{f.cleanup();}
});
test('isolated route identity still verifies Ed25519 and rejects genuine/non-fixture claim namespaces',()=>{
 const f=offlineQualificationFixture();try{
  const request=offlineSessionRequest(f.env,f.sessionKey);
  assert.equal(resolveVerifiedRequestOperator(request,f.env,'ISOLATED_ROLE_QUALIFICATION').subject,'QUAL077-OPERATOR');
  assert.throws(()=>resolveVerifiedRequestOperator(offlineSessionRequest(f.env,f.sessionKey,{sub:'real-person'}),f.env,'ISOLATED_ROLE_QUALIFICATION'));
  const forged=new Request(request,{headers:{...Object.fromEntries(request.headers),cookie:request.headers.get('cookie')!.slice(0,-10)+'AAAAAAAAAA'}});
  assert.throws(()=>resolveVerifiedRequestOperator(forged,f.env,'ISOLATED_ROLE_QUALIFICATION'));
 }finally{f.cleanup();}
});
test('same actual database binding rejects replaced marker, wrong OID, extra rows and mutable definitions (SQL metadata doubles)',async()=>{
 const f=offlineQualificationFixture();try{
  const base={admission_sha256:f.env.HFT_QUAL077_ADMISSION_SHA256,payload:f.admission,db:f.admission.target.database,
   db_oid:'12345',login:f.admission.logins.role,role:f.admission.logins.role,address:'127.0.0.1',port:5432,version:'180007',
   singular:true,readonly_binding:true,immutable:true,protected_column_access:false};
  const client=(patch:Record<string,unknown>={})=>({async query<T extends Record<string,unknown>>(sql:string){assert.equal(sql,QUAL077_BINDING_SQL);return {rows:[{...base,...patch} as unknown as T]};}});
  await assertQualificationConnection(client(),f.env,'role');
  for(const patch of [{db_oid:'54321'},{payload:{}},{singular:false},{readonly_binding:false},{immutable:false},{role:f.admission.logins.stock}])
   await assert.rejects(assertQualificationConnection(client(patch),f.env,'role'));
 }finally{f.cleanup();}
});
test('stock operation fence is mandatory and compares actual role/stock database identity (SQL doubles)',async()=>{
 let reads=0;const p={} as PgPool;
 const c={query:async()=>({rows:[{acquired:true,db:'fixture',db_oid:'1',address:'127.0.0.1',port:5432,isolation:'serializable',read_only:'off'}],rowCount:1}),release(){}} as PgQueryClient;
 await assert.rejects(requireBoundRoleOperationFence(p,c,'fixture',false),/NOT_ADMITTED/);
 bindRoleOperationFence(p,'fixture',async()=>{reads++;return {database:'fixture',oid:'2',address:'127.0.0.1',port:5432};});
 await assert.rejects(requireBoundRoleOperationFence(p,c,'fixture',false),/ACTUAL_DATABASE_MISMATCH/);assert.equal(reads,1);
});
test('isolation path cannot silently select legacy transaction or callback; public HTTP controls unchanged',()=>{
 const src=readFileSync('lib/hft/persistence/protected-posting-transaction.ts','utf8');
 assert.match(src,/isRetainedStoresProfile\(env\)\|\|isRoleQualificationAttempt\(env\)\)\s*await requireBoundRoleOperationFence/);
 for(const file of ['app/api/hft/stores/receive/route.ts','app/api/hft/stores/read/route.ts']){
  const s=readFileSync(file,'utf8');assert.match(s,/ISOLATED_ROLE_QUALIFICATION/);assert.match(s,/roleBinding.bind/);
  assert.doesNotMatch(s,/TEST=true|barrier|pause|hft_qual077/);
 }
 assert.doesNotMatch(readFileSync('middleware.ts','utf8'),/QUAL077|ISOLATED_ROLE_QUALIFICATION/);
 const sql=readFileSync('lib/hft/roles/role-postgres.ts','utf8');
 assert.doesNotMatch(sql,/FOR SHARE/);assert.match(sql,/FOR UPDATE OF s'/);
 assert.ok(sql.indexOf('pg_advisory_lock(')<sql.indexOf("scope?'BEGIN"));
 assert.match(sql,/c.release\(discard\|\|scope!==null\|\|sessionFence\)/);
});

test('qualified isolated envelope executes mandatory fence and fresh role check before callback (SQL doubles)',async()=>{
 const f=offlineQualificationFixture();try{
  const {withProtectedReadbackTransaction}=await import('../../lib/hft/persistence/protected-posting-transaction.ts');
  for(const readOnly of [false,true])for(const binding of [false,true]){
   let called=false,fresh=0;const order:string[]=[];
   const db=f.admission.target.database,login=f.admission.logins.stock;
   const pool:PgPool={connect:async()=>({
    async query<T extends Record<string,unknown>>(sql:string){
     order.push(sql);let row:Record<string,unknown>|null=null;
     if(sql.includes('AS db_name'))row={db_name:db,db_login:login,db_role:login,server_address:'127.0.0.1',server_port:5432};
     else if(sql.includes('pg_stat_ssl'))row={tls_enabled:true,tls_version:'TLSv1.3',tls_cipher:'OFFLINE-CIPHER'};
     else if(sql.includes('function_count'))row={function_count:4,functions_secure:true,gateway_owner_count:4,unexpected_functions:0,
      direct_relation_grants:0,privileged_memberships:0,schema_usage:true,schema_create:false,secret_usage:false,crypto_usage:false,
      nonprivileged_login:true,server_version_num:180007};
     else if(sql===QUAL077_BINDING_SQL)row={admission_sha256:f.env.HFT_QUAL077_ADMISSION_SHA256,payload:f.admission,db,db_oid:'12345',
      login,role:login,address:'127.0.0.1',port:5432,version:'180007',singular:true,readonly_binding:true,immutable:true,protected_column_access:false};
     else if(sql.includes('pg_try_advisory_xact_lock_shared'))row={acquired:true,db,db_oid:'12345',address:'127.0.0.1',port:5432,
      isolation:readOnly?'repeatable read':'serializable',read_only:readOnly?'on':'off'};
     else assert.match(sql,/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK)/);
     return {rows:row?[row as T]:[],rowCount:row?1:0};
    },release(){}})};
   if(binding)bindRoleOperationFence(pool,db,async()=>{fresh++;order.push('FRESH_ROLE');return {database:db,oid:'12345',address:'127.0.0.1',port:5432};});
   const work=(readOnly?withProtectedReadbackTransaction:withProtectedPostingTransaction)(pool,f.env,async()=>{called=true;order.push('CALLBACK');return 7;});
   if(binding){assert.equal(await work,7);assert.equal(fresh,1);assert.ok(order.indexOf('FRESH_ROLE')<order.indexOf('CALLBACK'));}
   else{await assert.rejects(work,/ROLE_OPERATION_FENCE_NOT_ADMITTED/);assert.equal(called,false);assert.equal(fresh,0);}
   assert.ok(order.some(s=>s===QUAL077_BINDING_SQL));assert.ok(order.some(s=>s.includes('function_count')));
  }
 }finally{f.cleanup();}
});
