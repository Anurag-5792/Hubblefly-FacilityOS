/** Source implementation for an admitted backend; not installed or opened by the route.
 * An installation supplies a dedicated pool and same-connection identity/ACL admission.
 * Never share stock-owner, issuer or superuser credentials with this service.
 */
import {deny,scopeFrom,sameScope,validateAssignment,type Assignment,type AuditEvent,type Employee,type Principal,type Scope} from './role-assignment.ts';
import {eventDigest,type RoleStore,type RoleTransaction,type SessionIdentity} from './role-service.ts';
export interface RoleSqlClient {
 query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[];rowCount?:number|null}>;
 release(destroy?:boolean):void;
}
export interface RoleSqlPool {connect():Promise<RoleSqlClient>;}
export type RoleConnectionAdmission=(client:RoleSqlClient)=>Promise<void>;
const params=(s:Scope)=>[s.legalEntityId,s.siteId,s.warehouseId];
class Transaction implements RoleTransaction {
 constructor(client:RoleSqlClient,writing:boolean){this.client=client;this.writing=writing;}
 private readonly client:RoleSqlClient;private readonly writing:boolean;
 private lock():string{return this.writing?' FOR SHARE':'';}
 async principal(session:SessionIdentity):Promise<Principal>{
  const r=await this.client.query<{employee_id:string;person_id:string}>(
   'SELECT b.employee_id,b.person_id FROM hft_app_roles.identity_binding b JOIN hft.employee e '+
   'ON e.legal_entity_id=b.legal_entity_id AND e.employee_id=b.employee_id '+
   'WHERE b.subject=$1 AND b.legal_entity_id=$2 AND e.site_id=$3 AND b.active AND e.active'+this.lock(),
   [session.subject,session.scope.legalEntityId,session.scope.siteId]);
  if(r.rows.length!==1||session.expiresAt*1000<=Date.now())deny('ROLE_ACTOR_OR_SCOPE_DENIED');
  return {subject:session.subject,sessionId:session.sessionId,expiresAt:session.expiresAt,
   employeeId:r.rows[0].employee_id,personId:r.rows[0].person_id,
   scopes:session.scope.warehouseIds.map(warehouseId=>({legalEntityId:session.scope.legalEntityId,siteId:session.scope.siteId,warehouseId}))};
 }
 async scopes(actor:Principal):Promise<Scope[]>{
  const r=await this.client.query<{legal_entity_id:string;site_id:string;warehouse_id:string}>(
   'SELECT s.legal_entity_id,s.site_id,s.warehouse_id FROM hft_app_roles.scope_lock s '+
   'JOIN hft.legal_entity e ON e.id=s.legal_entity_id JOIN hft.site t ON t.legal_entity_id=s.legal_entity_id AND t.id=s.site_id '+
   'JOIN hft.warehouse w ON w.legal_entity_id=s.legal_entity_id AND w.warehouse_id=s.warehouse_id AND w.site_id=s.site_id '+
   'WHERE e.active AND t.active AND w.active AND s.legal_entity_id=$1 AND s.site_id=$2',
   [actor.scopes[0]?.legalEntityId,actor.scopes[0]?.siteId]);
  return r.rows.map(x=>scopeFrom({legalEntityId:x.legal_entity_id,siteId:x.site_id,warehouseId:x.warehouse_id}))
   .filter(s=>actor.scopes.some(a=>sameScope(a,s)));
 }
 async employee(scope:Scope,id:string):Promise<Employee>{
  const r=await this.client.query<{employee_id:string;person_id:string;full_name:string;active:boolean;version:string}>(
   'SELECT e.employee_id,b.person_id,e.full_name,e.active,e.version::text FROM hft.employee e '+
   'JOIN hft_app_roles.identity_binding b ON b.employee_id=e.employee_id AND b.legal_entity_id=e.legal_entity_id '+
   'WHERE e.legal_entity_id=$1 AND e.site_id=$2 AND e.employee_id=$3 AND b.active'+this.lock(),
   [scope.legalEntityId,scope.siteId,id]);
  if(r.rows.length!==1)deny('ROLE_ACTIVE_EMPLOYEE_CHANGED');const e=r.rows[0];
  const version=Number(e.version);if(!Number.isSafeInteger(version))deny('ROLE_INVALID_REVISION');
  return {employeeId:e.employee_id,personId:e.person_id,fullName:e.full_name,active:e.active,version};
 }
 async search(scope:Scope,query:string):Promise<Employee[]>{
  const r=await this.client.query<{employee_id:string}>(
   'SELECT e.employee_id FROM hft.employee e JOIN hft_app_roles.identity_binding b '+
   'ON b.employee_id=e.employee_id AND b.legal_entity_id=e.legal_entity_id '+
   'WHERE e.legal_entity_id=$1 AND e.site_id=$2 AND e.active AND b.active '+
   'AND (position(lower($3) in lower(e.full_name))>0 OR position(lower($3) in lower(e.employee_id))>0) '+
   'ORDER BY e.full_name,e.employee_id LIMIT 30',[scope.legalEntityId,scope.siteId,query]);
  return Promise.all(r.rows.map(e=>this.employee(scope,e.employee_id)));
 }
 async assignment(scope:Scope,employeeId:string):Promise<Assignment>{
  const r=await this.client.query<{snapshot:Assignment}>(
   'SELECT snapshot FROM hft_app_roles.assignment WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3 AND employee_id=$4',
   [...params(scope),employeeId]);
  const a=r.rows[0]?.snapshot??{employeeId,scope,revision:0,revokedFrom:null,periods:[]};validateAssignment(a);return a;
 }
 async owners(scope:Scope):Promise<Assignment[]>{
  const r=await this.client.query<{snapshot:Assignment}>(
   'SELECT a.snapshot FROM hft_app_roles.assignment a JOIN hft.employee e ON e.legal_entity_id=a.legal_entity_id AND e.employee_id=a.employee_id '+
   'JOIN hft_app_roles.identity_binding b ON b.legal_entity_id=e.legal_entity_id AND b.employee_id=e.employee_id '+
   'WHERE a.legal_entity_id=$1 AND a.site_id=$2 AND a.warehouse_id=$3 AND e.active AND b.active '+
   'AND a.snapshot @> \'{"periods":[{"roles":["OWNER_ADMIN"]}]}\'::jsonb',params(scope));
  return r.rows.map(r=>r.snapshot);
 }
 async event(requestId:string):Promise<AuditEvent|null>{
  const r=await this.client.query<{event:AuditEvent;event_sha256:string}>(
   'SELECT event,event_sha256 FROM hft_app_roles.assignment_event WHERE request_id=$1::uuid',[requestId]);
  const e=r.rows[0];if(!e)return null;if(eventDigest(e.event)!==e.event_sha256)deny('ROLE_AUDIT_INTEGRITY_DENIED');return e.event;
 }
 async history(scope:Scope,employeeId:string,before:number):Promise<AuditEvent[]>{
  const r=await this.client.query<{event:AuditEvent;event_sha256:string}>(
   'SELECT event,event_sha256 FROM hft_app_roles.assignment_event WHERE legal_entity_id=$1 AND site_id=$2 '+
   'AND warehouse_id=$3 AND employee_id=$4 AND revision<$5 ORDER BY revision DESC LIMIT 50',[...params(scope),employeeId,before]);
  return r.rows.map(e=>{if(eventDigest(e.event)!==e.event_sha256)deny('ROLE_AUDIT_INTEGRITY_DENIED');return e.event;});
 }
 async save(event:AuditEvent):Promise<void>{
  if(!this.writing)deny('ROLE_READ_ONLY_TRANSACTION');const s=event.after.scope;
  const r=await this.client.query(
   'INSERT INTO hft_app_roles.assignment(legal_entity_id,site_id,warehouse_id,employee_id,revision,snapshot) '+
   'VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(legal_entity_id,site_id,warehouse_id,employee_id) DO UPDATE '+
   'SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot WHERE hft_app_roles.assignment.revision=$7',
   [...params(s),event.after.employeeId,event.after.revision,JSON.stringify(event.after),event.before.revision]);
  if(r.rowCount!==1)deny('ROLE_REVISION_CONFLICT');
  await this.client.query('INSERT INTO hft_app_roles.assignment_event(request_id,legal_entity_id,site_id,warehouse_id,employee_id,revision,event,event_sha256) '+
   'VALUES($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8)',
   [event.requestId,...params(s),event.after.employeeId,event.after.revision,JSON.stringify(event),eventDigest(event)]);
 }
}
export class PostgresRoleStore implements RoleStore {
 constructor(pool:RoleSqlPool,admit:RoleConnectionAdmission){this.pool=pool;this.admit=admit;}
 private readonly pool:RoleSqlPool;private readonly admit:RoleConnectionAdmission;
 read<T>(work:(tx:RoleTransaction)=>Promise<T>):Promise<T>{return this.run(null,work);}
 write<T>(scope:Scope,work:(tx:RoleTransaction)=>Promise<T>):Promise<T>{return this.run(scope,work);}
 private async run<T>(scope:Scope|null,work:(tx:RoleTransaction)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();let commit=false,discard=false,begun=false;
  try{
   await this.admit(c);begun=true;
   await c.query(scope?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await c.query("SET LOCAL statement_timeout='10000ms'");await c.query("SET LOCAL lock_timeout='2500ms'");
   if(scope){
    // All application role writers use this row, including revocations. Lock
    // before authorization; SSI aborts a stale waiter rather than trusting it.
    const r=await c.query('SELECT s.legal_entity_id FROM hft_app_roles.scope_lock s '+
     'JOIN hft.legal_entity e ON e.id=s.legal_entity_id JOIN hft.site t ON t.legal_entity_id=s.legal_entity_id AND t.id=s.site_id '+
     'JOIN hft.warehouse w ON w.legal_entity_id=s.legal_entity_id AND w.warehouse_id=s.warehouse_id AND w.site_id=s.site_id '+
     'WHERE s.legal_entity_id=$1 AND s.site_id=$2 AND s.warehouse_id=$3 AND e.active AND t.active AND w.active FOR UPDATE OF s FOR SHARE OF e,t,w',params(scope));
    if(r.rows.length!==1)deny('ROLE_ACTOR_OR_SCOPE_DENIED');
    await c.query('UPDATE hft_app_roles.scope_lock SET epoch=epoch+1 WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3',params(scope));
   }
   const value=await work(new Transaction(c,scope!==null));commit=true;await c.query('COMMIT');return value;
  }catch(e){discard=true;if(begun&&!commit){try{await c.query('ROLLBACK');}catch{/* connection always discarded */}}
   if(commit)throw new Error('ROLE_COMMIT_OUTCOME_UNKNOWN');throw e;
  }finally{c.release(discard);}
 }
}
