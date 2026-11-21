/** Offline policy, API and SQL-adapter regressions. No PostgreSQL or corporate grants. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_CATALOG,RoleError,assignmentStatus,parseChange,permissionsFor,planChange,requirePermission,rolesAt,roleSet,sameScope,validateAssignment,
 type Assignment,type AuditEvent,type Change,type Employee,type Principal,type RoleId,type Scope} from '../../lib/hft/roles/role-assignment.ts';
import {RoleService,eventDigest,handleRoleApi,type RoleStore,type RoleTransaction,type SessionIdentity} from '../../lib/hft/roles/role-service.ts';
import {PostgresRoleStore,type RoleSqlClient} from '../../lib/hft/roles/role-postgres.ts';
const scope:Scope={legalEntityId:'HFT',siteId:'SITE01',warehouseId:'WH01'};
const now=new Date().toISOString();const later=new Date(Date.parse(now)+3600000).toISOString();
const end=new Date(Date.parse(now)+7200000).toISOString();
const earlier=new Date(Date.parse(now)-3600000).toISOString();
const session:SessionIdentity={subject:'admin-subject',sessionId:'signed-session',expiresAt:Math.floor(Date.now()/1000)+800,
 scope:{legalEntityId:'HFT',siteId:'SITE01',warehouseIds:['WH01']}};
const actor:Principal={...session,employeeId:'ADMIN01',personId:'PERSON01',scopes:[scope]};
const employee:Employee={employeeId:'EMP02',personId:'PERSON02',fullName:'Test employee — offline fixture',active:true,version:1};
const empty=(id='EMP02'):Assignment=>({employeeId:id,scope,revision:0,revokedFrom:null,periods:[]});
const assigned=(roles:RoleId[],id='EMP02'):Assignment=>({...empty(id),revision:1,periods:[{from:earlier,to:null,roles}]});
const owner=assigned(['OWNER_ADMIN'],'ADMIN01');
const raw=(patch:Partial<Change>={}):Change=>({requestId:'00000000-0000-4000-8000-000000000001',action:'ASSIGN',employeeId:'EMP02',employeeVersion:1,
 scope,roles:['VIEWER'],expectedRevision:0,effectiveFrom:now,effectiveTo:null,reason:'Internal role setup',...patch});
const plan=(patch:Partial<Change>={},current=empty(),who=actor,auth=owner,target=employee,owners:Assignment[]=[owner])=>
 planChange(parseChange(raw(patch)),who,target,current,auth,owners,now);
test('nine explicit application roles; no implicit stock permissions for administrators',()=>{
 assert.equal(ROLE_CATALOG.length,9);assert.equal(new Set(ROLE_CATALOG.map(r=>r.id)).size,9);
 assert.deepEqual(permissionsFor(['OWNER_ADMIN']),['audit.read','roles.manage','roles.manage-admin','roles.read']);
 assert.equal(permissionsFor(['VIEWER']).includes('stores.receive'),false);
});
test('compatible multi-role set and incompatible maker/checker or QC sets',()=>{
 assert.deepEqual(roleSet(['PROCUREMENT','VIEWER']),['PROCUREMENT','VIEWER']);
 for(const roles of [['STORES_OPERATOR','STORES_CHECKER'],['STORES_IN_CHARGE','QC_INSPECTOR']])assert.throws(()=>roleSet(roles),/INCOMPATIBLE/);
});
test('strict command denies browser actor, database-role fields and unknown permissions',()=>{
 for(const extra of [{actorSubject:'spoof'},{databaseRole:'postgres'},{approved:true}])assert.throws(()=>parseChange({...raw(),...extra}),/INVALID_FIELDS/);
 assert.throws(()=>parseChange(raw({roles:['postgres'] as unknown as RoleId[]})),/INVALID_ROLES/);
});
test('reject duplicates, malformed IDs, revision, reason and calendar dates',()=>{
 for(const patch of [{roles:['VIEWER','VIEWER']},{expectedRevision:-1},{employeeVersion:0},{reason:'bad'},
  {effectiveFrom:'2026-02-30T00:00:00.000Z'},{requestId:'not-a-uuid'},{scope:{...scope,warehouseId:'*'}}])
  assert.throws(()=>parseChange({...raw(),...patch}));
});
test('self escalation denied by employee AND canonical person including identity aliases',()=>{
 assert.throws(()=>plan({},empty(),actor,owner,{...employee,employeeId:actor.employeeId}),/SELF_CHANGE|ACTIVE_EMPLOYEE/);
 assert.throws(()=>plan({},empty(),actor,owner,{...employee,personId:actor.personId}),/SELF_CHANGE/);
});
test('cross-scope and expired actor denied',()=>{
 assert.throws(()=>plan({scope:{...scope,warehouseId:'WH02'}}),/SCOPE/);
 assert.throws(()=>plan({},empty(),{...actor,expiresAt:0}),/DENIED/);
});
test('inactive or changed employee rejected again inside write transaction',()=>{
 assert.throws(()=>plan({},empty(),actor,owner,{...employee,active:false}),/EMPLOYEE_CHANGED/);
 assert.throws(()=>plan({employeeVersion:2}),/EMPLOYEE_CHANGED/);
});
test('Role Administrator delegates operational roles but not administration',()=>{
 const admin=assigned(['ROLE_ADMINISTRATOR'],'ADMIN01');
 assert.equal(plan({},empty(),actor,admin).after.revision,1);
 assert.throws(()=>plan({roles:['OWNER_ADMIN']},empty(),actor,admin),/DELEGATION/);
 assert.throws(()=>plan({action:'REVOKE',roles:[],expectedRevision:1},assigned(['ROLE_ADMINISTRATOR']),actor,admin),/DELEGATION/);
});
test('viewer cannot manage and non-owner cannot remove administrative assignment',()=>{
 assert.throws(()=>plan({},empty(),actor,assigned(['VIEWER'],'ADMIN01')),/MANAGEMENT/);
});
test('compare-and-swap rejects stale revision and existing ASSIGN',()=>{
 assert.throws(()=>plan({action:'CHANGE'},assigned(['VIEWER'])),/REVISION/);
 assert.throws(()=>plan({expectedRevision:1},assigned(['VIEWER'])),/ALREADY/);
});
test('scheduled replacement preserves old access until boundary then expires without fallback',()=>{
 const a=plan({action:'CHANGE',roles:['STORES_OPERATOR'],expectedRevision:1,effectiveFrom:later,effectiveTo:end},assigned(['VIEWER'])).after;
 assert.deepEqual(rolesAt(a,now),['VIEWER']);assert.deepEqual(rolesAt(a,later),['STORES_OPERATOR']);assert.deepEqual(rolesAt(a,end),[]);
 assert.equal(assignmentStatus(a,end),'EXPIRED');
});
test('revocation cancels ALL future grants, not only active period',()=>{
 const a=plan({action:'CHANGE',roles:['STORES_OPERATOR'],expectedRevision:1,effectiveFrom:later},assigned(['VIEWER'])).after;
 const revoked=plan({action:'REVOKE',roles:[],expectedRevision:2},a).after;
 assert.deepEqual(rolesAt(revoked,end),[]);assert.equal(assignmentStatus(revoked,now),'REVOKED');
});
test('new future assignment reports SCHEDULED not ACTIVE',()=>{
 assert.equal(assignmentStatus(plan({effectiveFrom:later}).after,now),'SCHEDULED');
});
test('no expiry on Owner Admin and no revoke end date resurrection',()=>{
 assert.throws(()=>parseChange(raw({roles:['OWNER_ADMIN'],effectiveTo:end})),/OWNER_EXPIRY/);
 assert.throws(()=>parseChange(raw({action:'REVOKE',roles:[],effectiveTo:end})),/REACTIVATE/);
});
test('last continuing Owner Admin cannot be removed without another continuing owner',()=>{
 const current=assigned(['OWNER_ADMIN']);
 assert.throws(()=>plan({action:'REVOKE',roles:[],expectedRevision:1},current,actor,owner,employee,[]),/LAST_OWNER/);
 assert.equal(plan({action:'REVOKE',roles:[],expectedRevision:1},current).action,'REVOKE');
});
test('history includes original reason, actor, session, request, before and after',()=>{
 const e=plan();assert.equal(e.actorSubject,actor.subject);assert.equal(e.actorPersonId,actor.personId);assert.equal(e.actorSessionId,session.sessionId);
 assert.equal(e.before.revision,0);assert.equal(e.after.revision,1);assert.equal(e.reason,raw().reason);
});
test('overlapping periods and backdated operations rejected',()=>{
 assert.throws(()=>validateAssignment({...assigned(['VIEWER']),periods:[{from:earlier,to:null,roles:['VIEWER']},{from:now,to:null,roles:['VIEWER']}]}),/OVERLAPPING/);
 assert.throws(()=>plan({effectiveFrom:earlier}),/BACKDATING/);
});
test('stock permission requires live authoritative transaction and independent people',()=>{
 const op={...actor,employeeId:'EMP02',personId:'PERSON02'};const state=assigned(['STORES_OPERATOR']);
 assert.throws(()=>requirePermission(op,state,'stores.receive',scope,now),/TRANSACTION_AUTHORITY/);
 const t={makerPersonId:'PERSON02',checkerPersonId:'PERSON03',inspectorPersonId:'PERSON04',approverPersonId:'PERSON05'};
 requirePermission(op,state,'stores.receive',scope,now,t);
 assert.throws(()=>requirePermission(op,state,'stores.receive',scope,now,{...t,approverPersonId:'PERSON02'}),/DUTY_CONFLICT/);
 assert.throws(()=>requirePermission(op,state,'stores.receive',scope,now,{...t,makerPersonId:'OTHER_PERSON'}),/DUTY_CONFLICT/);
});
test('checker and inspector cannot approve own preparation or one another',()=>{
 const p={...actor,employeeId:'EMP02',personId:'PERSON02'};
 const t={makerPersonId:'PERSON02',checkerPersonId:null,inspectorPersonId:null,approverPersonId:null};
 for(const [role,permission] of [['STORES_CHECKER','stores.check'],['QC_INSPECTOR','qc.inspect']] as const)
  assert.throws(()=>requirePermission(p,assigned([role]),permission,scope,now,t),/DUTY_CONFLICT/);
});
class MemoryStore implements RoleStore {
 states=new Map<string,Assignment>([['ADMIN01',owner]]);events=new Map<string,AuditEvent>();reads=0;writes=0;saves=0;
 uncertain=false;readbackFailure=false;target=employee;queue=Promise.resolve();
 tx(states=this.states,events=this.events):RoleTransaction{return {
  principal:async()=>actor,scopes:async()=>[scope],employee:async()=>this.target,search:async()=>[this.target],
  assignment:async(_s,id)=>structuredClone(states.get(id)??empty(id)),owners:async()=>[...states.values()].filter(s=>s.employeeId==='ADMIN01'),
  event:async id=>structuredClone(events.get(id)??null),history:async(s,id,before)=>[...events.values()].filter(e=>sameScope(e.after.scope,s)&&e.after.employeeId===id&&e.after.revision<before).reverse(),
  save:async e=>{this.saves++;states.set(e.after.employeeId,structuredClone(e.after));events.set(e.requestId,structuredClone(e));},
 };}
 async read<T>(work:(t:RoleTransaction)=>Promise<T>):Promise<T>{this.reads++;if(this.readbackFailure&&this.saves)throw Error('readback lost');return work(this.tx());}
 async write<T>(_s:Scope,work:(t:RoleTransaction)=>Promise<T>):Promise<T>{
  let release=()=>{};const turn=new Promise<void>(r=>{release=r;});const prior=this.queue;this.queue=turn;await prior;this.writes++;
  try{const states=structuredClone(this.states),events=structuredClone(this.events);const value=await work(this.tx(states,events));
   this.states=states;this.events=events;if(this.uncertain)throw Error('COMMIT reply lost');return value;}finally{release();}
 }
}
const service=(s:MemoryStore)=>new RoleService(s,session,()=>now);
test('server ASSIGN actually saves and independently reads before success',async()=>{
 const s=new MemoryStore();const r=await service(s).execute(raw()) as {state:string;assignment:Assignment};
 assert.equal(r.state,'SAVED_VERIFIED');assert.equal(s.saves,1);assert.equal(s.reads,1);assert.equal(r.assignment.revision,1);
});
test('same request is idempotent and altered request ID reuse denied',async()=>{
 const s=new MemoryStore();await service(s).execute(raw());await service(s).execute(raw());assert.equal(s.saves,1);
 await assert.rejects(service(s).execute(raw({roles:['STORES_OPERATOR']})),/REQUEST_ID_REUSED/);
});
test('lost COMMIT never returns ASSIGNED; reconcile uses original request without write',async()=>{
 const s=new MemoryStore();s.uncertain=true;
 assert.equal((await service(s).execute(raw()) as {state:string}).state,'UNCONFIRMED');s.uncertain=false;
 const r=await service(s).execute({action:'RECONCILE',scope,requestId:raw().requestId}) as {state:string};
 assert.equal(r.state,'SAVED_VERIFIED');assert.equal(s.writes,1);assert.equal(s.saves,1);
});
test('failed independent readback never returns successful assignment',async()=>{
 const s=new MemoryStore();s.readbackFailure=true;
 assert.equal((await service(s).execute(raw()) as {state:string}).state,'UNCONFIRMED');assert.equal(s.saves,1);
});
test('readback must match actual persisted snapshot, not just a write receipt',async()=>{
 const s=new MemoryStore();const originalRead=s.read.bind(s);
 s.read=async work=>{s.states.set('EMP02',{...assigned(['PROCUREMENT'])});return originalRead(work);};
 assert.equal((await service(s).execute(raw()) as {state:string}).state,'UNCONFIRMED');
});
test('concurrent stale assignment updates cannot both succeed (offline serialized model)',async()=>{
 const s=new MemoryStore();const results=await Promise.allSettled([service(s).execute(raw()),service(s).execute(raw({requestId:'00000000-0000-4000-8000-000000000002'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.saves,1);
});
test('role revocation applies on next API call; no token-role cache fallback',async()=>{
 const s=new MemoryStore();s.states.set('ADMIN01',assigned(['VIEWER'],'ADMIN01'));
 await assert.rejects(service(s).execute(raw()),/PERMISSION_DENIED/);assert.equal(s.saves,0);
});
test('application permission check and operation share same locked transaction',async()=>{
 const s=new MemoryStore();let called=false;
 await service(s).withApiPermission(scope,'roles.manage',async()=>undefined,async()=>{called=true;});assert.equal(called,true);assert.equal(s.writes,1);
});
test('BOOTSTRAP, active search and assignment/history read use server sources',async()=>{
 const s=new MemoryStore();assert.equal((await service(s).execute({action:'BOOTSTRAP'}) as {state:string}).state,'CONNECTED');
 assert.equal((await service(s).execute({action:'SEARCH',scope,query:'test'}) as {state:string}).state,'RESULTS');
 await service(s).execute(raw());const v=await service(s).execute({action:'VIEW',scope,employeeId:'EMP02',beforeRevision:Number.MAX_SAFE_INTEGER}) as {history:AuditEvent[]};assert.equal(v.history.length,1);
});
test('hash is canonical across JSONB key order and detects actor or history mutation',()=>{
 const e=plan();assert.equal(eventDigest(e),eventDigest(Object.fromEntries(Object.entries(e).reverse())));
 assert.notEqual(eventDigest(e),eventDigest({...e,actorSubject:'spoof'}));
});
test('API rejects method/content-type and never calls backend for unauthenticated request',async()=>{
 let calls=0;const deps={authenticate:async()=>{throw Error('unsigned');},store:()=>{calls++;return new MemoryStore();}};
 assert.equal((await handleRoleApi(new Request('https://hft.test'),deps)).status,405);
 assert.equal((await handleRoleApi(new Request('https://hft.test',{method:'POST',body:'{}'}),deps)).status,415);
 assert.equal((await handleRoleApi(new Request('https://hft.test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),deps)).status,503);assert.equal(calls,0);
});
test('unadmitted backend returns 503, not preview assignments',async()=>{
 const r=await handleRoleApi(new Request('https://hft.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'BOOTSTRAP'})}),
  {authenticate:async()=>session,store:()=>{throw new RoleError('ROLE_BACKEND_NOT_ADMITTED');}});
 assert.equal(r.status,503);assert.equal((await r.json()).state,'UNAVAILABLE');
});
test('API bounds streamed body even without Content-Length',async()=>{
 const r=await handleRoleApi(new Request('https://hft.test',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(17000)}),
  {authenticate:async()=>session,store:()=>new MemoryStore()});assert.equal(r.status,413);
});
test('SQL adapter checks admitted connection, increments scope epoch before callback, then commits',async()=>{
 const sql:string[]=[];let admitted=false;let released=false;
 const client={query:async(s:string)=>{sql.push(s);return {rows:[{}],rowCount:1};},release:()=>{released=true;}} as RoleSqlClient;
 const pg=new PostgresRoleStore({connect:async()=>client},async()=>{admitted=true;});
 await pg.write(scope,async()=>{assert.equal(admitted,true);assert.match(sql.at(-1)!,/SET epoch=epoch\+1/);return 1;});
 assert.equal(sql.at(-1),'COMMIT');assert.equal(released,true);
});
test('SQL adapter fresh read is genuine READ ONLY and does not lock or mutate',async()=>{
 const sql:string[]=[];let connections=0;
 const pg=new PostgresRoleStore({connect:async()=>{connections++;return {query:async(s:string)=>{sql.push(s);return {rows:[]};},release:()=>{}} as RoleSqlClient;}},async()=>{});
 await pg.read(async()=>1);await pg.read(async()=>2);assert.equal(connections,2);
 assert.equal(sql.filter(s=>s==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,2);assert.equal(sql.some(s=>/FOR UPDATE|UPDATE hft/.test(s)),false);
});
test('SQL callback failure rolls back, COMMIT loss discards and never retries',async()=>{
 for(const commitLoss of [false,true]){const sql:string[]=[];let destroyed=false;
  const c={query:async(s:string)=>{sql.push(s);if(s==='COMMIT'&&commitLoss)throw Error('lost');return {rows:[{}],rowCount:1};},release:(d?:boolean)=>{destroyed=!!d;}} as RoleSqlClient;
  const pg=new PostgresRoleStore({connect:async()=>c},async()=>{});
  await assert.rejects(pg.write(scope,async()=>{if(!commitLoss)throw Error('callback');}));
  assert.equal(destroyed,true);assert.equal(sql.includes('ROLLBACK'),!commitLoss);
 }
});
