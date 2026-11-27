/** HF094: edge-safe hosted operator admission. Not a grant or SQL installation. */
export type OperatorEnv=Readonly<Record<string,string|undefined>>;
export const HOSTED_OPERATOR_PROFILE='HFT_R1_HOSTED_OPERATOR_PREVIEW_V1';
export const HOSTED_OPERATOR_ISSUER='hft-r1-hosted-operator-v1';
export const HOSTED_OPERATOR_AUDIENCE='hft-r1-retained-operator-v1';
export const RETAINED_ROLE_PROFILE='HFT_R1_APP_ROLES_RETAINED_NP_077_V1';
export const RETAINED_STORE_PROFILE='HFT_R1_STORES_RETAINED_NONPRODUCTION_077_V1';
export const hostedOperatorAttempt=(e:OperatorEnv)=>e.HFT_HOSTED_OPERATOR_PROFILE!==undefined;
const pin=(v:string|undefined)=>!!v&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
const forbidden=['HFT_LIVE_R1_PROFILE','HFT_LIVE_R1_IDENTITY_PROOF_MODE','HFT_DRAFT_RUNTIME_PROFILE',
 'HFT_MASTERS_RUNTIME_PROFILE','HFT_INTAKE_PROFILE','HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON',
 'HFT_LIVE_R1_PASSWORD','HFT_TEST_PG_DATABASE','HFT_QUAL077_ADMISSION_FILE'];
export function hostedOperatorMode(e:OperatorEnv):'ROLES_ONLY'|'ROLES_RECEIVE'{
 const mode=e.HFT_HOSTED_OPERATOR_MODE;
 if(e.HFT_HOSTED_OPERATOR_PROFILE!==HOSTED_OPERATOR_PROFILE||e.NODE_ENV!=='production'||
 e.VERCEL_ENV!=='preview'||e.HFT_ENVIRONMENT!=='retained-stores-nonproduction'||
 e.HFT_AUTH_SOURCE!=='verified'||e.HFT_OPERATIONS_SOURCE!=='database'||e.HFT_LIVE_POSTING_ENABLED!=='false'||
 e.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE!==RETAINED_ROLE_PROFILE||
 e.HFT_SESSION_ISSUER!==HOSTED_OPERATOR_ISSUER||e.HFT_SESSION_AUDIENCE!==HOSTED_OPERATOR_AUDIENCE||
 !pin(e.HFT_HOSTED_OPERATOR_ADMISSION_SHA256)||
 !/^[a-f0-9]{40}$/.test(e.HFT_HOSTED_OPERATOR_SOURCE_COMMIT||'')||
 e.VERCEL_GIT_COMMIT_SHA!==e.HFT_HOSTED_OPERATOR_SOURCE_COMMIT||forbidden.some(k=>e[k]!==undefined)||
 e.HFT_ROLE_RESOURCE_PROJECT!=='wandering-cake-50222227'||
 e.HFT_ROLE_RESOURCE_BRANCH!=='br-shiny-night-b3qgsj8t'||
 e.HFT_ROLE_PG_DATABASE!=='hft_r1_retained_masters_np077'||
 !e.HFT_PUBLIC_ORIGIN||!e.HFT_HOSTED_OPERATOR_ACTORS_JSON)
  throw Error('HOSTED_OPERATOR_PROFILE_NOT_ADMITTED');
 const origin=new URL(e.HFT_PUBLIC_ORIGIN);
 if(origin.protocol!=='https:'||origin.origin!==e.HFT_PUBLIC_ORIGIN||origin.username||origin.password)
  throw Error('HOSTED_OPERATOR_ORIGIN_NOT_ADMITTED');
 if(mode==='ROLES_ONLY'&&e.HFT_STORES_RUNTIME_PROFILE===undefined)return mode;
 if(mode==='ROLES_RECEIVE'&&e.HFT_STORES_RUNTIME_PROFILE===RETAINED_STORE_PROFILE&&
 e.HFT_ROLE_RESOURCE_PROJECT===e.HFT_STORES_RESOURCE_PROJECT&&
 e.HFT_ROLE_RESOURCE_BRANCH===e.HFT_STORES_RESOURCE_BRANCH&&
 e.HFT_ROLE_PG_DATABASE===e.HFT_STORES_APPROVED_DATABASE&&e.HFT_ROLE_PG_DATABASE===e.PGDATABASE&&
 !!e.HFT_ROLE_PG_HOST&&e.HFT_ROLE_PG_HOST===e.PGHOST&&!!e.HFT_ROLE_PG_PORT&&e.HFT_ROLE_PG_PORT===e.PGPORT)
  return mode;
 throw Error('HOSTED_OPERATOR_MODE_NOT_ADMITTED');
}
const rolesPaths=new Set(['/','/settings','/settings/users-roles','/api/hft/settings/roles',
 '/api/hft/live-masters/auth/start','/api/hft/live-masters/auth/callback','/api/hft/live-masters/signout']);
const storesPaths=new Set(['/stores','/stores/operations','/api/hft/stores/read','/api/hft/stores/receive']);
export function hostedOperatorPathAdmitted(path:string,e:OperatorEnv):boolean{
 try{const mode=hostedOperatorMode(e);return rolesPaths.has(path)||(mode==='ROLES_RECEIVE'&&storesPaths.has(path));}
 catch{return false;}
}
export function assertHostedOperatorDuty(e:OperatorEnv,duty:'role'|'stock'):void{
 // Existing non-hosted qualification harnesses retain their own exact admission.
 // A retained backend on Vercel may not bypass this separately admitted profile.
 if(!hostedOperatorAttempt(e)&&e.VERCEL_ENV===undefined)return;
 const mode=hostedOperatorMode(e);
 if(duty==='stock'&&mode!=='ROLES_RECEIVE')throw Error('HOSTED_OPERATOR_STOCK_NOT_ADMITTED');
}
