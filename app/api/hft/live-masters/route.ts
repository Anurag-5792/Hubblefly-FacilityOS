/** Dedicated production R1 master-record API. No P3, Draft or Stores calls. */
import {createHmac,timingSafeEqual} from 'node:crypto';
import {LIVE_R1_VERSION} from '../../../../lib/hft/live/live-contract.ts';
import {assertLiveProfile} from '../../../../lib/hft/live/live-profile.ts';
import {openLivePool,executeLive} from '../../../../lib/hft/live/live-service.ts';
import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
function fail(status:number,code:string){
 return Response.json({state:'UNAVAILABLE',code},{status,headers});
}
// Derive a separate keyed namespace from the existing server-only OAuth state secret.
function pendingActorPartition(subject:string):string{
 const raw=process.env.HFT_LIVE_R1_OIDC_STATE_KEY_BASE64||'';
 const key=Buffer.from(raw,'base64');
 if(key.length!==32||(raw!==key.toString('base64')&&raw!==key.toString('base64').replace(/=+$/,'')))
  throw Error('LIVE_R1_ACTOR_PARTITION_KEY_INVALID');
 const domainKey=createHmac('sha256',key).update('HFT-LIVE-R1-PENDING-ACTOR-KEY-V2').digest();
 return createHmac('sha256',domainKey).update(JSON.stringify([
  'HFT-LIVE-R1-PENDING-ACTOR-V2',process.env.HFT_SESSION_ISSUER,process.env.HFT_SESSION_AUDIENCE,subject
 ])).digest('hex');
}
export async function POST(request:Request):Promise<Response>{
 try{assertLiveProfile(process.env);}
 catch{return fail(503,'LIVE_R1_RUNTIME_NOT_ADMITTED');}
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return fail(415,'LIVE_R1_JSON_REQUIRED');
 let actor:ReturnType<typeof resolveVerifiedRequestOperator>;
 try{actor=resolveVerifiedRequestOperator(request,process.env,'LIVE_R1_MASTERS');}
 catch{return fail(401,'LIVE_R1_CORPORATE_SESSION_REQUIRED');}
 let data:unknown;
 try{
  const body=await request.text();
  if(Buffer.byteLength(body,'utf8')>16384)return fail(413,'LIVE_R1_REQUEST_TOO_LARGE');
  data=JSON.parse(body);
 }catch{return fail(422,'LIVE_R1_PAYLOAD_INVALID');}
 // Reject stale browser context before opening a pool. Existing non-UI callers
 // retain the original signed-session checks; the partition is never a credential.
 const binding=request.headers.get('x-hft-live-actor-partition');
 const contextIntent=!!data&&typeof data==='object'&&!Array.isArray(data)&&
  (data as Record<string,unknown>).intent==='SESSION_CONTEXT';
 let partition:string|undefined;
 if(contextIntent||binding!==null){
  try{partition=pendingActorPartition(actor.subject);}
  catch{return fail(503,'LIVE_R1_ACTOR_CONTEXT_UNAVAILABLE');}
  if(binding!==null&&(!/^[a-f0-9]{64}$/.test(binding)||
   !timingSafeEqual(Buffer.from(binding,'hex'),Buffer.from(partition,'hex'))))
   return fail(401,'LIVE_R1_ACTOR_CONTEXT_CHANGED');
 }
 // Project the already verified session's scope, not a new grant.
 // All data reads and writes still enter executeLive and its database checks.
 if(data&&typeof data==='object'&&!Array.isArray(data)){
  const body=data as Record<string,unknown>;
  if(body.intent==='SESSION_CONTEXT'){
   if(Object.keys(body).length!==2||body.contractVersion!==LIVE_R1_VERSION)
    return fail(422,'LIVE_R1_CONTRACT_REJECTED');
   return Response.json({state:'AUTHORITATIVE_RESULT',data:{
    state:'SIGNED_SESSION_CONTEXT',scope:actor.scope,expiresAt:actor.expiresAt,actorPartition:partition,
    qualification:process.env.HFT_ENVIRONMENT==='production-qualification'
   }},{headers});
  }
 }
 const pool=openLivePool(process.env);
 try{
  const result=await executeLive(pool,process.env,actor,data);
  // Ordinary authorized history is unchanged. Bound UI history additionally
  // attests whether each event belongs to the current verified caller.
  const boundHistory=binding!==null&&!!data&&typeof data==='object'&&
   (data as Record<string,unknown>).intent==='HISTORY'&&Array.isArray(result);
  return Response.json({state:'AUTHORITATIVE_RESULT',data:boundHistory&&Array.isArray(result)?
   result.map(row=>({...row,actorMatchesSession:row.actor_subject===actor.subject})):result},{headers});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  if(code.includes('NO_RETRY')||code.includes('COMMIT_OUTCOME_UNKNOWN'))
   return fail(409,'LIVE_R1_RECONCILE_ORIGINAL_REQUEST_NO_RETRY');
  if(code.includes('PERMISSION_OR_SCOPE_DENIED')||code.includes('SIGNED_SCOPE')||
   code.includes('VERIFIED_REQUEST'))return fail(403,'LIVE_R1_SCOPE_OR_PERMISSION_DENIED');
  if(code.includes('REVISION_CONFLICT')||code.includes('REQUEST_REUSE'))
   return fail(409,'LIVE_R1_REVISION_OR_REQUEST_CONFLICT');
  if(code.includes('CONTRACT')||code.includes('INVALID'))
   return fail(422,'LIVE_R1_CONTRACT_REJECTED');
  // No secrets, SQL, database names or raw permission details cross HTTP.
  return fail(503,'LIVE_R1_DATABASE_NOT_ADMITTED_OR_UNAVAILABLE');
 }finally{await pool.end();}
}
export async function GET(){return fail(405,'LIVE_R1_POST_REQUIRED');}
