/** Route hints only; independent handlers still verify identity and authority. */
import {hostedOperatorAttempt,hostedOperatorMode,type OperatorEnv} from '../roles/hosted-operator-profile.ts';
import {misRequirementsConfigured} from '../planning/mis-profile.ts';
import {identityProofModeAdmitted} from '../live/live-identity-mode.ts';
export type LoginDestination='proof'|'masters'|'intake'|'roles'|'stores';
export function liveWorkspaceRoutesAdmitted(e:OperatorEnv):boolean{
 return !hostedOperatorAttempt(e)&&e.HFT_LIVE_R1_IDENTITY_PROOF_MODE===undefined&&
 e.HFT_LIVE_R1_PROFILE==='HFT_R1_PRODUCTION_LIVE_MASTERS_V1'&&
 ['production','production-qualification'].includes(e.HFT_ENVIRONMENT??'')&&e.HFT_LIVE_POSTING_ENABLED==='false'&&
 (e.HFT_ENVIRONMENT!=='production'||e.VERCEL_ENV==='production')&&
 e.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE===undefined&&e.HFT_DRAFT_RUNTIME_PROFILE===undefined&&
 e.HFT_STORES_RUNTIME_PROFILE===undefined&&e.HFT_MASTERS_RUNTIME_PROFILE===undefined;
}
/** Presentation only in the existing non-posting Masters qualification profile.
 * No session, reader, stock or data authority is inferred from this route.
 */
export function misPresentationAdmitted(e:OperatorEnv):boolean{
 return liveWorkspaceRoutesAdmitted(e)&&e.HFT_ENVIRONMENT==='production-qualification'&&
 e.VERCEL_ENV!=='production'&&e.HFT_AUTH_SOURCE==='verified'&&e.HFT_OPERATIONS_SOURCE==='database'&&
 e.HFT_MIS_REQUIREMENTS_PROFILE===undefined;
}
export function intakeWorkspaceRouteAdmitted(e:OperatorEnv):boolean{
 return liveWorkspaceRoutesAdmitted(e)&&e.HFT_INTAKE_PROFILE==='HFT_INTAKE_OWNER_REVIEW_V1'&&e.HFT_ENVIRONMENT==='production-qualification'&&e.VERCEL_ENV==='preview';
}
export function assertLoginDestination(e:OperatorEnv,d:LoginDestination):void{
 if(hostedOperatorAttempt(e)){
  const mode=hostedOperatorMode(e);
  if(d==='roles'||d==='stores'&&mode==='ROLES_RECEIVE')return;
 }else if(e.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined){
  if(d==='proof'&&identityProofModeAdmitted(e)&&e.HFT_INTAKE_PROFILE===undefined)return;
 }else if(liveWorkspaceRoutesAdmitted(e)){
  if(d==='masters'||d==='intake'&&intakeWorkspaceRouteAdmitted(e))return;
 }
 throw Error('WORKSPACE_LOGIN_DESTINATION_DENIED');
}
export function loginDestination(e:OperatorEnv,values:readonly string[]):LoginDestination{
 if(values.length>1)throw Error('WORKSPACE_LOGIN_DESTINATION_DENIED');
 const d=values[0]??(hostedOperatorAttempt(e)?'roles':e.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined?'proof':'masters');
 if(!['proof','masters','intake','roles','stores'].includes(d)||values.length&&d==='proof')throw Error('WORKSPACE_LOGIN_DESTINATION_DENIED');
 assertLoginDestination(e,d as LoginDestination);return d as LoginDestination;
}
export const loginPath=(d:Exclude<LoginDestination,'proof'>)=>({masters:'/masters/live',intake:'/stores/intake',roles:'/settings/users-roles',stores:'/stores/operations'})[d];
export type ModuleLink={label:string;description:string;href:string|null;status:string};
export function workspaceModules(e:OperatorEnv):ModuleLink[]{
 let hosted:'ROLES_ONLY'|'ROLES_RECEIVE'|null=null;
 try{if(hostedOperatorAttempt(e))hosted=hostedOperatorMode(e);}catch{/* no eligible links */}
 const proof=e.HFT_LIVE_R1_IDENTITY_PROOF_MODE!==undefined,live=liveWorkspaceRoutesAdmitted(e),intake=intakeWorkspaceRouteAdmitted(e);
 const ordinary=!proof&&!hostedOperatorAttempt(e)&&e.HFT_LIVE_R1_PROFILE===undefined&&e.HFT_DRAFT_RUNTIME_PROFILE===undefined&&e.HFT_STORES_RUNTIME_PROFILE===undefined&&e.HFT_MASTERS_RUNTIME_PROFILE===undefined;
 const draft=!proof&&!hostedOperatorAttempt(e)&&e.HFT_LIVE_R1_PROFILE===undefined&&e.HFT_DRAFT_RUNTIME_PROFILE!==undefined;
 const retained=!proof&&!hostedOperatorAttempt(e)&&e.HFT_LIVE_R1_PROFILE===undefined&&e.HFT_STORES_RUNTIME_PROFILE!==undefined;
 const link=(label:string,description:string,path:string,ok:boolean,status='Separate admission required'):ModuleLink=>({label,description,href:ok?path:null,status:ok?'Open workspace · access checked':status});
 return [
  link('Live Masters','Recorded employees and master data, not stock approval.','/masters/live',live),
  link('Users & Roles','Canonical employee-based permissions.','/settings/users-roles',!proof&&(hosted!==null||ordinary)),
  link('Stores operations','Protected workflow; independent transaction controls remain.','/stores/operations',!proof&&(hosted==='ROLES_RECEIVE'||retained||ordinary)),
  link('Inventory intake','Owner-only source review, not admitted balances.','/stores/intake',intake),
  misPresentationAdmitted(e)?{label:'Management MIS',description:'Open management overview and Plan My Builds. Approved BOM, stock and procurement data are not admitted.',href:'/mis',status:'Presentation only · data unavailable'}:
  link('Management MIS','Read-only approved BOM requirements; stock readiness separately admitted.','/mis',ordinary||hosted!==null&&misRequirementsConfigured(e),'Awaiting authorized source'),
  link('Draft Masters','Provisional records, distinct from Live Masters.','/draft',draft||ordinary),
  link('Governed Masters','Protected P3 master workflow.','/stores/masters',ordinary)
 ];
}
