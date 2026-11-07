/** HFT online PostgreSQL transport: server-only, no production activation. */
import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {createRequire} from 'node:module';
import type {IsolatedPgEnvironment,PgPool,PgQueryClient} from './isolated-pg-transaction.ts';
export type OnlinePgDuty='P2_STORES'|'P3_MASTERS';
export type OnlinePgPool=PgPool&{end():Promise<void>};
const dnsLabel=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const roleName=/^hft_r1_[a-z0-9_]{5,40}$/;
const dbName=/^hft_r1_disposable_[a-z0-9_]{6,40}$/;
const forbiddenRoles=new Set(['postgres','hft_engineering','hft_r1_posting_owner',
 'hft_r1_p3_master_owner','hft_r1_app_runtime','hft_r1_governance_issuer']);
const forbidden=['PGUSER','PGPASSWORD','PGHOSTADDR','PGSERVICE','PGSERVICEFILE',
 'PGOPTIONS','PGTARGETSESSIONATTRS','PGSSLKEY','PGSSLCERT','PGSSLROOTCERT',
 'PGPASSFILE','DATABASE_URL','POSTGRES_URL','POSTGRES_PRISMA_URL',
 'POSTGRES_URL_NON_POOLING'];
export const isOnlinePgTransport=(env:IsolatedPgEnvironment):boolean=>
 env.HFT_DATABASE_TRANSPORT==='ONLINE_TLS';
function trustedHost(env:IsolatedPgEnvironment):string{
 const host=env.PGHOST;
 if(!host||host!==env.HFT_ONLINE_DB_ENDPOINT_HOST||host.length>253||
  host!==host.toLowerCase()||host.endsWith('.')||isIP(host)!==0||
  host.split('.').length<2||host.split('.').some(x=>!dnsLabel.test(x))||
  host.endsWith('.local')||host.endsWith('.localhost'))
  throw Error('HFT_ONLINE_DB_ENDPOINT_NOT_ATTESTED');
 return host;
}
function trustedCa(env:IsolatedPgEnvironment):string{
 const pem=env.HFT_ONLINE_DB_TLS_CA_PEM;
 if(!pem||pem.length>32768)throw Error('HFT_ONLINE_DB_CA_REQUIRED');
 const rx=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
 const blocks=[...pem.matchAll(rx)].map(x=>x[0]);
 if(blocks.length===0||blocks.length>8||pem.replace(rx,'').trim()!=='')
  throw Error('HFT_ONLINE_DB_CA_INVALID');
 try{
  for(const part of blocks){
   const c=new X509Certificate(part),now=Date.now();
   if(!c.ca||!Number.isFinite(Date.parse(c.validFrom))||
    !Number.isFinite(Date.parse(c.validTo))||now<Date.parse(c.validFrom)||
    now>=Date.parse(c.validTo))throw Error('HFT_ONLINE_DB_CA_INVALID');
  }
 }catch{throw Error('HFT_ONLINE_DB_CA_INVALID');}
 return pem;
}
export type OnlinePgIdentity=Readonly<{host:string;port:number;login:string;
 password:string;database:string;ca:string}>;
export function assertOnlinePgTransport(
 env:IsolatedPgEnvironment,duty:OnlinePgDuty):OnlinePgIdentity{
 if(!isOnlinePgTransport(env)||
  env.HFT_ONLINE_DB_CREDENTIAL_SOURCE!=='MANAGED_RUNTIME_SECRET')
  throw Error('HFT_ONLINE_DB_MANAGED_SECRET_REQUIRED');
 if(forbidden.some(x=>Boolean(env[x]))||
  (env.PGSSLMODE!==undefined&&env.PGSSLMODE!=='verify-full'))
  throw Error('HFT_ONLINE_DB_AMBIENT_ROUTING_DENIED');
 const host=trustedHost(env),port=env.PGPORT;
 const backend=env.HFT_ONLINE_DB_BACKEND_PORT;
 if(!port||!/^[1-9][0-9]{0,4}$/.test(port)||Number(port)>65535||
  port!==env.HFT_APPROVED_PG_PORT||!backend||
  !/^[1-9][0-9]{0,4}$/.test(backend)||Number(backend)>65535)
  throw Error('HFT_ONLINE_DB_PORT_NOT_ATTESTED');
 const database=env.PGDATABASE;
 if(!database||!dbName.test(database)||database!==env.HFT_TEST_PG_DATABASE)
  throw Error('HFT_ONLINE_DB_DISPOSABLE_DATABASE_REQUIRED');
 const p2=env.HFT_P2_RUNTIME_LOGIN,p3=env.HFT_P3_RUNTIME_LOGIN;
 if(!p2||!p3||p2===p3)throw Error('HFT_ONLINE_DB_SEPARATE_ROLES_REQUIRED');
 const login=duty==='P2_STORES'?p2:p3;
 if(!roleName.test(login)||forbiddenRoles.has(login)||
  /(_owner|_admin|_superuser)$/.test(login))
  throw Error('HFT_ONLINE_DB_RUNTIME_ROLE_INVALID');
 const password=duty==='P2_STORES'?
  env.HFT_ONLINE_P2_DB_PASSWORD:env.HFT_ONLINE_P3_DB_PASSWORD;
 if(!password||password.length<16||password.length>4096)
  throw Error('HFT_ONLINE_DB_RUNTIME_SECRET_UNAVAILABLE');
 return {host,port:Number(port),database,login,password,ca:trustedCa(env)};
}
export function onlinePgPoolOptions(env:IsolatedPgEnvironment,
 duty:OnlinePgDuty):Record<string,unknown>{
 const c=assertOnlinePgTransport(env,duty);
 return {host:c.host,port:c.port,user:c.login,password:c.password,
  database:c.database,ssl:{rejectUnauthorized:true,servername:c.host,
   ca:c.ca,minVersion:'TLSv1.2'},
  connectionTimeoutMillis:3500,idleTimeoutMillis:5000,max:2,
  keepAlive:true,allowExitOnIdle:true,
  application_name:'hft-r1-protected-online-disposable'};
}
export function openOnlinePgPool(env:IsolatedPgEnvironment,
 duty:OnlinePgDuty):OnlinePgPool{
 const options=onlinePgPoolOptions(env,duty);
 const pg=createRequire(import.meta.url)('pg') as {
  Pool:new(config:Record<string,unknown>)=>OnlinePgPool};
 return new pg.Pool(options);
}
export async function assertOnlinePgBackendTls(client:PgQueryClient):Promise<void>{
 const r=await client.query<{tls_enabled:boolean;tls_version:string|null;
  tls_cipher:string|null}>('SELECT ssl AS tls_enabled,version AS tls_version,'+
  'cipher AS tls_cipher FROM pg_catalog.pg_stat_ssl '+
  'WHERE pid=pg_catalog.pg_backend_pid()');
 if(r.rows.length!==1||r.rows[0].tls_enabled!==true||
  !['TLSv1.2','TLSv1.3'].includes(r.rows[0].tls_version??'')||
  !r.rows[0].tls_cipher)throw Error('HFT_ONLINE_DB_BACKEND_TLS_UNVERIFIED');
}
export function assertOnlineBackendIdentity(env:IsolatedPgEnvironment,
 id:Readonly<{db_name:string;db_login:string;db_role:string;
 server_address:string|null;server_port:number|null}>,duty:OnlinePgDuty):void{
 const expected=assertOnlinePgTransport(env,duty);
 if(id.db_name!==expected.database||id.db_login!==expected.login||
  id.db_role!==expected.login||!id.server_address||
  isIP(id.server_address)===0||
  id.server_port!==Number(env.HFT_ONLINE_DB_BACKEND_PORT))
  throw Error('HFT_ONLINE_DB_BACKEND_IDENTITY_UNVERIFIED');
}
