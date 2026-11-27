/** HF098 dedicated read-only canonical MIS connector. No stock permission,
 * no writer, no ambient pool or identity fallback. Installation is separate.
 */
import {createRequire} from 'node:module';
import {assertVerifiedLiveTls} from '../live/live-tls.ts';
import {assertRoleBackendProfile,rolePoolOptions,type RoleBackendEnv,type ManagedRolePool} from '../roles/role-backend.ts';
import {hostedOperatorMode} from '../roles/hosted-operator-profile.ts';
import type {RoleSqlClient} from '../roles/role-postgres.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator} from '../security/verified-request.ts';
import {sameScope,type Scope} from '../roles/role-assignment.ts';
import {misRequirementsConfigured,MIS_READER_LOGIN,MIS_READER_OWNER} from './mis-profile.ts';
import {parseRequirementsCatalog,calculateRequirements,type RequirementsCatalog} from './requirements.ts';

const readSig='hft.planning_requirements_read_v1(text,text,text,text,text,text,uuid)';
const actionSig='hft.planning_action_allowed_v1(text,text,text,text,text,text,text)';
const reads=['hft.employee','hft.legal_entity','hft.site','hft.warehouse','hft.item','hft.item_version_catalog',
 'hft_app_roles.identity_binding','hft_app_roles.scope_lock','hft.planning_action_event','hft.planning_bom_decision',
 'hft.planning_effective_interval_v1','hft.planning_drone_model','hft.planning_bom_subject','hft.planning_bom_revision',
 'hft.planning_bom_applicability','hft.planning_bom_line'];
const sha=/^[0-9a-f]{64}$/;
export function assertMisRequirementsProfile(e:RoleBackendEnv){
 hostedOperatorMode(e);assertRoleBackendProfile(e);
 const pwd=e.HFT_MIS_PG_PASSWORD||'';
 if(!misRequirementsConfigured(e)||pwd.length<16||pwd.length>4096||pwd===e.HFT_ROLE_PG_PASSWORD||
 pwd===e.HFT_STORES_PG_PASSWORD||e.HFT_ROLE_PG_HOST!=='ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech'||
 e.HFT_ROLE_PG_PORT!=='5432'||!sha.test(e.HFT_MIS_VIEW_SHA256||'')||e.HFT_MIS_VIEW_SHA256==='0'.repeat(64))
  throw Error('MIS_REQUIREMENTS_BACKEND_NOT_ADMITTED');
}
export function openMisReadPool(e:RoleBackendEnv):ManagedRolePool{
 assertMisRequirementsProfile(e);
 const pg=createRequire(import.meta.url)('pg') as {Pool:new(o:Record<string,unknown>)=>ManagedRolePool};
 return new pg.Pool({...rolePoolOptions(e),user:MIS_READER_LOGIN,password:e.HFT_MIS_PG_PASSWORD,
  application_name:'hft-098-mis-requirements-readonly',max:1,statement_timeout:12000});
}
export const MIS_READER_CATALOG_SQL=String.raw` 
WITH runtime AS (SELECT * FROM pg_roles WHERE rolname=current_user),
 owner_role AS (SELECT * FROM pg_roles WHERE rolname=$1),
 rfn AS (SELECT * FROM pg_proc WHERE oid=to_regprocedure($2)),
 afn AS (SELECT * FROM pg_proc WHERE oid=to_regprocedure($3)),
 user_ns AS (SELECT * FROM pg_namespace WHERE nspname!~'^pg_' AND nspname<>'information_schema'),
 rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN user_ns n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p','v','m','f','S')),
 funcs AS (SELECT p.* FROM pg_proc p JOIN user_ns n ON n.oid=p.pronamespace)
SELECT current_database() db,session_user login,current_user active_role,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) db_oid,
 current_setting('server_version_num') pg_version,pg_is_in_recovery() replica,
 current_setting('session_replication_role') replication_mode,
 (SELECT count(*)::int FROM runtime r WHERE r.rolcanlogin AND NOT(r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)) runtime_ok,
 (SELECT count(*)::int FROM owner_role r WHERE NOT(r.rolcanlogin OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR r.rolinherit)) owner_ok,
 (SELECT count(*)::int FROM pg_auth_members m WHERE m.member IN((SELECT oid FROM runtime),(SELECT oid FROM owner_role))
 OR (m.roleid IN((SELECT oid FROM runtime),(SELECT oid FROM owner_role)) AND (m.set_option OR m.inherit_option))) membership_count,
 has_database_privilege(current_user,current_database(),'CREATE,TEMP,CONNECT WITH GRANT OPTION') runtime_db_extra,
 (SELECT has_database_privilege(o.oid,current_database(),'CREATE,TEMP,CONNECT WITH GRANT OPTION') FROM owner_role o) owner_db_extra,
 (SELECT count(*)::int FROM user_ns n WHERE has_schema_privilege(current_user,n.oid,'CREATE')
 OR (n.nspname<>'hft' AND n.nspname<>'public' AND has_schema_privilege(current_user,n.oid,'USAGE'))) runtime_schema_extra,
 (SELECT count(*)::int FROM user_ns n CROSS JOIN owner_role o WHERE has_schema_privilege(o.oid,n.oid,'CREATE')
 OR (n.nspname NOT IN('hft','hft_app_roles','public') AND has_schema_privilege(o.oid,n.oid,'USAGE'))) owner_schema_extra,
 (SELECT count(*)::int FROM rels c WHERE c.relowner=(SELECT oid FROM runtime) OR CASE WHEN c.relkind='S'
 THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
 ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END) runtime_rel_extra,
 (SELECT count(*)::int FROM rels c CROSS JOIN owner_role o WHERE c.relowner=o.oid OR CASE WHEN c.relkind='S'
 THEN has_sequence_privilege(o.oid,c.oid,'USAGE,SELECT,UPDATE')
 ELSE has_table_privilege(o.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')
 OR has_any_column_privilege(o.oid,c.oid,'INSERT,UPDATE,REFERENCES,SELECT WITH GRANT OPTION')
 OR (has_any_column_privilege(o.oid,c.oid,'SELECT') AND NOT (c.nspname||'.'||c.relname=ANY($4::text[]))) END) owner_rel_extra,
 (SELECT count(*)::int FROM rels c CROSS JOIN owner_role o WHERE c.nspname||'.'||c.relname=ANY($4::text[]) AND has_table_privilege(o.oid,c.oid,'SELECT')) owner_read_count,
 (SELECT count(*)::int FROM funcs f WHERE f.oid IS DISTINCT FROM (SELECT oid FROM rfn) AND
  (has_function_privilege(current_user,f.oid,'EXECUTE') OR f.proowner=(SELECT oid FROM runtime))) runtime_fn_extra,
 (SELECT count(*)::int FROM funcs f CROSS JOIN owner_role o WHERE f.oid NOT IN((SELECT oid FROM rfn),(SELECT oid FROM afn))
  AND (has_function_privilege(o.oid,f.oid,'EXECUTE') OR f.proowner=o.oid)) owner_fn_extra,
 (SELECT count(*)::int FROM rfn f JOIN owner_role o ON o.oid=f.proowner WHERE f.prosecdef AND f.provolatile='v' AND f.prokind='f'
  AND f.prorettype='jsonb'::regtype AND NOT f.proretset AND f.pronargs=7 AND f.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
  AND f.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')=$5
  AND has_function_privilege(current_user,f.oid,'EXECUTE') AND NOT has_function_privilege(current_user,f.oid,'EXECUTE WITH GRANT OPTION')) reader_fn_ok,
 (SELECT count(*)::int FROM afn f CROSS JOIN owner_role o WHERE NOT f.prosecdef AND f.provolatile='v' AND f.prokind='f'
  AND f.prorettype='boolean'::regtype AND NOT f.proretset AND f.pronargs=7 AND f.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
  AND f.prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
  AND encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')=$6
  AND has_function_privilege(o.oid,f.oid,'EXECUTE') AND NOT has_function_privilege(o.oid,f.oid,'EXECUTE WITH GRANT OPTION')) action_fn_ok,
 (SELECT count(*)::int FROM rels c WHERE c.nspname='hft' AND c.relname='planning_effective_interval_v1' AND c.relkind='v'
  AND c.reloptions=ARRAY['security_invoker=true']::text[] AND encode(sha256(convert_to(pg_get_viewdef(c.oid,true),'UTF8')),'hex')=$7) interval_view_ok,
 (SELECT count(*)::int FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN rels c ON c.oid=t.tgrelid
  WHERE c.nspname='hft' AND c.relname='planning_action_event' AND t.tgname='planning_action_fence' AND t.tgenabled='A'
  AND t.tgtype=7 AND t.tgqual IS NULL AND t.tgnargs=0 AND NOT p.prosecdef
  AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp'] AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=$8) action_fence_ok
`;
export async function assertMisReaderConnection(c:RoleSqlClient,e:RoleBackendEnv){
 assertMisRequirementsProfile(e);
 assertVerifiedLiveTls(c,e.HFT_ROLE_PG_HOST!,Number(e.HFT_ROLE_PG_PORT));
 const r=await c.query<Record<string,unknown>>(MIS_READER_CATALOG_SQL,[MIS_READER_OWNER,readSig,actionSig,reads,
  e.HFT_MIS_READER_BODY_SHA256,e.HFT_MIS_ACTION_BODY_SHA256,e.HFT_MIS_VIEW_SHA256,'9ca99043f2c17378aa7451d85b01ed69b4f4d54f160a746d32506421a2644668']);
 const v=r.rows[0];
 if(r.rows.length!==1||!v||v.db!==e.HFT_ROLE_PG_DATABASE||v.db_oid!=='16397'||v.login!==MIS_READER_LOGIN||v.active_role!==v.login||
 v.pg_version!=='180007'||v.replica!==false||v.replication_mode!=='origin'||v.runtime_ok!==1||v.owner_ok!==1||
 v.membership_count!==0||v.runtime_db_extra!==false||v.owner_db_extra!==false||v.runtime_schema_extra!==0||v.owner_schema_extra!==0||
 v.runtime_rel_extra!==0||v.owner_rel_extra!==0||v.owner_read_count!==reads.length||v.runtime_fn_extra!==0||v.owner_fn_extra!==0||
 v.reader_fn_ok!==1||v.action_fn_ok!==1||v.interval_view_ok!==1||v.action_fence_ok!==1)
  throw Error('MIS_READER_CATALOG_NOT_ADMITTED');
}
export const MIS_READ_SQL='SELECT hft.planning_requirements_read_v1($1,$2,$3,$4,$5,$6,$7::uuid) AS data';
function params(actor:VerifiedRequestOperator,scope:Scope,model:string|null){
 assertVerifiedRequestOperator(actor,scope);
 if(!actor.canonicalEmployeeId||!actor.canonicalPersonId||!actor.hostedOperatorContext)throw Error('MIS_CANONICAL_ACTOR_REQUIRED');
 return [scope.legalEntityId,scope.siteId,scope.warehouseId,actor.subject,actor.canonicalEmployeeId,actor.canonicalPersonId,model];
}
async function read(c:RoleSqlClient,actor:VerifiedRequestOperator,scope:Scope,model:string|null){
 const r=await c.query<{data:unknown}>(MIS_READ_SQL,params(actor,scope,model));
 assertVerifiedRequestOperator(actor,scope);
 if(r.rows.length!==1)throw Error('MIS_SOURCE_UNAVAILABLE');return r.rows[0].data;
}
export async function executeMisRead(pool:ManagedRolePool,env:RoleBackendEnv,actor:VerifiedRequestOperator,input:
 {intent:'CONTEXT'}|{intent:'OVERVIEW';scope:Scope}|{intent:'REQUIREMENTS';scope:Scope;modelId:string;units:number}){
 const c=await pool.connect();let began=false,discard=false;
 try{
  await assertMisReaderConnection(c,env);
  await c.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');began=true;
  await c.query('SET LOCAL search_path=pg_catalog,pg_temp');
  let result:unknown;
  if(input.intent==='CONTEXT'){
   const scopes:RequirementsCatalog[]=[];
   for(const warehouseId of actor.scope.warehouseIds){
    const scope={legalEntityId:actor.scope.legalEntityId,siteId:actor.scope.siteId,warehouseId};
    await c.query('SAVEPOINT mis_scope');
    try{scopes.push(parseRequirementsCatalog(await read(c,actor,scope,null),scope));await c.query('RELEASE SAVEPOINT mis_scope');}
    catch(e){
     await c.query('ROLLBACK TO SAVEPOINT mis_scope');await c.query('RELEASE SAVEPOINT mis_scope');
     if((e as {code?:string}).code!=='42501')throw e;
    }
   }
   if(!scopes.length)throw Object.assign(Error('MIS_SCOPE_DENIED'),{code:'42501'});
   result={state:'MIS_CONTEXT',contextId:actor.hostedOperatorContext,expiresAt:actor.expiresAt,
    scopes:scopes.map(x=>({scope:x.scope,scopeName:x.scopeName})),stockAdmitted:false};
  }else{
   const raw=await read(c,actor,input.scope,input.intent==='REQUIREMENTS'?input.modelId:null);
   result=input.intent==='OVERVIEW'?parseRequirementsCatalog(raw,input.scope):calculateRequirements(raw,input.scope,input.modelId,input.units);
   if(!sameScope((result as {scope:Scope}).scope,input.scope))throw Error('MIS_SOURCE_SCOPE_DENIED');
  }
  if(actor.expiresAt<=Date.now()/1000)throw Error('MIS_SESSION_EXPIRED');
  await c.query('COMMIT');began=false;
  if(actor.expiresAt<=Date.now()/1000)throw Error('MIS_SESSION_EXPIRED');
  return result;
 }catch(e){if(began)try{await c.query('ROLLBACK');}catch{discard=true;}else discard=true;throw e;}
 finally{c.release(discard);}
}
