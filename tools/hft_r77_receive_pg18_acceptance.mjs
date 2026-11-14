/**
 * R77 DISPOSABLE PostgreSQL 18.6 RECEIVE acceptance driver.
 * NOT an installer, fixture generator, signer or release activator.
 * Never run against production. Independent QA must supply two distinct,
 * pre-authorized signed command/proof/readback fixture pairs.
 *
 * Usage (only after Chat 10/13/17 qualification):
 * HFT_R77_DISPOSABLE_EXECUTION_APPROVED=YES HFT_ENVIRONMENT=test
 * HFT_LIVE_POSTING_ENABLED=false HFT_R77_FIXTURE_FILE=/private/r77.json
 * node tools/hft_r77_receive_pg18_acceptance.mjs --execute
 *
 * No secrets are emitted. A failure is not a license to retry a command.
 */
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {createHash} from 'node:crypto';

const fail=(message)=>{throw Error('R77_ACCEPTANCE_'+message);};
function assert(x,message){if(!x)fail(message);}
function object(x,label){
 assert(x&&typeof x==='object'&&!Array.isArray(x),label);
 return x;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function caseFixture(value,label){
 const x=object(value,label);
 for(const field of ['payload','postingProof','readQuery','readProof'])object(x[field],label+'_'+field);
 assert(uuid.test(String(x.payload.commandId)),label+'_COMMAND_UUID');
 assert(x.payload.kind==='RECEIVE',label+'_RECEIVE_ONLY');
 assert(x.payload.quantityMicro&&/^[1-9][0-9]*$/.test(String(x.payload.quantityMicro)),
   label+'_POSITIVE_QUANTITY');
 assert(x.postingProof.payloadSha256&&/^[a-f0-9]{64}$/.test(x.postingProof.payloadSha256),
   label+'_SIGNED_PAYLOAD_DIGEST');
 assert(x.postingProof.nonce&&typeof x.postingProof.nonce==='string',label+'_ORIGINAL_NONCE');
 assert(x.readQuery.intent==='MOVEMENTS',label+'_MOVEMENT_READ_PROOF_REQUIRED');
 return x;
}
function validExecution(){
 assert(process.argv.length===3&&process.argv[2]==='--execute','EXPLICIT_EXECUTE_REQUIRED');
 assert(process.env.HFT_R77_DISPOSABLE_EXECUTION_APPROVED==='YES','AUTHORIZATION_REQUIRED');
 assert(process.env.HFT_ENVIRONMENT==='test'&&
  process.env.HFT_LIVE_POSTING_ENABLED==='false','NONPRODUCTION_ONLY');
 assert(process.env.NODE_ENV!=='production','PRODUCTION_RUNTIME_DENIED');
 assert(process.env.PGHOST==='127.0.0.1'&&
  process.env.PGDATABASE?.startsWith('hft_r1_disposable_'),
  'ISOLATED_DATABASE_IDENTITY_REQUIRED');
 assert(process.env.PGSSLMODE!=='disable','TLS_REQUIREMENT_NOT_QUALIFIED');
 assert(process.env.HFT_R77_FIXTURE_FILE?.startsWith('/'),
  'ABSOLUTE_PRIVATE_FIXTURE_PATH_REQUIRED');
}
async function identity(c){
 const r=await c.query(`SELECT current_database() AS db,
 session_user AS login,current_user AS role, current_setting('server_version_num') AS version,
 pg_is_in_recovery() AS replica`);
 assert(r.rows.length===1,'IDENTITY_CARDINALITY');
 const x=r.rows[0];
 assert(x.db===process.env.PGDATABASE&&x.login===process.env.PGUSER&&
  x.role===process.env.PGUSER&&x.version==='180006'&&x.replica===false,
  'DATABASE_VERSION_OR_ROLE_MISMATCH');
}
async function post(c,x){
 const r=await c.query(
  'SELECT hft.ops_a2_post_stock_command_v2($1::jsonb,$2::jsonb) AS result',
  [JSON.stringify(x.payload),JSON.stringify(x.postingProof)]);
 assert(r.rows.length===1&&r.rows[0].result?.state==='POSTED_PENDING_READBACK',
  'PROTECTED_WRITER_DID_NOT_RETURN_POSTED');
 assert(r.rows[0].result.commandId===x.payload.commandId,'POST_COMMAND_ID_MISMATCH');
}
async function recover(c,x){
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const r=await c.query(
   'SELECT hft.ops_a2_reconcile_post_v3($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb) AS evidence',
   [JSON.stringify(x.payload),JSON.stringify(x.postingProof),
    JSON.stringify(x.readQuery),JSON.stringify(x.readProof)]);
  await c.query('COMMIT');
  assert(r.rows.length===1,'RECONCILIATION_CARDINALITY');
  return object(r.rows[0].evidence,'RECONCILIATION_MISSING');
 }catch(e){await c.query('ROLLBACK');throw e;}
}
function inspectFact(x,e){
 assert(e.state==='COMMITTED_VERIFIED'&&e.auditVerified===true&&
  e.automaticRetryAllowed===false,'COMMIT_AUDIT_NOT_VERIFIED');
 assert(e.originalNonce===x.postingProof.nonce,'ORIGINAL_NONCE_MISMATCH');
 const f=object(e.fact,'IMMUTABLE_FACT_MISSING');
 assert(f.command?.commandId===x.payload.commandId,'FACT_COMMAND_DRIFT');
 assert(f.command?.sourceDocumentId===x.payload.sourceDocumentId,
  'FACT_GRN_DRIFT');
 assert(f.command?.inspectionEvidenceId===x.payload.inspectionEvidenceId,
  'FACT_QC_DRIFT');
 assert(Array.isArray(f.movements)&&f.movements.length===2,'TWO_LEDGER_LEGS_REQUIRED');
 const [debit,credit]=f.movements;
 assert(debit.bucket==='EXTERNAL'&&debit.accountId===null&&debit.account===null&&
  debit.accountBeforeVersion===null&&debit.accountAfterVersion===null,
  'EXTERNAL_MUST_BE_ACCOUNTLESS');
 assert(credit.bucket==='AVAILABLE'&&credit.accountId&&credit.account&&
  credit.accountAfterVersion===credit.accountBeforeVersion+1,
  'AVAILABLE_ACCOUNT_REVISION');
 assert(debit.signedQuantity==='-'+f.command.requestQuantity&&
  credit.signedQuantity===f.command.requestQuantity,'DEBIT_CREDIT_NOT_BALANCED');
 assert(f.auditSha256&&/^[a-f0-9]{64}$/.test(f.auditSha256)&&
  typeof f.auditCanonicalText==='string'&&
  createHash('sha256').update(f.auditCanonicalText,'utf8').digest('hex')===f.auditSha256,
  'IMMUTABLE_AUDIT_DIGEST_INVALID');
 return {commandId:x.payload.commandId,accountRevision:credit.accountAfterVersion};
}
async function main(){
 validExecution();
 const fixtures=object(JSON.parse(readFileSync(process.env.HFT_R77_FIXTURE_FILE,'utf8')),
  'FIXTURE');
 assert(fixtures.contractVersion==='HFT-R77-PG18-RECEIVE-ACCEPTANCE-V1',
  'FIXTURE_CONTRACT');
 const good=caseFixture(fixtures.positive,'POSITIVE');
 const rollback=caseFixture(fixtures.lateRollback,'LATE_ROLLBACK');
 assert(good.payload.commandId!==rollback.payload.commandId,'DISTINCT_COMMANDS_REQUIRED');
 assert(good.postingProof.nonce!==rollback.postingProof.nonce,'DISTINCT_NONCES_REQUIRED');
 const p=new Client({connectionString:process.env.HFT_R77_PG_DSN,
   host:process.env.PGHOST,database:process.env.PGDATABASE,
   user:process.env.PGUSER,ssl:{rejectUnauthorized:true}});
 const reader=new Client({connectionString:process.env.HFT_R77_PG_DSN,
   host:process.env.PGHOST,database:process.env.PGDATABASE,
   user:process.env.PGUSER,ssl:{rejectUnauthorized:true}});
 await p.connect();await reader.connect();
 try{
  await identity(p);await identity(reader);
  // Execute a real writer then force an error AFTER the writer returned,
  // before COMMIT. PostgreSQL must undo every mutation and audit write.
  await p.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
   await post(p,rollback);
   await p.query('SELECT 1/0 AS deliberate_late_failure');
   fail('FAULT_NOT_RAISED');
  }catch(e){
   assert(e.code==='22012','LATE_FAILURE_NOT_SQLSTATE_22012');
   await p.query('ROLLBACK');
  }
  const absent=await recover(reader,rollback);
  assert(absent.state==='INDETERMINATE_NOT_FOUND'&&
   absent.automaticRetryAllowed===false,'ROLLED_BACK_COMMAND_REAPPEARED');
  // Positive command is a different source receipt, nonce and approval.
  await p.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  let startedCommit=false;
  try{
   await post(p,good);
   startedCommit=true;
   await p.query('COMMIT');
  }catch(e){
   if(!startedCommit)await p.query('ROLLBACK');
   fail(startedCommit?'COMMIT_OUTCOME_UNCERTAIN_NO_RETRY':'POSITIVE_POST_FAILED');
  }
  const fact=inspectFact(good,await recover(reader,good));
  // Print identifiers only: never include signed proof, session, keys or DSN.
  process.stdout.write(JSON.stringify({status:'PG18_RECEIVE_SOURCE_HARNESS_COMPLETED',
   ...fact,lateRollback:'RECONCILED_NOT_FOUND_NO_RETRY',
   requiresIndependentQA:true})+'\n');
 }finally{await Promise.allSettled([p.end(),reader.end()]);}
}
main().catch(e=>{process.stderr.write(
 'R77_ACCEPTANCE_FAILED '+(e?.message?.startsWith('R77_ACCEPTANCE_')?
  e.message:'PROTECTED_EXECUTION_OR_EVIDENCE_FAILURE')+'\n');
 process.exitCode=1;});
