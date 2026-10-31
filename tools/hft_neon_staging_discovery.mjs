/** Preview-only Neon read-only identification. No DDL/DML or credential output. */
import {isIP} from 'node:net';
import {fileURLToPath} from 'node:url';
const approvedBranch='engineering/hft-r1-stores-foundation';
const queries=[
 'BEGIN READ ONLY',
 "SELECT current_database() AS db,current_user AS login,current_setting('server_version_num')::integer AS ver,current_setting('transaction_read_only') AS readonly",
 'SELECT ssl,version,cipher FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()',
 "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user",
 "SELECT pg_catalog.to_regclass('hft.schema_revision') IS NOT NULL AS revision,pg_catalog.to_regclass('hft.stock_account') IS NOT NULL AS ledger,pg_catalog.to_regprocedure('hft.post_stock_command_protected_v1(jsonb,jsonb)') IS NOT NULL AS writer",
 'ROLLBACK'
];
export function previewConfig(env){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==approvedBranch)
  return null;
 const host=env.HFT_STAGING_PGHOST,db=env.HFT_STAGING_PGDATABASE,
  login=env.HFT_STAGING_PGUSER,password=env.HFT_STAGING_PGPASSWORD;
 if(typeof host!=='string'||!host.endsWith('.neon.tech')||isIP(host)||
  !/^[a-z0-9.-]{8,253}$/.test(host)||host.startsWith('.')||
  typeof db!=='string'||!/^[A-Za-z_][A-Za-z0-9_.-]{0,126}$/.test(db)||
  typeof login!=='string'||!login||typeof password!=='string'||password.length<8||
  typeof env.HFT_STAGING_NEON_PROJECT_ID!=='string'||
  !env.HFT_STAGING_NEON_PROJECT_ID)
  throw Error('STAGING_CONFIG_UNQUALIFIED');
 return {host,db,login,password};
}
export async function inspectReadOnly(pool,cfg){
 let client,begun=false;
 try{
  client=await pool.connect();
  await client.query(queries[0]);begun=true;
  const rows=[];
  for(let i=1;i<5;i++){
   const result=await client.query(queries[i]);
   if(result.rows.length!==1)throw Error('ROWSET_INVALID');
   rows.push(result.rows[0]);
  }
  const [id,tls,role,schema]=rows;
  // Report only fixed mismatch categories, never actual values.
  if(id.db!==cfg.db)throw Error('DATABASE_NAME_NOT_MATCHED');
  if(id.login!==cfg.login)throw Error('DATABASE_LOGIN_NOT_MATCHED');
  if(id.readonly!=='on')throw Error('SQL_TRANSACTION_NOT_READ_ONLY');
  if(!Number.isInteger(id.ver)||id.ver<150000)throw Error('POSTGRES_VERSION_UNQUALIFIED');
  if(tls.ssl!==true||!['TLSv1.2','TLSv1.3'].includes(tls.version)||
    !tls.cipher)throw Error('DATABASE_BACKEND_TLS_UNVERIFIED');
  if(typeof role.rolsuper!=='boolean')throw Error('DATABASE_ROLE_CATALOG_INVALID');
  if(typeof schema.revision!=='boolean')throw Error('DATABASE_SCHEMA_CATALOG_INVALID');
  await client.query(queries[5]);begun=false;
  return {connected:true,tlsVerified:true,readOnly:true,
   pgMajor:Math.floor(id.ver/10000),
   ownerLike:Boolean(role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolbypassrls),
   schemaPresent:schema.revision,ledgerPresent:schema.ledger,
   protectedWriterPresent:schema.writer,stockPosting:'NOT_RUN',production:'NO_GO'};
 }finally{
  if(client){if(begun)try{await client.query('ROLLBACK');}catch{}client.release();}
  await pool.end();
 }
}
export async function discover(env,poolFactory){
 const cfg=previewConfig(env);
 if(cfg===null)return {skipped:'NOT_TARGET_PREVIEW'};
 const pool=await poolFactory({host:cfg.host,database:cfg.db,user:cfg.login,password:cfg.password,
  port:5432,ssl:{rejectUnauthorized:true,servername:cfg.host,minVersion:'TLSv1.2'},
  max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,
  query_timeout:8000,allowExitOnIdle:true});
 return inspectReadOnly(pool,cfg);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const r=await discover(process.env,async options=>{
   const {Pool}=await import('pg');return new Pool(options);
  });
  process.stdout.write('HFT_NEON_STAGING_DISCOVERY='+JSON.stringify(r)+'\n');
 }catch(error){
  // Never log raw database errors, host, URI, login or connection secrets.
  const safe=new Set(['STAGING_CONFIG_UNQUALIFIED',
   'DATABASE_NAME_NOT_MATCHED','DATABASE_LOGIN_NOT_MATCHED',
   'SQL_TRANSACTION_NOT_READ_ONLY','POSTGRES_VERSION_UNQUALIFIED',
   'DATABASE_BACKEND_TLS_UNVERIFIED','DATABASE_ROLE_CATALOG_INVALID',
   'DATABASE_SCHEMA_CATALOG_INVALID','ROWSET_INVALID']);
  const msg=error instanceof Error?error.message:'';
  const code=safe.has(msg)?msg: error&&typeof error==='object'?(
   error.code==='28P01'?'AUTHENTICATION_REJECTED':
   error.code==='3D000'?'DATABASE_NOT_FOUND':
   error.code==='42501'?'PRIVILEGE_DENIED':
   error.code==='42601'?'SQL_SYNTAX_REJECTED':
   error.code==='ENOTFOUND'?'DNS_UNAVAILABLE':
   error.code==='ETIMEDOUT'?'NETWORK_TIMEOUT':
   error.code==='ECONNREFUSED'?'NETWORK_REFUSED':
   'CONNECT_OR_QUERY_FAILED'):'CONNECT_OR_QUERY_FAILED';
  process.stderr.write('HFT_NEON_STAGING_DISCOVERY=FAILED_CLOSED:'+code+'\n');
  process.exitCode=1;
 }
}

