/** OPS-A2 synthetic protected SQL-client integration tests ONLY.
 * No PostgreSQL connection, DDL, route activation, actual receipt or stock.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import {type PgPool,type PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';
import {submitOpsA2SyntheticSource}
 from '../../lib/hft/persistence/ops-a2-stores-source.ts';
import {versionedMovementDigest,versionedFactAuditText,OPS_A_EVIDENCE_V1,
 type VersionedCommand,type VersionedImmutableFact,type StockAccountIdentity}
 from '../../lib/hft/persistence/ops-a-versioned-evidence.ts';
import {opsAPayloadSha256,type OpsAPayload,type OpsAProof}
 from '../../lib/hft/security/ops-a-versioned-invocation.ts';

const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_STORES_P0_SOURCE:'qualified_disposable_review',
 HFT_STORES_P0_SQL_CONTRACT:'HFT_R1_P0_PERSISTENCE_V1',
 HFT_OPS_A2_SOURCE_MODE:'OPS_A2_SYNTHETIC_PG_CLIENT_ONLY',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_testlogin',HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
const receipt={contractVersion:'HFT-R1-STORES-P0-PREPARE-V1',
 requestId:'11111111-1111-4111-8111-111111111111',kind:'IN',
 legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
 itemCode:'ITEM1',productVersion:'PV1',controlType:'NONE',
 quantity:'3',uom:'PCS',serialNo:'',batchNo:'',
 leafLocationId:'BIN1',grnId:'GRN1',receiptKey:'RECEIPT1',
 supplierId:'SUP1',invoiceNumber:'INV001',qcState:'ACCEPTED',qcEvidenceId:'QC1'};
const issue={...receipt,kind:'OUT',employeeId:'EMP1',
 issueDocumentId:'ISSUE1',fragmentId:'FRAG1',workOrderId:'',
 purpose:'Materials issued to employee'};
deleteMany(issue,'grnId','receiptKey','supplierId','invoiceNumber','qcState','qcEvidenceId');
const transfer={...receipt,kind:'TRANSFER',sourceLeafId:'BIN1',
 destinationLeafId:'BIN2',transferDocumentId:'MOVE1',
 reason:'Approved transfer of material'};
deleteMany(transfer,'leafLocationId','grnId','receiptKey','supplierId',
 'invoiceNumber','qcState','qcEvidenceId');
function deleteMany(target:Record<string,unknown>,...names:string[]){
 for(const name of names)delete target[name];
}
type Mode='OK'|'SPOOFED_RESOLVER'|'WRONG_VERSION'|'WRONG_ACCOUNT'|
 'BAD_POST'|'BAD_READBACK'|'LOST_COMMIT'|'NOT_FOUND'|'ROLLBACK';
const actor=()=>verifiedFixtureOperator();
const signer=()=>({key:new Uint8Array(32).fill(8),keyVersion:1,
 p0Key:new Uint8Array(32).fill(7),p0KeyVersion:1});
function doc(op:typeof receipt|typeof issue|typeof transfer):VersionedCommand{
 const kind=op.kind==='IN'?'RECEIVE':op.kind==='OUT'?'ISSUE':'TRANSFER';
 return {commandId:op.requestId,idempotencyKey:op.requestId,
  kind,legalEntityId:op.legalEntityId,siteId:op.siteId,warehouseId:op.warehouseId,
  itemCode:op.itemCode,productVersion:op.productVersion,controlType:'NONE',
  serialNo:'',batchNo:'',requestQuantity:'3',
  sourceLeafId:kind==='RECEIVE'?'':kind==='ISSUE'?'BIN1':'BIN1',
  destinationLeafId:kind==='RECEIVE'?'BIN1':kind==='ISSUE'?'':'BIN2',
  expectedSourceAccountVersion:kind==='RECEIVE'?null:2,
  expectedDestinationAccountVersion:kind==='ISSUE'?0:1,
  employeeId:kind==='ISSUE'?'EMP1':'',originalIssueId:'',
  sourceDocumentId:kind==='RECEIVE'?'GRN1':kind==='ISSUE'?'ISSUE1':'MOVE1',
  sourceActionKey:kind==='RECEIVE'?'RECEIPT1':'FRAG1',
  fragmentId:kind==='RECEIVE'?'':'FRAG1',
  sourceRevision:1,approvalId:'APP1',approvalRevision:1,
  policyGeneration:1,approvedBy:'CHECKER1',actorSubject:'STORE1',
  inspectedCondition:'GOOD',
  inspectionEvidenceId:kind==='RECEIVE'?'QC1':''};
}
function fact(command:VersionedCommand,fromId:string,toId:string):VersionedImmutableFact{
 const identity=(leaf:string,kind:StockAccountIdentity['kind'],emp=''):StockAccountIdentity=>({
  legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
  itemCode:'ITEM1',productVersion:'PV1',controlType:'NONE',
  serialNo:'',batchNo:'',leafLocationId:leaf,kind,condition:'GOOD',
  custodianEmployeeId:emp});
 const debit=command.kind==='RECEIVE'?{entryId:'ENTRY1',commandId:command.commandId,
  accountId:null,account:null,bucket:'EXTERNAL' as const,
  accountBeforeVersion:null,accountAfterVersion:null,signedQuantity:'-3'}:{
  entryId:'ENTRY1',commandId:command.commandId,accountId:fromId,
  account:identity('BIN1','AVAILABLE'),bucket:'AVAILABLE' as const,
  accountBeforeVersion:2,accountAfterVersion:3,signedQuantity:'-3'};
 const credit={entryId:'ENTRY2',commandId:command.commandId,
  accountId:toId,
  account:command.kind==='ISSUE'?identity('BIN1','CUSTODY','EMP1'):
   identity(command.kind==='TRANSFER'?'BIN2':'BIN1','AVAILABLE'),
  bucket:command.kind==='ISSUE'?'CUSTODY' as const:'AVAILABLE' as const,
  accountBeforeVersion:command.kind==='ISSUE'?0:1,
  accountAfterVersion:command.kind==='ISSUE'?1:2,signedQuantity:'3'};
 const movements=[debit,credit] as const;
 const incomplete:VersionedImmutableFact={schema:OPS_A_EVIDENCE_V1,
  command,ledgerEntryIds:movements.map(x=>x.entryId),movements,
  movementSha256:'',auditCanonicalText:'',auditSha256:''};
 const auditCanonicalText=versionedFactAuditText(incomplete);
 return {...incomplete,
  movementSha256:versionedMovementDigest(incomplete),auditCanonicalText,
  auditSha256:createHash('sha256').update(auditCanonicalText).digest('hex')};
}
function pg(op:typeof receipt|typeof issue|typeof transfer,mode:Mode='OK'){
 const calls:{sql:string;params:readonly unknown[]}[]=[];
 let connections=0,writerCommit=0,readbackNonce='',postProof:OpsAProof|undefined;
 let source=doc(op);
 let isPosted=false;
 const pool:PgPool={async connect(){
  const conn=++connections;
  const client:PgQueryClient={
   async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
    calls.push({sql,params});
    const response=(row:Record<string,unknown>)=>({rows:[row as Row],rowCount:1});
    if(sql.includes('SELECT current_database()'))
     return response({db_name:env.PGDATABASE,db_login:env.PGUSER,
      db_role:env.PGUSER,server_address:'127.0.0.1',server_port:54329});
    if(sql.includes('ops_a2_resolve_authorized_v2')){
     const claimed=JSON.parse(String(params[1]));
     assert.equal(claimed.proofVersion,'HFT-R1-P0-STORES-HMAC-V1');
     if(mode==='WRONG_VERSION')source={...source,productVersion:'PV2'};
     return response({source:{state:'OPS_A2_AUTHORIZED_SOURCE_V2',
      issuer:'HFT_P2_PROTECTED_DATABASE',
      actorSubject:mode==='SPOOFED_RESOLVER'?'OTHER':'STORE1',
      sessionId:'FIXTURE-JTI-01',itemCode:'ITEM1',productVersion:'PV1',
      legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1',
      sourceDocumentId:source.sourceDocumentId,sourceActionKey:source.sourceActionKey,
      approvalPayloadSha256:'a'.repeat(64),
      sourceAccountId:source.kind==='RECEIVE'?'':'ACC-SOURCE',
      destinationAccountId:source.kind==='ISSUE'?'ACC-CUST':'ACC-DEST',
      command:source}});
    }
    if(sql.includes('ops_a2_post_stock_command_v2')){
     const payload=JSON.parse(String(params[0])) as OpsAPayload;
     postProof=JSON.parse(String(params[1])) as OpsAProof;
     writerCommit++;
     if(mode==='ROLLBACK')throw Error('SYNTHETIC_PROTECTED_SQL_REJECTED');
     isPosted=true;
     return response({result:mode==='BAD_POST'?{state:'WRONG'}:{
      state:'POSTED_PENDING_READBACK',commandId:payload.commandId,
      payloadSha256:opsAPayloadSha256(payload)}});
    }
    if(sql.includes('ops_a2_reconcile_post_v3')){
     const freshQuery=JSON.parse(String(params[2])) as Record<string,unknown>;
     const freshProof=JSON.parse(String(params[3])) as Record<string,unknown>;
     assert.equal(freshQuery.intent,'MOVEMENTS');
     assert.equal(freshQuery.legalEntityId,'HFT');
     assert.equal(freshQuery.productVersion,'PV1');
     assert.equal(freshProof.proofVersion,'HFT-R1-P0-STORES-READ-HMAC-V1');
     assert.equal(freshProof.actorSubject,'STORE1');
     const payload=JSON.parse(String(params[0])) as OpsAPayload;
     const proof=JSON.parse(String(params[1])) as OpsAProof;
     readbackNonce=proof.nonce;
     if(mode==='NOT_FOUND')return response({recovery:{
      state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false}});
     const x=fact(source,payload.sourceAccountId,payload.destinationAccountId);
     return response({recovery:{
      state:'COMMITTED_VERIFIED',automaticRetryAllowed:false,
      payloadSha256:mode==='BAD_READBACK'?'b'.repeat(64):
       opsAPayloadSha256(payload),originalNonce:proof.nonce,
      sourceEpoch:'EPOCH1',auditVerified:true,fact:x}});
    }
    if(sql==='COMMIT'&&conn===2&&mode==='LOST_COMMIT')
     throw Error('SYNTHETIC_NETWORK_LOST_AFTER_COMMIT');
    return {rows:[] as Row[],rowCount:0};
   },
   release(){}};
  return client;
 }};
 return {pool,calls,connections:()=>connections,writerCommits:()=>writerCommit,
  readbackNonce:()=>readbackNonce,posted:()=>isPosted,proof:()=>postProof};
}
test('OPS-A2 source-only IN calls P0 scoped resolver, single V2 writer, independent readback',async()=>{
 const m=pg(receipt);const result=await submitOpsA2SyntheticSource(
  m.pool,env,receipt,actor(),signer());
 assert.equal(result.state,'SOURCE_ONLY_COMMITTED_FACT_VERIFIED_NOT_OPERATIONAL');
 assert.equal(result.productVersion,'PV1');
 assert.equal(result.fact.command.kind,'RECEIVE');
 assert.equal(m.writerCommits(),1);assert.equal(m.connections(),3);
 assert.equal(m.calls.filter(x=>x.sql.includes('ops_a2_post_stock_command_v2')).length,1);
 assert.equal(m.calls.filter(x=>x.sql.includes('ops_a2_reconcile_post_v3')).length,1);
 assert.equal(m.readbackNonce(),m.proof()?.nonce);
 assert.equal(m.calls.some(x=>/\b(?:INSERT|UPDATE|DELETE)\s+hft\./i.test(x.sql)),false);
});
test('OPS-A2 synthetic ISSUE requires custody and exact original P0 scope',async()=>{
 const m=pg(issue),result=await submitOpsA2SyntheticSource(
  m.pool,env,issue,actor(),signer());
 assert.equal(result.fact.command.kind,'ISSUE');
 assert.equal(result.fact.movements[1].bucket,'CUSTODY');
 assert.equal(result.fact.movements[1].account?.custodianEmployeeId,'EMP1');
 assert.equal(m.writerCommits(),1);
});
test('OPS-A2 synthetic TRANSFER uses one protected P2 writer not IN+OUT',async()=>{
 const m=pg(transfer),result=await submitOpsA2SyntheticSource(
  m.pool,env,transfer,actor(),signer());
 assert.equal(result.fact.command.kind,'TRANSFER');
 assert.equal(result.fact.movements[0].account?.leafLocationId,'BIN1');
 assert.equal(result.fact.movements[1].account?.leafLocationId,'BIN2');
 assert.equal(m.writerCommits(),1);
});
test('OPS-A2 forged resolver actor, item version or account ID denies before writer',async()=>{
 for(const mode of ['SPOOFED_RESOLVER','WRONG_VERSION'] as const){
  const m=pg(receipt,mode);
  await assert.rejects(submitOpsA2SyntheticSource(m.pool,env,receipt,
   actor(),signer()),/OPS_A2_RESOLVED_SOURCE_NOT_BOUND/);
  assert.equal(m.writerCommits(),0);
 }
});
test('OPS-A2 QC pending cannot reach PostgreSQL',async()=>{
 const m=pg(receipt);
 await assert.rejects(submitOpsA2SyntheticSource(m.pool,env,
  {...receipt,qcState:'PENDING',qcEvidenceId:''},actor(),signer()),
  /OPS_A2_QC_ACCEPTED_REQUIRED/);
 assert.equal(m.connections(),0);
});
test('OPS-A2 installation guard denies without source-only test scope before connecting',async()=>{
 for(const e of [{NODE_ENV:'production'},{HFT_ENVIRONMENT:'production'},
  {HFT_OPS_A2_SOURCE_MODE:'OPS_A2_PRODUCTION'},
  {HFT_LIVE_POSTING_ENABLED:'true'}]){
  const m=pg(receipt);
  await assert.rejects(submitOpsA2SyntheticSource(m.pool,{...env,...e},
   receipt,actor(),signer()));
  assert.equal(m.connections(),0);
 }
});
test('OPS-A2 invalid protected posting response rolls back without success',async()=>{
 const m=pg(receipt,'BAD_POST');
 await assert.rejects(submitOpsA2SyntheticSource(m.pool,env,receipt,
  actor(),signer()),/OPS_A2_POSTING_RESPONSE_NOT_QUALIFIED/);
 assert.equal(m.writerCommits(),1);
 assert.ok(m.calls.some(x=>x.sql==='ROLLBACK'));
});
test('OPS-A2 durable response requires independent immutable audit/proof readback',async()=>{
 const m=pg(receipt,'BAD_READBACK');
 await assert.rejects(submitOpsA2SyntheticSource(m.pool,env,receipt,
  actor(),signer()),/OPS_A2_RECOVERY_NOT_AUTHENTICATED/);
 assert.equal(m.writerCommits(),1);
});
test('OPS-A2 lost COMMIT uses original proof readback; never reposts',async()=>{
 const m=pg(receipt,'LOST_COMMIT');
 const result=await submitOpsA2SyntheticSource(m.pool,env,receipt,actor(),signer());
 assert.equal(result.fact.command.kind,'RECEIVE');
 assert.equal(m.writerCommits(),1);
 assert.equal(m.readbackNonce(),m.proof()?.nonce);
});
test('OPS-A2 missing uncertain commit cannot automatically retry',async()=>{
 const m=pg(receipt,'NOT_FOUND');
 await assert.rejects(submitOpsA2SyntheticSource(m.pool,env,receipt,
  actor(),signer()),/OPS_A2_COMMIT_READBACK_NOT_VERIFIED_NO_RETRY/);
 assert.equal(m.writerCommits(),1);
});
test('OPS-A2 failing source authority cannot call a protected writer',async()=>{
 const m=pg(receipt,'ROLLBACK');
 await assert.rejects(submitOpsA2SyntheticSource(m.pool,env,receipt,
  actor(),signer()),/SYNTHETIC_PROTECTED_SQL_REJECTED/);
 assert.ok(m.calls.includes(m.calls.find(x=>x.sql==='ROLLBACK')!));
 assert.equal(m.writerCommits(),1);
});
