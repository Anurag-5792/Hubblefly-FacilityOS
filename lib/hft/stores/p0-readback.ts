/**
 * Source-only scoped authoritative Stores readback. No SELECT on hft tables
 * from the runtime login, no synthetic balances, and no inferred version.
 * An independently qualified SECURITY DEFINER read function must supply rows.
 */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator} from '../security/verified-request.ts';
import {lengthPrefixedUtf8} from '../security/posting-invocation-proof.ts';
import {parseQuantity} from '../domain/quantity.ts';
import {withProtectedReadbackTransaction} from '../persistence/protected-posting-transaction.ts';
import type {PgPool,IsolatedPgEnvironment} from '../persistence/isolated-pg-transaction.ts';
import {assertP0PersistenceEnvironment} from './p0-persistence.ts';

export const STORES_READ_PROOF_V1='HFT-R1-P0-STORES-READ-HMAC-V1';
type Intent='BALANCES'|'MOVEMENTS'|'CUSTODY';
type Query=Readonly<{
 contractVersion:'HFT-R1-P0-READ-V1';intent:Intent;
 legalEntityId:string;siteId:string;warehouseId:string;
 itemCode:string;productVersion:string;leafLocationId:string;
 employeeId:string;cursor:string;limit:number;
}>;
type Proof=Readonly<{proofVersion:string;actorSubject:string;sessionId:string;
 payloadSha256:string;issuedAt:string;expiresAt:string;nonce:string;keyVersion:string;
 macSha256:string}>;
type Row=Readonly<{legalEntityId:string;siteId:string;warehouseId:string;
 itemCode:string;productVersion:string;leafLocationId:string;
 serialNo:string;batchNo:string;quantity:string;
 employeeId:string;movementId:string;stockState:string;
 humanAcknowledgement:string;sourceVersion:string}>;
export type StoresReadResult=Readonly<{
 state:'AUTHORITATIVE_READ';intent:Intent;rows:readonly Row[];
 nextCursor:string;sourceEpoch:string;durable:true;synthetic:false;
}>;
const id=/^[A-Z0-9][A-Z0-9._:-]{1,63}$/;
const optionalId=(s:unknown)=>typeof s==='string'&&(s===''||id.test(s));
const keys=['contractVersion','intent','legalEntityId','siteId','warehouseId',
 'itemCode','productVersion','leafLocationId','employeeId','cursor','limit'];
export function validateStoresQuery(raw:unknown):Query{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('P0_READ_OBJECT_REQUIRED');
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))
  throw new Error('P0_READ_EXACT_FIELDS_REQUIRED');
 if(r.contractVersion!=='HFT-R1-P0-READ-V1'||
   !['BALANCES','MOVEMENTS','CUSTODY'].includes(String(r.intent)))
  throw new Error('P0_READ_CONTRACT_INVALID');
 for(const f of ['legalEntityId','siteId','warehouseId']){
  if(typeof r[f]!=='string'||!id.test(r[f]))throw new Error('P0_READ_SCOPE_INVALID');
 }
 for(const f of ['itemCode','productVersion','leafLocationId','employeeId']){
  if(!optionalId(r[f]))throw new Error('P0_READ_FILTER_INVALID');
 }
 if(r.intent==='CUSTODY'&&!r.employeeId)throw new Error('P0_READ_EMPLOYEE_REQUIRED');
 if(typeof r.cursor!=='string'||r.cursor.length>512||
    !/^[A-Za-z0-9_-]*$/.test(r.cursor))
  throw new Error('P0_READ_CURSOR_INVALID');
 if(typeof r.limit!=='number'||!Number.isSafeInteger(r.limit)||r.limit<1||r.limit>100)
  throw new Error('P0_READ_LIMIT_INVALID');
 return Object.freeze(r as Query);
}
export function storesReadFields(raw:unknown):readonly string[]{
 const q=validateStoresQuery(raw);
 return [q.contractVersion,q.intent,q.legalEntityId,q.siteId,q.warehouseId,
  q.itemCode,q.productVersion,q.leafLocationId,q.employeeId,q.cursor,String(q.limit)];
}
export function issueStoresReadProof(raw:unknown,actor:VerifiedRequestOperator,
 key:Uint8Array,keyVersion:number,at=Math.floor(Date.now()/1000)):Proof{
 const q=validateStoresQuery(raw);
 assertVerifiedRequestOperator(actor,q);
 if(!(key instanceof Uint8Array)||key.length<32||
  !Number.isSafeInteger(keyVersion)||keyVersion<1||!Number.isSafeInteger(at)||at<1)
  throw new Error('P0_READ_ISSUER_UNAVAILABLE');
 const payloadSha256=createHash('sha256').update(lengthPrefixedUtf8(storesReadFields(q))).digest('hex');
 const fields={proofVersion:STORES_READ_PROOF_V1,actorSubject:actor.subject,
  sessionId:actor.sessionId,payloadSha256,issuedAt:String(at),expiresAt:String(at+40),
  nonce:randomBytes(24).toString('hex'),keyVersion:String(keyVersion)};
 const macSha256=createHmac('sha256',key).update(lengthPrefixedUtf8([
  fields.proofVersion,fields.actorSubject,fields.sessionId,fields.payloadSha256,
  fields.issuedAt,fields.expiresAt,fields.nonce,fields.keyVersion])).digest('hex');
 return {...fields,macSha256};
}
function asRecord(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('P0_READ_DATABASE_SHAPE_INVALID');
 return v as Record<string,unknown>;
}
function checked(result:unknown,q:Query):StoresReadResult{
 const r=asRecord(result);
 if(r.state!=='AUTHORITATIVE_READ'||r.intent!==q.intent||r.synthetic!==false||
  r.durable!==true||r.versionAuthority!=='P2_VERSION_AWARE_V1'||
  r.auditVerified!==true||typeof r.sourceEpoch!=='string'||
  !id.test(r.sourceEpoch)||typeof r.nextCursor!=='string'||
  r.nextCursor.length>512||!/^[A-Za-z0-9_-]*$/.test(r.nextCursor)||
  !Array.isArray(r.rows)||r.rows.length>q.limit)
  throw new Error('P0_READ_AUTHORITATIVE_SOURCE_REQUIRED');
 for(const item of r.rows){
  const a=asRecord(item);
  if(a.legalEntityId!==q.legalEntityId||a.siteId!==q.siteId||
   a.warehouseId!==q.warehouseId||
   typeof a.itemCode!=='string'||!id.test(a.itemCode)||
   typeof a.productVersion!=='string'||!id.test(a.productVersion)||
   typeof a.leafLocationId!=='string'||!id.test(a.leafLocationId)||
   !optionalId(a.serialNo)||!optionalId(a.batchNo)||!optionalId(a.employeeId)||
   typeof a.quantity!=='string'||typeof a.stockState!=='string'||
   typeof a.movementId!=='string'||typeof a.humanAcknowledgement!=='string'||
   a.sourceVersion!=='P2_VERSION_AWARE_V1')
   throw new Error('P0_READ_ROW_SCOPE_OR_VERSION_MISMATCH');
  if(q.itemCode&&q.itemCode!==a.itemCode||
    q.productVersion&&q.productVersion!==a.productVersion||
    q.leafLocationId&&q.leafLocationId!==a.leafLocationId||
    q.employeeId&&q.employeeId!==a.employeeId)
   throw new Error('P0_READ_FILTER_NOT_ENFORCED');
  const signed=Boolean(a.quantity.startsWith('-'));
  if(signed&&q.intent!=='MOVEMENTS')throw new Error('P0_READ_NEGATIVE_BALANCE');
  parseQuantity(signed?a.quantity.slice(1):a.quantity);
  if(q.intent==='CUSTODY'&&!['ACK_PENDING','ACKNOWLEDGED','EXCEPTION'].includes(a.humanAcknowledgement))
   throw new Error('P0_READ_CUSTODY_ACK_INVALID');
 }
 return {state:'AUTHORITATIVE_READ',intent:q.intent,rows:r.rows as Row[],
  nextCursor:r.nextCursor as string,sourceEpoch:r.sourceEpoch as string,
  durable:true,synthetic:false};
}
export async function readP0Stores(pool:PgPool,env:IsolatedPgEnvironment,
 raw:unknown,actor:VerifiedRequestOperator,key:Uint8Array,keyVersion:number):Promise<StoresReadResult>{
 const q=validateStoresQuery(raw);
 assertVerifiedRequestOperator(actor,q);
 assertP0PersistenceEnvironment(env);
 const proof=issueStoresReadProof(q,actor,key,keyVersion);
 return withProtectedReadbackTransaction(pool,env,async client=>{
  const v=await client.query<{response:unknown}>(
   'SELECT hft.p0_read_authoritative_stores_v1($1::jsonb,$2::jsonb) AS response',
   [JSON.stringify(q),JSON.stringify(proof)]);
  if(v.rows.length!==1)throw new Error('P0_READ_RESPONSE_NOT_SINGULAR');
  return checked(v.rows[0].response,q);
 });
}
