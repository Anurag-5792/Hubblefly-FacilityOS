/** HF101 canonical identity core. No live route or permission grant.
 * Existing verified OIDC transport must call this only after validating the
 * signature, issuer, audience, state, nonce and the authoritative email claim.
 */
import {permissionsAt,type Assignment,type BusinessPermission} from '../roles/role-assignment.ts';
export type EmployeeLoginContext=Readonly<{legalEntityId:string;employeeId:string;personId:string;subject:string;siteId:string;fullName:string;email:string;employeeVersion:number;loginVersion:number;assignments:Assignment[]}>;
export function assertAuthoritativeGoogleEmail(email:unknown,verified:unknown,hostedDomain:unknown):string{
 if(verified!==true||typeof email!=='string'||email.length>254||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('HF101_VERIFIED_EMAIL_REQUIRED');
 const normalized=email.toLowerCase(),domain=normalized.split('@')[1];
 // Google is authoritative for Gmail and verified Workspace domain accounts;
 // a third-party-address Google account requires a separate mailbox proof.
 if(domain!=='gmail.com'&&(typeof hostedDomain!=='string'||hostedDomain.toLowerCase()!==domain))throw Error('HF101_EMAIL_PROVIDER_NOT_AUTHORITATIVE');
 return normalized;
}
export function employeeAccess(c:EmployeeLoginContext,at:string):Readonly<{state:'PENDING_ROLE'|'ROLE_ASSIGNED';scopes:{warehouseId:string;permissions:BusinessPermission[]}[]}>{
 if(!Number.isSafeInteger(c.employeeVersion)||c.employeeVersion<1||!Number.isSafeInteger(c.loginVersion)||c.loginVersion<1||
  !c.subject||!c.personId||!c.employeeId||!Array.isArray(c.assignments))throw Error('HF101_CONTEXT_INVALID');
 const seen=new Set<string>();
 const scopes=c.assignments.map(a=>{
  if(a.employeeId!==c.employeeId||a.scope.legalEntityId!==c.legalEntityId||a.scope.siteId!==c.siteId||seen.has(a.scope.warehouseId))throw Error('HF101_ASSIGNMENT_SCOPE_DENIED');
  seen.add(a.scope.warehouseId);
  return {warehouseId:a.scope.warehouseId,permissions:permissionsAt(a,at)};
 }).filter(x=>x.permissions.length>0);
 return {state:scopes.length?'ROLE_ASSIGNED':'PENDING_ROLE',scopes};
}
