/** Dedicated production R1 master-record API. No P3, Draft or Stores calls. */
import {assertLiveProfile} from '../../../../lib/hft/live/live-profile.ts';
import {openLivePool,executeLive} from '../../../../lib/hft/live/live-service.ts';
import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
function fail(status:number,code:string){
 return Response.json({state:'UNAVAILABLE',code},{status,headers});
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
 const pool=openLivePool(process.env);
 try{
  const result=await executeLive(pool,process.env,actor,data);
  return Response.json({state:'AUTHORITATIVE_RESULT',data:result},{headers});
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
