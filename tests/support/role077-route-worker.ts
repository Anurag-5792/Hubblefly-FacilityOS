/** Actual RECEIVE/read POST handlers + actual protected transaction envelope.
 * Offline two-session lock model. Identity, SQL clients and ledger calls are
 * doubles; this is NOT PostgreSQL concurrency, corporate evidence or browser QA.
 */
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import type {PgPool,PgQueryClient,IsolatedPgEnvironment} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import type {RoleTransaction} from '../../lib/hft/roles/role-service.ts';
const db='hft_r1_retained_masters_np077',login='hft_r1_stores_np_login';
const scope={legalEntityId:'HFT',siteId:'SITE01',warehouseId:'WH01'};
const op={...scope,requestId:'00000000-0000-4000-8000-000000000077',kind:'IN',qcState:'ACCEPTED',
 itemCode:'ITEM01',productVersion:'V1',quantity:'5',leafLocationId:'BIN01',serialNo:'',batchNo:'B1'};
const session={subject:'operator',sessionId:'signed-session',expiresAt:Math.floor(Date.now()/1000)+3600,
 scope:{legalEntityId:'HFT',siteId:'SITE01',warehouseIds:['WH01']}};
const actor={...session,employeeId:'EMP01',personId:'PERSON01',scopes:[scope]};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
let state:ReturnType<typeof reset>;
function reset(){return {allowed:true,reads:0,closedRolePools:0,stockCalls:0,readCalls:0,
 shared:0,busy:false,unknownCommit:false,waitBefore:false,waitDuring:false,
 before:deferred(),resumeBefore:deferred(),during:deferred(),resumeDuring:deferred(),
 unlocked:deferred(),revocationCommitted:false,events:[] as string[]};}
const tx={
 async principal(){return actor;},async scopes(){return [scope];},
 async employee(){return {employeeId:'EMP01',personId:'PERSON01',fullName:'Offline',active:true,version:1};},
 async assignment(){return {employeeId:'EMP01',scope,revision:state.allowed?1:2,revokedFrom:null,
  periods:state.allowed?[{from:'2026-01-01T00:00:00.000Z',to:null,roles:['STORES_OPERATOR']}]:[]};}
} as unknown as RoleTransaction;
class Store {constructor(_pool:unknown,admit:()=>Promise<unknown>){this.admit=admit;}
 private readonly admit:()=>Promise<unknown>;
 async read<T>(work:(t:RoleTransaction)=>Promise<T>):Promise<T>{await this.admit();state.reads++;state.events.push('role-read');return work(tx);}}
let stockPool:PgPool&{end():Promise<void>};
function pool():typeof stockPool{return {async end(){},async connect(){
 if(state.waitBefore){state.before.resolve();await state.resumeBefore.promise;state.waitBefore=false;}
 let begun=false,readOnly=false,held=false;
 const release=()=>{if(held){held=false;state.shared--;if(!state.shared)state.unlocked.resolve();}};
 return {async query<Row extends Record<string,unknown>>(sql:string,params?:readonly unknown[]){
  let rows:Record<string,unknown>[]=[];
  if(sql.startsWith('BEGIN')){begun=true;readOnly=sql.includes('READ ONLY');state.events.push(readOnly?'begin-read-only':'begin-write');}
  else if(sql.includes('AS db_name'))rows=[{db_name:db,db_login:login,db_role:login,server_address:'127.0.0.1',server_port:5432}];
  else if(sql.includes('pg_try_advisory_xact_lock_shared')){
   assert.equal(begun,true);assert.deepEqual(params,[1212568624,77]);
   if(!state.busy){held=true;state.shared++;state.events.push('stock-fence');}
   rows=[{acquired:!state.busy,db,db_oid:'12345',address:'127.0.0.1',port:5432,isolation:readOnly?'repeatable read':'serializable',read_only:readOnly?'on':'off'}];
  }else if(sql==='COMMIT'||sql==='ROLLBACK'){
   state.events.push(sql);release();begun=false;
   if(sql==='COMMIT'&&state.unknownCommit){state.unknownCommit=false;throw Error('CONNECTION_LOST_AT_COMMIT');}
  }else assert.ok(sql.startsWith('SET LOCAL'),sql);
  return {rows:rows as Row[],rowCount:rows.length};
 },release(){release();}} as PgQueryClient;
 }};}
const m=(path:string,exports:Record<string,unknown>)=>mock.module(new URL(path,import.meta.url).href,{namedExports:exports});
m('../../lib/hft/security/verified-request.ts',{resolveVerifiedRequestOperator:()=>session,assertVerifiedRequestOperator:()=>{}});
m('../../lib/hft/stores/ops-a2-retained-profile.ts',{isRetainedStoresProfile:()=>true,assertRetainedStoresProfile:()=>{},STORES_GATEWAY_REVIEW_SHA256:'b'.repeat(64)});
m('../../lib/hft/roles/role-backend.ts',{assertRoleBackendProfile:()=>{},assertRoleConnection:async()=>({database:db,oid:'12345',address:'127.0.0.1',port:5432}),
 openRoleBackendPool:()=>({async end(){state.closedRolePools++;}})});
m('../../lib/hft/roles/role-postgres.ts',{PostgresRoleStore:Store});
m('../../lib/hft/persistence/online-pg-transport.ts',{isOnlinePgTransport:()=>true,assertOnlinePgTransport:()=>{},
 assertOnlinePgBackendTls:async()=>{},assertOnlineBackendIdentity:()=>{}});
m('../../lib/hft/persistence/online-db-qualification.ts',{assertOnlineRuntimeCatalog:async()=>{}});
m('../../lib/hft/stores/p0-operations.ts',{validateP0Operation:()=>op});
m('../../lib/hft/stores/p0-readback.ts',{validateStoresQuery:(x:unknown)=>x,readP0Stores:()=>{throw Error('LEGACY_NOT_IN_SCOPE');}});
m('../../lib/hft/stores/p0-persistence.ts',{openP0Pool:()=>stockPool,storesReadSignerFromEnvironment:()=>{throw Error('LEGACY_NOT_IN_SCOPE');}});
m('../../lib/hft/stores/ops-a2-operator-signing.ts',{operationalStoresSigner:()=>({p0Key:Buffer.alloc(32),p0KeyVersion:1}),clearStoresSigner:()=>{}});
const {withProtectedPostingTransaction,withProtectedReadbackTransaction}=await import('../../lib/hft/persistence/protected-posting-transaction.ts');
m('../../lib/hft/persistence/ops-a2-stores-source.ts',{submitOpsA2QualifiedReceive:async(p:PgPool,e:IsolatedPgEnvironment)=>
 withProtectedPostingTransaction(p,e,async()=>{
  state.during.resolve();if(state.waitDuring)await state.resumeDuring.promise;
  state.stockCalls++;state.events.push('protected-operation');
  return {requestId:op.requestId,fact:{movements:[{},{}]}};
 })});
m('../../lib/hft/persistence/ops-a2-stores-readback.ts',{readOpsA2QualifiedSource:async(p:PgPool,e:IsolatedPgEnvironment,q:{intent:string})=>
 withProtectedReadbackTransaction(p,e,async()=>{
  state.during.resolve();if(state.waitDuring)await state.resumeDuring.promise;
  state.readCalls++;state.events.push('protected-read');
  return {sourceEpoch:'fixture',nextCursor:null,rows:q.intent==='MOVEMENTS'?
   [{commandUuid:op.requestId,accountKind:'EXTERNAL',movementId:'1',auditSha256:'a'.repeat(64)},
    {commandUuid:op.requestId,accountKind:'AVAILABLE',movementId:'2',auditSha256:'b'.repeat(64)}]:
   [{accountKind:'AVAILABLE',condition:'GOOD',leafLocationId:'BIN01',serialNo:'',batchNo:'B1',employeeId:'',quantity:'5'}]};
 })});
const receive=await import('../../app/api/hft/stores/receive/route.ts');
const read=await import('../../app/api/hft/stores/read/route.ts');
const env={NODE_ENV:'production',HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'RETAINED_STORES_OPERATIONAL_077',
 HFT_STORES_APPROVED_DATABASE:db,PGDATABASE:db,PGPORT:'5432',HFT_APPROVED_PG_PORT:'5432',HFT_P2_RUNTIME_LOGIN:login,
 HFT_ROLE_RESOURCE_PROJECT:'fixture-project',HFT_STORES_RESOURCE_PROJECT:'fixture-project',
 HFT_ROLE_RESOURCE_BRANCH:'fixture-branch',HFT_STORES_RESOURCE_BRANCH:'fixture-branch',
 HFT_ROLE_PG_DATABASE:db,HFT_ROLE_PG_HOST:'fixture.example.org',PGHOST:'fixture.example.org',HFT_ROLE_PG_PORT:'5432'};
Object.assign(process.env,env);
const request=(kind:string)=>new Request('https://fixture.example.org/api/hft/stores/'+kind,
 {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...scope,intent:'BALANCES'})});
async function revoke(){state.events.push('revoke-request');if(state.shared)await state.unlocked.promise;
 state.allowed=false;state.revocationCommitted=true;state.events.push('revoke-commit');}
for(const kind of ['receive','read'] as const){
 test(kind+': revoke after initial role-read completion denies at actual route transaction boundary',async()=>{
  state=reset();stockPool=pool();state.waitBefore=true;
  const result=(kind==='receive'?receive:read).POST(request(kind));await state.before.promise;
  assert.equal(state.reads,1);assert.equal(state.closedRolePools,1);await revoke();
  state.resumeBefore.resolve();const response=await result;
  assert.equal(response.status,403);assert.equal(state.stockCalls,0);assert.equal(state.readCalls,0);
  assert.equal(state.reads,2);assert.ok(state.events.includes('ROLLBACK'));
 });
 test(kind+': admitted operation holds fence until transaction completion; later revoke cannot overtake',async()=>{
  state=reset();stockPool=pool();state.waitDuring=true;
  const result=(kind==='receive'?receive:read).POST(request(kind));await state.during.promise;
  const revoking=revoke();await Promise.resolve();assert.equal(state.revocationCommitted,false);
  state.resumeDuring.resolve();const response=await result;await revoking;
  assert.ok(state.events.indexOf('COMMIT')<state.events.indexOf('revoke-commit'));
  assert.equal(kind==='receive'?state.stockCalls:state.readCalls,1);
  // RECEIVE committed, then denied fresh readback => reconciliation, never repost.
  assert.equal(response.status,kind==='receive'?409:200);
 });
}
test('actual route rejects competing exclusive fence and cannot execute stock callback',async()=>{
 state=reset();stockPool=pool();state.busy=true;
 const r=await receive.POST(request('receive'));assert.equal(r.status,403);assert.equal(state.stockCalls,0);
});
test('actual RECEIVE preserves unknown COMMIT no-blind-retry behavior',async()=>{
 state=reset();stockPool=pool();state.unknownCommit=true;
 const r=await receive.POST(request('receive'));assert.equal(r.status,409);assert.equal(state.stockCalls,1);
 assert.equal(state.readCalls,0);
});
test('actual RECEIVE success reauthorizes each posting/readback transaction',async()=>{
 state=reset();stockPool=pool();const r=await receive.POST(request('receive'));
 assert.equal(r.status,200);assert.equal(state.stockCalls,1);assert.equal(state.readCalls,2);
 assert.equal(state.reads,4);assert.equal(state.events.filter(e=>e==='begin-read-only').length,2);
});
test('same-database fence rejects a role backend on a different branch',async()=>{
 state=reset();stockPool=pool();process.env.HFT_ROLE_RESOURCE_BRANCH='other';
 try{const r=await receive.POST(request('receive'));assert.equal(r.status,503);assert.equal(state.reads,0);}
 finally{process.env.HFT_ROLE_RESOURCE_BRANCH=env.HFT_ROLE_RESOURCE_BRANCH;}
});
