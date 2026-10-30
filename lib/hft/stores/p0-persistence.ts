/**
 * HFT Stores P0 controlled persistence bridge. Does not invent approval,
 * product-version attribution, physical location or stock balances.
 * All database functions referenced here are REVIEW-ONLY until a separately
 * qualified forward migration installs them and their effective ACLs.
 * No direct stock-table DML is issued from this adapter.
 */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseQuantity,formatSignedQuantity} from '../domain/quantity.ts';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertProtectedPostingEnvironment,withProtectedPostingTransaction,
  withProtectedReadbackTransaction} from '../persistence/protected-posting-transaction.ts';
import {postProtectedStockCommand,type PersistedApprovalReference,
  type ServerProofKeyHandle} from '../persistence/protected-stock-posting.ts';
import {CommitOutcomeUncertain,type IsolatedPgEnvironment,type PgPool}
 from '../persistence/isolated-pg-transaction.ts';
import type {StockCommand,PostResult} from '../domain/ledger.ts';
import {validateP0Operation,type P0In,type P0Out,
  type P0Count} from './p0-operations.ts';

export const STORES_PROOF_V1='HFT-R1-P0-STORES-HMAC-V1' as const;
export type StoresProof=Readonly<{
 proofVersion:typeof STORES_PROOF_V1;actorSubject:string;sessionId:string;
 payloadSha256:string;issuedAt:string;expiresAt:string;nonce:string;
 keyVersion:string;macSha256:string;
}>;
export type StoresSigner=Readonly<{
 storesKey:Uint8Array;storesKeyVersion:number;p2Signer:ServerProofKeyHandle;
}>;
export type PostedStoreResult=Readonly<{
 state:'POSTED_VERIFIED';kind:'IN'|'OUT';requestId:string;productVersion:string;
 durable:true;stockChanged:true;humanAcknowledgement:'PENDING'|'NOT_APPLICABLE';
 result:PostResult;
}>;
export type CountStoreResult=Readonly<{
 state:'COUNT_OBSERVATION_COMMITTED';requestId:string;sessionId:string;
 stockEpoch:string;lineId:string;legalEntityId:string;siteId:string;
 warehouseId:string;leafLocationId:string;locationPath:string;itemCode:string;
 productVersion:string;serialNo:string;batchNo:string;quantity:string;
 referenceQuantity:string;variance:string;recordedBy:string;recordedAt:string;
 durable:true;stockChanged:false;postingAuthorized:false;
}>;
export type StoresResult=PostedStoreResult|CountStoreResult;
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const digits=/^(0|[1-9][0-9]*)$/;
const sha=/^[0-9a-f]{64}$/;

/** Order is frozen with the P0 SQL verifier, independent of JS key order. */
export function canonicalStoresFields(raw:unknown):readonly string[]{
 const c=validateP0Operation(raw);
 const common=[c.contractVersion,c.requestId,c.kind,c.legalEntityId,c.siteId,
  c.warehouseId,c.itemCode,c.productVersion,c.controlType,c.quantity,c.uom,
  c.serialNo,c.batchNo];
 const extra=c.kind==='IN'
  ?[c.leafLocationId,c.grnId,c.receiptKey,c.supplierId,c.invoiceNumber,c.qcState,c.qcEvidenceId]
  :c.kind==='OUT'
  ?[c.leafLocationId,c.employeeId,c.workOrderId,c.issueDocumentId,c.fragmentId,c.purpose]
  :c.kind==='COUNT'
  ?[c.leafLocationId,c.sessionId,c.stockEpoch,c.lineId,c.condition,c.inventoryState,c.evidenceId]
  :[c.sourceLeafId,c.destinationLeafId,c.transferDocumentId,c.reason];
 return Object.freeze([...common,...extra]);
}
export function storesPayloadSha256(raw:unknown):string{
 return createHash('sha256').update(lengthPrefixedUtf8(canonicalStoresFields(raw))).digest('hex');
}
export function issueStoresProof(raw:unknown,actor:VerifiedRequestOperator,
 key:Uint8Array,version:number,now=Math.floor(Date.now()/1000)):StoresProof{
 const op=validateP0Operation(raw);
 assertVerifiedRequestOperator(actor,op);
 if(!(key instanceof Uint8Array)||key.byteLength<32||
    !Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(now)||now<1)
  throw new Error('P0_TRUSTED_STORES_SIGNER_REQUIRED');
 const core={proofVersion:STORES_PROOF_V1,actorSubject:actor.subject,
  sessionId:actor.sessionId,payloadSha256:storesPayloadSha256(op),
  issuedAt:String(now),expiresAt:String(now+45),
  nonce:randomBytes(24).toString('hex'),keyVersion:String(version)};
 const macSha256=createHmac('sha256',key).update(lengthPrefixedUtf8([
  core.proofVersion,core.actorSubject,core.sessionId,core.payloadSha256,
  core.issuedAt,core.expiresAt,core.nonce,core.keyVersion])).digest('hex');
 return Object.freeze({...core,macSha256});
}
export function assertP0PersistenceEnvironment(env:IsolatedPgEnvironment):void{
 assertProtectedPostingEnvironment(env);
 if(env.HFT_STORES_P0_SOURCE!=='qualified_disposable_review'||
   env.HFT_STORES_P0_SQL_CONTRACT!=='HFT_R1_P0_PERSISTENCE_V1')
  throw new Error('P0_PROTECTED_DATABASE_SOURCE_NOT_QUALIFIED');
}
/** Separate from P3 master login; runtime role has EXECUTE only on vetted functions. */
export function openP0Pool(env:IsolatedPgEnvironment):PgPool&{end():Promise<void>}{
 assertP0PersistenceEnvironment(env);
 if(!env.PGPASSWORD)throw new Error('P0_DATABASE_CREDENTIAL_NOT_CONFIGURED');
 const mod=createRequire(import.meta.url)('pg') as {Pool:new(o:Record<string,unknown>)=>PgPool&{end():Promise<void>}};
 return new mod.Pool({host:env.PGHOST,port:Number(env.PGPORT),
  user:env.PGUSER,password:env.PGPASSWORD,database:env.PGDATABASE,ssl:false,
  connectionTimeoutMillis:2000,idleTimeoutMillis:5000,max:3});
}
function storesKeyBytes(value:string|undefined,name:string):Buffer{
 if(!value||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
  throw new Error('P0_'+name+'_KEY_MISSING');
 const bytes=Buffer.from(value,'base64');
 if(bytes.length<32||bytes.toString('base64')!==value)
  throw new Error('P0_'+name+'_KEY_INVALID');
 return bytes;
}
function storesKeyVersion(value:string|undefined):number{
 if(!value||!/^[1-9]\d{0,8}$/.test(value))
  throw new Error('P0_SIGNING_KEY_VERSION_INVALID');
 return Number(value);
}
/** Read routes never load the P2 stock-posting secret into their process. */
export function storesReadSignerFromEnvironment(env:IsolatedPgEnvironment):Readonly<{
 storesKey:Uint8Array;storesKeyVersion:number;
}>{
 assertP0PersistenceEnvironment(env);
 return {storesKey:storesKeyBytes(env.HFT_P0_STORES_KEY_BASE64,'STORES'),
  storesKeyVersion:storesKeyVersion(env.HFT_P0_STORES_KEY_VERSION)};
}
export function storesSignerFromEnvironment(env:IsolatedPgEnvironment):StoresSigner{
 const read=storesReadSignerFromEnvironment(env);
 try{
  return {...read,p2Signer:{
   keyBytes:storesKeyBytes(env.HFT_P2_POSTING_KEY_BASE64,'P2'),
   keyVersion:storesKeyVersion(env.HFT_P2_POSTING_KEY_VERSION)}};
 }catch(error){read.storesKey.fill(0);throw error;}
}
function record(raw:unknown,code:string):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(code);
 return raw as Record<string,unknown>;
}
function same(a:unknown,b:unknown):boolean{return a===b;}
/** Proof-bearing resolution MUST be performed by reviewed SQL, not by browser or runtime SELECT. */
function resolvedPosting(raw:unknown,op:P0In|P0Out,actor:VerifiedRequestOperator):
 {command:StockCommand;approved:PersistedApprovalReference}{
 const r=record(raw,'P0_POSTING_SOURCE_UNAVAILABLE');
 if(r.state!=='QUALIFIED_VERSION_COUPLED_SOURCE'||
    r.p2WriterVersionGuard!=='P2_WRITER_VERSION_COUPLED_V1'||
    r.locationVerified!==true||r.approvalVerified!==true||
    r.holdPolicyChecked!==true||r.productVersion!==op.productVersion||
    r.actorSubject!==actor.subject||r.sessionId!==actor.sessionId)
   throw new Error('P0_VERSION_LOCATION_AND_APPROVAL_AUTHORITY_UNQUALIFIED');
 const c=record(r.command,'P0_POSTING_COMMAND_MISSING');
 const a=record(r.approval,'P0_POSTING_APPROVAL_MISSING');
 const kind=op.kind==='IN'?'RECEIVE':'ISSUE';
 if(!same(c.kind,kind)||!same(c.commandId,op.requestId)||
    !same(c.idempotencyKey,op.requestId)||
    !same(c.legalEntityId,op.legalEntityId)||!same(c.siteId,op.siteId)||
    !same(c.warehouseId,op.warehouseId)||!same(c.itemCode,op.itemCode)||
    !same(c.locationId,op.leafLocationId)||!same(c.quantity,op.quantity)||
    !same(c.serialNo??'',op.serialNo)||!same(c.batchNo??'',op.batchNo)||
    !same(c.condition,'GOOD')||!Number.isSafeInteger(c.expectedBalanceVersion)||
    Number(c.expectedBalanceVersion)<0||
    !same(c.sourceDocumentId,op.kind==='IN'?op.grnId:op.issueDocumentId)||
    !same(c.sourceActionKey,op.kind==='IN'?op.receiptKey:op.fragmentId)||
    !same(c.fragmentId??'',op.kind==='IN'?'':op.fragmentId)||
    !same(c.employeeId??'',op.kind==='IN'?'':op.employeeId)||
    !same(c.originalIssueId??'',''))
   throw new Error('P0_POSTING_RESOLVED_COMMAND_MISMATCH');
 if(!id.test(String(a.approvalId))||!Number.isSafeInteger(a.sourceRevision)||
    Number(a.sourceRevision)<1||!Number.isSafeInteger(a.approvalRevision)||
    Number(a.approvalRevision)<1||!Number.isSafeInteger(a.policyGeneration)||
    Number(a.policyGeneration)<1||!sha.test(String(a.approvedPayloadSha256))||
    a.inspectionEvidenceId!=='' )
   throw new Error('P0_POSTING_APPROVAL_PROOF_INVALID');
 return {command:c as unknown as StockCommand,
  approved:a as unknown as PersistedApprovalReference};
}
function checkedPost(result:PostResult,op:P0In|P0Out,actor:VerifiedRequestOperator):PostedStoreResult{
 const fact=record(result.fact,'P0_POSTED_FACT_MISSING');
 const amount=op.quantity;
 const expected=op.kind==='IN'
  ?[{bucket:'EXTERNAL',delta:'-'+amount},{bucket:'AVAILABLE',delta:amount}]
  :[{bucket:'AVAILABLE',delta:'-'+amount},{bucket:'CUSTODY',delta:amount}];
 const movements=fact.movements;
 if(!Array.isArray(movements)||movements.length!==2||
    expected.some((leg,i)=>{const v=movements[i];return !v||
     typeof v!=='object'||v.bucket!==leg.bucket||v.delta!==leg.delta;}))
   throw new Error('P0_POSTED_MOVEMENTS_NOT_CONSERVED');
 if(typeof result.available!=='string'||parseQuantity(result.available)<0n||
    !Number.isSafeInteger(result.accountVersion)||result.accountVersion<0||
    typeof result.replay!=='boolean')
   throw new Error('P0_POSTED_BALANCE_NOT_VERIFIED');
 if(result.commandId!==op.requestId||
    fact.commandId!==op.requestId||fact.entityId!==op.legalEntityId||
    fact.warehouseId!==op.warehouseId||fact.itemCode!==op.itemCode||
    fact.locationId!==op.leafLocationId||fact.operatorId!==actor.subject||
    fact.kind!==(op.kind==='IN'?'RECEIVE':'ISSUE')||
    fact.sourceDocumentId!==(op.kind==='IN'?op.grnId:op.issueDocumentId)||
    (op.kind==='OUT'&&fact.employeeId!==op.employeeId))
  throw new Error('P0_POSTED_READBACK_IDENTITY_MISMATCH');
 return Object.freeze({state:'POSTED_VERIFIED',kind:op.kind,requestId:op.requestId,
  productVersion:op.productVersion,durable:true,stockChanged:true,
  humanAcknowledgement:op.kind==='OUT'?'PENDING':'NOT_APPLICABLE',result});
}
function checkedCount(raw:unknown,op:P0Count,actor:VerifiedRequestOperator):CountStoreResult{
 const r=record(raw,'P0_COUNT_DATABASE_RESPONSE_INVALID');
 if(r.state!=='COUNT_OBSERVATION_COMMITTED'||r.durable!==true||
    r.stockChanged!==false||r.postingAuthorized!==false||
    r.requestId!==op.requestId||r.sessionId!==op.sessionId||
    r.stockEpoch!==op.stockEpoch||r.lineId!==op.lineId||
    r.legalEntityId!==op.legalEntityId||r.siteId!==op.siteId||
    r.warehouseId!==op.warehouseId||r.leafLocationId!==op.leafLocationId||
    r.itemCode!==op.itemCode||r.productVersion!==op.productVersion||
    r.serialNo!==op.serialNo||r.batchNo!==op.batchNo||
    r.quantity!==op.quantity||r.recordedBy!==actor.subject||
    typeof r.locationPath!=='string'||
    !r.locationPath.startsWith(op.warehouseId+'/')||
    !r.locationPath.endsWith('/'+op.leafLocationId)||
    typeof r.recordedAt!=='string'||!Number.isFinite(Date.parse(r.recordedAt))||
    typeof r.referenceQuantity!=='string'||!digits.test(r.referenceQuantity.replace('.',''))||
    typeof r.variance!=='string')
  throw new Error('P0_COUNT_DATABASE_RESPONSE_MISMATCH');
 const variance=formatSignedQuantity(parseQuantity(op.quantity)-parseQuantity(r.referenceQuantity));
 if(r.variance!==variance)throw new Error('P0_COUNT_VARIANCE_MISMATCH');
 return r as CountStoreResult;
}
async function reconciledCount(pool:PgPool,env:IsolatedPgEnvironment,
 op:P0Count,proof:StoresProof,actor:VerifiedRequestOperator):Promise<CountStoreResult|null>{
 return withProtectedReadbackTransaction(pool,env,async c=>{
  const x=await c.query<{response:unknown}>(
    'SELECT hft.p0_reconcile_count_observation_v1($1::jsonb,$2::jsonb) AS response',
    [JSON.stringify(op),JSON.stringify(proof)]);
  if(x.rows.length!==1)throw new Error('P0_COUNT_READBACK_NOT_SINGULAR');
  const r=record(x.rows[0].response,'P0_COUNT_READBACK_INVALID');
  if(r.state==='INDETERMINATE_NOT_FOUND'&&r.automaticRetryAllowed===false)return null;
  if(r.state!=='COMMITTED_VERIFIED')throw new Error('P0_COUNT_READBACK_UNVERIFIED');
  return checkedCount(r.result,op,actor);
 });
}
/** No retry after ambiguous commit. Recheck original nonce on a new read-only connection. */
async function appendCount(pool:PgPool,env:IsolatedPgEnvironment,
 op:P0Count,proof:StoresProof,actor:VerifiedRequestOperator):Promise<CountStoreResult>{
 let result:CountStoreResult|null=null;
 try{
  result=await withProtectedPostingTransaction(pool,env,async c=>{
   const x=await c.query<{response:unknown}>(
    'SELECT hft.p0_append_count_observation_v1($1::jsonb,$2::jsonb) AS response',
    [JSON.stringify(op),JSON.stringify(proof)]);
   if(x.rows.length!==1)throw new Error('P0_COUNT_NOT_WRITTEN');
   return checkedCount(x.rows[0].response,op,actor);
  });
 }catch(error){
  if(!(error instanceof CommitOutcomeUncertain))throw error;
  const recovered=await reconciledCount(pool,env,op,proof,actor);
  if(recovered)return recovered;
  throw error;
 }
 const committed=await reconciledCount(pool,env,op,proof,actor);
 if(!committed||JSON.stringify(committed)!==JSON.stringify(result))
  throw new Error('P0_COUNT_COMMITTED_READBACK_REQUIRED_NO_RETRY');
 return committed;
}
export async function submitP0Stores(pool:PgPool,env:IsolatedPgEnvironment,
 raw:unknown,actor:VerifiedRequestOperator,signer:StoresSigner):Promise<StoresResult>{
 const op=validateP0Operation(raw);
 assertVerifiedRequestOperator(actor,op);
 assertP0PersistenceEnvironment(env);
 if(op.kind==='TRANSFER')throw new Error('P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION');
 if(op.kind==='IN'&&op.qcState!=='ACCEPTED')
  throw new Error('P0_QC_PENDING_NOT_AVAILABLE');
 const proof=issueStoresProof(op,actor,signer.storesKey,signer.storesKeyVersion);
 if(op.kind==='COUNT')return appendCount(pool,env,op,proof,actor);
 const resolution=await withProtectedReadbackTransaction(pool,env,async c=>{
  const x=await c.query<{response:unknown}>(
   'SELECT hft.p0_resolve_authorized_stock_v1($1::jsonb,$2::jsonb) AS response',
   [JSON.stringify(op),JSON.stringify(proof)]);
  if(x.rows.length!==1)throw new Error('P0_POSTING_SOURCE_NOT_SINGULAR');
  return resolvedPosting(x.rows[0].response,op,actor);
 });
 const result=await postProtectedStockCommand(pool,env,resolution.command,
  actor,resolution.approved,signer.p2Signer);
 return checkedPost(result,op,actor);
}
