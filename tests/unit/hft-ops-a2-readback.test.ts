/** OPS-A2 source-only P0 versioned readback integration. No live database. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readOpsA2SyntheticSource,checkOpsA2Readback}
 from '../../lib/hft/persistence/ops-a2-stores-readback.ts';
import {verifiedFixtureOperator} from '../support/signed-session-fixture.ts';
import {type PgPool,type PgQueryClient}
 from '../../lib/hft/persistence/isolated-pg-transaction.ts';
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const query={contractVersion:'HFT-R1-P0-READ-V1',intent:'BALANCES',
 ...scope,itemCode:'ITEM1',productVersion:'PV1',leafLocationId:'BIN1',
 employeeId:'',cursor:'',limit:20};
const row={...scope,itemCode:'ITEM1',productVersion:'PV1',
 leafLocationId:'BIN1',accountKind:'AVAILABLE',condition:'GOOD',
 serialNo:'',batchNo:'',employeeId:'',quantity:'5',accountVersion:2,
 movementId:'CMD1',auditSha256:'a'.repeat(64),
 humanAcknowledgement:'NOT_APPLICABLE'};
const valid={state:'AUTHORITATIVE_VERSIONED_READ',intent:'BALANCES',
 versionAuthority:'OPS_A2_VERSION_AWARE_V2',
 sourceEpoch:'EPOCH1',nextCursor:'',auditVerified:true,
 synthetic:false,durable:true,rows:[row]};
const env={NODE_ENV:'test',HFT_ENVIRONMENT:'test',HFT_AUTH_SOURCE:'verified',
 HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
 HFT_POSTING_RUN_MODE:'ISOLATED_DB_TEST',HFT_STORES_P0_SOURCE:'qualified_disposable_review',
 HFT_STORES_P0_SQL_CONTRACT:'HFT_R1_P0_PERSISTENCE_V1',
 HFT_OPS_A2_SOURCE_MODE:'OPS_A2_SYNTHETIC_PG_CLIENT_ONLY',
 PGHOST:'127.0.0.1',PGPORT:'54329',HFT_APPROVED_PG_PORT:'54329',
 PGDATABASE:'hft_r1_disposable_synthetic',
 HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic',
 PGUSER:'hft_r1_testlogin',HFT_P2_RUNTIME_LOGIN:'hft_r1_testlogin'};
function pg(result:unknown=valid){
 const calls:string[]=[],proofs:Record<string,unknown>[]=[];
 let connections=0;
 const pool:PgPool={async connect(){
  connections++;
  const client:PgQueryClient={
   async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
    calls.push(sql);
    if(sql.includes('SELECT current_database()'))
     return {rows:[{db_name:env.PGDATABASE,db_login:env.PGUSER,db_role:env.PGUSER,
      server_address:'127.0.0.1',server_port:54329}] as unknown as T[],rowCount:1};
    if(sql.includes('ops_a2_read_authoritative_v2')){
     proofs.push(JSON.parse(String(args[1])) as Record<string,unknown>);
     return {rows:[{response:result}] as unknown as T[],rowCount:1};
    }
    return {rows:[] as unknown as T[],rowCount:0};
   },release(){}};
  return client;
 }};
 return {pool,calls,proofs,connections:()=>connections};
}
test('OPS-A2 version-aware BALANCES returns only bounded synthetic projection',async()=>{
 const m=pg();
 const r=await readOpsA2SyntheticSource(m.pool,env,query,
  verifiedFixtureOperator(),new Uint8Array(32).fill(5),1);
 assert.equal(r.state,'SOURCE_ONLY_VERSIONED_READ_NOT_OPERATIONAL');
 assert.equal(r.rows[0].quantity,'5');
 assert.equal(r.rows[0].productVersion,'PV1');
 assert.equal(r.rows[0].leafLocationId,'BIN1');
 assert.equal(m.connections(),1);
 assert.equal(m.proofs[0].proofVersion,'HFT-R1-P0-STORES-READ-HMAC-V1');
 assert.ok(m.calls.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.ok(!m.calls.some(sql=>/\b(?:INSERT|UPDATE|DELETE)\s+hft\./i.test(sql)));
});
test('OPS-A2 wrong item version, entity, site and warehouse always rejected',()=>{
 for(const key of ['productVersion','legalEntityId','siteId','warehouseId'] as const){
  assert.throws(()=>checkOpsA2Readback({...valid,
   rows:[{...row,[key]:'SPOOFED'}]},query),/ROW_IDENTITY_INVALID|FILTER_NOT_ENFORCED/);
 }
});
test('OPS-A2 synthetic and unaudited readbacks denied',()=>{
 for(const changes of [{auditVerified:false},{synthetic:true},{durable:false},
  {versionAuthority:'PREVIEW'},{state:'AVAILABLE'}]){
  assert.throws(()=>checkOpsA2Readback({...valid,...changes},query),
   /PROVENANCE_OR_PAGINATION_NOT_QUALIFIED/);
 }
});
test('OPS-A2 versioned balance rejects negative quantity or forged account version',()=>{
 assert.throws(()=>checkOpsA2Readback({...valid,
  rows:[{...row,quantity:'-1'}]},query),/NEGATIVE_BALANCE/);
 assert.throws(()=>checkOpsA2Readback({...valid,
  rows:[{...row,accountVersion:-1}]},query),/ROW_IDENTITY_INVALID/);
});
test('OPS-A2 custody read requires exact employee, state and acknowledgement',()=>{
 const q={...query,intent:'CUSTODY',employeeId:'EMP1'};
 const item={...row,accountKind:'CUSTODY',
  employeeId:'EMP1',originalIssueId:'ISSUE1',originalFragmentId:'FRAG1',
  ackEvidenceSha256:'',humanAcknowledgement:'ACK_PENDING'};
 const resp={...valid,intent:'CUSTODY',rows:[item]};
 assert.equal(checkOpsA2Readback(resp,q).rows[0].employeeId,'EMP1');
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{
  ...item,humanAcknowledgement:'ACKNOWLEDGED_BY_BROWSER'}]},q),/CUSTODY_ACK_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{
  ...item,employeeId:'EMP2'}]},q),/FILTER_NOT_ENFORCED/);
 const disputed={...item,movementId:'ISSUE2',originalIssueId:'ISSUE2',
  originalFragmentId:'FRAG2',ackEvidenceSha256:'b'.repeat(64),
  humanAcknowledgement:'DISPUTED'};
 assert.equal(checkOpsA2Readback({...resp,rows:[item,disputed]},q).rows[1].humanAcknowledgement,'DISPUTED');
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{...item,originalIssueId:''}]},q),
  /CUSTODY_ACK_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{...item,originalFragmentId:''}]},q),
  /CUSTODY_ACK_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{
  ...disputed,ackEvidenceSha256:''}]},q),/CUSTODY_ACK_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{
  ...item,ackEvidenceSha256:'a'.repeat(64)}]},q),/CUSTODY_ACK_INVALID/);

});
test('OPS-A2 source rejects duplicate location/version/serial/custody row',()=>{
 assert.throws(()=>checkOpsA2Readback({...valid,rows:[row,row]},query),
  /DUPLICATE_ROW/);
});
test('OPS-A2 moved item to another physical bin fails exact scoped filter',()=>{
 assert.throws(()=>checkOpsA2Readback({...valid,rows:[{
  ...row,leafLocationId:'BIN2'}]},query),/FILTER_NOT_ENFORCED/);
});
test('OPS-A2 incorrect serial/lot and invalid account state fail',()=>{
 assert.throws(()=>checkOpsA2Readback({...valid,rows:[{
  ...row,serialNo:'INVALID SERIAL'}]},query),/TRACEABILITY_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...valid,rows:[{
  ...row,accountKind:'QUARANTINE',condition:'GOOD'}]},query),/ACCOUNT_STATE_INVALID/);
});
test('OPS-A2 movement read admits signed deltas but rejects zero movements',()=>{
 const q={...query,intent:'MOVEMENTS',itemCode:'',productVersion:'',leafLocationId:''};
 const movement={...row,quantity:'-3',accountVersion:2,
  commandUuid:'CMD01',entryId:'1',
  accountBeforeVersion:1,accountAfterVersion:2};
 const resp={...valid,intent:'MOVEMENTS',rows:[movement]};
 assert.equal(checkOpsA2Readback(resp,q).rows[0].quantity,'-3');
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{...movement,quantity:'0'}]},q),
  /ZERO_MOVEMENT/);
 const external={...movement,accountKind:'EXTERNAL',quantity:'-3',
  accountVersion:0,accountBeforeVersion:null,accountAfterVersion:null,
  movementId:'ENTRY-EXTERNAL',entryId:'2'};
 assert.equal(checkOpsA2Readback({...resp,rows:[external,movement]},q).rows[0].accountKind,'EXTERNAL');
 assert.throws(()=>checkOpsA2Readback({...resp,
  rows:[{...movement,accountAfterVersion:4}]},q),/HISTORICAL_MOVEMENT_REVISION_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,
  rows:[{...external,accountBeforeVersion:0}]},q),/HISTORICAL_MOVEMENT_REVISION_INVALID/);
 assert.equal(checkOpsA2Readback({...resp,rows:[movement]},q).rows[0].entryId,'1');
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{...movement,entryId:'0'}]},q),
  /HISTORICAL_MOVEMENT_REVISION_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{...movement,entryId:'BAD'}]},q),
  /HISTORICAL_MOVEMENT_REVISION_INVALID/);
 assert.throws(()=>checkOpsA2Readback({...resp,rows:[{...movement,entryId:'9223372036854775808'}]},q),
  /HISTORICAL_MOVEMENT_REVISION_INVALID/);

});
test('OPS-A2 missing signer, cross-scope actor or forbidden environment denies before DB',async()=>{
 for(const e of [{NODE_ENV:'production'},{HFT_OPS_A2_SOURCE_MODE:'ACTIVE'},
  {HFT_ENVIRONMENT:'production'}]){
  const m=pg();
  await assert.rejects(readOpsA2SyntheticSource(m.pool,{...env,...e},
   query,verifiedFixtureOperator(),new Uint8Array(32).fill(5),1));
  assert.equal(m.connections(),0);
 }
 const m=pg();
 await assert.rejects(readOpsA2SyntheticSource(m.pool,env,
  {...query,siteId:'OTHER'},verifiedFixtureOperator(),
  new Uint8Array(32).fill(5),1),/SIGNED_SCOPE_DENIED/);
 assert.equal(m.connections(),0);
});
