/** OFFLINE ONLY. Generated signatures/keys test code, not target authority. */
import {createHash,generateKeyPairSync,sign,type KeyObject} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rootCertificates} from 'node:tls';
import {QUAL077_PROFILE,type QualificationAdmission}
 from '../../lib/hft/roles/role-isolated-profile.ts';
import {ROLE_ENFORCEMENT_SHA256} from '../../lib/hft/roles/role-enforcement.ts';
import {STORES_GATEWAY_REVIEW_SHA256} from '../../lib/hft/stores/ops-a2-retained-profile.ts';
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
export function offlineQualificationFixture(){
 const authority=generateKeyPairSync('ed25519'),session=generateKeyPairSync('ed25519');
 const pem=authority.publicKey.export({type:'spki',format:'pem'}).toString();
 const sessionPem=session.publicKey.export({type:'spki',format:'pem'}).toString();
 const now=Date.now(),dir=mkdtempSync(join(tmpdir(),'hft-role077-offline-'));
 const admission:QualificationAdmission={version:'HFT_ROLE077_ISOLATED_ADMISSION_V1',fixtureOnly:true,
  authorityRef:'OFFLINE-NOT-AN-EXECUTION-APPROVAL',executor:'OFFLINE-TEST-ONLY',
  issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString(),
  target:{project:'offline-fixture-project',branch:'offline-fixture-branch',
   database:'hft_r1_disposable_role077_offline',host:'fixture.db.example.org',port:'5432',backendPort:'5432',
   pgVersion:'180007',databaseOid:'12345',resourceNonce:'00000000-0000-4000-8000-000000000077'},
  source:{commit:'a'.repeat(40),tree:'b'.repeat(40)},
  installer:{role:'c'.repeat(64),stock:'d'.repeat(64),binding:'e'.repeat(64),fixtureHelpers:'9'.repeat(64),gateway:STORES_GATEWAY_REVIEW_SHA256},
  logins:{role:'hft_r1_roles_qual077',stock:'hft_r1_stock_qual077',p3:'hft_r1_masters_qual077',fixtureExecutor:'hft_r1_fixture_qual077'},
  session:{issuer:'QUAL077-SYNTHETIC-ISSUER',audience:'QUAL077-SYNTHETIC-AUDIENCE',publicKeySha256:hash(sessionPem),synthetic:true},
  proofs:{p0Sha256:hash(Buffer.alloc(32,7)),p2Sha256:hash(Buffer.alloc(32,8)),p0Version:'1',p2Version:'1',synthetic:true},
  fixtureSha256:'f'.repeat(64),permissions:['catalog','role-writes','fixture-mutations','trigger-negatives','route-receive','route-read','concurrency']};
 const t=admission.target;
 const env:Record<string,string|undefined>={NODE_ENV:'production',HFT_ENVIRONMENT:'isolated-role-qualification',
  HFT_STORES_RUNTIME_PROFILE:QUAL077_PROFILE,HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:QUAL077_PROFILE,
  HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',
  HFT_DATABASE_TRANSPORT:'ONLINE_TLS',HFT_ONLINE_DB_CREDENTIAL_SOURCE:'MANAGED_RUNTIME_SECRET',
  HFT_POSTING_RUN_MODE:'ROLE077_ISOLATED_POSTGRES',HFT_OPS_A2_SOURCE_MODE:'ROLE077_ISOLATED_OPERATOR_V1',
  HFT_QUAL077_ADMISSION_FILE:join(dir,'offline-admission.json'),
  HFT_QUAL077_ADMISSION_PUBLIC_KEY_PEM:pem,HFT_QUAL077_TRUST_ROOT_SHA256:hash(pem),
  HFT_QUAL077_SOURCE_COMMIT:admission.source.commit,HFT_QUAL077_SOURCE_TREE:admission.source.tree,
  PGHOST:t.host,PGPORT:t.port,PGDATABASE:t.database,HFT_APPROVED_PG_PORT:t.port,
  HFT_ONLINE_DB_ENDPOINT_HOST:t.host,HFT_ONLINE_DB_BACKEND_PORT:t.backendPort,
  HFT_ROLE_RESOURCE_PROJECT:t.project,HFT_ROLE_RESOURCE_BRANCH:t.branch,
  HFT_STORES_RESOURCE_PROJECT:t.project,HFT_STORES_RESOURCE_BRANCH:t.branch,
  HFT_ROLE_PG_HOST:t.host,HFT_ROLE_APPROVED_ENDPOINT_HOST:t.host,HFT_ROLE_PG_PORT:t.port,
  HFT_ROLE_PG_DATABASE:t.database,HFT_STORES_APPROVED_DATABASE:t.database,
  HFT_ROLE_PG_SERVER_VERSION_NUM:t.pgVersion,HFT_STORES_APPROVED_PG_VERSION:t.pgVersion,
  HFT_ROLE_PG_LOGIN:admission.logins.role,HFT_P2_RUNTIME_LOGIN:admission.logins.stock,HFT_P3_RUNTIME_LOGIN:admission.logins.p3,
  HFT_ROLE_APPROVED_INSTALLER_SHA256:admission.installer.role,HFT_STORES_APPROVED_INSTALLER_SHA256:admission.installer.stock,
  HFT_QUAL077_BINDING_INSTALLER_SHA256:admission.installer.binding,
  HFT_QUAL077_FIXTURE_HELPERS_SHA256:admission.installer.fixtureHelpers,
  HFT_ROLE_APPROVED_ENFORCEMENT_SHA256:ROLE_ENFORCEMENT_SHA256,
  HFT_ROLE_PG_PASSWORD:'OFFLINE-NOT-A-DATABASE-PASSWORD',HFT_ONLINE_P2_DB_PASSWORD:'OFFLINE-NOT-A-STOCK-PASSWORD',
  HFT_ROLE_PG_CA_PEM:rootCertificates[0],HFT_ONLINE_DB_TLS_CA_PEM:rootCertificates[0],
  HFT_STORES_APPROVED_OPERATOR_GATEWAY_SHA256:admission.installer.gateway,
  HFT_STORES_OPERATOR_GATEWAY_ABI:'HF13_OPS_A2_OPERATOR_RECEIVE_V1',
  HFT_STORES_SQL_CONTRACT:'HFT_R1_OPS_A2_OPERATIONAL_PG187_V2',
  HFT_PUBLIC_ORIGIN:'https://qual077.example.org',HFT_SESSION_ED25519_PUBLIC_KEY_PEM:sessionPem,
  HFT_SESSION_ISSUER:admission.session.issuer,HFT_SESSION_AUDIENCE:admission.session.audience,
  HFT_OPS_A2_POST_KEY_BASE64:Buffer.alloc(32,8).toString('base64'),HFT_OPS_A2_POST_KEY_VERSION:'1',
  HFT_P0_STORES_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),HFT_P0_STORES_KEY_VERSION:'1'};
 const resign=(a:QualificationAdmission)=>{
  const payload=Buffer.from(JSON.stringify(a));
  const bytes=Buffer.from(JSON.stringify({payload:payload.toString('base64url'),signature:sign(null,payload,authority.privateKey).toString('base64url')}));
  writeFileSync(env.HFT_QUAL077_ADMISSION_FILE!,bytes,{mode:0o600});
  env.HFT_QUAL077_ADMISSION_SHA256=hash(bytes);env.HFT_ROLE_INDEPENDENT_ADMISSION_SHA256=hash(bytes);return bytes;
 };
 resign(admission);
 return {env,admission,resign,sessionKey:session.privateKey,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
export function offlineSessionRequest(env:Record<string,string|undefined>,key:KeyObject,claims:Record<string,unknown>={}){
 const now=Math.floor(Date.now()/1000),part=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const a=part({alg:'EdDSA',typ:'JWT',kid:'hft-r1'}),b=part({iss:env.HFT_SESSION_ISSUER,aud:env.HFT_SESSION_AUDIENCE,
  sub:'QUAL077-OPERATOR',jti:'QUAL077-SESSION',iat:now-1,exp:now+300,
  legalEntityId:'QUAL077-ENTITY',siteId:'QUAL077-SITE',warehouseIds:['QUAL077-WH'],...claims});
 const token=a+'.'+b+'.'+sign(null,Buffer.from(a+'.'+b),key).toString('base64url');
 return new Request(env.HFT_PUBLIC_ORIGIN+'/api/hft/stores/read',{method:'POST',
  headers:{origin:env.HFT_PUBLIC_ORIGIN!,'sec-fetch-site':'same-origin',cookie:'__Host-hft_session='+token}});
}
