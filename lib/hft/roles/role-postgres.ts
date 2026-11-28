import {ROLE_FENCE_KEYS} from './role-enforcement.ts';
/** Source implementation for an admitted backend; not installed or opened by the route.
 * An installation supplies a dedicated pool and same-connection identity/ACL admission.
 * Never share stock-owner, issuer or superuser credentials with this service.
 */
import {deny,scopeFrom,sameScope,validateAssignment,type Assignment,type AuditEvent,type Employee,type Principal,type Scope} from './role-assignment.ts';
import {eventDigest,type RoleStore,type RoleTransaction,type SessionIdentity} from './role-service.ts';
export interface RoleSqlClient {
 readonly connection?: {stream?:unknown};
 query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[];rowCount?:number|null}>;
 release(destroy?:boolean):void;
}
export interface RoleSqlPool {connect():Promise<RoleSqlClient>;}
export type RoleConnectionAdmission=(client:RoleSqlClient)=>Promise<unknown>;
const params=(s:Scope)=>[s.legalEntityId,s.siteId,s.warehouseId];
class Transaction implements RoleTransaction {
 constructor(client:RoleSqlClient,writing:boolean){this.client=client;this.writing=writing;}
 private readonly client:RoleSqlClient;private readonly writing:boolean;
 async principal(session:SessionIdentity):Promise<Principal>{
  const r=await this.client.query<{employee_id:string;person_id:string}>(
   'SELECT b.employee_id,b.person_id FROM hft_app_roles.identity_binding b JOIN hft.employee e '+
   'ON e.legal_entity_id=b.legal_entity_id AND e.employee_id=b.employee_id '+
   'WHERE b.subject=$1 AND b.legal_entity_id=$2 AND e.site_id=$3 AND b.active AND e.active',
   [session.subject,session.scope.legalEntityId,session.scope.siteId]);
  if(r.rows.length!==1||session.expiresAt*1000<=Date.now())deny('ROLE_ACTOR_OR_SCOPE_DENIED');
  if((session.canonicalEmployeeId!==undefined||session.canonicalPersonId!==undefined)&&
   (r.rows[0].employee_id!==session.canonicalEmployeeId||r.rows[0].person_id!==session.canonicalPersonId))
   deny('ROLE_CANONICAL_IDENTITY_CHANGED_DENIED');
  if(session.employeeLoginVersion!==undefined||session.employeeRecordVersion!==undefined){
   if(!Number.isSafeInteger(session.employeeLoginVersion)||!Number.isSafeInteger(session.employeeRecordVersion)||!session.canonicalEmployeeId||!session.canonicalPersonId)deny('ROLE_CANONICAL_IDENTITY_CHANGED_DENIED');
   try{
    const current=await this.client.query<{valid:boolean}>('SELECT hft_employee_login.employee_session_assert_v1($1,$2,$3,$4,$5::bigint,$6::bigint,$7) AS valid',[session.scope.legalEntityId,session.canonicalEmployeeId,session.subject,session.canonicalPersonId,session.employeeLoginVersion,session.employeeRecordVersion,session.scope.siteId]);
    if(current.rows.length!==1||current.rows[0].valid!==true)deny('ROLE_CANONICAL_IDENTITY_CHANGED_DENIED');
   }catch(e){if((e as {code?:string}).code==='42501')deny('ROLE_CANONICAL_IDENTITY_CHANGED_DENIED');throw e;}
  }
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
   'WHERE e.legal_entity_id=$1 AND e.site_id=$2 AND e.employee_id=$3 AND b.active',
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
 constructor(pool:RoleSqlPool,admit:RoleConnectionAdmission,employeeIdentityFence=false){this.pool=pool;this.admit=admit;this.employeeIdentityFence=employeeIdentityFence;}
 private readonly pool:RoleSqlPool;private readonly admit:RoleConnectionAdmission;private readonly employeeIdentityFence:boolean;
 read<T>(work:(tx:RoleTransaction)=>Promise<T>):Promise<T>{return this.run(null,work);}
 write<T>(scope:Scope,work:(tx:RoleTransaction)=>Promise<T>):Promise<T>{return this.run(scope,work);}
 private async run<T>(scope:Scope|null,work:(tx:RoleTransaction)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();let commit=false,discard=false,begun=false,sessionFence=false;let fencePid:number|undefined;
  try{
   await this.admit(c);
   if(scope){
    // Must precede BEGIN: a blocking transaction-lock SELECT would acquire an
    // MVCC snapshot BEFORE its wait. SELECT-only dependencies need no row lock.
    await c.query("SET lock_timeout='2500ms'");
    await c.query("SET statement_timeout='10000ms'");
    const acquired=await c.query<{pid:number}>(
     'SELECT pg_catalog.pg_advisory_lock($1::integer,$2::integer),pg_catalog.pg_backend_pid() AS pid',[...ROLE_FENCE_KEYS]);
    sessionFence=true;
    fencePid=acquired.rows[0]?.pid;
    if(acquired.rows.length!==1||!Number.isSafeInteger(fencePid))deny('ROLE_SESSION_FENCE_IDENTITY_DENIED');
   }else if(this.employeeIdentityFence){
    // HF101 reads must not pin an old repeatable-read snapshot while waiting
    // for deactivation, an email edit or assignment revocation to commit.
    await c.query("SET lock_timeout='2500ms'");
    await c.query("SET statement_timeout='10000ms'");
    const acquired=await c.query<{pid:number}>('SELECT pg_catalog.pg_advisory_lock_shared($1::integer,$2::integer),pg_catalog.pg_backend_pid() AS pid',[...ROLE_FENCE_KEYS]);
    sessionFence=true;fencePid=acquired.rows[0]?.pid;
    if(acquired.rows.length!==1||!Number.isSafeInteger(fencePid))deny('ROLE_SESSION_FENCE_IDENTITY_DENIED');
   }
   begun=true;
   await c.query(scope?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await c.query("SET LOCAL statement_timeout='10000ms'");await c.query("SET LOCAL lock_timeout='2500ms'");
   if(scope){
    // Transaction-pooling or a reset must not discard the pre-snapshot lock.
    // Verify same backend PID AND actual granted lock before any policy read.
    const held=await c.query<{pid:number;held:boolean}>(`SELECT pg_catalog.pg_backend_pid() AS pid,
     EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory'
      AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())
      AND pid=pg_backend_pid() AND classid=$1::oid AND objid=$2::oid AND objsubid=2
      AND mode='ExclusiveLock' AND granted) AS held`,[...ROLE_FENCE_KEYS]);
    if(held.rows.length!==1||held.rows[0].pid!==fencePid||held.rows[0].held!==true)
     deny('ROLE_SESSION_FENCE_AFFINITY_DENIED');
    // Reattest under the dependency fence, then lock only our writable epoch.
    await this.admit(c);
    const r=await c.query('SELECT s.legal_entity_id FROM hft_app_roles.scope_lock s '+
     'JOIN hft.legal_entity e ON e.id=s.legal_entity_id JOIN hft.site t ON t.legal_entity_id=s.legal_entity_id AND t.id=s.site_id '+
     'JOIN hft.warehouse w ON w.legal_entity_id=s.legal_entity_id AND w.warehouse_id=s.warehouse_id AND w.site_id=s.site_id '+
     'WHERE s.legal_entity_id=$1 AND s.site_id=$2 AND s.warehouse_id=$3 AND e.active AND t.active AND w.active FOR UPDATE OF s',params(scope));
    if(r.rows.length!==1)deny('ROLE_ACTOR_OR_SCOPE_DENIED');
    await c.query('UPDATE hft_app_roles.scope_lock SET epoch=epoch+1 WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3',params(scope));
   }else if(this.employeeIdentityFence){
    const held=await c.query<{pid:number;held:boolean}>(`SELECT pg_catalog.pg_backend_pid() AS pid,
     EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory'
      AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())
      AND pid=pg_backend_pid() AND classid=$1::oid AND objid=$2::oid AND objsubid=2
      AND mode='ShareLock' AND granted) AS held`,[...ROLE_FENCE_KEYS]);
    if(held.rows.length!==1||held.rows[0].pid!==fencePid||held.rows[0].held!==true)deny('ROLE_SESSION_FENCE_AFFINITY_DENIED');
    await this.admit(c);
   }
   const value=await work(new Transaction(c,scope!==null));commit=true;await c.query('COMMIT');
   if(sessionFence){
    const unlocked=await c.query<{released:boolean}>(
     scope?'SELECT pg_catalog.pg_advisory_unlock($1::integer,$2::integer) AS released':'SELECT pg_catalog.pg_advisory_unlock_shared($1::integer,$2::integer) AS released',[...ROLE_FENCE_KEYS]);
    if(unlocked.rows.length!==1||unlocked.rows[0].released!==true)throw Error('ROLE_FENCE_RELEASE_UNVERIFIED_NO_RETRY');
    sessionFence=false;
   }
   return value;
  }catch(e){discard=true;if(begun&&!commit){try{await c.query('ROLLBACK');}catch{/* connection always discarded */}}
   if(commit)throw new Error('ROLE_COMMIT_OUTCOME_UNKNOWN');throw e;
  }finally{
   // Write connections are never returned for reuse: session settings and any
   // lost lock/BEGIN/COMMIT response cannot leak into another request. Closing
   // the connection releases an uncertain session lock, including error paths.
   c.release(discard||scope!==null||this.employeeIdentityFence||sessionFence);
  }
 }
}
