/** Exact restricted PG18.7 operational Stores profile. This is a routing
 * precondition, NOT independent permission to install SQL or post material.
 * The backend reattests role/function ACLs, signer and TLS per connection.
 */
export const STORES_PROFILE='HFT_R1_STORES_RETAINED_NONPRODUCTION_077_V1' as const;
/** Current Chat13 stage-75 REVIEW hash; a changed final installer must be
 * independently re-pinned in source, never trusted from arbitrary env text.
 * This pin alone is not installation authority.
 */
export const STORES_GATEWAY_REVIEW_SHA256=
 'b2c10d799b8a16b609de5d94fe8296d2b9cc4bfb7dfe701b22aec0a1f4b9e10d';
type Env=Readonly<Record<string,string|undefined>>;
const digest=/^[a-f0-9]{64}$/;
function pin(s:string|undefined){return !!s&&digest.test(s)&&s!=='0'.repeat(64);}
export function isRetainedStoresProfile(env:Env){
 return env.HFT_STORES_RUNTIME_PROFILE===STORES_PROFILE;
}
export function assertRetainedStoresProfile(env:Env):void{
 if(!isRetainedStoresProfile(env)||
    env.NODE_ENV!=='production'||
    env.HFT_ENVIRONMENT!=='retained-stores-nonproduction'||
    env.HFT_AUTH_SOURCE!=='verified'||
    env.HFT_OPERATIONS_SOURCE!=='database'||
    env.HFT_LIVE_POSTING_ENABLED!=='false'||
    env.HFT_DATABASE_TRANSPORT!=='ONLINE_TLS'||
    env.HFT_ONLINE_DB_CREDENTIAL_SOURCE!=='MANAGED_RUNTIME_SECRET'||
    env.HFT_POSTING_RUN_MODE!=='RETAINED_STORES_OPERATIONAL_077'||
    env.HFT_OPS_A2_SOURCE_MODE!=='OPS_A2_ADMITTED_STORES_OPERATOR_V1'||
    env.HFT_STORES_SQL_CONTRACT!=='HFT_R1_OPS_A2_OPERATIONAL_PG187_V2'||
    env.HFT_STORES_RESOURCE_PROJECT!=='wandering-cake-50222227'||
    env.HFT_STORES_RESOURCE_BRANCH!=='br-shiny-night-b3qgsj8t'||
    env.PGDATABASE!=='hft_r1_retained_masters_np077'||
    env.HFT_STORES_APPROVED_DATABASE!==env.PGDATABASE||
    env.HFT_STORES_APPROVED_PG_VERSION!=='180007'||
    env.HFT_P2_RUNTIME_LOGIN!=='hft_r1_stores_np_login'||
    !!env.HFT_TEST_PG_DATABASE||
    env.HFT_STORES_APPROVED_OPERATOR_GATEWAY_SHA256!==STORES_GATEWAY_REVIEW_SHA256||
    env.HFT_STORES_OPERATOR_GATEWAY_ABI!=='HF13_OPS_A2_OPERATOR_RECEIVE_V1'||
    !pin(env.HFT_STORES_APPROVED_INSTALLER_SHA256)||
    !pin(env.HFT_STORES_INDEPENDENT_EXECUTION_ADMISSION_SHA256)||
    !pin(env.HFT_STORES_APPROVED_RESOURCE_SHA256)||
    !pin(env.HFT_STORES_SIGNING_ENROLLMENT_SHA256)||
    !env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||
    !env.HFT_SESSION_ISSUER||!env.HFT_SESSION_AUDIENCE||
    !env.HFT_PUBLIC_ORIGIN)
  throw Error('OPS_A2_RETAINED_STORES_PROFILE_NOT_ADMITTED');
 let parsed:URL;
 try{parsed=new URL(env.HFT_PUBLIC_ORIGIN);}
 catch{throw Error('OPS_A2_STORES_PUBLIC_ORIGIN_INVALID');}
 if(parsed.protocol!=='https:'||parsed.origin!==env.HFT_PUBLIC_ORIGIN||
    parsed.username||parsed.password||parsed.pathname!=='/'||
    parsed.search||parsed.hash)
  throw Error('OPS_A2_STORES_PUBLIC_ORIGIN_INVALID');
}
