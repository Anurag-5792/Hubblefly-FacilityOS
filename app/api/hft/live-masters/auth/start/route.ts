import {oidcConfig,startUrl}
 from '../../../../../../lib/hft/live/live-oidc.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET():Promise<Response>{
 try{
  const config=oidcConfig(process.env);
  const result=startUrl(config,process.env.HFT_PUBLIC_ORIGIN!);
  return new Response(null,{status:302,headers:{
   Location:result.location,'Set-Cookie':result.cookie,
   'Cache-Control':'no-store'}});
 }catch{
  return Response.json({state:'UNAVAILABLE',
   code:'LIVE_R1_AUTHENTICATION_NOT_CONFIGURED'},{
   status:503,headers:{'Cache-Control':'no-store'}});
 }
}
