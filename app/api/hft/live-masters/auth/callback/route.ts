import {oidcConfig,decodeFlow,cookieValue,completeLogin,clearAuthCookies}
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
  const config=oidcConfig(process.env);
  const flow=decodeFlow(cookieValue(request.headers.get('cookie'),
   '__Host-hft_live_oauth'),config.stateKey);
  if(!code||!state||state.length!==flow.state.length||
   state!==flow.state)
   throw Error('LIVE_R1_OIDC_STATE_MISMATCH');
  const cookie=await completeLogin(config,process.env,flow,code);
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
