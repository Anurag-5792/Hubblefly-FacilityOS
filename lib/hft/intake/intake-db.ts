import {createRequire} from 'node:module';
import {isIP} from 'node:net';
import type {LiveEnv} from '../live/live-profile.ts';
import {assertVerifiedLiveTls} from '../live/live-tls.ts';
import type {IntakeRequest} from './intake-contract.ts';
type Client={connection?:{stream?:unknown};query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release(destroy?:boolean):void};
type Pool={connect():Promise<Client>;end():Promise<void>};
const LOGIN='hft_intake_api_login';
function config(env:LiveEnv){
 const host=env.HFT_INTAKE_DB_HOST||'',database=env.HFT_INTAKE_DB_NAME||'',oid=env.HFT_INTAKE_DB_OID||'',password=env.HFT_INTAKE_DB_PASSWORD||'',ca=env.HFT_INTAKE_DB_CA_PEM||'';
 if(!/^[a-z0-9.-]+$/.test(host)||isIP(host)!==0||!host.endsWith('.neon.tech')||
 !/^hft_inventory_intake_[0-9]{3}$/.test(database)||!/^[1-9][0-9]+$/.test(oid)||password.length<16||password.length>4096||
 !ca.includes('-----BEGIN CERTIFICATE-----')||ca.length>32768)throw Error('INTAKE_DB_NOT_ADMITTED');
 return {host,database,oid,password,ca,port:5432};
}
const admissionSql="SELECT current_database() db,current_user login,session_user session_login,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,(SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) FROM pg_roles WHERE rolname=current_user) restricted,(SELECT count(*)::int FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) memberships,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hft_intake' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE') WHEN c.relkind IN ('r','v','p','m','f') THEN has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') ELSE false END) direct_access,(SELECT coalesce(array_agg(p.proname ORDER BY p.proname),'{}') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_intake' AND has_function_privilege(current_user,p.oid,'EXECUTE')) functions";
export async function executeIntake(env:LiveEnv,grant:{grant:string;binding:string},req:IntakeRequest){
 const c=config(env);const pg=createRequire(import.meta.url)('pg') as {Pool:new(options:Record<string,unknown>)=>Pool};
 const pool=new pg.Pool({host:c.host,port:c.port,database:c.database,user:LOGIN,password:c.password,ssl:{rejectUnauthorized:true,servername:c.host,ca:c.ca,minVersion:'TLSv1.2'},max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,allowExitOnIdle:true,application_name:'hft-intake-review'});
 const run=async(sql:string,args:unknown[])=>{
  const client=await pool.connect();
  try{
   assertVerifiedLiveTls(client,c.host,c.port);
   const a=(await client.query(admissionSql)).rows[0];
   if(!a||a.db!==c.database||a.oid!==c.oid||a.login!==LOGIN||a.session_login!==LOGIN||a.restricted!==true||
    a.memberships!==0||a.direct_access!==0||JSON.stringify(a.functions)!==JSON.stringify(['read_page','read_rename','rename_item']))
    throw Error('INTAKE_DB_NOT_ADMITTED');
   const r=await client.query<{data:unknown}>(sql,args);
   if(r.rows.length!==1)throw Error('INTAKE_RESULT_INVALID');
   return r.rows[0].data;
  }finally{client.release(true);}
 };
 try{
  const prefix=[grant.grant,grant.binding];
  if(req.intent==='READ')return await run('SELECT hft_intake.read_page($1::uuid,$2,$3,$4,$5,$6) AS data',[...prefix,req.view,req.search,req.offset,req.limit]);
  if(req.intent==='RECONCILE')return await run('SELECT hft_intake.read_rename($1::uuid,$2,$3::uuid) AS data',[...prefix,req.requestId]);
  const result=await run('SELECT hft_intake.rename_item($1::uuid,$2,$3::uuid,$4,$5,$6,$7) AS data',[...prefix,req.requestId,req.itemId,req.revision,req.name,req.reason]);
  const verified=await run('SELECT hft_intake.read_rename($1::uuid,$2,$3::uuid) AS data',[...prefix,req.requestId]);
  if(JSON.stringify(result)!==JSON.stringify(verified))throw Error('INTAKE_RENAME_UNCONFIRMED');
  return verified;
 }finally{await pool.end();}
}
