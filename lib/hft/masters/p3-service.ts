/** P3 application commands. All queries are parameterized and site-scoped.
 * A submitted request stays PENDING_APPROVAL; no server/API auto-activates.
 */
import type {PgPool,IsolatedPgEnvironment} from '../persistence/isolated-pg-transaction.ts';
import type {VerifiedRequestOperator} from '../security/verified-request.ts';
import {assertVerifiedRequestOperator} from '../security/verified-request.ts';
import {validateMasterRequest,issueMasterProof,type MasterRequest,
 type MasterChange} from './p3-contract.ts';
import {withP3Database,requireMasterGrant} from './p3-database.ts';
export type MastersResult=Readonly<{state:'AVAILABLE'|'PENDING_APPROVAL';records:readonly unknown[]}>;
function signerKey(env:IsolatedPgEnvironment):{key:Uint8Array;version:number}{
 const raw=env.HFT_P3_SIGNING_KEY_BASE64;
 if(!raw||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||raw.length>512)
  throw new Error('P3_APPROVED_SIGNER_NOT_CONFIGURED');
 const key=Buffer.from(raw,'base64');
 if(key.byteLength<32||key.toString('base64')!==raw)
  throw new Error('P3_APPROVED_SIGNER_INVALID');
 const version=Number(env.HFT_P3_SIGNING_KEY_VERSION);
 if(!Number.isSafeInteger(version)||version<1)
  throw new Error('P3_APPROVED_SIGNER_VERSION_INVALID');
 return {key,version};
}
export async function handleP3MasterRequest(pool:PgPool,env:IsolatedPgEnvironment,
 operator:VerifiedRequestOperator,raw:unknown):Promise<MastersResult>{
 const input:MasterRequest=validateMasterRequest(raw);
 const scope=input.intent==='SUBMIT'?input.change:input;
 const actor=assertVerifiedRequestOperator(operator,scope);
 if(input.intent==='SUBMIT'){
  const change:MasterChange=input.change;
  // P3 signer is additional database proof, not an alternative P2 stock key.
  const signer=signerKey(env);
  const proof=issueMasterProof(change,operator,signer.key,signer.version);
  signer.key.fill(0);
  return withP3Database(pool,env,false,async client=>{
   await requireMasterGrant(client,actor,change,'SUBMIT');
   const submitted=await client.query<{request_id:string}>(
    'SELECT hft.p3_submit_master_change_v1($1::jsonb,$2::jsonb)::text AS request_id',
    [JSON.stringify(change),JSON.stringify(proof)]);
   if(submitted.rows.length!==1||submitted.rows[0].request_id!==change.requestId)
    throw new Error('P3_SUBMISSION_ID_MISMATCH');
   const saved=await client.query<{request_id:string;state:string}>(
    'SELECT request_id::text,state FROM hft.p3_master_request_status_v1 '+
    'WHERE legal_entity_id=$1 AND request_id=$2::uuid AND site_id=$3 AND warehouse_id=$4',
    [change.legalEntityId,change.requestId,change.siteId,change.warehouseId]);
   if(saved.rows.length!==1||saved.rows[0].state!=='PENDING_APPROVAL')
    throw new Error('P3_SUBMISSION_DURABLE_READBACK_MISSING');
   return {state:'PENDING_APPROVAL',records:[saved.rows[0]]};
  });
 }
 return withP3Database(pool,env,true,async client=>{
  await requireMasterGrant(client,actor,input,'READ');
  if(input.intent==='REQUESTS'){
   const data=await client.query(
    'SELECT request_id::text,kind,operation,record_id,expected_version,'+
    'state,reason,requested_at,requester_subject FROM hft.p3_master_request_status_v1 '+
    'WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3 AND kind=$4 '+
    'ORDER BY requested_at DESC,request_id DESC LIMIT 50',
    [input.legalEntityId,input.siteId,input.warehouseId,input.kind]);
   return {state:'AVAILABLE',records:data.rows};
  }
  const params=[input.legalEntityId,input.siteId,input.warehouseId,input.kind];
  const sql='SELECT record_id,kind,legal_entity_id,site_id,warehouse_id,version,active,values '+
   'FROM hft.p3_master_read_v1 WHERE legal_entity_id=$1 AND (site_id=$2 OR site_id='+"''"+
   ') AND (warehouse_id=$3 OR warehouse_id='+"''"+') AND kind=$4';
  if(input.intent==='GET'){
   const data=await client.query(sql+' AND record_id=$5 LIMIT 1', [...params,input.recordId||'']);
   return {state:'AVAILABLE',records:data.rows};
  }
  const data=await client.query(sql+' AND strpos(lower(record_id),lower($5))>0 '+
   'ORDER BY record_id LIMIT 50',[...params,input.search]);
  return {state:'AVAILABLE',records:data.rows};
 });
}
