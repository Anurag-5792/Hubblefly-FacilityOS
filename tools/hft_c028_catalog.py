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
 'default_privileges','database_security','provider_roles','provider_memberships','schema_public_grants',
 'role_census','role_membership_census')
# PostgreSQL 18 predefined privilege-bearing roles; the SQL census below is
# intentionally NOT limited to this set. The required set catches incompatible
# server versions, while independently qualified references govern all grants.
PG18_PREDEFINED_ROLES=frozenset((
 'pg_checkpoint','pg_create_subscription','pg_database_owner','pg_maintain',
 'pg_monitor','pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables',
 'pg_read_all_data','pg_write_all_data','pg_read_server_files',
 'pg_write_server_files','pg_execute_server_program',
 'pg_signal_autovacuum_worker','pg_signal_backend','pg_use_reserved_connections'
))
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
# Provider-wide security evidence is collected even before any hft_* role exists.
# The exact approved reference pins the independently qualified provider baseline.
SQL.update({
 'database_security':"""SELECT d.datname AS id,pg_get_userbyid(d.datdba) AS owner,
 d.datacl::text AS acl,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
   WHERE a.grantee=0 AND a.privilege_type='CONNECT') AS public_connect,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
   WHERE a.grantee=0 AND a.privilege_type='CREATE') AS public_create,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
   WHERE a.grantee=0 AND a.privilege_type='TEMPORARY') AS public_temporary
 FROM pg_database d WHERE d.datname=current_database()""",
 'provider_roles':"""SELECT r.rolname AS id,r.rolcanlogin,r.rolsuper,r.rolcreatedb,
 r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolinherit,
 r.rolvaliduntil::text AS expires
 FROM pg_roles r WHERE r.rolname='neondb_owner' OR r.rolname LIKE 'neon_%' OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls""",
 'provider_memberships':"""SELECT member.rolname||'->'||role.rolname AS id,
 am.admin_option,am.inherit_option,am.set_option
 FROM pg_auth_members am JOIN pg_roles member ON member.oid=am.member
 JOIN pg_roles role ON role.oid=am.roleid
 WHERE member.rolname='neondb_owner' OR role.rolname='neondb_owner'
 OR member.rolname LIKE 'neon_%' OR role.rolname LIKE 'neon_%'
 OR member.rolname LIKE 'hft_%' OR role.rolname LIKE 'hft_%'
 OR role.rolsuper OR role.rolcreatedb OR role.rolcreaterole
 OR role.rolreplication OR role.rolbypassrls""",
 'schema_public_grants':"""SELECT n.nspname AS id,n.nspacl::text AS acl,
 pg_get_userbyid(n.nspowner) AS owner,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE a.grantee=0 AND a.privilege_type='CREATE') AS public_create,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE a.grantee=0 AND a.privilege_type='USAGE') AS public_usage
 FROM pg_namespace n WHERE """+BASIC
})
# C035: database-wide role and grant graph. No role-prefix, privilege-flag,
# LOGIN or graph-depth filter. pg_database_owner's owner-based implicit
# membership is not a row in pg_auth_members; database_security captures its
# current database owner separately. Capture actual grants only.
SQL.update({
 'role_census':"""SELECT r.rolname AS id,r.oid::text AS role_oid,
 r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolcreatedb,r.rolcreaterole,
 r.rolreplication,r.rolbypassrls,r.rolconnlimit,
 r.rolvaliduntil::text AS expires,r.rolconfig::text AS settings
 FROM pg_catalog.pg_roles r""",
 'role_membership_census':"""SELECT
 'member='||am.member::text||';role='||am.roleid::text||
 ';grantor='||am.grantor::text AS id,
 member.rolname AS member,granted.rolname AS granted_role,
 grantor.rolname AS grantor,
 am.member::text AS member_oid,am.roleid::text AS granted_role_oid,
 am.grantor::text AS grantor_oid,
 am.admin_option,am.inherit_option,am.set_option,
 member.rolcanlogin AS member_can_login,
 member.rolinherit AS member_inherits,
 member.rolsuper AS member_superuser,
 member.rolcreatedb AS member_createdb,
 member.rolcreaterole AS member_createrole,
 member.rolreplication AS member_replication,
 member.rolbypassrls AS member_bypassrls,
 granted.rolcanlogin AS granted_can_login,
 granted.rolinherit AS granted_inherits,
 granted.rolsuper AS granted_superuser,
 granted.rolcreatedb AS granted_createdb,
 granted.rolcreaterole AS granted_createrole,
 granted.rolreplication AS granted_replication,
 granted.rolbypassrls AS granted_bypassrls
 FROM pg_catalog.pg_auth_members am
 LEFT JOIN pg_catalog.pg_roles member ON member.oid=am.member
 LEFT JOIN pg_catalog.pg_roles granted ON granted.oid=am.roleid
 LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid=am.grantor"""
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
# One psql process, one backend, one REPEATABLE READ READ ONLY snapshot.
# Each record carries backend and snapshot identity; a missing/duplicate record
# or a changed identity aborts before any phase can authorize mutation.
PHASE_SQL="""SELECT json_build_object(
 'schema_exists',to_regnamespace('hft') IS NOT NULL,
 'ledger_exists',to_regclass('hft.schema_revision') IS NOT NULL,
 'non_system_user_objects',(SELECT count(*) FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema')
 AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
 AND c.relkind IN ('r','p','v','m','f','S')),
 'migration_role_exists',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_staging_migration_owner'),
 'creator_default_restricted',EXISTS(SELECT 1 FROM pg_default_acl d
 WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='hft_staging_migration_owner')
 AND d.defaclnamespace=0 AND d.defaclobjtype='f'
 AND NOT EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) x
 WHERE x.grantee=0 AND x.privilege_type='EXECUTE')),
 'schema_owner',(SELECT pg_get_userbyid(n.nspowner) FROM pg_namespace n WHERE n.nspname='hft'),
 'required_catalog_present',(to_regclass('hft.schema_revision') IS NOT NULL
 AND to_regclass('hft.stock_account') IS NOT NULL
 AND to_regclass('hft.stock_entry') IS NOT NULL
 AND to_regclass('hft.stock_command') IS NOT NULL
 AND to_regclass('hft.stock_command_seal') IS NOT NULL))"""
REVISION_SQL="""SELECT COALESCE(json_agg(json_build_object(
 'version',version,'sha256',sha256) ORDER BY version),'[]'::json)
 FROM hft.schema_revision"""
def snapshot_statement(include_phase=False):
 def record(kind,body):
  return ("SELECT json_build_object('kind','"+kind+"','pid',pg_backend_pid(),"
   "'snapshot',pg_current_snapshot()::text,'database',current_database(),"
   "'db_user',current_user,'session_user',session_user,"
   "'version',current_setting('server_version_num'),"
   "'isolation',current_setting('transaction_isolation'),"
   "'read_only',current_setting('transaction_read_only'),"
   "'data',("+body+"))::text;\n")
 out="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
 if include_phase:
  out+="SELECT (to_regclass('hft.schema_revision') IS NOT NULL)::int AS hft_has_revision \\gset\n"
  out+=record('phase',PHASE_SQL)
  out+="\\if :hft_has_revision\n"+record('revision',REVISION_SQL)+"\\endif\n"
 for kind in CATEGORIES:
  out+=record(kind,"SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.id),'[]'::json) FROM ("+SQL[kind]+") x")
 return out+"ROLLBACK;\n"
def collect(query,include_phase=False,expected_identity=None):
 check_manifest()
 try:
  raw=query(snapshot_statement(include_phase))
  packets=[json.loads(line) for line in raw.splitlines()]
 except (ValueError,TypeError,KeyError,AttributeError):
  fail('SNAPSHOT_RESPONSE_INVALID')
 expected=set(CATEGORIES)|({'phase'} if include_phase else set())
 if include_phase:
  # Revision is present only in stages where the ledger exists.
  expected.add('revision')
 if not packets or not all(isinstance(x,dict) for x in packets):
  fail('SNAPSHOT_RESPONSE_INVALID')
 kinds=[x.get('kind') for x in packets]
 if len(kinds)!=len(set(kinds)) or set(kinds) not in (
   [set(CATEGORIES)] if not include_phase else
   [expected,expected-{'revision'}]):
  fail('SNAPSHOT_RESULT_COUNT')
 identity=None
 data={}
 for packet in packets:
  if set(packet)!={'kind','pid','snapshot','database','db_user','session_user',
    'version','isolation','read_only','data'}:
   fail('SNAPSHOT_PACKET_SHAPE')
  signature=tuple(packet[k] for k in ('pid','snapshot','database','db_user',
    'session_user','version','isolation','read_only'))
  if (not isinstance(packet['pid'],int) or packet['pid']<=0 or
      not isinstance(packet['snapshot'],str) or not packet['snapshot'] or
      packet['isolation']!='repeatable read' or packet['read_only']!='on' or
      packet['db_user']!=packet['session_user']):
   fail('SNAPSHOT_IDENTITY_INVALID')
  if identity is None:identity=signature
  elif signature!=identity:fail('SNAPSHOT_MIXED_SESSION_OR_STATE')
  if expected_identity is not None and (packet['database'],
       packet['db_user'],packet['version'])!=tuple(expected_identity):
   fail('SNAPSHOT_DATABASE_IDENTITY')
  data[packet['kind']]=packet['data']
 output={}
 for category in CATEGORIES:
  rows=data[category]
  if not isinstance(rows,list) or not all(isinstance(x,dict) and
       isinstance(x.get('id'),str) for x in rows):
   fail('ROWSET_INVALID')
  ids=[x['id'] for x in rows]
  if ids!=sorted(set(ids)):fail('ROWSET_NONCANONICAL_OR_DUPLICATE')
  output[category]=rows
 if include_phase:
  info=data['phase']
  if not isinstance(info,dict) or set(info)!={
    'schema_exists','ledger_exists','non_system_user_objects',
    'migration_role_exists','creator_default_restricted','schema_owner',
    'required_catalog_present'}:
   fail('PHASE_SNAPSHOT_SHAPE')
  if info['ledger_exists'] is not ('revision' in data):
   fail('SNAPSHOT_REVISION_PRESENCE')
  revisions=data.get('revision')
  if revisions is not None and (not isinstance(revisions,list) or
      not all(isinstance(x,dict) and set(x)=={'version','sha256'}
              for x in revisions)):
   fail('SNAPSHOT_REVISION_INVALID')
  return output,info,revisions
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

def verify_role_membership_census(observed):
 """Check graph identity; exact approved fingerprints authorize provider paths.

 A complete pg_auth_members scan captures every explicit direct grant. Every
 transitive path necessarily consists of those captured edges. Never create a
 synthetic pg_database_owner edge: its sole membership is database-specific
 and implicit, already bound to the database owner in database_security.
 """
 roles={row['id']:row for row in observed['role_census']}
 if not PG18_PREDEFINED_ROLES.issubset(roles):
  fail('PG18_PREDEFINED_ROLE_MISSING')
 if not {'neondb_owner','neon_superuser'}.issubset(roles):
  fail('PROVIDER_ROLE_CENSUS_MISSING')
 if not {row['id'] for row in observed['provider_roles']}.issubset(roles):
  fail('PROVIDER_ROLE_CENSUS_INCOMPLETE')
 if not {row['id'] for row in observed['roles']}.issubset(roles):
  fail('HFT_ROLE_CENSUS_INCOMPLETE')
 # Every membership has a named endpoint and real grantor in the same
 # transaction's unfiltered pg_roles view. No blanket deny of Neon grants.
 edges=set()
 for grant in observed['role_membership_census']:
  if (not all(isinstance(grant.get(k),str) and grant[k] for k in
      ('member','granted_role','grantor','member_oid',
       'granted_role_oid','grantor_oid')) or
      any(type(grant.get(k)) is not bool for k in
       ('admin_option','inherit_option','set_option'))):
   fail('ROLE_MEMBERSHIP_CENSUS_INCOMPLETE')
  if any(grant[k] not in roles for k in ('member','granted_role','grantor')):
   fail('ROLE_MEMBERSHIP_IDENTITY_MISSING')
  if 'pg_database_owner' in (grant['member'],grant['granted_role']):
   fail('DATABASE_OWNER_IMPLICIT_MEMBERSHIP')
  edges.add((grant['member'],grant['granted_role']))
 # The older scoped grant categories must be subsets of the complete graph.
 for row in observed['memberships']+observed['provider_memberships']:
  pair=row['id'].split('->',1)
  if len(pair)!=2 or tuple(pair) not in edges:
   fail('ROLE_MEMBERSHIP_CENSUS_MISSING_SCOPED_GRANT')

def structural_stage_checks(observed,stage):
 verify_role_membership_census(observed)
 security=observed['database_security']
 if len(security)!=1 or security[0]['id']!='neondb' or security[0].get('owner')!='neondb_owner':
  fail('DATABASE_OWNER_OR_IDENTITY')
 if not {'neondb_owner','neon_superuser'}.issubset({r['id'] for r in observed['provider_roles']}):
  fail('PROVIDER_SECURITY_IDENTITY_MISSING')
 if stage!='S0' and any(security[0].get(p) is not False for p in ('public_connect','public_create','public_temporary')):
  fail('PUBLIC_DATABASE_PRIVILEGE')
 if stage!='S0' and any(row.get('public_create') is not False for row in observed['schema_public_grants']):
  fail('PUBLIC_SCHEMA_CREATE')
 if stage!='S0' and any(row['id'].startswith('hft_') and not (row['id'] in source_role_contract()[1]) for row in observed['provider_memberships'] if '->' in row['id'] and row['id'].split('->')[0].startswith('hft_')):
  fail('UNAPPROVED_PROVIDER_MEMBERSHIP')
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

def verify_stage(query,stage,reference_paths=None,observed=None):
 if stage not in STAGES:fail('STAGE_NOT_DECLARED')
 refs=approved_stage_references(reference_paths)
 observed=collect(query) if observed is None else observed  # complete immutable snapshot
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
