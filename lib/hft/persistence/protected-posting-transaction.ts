/**
 * HFT R1 P2: single database protected-writer transaction envelope.
 * No HTTP exposure and no activation: requires independently provisioned
 * non-owner runtime role, DB-side actor proof validation and pgcrypto.
 */
import {assertSecureStartup} from '../security/authorization.ts';
import {CommitOutcomeUncertain,type PgPool,type PgQueryClient,
  type IsolatedPgEnvironment} from './isolated-pg-transaction.ts';

function verifiedPort(v:unknown):string {
  if(typeof v!=='string'|| !/^[1-9][0-9]{0,4}$/.test(v)|| Number(v)>65535)
    throw new Error('PROTECTED_POSTGRES_PORT_NOT_APPROVED');
  return v;
}
export function assertProtectedPostingEnvironment(env:IsolatedPgEnvironment):Readonly<{
  database:string;port:string;login:string;
}> {
  assertSecureStartup(env);
  if(env.HFT_LIVE_POSTING_ENABLED!=='false'||env.HFT_POSTING_RUN_MODE!=='ISOLATED_DB_TEST')
    throw new Error('PROTECTED_POSTING_NONPRODUCTION_ONLY');
  const database=env.HFT_TEST_PG_DATABASE;
  if(!database||!/^hft_r1_disposable_[a-z0-9_]{6,40}$/.test(database)||env.PGDATABASE!==database)
    throw new Error('PROTECTED_POSTGRES_DATABASE_INVALID');
  if(env.PGHOST!=='127.0.0.1'||env.PGHOSTADDR||env.PGSERVICE||env.PGSERVICEFILE||
     env.PGOPTIONS||env.PGTARGETSESSIONATTRS)throw new Error('PROTECTED_POSTGRES_ROUTING_DENIED');
  const port=verifiedPort(env.PGPORT);
  if(port!==env.HFT_APPROVED_PG_PORT)throw new Error('PROTECTED_POSTGRES_PORT_MISMATCH');
  const login=env.HFT_P2_RUNTIME_LOGIN;
  if(!login||!/^hft_r1_[a-z0-9_]{5,40}$/.test(login)||
      login==='hft_r1_posting_owner'||login==='hft_r1_app_runtime'||login==='hft_engineering'||
      env.PGUSER!==login)throw new Error('PROTECTED_RUNTIME_LOGIN_INVALID');
  return {database,port,login};
}

/** Caller must not retry on uncertain COMMIT. Read back via a fresh connection. */
async function runProtectedTransaction<T>(pool:PgPool,env:IsolatedPgEnvironment,
  callback:(client:PgQueryClient)=>Promise<T>,readOnly:boolean):Promise<T>{
  const expected=assertProtectedPostingEnvironment(env);
  const client=await pool.connect();
  let began=false,commitStarted=false,discard=false;
  try {
    began=true;
    await client.query(readOnly
      ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
      : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout = '2500ms'");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const check=await client.query<{db_name:string;db_login:string;db_role:string;
      server_address:string|null;server_port:number|null}>(
      `SELECT current_database() AS db_name,session_user AS db_login,
       current_user AS db_role,inet_server_addr()::text AS server_address,
       inet_server_port() AS server_port`);
    const id=check.rows[0];
    if(check.rows.length!==1||id.db_name!==expected.database||
      id.db_login!==expected.login||id.db_role!==expected.login||
      id.server_address!=='127.0.0.1'||id.server_port!==Number(expected.port))
      throw new Error('PROTECTED_DATABASE_IDENTITY_ATTESTATION_FAILED');
    const result=await callback(client);
    commitStarted=true;
    await client.query('COMMIT');
    return result;
  }catch(err){
    if(began&&!commitStarted){
      try{await client.query('ROLLBACK');}
      catch(rollbackError){
        discard=true;
        throw new AggregateError([err,rollbackError],'PROTECTED_ROLLBACK_UNVERIFIED');
      }
    }
    if(commitStarted){discard=true;throw new CommitOutcomeUncertain(err);}
    throw err;
  }finally {client.release(discard);}
}

/** Only one protected writer; readback is an independently restricted,
 * SELECT-only operation and cannot repost after ambiguous COMMIT. */
export function withProtectedPostingTransaction<T>(pool:PgPool,env:IsolatedPgEnvironment,
 callback:(client:PgQueryClient)=>Promise<T>):Promise<T>{
 return runProtectedTransaction(pool,env,callback,false);
}
export function withProtectedReadbackTransaction<T>(pool:PgPool,env:IsolatedPgEnvironment,
 callback:(client:PgQueryClient)=>Promise<T>):Promise<T>{
 return runProtectedTransaction(pool,env,callback,true);
}
