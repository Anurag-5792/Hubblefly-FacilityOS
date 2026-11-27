import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import type {LiveEnv} from '../live/live-profile.ts';
import {assertVerifiedLiveTls} from '../live/live-tls.ts';
import type {IntakeRequest} from './intake-contract.ts';
type Client={connection?:{stream?:unknown};query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release(destroy?:boolean):void};
type Pool={connect():Promise<Client>;end():Promise<void>;on(event:'error',listener:(error:Error)=>void):unknown};
const LOGIN='hft_intake_api_login';
function config(env:LiveEnv){
 const host=env.HFT_INTAKE_DB_HOST||'',database=env.HFT_INTAKE_DB_NAME||'',oid=env.HFT_INTAKE_DB_OID||'',password=env.HFT_INTAKE_DB_PASSWORD||'',ca=env.HFT_INTAKE_DB_CA_PEM||'';
 if(!/^[a-z0-9.-]+$/.test(host)||isIP(host)!==0||!host.endsWith('.neon.tech')||
 !/^hft_inventory_intake_[0-9]{3}$/.test(database)||!/^[1-9][0-9]+$/.test(oid)||password.length<16||password.length>4096||
 !ca.includes('-----BEGIN CERTIFICATE-----')||ca.length>32768)throw Error('INTAKE_DB_NOT_ADMITTED');
 return {host,database,oid,password,ca,port:5432};
}
const admissionSql="SELECT current_database() db,current_user login,session_user session_login,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,(SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) FROM pg_roles WHERE rolname=current_user) restricted,(SELECT count(*)::int FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) memberships,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hft_intake' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE') WHEN c.relkind IN ('r','v','p','m','f') THEN has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') ELSE false END) direct_access,(SELECT coalesce(array_agg(p.proname ORDER BY p.proname),'{}') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_intake' AND has_function_privilege(current_user,p.oid,'EXECUTE')) functions";
type DbConfig=ReturnType<typeof config>;
function makePool(c:DbConfig,reusable:boolean):Pool{
 const pg=createRequire(import.meta.url)('pg') as {Pool:new(options:Record<string,unknown>)=>Pool};
 const pool=new pg.Pool({host:c.host,port:c.port,database:c.database,user:LOGIN,password:c.password,ssl:{rejectUnauthorized:true,servername:c.host,ca:c.ca,minVersion:'TLSv1.2'},max:reusable?2:1,connectionTimeoutMillis:5000,idleTimeoutMillis:reusable?10000:1000,allowExitOnIdle:true,statement_timeout:10000,lock_timeout:2500,application_name:'hft-intake-review'});
 // node-postgres discards idle clients on transport errors. Never log credentials or raw SQL.
 pool.on('error',()=>{});
 return pool;
}
let warmReadPool:{fingerprint:string;pool:Pool}|undefined;
function readPool(c:DbConfig):Pool{
 const fingerprint=createHash('sha256').update(JSON.stringify(c)).digest('hex');
 if(warmReadPool&&warmReadPool.fingerprint!==fingerprint)throw Error('INTAKE_DB_CONFIG_CHANGED');
 if(!warmReadPool)warmReadPool={fingerprint,pool:makePool(c,true)};
 return warmReadPool.pool;
}
export async function executeIntake(env:LiveEnv,grant:{grant:string;binding:string},req:IntakeRequest){
 const c=config(env),reusable=req.intent==='READ';
 // Reuse only read connections. All callers still pass actual TLS/catalog checks
 // and the database gateway checks the separately admitted grant on every call.
 // Rename and independent reconciliation retain fresh, discarded connections.
 const pool=reusable?readPool(c):makePool(c,false);
 const run=async(sql:string,args:unknown[])=>{
  const client=await pool.connect();let completed=false;
  try{
   assertVerifiedLiveTls(client,c.host,c.port);
   const a=(await client.query(admissionSql)).rows[0];
   if(!a||a.db!==c.database||a.oid!==c.oid||a.login!==LOGIN||a.session_login!==LOGIN||a.restricted!==true||
    a.memberships!==0||a.direct_access!==0||JSON.stringify(a.functions)!==JSON.stringify(['read_page','read_rename','rename_item']))
    throw Error('INTAKE_DB_NOT_ADMITTED');
   const r=await client.query<{data:unknown}>(sql,args);
   if(r.rows.length!==1)throw Error('INTAKE_RESULT_INVALID');
   completed=true;return r.rows[0].data;
  }finally{client.release(!reusable||!completed);}
 };
 try{
  const prefix=[grant.grant,grant.binding];
  if(req.intent==='READ')return await run('SELECT hft_intake.read_page($1::uuid,$2,$3,$4,$5,$6) AS data',[...prefix,req.view,req.search,req.offset,req.limit]);
  if(req.intent==='RECONCILE')return await run('SELECT hft_intake.read_rename($1::uuid,$2,$3::uuid) AS data',[...prefix,req.requestId]);
  const result=await run('SELECT hft_intake.rename_item($1::uuid,$2,$3::uuid,$4,$5,$6,$7) AS data',[...prefix,req.requestId,req.itemId,req.revision,req.name,req.reason]);
  const verified=await run('SELECT hft_intake.read_rename($1::uuid,$2,$3::uuid) AS data',[...prefix,req.requestId]);
  if(JSON.stringify(result)!==JSON.stringify(verified))throw Error('INTAKE_RENAME_UNCONFIRMED');
  return verified;
 }finally{if(!reusable)await pool.end();}
}
