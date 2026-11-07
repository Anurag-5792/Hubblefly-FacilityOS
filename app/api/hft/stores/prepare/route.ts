/**
 * HFT P0 signed, scope-bound preflight ONLY. No stock, count or transfer writes.
 * Production is intentionally fail-closed until the trusted PostgreSQL
 * location/document/approval and one-writer services are qualified.
 */
import {resolveVerifiedRequestOperator,assertVerifiedRequestOperator} from '../../../../../lib/hft/security/verified-request.ts';
import {prepareP0Nonposting,validateP0Operation} from '../../../../../lib/hft/stores/p0-operations.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const maxBodyBytes=16384;
const responseHeaders={'Cache-Control':'no-store, no-cache, must-revalidate',
 'X-Content-Type-Options':'nosniff'};
function response(status:number,code:string):Response{
 return Response.json({state:'UNAVAILABLE',code,stockChanged:false,durable:false},
   {status,headers:responseHeaders});
}
async function readBoundedJson(request:Request):Promise<unknown>{
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBodyBytes))
  throw new Error('P0_REQUEST_TOO_LARGE');
 const reader=request.body?.getReader();
 if(!reader)throw new Error('P0_BODY_REQUIRED');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{
  for(;;){
   const next=await reader.read();if(next.done)break;
   bytes+=next.value.byteLength;
   if(bytes>maxBodyBytes)throw new Error('P0_REQUEST_TOO_LARGE');
   chunks.push(next.value);
  }
 }finally{reader.releaseLock();}
 const full=new Uint8Array(bytes);let offset=0;
 for(const chunk of chunks){full.set(chunk,offset);offset+=chunk.byteLength;}
 let source:string;
 try{source=new TextDecoder('utf-8',{fatal:true}).decode(full);}
 catch{throw new Error('P0_JSON_INVALID');}
 try{return JSON.parse(source) as unknown;}
 catch{throw new Error('P0_JSON_INVALID');}
}
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return response(415,'P0_JSON_REQUIRED');
 try{
  // Signed identity and same-origin CSRF guard; no forwarded roles accepted.
  const actor=resolveVerifiedRequestOperator(request,process.env);
  const body=await readBoundedJson(request);
  const command=validateP0Operation(body);
  assertVerifiedRequestOperator(actor,command);
  // All IDs remain unverified server/DB references. Never return posted:true.
  return Response.json(prepareP0Nonposting(command),{status:200,headers:responseHeaders});
 }catch(error){
  const code=error instanceof Error?error.message:'P0_PREPARATION_UNAVAILABLE';
  if(code==='P0_REQUEST_TOO_LARGE')return response(413,code);
  if(code==='P0_JSON_INVALID'||code==='P0_BODY_REQUIRED')return response(400,code);
  if(code.startsWith('P0_')||code.startsWith('QUANTITY_'))return response(422,code);
  if(code.includes('SESSION')||code.includes('REQUEST_ORIGIN')||
    code.includes('AUTHENTICATION')||code.includes('CROSS_SITE')||
    code.includes('TRUSTED_REQUEST_ORIGIN')||code.includes('SIGNED_SCOPE')||
    code.includes('UNTRUSTED_AUTHENTICATION')||code.includes('VERIFIED_REQUEST_IDENTITY'))
    return response(401,'P0_SIGNED_SESSION_OR_SCOPE_REQUIRED');
  // Never return internal database, proof, credential or developer exception text.
  return response(503,'P0_AUTHORITY_NOT_QUALIFIED');
 }
}
export async function GET():Promise<Response>{return response(405,'P0_POST_REQUIRED');}
export async function PUT():Promise<Response>{return response(405,'P0_POST_REQUIRED');}
export async function DELETE():Promise<Response>{return response(405,'P0_POST_REQUIRED');}
