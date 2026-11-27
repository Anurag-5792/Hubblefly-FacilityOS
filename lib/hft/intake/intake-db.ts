import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import type {LiveEnv} from '../live/live-profile.ts';
import {assertVerifiedLiveTls} from '../live/live-tls.ts';
import type {IntakeRequest} from './intake-contract.ts';
import {INTAKE_LOGIN,assertIntakeCatalog,intakeAdmissionSql} from './intake-admission.ts';
type Client={connection?:{stream?:unknown};query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>;release(destroy?:boolean):void};
type Pool={connect():Promise<Client>;end():Promise<void>;on(event:'error',listener:(error:Error)=>void):unknown};
const LOGIN=INTAKE_LOGIN;
function config(env:LiveEnv){
 const host=env.HFT_INTAKE_DB_HOST||'',database=env.HFT_INTAKE_DB_NAME||'',oid=env.HFT_INTAKE_DB_OID||'',password=env.HFT_INTAKE_DB_PASSWORD||'',ca=env.HFT_INTAKE_DB_CA_PEM||'';
 if(!/^[a-z0-9.-]+$/.test(host)||isIP(host)!==0||!host.endsWith('.neon.tech')||
 !/^hft_inventory_intake_[0-9]{3}$/.test(database)||!/^[1-9][0-9]+$/.test(oid)||password.length<16||password.length>4096||
 !ca.includes('-----BEGIN CERTIFICATE-----')||ca.length>32768)throw Error('INTAKE_DB_NOT_ADMITTED');
 return {host,database,oid,password,ca,port:5432};
}
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
   const a=await client.query(intakeAdmissionSql);
   if(a.rows.length!==1)throw Error('INTAKE_DB_NOT_ADMITTED');
   assertIntakeCatalog(a.rows[0],c);
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
  let verified:unknown;
  try{verified=await run('SELECT hft_intake.read_rename($1::uuid,$2,$3::uuid) AS data',[...prefix,req.requestId]);}
  catch(error){
   // Mutation may already have committed. Preserve access denial for UI invalidation;
   // no subsequent readback failure is a definitive mutation rejection.
   if(error instanceof Error&&error.message==='INTAKE_ACCESS_DENIED')throw error;
   throw Error('INTAKE_RENAME_UNCONFIRMED');
  }
  if(JSON.stringify(result)!==JSON.stringify(verified))throw Error('INTAKE_RENAME_UNCONFIRMED');
  return verified;
 }finally{if(!reusable)await pool.end();}
}
