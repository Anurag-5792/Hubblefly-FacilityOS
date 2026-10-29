/** Employee decision entrypoint; eligibility and atomic APPLY are checked by DB.
 * This HTTP handler never directly updates employee or audit tables.
 */
import {resolveVerifiedRequestOperator} from '../../../../../lib/hft/security/verified-request.ts';
import {assertP3Environment,openP3Pool} from '../../../../../lib/hft/masters/p3-database.ts';
import {handleP3EmployeeDecision} from '../../../../../lib/hft/masters/p3-service.ts';
import {validateEmployeeDecision} from '../../../../../lib/hft/masters/p3-employee-proofs.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function denial(status:number,code:string):Response{
 return Response.json({state:'UNAVAILABLE',code},{status,headers});
}
export async function POST(request:Request):Promise<Response>{
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return denial(415,'P3_JSON_REQUIRED');
 const supplied=Number(request.headers.get('content-length')||0);
 if(!Number.isSafeInteger(supplied)||supplied>16384)
  return denial(413,'P3_REQUEST_TOO_LARGE');
 try{
  assertP3Environment(process.env);
  const user=resolveVerifiedRequestOperator(request,process.env);
  const raw=await request.text();
  if(raw.length>16384)return denial(413,'P3_REQUEST_TOO_LARGE');
  let unknown:unknown;try{unknown=JSON.parse(raw);}catch{return denial(400,'P3_JSON_INVALID');}
  const command=validateEmployeeDecision(unknown);
  const pool=openP3Pool(process.env);
  try{
   const result=await handleP3EmployeeDecision(pool,process.env,user,command);
   return Response.json(result,{status:200,headers});
  }finally{
   const closable=pool as typeof pool&{end?:()=>Promise<void>};
   if(closable.end)await closable.end();
  }
 }catch(error){
  const code=error instanceof Error?error.message:'P3_DECISION_ERROR';
  if(code.includes('COMMIT_OUTCOME_UNCERTAIN'))
   return denial(409,'P3_EMPLOYEE_DECISION_COMMIT_UNCERTAIN_NO_RETRY');
  if(code.includes('SIGNER')||code.includes('P3_ISOLATED_DATABASE')||
    code.includes('P3_DATABASE_CREDENTIAL')||code.includes('DRIVER_NOT_INSTALLED')||
    code.includes('PRODUCTION_STARTUP')||code.includes('VERIFIED_AUTH_SOURCE'))
   return denial(503,'P3_APPROVAL_AUTHORITY_NOT_QUALIFIED');
  if(code.includes('SESSION_')||code.includes('REQUEST_ORIGIN')||
    code.includes('CROSS_SITE')||code.includes('UNTRUSTED_AUTHENTICATION'))
   return denial(401,'P3_SIGNED_SESSION_REQUIRED');
  if(code.includes('SCOPE_DENIED')||code.includes('VERIFIED_REQUEST_IDENTITY'))
   return denial(403,'P3_DECISION_SCOPE_DENIED');
  if(code.startsWith('P3_DECISION_')||code.startsWith('P3_REQUEST_DIGEST')||
    code.startsWith('P3_PROOF_KEY_OR_CLOCK'))
   return denial(400,code);
  // Hide SQL internals, key info, human identities, unauthorised policy rows.
  return denial(403,'P3_DECISION_NOT_AUTHORIZED_OR_UNAVAILABLE');
 }
}
export async function GET():Promise<Response>{return denial(405,'P3_POST_ONLY');}
