/** P3 scripted SQL-client tests; NOT PostgreSQL acceptance. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleP3MasterRequest,handleP3EmployeeDecision}
 from '../../lib/hft/masters/p3-service.ts';
import {assertP3Environment} from '../../lib/hft/masters/p3-database.ts';
import {CommitOutcomeUncertain,type PgPool,type PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';

const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const env:Record<string,string>={NODE_ENV:'test',HFT_ENVIRONMENT:'test',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',HFT_MASTERS_SOURCE:'postgres_review',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_master_testlogin',HFT_P3_RUNTIME_LOGIN:'hft_r1_master_testlogin',
 HFT_P3_SIGNING_KEY_VERSION:'1',HFT_P3_SIGNING_KEY_BASE64:Buffer.alloc(32,9).toString('base64'),
 HFT_P3_DECISION_SIGNING_KEY_VERSION:'1',
 HFT_P3_DECISION_SIGNING_KEY_BASE64:Buffer.alloc(32,11).toString('base64')};
const requestId='11111111-1111-4111-8111-111111111111';
const submit={intent:'SUBMIT',change:{
 contractVersion:'HFT-R1-P3-MASTER-V1',requestId,kind:'EMPLOYEE',
 operation:'CREATE',...scope,recordId:'EMP1',expectedVersion:'0',
 reason:'Register employee for stores duty',
 values:{fullName:'Synthetic Operator',department:'Stores',
  designation:'Operator',siteId:'SITE1'}}};
const review={decisionVersion:'HFT-R1-P3-EMPLOYEE-DECISION-V1',
 requestId,requestPayloadSha256:'a'.repeat(64),recordId:'EMP1',
 expectedVersion:'0',policyRevision:'1',decision:'APPROVED',
 evidenceSha256:'b'.repeat(64),reason:'Approved with independent evidence',...scope};
type Mode='standard'|'commitLost'|'noReadback'|'crossEntity'|'wrongDecision';
function scripted(mode:Mode='standard'){
 const sqls:string[]=[],params:(readonly unknown[])[]=[],released:boolean[]=[];
 let connections=0;
 const pool:PgPool={async connect(){
  const session=++connections;
  const client:PgQueryClient={
   async query<Row extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
    sqls.push(sql);params.push(args);
    if(sql.includes('SELECT current_database()'))return {rows:[{
     db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
     server_address:'127.0.0.1',server_port:54329}] as unknown as Row[],rowCount:1};
    if(sql.includes('p3_submit_master_change_v1('))
     return {rows:[{request_id:requestId}] as unknown as Row[],rowCount:1};
    if(sql.includes('p3_read_masters_v1(')){
     const query=JSON.parse(String(args[0])) as {intent:string};
     const identity={legal_entity_id:mode==='crossEntity'?'DDL':'HFT',
      site_id:'SITE1',warehouse_id:'WH1'};
     const records=query.intent==='REQUESTS'
      ?(mode==='noReadback'?[]:[{...identity,request_id:requestId,
         kind:'EMPLOYEE',state:'PENDING_APPROVAL',record_id:'EMP1'}])
      :[{...identity,kind:'EMPLOYEE',record_id:'EMP1',version:1,active:false,
         values:{fullName:'Synthetic Operator'}}];
     return {rows:[{response:{state:'AVAILABLE',records}}] as unknown as Row[],rowCount:1};
    }
    if(sql.includes('p3_decide_apply_employee_v1(')){
     const d=JSON.parse(String(args[0])) as {decision:string};
     const response=mode==='wrongDecision'?{state:'APPLIED',requestId:'OTHER',
        recordId:'EMP1',version:'1',active:false}
      :d.decision==='DENIED'?{state:'DENIED',requestId,recordId:'EMP1',version:null,active:null}
      :{state:'APPLIED',requestId,recordId:'EMP1',version:'1',active:false};
     return {rows:[{response}] as unknown as Row[],rowCount:1};
    }
    if(sql==='COMMIT'&&session===1&&mode==='commitLost')
     throw new Error('SYNTHETIC_COMMIT_RESPONSE_LOST');
    return {rows:[] as unknown as Row[],rowCount:0};
   },
   release(destroy?:boolean){released.push(destroy===true);}
  };
  return client;
 }};
 return {pool,sqls,params,released,connections:()=>connections};
}
test('employee registration is one protected request and a fresh committed readback',async()=>{
 const x=scripted();
 const result=await handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),submit);
 assert.equal(result.state,'PENDING_APPROVAL');
 assert.equal(result.records[0].request_id,requestId);
 assert.deepEqual(x.released,[false,false]);
 assert.equal(x.connections(),2);
 assert.equal(x.sqls.filter(s=>s.includes('p3_submit_master_change_v1(')).length,1);
 assert.equal(x.sqls.filter(s=>s.includes('p3_read_masters_v1(')).length,1);
 assert.ok(x.sqls.includes('BEGIN ISOLATION LEVEL SERIALIZABLE'));
 assert.ok(x.sqls.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.equal(x.sqls.filter(s=>/\b(?:INSERT INTO|UPDATE|DELETE FROM) hft\.employee/i.test(s)).length,0);
 const proof=x.params.find((_,i)=>x.sqls[i].includes('p3_submit_master_change_v1('));
 assert.equal(JSON.parse(String(proof?.[1])).actorSubject,'STORE1');
});
test('read authority calls only the DB-verified scoped function',async()=>{
 const x=scripted();
 const result=await handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),
  {intent:'LIST',kind:'EMPLOYEE',...scope,search:''});
 assert.equal(result.state,'AVAILABLE');assert.equal(result.records.length,1);
 assert.equal(x.sqls.filter(s=>s.includes('p3_read_masters_v1(')).length,1);
 assert.ok(x.sqls.every(s=>!s.includes('FROM hft.p3_master_read_v1')));
 assert.ok(x.sqls.every(s=>!s.includes('FROM hft.p3_master_actor_grant')));
});
test('a compromised DB read response cannot cross legal entity',async()=>{
 const x=scripted('crossEntity');
 await assert.rejects(handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),
  {intent:'LIST',kind:'EMPLOYEE',...scope,search:''}),/P3_PROTECTED_READ_CROSS_ENTITY/);
});
test('a missing committed pending readback is an explicit NO-RETRY error',async()=>{
 const x=scripted('noReadback');
 await assert.rejects(handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),submit),
 /P3_COMMITTED_REQUEST_RECONCILIATION_REQUIRED_NO_RETRY/);
 assert.equal(x.sqls.filter(s=>s.includes('p3_submit_master_change_v1(')).length,1);
});
test('lost COMMIT response discards connection without reposting',async()=>{
 const x=scripted('commitLost');
 await assert.rejects(handleP3MasterRequest(x.pool,env,verifiedFixtureOperator(),submit),
 CommitOutcomeUncertain);
 assert.deepEqual(x.released,[true]);
 assert.equal(x.sqls.filter(s=>s.includes('p3_submit_master_change_v1(')).length,1);
});
test('genuine decision path uses one atomic protected DB function',async()=>{
 const x=scripted();
 const result=await handleP3EmployeeDecision(x.pool,env,verifiedFixtureOperator(),review);
 assert.equal(result.state,'APPLIED');assert.equal(result.active,false);
 assert.equal(result.version,'1');
 assert.equal(x.sqls.filter(s=>s.includes('p3_decide_apply_employee_v1(')).length,1);
 assert.ok(x.sqls.every(s=>!s.includes('UPDATE hft.employee')));
 assert.ok(x.sqls.every(s=>!s.includes('INSERT INTO hft.p3_master_decision')));
});
test('denial persists as decision evidence without claiming applied employee',async()=>{
 const x=scripted();
 const result=await handleP3EmployeeDecision(x.pool,env,verifiedFixtureOperator(),
 {...review,decision:'DENIED'});
 assert.equal(result.state,'DENIED');assert.equal(result.active,null);
 assert.equal(result.version,null);
});
test('invalid DB decision result rolls back',async()=>{
 const x=scripted('wrongDecision');
 await assert.rejects(handleP3EmployeeDecision(x.pool,env,verifiedFixtureOperator(),review),
 /P3_EMPLOYEE_DECISION_RESPONSE_INVALID/);
 assert.ok(x.sqls.includes('ROLLBACK'));assert.deepEqual(x.released,[false]);
});
test('forged session and wrong-site actor fail before DB connection',async()=>{
 const x=scripted(),actor=verifiedFixtureOperator();
 await assert.rejects(handleP3EmployeeDecision(x.pool,env,{...actor},review),
 /VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 await assert.rejects(handleP3EmployeeDecision(x.pool,env,actor,{...review,siteId:'SITE2'}),
 /SIGNED_SCOPE_DENIED/);
 assert.equal(x.connections(),0);
});
test('unknown isolated login and production environment are denied',()=>{
 for(const patch of [{PGUSER:'hft_engineering'},{PGHOST:'external.example'},
  {HFT_MASTERS_SOURCE:'preview'},{NODE_ENV:'production'},
  {HFT_LIVE_POSTING_ENABLED:'true'}]){
  assert.throws(()=>assertP3Environment({...env,...patch}));
 }
});
