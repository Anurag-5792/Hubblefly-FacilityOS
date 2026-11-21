import {resolveVerifiedRequestOperator} from '../../../../../lib/hft/security/verified-request.ts';
import {isRetainedMastersProfile} from '../../../../../lib/hft/masters/retained-nonproduction-profile.ts';
import {isRetainedStoresProfile} from '../../../../../lib/hft/stores/ops-a2-retained-profile.ts';
import {handleRoleApi} from '../../../../../lib/hft/roles/role-service.ts';
import {RoleError} from '../../../../../lib/hft/roles/role-assignment.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Only the UI/server contract is activated in this source release. Replace the
 * store factory with PostgresRoleStore after INTERNAL backend/identity admission.
 * No flag, preview record, cookie role, or browser storage can manufacture a grant.
 */
export async function POST(request:Request):Promise<Response>{
 return handleRoleApi(request,{
  authenticate:async req=>{
   if(process.env.VERCEL_ENV==='production'||process.env.HFT_ENVIRONMENT==='production')throw Error('ROLE_NONPRODUCTION_ONLY');
   return resolveVerifiedRequestOperator(req,process.env,
    isRetainedMastersProfile(process.env)?'RETAINED_P3_MASTERS':
    isRetainedStoresProfile(process.env)?'RETAINED_STORES_OPERATOR':'DEFAULT');
  },
  store:()=>{throw new RoleError('ROLE_BACKEND_NOT_ADMITTED');},
 });
}
export async function GET():Promise<Response>{
 return Response.json({state:'UNAVAILABLE',code:'ROLE_POST_REQUIRED'},
  {status:405,headers:{'Cache-Control':'no-store','Allow':'POST'}});
}
