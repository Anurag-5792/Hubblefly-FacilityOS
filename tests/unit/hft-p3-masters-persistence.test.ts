/** Scripted SQL client tests, not real PostgreSQL integration qualification. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleP3MasterRequest} from '../../lib/hft/masters/p3-service.ts';
import {assertP3Environment,withP3Database} from '../../lib/hft/masters/p3-database.ts';
import {CommitOutcomeUncertain,type PgPool,type PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
const env:Record<string,string>={NODE_ENV:'test',HFT_ENVIRONMENT:'test',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',HFT_MASTERS_SOURCE:'postgres_review',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_master_testlogin',HFT_P3_RUNTIME_LOGIN:'hft_r1_master_testlogin',
 HFT_P3_SIGNING_KEY_VERSION:'1',HFT_P3_SIGNING_KEY_BASE64:Buffer.alloc(32,9).toString('base64')};
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const command={intent:'SUBMIT',change:{contractVersion:'HFT-R1-P3-MASTER-V1',
 requestId:'11111111-1111-4111-8111-111111111111',kind:'EMPLOYEE',operation:'CREATE',
 ...scope,recordId:'EMP1',expectedVersion:'0',reason:'Register synthetic operator',
 values:{fullName:'Synthetic Employee',department:'Stores',designation:'Operator',siteId:'SITE1'}}};
function fixture(mode:'normal'|'denied'|'lostCommit'|'badReadback'='normal'){
 const sqls:string[]=[],parameters:readonly unknown[][]=[],releases:boolean[]=[];
 const pool:PgPool={async connect(){
  const client:PgQueryClient={async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
   sqls.push(sql);parameters.push(params);
   if(sql.includes('SELECT current_database()'))return {rows:[{
    db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
    server_address:'127.0.0.1',server_port:54329}] as Row[],rowCount:1};
   if(sql.includes('FROM hft.p3_master_actor_grant'))
    return {rows:mode==='denied'?[]:[{may_read:true,may_submit:true}] as Row[],rowCount:1};
   if(sql.includes('SELECT hft.p3_submit_master_change_v1('))
    return {rows:[{request_id:command.change.requestId}] as Row[],rowCount:1};
   if(sql.includes('SELECT request_id::text,state'))
    return {rows:[{request_id:command.change.requestId,
     state:mode==='badReadback'?'APPROVED':'PENDING_APPROVAL'}] as Row[],rowCount:1};
   if(sql.includes('FROM hft.p3_master_read_v1'))
    return {rows:[{record_id:'EMP1',kind:'EMPLOYEE',version:1,active:false,
     values:{fullName:'Synthetic Employee'}}] as Row[],rowCount:1};
   if(sql==='COMMIT'&&mode==='lostCommit')throw new Error('SYNTHETIC_LOST_COMMIT_RESPONSE');
   return {rows:[] as Row[],rowCount:0};
  },release(discard?:boolean){releases.push(discard===true);}};
  return client;
 }};
 return {pool,sqls,parameters,releases};
}
test('submit is one protected SQL function, one immutable persisted pending readback',async()=>{
 const x=fixture();
 const result=await handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),command);
 assert.equal(result.state,'PENDING_APPROVAL');
 assert.equal(x.sqls.filter(s=>s.includes('p3_submit_master_change_v1(')).length,1);
 assert.equal(x.sqls.filter(s=>/INSERT INTO hft\.employee|UPDATE hft\.employee/i.test(s)).length,0);
 assert.ok(x.sqls.includes('BEGIN ISOLATION LEVEL SERIALIZABLE'));
 assert.equal(x.sqls.at(-1),'COMMIT');
 assert.deepEqual(x.releases,[false]);
 const req=x.parameters.find((p,i)=>x.sqls[i].includes('p3_submit_master_change_v1('));
 assert.ok(req);assert.equal(JSON.parse(String(req?.[0])).recordId,'EMP1');
 assert.equal(JSON.parse(String(req?.[1])).actorSubject,'STORE1');
});
test('list reads exact signed scope in READ ONLY transaction',async()=>{
 const x=fixture();
 const result=await handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),
  {intent:'LIST',kind:'EMPLOYEE',...scope,search:'EMP'});
 assert.equal(result.state,'AVAILABLE');assert.equal(result.records.length,1);
 assert.ok(x.sqls.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.ok(x.sqls.every(s=>!s.includes('p3_submit_master_change_v1')));
});
test('denied master grant prevents posting or persistence',async()=>{
 const x=fixture('denied');
 await assert.rejects(handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),command),
 /P3_PERSISTED_MASTER_PERMISSION_DENIED/);
 assert.ok(x.sqls.includes('ROLLBACK'));
 assert.equal(x.sqls.filter(s=>s.includes('p3_submit_master_change_v1(')).length,0);
});
test('missing durable PENDING readback rolls back, never claims master approval',async()=>{
 const x=fixture('badReadback');
 await assert.rejects(handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),command),
 /P3_SUBMISSION_DURABLE_READBACK_MISSING/);
 assert.ok(x.sqls.includes('ROLLBACK'));assert.equal(x.releases[0],false);
});
test('ambiguous COMMIT is never silently retried',async()=>{
 const x=fixture('lostCommit');
 await assert.rejects(handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),command),
 CommitOutcomeUncertain);
 assert.equal(x.sqls.filter(s=>s.includes('p3_submit_master_change_v1(')).length,1);
 assert.deepEqual(x.releases,[true]);
});
test('production and privileged connection identities rejected before connecting',async()=>{
 for(const patch of [{NODE_ENV:'production'},{PGUSER:'hft_engineering'},
 {PGHOST:'example.com'},{HFT_LIVE_POSTING_ENABLED:'true'},
 {HFT_MASTERS_SOURCE:'preview'}]){
  assert.throws(()=>assertP3Environment({...env,...patch}));
 }
 const x=fixture();
 await assert.rejects(withP3Database(x.pool,{...env,PGDATABASE:'hft_live'},true,
  async()=>true),/P3_ISOLATED_DATABASE_NOT_QUALIFIED/);
 assert.equal(x.sqls.length,0);
});
test('forged identity or wrong entity stops prior to database access',async()=>{
 const x=fixture();
 const op=verifiedFixtureOperator();
 await assert.rejects(handleP3MasterRequest(x.pool,env,{...op},command),
 /VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 await assert.rejects(handleP3MasterRequest(x.pool,env,op,
  {intent:'LIST',kind:'EMPLOYEE',...scope,legalEntityId:'DDL',search:''}),
 /SIGNED_SCOPE_DENIED/);
 assert.equal(x.sqls.length,0);
});
