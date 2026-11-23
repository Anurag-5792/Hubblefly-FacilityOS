/** C050 route-visibility proposal ONLY. No effective grant, DB write or
 * approval. The authoritative IAM issuer is not installed; NEVER trust this
 * browser-side model as server-side access control.
 */
import {C047_EXISTING_ROUTES,type UiPrincipal} from './route-registry.ts';
export type ScopedAccessProposal=Readonly<{
 state:'PROPOSED_NOT_APPLIED';targetSubject:string;createdBy:string;
 legalEntityId:string;siteId:string;warehouseId:string;
 proposedRoutePermissions:readonly string[];reason:string;
 expectedPolicyGeneration:number;independentReviewRequired:true;
}>;
const identity=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const scope=/^[A-Z0-9][A-Z0-9._-]{1,63}$/;
export function proposeRouteAccess(input:Readonly<{
 actor:UiPrincipal|null;targetSubject:string;legalEntityId:string;
 siteId:string;warehouseId:string;routePermissions:readonly string[];
 reason:string;expectedPolicyGeneration:number;
}>):ScopedAccessProposal{
 const {actor,targetSubject,legalEntityId,siteId,warehouseId,
  routePermissions,reason,expectedPolicyGeneration}=input;
 if(!actor?.active||!identity.test(actor.subject)||
   !actor.systemRoles.includes('OWNER_SUPERADMIN'))
  throw Error('C050_ACCESS_OWNER_NOT_QUALIFIED');
 if(!identity.test(targetSubject)||targetSubject===actor.subject)
  throw Error('C050_ACCESS_SELF_OR_UNKNOWN_SUBJECT_DENIED');
 if(![legalEntityId,siteId,warehouseId].every(x=>scope.test(x)))
  throw Error('C050_ACCESS_SCOPE_INVALID');
 // A browser-supplied "owner" string cannot confer scope. The editor is
 // disabled in the actual app pending a trusted server-side IAM projection.
 if(!actor.grantableScopes?.some(x=>
   x.legalEntityId===legalEntityId&&x.siteId===siteId&&x.warehouseId===warehouseId))
  throw Error('C050_ACCESS_CROSS_SCOPE_DENIED');
 if(!Number.isSafeInteger(expectedPolicyGeneration)||
   expectedPolicyGeneration<1||actor.policyGeneration!==expectedPolicyGeneration)
  throw Error('C050_ACCESS_STALE_POLICY_DENIED');
 if(reason!==reason.trim()||reason.length<8||reason.length>300)
  throw Error('C050_ACCESS_REASON_INVALID');
 const allowed=new Set(C047_EXISTING_ROUTES.map(x=>x.viewPermission));
 if(!Array.isArray(routePermissions)||routePermissions.length===0||
    routePermissions.length!==new Set(routePermissions).size||
    routePermissions.some(permission=>!allowed.has(permission)))
  throw Error('C050_ACCESS_PERMISSION_NOT_REGISTERED');
 return Object.freeze({state:'PROPOSED_NOT_APPLIED',
  targetSubject,createdBy:actor.subject,legalEntityId,siteId,warehouseId,
  proposedRoutePermissions:Object.freeze([...routePermissions]),
  reason,expectedPolicyGeneration,independentReviewRequired:true});
}
