/**
 * P3 Masters application boundary: one protected request writer, read-only
 * database-authenticated scoped readers, independent Employee decision/apply.
 * No direct master/stock table SQL is permitted to a shared runtime login.
 */
import type {PgPool,IsolatedPgEnvironment} from '../persistence/isolated-pg-transaction.ts';
import type {VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertVerifiedRequestOperator} from '../security/verified-request.ts';
import {validateMasterRequest,issueMasterProof,type MasterRequest,
 type MasterQuery} from './p3-contract.ts';
import {validateEmployeeDecision,issueMasterReadProof,issueEmployeeDecisionProof,
 type EmployeeDecision} from './p3-employee-proofs.ts';
import {withP3Database} from './p3-database.ts';

export type MastersResult=Readonly<{
 state:'AVAILABLE'|'PENDING_APPROVAL';records:readonly Record<string,unknown>[];
}>;
export type EmployeeDecisionResult=Readonly<{
 state:'APPLIED'|'DENIED';requestId:string;recordId:string;
 version:string|null;active:boolean|null;
}>;
function signerKey(env:IsolatedPgEnvironment,purpose:'REQUEST'|'DECISION'):
 {key:Buffer;version:number}{
 const prefix=purpose==='REQUEST'?'HFT_P3_SIGNING':'HFT_P3_DECISION_SIGNING';
 const raw=env[prefix+'_KEY_BASE64'];
 if(!raw||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||raw.length>512)
  throw new Error('P3_APPROVED_SIGNER_NOT_CONFIGURED');
 const key=Buffer.from(raw,'base64');
 if(key.length<32||key.toString('base64')!==raw)
  throw new Error('P3_APPROVED_SIGNER_INVALID');
 const version=Number(env[prefix+'_KEY_VERSION']);
 if(!Number.isSafeInteger(version)||version<1)
  throw new Error('P3_APPROVED_SIGNER_VERSION_INVALID');
 return {key,version};
}
function guardedRows(input:unknown,scope:MasterQuery):MastersResult{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw new Error('P3_PROTECTED_READ_RESPONSE_INVALID');
 const value=input as Record<string,unknown>;
 if(value.state!=='AVAILABLE'||!Array.isArray(value.records)||value.records.length>50)
  throw new Error('P3_PROTECTED_READ_RESPONSE_INVALID');
 for(const candidate of value.records){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))
   throw new Error('P3_PROTECTED_READ_ROW_INVALID');
  const row=candidate as Record<string,unknown>;
  if(row.legal_entity_id!==scope.legalEntityId)
   throw new Error('P3_PROTECTED_READ_CROSS_ENTITY');
  if(row.site_id!==scope.siteId && row.site_id!=='')
   throw new Error('P3_PROTECTED_READ_CROSS_SITE');
  if(row.warehouse_id!==scope.warehouseId && row.warehouse_id!=='')
   throw new Error('P3_PROTECTED_READ_CROSS_WAREHOUSE');
 }
 return {state:'AVAILABLE',records:value.records as readonly Record<string,unknown>[]};
}
/** Qualified DB proof is mandatory even for a list request: no table SELECT. */
async function readMasters(pool:PgPool,env:IsolatedPgEnvironment,
 operator:VerifiedRequestOperator,query:MasterQuery):Promise<MastersResult>{
 const key=signerKey(env,'REQUEST');
 let proof;
 try{proof=issueMasterReadProof(query,operator,key.key,key.version);}
 finally{key.key.fill(0);}
 return withP3Database(pool,env,true,async client=>{
  const res=await client.query<{response:unknown}>(
   'SELECT hft.p3_read_masters_v1($1::jsonb,$2::jsonb) AS response',
   [JSON.stringify(query),JSON.stringify(proof)]);
  if(res.rows.length!==1)throw new Error('P3_READBACK_MISSING');
  return guardedRows(res.rows[0].response,query);
 });
}
/** Internal item-gallery read for the dedicated media route only.
 * The generic Masters API must never expose HFT-owned storage keys.
 */
export async function readP3ItemGallery(pool:PgPool,env:IsolatedPgEnvironment,
 operator:VerifiedRequestOperator,raw:unknown):Promise<MastersResult>{
 const input=validateMasterRequest(raw);
 if(input.intent!=='ITEM_GALLERY'||input.kind!=='ITEM')
  throw new Error('P3_ITEM_GALLERY_DEDICATED_ROUTE_REQUIRED');
 assertVerifiedRequestOperator(operator,input);
 return readMasters(pool,env,operator,input);
}
export async function handleP3MasterRequest(pool:PgPool,env:IsolatedPgEnvironment,
 operator:VerifiedRequestOperator,raw:unknown):Promise<MastersResult>{
 const input:MasterRequest=validateMasterRequest(raw);
 const scope=input.intent==='SUBMIT'?input.change:input;
 assertVerifiedRequestOperator(operator,scope);
 if(input.intent!=='SUBMIT'){
  if(input.intent==='REVIEW_QUEUE'&&input.kind!=='EMPLOYEE')
   throw new Error('P3_REVIEW_QUEUE_EMPLOYEE_ONLY');
  if(input.intent==='ITEM_GALLERY')
   throw new Error('P3_ITEM_GALLERY_DEDICATED_ROUTE_REQUIRED');
  return readMasters(pool,env,operator,input);
 }
 const change=input.change;
 const key=signerKey(env,'REQUEST');
 let proof;
 try{proof=issueMasterProof(change,operator,key.key,key.version);}
 finally{key.key.fill(0);}
 await withP3Database(pool,env,false,async client=>{
  const issued=await client.query<{request_id:string}>(
   'SELECT hft.p3_submit_master_change_v1($1::jsonb,$2::jsonb)::text AS request_id',
   [JSON.stringify(change),JSON.stringify(proof)]);
  if(issued.rows.length!==1||issued.rows[0].request_id!==change.requestId)
   throw new Error('P3_SUBMISSION_ID_MISMATCH');
 });
 // Independent second-connection read after committed submission. A missing
 // readback is never cause to resubmit; report reconciliation required.
 const observed=await readMasters(pool,env,operator,{intent:'REQUESTS',
  kind:change.kind,legalEntityId:change.legalEntityId,siteId:change.siteId,
  warehouseId:change.warehouseId,search:''});
 const persisted=observed.records.find(row=>row.request_id===change.requestId);
 if(!persisted||persisted.state!=='PENDING_APPROVAL')
  throw new Error('P3_COMMITTED_REQUEST_RECONCILIATION_REQUIRED_NO_RETRY');
 return {state:'PENDING_APPROVAL',records:[persisted]};
}
/** Decision and approved application share ONE database transaction.
 * Eligibility and person independence are verified in PostgreSQL, not here.
 */
export async function handleP3EmployeeDecision(pool:PgPool,env:IsolatedPgEnvironment,
 operator:VerifiedRequestOperator,raw:unknown):Promise<EmployeeDecisionResult>{
 const decision:EmployeeDecision=validateEmployeeDecision(raw);
 assertVerifiedRequestOperator(operator,decision);
 const key=signerKey(env,'DECISION');
 let proof;
 try{proof=issueEmployeeDecisionProof(decision,operator,key.key,key.version);}
 finally{key.key.fill(0);}
 return withP3Database(pool,env,false,async client=>{
  const data=await client.query<{response:unknown}>(
   'SELECT hft.p3_decide_apply_employee_v1($1::jsonb,$2::jsonb) AS response',
   [JSON.stringify(decision),JSON.stringify(proof)]);
  if(data.rows.length!==1||!data.rows[0].response||
   typeof data.rows[0].response!=='object'||Array.isArray(data.rows[0].response))
   throw new Error('P3_EMPLOYEE_DECISION_RESPONSE_INVALID');
  const result=data.rows[0].response as Record<string,unknown>;
  if(!['APPLIED','DENIED'].includes(String(result.state))||
    result.requestId!==decision.requestId||result.recordId!==decision.recordId||
    (result.state==='APPLIED'&&(!/^[1-9][0-9]*$/.test(String(result.version))||
       typeof result.active!=='boolean'))||
    (result.state==='DENIED'&&(result.version!==null||result.active!==null)))
   throw new Error('P3_EMPLOYEE_DECISION_RESPONSE_INVALID');
  return result as EmployeeDecisionResult;
 });
}
