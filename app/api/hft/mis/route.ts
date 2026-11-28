import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
import {object,exactKeys,scopeFrom} from '../../../../lib/hft/roles/role-assignment.ts';
import {assertMisRequirementsProfile,openMisReadPool,executeMisRead} from '../../../../lib/hft/planning/mis-read-backend.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({state:'UNAVAILABLE',code},{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function POST(req:Request){
 try{assertMisRequirementsProfile(process.env);}catch{return fail(503,'MIS_AUTHORITATIVE_SOURCE_NOT_ADMITTED');}
 let actor:ReturnType<typeof resolveVerifiedRequestOperator>;
 try{actor=resolveVerifiedRequestOperator(req,process.env,'RETAINED_APP_ROLES');
  if(!actor.hostedOperatorContext||!actor.canonicalEmployeeId||!actor.canonicalPersonId)throw Error('ACTOR');}
 catch{return fail(401,'MIS_SESSION_REQUIRED');}
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415,'MIS_JSON_REQUIRED');
 let input:Parameters<typeof executeMisRead>[3];
 try{
  const reader=req.body?.getReader();if(!reader)return fail(400,'MIS_BODY_REQUIRED');
  const chunks:Uint8Array[]=[];let n=0;
  try{for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>4096){await reader.cancel();return fail(413,'MIS_BODY_TOO_LARGE');}chunks.push(v.value);}}finally{reader.releaseLock();}
  const p=object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const supplied=req.headers.get('x-hft-operator-context');
  if(supplied!==actor.hostedOperatorContext&&!(supplied===null&&p.intent==='CONTEXT'))return fail(401,'MIS_CONTEXT_CHANGED');
  if(p.intent==='CONTEXT'){exactKeys(p,['intent']);input={intent:'CONTEXT'};}
  else if(p.intent==='OVERVIEW'){exactKeys(p,['intent','scope']);input={intent:'OVERVIEW',scope:scopeFrom(p.scope)};}
  else if(p.intent==='REQUIREMENTS'){
   exactKeys(p,['intent','scope','modelId','units']);
   if(typeof p.modelId!=='string'||!uuid.test(p.modelId)||!Number.isSafeInteger(p.units)||(p.units as number)<1||(p.units as number)>100000)throw Error('INPUT');
   input={intent:'REQUIREMENTS',scope:scopeFrom(p.scope),modelId:p.modelId,units:p.units as number};
  }else return fail(503,'MIS_STOCK_SOURCE_NOT_ADMITTED');
 }catch{return fail(422,'MIS_REQUEST_INVALID');}
 let pool:ReturnType<typeof openMisReadPool>|undefined;
 try{
  pool=openMisReadPool(process.env);
  const result=await executeMisRead(pool,process.env,actor,input);
  if(actor.expiresAt<=Date.now()/1000)return fail(401,'MIS_SESSION_REQUIRED');
  return Response.json(result,{headers});
 }catch(e){
  if((e as {code?:string}).code==='42501'||(e instanceof Error&&/SIGNED_SCOPE_DENIED/.test(e.message)))return fail(403,'MIS_SCOPE_DENIED');
  if(actor.expiresAt<=Date.now()/1000)return fail(401,'MIS_SESSION_REQUIRED');
  return fail(503,'MIS_SOURCE_NOT_VERIFIED');
 }finally{if(pool)await pool.end();}
}
export async function GET(){return fail(405,'MIS_POST_REQUIRED');}
