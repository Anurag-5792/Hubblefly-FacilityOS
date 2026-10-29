/** Same-origin authenticated P3 masters API. No unreviewed master activation.
 * Only POST: the existing signed-session adapter deliberately binds POST only.
 */
import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
import {handleP3MasterRequest} from '../../../../lib/hft/masters/p3-service.ts';
import {assertP3Environment,openP3Pool} from '../../../../lib/hft/masters/p3-database.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function reply(status:number,code:string):Response{
 return Response.json({state:'UNAVAILABLE',code},{status,headers});
}
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return reply(415,'P3_JSON_REQUIRED');
 const length=Number(request.headers.get('content-length')||0);
 if(!Number.isFinite(length)||length>16384)return reply(413,'P3_REQUEST_TOO_LARGE');
 try{
  assertP3Environment(process.env);
  const operator=resolveVerifiedRequestOperator(request,process.env);
  const body=await request.text();
  if(body.length>16384)return reply(413,'P3_REQUEST_TOO_LARGE');
  let payload:unknown;try{payload=JSON.parse(body);}catch{return reply(400,'P3_JSON_INVALID');}
  const pool=openP3Pool(process.env);
  try{
   const data=await handleP3MasterRequest(pool,process.env,operator,payload);
   return Response.json(data,{status:data.state==='PENDING_APPROVAL'?202:200,headers});
  }finally{
   // Closing pooled connections is handled by the future approved server
   // lifetime manager. Runtime adapter is source-only until qualified.
   const closable=pool as typeof pool&{end?:()=>Promise<void>};
   if(closable.end)await closable.end();
  }
 }catch(error){
  const code=error instanceof Error?error.message:'P3_OPERATION_FAILED';
  if(code.startsWith('P3_ISOLATED_DATABASE')||
   code.startsWith('P3_POSTGRES_DRIVER')||
   code.startsWith('P3_DATABASE_CREDENTIAL')||
   code.startsWith('P3_APPROVED_SIGNER')||
   code.startsWith('ISOLATED_NONPRODUCTION')||
   code.startsWith('PRODUCTION_STARTUP')||
   code.startsWith('VERIFIED_AUTH_SOURCE'))
   return reply(503,'P3_PERSISTENCE_OR_AUTHORITY_NOT_QUALIFIED');
  if(code.includes('SESSION_')||code.includes('AUTHENTICATION')||
   code.includes('REQUEST_ORIGIN')||code.includes('CROSS_SITE')||
   code.includes('UNTRUSTED_AUTHENTICATION')||
   code.includes('TRUSTED_REQUEST_ORIGIN'))
   return reply(401,'P3_SIGNED_SESSION_REQUIRED');
  if(code.includes('DENIED')||code.includes('SIGNED_SCOPE'))
   return reply(403,'P3_ACCESS_DENIED');
  if(code.includes('COMMIT_OUTCOME_UNCERTAIN')||
    code==='P3_COMMITTED_REQUEST_RECONCILIATION_REQUIRED_NO_RETRY')
   return reply(409,'P3_COMMIT_OR_READBACK_UNCERTAIN_NO_RETRY');
  if(code.startsWith('P3_')&&
   !code.includes('DATABASE_IDENTITY')&&!code.includes('ROLLBACK_UNVERIFIED')&&
   !code.includes('SUBMISSION_DURABLE'))
   return reply(400,code);
  // No PostgreSQL driver error text, SQL statement, actor or proof in response.
  return reply(503,'P3_OPERATION_UNAVAILABLE');
 }
}
export async function GET():Promise<Response>{return reply(405,'P3_POST_REQUIRED');}
