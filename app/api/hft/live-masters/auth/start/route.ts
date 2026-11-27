import {oidcConfig,startUrl,clearAuthCookies}
 from '../../../../../../lib/hft/live/live-oidc.ts';
import {hostedOperatorAttempt,hostedOperatorMode} from '../../../../../../lib/hft/roles/hosted-operator-profile.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 try{
  const u=new URL(request.url);
  const proofMode=process.env.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined;
  const requested=u.searchParams.get('identity_proof')==='1';
  if(requested!==proofMode)throw Error('LIVE_R1_IDENTITY_FLOW_MODE_MISMATCH');
  const config=oidcConfig(process.env,proofMode);
  if(proofMode&&u.origin!==config.proofBinding?.origin)throw Error('LIVE_R1_IDENTITY_ORIGIN_DENIED');
  let destination:'roles'|'stores'|undefined;
  if(hostedOperatorAttempt(process.env)){
   const mode=hostedOperatorMode(process.env);
   if(u.origin!==process.env.HFT_PUBLIC_ORIGIN)throw Error('HOSTED_OPERATOR_ORIGIN_DENIED');
   const value=u.searchParams.get('return');
   if(u.searchParams.getAll('return').length>1||(value!==null&&value!=='roles'&&value!=='stores')||
    (value==='stores'&&mode!=='ROLES_RECEIVE'))throw Error('HOSTED_OPERATOR_RETURN_DENIED');
   destination=value==='stores'?'stores':'roles';
  }
  const result=startUrl(config,process.env.HFT_PUBLIC_ORIGIN!,proofMode,destination);
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
