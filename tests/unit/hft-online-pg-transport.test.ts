/** Scripted online PG transport tests; no actual hosted DB or production posting. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {assertOnlinePgTransport,onlinePgPoolOptions,
 assertOnlinePgBackendTls,assertOnlineBackendIdentity}
 from '../../lib/hft/persistence/online-pg-transport.ts';
import {assertOnlineRuntimeCatalog,ONLINE_RUNTIME_CATALOG_SQL}
 from '../../lib/hft/persistence/online-db-qualification.ts';
import {withProtectedPostingTransaction,withProtectedReadbackTransaction}
 from '../../lib/hft/persistence/protected-posting-transaction.ts';
import {withP3Database} from '../../lib/hft/masters/p3-database.ts';
import type {PgPool,PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';

const base={NODE_ENV:'test',HFT_ENVIRONMENT:'test',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'ISOLATED_ONLINE_DB_TEST',
 HFT_DATABASE_TRANSPORT:'ONLINE_TLS',
 HFT_ONLINE_DB_CREDENTIAL_SOURCE:'MANAGED_RUNTIME_SECRET',
 HFT_ONLINE_DB_ENDPOINT_HOST:'pg.hft-stage.example.org',
 HFT_ONLINE_DB_TLS_CA_PEM:rootCertificates[0],
 HFT_ONLINE_DB_BACKEND_PORT:'5432',PGHOST:'pg.hft-stage.example.org',
 PGPORT:'5432',HFT_APPROVED_PG_PORT:'5432',
 PGDATABASE:'hft_r1_disposable_remoteunit',
 HFT_TEST_PG_DATABASE:'hft_r1_disposable_remoteunit',
 HFT_P2_RUNTIME_LOGIN:'hft_r1_testposting',
 HFT_P3_RUNTIME_LOGIN:'hft_r1_testmasters',
 HFT_ONLINE_P2_DB_PASSWORD:'SYNTHETIC_TEST_ONLY_P2_000001',
 HFT_ONLINE_P3_DB_PASSWORD:'SYNTHETIC_TEST_ONLY_P3_000001'};
const masterEnv={...base,HFT_MASTERS_SOURCE:'postgres_review'};
type Failure='none'|'tls'|'wrong-identity'|'direct-dml'|'missing-functions'|'commit';
function scripted(duty:'P2_STORES'|'P3_MASTERS',fail:Failure='none'){
 const queries:string[]=[],releases:boolean[]=[];
 const login=duty==='P2_STORES'?base.HFT_P2_RUNTIME_LOGIN:base.HFT_P3_RUNTIME_LOGIN;
 const client:PgQueryClient={
  async query<Row extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
   queries.push(sql);let rows:Record<string,unknown>[]=[];
   if(sql==='COMMIT'&&fail==='commit')throw Error('COMMIT_UNKNOWN');
   if(sql.includes('SELECT current_database()'))rows=[{
    db_name:base.PGDATABASE,
    db_login:fail==='wrong-identity'?'postgres':login,db_role:login,
    server_address:'10.10.10.5',server_port:5432}];
   else if(sql.includes('pg_catalog.pg_stat_ssl'))rows=[{
    tls_enabled:fail!=='tls',tls_version:'TLSv1.3',
    tls_cipher:'TLS_AES_256_GCM_SHA384'}];
   else if(sql===ONLINE_RUNTIME_CATALOG_SQL){
    const names=JSON.parse(String(args[0])) as string[];
    rows=[{function_count:fail==='missing-functions'?0:names.length,
      functions_secure:true,unexpected_functions:0,
      direct_relation_grants:fail==='direct-dml'?1:0,
      privileged_memberships:0,schema_usage:true,schema_create:false,
      secret_usage:false,crypto_usage:false,nonprivileged_login:true,
      server_version_num:180006}];
   }else if(sql==='SELECT 1 AS verified')rows=[{verified:1}];
   return {rows:rows as unknown as Row[],rowCount:rows.length};
  },release(destroy?:boolean){releases.push(destroy===true);}
 };
 const pool:PgPool={async connect(){return client;}};
 return {pool,queries,releases};
}
test('ONLINE TLS config enforces trusted CA, servername and separate logins',()=>{
 const p2=onlinePgPoolOptions(base,'P2_STORES');
 const p3=onlinePgPoolOptions(base,'P3_MASTERS');
 assert.equal(p2.user,base.HFT_P2_RUNTIME_LOGIN);
 assert.equal(p3.user,base.HFT_P3_RUNTIME_LOGIN);
 assert.notEqual(p2.password,p3.password);
 assert.equal((p2.ssl as Record<string,unknown>).rejectUnauthorized,true);
 assert.equal((p2.ssl as Record<string,unknown>).servername,base.PGHOST);
 assert.equal((p2.ssl as Record<string,unknown>).minVersion,'TLSv1.2');
 assert.equal(p2.max,2);
 assert.ok(!Object.hasOwn(p2,'connectionString'));
});
test('generic credentials, invalid CA, local host and missing roles fail before pool',()=>{
 for(const bad of [
  {PGUSER:'postgres'},{PGPASSWORD:'ambient'},
  {PGHOST:'localhost'},{PGHOST:'127.0.0.1'},
  {DATABASE_URL:'postgres://secret@example.invalid/db'},
  {PGSSLMODE:'disable'},{PGHOSTADDR:'10.0.0.1'},
  {HFT_ONLINE_DB_TLS_CA_PEM:'INVALID_CERT'},
  {HFT_ONLINE_DB_BACKEND_PORT:'0'},
  {HFT_P3_RUNTIME_LOGIN:base.HFT_P2_RUNTIME_LOGIN},
  {HFT_ONLINE_P2_DB_PASSWORD:'short'},
  {PGDATABASE:'hft_prod_live'}
 ])assert.throws(()=>assertOnlinePgTransport({...base,...bad},'P2_STORES'));
});
test('pooler port can differ from actual attested backend port',()=>{
 const e={...base,PGPORT:'6543',HFT_APPROVED_PG_PORT:'6543'};
 assert.equal(onlinePgPoolOptions(e,'P2_STORES').port,6543);
 assertOnlineBackendIdentity(e,{db_name:e.PGDATABASE,db_login:e.HFT_P2_RUNTIME_LOGIN,
  db_role:e.HFT_P2_RUNTIME_LOGIN,server_address:'10.0.0.2',server_port:5432},'P2_STORES');
});
test('online protected P2 transaction confirms TLS and ACL before callback',async()=>{
 const q=scripted('P2_STORES');
 const value=await withProtectedPostingTransaction(q.pool,base,async c=>
  (await c.query<{verified:number}>('SELECT 1 AS verified')).rows[0].verified);
 assert.equal(value,1);assert.deepEqual(q.releases,[false]);
 assert.ok(q.queries.includes(ONLINE_RUNTIME_CATALOG_SQL));
 assert.ok(q.queries.indexOf('SELECT 1 AS verified')>
   q.queries.indexOf(ONLINE_RUNTIME_CATALOG_SQL));
 assert.equal(q.queries.at(-1),'COMMIT');
});
test('wrong login, SSL absent, direct SQL DML or missing functions stop before callback',async()=>{
 for(const failure of ['tls','wrong-identity','direct-dml','missing-functions'] as const){
  const q=scripted('P2_STORES',failure);let called=false;
  await assert.rejects(withProtectedPostingTransaction(q.pool,base,async()=>{called=true;}));
  assert.equal(called,false);
  assert.ok(q.queries.includes('ROLLBACK'));
 }
});
test('independent P3 role shares database but not login or grant authority',async()=>{
 const q=scripted('P3_MASTERS');
 const value=await withP3Database(q.pool,masterEnv,true,async c=>
  (await c.query<{verified:number}>('SELECT 1 AS verified')).rows[0].verified);
 assert.equal(value,1);
 assert.ok(q.queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.ok(q.queries.includes(ONLINE_RUNTIME_CATALOG_SQL));
});
test('online staging cannot be reclassified as production with a flag',async()=>{
 for(const bad of [{NODE_ENV:'production'},{HFT_ENVIRONMENT:'production'},
   {HFT_LIVE_POSTING_ENABLED:'true'},{HFT_POSTING_RUN_MODE:'ONLINE_PRODUCTION'}]){
  const q=scripted('P2_STORES');
  await assert.rejects(withProtectedPostingTransaction(q.pool,{...base,...bad},
   async()=>true));
  assert.equal(q.queries.length,0);
 }
});
test('ambiguous COMMIT does not become a confirmed posting',async()=>{
 const q=scripted('P2_STORES','commit');
 await assert.rejects(withProtectedPostingTransaction(q.pool,base,async()=>true),
  /POSTGRES_COMMIT_OUTCOME_UNCERTAIN_VERIFY_IDEMPOTENCY_BEFORE_RETRY/);
 assert.deepEqual(q.releases,[true]);
 assert.equal(q.queries.filter(x=>x==='COMMIT').length,1);
});
test('TLS and SQL privilege checks reject fake backend evidence',async()=>{
 const q=scripted('P2_STORES','tls');
 await assert.rejects(assertOnlinePgBackendTls(await q.pool.connect()));
 const x=scripted('P2_STORES','direct-dml');
 await assert.rejects(assertOnlineRuntimeCatalog(await x.pool.connect(),'P2_STORES'));
});
test('readback remains a read-only transaction, not a second stock ledger',async()=>{
 const q=scripted('P2_STORES');
 const result=await withProtectedReadbackTransaction(q.pool,base,async c=>
  (await c.query<{verified:number}>('SELECT 1 AS verified')).rows[0].verified);
 assert.equal(result,1);
 assert.ok(q.queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.ok(!q.queries.some(x=>/INSERT INTO hft\.|UPDATE hft\./.test(x)));
});
