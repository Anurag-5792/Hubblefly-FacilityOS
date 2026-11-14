/** C050 scripted authenticated P3 LIST and governed Employee EDIT.
 * No PostgreSQL access. Exercises existing real HFT service and SQL-function
 * invocation boundary; NEVER claims DB or production qualification.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleP3MasterRequest} from '../../lib/hft/masters/p3-service.ts';
import {readEmployeeDirectory,proposeEmployeeEdit,toP3EmployeeRequest}
 from '../../lib/hft/ui-reuse/employee-view-model.ts';
import type {PgPool,PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';

const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const requestId='11111111-1111-4111-8111-111111111111';
const env:Record<string,string>={NODE_ENV:'test',HFT_ENVIRONMENT:'test',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',HFT_MASTERS_SOURCE:'postgres_review',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_master_testlogin',HFT_P3_RUNTIME_LOGIN:'hft_r1_master_testlogin',
 HFT_P3_SIGNING_KEY_VERSION:'1',
 HFT_P3_SIGNING_KEY_BASE64:Buffer.alloc(32,9).toString('base64')};
function fixture(){
 const sql:string[]=[];let connections=0;
 const pool:PgPool={async connect(){
  connections++;
  const client:PgQueryClient={
   async query<Row extends Record<string,unknown>>(command:string,args:readonly unknown[]=[]){
    sql.push(command);
    if(command.includes('SELECT current_database()'))
     return {rows:[{db_name:env.PGDATABASE,db_login:env.PGUSER,
      db_role:env.PGUSER,server_address:'127.0.0.1',
      server_port:54329}] as unknown as Row[],rowCount:1};
    if(command.includes('p3_read_masters_v1(')){
     const query=JSON.parse(String(args[0])) as {intent:string};
     const records=query.intent==='LIST'
      ?[{kind:'EMPLOYEE',record_id:'EMP1',legal_entity_id:'HFT',
         site_id:'SITE1',warehouse_id:'',version:'3',active:true,
         master_values:{fullName:'Synthetic One',department:'Stores',
          designation:'Officer',siteId:'SITE1'}}]
      :[{record_id:'EMP1',request_id:requestId,kind:'EMPLOYEE',
         legal_entity_id:'HFT',site_id:'SITE1',warehouse_id:'WH1',
         state:'PENDING_APPROVAL'}];
     return {rows:[{response:{state:'AVAILABLE',records}}] as unknown as Row[],
      rowCount:1};
    }
    if(command.includes('p3_submit_master_change_v1('))
     return {rows:[{request_id:requestId}] as unknown as Row[],rowCount:1};
    return {rows:[] as unknown as Row[],rowCount:0};
   },release(){}};
  return client;
 }};
 return {pool,sql,connections:()=>connections};
}
test('C050 authenticated Employee LIST binds existing P3 protected scoped reader',async()=>{
 const x=fixture();const reply=await handleP3MasterRequest(
  x.pool,env,verifiedFixtureOperator(),{intent:'LIST',kind:'EMPLOYEE',...scope,search:''});
 assert.equal(reply.state,'AVAILABLE');
 const rows=readEmployeeDirectory(reply.records,scope);
 assert.equal(rows[0].fullName,'Synthetic One');
 assert.equal(rows[0].designation,'Officer');
 assert.equal(x.sql.filter(s=>s.includes('p3_read_masters_v1(')).length,1);
 assert.equal(x.sql.some(s=>/\b(?:INSERT|UPDATE|DELETE)\s+hft\./i.test(s)),false);
});
test('C050 Employee EDIT request remains P3 PENDING_APPROVAL, not direct Employee UPDATE',async()=>{
 const x=fixture(),actor=verifiedFixtureOperator();
 const reply=await handleP3MasterRequest(x.pool,env,actor,
  {intent:'LIST',kind:'EMPLOYEE',...scope,search:''});
 const row=readEmployeeDirectory(reply.records,scope)[0];
 const change=proposeEmployeeEdit(row,scope,requestId,
  'Correct employee assignment record');
 const submitted=await handleP3MasterRequest(x.pool,env,actor,
  toP3EmployeeRequest(change));
 assert.equal(submitted.state,'PENDING_APPROVAL');
 assert.equal(submitted.records[0].request_id,requestId);
 assert.equal(x.sql.filter(s=>s.includes('p3_submit_master_change_v1(')).length,1);
 assert.equal(x.sql.some(s=>/\b(?:INSERT|UPDATE|DELETE)\s+hft\.employee/i.test(s)),false);
 assert.equal(x.connections(),3);
});
test('C050 wrong signed site rejected before any database connection',async()=>{
 const x=fixture();
 await assert.rejects(handleP3MasterRequest(x.pool,env,
  verifiedFixtureOperator(),{intent:'LIST',kind:'EMPLOYEE',
   ...scope,siteId:'SITE2',search:''}),/SIGNED_SCOPE_DENIED/);
 assert.equal(x.connections(),0);
});
