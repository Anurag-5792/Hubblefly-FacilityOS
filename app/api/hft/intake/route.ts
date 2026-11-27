import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
import {verifyIntakeCookie} from '../../../../lib/hft/intake/intake-session.ts';
import {parseIntakeRequest} from '../../../../lib/hft/intake/intake-contract.ts';
import {executeIntake} from '../../../../lib/hft/intake/intake-db.ts';
import {intakeContextMatches,intakeFailure} from '../../../../lib/hft/intake/intake-request-boundary.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({state:'UNAVAILABLE',code},{status,headers});
export async function POST(request:Request){
 let grant:ReturnType<typeof verifyIntakeCookie>;
 try{
  const a=resolveVerifiedRequestOperator(request,process.env,'LIVE_R1_MASTERS');
  grant=verifyIntakeCookie(request.headers.get('cookie'),process.env,a.sessionId);
  grant={...grant,expiresAt:Math.min(grant.expiresAt,a.expiresAt)};
 }catch{return fail(401,'INTAKE_OWNER_SESSION_REQUIRED');}
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415,'INTAKE_JSON_REQUIRED');
 let req:ReturnType<typeof parseIntakeRequest>;
 try{const raw=await request.text();if(Buffer.byteLength(raw)>8192)throw Error('INTAKE_INVALID');req=parseIntakeRequest(JSON.parse(raw));}
 catch{return fail(422,'INTAKE_INVALID');}
 const binding=request.headers.get('x-hft-intake-context');
 // Only initial READ may be unbound. A stale mounted context may not adopt a new owner.
 if(!intakeContextMatches(req.intent,binding,grant.contextId))return fail(401,'INTAKE_CONTEXT_CHANGED');
 try{
  const started=performance.now();
  const data=await executeIntake(process.env,grant,req);
  // Never release a late response after either signed session has expired.
  if(grant.expiresAt<=Math.floor(Date.now()/1000))return fail(401,'INTAKE_OWNER_SESSION_REQUIRED');
  return Response.json({state:'INVENTORY_REVIEW_RESULT',contextId:grant.contextId,expiresAt:grant.expiresAt,data},{headers:{...headers,'Server-Timing':'intake;dur='+String(Math.round(performance.now()-started))}});
 }catch(e){
  const denied=intakeFailure(req.intent,e);
  return fail(denied.status,denied.code);
 }
}
export async function GET(){return fail(405,'INTAKE_POST_REQUIRED');}
