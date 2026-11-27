/** SEC-090-04: fail-closed catalog pin for the existing intake gateway, never a stock writer. */
export const INTAKE_LOGIN='hft_intake_api_login';
export const INTAKE_OWNER='hft_intake_gateway_owner';
// Exact prosrc hashes of db/intake/0002_owner_review_gateway.sql. Only owner/path/ACL may change.
export const INTAKE_GATEWAY_BODIES={
 "assert_access(uuid,text,boolean)": "e3aae018af66bde222d82bc1baeeb62c589357b4158c580572be043b9591b8bd",
 "read_page(uuid,text,text,text,integer,integer)": "cc59fc32ddd903a35394615ec4eb2b0040013e672c1f5361aaf1aa039d58ac11",
 "read_rename(uuid,text,uuid)": "b2d670667ebc9a37d46addc458a6a9f2c306f8f0ebd3de26a51418b6d94c2197",
 "rename_item(uuid,text,uuid,text,integer,text,text)": "6e8494c32185fe9da7bad8f3327f6015ac5e1d4c2db4461b937e6759fe227730"
} as const;
const signatures=Object.keys(INTAKE_GATEWAY_BODIES).sort();
export const INTAKE_RUNTIME_SIGNATURES=signatures.filter(s=>!s.startsWith('assert_access('));
export const intakeAdmissionSql=`
WITH owner_role AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
 FROM pg_catalog.pg_roles WHERE rolname='hft_intake_gateway_owner'
), user_ns AS (
 SELECT oid,nspname FROM pg_catalog.pg_namespace
 WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname !~ '^pg_(toast|temp)'
), funcs AS (
 SELECT p.*,n.nspname,
  p.proname||'('||replace(pg_catalog.oidvectortypes(p.proargtypes),', ','')||')' AS signature
 FROM pg_catalog.pg_proc p JOIN user_ns n ON n.oid=p.pronamespace
), gateways AS (
 SELECT * FROM funcs WHERE nspname='hft_intake' AND proname IN ('assert_access','read_page','read_rename','rename_item')
), relations AS (
 SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN user_ns n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','v','p','m','f','S')
)
SELECT current_database() db,current_user login,session_user session_login,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) oid,
 (SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
  FROM pg_catalog.pg_roles WHERE rolname=current_user) restricted,
 (SELECT count(*)::int FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) memberships,
 (SELECT count(*)::int FROM pg_catalog.pg_database d WHERE d.datname<>current_database() AND d.datallowconn
  AND pg_catalog.has_database_privilege(current_user,d.oid,'CONNECT,TEMP,CREATE')) sibling_access,
 (pg_catalog.has_database_privilege(current_user,current_database(),'CONNECT')
  AND NOT pg_catalog.has_database_privilege(current_user,current_database(),'TEMP,CREATE')) target_connect_only,
 pg_catalog.has_schema_privilege(current_user,'hft_intake','USAGE') schema_usage,
 (SELECT count(*)::int FROM user_ns n WHERE pg_catalog.has_schema_privilege(current_user,n.oid,'CREATE')) schema_create,
 (SELECT count(*)::int FROM relations c WHERE CASE WHEN c.relkind='S'
  THEN pg_catalog.has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
  ELSE pg_catalog.has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR pg_catalog.has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END) direct_access,
 (SELECT coalesce(jsonb_agg(f.signature ORDER BY f.signature),'[]'::jsonb) FROM funcs f
  WHERE f.nspname='hft_intake' AND pg_catalog.has_function_privilege(current_user,f.oid,'EXECUTE')) functions,
 (SELECT count(*)::int FROM funcs f WHERE f.nspname<>'hft_intake' AND pg_catalog.has_function_privilege(current_user,f.oid,'EXECUTE')) other_execute,
 (SELECT NOT (o.rolcanlogin OR o.rolinherit OR o.rolsuper OR o.rolcreatedb OR o.rolcreaterole OR o.rolreplication OR o.rolbypassrls)
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=o.oid OR m.roleid=o.oid)
  AND pg_catalog.has_schema_privilege(o.oid,'hft_intake','USAGE')
  AND NOT EXISTS(SELECT 1 FROM user_ns n WHERE pg_catalog.has_schema_privilege(o.oid,n.oid,'CREATE'))
  FROM owner_role o) owner_restricted,
 (SELECT count(*)::int FROM relations c CROSS JOIN owner_role o WHERE
  c.relowner=o.oid OR CASE WHEN c.relkind='S' THEN
   pg_catalog.has_sequence_privilege(o.oid,c.oid,'SELECT,UPDATE')
   OR (pg_catalog.has_sequence_privilege(o.oid,c.oid,'USAGE') AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE d.classid='pg_catalog.pg_class'::regclass AND d.refclassid='pg_catalog.pg_class'::regclass
    AND d.objid=c.oid AND d.deptype IN ('a','i') AND n.nspname='hft_intake' AND t.relname IN ('rename_request','item_change_event')))
  ELSE
   pg_catalog.has_table_privilege(o.oid,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR (pg_catalog.has_any_column_privilege(o.oid,c.oid,'SELECT') AND NOT
    (c.nspname='hft_intake' AND c.relname IN ('access_grant','item_candidate','opening_observation','source_snapshot','source_row','rename_request')))
   OR (pg_catalog.has_any_column_privilege(o.oid,c.oid,'INSERT') AND NOT
    (c.nspname='hft_intake' AND c.relname IN ('rename_request','item_change_event')))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND (pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'REFERENCES')
     OR (pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'UPDATE') AND NOT
      (c.nspname='hft_intake' AND c.relname='item_candidate' AND a.attname='display_name'))))
  END) owner_extra_access,
 (SELECT coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.signature,'bodySha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex'),
  'owner',pg_catalog.pg_get_userbyid(p.proowner),'definer',p.prosecdef,
  'path',p.proconfig,'language',(SELECT lanname FROM pg_catalog.pg_language WHERE oid=p.prolang),
  'returns',pg_catalog.format_type(p.prorettype,NULL),'kind',p.prokind,'volatility',p.provolatile,
  'returnsSet',p.proretset,'aclOk',NOT EXISTS(
   SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE a.grantee<>p.proowner AND (a.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
     OR a.is_grantable OR p.proname='assert_access')),
  'runtimeExecute',pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
 ) ORDER BY p.signature),'[]'::jsonb) FROM gateways p) gateways
`;
type Target={database:string;oid:string};
export function assertIntakeCatalog(row:unknown,target:Target):void{
 const deny=()=>{throw Error('INTAKE_DB_NOT_ADMITTED');};
 if(!row||typeof row!=='object'||Array.isArray(row))return deny();
 const a=row as Record<string,unknown>;
 if(a.db!==target.database||a.oid!==target.oid||a.login!==INTAKE_LOGIN||a.session_login!==INTAKE_LOGIN||
  a.restricted!==true||a.memberships!==0||a.sibling_access!==0||a.target_connect_only!==true||
  a.schema_usage!==true||a.schema_create!==0||a.direct_access!==0||a.other_execute!==0||
  a.owner_restricted!==true||a.owner_extra_access!==0||
  JSON.stringify(a.functions)!==JSON.stringify(INTAKE_RUNTIME_SIGNATURES)||!Array.isArray(a.gateways)||a.gateways.length!==signatures.length)return deny();
 const seen=new Set<string>();
 for(const g of a.gateways){
  if(!g||typeof g!=='object'||typeof g.signature!=='string'||!Object.hasOwn(INTAKE_GATEWAY_BODIES,g.signature)||seen.has(g.signature))return deny();
  seen.add(g.signature);
  const sig=g.signature as keyof typeof INTAKE_GATEWAY_BODIES,internal=sig.startsWith('assert_access(');
  if(g.bodySha256!==INTAKE_GATEWAY_BODIES[sig]||g.owner!==INTAKE_OWNER||g.definer!==true||
   JSON.stringify(g.path)!==JSON.stringify(['search_path=pg_catalog, pg_temp'])||
   g.language!=='plpgsql'||g.returns!==(internal?'void':'jsonb')||g.kind!=='f'||g.volatility!=='v'||
   g.returnsSet!==false||g.aclOk!==true||g.runtimeExecute!==!internal)return deny();
 }
}
