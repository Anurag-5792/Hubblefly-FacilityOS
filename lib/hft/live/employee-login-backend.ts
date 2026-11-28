import {createHash,X509Certificate} from 'node:crypto';
import {createRequire} from 'node:module';
import {assertVerifiedLiveTls} from './live-tls.ts';
import {employeeLoginProfileAdmitted} from './employee-login-profile.ts';
import {employeeAccess,type EmployeeLoginContext} from './employee-login-core.ts';
import type {RoleSqlClient,RoleSqlPool} from '../roles/role-postgres.ts';
import {EMPLOYEE_FUNCTION_PINS} from './employee-login-pins.ts';
type Env=Readonly<Record<string,string|undefined>>;
type Pool=RoleSqlPool&{end():Promise<void>};
const gateway='hft_r1_employee_login_np_login',owner='hft_r1_employee_login_owner';
const gatewayFunctions=['employee_email_register_v1','employee_email_target_v1','employee_google_claim_v1','employee_login_context_v1'];
const noAmbient=['PGUSER','PGPASSWORD','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLCERT','PGSSLKEY','PGSSLROOTCERT','PGPASSFILE','DATABASE_URL','POSTGRES_URL'];
export function assertEmployeeGatewayProfile(e:Env):void{
 if(!employeeLoginProfileAdmitted(e)||e.HFT_EMPLOYEE_LOGIN_PG_LOGIN!==gateway||
  (e.HFT_EMPLOYEE_LOGIN_PG_PASSWORD??'').length<16||(e.HFT_EMPLOYEE_LOGIN_PG_PASSWORD??'').length>4096||
  e.HFT_ROLE_PG_HOST!=='ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech'||e.HFT_ROLE_PG_HOST!==e.HFT_ROLE_APPROVED_ENDPOINT_HOST||
  e.HFT_ROLE_PG_PORT!=='5432'||noAmbient.some(k=>e[k]!==undefined))throw Error('HF101_GATEWAY_NOT_ADMITTED');
 const origin=new URL(e.HFT_PUBLIC_ORIGIN??'');
 if(origin.protocol!=='https:'||origin.origin!==e.HFT_PUBLIC_ORIGIN)throw Error('HF101_ORIGIN_DENIED');
 const ca=e.HFT_ROLE_PG_CA_PEM??'',rx=/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,certs=[...ca.matchAll(rx)].map(x=>x[0]);
 if(!certs.length||certs.length>8||ca.length>32768||ca.replace(rx,'').trim())throw Error('HF101_CA_DENIED');
 for(const p of certs){const c=new X509Certificate(p);if(!c.ca||Date.now()<Date.parse(c.validFrom)||Date.now()>=Date.parse(c.validTo))throw Error('HF101_CA_DENIED');}
}
const identitySql="SELECT current_database() AS db, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid, current_user AS actor, session_user AS login, current_setting('server_version_num') AS version, pg_is_in_recovery() AS replica, current_setting('session_replication_role') AS replication, (SELECT rolcanlogin AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user) AS restricted, (SELECT count(*)::int FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS memberships, (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='hft_employee_login') AS schema_owner, has_schema_privilege(current_user,'hft_employee_login','USAGE') AS usage, has_schema_privilege(current_user,'hft_employee_login','CREATE') AS create_schema";
const functionsSql="SELECT p.proname AS name, oidvectortypes(p.proargtypes) AS args, p.prosrc AS body, p.prosecdef AS definer, p.provolatile AS volatility, p.proconfig AS config, p.prokind AS kind, pg_get_userbyid(p.proowner) AS owner, NOT (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication) AS secure_owner, has_function_privilege(current_user,p.oid,'EXECUTE') AS executable, EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='hft_employee_login' ORDER BY p.proname";
function aclSql(all:boolean):string{
 const scope=all?"left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'":"n.nspname='hft_employee_login'";
 return "SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE "+scope+" AND ((c.relkind IN('r','p','v','m','f') AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) OR (c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')))) AS tables, (SELECT count(*)::int FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE "+scope+" AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(current_user,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) AS columns, (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','hft_employee_login') AND left(n.nspname,3)<>'pg_' AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS other_functions";
}
const triggerSql="SELECT c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,t.tgtype::int AS type,p.proname AS fn,pg_get_userbyid(c.relowner) AS owner, t.tgqual IS NULL AND t.tgnargs=0 AS unfiltered FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='hft_employee_login' AND NOT t.tgisinternal";
async function admit(c:RoleSqlClient,e:Env,role:boolean){
 assertVerifiedLiveTls(c,e.HFT_ROLE_PG_HOST!,Number(e.HFT_ROLE_PG_PORT));
 const id=(await c.query(identitySql)).rows;
 if(id.length!==1||id[0].db!==e.HFT_ROLE_PG_DATABASE||id[0].oid!=='16397'||id[0].actor!==(role?'hft_r1_roles_np_login':gateway)||id[0].actor!==id[0].login||
  id[0].version!=='180007'||id[0].replica!==false||id[0].replication!=='origin'||id[0].restricted!==true||id[0].memberships!==0||id[0].schema_owner!==owner||id[0].usage!==true||id[0].create_schema!==false)throw Error('HF101_DATABASE_IDENTITY_DENIED');
 const fs=(await c.query(functionsSql)).rows;
 if(fs.length!==Object.keys(EMPLOYEE_FUNCTION_PINS).length||new Set(fs.map(x=>x.name)).size!==fs.length)throw Error('HF101_FUNCTION_CATALOG_DENIED');
 for(const f of fs){
  const expected=EMPLOYEE_FUNCTION_PINS[String(f.name)];
  if(!expected||f.args!==expected.args||typeof f.body!=='string'||createHash('sha256').update(f.body).digest('hex')!==expected.sha256||
   f.owner!==owner||f.secure_owner!==true||f.definer!==expected.definer||f.kind!=='f'||f.volatility!=='v'||JSON.stringify(f.config)!=='["search_path=pg_catalog, pg_temp"]'||
   f.public_execute!==false||f.executable!==(role?f.name==='employee_session_assert_v1':gatewayFunctions.includes(String(f.name))))throw Error('HF101_FUNCTION_CATALOG_DENIED');
 }
 const a=(await c.query(aclSql(!role))).rows;
 if(a.length!==1||a[0].tables!==0||a[0].columns!==0||a[0].other_functions!==0)throw Error('HF101_GATEWAY_ACL_DENIED');
 const t=(await c.query(triggerSql)).rows;
 if(t.length!==1||t[0].relation!=='employee_login_event'||t[0].name!=='employee_login_audit_immutable'||t[0].enabled!=='A'||t[0].type!==58||t[0].fn!=='employee_login_audit_immutable_v1'||t[0].owner!==owner||t[0].unfiltered!==true)throw Error('HF101_AUDIT_TRIGGER_DENIED');
}
export async function assertEmployeeRoleConnection(c:RoleSqlClient,e:Env){if(!employeeLoginProfileAdmitted(e))throw Error('HF101_PROFILE_NOT_ADMITTED');await admit(c,e,true);}
async function gatewayQuery<T>(e:Env,sql:string,args:unknown[],readOnly=false):Promise<T>{
 assertEmployeeGatewayProfile(e);
 const pg=createRequire(import.meta.url)('pg') as {Pool:new(options:Record<string,unknown>)=>Pool};
 const p=new pg.Pool({host:e.HFT_ROLE_PG_HOST,port:5432,database:e.HFT_ROLE_PG_DATABASE,user:gateway,password:e.HFT_EMPLOYEE_LOGIN_PG_PASSWORD,
 ssl:{rejectUnauthorized:true,servername:e.HFT_ROLE_PG_HOST,ca:e.HFT_ROLE_PG_CA_PEM,minVersion:'TLSv1.2'},max:1,connectionTimeoutMillis:4000,statement_timeout:10000,allowExitOnIdle:true});
 let c:RoleSqlClient|undefined,begun=false,committing=false;
 try{
  c=await p.connect();await c.query(readOnly?'BEGIN READ ONLY':'BEGIN');begun=true;
  await c.query("SET LOCAL lock_timeout='2500ms'");await admit(c,e,false);
  const out=await c.query<{value:T}>(sql,args);if(out.rows.length!==1||out.rows[0].value===null||out.rows[0].value===undefined)throw Error('HF101_GATEWAY_READBACK_DENIED');
  committing=true;await c.query('COMMIT');begun=false;return out.rows[0].value;
 }catch(err){if(c&&begun&&!committing)try{await c.query('ROLLBACK');}catch{/* connection discarded */}
  if(committing)throw Error('HF101_COMMIT_UNCONFIRMED');throw err;
 }finally{c?.release(true);await p.end();}
}
export type EmployeeIdentity=Readonly<{legalEntityId:string;employeeId:string;subject:string;personId:string;siteId:string;employeeVersion:number;loginVersion:number}>;
const args=(a:EmployeeIdentity)=>[a.legalEntityId,a.employeeId,a.subject,a.personId,a.loginVersion,a.employeeVersion];
function checked(c:EmployeeLoginContext):EmployeeLoginContext{
 employeeAccess(c,new Date().toISOString());return c;
}
export async function claimEmployee(e:Env,email:string,providerSubject:string){
 const c=checked(await gatewayQuery<EmployeeLoginContext>(e,'SELECT hft_employee_login.employee_google_claim_v1($1,$2) AS value',[email,providerSubject]));
 if(c.email!==email)throw Error('HF101_IDENTITY_READBACK_DENIED');return c;
}
export async function currentEmployee(e:Env,a:EmployeeIdentity){
 const c=checked(await gatewayQuery<EmployeeLoginContext>(e,'SELECT hft_employee_login.employee_login_context_v1($1,$2,$3,$4,$5::bigint,$6::bigint) AS value',args(a),true));
 if(c.legalEntityId!==a.legalEntityId||c.employeeId!==a.employeeId||c.subject!==a.subject||c.personId!==a.personId||c.siteId!==a.siteId||c.loginVersion!==a.loginVersion||c.employeeVersion!==a.employeeVersion)throw Error('HF101_IDENTITY_READBACK_DENIED');
 return c;
}
export type EmailTarget={employeeId:string;fullName:string;email:string|null;version:number;bound:boolean};
export async function emailTarget(e:Env,a:EmployeeIdentity,employeeId:string,warehouseId:string){
 const t=await gatewayQuery<EmailTarget>(e,'SELECT hft_employee_login.employee_email_target_v1($1,$2,$3,$4,$5,$6::bigint,$7::bigint,$8) AS value',[a.legalEntityId,employeeId,a.employeeId,a.subject,a.personId,a.loginVersion,a.employeeVersion,warehouseId],true);
 if(t.employeeId!==employeeId||!Number.isSafeInteger(t.version)||t.version<0||typeof t.bound!=='boolean')throw Error('HF101_TARGET_READBACK_DENIED');return t;
}
export async function registerEmployeeEmail(e:Env,a:EmployeeIdentity,employeeId:string,warehouseId:string,email:string,version:number,reason:string){
 const result=await gatewayQuery<string>(e,'SELECT hft_employee_login.employee_email_register_v1($1,$2,$3,$4::bigint,$5,$6,$7,$8::bigint,$9::bigint,$10,$11)::text AS value',[a.legalEntityId,employeeId,email,version,a.employeeId,a.subject,a.personId,a.loginVersion,a.employeeVersion,warehouseId,reason]);
 const t=await emailTarget(e,a,employeeId,warehouseId);
 if(Number(result)!==version+1||t.version!==Number(result)||t.email!==email)throw Error('HF101_COMMIT_UNCONFIRMED');return t;
}
