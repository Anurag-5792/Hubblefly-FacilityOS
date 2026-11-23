/** Restricted live Masters PostgreSQL connector. No direct master DML in API. */
import {createRequire} from 'node:module';
import {isIP} from 'node:net';
import {assertLiveProfile,livePgOptions,type LiveEnv} from './live-profile.ts';
import {validateLiveRequest,type LiveRequest,type LiveChange,type LiveRecord} from './live-contract.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator} from '../security/verified-request.ts';
type Client={query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release(destroy?:boolean):void};
export type LivePool={connect():Promise<Client>;end():Promise<void>};
export function openLivePool(env:LiveEnv):LivePool{
 const pg=createRequire(import.meta.url)('pg') as {Pool:new(options:Record<string,unknown>)=>LivePool};
 return new pg.Pool(livePgOptions(env));
}
export const LIVE_ADMISSION_SQL=`
SELECT current_database() AS database_name,session_user AS login,current_user AS current_role,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,
 inet_server_addr()::text AS server_address,inet_server_port() AS server_port,
 current_setting('server_version_num') AS version_num,pg_is_in_recovery() AS replica,
 (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()) AS tls,
 (SELECT version FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()) AS tls_version,
 COALESCE(pg_catalog.has_schema_privilege(current_user,
  pg_catalog.to_regnamespace('hft_live_r1')::oid,'USAGE'),false) AS schema_usage,
 COALESCE(pg_catalog.has_schema_privilege(current_user,
  pg_catalog.to_regnamespace('hft_live_r1')::oid,'CREATE'),false) AS schema_create,
 ARRAY(SELECT sig FROM (VALUES
  ('hft_live_r1.save_v1(text,text,jsonb)'),
  ('hft_live_r1.get_v1(text,text,text,text,text,text)'),
  ('hft_live_r1.list_v1(text,text,text,text,text,text)'),
  ('hft_live_r1.history_v1(text,text,text,text,text,text)')) q(sig)
  WHERE pg_catalog.to_regprocedure(sig) IS NULL) AS missing_functions,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='hft_live_r1' AND p.proname IN('save_v1','get_v1','list_v1','history_v1')
   AND p.prosecdef AND p.prokind='f' AND r.rolname='hft_r1_live_owner'
   AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]) AS secure_function_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='hft_live_r1' AND
   pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
   AND p.proname NOT IN('save_v1','get_v1','list_v1','history_v1')) AS extra_execute,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('hft_live_r1','hft','hft_secret') AND
   ((c.relkind IN('r','p') AND n.nspname='hft_live_r1' AND
     c.relname IN('installation','schema_revision') AND
     pg_catalog.has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    OR (NOT (n.nspname='hft_live_r1' AND c.relname IN('installation','schema_revision')) AND
    ((c.relkind IN('r','p','v','m','f') AND pg_catalog.has_table_privilege(current_user,c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) OR
    (c.relkind='S' AND pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))))) AS table_access,
 (SELECT count(*)::integer FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('hft_live_r1','hft','hft_secret') AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,
    CASE WHEN n.nspname='hft_live_r1' AND c.relname IN('installation','schema_revision')
     THEN 'INSERT,UPDATE,REFERENCES' ELSE 'SELECT,INSERT,UPDATE,REFERENCES' END)) AS column_access,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('hft','hft_secret','hft_crypto') AND
  pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')) AS protected_execute,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles r WHERE
  r.rolname IN ('hft_r1_live_owner','hft_engineering','hft_r1_posting_owner',
   'hft_r1_p3_master_owner','hft_r1_app_runtime','hft_draft077_owner')
  AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER')) AS owner_memberships,
 (SELECT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
  AND NOT r.rolreplication AND NOT r.rolbypassrls FROM pg_catalog.pg_roles r
  WHERE r.rolname=current_user) AS restricted_login,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='hft_live_r1' AND c.relname IN
  ('schema_revision','installation','actor_scope','master_record','revision_event')
  AND c.relkind='r') AS table_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='hft_live_r1' AND
  ((c.relname='revision_event' AND t.tgname='immutable_audit' AND t.tgenabled='A' AND t.tgtype=58)
  OR (c.relname='master_record' AND t.tgname='record_requires_audit' AND t.tgenabled='A'
   AND t.tgdeferrable AND t.tginitdeferred))) AS protected_triggers,
 (SELECT COALESCE(jsonb_agg(to_jsonb(i)),'[]'::jsonb)
  FROM hft_live_r1.installation i) AS installed_binding,
 (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.version),'[]'::jsonb)
  FROM hft_live_r1.schema_revision s) AS migrations
`;
type Admit=Readonly<{database_name:string;login:string;current_role:string;
 database_oid:string;server_address:string;server_port:number;version_num:string;
 replica:boolean;tls:boolean;tls_version:string|null;schema_usage:boolean;schema_create:boolean;
 missing_functions:string[];secure_function_count:number;extra_execute:number;
 table_access:number;column_access:number;protected_execute:number;owner_memberships:number;
 restricted_login:boolean;table_count:number;protected_triggers:number;
 installed_binding:{target_admission_sha256:string;installer_sha256:string;release_sha256:string;
 target_project:string;target_branch:string;database_oid:string}[];
 migrations:{version:number;source_sha256:string}[]}>;
export async function admitLiveConnection(c:Client,env:LiveEnv):Promise<void>{
 assertLiveProfile(env);
 const r=await c.query<Admit>(LIVE_ADMISSION_SQL),x=r.rows[0];
 if(r.rows.length!==1||!x||x.database_name!==env.HFT_LIVE_R1_DATABASE||
  x.login!==env.HFT_LIVE_R1_LOGIN||x.current_role!==x.login||
  x.database_oid!==env.HFT_LIVE_R1_DATABASE_OID||
  !x.server_address||isIP(x.server_address)===0||!Number.isInteger(x.server_port)||
  x.version_num!==env.HFT_LIVE_R1_PG_VERSION||x.replica!==false||
  x.tls!==true||!['TLSv1.2','TLSv1.3'].includes(x.tls_version||'')||
  x.schema_usage!==true||x.schema_create!==false||
  !Array.isArray(x.missing_functions)||x.missing_functions.length!==0||
  x.secure_function_count!==4||x.extra_execute!==0||
  x.table_access!==0||x.column_access!==0||x.protected_execute!==0||
  x.owner_memberships!==0||x.restricted_login!==true||
  x.table_count!==5||x.protected_triggers!==2||
  !Array.isArray(x.installed_binding)||x.installed_binding.length!==1||
  x.installed_binding[0].target_admission_sha256!==env.HFT_LIVE_R1_TARGET_ADMISSION_SHA256||
  x.installed_binding[0].installer_sha256!==env.HFT_LIVE_R1_INSTALLER_SHA256||
  x.installed_binding[0].release_sha256!==env.HFT_LIVE_R1_RELEASE_SHA256||
  x.installed_binding[0].target_project!==env.HFT_LIVE_R1_PROJECT||
  x.installed_binding[0].target_branch!==env.HFT_LIVE_R1_BRANCH||
  String(x.installed_binding[0].database_oid)!==x.database_oid||
  !Array.isArray(x.migrations)||x.migrations.length!==2||
  x.migrations[0].version!==1||x.migrations[1].version!==2||
  x.migrations[0].source_sha256!==env.HFT_LIVE_R1_MIGRATION_0001_SHA256||
  x.migrations[1].source_sha256!==env.HFT_LIVE_R1_MIGRATION_0002_SHA256)
  throw Error('LIVE_R1_DATABASE_IDENTITY_ACL_OR_INSTALLATION_NOT_ADMITTED');
}
const named=(r:Record<string,unknown>,kind:string):LiveRecord=>{
 const row={kind,scope:{legalEntityId:r.legal_entity_id,siteId:r.site_id,warehouseId:r.warehouse_id},
  recordId:r.record_id,revision:Number(r.revision),deleted:r.deleted,values:r.values_json,
  state:r.state,createdBy:r.created_by,updatedBy:r.updated_by,
  createdAt:r.created_at,updatedAt:r.updated_at};
 if(!Number.isSafeInteger(row.revision)||row.revision<1||
  !row.values||typeof row.values!=='object'||row.state!=='RECORDED_UNAPPROVED'||
  typeof row.recordId!=='string'||typeof row.createdBy!=='string')
  throw Error('LIVE_R1_READBACK_INVALID');
 return row as LiveRecord;
};
async function transaction<T>(pool:LivePool,env:LiveEnv,readOnly:boolean,work:(c:Client)=>Promise<T>):Promise<T>{
 const c=await pool.connect();let started=false,committing=false,committed=false,discard=false;
 try{
  await c.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
  started=true;
  await c.query("SET LOCAL statement_timeout='10000ms'");
  await c.query("SET LOCAL lock_timeout='2500ms'");
  await admitLiveConnection(c,env);
  const value=await work(c);
  committing=true;await c.query('COMMIT');committed=true;
  return value;
 }catch(error){
  discard=true;
  if(committing&&!committed)throw Error('LIVE_R1_COMMIT_OUTCOME_UNKNOWN_NO_RETRY');
  if(started)try{await c.query('ROLLBACK');}catch{throw Error('LIVE_R1_ROLLBACK_UNVERIFIED');}
  throw error;
 }finally{c.release(discard);}
}
const scopeArgs=(req:LiveRequest)=>[req.scope.legalEntityId,req.scope.siteId,req.scope.warehouseId,req.kind];
function verifiedActor(actor:VerifiedRequestOperator,req:LiveRequest){
 return assertVerifiedRequestOperator(actor,req.scope);
}
export async function executeLive(pool:LivePool,env:LiveEnv,actor:VerifiedRequestOperator,raw:unknown){
 const req=validateLiveRequest(raw),subject=verifiedActor(actor,req);
 if(req.intent==='SAVE'){
  let result:{record:Record<string,unknown>;state:string;requestId:string; auditSha256:string};
  try{
   result=await transaction(pool,env,false,async c=>{
    const r=await c.query<{evidence:typeof result}>(
     'SELECT hft_live_r1.save_v1($1::text,$2::text,$3::jsonb) AS evidence',
     [subject,actor.sessionId,JSON.stringify(req)]);
    if(r.rows.length!==1||r.rows[0].evidence?.state!=='COMMITTED_UNAPPROVED'||
     r.rows[0].evidence?.requestId!==req.requestId)throw Error('LIVE_R1_COMMIT_EVIDENCE_INVALID');
    return r.rows[0].evidence;
   });
  }catch(e){throw e;}
  // Fresh transaction and a different database connection after COMMIT.
  try{
   const record=await executeLive(pool,env,actor,{contractVersion:req.contractVersion,
    intent:'GET',kind:req.kind,scope:req.scope,recordId:req.recordId,search:''}) as LiveRecord|null;
   const history=await executeLive(pool,env,actor,{contractVersion:req.contractVersion,
    intent:'HISTORY',kind:req.kind,scope:req.scope,recordId:req.recordId,search:''}) as Record<string,unknown>[];
   if(!record||record.revision!==req.expectedRevision+1||
    history[0]?.request_id!==req.requestId||
    history[0]?.event_sha256!==result.auditSha256||
    (req.action==='DELETE')!==record.deleted||
    (req.action!=='DELETE'&&Object.keys(req.values).some(k=>record.values[k]!==req.values[k])))
    throw Error('LIVE_R1_READBACK_NOT_IDENTICAL');
   return {state:'SAVED_VERIFIED',record,historyRevision:record.revision,
    auditSha256:result.auditSha256,requestId:req.requestId,operationalApproval:false};
  }catch{throw Error('LIVE_R1_COMMITTED_READBACK_REQUIRED_NO_RETRY');}
 }
 return transaction(pool,env,true,async c=>{
  const r=await c.query<{evidence:Record<string,unknown>}>(
   req.intent==='GET'?'SELECT hft_live_r1.get_v1($1,$2,$3,$4,$5,$6) AS evidence':
   req.intent==='LIST'?'SELECT hft_live_r1.list_v1($1,$2,$3,$4,$5,$6) AS evidence':
   'SELECT hft_live_r1.history_v1($1,$2,$3,$4,$5,$6) AS evidence',
   [subject,...scopeArgs(req),req.intent==='LIST'?req.search:req.recordId]);
  const evidence=r.rows[0]?.evidence;
  if(r.rows.length!==1||!evidence||evidence.state!=='AUTHORITATIVE_UNAPPROVED')
   throw Error('LIVE_R1_READ_EVIDENCE_INVALID');
  if(req.intent==='GET')return evidence.record?named(evidence.record as Record<string,unknown>,req.kind):null;
  if(req.intent==='LIST'){
   if(!Array.isArray(evidence.records)||evidence.records.length>100)
    throw Error('LIVE_R1_LIST_INVALID');
   return evidence.records.map(x=>named(x as Record<string,unknown>,req.kind));
  }
  if(!Array.isArray(evidence.history)||evidence.history.length>100)
   throw Error('LIVE_R1_HISTORY_INVALID');
  return evidence.history;
 });
}
