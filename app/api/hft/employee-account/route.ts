import {employeeLoginProfileAdmitted} from '../../../../lib/hft/live/employee-login-profile.ts';
import {readEmployeeSession} from '../../../../lib/hft/live/employee-login-session.ts';
import {currentEmployee,emailTarget,registerEmployeeEmail,employeeDirectory,rebindEmployeeProvider} from '../../../../lib/hft/live/employee-login-backend.ts';
import {employeeAccess} from '../../../../lib/hft/live/employee-login-core.ts';
import {object,exactKeys,identifier,rolesAt} from '../../../../lib/hft/roles/role-assignment.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({state:'UNAVAILABLE',code},{status,headers});
export async function GET(){return fail(405,'HF101_POST_REQUIRED');}
export async function POST(req:Request){
 if(!employeeLoginProfileAdmitted(process.env))return fail(503,'HF101_PROFILE_NOT_ADMITTED');
 let a:ReturnType<typeof readEmployeeSession>;
 try{a=readEmployeeSession(req,process.env);}catch{return fail(401,'HF101_SESSION_REQUIRED');}
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415,'HF101_JSON_REQUIRED');
 let p:Record<string,unknown>;
 try{const reader=req.body?.getReader();if(!reader)return fail(400,'HF101_BODY_REQUIRED');const chunks:Uint8Array[]=[];let n=0;
  try{for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>4096){await reader.cancel();return fail(413,'HF101_BODY_TOO_LARGE');}chunks.push(v.value);}}finally{reader.releaseLock();}
  p=object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 }catch{return fail(400,'HF101_INPUT_INVALID');}
 try{
  if(p.action==='CONTEXT'){
   exactKeys(p,['action']);const c=await currentEmployee(process.env,a),at=new Date().toISOString(),access=employeeAccess(c,at);
   const registrationWarehouses=c.assignments.filter(x=>rolesAt(x,at).includes('OWNER_ADMIN')).map(x=>x.scope.warehouseId);
   if(a.exp<=Date.now()/1000)return fail(401,'HF101_SESSION_REQUIRED');
   return Response.json({...access,employeeId:c.employeeId,fullName:c.fullName,email:c.email,legalEntityId:c.legalEntityId,siteId:c.siteId,expiresAt:a.exp,registrationWarehouses},{headers});
  }
  if(p.action==='DIRECTORY'){
   exactKeys(p,['action','warehouseId','query']);const warehouseId=identifier(p.warehouseId);
   if(typeof p.query!=='string'||p.query.length>80||/[\x00-\x1f\x7f]/.test(p.query))return fail(422,'HF101_INPUT_INVALID');
   const employees=await employeeDirectory(process.env,a,warehouseId,p.query.trim());
   if(a.exp<=Date.now()/1000)return fail(401,'HF101_SESSION_REQUIRED');
   return Response.json({state:'DIRECTORY_VERIFIED',employees,limit:30},{headers});
  }
  if(p.action==='REBIND'){
   exactKeys(p,['action','employeeId','warehouseId','email','version','employeeVersion','reason','evidenceSha256','confirm']);
   const employeeId=identifier(p.employeeId),warehouseId=identifier(p.warehouseId);
   if(p.confirm!==true||typeof p.email!=='string'||p.email.length>254||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)||
    !Number.isSafeInteger(p.version)||(p.version as number)<1||!Number.isSafeInteger(p.employeeVersion)||(p.employeeVersion as number)<1||
    typeof p.reason!=='string'||p.reason.trim().length<8||p.reason.length>500||typeof p.evidenceSha256!=='string'||! /^[0-9a-f]{64}$/.test(p.evidenceSha256)||p.evidenceSha256==='0'.repeat(64))return fail(422,'HF101_INPUT_INVALID');
   const target=await rebindEmployeeProvider(process.env,a,employeeId,warehouseId,p.email.toLowerCase(),p.version as number,p.employeeVersion as number,p.reason.trim(),p.evidenceSha256);
   if(a.exp<=Date.now()/1000)return fail(401,'HF101_SESSION_REQUIRED');
   return Response.json({state:'REBIND_VERIFIED',target},{headers});
  }
  if(p.action==='TARGET'||p.action==='REGISTER'){
   const saving=p.action==='REGISTER';exactKeys(p,saving?['action','employeeId','warehouseId','email','version','reason']:['action','employeeId','warehouseId']);
   const employeeId=identifier(p.employeeId),warehouseId=identifier(p.warehouseId);
   if(saving&&(typeof p.email!=='string'||p.email.length>254||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)||!Number.isSafeInteger(p.version)||(p.version as number)<0||typeof p.reason!=='string'||p.reason.trim().length<8||p.reason.length>500))return fail(422,'HF101_INPUT_INVALID');
   const t=saving?await registerEmployeeEmail(process.env,a,employeeId,warehouseId,(p.email as string).toLowerCase(),p.version as number,(p.reason as string).trim()):await emailTarget(process.env,a,employeeId,warehouseId);
   if(a.exp<=Date.now()/1000)return fail(401,'HF101_SESSION_REQUIRED');
   return Response.json({state:saving?'SAVED_VERIFIED':'TARGET_VERIFIED',target:t},{headers});
  }
  return fail(422,'HF101_INPUT_INVALID');
 }catch(err){
  const e=err as {code?:string;message?:string};
  if(e.message==='HF101_COMMIT_UNCONFIRMED')return Response.json({state:'UNCONFIRMED',code:'HF101_COMMIT_UNCONFIRMED_RELOAD_TARGET'},{status:409,headers});
  if(e.code==='42501')return fail(e.message==='HF101_EMPLOYEE_SESSION_DENIED'?401:403,e.message==='HF101_REBIND_REVOKE_ROLES_FIRST'?'HF101_REBIND_REVOKE_ROLES_FIRST':'HF101_ACCESS_DENIED');
  if(e.code==='23505'||e.message?.includes('HF101_LOGIN_VERSION_CONFLICT'))return fail(409,'HF101_EMAIL_OR_VERSION_CONFLICT');
  return fail(503,'HF101_SOURCE_UNAVAILABLE');
 }
}
