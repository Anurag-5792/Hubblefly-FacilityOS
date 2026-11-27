/** Explicit separate requirements-only admission; no stock or actor grant. */
export const MIS_REQUIREMENTS_PROFILE='HFT_R1_MIS_REQUIREMENTS_RETAINED_V1';
export const MIS_READER_LOGIN='hft_r1_planning_read_np_login';
export const MIS_READER_OWNER='hft_r1_planning_reader_owner';
type Env=Readonly<Record<string,string|undefined>>;
const pin=(s:string|undefined)=>!!s&&/^[a-f0-9]{64}$/.test(s)&&s!=='0'.repeat(64);
export function misRequirementsConfigured(e:Env):boolean{
 return e.HFT_MIS_REQUIREMENTS_PROFILE===MIS_REQUIREMENTS_PROFILE&&e.NODE_ENV==='production'&&e.VERCEL_ENV==='preview'&&
 e.HFT_ENVIRONMENT==='retained-stores-nonproduction'&&e.HFT_AUTH_SOURCE==='verified'&&e.HFT_LIVE_POSTING_ENABLED==='false'&&
 e.HFT_MIS_REQUIREMENTS_SOURCE_COMMIT===e.VERCEL_GIT_COMMIT_SHA&&/^[0-9a-f]{40}$/.test(e.HFT_MIS_REQUIREMENTS_SOURCE_COMMIT||'')&&
 e.HFT_MIS_PG_LOGIN===MIS_READER_LOGIN&&pin(e.HFT_MIS_INSTALLER_SHA256)&&pin(e.HFT_MIS_ADMISSION_SHA256)&&
 e.HFT_MIS_READER_BODY_SHA256==='7e8fc19c92758ca74c7f98baf8db92b6c130bc9b924cf3a9e1df9f14a252d45d'&&
 e.HFT_MIS_ACTION_BODY_SHA256==='2bba3630a26ed9239eee1a899254a3f2272a8f2f827990f73c141aa543d7fc78'&&
 e.HFT_MIS_APPROVED_LIFECYCLE_SHA256==='7c72c386e9cb3de0810274d0c9fbf320ca3f1c1aca9a9ec9a135c01d315929a2'&&
 e.HFT_ROLE_RESOURCE_PROJECT==='wandering-cake-50222227'&&e.HFT_ROLE_RESOURCE_BRANCH==='br-shiny-night-b3qgsj8t'&&
 e.HFT_ROLE_PG_DATABASE==='hft_r1_retained_masters_np077'&&e.HFT_ROLE_PG_SERVER_VERSION_NUM==='180007';
}
