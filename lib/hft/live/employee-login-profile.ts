/** HF101 is a distinct nonproduction identity/role profile, never a stock profile. */
type Env=Readonly<Record<string,string|undefined>>;
export const EMPLOYEE_LOGIN_PROFILE='HFT_R1_CANONICAL_EMPLOYEE_LOGIN_V1';
export const EMPLOYEE_LOGIN_ISSUER='hft-r1-employee-v1';
export const EMPLOYEE_LOGIN_AUDIENCE='hft-r1-canonical-employee-v1';
export const employeeLoginAttempt=(e:Env)=>e.HFT_EMPLOYEE_LOGIN_PROFILE!==undefined;
const conflicts=['HFT_LIVE_R1_PROFILE','HFT_LIVE_R1_IDENTITY_PROOF_MODE','HFT_HOSTED_OPERATOR_PROFILE','HFT_HOSTED_OPERATOR_MODE',
 'HFT_HOSTED_OPERATOR_ACTORS_JSON','HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON','HFT_INTAKE_PROFILE','HFT_STORES_RUNTIME_PROFILE',
 'HFT_MASTERS_RUNTIME_PROFILE','HFT_DRAFT_RUNTIME_PROFILE','HFT_MIS_REQUIREMENTS_PROFILE','HFT_LIVE_R1_PASSWORD'];
const pin=(s:string|undefined)=>!!s&&/^[0-9a-f]{64}$/.test(s)&&s!=='0'.repeat(64);
export function employeeLoginProfileAdmitted(e:Env):boolean{
 return e.HFT_EMPLOYEE_LOGIN_PROFILE===EMPLOYEE_LOGIN_PROFILE&&e.NODE_ENV==='production'&&e.VERCEL_ENV==='preview'&&
 e.HFT_ENVIRONMENT==='retained-stores-nonproduction'&&e.HFT_AUTH_SOURCE==='verified'&&e.HFT_OPERATIONS_SOURCE==='database'&&e.HFT_LIVE_POSTING_ENABLED==='false'&&
 e.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE==='HFT_R1_APP_ROLES_RETAINED_NP_077_V1'&&e.HFT_ROLE_RESOURCE_PROJECT==='wandering-cake-50222227'&&
 e.HFT_ROLE_RESOURCE_BRANCH==='br-shiny-night-b3qgsj8t'&&e.HFT_ROLE_PG_DATABASE==='hft_r1_retained_masters_np077'&&e.HFT_ROLE_PG_SERVER_VERSION_NUM==='180007'&&
 e.HFT_SESSION_ISSUER===EMPLOYEE_LOGIN_ISSUER&&e.HFT_SESSION_AUDIENCE===EMPLOYEE_LOGIN_AUDIENCE&&
 /^[0-9a-f]{40}$/.test(e.HFT_EMPLOYEE_LOGIN_SOURCE_COMMIT??'')&&e.HFT_EMPLOYEE_LOGIN_SOURCE_COMMIT===e.VERCEL_GIT_COMMIT_SHA&&
 pin(e.HFT_EMPLOYEE_LOGIN_ADMISSION_SHA256)&&conflicts.every(k=>e[k]===undefined);
}
export function employeeLoginPathAdmitted(path:string,method:string,e:Env):boolean{
 if(!employeeLoginProfileAdmitted(e))return false;
 if(method==='GET'||method==='HEAD')return ['/','/employee/account','/settings','/settings/users-roles','/api/hft/live-masters/auth/start','/api/hft/live-masters/auth/callback'].includes(path);
 return method==='POST'&&['/api/hft/employee-account','/api/hft/settings/roles','/api/hft/live-masters/signout'].includes(path);
}
