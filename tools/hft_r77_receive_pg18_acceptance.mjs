/**
 * R77 bounded PostgreSQL 18.6 RECEIVE-only qualification client.
 * SOURCE-ONLY; not an installer, signer, fixture issuer or runtime endpoint.
 * Executes only through an independently qualified hft_qa077 gateway.
 *
 * Each case needs a real, independently signed private fixture created from
 * genuine invoice, GRN, QC, approval, receipt, account and session records.
 * No fixture/secrets are synthesized, logged or committed here.
 *
 * After Chat 10/11/13/17 acceptance and separate disposable DB authorization:
 * HFT_R77_DISPOSABLE_EXECUTION_APPROVED=YES HFT_ENVIRONMENT=test
 * HFT_LIVE_POSTING_ENABLED=false HFT_R77_FIXTURE_FILE=/private/r77-case.json
 * HFT_R77_PG_CA_FILE=/private/approved-ca.pem
 * PGHOST=127.0.0.1 PGPORT=<qualified> PGDATABASE=hft_r1_disposable_<id>
 * PGUSER=<dedicated_qa_login> PGPASSWORD=<private>
 * PGSSLMODE=verify-full node tools/hft_r77_receive_pg18_acceptance.mjs
 *   --execute --case BULK_5
 *
 * No automatic retries; unknown COMMIT is held for original-nonce recovery.
 */
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {createHash} from 'node:crypto';

const cases=new Set(['BULK_5','SERIAL_1','LATE_ROLLBACK',
 'INVALID_ACTOR','WRONG_BIN','CHANGED_QUANTITY','FORGED_RECEIPT',
 'INVALID_APPROVAL','REPLAY']);
const negatives=new Set(['INVALID_ACTOR','WRONG_BIN','CHANGED_QUANTITY',
 'FORGED_RECEIPT','INVALID_APPROVAL','REPLAY']);
const hex64=/^[0-9a-f]{64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(code)=>{throw Error('R77_'+code);};
function assert(condition,code){if(!condition)fail(code);}
function object(x,code){
 assert(x!==null&&typeof x==='object'&&!Array.isArray(x),code);
 return x;
}
function positiveMicro(x){assert(typeof x==='string'&&/^[1-9][0-9]*$/.test(x),'POSITIVE_MICRO_REQUIRED');return BigInt(x);}
function signedQuantity(micro){
 const value=BigInt(micro);const negative=value<0n;
 const abs=(negative?-value:value).toString().padStart(7,'0');
 return (negative?'-':'')+abs.slice(0,-6)+
  (abs.slice(-6)==='000000'?'':'.'+abs.slice(-6).replace(/0+$/,''));
}
function readPair(pair,intent,fixture,limit){
 const x=object(pair,'SIGNED_READ_PAIR_REQUIRED');
 const q=object(x.query,'READ_QUERY_REQUIRED');
 const p=object(x.proof,'READ_PROOF_REQUIRED');
 const s=fixture.source;
 assert(q.contractVersion==='HFT-R1-P0-READ-V1'&&q.intent===intent&&
  q.legalEntityId===s.legalEntityId&&q.siteId===s.siteId&&
  q.warehouseId===s.warehouseId&&q.itemCode===s.itemCode&&
  q.productVersion===s.productVersion&&q.employeeId===''&&
  q.cursor===''&&q.limit===limit&&
  q.leafLocationId===(intent==='BALANCES'?s.physicalBin:''),
  'READ_PROOF_SOURCE_SCOPE_MISMATCH');
 assert(p.proofVersion==='HFT-R1-P0-STORES-READ-HMAC-V1'&&
  typeof p.nonce==='string'&&/^[0-9a-f]{48}$/.test(p.nonce)&&
  hex64.test(p.payloadSha256)&&hex64.test(p.macSha256),
  'CURRENT_SIGNED_READ_PROOF_REQUIRED');
 return x;
}
function fixtureFromFile(caseId){
 const f=object(JSON.parse(readFileSync(process.env.HFT_R77_FIXTURE_FILE,'utf8')),
  'FIXTURE_JSON_REQUIRED');
 assert(f.contractVersion==='HFT-R77-PG18-RECEIVE-ADMISSION-V2'&&
  f.caseId===caseId&&uuid.test(f.fixtureId),'EXACT_ADMISSION_CONTRACT_REQUIRED');
 const s=object(f.source,'ORIGINAL_SOURCE_REQUIRED');
 for(const id of ['grnId','invoiceId','invoiceLineId','receiptId','accountId'])
  assert(uuid.test(s[id]),'REAL_'+id.toUpperCase()+'_REQUIRED');
 for(const id of ['legalEntityId','siteId','warehouseId','itemCode',
   'productVersion','physicalBin','qcEvidenceId','approvalId','approvedBy'])
  assert(typeof s[id]==='string'&&s[id].length>1&&!/PLACEHOLDER|EXAMPLE|TODO/i.test(s[id]),
   'REAL_'+id.toUpperCase()+'_REQUIRED');
 assert(Number.isSafeInteger(s.grnLineNo)&&s.grnLineNo>0,'EXACT_GRN_LINE_REQUIRED');
 const admission=object(f.admission,'INDEPENDENT_ADMISSION_REQUIRED');
 for(const name of ['sha256','migrationSha256','aclSha256','approvalDecisionSha256']){
  assert(typeof admission[name]==='string'&&hex64.test(admission[name])&&
   !/^0{64}$/.test(admission[name]),'SIGNED_'+name.toUpperCase()+'_REQUIRED');
 }
 assert(admission.qaLogin===process.env.PGUSER&&
  /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,127}$/.test(admission.qaLogin),
  'QA_LOGIN_NOT_REGISTERED');
 const p=object(f.payload,'ORIGINAL_PAYLOAD_REQUIRED');
 const proof=object(f.postingProof,'ORIGINAL_SIGNED_PROOF_REQUIRED');
 assert(uuid.test(p.commandId)&&p.kind==='RECEIVE'&&
  p.legalEntityId===s.legalEntityId&&p.siteId===s.siteId&&
  p.warehouseId===s.warehouseId&&p.itemCode===s.itemCode&&
  p.productVersion===s.productVersion&&p.controlType===s.controlType&&
  p.serialNo===s.serialNo&&p.batchNo===s.batchNo&&
  p.approvalId===s.approvalId&&p.approvedBy===s.approvedBy,
  'ORIGINAL_SOURCE_PAYLOAD_MISMATCH');
 positiveMicro(p.quantityMicro);
 assert(proof.proofVersion==='HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED'&&
  proof.actorSubject===p.actorSubject&&hex64.test(proof.payloadSha256)&&
  hex64.test(proof.macSha256)&&/^[0-9a-f]{48}$/.test(proof.nonce),
  'REAL_SIGNED_ORIGINAL_PROOF_REQUIRED');
 if(caseId==='BULK_5'){
  assert(p.quantityMicro==='5000000'&&p.controlType!=='SERIAL',
   'FIVE_UNIT_BULK_MANDATORY');
 }
 if(caseId==='SERIAL_1'){
  assert(p.quantityMicro==='1000000'&&p.controlType==='SERIAL'&&
   typeof p.serialNo==='string'&&p.serialNo.length>1&&p.batchNo==='',
   'ONE_UNIT_SERIAL_MANDATORY');
 }
 const reads=object(f.reads,'FRESH_READ_PROOFS_REQUIRED');
 for(const name of ['before','after'])
  readPair(reads[name],'BALANCES',f,100);
 readPair(reads.movements,'MOVEMENTS',f,100);
 if(!negatives.has(caseId))
  readPair(reads.recovery,'MOVEMENTS',f,1);
 const nonces=[reads.before.proof.nonce,reads.after.proof.nonce,
   reads.movements.proof.nonce,
   ...(!negatives.has(caseId)?[reads.recovery.proof.nonce]:[])];
 assert(new Set(nonces).size===nonces.length,'FRESH_DISTINCT_READ_NONCES_REQUIRED');
 if(negatives.has(caseId))assert(typeof f.expectedReject==='string'&&
  /^OPS_A2_[A-Z0-9_]+$/.test(f.expectedReject),
  'NEGATIVE_EXACT_PROTECTED_DENIAL_REQUIRED');
 return f;
}
function validateExecution(){
 const a=process.argv;
 assert(a.length===5&&a[2]==='--execute'&&a[3]==='--case'&&
  cases.has(a[4]),'EXPLICIT_CASE_REQUIRED');
 assert(process.env.HFT_R77_DISPOSABLE_EXECUTION_APPROVED==='YES'&&
  process.env.HFT_ENVIRONMENT==='test'&&
  process.env.HFT_LIVE_POSTING_ENABLED==='false'&&
  process.env.NODE_ENV!=='production','NONPRODUCTION_AUTHORIZATION_REQUIRED');
 assert(process.env.PGHOST==='127.0.0.1'&&
  /^hft_r1_disposable_[a-z0-9_]{2,40}$/.test(process.env.PGDATABASE||'')&&
  /^hft_r1_[a-z0-9_]{5,40}$/.test(process.env.PGUSER||'')&&
  /^[0-9]{4,5}$/.test(process.env.PGPORT||'')&&
  process.env.PGSSLMODE==='verify-full'&&
  process.env.HFT_R77_PG_CA_FILE?.startsWith('/')&&
  process.env.HFT_R77_FIXTURE_FILE?.startsWith('/'),
  'ISOLATED_DB_TLS_AND_PRIVATE_FIXTURE_REQUIRED');
 assert(!process.env.HFT_R77_PG_DSN,'CONNECTION_STRING_OVERRIDE_FORBIDDEN');
}
function connect(){
 return new Client({host:process.env.PGHOST,
  port:Number(process.env.PGPORT),database:process.env.PGDATABASE,
  user:process.env.PGUSER,password:process.env.PGPASSWORD,
  ssl:{rejectUnauthorized:true,ca:readFileSync(process.env.HFT_R77_PG_CA_FILE,'utf8')},
  connectionTimeoutMillis:5000,statement_timeout:15000});
}
async function identity(c){
 const sql=`SELECT current_database() AS db,session_user AS login,
 current_user AS role,current_setting('server_version_num') AS version,
 pg_is_in_recovery() AS replica,inet_server_addr()::text AS addr,
 inet_server_port() AS port,
 (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()) AS tls,
 pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER') AS runtime_member,
 pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER') AS owner_member,
 pg_catalog.pg_has_role(session_user,'hft_r77_gateway_owner','MEMBER') AS gateway_member,
 pg_catalog.has_function_privilege(session_user,
   'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)','EXECUTE') AS direct_writer,
 pg_catalog.has_function_privilege(session_user,
   'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)','EXECUTE') AS direct_recovery,
 pg_catalog.has_function_privilege(session_user,
   'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)','EXECUTE') AS direct_reader,
 pg_catalog.has_function_privilege(session_user,
   'hft_qa077.post_receive_v1(uuid,text,jsonb,jsonb)','EXECUTE') AS gateway_writer,
 pg_catalog.has_function_privilege(session_user,
   'hft_qa077.reconcile_receive_v1(uuid,text,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
   AS gateway_recovery,
 pg_catalog.has_function_privilege(session_user,
   'hft_qa077.observe_receive_v1(uuid,text,jsonb,jsonb)','EXECUTE') AS gateway_observer,
 pg_catalog.has_function_privilege(session_user,
   'hft_qa077.challenge_receive_v1(uuid,text,jsonb,jsonb)','EXECUTE') AS gateway_negative,
 pg_catalog.has_function_privilege(session_user,
   'hft_qa077.read_receive_v1(uuid,text,jsonb,jsonb)','EXECUTE') AS gateway_reader,
 pg_catalog.has_schema_privilege(session_user,'hft_qa077','CREATE') AS qa_schema_create,
 pg_catalog.has_table_privilege(session_user,'hft_qa077.receive_fixture_v1',
  'INSERT,UPDATE,DELETE') AS qa_fixture_dml,
 (SELECT count(*)::int FROM pg_catalog.pg_proc proc
   JOIN pg_catalog.pg_namespace ns ON ns.oid=proc.pronamespace
   JOIN pg_catalog.pg_roles owner ON owner.oid=proc.proowner
   WHERE ns.nspname='hft_qa077' AND
    proc.proname IN ('post_receive_v1','challenge_receive_v1',
      'read_receive_v1','observe_receive_v1','reconcile_receive_v1')
    AND proc.prosecdef AND owner.rolname='hft_r77_gateway_owner') AS qualified_owner_count,
 (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
   AND NOT rolcreaterole AND NOT rolcreatedb
   FROM pg_catalog.pg_roles
   WHERE rolname='hft_r77_gateway_owner') AS gateway_owner_safe,
 pg_catalog.pg_has_role('hft_r77_gateway_owner','hft_r1_posting_owner',
   'MEMBER') AS gateway_owns_posting_owner,
 pg_catalog.has_function_privilege('hft_r77_gateway_owner',
   'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)','EXECUTE') AS owner_can_writer,
 pg_catalog.has_function_privilege('hft_r77_gateway_owner',
   'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)',
   'EXECUTE') AS owner_can_recover,
 pg_catalog.has_function_privilege('hft_r77_gateway_owner',
   'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)','EXECUTE') AS owner_can_read`;
 const rows=(await c.query(sql)).rows;
 assert(rows.length===1,'PG_IDENTITY_CARDINALITY');
 const x=rows[0];
 assert(x.db===process.env.PGDATABASE&&x.login===process.env.PGUSER&&
  x.role===process.env.PGUSER&&x.version==='180006'&&
  x.replica===false&&x.addr===process.env.PGHOST&&
  x.port===Number(process.env.PGPORT)&&x.tls===true&&
  x.runtime_member===true&&x.owner_member===false&&
  x.gateway_member===false&&x.direct_writer===false&&
  x.direct_recovery===false&&x.direct_reader===false&&
  x.gateway_writer===true&&x.gateway_recovery===true&&
  x.gateway_observer===true&&x.gateway_negative===true&&
  x.gateway_reader===true&&
  x.qa_schema_create===false&&x.qa_fixture_dml===false&&
  x.qualified_owner_count===5&&x.gateway_owner_safe===true&&
  x.gateway_owns_posting_owner===false&&
  x.owner_can_writer===true&&x.owner_can_recover===true&&
  x.owner_can_read===true,'PG_RESOURCE_OR_ACL_NOT_QUALIFIED');
}
function args(f){return [f.fixtureId,f.caseId,
 JSON.stringify(f.payload),JSON.stringify(f.postingProof)];}
async function posting(c,f){
 const result=(await c.query(
  'SELECT hft_qa077.post_receive_v1($1::uuid,$2::text,$3::jsonb,$4::jsonb) AS response',
  args(f))).rows;
 assert(result.length===1&&result[0].response?.state==='POSTED_PENDING_READBACK'&&
  result[0].response.commandId===f.payload.commandId,
  'POST_PROTECTED_GATEWAY_DID_NOT_RETURN_SUCCESS');
}
async function challenge(c,f){
 const result=(await c.query(
  'SELECT hft_qa077.challenge_receive_v1($1::uuid,$2::text,$3::jsonb,$4::jsonb) AS response',
  args(f))).rows;
 assert(result.length===1&&result[0].response?.state==='PROTECTED_WRITER_REJECTED'&&
  result[0].response.reason===f.expectedReject&&
  result[0].response.attemptWasRolledBack===true&&
  result[0].response.sqlstate!=='42501'&&result[0].response.sqlstate!=='42883',
  'NEGATIVE_NOT_REJECTED_BY_EXPECTED_PROTECTED_RULE');
}
async function readOnly(c,sql,params){
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const result=(await c.query(sql,params)).rows;
  await c.query('COMMIT');
  assert(result.length===1,'AUTHENTICATED_READ_CARDINALITY');
  return object(result[0].response,'AUTHENTICATED_READ_MISSING');
 }catch(error){
  await c.query('ROLLBACK').catch(()=>{});
  throw error;
 }
}
async function snapshot(c,f,label){
 const read=f.reads[label];
 const sql=`SELECT hft_qa077.observe_receive_v1(
  $1::uuid,$2::text,$3::jsonb,$4::jsonb) AS response`;
 const x=await readOnly(c,sql,[f.fixtureId,f.caseId,
  JSON.stringify(read.query),JSON.stringify(read.proof)]);
 const a=f.admission;
 assert(x.state==='R77_AUTHENTICATED_POSTGRESQL_OBSERVATION_NOT_ACCEPTANCE'&&
  x.fixtureId===f.fixtureId&&x.caseId===f.caseId&&
  x.sessionUser===process.env.PGUSER&&x.database===process.env.PGDATABASE&&
  x.independentAdmissionSha256===a.sha256&&
  x.migrationSha256===a.migrationSha256&&x.aclSha256===a.aclSha256&&
  (negatives.has(f.caseId)?x.expectedReject===f.expectedReject:
   x.expectedReject===null),
  'SNAPSHOT_OR_INDEPENDENT_ADMISSION_NOT_QUALIFIED');
 const bal=object(x.balances,'AUTHENTICATED_BALANCES_MISSING');
 assert(bal.state==='AUTHORITATIVE_VERSIONED_READ'&&
  bal.intent==='BALANCES'&&bal.auditVerified===true&&
  bal.synthetic===false&&bal.durable===true&&bal.nextCursor===''&&
  Array.isArray(bal.rows),'AUTHENTICATED_BALANCES_INCOMPLETE');
 return x;
}
async function movements(c,f){
 const read=f.reads.movements;
 return readOnly(c,
  'SELECT hft_qa077.read_receive_v1($1::uuid,$2::text,$3::jsonb,$4::jsonb) AS response',
  [f.fixtureId,f.caseId,JSON.stringify(read.query),JSON.stringify(read.proof)]);
}
async function recover(c,f){
 const read=f.reads.recovery;
 return readOnly(c,
  'SELECT hft_qa077.reconcile_receive_v1($1::uuid,$2::text,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb) AS response',
  [...args(f),JSON.stringify(read.query),JSON.stringify(read.proof)]);
}
function validatePreSource(f,x){
 const s=f.source, p=f.payload;
 assert(x.grn?.invoiceId===s.invoiceId&&
  x.invoice?.status==='VERIFIED'&&
  x.receipt?.id===s.receiptId&&x.receipt?.grnId===s.grnId&&
  x.receipt?.lineNo===s.grnLineNo&&
  x.receipt?.qcState==='ACCEPTED'&&
  x.receipt?.qcEvidenceId===s.qcEvidenceId&&
  x.receipt?.bin===s.physicalBin&&
  x.receipt?.itemCode===s.itemCode&&
  x.receipt?.productVersion===s.productVersion&&
  x.receipt?.serialNo===s.serialNo&&x.receipt?.batchNo===s.batchNo&&
  x.account?.accountId===s.accountId&&
  x.account?.bin===s.physicalBin&&x.account?.kind==='AVAILABLE'&&
  x.account?.condition==='GOOD'&&
  x.account?.productVersion===s.productVersion&&
  x.account?.serialNo===s.serialNo&&x.account?.batchNo===s.batchNo&&
  x.invoiceLine?.itemCode===s.itemCode,
  'ORIGINAL_INVOICE_QC_RECEIPT_ACCOUNT_NOT_AUTHENTICATED');
 assert(x.grn?.status==='AUTHORIZED'||x.grn?.status==='PARTIALLY_RECEIVED',
  'ORIGINAL_GRN_NOT_AUTHORIZED');
 const line=x.allGrnLines?.find(row=>row.lineNo===s.grnLineNo);
 assert(line?.invoiceLineId===s.invoiceLineId,
  'ORIGINAL_GRN_INVOICE_LINE_IDENTITY_MISMATCH');
 if(f.caseId==='BULK_5'||f.caseId==='SERIAL_1'||f.caseId==='LATE_ROLLBACK'){
  assert(x.receipt.acceptedMicro===p.quantityMicro&&
   x.grn.authorizationRevision===Number(p.sourceRevision)&&
   x.grn.authorizedBy===s.approvedBy&&
   x.sourceBinding?.status==='APPROVED'&&
   x.sourceBinding.authorizedMicro===p.quantityMicro&&
   x.sourceBinding.approvalId===s.approvalId&&
   x.approval?.approved===true&&
   x.approval?.documentId===s.grnId&&
   x.approval?.quantityMicro===p.quantityMicro&&
   x.approvalDecision?.decisionEvidenceSha256===
    f.admission.approvalDecisionSha256&&
   x.approval?.inspectionEvidenceId===s.qcEvidenceId,
   'APPROVAL_AND_EXACT_PHYSICAL_RECEIPT_UNVERIFIED');
 }
}
function countZero(x){
 const keys=['commands','receiptCommands','entries','nonce',
  'seals','audit','auditDelivery','envelopes','outcomes'];
 return keys.every(k=>x.effects?.[k]===0);
}
function stableEvidence(x){
 const y={...x};delete y.balances;
 // Every source/account/nonce/seal/audit field must remain byte-equivalent.
 return JSON.stringify(y);
}
function validateRollback(before,after){
 assert(stableEvidence(before)===stableEvidence(after),
  'LATE_ROLLBACK_SOURCE_LEDGER_NONCE_OR_AUDIT_CHANGED');
 assert(JSON.stringify(before.balances.rows)===JSON.stringify(after.balances.rows),
  'LATE_ROLLBACK_AUTHENTICATED_BALANCE_CHANGED');
}
function validatePositive(f,before,after,read,recovered){
 const qty=positiveMicro(f.payload.quantityMicro),s=f.source;
 assert(countZero(before),'POSITIVE_NOT_AN_UNPOSTED_RECEIPT');
 assert(after.grn.invoiceId===before.grn.invoiceId&&
  after.grn.authorizationRevision===before.grn.authorizationRevision&&
  after.grn.authorizedBy===before.grn.authorizedBy&&
  JSON.stringify(after.receipt)===JSON.stringify(before.receipt)&&
  JSON.stringify(after.invoice)===JSON.stringify(before.invoice)&&
  JSON.stringify(after.approval)===JSON.stringify(before.approval)&&
  JSON.stringify(after.approvalDecision)===JSON.stringify(before.approvalDecision),
  'COMMITTED_ORIGINAL_PROVENANCE_CHANGED');
 const oldLine=before.allGrnLines.find(x=>x.lineNo===s.grnLineNo);
 const newLine=after.allGrnLines.find(x=>x.lineNo===s.grnLineNo);
 assert(BigInt(newLine.acceptedMicro)===BigInt(oldLine.acceptedMicro)+qty&&
  after.allGrnLines.length===before.allGrnLines.length&&
  after.allGrnLines.every(x=>x.lineNo===s.grnLineNo||
   JSON.stringify(x)===JSON.stringify(before.allGrnLines.find(y=>y.lineNo===x.lineNo))),
  'WRONG_GRN_LINE_MUTATION');
 const totalOrder=after.allGrnLines.reduce((n,x)=>n+BigInt(x.orderedMicro),0n);
 const totalReceived=after.allGrnLines.reduce((n,x)=>n+BigInt(x.acceptedMicro),0n);
 const status=totalOrder===totalReceived?'RECEIVED':'PARTIALLY_RECEIVED';
 assert(after.grn.status===status&&
  BigInt(after.invoiceLine.receivedMicro)===
   BigInt(before.invoiceLine.receivedMicro)+qty&&
  BigInt(after.account.quantityMicro)===
   BigInt(before.account.quantityMicro)+qty&&
  after.account.revision===before.account.revision+1,
  'COUNTER_STATUS_OR_ACCOUNT_REVISION_INCORRECT');
 const effects=after.effects;
 for(const key of ['commands','receiptCommands','nonce','seals',
  'audit','auditDelivery','envelopes','outcomes'])
  assert(effects[key]===1,'IMMUTABLE_POSTING_EFFECT_MISSING_'+key);
 assert(effects.entries===2&&hex64.test(effects.auditDigest),
  'IMMUTABLE_LEDGER_AUDIT_INCOMPLETE');
 if(f.caseId==='SERIAL_1')
  assert(after.serial?.state==='AVAILABLE'&&before.serial===null,
   'SERIAL_REGISTRY_NOT_ATOMICALLY_CREATED');
 const a=after.balances.rows.filter(x=>x.itemCode===s.itemCode&&
  x.productVersion===s.productVersion&&x.leafLocationId===s.physicalBin&&
  x.accountKind==='AVAILABLE'&&x.condition==='GOOD'&&
  x.serialNo===s.serialNo&&x.batchNo===s.batchNo);
 assert(a.length===1&&a[0].quantity===signedQuantity(after.account.quantityMicro)&&
  a[0].accountVersion===after.account.revision,
  'INDEPENDENT_AUTHENTICATED_BALANCE_READ_MISMATCH');
 assert(read.state==='AUTHORITATIVE_VERSIONED_READ'&&
  read.intent==='MOVEMENTS'&&read.auditVerified===true&&
  read.synthetic===false&&read.durable===true&&read.nextCursor===''&&
  Array.isArray(read.rows),'INDEPENDENT_MOVEMENT_READ_UNVERIFIED');
 const related=read.rows.filter(x=>x.commandUuid===effects.internalCommandUuid);
 assert(related.length===2,'INDEPENDENT_TWO_MOVEMENTS_MISSING');
 const debit=related.find(x=>x.accountKind==='EXTERNAL');
 const credit=related.find(x=>x.accountKind==='AVAILABLE');
 assert(debit&&credit&&
  debit.quantity===signedQuantity(-qty)&&debit.accountBeforeVersion===null&&
  debit.accountAfterVersion===null&&credit.quantity===signedQuantity(qty)&&
  credit.accountBeforeVersion===before.account.revision&&
  credit.accountAfterVersion===after.account.revision&&
  credit.leafLocationId===s.physicalBin&&
  credit.auditSha256===effects.auditDigest&&
  debit.auditSha256===effects.auditDigest,
  'EXTERNAL_AVAILABLE_REVISIONS_OR_IMMUTABLE_AUDIT_DRIFT');
 assert(recovered.state==='COMMITTED_VERIFIED'&&
  recovered.automaticRetryAllowed===false&&
  recovered.auditVerified===true&&
  recovered.originalNonce===f.postingProof.nonce,
  'COMMIT_ORIGINAL_NONCE_NOT_RECONCILED');
 const fact=object(recovered.fact,'IMMUTABLE_RECONCILIATION_FACT_MISSING');
 assert(fact.command?.commandId===f.payload.commandId&&
  fact.command?.sourceDocumentId===s.grnId&&
  fact.command?.inspectionEvidenceId===s.qcEvidenceId&&
  fact.command?.requestQuantity===signedQuantity(qty)&&
  fact.movements?.length===2&&
  fact.movements[0].accountId===null&&
  fact.movements[0].bucket==='EXTERNAL'&&
  fact.movements[1].bucket==='AVAILABLE'&&
  fact.movements[1].accountAfterVersion===after.account.revision&&
  fact.movements[1].signedQuantity===signedQuantity(qty)&&
  fact.movements[0].signedQuantity===signedQuantity(-qty)&&
  fact.auditSha256===createHash('sha256').update(
   fact.auditCanonicalText,'utf8').digest('hex'),
  'IMMUTABLE_FACT_OR_AUDIT_DIGEST_MISMATCH');
}
async function executeCase(p,reader,f){
 const before=await snapshot(reader,f,'before');
 validatePreSource(f,before);
 if(f.caseId==='LATE_ROLLBACK'){
  assert(countZero(before),'ROLLBACK_SOURCE_NOT_FRESH');
  await p.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  let posted=false,rolledBack=false;
  try{
   await posting(p,f);posted=true;
   await p.query('SELECT 1/0 AS intentional_failure_after_writer');
   fail('EXPECTED_LATE_SQL_FAULT_MISSING');
  }catch(error){
   if(!posted||error.code!=='22012')
    fail('LATE_WRITER_SUCCESS_AND_SQLSTATE_22012_REQUIRED');
   await p.query('ROLLBACK');rolledBack=true;
  }finally{
   if(!rolledBack)await p.query('ROLLBACK').catch(()=>{});
  }
  const after=await snapshot(reader,f,'after');
  validateRollback(before,after);
  assert(countZero(after),'ROLLED_BACK_COMMAND_OR_NONCE_SURVIVED');
  const result=await recover(reader,f);
  assert(result.state==='INDETERMINATE_NOT_FOUND'&&
   result.automaticRetryAllowed===false,'ORIGINAL_ROLLBACK_RECOVERY_FAILED');
  return {caseId:f.caseId,state:'LATE_STAGE_PG_ROLLBACK_OBSERVED'};
 }
 if(negatives.has(f.caseId)){
  if(f.caseId!=='REPLAY')assert(countZero(before),'NEGATIVE_UNPOSTED_PRESTATE_REQUIRED');
  else assert(before.effects.commands===1,'REPLAY_ORIGINAL_POSITIVE_REQUIRED');
  await p.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  let startedCommit=false;
  try{await challenge(p,f);startedCommit=true;await p.query('COMMIT');}
  catch{if(!startedCommit)await p.query('ROLLBACK').catch(()=>{});
   fail(startedCommit?'NEGATIVE_COMMIT_UNCERTAIN':'NEGATIVE_PROTECTED_CHALLENGE_FAILED');}
  const after=await snapshot(reader,f,'after');
  validateRollback(before,after);
  return {caseId:f.caseId,state:'PROTECTED_DENIAL_AND_ZERO_DELTA_OBSERVED'};
 }
 assert(countZero(before),'POSITIVE_PREPOSTED_RECEIPT_NO_RETRY');
 await p.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 let startedCommit=false;
 try{await posting(p,f);startedCommit=true;await p.query('COMMIT');}
 catch{if(!startedCommit)await p.query('ROLLBACK').catch(()=>{});
  fail(startedCommit?'UNKNOWN_COMMIT_DO_NOT_REPOST':'PROTECTED_POSTING_FAILED_NO_RETRY');}
 const after=await snapshot(reader,f,'after');
 const read=await movements(reader,f);
 const recovery=await recover(reader,f);
 validatePositive(f,before,after,read,recovery);
 return {caseId:f.caseId,state:'PG18_RECEIVE_OBSERVED_PENDING_INDEPENDENT_QA',
  accountRevision:after.account.revision};
}
async function main(){
 validateExecution();
 const f=fixtureFromFile(process.argv[4]);
 const writer=connect(),reader=connect();
 await writer.connect();await reader.connect();
 try{
  await identity(writer);await identity(reader);
  const result=await executeCase(writer,reader,f);
  // Do not disclose original proof, HMAC, session, DSN or private source docs.
  process.stdout.write(JSON.stringify({contract:'HF16-R77-RECEIVE-SOURCE-DRIVER-V2',
   database:process.env.PGDATABASE,commandId:f.payload.commandId,
   fixtureId:f.fixtureId,independentQAAcceptance:false,...result})+'\n');
 }finally{await Promise.allSettled([writer.end(),reader.end()]);}
}
main().catch(e=>{
 const code=e instanceof Error&&e.message.startsWith('R77_')?
  e.message:'R77_PROTECTED_EXECUTION_OR_PROVENANCE_FAILURE';
 process.stderr.write(code+'\n');process.exitCode=1;
});
