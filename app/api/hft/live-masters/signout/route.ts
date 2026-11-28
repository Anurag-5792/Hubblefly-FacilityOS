import {clearAuthCookies} from '../../../../../lib/hft/live/live-oidc.ts';
export const runtime='nodejs';
export async function POST(request:Request):Promise<Response>{
 const origin=process.env.HFT_PUBLIC_ORIGIN;
 if(!origin||request.headers.get('origin')!==origin||
   new URL(request.url).origin!==origin||
   (request.headers.has('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin'))
  return Response.json({state:'REJECTED',code:'LIVE_R1_CROSS_ORIGIN_SIGNOUT_DENIED'},
   {status:401,headers:{'Cache-Control':'no-store'}});
 const headers=new Headers({'Content-Type':'application/json',
  'Cache-Control':'no-store'});
 for(const cookie of clearAuthCookies)headers.append('Set-Cookie',cookie);
 return new Response(JSON.stringify({state:'SIGNED_OUT'}),{status:200,headers});
}
export async function GET(){return Response.json({state:'REJECTED'},
 {status:405,headers:{'Cache-Control':'no-store'}});}
