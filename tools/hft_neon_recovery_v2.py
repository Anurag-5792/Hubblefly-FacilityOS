"""HFT_R1_NEON_PRECHANGE_RECOVERY_V2: immutable, source-only validation.
No snapshot API, pg_dump, pg_restore, role or database mutation is performed.
"""
import datetime as dt, hashlib, json, re
from pathlib import Path
PROJECT='red-silence-36758131'; STAGING='br-dawn-moon-azd9xzrp'
DB='neondb'; PRODUCTION='production'
HEX=re.compile(r'^[0-9a-f]{64}$')
def stop(reason): raise ValueError('RECOVERY_V2_'+reason)
def sha(data): return hashlib.sha256(data).hexdigest()
def instant(x):
 try:
  t=dt.datetime.fromisoformat(x.replace('Z','+00:00'))
  if t.tzinfo is None: stop('UTC_REQUIRED')
  return t.astimezone(dt.timezone.utc)
 except (AttributeError,TypeError,ValueError): stop('TIMESTAMP_INVALID')
def obj(x,required):
 if not isinstance(x,dict) or set(x)!=set(required): stop('SCHEMA_KEYS')
 return x
def digest(x):
 if not isinstance(x,str) or not HEX.fullmatch(x): stop('HASH_FORMAT')
 return x
def evidence_file(path,expected):
 digest(expected)
 p=Path(path)
 if not p.is_file() or p.is_symlink(): stop('EVIDENCE_FILE_MISSING')
 if sha(p.read_bytes())!=expected: stop('EVIDENCE_TAMPERED')
 return p.read_bytes()
def validate_v2(e,provider,preserved_files,now=None):
 now=now or dt.datetime.now(dt.timezone.utc)
 required=('schema','project_id','source_branch_id','database','source_state_sha256',
 'preservation','dump','inventory','restore_a','restore_b','independent_witness',
 'evidence_created_at','evidence_expires_at')
 obj(e,required)
 if e['schema']!='HFT_R1_NEON_PRECHANGE_RECOVERY_V2' or e['project_id']!=PROJECT or e['source_branch_id']!=STAGING or e['database']!=DB:stop('SCOPE')
 if instant(e['evidence_created_at'])>now or instant(e['evidence_expires_at'])<=now:stop('EVIDENCE_EXPIRED')
 p=obj(e['preservation'],('branch_id','name','parent_id','parent_lsn','parent_timestamp','created_at','is_default','is_primary','endpoint_count','retention','provider_record_sha256'))
 if p['parent_id']!=STAGING or p['branch_id'] in (STAGING,PRODUCTION) or p['name'] in ('vercel-dev',PRODUCTION) or not re.fullmatch(r'br-[a-z0-9-]{8,80}',p['branch_id']) or not p['name']:stop('PRESERVATION_PARENT')
 if not isinstance(p['parent_lsn'],str) or not re.fullmatch(r'[0-9A-F]+/[0-9A-F]+',p['parent_lsn']):stop('PARENT_LSN')
 if p['parent_timestamp'] is not None: instant(p['parent_timestamp'])
 instant(p['created_at'])
 if p['is_default'] is not False or p['is_primary'] is not False or p['endpoint_count']!=0:stop('PRESERVATION_STATUS')
 retention=obj(p['retention'],('mode','expires_at','provider_verified_at'))
 instant(retention['provider_verified_at'])
 if retention['mode']=='INDEFINITE':
  if retention['expires_at'] is not None:stop('RETENTION_CONTRADICTION')
 elif retention['mode']=='FINITE':
  if retention['expires_at'] is None or instant(retention['expires_at'])<=now:stop('RETENTION_EXPIRED')
 else:stop('RETENTION_UNVERIFIED')
 obj(provider,('id','name','parent_id','parent_lsn','parent_timestamp','created_at','is_default','is_primary','endpoints','retention'))
 for k in ('id','name','parent_id','parent_lsn','parent_timestamp','created_at','is_default','is_primary'):
  key={'id':'branch_id','name':'name'}.get(k,k)
  if provider[k]!=p[key]:stop('PROVIDER_BRANCH_MISMATCH')
 if not isinstance(provider['endpoints'],list) or provider['endpoints']:stop('PROVIDER_UNEXPECTED_ENDPOINT')
 if provider['retention']!=retention:stop('PROVIDER_RETENTION_MISMATCH')
 if sha(json.dumps(provider,sort_keys=True,separators=(',',':')).encode())!=p['provider_record_sha256']:stop('PROVIDER_HASH')
 dump=obj(e['dump'],('sha256','size_bytes','format','postgres_major','pg_dump_version','pg_restore_version','created_at','direct_tls_verified','endpoint_id','dump_list_sha256','file_ref'))
 if dump['format']!='custom' or dump['postgres_major']!=18 or dump['direct_tls_verified'] is not True or not dump['pg_dump_version'].startswith('18.') or not dump['pg_restore_version'].startswith('18.') or dump['size_bytes']<=0:stop('DUMP_FORMAT')
 instant(dump['created_at'])
 dump_bytes=evidence_file(preserved_files['dump'],dump['sha256'])
 if len(dump_bytes)!=dump['size_bytes'] or not dump_bytes.startswith(b'PGDMP'):stop('DUMP_BYTES')
 evidence_file(preserved_files['dump_list'],dump['dump_list_sha256'])
 inv=obj(e['inventory'],('sha256','file_ref','source_state_sha256','captured_at','roles','memberships','schemas','extensions','objects','owners','acls','revisions'))
 instant(inv['captured_at'])
 if inv['source_state_sha256']!=e['source_state_sha256']:stop('SOURCE_STATE_MISMATCH')
 for k in ('roles','memberships','schemas','extensions','objects','owners','acls','revisions'):digest(inv[k])
 inventory=evidence_file(preserved_files['inventory'],inv['sha256'])
 if not inventory:stop('INVENTORY_EMPTY')
 witness=obj(e['independent_witness'],('name','identity_verified','independent_of_operator','signed_evidence_sha256'))
 if not isinstance(witness['name'],str) or len(witness['name'].strip())<3 or witness['name'].upper() in ('AI','CHATGPT','TBD') or witness['identity_verified'] is not True or witness['independent_of_operator'] is not True:stop('INDEPENDENT_WITNESS')
 digest(witness['signed_evidence_sha256'])
 for key,kind in (('restore_a','preservation_branch'),('restore_b','logical_database')):
  x=obj(e[key],('kind','target_id','source_branch_id','dump_sha256','inventory_sha256','status','exit_code','catalog_sha256','role_acl_sha256','witness_sha256','evidence_sha256'))
  if x['kind']!=kind or x['target_id'] in (STAGING,PRODUCTION,p['branch_id']) or not x['target_id'] or x['status']!='PASS' or x['exit_code']!=0:stop('RESTORE_TARGET_OR_RESULT')
  if x['source_branch_id']!=p['branch_id'] or x['dump_sha256']!=dump['sha256'] or x['inventory_sha256']!=inv['sha256'] or x['witness_sha256']!=witness['signed_evidence_sha256']:stop('RESTORE_BINDING')
  digest(x['catalog_sha256']);digest(x['role_acl_sha256'])
  evidence_file(preserved_files[key],x['evidence_sha256'])
 return {'schema':e['schema'],'recovery_hash':sha(json.dumps(e,sort_keys=True,separators=(',',':')).encode()),'status':'QUALIFIED_SOURCE_EVIDENCE'}
def validate_phase(phase,state,gate):
 if phase in ('prepare-security','prepare-migration-owner','migrate'):
  if state!='APPROVED_EMPTY':stop('PRECHANGE_STATE')
 elif phase in ('finalize','verify-final','audit-enforcement'):
  if state!='EXACT_CANONICAL_0001_0006':stop('POSTCHANGE_STATE')
 else:stop('PHASE')
 if gate not in ('R_PREPARED','A_AUTHORIZED'):stop('AUTHORIZATION_GATE')
 if phase!='verify-final' and gate!='A_AUTHORIZED':stop('GATE_A_REQUIRED')
 return True

