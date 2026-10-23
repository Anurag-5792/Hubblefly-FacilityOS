/** Scripted protocol tests only; these DO NOT exercise a PostgreSQL server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postIsolatedStockCommand } from '../../lib/hft/persistence/post-stock-command.ts';
import { verifiedFixtureOperator } from '../support/signed-session-fixture.ts';
import type { StockCommand } from '../../lib/hft/domain/ledger.ts';
import type { PgPool, PgQueryClient } from '../../lib/hft/persistence/isolated-pg-transaction.ts';
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',
  HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',PGHOST:'127.0.0.1'};
const sourceDocumentId='00000000-0000-4000-8000-000000000001';
const command:StockCommand={commandId:'CMD-R001',idempotencyKey:'KEY-R001',kind:'RECEIVE',
  legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',itemCode:'ITEM1',locationId:'LOC1',quantity:'5',
  sourceDocumentId,sourceActionKey:'RECEIPT-1:1',expectedBalanceVersion:0};
const actor=verifiedFixtureOperator();
function scriptedPg(grantActive=true) {
  const calls:{sql:string,params:readonly unknown[]}[]=[];
  const results=(sql:string):Record<string,unknown>[]=>{
    if(sql.includes('SELECT current_database()')) return [{db_name:env.HFT_TEST_PG_DATABASE,db_role:'hft_engineering'}];
    if(sql.includes('FROM hft.actor_warehouse_grant')) return [{active:grantActive,may_post:true}];
    if(sql.includes('FROM hft.stock_approval')) return [{approval_id:'APR01',revision:'1',approved:true,approved_by:'APPROVER2',inspected_condition:null,inspection_evidence_id:null}];
    if(sql.includes('FROM hft.location')) return [{active:true}];
    if(sql.includes('FROM hft.item')) return [{control_type:'NONE',active:true,version:'1',uom:'NOS'}];
    if(sql.includes('FROM hft.warehouse')) return [{active:true,version:'1'}];
    if(sql.includes('FROM hft.grn g')) return [{id:sourceDocumentId,status:'AUTHORIZED',authorized_by:'APPROVER2',supplier_active:true,invoice_id:'10000000-0000-4000-8000-000000000001',physical_receipt_id:'DELIVERY-001',invoice_status:'VERIFIED',verified_invoice_key:'INV-1'}];
    if(sql.includes('FROM hft.grn_partial_receipt')) return [{receipt_id:'20000000-0000-4000-8000-000000000001',line_no:1,accepted_micro:'5000000',item_code:'ITEM1',location_id:'LOC1',serial_no:'',batch_no:'',invoice_line_id:'30000000-0000-4000-8000-000000000001',invoice_received_micro:'0',invoice_authorized_micro:'5000000'}];
    if(sql.includes('FROM hft.stock_account')) return [{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',qty_micro:'0',reserved_micro:'0',version:'0'}];
    if(sql.includes('INSERT INTO hft.stock_command(')) return [{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}];
    if(sql.includes('INSERT INTO hft.audit_outbox(')) return [{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}];
    if(sql.includes('UPDATE hft.supplier_invoice_line')) return [{id:'30000000-0000-4000-8000-000000000001'}];
    if(sql.includes('UPDATE hft.grn_line')) return [{line_no:1}];
    if(sql.includes('UPDATE hft.stock_account')) return [{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}];
    return [];
  };
  let releases=0;
  const client:PgQueryClient={
    async query<R extends Record<string,unknown>>(sql:string,params:readonly (string|number|bigint|boolean|null)[]=[]){
      calls.push({sql,params});
      const rows=results(sql);
      return {rows:rows as R[],rowCount:rows.length|| (sql.trim().startsWith('INSERT') && !sql.includes('RETURNING') ?1: null)};
    },release(){releases++;}
  };
  const pool:PgPool={async connect(){return client;}};
  return {pool,calls,releaseCount:()=>releases};
}
test('posting adapter rejects untrusted caller before opening DB',async()=>{
  const pg=scriptedPg();
  await assert.rejects(postIsolatedStockCommand(pg.pool,env,command,{...actor}),/VERIFIED_REQUEST_IDENTITY_REQUIRED/);
  assert.equal(pg.calls.length,0);
});
test('persisted actor grant rejects with rollback and no posting writes',async()=>{
  const pg=scriptedPg(false);
  await assert.rejects(postIsolatedStockCommand(pg.pool,env,command,actor),/PERSISTED_PERMISSION_DENIED/);
  assert.equal(pg.calls.at(-1)?.sql,'ROLLBACK');
  assert.equal(pg.calls.some(x=>x.sql.includes('INSERT INTO hft.stock_command(')),false);
  assert.equal(pg.releaseCount(),1);
});
test('synthetic happy path issues balanced movement SQL, audit outbox and COMMIT',async()=>{
  const pg=scriptedPg();
  const result=await postIsolatedStockCommand(pg.pool,env,command,actor);
  assert.equal(result.available,'5');
  assert.deepEqual(result.fact.movements.map(x=>x.delta),['-5','5']);
  const posted=pg.calls.filter(x=>x.sql.includes('INSERT INTO hft.stock_entry('));
  assert.equal(posted.length,2);
  assert.deepEqual(posted.map(x=>x.params[3]),['-5000000','5000000']);
  assert.equal(pg.calls.filter(x=>x.sql.includes('INSERT INTO hft.audit_outbox(')).length,1);
  assert.equal(pg.calls.filter(x=>x.sql.includes('UPDATE hft.supplier_invoice_line')).length,1);
  assert.equal(pg.calls.filter(x=>x.sql.includes('location_key=$4')).length,1);
  assert.equal(pg.calls.filter(x=>x.sql.includes('INSERT INTO hft.audit_delivery(')).length,1);
  assert.equal(pg.calls.filter(x=>x.sql.includes('INSERT INTO hft.stock_command_outcome(')).length,1);
  assert.equal(pg.calls.at(-1)?.sql,'COMMIT');
  assert.equal(pg.releaseCount(),1);
});
