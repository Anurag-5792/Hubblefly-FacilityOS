"""Recovery V2 enforcement inside the actual bootstrap runner, synthetic I/O only."""
import contextlib
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools import hft_neon_staging_bootstrap as runner
from tools import hft_neon_recovery_v2 as v2

FIXTURE_SPEC=importlib.util.spec_from_file_location('hft026_fixture',
 Path(__file__).with_name('test_hft_neon_recovery_v2.py'))
FIXTURE=importlib.util.module_from_spec(FIXTURE_SPEC)
FIXTURE_SPEC.loader.exec_module(FIXTURE)

class RunnerEnforcement(unittest.TestCase):
 def setUp(self):
  self.f=FIXTURE.RecoveryV2Contract('test_positive_actual_test_signature')
  self.f.setUp()
  self.addCleanup(self.f.doCleanups)
  self.tmp=tempfile.TemporaryDirectory(prefix='hft026-main-')
  self.addCleanup(self.tmp.cleanup)
  self.dir=Path(self.tmp.name)
  self.source=runner.sha((runner.ROOT/'tools/hft_neon_recovery_v2.py').read_bytes())
  self.orig_pin=runner.pin
 def materialize(self):
  self.manifest=self.dir/'v2.json'
  self.manifest.write_bytes(v2.normalized(self.f.e))
  self.mapping=self.dir/'map.json'
  self.mapping.write_bytes(v2.normalized(self.f.files))
  self.auth={'authorization_id':'HFT-R1-SYNTHETIC-AUTH-NOT-REAL',
   'operator':'Test Human Operator','evidence_custodian':'Test Human Custodian',
   'independent_verifier':'Test Different Human Verifier',
   'recovery_validator_sha256':self.source,
   'catalog_collector_sha256':runner.sha((runner.ROOT/'tools/hft_c028_catalog.py').read_bytes()),
   'recovery_evidence_sha256':runner.sha(self.manifest.read_bytes()),
   'expires_at_utc':self.f.ts(60)}
  self.live={'all_endpoints':[self.f.targets['restore_b_endpoint']],'production_branch':{'id':v2.PRODUCTION_ID}}
  self.auth_file=self.dir/'auth.json';self.auth_file.write_text('{}')
  self.journal=self.dir/'journal.jsonl'
 def api(self,path):
  base='/api/v2/projects/'+runner.PROJECT+'/branches/'
  if path==base+self.f.e['preservation']['branch_id']:
   return {'branch':self.f.provider['branch']}
  if path==base+self.f.e['restore_a']['target_id']:
   return {'branch':self.f.targets['restore_a_branch']}
  if path==base+self.f.e['restore_b']['recovery_branch_id']:
   return {'branch':self.f.targets['restore_b_branch']}
  if path==base+self.f.e['restore_b']['recovery_branch_id']+'/databases':
   return {'databases':self.f.targets['restore_b_databases']}
  raise AssertionError('UNEXPECTED_API_PATH')
 def pin(self,path,label):
  if path==runner.RECOVERY_WITNESS_PIN:return self.f.trust_sha
  if path==runner.RECOVERY_COLLECTOR_PIN:return self.f.collector_trust_sha
  return self.orig_pin(path,label)
 def recovery(self,approval=True):
  self.materialize()
  with patch.object(runner,'pin',side_effect=self.pin):
   return runner.recovery_evidence(self.manifest,
     self.auth if approval else None,self.live,self.mapping,getter=self.api)
 def test_actual_recovery_source_requires_all_signed_evidence(self):
  out=self.recovery()
  self.assertEqual(out['schema'],v2.SCHEMA)
  self.assertEqual(out['recovery_hash'],runner.sha(self.manifest.read_bytes()))
 def test_actual_recovery_source_sha_change_invalidates_gate_a(self):
  self.materialize();self.auth['recovery_validator_sha256']='0'*64
  with patch.object(runner,'pin',side_effect=self.pin),self.assertRaisesRegex(
   runner.Stop,'SOURCE_HASH_NOT_AUTHORIZED'):
   runner.recovery_evidence(self.manifest,self.auth,self.live,self.mapping,getter=self.api)
 def test_actual_recovery_hash_mismatch_invalidates_gate_a(self):
  self.materialize();self.auth['recovery_evidence_sha256']='0'*64
  with patch.object(runner,'pin',side_effect=self.pin),self.assertRaisesRegex(
   runner.Stop,'MASTER_AUTHORIZATION_HASH_MISMATCH'):
   runner.recovery_evidence(self.manifest,self.auth,self.live,self.mapping,getter=self.api)
 def test_actual_recovery_gate_a_must_fit_full_validity_window(self):
  self.materialize();self.auth['expires_at_utc']=self.f.ts(5000)
  with patch.object(runner,'pin',side_effect=self.pin),self.assertRaisesRegex(
   runner.Stop,'RESOURCE_OR_EVIDENCE_DOES_NOT_COVER_GATE_A'):
   runner.recovery_evidence(self.manifest,self.auth,self.live,self.mapping,getter=self.api)
 def catalog(self,post):
  return {'schema_exists':post,'ledger_exists':post,
   'non_system_user_objects':8 if post else 0,
   'migration_role_exists':post,'creator_default_restricted':post,
   'schema_owner':runner.MIG if post else None,
   'required_catalog_present':post}
 def read_sql(self,sql,post,drift=False):
  # Emulate the real C032 single-backend snapshot envelope, rather than the
  # superseded C028 multi-transaction transport.
  from tools import hft_c028_catalog as catalog
  if not sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'):
   raise AssertionError('DDL_WAS_ATTEMPTED')
  if sql.count('ROLLBACK;')!=1 or any(catalog.SQL[k] not in sql for k in catalog.CATEGORIES):
   raise AssertionError('INCOMPLETE_SNAPSHOT')
  spec=importlib.util.spec_from_file_location('hft_c030_fixture',
   Path(__file__).with_name('test_hft_c030_phase_transitions.py'))
  module=importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  rows=module.FakePg18().snapshots['S3' if post else 'S0']
  def frame(kind,data):
   return json.dumps({'kind':kind,'pid':875,'snapshot':'9:9:',
    'database':runner.DB,'db_user':runner.OWNER,
    'session_user':runner.OWNER,'version':runner.PGNUM,
    'isolation':'repeatable read','read_only':'on','data':data},
    separators=(',',':'))
  packets=[frame('phase',self.catalog(post))]
  if post:
   revisions=[{'version':v,'sha256':h} for v,_,h in runner.MIGS]
   if drift:revisions[2]['sha256']='f'*64
   packets.append(frame('revision',revisions))
  packets.extend(frame(k,rows[k]) for k in catalog.CATEGORIES)
  return '\n'.join(packets)
 def test_live_catalog_classifies_empty_and_post_exact_state(self):
  # Reuse synthetic PG responses but DO NOT patch the catalog classifier.
  spec=importlib.util.spec_from_file_location('hft_c030_stages',
   Path(__file__).with_name('test_hft_c030_phase_transitions.py'))
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  case=module.C030Lifecycle('test_complete_sequential_s0_to_s5_positive')
  case.setUp()
  try:
   self.assertEqual(case.classify('prepare-security','S0'),'S0')
   self.assertEqual(case.classify('finalize-owner','S3'),'S3')
   self.assertEqual(case.classify('verify-final-dba','S5'),'S5')
  finally:case.doCleanups()
 def test_live_catalog_rejects_invalid_revision(self):
  with patch.object(runner,'psql',side_effect=lambda q,e:self.read_sql(q,True,True)):
   with self.assertRaisesRegex(runner.Stop,'PHASE_CANONICAL_REVISION_MISMATCH'):
    runner.live_database_phase_state({},'finalize-dba')
 def test_live_catalog_rejects_migration_role_not_created(self):
  with patch.object(runner,'psql',side_effect=lambda q,e:self.read_sql(q,False)),patch.object(runner.c028_catalog,'verify_prebootstrap',return_value='0'*64):
   with self.assertRaisesRegex(runner.Stop,'PHASE_MIGRATION_ROLE_NOT_CREATED'):
    runner.live_database_phase_state({},'prepare-migration-owner')
 def invoke(self,phase,post=False,only_recovery=False,catalog_failure=None):
  self.materialize()
  queried=[]
  # Test-only target-local ancestry, never a witnessed approval.
  spec=importlib.util.spec_from_file_location('hft_c030_continuity',
   Path(__file__).with_name('test_hft_c030_phase_transitions.py'))
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  source=module.FakePg18()
  stage=dict(module.PHASES).get(phase,'S0')
  idx=int(stage[1:])
  before='S0' if idx==0 else 'S'+str(idx-1)
  oid_proof={'schema':runner.c028_catalog.ROLE_CONTINUITY_SCHEMA,
   'stage':stage,'project_id':runner.PROJECT,
   'branch_id':runner.BRANCH,'database':runner.DB,
   'anchor_stage':'S0_BASELINE' if idx==0 else before,
   'previous_collection_sha256':'a'*64,
   'witness_evidence_sha256':'b'*64,
   'collector_source_sha256':runner.c028_catalog.sha(
    (runner.ROOT/'tools/hft_c028_catalog.py').read_bytes()),
   'prior_role_oids':{r['id']:r['role_oid']
    for r in source.snapshots[before]['role_census']}}
  continuity_file=self.dir/'role-continuity.synthetic.json'
  continuity_file.write_text(json.dumps(oid_proof))
  history_file=self.dir/'historical-manifest.synthetic.json'
  history_file.write_text('{"synthetic":"not for approvals"}')
  history_map=self.dir/'historical-files.synthetic.json'
  history_map.write_text('{"synthetic":"not for approvals"}')

  def sql(q,env):
   queried.append(q)
   return self.read_sql(q,post)
  with contextlib.ExitStack() as stack:
   # Legacy runner rejection test: keep the exact mutation boundary, but
   # patch the current verify_stage interface, never the retired C028 gates.
   if catalog_failure in ('pre','post'):
    stack.enter_context(patch.object(runner.c028_catalog,'verify_stage',
     side_effect=ValueError('C028_CATALOG_STAGE_UNAPPROVED')))
   else:
    stack.enter_context(patch.object(runner.c028_catalog,'verify_stage',
     return_value='0'*64))
   stack.enter_context(patch.object(runner,'pin',side_effect=self.pin))
   stack.enter_context(patch.object(runner,'clean_worktree'))
   stack.enter_context(patch.object(runner,'control_plane_live',return_value=self.live))
   stack.enter_context(patch.object(runner,'_get',
    side_effect=lambda path,token:self.api(path)))
   # Recovery-specific legacy tests do not exercise history signatures;
   # C039 acceptance does so through real verifier and runner gate.
   stack.enter_context(patch.object(runner,'authenticated_history_gate',
    return_value={'stage':stage,'collection_ids':[],
     'manifest_sha256':'a'*64,'predecessor_collection_sha256':'b'*64,
     'root_collection_sha256':'c'*64,'predecessor_witness_sha256':'d'*64,
     'collector_source_sha256':runner.c028_catalog.sha(
      (runner.ROOT/'tools/hft_c028_catalog.py').read_bytes())}))
   stack.enter_context(patch.object(runner,'auth_artifact',
    side_effect=AssertionError('NO_GATE_A_REQUIRED') if only_recovery else None,
    return_value=None if only_recovery else self.auth))
   stack.enter_context(patch.object(runner,'env_for',
    side_effect=AssertionError('NO_SQL_FOR_GATE_R') if only_recovery else None,
    return_value=None if only_recovery else {}))
   stack.enter_context(patch.object(runner,'sql_attest',return_value='SYNTHETIC_IDENTITY'))
   stack.enter_context(patch.object(runner,'psql',side_effect=sql))
   stack.enter_context(patch.object(runner,'journal'))
   stack.enter_context(patch.object(runner,'empty'))
   stack.enter_context(patch.object(runner,'ledger'))
   argv=['runner',phase,'--role-continuity-evidence',str(continuity_file),
    '--historical-manifest',str(history_file),
    '--historical-file-map',str(history_map),
    '--recovery-evidence',str(self.manifest),
    '--snapshot-detail-readback',str(self.mapping),'--journal',str(self.journal)]
   if not only_recovery:argv.extend(['--authorization-artifact',str(self.auth_file)])
   stack.enter_context(patch('sys.argv',argv))
   if only_recovery:self.assertEqual(runner.main(),0)
   else:
    with self.assertRaises((runner.Stop,AssertionError)):runner.main()
  return queried
 def test_gate_r_read_only_checks_without_later_gate_a_or_sql(self):
  self.assertEqual(self.invoke('verify-recovery-v2',only_recovery=True),[])
 def test_all_five_mutating_phases_refuse_incompatible_live_state(self):
  for phase,post in [('prepare-security',True),
   ('prepare-migration-owner',True),('migrate',True),
   ('finalize-owner',False),('finalize-dba',False)]:
   with self.subTest(phase=phase):
    rows=self.invoke(phase,post=post)
    self.assertTrue(rows)
    self.assertTrue(all(q.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;') for q in rows))
 def test_actual_runner_denies_rogue_function_before_bootstrap_mutation(self):
  queries=self.invoke('prepare-security',post=False,catalog_failure='pre')
  self.assertTrue(queries)
  self.assertTrue(all(q.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;') for q in queries))
 def test_actual_runner_denies_exact_v6_extra_or_missing_catalog(self):
  for phase in ('finalize-owner','finalize-dba'):
   with self.subTest(phase=phase):
    queries=self.invoke(phase,post=True,catalog_failure='post')
    self.assertTrue(queries)
    self.assertTrue(all(q.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;') for q in queries))
 def test_provider_and_evidence_failures_reach_no_postgres_sql(self):
  originals=(copy.deepcopy(self.f.e),copy.deepcopy(self.f.provider),
   copy.deepcopy(self.f.targets),
   {k:Path(v).read_bytes() for k,v in self.f.files.items()})
  bad_cases=[
   ('missing preservation',lambda:setattr(self.f,'provider',{'branch':None,'endpoints':[],'verified_at':self.f.ts(-2)})),
   ('production parent',lambda:self.f.e['preservation'].update(parent_id=v2.PRODUCTION_ID)),
   ('wrong parent LSN',lambda:self.f.e['preservation'].update(parent_lsn='2/AB')),
   ('Recovery A fork mismatch',lambda:self.f.targets['restore_a_branch'].update(parent_lsn='2/BEEF')),
   ('preservation provider failed',lambda:self.f.provider['branch'].update(current_state='failed')),
   ('Recovery B scheduled expired',lambda:self.f.targets['restore_b_branch'].update(expires_at=self.f.ts(-2))),
   ('Recovery B host belongs to staging',lambda:self.f.targets['restore_b_endpoint'].update(branch_id=v2.STAGING)),
   ('false indefinite',lambda:self.f.e['preservation']['retention'].update(mode='INDEFINITE')),
   ('expired preservation',lambda:self.f.e['preservation']['retention'].update(expires_at=self.f.ts(-2))),
   ('tampered dump',lambda:Path(self.f.files['dump']).write_bytes(b'PGDMP tampered')),
   ('modified dump list',lambda:Path(self.f.files['dump_list']).write_bytes(b'fake')),
   ('ACL inventory altered',lambda:Path(self.f.files['inventory']).write_bytes(b'{}')),
   ('restore failed',lambda:self.f.e['restore_b'].update(status='FAILED')),
   ('production recovery A',lambda:self.f.e['restore_a'].update(target_id=v2.PRODUCTION_ID)),
   ('staging recovery B',lambda:self.f.e['restore_b'].update(recovery_branch_id=v2.STAGING)),
   ('missing witness',lambda:Path(self.f.files['witness_signature']).unlink()),
   ('missing independently observed catalog',lambda:Path(self.f.files['restore_b_catalog']).unlink()),
   ('missing independent collector signature',lambda:Path(self.f.files['restore_b_acl_collector_signature']).unlink())]
  for label,action in bad_cases:
   with self.subTest(label=label):
    self.f.e=copy.deepcopy(originals[0]);self.f.provider=copy.deepcopy(originals[1])
    self.f.targets=copy.deepcopy(originals[2])
    for name,path in self.f.files.items():Path(path).write_bytes(originals[3][name])
    action()
    self.assertEqual(self.invoke('prepare-security'),[])
if __name__=='__main__':unittest.main()
