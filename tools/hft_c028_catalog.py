"""C028-01 exact PostgreSQL 18 canonical catalog evidence. READ ONLY.

A reviewed independent PG18 reference fingerprint is required for post-v6.
Until pinned, postmigration finalize ALWAYS fails closed. The fingerprint
covers FULL captured contents (not expected object counts or a partial list).
"""
from __future__ import annotations
import hashlib,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'db/migrations/manifest.v1.json'
PIN=ROOT/'config/hft-bootstrap019-canonical-catalog.sha256'
MANIFEST_SHA='ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355'
CANONICAL_SHA=(
 '8e7253652591c5ce7ef3935d0dc8893e4f503479fa59e7748583ec9ec2215723',
 '6e1981c6314b604f470c4a5d9e7c255891fc7e3f693e5cde7780ea77ff12da36',
 'bf8a4987d1f3c82f3016a1d340edb79a6d238229e23f28dbc65cc75c0a181cf8',
 '27375f432d476e8e88f8402af1970422d62de898a1fbcc91a9ec30efce79d7e2',
 '01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf',
 '664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044'
)
HEX=re.compile(r'^[a-f0-9]{64}$')
CATEGORIES=('schemas','relations','columns','sequence_settings','functions','triggers','constraints',
 'indexes','policies','extensions','roles','memberships','effective_grants',
 'function_grants','sequence_grants','schema_grants','database_grants',
 'types','rules','event_triggers','publications','operators','collations',
 'default_privileges')
BASIC="n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'"
SQL={
 'schemas':"""SELECT n.nspname AS id,pg_get_userbyid(n.nspowner) AS owner,n.nspacl::text AS acl
 FROM pg_namespace n WHERE """+BASIC,
 'relations':"""SELECT n.nspname||'.'||c.relname AS id,c.relkind::text AS kind,
 pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,c.relpersistence::text AS persistence,
 c.relrowsecurity,c.relforcerowsecurity,c.reloptions::text AS options,
 pg_get_expr(c.relpartbound,c.oid,true) AS partition_bound
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE """+BASIC,
 'columns':"""SELECT n.nspname||'.'||c.relname||'.'||a.attname AS id,
 a.attnum AS ordinal,pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
 a.attnotnull AS not_null,a.attidentity::text AS identity_mode,
 a.attgenerated::text AS generated_mode,
 a.attstorage::text AS storage_mode,a.attcompression::text AS compression,
 a.attislocal AS local_column,a.attinhcount AS inherited_count,
 a.attcollation::pg_catalog.regcollation::text AS collation,
 pg_catalog.pg_get_expr(ad.adbin,ad.adrelid,true) AS default_expression,
 a.attstattarget AS statistics_target
 FROM pg_catalog.pg_attribute a
 JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
 WHERE """+BASIC+""" AND c.relkind IN ('r','p','v','m','f')
 AND a.attnum>0 AND NOT a.attisdropped""",
 'sequence_settings':"""SELECT n.nspname||'.'||c.relname AS id,
 pg_catalog.format_type(s.seqtypid,-1) AS data_type,
 s.seqstart AS start_value,s.seqincrement AS increment_by,
 s.seqmin AS minimum_value,s.seqmax AS maximum_value,
 s.seqcache AS cache_size,s.seqcycle AS cycles
 FROM pg_catalog.pg_sequence s JOIN pg_catalog.pg_class c ON c.oid=s.seqrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE """+BASIC,
 'functions':"""SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS id,
 pg_get_userbyid(p.proowner) AS owner,p.prokind::text AS kind,
 p.prosecdef,p.provolatile::text AS volatility,p.proleakproof,p.proparallel::text AS parallel,
 p.proconfig::text AS settings,p.proacl::text AS acl,
 pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE """+BASIC,
 'triggers':"""SELECT n.nspname||'.'||c.relname||'.'||t.tgname AS id,
 t.tgtype,t.tgenabled::text AS enabled,t.tgisinternal,
 pg_get_triggerdef(t.oid,true) AS definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE """+BASIC,
 'constraints':"""SELECT n.nspname||'.'||co.conname||'@'||COALESCE(c.relname,'') AS id,
 co.contype::text AS kind,co.convalidated,co.condeferrable,co.condeferred,
 co.conislocal,pg_get_constraintdef(co.oid,true) AS definition,
 n.nspname||'.'||COALESCE(c.relname,'') AS relation
 FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace
 LEFT JOIN pg_class c ON c.oid=co.conrelid WHERE """+BASIC,
 'indexes':"""SELECT n.nspname||'.'||idx.relname AS id,
 pg_get_indexdef(i.indexrelid) AS definition,
 i.indisunique,i.indisprimary,i.indisexclusion,i.indisvalid,i.indisready,
 tn.nspname||'.'||tbl.relname AS relation
 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
 JOIN pg_namespace n ON n.oid=idx.relnamespace
 JOIN pg_class tbl ON tbl.oid=i.indrelid JOIN pg_namespace tn ON tn.oid=tbl.relnamespace
 WHERE """+BASIC,
 'policies':"""SELECT n.nspname||'.'||c.relname||'.'||pol.polname AS id,
 pol.polcmd::text AS command,pol.polpermissive,
 pg_get_expr(pol.polqual,pol.polrelid) AS using_expression,
 pg_get_expr(pol.polwithcheck,pol.polrelid) AS check_expression,
 (SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r
  WHERE r.oid=ANY(pol.polroles)) AS roles
 FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE """+BASIC,
 'extensions':"""SELECT ext.extname AS id,ext.extversion,
 n.nspname AS schema,pg_get_userbyid(ext.extowner) AS owner
 FROM pg_extension ext JOIN pg_namespace n ON n.oid=ext.extnamespace
 WHERE ext.extname <> 'plpgsql'""",
 'roles':"""SELECT r.rolname AS id,r.rolcanlogin,r.rolsuper,r.rolcreatedb,
 r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolinherit,r.rolvaliduntil::text AS expires
 FROM pg_roles r WHERE r.rolname LIKE 'hft_%'""",
 'memberships':"""SELECT member.rolname||'->'||role.rolname AS id,
 am.admin_option,am.inherit_option,am.set_option
 FROM pg_auth_members am JOIN pg_roles member ON member.oid=am.member
 JOIN pg_roles role ON role.oid=am.roleid
 WHERE member.rolname LIKE 'hft_%' OR role.rolname LIKE 'hft_%'""",
 'effective_grants':"""SELECT r.rolname||':'||n.nspname||'.'||c.relname AS id,
 has_table_privilege(r.rolname,c.oid,'SELECT') AS can_select,
 has_table_privilege(r.rolname,c.oid,'INSERT') AS can_insert,
 has_table_privilege(r.rolname,c.oid,'UPDATE') AS can_update,
 has_table_privilege(r.rolname,c.oid,'DELETE') AS can_delete,
 has_table_privilege(r.rolname,c.oid,'TRUNCATE') AS can_truncate,
 has_table_privilege(r.rolname,c.oid,'REFERENCES') AS can_reference,
 has_table_privilege(r.rolname,c.oid,'TRIGGER') AS can_trigger
 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname LIKE 'hft_%' AND """+BASIC+
 """ AND c.relkind IN ('r','p','v','m','f')"""
}
SQL.update({
 'function_grants':"""SELECT r.rolname||':'||n.nspname||'.'||p.proname||
 '('||pg_get_function_identity_arguments(p.oid)||')' AS id,
 has_function_privilege(r.rolname,p.oid,'EXECUTE') AS can_execute
 FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE r.rolname LIKE 'hft_%' AND """+BASIC,
 'sequence_grants':"""SELECT r.rolname||':'||n.nspname||'.'||c.relname AS id,
 has_sequence_privilege(r.rolname,c.oid,'USAGE') AS can_usage,
 has_sequence_privilege(r.rolname,c.oid,'SELECT') AS can_select,
 has_sequence_privilege(r.rolname,c.oid,'UPDATE') AS can_update
 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname LIKE 'hft_%' AND c.relkind='S' AND """+BASIC,
 'schema_grants':"""SELECT r.rolname||':'||n.nspname AS id,
 has_schema_privilege(r.rolname,n.oid,'USAGE') AS can_usage,
 has_schema_privilege(r.rolname,n.oid,'CREATE') AS can_create
 FROM pg_roles r CROSS JOIN pg_namespace n
 WHERE r.rolname LIKE 'hft_%' AND """+BASIC
})
SQL.update({
 'database_grants':"""SELECT r.rolname||':'||d.datname AS id,
 has_database_privilege(r.rolname,d.oid,'CONNECT') AS can_connect,
 has_database_privilege(r.rolname,d.oid,'CREATE') AS can_create,
 has_database_privilege(r.rolname,d.oid,'TEMPORARY') AS can_temp,
 d.datacl::text AS acl,pg_get_userbyid(d.datdba) AS owner
 FROM pg_roles r CROSS JOIN pg_database d
 WHERE r.rolname LIKE 'hft_%' AND d.datname=current_database()""",
 'types':"""SELECT n.nspname||'.'||t.typname AS id,
 t.typtype::text AS kind,t.typcategory::text AS category,
 pg_get_userbyid(t.typowner) AS owner,t.typacl::text AS acl,
 t.typbasetype::regtype::text AS base_type
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE """+BASIC,
 'rules':"""SELECT n.nspname||'.'||c.relname||'.'||r.rulename AS id,
 pg_get_ruledef(r.oid,true) AS definition,r.ev_enabled::text AS enabled
 FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE """+BASIC,
 'event_triggers':"""SELECT e.evtname AS id,e.evtevent,e.evtenabled::text AS enabled,
 pg_get_userbyid(e.evtowner) AS owner,
 e.evtfoid::regprocedure::text AS function
 FROM pg_event_trigger e""",
 'publications':"""SELECT p.pubname AS id,pg_get_userbyid(p.pubowner) AS owner,
 p.puballtables,p.pubinsert,p.pubupdate,p.pubdelete,p.pubtruncate
 FROM pg_publication p""",
 'operators':"""SELECT n.nspname||'.'||o.oprname||'('||
 o.oprleft::regtype::text||','||o.oprright::regtype::text||')' AS id,
 pg_get_userbyid(o.oprowner) AS owner,o.oprcode::regprocedure::text AS implementation
 FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace WHERE """+BASIC,
 'collations':"""SELECT n.nspname||'.'||c.collname AS id,
 pg_get_userbyid(c.collowner) AS owner,c.collprovider::text AS provider,
 c.collcollate,c.collctype,c.collversion AS version
 FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE """+BASIC
})
SQL.update({
 'default_privileges':"""SELECT r.rolname||':'||d.defaclobjtype::text||':'||
 COALESCE(n.nspname,'GLOBAL') AS id,d.defaclacl::text AS acl,
 d.defaclobjtype::text AS kind
 FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole
 LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE r.rolname LIKE 'hft_%'"""
})
def fail(code): raise ValueError('C028_CATALOG_'+code)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(obj):return (json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
def check_manifest():
 if sha(MANIFEST.read_bytes())!=MANIFEST_SHA:fail('MANIFEST_CHANGED')
 obj=json.loads(MANIFEST.read_bytes())
 for item,expected in zip(obj['migrations'],CANONICAL_SHA):
  if item['sha256']!=expected:fail('MIGRATION_MANIFEST_CHANGED')
  p=ROOT/'db/migrations'/item['file']
  if p.is_symlink() or sha(p.read_bytes())!=expected:fail('MIGRATION_SOURCE_CHANGED')
 if len(obj['migrations'])!=6:fail('MIGRATION_COUNT_CHANGED')
def collect(query):
 """The caller must execute SELECT in an independently verified READ ONLY session."""
 check_manifest()
 output={}
 for category in CATEGORIES:
  sql="BEGIN READ ONLY;\nSELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.id),'[]'::json)::text FROM ("+SQL[category]+") x;\nROLLBACK;"
  try:
   rows=json.loads(query(sql))
  except (ValueError,TypeError,KeyError):fail('QUERY_RESPONSE_INVALID')
  if not isinstance(rows,list) or not all(isinstance(x,dict) and isinstance(x.get('id'),str) for x in rows):
   fail('ROWSET_INVALID')
  ids=[x['id'] for x in rows]
  if ids!=sorted(set(ids)):fail('ROWSET_NONCANONICAL_OR_DUPLICATE')
  output[category]=rows
 return output
# C030 phase references: each comes from independently witnessed PG18.6
# application of the EXACT protected SQL transitions. No inferred hash is GO.
STAGES=tuple('S'+str(i) for i in range(6))
STAGE_PATHS={k:ROOT/'config'/('hft-bootstrap019-stage-'+k.lower()+'.sha256')
             for k in STAGES}
SECURITY_SQL=ROOT/'db/security/HFT-R1-BOOTSTRAP-019-DBA-ROLE-NONEXECUTABLE.sql'
CREATOR_SQL=ROOT/'db/security/HFT-R1-BOOTSTRAP-019-CREATOR-ACL-NONEXECUTABLE.sql'
OWNER_SQL=ROOT/'db/security/HFT-R1-BOOTSTRAP-019-OWNER-CLOSE-NONEXECUTABLE.sql'
DBA_SQL=ROOT/'db/security/HFT-R1-BOOTSTRAP-019-DBA-CLOSE-NONEXECUTABLE.sql'
TRANSITION_SOURCES=(SECURITY_SQL,CREATOR_SQL,OWNER_SQL,DBA_SQL)
# The existing runner has independent SHA-pins for each protected SQL source.
# Derive permitted roles and direct memberships *from* the existing DBA
# bootstrap statement, rather than assuming a broad hft_* allowlist.
def source_role_contract():
 text=SECURITY_SQL.read_text()
 expected_roles=set(re.findall(r'(?m)^CREATE ROLE (hft_[a-z0-9_]+)\b',text))
 expected_memberships=set(
  '%s->%s'%(member,parent)
  for parent,member in re.findall(
   r'(?m)^GRANT (hft_[a-z0-9_]+) TO (hft_[a-z0-9_]+) WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;',
   text))
 if expected_roles!={'hft_staging_migration_owner','hft_r1_app_runtime',
   'hft_staging_app_runtime','hft_r1_audit_verify',
   'hft_staging_audit_verify'} or len(expected_memberships)!=2:
  fail('PROTECTED_BOOTSTRAP_SQL_CONTRACT_CHANGED')
 creator=CREATOR_SQL.read_text()
 if (creator.count('ALTER DEFAULT PRIVILEGES FOR ROLE hft_staging_migration_owner')!=1 or
     'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC' not in creator):
  fail('CREATOR_DEFAULT_SOURCE_CHANGED')
 for sql in TRANSITION_SOURCES:
  if sql.is_symlink() or not sql.is_file():fail('TRANSITION_SQL_MISSING')
 return expected_roles,expected_memberships

def approved_stage_references(paths=None):
 """All six independent reference SHA-256s must be explicitly pinned.
 HOLD or missing file forbids transition, including final read-only GO.
 """
 paths=STAGE_PATHS if paths is None else paths
 if set(paths)!=set(STAGES):fail('STAGE_REFERENCE_SET_CHANGED')
 refs={}
 for stage in STAGES:
  path=Path(paths[stage])
  if path.is_symlink() or not path.is_file():fail('STAGE_REFERENCE_UNAVAILABLE')
  value=path.read_text().strip()
  if not HEX.fullmatch(value):fail('STAGE_REFERENCE_NOT_APPROVED')
  refs[stage]=value
 if len(set(refs.values()))!=len(STAGES):fail('STAGE_REFERENCE_REUSED')
 return refs

def stage_reference_bundle(paths=None):
 refs=approved_stage_references(paths)
 source_role_contract()
 return sha(canonical({'schema':'HFT_R1_BOOTSTRAP019_PHASE_REFERENCE_V1',
  'manifest_sha256':MANIFEST_SHA,
  'stage_hashes':refs,
  'transition_sql_sha256':{p.name:sha(p.read_bytes())
                           for p in TRANSITION_SOURCES}}))

def structural_stage_checks(observed,stage):
 if [x['id'] for x in observed['schemas']] not in (['public'],['hft','public']):
  fail('STAGE_UNAPPROVED_SCHEMAS')
 roles,members=source_role_contract()
 role_ids={x['id'] for x in observed['roles']}
 member_ids={x['id'] for x in observed['memberships']}
 if stage=='S0':
  if role_ids or member_ids:fail('S0_BOOTSTRAP_ROLE_PREEXISTS')
 else:
  if role_ids!=roles or member_ids!=members:
   fail('STAGE_APPROVED_ROLE_OR_MEMBERSHIP_MISMATCH')
  for row in observed['roles']:
   if any(row.get(k) is True for k in (
       'rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls')):
    fail('STAGE_ELEVATED_ROLE')
  for row in observed['memberships']:
   if (row.get('admin_option') is not False or
       row.get('inherit_option') is not True or
       row.get('set_option') is not False):
    fail('STAGE_MEMBERSHIP_FLAGS')
 if stage in ('S0','S1','S2'):
  if [x['id'] for x in observed['schemas']]!=['public']:
   fail('PRE_UNAPPROVED_SCHEMA')
  for category in ('relations','columns','sequence_settings','functions',
   'triggers','constraints','indexes','policies','extensions','types',
   'rules','event_triggers','publications','operators','collations'):
   if observed[category]:fail('PRE_UNAPPROVED_'+category.upper())
 if stage=='S0':
  for category in ('effective_grants','function_grants','sequence_grants',
   'schema_grants','database_grants','default_privileges'):
   if observed[category]:fail('S0_PREEXISTING_'+category.upper())
 if stage=='S1' and observed['default_privileges']:
  fail('S1_CREATOR_DEFAULTS_PREMATURE')
 if stage=='S2':
  defaults=observed['default_privileges']
  if not any(x.get('id')=='hft_staging_migration_owner:f:GLOBAL'
             for x in defaults):
   fail('S2_CREATOR_DEFAULTS_MISSING')
 if stage in ('S3','S4','S5'):
  if [x['id'] for x in observed['schemas']]!=['hft','public']:
   fail('POST_CANONICAL_SCHEMA')
  if not any(x['id']=='hft.schema_revision' for x in observed['relations']):
   fail('REVISION_TABLE_MISSING')
  for category in ('relations','columns','functions','triggers',
   'constraints','indexes'):
   if not observed[category]:fail('REQUIRED_'+category.upper()+'_MISSING')

def verify_stage(query,stage,reference_paths=None):
 if stage not in STAGES:fail('STAGE_NOT_DECLARED')
 refs=approved_stage_references(reference_paths)
 observed=collect(query)  # real, unmocked 24-category reader
 structural_stage_checks(observed,stage)
 actual=sha(canonical(observed))
 if actual!=refs[stage]:fail('STAGE_'+stage+'_EXTRA_MISSING_OR_ALTERED_CATALOG')
 return actual

def verify_prebootstrap(query):
 """Legacy S0 only; NOT valid for post-security S1 or post-creator S2."""
 observed=collect(query)
 structural_stage_checks(observed,'S0')
 return sha(canonical(observed))

def verify_postcanonical(query,approved_pin=PIN):
 """Historical C028 strict full-catalog reference; S3/S4/S5 must use verify_stage."""
 observed=collect(query)
 # Historical C028 contract: source hashing only. C030 phase guards use the
 # stricter verify_stage() with complete per-state role, ACL and source checks.
 if not any(x['id']=='hft.schema_revision' for x in observed['relations']):
  fail('REVISION_TABLE_MISSING')
 for category in ('schemas','relations','columns','functions','triggers',
  'constraints','indexes'):
  if not observed[category]:fail('REQUIRED_'+category.upper()+'_MISSING')
 pin=Path(approved_pin)
 if pin.is_symlink() or not pin.is_file():fail('EXPECTED_FINGERPRINT_UNAVAILABLE')
 expected=pin.read_text().strip()
 if not HEX.fullmatch(expected):fail('EXPECTED_FINGERPRINT_NOT_APPROVED')
 actual=sha(canonical(observed))
 if actual!=expected:fail('EXTRA_MISSING_OR_ALTERED_CATALOG')
 return actual
