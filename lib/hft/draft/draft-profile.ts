/** Isolated retained DRAFT admission. Not P3, stock, or production authority.
 * Chat 13 must independently install hft_draft077 and bind runtime secrets.
 */
import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
export const DRAFT_PROFILE='HFT_R1_RETAINED_DRAFT_077_V1' as const;
export type DraftEnv=Readonly<Record<string,string|undefined>>;
const hex=/^[a-f0-9]{64}$/;
const dns=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const forbidden=['PGUSER','PGPASSWORD','PGHOSTADDR','PGSERVICE','PGOPTIONS',
 'PGSSLKEY','PGSSLCERT','PGSSLROOTCERT','DATABASE_URL','POSTGRES_URL',
 'POSTGRES_PRISMA_URL','POSTGRES_URL_NON_POOLING'];
export function isDraftMode(env:DraftEnv):boolean{
 return env.HFT_DRAFT_RUNTIME_PROFILE===DRAFT_PROFILE;
}
export function assertDraftProfile(env:DraftEnv):void{
 const host=env.HFT_DRAFT_DB_HOST||'';
 const port=env.HFT_DRAFT_DB_PORT||'';
 const user=env.HFT_DRAFT_DB_USER||'';
 const password=env.HFT_DRAFT_DB_PASSWORD||'';
 if(!isDraftMode(env)||env.NODE_ENV!=='production'||
   env.HFT_ENVIRONMENT!=='retained-draft-nonproduction'||
   env.HFT_AUTH_SOURCE!=='verified'||
   env.HFT_LIVE_POSTING_ENABLED!=='false'||
   env.HFT_DRAFT_DATABASE!=='hft_r1_retained_masters_np077'||
   env.HFT_DRAFT_DB_PROJECT!=='wandering-cake-50222227'||
   env.HFT_DRAFT_DB_BRANCH!=='br-shiny-night-b3qgsj8t'||
   env.HFT_DRAFT_DB_VERSION!=='180007'||
   host!==env.HFT_DRAFT_APPROVED_HOST||host.length>253||
   isIP(host)!==0||host.endsWith('.local')||host.endsWith('.localhost')||
   host.split('.').length<2||host.split('.').some(x=>!dns.test(x))||
   !/^[1-9][0-9]{0,4}$/.test(port)||Number(port)>65535||
   user!=='hft_draft077_api_login'||
   password.length<16||password.length>4096||
   !hex.test(env.HFT_DRAFT_APPROVED_SCHEMA_SHA256||'')||
   !hex.test(env.HFT_DRAFT_INDEPENDENT_ADMISSION_SHA256||'')||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
     .test(env.HFT_DRAFT_ENROLLED_SCOPE_ID||'')||
   !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(env.HFT_DRAFT_SCOPE_LEGAL_ENTITY||'')||
   !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(env.HFT_DRAFT_SCOPE_SITE||'')||
   !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(env.HFT_DRAFT_SCOPE_WAREHOUSE||'')||
   !/^[1-9][0-9]{0,7}$/.test(env.HFT_DRAFT_HMAC_KEY_VERSION||'')||
   !env.HFT_DRAFT_HMAC_KEY_BASE64||
   !env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||
   !env.HFT_SESSION_ISSUER||!env.HFT_SESSION_AUDIENCE||
   !env.HFT_PUBLIC_ORIGIN||
   forbidden.some(x=>Boolean(env[x])))
  throw Error('HFT_DRAFT077_PROFILE_NOT_ADMITTED');
 const key=Buffer.from(env.HFT_DRAFT_HMAC_KEY_BASE64!,'base64');
 if(key.length<32||key.length>128)
  throw Error('HFT_DRAFT077_HMAC_CREDENTIAL_NOT_ADMITTED');
 key.fill(0);
 const origin=env.HFT_PUBLIC_ORIGIN;
 let parsed:URL;
 try{parsed=new URL(origin);}catch{throw Error('HFT_DRAFT077_ORIGIN_NOT_ADMITTED');}
 if(parsed.origin!==origin||parsed.protocol!=='https:'||
   parsed.username||parsed.password||parsed.pathname!=='/'||
   parsed.search||parsed.hash)
  throw Error('HFT_DRAFT077_ORIGIN_NOT_ADMITTED');
 const ca=env.HFT_DRAFT_TLS_CA_PEM||'';
 const regex=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
 const chain=[...ca.matchAll(regex)].map(x=>x[0]);
 if(!chain.length||chain.length>8||ca.replace(regex,'').trim()!=='')
  throw Error('HFT_DRAFT077_TLS_TRUST_ROOT_INVALID');
 try{
  const now=Date.now();
  for(const pem of chain){
   const crt=new X509Certificate(pem);
   if(!crt.ca||now<Date.parse(crt.validFrom)||now>=Date.parse(crt.validTo))
    throw Error('HFT_DRAFT077_TLS_TRUST_ROOT_EXPIRED');
  }
 }catch{throw Error('HFT_DRAFT077_TLS_TRUST_ROOT_INVALID');}
}
export function draftPgOptions(env:DraftEnv):Record<string,unknown>{
 assertDraftProfile(env);
 return {
  host:env.HFT_DRAFT_DB_HOST,
  port:Number(env.HFT_DRAFT_DB_PORT),
  user:env.HFT_DRAFT_DB_USER,
  password:env.HFT_DRAFT_DB_PASSWORD,
  database:env.HFT_DRAFT_DATABASE,
  ssl:{rejectUnauthorized:true,servername:env.HFT_DRAFT_DB_HOST,
    ca:env.HFT_DRAFT_TLS_CA_PEM,minVersion:'TLSv1.2'},
  connectionTimeoutMillis:4500,idleTimeoutMillis:2000,
  max:2,allowExitOnIdle:true,statement_timeout:12000,
  application_name:'hft-facilityos-retained-draft077'
 };
}
