/** Minimal Stores operator admission regression: no SQL, keys or stock writes. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rootCertificates} from 'node:tls';
import {identityEnv,signedToken} from '../support/signed-session-fixture.ts';
import {assertSecureStartup} from '../../lib/hft/security/authorization.ts';
import {resolveVerifiedRequestOperator} from '../../lib/hft/security/verified-request.ts';
import {STORES_PROFILE,assertRetainedStoresProfile,isRetainedStoresProfile}
 from '../../lib/hft/stores/ops-a2-retained-profile.ts';
import {assertProtectedPostingEnvironment,withProtectedPostingTransaction,withProtectedReadbackTransaction}
 from '../../lib/hft/persistence/protected-posting-transaction.ts';
import {assertOnlineRuntimeCatalog,ONLINE_RUNTIME_CATALOG_SQL}
 from '../../lib/hft/persistence/online-db-qualification.ts';
import {bindRoleOperationFence} from '../../lib/hft/roles/role-operation-fence.ts';
import type {PgPool,PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {assertP0PersistenceEnvironment} from '../../lib/hft/stores/p0-persistence.ts';
import {assertOnlinePgTransport,onlinePgPoolOptions}
 from '../../lib/hft/persistence/online-pg-transport.ts';
import {operationalStoresSigner,clearStoresSigner}
 from '../../lib/hft/stores/ops-a2-operator-signing.ts';
const origin='https://stores-np.example.org';
const host='ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech';
const env={...identityEnv,NODE_ENV:'production',
 HFT_ENVIRONMENT:'retained-stores-nonproduction',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',
 HFT_DATABASE_TRANSPORT:'ONLINE_TLS',
 HFT_ONLINE_DB_CREDENTIAL_SOURCE:'MANAGED_RUNTIME_SECRET',
 HFT_POSTING_RUN_MODE:'RETAINED_STORES_OPERATIONAL_077',
 HFT_OPS_A2_SOURCE_MODE:'OPS_A2_ADMITTED_STORES_OPERATOR_V1',
 HFT_STORES_SQL_CONTRACT:'HFT_R1_OPS_A2_OPERATIONAL_PG187_V2',
 HFT_STORES_RUNTIME_PROFILE:STORES_PROFILE,
 HFT_STORES_RESOURCE_PROJECT:'wandering-cake-50222227',
 HFT_STORES_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t',
 HFT_STORES_APPROVED_DATABASE:'hft_r1_retained_masters_np077',
 HFT_STORES_APPROVED_PG_VERSION:'180007',
 PGDATABASE:'hft_r1_retained_masters_np077',
 PGHOST:host,HFT_ONLINE_DB_ENDPOINT_HOST:host,
 PGPORT:'5432',HFT_APPROVED_PG_PORT:'5432',
 HFT_ONLINE_DB_BACKEND_PORT:'5432',
 HFT_P2_RUNTIME_LOGIN:'hft_r1_stores_np_login',
 HFT_ONLINE_P2_DB_PASSWORD:'SYNTHETIC_TEST_NO_REAL_SECRET_12345',
 HFT_ONLINE_DB_TLS_CA_PEM:rootCertificates[0],
 HFT_PUBLIC_ORIGIN:origin,
 HFT_STORES_APPROVED_OPERATOR_GATEWAY_SHA256:
  'b2c10d799b8a16b609de5d94fe8296d2b9cc4bfb7dfe701b22aec0a1f4b9e10d',
 HFT_STORES_OPERATOR_GATEWAY_ABI:'HF13_OPS_A2_OPERATOR_RECEIVE_V1',
 HFT_STORES_APPROVED_INSTALLER_SHA256:'a'.repeat(64),
 HFT_STORES_INDEPENDENT_EXECUTION_ADMISSION_SHA256:'b'.repeat(64),
 HFT_STORES_APPROVED_RESOURCE_SHA256:'c'.repeat(64),
 HFT_STORES_SIGNING_ENROLLMENT_SHA256:'d'.repeat(64),
 HFT_OPS_A2_POST_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),
 HFT_OPS_A2_POST_KEY_VERSION:'1',
 HFT_P0_STORES_KEY_BASE64:Buffer.alloc(32,9).toString('base64'),
 HFT_P0_STORES_KEY_VERSION:'1'
};
test('admitted retained Stores is logically separate from testing and production startup',()=>{
 assert.equal(isRetainedStoresProfile(env),true);
 assert.doesNotThrow(()=>assertRetainedStoresProfile(env));
 assert.throws(()=>assertSecureStartup(env),/PRODUCTION_STARTUP_NOT_AUTHORIZED/);
 assert.doesNotThrow(()=>assertProtectedPostingEnvironment(env));
 assert.doesNotThrow(()=>assertP0PersistenceEnvironment(env));
 const client=assertOnlinePgTransport(env,'P2_STORES');
 assert.equal(client.database,env.PGDATABASE);
 assert.equal(client.login,'hft_r1_stores_np_login');
 assert.equal(onlinePgPoolOptions(env,'P2_STORES').application_name,
  'hft-r1-ops-a2-stores-nonproduction');
 assert.throws(()=>assertOnlinePgTransport(env,'P3_MASTERS'),
  /HFT_ONLINE_DB_DISPOSABLE_DATABASE_REQUIRED/);
});
test('nonproduction Stores profile rejects absent technical admissions and unsafe identities',()=>{
 for(const patch of [
  {HFT_STORES_RUNTIME_PROFILE:undefined},
  {HFT_ENVIRONMENT:'production'},
  {HFT_LIVE_POSTING_ENABLED:'true'},
  {HFT_STORES_RESOURCE_PROJECT:'red-silence-36758131'},
  {HFT_STORES_RESOURCE_BRANCH:'wrong-branch'},
  {HFT_STORES_APPROVED_PG_VERSION:'180006'},
  {PGDATABASE:'hft_r1_disposable_qa'},
  {HFT_TEST_PG_DATABASE:'hft_r1_disposable_qa'},
  {HFT_P2_RUNTIME_LOGIN:'hft_r1_posting_owner'},
  {HFT_POSTING_RUN_MODE:'ISOLATED_ONLINE_DB_TEST'},
  {HFT_STORES_APPROVED_OPERATOR_GATEWAY_SHA256:'0'.repeat(64)},
  {HFT_STORES_OPERATOR_GATEWAY_ABI:'WRONG_GATEWAY'},
  {HFT_STORES_APPROVED_INSTALLER_SHA256:'0'.repeat(64)},
  {HFT_STORES_INDEPENDENT_EXECUTION_ADMISSION_SHA256:undefined},
  {HFT_STORES_SIGNING_ENROLLMENT_SHA256:'bad'},
  {HFT_AUTH_SOURCE:'sample'}
 ])assert.throws(()=>assertRetainedStoresProfile({...env,...patch}),
  /PROFILE_NOT_ADMITTED/);
});
test('online posting transport rejects ambient production credentials, invalid TLS or P3 overlap',()=>{
 for(const patch of [
  {DATABASE_URL:'postgres://wrong/db'},
  {PGHOSTADDR:'127.0.0.1'},
  {PGSSLMODE:'disable'},
  {PGHOST:'other.example.org'},
  {HFT_ONLINE_DB_TLS_CA_PEM:'bad'},
  {HFT_P3_RUNTIME_LOGIN:'hft_r1_stores_np_login'}
 ])assert.throws(()=>assertOnlinePgTransport({...env,...patch},'P2_STORES'));
});
test('operator signed cookie, scope, and managed enrolled keys are mandatory',()=>{
 const request=new Request(origin+'/api/hft/stores/receive',{
  method:'POST',headers:{origin,'sec-fetch-site':'same-origin',
   cookie:'__Host-hft_session='+signedToken()}});
 const actor=resolveVerifiedRequestOperator(request,env,'RETAINED_STORES_OPERATOR');
 assert.equal(actor.subject,'STORE1');
 assert.throws(()=>resolveVerifiedRequestOperator(request,env),
  /PRODUCTION_STARTUP_NOT_AUTHORIZED/);
 assert.throws(()=>resolveVerifiedRequestOperator(
  new Request(origin+'/api/hft/stores/receive',{method:'POST'}),env,
  'RETAINED_STORES_OPERATOR'),/REQUEST_ORIGIN_MISMATCH/);
 const signer=operationalStoresSigner(env);
 assert.equal(signer.key.length,32);
 clearStoresSigner(signer);
 assert.ok(signer.key.every(b=>b===0));
 assert.ok(signer.p0Key.every(b=>b===0));
 assert.throws(()=>operationalStoresSigner({...env,HFT_OPS_A2_POST_KEY_BASE64:undefined}),
  /SIGNER_MISSING/);
});
test('middleware allows only admitted operator RECEIVE and READ; no R77 or stock QA bypass',()=>{
 const code=readFileSync('middleware.ts','utf8');
 const receive=readFileSync('app/api/hft/stores/receive/route.ts','utf8');
 const read=readFileSync('app/api/hft/stores/read/route.ts','utf8');
 const a2=readFileSync('lib/hft/persistence/ops-a2-stores-source.ts','utf8');
 assert.match(code,/\/api\/hft\/stores\/receive/);
 assert.match(code,/\/api\/hft\/stores\/read/);
 assert.doesNotMatch(code,/storesOperatorRoutes\.add\(/);
 assert.match(receive,/submitOpsA2QualifiedReceive/);
 assert.match(receive,/OPS_A2_RECEIVE_OUTCOME_RECONCILE_NO_RETRY/);
 assert.match(read,/readOpsA2QualifiedSource/);
 const verify=readFileSync('lib/hft/persistence/online-db-qualification.ts','utf8');
 const reader=readFileSync('lib/hft/persistence/ops-a2-stores-readback.ts','utf8');
 for(const signature of [
  'ops_a2_operator_resolve_receive_v1(jsonb,jsonb)',
  'ops_a2_operator_post_receive_v1(jsonb,jsonb)',
  'ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)',
  'ops_a2_operator_read_receive_v1(jsonb,jsonb)'
 ]) assert.ok(verify.includes(signature),signature);
 assert.match(verify,/gateway_owner_count!==4/);
 assert.match(reader,/ops_a2_operator_read_receive_v1/);
 assert.match(a2,/ops_a2_operator_resolve_receive_v1/);
 assert.match(a2,/ops_a2_operator_post_receive_v1/);
 assert.match(a2,/ops_a2_operator_reconcile_receive_v1/);
 assert.match(a2,/assertSyntheticOnly\(env\)/);
 for(const content of [receive,read])
  assert.doesNotMatch(content,/hft_qa077|r77\.post_receive|INSERT INTO hft\.stock/);
});

test('operator catalog enforces four gateway-only EXECUTEs and exact non-login owner',async()=>{
 const base={function_count:4,functions_secure:true,
  gateway_owner_count:4,unexpected_functions:0,direct_relation_grants:0,
  privileged_memberships:0,schema_usage:true,schema_create:false,
  secret_usage:false,crypto_usage:false,nonprivileged_login:true,
  server_version_num:180007};
 let requested:string[]=[];
 function catalog(row:Record<string,unknown>):PgQueryClient{
  return {
   async query<T extends Record<string,unknown>>(_sql:string,params:readonly unknown[]=[]){
    requested=JSON.parse(String(params[0])) as string[];
    return {rows:[row as T],rowCount:1};
   },release(){}
  };
 }
 await assert.doesNotReject(assertOnlineRuntimeCatalog(catalog(base),'OPS_A2_STORES'));
 assert.deepEqual(requested,[
  'hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb)',
  'hft.ops_a2_operator_post_receive_v1(jsonb,jsonb)',
  'hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)',
  'hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)'
 ]);
 assert.equal(requested.some(s=>s.includes('post_stock_command_v2')||
  s.includes('resolve_authorized_v2')||s.includes('reconcile_post_v3')||
  s.includes('read_authoritative_v2')),false);
 for(const defect of [
  {gateway_owner_count:3},{server_version_num:180006},
  {unexpected_functions:1},{direct_relation_grants:1},
  {privileged_memberships:1},{schema_create:true},
  {secret_usage:true},{functions_secure:false},{function_count:3}
 ]){
  await assert.rejects(assertOnlineRuntimeCatalog(
   catalog({...base,...defect}),'OPS_A2_STORES'),
   /HFT_ONLINE_DB_RUNTIME_ACL_OR_SCHEMA_NOT_QUALIFIED/);
 }
});

// Exact retained profile: client TLS must precede even BEGIN. No real connection or stock writes.
test('retained RECEIVE/readback verifies proxy TLS and same-database role fence before callback',async()=>{
 for(const readOnly of [false,true]){
  for(const defect of ['none','tls','cidr','fence','catalog'] as const){
   const queries:string[]=[];let invoked=false;const released:boolean[]=[];
   const client:PgQueryClient={connection:{stream:{encrypted:true,authorized:defect!=='tls',authorizationError:null,
    servername:host,remoteAddress:'192.0.2.1',remotePort:5432,getProtocol:()=> 'TLSv1.3',
    getCipher:()=>({name:'TLS_AES_256_GCM_SHA384'}),
    getPeerCertificate:()=>({raw:Buffer.from('synthetic'),subjectaltname:'DNS:'+host})}},
    async query<T extends Record<string,unknown>>(sql:string){
     queries.push(sql);let rows:Record<string,unknown>[]=[];
     if(sql.includes('AS db_name'))rows=[{db_name:env.PGDATABASE,db_login:env.HFT_P2_RUNTIME_LOGIN,db_role:env.HFT_P2_RUNTIME_LOGIN,
      server_address:defect==='cidr'?'127.0.0.1/32':'127.0.0.1',server_port:5432}];
     else if(sql===ONLINE_RUNTIME_CATALOG_SQL)rows=[{function_count:4,functions_secure:true,gateway_owner_count:4,
      unexpected_functions:0,direct_relation_grants:defect==='catalog'?1:0,privileged_memberships:0,schema_usage:true,
      schema_create:false,secret_usage:false,crypto_usage:false,nonprivileged_login:true,server_version_num:180007}];
     else if(sql.includes('pg_try_advisory_xact_lock_shared'))rows=[{acquired:true,db:env.PGDATABASE,db_oid:'12345',address:'127.0.0.1',port:5432,
      isolation:readOnly?'repeatable read':'serializable',read_only:readOnly?'on':'off'}];
     else if(sql.includes('pg_stat_ssl'))throw Error('RETAINED_BACKEND_FLAG_IS_NOT_CLIENT_TLS');
     return {rows:rows as T[],rowCount:rows.length};
    },release(destroy){released.push(destroy===true);}};
   const pool:PgPool={connect:async()=>client};
   bindRoleOperationFence(pool,env.PGDATABASE,async()=>({database:env.PGDATABASE,oid:defect==='fence'?'54321':'12345',address:'127.0.0.1',port:5432}));
   const run=readOnly?withProtectedReadbackTransaction:withProtectedPostingTransaction;
   const work=()=>run(pool,env,async()=>{invoked=true;return 'VERIFIED_FIXTURE';});
   if(defect==='none'){
    assert.equal(await work(),'VERIFIED_FIXTURE');assert.equal(queries.at(-1),'COMMIT');
    assert.ok(queries.some(q=>q.includes('pg_catalog.host(inet_server_addr()) AS server_address')));
    assert.ok(queries.some(q=>q.includes('pg_catalog.host(inet_server_addr()) AS address')));
   }else{
    await assert.rejects(work());assert.equal(invoked,false);
    if(defect==='tls'){assert.deepEqual(queries,[]);assert.deepEqual(released,[true]);}
    else assert.equal(queries.at(-1),'ROLLBACK');
   }
  }
 }
});
