"""C030 S0-S5 real classifier and runner source-only lifecycle.

Only PostgreSQL I/O is synthetic; verify_stage(), collect(), role-SQL
derivation, phase checks, and actual staging runner main() are NOT mocked.
"""
from __future__ import annotations
import contextlib,copy,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from tools import hft_c028_catalog as c
from tools import hft_neon_staging_bootstrap as runner

PHASES=(('prepare-security','S0'),('prepare-migration-owner','S1'),
 ('migrate','S2'),('finalize-owner','S3'),('finalize-dba','S4'),
 ('verify-final-dba','S5'))
class FakePg18:
 def __init__(self):
  self.roles,self.members=c.source_role_contract()
  self.refs={}
  self.snapshots={}
  for stage in c.STAGES:
   rows={category:[] for category in c.CATEGORIES}
   rows['schemas']=[{'id':'public'}]
   if stage!='S0':
    rows['roles']=[{'id':x,'rolsuper':False,'rolcreatedb':False,
      'rolcreaterole':False,'rolreplication':False,'rolbypassrls':False}
      for x in sorted(self.roles)]
    rows['memberships']=[{'id':x,'admin_option':False,
      'inherit_option':True,'set_option':False} for x in sorted(self.members)]
    rows['database_grants']=[{'id':'hft_staging_migration_owner:neondb',
      'can_create':stage!='S5','can_connect':True},
      {'id':'hft_staging_app_runtime:neondb','can_create':False,'can_connect':True}]
    rows['schema_grants']=[{'id':'hft_staging_migration_owner:public',
      'can_create':False}]
   if stage not in ('S0','S1'):
    rows['default_privileges']=[{'id':'hft_staging_migration_owner:f:GLOBAL',
       'acl':'NO_PUBLIC_EXECUTE'}]
   if stage in ('S3','S4','S5'):
    rows['schemas']=[{'id':'hft'},{'id':'public'}]
    rows['relations']=[{'id':'hft.schema_revision'},{'id':'hft.stock_entry'}]
    rows['columns']=[{'id':'hft.stock_entry.id','type':'uuid'}]
    rows['functions']=[{'id':'hft.deny_fact_mutation()'}]
    rows['triggers']=[{'id':'hft.stock_entry.no_stock_entry_change'}]
    rows['constraints']=[{'id':'hft.stock_entry_pkey@stock_entry'}]
    rows['indexes']=[{'id':'hft.stock_entry_pkey'}]
    rows['function_grants']=[{'id':'hft_staging_migration_owner:hft.deny_fact_mutation()',
       'can_execute':stage=='S3'}]
    rows['effective_grants']=[{'id':'hft_r1_audit_verify:hft.schema_revision',
       'can_select':stage in ('S4','S5')}]
   for category in c.CATEGORIES:rows[category].sort(key=lambda x:x['id'])
   self.snapshots[stage]=rows
 def sql(self,stage):
  rows=self.snapshots[stage]
  post=stage in ('S3','S4','S5')
  def respond(statement,environment):
   if 'json_build_object(' in statement and "'schema_exists'" in statement:
    return json.dumps({'schema_exists':post,'ledger_exists':post,
     'non_system_user_objects':8 if post else 0,
     'migration_role_exists':stage!='S0',
     'creator_default_restricted':stage not in ('S0','S1'),
     'schema_owner':runner.MIG if post else None,
     'required_catalog_present':post})
   if 'json_agg(json_build_object(' in statement and 'FROM hft.schema_revision' in statement:
    return json.dumps([{'version':v,'sha256':h} for v,_,h in runner.MIGS])
   if 'SELECT COALESCE(json_agg(row_to_json(x)' in statement:
    for category in c.CATEGORIES:
     if c.SQL[category] in statement:
      return json.dumps(rows[category])
    raise AssertionError('UNKNOWN_CANONICAL_CATALOG_CATEGORY')
   if statement.startswith("SELECT (to_regnamespace('hft')"):
    return 'true|true|0' if not post else 'false|false|8'
   if statement.startswith("SELECT version::text||'|'||sha256 FROM hft.schema_revision"):
    return '\n'.join(f'{v}|{h}' for v,_,h in runner.MIGS)
   if statement.startswith('WITH pex AS'):
    return f'{runner.MIG}|false|false|false|true|true|0|0|0|0'
   raise AssertionError('MUTATING_SQL_FORBIDDEN '+statement[:45])
  return respond
class C030Lifecycle(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='hft-c030-')
  self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name)
  self.db=FakePg18()
  self.refpaths={}
  for stage in c.STAGES:
   path=self.root/(stage+'.sha256')
   path.write_text(c.sha(c.canonical(self.db.snapshots[stage]))+'\n')
   self.refpaths[stage]=path
 def approved(self):
  return patch.object(c,'STAGE_PATHS',self.refpaths)
 def classify(self,phase,stage):
  with self.approved(),patch.object(runner,'psql',
    side_effect=self.db.sql(stage)):
   return runner.live_database_phase_state({},phase)
 def test_complete_sequential_s0_to_s5_positive(self):
  for phase,stage in PHASES:
   with self.subTest(stage=stage):
    self.assertEqual(self.classify(phase,stage),stage)
  self.assertEqual(len(set(c.approved_stage_references(self.refpaths).values())),6)
 def test_authorized_transition_source_is_existing_reviewed_sql(self):
  roles,members=c.source_role_contract()
  self.assertEqual(roles,{x['id'] for x in self.db.snapshots['S1']['roles']})
  self.assertEqual(members,{x['id'] for x in self.db.snapshots['S1']['memberships']})
  bundle=c.stage_reference_bundle(self.refpaths)
  self.assertEqual(len(bundle),64)
  for p in c.TRANSITION_SOURCES:self.assertTrue(p.is_file())
 def test_skipped_repeated_premature_phase_denied(self):
  for phase,required in PHASES:
   for wrong in c.STAGES:
    if wrong==required:continue
    with self.subTest(phase=phase,actual=wrong),self.assertRaises(
      (runner.Stop,ValueError)):
     self.classify(phase,wrong)
 def test_extra_hft_role_and_membership_denied(self):
  for stage,category,value in (
    ('S1','roles',{'id':'hft_unauthorized_role'}),
    ('S2','memberships',{'id':'hft_staging_app_runtime->hft_engineering',
      'admin_option':False,'inherit_option':True,'set_option':False}),
    ('S0','roles',{'id':'hft_rogue'})):
   with self.subTest(stage=stage,category=category):
    self.db.snapshots[stage][category].append(value)
    with self.assertRaisesRegex((ValueError,runner.Stop),
      'CATALOG|ROLE|MEMBERSHIP'):
     self.classify(dict((s,p) for p,s in PHASES)[stage],stage)
    self.db.snapshots[stage][category].remove(value)
 def test_approved_role_and_membership_required(self):
  for category in ('roles','memberships'):
   row=self.db.snapshots['S1'][category].pop()
   with self.assertRaises((ValueError,runner.Stop)):
    self.classify('prepare-migration-owner','S1')
   self.db.snapshots['S1'][category].append(row)
   self.db.snapshots['S1'][category].sort(key=lambda x:x['id'])
 def test_privilege_and_creator_default_drift_denied(self):
  for stage,category,mutation in (
    ('S1','database_grants',{'id':'hft_staging_app_runtime:neondb',
      'can_create':True,'can_connect':True}),
    ('S1','schema_grants',{'id':'hft_staging_app_runtime:public',
      'can_create':True}),
    ('S2','default_privileges',{'id':'hft_staging_migration_owner:f:GLOBAL',
      'acl':'PUBLIC_EXECUTE'}),
    ('S3','function_grants',{'id':'hft_staging_migration_owner:hft.deny_fact_mutation()',
      'can_execute':False}),
    ('S4','effective_grants',{'id':'hft_r1_audit_verify:hft.schema_revision',
      'can_select':False}),
    ('S5','database_grants',{'id':'hft_staging_migration_owner:neondb',
      'can_create':True,'can_connect':True})):
   with self.subTest(stage=stage,category=category):
    before=copy.deepcopy(self.db.snapshots[stage][category])
    self.db.snapshots[stage][category][0]=mutation
    with self.assertRaises((ValueError,runner.Stop)):
     self.classify(dict((s,p) for p,s in PHASES)[stage],stage)
    self.db.snapshots[stage][category]=before
 def test_rogue_user_object_added_between_phases_denied(self):
  for stage in ('S0','S1','S2','S3','S4','S5'):
   category='functions'
   rogue={'id':'public.unauthorized_writer()'}
   self.db.snapshots[stage][category].append(rogue)
   self.db.snapshots[stage][category].sort(key=lambda x:x['id'])
   with self.assertRaises((ValueError,runner.Stop)):
    self.classify(dict((s,p) for p,s in PHASES)[stage],stage)
   self.db.snapshots[stage][category].remove(rogue)
 def test_extra_or_missing_column_and_sequence_rejected(self):
  for category,new in (('columns',{'id':'hft.stock_entry.rogue'}),
   ('sequence_settings',{'id':'hft.rogue_seq','increment_by':100})):
   self.db.snapshots['S3'][category].append(new)
   with self.assertRaises((ValueError,runner.Stop)):
    self.classify('finalize-owner','S3')
   self.db.snapshots['S3'][category].remove(new)
 def test_wrong_reference_fingerprint_and_hold_denied(self):
  self.refpaths['S4'].write_text('HOLD\n')
  with self.assertRaisesRegex(runner.Stop,'PHASE_S4_CATALOG_NOT_QUALIFIED'):
   self.classify('finalize-dba','S4')
  self.refpaths['S4'].write_text('0'*64+'\n')
  with self.assertRaises((ValueError,runner.Stop)):
   self.classify('finalize-dba','S4')
 def test_missing_reference_and_stale_transition_sql_source_denied(self):
  self.refpaths['S2'].unlink()
  with self.assertRaisesRegex(ValueError,'STAGE_REFERENCE_UNAVAILABLE'):
   c.stage_reference_bundle(self.refpaths)
  self.refpaths['S2'].write_text(
   c.sha(c.canonical(self.db.snapshots['S2']))+'\n')
  baseline=c.stage_reference_bundle(self.refpaths)
  modified=self.root/'SECURITY-COPY.sql'
  modified.write_bytes(c.SECURITY_SQL.read_bytes()+b'\n-- source-drift test')
  with patch.object(c,'TRANSITION_SOURCES',(modified,)+c.TRANSITION_SOURCES[1:]):
   self.assertNotEqual(c.stage_reference_bundle(self.refpaths),baseline)
  self.assertEqual(len(c.TRANSITION_SOURCES),4)
 def run_real_main(self,phase,stage):
  self.marker=self.root/'journal.jsonl'
  argv=['hft-online-runner',phase,'--journal',str(self.marker),
   '--recovery-evidence',str(self.root/'recovery.json'),
   '--authorization-artifact',str(self.root/'auth.json'),
   '--snapshot-detail-readback',str(self.root/'files.json')]
  (self.root/'recovery.json').write_text('{"schema":"SYNTHETIC_RECOVERY_ONLY"}')
  with contextlib.ExitStack() as stack:
   stack.enter_context(self.approved())
   stack.enter_context(patch.object(sys,'argv',argv))
   stack.enter_context(patch.object(runner,'clean_worktree'))
   stack.enter_context(patch.object(runner,'control_plane_live',return_value={
    'captured_at_utc':'2026-11-03T00:00:00Z'}))
   stack.enter_context(patch.object(runner,'auth_artifact',return_value={
    'authorization_id':'TEST-ONLY','operator':'Test Operator',
    'evidence_custodian':'Test Custodian',
    'independent_verifier':'Test Different Human'}))
   stack.enter_context(patch.object(runner,'recovery_evidence',return_value={
    'recovery_hash':'0'*64}))
   stack.enter_context(patch.object(runner,'env_for',return_value={}))
   stack.enter_context(patch.object(runner,'sql_attest',return_value='TEST_IDENTITY'))
   stack.enter_context(patch.object(runner,'psql',side_effect=self.db.sql(stage)))
   return runner.main()
 def test_real_runner_stops_all_mismatched_phases_before_mutation(self):
  for phase,expected in PHASES[:5]:
   for wrong in c.STAGES:
    if wrong==expected:continue
    with self.subTest(phase=phase,wrong=wrong):
     with self.assertRaises((ValueError,runner.Stop)):
      self.run_real_main(phase,wrong)
 def test_real_runner_reaches_mutation_boundary_only_for_approved_stage(self):
  for phase,stage in PHASES[:5]:
   with self.subTest(phase=phase,stage=stage):
    with self.assertRaisesRegex(AssertionError,'MUTATING_SQL_FORBIDDEN'):
     self.run_real_main(phase,stage)
 def test_independent_final_read_only_requires_s5_not_s4(self):
  self.assertEqual(self.run_real_main('verify-final-dba','S5'),0)
  with self.assertRaises((ValueError,runner.Stop)):
   self.run_real_main('verify-final-dba','S4')

if __name__=='__main__':unittest.main()

