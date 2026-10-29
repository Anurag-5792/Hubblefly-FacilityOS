/** Database-backed P3 master drafts; never directly writes operational masters.
 * Explicit isolated nonproduction runtime only; no production or live posting.
 */
import {createRequire} from 'node:module';
import {assertSecureStartup} from '../security/authorization.ts';
import {CommitOutcomeUncertain,type PgPool,type PgQueryClient,
 type IsolatedPgEnvironment} from '../persistence/isolated-pg-transaction.ts';

export function assertP3Environment(env:IsolatedPgEnvironment):void{
 assertSecureStartup(env);
 if(env.HFT_MASTERS_SOURCE!=='postgres_review'||
    env.HFT_LIVE_POSTING_ENABLED!=='false'||
    env.PGHOST!=='127.0.0.1'||env.PGHOSTADDR||env.PGSERVICE||
    env.PGSERVICEFILE||env.PGOPTIONS||env.PGTARGETSESSIONATTRS||
    env.PGDATABASE!==env.HFT_TEST_PG_DATABASE||
    !/^hft_r1_disposable_[a-z0-9_]{6,40}$/.test(env.PGDATABASE||'')||
    !/^[1-9][0-9]{0,4}$/.test(env.PGPORT||'')||
    Number(env.PGPORT)>65535||env.PGPORT!==env.HFT_APPROVED_PG_PORT||
    env.PGUSER!==env.HFT_P3_RUNTIME_LOGIN||
    !/^hft_r1_[a-z0-9_]{5,40}$/.test(env.PGUSER||'')||
    ['hft_engineering','hft_r1_posting_owner','hft_r1_app_runtime',
     'hft_r1_governance_issuer'].includes(env.PGUSER||''))
   throw new Error('P3_ISOLATED_DATABASE_NOT_QUALIFIED');
}
/** Node runtime optional bridge. No dependency was installed or provisioned. */
export function openP3Pool(env:IsolatedPgEnvironment):PgPool{
 assertP3Environment(env);
 if(!env.PGPASSWORD)throw new Error('P3_DATABASE_CREDENTIAL_NOT_CONFIGURED');
 let mod:{Pool:new(options:Record<string,unknown>)=>PgPool};
 try{mod=createRequire(import.meta.url)('pg') as typeof mod;}
 catch{throw new Error('P3_POSTGRES_DRIVER_NOT_INSTALLED');}
 return new mod.Pool({host:env.PGHOST,port:Number(env.PGPORT),user:env.PGUSER,
  database:env.PGDATABASE,password:env.PGPASSWORD,ssl:false,
  connectionTimeoutMillis:2000,idleTimeoutMillis:5000,max:3});
}
export async function withP3Database<T>(pool:PgPool,env:IsolatedPgEnvironment,
 readOnly:boolean,work:(client:PgQueryClient)=>Promise<T>):Promise<T>{
 assertP3Environment(env);
 const client=await pool.connect();let begun=false,commitStarted=false,discard=false;
 try{
  begun=true;
  await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':
   'BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query("SET LOCAL lock_timeout = '2500ms'");
  await client.query("SET LOCAL statement_timeout = '15000ms'");
  const result=await client.query<{db_name:string;db_login:string;db_role:string;
   server_address:string|null;server_port:number|null}>(
   'SELECT current_database() AS db_name,session_user AS db_login,current_user AS db_role,'+
   'inet_server_addr()::text AS server_address,inet_server_port() AS server_port');
  const info=result.rows[0];
  if(result.rows.length!==1||info.db_name!==env.PGDATABASE||
   info.db_login!==env.PGUSER||info.db_role!==env.PGUSER||
   info.server_address!=='127.0.0.1'||info.server_port!==Number(env.PGPORT))
   throw new Error('P3_DATABASE_IDENTITY_FAILED');
  const value=await work(client);
  commitStarted=true;
  await client.query('COMMIT');
  return value;
 }catch(err){
  if(begun&&!commitStarted){
   try{await client.query('ROLLBACK');}
   catch(rollbackError){discard=true;throw new AggregateError([err,rollbackError],'P3_ROLLBACK_UNVERIFIED');}
  }
  if(commitStarted){discard=true;throw new CommitOutcomeUncertain(err);}
  throw err;
 }finally{client.release(discard);}
}
