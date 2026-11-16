/** One protected Path B draft writer and readback interface, exactly matching
 * Chat 13's hft_draft077 PG18.7 source. Never use P3 or stock SQL.
 */
import {createRequire} from 'node:module';
import {draftPgOptions,type DraftEnv} from './draft-profile.ts';
import {DRAFT_STATE,type DraftSave,type DraftRead,type DraftRecord,
 type DraftScope,assertDraftRecords}
 from './draft-contract.ts';
import {signDraftBody} from './draft-proof.ts';
import {assertVerifiedRequestOperator,type VerifiedRequestOperator}
 from '../security/verified-request.ts';
export type DraftPgClient={
 query<Row extends Record<string,unknown>>(sql:string,params?:readonly unknown[]):
  Promise<{rows:Row[]}>;
 release(destroy?:boolean):void;
};
export type DraftPgPool={connect():Promise<DraftPgClient>;end():Promise<void>};
const saveSql='SELECT hft_draft077.save_v1($1::text,$2::jsonb) AS evidence';
const readSql='SELECT hft_draft077.read_v1($1::text,$2::jsonb) AS evidence';
export const DRAFT_IDENTITY_SQL=`
SELECT current_database() AS db,session_user AS login,current_user AS role,
 current_setting('server_version_num')::integer AS version,
 pg_is_in_recovery() AS replica,
 (SELECT ssl FROM pg_catalog.pg_stat_ssl
  WHERE pid=pg_catalog.pg_backend_pid()) AS tls,
 (SELECT version FROM pg_catalog.pg_stat_ssl
  WHERE pid=pg_catalog.pg_backend_pid()) AS tls_version,
 pg_catalog.has_schema_privilege(current_user,'hft_draft077','USAGE')
  AS schema_usage,
 pg_catalog.has_schema_privilege(current_user,'hft_draft077','CREATE')
  AS schema_create,
 pg_catalog.coalesce(pg_catalog.has_function_privilege(current_user,
  pg_catalog.to_regprocedure('hft_draft077.save_v1(text,jsonb)'),'EXECUTE'),
  false) AS can_save,
 pg_catalog.coalesce(pg_catalog.has_function_privilege(current_user,
  pg_catalog.to_regprocedure('hft_draft077.read_v1(text,jsonb)'),'EXECUTE'),
  false) AS can_read,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
  WHERE n.nspname='hft_draft077' AND
   p.proname IN('save_v1','read_v1')
   AND p.prosecdef AND owner.rolname='hft_r1_draft_owner'
   AND NOT owner.rolcanlogin AND NOT owner.rolsuper AND NOT owner.rolbypassrls)
  AS secured_function_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='hft_draft077'
  AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
  AND p.proname NOT IN('save_v1','read_v1'))
  AS extra_draft_function_grants,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('hft_draft077','hft','hft_secret') AND
   c.relkind IN('r','p','v','m','f','S') AND
   (CASE WHEN c.relkind='S'
    THEN pg_catalog.has_sequence_privilege(current_user,c.oid,
     'USAGE,SELECT,UPDATE')
    ELSE pg_catalog.has_table_privilege(current_user,c.oid,
     'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END))
  AS direct_relation_grants,
 (SELECT count(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('hft','hft_secret','hft_crypto')
    AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE'))
  AS operational_function_grants,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles r
  WHERE r.rolname=current_user AND r.rolcanlogin AND NOT r.rolsuper
   AND NOT r.rolcreatedb AND NOT r.rolcreaterole
   AND NOT r.rolreplication AND NOT r.rolbypassrls)
  AS restricted_login_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles r
  WHERE r.rolname IN('hft_engineering','hft_r1_posting_owner',
   'hft_r1_p3_master_owner','hft_r1_governance_issuer','hft_r1_draft_owner')
   AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER'))
  AS privileged_memberships
`;
type AdmissionRow=Readonly<{
 db:string;login:string;role:string;version:number;replica:boolean;
 tls:boolean;tls_version:string|null;schema_usage:boolean;schema_create:boolean;
 can_save:boolean;can_read:boolean;secured_function_count:number;
 extra_draft_function_grants:number;direct_relation_grants:number;
 operational_function_grants:number;restricted_login_count:number;
 privileged_memberships:number;
}>;
export function openDraftPool(env:DraftEnv):DraftPgPool{
 const pg=createRequire(import.meta.url)('pg') as {
  Pool:new(options:Record<string,unknown>)=>DraftPgPool};
 return new pg.Pool(draftPgOptions(env));
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
  x.secured_function_count!==2||x.extra_draft_function_grants!==0||
  x.direct_relation_grants!==0||x.operational_function_grants!==0||
  x.restricted_login_count!==1||x.privileged_memberships!==0)
  throw Error('DRAFT077_DATABASE_IDENTITY_OR_PRIVILEGES_NOT_ADMITTED');
}
async function transaction<T>(pool:DraftPgPool,env:DraftEnv,
 readOnly:boolean,run:(c:DraftPgClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 let committed=false,startedCommit=false;
 try{
  await client.query(readOnly?
   'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':
   'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
  await assertDb(client,env);
  const value=await run(client);
  startedCommit=true;
  await client.query('COMMIT');committed=true;
  return value;
 }catch(error){
  if(startedCommit&&!committed)
   throw Error('DRAFT077_COMMIT_OUTCOME_UNCERTAIN_NO_RETRY');
  await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release(startedCommit&&!committed);}
}
function verifiedScope(env:DraftEnv,actor:VerifiedRequestOperator,scope:DraftScope){
 assertVerifiedRequestOperator(actor,scope);
 if(scope.legalEntityId!==env.HFT_DRAFT_SCOPE_LEGAL_ENTITY||
   scope.siteId!==env.HFT_DRAFT_SCOPE_SITE||
   scope.warehouseId!==env.HFT_DRAFT_SCOPE_WAREHOUSE)
  throw Error('DRAFT077_ENROLLED_SCOPE_IDENTITY_MISMATCH');
 return env.HFT_DRAFT_ENROLLED_SCOPE_ID!;
}
function databaseValues(cmd:DraftSave):Record<string,string>{
 const v={...cmd.values};
 if(cmd.kind==='LEGAL_ENTITY'||cmd.kind==='SITE'){
  const value=cmd.kind==='LEGAL_ENTITY'?v.legalName:v.siteName;
  return {name:value};
 }
 if(cmd.kind==='EMPLOYEE'||cmd.kind==='WAREHOUSE')delete v.siteId;
 return v;
}
function restoredValues(kind:string,values:unknown,scope:DraftScope){
 if(!values||typeof values!=='object'||Array.isArray(values))
  throw Error('DRAFT077_READ_VALUES_INVALID');
 const v=values as Record<string,unknown>;
 if(kind==='LEGAL_ENTITY')return {legalName:String(v.name||'')};
 if(kind==='SITE')return {siteName:String(v.name||'')};
 if(kind==='EMPLOYEE'||kind==='WAREHOUSE'){
  const copy=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,String(x)]));
  copy.siteId=scope.siteId;return copy;
 }
 return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,String(x)]));
}
function convertRow(item:unknown,scope:DraftScope,kind:string):DraftRecord{
 if(!item||typeof item!=='object'||Array.isArray(item))
  throw Error('DRAFT077_READ_ROW_INVALID');
 const r=item as Record<string,unknown>;
 if(r.kind!==kind||r.state!==DRAFT_STATE||r.scopeProvisional!==true||
  r.legal_entity_id!==scope.legalEntityId||r.site_id!==scope.siteId||
  r.warehouse_id!==scope.warehouseId||
  typeof r.record_id!=='string'||typeof r.revision!=='number'||
  typeof r.created_by!=='string'||typeof r.updated_by!=='string'||
  typeof r.created_at!=='string'||typeof r.updated_at!=='string')
  throw Error('DRAFT077_READ_ROW_STATUS_DRIFT');
 return {
  kind:kind as DraftRecord['kind'],
  legal_entity_id:scope.legalEntityId,site_id:scope.siteId,
  warehouse_id:scope.warehouseId,record_id:r.record_id,
  revision:r.revision,state:DRAFT_STATE,
  values:restoredValues(kind,r.values,scope),
  created_by:r.created_by,updated_by:r.updated_by,
  created_at:r.created_at,updated_at:r.updated_at
 };
}
async function readPage(c:DraftPgClient,env:DraftEnv,
 actor:VerifiedRequestOperator,scope:DraftScope,kind:string,
 intent:'GET'|'LIST',recordKey:string,search:string,offset:number,
 limit:number):Promise<DraftRecord[]>{
 const scopeId=verifiedScope(env,actor,scope);
 const body=JSON.stringify({intent,scopeId,kind,recordKey,search,
  limit:String(limit),offset:String(offset)});
 const proof=signDraftBody(env,actor,scope,'READ',body);
 const rows=(await c.query<{evidence:unknown}>(readSql,
  [body,JSON.stringify(proof)])).rows;
 const data=rows[0]?.evidence;
 if(rows.length!==1||!data||typeof data!=='object'||Array.isArray(data))
  throw Error('DRAFT077_READ_CARDINALITY');
 const e=data as Record<string,unknown>;
 if(e.state!=='DRAFT_ONLY'||e.scopeId!==scopeId||
  e.actor!==actor.subject||e.scopeProvisional!==true||
  !Array.isArray(e.records)||e.records.length>limit||
  e.limit!==limit||e.offset!==offset)
  throw Error('DRAFT077_AUTHENTICATED_READ_ENVELOPE_INVALID');
 const mapped=e.records.map(row=>convertRow(row,scope,kind));
 return assertDraftRecords({state:'DRAFT_ONLY',records:mapped},scope,kind as DraftRecord['kind']);
}
export async function readDrafts(pool:DraftPgPool,env:DraftEnv,
 actor:VerifiedRequestOperator,q:DraftRead):Promise<DraftRecord[]>{
 verifiedScope(env,actor,q);
 return transaction(pool,env,true,async c=>{
  const result:DraftRecord[]=[];
  for(let page=0;page<100;page++){
   const batch=await readPage(c,env,actor,q,q.kind,'LIST','',q.search,
    page*100,100);
   result.push(...batch);
   if(batch.length<100)return result;
  }
  throw Error('DRAFT077_READ_PAGE_LIMIT_NO_SILENT_TRUNCATION');
 });
}
async function readOne(pool:DraftPgPool,env:DraftEnv,
 actor:VerifiedRequestOperator,cmd:DraftSave):Promise<DraftRecord|undefined>{
 return transaction(pool,env,true,async c=>{
  const batch=await readPage(c,env,actor,cmd,cmd.kind,
   'GET',cmd.recordId,'',0,1);
  return batch.find(x=>x.record_id===cmd.recordId);
 });
}
export async function saveDraft(pool:DraftPgPool,env:DraftEnv,
 actor:VerifiedRequestOperator,cmd:DraftSave):Promise<DraftRecord>{
 const scopeId=verifiedScope(env,actor,cmd);
 const body=JSON.stringify({operation:cmd.operation,scopeId,
  kind:cmd.kind,recordKey:cmd.recordId,expectedVersion:cmd.expectedRevision,
  values:databaseValues(cmd),requestId:cmd.writeId,source:cmd.source});
 const proof=signDraftBody(env,actor,cmd,'WRITE',body);
 const write=await transaction(pool,env,false,async c=>{
  const rows=(await c.query<{evidence:unknown}>(saveSql,
   [body,JSON.stringify(proof)])).rows;
  const result=rows[0]?.evidence;
  if(rows.length!==1||!result||typeof result!=='object'||Array.isArray(result))
   throw Error('DRAFT077_SAVE_EVIDENCE_INVALID');
  const e=result as Record<string,unknown>;
  if(e.state!==DRAFT_STATE||e.scopeId!==scopeId||
   e.recordKey!==cmd.recordId||e.requestId!==cmd.writeId||
   e.revision!==Number(cmd.expectedRevision)+1)
   throw Error('DRAFT077_SAVE_IDENTITY_OR_REVISION_INVALID');
  return e;
 });
 // MUST be a fresh read-only connection after successful COMMIT.
 const record=await readOne(pool,env,actor,cmd);
 if(!record||record.revision!==write.revision||
  Object.keys(cmd.values).some(k=>record.values[k]!==cmd.values[k]))
  throw Error('DRAFT077_COMMITTED_READBACK_REQUIRED_NO_RETRY');
 return record;
}
