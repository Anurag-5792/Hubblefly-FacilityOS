/** RETURN preflight only. Never posts, signs P2 proofs or creates custody. */
import {resolveVerifiedRequestOperator,assertVerifiedRequestOperator}
 from '../../../../../lib/hft/security/verified-request.ts';
import {prepareOpsA2Return,validateOpsA2ReturnRequest}
 from '../../../../../lib/hft/stores/ops-a2-return-preparation.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function fail(status:number,code:string):Response{
 return Response.json({state:'UNAVAILABLE',code,durable:false,stockChanged:false},{status,headers});
}
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return fail(415,'OPS_A2_RETURN_JSON_REQUIRED');
 try{
  const declared=request.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>8192))
   return fail(413,'OPS_A2_RETURN_BODY_TOO_LARGE');
  const bytes=await request.arrayBuffer();
  if(bytes.byteLength>8192)return fail(413,'OPS_A2_RETURN_BODY_TOO_LARGE');
  const actor=resolveVerifiedRequestOperator(request,process.env);
  let raw:unknown;
  try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{return fail(400,'OPS_A2_RETURN_JSON_INVALID');}
  const operation=validateOpsA2ReturnRequest(raw);
  assertVerifiedRequestOperator(actor,operation);
  return Response.json(prepareOpsA2Return(operation),{status:200,headers});
 }catch(error){
  const code=error instanceof Error?error.message:'OPS_A2_RETURN_UNAVAILABLE';
  if(code.startsWith('OPS_A2_RETURN_')&&code.endsWith('_INVALID'))
   return fail(422,'OPS_A2_RETURN_REQUEST_INVALID');
  if(code.includes('SESSION')||code.includes('AUTHENTICATION')||
   code.includes('ORIGIN')||code.includes('SCOPE')||code.includes('IDENTITY'))
   return fail(401,'OPS_A2_RETURN_SESSION_OR_SCOPE_DENIED');
  return fail(503,'OPS_A2_RETURN_AUTHORITY_UNAVAILABLE');
 }
}
export async function GET(){return fail(405,'OPS_A2_RETURN_POST_REQUIRED');}
export async function PUT(){return fail(405,'OPS_A2_RETURN_POST_REQUIRED');}
export async function DELETE(){return fail(405,'OPS_A2_RETURN_POST_REQUIRED');}
