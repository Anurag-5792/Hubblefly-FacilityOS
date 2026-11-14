import { NextResponse, type NextRequest } from 'next/server';
import { assertSecureStartup } from './lib/hft/security/authorization';
import {assertRetainedMastersProfile,isRetainedMastersProfile}
 from './lib/hft/masters/retained-nonproduction-profile';

/** Closed except EXACT Masters routes in a separately admitted retained
 * NONPRODUCTION profile. Stock, gallery, misc APIs, and production remain HOLD.
 * The Masters POST handlers independently recheck profile, signed session,
 * PostgreSQL identity, P3 privileges, source and policy.
 */
const retainedRoutes=new Set([
 '/stores/masters','/stores/masters/approvals',
 '/api/hft/masters','/api/hft/masters/decision'
]);
export function mastersPathAdmitted(path:string,env:Readonly<Record<string,string|undefined>>):boolean{
 if(!isRetainedMastersProfile(env))return false;
 assertRetainedMastersProfile(env);
 return retainedRoutes.has(path);
}
export function middleware(request:NextRequest){
 const path=request.nextUrl.pathname;
 // If the retained profile is present but invalid, fail ALL requests closed.
 if(process.env.HFT_MASTERS_RUNTIME_PROFILE!==undefined){
  try{
   if(mastersPathAdmitted(path,process.env))return NextResponse.next();
  }catch{/* no fallback to legacy preview/test identity */}
  return NextResponse.json({ok:false,error:'HFT_R1_MASTERS_PROFILE_NOT_ADMITTED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 try{assertSecureStartup(process.env);}
 catch{
  return NextResponse.json(
   {ok:false,error:'HFT_R1_PRODUCTION_NOT_AUTHORIZED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 if(path.startsWith('/api/hft/')){
  return NextResponse.json(
   {ok:false,error:'HFT_R1_API_NOT_QUALIFIED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 return NextResponse.next();
}
export const config={
 matcher:['/((?!_next/static|_next/image|favicon.ico).*)']
};
