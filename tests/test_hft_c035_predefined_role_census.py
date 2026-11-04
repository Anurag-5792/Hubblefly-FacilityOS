"""C035 complete PG18 role/membership census, source-only runner regression.

The synthetic provider reference is an example, NOT an approved Neon baseline.
The real catalog collector, stage verifier and runner phase gate remain unmocked;
only the PostgreSQL wire transport and external provider authorization are fake.
No PostgreSQL, Neon or resource operation occurs.
"""
from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import hft_c028_catalog as catalog
from tools import hft_neon_staging_bootstrap as runner

spec=importlib.util.spec_from_file_location(
 'hft_c035_existing_lifecycle',
 Path(__file__).with_name('test_hft_c030_phase_transitions.py'))
lifecycle=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lifecycle)
STAGE_TO_PHASE={stage:phase for phase,stage in lifecycle.PHASES}

# Full PG18 predefined-role list from PostgreSQL 18 section 21.5.
# Includes monitoring, maintenance, file/program, signal, and connection roles.
ALL_PRIVILEGED_TARGETS=(
 'pg_read_all_data','pg_write_all_data',
 'pg_read_server_files','pg_write_server_files','pg_execute_server_program',
 'pg_checkpoint','pg_create_subscription','pg_maintain','pg_monitor',
 'pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables',
 'pg_signal_backend','pg_signal_autovacuum_worker',
 'pg_use_reserved_connections')


def direct_grant(rows,member,target,grantor='neondb_owner'):
 return lifecycle.census_grant(
  member,target,grantor,rows['role_census'])


def reachable(rows,start,target):
 """Test fixture graph traversal, including non-HFT intermediaries."""
 edges={}
 for entry in rows['role_membership_census']:
  edges.setdefault(entry['member'],set()).add(entry['granted_role'])
 reached=set()
 pending=[start]
 while pending:
  member=pending.pop()
  if member==target:return True
  if member in reached:continue
  reached.add(member)
  pending.extend(edges.get(member,set())-reached)
 return False


class C035PredefinedRoleCensus(unittest.TestCase):
 def setUp(self):
  self.case=lifecycle.C030Lifecycle('test_complete_sequential_s0_to_s5_positive')
  self.case.setUp()
  self.addCleanup(self.case.doCleanups)

 def assert_gate_denies(self,stage,alter):
  """Prove changed complete evidence fails real runner before mutating SQL."""
  rows=self.case.db.snapshots[stage]
  original=copy.deepcopy(rows)
  approved=self.case.refpaths[stage].read_text().strip()
  self.assertEqual(catalog.portable_stage_hash(rows),approved)
  try:
   alter(rows)
   for category in catalog.CATEGORIES:
    rows[category].sort(key=lambda row:row['id'])
   self.assertNotEqual(catalog.sha(catalog.canonical(rows)),
    catalog.sha(catalog.canonical(original)))
   # Existing runner fixture raises AssertionError(MUTATING_SQL_FORBIDDEN)
   # on any write. Demand an earlier catalog-phase rejection instead.
   with self.assertRaisesRegex(
     runner.Stop,'PHASE_(?:'+stage+'_CATALOG_NOT_QUALIFIED|CONSISTENT_SNAPSHOT_NOT_QUALIFIED)'):
    self.case.run_real_main(STAGE_TO_PHASE[stage],stage)
  finally:
   self.case.db.snapshots[stage]=original

 def test_census_sql_is_unfiltered_complete_and_records_grantor_flags(self):
  roles=catalog.SQL['role_census']
  grants=catalog.SQL['role_membership_census']
  self.assertIn('FROM pg_catalog.pg_roles r',roles)
  self.assertIn('FROM pg_catalog.pg_auth_members am',grants)
  for statement in (roles,grants):
   self.assertNotIn(' WHERE ',statement.upper())
   self.assertNotIn(' LIKE ',statement.upper())
  for token in ('am.member','am.roleid','am.grantor','am.admin_option',
   'am.inherit_option','am.set_option','member.rolcanlogin',
   'granted.rolcreaterole','granted.rolbypassrls',
   'member.rolreplication'):
   self.assertIn(token,grants)
  for token in ('r.rolsuper','r.rolcanlogin','r.rolinherit',
   'r.rolcreaterole','r.rolbypassrls','r.rolconfig',
   'r.rolconnlimit','r.rolvaliduntil'):
   self.assertIn(token,roles)
  self.assertEqual(set(ALL_PRIVILEGED_TARGETS),
   set(catalog.PG18_PREDEFINED_ROLES)-{'pg_database_owner'})

 def test_all_approved_provider_and_pg18_stage_references_pass(self):
  for phase,stage in lifecycle.PHASES:
   with self.subTest(stage=stage):
    rows=self.case.db.snapshots[stage]
    present={r['id'] for r in rows['role_census']}
    self.assertTrue(catalog.PG18_PREDEFINED_ROLES.issubset(present))
    self.assertIn('untracked_login',present)
    self.assertIn('intermediate_generic',present)
    self.assertTrue(reachable(rows,'untracked_login','intermediate_generic'))
    self.assertFalse(reachable(rows,'untracked_login','pg_write_all_data'))
    self.assertFalse(reachable(rows,'untracked_login','pg_read_all_data'))
    self.assertTrue(reachable(rows,'neondb_owner','neon_superuser'))
    self.assertEqual(self.case.classify(phase,stage),stage)
    # No blanket incident for an ungranted high-privilege predefined role.
    self.assertIn('pg_execute_server_program',present)
    self.assertFalse(reachable(rows,'untracked_login',
     'pg_execute_server_program'))

 def test_baseline_source_is_one_repeatable_read_transaction(self):
  sql=catalog.snapshot_statement(include_phase=True)
  self.assertEqual(sql.count('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'),1)
  self.assertEqual(sql.count('ROLLBACK;'),1)
  self.assertIn('pg_current_snapshot()::text',sql)
  self.assertIn('pg_backend_pid()',sql)
  self.assertIn('FROM hft.schema_revision',sql)
  for name in catalog.CATEGORIES:
   self.assertIn(catalog.SQL[name],sql)
  calls=[]
  transport=self.case.db.sql('S3')
  def respond(q,e):
   calls.append(q)
   return transport(q,e)
  with self.case.approved(),patch.object(runner,'psql',side_effect=respond):
   self.assertEqual(runner.live_database_phase_state(
    {'PGUSER':runner.OWNER},'finalize-owner'),'S3')
  self.assertEqual(len(calls),1)

 def test_untracked_login_direct_predefined_grants_denied_at_every_stage(self):
  # Every privileged target is present before the attack. The only change is
  # the explicit GRANT, including its complete grantor and option evidence.
  for stage in catalog.STAGES:
   for target in ALL_PRIVILEGED_TARGETS:
    with self.subTest(stage=stage,target=target):
     def attack(rows):
      self.assertIn(target,{r['id'] for r in rows['role_census']})
      rows['role_membership_census'].append(
       direct_grant(rows,'untracked_login',target))
     self.assert_gate_denies(stage,attack)

 def test_indirect_privileged_paths_denied_at_every_stage(self):
  # Authorized benign A->B remains fixed; new B->privileged grant confers
  # the transitive path to A, even though B has no HFT/Neon prefix.
  for stage in catalog.STAGES:
   for target in ('pg_read_all_data','pg_write_all_data',
     'pg_execute_server_program'):
    with self.subTest(stage=stage,target=target):
     def attack(rows):
      self.assertTrue(reachable(rows,'untracked_login','intermediate_generic'))
      self.assertFalse(reachable(rows,'untracked_login',target))
      rows['role_membership_census'].append(
       direct_grant(rows,'intermediate_generic',target))
      self.assertTrue(reachable(rows,'untracked_login',target))
     self.assert_gate_denies(stage,attack)

 def test_admin_inherit_set_and_delegation_changes_denied_every_stage(self):
  for stage in catalog.STAGES:
   for field,value in (('admin_option',True),('inherit_option',False),
      ('set_option',True)):
    with self.subTest(stage=stage,attribute=field):
     def change(rows):
      edge=next(e for e in rows['role_membership_census']
       if e['member']=='untracked_login'
       and e['granted_role']=='intermediate_generic')
      self.assertNotEqual(edge[field],value)
      edge[field]=value
     self.assert_gate_denies(stage,change)
   with self.subTest(stage=stage,attribute='grantor'):
    def regrant(rows):
     edge=next(e for e in rows['role_membership_census']
      if e['member']=='untracked_login'
      and e['granted_role']=='intermediate_generic')
     grantor=next(r for r in rows['role_census']
      if r['id']=='neon_superuser')
     edge['grantor']='neon_superuser'
     edge['grantor_oid']=grantor['role_oid']
     edge['id']=(f"member={edge['member_oid']};role="
      f"{edge['granted_role_oid']};grantor={edge['grantor_oid']}")
    self.assert_gate_denies(stage,regrant)

 def test_provider_grant_removal_and_flag_changes_denied_every_stage(self):
  for stage in catalog.STAGES:
   with self.subTest(stage=stage,kind='remove provider grant'):
    def remove(rows):
     rows['role_membership_census'][:]=[e for e in
      rows['role_membership_census']
      if (e['member'],e['granted_role'])!=
       ('neondb_owner','neon_superuser')]
     rows['provider_memberships'][:]=[e for e in
      rows['provider_memberships']
      if e['id']!='neondb_owner->neon_superuser']
    self.assert_gate_denies(stage,remove)
   with self.subTest(stage=stage,kind='delegate provider grant'):
    def elevate(rows):
     edge=next(e for e in rows['role_membership_census']
      if e['member']=='neondb_owner'
      and e['granted_role']=='neon_superuser')
     edge['admin_option']=True
     scoped=next(e for e in rows['provider_memberships']
      if e['id']=='neondb_owner->neon_superuser')
     scoped['admin_option']=True
    self.assert_gate_denies(stage,elevate)

 def test_role_attribute_escapes_narrow_filters_but_not_full_census(self):
  for stage in catalog.STAGES:
   with self.subTest(stage=stage):
    def elevate(rows):
     r=next(r for r in rows['role_census'] if r['id']=='intermediate_generic')
     r['rolcreaterole']=True
    self.assert_gate_denies(stage,elevate)

 def test_pg_database_owner_is_implicit_not_a_synthetic_grant(self):
  for stage in catalog.STAGES:
   rows=self.case.db.snapshots[stage]
   self.assertIn('pg_database_owner',{r['id'] for r in rows['role_census']})
   self.assertFalse(any('pg_database_owner' in
     (r['member'],r['granted_role'])
     for r in rows['role_membership_census']))
   with self.subTest(stage=stage):
    self.assert_gate_denies(stage,lambda x:x['role_membership_census'].append(
     direct_grant(x,'neondb_owner','pg_database_owner')))

 def test_revision_records_remain_fixed_when_grant_graph_changes(self):
  before=tuple(runner.MIGS)
  for stage in ('S3','S4','S5'):
   def change(rows):
    rows['role_membership_census'].append(
     direct_grant(rows,'intermediate_generic','pg_write_all_data'))
   self.assert_gate_denies(stage,change)
   self.assertEqual(tuple(runner.MIGS),before)
   # The FakePg18 response retains the full canonical revision ledger.
   response=self.case.db.sql(stage)(
    'SELECT version::text||\'|\'||sha256 FROM hft.schema_revision',{})
   self.assertEqual(response,'\n'.join(f'{v}|{h}' for v,_,h in before))


if __name__=='__main__':
 unittest.main()
