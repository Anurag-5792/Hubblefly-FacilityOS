import { NextResponse, type NextRequest } from 'next/server';
import {hostedOperatorAttempt,hostedOperatorPathAdmitted,hostedOperatorMode} from './lib/hft/roles/hosted-operator-profile';
import {liveWorkspaceRoutesAdmitted,intakeWorkspaceRouteAdmitted} from './lib/hft/ui-reuse/workspace-profile';
import {identityProofPathAdmitted} from './lib/hft/live/live-identity-mode';
import { assertSecureStartup } from './lib/hft/security/authorization';
import {assertRetainedMastersProfile,isRetainedMastersProfile}
 from './lib/hft/masters/retained-nonproduction-profile';
import {assertDraftEdgeProfile,isDraftMode} from './lib/hft/draft/draft-edge-profile';
import {assertRetainedStoresProfile,isRetainedStoresProfile}
 from './lib/hft/stores/ops-a2-retained-profile';

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
const draftRoutes=new Set([
 '/','/draft','/draft/sign-in','/api/hft/draft','/api/hft/draft/signout',
 '/api/hft/draft/auth/start','/api/hft/draft/auth/callback'
]);
const publicDraftPages=new Set(['/','/draft','/draft/sign-in']);
const publicStoresPages=new Set(['/','/stores','/stores/operations']);
const storesOperatorRoutes=new Set([
 '/','/stores','/stores/operations',
 '/api/hft/stores/receive','/api/hft/stores/read'
]);
const liveRoutes=new Set(['/','/masters/live','/api/hft/live-masters',
 '/api/hft/live-masters/health','/api/hft/live-masters/auth/start',
 '/api/hft/live-masters/auth/callback','/api/hft/live-masters/signout']);
export function middleware(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(hostedOperatorAttempt(process.env)){
  if(hostedOperatorPathAdmitted(path,process.env)){
   if(path==='/stores')return NextResponse.redirect(new URL(hostedOperatorMode(process.env)==='ROLES_RECEIVE'?'/stores/operations':'/settings/users-roles',request.url));
   return NextResponse.next();
  }
  return NextResponse.json({state:'UNAVAILABLE',code:'HOSTED_OPERATOR_ROUTE_NOT_ADMITTED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 if(process.env.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined){
  if(identityProofPathAdmitted(path,process.env))return NextResponse.next();
  return NextResponse.json({state:'UNAVAILABLE',code:'LIVE_R1_IDENTITY_ONLY'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 // Public settings shell contains no employee or assignment data. The exact
 // new API independently verifies the signed session and denies absent backend.
 // No existing Stores, P3, draft or production admission is broadened.
 if(path==='/settings'||path==='/settings/users-roles')return NextResponse.next();
 if(path==='/api/hft/settings/roles'){
  if(process.env.VERCEL_ENV==='production'||process.env.HFT_ENVIRONMENT==='production')
   return NextResponse.json({state:'UNAVAILABLE',code:'ROLE_NONPRODUCTION_ONLY'},
    {status:503,headers:{'Cache-Control':'no-store'}});
  return NextResponse.next();
 }
 // The distinct production boundary never admits protected stock/P3/Draft APIs.
 // All allowed handlers independently recheck the full TLS/database/OIDC profile.
 if(process.env.HFT_LIVE_R1_PROFILE!==undefined){
  const live=liveWorkspaceRoutesAdmitted(process.env);
  if(live&&liveRoutes.has(path))return NextResponse.next();
  if(live&&intakeWorkspaceRouteAdmitted(process.env)&&(path==='/stores/intake'||path==='/api/hft/intake'))return NextResponse.next();
  return NextResponse.json({state:'UNAVAILABLE',code:'LIVE_R1_RUNTIME_NOT_ADMITTED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 // The Stores operator path is completely separate from the R77 QA gateway.
 // A misconfigured profile only serves explanatory HTML, never an HFT API.
 if(process.env.HFT_STORES_RUNTIME_PROFILE!==undefined){
  try{
   if(isRetainedStoresProfile(process.env)){
    assertRetainedStoresProfile(process.env);
    if(storesOperatorRoutes.has(path))return NextResponse.next();
   }
  }catch{/* No sample identity fallback or operational posting bypass. */}
  if(publicStoresPages.has(path))return NextResponse.next();
  return NextResponse.json({ok:false,error:'HFT_STORES_OPERATIONAL_NOT_ADMITTED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
 // Static UI may explain an unconfigured environment; protected APIs
 // remain CLOSED. A READY build is not a database/identity admission.
 if(process.env.HFT_DRAFT_RUNTIME_PROFILE!==undefined){
  try{
   if(isDraftMode(process.env)){
    assertDraftEdgeProfile(process.env);
    if(draftRoutes.has(path))return NextResponse.next();
   }
  }catch{/* fail closed for every API */}
  if(publicDraftPages.has(path)||publicStoresPages.has(path))return NextResponse.next();
  return NextResponse.json({ok:false,error:'HFT_DRAFT077_NOT_ADMITTED'},
   {status:503,headers:{'Cache-Control':'no-store'}});
 }
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
  if(publicDraftPages.has(path)||publicStoresPages.has(path))return NextResponse.next();
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
