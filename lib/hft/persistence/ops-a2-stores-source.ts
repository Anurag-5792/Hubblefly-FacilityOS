/**
 * OPS-A2 source-only P0→P2 V2 protected posting boundary.
 *
 * Deliberately not imported by an HTTP route. The current P0 SQL resolver,
 * P2 V1 writer and API middleware guards remain rejecting. Calls here are
 * restricted to synthetic PG clients in nonproduction source tests until
 * independently accepted PostgreSQL code, roles and Gate A are installed.
 *
 * All SQL is SELECT on separately protected SECURITY DEFINER functions;
 * this module cannot INSERT, UPDATE or DELETE any stock ledger table.
 */
import {createHmac,randomBytes} from 'node:crypto';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {validateP0Operation,type P0In,type P0Out,type P0Transfer}
 from '../stores/p0-operations.ts';
import {issueStoresProof} from '../stores/p0-persistence.ts';
import {issueStoresReadProof} from '../stores/p0-readback.ts';
import {formatQuantity} from '../domain/quantity.ts';
import {assertP0PersistenceEnvironment} from '../stores/p0-persistence.ts';
import {withProtectedReadbackTransaction,withProtectedPostingTransaction}
 from './protected-posting-transaction.ts';
import {CommitOutcomeUncertain,type PgPool,type IsolatedPgEnvironment}
 from './isolated-pg-transaction.ts';
import {proposedOpsAPayload,opsAPayloadSha256,OPS_A_POST_PROOF_V2,
 canonicalOpsAPayloadFields,type OpsAPayload,type OpsAProof,type OpsAProofFields}
 from '../security/ops-a-versioned-invocation.ts';
import {validateOpsA2ReturnRequest} from '../stores/ops-a2-return-preparation.ts';
import {issueReturnProof} from '../security/ops-a2-return-proof.ts';
import {verifyReturnP2Source,type ProtectedReturnResolution}
 from './ops-a2-return-source.ts';
import {verifyVersionedImmutableFact,type VersionedCommand,
 type VersionedImmutableFact} from './ops-a-versioned-evidence.ts';

type StoreOp=P0In|P0Out|P0Transfer;
export type OpsA2Signer=Readonly<{key:Uint8Array;keyVersion:number;
 p0Key:Uint8Array;p0KeyVersion:number}>;
type Resolution=Readonly<{
 state:'OPS_A2_AUTHORIZED_SOURCE_V2';issuer:'HFT_P2_PROTECTED_DATABASE';
 actorSubject:string;sessionId:string;itemCode:string;productVersion:string;
 legalEntityId:string;siteId:string;warehouseId:string;
 sourceDocumentId:string;sourceActionKey:string;
 approvalPayloadSha256:string;sourceAccountId:string;destinationAccountId:string;
 command:VersionedCommand;
}>;
type P2Reconciliation=Readonly<{
 state:'COMMITTED_VERIFIED'|'INDETERMINATE_NOT_FOUND';
 automaticRetryAllowed:false;payloadSha256?:string;
 originalNonce?:string;fact?:VersionedImmutableFact;
 auditVerified?:boolean;sourceEpoch?:string;
}>;
export type OpsA2SourceResult=Readonly<{
 state:'SOURCE_ONLY_COMMITTED_FACT_VERIFIED_NOT_OPERATIONAL';
 requestId:string;productVersion:string;sourceEpoch:string;
 fact:VersionedImmutableFact;
}>;

const sha=/^[0-9a-f]{64}$/;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const sourceMode='OPS_A2_SYNTHETIC_PG_CLIENT_ONLY';
function object(value:unknown,code:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(code);
 return value as Record<string,unknown>;
}
function matching(op:StoreOp,source:Resolution,actor:VerifiedRequestOperator):void{
 if(source.state!=='OPS_A2_AUTHORIZED_SOURCE_V2'||
  source.issuer!=='HFT_P2_PROTECTED_DATABASE'||
  source.actorSubject!==actor.subject||source.sessionId!==actor.sessionId||
  source.legalEntityId!==op.legalEntityId||source.siteId!==op.siteId||
  source.warehouseId!==op.warehouseId||source.itemCode!==op.itemCode||
  source.productVersion!==op.productVersion||
  source.command.commandId!==op.requestId||
  source.command.idempotencyKey!==op.requestId||
  source.command.legalEntityId!==op.legalEntityId||
  source.command.siteId!==op.siteId||
  source.command.warehouseId!==op.warehouseId||
  source.command.itemCode!==op.itemCode||
  source.command.productVersion!==op.productVersion||
  source.command.controlType!==op.controlType||
  source.command.serialNo!==op.serialNo||
  source.command.batchNo!==op.batchNo||
  source.command.requestQuantity!==op.quantity||
  source.command.actorSubject!==actor.subject||
  source.command.sourceDocumentId!==source.sourceDocumentId||
  source.command.sourceActionKey!==source.sourceActionKey||
  !sha.test(source.approvalPayloadSha256)||
  !id.test(source.sourceAccountId)&&source.sourceAccountId!==''||
  !id.test(source.destinationAccountId)||
  source.command.approvedBy===actor.subject)
   throw Error('OPS_A2_RESOLVED_SOURCE_NOT_BOUND');
 if(op.kind==='IN'){
  if(source.command.kind!=='RECEIVE'||source.command.sourceLeafId!==''||
   source.command.destinationLeafId!==op.leafLocationId||
   source.sourceDocumentId!==op.grnId||
   source.sourceActionKey!==op.receiptKey||
   source.command.inspectionEvidenceId!==op.qcEvidenceId||
   source.command.employeeId!==''||source.sourceAccountId!=='')
   throw Error('OPS_A2_RECEIVE_SOURCE_INVALID');
 }else if(op.kind==='OUT'){
  if(source.command.kind!=='ISSUE'||
   source.command.sourceLeafId!==op.leafLocationId||
   source.command.destinationLeafId!==''||
   source.command.employeeId!==op.employeeId||
   source.command.fragmentId!==op.fragmentId||
   source.sourceDocumentId!==op.issueDocumentId||
   source.sourceActionKey!==op.fragmentId||
   !source.sourceAccountId)
   throw Error('OPS_A2_ISSUE_SOURCE_INVALID');
 }else if(op.kind==='TRANSFER'){
  if(source.command.kind!=='TRANSFER'||
   source.command.sourceLeafId!==op.sourceLeafId||
   source.command.destinationLeafId!==op.destinationLeafId||
   source.sourceDocumentId!==op.transferDocumentId||
   source.sourceAccountId===source.destinationAccountId||
   !source.sourceAccountId)
   throw Error('OPS_A2_TRANSFER_SOURCE_INVALID');
 }
}
function assertSyntheticOnly(env:IsolatedPgEnvironment):void{
 assertP0PersistenceEnvironment(env);
 if(env.HFT_OPS_A2_SOURCE_MODE!==sourceMode||
   env.HFT_ENVIRONMENT!=='test'||env.NODE_ENV!=='test'||
   env.HFT_LIVE_POSTING_ENABLED!=='false')
  throw Error('OPS_A2_PROTECTED_SQL_INSTALLATION_NOT_AUTHORIZED');
}
function sourceShape(value:unknown,op:StoreOp,actor:VerifiedRequestOperator):Resolution{
 const row=object(value,'OPS_A2_RESOLVER_MISSING');
 const command=object(row.command,'OPS_A2_RESOLVER_COMMAND_MISSING');
 const s=row as unknown as Resolution;
 if(!command||!Object.hasOwn(command,'expectedSourceAccountVersion')||
   !Object.hasOwn(command,'expectedDestinationAccountVersion'))
  throw Error('OPS_A2_UNVERIFIED_ACCOUNT_VERSIONS');
 matching(op,s,actor);
 return s;
}
function issueProof(payload:OpsAPayload,actor:VerifiedRequestOperator,
 signer:OpsA2Signer):OpsAProof{
 assertVerifiedRequestOperator(actor,payload);
 if(!(signer.key instanceof Uint8Array)||signer.key.length<32||
    !Number.isSafeInteger(signer.keyVersion)||signer.keyVersion<1)
   throw Error('OPS_A2_APPROVED_SIGNER_REQUIRED');
 // Session lifetime remains separately validated by the verified-session
 // issuer and PostgreSQL's posting_session + nonce + current key records.
 const at=Math.floor(Date.now()/1000);
 if(actor.expiresAt<=at)throw Error('OPS_A2_SIGNED_SESSION_EXPIRED');
 const fields:OpsAProofFields={
  proofVersion:OPS_A_POST_PROOF_V2,actorSubject:actor.subject,
  sessionId:actor.sessionId,payloadSha256:opsAPayloadSha256(payload),
  issuedAt:String(at),expiresAt:String(Math.min(at+40,actor.expiresAt)),
  nonce:randomBytes(24).toString('hex'),keyVersion:String(signer.keyVersion)};
 const macSha256=createHmac('sha256',signer.key).update(lengthPrefixedUtf8([
  fields.proofVersion,fields.actorSubject,fields.sessionId,fields.payloadSha256,
  fields.issuedAt,fields.expiresAt,fields.nonce,fields.keyVersion])).digest('hex');
 return Object.freeze({...fields,macSha256});
}
function checkedReconciliation(value:unknown,payload:OpsAPayload,
 proof:OpsAProof):P2Reconciliation{
 const row=object(value,'OPS_A2_RECOVERY_INVALID');
 if(row.state==='INDETERMINATE_NOT_FOUND'&&row.automaticRetryAllowed===false)
  return {state:'INDETERMINATE_NOT_FOUND',automaticRetryAllowed:false};
 if(row.state!=='COMMITTED_VERIFIED'||row.automaticRetryAllowed!==false||
  row.payloadSha256!==opsAPayloadSha256(payload)||
  row.originalNonce!==proof.nonce||row.auditVerified!==true||
  typeof row.sourceEpoch!=='string'||!id.test(row.sourceEpoch))
   throw Error('OPS_A2_RECOVERY_NOT_AUTHENTICATED');
 const fact=object(row.fact,'OPS_A2_FACT_MISSING') as unknown as VersionedImmutableFact;
 verifyVersionedImmutableFact(fact);
 if(fact.command.commandId!==payload.commandId||
   fact.command.idempotencyKey!==payload.idempotencyKey||
   fact.command.kind!==payload.kind||
   fact.command.legalEntityId!==payload.legalEntityId||
   fact.command.siteId!==payload.siteId||
   fact.command.warehouseId!==payload.warehouseId||
   fact.command.itemCode!==payload.itemCode||
   fact.command.productVersion!==payload.productVersion||
   fact.command.actorSubject!==payload.actorSubject||
   fact.command.sourceDocumentId!==payload.sourceDocumentId||
   fact.command.sourceActionKey!==payload.sourceActionKey||
   fact.command.requestQuantity!==formatQuantity(BigInt(payload.quantityMicro)))
  throw Error('OPS_A2_RECOVERED_FACT_SOURCE_MISMATCH');
 return row as unknown as P2Reconciliation;
}
async function authoritativeReconcile(pool:PgPool,env:IsolatedPgEnvironment,
 payload:OpsAPayload,proof:OpsAProof):Promise<P2Reconciliation>{
 const response=await withProtectedReadbackTransaction(pool,env,async client=>{
  const r=await client.query<{recovery:unknown}>(
   'SELECT hft.ops_a2_reconcile_post_v2($1::jsonb,$2::jsonb) AS recovery',
   [JSON.stringify(payload),JSON.stringify(proof)]);
  if(r.rows.length!==1)throw Error('OPS_A2_RECOVERY_ROW_MISSING');
  return r.rows[0].recovery;
 });
 return checkedReconciliation(response,payload,proof);
}
/** Single P2 post+original-nonce verification path used by each P0 kind.
 * Never carries an approved source from the browser. */
async function postResolvedPayload(pool:PgPool,env:IsolatedPgEnvironment,
 payload:OpsAPayload,actor:VerifiedRequestOperator,signer:OpsA2Signer
):Promise<OpsA2SourceResult>{
 const proof=issueProof(payload,actor,signer);
 let attempted=false;
 try{
  await withProtectedPostingTransaction(pool,env,async client=>{
   attempted=true;
   const r=await client.query<{result:unknown}>(
    'SELECT hft.ops_a2_post_stock_command_v2($1::jsonb,$2::jsonb) AS result',
    [JSON.stringify(payload),JSON.stringify(proof)]);
   const result=object(r.rows[0]?.result,'OPS_A2_POSTING_RESPONSE_MISSING');
   if(r.rows.length!==1||result.state!=='POSTED_PENDING_READBACK'||
      result.commandId!==payload.commandId||
      result.payloadSha256!==opsAPayloadSha256(payload))
    throw Error('OPS_A2_POSTING_RESPONSE_NOT_QUALIFIED');
  });
 }catch(error){
  if(!(error instanceof CommitOutcomeUncertain))throw error;
  // NEVER repost on an uncertain COMMIT. Use original nonce/proof only.
  const recovered=await authoritativeReconcile(pool,env,payload,proof);
  if(recovered.state==='INDETERMINATE_NOT_FOUND')
   throw Error('OPS_A2_UNCERTAIN_COMMIT_UNRESOLVED_NO_RETRY');
  return {state:'SOURCE_ONLY_COMMITTED_FACT_VERIFIED_NOT_OPERATIONAL',
   requestId:payload.commandId,productVersion:payload.productVersion,
   sourceEpoch:recovered.sourceEpoch!,fact:recovered.fact!};
 }
 if(!attempted)throw Error('OPS_A2_NO_POSTING_ATTEMPT');
 const recovered=await authoritativeReconcile(pool,env,payload,proof);
 if(recovered.state!=='COMMITTED_VERIFIED')
  throw Error('OPS_A2_COMMIT_READBACK_NOT_VERIFIED_NO_RETRY');
 return {state:'SOURCE_ONLY_COMMITTED_FACT_VERIFIED_NOT_OPERATIONAL',
  requestId:payload.commandId,productVersion:payload.productVersion,
  sourceEpoch:recovered.sourceEpoch!,fact:recovered.fact!};
}
/** Review-only integration boundary. A real PgPool must NEVER be passed without
 * separate protected database execution authorization and approved migration.
 */
export async function submitOpsA2SyntheticSource(pool:PgPool,env:IsolatedPgEnvironment,
 raw:unknown,actor:VerifiedRequestOperator,signer:OpsA2Signer
):Promise<OpsA2SourceResult>{
 const op=validateP0Operation(raw);
 if(op.kind==='COUNT')
  throw Error('OPS_A2_COUNT_SEPARATE_IMMUTABLE_OBSERVATION_AUTHORITY');
 assertVerifiedRequestOperator(actor,op);
 assertSyntheticOnly(env);
 if(op.kind==='IN'&&op.qcState!=='ACCEPTED')
  throw Error('OPS_A2_QC_ACCEPTED_REQUIRED');
 const p0Proof=issueStoresProof(op,actor,signer.p0Key,signer.p0KeyVersion);
 // P0's signed proof verifier takes FOR SHARE key/session locks. A READ ONLY
 // transaction cannot obtain those locks; this SERIALIZABLE transaction
 // performs no direct ledger DML. The actual writer rechecks all sources.
 const resolution=await withProtectedPostingTransaction(pool,env,async client=>{
  const r=await client.query<{source:unknown}>(
   'SELECT hft.ops_a2_resolve_authorized_v2($1::jsonb,$2::jsonb) AS source',
   [JSON.stringify(op),JSON.stringify(p0Proof)]);
  if(r.rows.length!==1)throw Error('OPS_A2_RESOLVER_ROW_MISSING');
  return sourceShape(r.rows[0].source,op,actor);
 });
 const payload=proposedOpsAPayload(resolution.command,
  resolution.sourceAccountId,resolution.destinationAccountId,
  resolution.approvalPayloadSha256);
 canonicalOpsAPayloadFields(payload);
 return postResolvedPayload(pool,env,payload,actor,signer);
}

/** RETURN source-only: separate signed transport, independently approved
 * original ISSUE/custody/inspection resolver, common two-leg writer and
 * original-nonce reconciliation. Only synthetic PG clients in test mode.
 * Posting remains forbidden through the production API and middleware.
 */
export async function submitOpsA2SyntheticReturnSource(pool:PgPool,
 env:IsolatedPgEnvironment,raw:unknown,actor:VerifiedRequestOperator,
 signer:OpsA2Signer):Promise<OpsA2SourceResult>{
 const op=validateOpsA2ReturnRequest(raw);
 assertVerifiedRequestOperator(actor,op);
 assertSyntheticOnly(env);
 const p0Proof=issueReturnProof(op,actor,signer.p0Key,signer.p0KeyVersion);
 const resolved=await withProtectedPostingTransaction(pool,env,async client=>{
  const r=await client.query<{source:unknown}>(
   'SELECT hft.ops_a2_resolve_return_authorized_v2($1::jsonb,$2::jsonb) AS source',
   [JSON.stringify(op),JSON.stringify(p0Proof)]);
  if(r.rows.length!==1)throw Error('OPS_A2_RETURN_SOURCE_ROW_MISSING');
  const x=object(r.rows[0].source,'OPS_A2_RETURN_PROTECTED_SOURCE_MISSING');
  if(x.issuer!=='HFT_P2_PROTECTED_DATABASE'||
   x.state!=='OPS_A2_AUTHORIZED_SOURCE_V2'||
   x.actorSubject!==actor.subject||x.sessionId!==actor.sessionId||
   x.legalEntityId!==op.legalEntityId||x.siteId!==op.siteId||
   x.warehouseId!==op.warehouseId||x.itemCode!==op.itemCode||
   x.productVersion!==op.productVersion)
   throw Error('OPS_A2_RETURN_ISSUER_SESSION_OR_SCOPE_MISMATCH');
  return x as unknown as ProtectedReturnResolution;
 });
 const payload=verifyReturnP2Source(op,resolved);
 canonicalOpsAPayloadFields(payload);
 return postResolvedPayload(pool,env,payload,actor,signer);
}
