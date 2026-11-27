import {oidcConfig,decodeFlow,cookieValue,completeLogin,completeIdentityProof,
 identityProofCookie,clearIdentityProofCookie,clearAuthCookies}
 from '../../../../../../lib/hft/live/live-oidc.ts';
import {hostedOperatorAttempt} from '../../../../../../lib/hft/roles/hosted-operator-profile.ts';
import {assertLoginDestination,loginPath} from '../../../../../../lib/hft/ui-reuse/workspace-profile.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 const base=process.env.HFT_PUBLIC_ORIGIN;
 if(!base)return Response.json({state:'UNAVAILABLE',
  code:'LIVE_R1_AUTHENTICATION_NOT_CONFIGURED'},
  {status:503,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url),code=url.searchParams.get('code');
 const state=url.searchParams.get('state');
 const proofMode=process.env.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined;
 const headers=new Headers({'Cache-Control':'no-store','Pragma':'no-cache',
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 try{
  const config=oidcConfig(process.env,proofMode);
  if(proofMode&&(url.origin!==config.proofBinding?.origin||
   url.searchParams.getAll('code').length!==1||url.searchParams.getAll('state').length!==1))
   throw Error('LIVE_R1_IDENTITY_CALLBACK_DENIED');
  if(url.origin!==base||url.searchParams.getAll('code').length!==1||url.searchParams.getAll('state').length!==1)throw Error('LIVE_R1_CALLBACK_DENIED');
  const flow=decodeFlow(cookieValue(request.headers.get('cookie'),
   proofMode?identityProofCookie:'__Host-hft_live_oauth'),config.stateKey);
  if(!code||!state||state.length!==flow.state.length||state!==flow.state||
   Boolean(flow.identityProofOnly)!==proofMode)
   throw Error('LIVE_R1_OIDC_STATE_MISMATCH');
  if(proofMode){
   const receipt=await completeIdentityProof(config,process.env,flow,code);
   for(const cookie of clearAuthCookies)headers.append('Set-Cookie',cookie);
   headers.append('Set-Cookie',clearIdentityProofCookie);
   headers.set('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
   return Response.json(receipt,{status:200,headers});
  }
  const destination=flow.operatorReturn??(flow.intakeReturn?'intake':'masters');
  assertLoginDestination(process.env,destination);
  let intakeCookie=clearAuthCookies[2];
  const cookie=await completeLogin(config,process.env,flow,code,flow.intakeReturn?value=>{intakeCookie=value;}:undefined);
  headers.append('Set-Cookie',clearAuthCookies[1]);
  headers.append('Set-Cookie',cookie);
  headers.append('Set-Cookie',intakeCookie);
  headers.set('Location',base+loginPath(destination));
  return new Response(null,{status:302,headers});
 }catch{
  for(const cookie of clearAuthCookies)headers.append('Set-Cookie',cookie);
  if(proofMode){
   headers.append('Set-Cookie',clearIdentityProofCookie);
   return Response.json({state:'IDENTITY_NOT_VERIFIED',authorization:'NONE'},{status:403,headers});
  }
  headers.set('Location',base+(hostedOperatorAttempt(process.env)?'/settings/users-roles?auth=unavailable':'/masters/live?auth=unavailable'));
  return new Response(null,{status:302,headers});
 }
}
