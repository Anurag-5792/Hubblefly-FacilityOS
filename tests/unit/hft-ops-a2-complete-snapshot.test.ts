import test from 'node:test';
import assert from 'node:assert/strict';
import {readOpsA2CompleteSyntheticSource}
 from '../../lib/hft/persistence/ops-a2-stores-readback.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import {type PgPool,type PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';

const q={contractVersion:'HFT-R1-P0-READ-V1',intent:'BALANCES',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',leafLocationId:'BIN1',
 employeeId:'',cursor:'',limit:2};
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_STORES_P0_SOURCE:'qualified_disposable_review',
 HFT_STORES_P0_SQL_CONTRACT:'HFT_R1_P0_PERSISTENCE_V1',
 HFT_OPS_A2_SOURCE_MODE:'OPS_A2_SYNTHETIC_PG_CLIENT_ONLY',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_testlogin',HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
const base={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',leafLocationId:'BIN1',
 accountKind:'AVAILABLE',condition:'GOOD',serialNo:'',batchNo:'',employeeId:'',
 quantity:'5',accountVersion:2,auditSha256:'a'.repeat(64),
 humanAcknowledgement:'NOT_APPLICABLE'};
const row=(n:number)=>({...base,movementId:'ACCOUNT-'+n});
type Mode='OK'|'EARLY'|'TOTAL_DRIFT'|'GAP'|'DUP'|'EPOCH'|'PARTIAL'|'WRONG_SCOPE';
function fake(mode:Mode='OK'){
 const calls:string[]=[],proofs:Record<string,unknown>[]=[];
 let connections=0;
 const pool:PgPool={async connect(){
  connections++;
  const client:PgQueryClient={
   async query<R extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
    calls.push(sql);
    if(sql.includes('SELECT current_database()'))
     return {rows:[{db_name:env.PGDATABASE,db_login:env.PGUSER,
      db_role:env.PGUSER,server_address:'127.0.0.1',server_port:54329}] as unknown as R[],
      rowCount:1};
    if(sql.includes('ops_a2_read_snapshot_page_v3')){
     const query=JSON.parse(String(args[0])) as typeof q;
     const proof=JSON.parse(String(args[1])) as Record<string,unknown>;
     proofs.push(proof);
     assert.equal(proof.proofVersion,'HFT-R1-P0-STORES-READ-HMAC-V1');
     const isFirst=query.cursor==='';
     const items=isFirst?[row(1),row(2)]:[row(mode==='DUP'?2:3)];
     const selected=mode==='PARTIAL'&&isFirst?items.slice(0,1):items;
     const answer={
      state:'AUTHORITATIVE_VERSIONED_READ',versionAuthority:'OPS_A2_VERSION_AWARE_V2',
      intent:query.intent,sourceEpoch:mode==='EPOCH'&&!isFirst?'EPOCH2':'EPOCH1',
      nextCursor:!isFirst||mode==='EARLY'?'':mode==='GAP'?'3':'2',
      synthetic:false,durable:true,auditVerified:true,
      snapshotTotalRows:mode==='TOTAL_DRIFT'&&!isFirst?4:3,
      rows:mode==='WRONG_SCOPE'&&!isFirst?
       selected.map(x=>({...x,siteId:'OTHER'})):selected
     };
     return {rows:[{response:answer}] as unknown as R[],rowCount:1};
    }
    return {rows:[] as unknown as R[],rowCount:0};
   },release(){}};
  return client;
 }};
 return {pool,calls,proofs,connections:()=>connections};
}
test('v3 completes 3 source-bound balance rows with two pages and one read transaction',async()=>{
 const m=fake();
 const result=await readOpsA2CompleteSyntheticSource(m.pool,env,q,
  verifiedFixtureOperator(),new Uint8Array(32).fill(5),1);
 assert.equal(result.complete,true);
 assert.equal(result.snapshotTotalRows,3);
 assert.equal(result.rows.length,3);assert.equal(result.pageCount,2);
 assert.equal(result.nextCursor,'');assert.equal(m.connections(),1);
 assert.equal(m.calls.filter(x=>x==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,1);
 assert.equal(m.calls.filter(x=>x.includes('ops_a2_read_snapshot_page_v3')).length,2);
 assert.equal(m.proofs.length,2);
 assert.notEqual(m.proofs[0].payloadSha256,m.proofs[1].payloadSha256);
 assert.ok(!m.calls.some(x=>/\b(?:INSERT|UPDATE|DELETE)\s+hft\./i.test(x)));
});
test('v3 rejects early termination, drifting counts, cursor jumps and duplicates',async()=>{
 for(const [mode,error] of [
  ['EARLY','EARLY_TERMINAL'],['TOTAL_DRIFT','TOTAL_SCOPE_MISMATCH'],
  ['GAP','PAGE_GAP_OR_TRUNCATION'],['DUP','DUPLICATE_MOVEMENT'],
  ['EPOCH','SOURCE_EPOCH_CHANGED'],['PARTIAL','PAGE_GAP_OR_TRUNCATION'],
  ['WRONG_SCOPE','ROW_IDENTITY_INVALID']
 ] as const){
  const m=fake(mode);
  await assert.rejects(readOpsA2CompleteSyntheticSource(m.pool,env,q,
   verifiedFixtureOperator(),new Uint8Array(32).fill(5),1),
   new RegExp(error),mode);
  assert.equal(m.connections(),1);
  assert.ok(m.calls.includes('ROLLBACK'));
 }
});
test('v3 refuses unqualified environment and browser cursor before acquiring DB',async()=>{
 for(const change of [{NODE_ENV:'production'},
  {HFT_OPS_A2_SOURCE_MODE:'PRODUCTION'},{HFT_LIVE_POSTING_ENABLED:'true'}]){
  const m=fake();
  await assert.rejects(readOpsA2CompleteSyntheticSource(m.pool,{...env,...change},q,
   verifiedFixtureOperator(),new Uint8Array(32).fill(5),1));
  assert.equal(m.connections(),0);
 }
 const m=fake();
 await assert.rejects(readOpsA2CompleteSyntheticSource(m.pool,env,
  {...q,cursor:'2'},verifiedFixtureOperator(),new Uint8Array(32).fill(5),1),
  /SOURCE_ONLY/);
 assert.equal(m.connections(),0);
});
