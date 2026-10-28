/** Scripted SQL protocol tests only. No real database/PG role evidence. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CommitOutcomeUncertain,type PgPool,type PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {withProtectedPostingTransaction,assertProtectedPostingEnvironment} from '../../lib/hft/persistence/protected-posting-transaction.ts';
import {postProtectedStockCommand} from '../../lib/hft/persistence/protected-stock-posting.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import type {StockCommand} from '../../lib/hft/domain/ledger.ts';
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',PGHOST:'127.0.0.1',PGPORT:'54329',
 HFT_APPROVED_PG_PORT:'54329',PGDATABASE:'hft_r1_disposable_synthetic',
 HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_testlogin',HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
const c:StockCommand={commandId:'CMD-001',idempotencyKey:'IDEM-001',kind:'ISSUE',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',locationId:'LOC1',
 itemCode:'ITEM1',quantity:'2',sourceDocumentId:'DOC-001',sourceActionKey:'LINE1',
 fragmentId:'FRAG-001',employeeId:'EMP1',expectedBalanceVersion:0,condition:'GOOD'};
function fakePg(failure?:string){
 const calls:{sql:string;params:readonly unknown[]}[]=[];
 const released:boolean[]=[];
 const client:PgQueryClient={async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
  calls.push({sql,params});
  if(sql===failure)throw new Error('SIMULATED_CONNECTION_FAILURE');
  const rows=sql.includes('SELECT current_database()')?[{db_name:env.PGDATABASE,db_login:env.PGUSER,
    db_role:env.PGUSER,server_address:'127.0.0.1',server_port:54329}]:
   sql.includes('SELECT hft.post_stock_command_protected_v1(')?[{
    result:{commandId:c.commandId,available:'0',accountVersion:1,replay:false,
      fact:{commandId:c.commandId,kind:c.kind,sourceDocumentId:c.sourceDocumentId,
      entityId:c.legalEntityId,warehouseId:c.warehouseId,itemCode:c.itemCode,
      locationId:c.locationId,operatorId:'STORE1',movements:[
        {bucket:'AVAILABLE',delta:'-2'},{bucket:'CUSTODY',delta:'2'}]}}}]:[];
  return {rows:rows as Row[],rowCount:rows.length};},
  release(destroy?:boolean){released.push(destroy===true);}};
 const pool:PgPool={async connect(){return client;}};
 return {pool,calls,released};
}
test('P2 protected envelope denies routing and improper runtime before connecting',async()=>{
 for(const change of [{PGHOSTADDR:'10.0.0.1'},{PGSERVICE:'other'},{PGHOST:'host.example'},
   {PGPORT:'5432'},{HFT_P2_RUNTIME_LOGIN:'hft_engineering'},
   {NODE_ENV:'production'},{HFT_LIVE_POSTING_ENABLED:'true'}]){
   const db=fakePg();
   await assert.rejects(withProtectedPostingTransaction(db.pool,{...env,...change},async()=>1));
   assert.equal(db.calls.length,0);
 }
});
test('single runtime SQL operation; no client-side direct stock DML',async()=>{
 const pg=fakePg();
 const result=await postProtectedStockCommand(pg.pool,env,c,verifiedFixtureOperator(),
   {sourceRevision:4,approvalId:'APR-001',approvalRevision:1,policyGeneration:3,
    approvedPayloadSha256:'a'.repeat(64),inspectionEvidenceId:''},
   {keyVersion:1,keyBytes:Buffer.from('HFT_TEST_ONLY_KEY_NOT_A_PRODUCTION_SECRET_2026')});
 assert.equal(result.commandId,c.commandId);
 assert.equal(pg.calls.filter(x=>x.sql.includes('SELECT hft.post_stock_command_protected_v1(')).length,1);
 assert.equal(pg.calls.filter(x=>/INSERT INTO hft\.|UPDATE hft\.|DELETE FROM hft\./.test(x.sql)).length,0);
 assert.equal(pg.calls.at(-1)?.sql,'COMMIT');
 assert.deepEqual(pg.released,[false]);
});
test('ambiguous COMMIT throws and destroys connection without blind retry',async()=>{
 const pg=fakePg('COMMIT');
 await assert.rejects(withProtectedPostingTransaction(pg.pool,env,async()=>42),CommitOutcomeUncertain);
 assert.deepEqual(pg.released,[true]);
 assert.equal(pg.calls.filter(x=>x.sql==='COMMIT').length,1);
});
test('unverified ROLLBACK destroys pooled connection',async()=>{
 const pg=fakePg('ROLLBACK');
 await assert.rejects(withProtectedPostingTransaction(pg.pool,env,async()=>{throw new Error('ABORT');}),
   /PROTECTED_ROLLBACK_UNVERIFIED/);
 assert.deepEqual(pg.released,[true]);
});
