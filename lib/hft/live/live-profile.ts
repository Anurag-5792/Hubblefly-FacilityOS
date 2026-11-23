/** Production R1 Masters profile. No retained/Draft/P3 profile aliases. */
import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
export const LIVE_PROFILE='HFT_R1_PRODUCTION_LIVE_MASTERS_V1' as const;
export type LiveEnv=Readonly<Record<string,string|undefined>>;
const digest=(x:string|undefined)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)&&x!=='0'.repeat(64);
const forbidden=['PGUSER','PGPASSWORD','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS',
 'PGSSLCERT','PGSSLKEY','PGSSLROOTCERT','DATABASE_URL','POSTGRES_URL',
 'POSTGRES_PRISMA_URL','POSTGRES_URL_NON_POOLING'];
export function isLiveProfile(env:LiveEnv){return env.HFT_LIVE_R1_PROFILE===LIVE_PROFILE;}
export function assertLiveProfile(env:LiveEnv):void{
 const test=env.HFT_ENVIRONMENT==='production-qualification';
 if(!isLiveProfile(env)||!['production','production-qualification'].includes(env.HFT_ENVIRONMENT??'')||
  env.NODE_ENV!=='production'||env.HFT_LIVE_POSTING_ENABLED!=='false'||
  env.HFT_AUTH_SOURCE!=='verified'||env.HFT_OPERATIONS_SOURCE!=='database'||
  !['production','preview',undefined].includes(env.VERCEL_ENV)||
  (!test&&env.VERCEL_ENV!=='production')||
  (test&&env.VERCEL_ENV==='production')||
  env.HFT_DRAFT_RUNTIME_PROFILE!==undefined||
  env.HFT_STORES_RUNTIME_PROFILE!==undefined||
  env.HFT_MASTERS_RUNTIME_PROFILE!==undefined||
  env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE!==undefined||
  !digest(env.HFT_LIVE_R1_TARGET_ADMISSION_SHA256)||
  !digest(env.HFT_LIVE_R1_INSTALLER_SHA256)||
  !digest(env.HFT_LIVE_R1_MIGRATION_0001_SHA256)||
  !digest(env.HFT_LIVE_R1_MIGRATION_0002_SHA256)||
  !digest(env.HFT_LIVE_R1_OIDC_ADMISSION_SHA256)||
  !digest(env.HFT_LIVE_R1_BACKUP_RESTORE_SHA256)||
  !digest(env.HFT_LIVE_R1_RELEASE_SHA256)||
  !env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||!env.HFT_SESSION_ISSUER||
  !env.HFT_SESSION_AUDIENCE||!env.HFT_PUBLIC_ORIGIN||
  env.HFT_LIVE_R1_PROJECT==='wandering-cake-50222227'||
  env.HFT_LIVE_R1_BRANCH==='br-shiny-night-b3qgsj8t'||
  env.HFT_LIVE_R1_DATABASE==='hft_r1_retained_masters_np077'||
  !env.HFT_LIVE_R1_PROJECT||!env.HFT_LIVE_R1_BRANCH||
  !/^hft_r1_live_[a-z0-9_]{6,40}$/.test(env.HFT_LIVE_R1_DATABASE??'')||
  !/^[0-9]+$/.test(env.HFT_LIVE_R1_DATABASE_OID??'')||
  !/^18[0-9]{4}$/.test(env.HFT_LIVE_R1_PG_VERSION??'')||
  !/^[a-z0-9][a-z0-9-]*$/.test(env.HFT_LIVE_R1_PROJECT)||
  !/^[a-z0-9][a-z0-9-]*$/.test(env.HFT_LIVE_R1_BRANCH)||
  !env.HFT_LIVE_R1_HOST||env.HFT_LIVE_R1_HOST.length>253||
  isIP(env.HFT_LIVE_R1_HOST)!==0||env.HFT_LIVE_R1_HOST.endsWith('.local')||
  env.HFT_LIVE_R1_HOST.split('.').length<3||
  env.HFT_LIVE_R1_HOST.split('.').some(x=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))||
  !/^[1-9][0-9]{0,4}$/.test(env.HFT_LIVE_R1_PORT??'')||
  Number(env.HFT_LIVE_R1_PORT)>65535||
  env.HFT_LIVE_R1_APPROVED_HOST!==env.HFT_LIVE_R1_HOST||
  env.HFT_LIVE_R1_LOGIN!=='hft_r1_live_api_login'||
  !env.HFT_LIVE_R1_PASSWORD||env.HFT_LIVE_R1_PASSWORD.length<16||
  env.HFT_LIVE_R1_PASSWORD.length>4096||
  forbidden.some(x=>Boolean(env[x])))
  throw Error('LIVE_R1_PRODUCTION_PROFILE_NOT_ADMITTED');
 let u:URL;
 try{u=new URL(env.HFT_PUBLIC_ORIGIN!);}catch{throw Error('LIVE_R1_ORIGIN_INVALID');}
 if(u.origin!==env.HFT_PUBLIC_ORIGIN||u.protocol!=='https:'||u.pathname!=='/'||
  u.username||u.password||u.search||u.hash)throw Error('LIVE_R1_ORIGIN_INVALID');
 const ca=env.HFT_LIVE_R1_CA_PEM??'';
 const rx=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
 const list=[...ca.matchAll(rx)].map(x=>x[0]);
 if(!list.length||list.length>8||ca.length>32768||ca.replace(rx,'').trim())
  throw Error('LIVE_R1_CA_INVALID');
 try{for(const p of list){const c=new X509Certificate(p);
   if(!c.ca||Date.now()<Date.parse(c.validFrom)||Date.now()>=Date.parse(c.validTo))
    throw Error('LIVE_R1_CA_INVALID');
 }}catch{throw Error('LIVE_R1_CA_INVALID');}
}
export function livePgOptions(env:LiveEnv):Record<string,unknown>{
 assertLiveProfile(env);
 return {host:env.HFT_LIVE_R1_HOST,port:Number(env.HFT_LIVE_R1_PORT),
  user:env.HFT_LIVE_R1_LOGIN,password:env.HFT_LIVE_R1_PASSWORD,
  database:env.HFT_LIVE_R1_DATABASE,
  ssl:{rejectUnauthorized:true,servername:env.HFT_LIVE_R1_HOST,
   ca:env.HFT_LIVE_R1_CA_PEM,minVersion:'TLSv1.2'},
  max:3,connectionTimeoutMillis:4000,idleTimeoutMillis:1500,allowExitOnIdle:true,
  application_name:'hft-facilityos-live-r1-masters'};
}
