/**
 * OPS-A2 proposed version-aware P0 BALANCES/MOVEMENTS/CUSTODY reader.
 * Source-only, no HTTP integration. The current P0 protected readback stub
 * and middleware 503 remain mandatory until independent SQL acceptance.
 * Synthetic PG-client unit tests cannot authorize operational balances.
 */
import {validateStoresQuery,issueStoresReadProof}
 from '../stores/p0-readback.ts';
import {assertP0PersistenceEnvironment} from '../stores/p0-persistence.ts';
import {withProtectedReadbackTransaction} from './protected-posting-transaction.ts';
import {parseQuantity} from '../domain/quantity.ts';
import type {VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertVerifiedRequestOperator} from '../security/verified-request.ts';
import type {PgPool,IsolatedPgEnvironment} from './isolated-pg-transaction.ts';

const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const sha=/^[0-9a-f]{64}$/;
const sourceMode='OPS_A2_SYNTHETIC_PG_CLIENT_ONLY';
export type VersionedReadRow=Readonly<{
 legalEntityId:string;siteId:string;warehouseId:string;
 itemCode:string;productVersion:string;leafLocationId:string;
 accountKind:'AVAILABLE'|'CUSTODY'|'QUARANTINE'|'DAMAGED'|'WIP'|'INSTALLED';
 condition:'GOOD'|'DAMAGED'|'QUARANTINE';
 serialNo:string;batchNo:string;employeeId:string;
 quantity:string;accountVersion:number;movementId:string;
 auditSha256:string;humanAcknowledgement:string;originalIssueId?:string;
}>;
export type OpsA2ReadResult=Readonly<{
 state:'SOURCE_ONLY_VERSIONED_READ_NOT_OPERATIONAL';
 intent:'BALANCES'|'MOVEMENTS'|'CUSTODY';
 sourceEpoch:string;nextCursor:string;
 versionAuthority:'OPS_A2_VERSION_AWARE_V2';
 rows:readonly VersionedReadRow[];
}>;
function rec(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw Error('OPS_A2_READ_RESPONSE_REQUIRED');
 return input as Record<string,unknown>;
}
/** PostgreSQL must independently authorize query and prove exact readback
 * identity, full immutable ledger reconstruction and scoped pagination.
 * This function checks shape and cross-row identity; it cannot independently
 * authenticate a claimed database response from an untrusted provider.
 */
export function checkOpsA2Readback(input:unknown,query:unknown):OpsA2ReadResult{
 const q=validateStoresQuery(query);
 const x=rec(input);
 if(x.state!=='AUTHORITATIVE_VERSIONED_READ'||
  x.versionAuthority!=='OPS_A2_VERSION_AWARE_V2'||
  x.intent!==q.intent||x.auditVerified!==true||
  x.synthetic!==false||x.durable!==true||
  typeof x.sourceEpoch!=='string'||!id.test(x.sourceEpoch)||
  typeof x.nextCursor!=='string'||x.nextCursor.length>512||
  !/^[A-Za-z0-9_-]*$/.test(x.nextCursor)||
  !Array.isArray(x.rows)||x.rows.length>q.limit)
  throw Error('OPS_A2_READ_PROVENANCE_OR_PAGINATION_NOT_QUALIFIED');
 const rows:VersionedReadRow[]=[];
 const cursorSet=new Set<string>();
 for(const item of x.rows){
  const r=rec(item);
  if(r.legalEntityId!==q.legalEntityId||r.siteId!==q.siteId||
   r.warehouseId!==q.warehouseId||
   typeof r.itemCode!=='string'||!id.test(r.itemCode)||
   typeof r.productVersion!=='string'||!id.test(r.productVersion)||
   typeof r.leafLocationId!=='string'||!id.test(r.leafLocationId)||
   typeof r.quantity!=='string'||
   typeof r.accountVersion!=='number'||
   !Number.isSafeInteger(r.accountVersion)||r.accountVersion<0||
   typeof r.auditSha256!=='string'||!sha.test(r.auditSha256)||
   typeof r.employeeId!=='string'||typeof r.serialNo!=='string'||
   typeof r.batchNo!=='string'||typeof r.movementId!=='string'||
   typeof r.humanAcknowledgement!=='string')
   throw Error('OPS_A2_READ_ROW_IDENTITY_INVALID');
  for(const name of ['serialNo','batchNo','employeeId'] as const)
   if(r[name]!==''&&!id.test(r[name] as string))
    throw Error('OPS_A2_READ_TRACEABILITY_INVALID');
  if(q.itemCode&&r.itemCode!==q.itemCode||
     q.productVersion&&r.productVersion!==q.productVersion||
     q.leafLocationId&&r.leafLocationId!==q.leafLocationId||
     q.employeeId&&r.employeeId!==q.employeeId)
   throw Error('OPS_A2_READ_FILTER_NOT_ENFORCED');
  if(!['AVAILABLE','CUSTODY','QUARANTINE','DAMAGED','WIP','INSTALLED'].includes(r.accountKind as string)||
     !['GOOD','DAMAGED','QUARANTINE'].includes(r.condition as string)||
     r.accountKind==='CUSTODY'&&r.employeeId===''||
     r.accountKind!=='CUSTODY'&&r.employeeId!==''&&q.intent!=='MOVEMENTS'||
     r.accountKind==='QUARANTINE'&&r.condition!=='QUARANTINE'||
     r.accountKind==='DAMAGED'&&r.condition!=='DAMAGED')
   throw Error('OPS_A2_READ_ACCOUNT_STATE_INVALID');
  const signed=(r.quantity as string).startsWith('-');
  if(signed&&q.intent!=='MOVEMENTS')
   throw Error('OPS_A2_READ_NEGATIVE_BALANCE');
  const micro=parseQuantity(signed?(r.quantity as string).slice(1):r.quantity as string);
  if(micro===0n&&q.intent==='MOVEMENTS')
   throw Error('OPS_A2_READ_ZERO_MOVEMENT');
  if(q.intent==='CUSTODY'&&
   (r.accountKind!=='CUSTODY'||
    !['ACK_PENDING','ACKNOWLEDGED','DISPUTED'].includes(r.humanAcknowledgement as string)||
    typeof r.originalIssueId!=='string'||!id.test(r.originalIssueId)))
   throw Error('OPS_A2_READ_CUSTODY_ACK_INVALID');
  const cursorKey=JSON.stringify([r.legalEntityId,r.siteId,r.warehouseId,
   r.itemCode,r.productVersion,r.leafLocationId,r.accountKind,
   r.condition,r.serialNo,r.batchNo,r.employeeId,r.movementId]);
  if(cursorSet.has(cursorKey))throw Error('OPS_A2_READ_DUPLICATE_ROW');
  cursorSet.add(cursorKey);
  rows.push(r as unknown as VersionedReadRow);
 }
 return Object.freeze({state:'SOURCE_ONLY_VERSIONED_READ_NOT_OPERATIONAL',
  intent:q.intent,versionAuthority:'OPS_A2_VERSION_AWARE_V2',
  sourceEpoch:x.sourceEpoch,nextCursor:x.nextCursor,rows:Object.freeze(rows)});
}
export async function readOpsA2SyntheticSource(pool:PgPool,env:IsolatedPgEnvironment,
 request:unknown,actor:VerifiedRequestOperator,key:Uint8Array,keyVersion:number
):Promise<OpsA2ReadResult>{
 const query=validateStoresQuery(request);
 assertVerifiedRequestOperator(actor,query);
 assertP0PersistenceEnvironment(env);
 if(env.HFT_OPS_A2_SOURCE_MODE!==sourceMode||
  env.HFT_ENVIRONMENT!=='test'||env.NODE_ENV!=='test')
  throw Error('OPS_A2_PROTECTED_READBACK_NOT_AUTHORIZED');
 const proof=issueStoresReadProof(query,actor,key,keyVersion);
 return withProtectedReadbackTransaction(pool,env,async client=>{
  const r=await client.query<{response:unknown}>(
   'SELECT hft.ops_a2_read_authoritative_v2($1::jsonb,$2::jsonb) AS response',
   [JSON.stringify(query),JSON.stringify(proof)]);
  if(r.rows.length!==1)throw Error('OPS_A2_READ_NOT_SINGULAR');
  return checkOpsA2Readback(r.rows[0].response,query);
 });
}
