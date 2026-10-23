import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reconcileIsolatedCommand,stockRequestFingerprint } from '../../lib/hft/persistence/stock-command-readback.ts';
import type { StockCommand } from '../../lib/hft/domain/ledger.ts';
import type { PgPool, PgQueryClient } from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import { verifiedFixtureOperator } from '../support/signed-session-fixture.ts';
const c:StockCommand={commandId:'CMD-001',idempotencyKey:'KEY-001',kind:'RECEIVE',legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',quantity:'5',sourceDocumentId:'DOC-001',sourceActionKey:'R1',expectedBalanceVersion:0};
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',PGHOST:'127.0.0.1'};
function scriptedReadback(mode:'found'|'missing'|'other'|'unbalanced'|'audit_bad'|'missing_outbox'='found'){
 const queries:string[]=[];
 const canonical='{"commandId":"CMD-001"}';
 const row={command_id:c.commandId,payload_sha256:stockRequestFingerprint(c,'STORE1'),actor_subject:'STORE1',
   delivery_found:true, result:{commandId:'CMD-001',accountVersion:1,available:'5',fact:{commandId:'CMD-001'},replay:false},
   canonical_text:canonical,canonical_sha256:createHash('sha256').update(canonical).digest('hex'),legs:'2',total:'0'};
 if(mode==='unbalanced')row.total='-1';
 if(mode==='audit_bad')row.canonical_sha256='0'.repeat(64);
 if(mode==='missing_outbox')row.delivery_found=false;
 const client:PgQueryClient={
   async query<R extends Record<string,unknown>>(sql:string){queries.push(sql);
      const rows=sql.includes('current_database()')?[{db_name:env.HFT_TEST_PG_DATABASE,db_role:'hft_engineering'}]:
        sql.includes('JOIN hft.stock_command_outcome')?(mode==='missing'||mode==='other'?[]:[row]):
        sql.includes('FROM hft.stock_command WHERE')?(mode==='other'?[{command_id:'ANOTHER'}]:[]):[];
      return {rows:rows as unknown as R[],rowCount:rows.length};
   },release(){}
 };
 const pool:PgPool={async connect(){return client;}};
 return {pool,queries};
}
test('durable readback verifies committed quantity and canonical audit hash',async()=>{
 const x=scriptedReadback();const result=await reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator());
 assert.equal(result.state,'COMMITTED_VERIFIED');
 if(result.state==='COMMITTED_VERIFIED') assert.equal(result.result.replay,true);
 assert.equal(x.queries.at(-1),'COMMIT');
});
test('missing committed row is INDETERMINATE and prohibits blind retry',async()=>{
 const x=scriptedReadback('missing');
 assert.deepEqual(await reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),{state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false});
});
test('same idempotency key on a different command is rejected',async()=>{
 const x=scriptedReadback('other');
 await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/IDEMPOTENCY_CONFLICT/);
 assert.equal(x.queries.at(-1),'ROLLBACK');
});
test('unbalanced ledger and mismatched canonical hash fail readback',async()=>{
 for(const mode of ['unbalanced','audit_bad'] as const){
  const x=scriptedReadback(mode);
  await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_LEDGER_INTEGRITY_FAILED|READBACK_AUDIT_DIGEST_FAILED/);
 }
});
test('missing outbox delivery evidence is integrity failure, never treated as no commit',async()=>{
 const x=scriptedReadback('missing_outbox');
 await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_REQUIRED_EVIDENCE_MISSING/);
});
test('spoofed caller cannot perform readback',async()=>{
 const x=scriptedReadback();
 await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,{...verifiedFixtureOperator()}),/VERIFIED_REQUEST_IDENTITY_REQUIRED/);
 assert.equal(x.queries.length,0);
});
