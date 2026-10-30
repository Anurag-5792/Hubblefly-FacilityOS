/** P0 source protocol integration: scripted PG responses only, NOT PostgreSQL acceptance. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {submitP0Stores,issueStoresProof,storesPayloadSha256,
  assertP0PersistenceEnvironment,type StoresSigner} from '../../lib/hft/stores/p0-persistence.ts';
import {type PgPool,type PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import {formatSignedQuantity,parseQuantity} from '../../lib/hft/domain/quantity.ts';
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_STORES_P0_SOURCE:'qualified_disposable_review',
 HFT_STORES_P0_SQL_CONTRACT:'HFT_R1_P0_PERSISTENCE_V1',PGHOST:'127.0.0.1',
 PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_testlogin',HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
const base={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1' as const,
 requestId:'11111111-1111-4111-8111-111111111111',legalEntityId:'HFT',
 siteId:'SITE1',warehouseId:'WH1',itemCode:'PART001',productVersion:'REV1',
 controlType:'NONE' as const,quantity:'3',uom:'PCS',serialNo:'',batchNo:''};
const receipt={...base,kind:'IN' as const,leafLocationId:'BIN1',grnId:'GRN1',
 receiptKey:'RECEIPT1:1',supplierId:'SUP1',invoiceNumber:'INV-123',
 qcState:'ACCEPTED' as const,qcEvidenceId:'QC-ACCEPTED'};
const issue={...base,kind:'OUT' as const,leafLocationId:'BIN1',employeeId:'EMP1',
 workOrderId:'',issueDocumentId:'ISSUE1',fragmentId:'FRAG1',
 purpose:'Approved manufacturing material issue'};
const count={...base,kind:'COUNT' as const,leafLocationId:'BIN1',
 sessionId:'COUNT1',stockEpoch:'EPOCH1',lineId:'LINE1',
 condition:'GOOD' as const,inventoryState:'LOOSE' as const,evidenceId:'EVID1'};
const transfer={...base,kind:'TRANSFER' as const,sourceLeafId:'BIN1',destinationLeafId:'BIN2',
 transferDocumentId:'TRANSFER1',reason:'Governed warehouse bin transfer'};
function signer():StoresSigner{return {
 storesKey:randomBytes(32),storesKeyVersion:1,
 p2Signer:{keyBytes:randomBytes(32),keyVersion:1}
};}
function stock(kind:'IN'|'OUT',c=kind==='IN'?receipt:issue){
 return {state:'QUALIFIED_VERSION_COUPLED_SOURCE',
  p2WriterVersionGuard:'P2_WRITER_VERSION_COUPLED_V1',
  locationVerified:true,approvalVerified:true,holdPolicyChecked:true,
  productVersion:c.productVersion,actorSubject:'STORE1',sessionId:'FIXTURE-JTI-01',
  command:{commandId:c.requestId,idempotencyKey:c.requestId,
   kind:kind==='IN'?'RECEIVE':'ISSUE',legalEntityId:c.legalEntityId,
   siteId:c.siteId,warehouseId:c.warehouseId,itemCode:c.itemCode,
   locationId:c.leafLocationId,quantity:c.quantity,serialNo:'',batchNo:'',
   condition:'GOOD',expectedBalanceVersion:0,
   sourceDocumentId:kind==='IN'?receipt.grnId:issue.issueDocumentId,
   sourceActionKey:kind==='IN'?receipt.receiptKey:issue.fragmentId,
   fragmentId:kind==='IN'?'':issue.fragmentId,
   employeeId:kind==='IN'?'':issue.employeeId,originalIssueId:''},
  approval:{sourceRevision:1,approvalId:'APR1',approvalRevision:1,
   policyGeneration:1,approvedPayloadSha256:'a'.repeat(64),
   inspectionEvidenceId:''}};
}
function postResult(kind:'IN'|'OUT'){
 const c=kind==='IN'?receipt:issue;
 return {commandId:c.requestId,available:'3',accountVersion:1,replay:false,
  fact:{commandId:c.requestId,sourceDocumentId:kind==='IN'?receipt.grnId:issue.issueDocumentId,
   kind:kind==='IN'?'RECEIVE':'ISSUE',entityId:'HFT',warehouseId:'WH1',
   itemCode:'PART001',locationId:'BIN1',operatorId:'STORE1',
   employeeId:kind==='IN'?undefined:'EMP1',movements:kind==='IN'?
   [{bucket:'EXTERNAL',delta:'-3'},{bucket:'AVAILABLE',delta:'3'}]:
   [{bucket:'AVAILABLE',delta:'-3'},{bucket:'CUSTODY',delta:'3'}]}};
}
function countResult(c=count){
 const referenceQuantity='1';
 return {state:'COUNT_OBSERVATION_COMMITTED',requestId:c.requestId,sessionId:c.sessionId,
  stockEpoch:c.stockEpoch,lineId:c.lineId,
  legalEntityId:c.legalEntityId,siteId:c.siteId,warehouseId:c.warehouseId,
  leafLocationId:c.leafLocationId,locationPath:'WH1/RACK1/LEVEL1/BIN1',
  itemCode:c.itemCode,productVersion:c.productVersion,serialNo:'',batchNo:'',
  quantity:c.quantity,referenceQuantity,
  variance:formatSignedQuantity(parseQuantity(c.quantity)-parseQuantity(referenceQuantity)),
  recordedBy:'STORE1',recordedAt:'2026-10-30T07:00:00.000Z',
  durable:true,stockChanged:false,postingAuthorized:false};
}
type Mode='normal'|'wrongVersion'|'invalidCount'|'lostCommit'|'noReadback'|'readbackMismatch';
function mock(kind:'IN'|'OUT'|'COUNT',mode:Mode='normal'){
 let connections=0;
 const sqls:string[]=[],proofs:Record<string,unknown>[]=[];
 const released:boolean[]=[];
 const pg:PgPool={async connect(){
  const n=++connections;
  const client:PgQueryClient={
   async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
    sqls.push(sql);
    const row=(o:Record<string,unknown>)=>({rows:[o as unknown as Row],rowCount:1});
    if(sql.includes('SELECT current_database()'))return row({
     db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
     server_address:'127.0.0.1',server_port:54329});
    if(sql.includes('hft.p0_resolve_authorized_stock_v1(')){
     proofs.push(JSON.parse(String(params[1])) as Record<string,unknown>);
     const x=stock(kind as 'IN'|'OUT');
     if(mode==='wrongVersion')x.productVersion='UNAUTHORIZED';
     return row({response:x});
    }
    if(sql.includes('hft.post_stock_command_protected_v1('))return row({result:postResult(kind as 'IN'|'OUT')});
    if(sql.includes('hft.p0_append_count_observation_v1(')){
     proofs.push(JSON.parse(String(params[1])) as Record<string,unknown>);
     const result=countResult();
     if(mode==='invalidCount')result.variance='9000';
     return row({response:result});
    }
    if(sql.includes('hft.p0_reconcile_count_observation_v1(')){
     proofs.push(JSON.parse(String(params[1])) as Record<string,unknown>);
     if(mode==='noReadback')return row({response:{state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false}});
     const result=countResult();
     if(mode==='readbackMismatch')result.referenceQuantity='2';
     return row({response:{state:'COMMITTED_VERIFIED',result}});
    }
    if(sql==='COMMIT'&&n===1&&mode==='lostCommit')
     throw new Error('SYNTHETIC_COMMIT_RESPONSE_LOST');
    return {rows:[] as Row[],rowCount:0};
   },release(destroy?:boolean){released.push(destroy===true);}
  };return client;
 }};
 return {pg,sqls,proofs,released,connections:()=>connections};
}
test('P0 HMAC binds exact scope, version, all IN source fields and signed human',()=>{
 const a=verifiedFixtureOperator(),s=signer(),x=issueStoresProof(receipt,a,s.storesKey,1);
 assert.equal(x.actorSubject,'STORE1');assert.equal(x.sessionId,'FIXTURE-JTI-01');
 assert.equal(x.payloadSha256,storesPayloadSha256(receipt));
 assert.notEqual(x.payloadSha256,storesPayloadSha256({...receipt,productVersion:'REV2'}));
 assert.notEqual(x.payloadSha256,storesPayloadSha256({...receipt,invoiceNumber:'INV-124'}));
 assert.match(x.nonce,/^[0-9a-f]{48}$/);assert.match(x.macSha256,/^[0-9a-f]{64}$/);
});
test('IN resolves qualified DB references then calls ONLY P2 protected writer',async()=>{
 const m=mock('IN');
 const result=await submitP0Stores(m.pg,env,receipt,verifiedFixtureOperator(),signer());
 assert.equal(result.state,'POSTED_VERIFIED');
 if(result.state==='POSTED_VERIFIED'){
  assert.equal(result.kind,'IN');assert.equal(result.productVersion,'REV1');
  assert.equal(result.humanAcknowledgement,'NOT_APPLICABLE');
 }
 assert.equal(m.sqls.filter(x=>x.includes('p0_resolve_authorized_stock_v1')).length,1);
 assert.equal(m.sqls.filter(x=>x.includes('post_stock_command_protected_v1')).length,1);
 assert.ok(m.sqls.every(x=>!/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+hft\./i.test(x)));
 assert.equal(m.connections(),2);
});
test('OUT uses P2 single writer and conservatively leaves human ACK pending',async()=>{
 const m=mock('OUT');
 const result=await submitP0Stores(m.pg,env,issue,verifiedFixtureOperator(),signer());
 assert.equal(result.state,'POSTED_VERIFIED');
 if(result.state==='POSTED_VERIFIED')assert.equal(result.humanAcknowledgement,'PENDING');
 assert.equal(m.sqls.filter(x=>x.includes('post_stock_command_protected_v1')).length,1);
});
test('unqualified source version cannot be converted into a stock command',async()=>{
 const m=mock('IN','wrongVersion');
 await assert.rejects(submitP0Stores(m.pg,env,receipt,verifiedFixtureOperator(),signer()),
  /P0_VERSION_LOCATION_AND_APPROVAL_AUTHORITY_UNQUALIFIED/);
 assert.ok(!m.sqls.some(x=>x.includes('post_stock_command_protected_v1')));
});
test('QC PENDING is not available stock; zero DB calls',async()=>{
 const m=mock('IN');
 await assert.rejects(submitP0Stores(m.pg,env,{...receipt,qcState:'PENDING',qcEvidenceId:''},
  verifiedFixtureOperator(),signer()),/P0_QC_PENDING_NOT_AVAILABLE/);
 assert.equal(m.connections(),0);
});
test('COUNT appends only evidence, then independently reads committed observation',async()=>{
 const m=mock('COUNT');
 const r=await submitP0Stores(m.pg,env,count,verifiedFixtureOperator(),signer());
 assert.equal(r.state,'COUNT_OBSERVATION_COMMITTED');
 if(r.state==='COUNT_OBSERVATION_COMMITTED'){
  assert.equal(r.stockChanged,false);assert.equal(r.variance,'2');assert.equal(r.durable,true);
 }
 assert.equal(m.connections(),2);assert.deepEqual(m.released,[false,false]);
 assert.equal(m.proofs.length,2);assert.deepEqual(m.proofs[0],m.proofs[1]);
 assert.equal(m.sqls.filter(x=>x.includes('p0_append_count_observation_v1')).length,1);
 assert.ok(!m.sqls.some(x=>x.includes('post_stock_command_protected_v1')));
 assert.ok(m.sqls.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
});
test('COUNT rejects database-computed variance inconsistent with witnessed quantity',async()=>{
 const m=mock('COUNT','invalidCount');
 await assert.rejects(submitP0Stores(m.pg,env,count,verifiedFixtureOperator(),signer()),
  /P0_COUNT_VARIANCE_MISMATCH/);
 assert.ok(m.sqls.includes('ROLLBACK'));
});
test('ambiguous COUNT COMMIT only reconciles same original nonce, never re-appends',async()=>{
 const m=mock('COUNT','lostCommit');
 const r=await submitP0Stores(m.pg,env,count,verifiedFixtureOperator(),signer());
 assert.equal(r.state,'COUNT_OBSERVATION_COMMITTED');
 assert.deepEqual(m.released,[true,false]);
 assert.deepEqual(m.proofs[0],m.proofs[1]);
 assert.equal(m.sqls.filter(x=>x.includes('p0_append_count_observation_v1')).length,1);
});
test('COUNT missing readback never retries or claims success',async()=>{
 const m=mock('COUNT','noReadback');
 await assert.rejects(submitP0Stores(m.pg,env,count,verifiedFixtureOperator(),signer()),
  /P0_COUNT_COMMITTED_READBACK_REQUIRED_NO_RETRY/);
 assert.equal(m.sqls.filter(x=>x.includes('p0_append_count_observation_v1')).length,1);
});
test('COUNT mismatched readback rejects, without re-posting',async()=>{
 const m=mock('COUNT','readbackMismatch');
 await assert.rejects(submitP0Stores(m.pg,env,count,verifiedFixtureOperator(),signer()));
 assert.equal(m.sqls.filter(x=>x.includes('p0_append_count_observation_v1')).length,1);
});
test('TRANSFER not supported by existing P2 stock authority; never creates second writer',async()=>{
 const m=mock('COUNT');
 await assert.rejects(submitP0Stores(m.pg,env,transfer,verifiedFixtureOperator(),signer()),
  /P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION/);
 assert.equal(m.connections(),0);
});
test('unverified environment and production posting denied before database use',async()=>{
 for(const bad of [{NODE_ENV:'production'},{HFT_ENVIRONMENT:'production'},
  {HFT_LIVE_POSTING_ENABLED:'true'},{PGHOST:'remote.example'},
  {HFT_STORES_P0_SOURCE:'preview'},{HFT_STORES_P0_SQL_CONTRACT:'unapproved'}]){
  assert.throws(()=>assertP0PersistenceEnvironment({...env,...bad}));
 }
 const m=mock('COUNT');
 await assert.rejects(submitP0Stores(m.pg,{...env,NODE_ENV:'production'},
  count,verifiedFixtureOperator(),signer()));
 assert.equal(m.connections(),0);
});
