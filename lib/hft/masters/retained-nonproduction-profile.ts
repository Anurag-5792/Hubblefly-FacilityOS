/** HFT R77 Masters-only retained NONPRODUCTION admission, not stock authority.
 * A configuration pin is a required admission reference, not independently
 * proven installation/approval. Deployment must be separately authorized.
 *
 * This function MUST NOT be used to authorize P0/P2/R77 stock endpoints.
 * NODE_ENV=production is permitted only for Next.js serving a retained
 * NONPRODUCTION Masters build with HFT_ENVIRONMENT=retained-nonproduction.
 */
export const RETAINED_MASTERS_PROFILE='HFT_R1_RETAINED_NONPRODUCTION_MASTERS_V1';
type Env=Readonly<Record<string,string|undefined>>;
const digest=/^[0-9a-f]{64}$/;
const retainedDb=/^hft_r1_retained_[a-z0-9_]{6,40}$/;
const login=/^hft_r1_[a-z0-9_]{5,40}$/;
const forbidden=new Set(['postgres','hft_engineering','hft_r1_posting_owner',
 'hft_r1_app_runtime','hft_r1_governance_issuer','hft_r1_p3_master_owner']);
const nonzero=(value:string|undefined)=>!!value&&digest.test(value)&&
 value!=='0'.repeat(64);
export function isRetainedMastersProfile(env:Env):boolean{
 return env.HFT_MASTERS_RUNTIME_PROFILE===RETAINED_MASTERS_PROFILE;
}
export function assertRetainedMastersProfile(env:Env):void{
 if(!isRetainedMastersProfile(env)||
  env.HFT_ENVIRONMENT!=='retained-nonproduction'||
  env.NODE_ENV!=='production'||
  env.HFT_AUTH_SOURCE!=='verified'||
  env.HFT_OPERATIONS_SOURCE!=='database'||
  env.HFT_LIVE_POSTING_ENABLED!=='false'||
  env.HFT_MASTERS_SOURCE!=='postgres_review'||
  env.HFT_DATABASE_TRANSPORT!=='ONLINE_TLS'||
  env.HFT_ONLINE_DB_CREDENTIAL_SOURCE!=='MANAGED_RUNTIME_SECRET'||
  env.HFT_POSTING_RUN_MODE!=='RETAINED_MASTERS_ONLY_NO_STOCK'||
  !nonzero(env.HFT_MASTERS_INDEPENDENT_ADMISSION_SHA256)||
  !nonzero(env.HFT_MASTERS_APPROVED_INSTALLER_SHA256)||
  !nonzero(env.HFT_MASTERS_APPROVED_RESOURCE_SHA256)||
  !/^18[0-9]{4}$/.test(env.HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM||'')||
  Number(env.HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM)<180006||
  !env.PGDATABASE||!retainedDb.test(env.PGDATABASE)||
  env.PGDATABASE!==env.HFT_MASTERS_APPROVED_PG_DATABASE||
  env.HFT_TEST_PG_DATABASE||
  !env.HFT_P3_RUNTIME_LOGIN||!login.test(env.HFT_P3_RUNTIME_LOGIN)||
  forbidden.has(env.HFT_P3_RUNTIME_LOGIN)||
  env.HFT_P3_RUNTIME_LOGIN.endsWith('_owner')||
  !env.HFT_ONLINE_P3_DB_PASSWORD||
  env.HFT_ONLINE_P3_DB_PASSWORD.length<16||
  !env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||
  !env.HFT_SESSION_ISSUER||!env.HFT_SESSION_AUDIENCE||
  !env.HFT_PUBLIC_ORIGIN)
  throw Error('P3_RETAINED_NONPRODUCTION_PROFILE_NOT_ADMITTED');
 let origin:URL;
 try{origin=new URL(env.HFT_PUBLIC_ORIGIN);}
 catch{throw Error('P3_RETAINED_PUBLIC_ORIGIN_INVALID');}
 if(origin.protocol!=='https:'||
  origin.origin!==env.HFT_PUBLIC_ORIGIN||
  origin.username||origin.password||
  origin.pathname!=='/'||origin.search||origin.hash)
  throw Error('P3_RETAINED_PUBLIC_ORIGIN_INVALID');
}
