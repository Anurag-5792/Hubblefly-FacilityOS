/** Restricted role backend source qualification. Synthetic rows only:
 * no real employee, role grant, database or session is created by tests.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {assertRoleBackendProfile,isRoleBackendProfile,ROLE_BACKEND_PROFILE,
 rolePoolOptions,ROLE_BACKEND_CATALOG_SQL,assertRoleConnection}
 from '../../lib/hft/roles/role-backend.ts';
import type {RoleSqlClient}
 from '../../lib/hft/roles/role-postgres.ts';
const host='ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech';
const base={
 NODE_ENV:'production',VERCEL_ENV:'preview',
 HFT_ENVIRONMENT:'retained-stores-nonproduction',HFT_AUTH_SOURCE:'verified',
 HFT_LIVE_POSTING_ENABLED:'false',
 HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:ROLE_BACKEND_PROFILE,
 HFT_ROLE_RESOURCE_PROJECT:'wandering-cake-50222227',
 HFT_ROLE_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t',
 HFT_ROLE_PG_DATABASE:'hft_r1_retained_masters_np077',
 HFT_ROLE_PG_SERVER_VERSION_NUM:'180007',
 HFT_ROLE_PG_HOST:host,HFT_ROLE_APPROVED_ENDPOINT_HOST:host,
 HFT_ROLE_PG_PORT:'5432',HFT_ROLE_PG_LOGIN:'hft_r1_roles_np_login',
 HFT_ROLE_PG_PASSWORD:'SYNTHETIC_NEVER_REAL_1234567890',
 HFT_ROLE_APPROVED_INSTALLER_SHA256:'b'.repeat(64),
 HFT_ROLE_INDEPENDENT_ADMISSION_SHA256:'c'.repeat(64),
 HFT_ROLE_PG_CA_PEM:rootCertificates[0],
 HFT_SESSION_ED25519_PUBLIC_KEY_PEM:'SYNTHETIC_PUBLIC_KEY_ONLY',
 HFT_SESSION_ISSUER:'synthetic-issuer',HFT_SESSION_AUDIENCE:'synthetic-audience',
 HFT_PUBLIC_ORIGIN:'https://facility-roles.example.org'
};
const accepted={
 db:base.HFT_ROLE_PG_DATABASE,db_login:base.HFT_ROLE_PG_LOGIN,
 db_role:base.HFT_ROLE_PG_LOGIN,pg_version:180007,replica:false,
 tls:true,tls_version:'TLSv1.3',schema_usage:true,schema_create:false,
 scope_read:true,scope_epoch_update:true,binding_read:true,
 assignment_read:true,assignment_insert:true,assignment_update:true,
 audit_read:true,audit_insert:true,role_table_count:4,audit_trigger_count:2,
 protected_relation_write_count:0,protected_function_execute_count:0,
 privileged_role_memberships:0,restricted_login:true,operational_schema_create:false,
 secret_schema_usage:false,identity_binding_write:false,
 audit_write_or_delete:false,stock_history_read:false,stock_account_read:false
};
function client(patch:Record<string,unknown>={}):RoleSqlClient{
 return {async query<T=Record<string,unknown>>(sql:string,values?:unknown[]){
  assert.equal(sql,ROLE_BACKEND_CATALOG_SQL);assert.equal(values,undefined);
  return {rows:[{...accepted,...patch}] as T[],rowCount:1};
 },release(){}};
}
test('role endpoint is admitted only with isolated Preview identity and strict TLS',()=>{
 assert.equal(isRoleBackendProfile(base),true);
 assert.doesNotThrow(()=>assertRoleBackendProfile(base));
 const options=rolePoolOptions(base);
 assert.equal(options.user,'hft_r1_roles_np_login');
 assert.equal(options.database,'hft_r1_retained_masters_np077');
 assert.equal((options.ssl as Record<string,unknown>).rejectUnauthorized,true);
 for(const patch of [
  {HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:undefined},
  {VERCEL_ENV:'production'},{HFT_ENVIRONMENT:'production'},
  {HFT_LIVE_POSTING_ENABLED:'true'},
  {HFT_ROLE_RESOURCE_PROJECT:'other-project'},
  {HFT_ROLE_RESOURCE_BRANCH:'other-branch'},
  {HFT_ROLE_PG_SERVER_VERSION_NUM:'180006'},
  {HFT_ROLE_PG_DATABASE:'hft_r1_disposable_qa'},
  {HFT_ROLE_PG_LOGIN:'hft_r1_posting_owner'},
  {HFT_P2_RUNTIME_LOGIN:'hft_r1_roles_np_login'},
  {HFT_ROLE_PG_PASSWORD:'short'},
  {HFT_ROLE_INDEPENDENT_ADMISSION_SHA256:undefined},
  {HFT_ROLE_PG_CA_PEM:'invalid'},
  {DATABASE_URL:'postgres://ambient.example/db'}
 ])assert.throws(()=>assertRoleBackendProfile({...base,...patch}));
});
test('database catalog accepts exact independent role schema and restricted actor login',async()=>{
 await assert.doesNotReject(assertRoleConnection(client(),base));
 for(const patch of [
  {db:'other'},{db_role:'hft_engineering'},{pg_version:180006},
  {tls:false},{role_table_count:3},{audit_trigger_count:1},
  {schema_create:true},{restricted_login:false},{assignment_insert:false},
  {audit_read:false},{scope_epoch_update:false},
  {protected_function_execute_count:1},{protected_relation_write_count:1},
  {privileged_role_memberships:1},{stock_account_read:true},
  {identity_binding_write:true},{audit_write_or_delete:true},
  {secret_schema_usage:true},{operational_schema_create:true}
 ])await assert.rejects(assertRoleConnection(client(patch),base),
  /ROLE_DATABASE_IDENTITY_ACL_OR_AUDIT_NOT_ADMITTED/);
});
