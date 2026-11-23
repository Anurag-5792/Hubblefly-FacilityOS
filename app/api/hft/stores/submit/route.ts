/**
 * Nonproduction only: real PostgreSQL-call integration source. No preview data,
 * no direct table posting. Production disabled by protected environment guard.
 */
import {resolveVerifiedRequestOperator,assertVerifiedRequestOperator}
 from '../../../../../lib/hft/security/verified-request.ts';
import {validateP0Operation} from '../../../../../lib/hft/stores/p0-operations.ts';
import {openP0Pool,storesSignerFromEnvironment,submitP0Stores}
 from '../../../../../lib/hft/stores/p0-persistence.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, no-cache, must-revalidate',
 'X-Content-Type-Options':'nosniff'};
const maxBody=16384;
function failure(status:number,code:string){
 return Response.json({state:'UNAVAILABLE',code,durable:false,stockChanged:false},
  {status,headers});
}
async function payload(request:Request):Promise<unknown>{
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBody))
  throw new Error('P0_BODY_TOO_LARGE');
 const reader=request.body?.getReader();
 if(!reader)throw new Error('P0_BODY_REQUIRED');
 let size=0;const chunks:Uint8Array[]=[];
 try{
  for(;;){const next=await reader.read();if(next.done)break;
   size+=next.value.byteLength;if(size>maxBody)throw new Error('P0_BODY_TOO_LARGE');
   chunks.push(next.value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}
 catch{throw new Error('P0_BODY_INVALID_JSON');}
}
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return failure(415,'P0_JSON_REQUIRED');
 try{
  const actor=resolveVerifiedRequestOperator(request,process.env);
  const op=validateP0Operation(await payload(request));
  assertVerifiedRequestOperator(actor,op);
  const signer=storesSignerFromEnvironment(process.env);
  let pool:ReturnType<typeof openP0Pool>|undefined;
  try{
   pool=openP0Pool(process.env);
   const result=await submitP0Stores(pool,process.env,op,actor,signer);
   return Response.json(result,{status:200,headers});
  }finally{
   signer.storesKey.fill(0);signer.p2Signer.keyBytes.fill(0);
   if(pool)await pool.end();
  }
 }catch(error){
  const code=error instanceof Error?error.message:'P0_STORES_UNAVAILABLE';
  if(code==='P0_BODY_TOO_LARGE')return failure(413,code);
  if(code==='P0_BODY_INVALID_JSON'||code==='P0_BODY_REQUIRED')return failure(400,code);
  if(code.startsWith('P0_')&&(
   code.includes('INVALID')||code.includes('REQUIRED')||
   code.includes('MUST')||code.includes('EXACT_KEYS')||
   code.includes('TRANSFER_REQUIRES')||code.includes('QC_PENDING')))
    return failure(422,'P0_REQUEST_NOT_ELIGIBLE');
  if(code.includes('SESSION')||code.includes('REQUEST_ORIGIN')||
    code.includes('AUTHENTICATION')||code.includes('CROSS_SITE')||
    code.includes('SIGNED_SCOPE')||code.includes('VERIFIED_REQUEST_IDENTITY'))
    return failure(401,'P0_SESSION_OR_SCOPE_DENIED');
  // No DB details, signing material, approval records or SQL errors returned.
  return failure(503,'P0_PROTECTED_PERSISTENCE_UNAVAILABLE');
 }
}
export async function GET(){return failure(405,'P0_POST_REQUIRED');}
export async function PUT(){return failure(405,'P0_POST_REQUIRED');}
export async function DELETE(){return failure(405,'P0_POST_REQUIRED');}
