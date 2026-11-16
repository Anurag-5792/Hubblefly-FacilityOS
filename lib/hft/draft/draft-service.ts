/** Path B draft-only PostgreSQL read/save. Operational P3 is never called.
 * Chat 13 installs the exact hft_draft077.save_v1/read_v1 interface separately.
 */
import {createRequire} from 'node:module';
import {assertDraftProfile,draftPgOptions,type DraftEnv} from './draft-profile.ts';
import {assertDraftRecords,DRAFT_STATE,DRAFT_CONTRACT,
 type DraftSave,type DraftRead,type DraftRecord,type DraftScope}
 from './draft-contract.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
export type DraftPgClient={
 query<Row extends Record<string,unknown>>(sql:string,params?:readonly unknown[]):
  Promise<{rows:Row[]}>;
 release(destroy?:boolean):void;
};
export type DraftPgPool={connect():Promise<DraftPgClient>;end():Promise<void>};
const saveSql='SELECT hft_draft077.save_v1($1::jsonb) AS evidence';
const readSql='SELECT hft_draft077.read_v1($1::jsonb) AS evidence';
export const DRAFT_IDENTITY_SQL=`
SELECT current_database() AS db,session_user AS login,current_user AS role,
 current_setting('server_version_num')::integer AS version,
 pg_is_in_recovery() AS replica,
 (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()) AS tls,
 (SELECT version FROM pg_catalog.pg_stat_ssl
   WHERE pid=pg_catalog.pg_backend_pid()) AS tls_version,
 pg_catalog.has_schema_privilege(current_user,'hft_draft077','USAGE') AS schema_usage,
 pg_catalog.has_schema_privilege(current_user,'hft_draft077','CREATE') AS schema_create,
 pg_catalog.coalesce(pg_catalog.has_function_privilege(current_user,
   pg_catalog.to_regprocedure('hft_draft077.save_v1(jsonb)'),'EXECUTE'),false)
   AS can_save,
 pg_catalog.coalesce(pg_catalog.has_function_privilege(current_user,
   pg_catalog.to_regprocedure('hft_draft077.read_v1(jsonb)'),'EXECUTE'),false)
   AS can_read,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
 WHERE n.nspname='hft_draft077' AND p.proname IN('save_v1','read_v1')
  AND p.prosecdef AND owner.rolname='hft_r1_draft_owner'
  AND NOT owner.rolcanlogin AND NOT owner.rolsuper AND NOT owner.rolbypassrls)
 AS secured_function_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN('hft_draft077','hft','hft_secret') AND
 c.relkind IN('r','p','v','m','f','S') AND
 (CASE WHEN c.relkind='S'
  THEN pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
  ELSE pg_catalog.has_table_privilege(current_user,c.oid,
   'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
 AS direct_relation_grants,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('hft','hft_secret','hft_crypto') AND
 pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE'))
 AS operational_function_grants,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles r
 WHERE r.rolname=current_user AND r.rolcanlogin AND NOT r.rolsuper
 AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
 AND NOT r.rolbypassrls) AS restricted_login_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles r
 WHERE r.rolname IN('hft_engineering','hft_r1_posting_owner',
  'hft_r1_p3_master_owner','hft_r1_governance_issuer','hft_r1_draft_owner')
 AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER')) AS privileged_memberships
`;
type AdmissionRow=Readonly<{
 db:string;login:string;role:string;version:number;replica:boolean;
 tls:boolean;tls_version:string|null;schema_usage:boolean;schema_create:boolean;
 can_save:boolean;can_read:boolean;secured_function_count:number;
 direct_relation_grants:number;operational_function_grants:number;
 restricted_login_count:number;privileged_memberships:number;
}>;
export function openDraftPool(env:DraftEnv):DraftPgPool{
 const config=draftPgOptions(env);
 const pg=createRequire(import.meta.url)('pg') as {
  Pool:new(options:Record<string,unknown>)=>DraftPgPool};
 return new pg.Pool(config);
}
async function assertDb(c:DraftPgClient,env:DraftEnv){
 const rows=(await c.query<AdmissionRow>(DRAFT_IDENTITY_SQL)).rows;
 const x=rows[0];
 if(rows.length!==1||!x||x.db!==env.HFT_DRAFT_DATABASE||
  x.login!==env.HFT_DRAFT_DB_USER||x.role!==x.login||
  String(x.version)!==env.HFT_DRAFT_DB_VERSION||
  x.replica!==false||x.tls!==true||
  !['TLSv1.2','TLSv1.3'].includes(x.tls_version??'')||
  x.schema_usage!==true||x.schema_create!==false||
  x.can_save!==true||x.can_read!==true||
  x.secured_function_count!==2||x.direct_relation_grants!==0||
  x.operational_function_grants!==0||x.restricted_login_count!==1||
  x.privileged_memberships!==0)
  throw Error('DRAFT077_DATABASE_IDENTITY_OR_PRIVILEGES_NOT_ADMITTED');
}
async function transaction<T>(pool:DraftPgPool,env:DraftEnv,
 readOnly:boolean,run:(c:DraftPgClient)=>Promise<T>):Promise<T>{
 assertDraftProfile(env);
 const c=await pool.connect();
 let committed=false,startedCommit=false;
 try{
  await c.query(readOnly?
   'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':
   'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
  await assertDb(c,env);
  const value=await run(c);
  startedCommit=true;
  await c.query('COMMIT');committed=true;
  return value;
 }catch(error){
  if(startedCommit&&!committed)
   throw Error('DRAFT077_COMMIT_OUTCOME_UNCERTAIN_NO_RETRY');
  await c.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{c.release(startedCommit&&!committed);}
}
function dbQuery(scope:DraftScope,operator:VerifiedRequestOperator){
 assertVerifiedRequestOperator(operator,scope);
 return {...scope,actorSubject:operator.subject,sessionId:operator.sessionId};
}
export async function readDrafts(pool:DraftPgPool,env:DraftEnv,
 actor:VerifiedRequestOperator,query:DraftRead):Promise<DraftRecord[]>{
 const p=dbQuery(query,actor);
 const evidence=await transaction(pool,env,true,async c=>{
  const rows=(await c.query<{evidence:unknown}>(readSql,[JSON.stringify(p)])).rows;
  if(rows.length!==1)throw Error('DRAFT077_READ_CARDINALITY');
  return rows[0].evidence;
 });
 const records=assertDraftRecords(evidence,query,query.kind);
 return records.filter(x=>x.record_id.includes(query.search.toUpperCase()));
}
export async function saveDraft(pool:DraftPgPool,env:DraftEnv,
 actor:VerifiedRequestOperator,cmd:DraftSave):Promise<DraftRecord>{
 const p=dbQuery(cmd,actor);
 const write=await transaction(pool,env,false,async c=>{
  const rows=(await c.query<{evidence:unknown}>(saveSql,[JSON.stringify(p)])).rows;
  if(rows.length!==1||!rows[0].evidence||
   typeof rows[0].evidence!=='object'||Array.isArray(rows[0].evidence))
   throw Error('DRAFT077_SAVE_EVIDENCE_INVALID');
  const response=rows[0].evidence as Record<string,unknown>;
  if(response.state!==DRAFT_STATE||response.recordId!==cmd.recordId||
    response.writeId!==cmd.writeId||
    response.revision!==Number(cmd.expectedRevision)+1)
   throw Error('DRAFT077_REVISION_OR_WRITE_ID_UNVERIFIED');
  return response;
 });
 // A fresh connection reads the committed state. Missing result is NO RETRY.
 const records=await readDrafts(pool,env,actor,{
  contractVersion:DRAFT_CONTRACT,intent:'READ',kind:cmd.kind,
  legalEntityId:cmd.legalEntityId,siteId:cmd.siteId,
  warehouseId:cmd.warehouseId,search:cmd.recordId
 });
 const found=records.find(x=>x.record_id===cmd.recordId);
 if(!found||found.revision!==write.revision||
   Object.keys(cmd.values).some(k=>found.values[k]!==cmd.values[k]))
  throw Error('DRAFT077_COMMITTED_READBACK_REQUIRED_NO_RETRY');
 return found;
}
