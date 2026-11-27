/** SEC-090-04: fail-closed catalog pin for the existing intake gateway, never a stock writer. */
export const INTAKE_LOGIN='hft_intake_api_login';
export const INTAKE_OWNER='hft_intake_gateway_owner';
// This exact retained installer is the admitted target's database owner, not a runtime role.
export const INTAKE_INSTALLER='hft_r1_retained_masters_np077_owner';
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
  p.proname||'('||replace(pg_catalog.oidvectortypes(p.proargtypes),', ',',')||')' AS signature
 FROM pg_catalog.pg_proc p JOIN user_ns n ON n.oid=p.pronamespace
), gateways AS (
 SELECT * FROM funcs WHERE nspname='hft_intake' AND proname IN ('assert_access','read_page','read_rename','rename_item')
), relations AS (
 SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN user_ns n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','v','p','m','f','S')
), expected_reads(relname) AS (
 VALUES ('access_grant'),('item_candidate'),('opening_observation'),('source_snapshot'),('source_row'),('rename_request')
), expected_inserts(relname,attname) AS (
 VALUES ('rename_request','request_id'),('rename_request','grant_id'),('rename_request','intake_item_id'),
 ('rename_request','expected_revision'),('rename_request','previous_name'),('rename_request','new_name'),
 ('rename_request','reason'),('rename_request','committed_revision'),
 ('item_change_event','intake_item_id'),('item_change_event','revision'),('item_change_event','changed_by'),
 ('item_change_event','before_values'),('item_change_event','after_values')
), expected_triggers(relname,tgname,tgtype,fn,body_hash) AS (
 VALUES
 ('item_candidate','intake_item_audit_edit',17,'audit_item_edit','1d8bc76e3572d4f503151efa38586377d25620962c9e69f2a2820d85cdf91b36'),
 ('item_candidate','intake_item_validate_edit',19,'validate_item_edit','bba810b2c53d7ba50037ee0d43529e2a3bdb1bb8bb9bfaf2a3e720c7c55b147d'),
 ('item_change_event','intake_audit_no_changes',27,'protect_source_row','7e9904f95459fec3f7395585d1e04033a39358c78322a96ee617ad18c123ebe9'),
 ('rename_request','intake_rename_no_changes',27,'protect_source_row','7e9904f95459fec3f7395585d1e04033a39358c78322a96ee617ad18c123ebe9'),
 ('source_row','source_row_no_changes',27,'protect_source_row','7e9904f95459fec3f7395585d1e04033a39358c78322a96ee617ad18c123ebe9')
), actual_triggers AS (
 SELECT t.*,c.relname,p.proname,p.prosrc,p.proconfig,p.prosecdef,p.proowner,p.prorettype,p.prokind,
 p.provolatile,p.proretset,p.pronargs,p.prolang,p.pronamespace
 FROM pg_catalog.pg_trigger t JOIN relations c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
 WHERE c.nspname='hft_intake' AND NOT t.tgisinternal
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
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=o.oid OR
   (m.roleid=o.oid AND NOT (
    m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='hft_r1_retained_masters_np077_owner')
    AND m.member=(SELECT datdba FROM pg_catalog.pg_database WHERE datname=current_database())
    AND m.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='cloud_admin')
    AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)))
  AND (SELECT pg_catalog.pg_get_userbyid(datdba)='hft_r1_retained_masters_np077_owner'
   FROM pg_catalog.pg_database WHERE datname=current_database())
  AND pg_catalog.has_schema_privilege(o.oid,'hft_intake','USAGE')
  AND NOT EXISTS(SELECT 1 FROM user_ns n WHERE pg_catalog.has_schema_privilege(o.oid,n.oid,'CREATE'))
  FROM owner_role o) owner_restricted,
 (SELECT count(*)::int FROM relations c CROSS JOIN owner_role o WHERE
  c.relowner=o.oid OR CASE WHEN c.relkind='S' THEN
   pg_catalog.has_sequence_privilege(o.oid,c.oid,'USAGE,SELECT,UPDATE')
  ELSE
   pg_catalog.has_table_privilege(o.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR pg_catalog.has_table_privilege(o.oid,c.oid,'SELECT WITH GRANT OPTION')
   OR (pg_catalog.has_any_column_privilege(o.oid,c.oid,'SELECT') AND NOT
    (c.nspname='hft_intake' AND EXISTS(SELECT 1 FROM expected_reads e WHERE e.relname=c.relname)))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND (pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
     OR (pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'INSERT') AND NOT
      (c.nspname='hft_intake' AND EXISTS(SELECT 1 FROM expected_inserts e WHERE e.relname=c.relname AND e.attname=a.attname)))
     OR (pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'UPDATE') AND NOT
      (c.nspname='hft_intake' AND c.relname='item_candidate' AND a.attname='display_name'))))
  END) owner_extra_access,
 (SELECT count(*)::int FROM expected_reads e CROSS JOIN owner_role o WHERE EXISTS(
  SELECT 1 FROM relations c WHERE c.nspname='hft_intake' AND c.relname=e.relname
   AND pg_catalog.has_table_privilege(o.oid,c.oid,'SELECT'))) owner_read_count,
 (SELECT count(*)::int FROM expected_inserts e CROSS JOIN owner_role o WHERE EXISTS(
  SELECT 1 FROM relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
  WHERE c.nspname='hft_intake' AND c.relname=e.relname AND a.attname=e.attname
   AND a.attnum>0 AND NOT a.attisdropped AND pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'INSERT'))) owner_insert_count,
 (SELECT EXISTS(SELECT 1 FROM relations c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
  WHERE c.nspname='hft_intake' AND c.relname='item_candidate' AND a.attname='display_name'
   AND a.attnum>0 AND NOT a.attisdropped AND pg_catalog.has_column_privilege(o.oid,c.oid,a.attnum,'UPDATE'))
  FROM owner_role o) owner_name_update,
 (SELECT count(*)::int FROM actual_triggers) trigger_count,
 (SELECT count(*)::int FROM expected_triggers e WHERE EXISTS(
  SELECT 1 FROM actual_triggers t WHERE t.relname=e.relname AND t.tgname=e.tgname AND t.tgtype=e.tgtype
   AND t.tgenabled='O' AND t.tgattr::text='' AND t.tgnargs=0 AND t.tgqual IS NULL
   AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
   AND t.proname=e.fn AND t.pronamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='hft_intake')
   AND t.proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='hft_r1_retained_masters_np077_owner')
   AND NOT t.prosecdef AND t.proconfig=ARRAY['search_path=pg_catalog, pg_temp']::text[]
   AND t.prorettype='pg_catalog.trigger'::regtype AND t.prokind='f' AND t.provolatile='v'
   AND NOT t.proretset AND t.pronargs=0 AND t.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(t.prosrc,'UTF8')),'hex')=e.body_hash)) triggers_verified,
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
  a.owner_restricted!==true||a.owner_extra_access!==0||a.owner_read_count!==6||a.owner_insert_count!==13||
  a.owner_name_update!==true||a.trigger_count!==5||a.triggers_verified!==5||
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
