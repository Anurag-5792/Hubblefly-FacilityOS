/** Restricted role backend source qualification. Synthetic rows only:
 * no real employee, role grant, database or session is created by tests.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootCertificates} from 'node:tls';
import {HOSTED_OPERATOR_PROFILE,HOSTED_OPERATOR_ISSUER,HOSTED_OPERATOR_AUDIENCE,RETAINED_STORE_PROFILE} from '../../lib/hft/roles/hosted-operator-profile.ts';
import {assertRoleBackendProfile,isRoleBackendProfile,ROLE_BACKEND_PROFILE,
 rolePoolOptions,ROLE_BACKEND_CATALOG_SQL,assertRoleConnection}
 from '../../lib/hft/roles/role-backend.ts';
import {ROLE_ENFORCEMENT_SHA256,ROLE_EXPECTED_TRIGGERS,assertRoleEnforcement}
 from '../../lib/hft/roles/role-enforcement.ts';
import {readFileSync} from 'node:fs';
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
 HFT_ROLE_APPROVED_ENFORCEMENT_SHA256:ROLE_ENFORCEMENT_SHA256,
 HFT_ROLE_PG_CA_PEM:rootCertificates[0],
 HFT_SESSION_ED25519_PUBLIC_KEY_PEM:'SYNTHETIC_PUBLIC_KEY_ONLY',
 HFT_SESSION_ISSUER:'synthetic-issuer',HFT_SESSION_AUDIENCE:'synthetic-audience',
 HFT_PUBLIC_ORIGIN:'https://facility-roles.example.org'
};
const accepted={
 db_oid:'12345',server_address:'127.0.0.1',server_port:5432,
 protected_column_write_count:0,binding_column_write_count:0,audit_column_write_count:0,scope_unauthorized_write:false,
 missing_required_schemas:[],secret_schema_present:true,replication_mode:'origin',enforcement:ROLE_EXPECTED_TRIGGERS,
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
function client(patch:Record<string,unknown>={},socket:Record<string,unknown>={}):RoleSqlClient{
 return {connection:{stream:{encrypted:true,authorized:true,authorizationError:null,
  servername:host,remoteAddress:'192.0.2.1',remotePort:5432,getProtocol:()=> 'TLSv1.3',
  getCipher:()=>({name:'TLS_AES_256_GCM_SHA384'}),
  getPeerCertificate:()=>({raw:Buffer.from('synthetic'),subjectaltname:'DNS:'+host}),...socket}},async query<T=Record<string,unknown>>(sql:string,values?:unknown[]){
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
  {HFT_ROLE_APPROVED_ENFORCEMENT_SHA256:undefined},
  {HFT_ROLE_APPROVED_ENFORCEMENT_SHA256:'0'.repeat(64)},
  {HFT_ROLE_PG_CA_PEM:'invalid'},
  {DATABASE_URL:'postgres://ambient.example/db'}
 ])assert.throws(()=>assertRoleBackendProfile({...base,...patch}));
});
test('database catalog accepts exact independent role schema and restricted actor login',async()=>{
 await assert.doesNotReject(assertRoleConnection(client(),base));
 for(const patch of [
  {db_oid:undefined},{server_address:null},{server_port:0},
  {protected_column_write_count:1},{binding_column_write_count:1},{audit_column_write_count:1},{scope_unauthorized_write:true},
  {db:'other'},{db_role:'hft_engineering'},{pg_version:180006},
  {server_address:'127.0.0.1/32'},{role_table_count:3},{audit_trigger_count:1},
  {schema_create:true},{restricted_login:false},{assignment_insert:false},
  {audit_read:false},{scope_epoch_update:false},
  {protected_function_execute_count:1},{protected_relation_write_count:1},
  {privileged_role_memberships:1},{stock_account_read:true},
  {identity_binding_write:true},{audit_write_or_delete:true},
  {secret_schema_usage:true},{operational_schema_create:true}
 ])await assert.rejects(assertRoleConnection(client(patch),base),
  /ROLE_DATABASE_IDENTITY_ACL_OR_AUDIT_NOT_ADMITTED/);
});

test('retained role checkout accepts proxy termination only with verified client TLS',async()=>{
 assert.match(ROLE_BACKEND_CATALOG_SQL,/pg_catalog\.host\(inet_server_addr\(\)\) AS server_address/);
 await assert.doesNotReject(assertRoleConnection(client({tls:false,tls_version:null}),base));
 for(const socket of [{encrypted:false},{authorized:false},{servername:'wrong.example.org'},
  {remotePort:5433},{getProtocol:()=> 'TLSv1.1'},
  {getPeerCertificate:()=>({raw:Buffer.from('synthetic'),subjectaltname:'DNS:wrong.example.org'})}])
  await assert.rejects(assertRoleConnection(client({tls:false,tls_version:null},socket),base),/CLIENT_TLS_NOT_VERIFIED/);
});
test('missing protected or role schemas fail explicitly; safe OID lookups only',async()=>{
 for(const schema of ['hft','hft_secret','hft_app_roles'])
  await assert.rejects(assertRoleConnection(client({missing_required_schemas:[schema]}),base),
   /ROLE_REQUIRED_SCHEMAS_NOT_INSTALLED/);
 assert.doesNotMatch(ROLE_BACKEND_CATALOG_SQL,/pg_catalog\.coalesce/i);
 assert.doesNotMatch(ROLE_BACKEND_CATALOG_SQL,/has_schema_privilege\(current_user,'/);
 assert.match(ROLE_BACKEND_CATALOG_SQL,/to_regnamespace/);
 assert.match(ROLE_BACKEND_CATALOG_SQL,/pg_attribute/);
});
test('minimum Roles-only target requires actual secret-schema absence, canonical schemas and unchanged privilege checks',async()=>{
 const hosted={...base,HFT_HOSTED_OPERATOR_PROFILE:HOSTED_OPERATOR_PROFILE,HFT_HOSTED_OPERATOR_MODE:'ROLES_ONLY',
  HFT_OPERATIONS_SOURCE:'database',HFT_SESSION_ISSUER:HOSTED_OPERATOR_ISSUER,HFT_SESSION_AUDIENCE:HOSTED_OPERATOR_AUDIENCE,
  HFT_HOSTED_OPERATOR_ADMISSION_SHA256:'a'.repeat(64),HFT_HOSTED_OPERATOR_SOURCE_COMMIT:'b'.repeat(40),
  VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),HFT_HOSTED_OPERATOR_ACTORS_JSON:'{}'};
 const minimal={missing_required_schemas:['hft_secret'],secret_schema_present:false,tls:false,tls_version:null};
 assert.match(ROLE_BACKEND_CATALOG_SQL,/to_regnamespace\('hft_secret'\) IS NOT NULL AS secret_schema_present/);
 await assert.doesNotReject(assertRoleConnection(client(minimal),hosted));
 for(const drift of [{missing_required_schemas:[],secret_schema_present:true},{secret_schema_present:undefined},
  {secret_schema_present:true},{missing_required_schemas:[]},{missing_required_schemas:['hft','hft_secret']},
  {missing_required_schemas:['hft_app_roles','hft_secret']},{missing_required_schemas:['hft_secret','hft_secret']},
  {secret_schema_usage:true},{protected_function_execute_count:1},{protected_relation_write_count:1},
  {protected_column_write_count:1},{stock_account_read:true},{stock_history_read:true},{privileged_role_memberships:1},
  {identity_binding_write:true},{audit_write_or_delete:true},{audit_trigger_count:1},{scope_unauthorized_write:true}])
  await assert.rejects(assertRoleConnection(client({...minimal,...drift}),hosted),/NOT_INSTALLED|NOT_ADMITTED/);
 await assert.rejects(assertRoleConnection(client(minimal,{authorized:false}),hosted),/CLIENT_TLS_NOT_VERIFIED/);
 await assert.rejects(assertRoleConnection(client(minimal),base),/ROLE_REQUIRED_SCHEMAS_NOT_INSTALLED/);
 const receive={...hosted,HFT_HOSTED_OPERATOR_MODE:'ROLES_RECEIVE',HFT_STORES_RUNTIME_PROFILE:RETAINED_STORE_PROFILE,
  HFT_STORES_RESOURCE_PROJECT:base.HFT_ROLE_RESOURCE_PROJECT,HFT_STORES_RESOURCE_BRANCH:base.HFT_ROLE_RESOURCE_BRANCH,
  HFT_STORES_APPROVED_DATABASE:base.HFT_ROLE_PG_DATABASE,PGDATABASE:base.HFT_ROLE_PG_DATABASE,
  PGHOST:host,PGPORT:'5432'};
 await assert.rejects(assertRoleConnection(client(minimal),receive),/ROLE_REQUIRED_SCHEMAS_NOT_INSTALLED/);
 await assert.doesNotReject(assertRoleConnection(client(),receive));
});
test('trigger admission rejects disabled, replica-only, misplaced, replaced and no-op functions',()=>{
 assert.doesNotThrow(()=>assertRoleEnforcement(ROLE_EXPECTED_TRIGGERS));
 for(let i=0;i<ROLE_EXPECTED_TRIGGERS.length;i++)for(const patch of [
  {enabled:'D'},{enabled:'R'},{enabled:'O'},{relation:'scope_lock_wrong'},
  {function_name:'noop'},{function_schema:'public'},{body:'BEGIN RETURN NULL; END'},
  {relation_schema:'public'},{relation_owner_secure:false},{owner:'hft_r1_roles_np_login'},{owner_login:true},{owner_super:true},
  {owners_match:false},{security_definer:true},{no_filter:false},
  {function_executable:true},{config:['search_path=public']},{type:0},
  {constraint_relation_matches:false},{no_arguments:false},{returns_trigger:false}
 ]){
  const rows=ROLE_EXPECTED_TRIGGERS.map(x=>({...x}));
  rows[i]={...rows[i],...patch} as typeof rows[number];
  assert.throws(()=>assertRoleEnforcement(rows),/ENFORCEMENT_NOT_ADMITTED/);
 }
 for(const patch of [{deferred:false},{deferrable:false},{constraint_type:''}]){
  const rows=ROLE_EXPECTED_TRIGGERS.map(x=>({...x}));rows[0]={...rows[0],...patch};
  assert.throws(()=>assertRoleEnforcement(rows),/ENFORCEMENT_NOT_ADMITTED/);
 }
 assert.throws(()=>assertRoleEnforcement(ROLE_EXPECTED_TRIGGERS.slice(1)));
 assert.throws(()=>assertRoleEnforcement([...ROLE_EXPECTED_TRIGGERS,ROLE_EXPECTED_TRIGGERS[0]]));
});
test('enforcement pins match exact guarded installation source bodies and events',()=>{
 const sql=readFileSync(new URL('../../db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql',import.meta.url),'utf8');
 for(const row of ROLE_EXPECTED_TRIGGERS){
  assert.ok(sql.includes(row.body));
  assert.ok(sql.includes(`ALTER TABLE ${row.relation_schema}.${row.relation} ENABLE ALWAYS TRIGGER ${row.trigger};`));
 }
 assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE/);
 assert.match(sql,/pg_advisory_xact_lock\(1212568624,77\)/);
 assert.ok(sql.indexOf('HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED')<sql.indexOf('CREATE SCHEMA'));
});
