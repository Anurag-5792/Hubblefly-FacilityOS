/** Scripted database protocol tests. Not substitutes for real PostgreSQL. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postIsolatedStockCommand} from '../../lib/hft/persistence/post-stock-command.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import type {StockCommand} from '../../lib/hft/domain/ledger.ts';
import type {PgPool,PgQueryClient} from '../../lib/hft/persistence/isolated-pg-transaction.ts';
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',PGHOST:'127.0.0.1',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic'};
const grnId='00000000-0000-4000-8000-000000000001';
const issueId='00000000-0000-4000-8000-000000000002';
const retId='00000000-0000-4000-8000-000000000003';
const command=(kind:StockCommand['kind'],qty:string,version:number,extra:Partial<StockCommand>={}):StockCommand=>({
 commandId:'CMD-'+kind,idempotencyKey:'KEY-'+kind,kind,legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 locationId:'LOC1',itemCode:'ITEM1',quantity:qty,expectedBalanceVersion:version,
 sourceDocumentId:kind==='RECEIVE'?grnId:kind==='ISSUE'?issueId:retId,
 sourceActionKey:kind==='RECEIVE'?'DEL1:1':'LINE-1',...extra,
});
type Kind='RECEIVE'|'ISSUE'|'RETURN';
function scripted(kind:Kind,available:bigint,custody:bigint,condition:'GOOD'|'DAMAGED'='GOOD',invoiceReceived=0n){
 const calls:{sql:string;params:readonly unknown[]}[]=[];
 const aid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const cid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const did='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const db:{[id:string]:bigint}={[aid]:available,[cid]:custody,[did]:0n};
 const versions:{[id:string]:number}={[aid]:kind==='RECEIVE'?0:kind==='ISSUE'?1:kind==='RETURN'&&condition==='GOOD'?2:3,[cid]:1,[did]:0};
 const results=(sql:string,params:readonly unknown[]):Record<string,unknown>[]=>{
  if(sql.includes('SELECT current_database()')) return [{db_name:env.HFT_TEST_PG_DATABASE,db_role:'hft_engineering'}];
  if(sql.includes('FROM hft.actor_warehouse_grant')) return [{active:true,may_post:true}];
  if(sql.includes('FROM hft.stock_approval')) return [{approved:true,approval_id:'APR1',revision:'1',approved_by:'APPROVER',
     inspected_condition:kind==='RETURN'?condition:null,inspection_evidence_id:kind==='RETURN'?'QC-1':null}];
  if(sql.includes('FROM hft.location')) return [{active:true}];
  if(sql.includes('FROM hft.item')) return [{control_type:'NONE',active:true,version:'1',uom:'NOS'}];
  if(sql.includes('FROM hft.warehouse')) return [{active:true,version:'1'}];
  if(sql.includes('FROM hft.employee\n')) return [{active:true,version:'1',full_name:'Synthetic',department:'Engineering',designation:'Technician'}];
  if(sql.includes('FROM hft.grn g')) return kind==='RECEIVE'?[{id:grnId,status:'AUTHORIZED',authorized_by:'APPROVER',
    supplier_active:true,invoice_status:'VERIFIED',verified_invoice_key:'INVOICE-01',invoice_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    physical_receipt_id:'DELIVERY-001'}]:[];
  if(sql.includes('FROM hft.grn_partial_receipt')) return kind==='RECEIVE'?[{receipt_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',
    line_no:1,accepted_micro:'5000000',item_code:'ITEM1',location_id:'LOC1',batch_no:'',serial_no:'',
    invoice_line_id:'11111111-1111-4111-8111-111111111111',invoice_received_micro:String(invoiceReceived),
    invoice_authorized_micro:'5000000'}]:[];
  if(sql.includes('FROM hft.material_issue\n')) return [{status:'AUTHORIZED',employee_id:'EMP1',approved_by:'APPROVER',purpose:'SYNTHETIC'}];
  if(sql.includes('FROM hft.material_issue_line')) return [{item_code:'ITEM1',location_id:'LOC1',serial_no:'',batch_no:'',authorized_micro:'2000000',issued_micro:'0'}];
  if(sql.includes('FROM hft.material_return mr')) return [{status:'AUTHORIZED',condition,evidence_reference:'QC-1',employee_id:'EMP1',
    linked_issue_document:issueId,original_authorizer:'APPROVER'}];
  if(sql.includes('FROM hft.material_return_line')) return [{item_code:'ITEM1',location_id:'LOC1',serial_no:'',batch_no:'',
    original_issue_command_id:'CMD-ISSUE',authorized_micro:'1000000',returned_micro:'0'}];
  if(sql.includes('SELECT source_document_id FROM hft.stock_command')) return [{source_document_id:issueId}];
  if(sql.includes('FROM hft.employee_custody ec')) return [{issued_micro:'2000000',
    returned_micro:kind==='RETURN'&&condition==='DAMAGED'?'1000000':'0',employee_id:'EMP1',item_code:'ITEM1',
    warehouse_id:'WH1',legal_entity_id:'HFT',location_id:'LOC1',serial_no:'',batch_no:'',source_document_id:issueId}];
  if(sql.includes('FROM hft.stock_account WHERE')){
    const accountKind=params[7]; const id=accountKind==='AVAILABLE'?aid:accountKind==='CUSTODY'?cid:did;
    return [{id,qty_micro:String(db[id]),reserved_micro:'0',version:String(versions[id])}];
  }
  if(sql.includes('UPDATE hft.stock_account')) {
    const id=String(params[0]);db[id]=BigInt(String(params[1]));versions[id]++;
    return [{id}];
  }
  if(sql.includes('INSERT INTO hft.stock_command(')) return [{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}];
  if(sql.includes('INSERT INTO hft.audit_outbox(')) return [{id:'99999999-9999-4999-8999-999999999999'}];
  if(sql.includes('UPDATE hft.grn_line') || sql.includes('UPDATE hft.supplier_invoice_line') ||
     sql.includes('UPDATE hft.material_issue_line') || sql.includes('UPDATE hft.material_return_line') ||
     sql.includes('UPDATE hft.employee_custody')) return [{id:'UPDATED',line_no:1,source_action_key:'LINE-1',issue_command_id:'bbbb'}];
  return [];
 };
 const client:PgQueryClient={
  async query<R extends Record<string,unknown>>(sql:string,params:readonly (string|number|bigint|boolean|null)[]=[]){
    calls.push({sql,params});const rows=results(sql,params);
    return {rows:rows as R[],rowCount:rows.length|| (sql.trim().startsWith('INSERT') && !sql.includes('RETURNING')?1:null)};
  },release(){}
 };
 const pool:PgPool={async connect(){return client;}};
 return {pool,calls,db,ids:{aid,cid,did}};
}
for(const [kind,before,held,qty,version,condition,expectedAvailable] of [
  ['ISSUE',5000000n,0n,'2',1,'GOOD','3'],
  ['RETURN',3000000n,2000000n,'1',2,'GOOD','4'],
  ['RETURN',4000000n,1000000n,'1',3,'DAMAGED','4'],
] as const){
 test('QA-001/002: scripted '+kind+' '+condition+' posts to distinct quantified accounts',async()=>{
  const p=scripted(kind,before,held,condition);
  const c=command(kind,qty,version,{employeeId:'EMP1',...(kind==='RETURN'?{originalIssueId:'CMD-ISSUE',condition}: {})});
  const r=await postIsolatedStockCommand(p.pool,env,c,verifiedFixtureOperator());
  assert.equal(r.available,expectedAvailable);
  const legs=p.calls.filter(q=>q.sql.includes('INSERT INTO hft.stock_entry('));
  assert.deepEqual(legs.map(l=>l.params[2]),kind==='ISSUE'?['AVAILABLE','CUSTODY']:
    condition==='GOOD'?['CUSTODY','AVAILABLE']:['CUSTODY','DAMAGED']);
  assert.notEqual(legs[0].params[1],legs[1].params[1]);
  if(kind==='ISSUE') {assert.equal(p.db[p.ids.aid],3000000n);assert.equal(p.db[p.ids.cid],2000000n);}
  else if(condition==='GOOD') {assert.equal(p.db[p.ids.aid],4000000n);assert.equal(p.db[p.ids.cid],1000000n);}
  else {assert.equal(p.db[p.ids.aid],4000000n);assert.equal(p.db[p.ids.cid],0n);assert.equal(p.db[p.ids.did],1000000n);assert.equal(p.calls.filter(x=>x.sql.includes('UPDATE hft.stock_account')).length,3);}
  assert.equal(p.calls.at(-1)?.sql,'COMMIT');
 });
}
test('QA-004/009: full invoice cannot accept another GRN receipt even from distinct delivery',async()=>{
 const p=scripted('RECEIVE',0n,0n,'GOOD',5000000n);
 await assert.rejects(postIsolatedStockCommand(p.pool,env,command('RECEIVE','5',0),verifiedFixtureOperator()),
    /GRN_RECEIPT_SCOPE_QC_LOT_OR_QUANTITY_MISMATCH/);
 assert.equal(p.calls.at(-1)?.sql,'ROLLBACK');
 assert.equal(p.calls.some(c=>c.sql.includes('INSERT INTO hft.stock_command(')),false);
});
