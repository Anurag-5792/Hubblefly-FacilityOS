/** R77 retained Masters profile contract tests: synthetic, no DB execution. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {readFileSync} from 'node:fs';
import {assertSecureStartup} from '../../lib/hft/security/authorization.ts';
import {resolveVerifiedRequestOperator} from '../../lib/hft/security/verified-request.ts';
import {identityEnv,signedToken} from '../support/signed-session-fixture.ts';
import {RETAINED_MASTERS_PROFILE,assertRetainedMastersProfile,isRetainedMastersProfile}
 from '../../lib/hft/masters/retained-nonproduction-profile.ts';
import {assertP3Environment} from '../../lib/hft/masters/p3-database.ts';
import {assertOnlinePgTransport,onlinePgPoolOptions}
 from '../../lib/hft/persistence/online-pg-transport.ts';

const url='https://masters.nonproduction.hft.test';
const allowed={...identityEnv,
 NODE_ENV:'production',HFT_ENVIRONMENT:'retained-nonproduction',
 HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
 HFT_LIVE_POSTING_ENABLED:'false',HFT_MASTERS_SOURCE:'postgres_review',
 HFT_MASTERS_RUNTIME_PROFILE:RETAINED_MASTERS_PROFILE,
 HFT_POSTING_RUN_MODE:'RETAINED_MASTERS_ONLY_NO_STOCK',
 HFT_DATABASE_TRANSPORT:'ONLINE_TLS',
 HFT_ONLINE_DB_CREDENTIAL_SOURCE:'MANAGED_RUNTIME_SECRET',
 HFT_ONLINE_DB_ENDPOINT_HOST:'pg.hft-nonproduction.example.org',
 PGHOST:'pg.hft-nonproduction.example.org',PGPORT:'5432',HFT_APPROVED_PG_PORT:'5432',
 HFT_ONLINE_DB_TLS_CA_PEM:rootCertificates[0],HFT_ONLINE_DB_BACKEND_PORT:'5432',
 PGDATABASE:'hft_r1_retained_masters_nonproduction',
 HFT_MASTERS_APPROVED_PG_DATABASE:'hft_r1_retained_masters_nonproduction',
 HFT_P2_RUNTIME_LOGIN:'hft_r1_testposting',
 HFT_P3_RUNTIME_LOGIN:'hft_r1_testmasters',
 HFT_ONLINE_P2_DB_PASSWORD:'TEST_ONLY_P2_UNUSED_000000001',
 HFT_ONLINE_P3_DB_PASSWORD:'TEST_ONLY_P3_00000000000001',
 HFT_MASTERS_INDEPENDENT_ADMISSION_SHA256:'a'.repeat(64),
 HFT_MASTERS_APPROVED_INSTALLER_SHA256:'b'.repeat(64),
 HFT_MASTERS_APPROVED_RESOURCE_SHA256:'c'.repeat(64),
 HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM:'180007',
 HFT_PUBLIC_ORIGIN:url};
function request(token=signedToken()){
 return new Request(url+'/api/hft/masters',{method:'POST',
  headers:{origin:url,'sec-fetch-site':'same-origin',
   cookie:'__Host-hft_session='+token}});
}
test('retained Masters profile is separately admitted while global production startup still rejects',()=>{
 assert.equal(isRetainedMastersProfile(allowed),true);
 assert.doesNotThrow(()=>assertRetainedMastersProfile(allowed));
 assert.throws(()=>assertSecureStartup(allowed),/PRODUCTION_STARTUP_NOT_AUTHORIZED/);
 assert.doesNotThrow(()=>assertP3Environment(allowed));
 const p3=assertOnlinePgTransport(allowed,'P3_MASTERS');
 assert.equal(p3.database,allowed.PGDATABASE);
 assert.equal(p3.login,allowed.HFT_P3_RUNTIME_LOGIN);
 assert.equal(onlinePgPoolOptions(allowed,'P3_MASTERS').application_name,
  'hft-r1-retained-masters-nonproduction');
 assert.throws(()=>assertOnlinePgTransport(allowed,'P2_STORES'),
  /DISPOSABLE_DATABASE_REQUIRED/);
});
test('retained P3 can be isolated without provisioning a posting login',()=>{
 const isolated={...allowed,HFT_P2_RUNTIME_LOGIN:undefined,
   HFT_ONLINE_P2_DB_PASSWORD:undefined};
 assert.doesNotThrow(()=>assertP3Environment(isolated));
 assert.equal(assertOnlinePgTransport(isolated,'P3_MASTERS').login,
  isolated.HFT_P3_RUNTIME_LOGIN);
 assert.throws(()=>assertOnlinePgTransport(isolated,'P2_STORES'),
  /DISPOSABLE_DATABASE_REQUIRED/);
});
test('retained signed session allows only explicit Masters purpose',()=>{
 const actor=resolveVerifiedRequestOperator(request(),allowed,'RETAINED_P3_MASTERS');
 assert.equal(actor.subject,'STORE1');assert.deepEqual(actor.scope.warehouseIds,['WH1']);
 assert.throws(()=>resolveVerifiedRequestOperator(request(),allowed),
  /PRODUCTION_STARTUP_NOT_AUTHORIZED/);
 assert.throws(()=>resolveVerifiedRequestOperator(request(),
  {...allowed,HFT_LIVE_POSTING_ENABLED:'true'},'RETAINED_P3_MASTERS'),
  /PROFILE_NOT_ADMITTED/);
});
test('retained production-like environment denies missing approvals, wrong DB and privileges',()=>{
 for(const patch of [
  {HFT_ENVIRONMENT:'production'},{HFT_MASTERS_RUNTIME_PROFILE:'UNQUALIFIED'},
  {HFT_MASTERS_INDEPENDENT_ADMISSION_SHA256:undefined},
  {HFT_MASTERS_APPROVED_RESOURCE_SHA256:'0'.repeat(64)},
  {HFT_MASTERS_APPROVED_INSTALLER_SHA256:'bad'},
  {HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM:undefined},
  {HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM:'180005'},
  {HFT_MASTERS_APPROVED_PG_SERVER_VERSION_NUM:'170007'},
  {PGDATABASE:'hft_r1_disposable_wrongdb'},
  {HFT_MASTERS_APPROVED_PG_DATABASE:'hft_r1_retained_wrongdb'},
  {HFT_TEST_PG_DATABASE:'hft_r1_disposable_synthetic'},
  {HFT_AUTH_SOURCE:'sample'}, {HFT_OPERATIONS_SOURCE:'preview'},
  {HFT_MASTERS_SOURCE:'preview'}, {HFT_POSTING_RUN_MODE:'ISOLATED_ONLINE_DB_TEST'},
  {HFT_LIVE_POSTING_ENABLED:'true'}, {HFT_PUBLIC_ORIGIN:'http://insecure.test'},
  {HFT_P3_RUNTIME_LOGIN:'hft_r1_posting_owner'},
  {NODE_ENV:'test'}
 ]){
  assert.throws(()=>assertRetainedMastersProfile({...allowed,...patch}),
   /PROFILE_NOT_ADMITTED|PUBLIC_ORIGIN_INVALID/);
 }
});
test('retained P3 rejects ambient routing, invalid TLS, shared master and posting logins',()=>{
 for(const bad of [{PGPASSWORD:'ambient'},{PGHOSTADDR:'10.2.3.4'},
  {DATABASE_URL:'postgres://production.invalid/db'},
  {PGSSLMODE:'disable'}, {HFT_ONLINE_DB_TLS_CA_PEM:'NOT_A_CA'},
  {HFT_P2_RUNTIME_LOGIN:allowed.HFT_P3_RUNTIME_LOGIN},
  {PGHOST:'pg.other.example.org'}]){
   assert.throws(()=>assertP3Environment({...allowed,...bad}));
  }
});
test('retained profile cannot open other APIs through exact middleware allowlist',()=>{
 const source=readFileSync('middleware.ts','utf8');
 assert.match(source,/retainedRoutes=new Set/);
 assert.match(source,/\/api\/hft\/masters\/decision/);
 assert.match(source,/\/api\/hft\/masters/);
 assert.doesNotMatch(source,/retainedRoutes\.add\(.+stores/);
 assert.match(source,/HFT_R1_API_NOT_QUALIFIED/);
 assert.match(source,/HFT_R1_MASTERS_PROFILE_NOT_ADMITTED/);
});
test('forged or expired signed session is denied in retained Masters mode',()=>{
 const expiry=Math.floor(Date.now()/1000)-5;
 assert.throws(()=>resolveVerifiedRequestOperator(request(signedToken({exp:expiry})),
  allowed,'RETAINED_P3_MASTERS'),/SESSION_EXPIRED_OR_INVALID/);
 const bad=request();
 bad.headers.set('origin','https://attacker.invalid');
 assert.throws(()=>resolveVerifiedRequestOperator(bad,allowed,'RETAINED_P3_MASTERS'),
  /REQUEST_ORIGIN_MISMATCH/);
});
