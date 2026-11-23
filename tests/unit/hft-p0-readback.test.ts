/** Scripted scoped SQL function tests, NOT live PostgreSQL readback acceptance. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {validateStoresQuery,issueStoresReadProof,readP0Stores}
 from '../../lib/hft/stores/p0-readback.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import type {PgPool,PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_STORES_P0_SOURCE:'qualified_disposable_review',
 HFT_STORES_P0_SQL_CONTRACT:'HFT_R1_P0_PERSISTENCE_V1',PGHOST:'127.0.0.1',
 PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_testlogin',HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
const query={contractVersion:'HFT-R1-P0-READ-V1',intent:'BALANCES',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'PART001',productVersion:'V1',leafLocationId:'BIN1',
 employeeId:'',cursor:'',limit:10};
type Mode='valid'|'crossTenant'|'wrongVersion'|'negative'|'fake'|'ackInvalid'|'overPage';
function fixture(intent='BALANCES'){
 const source={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'PART001',productVersion:'V1',leafLocationId:'BIN1',
 serialNo:'',batchNo:'',quantity:'3',employeeId:intent==='CUSTODY'?'EMP1':'',
 movementId:'',stockState:'AVAILABLE',
 humanAcknowledgement:intent==='CUSTODY'?'ACK_PENDING':'NOT_APPLICABLE',
 sourceVersion:'P2_VERSION_AWARE_V1'};
 return {state:'AUTHORITATIVE_READ',intent,durable:true,synthetic:false,
  versionAuthority:'P2_VERSION_AWARE_V1',auditVerified:true,sourceEpoch:'EPOCH1',
  nextCursor:'',rows:[source]};
}
function scripted(mode:Mode='valid',intent='BALANCES'){
 const queries:string[]=[];let connections=0;const release:boolean[]=[];
 const pg:PgPool={async connect(){
  connections++;
  const client:PgQueryClient={
   async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
    queries.push(sql);
    const pack=(r:unknown)=>({rows:[r as Row],rowCount:1});
    if(sql.includes('SELECT current_database()'))return pack({
     db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
     server_address:'127.0.0.1',server_port:54329});
    if(sql.includes('p0_read_authoritative_stores_v1')){
     const a=fixture(intent);
     if(mode==='crossTenant')a.rows[0].legalEntityId='OTHER';
     if(mode==='wrongVersion')a.rows[0].productVersion='V2';
     if(mode==='negative')a.rows[0].quantity='-3';
     if(mode==='fake')a.versionAuthority='PREVIEW_ONLY';
     if(mode==='ackInvalid')a.rows[0].humanAcknowledgement='AUTO_ACK';
     if(mode==='overPage')a.rows=Array.from({length:11},()=>({...a.rows[0]}));
     assert.equal(JSON.parse(String(params[0])).legalEntityId,'HFT');
     assert.equal(JSON.parse(String(params[1])).actorSubject,'STORE1');
     return pack({response:a});
    }
    return {rows:[] as Row[],rowCount:0};
   },release(d?:boolean){release.push(Boolean(d));}
  };return client;
 }};
 return {pg,queries,release,connections:()=>connections};
}
test('read contract rejects undeclared fields and cross-tenant scopes',()=>{
 assert.throws(()=>validateStoresQuery({...query,approved:true}),/EXACT_FIELDS/);
 assert.throws(()=>validateStoresQuery({...query,limit:101}),/LIMIT_INVALID/);
 assert.throws(()=>validateStoresQuery({...query,intent:'CUSTODY'}),/EMPLOYEE_REQUIRED/);
});
test('read HMAC binds scope, exact filters, cursor and verified actor',()=>{
 const actor=verifiedFixtureOperator(),key=randomBytes(32);
 const a=issueStoresReadProof(query,actor,key,1);
 const b=issueStoresReadProof({...query,productVersion:'V2'},actor,key,1);
 assert.notEqual(a.payloadSha256,b.payloadSha256);
 assert.equal(a.actorSubject,'STORE1');assert.match(a.macSha256,/^[0-9a-f]{64}$/);
});
test('scoped BALANCES read uses exactly one authorized read-only SQL function',async()=>{
 const m=scripted(),v=await readP0Stores(m.pg,env,query,verifiedFixtureOperator(),randomBytes(32),1);
 assert.equal(v.state,'AUTHORITATIVE_READ');assert.equal(v.durable,true);
 assert.equal(v.rows.length,1);assert.equal(m.connections(),1);
 assert.equal(m.queries.filter(x=>x.includes('p0_read_authoritative_stores_v1')).length,1);
 assert.ok(m.queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.ok(m.queries.every(x=>!/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+hft\./i.test(x)));
});
for(const [mode,expected] of [
 ['crossTenant','SCOPE_OR_VERSION'],['wrongVersion','FILTER_NOT_ENFORCED'],
 ['negative','NEGATIVE_BALANCE'],['fake','AUTHORITATIVE_SOURCE'],
 ['overPage','AUTHORITATIVE_SOURCE']] as const){
 test('reject '+mode+' DB readback',async()=>{
  const m=scripted(mode);
  await assert.rejects(readP0Stores(m.pg,env,query,verifiedFixtureOperator(),randomBytes(32),1),
   new RegExp(expected));
 });
}
test('actual employee acknowledgement must not be silently upgraded',async()=>{
 const m=scripted('ackInvalid','CUSTODY');
 await assert.rejects(readP0Stores(m.pg,env,{...query,intent:'CUSTODY',employeeId:'EMP1'},
  verifiedFixtureOperator(),randomBytes(32),1),/CUSTODY_ACK_INVALID/);
});
test('production and cross-site operator fail before opening pool',async()=>{
 const m=scripted();
 await assert.rejects(readP0Stores(m.pg,{...env,NODE_ENV:'production'},query,
  verifiedFixtureOperator(),randomBytes(32),1));
 await assert.rejects(readP0Stores(m.pg,env,{...query,siteId:'OTHER'},
  verifiedFixtureOperator(),randomBytes(32),1),/SIGNED_SCOPE_DENIED/);
 assert.equal(m.connections(),0);
});
