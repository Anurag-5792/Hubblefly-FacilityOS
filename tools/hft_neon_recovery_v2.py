"""HFT_R1_NEON_PRECHANGE_RECOVERY_V2, bounded source-only qualification.

All provider records must be independently retrieved immediately before use.
Evidence hashes provide integrity, not provenance. A trusted, independently
registered human Ed25519 signature is required to establish the witness claim.
No Neon writes, backups or restores are executed by this module.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

PROJECT='red-silence-36758131'
STAGING='br-dawn-moon-azd9xzrp'
PRODUCTION_ID='br-bold-smoke-az9qmfaf'
DB='neondb'
SCHEMA='HFT_R1_NEON_PRECHANGE_RECOVERY_V2'
HEX=re.compile(r'^[a-f0-9]{64}$')
BRANCH=re.compile(r'^br-[a-z0-9-]{8,80}$')
LSN=re.compile(r'^[0-9A-F]+/[0-9A-F]+$')

def stop(code): raise ValueError('RECOVERY_V2_'+code)
def sha(data): return hashlib.sha256(data).hexdigest()
def normalized(data): return (json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf8')
def instant(text):
 if not isinstance(text,str):stop('UTC_TIMESTAMP_REQUIRED')
 try:
  parsed=dt.datetime.fromisoformat(text.replace('Z','+00:00'))
  if parsed.tzinfo is None:stop('UTC_TIMESTAMP_REQUIRED')
  return parsed.astimezone(dt.timezone.utc)
 except (ValueError,TypeError,AttributeError):stop('UTC_TIMESTAMP_INVALID')
def fields(value,names):
 if not isinstance(value,dict) or set(value)!=set(names):stop('SCHEMA_KEYS')
 return value
def digest(value):
 if not isinstance(value,str) or not HEX.fullmatch(value):stop('HASH_INVALID')
 return value
def evidence_bytes(path,expected,max_size=20_000_000):
 digest(expected)
 file=Path(path)
 if not file.is_file() or file.is_symlink():stop('EVIDENCE_FILE_MISSING')
 if file.stat().st_size>max_size:stop('EVIDENCE_TOO_LARGE')
 data=file.read_bytes()
 if sha(data)!=expected:stop('EVIDENCE_HASH_DRIFT')
 return data
def validate_large_dump(path,expected,length):
 digest(expected)
 file=Path(path)
 if not file.is_file() or file.is_symlink():stop('DUMP_FILE_MISSING')
 if type(length)!=int or length<5 or file.stat().st_size!=length:
  stop('CUSTOM_DUMP_LENGTH_INVALID')
 h=hashlib.sha256()
 with file.open('rb') as handle:
  if handle.read(5)!=b'PGDMP':stop('CUSTOM_DUMP_HEADER_INVALID')
  handle.seek(0)
  for block in iter(lambda:handle.read(1024*1024),b''):
   h.update(block)
 if h.hexdigest()!=expected:stop('CUSTOM_DUMP_HASH_DRIFT')
def evidence_json(path,expected):
 raw=evidence_bytes(path,expected)
 try: data=json.loads(raw)
 except (ValueError,UnicodeDecodeError):stop('EVIDENCE_JSON_INVALID')
 if raw!=normalized(data):stop('EVIDENCE_NOT_CANONICAL_JSON')
 if not isinstance(data,dict):stop('EVIDENCE_OBJECT_REQUIRED')
 return data
def freshness(value,now,minutes=15):
 t=instant(value)
 if t>now or now-t>dt.timedelta(minutes=minutes):stop('PROVIDER_READBACK_STALE')
 return t

def preservation_provider_projection(branch,endpoints):
 """Normalize real Neon API properties, never an invented retention object."""
 if not isinstance(branch,dict) or not isinstance(endpoints,list):stop('PROVIDER_RECORD_MISSING')
 required=('id','name','project_id','parent_id','parent_lsn','created_at',
  'default','primary','expires_at','ttl_interval_seconds')
 if any(k not in branch for k in required):
  stop('PROVIDER_RETENTION_FIELDS_ABSENT')
 keys=('id','name','project_id','parent_id','parent_lsn','parent_timestamp',
       'created_at','default','primary','expires_at','ttl_interval_seconds')
 projection={name:branch.get(name) for name in keys}
 projection['endpoint_ids']=sorted(x['id'] for x in endpoints
    if isinstance(x,dict) and x.get('branch_id')==branch.get('id') and isinstance(x.get('id'),str))
 return projection

def check_preservation(e,provider,now):
 p=fields(e['preservation'],('branch_id','name','parent_id','parent_lsn',
 'parent_timestamp','created_at','is_default','is_primary','endpoint_count',
 'retention','provider_record_sha256'))
 prohibited={STAGING,PRODUCTION_ID,'production'}
 if not BRANCH.fullmatch(str(p['branch_id'])) or p['branch_id'] in prohibited or (
     p['name'] in ('production','vercel-dev')):
  stop('PRESERVATION_ID_INVALID')
 if p['parent_id']!=STAGING:stop('PRESERVATION_NOT_FROM_STAGING')
 if not isinstance(p['parent_lsn'],str) or not LSN.fullmatch(p['parent_lsn']):
  stop('PARENT_LSN_INVALID')
 if p['parent_timestamp'] is not None:instant(p['parent_timestamp'])
 instant(p['created_at'])
 if p['is_default'] is not False or p['is_primary'] is not False or p['endpoint_count']!=0:
  stop('PRESERVATION_PRIMARY_OR_ENDPOINT')
 freshness(provider['verified_at'],now)
 branch=provider.get('branch')
 if not isinstance(branch,dict) or branch.get('current_state')!='ready':
  stop('PRESERVATION_PROVIDER_NOT_READY')
 actual=preservation_provider_projection(branch,provider.get('endpoints'))
 mapping={'branch_id':'id','name':'name','parent_id':'parent_id','parent_lsn':'parent_lsn',
 'parent_timestamp':'parent_timestamp','created_at':'created_at',
 'is_default':'default','is_primary':'primary'}
 for key,api_key in mapping.items():
  if p[key]!=actual[api_key]:stop('PRESERVATION_PROVIDER_MISMATCH')
 if actual['project_id']!=PROJECT or actual['endpoint_ids'] or (
   len(actual['endpoint_ids'])!=p['endpoint_count']):
  stop('PRESERVATION_PROVIDER_TARGET_INVALID')
 if sha(normalized(actual))!=digest(p['provider_record_sha256']):
  stop('PRESERVATION_PROVIDER_HASH_DRIFT')
 if actual['parent_id']!=STAGING or actual['id'] in prohibited:
  stop('PRESERVATION_PRODUCTION_OR_STAGING_PARENT')
 ttl=actual['ttl_interval_seconds']
 if ttl is not None and (type(ttl)!=int or ttl<=0):stop('PROVIDER_TTL_INVALID')
 exp=actual['expires_at']
 ret=fields(p['retention'],('mode','expires_at','ttl_interval_seconds','provider_verified_at'))
 freshness(ret['provider_verified_at'],now)
 if ret['expires_at']!=exp or ret['ttl_interval_seconds']!=ttl:
  stop('PROVIDER_RETENTION_MISMATCH')
 if ret['mode']=='FINITE':
  if not exp or instant(exp)<=instant(e['evidence_expires_at']) or instant(exp)<=now:
   stop('PRESERVATION_EXPIRES_BEFORE_RECOVERY_WINDOW')
 elif ret['mode']=='NO_SCHEDULED_EXPIRATION':
  # Null expires_at shows only no scheduled expiry, NEVER guaranteed indefinite.
  if exp is not None or ttl is not None:stop('PRESERVATION_RETENTION_CONTRADICTION')
 else:stop('UNSUPPORTED_INDEFINITE_OR_UNVERIFIED_RETENTION')
 return p

def validate_inventory(e,files):
 inv=fields(e['inventory'],('sha256','file_ref','source_state_sha256',
 'source_lsn','captured_at','roles','memberships','schemas','extensions',
 'objects','owners','acls','revisions'))
 inventory=evidence_json(files['inventory'],inv['sha256'])
 sections=('roles','memberships','schemas','extensions','objects','owners','acls','revisions')
 fields(inventory,('schema','source_branch_id','database','source_lsn',
 'captured_at',*sections))
 if inventory['schema']!='HFT_R1_PRECHANGE_INVENTORY_V2' or (
  inventory['source_branch_id']!=STAGING or inventory['database']!=DB or
  inventory['source_lsn']!=e['source_lsn'] or inventory['captured_at']!=inv['captured_at']):
  stop('INVENTORY_SCOPE_MISMATCH')
 instant(inv['captured_at'])
 if inv['source_state_sha256']!=e['source_state_sha256'] or (
  sha(normalized({k:inventory[k] for k in sections}))!=e['source_state_sha256']):
  stop('PRECHANGE_SOURCE_STATE_INVALID')
 for field in sections:
  if sha(normalized(inventory[field]))!=digest(inv[field]):
   stop('PRECHANGE_INVENTORY_SECTION_HASH_DRIFT')
 return inv

def validate_dump(e,files):
 d=fields(e['dump'],('sha256','size_bytes','format','postgres_major',
 'pg_dump_version','pg_restore_version','created_at','direct_tls_verified',
 'endpoint_id','source_lsn','source_state_sha256','dump_list_sha256','file_ref'))
 if d['format']!='custom' or type(d['postgres_major'])!=int or d['postgres_major']!=18 or (
  type(d['size_bytes'])!=int or d['size_bytes']<5 or
  not isinstance(d['pg_dump_version'],str) or not d['pg_dump_version'].startswith('18.') or
  not isinstance(d['pg_restore_version'],str) or not d['pg_restore_version'].startswith('18.') or
  d['direct_tls_verified'] is not True or d['source_lsn']!=e['source_lsn'] or
  d['source_state_sha256']!=e['source_state_sha256']):
  stop('LOGICAL_DUMP_IDENTITY_INVALID')
 if d['endpoint_id']!='ep-lingering-tooth-azvv1jmr':stop('LOGICAL_DUMP_ENDPOINT_MISMATCH')
 instant(d['created_at'])
 validate_large_dump(files['dump'],d['sha256'],d['size_bytes'])
 listing=evidence_bytes(files['dump_list'],d['dump_list_sha256'])
 if not listing.strip():stop('RESTORE_LIST_EMPTY')
 return d

def verify_restore_provider(e,targets,preservation,now):
 if not isinstance(targets,dict):stop('RESTORE_PROVIDER_READBACK_MISSING')
 freshness(targets.get('verified_at'),now)
 a=targets.get('restore_a_branch'); b=targets.get('restore_b_branch')
 endpoint=targets.get('restore_b_endpoint')
 dbs=targets.get('restore_b_databases')
 if not isinstance(a,dict) or not isinstance(b,dict) or not isinstance(dbs,list):
  stop('RESTORE_PROVIDER_TARGETS_MISSING')
 forbidden={STAGING,PRODUCTION_ID,preservation['branch_id'],'production'}
 ra=e['restore_a'];rb=e['restore_b']
 for target in (a,b):
  if target.get('current_state')!='ready':stop('RESTORE_BRANCH_NOT_READY')
  if 'expires_at' not in target or 'ttl_interval_seconds' not in target:
   stop('RESTORE_PROVIDER_RETENTION_FIELDS_MISSING')
  ttl=target['ttl_interval_seconds']
  if ttl is not None and (type(ttl)!=int or ttl<=0):
   stop('RESTORE_PROVIDER_TTL_INVALID')
  expiry=target['expires_at']
  if expiry is not None and instant(expiry)<=max(now,instant(e['evidence_expires_at'])):
   stop('RESTORE_BRANCH_EXPIRES_BEFORE_RECOVERY_WINDOW')
  if expiry is None and ttl is not None:stop('RESTORE_TTL_WITHOUT_EXPIRY')
  if target.get('project_id')!=PROJECT or target.get('id') in forbidden or (
    target.get('name') in ('production','vercel-dev')) or (
    target.get('default') is not False) or (
    target.get('primary') is not False):
   stop('RESTORE_PRODUCTION_STAGING_OR_DEFAULT_TARGET')
 if a.get('id')!=ra['target_id'] or a.get('parent_id')!=preservation['branch_id']:
  stop('RESTORE_A_NOT_DERIVED_FROM_PRESERVATION')
 if a.get('parent_lsn')!=e['source_lsn'] or a.get('parent_lsn')!=preservation['parent_lsn']:
  stop('RESTORE_A_FORK_LSN_NOT_AUTHORIZED')
 if b.get('id')!=rb.get('recovery_branch_id') or b.get('id')==a.get('id'):
  stop('RESTORE_B_NOT_ISOLATED_BRANCH')
 if b.get('parent_id') in forbidden or b.get('parent_id')==a.get('id'):
  stop('RESTORE_B_SOURCE_ISOLATION_INVALID')
 if rb['target_id'] in (DB,STAGING,PRODUCTION_ID,ra['target_id']) or (
  not re.fullmatch(r'hft_restore_[a-z0-9_]{6,60}',str(rb['target_id']))):
  stop('RESTORE_B_DATABASE_NOT_ISOLATED')
 found=[item for item in dbs if isinstance(item,dict) and item.get('name')==rb['target_id']]
 if len(found)!=1 or found[0].get('branch_id') not in (None,b['id']):
  stop('RESTORE_B_DATABASE_PROVIDER_NOT_BOUND')
 if not isinstance(endpoint,dict) or endpoint.get('branch_id')!=b.get('id') or (
   endpoint.get('type')!='read_write' or endpoint.get('region_id')!='aws-ap-southeast-1' or
   not re.fullmatch(r'ep-[a-z0-9-]{7,100}',str(endpoint.get('id',''))) or
   not re.fullmatch(r'ep-[a-z0-9.-]{8,230}\.neon\.tech',str(endpoint.get('host',''))) or
   '-pooler.' in endpoint.get('host','')):
  stop('RESTORE_B_UNAUTHORIZED_ENDPOINT')
 if targets.get('production_branch_id')!=PRODUCTION_ID:
  stop('RESTORE_PRODUCTION_ID_NOT_VERIFIED')
 return True

def verify_independent_collector(record,files,label,category,trust_sha):
 if not isinstance(trust_sha,str) or not HEX.fullmatch(trust_sha):
  stop('INDEPENDENT_COLLECTOR_TRUST_NOT_APPROVED')
 trust=evidence_json(files['collector_trust'],trust_sha)
 fields(trust,('schema','collector_id','identity_issuer','verified_by',
  'verified_at','public_key_pem','status'))
 if trust['schema']!='HFT_R1_INDEPENDENT_CATALOG_COLLECTOR_V1' or (
  trust['identity_issuer']!='HFT_CORPORATE_IDENTITY' or
  trust['status']!='ACTIVE' or trust['verified_by']==trust['collector_id'] or
  not trust['verified_by'] or 'BEGIN PUBLIC KEY' not in str(trust['public_key_pem'])):
  stop('COLLECTOR_CORPORATE_TRUST_UNVERIFIED')
 info=fields(record['collector'],('collector_id','trust_sha256',
  'query_source_sha256','signature_sha256'))
 if info['collector_id']!=trust['collector_id'] or info['trust_sha256']!=trust_sha:
  stop('COLLECTOR_IDENTITY_NOT_ENROLLED')
 query_source=Path(__file__).with_name('hft_c028_catalog.py')
 if query_source.is_symlink() or not query_source.is_file() or (
  info['query_source_sha256']!=sha(query_source.read_bytes())):
  stop('COLLECTOR_QUERY_SOURCE_DRIFT')
 sig=evidence_bytes(files[label+'_'+category+'_collector_signature'],
  info['signature_sha256'])
 unsigned={k:v for k,v in record.items() if k!='collector'}
 with tempfile.TemporaryDirectory(prefix='hft-c028-collector-') as tmp:
  f=Path(tmp)
  (f/'key.pem').write_text(trust['public_key_pem'])
  (f/'observation.json').write_bytes(normalized(unsigned))
  (f/'signature').write_bytes(sig)
  try:
   result=subprocess.run(['openssl','pkeyutl','-verify','-pubin',
    '-inkey',str(f/'key.pem'),'-rawin','-in',str(f/'observation.json'),
    '-sigfile',str(f/'signature')],capture_output=True,timeout=5)
  except (OSError,subprocess.TimeoutExpired):
   stop('COLLECTOR_SIGNATURE_VERIFICATION_UNAVAILABLE')
  if result.returncode!=0:stop('COLLECTOR_OBSERVATION_SIGNATURE_INVALID')

def verify_restore_b_destination(receipt,files,item,targets,now,trust_sha):
 endpoint=targets.get('restore_b_endpoint')
 if not isinstance(endpoint,dict):stop('RESTORE_B_ENDPOINT_NOT_VERIFIED')
 path=files.get('restore_b_connection')
 if not path:stop('RESTORE_B_CONNECTION_RECEIPT_REQUIRED')
 actual=evidence_json(path,receipt['connection_sha256'])
 fields(actual,('schema','project_id','branch_id','endpoint_id','host',
  'port','database','login','sslmode','client_tls_verified',
  'server_database','server_session_user','server_version_num',
  'captured_at','argv','environment_routing','environment_keys','collector'))
 if actual['schema']!='HFT_R1_RESTORE_B_CONNECTION_ATTESTATION_V1' or (
  actual['project_id']!=PROJECT or actual['branch_id']!=item['recovery_branch_id'] or
  actual['endpoint_id']!=endpoint['id'] or actual['host']!=endpoint['host'] or
  actual['port']!=5432 or actual['database']!=item['target_id'] or
  actual['server_database']!=item['target_id'] or
  actual['login']!=actual['server_session_user'] or
  actual['server_version_num']!=180006 or
  actual['sslmode']!='verify-full' or actual['client_tls_verified'] is not True):
  stop('RESTORE_B_ACTUAL_CONNECTION_NOT_ISOLATED')
 if not isinstance(actual['login'],str) or not re.fullmatch(r'hft_restore_[a-z0-9_]{5,60}',actual['login']):
  stop('RESTORE_B_LOGIN_NOT_RESTRICTED')
 if instant(actual['captured_at'])<instant(receipt['started_at']) or (
  instant(actual['captured_at'])>instant(receipt['completed_at'])):
  stop('RESTORE_B_CONNECTION_CAPTURE_NOT_IN_EXECUTION_WINDOW')
 # No alternate URI or hidden libpq path can override the approved branch.
 if actual['environment_routing']!={'PGSSLMODE':'verify-full'} or (
  actual['environment_keys']!=['PGPASSWORD','PGSSLMODE']):
  stop('RESTORE_B_ENVIRONMENT_ROUTING_NOT_ATTESTED')
 if not isinstance(receipt['command_argv'],list):
  stop('RESTORE_B_COMMAND_ARGUMENTS_NOT_ATTESTED')
 cmd=receipt['command_argv']
 if len(cmd)!=9 or not isinstance(cmd[-1],str) or not cmd[-1].startswith('/restricted/') or '..' in cmd[-1].split('/'):
  stop('RESTORE_B_DUMP_FILE_ROUTE_INVALID')
 expected=['pg_restore','--single-transaction','--exit-on-error',
  '--format=custom','--host='+actual['host'],'--port=5432',
  '--username='+actual['login'],'--dbname='+actual['database'],cmd[-1]]
 if cmd!=expected or actual['argv']!=expected:
  stop('RESTORE_B_EFFECTIVE_COMMAND_ROUTING_INVALID')
 verify_independent_collector(actual,files,'restore_b','connection',trust_sha)

def validate_restore(e,files,now,targets,collector_trust_sha256):
 inv=e['inventory'];dump=e['dump']
 latest_readback=instant(e['evidence_created_at'])
 for key,kind in (('restore_a','preservation_branch'),('restore_b','logical_database')):
  r=fields(e[key],('kind','target_id','source_branch_id',
    'recovery_branch_id','dump_sha256','inventory_sha256','status','exit_code',
    'catalog_sha256','role_acl_sha256','evidence_sha256'))
  if r['kind']!=kind or r['source_branch_id']!=e['preservation']['branch_id'] or (
   r['dump_sha256']!=dump['sha256'] or r['inventory_sha256']!=inv['sha256']):
   stop('RESTORE_SOURCE_BINDING')
  if r['status']!='PASS' or r['exit_code']!=0:stop('RESTORE_FAILED')
  if key=='restore_a' and r['recovery_branch_id']!=r['target_id']:
   stop('RESTORE_A_BRANCH_ID_INVALID')
  receipt=evidence_json(files[key],r['evidence_sha256'])
  fields(receipt,('schema','kind','operation','target_id','recovery_branch_id',
   'source_branch_id','source_lsn','source_state_sha256','dump_sha256',
   'inventory_sha256','started_at','completed_at','exit_code','command_argv',
   'provider_operation_id','stdout_sha256','stderr_sha256',
   'catalog_sha256','role_acl_sha256','connection_sha256'))
  if receipt['schema']!='HFT_R1_RESTORE_EXECUTION_RECEIPT_V2' or (
   receipt['kind']!=kind or receipt['target_id']!=r['target_id'] or
   receipt['recovery_branch_id']!=r['recovery_branch_id'] or
   receipt['source_branch_id']!=r['source_branch_id'] or
   receipt['source_lsn']!=e['source_lsn'] or
   receipt['source_state_sha256']!=e['source_state_sha256'] or
   receipt['dump_sha256']!=dump['sha256'] or
   receipt['inventory_sha256']!=inv['sha256'] or
   receipt['catalog_sha256']!=r['catalog_sha256'] or
   receipt['role_acl_sha256']!=r['role_acl_sha256'] or
   receipt['exit_code']!=0):
   stop('RESTORE_EXECUTION_RECEIPT_MISMATCH')
  started=instant(receipt['started_at'])
  completed=instant(receipt['completed_at'])
  if completed<started or completed>now:
   stop('RESTORE_EXECUTION_TIMESTAMPS_INVALID')
  provider_branch=targets['restore_a_branch' if key=='restore_a' else 'restore_b_branch']
  if 'created_at' not in provider_branch:
   stop('RESTORE_PROVIDER_CREATION_TIMESTAMP_REQUIRED')
  created=instant(provider_branch['created_at'])
  if created>now or created<instant(e['preservation']['created_at']):
   stop('RESTORE_PROVIDER_CREATION_TIMESTAMP_INVALID')
  if key=='restore_a' and not (started<=created<=completed):
   stop('RESTORE_A_PROVIDER_CREATION_NOT_BOUND_TO_RECEIPT')
  if key=='restore_b' and created>started:
   stop('RESTORE_B_BRANCH_NOT_READY_BEFORE_RESTORE')
  argv=receipt['command_argv']
  if key=='restore_a':
   if receipt['operation']!='NEON_BRANCH_DERIVE_FROM_PRESERVATION' or (
    not isinstance(receipt['provider_operation_id'],str) or
    not receipt['provider_operation_id'] or
    argv!=['neon','branches','create','--parent',e['preservation']['branch_id']]):
    stop('RESTORE_A_EXECUTION_RECEIPT_INVALID')
  else:
   if receipt['operation']!='PG_RESTORE_SINGLE_TRANSACTION' or (
    receipt['provider_operation_id'] is not None):
    stop('RESTORE_B_SINGLE_TRANSACTION_NOT_ATTESTED')
   verify_restore_b_destination(receipt,files,r,targets,now,collector_trust_sha256)
  evidence_bytes(files[key+'_stdout'],receipt['stdout_sha256'])
  evidence_bytes(files[key+'_stderr'],receipt['stderr_sha256'])
  for category,fields_map in (
   ('catalog',('schemas','extensions','objects','revisions')),
   ('acl',('roles','memberships','owners','acls'))):
   expected=r['catalog_sha256'] if category=='catalog' else r['role_acl_sha256']
   record=evidence_json(files[key+'_'+category],expected)
   fields(record,('schema','branch_id','database','source_lsn',
    'source_state_sha256','captured_at',*fields_map,'collector'))
   if record['schema']!='HFT_R1_RESTORED_'+category.upper()+'_READBACK_V2' or (
    record['branch_id']!=r['recovery_branch_id'] or
    record['database']!= (DB if key=='restore_a' else r['target_id']) or
    record['source_lsn']!=e['source_lsn'] or
    record['source_state_sha256']!=e['source_state_sha256']):
    stop('RESTORE_INDEPENDENT_READBACK_SCOPE_INVALID')
   captured=instant(record['captured_at'])
   if captured<instant(receipt['completed_at']) or captured>now:
    stop('RESTORE_INDEPENDENT_READBACK_TIME_INVALID')
   latest_readback=max(latest_readback,captured)
   source=evidence_json(files['inventory'],inv['sha256'])
   for field in fields_map:
    observed=record[field]
    if not isinstance(observed,list) or observed!=source[field] or (
     sha(normalized(observed))!=digest(inv[field])):
     stop('RESTORE_OBSERVED_CATALOG_OR_ACL_MISMATCH')
   verify_independent_collector(record,files,key,category,collector_trust_sha256)
 return latest_readback

def verify_witness(e,files,now,expected_trust_sha256,not_before,signature_verifier=None):
 # Approved corporate key custody is source- and Gate-R-controlled, not a
 # public key placed next to a self-declared PASS flag.
 if not isinstance(expected_trust_sha256,str) or not HEX.fullmatch(expected_trust_sha256):
  stop('INDEPENDENT_HUMAN_TRUST_NOT_APPROVED')
 trust=evidence_json(files['witness_trust'],expected_trust_sha256)
 fields(trust,('schema','witness_id','name','identity_issuer',
  'verified_by','verified_at','public_key_pem','status'))
 if trust['schema']!='HFT_R1_INDEPENDENT_HUMAN_TRUST_V2' or (
  trust['identity_issuer']!='HFT_CORPORATE_IDENTITY' or
  trust['status']!='ACTIVE' or not trust['verified_by'] or
  trust['verified_by']==trust['witness_id'] or
  not isinstance(trust['public_key_pem'],str) or
  'BEGIN PUBLIC KEY' not in trust['public_key_pem']):
  stop('WITNESS_CORPORATE_IDENTITY_NOT_ATTESTED')
 instant(trust['verified_at'])
 w=fields(e['independent_witness'],('witness_id','name','operator_id',
  'witness_file_sha256','signature_sha256','trust_record_sha256'))
 if (w['witness_id']!=trust['witness_id'] or w['name']!=trust['name'] or
   w['operator_id']==w['witness_id'] or
   w['trust_record_sha256']!=expected_trust_sha256):
  stop('INDEPENDENT_WITNESS_IDENTITY_MISMATCH')
 witness=evidence_json(files['witness'],w['witness_file_sha256'])
 fields(witness,('schema','witness_id','name','operator_id','witnessed_at',
  'recovery_scope','subject_sha256'))
 subject={k:v for k,v in e.items() if k!='independent_witness'}
 if witness['schema']!='HFT_R1_INDEPENDENT_HUMAN_WITNESS_V2' or (
  witness['witness_id']!=w['witness_id'] or
  witness['name']!=w['name'] or witness['operator_id']!=w['operator_id'] or
  witness['recovery_scope']!=SCHEMA or
  witness['subject_sha256']!=sha(normalized(subject))):
  stop('INDEPENDENT_WITNESS_SCOPE_INVALID')
 if instant(witness['witnessed_at'])>now or (
  instant(witness['witnessed_at'])<not_before) or (
  instant(witness['witnessed_at'])<instant(trust['verified_at'])):
  stop('WITNESS_TIME_INVALID')
 signature=evidence_bytes(files['witness_signature'],w['signature_sha256'])
 if not signature:stop('WITNESS_SIGNATURE_MISSING')
 if signature_verifier is None:
  with tempfile.TemporaryDirectory(prefix='hft-recovery-v2-') as folder:
   f=Path(folder)
   (f/'pub.pem').write_text(trust['public_key_pem'])
   (f/'witness.json').write_bytes(normalized(witness))
   (f/'signature.bin').write_bytes(signature)
   try:
    verified=subprocess.run(['openssl','pkeyutl','-verify','-pubin',
     '-inkey',str(f/'pub.pem'),'-rawin','-in',str(f/'witness.json'),
     '-sigfile',str(f/'signature.bin')],capture_output=True,timeout=5)
    if verified.returncode!=0:stop('INDEPENDENT_WITNESS_SIGNATURE_INVALID')
   except (OSError,subprocess.TimeoutExpired):
    stop('INDEPENDENT_WITNESS_SIGNATURE_UNAVAILABLE')
 else:
  if signature_verifier(normalized(witness),signature,trust['public_key_pem']) is not True:
   stop('INDEPENDENT_WITNESS_SIGNATURE_INVALID')
 return True

def validate_v2(e,provider,files,now=None,targets=None,trust_sha256=None,signature_verifier=None,collector_trust_sha256=None):
 now=now or dt.datetime.now(dt.timezone.utc)
 fields(e,('schema','project_id','source_branch_id','database','source_lsn',
 'source_state_sha256','preservation','dump','inventory','restore_a','restore_b',
 'independent_witness','evidence_created_at','evidence_expires_at'))
 if e['schema']!=SCHEMA or e['project_id']!=PROJECT or (
  e['source_branch_id']!=STAGING or e['database']!=DB):
  stop('SCOPE')
 if instant(e['evidence_created_at'])>now or (
  instant(e['evidence_expires_at'])<=now):stop('EVIDENCE_EXPIRED')
 if not isinstance(e['source_lsn'],str) or not LSN.fullmatch(e['source_lsn']):
  stop('SOURCE_LSN_INVALID')
 digest(e['source_state_sha256'])
 preserve=check_preservation(e,provider,now)
 if e['source_lsn']!=preserve['parent_lsn']:
  stop('SOURCE_PRESERVATION_LSN_MISMATCH')
 inv=validate_inventory(e,files)
 dump=validate_dump(e,files)
 if instant(inv['captured_at'])>now or instant(dump['created_at'])>now:
  stop('PRECHANGE_CAPTURE_FROM_FUTURE')
 verify_restore_provider(e,targets,preserve,now)
 last_readback=validate_restore(e,files,now,targets,collector_trust_sha256)
 if instant(targets['verified_at'])<last_readback or (
  instant(provider['verified_at'])<last_readback):
  stop('PROVIDER_STATUS_STALE_AFTER_RESTORE')
 verify_witness(e,files,now,trust_sha256,last_readback,signature_verifier)
 return {'schema':SCHEMA,'recovery_hash':sha(normalized(e)),
  'status':'SOURCE_EVIDENCE_CRYPTOGRAPHICALLY_VERIFIED_NOT_PROVIDER_QUALIFIED'}
def validate_phase(phase,state,gate):
 if phase in ('prepare-security','prepare-migration-owner','migrate','preflight-owner'):
  if state!='APPROVED_EMPTY':stop('PRECHANGE_STATE')
 elif phase in ('finalize-owner','finalize-dba','verify-final-dba',
  'verify-runtime-negative','verify-audit'):
  if state!='EXACT_CANONICAL_0001_0006':stop('POSTCHANGE_STATE')
 else:stop('PHASE_UNRECOGNIZED')
 if phase not in ('preflight-owner','verify-final-dba','verify-runtime-negative',
    'verify-audit') and gate!='A_AUTHORIZED':
  stop('GATE_A_REQUIRED')
 if gate not in ('R_PREPARED','A_AUTHORIZED'):stop('AUTHORIZATION_GATE_INVALID')
 return True

