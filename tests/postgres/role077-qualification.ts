/** Real PostgreSQL campaign. NEVER runs from source-only CI.
 * Usage: node --experimental-strip-types tests/postgres/role077-qualification.ts --run
 * --describe performs no connections. No installer, enrollment or seed action.
 * Requires a separately approved fixture installation + signed admission.
 */
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,randomUUID,sign} from 'node:crypto';
import {lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {assertRoleQualificationProfile,QUAL077_BINDING_BODY,QUAL077_BINDING_SQL}
 from '../../lib/hft/roles/role-isolated-profile.ts';
import {rolePoolOptions,assertRoleConnection,ROLE_BACKEND_CATALOG_SQL}
 from '../../lib/hft/roles/role-backend.ts';
import {ROLE_FENCE_KEYS} from '../../lib/hft/roles/role-enforcement.ts';
import {assertOnlinePgBackendTls,onlinePgPoolOptions}
 from '../../lib/hft/persistence/online-pg-transport.ts';
import {withProtectedPostingTransaction,withProtectedReadbackTransaction}
 from '../../lib/hft/persistence/protected-posting-transaction.ts';
import {resolveVerifiedRequestOperator} from '../../lib/hft/security/verified-request.ts';
import {requireApiBusinessRole} from '../../lib/hft/roles/role-api-permission.ts';
import {eventDigest} from '../../lib/hft/roles/role-service.ts';
import {validateP0Operation,type P0In} from '../../lib/hft/stores/p0-operations.ts';
import {validateStoresQuery,issueStoresReadProof} from '../../lib/hft/stores/p0-readback.ts';
import {POST as receive} from '../../app/api/hft/stores/receive/route.ts';
import {POST as read} from '../../app/api/hft/stores/read/route.ts';
import {POST as roles} from '../../app/api/hft/settings/roles/route.ts';
import {observeRealPg,barrier,type Observation} from './role077-observer.ts';
import type {Assignment,Change,RoleId,Scope} from '../../lib/hft/roles/role-assignment.ts';
import type {PgQueryClient,PgPool} from '../../lib/hft/persistence/isolated-pg-transaction.ts';

const pg=createRequire(import.meta.url)('pg') as typeof import('pg');
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const root=fileURLToPath(new URL('../../',import.meta.url));
const cases=['privilege-original-42501','A-persistence-reopen-receive-read','B-revocation-first',
 'C-operation-first','D-dependency-ordering-and-stale-writes','E-binding-session-proof-denials',
 'installed-audit-enforcement','installed-trigger-negatives'];
type Person={subject:string;employeeId:string;personId:string;sessionId:string;sessionExpiresAt:number};
type Fixture={version:'HFT_ROLE077_FIXTURES_V1';fixtureOnly:true;scope:Scope;
 admin:Person;operator:Person;target:Person;
 receives:{A:P0In;B:P0In;C:P0In};readQuery:ReturnType<typeof validateStoresQuery>};
type Result={case:string;status:'PASS'|'FAIL'|'NOT TESTED';detail:unknown};
function secureFile(path:string|undefined,secret=false):Buffer{
 assert.ok(path&&isAbsolute(path),'ABSOLUTE_SECURE_FILE_REQUIRED');
 const s=lstatSync(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size<262144);
 assert.equal(s.mode&(secret?0o077:0o022),0,'INSECURE_FILE_MODE');return readFileSync(path);
}
async function within<T>(work:Promise<T>,name:string,ms=1800):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_r,reject)=>{timer=setTimeout(()=>reject(Error('BARRIER_TIMEOUT_'+name)),ms);})]);}
 finally{clearTimeout(timer);}
}
async function main(){
 if(process.argv.includes('--describe')){
  console.log(JSON.stringify({execution:'NONE',cases,requires:'signed target admission, preinstalled fixture package, separated restricted credentials and synthetic enrolled sessions',
   publicHttp:'CLOSED; invokes actual exported POST handlers without doubles',installation:'NOT PERFORMED'},null,2));return;
 }
 assert.ok(process.argv.includes('--run'),'EXPLICIT_RUN_REQUIRED');
 const env=process.env,results:Result[]=cases.map(c=>({case:c,status:'NOT TESTED',detail:'campaign not reached'}));
 const report={assignment:'HF16-077-ROLE-ISOLATED-RUNTIME-BINDING',startedAt:new Date().toISOString(),
  execution:'NOT STARTED',engine:'REAL_POSTGRESQL_ONLY',source:{} as Record<string,unknown>,environment:{} as Record<string,unknown>,
  results,observations:[] as Observation[],preflight:'NOT TESTED',error:''};
 let rolePool:InstanceType<typeof pg.Pool>|undefined,stockPool:InstanceType<typeof pg.Pool>|undefined;
 let executor:InstanceType<typeof pg.Client>|undefined,monitor:InstanceType<typeof pg.Client>|undefined,observer:ReturnType<typeof observeRealPg>|undefined;
 try{
  const admission=assertRoleQualificationProfile(env);
  const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),admission.source.commit,'CHECKOUT_COMMIT_MISMATCH');
  assert.equal(git('rev-parse','HEAD^{tree}'),admission.source.tree,'CHECKOUT_TREE_MISMATCH');
  assert.equal(git('status','--porcelain','--untracked-files=normal'),'','CLEAN_CHECKOUT_REQUIRED');
  assert.equal(hash(readFileSync(new URL('../../db/security/HFT-R1-ROLE077-FIXTURE-CONTROLS-NONEXECUTABLE.sql',import.meta.url))),
   admission.installer.fixtureHelpers,'FIXTURE_HELPER_SOURCE_PIN_MISMATCH');
  const fixtureText=secureFile(env.HFT_QUAL077_FIXTURE_FILE).toString('utf8');
  assert.equal(hash(fixtureText),admission.fixtureSha256,'FIXTURE_SOURCE_IDENTITY_MISMATCH');
  const f=JSON.parse(fixtureText) as Fixture;
  assert.equal(f.version,'HFT_ROLE077_FIXTURES_V1');assert.equal(f.fixtureOnly,true);
  for(const p of [f.admin,f.operator,f.target]){
   assert.ok([p.subject,p.employeeId,p.personId,p.sessionId,...Object.values(f.scope)].every(x=>typeof x==='string'&&x.startsWith('QUAL077-')));
   assert.ok(Number.isInteger(p.sessionExpiresAt)&&p.sessionExpiresAt>Math.floor(Date.now()/1000)+120,'PRE_ENROLLED_SESSION_EXPIRY_REQUIRED');
  }
  assert.equal(new Set([f.admin.personId,f.operator.personId,f.target.personId]).size,3);
  for(const op of Object.values(f.receives)){
   assert.equal(validateP0Operation(op).kind,'IN');assert.deepEqual(
    {legalEntityId:op.legalEntityId,siteId:op.siteId,warehouseId:op.warehouseId},f.scope);
  }
  assert.equal(new Set(Object.values(f.receives).map(o=>o.requestId)).size,3);
  validateStoresQuery(f.readQuery);
  assert.deepEqual({legalEntityId:f.readQuery.legalEntityId,siteId:f.readQuery.siteId,warehouseId:f.readQuery.warehouseId},f.scope);
  const sessionKey=createPrivateKey(secureFile(env.HFT_QUAL077_SESSION_PRIVATE_KEY_FILE,true));
  assert.equal(sessionKey.asymmetricKeyType,'ed25519');
  assert.equal(hash(createPublicKey(sessionKey).export({type:'spki',format:'pem'}).toString()),admission.session.publicKeySha256);
  const makeRequest=(kind:'receive'|'read'|'roles',body:unknown,p:Person=f.operator)=>{
   const now=Math.floor(Date.now()/1000),part=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const a=part({alg:'EdDSA',typ:'JWT',kid:'hft-r1'}),b=part({iss:admission.session.issuer,aud:admission.session.audience,
    sub:p.subject,jti:p.sessionId,iat:now-1,exp:Math.min(now+600,p.sessionExpiresAt),
    legalEntityId:f.scope.legalEntityId,siteId:f.scope.siteId,warehouseIds:[f.scope.warehouseId]});
   const token=a+'.'+b+'.'+sign(null,Buffer.from(a+'.'+b),sessionKey).toString('base64url');
   const path=kind==='roles'?'/api/hft/settings/roles':'/api/hft/stores/'+kind;
   return new Request(env.HFT_PUBLIC_ORIGIN+path,{method:'POST',headers:{'content-type':'application/json',
    origin:env.HFT_PUBLIC_ORIGIN!,'sec-fetch-site':'same-origin',cookie:'__Host-hft_session='+token},body:JSON.stringify(body)});
  };
  rolePool=new pg.Pool(rolePoolOptions(env));stockPool=new pg.Pool(onlinePgPoolOptions(env,'P2_STORES'));
  const rp=rolePool,sp=stockPool;
  const opts=rolePoolOptions(env);
  executor=new pg.Client({...opts,user:admission.logins.fixtureExecutor,
   password:secureFile(env.HFT_QUAL077_EXECUTOR_PASSWORD_FILE,true).toString('utf8').trim(),
   application_name:'hft-role077-fixture-controls',statement_timeout:15000,lock_timeout:2500});
  await executor.connect();const ex=executor;
  monitor=new pg.Client({...opts,user:admission.logins.fixtureExecutor,
   password:secureFile(env.HFT_QUAL077_EXECUTOR_PASSWORD_FILE,true).toString('utf8').trim(),
   application_name:'hft-role077-lock-observer',statement_timeout:5000});
  await monitor.connect();const mon=monitor;await assertOnlinePgBackendTls(mon as unknown as PgQueryClient);
  const wire=(c:unknown)=>c as PgQueryClient;
  await assertOnlinePgBackendTls(wire(ex));
  const identity=await ex.query(`SELECT pg_backend_pid() AS pid,current_database() AS db,session_user AS login,current_user AS role,
   current_setting('server_version_num') AS version,pg_catalog.host(inet_server_addr()) AS address,inet_server_port() AS port,
   (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS oid,
   (SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolreplication FROM pg_roles WHERE rolname=current_user) AS restricted,
   NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('hft','hft_secret','hft_app_roles','hft_qual077') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS nonowner`);
  const id=identity.rows[0];assert.equal(id.db,admission.target.database);assert.equal(id.oid,admission.target.databaseOid);
  assert.equal(id.login,admission.logins.fixtureExecutor);assert.equal(id.role,id.login);assert.equal(id.restricted,true);assert.equal(id.nonowner,true);
  assert.equal(id.version,admission.target.pgVersion);assert.equal(id.port,Number(admission.target.backendPort));
  const monitorIdentity=await mon.query('SELECT current_database() AS db,session_user AS login,pg_catalog.host(inet_server_addr()) AS address,inet_server_port() AS port');
  assert.deepEqual(monitorIdentity.rows[0],{db:id.db,login:id.login,address:id.address,port:id.port});
  const binding=await ex.query(QUAL077_BINDING_SQL,[QUAL077_BINDING_BODY]);
  assert.equal(binding.rows.length,1);assert.equal(binding.rows[0].immutable,true);assert.equal(binding.rows[0].singular,true);
  assert.equal(binding.rows[0].admission_sha256,env.HFT_QUAL077_ADMISSION_SHA256);
  assert.equal(eventDigest(binding.rows[0].payload),eventDigest(admission));
  // Executor may call exactly the fixture helpers; runtime users may not.
  const helperSql=readFileSync(new URL('../../db/security/HFT-R1-ROLE077-FIXTURE-CONTROLS-NONEXECUTABLE.sql',import.meta.url),'utf8');
  const helpers=await ex.query(`SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,p.provolatile,p.proparallel,p.pronargs,
   p.prorettype='jsonb'::regtype AS returns_json,l.lanname,
   r.rolname,NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AS owner_secure,
   pg_has_role(current_user,r.oid,'MEMBER') AS membership,
   has_function_privilege(current_user,p.oid,'EXECUTE') AS executor_execute,
   has_function_privilege($1,p.oid,'EXECUTE') OR has_function_privilege($2,p.oid,'EXECUTE') AS runtime_execute,
   CASE WHEN p.proname='role_fixture_control_v1' THEN p.proowner=(SELECT relowner FROM pg_class WHERE oid='hft_app_roles.assignment'::regclass)
    ELSE p.proowner=(SELECT relowner FROM pg_class WHERE oid='hft.employee'::regclass) END AS expected_owner
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
   WHERE n.nspname='hft_qual077' AND p.proname IN('role_fixture_control_v1','master_fixture_control_v1')`,[admission.logins.role,admission.logins.stock]);
  assert.equal(helpers.rows.length,2);
  for(const h of helpers.rows){
   const tag=h.proname==='role_fixture_control_v1'?'role_fixture':'master_fixture';
   assert.equal(h.prosrc,helperSql.split('$'+tag+'$')[1]);assert.equal(h.prosecdef,true);assert.equal(h.owner_secure,true);
   assert.equal(h.expected_owner,true);assert.equal(h.membership,false);assert.equal(h.executor_execute,true);assert.equal(h.runtime_execute,false);
   assert.deepEqual(h.proconfig,['search_path=pg_catalog, pg_temp']);assert.equal(h.lanname,'plpgsql');assert.equal(h.pronargs,2);
   assert.equal(h.provolatile,'v');assert.equal(h.proparallel,'u');assert.equal(h.returns_json,true);
  }
  const executorWrites=await ex.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN('hft','hft_secret','hft_app_roles','hft_qual077') AND c.relkind IN('r','p')
    AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR EXISTS(SELECT 1 FROM pg_attribute x WHERE x.attrelid=c.oid AND x.attnum>0 AND NOT x.attisdropped
      AND has_column_privilege(current_user,c.oid,x.attnum,'INSERT,UPDATE,REFERENCES')))`);
  assert.equal(executorWrites.rows[0].n,0,'FIXTURE_EXECUTOR_MUST_NOT_HAVE_DIRECT_DML');
  const extra=await ex.query(`SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN('hft','hft_secret','hft_app_roles','hft_qual077')
   AND has_schema_privilege(current_user,oid,'CREATE')) AS schema_create,
   EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('hft','hft_secret','hft_app_roles','hft_qual077')
     AND NOT (n.nspname='hft_qual077' AND p.proname IN('role_fixture_control_v1','master_fixture_control_v1') AND p.pronargs=2)
     AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS unexpected_execute`);
  assert.deepEqual(extra.rows[0],{schema_create:false,unexpected_execute:false});
  const checked=await rp.connect();try{await assertRoleConnection(checked,env);}finally{checked.release(true);}
  await withProtectedReadbackTransaction(sp as unknown as PgPool,env,async()=>{throw Error('MISSING_BINDING_MUST_PREVENT_CALLBACK');})
   .then(()=>assert.fail('missing role binding admitted'),err=>assert.match(String(err),/ROLE_OPERATION_FENCE_NOT_ADMITTED/));
  assert.equal((await ex.query('SELECT pg_try_advisory_lock($1,$2) AS acquired',[ROLE_FENCE_KEYS[0],78])).rows[0].acquired,true,'ANOTHER_FIXTURE_CAMPAIGN_RUNNING');
  report.preflight='PASS';report.execution='REAL_POSTGRESQL_STARTED';report.source={...admission.source,fixtureSha256:admission.fixtureSha256,admissionSha256:env.HFT_QUAL077_ADMISSION_SHA256};
  report.environment={...admission.target,executor:admission.executor,authorityRef:admission.authorityRef,connection:id};
  observer=observeRealPg();const obs=observer;
  const fixtures=(action:string)=>ex.query(`SELECT hft_qual077.${/^(actor|employee|entity|site|warehouse)-/.test(action)?'master':'role'}_fixture_control_v1($1,$2)`,[action,fixtureText]);
  const observeCounts=async()=>{
   const r=await ex.query('SELECT (SELECT count(*)::int FROM hft.stock_entry) AS entries,(SELECT count(*)::int FROM hft.stock_command) AS commands');return r.rows[0];
  };
  const eventFor=async(requestId:string)=>{
   const r=await rp.query('SELECT event,event_sha256 FROM hft_app_roles.assignment_event WHERE request_id=$1',[requestId]);
   if(r.rows.length)assert.equal(eventDigest(r.rows[0].event),r.rows[0].event_sha256);return r.rows[0];
  };
  const view=async(p:Person)=>{
   const r=await roles(makeRequest('roles',{action:'VIEW',scope:f.scope,employeeId:p.employeeId,beforeRevision:Number.MAX_SAFE_INTEGER},f.admin));
   assert.equal(r.status,200,'ROLE_VIEW_FAILED');const v=await r.json();assert.equal(v.state,'READ_VERIFIED');return v as {employee:{version:number};assignment:Assignment};
  };
  const command=async(p:Person,grants:RoleId[]|null):Promise<Change>=>{
   const v=await view(p),now=new Date().toISOString();
   const future=v.assignment.periods.some(x=>x.to===null||x.to>now);
   return {requestId:randomUUID(),action:grants===null?'REVOKE':future?'CHANGE':'ASSIGN',employeeId:p.employeeId,
    employeeVersion:v.employee.version,scope:f.scope,roles:grants??[],expectedRevision:v.assignment.revision,
    effectiveFrom:now,effectiveTo:null,reason:'QUAL077 isolated synthetic regression only'};
  };
  const change=async(p:Person,grants:RoleId[]|null)=>{
   const cmd=await command(p,grants),r=await roles(makeRequest('roles',cmd,f.admin));
   assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.state,'SAVED_VERIFIED');
   const event=await eventFor(cmd.requestId);assert.ok(event);assert.equal(saved.auditDigest,event.event_sha256);
   return {cmd,saved};
  };
  const grant=()=>change(f.operator,['STORES_OPERATOR']);
  const revoke=()=>change(f.operator,null);
  const runCase=async(name:string,work:()=>Promise<unknown>)=>{
   const item=results.find(r=>r.case===name)!;
   try{item.detail=await work();item.status='PASS';console.log(JSON.stringify(item));}
   catch(e){item.status='FAIL';item.detail={code:e instanceof Error?e.name:'error',message:e instanceof Error?e.message:String(e)};throw e;}
   finally{obs.hook=null;}
  };
  const waitForFenceWaiter=async(expectedPid?:number,pidContext?:string)=>{
   const deadline=Date.now()+1700;
   while(Date.now()<deadline){
    const r=await mon.query(`SELECT pid,mode,granted FROM pg_locks WHERE locktype='advisory' AND database=$1::oid
     AND classid=$2::oid AND objid=$3::oid AND objsubid=2 AND NOT granted`,[admission.target.databaseOid,...ROLE_FENCE_KEYS]);
    const knownPid=expectedPid??obs.query.find(e=>e.context===pidContext&&e.phase==='before'&&e.label==='ROLE_SESSION_FENCE')?.pid;
    if(knownPid&&r.rows.some(x=>x.mode==='ExclusiveLock'&&x.pid===knownPid))return r.rows;
    await delay(10); // polling, never the assertion/evidence of ordering
   }
   throw Error('EXPECTED_POSTGRES_FENCE_WAITER_NOT_OBSERVED');
  };
  await runCase('privilege-original-42501',async()=>{
   const evidence=[];
   for(const table of ['hft.employee','hft.legal_entity','hft.site','hft.warehouse','hft_app_roles.identity_binding']){
    const c=await rp.connect();try{
     const privileges=await c.query(`SELECT has_table_privilege(current_user,$1,'UPDATE') AS table_update,
      EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped
       AND has_column_privilege(current_user,attrelid,attnum,'UPDATE')) AS column_update`,[table]);
     assert.deepEqual(privileges.rows[0],{table_update:false,column_update:false});
     await c.query('BEGIN');
     await assert.rejects(c.query('SELECT * FROM '+table+' FOR SHARE'),(e:unknown)=>
      typeof e==='object'&&e!==null&&'code' in e&&e.code==='42501');
     await c.query('ROLLBACK');evidence.push({table,...privileges.rows[0],originalSqlState:'42501'});
    }finally{c.release(true);}
   }
   const c=await rp.connect();try{
    await c.query('BEGIN');
    await assert.rejects(c.query(`SELECT s.* FROM hft_app_roles.scope_lock s
     JOIN hft.legal_entity e ON e.id=s.legal_entity_id JOIN hft.site t ON t.legal_entity_id=s.legal_entity_id AND t.id=s.site_id
     JOIN hft.warehouse w ON w.legal_entity_id=s.legal_entity_id AND w.warehouse_id=s.warehouse_id
     FOR UPDATE OF s FOR SHARE OF e,t,w`),(e:unknown)=>typeof e==='object'&&e!==null&&'code' in e&&e.code==='42501');
    await c.query('ROLLBACK');evidence.push({originalScopeSqlState:'42501'});
   }finally{c.release(true);}
   return evidence;
  });
  await runCase('A-persistence-reopen-receive-read',async()=>{
   const saved=await change(f.target,['VIEWER']);
   const reopened=await view(f.target);assert.deepEqual(reopened.assignment,saved.saved.assignment);
   await grant();const before=await observeCounts();
   const rr=await obs.run('A-receive',()=>receive(makeRequest('receive',f.receives.A)));
   assert.equal(rr.status,200);const result=await rr.json();assert.equal(result.state,'POSTED_VERIFIED');assert.equal(result.movementCount,2);
   const after=await observeCounts();assert.equal(after.entries-before.entries,2);assert.equal(after.commands-before.commands,1);
   const rb=await obs.run('A-read',()=>read(makeRequest('read',f.readQuery)));assert.equal(rb.status,200);
   assert.equal((await rb.json()).state,'AUTHORITATIVE_READ');
   return {role:'SAVED_VERIFIED',reopened:true,stockDelta:{entries:2,commands:1},actualHandlers:true};
  });
  await runCase('B-revocation-first',async()=>{
   const outcomes=[];
   for(const kind of ['receive','read'] as const){
    await grant();const before=await observeCounts(),b=barrier();let held=false;
    obs.hook=async e=>{if(!held&&e.context==='B-'+kind&&e.phase==='after'&&e.label==='POOL_END'&&e.login===admission.logins.role){held=true;await b.pause();}};
    const running=obs.run('B-'+kind,()=>kind==='receive'?receive(makeRequest(kind,f.receives.B)):read(makeRequest(kind,f.readQuery)));
    try{await within(b.reached,'PRELIMINARY_READ');await revoke();}finally{b.release();}
    const response=await running;assert.equal(response.status,403);
    assert.deepEqual(await observeCounts(),before);
    assert.equal(obs.query.filter(e=>e.context==='B-'+kind&&e.phase==='before'&&['RESOLVE','POST','READ','RECONCILE'].includes(e.label)).length,0);
    outcomes.push({kind,status:response.status,revocationCommittedBeforeResume:true,ledgerUnchanged:true});obs.hook=null;
   }return outcomes;
  });
  await runCase('C-operation-first',async()=>{
   const outcomes=[];
   for(const kind of ['read','receive'] as const){
    await grant();const before=await observeCounts(),b=barrier();let fences=0,paused=false;
    let pending:Promise<unknown>|undefined,waiters:unknown;
    obs.hook=async e=>{
     if(e.context!=='C-'+kind||e.login!==admission.logins.stock||e.phase!=='after')return;
     if(e.label==='STOCK_SHARED_FENCE'&&++fences===(kind==='receive'?2:1)){paused=true;await b.pause();}
     if(e.label==='COMMIT'&&paused&&pending)await pending; // revocation wins before new transaction
    };
    const running=obs.run('C-'+kind,()=>kind==='receive'?receive(makeRequest(kind,f.receives.C)):read(makeRequest(kind,f.readQuery)));
    try{await within(b.reached,'STOCK_SHARED_FENCE');pending=obs.run('C-revoke-'+kind,revoke);waiters=await waitForFenceWaiter(undefined,'C-revoke-'+kind);}finally{b.release();}
    const response=await running;await pending;
    assert.equal(response.status,kind==='receive'?409:200);
    const after=await observeCounts();assert.equal(after.entries-before.entries,kind==='receive'?2:0);
    assert.equal(after.commands-before.commands,kind==='receive'?1:0);
    assert.equal(obs.query.filter(e=>e.context==='C-'+kind&&e.phase==='before'&&e.label==='POST').length,kind==='receive'?1:0);
    obs.hook=null;const later=await read(makeRequest('read',f.readQuery));assert.equal(later.status,403);
    outcomes.push({kind,status:response.status,waiters,postCount:kind==='receive'?1:0,subsequentCall:403,noBlindRetry:true});
   }return outcomes;
  });
  await runCase('D-dependency-ordering-and-stale-writes',async()=>{
   const evidence=[];
   const changes=[['actor-deactivate','actor-restore'],['employee-deactivate','employee-restore'],
    ['binding-deactivate','binding-restore'],['identity-self','binding-restore'],
    ['entity-deactivate','entity-restore'],['site-deactivate','site-restore'],['warehouse-deactivate','warehouse-restore']];
   for(const [mutation,restore] of changes){
    for(const winner of ['mutation','write']){
     const cmd=await command(f.target,['VIEWER']),b=barrier(),context='D-'+mutation+'-'+winner;
     let held=false,pending:Promise<unknown>|undefined,waiters:unknown=null;
     obs.hook=async e=>{
      if(e.context!==context||e.login!==admission.logins.role)return;
      if(!held&&e.label==='ROLE_SESSION_FENCE'&&e.phase===(winner==='mutation'?'before':'after')){held=true;await b.pause();}
      if(winner==='write'&&e.label==='ROLE_SESSION_UNLOCK'&&e.phase==='after'&&pending)await pending;
     };
     const running=obs.run(context,()=>roles(makeRequest('roles',cmd,f.admin)));
     try{
      await within(b.reached,'ROLE_PRE_SNAPSHOT_FENCE');
      if(winner==='mutation')await fixtures(mutation);
      else{pending=fixtures(mutation);waiters=await waitForFenceWaiter(id.pid);}
      b.release();const response=await running;await pending;
      const event=await eventFor(cmd.requestId);
      if(winner==='mutation'){assert.notEqual(response.status,200);assert.equal(event,undefined);}
      else{assert.ok(event,'WRITER_MUST_COMMIT_BEFORE_MUTATION');assert.ok([200,409].includes(response.status));}
      evidence.push({mutation,winner,status:response.status,eventPersisted:!!event,waiters});
     }finally{
      b.release();await running.catch(()=>{});await pending?.catch(()=>{});obs.hook=null;await fixtures(restore);
     }
    }
   }
   // Same expected revision: exactly one change, never two successful writes.
   const base=await command(f.target,['VIEWER']);
   const cmds=[base,{...base,requestId:randomUUID(),roles:['INVENTORY_AUDITOR'] as RoleId[]}];
   const responses=await Promise.all(cmds.map(c=>roles(makeRequest('roles',c,f.admin))));
   assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,1);
   const events=await Promise.all(cmds.map(c=>eventFor(c.requestId)));assert.equal(events.filter(Boolean).length,1);
   // Concurrent assignment/revocation is ordered by the same fence/revision.
   await grant();const revokeCmd=await command(f.operator,null);
   const assignCmd={...revokeCmd,requestId:randomUUID(),action:'CHANGE' as const,roles:['VIEWER'] as RoleId[]};
   const competing=await Promise.all([revokeCmd,assignCmd].map(c=>roles(makeRequest('roles',c,f.admin))));
   assert.equal(competing.filter(r=>r.status===200).length,1);
   assert.equal(competing.filter(r=>r.status===409).length,1);
   return {dependencyCases:evidence,staleWrites:'one commit, one 409',assignmentRevocation:'one commit, one 409'};
  });
  await runCase('E-binding-session-proof-denials',async()=>{
   await grant();const before=await observeCounts();let callback=false;
   await assert.rejects(withProtectedPostingTransaction(sp as unknown as PgPool,env,async()=>{callback=true;}),/ROLE_OPERATION_FENCE_NOT_ADMITTED/);
   assert.equal(callback,false);
   const savedProfile=env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE;
   try{delete env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE;
    assert.equal((await receive(makeRequest('receive',f.receives.B))).status,503);
   }finally{env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE=savedProfile;}
   const original=makeRequest('read',f.readQuery),headers=new Headers(original.headers);
   headers.set('cookie','__Host-hft_session=invalid.signature.value');
   const bad=new Request(original,{headers});assert.equal((await read(bad)).status,401);
   const actor=resolveVerifiedRequestOperator(makeRequest('read',f.readQuery),env,'ISOLATED_ROLE_QUALIFICATION');
   const roleBinding=await requireApiBusinessRole(env,actor,f.scope,'stock.read');
   const proof=issueStoresReadProof(f.readQuery,actor,Buffer.from(env.HFT_P0_STORES_KEY_BASE64!,'base64'),Number(env.HFT_P0_STORES_KEY_VERSION));
   const altered={...proof,macSha256:(proof.macSha256[0]==='0'?'1':'0')+proof.macSha256.slice(1)};
   const fresh=new pg.Pool(onlinePgPoolOptions(env,'P2_STORES'));
   try{
    const bound=roleBinding.bind(fresh as unknown as PgPool);
    await assert.rejects(withProtectedReadbackTransaction(bound,env,async c=>{
     await c.query('SELECT hft.ops_a2_operator_read_receive_v1($1::jsonb,$2::jsonb)',[JSON.stringify(f.readQuery),JSON.stringify(altered)]);
    }),e=>typeof e==='object'&&e!==null&&'code' in e&&typeof e.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code));
   }finally{await fresh.end();}
   assert.deepEqual(await observeCounts(),before);
   return {missingBinding:'denied before callback',missingRoleProfile:503,invalidSession:401,invalidProof:'SQL rejection',ledgerUnchanged:true};
  });
  await runCase('installed-audit-enforcement',async()=>{
   await change(f.target,['VIEWER']);const before=await view(f.target),c=await rp.connect();
   try{
    await assertRoleConnection(c,env);
    await c.query('SELECT pg_catalog.pg_advisory_lock($1::integer,$2::integer)',[...ROLE_FENCE_KEYS]);
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await c.query(`UPDATE hft_app_roles.assignment SET revision=revision+1,
     snapshot=jsonb_set(snapshot,'{revision}',to_jsonb(revision+1))
     WHERE legal_entity_id=$1 AND site_id=$2 AND warehouse_id=$3 AND employee_id=$4`,
    [f.scope.legalEntityId,f.scope.siteId,f.scope.warehouseId,f.target.employeeId]);
    await assert.rejects(c.query('COMMIT'),/HFT_APP_ROLE_SNAPSHOT_AUDIT_MISSING/);await c.query('ROLLBACK');
   }finally{c.release(true);}
   assert.deepEqual((await view(f.target)).assignment,before.assignment);
   await assert.rejects(fixtures('audit-update'),/HFT_APP_ROLE_AUDIT_IMMUTABLE/);
   return {snapshotWithoutAudit:'COMMIT rejected',immutableEvent:'UPDATE rejected',readbackUnchanged:true};
  });
  await runCase('installed-trigger-negatives',async()=>{
   const evidence=[];
   for(const mutation of ['audit-disable','constraint-disable','audit-misplace','audit-replace','audit-noop']){
    try{
     await fixtures(mutation);const c=await rp.connect();
     try{await assert.rejects(assertRoleConnection(c,env),/ROLE_(?:AUDIT_OR_REVOCATION_ENFORCEMENT|DATABASE_IDENTITY_ACL_OR_AUDIT)_NOT_ADMITTED/);}
     finally{c.release(true);}
     const response=await read(makeRequest('read',f.readQuery));assert.notEqual(response.status,200);
     evidence.push({mutation,catalog:'DENIED',routeStatus:response.status});
    }finally{
     await fixtures('audit-restore');const c=await rp.connect();
     try{await assertRoleConnection(c,env);}finally{c.release(true);}
    }
   }return evidence;
  });
  // Final effective table/column census from the actual restricted role.
  const c=await rp.connect();try{const final=await c.query(ROLE_BACKEND_CATALOG_SQL);report.environment.finalRoleCatalog=final.rows[0];}
  finally{c.release(true);}
 }catch(e){
  report.error=e instanceof Error?e.message:String(e);
  if(report.preflight!=='PASS')report.preflight='NOT TESTED — admission/fixture/connection preflight did not complete';
  process.exitCode=report.results.some(x=>x.status==='FAIL')?1:2;
 }finally{
  if(observer){report.observations=observer.query;observer.close();}
  await rolePool?.end();await stockPool?.end();await executor?.end();await monitor?.end();
  const json=JSON.stringify(report,null,2)+'\n';
  if(env.HFT_QUAL077_RESULT_FILE){
   assert.ok(isAbsolute(env.HFT_QUAL077_RESULT_FILE)&&!env.HFT_QUAL077_RESULT_FILE.startsWith(root),'RESULT_MUST_BE_OUTSIDE_CHECKOUT');
   writeFileSync(env.HFT_QUAL077_RESULT_FILE,json,{mode:0o600,flag:'wx'});
  }
  console.log(json);
 }
}
main().catch(e=>{console.error('QUAL077_RUNNER_FAILED',e instanceof Error?e.message:String(e));process.exitCode=1;});
