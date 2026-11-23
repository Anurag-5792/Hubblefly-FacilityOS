/** QUAL077: separately signed, expiring fixture admission. Never retained aliases.
 * No default target, signing key, enrollment, credentials or execution authority.
 * The CLI harness verifies the checkout; both real DB clients verify the same
 * immutable installed admission. Public middleware deliberately stays closed.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {lstatSync,readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {isIP} from 'node:net';
import {assertRetainedStoresProfile,isRetainedStoresProfile,STORES_GATEWAY_REVIEW_SHA256}
 from '../stores/ops-a2-retained-profile.ts';
export type QualificationEnv=Readonly<Record<string,string|undefined>>;
export const QUAL077_PROFILE='HFT_R1_ROLE077_ISOLATED_POSTGRES_V1' as const;
export const QUAL077_BINDING_BODY="\nBEGIN RAISE EXCEPTION 'QUAL077_BINDING_IMMUTABLE'; END ";
export type QualificationAdmission=Readonly<{
 version:'HFT_ROLE077_ISOLATED_ADMISSION_V1';fixtureOnly:true;authorityRef:string;executor:string;
 issuedAt:string;expiresAt:string;
 target:{project:string;branch:string;database:string;host:string;port:string;backendPort:string;
  pgVersion:'180007';databaseOid:string;resourceNonce:string};
 source:{commit:string;tree:string};
 installer:{role:string;stock:string;binding:string;fixtureHelpers:string;gateway:string};
 logins:{role:string;stock:string;p3:string;fixtureExecutor:string};
 session:{issuer:string;audience:string;publicKeySha256:string;synthetic:true};
 proofs:{p0Sha256:string;p2Sha256:string;p0Version:string;p2Version:string;synthetic:true};
 fixtureSha256:string;permissions:readonly string[];
}>;
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const sha=/^[a-f0-9]{64}$/;
const commit=/^[a-f0-9]{40}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function reject():never{throw Error('QUAL077_ISOLATED_ADMISSION_REQUIRED');}
function exact(v:unknown,keys:string[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==[...keys].sort().join())reject();
 return v as Record<string,unknown>;
}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>1&&v.length<512;
const digest=(v:unknown)=>typeof v==='string'&&sha.test(v)&&v!=='0'.repeat(64);
export function isRoleQualificationAttempt(env:QualificationEnv):boolean{
 return env.HFT_STORES_RUNTIME_PROFILE===QUAL077_PROFILE||
  env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE===QUAL077_PROFILE||
  Object.keys(env).some(k=>k.startsWith('HFT_QUAL077_')&&env[k]!==undefined);
}
/** Pure signature/shape verifier is also exercised with clearly synthetic keys
 * by offline tests. A generated test signature is not an execution approval. */
export function verifyQualificationAdmission(bytes:Uint8Array,env:QualificationEnv):QualificationAdmission{
 if(bytes.length>32768||hash(bytes)!==env.HFT_QUAL077_ADMISSION_SHA256)reject();
 const envelope=exact(JSON.parse(Buffer.from(bytes).toString('utf8')),['payload','signature']);
 if(typeof envelope.payload!=='string'||typeof envelope.signature!=='string')reject();
 const payload=Buffer.from(envelope.payload,'base64url'),sig=Buffer.from(envelope.signature,'base64url');
 if(payload.toString('base64url')!==envelope.payload||sig.toString('base64url')!==envelope.signature||sig.length!==64)reject();
 const pem=env.HFT_QUAL077_ADMISSION_PUBLIC_KEY_PEM||'';
 if(!digest(env.HFT_QUAL077_TRUST_ROOT_SHA256)||hash(pem)!==env.HFT_QUAL077_TRUST_ROOT_SHA256)reject();
 const key=createPublicKey(pem);
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,payload,key,sig))reject();
 const a=exact(JSON.parse(payload.toString('utf8')),['version','fixtureOnly','authorityRef','executor','issuedAt','expiresAt',
  'target','source','installer','logins','session','proofs','fixtureSha256','permissions']);
 if(!digest(a.fixtureSha256))reject();
 if(a.version!=='HFT_ROLE077_ISOLATED_ADMISSION_V1'||a.fixtureOnly!==true||
  !text(a.authorityRef)||!text(a.executor)||a.executor==='UNASSIGNED')reject();
 const issued=Date.parse(String(a.issuedAt)),expires=Date.parse(String(a.expiresAt)),now=Date.now();
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now||expires<=now||expires-issued>86400000)reject();
 const t=exact(a.target,['project','branch','database','host','port','backendPort','pgVersion','databaseOid','resourceNonce']);
 if(!Object.values(t).every(text)||t.branch==='br-shiny-night-b3qgsj8t'||
  !/^hft_r1_disposable_role077_[a-z0-9_]{6,24}$/.test(String(t.database))||
  t.pgVersion!=='180007'||!uuid.test(String(t.resourceNonce))||!/^\d+$/.test(String(t.databaseOid))||Number(t.databaseOid)<1||
  isIP(String(t.host))!==0||!/^([a-z0-9][a-z0-9-]*\.){2,}[a-z]{2,}$/.test(String(t.host))||
  /(^|[.-])(localhost|local)([.-]|$)/.test(String(t.host))||String(t.host).length>253)reject();
 for(const p of [t.port,t.backendPort])if(!/^[1-9][0-9]{0,4}$/.test(String(p))||Number(p)>65535)reject();
 const s=exact(a.source,['commit','tree']);
 if(!Object.values(s).every(v=>typeof v==='string'&&commit.test(v))||
  s.commit!==env.HFT_QUAL077_SOURCE_COMMIT||s.tree!==env.HFT_QUAL077_SOURCE_TREE)reject();
 const i=exact(a.installer,['role','stock','binding','fixtureHelpers','gateway']);
 if(!Object.values(i).every(digest)||i.gateway!==STORES_GATEWAY_REVIEW_SHA256)reject();
 const l=exact(a.logins,['role','stock','p3','fixtureExecutor']);
 if(new Set(Object.values(l)).size!==4||!Object.values(l).every(v=>
  typeof v==='string'&&/^hft_r1_[a-z0-9_]{2,30}_qual077$/.test(v)&&!/(owner|admin|superuser)/.test(v)))reject();
 const se=exact(a.session,['issuer','audience','publicKeySha256','synthetic']);
 if(se.synthetic!==true||!digest(se.publicKeySha256)||![se.issuer,se.audience].every(v=>
  typeof v==='string'&&v.startsWith('QUAL077-SYNTHETIC-')))reject();
 const pr=exact(a.proofs,['p0Sha256','p2Sha256','p0Version','p2Version','synthetic']);
 if(pr.synthetic!==true||!digest(pr.p0Sha256)||!digest(pr.p2Sha256)||pr.p0Sha256===pr.p2Sha256||
  ![pr.p0Version,pr.p2Version].every(v=>typeof v==='string'&&/^[1-9][0-9]{0,7}$/.test(v)))reject();
 const allowed=['catalog','role-writes','fixture-mutations','trigger-negatives','route-receive','route-read','concurrency'];
 if(!Array.isArray(a.permissions)||new Set(a.permissions).size!==a.permissions.length||
  a.permissions.some(p=>!allowed.includes(p))||!allowed.every(p=>(a.permissions as unknown[]).includes(p)))reject();
 return a as unknown as QualificationAdmission;
}
export function assertRoleQualificationProfile(env:QualificationEnv):QualificationAdmission{
 if(env.HFT_STORES_RUNTIME_PROFILE!==QUAL077_PROFILE||env.HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE!==QUAL077_PROFILE||
  env.HFT_ENVIRONMENT!=='isolated-role-qualification'||env.NODE_ENV!=='production'||env.VERCEL!==undefined||
  env.VERCEL_ENV!==undefined||env.HFT_LIVE_POSTING_ENABLED!=='false'||env.HFT_AUTH_SOURCE!=='verified'||
  env.HFT_OPERATIONS_SOURCE!=='database'||env.HFT_DATABASE_TRANSPORT!=='ONLINE_TLS'||
  env.HFT_ONLINE_DB_CREDENTIAL_SOURCE!=='MANAGED_RUNTIME_SECRET'||
  env.HFT_POSTING_RUN_MODE!=='ROLE077_ISOLATED_POSTGRES'||
  env.HFT_OPS_A2_SOURCE_MODE!=='ROLE077_ISOLATED_OPERATOR_V1'||env.HFT_DRAFT_RUNTIME_PROFILE!==undefined||
  env.HFT_MASTERS_RUNTIME_PROFILE!==undefined||env.HFT_TEST_PG_DATABASE!==undefined)reject();
 const path=env.HFT_QUAL077_ADMISSION_FILE;
 if(!path||!isAbsolute(path))reject();
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o022)!==0||stat.size>32768)reject();
 const a=verifyQualificationAdmission(readFileSync(path),env),t=a.target;
 const pairs:Record<string,string>={
  PGHOST:t.host,PGPORT:t.port,PGDATABASE:t.database,HFT_APPROVED_PG_PORT:t.port,
  HFT_ONLINE_DB_ENDPOINT_HOST:t.host,HFT_ONLINE_DB_BACKEND_PORT:t.backendPort,
  HFT_ROLE_RESOURCE_PROJECT:t.project,HFT_ROLE_RESOURCE_BRANCH:t.branch,
  HFT_STORES_RESOURCE_PROJECT:t.project,HFT_STORES_RESOURCE_BRANCH:t.branch,
  HFT_ROLE_PG_HOST:t.host,HFT_ROLE_APPROVED_ENDPOINT_HOST:t.host,HFT_ROLE_PG_PORT:t.port,
  HFT_ROLE_PG_DATABASE:t.database,HFT_STORES_APPROVED_DATABASE:t.database,
  HFT_ROLE_PG_SERVER_VERSION_NUM:t.pgVersion,HFT_STORES_APPROVED_PG_VERSION:t.pgVersion,
  HFT_ROLE_PG_LOGIN:a.logins.role,HFT_P2_RUNTIME_LOGIN:a.logins.stock,HFT_P3_RUNTIME_LOGIN:a.logins.p3,
  HFT_ROLE_APPROVED_INSTALLER_SHA256:a.installer.role,HFT_STORES_APPROVED_INSTALLER_SHA256:a.installer.stock,
  HFT_QUAL077_BINDING_INSTALLER_SHA256:a.installer.binding,
  HFT_QUAL077_FIXTURE_HELPERS_SHA256:a.installer.fixtureHelpers,
  HFT_STORES_APPROVED_OPERATOR_GATEWAY_SHA256:a.installer.gateway,
  HFT_STORES_OPERATOR_GATEWAY_ABI:'HF13_OPS_A2_OPERATOR_RECEIVE_V1',
  HFT_STORES_SQL_CONTRACT:'HFT_R1_OPS_A2_OPERATIONAL_PG187_V2',
  HFT_ROLE_INDEPENDENT_ADMISSION_SHA256:env.HFT_QUAL077_ADMISSION_SHA256!,
  HFT_SESSION_ISSUER:a.session.issuer,HFT_SESSION_AUDIENCE:a.session.audience,
  HFT_OPS_A2_POST_KEY_VERSION:a.proofs.p2Version,HFT_P0_STORES_KEY_VERSION:a.proofs.p0Version
 };
 for(const [k,v] of Object.entries(pairs))if(env[k]!==v)reject();
 if(hash(env.HFT_SESSION_ED25519_PUBLIC_KEY_PEM||'')!==a.session.publicKeySha256||
  hash(Buffer.from(env.HFT_OPS_A2_POST_KEY_BASE64||'','base64'))!==a.proofs.p2Sha256||
  hash(Buffer.from(env.HFT_P0_STORES_KEY_BASE64||'','base64'))!==a.proofs.p0Sha256)reject();
 return a;
}
export function isOperatorRuntimeProfile(env:QualificationEnv):boolean{
 return isRetainedStoresProfile(env)||isRoleQualificationAttempt(env);
}
export function assertOperatorRuntimeProfile(env:QualificationEnv):void{
 if(isRoleQualificationAttempt(env))assertRoleQualificationProfile(env);
 else assertRetainedStoresProfile(env);
}
export const QUAL077_BINDING_SQL=`SELECT b.admission_sha256,b.payload,
 current_database() AS db,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS db_oid,
 session_user AS login,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port,
 current_setting('server_version_num') AS version,
 (SELECT count(*)=1 FROM hft_qual077.execution_binding) AS singular,
 EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN('hft','hft_secret') AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
   AND pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) AS protected_column_access,
 NOT pg_catalog.has_table_privilege(current_user,'hft_qual077.execution_binding',
  'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute x WHERE x.attrelid='hft_qual077.execution_binding'::regclass
   AND x.attnum>0 AND NOT x.attisdropped AND pg_catalog.has_column_privilege(current_user,x.attrelid,x.attnum,
    'INSERT,UPDATE,REFERENCES')) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_qual077'
     AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')) AS readonly_binding,
 (SELECT count(*)=1 AND bool_and(t.tgenabled='A' AND t.tgtype=62 AND t.tgqual IS NULL AND t.tgnargs=0
   AND t.tgattr=''::pg_catalog.int2vector AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred
   AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND t.tgparentid=0 AND t.tgargs=''::bytea
   AND t.tgname='immutable_qualification_binding' AND p.proname='deny_binding_mutation'
   AND p.prosrc=$1 AND p.pronamespace=c.relnamespace AND p.proowner=c.relowner
   AND c.relowner=n.nspowner AND c.relkind='r' AND NOT p.prosecdef AND p.prokind='f'
   AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof
   AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND l.lanname='plpgsql'
   AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
   AND NOT o.rolcanlogin AND NOT o.rolsuper AND NOT o.rolbypassrls
   AND NOT pg_catalog.pg_has_role(current_user,o.oid,'MEMBER')
   AND NOT pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE'))
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_roles o ON o.oid=p.proowner
  WHERE t.tgrelid='hft_qual077.execution_binding'::regclass AND NOT t.tgisinternal) AS immutable
 FROM hft_qual077.execution_binding b`;
function canonical(v:unknown):string{
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 const r=v as Record<string,unknown>;
 return '{'+Object.keys(r).sort().map(k=>JSON.stringify(k)+':'+canonical(r[k])).join(',')+'}';
}
export async function assertQualificationConnection(client:{query<T extends Record<string,unknown>>(sql:string,values:string[]):Promise<{rows:readonly T[]}>},
 env:QualificationEnv,duty:'role'|'stock'):Promise<void>{
 const a=assertRoleQualificationProfile(env);
 const r=await client.query<Record<string,unknown>>(QUAL077_BINDING_SQL,[QUAL077_BINDING_BODY]);
 const x=r.rows[0];
 if(r.rows.length!==1||x.db!==a.target.database||x.db_oid!==a.target.databaseOid||
  x.login!==a.logins[duty]||x.role!==x.login||x.port!==Number(a.target.backendPort)||
  typeof x.address!=='string'||!isIP(x.address)||x.version!==a.target.pgVersion||
  x.admission_sha256!==env.HFT_QUAL077_ADMISSION_SHA256||x.singular!==true||
  x.readonly_binding!==true||x.immutable!==true||(duty==='stock'&&x.protected_column_access!==false)||canonical(x.payload)!==canonical(a))
  throw Error('QUAL077_INSTALLED_DATABASE_BINDING_DENIED');
}
