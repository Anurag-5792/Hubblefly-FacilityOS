import {employeeLoginAttempt,employeeLoginProfileAdmitted} from '../../../../../lib/hft/live/employee-login-profile.ts';
import {employeeRoleSession} from '../../../../../lib/hft/live/employee-login-session.ts';
import {assertEmployeeRoleConnection} from '../../../../../lib/hft/live/employee-login-backend.ts';
import {assertHostedOperatorDuty,hostedOperatorAttempt} from '../../../../../lib/hft/roles/hosted-operator-profile.ts';
import {isRoleQualificationAttempt} from '../../../../../lib/hft/roles/role-isolated-profile.ts';
import {resolveVerifiedRequestOperator}
 from '../../../../../lib/hft/security/verified-request.ts';
import {handleRoleApi} from '../../../../../lib/hft/roles/role-service.ts';
import {PostgresRoleStore}
 from '../../../../../lib/hft/roles/role-postgres.ts';
import {assertRoleBackendProfile,isRoleBackendProfile,
 assertRoleConnection,openRoleBackendPool}
 from '../../../../../lib/hft/roles/role-backend.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff'};

/** The role API is permanently closed until the exact admitted nonproduction
 * role backend, genuine Ed25519 session issuer, dedicated SQL login and
 * effective table/trigger/privilege catalog have all been enrolled.
 * Business roles never grant PostgreSQL owner or stock writer privileges.
 */
export async function POST(request:Request):Promise<Response>{
 if(employeeLoginAttempt(process.env)){
  if(!employeeLoginProfileAdmitted(process.env))return Response.json({state:'UNAVAILABLE',code:'HF101_PROFILE_NOT_ADMITTED'},{status:503,headers});
  let session:Awaited<ReturnType<typeof employeeRoleSession>>;
  try{session=await employeeRoleSession(request,process.env);}catch{return Response.json({state:'UNAVAILABLE',code:'HOSTED_OPERATOR_SESSION_REQUIRED'},{status:401,headers});}
  let pool:ReturnType<typeof openRoleBackendPool>;
  try{pool=openRoleBackendPool(process.env);}catch{return Response.json({state:'UNAVAILABLE',code:'ROLE_BACKEND_NOT_ADMITTED'},{status:503,headers});}
  try{return await handleRoleApi(request,{authenticate:async()=>session,store:()=>new PostgresRoleStore(pool,async c=>{await assertRoleConnection(c,process.env);await assertEmployeeRoleConnection(c,process.env);},true)});}
  finally{await pool.end();}
 }
 if(!isRoleBackendProfile(process.env))
  return Response.json({state:'UNAVAILABLE',code:'ROLE_BACKEND_NOT_ADMITTED'},
   {status:503,headers});
 try{if(!isRoleQualificationAttempt(process.env))assertHostedOperatorDuty(process.env,'role');assertRoleBackendProfile(process.env);}
 catch{return Response.json({state:'UNAVAILABLE',code:'ROLE_BACKEND_NOT_ADMITTED'},
  {status:503,headers});}
 let hostedActor:ReturnType<typeof resolveVerifiedRequestOperator>|undefined;
 if(hostedOperatorAttempt(process.env)){
  try{hostedActor=resolveVerifiedRequestOperator(request,process.env,'RETAINED_APP_ROLES');}
  catch{return Response.json({state:'UNAVAILABLE',code:'HOSTED_OPERATOR_SESSION_REQUIRED'},{status:401,headers});}
  if(request.headers.has('x-hft-operator-context')&&request.headers.get('x-hft-operator-context')!==hostedActor.hostedOperatorContext)
   return Response.json({state:'UNAVAILABLE',code:'HOSTED_OPERATOR_CONTEXT_CHANGED'},{status:401,headers});
 }
 let pool:ReturnType<typeof openRoleBackendPool>;
 try{pool=openRoleBackendPool(process.env);}
 catch{return Response.json({state:'UNAVAILABLE',code:'ROLE_BACKEND_NOT_ADMITTED'},
  {status:503,headers});}
 try{
  return await handleRoleApi(request,{
   authenticate:async req=>hostedActor??resolveVerifiedRequestOperator(
    req,process.env,isRoleQualificationAttempt(process.env)?'ISOLATED_ROLE_QUALIFICATION':'RETAINED_APP_ROLES'),
   store:()=>new PostgresRoleStore(pool,async connection=>
    assertRoleConnection(connection,process.env)),
  });
 }finally{
  // End the dedicated short-lived ROLE pool even after rejected requests or
  // uncertain COMMIT. No ambient ORM/staging/Stores pool may be substituted.
  await pool.end();
 }
}
export async function GET():Promise<Response>{
 return Response.json({state:'UNAVAILABLE',code:'ROLE_POST_REQUIRED'},
  {status:405,headers:{...headers,Allow:'POST'}});
}
