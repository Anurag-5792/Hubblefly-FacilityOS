import {oidcConfig,startUrl}
 from '../../../../../../lib/hft/live/live-oidc.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 try{
  const identityProofOnly=new URL(request.url).searchParams.get('identity_proof')==='1';
  if(identityProofOnly&&(process.env.HFT_ENVIRONMENT!=='production-qualification'||
    process.env.VERCEL_ENV!=='preview'))throw Error('LIVE_R1_IDENTITY_PROOF_PREVIEW_ONLY');
  const config=oidcConfig(process.env,identityProofOnly);
  const result=startUrl(config,process.env.HFT_PUBLIC_ORIGIN!,identityProofOnly);
  return new Response(null,{status:302,headers:{
   Location:result.location,'Set-Cookie':result.cookie,
   'Cache-Control':'no-store'}});
 }catch{
  return Response.json({state:'UNAVAILABLE',
   code:'LIVE_R1_AUTHENTICATION_NOT_CONFIGURED'},{
   status:503,headers:{'Cache-Control':'no-store'}});
 }
}
