/** Scripted protected uncertain-COMMIT evidence, NOT a PostgreSQL test. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PgPool,PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {CommitOutcomeUncertain} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {postProtectedStockCommand} from '../../lib/hft/persistence/protected-stock-posting.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import type {StockCommand} from '../../lib/hft/domain/ledger.ts';

const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',PGHOST:'127.0.0.1',PGPORT:'54329',
 HFT_APPROVED_PG_PORT:'54329',PGDATABASE:'hft_r1_disposable_synthetic',
 HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',PGUSER:'hft_r1_testlogin',
 HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
const command:StockCommand={commandId:'P2-CMD-001',idempotencyKey:'P2-KEY-001',
 kind:'ISSUE',legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',locationId:'LOC1',
 itemCode:'ITEM1',quantity:'2',sourceDocumentId:'P2-ISSUE-001',
 sourceActionKey:'LINE-001',fragmentId:'FRAG-001',employeeId:'EMP1',
 condition:'GOOD',expectedBalanceVersion:0};
const approved={sourceRevision:4,approvalId:'APR-001',approvalRevision:1,
 policyGeneration:3,approvedPayloadSha256:'a'.repeat(64),inspectionEvidenceId:''};
const signer={keyVersion:1,keyBytes:Buffer.from('UNIT_TEST_ONLY_FIXED_NONPRODUCTION_KEY_01')};
const outcome={commandId:command.commandId,available:'3',accountVersion:1,replay:false,
 fact:{commandId:command.commandId,sourceDocumentId:command.sourceDocumentId,kind:'ISSUE',
 entityId:'HFT',warehouseId:'WH1',itemCode:'ITEM1',locationId:'LOC1',operatorId:'STORE1',
 employeeId:'EMP1',movements:[{bucket:'AVAILABLE',delta:'-2'},{bucket:'CUSTODY',delta:'2'}]}};

function scripted(mode:'committed'|'missing'|'incomplete') {
 const sqls:string[]=[]; const proofs:string[]=[];const released:boolean[]=[];
 let connections=0;
 const pool:PgPool={async connect(){
  const session=++connections;
  const client:PgQueryClient={
   async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
    sqls.push(sql);
    if(sql.includes('SELECT current_database()'))return {rows:[{
     db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
     server_address:'127.0.0.1',server_port:54329}] as Row[],rowCount:1};
    if(sql.includes('SELECT hft.post_stock_command_protected_v1(')){
     proofs.push(String(params[1]));
     return {rows:[{result:outcome}] as Row[],rowCount:1};
    }
    if(sql.includes('SELECT hft.reconcile_protected_stock_command_v1(')) {
     proofs.push(String(params[1]));
     if(mode==='incomplete')throw new Error('P2_READBACK_EVIDENCE_INCOMPLETE');
     const recovered=mode==='missing'
      ? {state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false}
      : {state:'COMMITTED_VERIFIED',result:outcome};
     return {rows:[{recovery:recovered}] as Row[],rowCount:1};
    }
    if(sql==='COMMIT' && session===1)throw new Error('LOST_COMMIT_RESPONSE');
    return {rows:[] as Row[],rowCount:0};
   },release(destroy?:boolean){released.push(destroy===true);}
  };
  return client;
 }};
 return {pool,sqls,proofs,released,connectionCount:()=>connections};
}
test('ambiguous COMMIT obtains same-nonce, read-only durable result without repost',async()=>{
 const p=scripted('committed');
 const result=await postProtectedStockCommand(p.pool,env,command,verifiedFixtureOperator(),approved,signer);
 assert.equal(result.commandId,command.commandId);
 assert.equal(result.replay,true);
 assert.equal(p.connectionCount(),2);
 assert.equal(p.sqls.filter(s=>s.includes('SELECT hft.post_stock_command_protected_v1(')).length,1);
 assert.equal(p.sqls.filter(s=>s.includes('SELECT hft.reconcile_protected_stock_command_v1(')).length,1);
 assert.ok(p.sqls.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.deepEqual(p.proofs.length,2);
 assert.equal(p.proofs[0],p.proofs[1],'original signed nonce/proof reused only for readback');
 assert.deepEqual(p.released,[true,false]);
});
test('missing commit evidence stays unresolved; another posting is never attempted',async()=>{
 const p=scripted('missing');
 await assert.rejects(postProtectedStockCommand(p.pool,env,command,verifiedFixtureOperator(),approved,signer),
   CommitOutcomeUncertain);
 assert.equal(p.sqls.filter(s=>s.includes('SELECT hft.post_stock_command_protected_v1(')).length,1);
 assert.equal(p.sqls.filter(s=>s.includes('SELECT hft.reconcile_protected_stock_command_v1(')).length,1);
 assert.deepEqual(p.released,[true,false]);
});
test('incomplete durable readback evidence is not accepted or blindly retried',async()=>{
 const p=scripted('incomplete');
 await assert.rejects(postProtectedStockCommand(p.pool,env,command,verifiedFixtureOperator(),approved,signer),
   /P2_COMMIT_UNCERTAIN_RECOVERY_UNVERIFIED_NO_RETRY/);
 assert.equal(p.connectionCount(),2);
 assert.equal(p.sqls.filter(s=>s.includes('SELECT hft.post_stock_command_protected_v1(')).length,1);
 assert.deepEqual(p.released,[true,false]);
});
