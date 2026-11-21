import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reconcileIsolatedCommand,stockRequestFingerprint } from '../../lib/hft/persistence/stock-command-readback.ts';
import type { StockCommand } from '../../lib/hft/domain/ledger.ts';
import type { PgPool, PgQueryClient } from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import { verifiedFixtureOperator } from '../support/signed-session-fixture.ts';
const c:StockCommand={commandId:'CMD-001',idempotencyKey:'KEY-001',kind:'RECEIVE',legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',locationId:'LOC1',quantity:'5',sourceDocumentId:'DOC-001',sourceActionKey:'R1',expectedBalanceVersion:0};
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',PGHOST:'127.0.0.1'};
function scriptedReadback(mode:'found'|'missing'|'other'|'unbalanced'|'audit_bad'|'missing_outbox'|'account_bad'|'misattributed'|'seal_bad'|'forged_available'|'wrong_version'|'wrong_source'|'wrong_actor'='found'){
 const queries:string[]=[];
 const canonical='{"commandId":"CMD-001"}';
 const row={internal_command_uuid:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',command_id:c.commandId,payload_sha256:stockRequestFingerprint(c,'STORE1'),actor_subject:'STORE1',
   delivery_found:true, result:{commandId:'CMD-001',accountVersion:1,available:'5',fact:{commandId:'CMD-001',kind:'RECEIVE',sourceDocumentId:'DOC-001',operatorId:'STORE1',locationId:'LOC1',entityId:'HFT',warehouseId:'WH1',itemCode:'ITEM1',
    movements:[{bucket:'EXTERNAL',delta:'-5'},{bucket:'AVAILABLE',delta:'5'}]},replay:false},
   canonical_text:canonical,canonical_sha256:createHash('sha256').update(canonical).digest('hex'),legs:'2',total:'0',seal_verified:mode!=='seal_bad',available_after_micro:'5000000',available_after_version:'1'};
 if(mode==='unbalanced')row.total='-1';
 if(mode==='audit_bad')row.canonical_sha256='0'.repeat(64);
 if(mode==='missing_outbox')row.delivery_found=false;
 if(mode==='forged_available')row.result.available='999';
 if(mode==='wrong_version')row.result.accountVersion=999;
 if(mode==='wrong_source')row.result.fact.sourceDocumentId='FORGED-DOC';
 if(mode==='wrong_actor')row.result.fact.operatorId='FORGED-ACTOR';
 const client:PgQueryClient={
   async query<R extends Record<string,unknown>>(sql:string){queries.push(sql);
      const rows=sql.includes('current_database()')?[{db_name:env.HFT_TEST_PG_DATABASE,db_role:'hft_engineering'}]:
        sql.includes('JOIN hft.stock_command_outcome')?(mode==='missing'||mode==='other'?[]:[row]):
        sql.includes('FROM hft.stock_entry e LEFT JOIN hft.stock_account a')?[
          {bucket:'EXTERNAL',account_id:null,qty_delta_micro:'-5000000',account_kind:null,legal_entity_id:null,
           warehouse_id:null,location_key:null,item_code:null,batch_key:null,serial_key:null,custodian_employee_id:null},
          {bucket:'AVAILABLE',account_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',qty_delta_micro:'5000000',
           account_kind:mode==='misattributed'?'CUSTODY':'AVAILABLE',legal_entity_id:'HFT',warehouse_id:'WH1',
           location_key:'LOC1',item_code:'ITEM1',batch_key:'',serial_key:'',custodian_employee_id:''}]:
        sql.includes('FROM hft.stock_account_reconstruction_v2')?(mode==='account_bad'?[{account_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]:[]):
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

test('wrong custody/available attribution fails readback despite balanced total',async()=>{
 const x=scriptedReadback('misattributed');
 await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_ACCOUNT_ATTRIBUTION_FAILED/);
});
test('account-level reconstructed quantity mismatch fails even with balanced command',async()=>{
 const x=scriptedReadback('account_bad');
 await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_ACCOUNT_RECONSTRUCTION_FAILED/);
});

test('committed transaction without matching immutable movement seal fails readback',async()=>{
 const x=scriptedReadback('seal_bad');
 await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_STOCK_COMMAND_SEAL_FAILED/);
});

test('readback checks historic sealed available and accountVersion, not today balance',async()=>{
 for(const mode of ['forged_available','wrong_version'] as const){
  const x=scriptedReadback(mode);
  await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_HISTORICAL_BALANCE_OR_VERSION_MISMATCH/);
 }
});
test('readback rejects source or actor attribution changed in outcome',async()=>{
 for(const mode of ['wrong_source','wrong_actor'] as const){
  const x=scriptedReadback(mode);
  await assert.rejects(reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator()),/READBACK_SOURCE_ACTOR_OR_SCOPE_MISMATCH/);
 }
});
test('successful readback invokes database immutable proof, not digest alone',async()=>{
 const x=scriptedReadback();
 const v=await reconcileIsolatedCommand(x.pool,env,c,verifiedFixtureOperator());
 assert.equal(v.state,'COMMITTED_VERIFIED');
 assert.ok(x.queries.some(sql=>sql.includes('SELECT hft.assert_command_seal_v1(')));
});
