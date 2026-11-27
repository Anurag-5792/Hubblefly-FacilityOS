import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
import {verifyIntakeCookie} from '../../../../lib/hft/intake/intake-session.ts';
import {parseIntakeRequest} from '../../../../lib/hft/intake/intake-contract.ts';
import {executeIntake} from '../../../../lib/hft/intake/intake-db.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({state:'UNAVAILABLE',code},{status,headers});
export async function POST(request:Request){
 let grant:ReturnType<typeof verifyIntakeCookie>;
 try{
  const a=resolveVerifiedRequestOperator(request,process.env,'LIVE_R1_MASTERS');
  grant=verifyIntakeCookie(request.headers.get('cookie'),process.env,a.sessionId);
 }catch{return fail(401,'INTAKE_OWNER_SESSION_REQUIRED');}
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415,'INTAKE_JSON_REQUIRED');
 let req:ReturnType<typeof parseIntakeRequest>;
 try{const raw=await request.text();if(Buffer.byteLength(raw)>8192)throw Error('INTAKE_INVALID');req=parseIntakeRequest(JSON.parse(raw));}
 catch{return fail(422,'INTAKE_INVALID');}
 if(req.intent!=='READ'&&request.headers.get('x-hft-intake-context')!==grant.contextId)return fail(401,'INTAKE_CONTEXT_CHANGED');
 try{
  const data=await executeIntake(process.env,grant,req);
  return Response.json({state:'INVENTORY_REVIEW_RESULT',contextId:grant.contextId,expiresAt:grant.expiresAt,data},{headers});
 }catch(e){
  const message=e instanceof Error?e.message:'';
  if(req.intent==='RENAME'){
   if(['INTAKE_RENAME_INVALID','INTAKE_NO_CHANGE','INTAKE_REVISION_CONFLICT'].includes(message))return fail(422,'INTAKE_RENAME_REJECTED');
   return fail(409,'INTAKE_CHECK_ORIGINAL_REQUEST');
  }
  if(message==='INTAKE_ACCESS_DENIED')return fail(403,'INTAKE_ACCESS_DENIED');
  return fail(503,'INTAKE_DATABASE_UNAVAILABLE');
 }
}
export async function GET(){return fail(405,'INTAKE_POST_REQUIRED');}
