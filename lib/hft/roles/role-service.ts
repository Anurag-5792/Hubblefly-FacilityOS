import {createHash} from 'node:crypto';
import {ROLE_CATALOG,RoleError,deny,exactKeys,identifier,object,scopeFrom,parseChange,planChange,requirePermission,
 requireScope,sameScope,validateAssignment,assignmentStatus,rolesAt,permissionsAt,type BusinessPermission,type Assignment,type AuditEvent,type Employee,
 type Permission,type Principal,type RoleId,type Scope} from './role-assignment.ts';
export type SessionIdentity=Readonly<{subject:string;sessionId:string;expiresAt:number;
 scope:Readonly<{legalEntityId:string;siteId:string;warehouseIds:readonly string[]}>}>;
export interface RoleTransaction {
 principal(session:SessionIdentity):Promise<Principal>;
 scopes(actor:Principal):Promise<Scope[]>;
 employee(scope:Scope,id:string):Promise<Employee>;
 search(scope:Scope,query:string):Promise<Employee[]>;
 assignment(scope:Scope,employeeId:string):Promise<Assignment>;
 owners(scope:Scope):Promise<Assignment[]>;
 event(requestId:string):Promise<AuditEvent|null>;
 history(scope:Scope,employeeId:string,before:number):Promise<AuditEvent[]>;
 save(event:AuditEvent):Promise<void>;
}
/** Implementations must COMMIT before returning, rollback failures, and discard
 * uncertain connections. write() must lock the exact scope before ANY policy read.
 * read() must acquire a NEW connection/snapshot; no same-transaction readback. */
export interface RoleStore {
 read<T>(work:(tx:RoleTransaction)=>Promise<T>):Promise<T>;
 write<T>(scope:Scope,work:(tx:RoleTransaction)=>Promise<T>):Promise<T>;
}
export function eventDigest(value:unknown):string{
 function canonical(x:unknown):string{
  if(x===null||typeof x!=='object'){const v=JSON.stringify(x);if(v===undefined)deny('ROLE_INVALID_OBJECT');return v;}
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  const p=x as Record<string,unknown>;
  return '{'+Object.keys(p).sort().map(k=>JSON.stringify(k)+':'+canonical(p[k])).join(',')+'}';
 }
 return createHash('sha256').update(canonical(value)).digest('hex');
}
/** Fresh authoritative business-role eligibility for protected API calls.
 * A signed JWT may establish identity/scope, never a cached role grant.
 * This check cannot replace original SQL invoice/QC/approver SoD controls.
 */
export async function requireCurrentBusinessPermission(
 store:RoleStore,session:SessionIdentity,scope:Scope,permission:BusinessPermission,
 now=new Date().toISOString()):Promise<Principal>{
 return store.read(async tx=>{
  const actor=await tx.principal(session);
  requireScope(actor,scope,now);
  if(!(await tx.scopes(actor)).some(s=>sameScope(s,scope)))
   deny('ROLE_ACTOR_OR_SCOPE_DENIED');
  const employee=await tx.employee(scope,actor.employeeId);
  if(!employee.active||employee.personId!==actor.personId)
   deny('ROLE_ACTOR_EMPLOYEE_NOT_ACTIVE');
  const assignment=await tx.assignment(scope,actor.employeeId);
  validateAssignment(assignment);
  if(assignment.employeeId!==actor.employeeId||
   !sameScope(assignment.scope,scope)||
   !permissionsAt(assignment,now).includes(permission))
   deny('ROLE_PERMISSION_DENIED');
  return actor;
 });
}

export class RoleService {
 constructor(store:RoleStore,session:SessionIdentity,clock:()=>string=()=>new Date().toISOString()){
  this.store=store;this.session=session;this.clock=clock;
 }
 private readonly store:RoleStore;
 private readonly session:SessionIdentity;
 private readonly clock:()=>string;
 private async authorize(tx:RoleTransaction,scope:Scope,permission:Permission):Promise<Principal>{
  const actor=await tx.principal(this.session);
  if(!(await tx.scopes(actor)).some(s=>sameScope(s,scope)))deny('ROLE_ACTOR_OR_SCOPE_DENIED');
  requirePermission(actor,await tx.assignment(scope,actor.employeeId),permission,scope,this.clock());return actor;
 }
 async execute(raw:unknown):Promise<unknown>{
  const p=object(raw);
  if(p.action==='BOOTSTRAP'){
   exactKeys(p,['action']);
   return this.store.read(async tx=>{
    const actor=await tx.principal(this.session),scopes:Scope[]=[];
    for(const scope of await tx.scopes(actor)){
     try{await this.authorize(tx,scope,'roles.read');scopes.push(scope);}
     catch(e){if(!(e instanceof RoleError))throw e;}
    }
    if(!scopes.length)deny('ROLE_MANAGEMENT_DENIED');
    return {state:'CONNECTED',catalog:ROLE_CATALOG,scopes,actorEmployeeId:actor.employeeId};
   });
  }
  if(p.action==='SEARCH'){
   exactKeys(p,['action','scope','query']);const scope=scopeFrom(p.scope);
   if(typeof p.query!=='string'||p.query.trim().length<2||p.query.length>80)deny('ROLE_SEARCH_REQUIRED');
   const query=p.query.trim();
   return this.store.read(async tx=>{await this.authorize(tx,scope,'roles.read');
    const rows=await tx.search(scope,query);
    if(rows.length>30||rows.some(e=>!e.active))deny('ROLE_EMPLOYEE_SOURCE_INVALID');
    return {state:'RESULTS',scope,employees:rows,limit:30};});
  }
  if(p.action==='VIEW'){
   exactKeys(p,['action','scope','employeeId','beforeRevision']);const scope=scopeFrom(p.scope),employeeId=identifier(p.employeeId);
   if(!Number.isSafeInteger(p.beforeRevision)||(p.beforeRevision as number)<1)deny('ROLE_INVALID_REVISION');
   const before=p.beforeRevision as number;
   return this.store.read(async tx=>{const actor=await this.authorize(tx,scope,'roles.read');
    const employee=await tx.employee(scope,employeeId),assignment=await tx.assignment(scope,employeeId);
    validateAssignment(assignment);
    if(!sameScope(assignment.scope,scope)||assignment.employeeId!==employeeId)deny('ROLE_TARGET_SCOPE_DENIED');
    const history=await tx.history(scope,employeeId,before);
    const actorAssignment=await tx.assignment(scope,actor.employeeId);
    let admin=false;try{requirePermission(actor,actorAssignment,'roles.manage-admin',scope,this.clock());admin=true;}catch(e){if(!(e instanceof RoleError))throw e;}
    const grantableRoles:RoleId[]=ROLE_CATALOG.filter(r=>admin||!['OWNER_ADMIN','ROLE_ADMINISTRATOR'].includes(r.id)).map(r=>r.id);
    return {state:'READ_VERIFIED',scope,employee,assignment,history,status:assignmentStatus(assignment,this.clock()),grantableRoles,
     effectivePermissions:permissionsAt(assignment,this.clock()),
     canConfigureModules:rolesAt(actorAssignment,this.clock()).includes('OWNER_ADMIN'),
     canDelegateAdministration:rolesAt(actorAssignment,this.clock()).includes('OWNER_ADMIN'),
     nextBeforeRevision:history.length===50?history[history.length-1].after.revision:null};
   });
  }
  if(p.action==='RECONCILE'){
   exactKeys(p,['action','scope','requestId']);const scope=scopeFrom(p.scope);
   if(typeof p.requestId!=='string'||!/^[0-9a-f-]{36}$/.test(p.requestId))deny('ROLE_INVALID_REQUEST_ID');
   return this.readback(scope,p.requestId,null);
  }
  const change=parseChange(p);let digest:string;
  try{
   digest=await this.store.write(change.scope,async tx=>{
    const actor=await this.authorize(tx,change.scope,'roles.manage');
    const existing=await tx.event(change.requestId);
    if(existing){
     if(existing.actorSubject!==actor.subject||eventDigest(existing.command)!==eventDigest(change))deny('ROLE_REQUEST_ID_REUSED');
     return eventDigest(existing);
    }
    const event=planChange(change,actor,await tx.employee(change.scope,change.employeeId),
     await tx.assignment(change.scope,change.employeeId),await tx.assignment(change.scope,actor.employeeId),
     await tx.owners(change.scope),this.clock());
    await tx.save(event);return eventDigest(event);
   });
  }catch(e){
   if(e instanceof RoleError)throw e;
   // No automatic retry and no ASSIGNED response on lost COMMIT/transport.
   return {state:'UNCONFIRMED',requestId:change.requestId,code:'ROLE_SAVE_OUTCOME_UNKNOWN_RECONCILE_ONLY'};
  }
  return this.readback(change.scope,change.requestId,digest);
 }
 private async readback(scope:Scope,requestId:string,expectedDigest:string|null):Promise<unknown>{
  try{return await this.store.read(async tx=>{
   const actor=await this.authorize(tx,scope,'roles.read'),event=await tx.event(requestId);
   if(!event||event.actorSubject!==actor.subject||!sameScope(event.after.scope,scope)||
    (expectedDigest!==null&&eventDigest(event)!==expectedDigest))deny('ROLE_READBACK_MISMATCH');
   const assignment=await tx.assignment(scope,event.after.employeeId);validateAssignment(assignment);
   if(assignment.revision<event.after.revision||!sameScope(assignment.scope,scope)||
    assignment.employeeId!==event.after.employeeId||
    (assignment.revision===event.after.revision&&eventDigest(assignment)!==eventDigest(event.after)))deny('ROLE_READBACK_MISMATCH');
   return {state:'SAVED_VERIFIED',requestId,savedAction:event.action,revision:event.after.revision,
    auditDigest:eventDigest(event),assignment,status:assignmentStatus(assignment,this.clock())};
  });}catch{return {state:'UNCONFIRMED',requestId,code:'ROLE_COMMIT_OR_READBACK_UNCONFIRMED_NO_RETRY'};}
 }
 /** Integrate inside a protected API operation, not as a cached JWT role claim.
  * The callback shares the scope lock/transaction with the live role decision.
  * Existing P0/P2/P3 approval checks remain mandatory inside that operation. */
 async withApiPermission<T>(scope:Scope,permission:BusinessPermission,
  source:(tx:RoleTransaction)=>Promise<Parameters<typeof requirePermission>[5]>,
  operation:(tx:RoleTransaction,actor:Principal)=>Promise<T>):Promise<T>{
  return this.store.write(scope,async tx=>{const actor=await tx.principal(this.session);
   requireScope(actor,scope,this.clock());
   requirePermission(actor,await tx.assignment(scope,actor.employeeId),permission,scope,this.clock(),await source(tx));
   return operation(tx,actor);
  });
 }
}
export type RoleApiDependencies=Readonly<{
 authenticate:(request:Request)=>Promise<SessionIdentity>;
 store:()=>RoleStore;
}>;
export async function handleRoleApi(request:Request,deps:RoleApiDependencies):Promise<Response>{
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const reply=(status:number,code:string)=>Response.json({state:'UNAVAILABLE',code},{status,headers});
 if(request.method!=='POST')return reply(405,'ROLE_POST_REQUIRED');
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply(415,'ROLE_JSON_REQUIRED');
 try{
  const session=await deps.authenticate(request);
  const reader=request.body?.getReader();if(!reader)return reply(400,'ROLE_BODY_REQUIRED');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
   if(size>16384){await reader.cancel();return reply(413,'ROLE_REQUEST_TOO_LARGE');}chunks.push(value);}}
  finally{reader.releaseLock();}
  let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,'ROLE_JSON_INVALID');}
  const result=await new RoleService(deps.store(),session).execute(raw);
  return Response.json(result,{status:(result as {state:string}).state==='UNCONFIRMED'?409:200,headers});
 }catch(e){
  if(e instanceof RoleError){
   if(e.message==='ROLE_BACKEND_NOT_ADMITTED')return reply(503,e.message);
   const denied=/DENIED|DELEGATION|LAST_OWNER/.test(e.message);
   return reply(denied?403:/CONFLICT|CHANGED|REUSED|ALREADY/.test(e.message)?409:400,e.message);
  }
  return reply(503,'ROLE_IDENTITY_OR_BACKEND_UNAVAILABLE');
 }
}
