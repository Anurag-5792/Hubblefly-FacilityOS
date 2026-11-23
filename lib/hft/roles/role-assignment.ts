/** Application business roles only. No PostgreSQL role or stock approval is granted here. */
export const ROLE_CATALOG = [
 {id:'OWNER_ADMIN',label:'Owner Admin',permissions:['roles.read','roles.manage','roles.manage-admin','audit.read']},
 {id:'ROLE_ADMINISTRATOR',label:'Role Administrator',permissions:['roles.read','audit.read']},
 {id:'STORES_IN_CHARGE',label:'Stores In-Charge',permissions:['stock.read','stores.receive','stores.issue','stores.return','stores.transfer']},
 {id:'STORES_OPERATOR',label:'Stores Operator',permissions:['stock.read','stores.receive','stores.issue','stores.return']},
 {id:'STORES_CHECKER',label:'Stores Checker',permissions:['stock.read','stores.check']},
 {id:'QC_INSPECTOR',label:'QC Inspector',permissions:['stock.read','qc.inspect']},
 {id:'PROCUREMENT',label:'Procurement',permissions:['stock.read','procurement.manage','grn.prepare']},
 {id:'INVENTORY_AUDITOR',label:'Inventory Auditor',permissions:['stock.read','audit.read']},
 {id:'VIEWER',label:'Viewer',permissions:['stock.read']},
] as const;
/** Explicit, owner-controlled application CRUD. Never stock ledger, posting, approval or audit deletion. */
export const CRUD_MODULES=[
 {id:'EMPLOYEES',label:'Employees'},
 {id:'ITEMS',label:'Items'},
 {id:'SUPPLIERS',label:'Suppliers'},
 {id:'WAREHOUSES',label:'Warehouses'},
 {id:'LOCATIONS',label:'Locations'},
 {id:'PROCUREMENT',label:'Procurement'},
 {id:'DRAFTS',label:'Draft records'}
] as const;
export const CRUD_ACTIONS=['create','read','update','delete'] as const;
export type CrudModule=typeof CRUD_MODULES[number]['id'];
export type CrudAction=typeof CRUD_ACTIONS[number];
export type CrudPermission=`module.${CrudModule}.${CrudAction}`;
export type BusinessPermission=Permission|CrudPermission;
export function modulePermission(module:CrudModule,action:CrudAction):CrudPermission{
 if(!CRUD_MODULES.some(m=>m.id===module)||!CRUD_ACTIONS.includes(action))
  deny('ROLE_UNRECOGNIZED_MODULE_PERMISSION');
 return `module.${module}.${action}`;
}
export function moduleSet(value:unknown):CrudPermission[]{
 if(!Array.isArray(value)||value.length>CRUD_MODULES.length*CRUD_ACTIONS.length||
  value.some(x=>typeof x!=='string'||!CRUD_MODULES.some(m=>CRUD_ACTIONS.some(act=>x===modulePermission(m.id,act))))||
  new Set(value).size!==value.length)deny('ROLE_INVALID_MODULE_PERMISSIONS');
 return [...value].sort() as CrudPermission[];
}
export type RoleId = typeof ROLE_CATALOG[number]['id'];
export type Permission = typeof ROLE_CATALOG[number]['permissions'][number];
export type Scope = Readonly<{legalEntityId:string;siteId:string;warehouseId:string}>;
export type Employee = Readonly<{employeeId:string;personId:string;fullName:string;active:boolean;version:number}>;
export type Principal = Readonly<{subject:string;sessionId:string;employeeId:string;personId:string;expiresAt:number;scopes:readonly Scope[]}>;
export type Period = Readonly<{from:string;to:string|null;roles:readonly RoleId[];modulePermissions?:readonly CrudPermission[];administrationDelegated?:boolean}>;
export type Assignment = Readonly<{employeeId:string;scope:Scope;revision:number;revokedFrom:string|null;periods:readonly Period[]}>;
export type Change = Readonly<{requestId:string;action:'ASSIGN'|'CHANGE'|'REVOKE';employeeId:string;employeeVersion:number;
 scope:Scope;roles:readonly RoleId[];modulePermissions?:readonly CrudPermission[];delegateAdministration?:boolean;expectedRevision:number;effectiveFrom:string;effectiveTo:string|null;reason:string}>;
export type AuditEvent = Readonly<{requestId:string;action:Change['action'];actorSubject:string;actorSessionId:string;
 actorEmployeeId:string;actorPersonId:string;recordedAt:string;reason:string;command:Change;before:Assignment;after:Assignment}>;
export class RoleError extends Error {constructor(code:string){super(code);this.name='RoleError';}}
export function deny(code:string):never {throw new RoleError(code);}
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||
  ![Object.prototype,null].includes(Object.getPrototypeOf(value)))deny('ROLE_INVALID_OBJECT');
 return value as Record<string,unknown>;
}
export function exactKeys(value:Record<string,unknown>,keys:readonly string[]):void{
 if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))deny('ROLE_INVALID_FIELDS');
}
export function identifier(value:unknown):string{if(typeof value!=='string'||!id.test(value))deny('ROLE_INVALID_ID');return value;}
export function scopeFrom(value:unknown):Scope{
 const p=object(value);exactKeys(p,['legalEntityId','siteId','warehouseId']);
 return {legalEntityId:identifier(p.legalEntityId),siteId:identifier(p.siteId),warehouseId:identifier(p.warehouseId)};
}
export function sameScope(a:Scope,b:Scope):boolean{return a.legalEntityId===b.legalEntityId&&a.siteId===b.siteId&&a.warehouseId===b.warehouseId;}
export function instant(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||
  !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)deny('ROLE_INVALID_DATE');
 return value;
}
export function roleSet(value:unknown,empty=false):RoleId[]{
 if(!Array.isArray(value)||value.length>ROLE_CATALOG.length||(!empty&&!value.length)||
  value.some(x=>!ROLE_CATALOG.some(r=>r.id===x))||new Set(value).size!==value.length)deny('ROLE_INVALID_ROLES');
 const roles=[...value].sort() as RoleId[];
 const maker=roles.some(r=>r==='STORES_OPERATOR'||r==='STORES_IN_CHARGE');
 if(maker&&roles.some(r=>r==='STORES_CHECKER'||r==='QC_INSPECTOR'))deny('ROLE_INCOMPATIBLE_DUTIES');
 return roles;
}
export function permissionsFor(roles:readonly RoleId[]):Permission[]{
 return [...new Set(roles.flatMap(r=>[...ROLE_CATALOG.find(c=>c.id===r)!.permissions]))].sort() as Permission[];
}
export function parseChange(value:unknown):Change{
 const p=object(value);const keys=['requestId','action','employeeId','employeeVersion','scope','roles','expectedRevision','effectiveFrom','effectiveTo','reason'];
 if(Object.hasOwn(p,'modulePermissions'))keys.push('modulePermissions');
 if(Object.hasOwn(p,'delegateAdministration'))keys.push('delegateAdministration');
 exactKeys(p,keys);
 if(typeof p.requestId!=='string'||!uuid.test(p.requestId))deny('ROLE_INVALID_REQUEST_ID');
 if(!['ASSIGN','CHANGE','REVOKE'].includes(p.action as string))deny('ROLE_INVALID_ACTION');
 if(!Number.isSafeInteger(p.expectedRevision)||(p.expectedRevision as number)<0||
  !Number.isSafeInteger(p.employeeVersion)||(p.employeeVersion as number)<1)deny('ROLE_INVALID_REVISION');
 if(typeof p.reason!=='string'||p.reason.trim().length<8||p.reason.length>500)deny('ROLE_REASON_REQUIRED');
 const roles=roleSet(p.roles,p.action==='REVOKE');
 if(p.action==='REVOKE'&&roles.length)deny('ROLE_REVOKE_MUST_BE_EMPTY');
 const from=instant(p.effectiveFrom),to=p.effectiveTo===null?null:instant(p.effectiveTo);
 if(to&&to<=from)deny('ROLE_INVALID_EFFECTIVE_RANGE');
 if(p.action==='REVOKE'&&to!==null)deny('ROLE_REVOKE_CANNOT_REACTIVATE');
 if(roles.includes('OWNER_ADMIN')&&to!==null)deny('ROLE_OWNER_EXPIRY_NOT_ALLOWED');
 if(Object.hasOwn(p,'delegateAdministration')&&typeof p.delegateAdministration!=='boolean')deny('ROLE_ADMIN_DELEGATION_EXPLICIT_CHOICE_REQUIRED');
 if(p.delegateAdministration===true&&!roles.includes('ROLE_ADMINISTRATOR'))deny('ROLE_ADMIN_DELEGATION_REQUIRES_ROLE');
 const modulePermissions=Object.hasOwn(p,'modulePermissions')?moduleSet(p.modulePermissions):undefined;
 if(p.action==='REVOKE'&&(modulePermissions?.length||p.delegateAdministration===true))deny('ROLE_REVOKE_MUST_BE_EMPTY');
 return {requestId:p.requestId,action:p.action as Change['action'],employeeId:identifier(p.employeeId),
 employeeVersion:p.employeeVersion as number,scope:scopeFrom(p.scope),roles,
 ...(modulePermissions===undefined?{}:{modulePermissions}),
 ...(Object.hasOwn(p,'delegateAdministration')?{delegateAdministration:p.delegateAdministration as boolean}:{}),
 expectedRevision:p.expectedRevision as number,
 effectiveFrom:from,effectiveTo:to,reason:p.reason.trim()};
}
export function validateAssignment(a:Assignment):void{
 identifier(a.employeeId);scopeFrom(a.scope);
 if(!Number.isSafeInteger(a.revision)||a.revision<0||!Array.isArray(a.periods)||a.periods.length>2000)deny('ROLE_INVALID_SNAPSHOT');
 if(a.revokedFrom!==null)instant(a.revokedFrom);
 let last:string|null|undefined=undefined;
 for(const p of a.periods){
  const from=instant(p.from),to=p.to===null?null:instant(p.to);roleSet(p.roles);
  if(p.modulePermissions!==undefined)moduleSet(p.modulePermissions);
  if(p.administrationDelegated!==undefined&&typeof p.administrationDelegated!=='boolean')deny('ROLE_INVALID_ADMIN_DELEGATION');
  if(p.administrationDelegated===true&&!p.roles.includes('ROLE_ADMINISTRATOR'))deny('ROLE_INVALID_ADMIN_DELEGATION');
  if((to&&to<=from)||last===null||(last!==undefined&&from<last))deny('ROLE_OVERLAPPING_PERIODS');last=to;
 }
}
export function rolesAt(a:Assignment,at:string):readonly RoleId[]{
 validateAssignment(a);instant(at);
 return a.periods.find(p=>p.from<=at&&(!p.to||at<p.to))?.roles??[];
}
/** Effective permissions come exclusively from the persisted, scoped, dated snapshot. */
export function permissionsAt(a:Assignment,at:string):BusinessPermission[]{
 validateAssignment(a);const p=a.periods.find(p=>p.from<=at&&(!p.to||at<p.to));
 if(!p)return [];
 return [...new Set<BusinessPermission>([...permissionsFor(p.roles),
  ...(p.administrationDelegated===true&&p.roles.includes('ROLE_ADMINISTRATOR')?['roles.manage' as Permission]:[]),
  ...(p.modulePermissions??[])])].sort();
}
export function assignmentStatus(a:Assignment,at:string):'ACTIVE'|'SCHEDULED'|'EXPIRED'|'REVOKED'|'NONE'{
 if(rolesAt(a,at).length)return 'ACTIVE';
 if(a.revokedFrom!==null&&at>=a.revokedFrom)return 'REVOKED';
 if(a.periods.some(p=>p.from>at))return 'SCHEDULED';
 return a.periods.length?'EXPIRED':a.revision?'REVOKED':'NONE';
}
export function requireScope(actor:Principal,scope:Scope,now:string):void{
 if(!actor.subject||!actor.sessionId||!actor.personId||!actor.employeeId||
  actor.expiresAt*1000<=Date.parse(now)||!actor.scopes.some(s=>sameScope(s,scope)))deny('ROLE_ACTOR_OR_SCOPE_DENIED');
}
/** Pure policy; the server MUST call while holding the scope's database row lock. */
export function planChange(change:Change,actor:Principal,employee:Employee,current:Assignment,
 actorAssignment:Assignment,otherOwners:readonly Assignment[],now:string):AuditEvent{
 requireScope(actor,change.scope,now);validateAssignment(current);validateAssignment(actorAssignment);
 if(!sameScope(actorAssignment.scope,change.scope)||actorAssignment.employeeId!==actor.employeeId)deny('ROLE_AUTHORITY_SCOPE_DENIED');
 if(!permissionsAt(actorAssignment,now).includes('roles.manage'))deny('ROLE_MANAGEMENT_DENIED');
 if(employee.employeeId!==change.employeeId||!employee.active||employee.version!==change.employeeVersion)deny('ROLE_ACTIVE_EMPLOYEE_CHANGED');
 if(actor.employeeId===employee.employeeId||actor.personId===employee.personId)deny('ROLE_SELF_CHANGE_DENIED');
 if(current.employeeId!==change.employeeId||!sameScope(current.scope,change.scope))deny('ROLE_TARGET_SCOPE_DENIED');
 if(current.revision!==change.expectedRevision)deny('ROLE_REVISION_CONFLICT');
 if(Date.parse(change.effectiveFrom)<Date.parse(now)-60000)deny('ROLE_BACKDATING_DENIED');
 const future=current.periods.filter(p=>p.to===null||p.to>change.effectiveFrom);
 if(change.action==='ASSIGN'&&future.length)deny('ROLE_ALREADY_ASSIGNED');
 if(change.action!=='ASSIGN'&&!future.length)deny('ROLE_ASSIGNMENT_NOT_FOUND');
 const owner=rolesAt(actorAssignment,now).includes('OWNER_ADMIN');
 const currentPeriod=current.periods.find(p=>p.from<=change.effectiveFrom&&(!p.to||change.effectiveFrom<p.to));
 const previousModules=currentPeriod?.modulePermissions??[];
 const previousDelegation=currentPeriod?.administrationDelegated??false;
 const chosenModules=change.modulePermissions??(change.action==='ASSIGN'?[]:previousModules);
 const chosenDelegation=change.delegateAdministration??(change.action==='ASSIGN'?false:previousDelegation);
 if((change.modulePermissions!==undefined&&JSON.stringify(moduleSet(chosenModules))!==JSON.stringify(moduleSet(previousModules)))&&!owner)
  deny('ROLE_MODULE_CONFIGURATION_OWNER_ONLY');
 if(change.delegateAdministration!==undefined&&chosenDelegation!==previousDelegation&&!owner)
  deny('ROLE_ADMIN_DELEGATION_OWNER_ONLY');
 if(chosenDelegation&&!change.roles.includes('ROLE_ADMINISTRATOR'))deny('ROLE_ADMIN_DELEGATION_REQUIRES_ROLE');
 const privileged=['OWNER_ADMIN','ROLE_ADMINISTRATOR'];
 if([...change.roles,...future.flatMap(p=>[...p.roles])].some(r=>privileged.includes(r))&&
  !permissionsAt(actorAssignment,now).includes('roles.manage-admin'))deny('ROLE_ADMIN_DELEGATION_DENIED');
 if(future.some(p=>p.roles.includes('OWNER_ADMIN'))&&!change.roles.includes('OWNER_ADMIN')&&
  !otherOwners.some(o=>o.employeeId!==current.employeeId&&sameScope(o.scope,current.scope)&&
   o.periods.some(p=>p.from<=change.effectiveFrom&&p.to===null&&p.roles.includes('OWNER_ADMIN'))))deny('ROLE_LAST_OWNER_DENIED');
 // Replace the schedule suffix atomically. Revocation cancels ALL later grants;
 // expiration never falls back to an older, superseded grant.
 const periods:Period[]=current.periods.filter(p=>p.from<change.effectiveFrom).map(p=>
  ({...p,to:!p.to||p.to>change.effectiveFrom?change.effectiveFrom:p.to}));
 if(change.action!=='REVOKE')periods.push({from:change.effectiveFrom,to:change.effectiveTo,roles:change.roles,
  modulePermissions:moduleSet(chosenModules),administrationDelegated:chosenDelegation});
 const after:Assignment={employeeId:current.employeeId,scope:current.scope,revision:current.revision+1,revokedFrom:change.action==='REVOKE'?change.effectiveFrom:null,periods};
 validateAssignment(after);
 return {requestId:change.requestId,action:change.action,actorSubject:actor.subject,actorSessionId:actor.sessionId,
 actorEmployeeId:actor.employeeId,actorPersonId:actor.personId,recordedAt:now,reason:change.reason,command:change,before:current,after};
}
/** Participants must come from the authoritative transaction, never the browser. */
export function requirePermission(actor:Principal,assignment:Assignment,permission:BusinessPermission,scope:Scope,now:string,
 transaction?:Readonly<{makerPersonId:string;checkerPersonId:string|null;inspectorPersonId:string|null;approverPersonId:string|null}>):void{
 requireScope(actor,scope,now);
 if(assignment.employeeId!==actor.employeeId||!sameScope(assignment.scope,scope)||
  !permissionsAt(assignment,now).includes(permission))deny('ROLE_PERMISSION_DENIED');
 if(permission==='stores.check'||permission==='qc.inspect'||permission==='stores.receive'||permission==='stores.issue'||permission==='stores.return'||permission==='stores.transfer'){
  if(!transaction)deny('ROLE_TRANSACTION_AUTHORITY_REQUIRED');
  const participants=[transaction.makerPersonId,transaction.checkerPersonId,transaction.inspectorPersonId,transaction.approverPersonId].filter(Boolean);
  identifier(transaction.makerPersonId);for(const person of participants)identifier(person);
  if(new Set(participants).size!==participants.length)deny('ROLE_TRANSACTION_DUTY_CONFLICT');
  if((permission==='stores.check'&&(actor.personId===transaction.makerPersonId||actor.personId===transaction.inspectorPersonId||actor.personId===transaction.approverPersonId||
    (transaction.checkerPersonId!==null&&transaction.checkerPersonId!==actor.personId)))||
   (permission==='qc.inspect'&&(actor.personId===transaction.makerPersonId||actor.personId===transaction.checkerPersonId||actor.personId===transaction.approverPersonId||
    (transaction.inspectorPersonId!==null&&transaction.inspectorPersonId!==actor.personId)))||
   (permission.startsWith('stores.')&&permission!=='stores.check'&&
    (actor.personId!==transaction.makerPersonId||actor.personId===transaction.checkerPersonId||actor.personId===transaction.inspectorPersonId||actor.personId===transaction.approverPersonId)))deny('ROLE_TRANSACTION_DUTY_CONFLICT');
 }
}
