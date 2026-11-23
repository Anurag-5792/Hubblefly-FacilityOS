/** Exact installation contract. Metadata and function bodies are source-pinned;
 * trigger names/counts alone never establish audit or revocation enforcement.
 * Installing or qualifying this contract remains a separate nonproduction step.
 */
import {createHash} from 'node:crypto';
export const ROLE_FENCE_KEYS=[1212568624,77] as const;
export const ROLE_IMMUTABLE_BODY="\nBEGIN RAISE EXCEPTION 'HFT_APP_ROLE_AUDIT_IMMUTABLE'; END ";
export const ROLE_AUDIT_BODY=`
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hft_app_roles.assignment_event e
  WHERE e.legal_entity_id=NEW.legal_entity_id AND e.site_id=NEW.site_id
   AND e.warehouse_id=NEW.warehouse_id AND e.employee_id=NEW.employee_id
   AND e.revision=NEW.revision AND e.event->'after'=NEW.snapshot)
 THEN RAISE EXCEPTION 'HFT_APP_ROLE_SNAPSHOT_AUDIT_MISSING'; END IF;
 RETURN NULL;
END `;
export const ROLE_REVOCATION_BODY=`
BEGIN
 -- Database-local exclusive transaction fence; conflicts with stock operations.
 PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);
 RETURN NULL;
END `;
const common={relation_schema:'hft_app_roles',relation_owner_secure:true,enabled:'A',owner:'hft_r1_roles_owner',owner_login:false,
 owner_super:false,owners_match:true,relation_kind:'r',function_schema:'hft_app_roles',
 language:'plpgsql',security_definer:false,volatility:'v',strict:false,
 parallel:'u',leakproof:false,returns_trigger:true,ordinary_function:true,
 no_arguments:true,config:['search_path=pg_catalog, pg_temp'],
 function_executable:false,no_filter:true,constraint_relation_matches:true};
export const ROLE_EXPECTED_TRIGGERS=[
 {...common,relation:'assignment',trigger:'assignment_requires_audit',
  function_name:'require_assignment_event',body:ROLE_AUDIT_BODY,type:21,
  constraint_type:'t',deferrable:true,deferred:true},
 {...common,relation:'assignment_event',trigger:'immutable_assignment_event',
  function_name:'deny_event_mutation',body:ROLE_IMMUTABLE_BODY,type:27,
  constraint_type:'',deferrable:false,deferred:false},
 ...['assignment','identity_binding','scope_lock'].map(relation=>({...common,
  relation,trigger:'role_revocation_fence',function_name:'fence_role_mutation',
  body:ROLE_REVOCATION_BODY,type:62,constraint_type:'',deferrable:false,deferred:false})),
 ...['employee','legal_entity','site','warehouse'].map(relation=>({...common,
  relation_schema:'hft',relation,trigger:'role_dependency_fence',function_name:'fence_role_mutation',
  body:ROLE_REVOCATION_BODY,type:62,constraint_type:'',deferrable:false,deferred:false}))
] as const;
export const ROLE_ENFORCEMENT_SHA256=createHash('sha256')
 .update(JSON.stringify(ROLE_EXPECTED_TRIGGERS)).digest('hex');
export function assertRoleEnforcement(value:unknown):void{
 if(!Array.isArray(value)||value.length!==ROLE_EXPECTED_TRIGGERS.length)
  throw Error('ROLE_AUDIT_OR_REVOCATION_ENFORCEMENT_NOT_ADMITTED');
 const seen=new Set<string>();
 for(const raw of value){
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))
   throw Error('ROLE_AUDIT_OR_REVOCATION_ENFORCEMENT_NOT_ADMITTED');
  const row=raw as Record<string,unknown>,key=row.relation_schema+':'+row.relation+':'+row.trigger;
  const expected=ROLE_EXPECTED_TRIGGERS.find(x=>x.relation_schema===row.relation_schema&&x.relation===row.relation&&x.trigger===row.trigger);
  if(!expected||seen.has(key)||Object.keys(row).length!==Object.keys(expected).length||
   Object.entries(expected).some(([k,v])=>JSON.stringify(row[k])!==JSON.stringify(v)))
   throw Error('ROLE_AUDIT_OR_REVOCATION_ENFORCEMENT_NOT_ADMITTED');
  seen.add(key);
 }
}
export const ROLE_TRIGGER_CATALOG_SQL=`
SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'relation_schema',n.nspname,'relation',c.relname,'trigger',t.tgname,'enabled',t.tgenabled::text,
 'owner',r.rolname,'owner_login',r.rolcanlogin,'owner_super',r.rolsuper,
 'owners_match',p.proowner=pn.nspowner AND (n.nspname<>'hft_app_roles' OR c.relowner=n.nspowner),
 'relation_owner_secure',NOT ro.rolcanlogin AND NOT ro.rolsuper AND NOT ro.rolbypassrls
  AND NOT pg_catalog.pg_has_role(current_user,ro.oid,'MEMBER'),
 'relation_kind',c.relkind::text,'function_schema',pn.nspname,
 'function_name',p.proname,'body',p.prosrc,'language',l.lanname,
 'security_definer',p.prosecdef,'volatility',p.provolatile::text,
 'strict',p.proisstrict,'parallel',p.proparallel::text,'leakproof',p.proleakproof,
 'returns_trigger',p.prorettype='pg_catalog.trigger'::pg_catalog.regtype,
 'ordinary_function',p.prokind='f','no_arguments',p.pronargs=0,
 'config',p.proconfig,'function_executable',pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE'),
 'type',t.tgtype::integer,'constraint_type',COALESCE(k.contype::text,''),
 'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,
 'constraint_relation_matches',t.tgconstraint=0 OR
  (k.conrelid=t.tgrelid AND k.condeferrable=t.tgdeferrable AND k.condeferred=t.tginitdeferred),
 'no_filter',t.tgqual IS NULL AND t.tgnargs=0 AND t.tgargs=''::bytea
  AND t.tgattr=''::pg_catalog.int2vector AND t.tgoldtable IS NULL
  AND t.tgnewtable IS NULL AND t.tgparentid=0
) ORDER BY c.relname,t.tgname),'[]'::jsonb)
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
JOIN pg_catalog.pg_roles ro ON ro.oid=c.relowner
LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint
WHERE NOT t.tgisinternal AND (n.nspname='hft_app_roles' OR
 (n.nspname='hft' AND c.relname IN('employee','legal_entity','site','warehouse')
  AND t.tgname='role_dependency_fence'))`;
