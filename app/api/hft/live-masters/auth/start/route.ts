import {oidcConfig,startUrl,clearAuthCookies}
 from '../../../../../../lib/hft/live/live-oidc.ts';
import {employeeLoginAttempt} from '../../../../../../lib/hft/live/employee-login-profile.ts';
import {assertEmployeeGatewayProfile} from '../../../../../../lib/hft/live/employee-login-backend.ts';
import {loginDestination} from '../../../../../../lib/hft/ui-reuse/workspace-profile.ts';
import {intakeGrant} from '../../../../../../lib/hft/intake/intake-session.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 try{
  const u=new URL(request.url);
  const proofMode=process.env.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined;
  const requested=u.searchParams.get('identity_proof')==='1';
  if(requested!==proofMode)throw Error('LIVE_R1_IDENTITY_FLOW_MODE_MISMATCH');
  const config=oidcConfig(process.env,proofMode);
  if(employeeLoginAttempt(process.env))assertEmployeeGatewayProfile(process.env);
  if(proofMode&&u.origin!==config.proofBinding?.origin)throw Error('LIVE_R1_IDENTITY_ORIGIN_DENIED');
  const destination=loginDestination(process.env,u.searchParams.getAll('return'));
  if(u.origin!==process.env.HFT_PUBLIC_ORIGIN)throw Error('LIVE_R1_AUTH_ORIGIN_DENIED');
  if(destination==='intake')intakeGrant(process.env);
  const result=startUrl(config,process.env.HFT_PUBLIC_ORIGIN!,proofMode,
   !config.employee&&(destination==='roles'||destination==='stores')?destination:undefined,destination==='intake');
  const headers=new Headers({Location:result.location,'Cache-Control':'no-store',
   'Referrer-Policy':'no-referrer'});
  if(proofMode)for(const cookie of clearAuthCookies)headers.append('Set-Cookie',cookie);
  headers.append('Set-Cookie',result.cookie);
  return new Response(null,{status:302,headers});
 }catch{
  return Response.json({state:'UNAVAILABLE',
   code:'LIVE_R1_AUTHENTICATION_NOT_CONFIGURED'},{
   status:503,headers:{'Cache-Control':'no-store'}});
 }
}
