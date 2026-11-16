/** Edge-safe narrow Path B routing gate. Not an authentication decision.
 * The Node.js API independently verifies identity, TLS, schema and signer.
 */
export const DRAFT_PROFILE='HFT_R1_RETAINED_DRAFT_077_V1' as const;
type Env=Readonly<Record<string,string|undefined>>;
export function isDraftMode(env:Env):boolean{
 return env.HFT_DRAFT_RUNTIME_PROFILE===DRAFT_PROFILE;
}
export function assertDraftEdgeProfile(env:Env):void{
 if(!isDraftMode(env)||env.NODE_ENV!=='production'||
  env.HFT_ENVIRONMENT!=='retained-draft-nonproduction'||
  env.HFT_LIVE_POSTING_ENABLED!=='false'||
  env.HFT_AUTH_SOURCE!=='verified'||
  env.HFT_DRAFT_DATABASE!=='hft_r1_retained_masters_np077'||
  env.HFT_DRAFT_DB_PROJECT!=='wandering-cake-50222227'||
  env.HFT_DRAFT_DB_BRANCH!=='br-shiny-night-b3qgsj8t'||
  env.HFT_DRAFT_DB_VERSION!=='180007'||
  env.HFT_DRAFT_DB_USER!=='hft_draft077_api_login'||
  !env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||
  !env.HFT_SESSION_ISSUER||!env.HFT_SESSION_AUDIENCE||
  !env.HFT_DRAFT_ENROLLED_SCOPE_ID||
  !env.HFT_DRAFT_INDEPENDENT_ADMISSION_SHA256||
  !env.HFT_DRAFT_APPROVED_SCHEMA_SHA256||
  !env.HFT_PUBLIC_ORIGIN)
  throw Error('DRAFT077_EDGE_PROFILE_NOT_ADMITTED');
 const origin=env.HFT_PUBLIC_ORIGIN;
 let u:URL;
 try{u=new URL(origin);}catch{throw Error('DRAFT077_ORIGIN_INVALID');}
 if(u.protocol!=='https:'||u.origin!==origin||
  u.username||u.password||u.pathname!=='/'||u.search||u.hash)
  throw Error('DRAFT077_ORIGIN_INVALID');
}
