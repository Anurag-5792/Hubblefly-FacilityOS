"""C039 actual signed predecessor chain and runner pre-mutation gates.

All keys and data in this module are test-only, generated in a temporary
directory. No corporate key is enrolled and no PostgreSQL/Neon is accessed.
Cryptographic verification, original transport replay, stage verification
and the real runner history gate are NOT mocked in acceptance tests.
"""
from __future__ import annotations
import contextlib
import copy
import datetime as dt
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import hft_c028_catalog as c
from tools import hft_c039_history as h
from tools import hft_neon_staging_bootstrap as runner

spec=importlib.util.spec_from_file_location('hft_c030_for_c039',
 Path(__file__).with_name('test_hft_c030_phase_transitions.py'))
fx=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fx)

TARGET={'project_id':runner.PROJECT,'branch_id':runner.BRANCH,
 'database':runner.DB}
HISTORY_STAGES=['S0_BASELINE','S0','S1','S2','S3','S4']
PHASES=dict((stage,phase) for phase,stage in fx.PHASES)


def command(argv):
 result=subprocess.run(argv,capture_output=True,timeout=12)
 if result.returncode:raise AssertionError(
  'TEST_ONLY_OPENSSL_FAILURE '+result.stderr.decode(errors='replace'))
 return result


def save_json(path,obj):
 Path(path).write_bytes(c.canonical(obj))
 return c.sha(Path(path).read_bytes())


class SignedHistory(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  if shutil.which('openssl') is None:
   raise unittest.SkipTest('OpenSSL required for real Ed25519 verification')
  cls.tmp=tempfile.TemporaryDirectory(prefix='hft-c039-synthetic-')
  cls.root=Path(cls.tmp.name)
  cls.now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
  cls.gate_start=cls.now-dt.timedelta(minutes=2)
  cls.target=TARGET.copy()
  cls.db=fx.FakePg18()
  cls.refs={}
  for stage in c.STAGES:
   p=cls.root/(stage+'.sha256')
   p.write_text(c.portable_stage_hash(cls.db.snapshots[stage])+'\n')
   cls.refs[stage]=p
  cls.keys={}
  cls.trust={}
  for purpose in ('collector','witness'):
   private=cls.root/(purpose+'-test-only-private.pem')
   public=cls.root/(purpose+'-test-only-public.pem')
   command(['openssl','genpkey','-algorithm','ED25519',
    '-out',str(private)])
   command(['openssl','pkey','-in',str(private),
    '-pubout','-out',str(public)])
   cls.keys[purpose]=private
   verified=(cls.now-dt.timedelta(hours=3)).isoformat().replace('+00:00','Z')
   if purpose=='collector':
    trust={'schema':'HFT_R1_INDEPENDENT_CATALOG_COLLECTOR_V1',
     'collector_id':'TEST_COLLECTOR_KEY_NO_CORPORATE_ENROLLMENT',
     'identity_issuer':'HFT_CORPORATE_IDENTITY',
     'verified_by':'TEST_CORPORATE_REGISTRAR','verified_at':verified,
     'public_key_pem':public.read_text(),'status':'ACTIVE'}
   else:
    trust={'schema':'HFT_R1_INDEPENDENT_HUMAN_TRUST_V2',
     'witness_id':'TEST_WITNESS_KEY_NO_CORPORATE_ENROLLMENT',
     'name':'Test Human Witness','identity_issuer':'HFT_CORPORATE_IDENTITY',
     'verified_by':'TEST_CORPORATE_REGISTRAR','verified_at':verified,
     'public_key_pem':public.read_text(),'status':'ACTIVE'}
   path=cls.root/(purpose+'-trust.json')
   digest=save_json(path,trust)
   cls.trust[purpose]={'file':path,'digest':digest,'record':trust}
  cls.artifacts=[]
  predecessor_sha=None
  for index,alias in enumerate(HISTORY_STAGES):
   stage='S0' if alias=='S0_BASELINE' else alias
   transport=cls.transport_for(stage,index)
   out={}
   observed,phase,revisions=c.collect(
    lambda sql:transport,include_phase=True,
    expected_identity=(runner.DB,runner.OWNER,runner.PGNUM),
    evidence_out=out,branch_id=runner.BRANCH)
   captured=cls.now-dt.timedelta(minutes=80-index*10)
   envelope={key:out[key] for key in h.ENVELOPE_FIELDS}
   artifact=h.build_collection(alias,cls.target,observed,phase,
    revisions,envelope,captured.isoformat().replace('+00:00','Z'),
    predecessor_sha,transport_jsonl=transport)
   folder=cls.root/alias
   folder.mkdir()
   collection=folder/'predecessor.json'
   collection_sha=save_json(collection,artifact)
   collector_sig=cls.sign('collector',collection,folder/'collector.sig')
   witnessed=captured+dt.timedelta(minutes=1)
   witness_doc={'schema':h.WITNESS_SCHEMA,'stage':alias,**cls.target,
    'collection_sha256':collection_sha,
    'collection_id':artifact['collection_id'],
    'collector_source_sha256':c.sha(Path(c.__file__).read_bytes()),
    'collector_id':cls.trust['collector']['record']['collector_id'],
    'collector_signature_sha256':c.sha(collector_sig.read_bytes()),
    'witness_id':cls.trust['witness']['record']['witness_id'],
    'operator_id':'TEST_OPERATOR_HUMAN',
    'custodian_id':'TEST_INDEPENDENT_CUSTODIAN_HUMAN',
    'custody_status':'INDEPENDENT_PROTECTED',
    'witnessed_at_utc':witnessed.isoformat().replace('+00:00','Z')}
   witness=folder/'witness.json'
   witness_sha=save_json(witness,witness_doc)
   witness_sig=cls.sign('witness',witness,folder/'witness.sig')
   cls.artifacts.append({
    'stage':alias,'collection_path':collection,'collection_sha256':collection_sha,
    'collector_signature_path':collector_sig,
    'collector_signature_sha256':c.sha(collector_sig.read_bytes()),
    'witness_path':witness,'witness_sha256':witness_sha,
    'witness_signature_path':witness_sig,
    'witness_signature_sha256':c.sha(witness_sig.read_bytes()),
    'role_oids':c.validate_oid_evidence(observed),'collection_id':
      artifact['collection_id']})
   predecessor_sha=collection_sha
  cls.manifests={}
  cls.maps={}
  cls.proofs={}
  for index,stage in enumerate(c.STAGES):
   entries=cls.artifacts[:index+1]
   manifest={'schema':h.SCHEMA,**cls.target,'next_stage':stage,
    'root_collection_sha256':cls.artifacts[0]['collection_sha256'],
    'collector_trust_sha256':cls.trust['collector']['digest'],
    'witness_trust_sha256':cls.trust['witness']['digest'],
    'records':[{k:x[k] for k in ('stage','collection_sha256',
      'collector_signature_sha256','witness_sha256',
      'witness_signature_sha256')} for x in entries]}
   file_map={'schema':h.FILE_MAP_SCHEMA,
    'collector_trust':str(cls.trust['collector']['file']),
    'witness_trust':str(cls.trust['witness']['file']),
    'records':[{'stage':x['stage'],'collection':str(x['collection_path']),
      'collector_signature':str(x['collector_signature_path']),
      'witness':str(x['witness_path']),
      'witness_signature':str(x['witness_signature_path'])}
      for x in entries]}
   mpath=cls.root/(stage+'-history.json')
   mapath=cls.root/(stage+'-locations.json')
   sha=save_json(mpath,manifest)
   save_json(mapath,file_map)
   cls.manifests[stage]=(mpath,sha)
   cls.maps[stage]=mapath
   cls.proofs[stage]={
    'schema':c.ROLE_CONTINUITY_SCHEMA,'stage':stage,**cls.target,
    'anchor_stage':entries[-1]['stage'],
    'previous_collection_sha256':entries[-1]['collection_sha256'],
    'witness_evidence_sha256':entries[-1]['witness_sha256'],
    'collector_source_sha256':c.sha(Path(c.__file__).read_bytes()),
    'prior_role_oids':entries[-1]['role_oids']}

 @classmethod
 def tearDownClass(cls):
  cls.tmp.cleanup()

 @classmethod
 def sign(cls,purpose,input_path,output_path):
  command(['openssl','pkeyutl','-sign','-inkey',str(cls.keys[purpose]),
   '-rawin','-in',str(input_path),'-out',str(output_path)])
  return output_path

 @classmethod
 def transport_for(cls,stage,index):
  raw=cls.db.sql(stage)(c.snapshot_statement(True),{})
  packets=[json.loads(line) for line in raw.splitlines()]
  for packet in packets:
   packet['pid']=5000+index
   packet['snapshot']=str(100+index)+':'+str(100+index)+':'
  return '\n'.join(json.dumps(packet,sort_keys=True,
   separators=(',',':')) for packet in packets)

 def validate(self,stage,manifest_path=None,manifest_sha=None,
    file_map_path=None,now=None,baseline_sha=None,target=None,
    collector_pin=None,witness_pin=None,gate_start=None):
  manifest,sha=self.manifests[stage]
  with patch.object(c,'STAGE_PATHS',self.refs):
   return h.validate_history(
    manifest_path or manifest,file_map_path or self.maps[stage],
    manifest_sha or sha,stage,target or self.target,self.refs,
    c.sha(Path(c.__file__).read_bytes()),
    collector_pin or self.trust['collector']['digest'],
    witness_pin or self.trust['witness']['digest'],
    gate_start or self.gate_start.isoformat().replace('+00:00','Z'),
    now=now or self.now,
    approved_baseline_sha256=baseline_sha or self.artifacts[0]['collection_sha256'],
    approved_operator_id='TEST_OPERATOR_HUMAN',
    approved_custodian_id='TEST_INDEPENDENT_CUSTODIAN_HUMAN',
    approved_witness_id=self.trust['witness']['record']['witness_id'])

 def auth(self,stage):
  return {'historical_manifest_sha256':self.manifests[stage][1],
   'historical_root_collection_sha256':self.artifacts[0]['collection_sha256'],
   'catalog_collector_sha256':c.sha(Path(c.__file__).read_bytes()),
   'not_before_utc':self.gate_start.isoformat().replace('+00:00','Z'),
   'authorization_id':'SYNTHETIC_GATE_A_NOT_REAL',
   'operator':'TEST_OPERATOR_HUMAN',
   'evidence_custodian':'TEST_INDEPENDENT_CUSTODIAN_HUMAN',
   'independent_verifier':self.trust['witness']['record']['witness_id']}

 def pin(self,path,label):
  if path==runner.RECOVERY_COLLECTOR_PIN:
   return self.trust['collector']['digest']
  if path==runner.RECOVERY_WITNESS_PIN:
   return self.trust['witness']['digest']
  raise runner.Stop('NO_OTHER_TEST_PIN')

 def signed_gate(self,stage,proof=None):
  with patch.object(c,'STAGE_PATHS',self.refs),patch.object(
      runner,'pin',side_effect=self.pin):
   return runner.authenticated_history_gate(
    PHASES[stage],self.auth(stage),proof or self.proofs[stage],
    self.manifests[stage][0],self.maps[stage])

 def test_valid_corporate_pinned_ed25519_chain_s0_s5(self):
  for stage in c.STAGES:
   with self.subTest(stage=stage):
    result=self.validate(stage)
    self.assertEqual(result['stage'],stage)
    self.assertEqual(result['prior_role_oids'],self.proofs[stage]['prior_role_oids'])
    self.assertEqual(result['previous_stage'],self.proofs[stage]['anchor_stage'])
    self.assertEqual(result['predecessor_collection_sha256'],
     self.proofs[stage]['previous_collection_sha256'])
    self.assertEqual(result['predecessor_witness_sha256'],
     self.proofs[stage]['witness_evidence_sha256'])
    self.assertEqual(len(result['collection_ids']),int(stage[1:])+1)
    self.assertEqual(self.signed_gate(stage),result)

 def test_replay_one_snapshot_and_stale_collector_source_fail(self):
  # An unchanged original signed transport cannot be recycled as today's
  # collection, even when its catalog is semantically correct.
  prior=self.validate('S0')
  original=json.loads(self.artifacts[0]['collection_path'].read_bytes())
  with patch.object(runner,'psql',return_value=original['transport_jsonl']):
   with self.assertRaisesRegex(runner.Stop,'REPLAY_OR_STAGE'):
    runner.live_database_phase_state({},
     'prepare-security',continuity=self.proofs['S0'],
     authenticated_history=prior)
  # An unrelated collector source is not approved by a plausible SHA alone.
  with patch.object(c,'STAGE_PATHS',self.refs),self.assertRaisesRegex(
      ValueError,'COLLECTION_ORIGINAL_IDENTITY'):
   h.validate_history(self.manifests['S0'][0],self.maps['S0'],
    self.manifests['S0'][1],'S0',self.target,self.refs,'0'*64,
    self.trust['collector']['digest'],self.trust['witness']['digest'],
    self.auth('S0')['not_before_utc'],
    now=self.now,approved_baseline_sha256=self.artifacts[0]['collection_sha256'],
    approved_operator_id='TEST_OPERATOR_HUMAN',
    approved_custodian_id='TEST_INDEPENDENT_CUSTODIAN_HUMAN',
    approved_witness_id=self.trust['witness']['record']['witness_id'])

 def test_runner_blocks_missing_corporate_trust_before_sql(self):
  with patch.object(runner,'pin',return_value='HOLD'),patch.object(
     c,'STAGE_PATHS',self.refs):
   with self.assertRaises(runner.Stop):
    runner.authenticated_history_gate('prepare-security',self.auth('S0'),
     self.proofs['S0'],self.manifests['S0'][0],self.maps['S0'])

 def test_actual_runner_reaches_writer_only_after_real_authenticated_history(self):
  for phase,stage in fx.PHASES:
   with self.subTest(stage=stage):
    with tempfile.TemporaryDirectory() as td:
     d=Path(td)
     role_file=d/'continuity.json'
     save_json(role_file,self.proofs[stage])
     argv=['test-only-runner',phase,'--journal',str(d/'journal.jsonl'),
      '--role-continuity-evidence',str(role_file),
      '--historical-manifest',str(self.manifests[stage][0]),
      '--historical-file-map',str(self.maps[stage]),
      '--authorization-artifact',str(d/'auth.json'),
      '--recovery-evidence',str(d/'recovery.json'),
      '--snapshot-detail-readback',str(d/'filemap.json')]
     for name in ('auth.json','recovery.json','filemap.json'):
      (d/name).write_text('{"synthetic":true}')
     calls=[]
     def sql(q,e):
      calls.append(q)
      return self.db.sql(stage)(q,e)
     with contextlib.ExitStack() as stack:
      stack.enter_context(patch.object(c,'STAGE_PATHS',self.refs))
      stack.enter_context(patch.object(runner,'pin',side_effect=self.pin))
      stack.enter_context(patch.object(runner,'auth_artifact',
       return_value=self.auth(stage)))
      stack.enter_context(patch.object(runner,'recovery_evidence',
       return_value={'recovery_hash':'a'*64}))
      stack.enter_context(patch.object(runner,'clean_worktree'))
      stack.enter_context(patch.object(runner,'control_plane_live',
       return_value={'captured_at_utc':'SYNTHETIC'}))
      stack.enter_context(patch.object(runner,'env_for',return_value={}))
      stack.enter_context(patch.object(runner,'sql_attest',
       return_value='TEST_IDENTITY'))
      stack.enter_context(patch.object(runner,'psql',side_effect=sql))
      stack.enter_context(patch.object(runner,'empty'))
      stack.enter_context(patch.object(runner,'ledger'))
      stack.enter_context(patch.object(sys,'argv',argv))
      if stage=='S5':
       self.assertEqual(runner.main(),0)
      else:
       with self.assertRaisesRegex(AssertionError,'MUTATING_SQL_FORBIDDEN'):
        runner.main()
     self.assertTrue(any(q.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ')
      for q in calls))
     events=[json.loads(line) for line in (d/'journal.jsonl').read_text().splitlines()]
     self.assertTrue(any(e['event']=='authenticated_predecessor_verified'
      for e in events))
     self.assertTrue(any(e['event']=='role_oid_forensic_observation'
      for e in events))

 def test_wrong_target_stage_and_pinned_root_fail(self):
  for stage in ('S0','S2','S5'):
   with self.subTest(stage=stage):
    other=dict(self.target,branch_id='br-other-incompatible-branch')
    with self.assertRaisesRegex(ValueError,'HISTORY_SCOPE'):
     self.validate(stage,target=other)
    with self.assertRaisesRegex(ValueError,'BASELINE_NOT_INDEPENDENTLY_APPROVED'):
     self.validate(stage,baseline_sha='f'*64)
    manifest=json.loads(self.manifests[stage][0].read_bytes())
    manifest['records'][-1]['stage']='S4' if stage!='S5' else 'S0'
    with tempfile.TemporaryDirectory() as td:
     path=Path(td)/'manifest.json'
     digest=save_json(path,manifest)
     with self.assertRaisesRegex(ValueError,'HISTORY_ORDER_INVALID'):
      self.validate(stage,manifest_path=path,manifest_sha=digest)

 def test_wrong_sha_missing_collection_and_changed_bytes_fail(self):
  with tempfile.TemporaryDirectory() as td:
   d=Path(td)
   manifest=json.loads(self.manifests['S1'][0].read_bytes())
   manifest['records'][-1]['collection_sha256']='f'*64
   bad_manifest=d/'manifest.json'
   digest=save_json(bad_manifest,manifest)
   with self.assertRaisesRegex(ValueError,'EVIDENCE_BYTES_CHANGED'):
    self.validate('S1',manifest_path=bad_manifest,manifest_sha=digest)
   filemap=json.loads(self.maps['S1'].read_bytes())
   filemap['records'][-1]['collection']=str(d/'missing.json')
   m=d/'map.json';save_json(m,filemap)
   with self.assertRaisesRegex(ValueError,'EVIDENCE_UNAVAILABLE'):
    self.validate('S1',file_map_path=m)
   filemap['records'][-1]['collection']=str(self.artifacts[1]['collection_path'])
   corrupted=d/'changed.json'
   corrupted.write_bytes(self.artifacts[1]['collection_path'].read_bytes()+b' ')
   filemap['records'][-1]['collection']=str(corrupted)
   save_json(m,filemap)
   with self.assertRaisesRegex(ValueError,'EVIDENCE_BYTES_CHANGED'):
    self.validate('S1',file_map_path=m)

 def test_signature_forgery_untrusted_key_and_self_issued_trust_fail(self):
  with self.assertRaisesRegex(ValueError,'UNAPPROVED_CORPORATE_TRUST_PIN'):
   self.validate('S0',witness_pin='0'*64)
  with tempfile.TemporaryDirectory() as td:
   d=Path(td)
   manifest=json.loads(self.manifests['S0'][0].read_bytes())
   filemap=json.loads(self.maps['S0'].read_bytes())
   forged=d/'forged-witness.sig'
   forged.write_bytes(bytes(64))
   manifest['records'][0]['witness_signature_sha256']=c.sha(forged.read_bytes())
   filemap['records'][0]['witness_signature']=str(forged)
   m=d/'manifest.json';fm=d/'map.json'
   digest=save_json(m,manifest);save_json(fm,filemap)
   with self.assertRaisesRegex(ValueError,'SIGNATURE_INVALID'):
    self.validate('S0',manifest_path=m,manifest_sha=digest,file_map_path=fm)
  # An operator-supplied key cannot replace a protected corporate pin.
  with self.assertRaisesRegex(ValueError,'UNAPPROVED_CORPORATE_TRUST_PIN'):
   self.validate('S0',collector_pin='f'*64)

 def test_stale_future_chronology_and_replayed_predecessor_fail(self):
  with self.assertRaisesRegex(ValueError,'HISTORY_PREDECESSOR_STALE'):
   self.validate('S0',now=self.now+dt.timedelta(days=2))
  with self.assertRaisesRegex(ValueError,'COLLECTION_IN_FUTURE'):
   self.validate('S0',now=self.now-dt.timedelta(minutes=90),
    gate_start=(self.now-dt.timedelta(minutes=95)).isoformat().replace('+00:00','Z'))
  with tempfile.TemporaryDirectory() as td:
   d=Path(td)
   manifest=json.loads(self.manifests['S1'][0].read_bytes())
   manifest['records'][1]=copy.deepcopy(manifest['records'][0])
   manifest['records'][1]['stage']='S0'
   p=d/'replayed.json';digest=save_json(p,manifest)
   files=json.loads(self.maps['S1'].read_bytes())
   files['records'][1]['collection']=files['records'][0]['collection']
   locations=d/'replay-path.json';save_json(locations,files)
   with self.assertRaisesRegex(ValueError,'HISTORY_REPLAY_OR_CHAIN_BREAK|HISTORY_ORDER_INVALID'):
    self.validate('S1',manifest_path=p,manifest_sha=digest,file_map_path=locations)

 def test_continuity_fake_prior_map_and_stage_mismatch_rejected(self):
  fake=copy.deepcopy(self.proofs['S2'])
  fake['prior_role_oids']['neondb_owner']='999999'
  with self.assertRaisesRegex(runner.Stop,'CONTINUITY_CLAIMS_NOT_DERIVED'):
   self.signed_gate('S2',fake)
  fake=copy.deepcopy(self.proofs['S1'])
  fake['anchor_stage']='S4'
  with self.assertRaisesRegex(runner.Stop,'CONTINUITY_CLAIMS_NOT_DERIVED'):
   self.signed_gate('S1',fake)
  unrelated=copy.deepcopy(self.proofs['S1'])
  unrelated['branch_id']='br-unapproved'
  with self.assertRaisesRegex(runner.Stop,'CONTINUITY_CLAIMS_NOT_DERIVED|CONTINUITY'):
   self.signed_gate('S1',unrelated)

if __name__=='__main__':
 unittest.main()
