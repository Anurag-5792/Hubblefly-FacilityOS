import {oidcConfig,decodeFlow,cookieValue,completeLogin,verifyGoogleIdentity,clearAuthCookies}
 from '../../../../../../lib/hft/live/live-oidc.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 const base=process.env.HFT_PUBLIC_ORIGIN;
 if(!base)return Response.json({state:'UNAVAILABLE',
  code:'LIVE_R1_AUTHENTICATION_NOT_CONFIGURED'},
  {status:503,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url),code=url.searchParams.get('code');
 const state=url.searchParams.get('state');
 const headers=new Headers({'Cache-Control':'no-store'});
 const outcome='unavailable';
 try{
  // Decode authenticated flow state before selecting strictly restricted proof mode.
  // The approved state key remains mandatory in both paths.
  const config=oidcConfig(process.env,true);
  const flow=decodeFlow(cookieValue(request.headers.get('cookie'),
   '__Host-hft_live_oauth'),config.stateKey);
  if(!code||!state||state.length!==flow.state.length||
   state!==flow.state)
   throw Error('LIVE_R1_OIDC_STATE_MISMATCH');
  if(flow.identityProofOnly){
   if(process.env.HFT_ENVIRONMENT!=='production-qualification'||
      process.env.VERCEL_ENV!=='preview')throw Error('LIVE_R1_IDENTITY_PROOF_PREVIEW_ONLY');
   const identity=await verifyGoogleIdentity(config,process.env,flow,code);
   headers.append('Set-Cookie',clearAuthCookies[0]);
   headers.append('Set-Cookie',clearAuthCookies[1]);
   return Response.json({state:'GOOGLE_IDENTITY_VERIFIED_NO_SESSION',
    email:identity.email,providerSubject:identity.providerSubject,
    enrolled:false,applicationSession:false,databaseAccess:false},
    {status:200,headers});
  }
  // Ordinary login must revalidate the enrolled actors; never use proof config to mint sessions.
  const enrolledConfig=oidcConfig(process.env);
  const cookie=await completeLogin(enrolledConfig,process.env,flow,code);
  headers.append('Set-Cookie',clearAuthCookies[1]);
  headers.append('Set-Cookie',cookie);
  headers.set('Location',base+'/masters/live');
  return new Response(null,{status:302,headers});
 }catch{
  headers.append('Set-Cookie',clearAuthCookies[0]);
  headers.append('Set-Cookie',clearAuthCookies[1]);
  headers.set('Location',base+'/masters/live?auth='+outcome);
  return new Response(null,{status:302,headers});
 }
}
