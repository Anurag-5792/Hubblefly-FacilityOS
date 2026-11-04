"""C039 authenticated PostgreSQL role-OID history: source-only verification.

Reuses Recovery V2 independently pinned corporate human and collector Ed25519
trust records. No registration/provisioning, PostgreSQL connection or Neon
operation is performed here. Real use requires already approved external
trust pins, original signed collection bytes, and exact Gate A evidence hashes.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path
try:
 from tools import hft_c028_catalog as catalog
 from tools import hft_neon_recovery_v2 as recovery
except ModuleNotFoundError:
 import hft_c028_catalog as catalog
 import hft_neon_recovery_v2 as recovery

SCHEMA='HFT_R1_BOOTSTRAP019_HISTORY_MANIFEST_V1'
COLLECTION_SCHEMA='HFT_R1_BOOTSTRAP019_PREDECESSOR_COLLECTION_V1'
WITNESS_SCHEMA='HFT_R1_BOOTSTRAP019_PREDECESSOR_WITNESS_V1'
FILE_MAP_SCHEMA='HFT_R1_BOOTSTRAP019_HISTORY_FILE_MAP_V1'
HEX=re.compile(r'^[a-f0-9]{64}$')
MIN_PREDECESSOR_AGE_SECONDS=60
MAX_PREDECESSOR_AGE_SECONDS=24*3600
MAX_HISTORY_SPAN_SECONDS=30*24*3600
MAX_WITNESS_DELAY_SECONDS=15*60
MAX_FILE_BYTES=20_000_000

def stop(reason):
 raise ValueError('C039_HISTORY_'+reason)
def sha(raw):
 return hashlib.sha256(raw).hexdigest()
def canonical(obj):
 return catalog.canonical(obj)
def utc(value):
 try:
  if not isinstance(value,str) or not value.endswith('Z'):
   stop('UTC_REQUIRED')
  parsed=dt.datetime.fromisoformat(value[:-1]+'+00:00')
  if parsed.utcoffset()!=dt.timedelta(0):stop('UTC_REQUIRED')
  if parsed.isoformat().replace('+00:00','Z')!=value:stop('UTC_NOT_CANONICAL')
  return parsed
 except (ValueError,TypeError,OverflowError):
  stop('UTC_INVALID')
def canonical_file(path,claimed,max_bytes=MAX_FILE_BYTES):
 if not isinstance(claimed,str) or not HEX.fullmatch(claimed):
  stop('EVIDENCE_DIGEST_INVALID')
 path=Path(path)
 if path.is_symlink() or not path.is_file() or path.stat().st_size>max_bytes:
  stop('EVIDENCE_UNAVAILABLE')
 raw=path.read_bytes()
 if sha(raw)!=claimed:stop('EVIDENCE_BYTES_CHANGED')
 return raw
def canonical_json_file(path,claimed):
 raw=canonical_file(path,claimed)
 try: obj=json.loads(raw)
 except (ValueError,UnicodeDecodeError):stop('EVIDENCE_JSON_INVALID')
 if not isinstance(obj,dict) or raw!=canonical(obj):
  stop('EVIDENCE_NOT_CANONICAL_JSON')
 return obj
def exactly(obj,keys):
 if not isinstance(obj,dict) or set(obj)!=set(keys):
  stop('SCHEMA_KEYS')
 return obj
def verify_signature(public_key,raw,signature):
 if (not isinstance(public_key,str) or
     '-----BEGIN PUBLIC KEY-----' not in public_key or
     len(signature)!=64):
  stop('SIGNATURE_FORMAT')
 with tempfile.TemporaryDirectory(prefix='hft-c039-verify-') as t:
  p=Path(t)
  (p/'key.pem').write_text(public_key)
  (p/'subject').write_bytes(raw)
  (p/'signature').write_bytes(signature)
  try:
   result=subprocess.run(['openssl','pkeyutl','-verify','-pubin',
    '-inkey',str(p/'key.pem'),'-rawin','-in',str(p/'subject'),
    '-sigfile',str(p/'signature')],capture_output=True,timeout=5)
  except (OSError,subprocess.TimeoutExpired):
   stop('SIGNATURE_VERIFIER_UNAVAILABLE')
  if result.returncode:stop('SIGNATURE_INVALID')

def trust_records(filemap,manifest,collector_pin,witness_pin,now):
 if manifest['collector_trust_sha256']!=collector_pin or (
     manifest['witness_trust_sha256']!=witness_pin):
  stop('UNAPPROVED_CORPORATE_TRUST_PIN')
 collector=canonical_json_file(filemap['collector_trust'],collector_pin)
 witness=canonical_json_file(filemap['witness_trust'],witness_pin)
 exactly(collector,('schema','collector_id','identity_issuer','verified_by',
  'verified_at','public_key_pem','status'))
 exactly(witness,('schema','witness_id','name','identity_issuer',
  'verified_by','verified_at','public_key_pem','status'))
 if (collector['schema']!='HFT_R1_INDEPENDENT_CATALOG_COLLECTOR_V1' or
     witness['schema']!='HFT_R1_INDEPENDENT_HUMAN_TRUST_V2' or
     collector['identity_issuer']!='HFT_CORPORATE_IDENTITY' or
     witness['identity_issuer']!='HFT_CORPORATE_IDENTITY' or
     collector['status']!='ACTIVE' or witness['status']!='ACTIVE' or
     not all(isinstance(x,str) and x for x in (
       collector['collector_id'],witness['witness_id'],
       collector['verified_by'],witness['verified_by'])) or
     collector['verified_by']==collector['collector_id'] or
     witness['verified_by']==witness['witness_id'] or
     witness['witness_id']==collector['collector_id'] or
     not isinstance(witness['name'],str) or not witness['name']):
  stop('CORPORATE_TRUST_IDENTITY_INVALID')
 if (utc(collector['verified_at'])>now or
     utc(witness['verified_at'])>now):
  stop('TRUST_VERIFIED_IN_FUTURE')
 for trust in (collector,witness):
  if not isinstance(trust['public_key_pem'],str) or (
      '-----BEGIN PUBLIC KEY-----' not in trust['public_key_pem']):
   stop('CORPORATE_PUBLIC_KEY_UNAVAILABLE')
 return collector,witness

# Exact signed predecessor retains all 30 categories and raw target-local OIDs.
ENVELOPE_FIELDS={'schema','collector_source_sha256','branch_id','database',
 'db_user','session_user','server_version','backend_pid','snapshot',
 'transport_sha256','raw_oid_sha256','portable_stage_sha256',
 'phase_sha256','revision_sha256'}
COLLECTION_FIELDS={'schema','project_id','branch_id','database','stage',
 'captured_at_utc','previous_collection_sha256','collection_envelope',
 'collection_id','catalog','phase','revisions','raw_oid_evidence','transport_jsonl'}

def build_collection(stage,target,observed,phase,revisions,envelope,
    captured_at_utc,previous_collection_sha256=None,transport_jsonl=None):
 """Source helper for an UNSIGNED artifact requiring independent signatures.

 This does not attest historical truth or enroll trust. A real artifact must
 be independently captured, protected, signed and Gate-A-approved later.
 """
 if not isinstance(envelope,dict) or not ENVELOPE_FIELDS.issubset(envelope):
  stop('COLLECTION_ENVELOPE_MISSING')
 if not isinstance(transport_jsonl,str) or not transport_jsonl:
  stop('ORIGINAL_TRANSPORT_REQUIRED')
 raw=catalog.raw_oid_evidence(observed)
 reconstructed,read_phase,read_revisions=catalog.collect(
  lambda statement:transport_jsonl,include_phase=True,
  expected_identity=(target['database'],envelope['db_user'],
   envelope['server_version']))
 if reconstructed!=observed or read_phase!=phase or read_revisions!=revisions:
  stop('ORIGINAL_TRANSPORT_CATALOG_CONFLICT')
 if sha(transport_jsonl.encode('utf-8'))!=envelope['transport_sha256']:
  stop('ORIGINAL_TRANSPORT_DIGEST_CONFLICT')
 content={k:envelope[k] for k in ENVELOPE_FIELDS}
 if (content['raw_oid_sha256']!=sha(canonical(raw)) or
     content['portable_stage_sha256']!=catalog.portable_stage_hash(observed) or
     content['phase_sha256']!=sha(canonical(phase)) or
     content['revision_sha256']!=sha(canonical(revisions))):
  stop('COLLECTION_CONTENT_CONFLICT')
 collection_id=sha(canonical(content))
 return {'schema':COLLECTION_SCHEMA,'stage':stage,
  'project_id':target['project_id'],'branch_id':target['branch_id'],
  'database':target['database'],'captured_at_utc':captured_at_utc,
  'previous_collection_sha256':previous_collection_sha256,
  'collection_envelope':content,'collection_id':collection_id,
  'catalog':observed,'phase':phase,'revisions':revisions,
  'raw_oid_evidence':raw,'transport_jsonl':transport_jsonl}

def stages_for(current_stage):
 if current_stage not in catalog.STAGES:stop('CURRENT_STAGE_INVALID')
 index=int(current_stage[1])
 return ['S0_BASELINE']+['S'+str(i) for i in range(index)]

def verify_collection(obj,stage,target,refs,collector_source,now):
 exactly(obj,COLLECTION_FIELDS)
 actual_stage='S0' if stage=='S0_BASELINE' else stage
 if obj['schema']!=COLLECTION_SCHEMA or obj['stage']!=stage or (
     any(obj.get(k)!=v for k,v in target.items())):
  stop('COLLECTION_SCOPE_OR_STAGE')
 captured=utc(obj['captured_at_utc'])
 if captured>now:stop('COLLECTION_IN_FUTURE')
 envelope=exactly(obj['collection_envelope'],ENVELOPE_FIELDS)
 if (envelope['schema']!=catalog.OID_EVIDENCE_SCHEMA or
     envelope['collector_source_sha256']!=collector_source or
     envelope['branch_id']!=target['branch_id'] or
     envelope['database']!=target['database'] or
     envelope['server_version']!='180006' or
     envelope['db_user']!=envelope['session_user'] or
     type(envelope['backend_pid']) is not int or envelope['backend_pid']<=0 or
     not isinstance(envelope['snapshot'],str) or not envelope['snapshot'] or
     not isinstance(envelope['transport_sha256'],str) or
     not HEX.fullmatch(envelope['transport_sha256'])):
  stop('COLLECTION_ORIGINAL_IDENTITY')
 if obj['collection_id']!=sha(canonical(envelope)):
  stop('COLLECTION_ID_CHANGED')
 observed=obj['catalog']
 transport=obj['transport_jsonl']
 if not isinstance(transport,str) or not transport or (
     sha(transport.encode('utf-8'))!=envelope['transport_sha256']):
  stop('ORIGINAL_TRANSPORT_MISSING_OR_CHANGED')
 try:
  replayed,replayed_phase,replayed_revisions=catalog.collect(
   lambda statement:transport,include_phase=True,
   expected_identity=(target['database'],envelope['db_user'],
    envelope['server_version']))
 except (ValueError,TypeError):
  stop('ORIGINAL_TRANSPORT_SNAPSHOT_INVALID')
 if (replayed!=observed or replayed_phase!=obj['phase'] or
     replayed_revisions!=obj['revisions']):
  stop('ORIGINAL_TRANSPORT_NOT_SAME_COLLECTION')
 if not isinstance(observed,dict) or set(observed)!=set(catalog.CATEGORIES):
  stop('COLLECTION_CATALOG_INCOMPLETE')
 # Validate raw member/grantor/role OID paths and stage-specific source controls.
 original_map=catalog.validate_oid_evidence(observed)
 catalog.structural_stage_checks(observed,actual_stage)
 if (obj['raw_oid_evidence']!=catalog.raw_oid_evidence(observed) or
     envelope['raw_oid_sha256']!=sha(canonical(obj['raw_oid_evidence'])) or
     envelope['portable_stage_sha256']!=catalog.portable_stage_hash(observed) or
     envelope['portable_stage_sha256']!=refs[actual_stage]):
  stop('COLLECTION_CATALOG_NOT_APPROVED')
 if (envelope['phase_sha256']!=sha(canonical(obj['phase'])) or
     envelope['revision_sha256']!=sha(canonical(obj['revisions']))):
  stop('COLLECTION_PHASE_OR_REVISION_HASH')
 phase=exactly(obj['phase'],('schema_exists','ledger_exists',
  'non_system_user_objects','migration_role_exists',
  'creator_default_restricted','schema_owner','required_catalog_present'))
 post=actual_stage in ('S3','S4','S5')
 if (phase['schema_exists'] is not post or
     phase['ledger_exists'] is not post or
     phase['migration_role_exists'] is not (actual_stage!='S0') or
     phase['creator_default_restricted'] is not
      (actual_stage not in ('S0','S1')) or
     type(phase['non_system_user_objects']) is not int or
     (phase['non_system_user_objects']<1 if post else
      phase['non_system_user_objects']!=0) or
     (phase['schema_owner']!='hft_staging_migration_owner' if post else
      phase['schema_owner'] is not None) or
     phase['required_catalog_present'] is not post):
  stop('COLLECTION_PHASE_UNQUALIFIED')
 if post:
  expected=[{'version':v,'sha256':h}
    for v,h in enumerate(catalog.CANONICAL_SHA,1)]
  if (phase['schema_owner']!='hft_staging_migration_owner' or
      phase['required_catalog_present'] is not True or
      obj['revisions']!=expected):
   stop('COLLECTION_CANONICAL_REVISION_MISMATCH')
 elif obj['revisions'] is not None or phase['non_system_user_objects']!=0:
  stop('COLLECTION_PREBOOTSTRAP_REVISION_INVALID')
 return captured,original_map

def validate_history(manifest_path,file_map_path,expected_manifest_sha256,
  current_stage,target,reference_paths,approved_collector_source_sha256,
  collector_trust_pin,witness_trust_pin,gate_not_before_utc,
  now=None,approved_baseline_sha256=None,
  approved_operator_id=None,approved_custodian_id=None,
  approved_witness_id=None):
 """Verify every authentic predecessor back to a separately pinned S0 baseline.

 No trust enrollment, signatures, collection or approval are created here.
 This routine only verifies prior approved artifacts and returns derived OIDs.
 """
 now=now or dt.datetime.now(dt.timezone.utc)
 if now.tzinfo is None:stop('CLOCK_NOT_UTC')
 if not all(isinstance(value,str) and value for value in (
      approved_operator_id,approved_custodian_id,approved_witness_id)):
  stop('GATE_A_HUMAN_CUSTODY_IDENTITIES_REQUIRED')
 if len({approved_operator_id,approved_custodian_id,
      approved_witness_id})!=3:
  stop('GATE_A_HUMAN_INDEPENDENCE_REQUIRED')
 if not isinstance(expected_manifest_sha256,str) or not HEX.fullmatch(
     expected_manifest_sha256):stop('MANIFEST_NOT_APPROVED')
 manifest=canonical_json_file(manifest_path,expected_manifest_sha256)
 exactly(manifest,('schema','project_id','branch_id','database',
  'next_stage','root_collection_sha256','collector_trust_sha256',
  'witness_trust_sha256','records'))
 if (manifest['schema']!=SCHEMA or
     manifest['next_stage']!=current_stage or
     any(manifest.get(k)!=v for k,v in target.items())):
  stop('HISTORY_SCOPE')
 if (not isinstance(approved_baseline_sha256,str) or
     not HEX.fullmatch(approved_baseline_sha256) or
     manifest['root_collection_sha256']!=approved_baseline_sha256):
  stop('BASELINE_NOT_INDEPENDENTLY_APPROVED')
 filemap=Path(file_map_path)
 if filemap.is_symlink() or not filemap.is_file() or filemap.stat().st_size>200_000:
  stop('HISTORY_FILE_MAP_UNAVAILABLE')
 try:
  files=json.loads(filemap.read_bytes())
 except (ValueError,UnicodeDecodeError):
  stop('HISTORY_FILE_MAP_INVALID')
 exactly(files,('schema','collector_trust','witness_trust','records'))
 if files['schema']!=FILE_MAP_SCHEMA or not isinstance(files['records'],list):
  stop('HISTORY_FILE_MAP_INVALID')
 stages=stages_for(current_stage)
 records=manifest['records']
 if (not isinstance(records,list) or len(records)!=len(stages) or
     len(files['records'])!=len(records)):
  stop('HISTORY_STAGE_CHAIN_INCOMPLETE')
 gate_start=utc(gate_not_before_utc)
 if gate_start>now:stop('GATE_WINDOW_NOT_STARTED')
 collector,witness=trust_records(files,manifest,
  collector_trust_pin,witness_trust_pin,now)
 refs=catalog.approved_stage_references(reference_paths)
 previous_sha=None
 previous_map=None
 previous_capture=None
 previous_witness=None
 prior_collection_ids=set()
 for position,stage in enumerate(stages):
  record=exactly(records[position],('stage','collection_sha256',
   'collector_signature_sha256','witness_sha256',
   'witness_signature_sha256'))
  locations=exactly(files['records'][position],('stage','collection',
   'collector_signature','witness','witness_signature'))
  if record['stage']!=stage or locations['stage']!=stage:
   stop('HISTORY_ORDER_INVALID')
  collection_bytes=canonical_file(
   locations['collection'],record['collection_sha256'])
  artifact=canonical_json_file(
   locations['collection'],record['collection_sha256'])
  if (artifact.get('previous_collection_sha256')!=previous_sha or
      artifact.get('collection_id') in prior_collection_ids):
   stop('HISTORY_REPLAY_OR_CHAIN_BREAK')
  captured,roles=verify_collection(artifact,stage,target,refs,
   approved_collector_source_sha256,now)
  if previous_capture is not None and (
      captured<=previous_capture or captured<=previous_witness):
   stop('HISTORY_CAPTURE_CHRONOLOGY')
  if (position==0 and (
      record['collection_sha256']!=manifest['root_collection_sha256'] or
      now-captured>dt.timedelta(seconds=MAX_HISTORY_SPAN_SECONDS))):
   stop('HISTORY_BASELINE_EXPIRED_OR_CHANGED')
  if previous_map is not None:
   removed=set(previous_map)-set(roles)
   added=set(roles)-set(previous_map)
   allowed=(catalog.source_role_contract()[0] if stage=='S1' else set())
   if (removed or added!=allowed or
       any(roles.get(name)!=oid for name,oid in previous_map.items())):
    stop('HISTORY_OID_CHAIN_RECREATED_OR_UNQUALIFIED_ROLE')
  collector_sig=canonical_file(
   locations['collector_signature'],record['collector_signature_sha256'],
   max_bytes=1024)
  verify_signature(collector['public_key_pem'],
   collection_bytes,collector_sig)
  w=canonical_json_file(locations['witness'],record['witness_sha256'])
  exactly(w,('schema','stage','project_id','branch_id','database',
   'collection_sha256','collection_id','collector_source_sha256',
   'collector_id','collector_signature_sha256','witness_id',
   'operator_id','custodian_id','custody_status','witnessed_at_utc'))
  if (w['schema']!=WITNESS_SCHEMA or w['stage']!=stage or
      any(w.get(k)!=v for k,v in target.items()) or
      w['collection_sha256']!=record['collection_sha256'] or
      w['collection_id']!=artifact['collection_id'] or
      w['collector_source_sha256']!=approved_collector_source_sha256 or
      w['collector_id']!=collector['collector_id'] or
      w['collector_signature_sha256']!=record['collector_signature_sha256'] or
      w['witness_id']!=witness['witness_id'] or
      w['witness_id']!=approved_witness_id or
      w['operator_id']!=approved_operator_id or
      w['custodian_id']!=approved_custodian_id or
      w['custody_status']!='INDEPENDENT_PROTECTED' or
      not all(isinstance(w.get(k),str) and w[k] for k in
       ('operator_id','custodian_id')) or
      len({w['operator_id'],w['custodian_id'],w['witness_id'],
           w['collector_id']})!=4):
   stop('WITNESS_INDEPENDENCE_OR_SCOPE')
  signed_at=utc(w['witnessed_at_utc'])
  if (signed_at<captured or
      signed_at-captured>dt.timedelta(seconds=MAX_WITNESS_DELAY_SECONDS) or
      signed_at>now or signed_at>gate_start or
      signed_at<utc(witness['verified_at']) or
      signed_at<utc(collector['verified_at'])):
   stop('WITNESS_TIME_INVALID')
  signature=canonical_file(
   locations['witness_signature'],record['witness_signature_sha256'],
   max_bytes=1024)
  verify_signature(witness['public_key_pem'],canonical(w),signature)
  prior_collection_ids.add(artifact['collection_id'])
  previous_sha=record['collection_sha256']
  previous_capture=captured
  previous_witness=signed_at
  previous_map=roles
 if now-previous_capture<dt.timedelta(seconds=MIN_PREDECESSOR_AGE_SECONDS):
  stop('HISTORY_NOT_YET_INDEPENDENTLY_QUALIFIED')
 if now-previous_capture>dt.timedelta(seconds=MAX_PREDECESSOR_AGE_SECONDS):
  stop('HISTORY_PREDECESSOR_STALE')
 if previous_capture>gate_start or previous_witness>gate_start:
  stop('HISTORY_CREATED_AFTER_GATE_APPROVAL')
 return {
  'schema':'HFT_R1_BOOTSTRAP019_AUTHENTICATED_CHAIN_RESULT_V1',
  'stage':current_stage,'previous_stage':stages[-1],
  'project_id':target['project_id'],'branch_id':target['branch_id'],
  'database':target['database'],
  'predecessor_collection_sha256':previous_sha,
  'root_collection_sha256':manifest['root_collection_sha256'],
  'manifest_sha256':expected_manifest_sha256,
  'prior_role_oids':previous_map,
  'predecessor_captured_at_utc':previous_capture.isoformat().replace('+00:00','Z'),
  'witnessed_at_utc':previous_witness.isoformat().replace('+00:00','Z'),
  'collector_source_sha256':approved_collector_source_sha256,
  'predecessor_witness_sha256':records[-1]['witness_sha256'],
  'collection_ids':sorted(prior_collection_ids)}
