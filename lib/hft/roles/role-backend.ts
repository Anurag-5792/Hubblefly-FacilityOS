import {isRoleQualificationAttempt,assertRoleQualificationProfile,assertQualificationConnection,QUAL077_PROFILE}
 from './role-isolated-profile.ts';
/** Restricted nonproduction application ROLE backend. No protected P2/P3 role
 * enrollment, ledger DML or hidden issuer authority. This is a source-level
 * connector: requires independently admitted hft_app_roles SQL and LOGIN.
 */
import {X509Certificate} from 'node:crypto';
import {ROLE_TRIGGER_CATALOG_SQL,ROLE_ENFORCEMENT_SHA256,assertRoleEnforcement}
 from './role-enforcement.ts';
import {isIP} from 'node:net';
import {createRequire} from 'node:module';
import type {RoleSqlClient,RoleSqlPool} from './role-postgres.ts';

export const ROLE_BACKEND_PROFILE='HFT_R1_APP_ROLES_RETAINED_NP_077_V1' as const;
export type RoleBackendEnv=Readonly<Record<string,string|undefined>>;
const hex=/^[0-9a-f]{64}$/;
const id=/^[a-z][a-z0-9-]*$/;
const forbidden=['PGUSER','PGPASSWORD','PGHOSTADDR','PGSERVICE','PGSERVICEFILE',
 'PGOPTIONS','PGTARGETSESSIONATTRS','PGSSLCERT','PGSSLKEY','PGSSLROOTCERT',
 'PGPASSFILE','DATABASE_URL','DATABASE_URL_UNPOOLED','POSTGRES_URL',
 'POSTGRES_PRISMA_URL','POSTGRES_URL_NON_POOLING'];
export function isRoleBackendProfile(env:RoleBackendEnv):boolean{
 return env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE===ROLE_BACKEND_PROFILE||
  env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE===QUAL077_PROFILE;
}
export function assertRoleBackendProfile(env:RoleBackendEnv):void{
 const qualification=isRoleQualificationAttempt(env);
 if(qualification)assertRoleQualificationProfile(env);
 const host=env.HFT_ROLE_PG_HOST||'';
 const port=env.HFT_ROLE_PG_PORT||'';
 const login=env.HFT_ROLE_PG_LOGIN||'';
 const pwd=env.HFT_ROLE_PG_PASSWORD||'';
 if(!isRoleBackendProfile(env)||env.NODE_ENV!=='production'||
  env.VERCEL_ENV==='production'||(!qualification&&env.HFT_ENVIRONMENT!=='retained-stores-nonproduction')||
  env.HFT_AUTH_SOURCE!=='verified'||env.HFT_LIVE_POSTING_ENABLED!=='false'||
  (!qualification&&(env.HFT_ROLE_RESOURCE_PROJECT!=='wandering-cake-50222227'||
   env.HFT_ROLE_RESOURCE_BRANCH!=='br-shiny-night-b3qgsj8t'||
   env.HFT_ROLE_PG_DATABASE!=='hft_r1_retained_masters_np077'))||
  env.HFT_ROLE_PG_SERVER_VERSION_NUM!=='180007'||
  (!qualification&&login!=='hft_r1_roles_np_login')||login===env.HFT_P2_RUNTIME_LOGIN||
  login===env.HFT_P3_RUNTIME_LOGIN||
  pwd.length<16||pwd.length>4096||
  !/^[1-9][0-9]{0,4}$/.test(port)||Number(port)>65535||
  host!==env.HFT_ROLE_APPROVED_ENDPOINT_HOST||isIP(host)!==0||
  host.length>253||host.endsWith('.')||
  host.split('.').length<3||host.split('.').some(label=>
   !id.test(label)||label.length>63)||
  !hex.test(env.HFT_ROLE_APPROVED_INSTALLER_SHA256||'')||
  !hex.test(env.HFT_ROLE_INDEPENDENT_ADMISSION_SHA256||'')||
  env.HFT_ROLE_APPROVED_ENFORCEMENT_SHA256!==ROLE_ENFORCEMENT_SHA256||
  !env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||
  !env.HFT_SESSION_ISSUER||!env.HFT_SESSION_AUDIENCE||
  !env.HFT_PUBLIC_ORIGIN||
  forbidden.some(x=>Boolean(env[x])))
  throw Error('ROLE_BACKEND_NOT_ADMITTED');
 const origin=env.HFT_PUBLIC_ORIGIN!;
 let u:URL;
 try{u=new URL(origin);}catch{throw Error('ROLE_ORIGIN_NOT_ADMITTED');}
 if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||
  u.pathname!=='/'||u.search||u.hash)
  throw Error('ROLE_ORIGIN_NOT_ADMITTED');
 const ca=env.HFT_ROLE_PG_CA_PEM||'';
 const pemRx=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
 const certs=[...ca.matchAll(pemRx)].map(x=>x[0]);
 if(!certs.length||certs.length>8||ca.length>32768||
  ca.replace(pemRx,'').trim())
  throw Error('ROLE_TLS_CA_NOT_ADMITTED');
 try{
  const now=Date.now();
  for(const pem of certs){const c=new X509Certificate(pem);
   if(!c.ca||now<Date.parse(c.validFrom)||now>=Date.parse(c.validTo))
    throw Error('ROLE_TLS_CA_EXPIRED');
  }
 }catch{throw Error('ROLE_TLS_CA_NOT_ADMITTED');}
}

export function rolePoolOptions(env:RoleBackendEnv):Record<string,unknown>{
 assertRoleBackendProfile(env);
 return {host:env.HFT_ROLE_PG_HOST,port:Number(env.HFT_ROLE_PG_PORT),
  database:env.HFT_ROLE_PG_DATABASE,user:env.HFT_ROLE_PG_LOGIN,
  password:env.HFT_ROLE_PG_PASSWORD,
  ssl:{rejectUnauthorized:true,servername:env.HFT_ROLE_PG_HOST,
   ca:env.HFT_ROLE_PG_CA_PEM,minVersion:'TLSv1.2'},
  application_name:'hft-077-role-assignment-nonproduction',
  connectionTimeoutMillis:4000,idleTimeoutMillis:1500,max:2,
  statement_timeout:12000,allowExitOnIdle:true};
}
export type ManagedRolePool=RoleSqlPool&{end():Promise<void>};
export function openRoleBackendPool(env:RoleBackendEnv):ManagedRolePool{
 const pg=createRequire(import.meta.url)('pg') as {
  Pool:new(options:Record<string,unknown>)=>ManagedRolePool};
 return new pg.Pool(rolePoolOptions(env));
}
export const ROLE_BACKEND_CATALOG_SQL=`
SELECT current_database() AS db,session_user AS db_login,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS db_oid,
 inet_server_addr()::text AS server_address,inet_server_port() AS server_port,
 current_user AS db_role,current_setting('server_version_num')::integer AS pg_version,
 pg_is_in_recovery() AS replica,
 ARRAY(SELECT required.name FROM (VALUES('hft'),('hft_secret'),('hft_app_roles')) required(name)
  WHERE pg_catalog.to_regnamespace(required.name) IS NULL ORDER BY required.name) AS missing_required_schemas,
 (${ROLE_TRIGGER_CATALOG_SQL}) AS enforcement,
 current_setting('session_replication_role') AS replication_mode,
 (SELECT ssl FROM pg_catalog.pg_stat_ssl
  WHERE pid=pg_catalog.pg_backend_pid()) AS tls,
 (SELECT version FROM pg_catalog.pg_stat_ssl
  WHERE pid=pg_catalog.pg_backend_pid()) AS tls_version,
 COALESCE(pg_catalog.has_schema_privilege(current_user,pg_catalog.to_regnamespace('hft_app_roles')::oid,'USAGE'),false) AS schema_usage,
 COALESCE(pg_catalog.has_schema_privilege(current_user,pg_catalog.to_regnamespace('hft_app_roles')::oid,'CREATE'),false) AS schema_create,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.scope_lock'),'SELECT'),false) AS scope_read,
 COALESCE(pg_catalog.has_column_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.scope_lock'),
  (SELECT a.attnum FROM pg_catalog.pg_attribute a
   WHERE a.attrelid=pg_catalog.to_regclass('hft_app_roles.scope_lock')
    AND a.attname='epoch' AND NOT a.attisdropped),'UPDATE'),false) AS scope_epoch_update,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.identity_binding'),'SELECT'),false) AS binding_read,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.assignment'),'SELECT'),false) AS assignment_read,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.assignment'),'INSERT'),false) AS assignment_insert,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.assignment'),'UPDATE'),false) AS assignment_update,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.assignment_event'),'SELECT'),false) AS audit_read,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.assignment_event'),'INSERT'),false) AS audit_insert,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='hft_app_roles' AND c.relkind IN('r','p')
   AND c.relname IN('identity_binding','scope_lock','assignment','assignment_event')
 ) AS role_table_count,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='hft_app_roles' AND NOT t.tgisinternal
   AND t.tgname IN('immutable_assignment_event','assignment_requires_audit')
 ) AS audit_trigger_count,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('hft','hft_secret') AND
   (CASE WHEN c.relkind='S'
     THEN pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
     WHEN c.relkind IN('r','p','v','m','f')
     THEN pg_catalog.has_table_privilege(current_user,c.oid,
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     ELSE false END)
 ) AS protected_relation_write_count,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('hft','hft_secret') AND c.relkind IN('r','p','v','m','f')
   AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'INSERT,UPDATE,REFERENCES')
 ) AS protected_column_write_count,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=pg_catalog.to_regclass('hft_app_roles.identity_binding')
   AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT,UPDATE,REFERENCES')
 ) AS binding_column_write_count,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=pg_catalog.to_regclass('hft_app_roles.assignment_event')
   AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,a.attrelid,a.attnum,'UPDATE,REFERENCES')
 ) AS audit_column_write_count,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.scope_lock'),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=pg_catalog.to_regclass('hft_app_roles.scope_lock') AND a.attnum>0 AND NOT a.attisdropped
   AND (pg_catalog.has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT,REFERENCES')
    OR (a.attname<>'epoch' AND pg_catalog.has_column_privilege(current_user,a.attrelid,a.attnum,'UPDATE'))))
 AS scope_unauthorized_write,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('hft','hft_secret','hft_crypto') AND
   pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
 ) AS protected_function_execute_count,
 (SELECT COUNT(*)::integer FROM pg_catalog.pg_roles r
  WHERE r.rolname IN('hft_engineering','hft_r1_roles_owner','hft_r1_posting_owner',
   'hft_r1_stores_gateway_owner','hft_r1_governance_issuer',
   'hft_r1_p3_master_owner','hft_r1_app_runtime')
   AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER')
 ) AS privileged_role_memberships,
 (SELECT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
  FROM pg_catalog.pg_roles r WHERE r.rolname=current_user) AS restricted_login,
 COALESCE(pg_catalog.has_schema_privilege(current_user,pg_catalog.to_regnamespace('hft')::oid,'CREATE'),false) AS operational_schema_create,
 COALESCE(pg_catalog.has_schema_privilege(current_user,pg_catalog.to_regnamespace('hft_secret')::oid,'USAGE'),false) AS secret_schema_usage,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.identity_binding'),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false)
  AS identity_binding_write,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft_app_roles.assignment_event'),'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false)
  AS audit_write_or_delete,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft.stock_entry'),'SELECT'),false)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=pg_catalog.to_regclass('hft.stock_entry') AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT')) AS stock_history_read,
 COALESCE(pg_catalog.has_table_privilege(current_user,
  pg_catalog.to_regclass('hft.stock_account'),'SELECT'),false)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=pg_catalog.to_regclass('hft.stock_account') AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT')) AS stock_account_read
`;
export type RoleDatabaseIdentity=Readonly<{database:string;oid:string;address:string;port:number}>;
type Catalog=Readonly<{
 db_oid:string;server_address:string;server_port:number;
 protected_column_write_count:number;binding_column_write_count:number;audit_column_write_count:number;
 scope_unauthorized_write:boolean;
 missing_required_schemas:string[];enforcement:unknown;replication_mode:string;
 db:string;db_login:string;db_role:string;pg_version:number;
 replica:boolean;tls:boolean;tls_version:string|null;
 schema_usage:boolean;schema_create:boolean;scope_read:boolean;
 scope_epoch_update:boolean;binding_read:boolean;
 assignment_read:boolean;assignment_insert:boolean;assignment_update:boolean;
 audit_read:boolean;audit_insert:boolean;role_table_count:number;
 audit_trigger_count:number;protected_relation_write_count:number;
 protected_function_execute_count:number;privileged_role_memberships:number;
 restricted_login:boolean;operational_schema_create:boolean;
 secret_schema_usage:boolean;identity_binding_write:boolean;
 audit_write_or_delete:boolean;stock_history_read:boolean;
 stock_account_read:boolean;
}>;
export async function assertRoleConnection(client:RoleSqlClient,
 env:RoleBackendEnv):Promise<RoleDatabaseIdentity>{
 assertRoleBackendProfile(env);
 const result=await client.query<Catalog>(ROLE_BACKEND_CATALOG_SQL);
 const v=result.rows[0];
 if(v&&Array.isArray(v.missing_required_schemas)&&v.missing_required_schemas.length)
  throw Error('ROLE_REQUIRED_SCHEMAS_NOT_INSTALLED');
 if(result.rows.length!==1||!v||!Array.isArray(v.missing_required_schemas)||
  typeof v.db_oid!=='string'||!/^\d+$/.test(v.db_oid)||Number(v.db_oid)<1||
  typeof v.server_address!=='string'||!isIP(v.server_address)||
  !Number.isInteger(v.server_port)||v.server_port<1||v.server_port>65535||
  v.replication_mode!=='origin'||v.db!==env.HFT_ROLE_PG_DATABASE||
  v.db_login!==env.HFT_ROLE_PG_LOGIN||v.db_role!==v.db_login||
  String(v.pg_version)!==env.HFT_ROLE_PG_SERVER_VERSION_NUM||
  v.replica!==false||v.tls!==true||
  !['TLSv1.2','TLSv1.3'].includes(v.tls_version||'')||
  v.schema_usage!==true||v.schema_create!==false||
  v.scope_read!==true||v.scope_epoch_update!==true||
  v.binding_read!==true||v.assignment_read!==true||
  v.assignment_insert!==true||v.assignment_update!==true||
  v.audit_read!==true||v.audit_insert!==true||
  v.role_table_count!==4||v.audit_trigger_count!==2||
  v.protected_relation_write_count!==0||v.protected_column_write_count!==0||
  v.binding_column_write_count!==0||v.audit_column_write_count!==0||v.scope_unauthorized_write!==false||
  v.protected_function_execute_count!==0||
  v.privileged_role_memberships!==0||v.restricted_login!==true||
  v.operational_schema_create!==false||v.secret_schema_usage!==false||
  v.identity_binding_write!==false||v.audit_write_or_delete!==false||
  v.stock_history_read!==false||v.stock_account_read!==false)
  throw Error('ROLE_DATABASE_IDENTITY_ACL_OR_AUDIT_NOT_ADMITTED');
 assertRoleEnforcement(v.enforcement);
 if(isRoleQualificationAttempt(env))await assertQualificationConnection(client,env,'role');
 return Object.freeze({database:v.db,oid:v.db_oid,address:v.server_address,port:v.server_port});
}
