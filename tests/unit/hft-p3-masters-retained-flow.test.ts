/** P3 source workflow exercising proposed create/edit, fresh request readback
 * and duplicate rejection. Synthetic PG only; NOT DB acceptance or activation.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleP3MasterRequest} from '../../lib/hft/masters/p3-service.ts';
import {validateMasterChange} from '../../lib/hft/masters/p3-contract.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import type {PgPool,PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_MASTERS_SOURCE:'postgres_review',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',
 HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_master_testlogin',HFT_P3_RUNTIME_LOGIN:'hft_r1_master_testlogin',
 HFT_P3_SIGNING_KEY_VERSION:'1',
 HFT_P3_SIGNING_KEY_BASE64:Buffer.alloc(32,9).toString('base64')};
const fields={
 EMPLOYEE:{fullName:'Synthetic Operator',department:'Stores',
  designation:'Operator',siteId:'SITE1'},
 ITEM:{uom:'PCS',controlType:'NONE'},
 SUPPLIER:{legalName:'Synthetic Supplier'},
 WAREHOUSE:{name:'Synthetic Warehouse',siteId:'SITE1'},
 LOCATION:{parentLocationId:''}
} as const;
type Kind=keyof typeof fields;
function change(kind:Kind,requestId:string,operation:'CREATE'|'EDIT'='CREATE'){
 return validateMasterChange({contractVersion:'HFT-R1-P3-MASTER-V1',
  requestId,kind,operation,...scope,
  recordId:kind==='WAREHOUSE'?'WH1':'RECORD1',
  expectedVersion:operation==='CREATE'?'0':'1',
  reason:'Synthetic governed request only',
  values:fields[kind]});
}
function pg(){
 const requests=new Map<string,Record<string,unknown>>();
 const sqls:string[]=[],acts:string[]=[];
 let connectionCount=0;
 const pool:PgPool={async connect(){
  ++connectionCount;
  const client:PgQueryClient={
   async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
    sqls.push(sql);
    if(sql.includes('SELECT current_database()'))return {
     rows:[{db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
       server_address:'127.0.0.1',server_port:54329}] as unknown as T[],rowCount:1};
    if(sql.includes('p3_submit_master_change_v1(')){
     const cmd=JSON.parse(String(params[0])) as ReturnType<typeof change>;
     const k=cmd.legalEntityId+'/'+cmd.kind+'/'+cmd.recordId+'/'+
      cmd.operation+'/'+cmd.expectedVersion;
     if(requests.has(k))throw Error('P3_PENDING_MASTER_REQUEST_ALREADY_EXISTS');
     requests.set(k,{request_id:cmd.requestId,kind:cmd.kind,operation:cmd.operation,
      record_id:cmd.recordId,state:'PENDING_APPROVAL',...scope,
      legal_entity_id:scope.legalEntityId,site_id:scope.siteId,
      warehouse_id:scope.warehouseId});
     acts.push(cmd.kind+':'+cmd.operation);
     return {rows:[{request_id:cmd.requestId}] as unknown as T[],rowCount:1};
    }
    if(sql.includes('p3_read_masters_v1(')){
     const q=JSON.parse(String(params[0])) as {kind:Kind;intent:string};
     const records=q.intent==='REQUESTS'?
      [...requests.values()].filter(x=>x.kind===q.kind):[];
     return {rows:[{response:{state:'AVAILABLE',records}}] as unknown as T[],rowCount:1};
    }
    return {rows:[] as unknown as T[],rowCount:0};
   },release(){},
  };
  return client;
 }};
 return {pool,sqls,acts,requests,connections:()=>connectionCount};
}
const ids=['11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222'] as const;
test('all five kinds persist only PENDING_APPROVAL and can be independently reread',async()=>{
 for(const kind of Object.keys(fields) as Kind[]){
  const m=pg(),actor=verifiedFixtureOperator();
  const r=await handleP3MasterRequest(m.pool,env,actor,
   {intent:'SUBMIT',change:change(kind,ids[0])});
  assert.equal(r.state,'PENDING_APPROVAL');
  assert.equal(r.records[0].state,'PENDING_APPROVAL');
  assert.equal(m.acts[0],kind+':CREATE');
  assert.equal(m.connections(),2);
  const reread=await handleP3MasterRequest(m.pool,env,actor,
   {intent:'REQUESTS',kind,...scope,search:''});
  assert.equal(reread.state,'AVAILABLE');
  assert.equal(reread.records[0].request_id,ids[0]);
  const master=await handleP3MasterRequest(m.pool,env,actor,
   {intent:'LIST',kind,...scope,search:''});
  assert.deepEqual(master.records,[]);
  assert.equal(m.sqls.filter(x=>x.includes('p3_submit_master_change_v1(')).length,1);
  assert.equal(m.sqls.filter(x=>/INSERT INTO hft\.|UPDATE hft\.|DELETE FROM hft\./i.test(x)).length,0);
 }
});
test('unapproved EDIT saves a new pending request, not a master mutation',async()=>{
 const m=pg(),actor=verifiedFixtureOperator();
 const a=await handleP3MasterRequest(m.pool,env,actor,
  {intent:'SUBMIT',change:change('ITEM',ids[0],'EDIT')});
 assert.equal(a.state,'PENDING_APPROVAL');
 assert.equal(m.acts[0],'ITEM:EDIT');
 assert.equal((await handleP3MasterRequest(m.pool,env,actor,
  {intent:'LIST',kind:'ITEM',...scope,search:''})).records.length,0);
});
test('a duplicate pending identity is rejected, not silently changed or reposted',async()=>{
 const m=pg(),actor=verifiedFixtureOperator();
 await handleP3MasterRequest(m.pool,env,actor,
  {intent:'SUBMIT',change:change('SUPPLIER',ids[0])});
 await assert.rejects(handleP3MasterRequest(m.pool,env,actor,
  {intent:'SUBMIT',change:change('SUPPLIER',ids[1])}),
  /P3_PENDING_MASTER_REQUEST_ALREADY_EXISTS/);
 assert.equal(m.acts.length,1);
 assert.equal(m.requests.size,1);
 assert.equal((await handleP3MasterRequest(m.pool,env,actor,
  {intent:'REQUESTS',kind:'SUPPLIER',...scope,search:''})).records.length,1);
});
test('cross-site and forged operator cannot stage even a pending request',async()=>{
 const m=pg(),actor=verifiedFixtureOperator();
 const v=change('ITEM',ids[0]);
 await assert.rejects(handleP3MasterRequest(m.pool,env,{...actor},
  {intent:'SUBMIT',change:v}),/VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 await assert.rejects(handleP3MasterRequest(m.pool,env,actor,
  {intent:'SUBMIT',change:{...v,siteId:'SITE2'}}),/SIGNED_SCOPE_DENIED/);
 assert.equal(m.connections(),0);
});
