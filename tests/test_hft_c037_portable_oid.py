"""C037 portable semantic stage references and separately pinned local OIDs.

Synthetic PG18 only. Exercised production collector/runner source, real
verify_stage and all S0-S5 protected phase boundaries; no database I/O.
"""
from __future__ import annotations
import copy,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from tools import hft_c028_catalog as c
from tools import hft_neon_staging_bootstrap as runner

spec=importlib.util.spec_from_file_location('hft_c030_fixture',
 Path(__file__).with_name('test_hft_c030_phase_transitions.py'))
fx=importlib.util.module_from_spec(spec);spec.loader.exec_module(fx)
PHASES=dict((stage,phase) for phase,stage in fx.PHASES)
CTX={'project_id':runner.PROJECT,'branch_id':runner.BRANCH,'database':runner.DB}


def renumber(rows,offset):
 """Independent cluster-local OID assignment with consistent grant references."""
 out=copy.deepcopy(rows)
 mapping={}
 for role in out['role_census']:
  old=role['role_oid'];new=str(int(old)+offset)
  mapping[old]=new
  role['role_oid']=new
 for grant in out['role_membership_census']:
  for key in ('member_oid','granted_role_oid','grantor_oid'):
   grant[key]=mapping[grant[key]]
  grant['id']=('member='+grant['member_oid']+
   ';role='+grant['granted_role_oid']+';grantor='+grant['grantor_oid'])
 for category in ('role_census','role_membership_census'):
  out[category].sort(key=lambda x:x['id'])
 return out


def portable_proof(continuity,shift=0,context=None):
 proof=copy.deepcopy(continuity)
 if shift:
  proof['prior_role_oids']={name:str(int(oid)+shift)
   for name,oid in proof['prior_role_oids'].items()}
 if context:
  proof.update(context)
 return proof


class C037PortableOID(unittest.TestCase):
 def setUp(self):
  self.case=fx.C030Lifecycle('test_complete_sequential_s0_to_s5_positive')
  self.case.setUp();self.addCleanup(self.case.doCleanups)

 def proof(self,stage):
  return copy.deepcopy(self.case.continuity[stage])

 def verify(self,stage,rows,proof=None,context=None):
  return c.verify_stage(None,stage,self.case.refpaths,observed=rows,
   continuity=proof if proof is not None else self.proof(stage),
   context=context if context is not None else CTX)

 def rejects(self,stage,change,error='C028_CATALOG_'):
  original=copy.deepcopy(self.case.db.snapshots[stage])
  try:
   rows=self.case.db.snapshots[stage]
   change(rows)
   for category in c.CATEGORIES:rows[category].sort(key=lambda r:r['id'])
   with self.assertRaisesRegex(ValueError,error):
    self.verify(stage,rows)
   # Real runner verifies actual phase and stage before any mutation SQL.
   with self.assertRaises((runner.Stop,ValueError)):
    self.case.run_real_main(PHASES[stage],stage)
  finally:
   self.case.db.snapshots[stage]=original

 def test_reference_version_rejects_legacy_v1(self):
  self.assertEqual(len(c.CATEGORIES),30)
  normalized=c.portable_semantic_catalog(self.case.db.snapshots['S0'])
  self.assertEqual(normalized['schema'],c.PORTABLE_STAGE_SCHEMA)
  self.assertNotIn('role_oid',normalized['categories']['role_census'][0])
  for edge in normalized['categories']['role_membership_census']:
   for key in ('member_oid','granted_role_oid','grantor_oid'):
    self.assertNotIn(key,edge)
  refs=c.approved_stage_references(self.case.refpaths)
  old=c.sha(c.canonical({'schema':'HFT_R1_BOOTSTRAP019_PHASE_REFERENCE_V1',
   'manifest_sha256':c.MANIFEST_SHA,
   'stage_hashes':refs,'transition_sql_sha256':
   {p.name:c.sha(p.read_bytes()) for p in c.TRANSITION_SOURCES}}))
  self.assertNotEqual(c.stage_reference_bundle(self.case.refpaths),old)
  self.assertNotEqual(c.portable_stage_hash(self.case.db.snapshots['S0']),
   c.sha(c.canonical(self.case.db.snapshots['S0'])))

 def test_different_cluster_oids_same_semantic_stage_reference_s0_s5(self):
  for stage in c.STAGES:
   with self.subTest(stage=stage):
    a=self.case.db.snapshots[stage]
    b=renumber(a,700000)
    self.assertEqual(c.portable_stage_hash(a),c.portable_stage_hash(b))
    self.assertNotEqual(c.sha(c.canonical(c.raw_oid_evidence(a))),
     c.sha(c.canonical(c.raw_oid_evidence(b))))
    accepted=self.verify(stage,a)
    self.assertEqual(accepted,self.verify(stage,b,
     proof=portable_proof(self.proof(stage),shift=700000)))
    # A second independent target has a different bounded target identity.
    other=dict(CTX,branch_id='independent-reference-fixture')
    self.assertEqual(accepted,self.verify(stage,b,
     proof=portable_proof(self.proof(stage),shift=700000,context=other),
     context=other))

 def test_real_runner_accepts_semantics_with_other_local_oids_all_stages(self):
  for stage,phase in fx.PHASES:
   original=self.case.db.snapshots[stage]
   self.case.db.snapshots[stage]=renumber(original,800000)
   self.case.continuity[stage]=portable_proof(self.proof(stage),shift=800000)
   try:
    with self.subTest(stage=stage):
     self.assertEqual(self.case.classify(stage,phase) if False else
      self.case.classify(phase,stage),stage)
     if stage!='S5':
      with self.assertRaisesRegex(AssertionError,'MUTATING_SQL_FORBIDDEN'):
       self.case.run_real_main(phase,stage)
     else:self.assertEqual(self.case.run_real_main(phase,stage),0)
   finally:
    self.case.db.snapshots[stage]=original

 def test_changed_semantic_role_and_permissions_denied_every_stage(self):
  for stage in c.STAGES:
   for kind in ('name','login','superuser','createdb','createrole',
     'replication','bypassrls','inherit','connlimit','expires','settings'):
    with self.subTest(stage=stage,kind=kind):
     def change(rows):
      row=next(r for r in rows['role_census'] if r['id']=='untracked_login')
      if kind=='name':row['id']='untracked_login_renamed'
      elif kind=='login':row['rolcanlogin']=not row['rolcanlogin']
      elif kind=='superuser':row['rolsuper']=True
      elif kind=='createdb':row['rolcreatedb']=True
      elif kind=='createrole':row['rolcreaterole']=True
      elif kind=='replication':row['rolreplication']=True
      elif kind=='bypassrls':row['rolbypassrls']=True
      elif kind=='inherit':row['rolinherit']=False
      elif kind=='connlimit':row['rolconnlimit']=13
      elif kind=='expires':row['expires']='2099-01-01 00:00:00+00'
      else:row['settings']='{statement_timeout=1}'
     self.rejects(stage,change)

 def test_grants_grantor_and_all_membership_options_denied_every_stage(self):
  for stage in c.STAGES:
   for kind in ('new_predefined','remove','grantor','admin','inherit','set',
      'transitive'):
    with self.subTest(stage=stage,kind=kind):
     def change(rows):
      edges=rows['role_membership_census']
      edge=next(g for g in edges
       if g['member']=='untracked_login'
       and g['granted_role']=='intermediate_generic')
      if kind=='new_predefined':
       edges.append(fx.census_grant('untracked_login',
        'pg_write_all_data','neondb_owner',rows['role_census']))
      elif kind=='transitive':
       edges.append(fx.census_grant('intermediate_generic',
        'pg_execute_server_program','neondb_owner',rows['role_census']))
      elif kind=='remove':edges.remove(edge)
      elif kind=='grantor':
       oid=next(r['role_oid'] for r in rows['role_census']
        if r['id']=='neon_superuser')
       edge['grantor']='neon_superuser';edge['grantor_oid']=oid
       edge['id']=('member='+edge['member_oid']+
        ';role='+edge['granted_role_oid']+';grantor='+oid)
      elif kind=='admin':edge['admin_option']=True
      elif kind=='inherit':edge['inherit_option']=False
      else:edge['set_option']=True
     self.rejects(stage,change)

 def test_duplicate_semantic_role_and_membership_rejected(self):
  for stage in c.STAGES:
   with self.subTest(stage=stage):
    self.rejects(stage,lambda rows:rows['role_census'].append(
     copy.deepcopy(rows['role_census'][0])),'OID_DUPLICATE_ROLE_NAME')
    self.rejects(stage,lambda rows:rows['role_membership_census'].append(
     copy.deepcopy(rows['role_membership_census'][0])),
     'OID_DUPLICATE_SEMANTIC_GRANT')

 def test_invalid_duplicate_and_conflicting_oid_maps_fail_closed(self):
  for stage in c.STAGES:
   cases=(
    ('invalid',lambda r:r['role_census'][0].update(role_oid='invalid')),
    ('zero',lambda r:r['role_census'][0].update(role_oid='0')),
    ('negative',lambda r:r['role_census'][0].update(role_oid='-17')),
    ('overflow',lambda r:r['role_census'][0].update(role_oid='4294967296')),
    ('duplicate',lambda r:r['role_census'][1].update(
     role_oid=r['role_census'][0]['role_oid'])),
    ('member',lambda r:r['role_membership_census'][0].update(
     member_oid=r['role_census'][-1]['role_oid'])),
    ('granted',lambda r:r['role_membership_census'][0].update(
     granted_role_oid=r['role_census'][-1]['role_oid'])),
    ('grantor',lambda r:r['role_membership_census'][0].update(
     grantor_oid=r['role_census'][-1]['role_oid'])),
    ('record_id',lambda r:r['role_membership_census'][0].update(
     id='member=11;role=12;grantor=13')),
    ('missing',lambda r:r['role_membership_census'][0].pop('grantor_oid')),
    ('misleading_flags',lambda r:r['role_membership_census'][0].update(
     granted_can_login='invalid')))
   for kind,change in cases:
    with self.subTest(stage=stage,kind=kind):
     self.rejects(stage,change,'OID_')

 def test_missing_and_wrong_target_local_continuity_fail_closed(self):
  for stage in c.STAGES:
   rows=self.case.db.snapshots[stage]
   with self.subTest(stage=stage),self.assertRaisesRegex(ValueError,
      'OID_CONTINUITY_EVIDENCE_REQUIRED'):
    c.verify_stage(None,stage,self.case.refpaths,observed=rows,
     context=CTX)
   for change in (
    lambda p:p.update(previous_collection_sha256='HOLD'),
    lambda p:p.update(witness_evidence_sha256=''),
    lambda p:p.update(branch_id='unapproved-target'),
    lambda p:p.update(collector_source_sha256='0'*64),
    lambda p:p.update(anchor_stage='S5'),
    lambda p:p.update(prior_role_oids={}),
    lambda p:p['prior_role_oids'].update(
      {next(iter(p['prior_role_oids'])):'9999999'})):
    proof=self.proof(stage);change(proof)
    with self.subTest(stage=stage,proof=proof.get('anchor_stage')),self.assertRaisesRegex(
        ValueError,'OID_CONTINUITY_'):
     self.verify(stage,rows,proof=proof)

 def test_role_recreated_with_same_name_detected_by_target_anchor(self):
  for stage in c.STAGES:
   a=self.case.db.snapshots[stage]
   b=renumber(a,500000)
   self.assertEqual(c.portable_stage_hash(a),c.portable_stage_hash(b))
   with self.subTest(stage=stage),self.assertRaisesRegex(
      ValueError,'OID_CONTINUITY_ROLE_RECREATED_OR_REMOVED'):
    self.verify(stage,b,proof=self.proof(stage))
   self.assertEqual(self.verify(stage,a),
    self.verify(stage,b,portable_proof(self.proof(stage),shift=500000)))

 def test_collection_forensics_bind_exact_source_branch_and_snapshot(self):
  a=self.case.db.sql('S3')
  out={}
  rows,phase,revs=c.collect(lambda q:a(q,{}),include_phase=True,
   expected_identity=(runner.DB,runner.OWNER,runner.PGNUM),
   evidence_out=out,branch_id=runner.BRANCH)
  self.assertEqual(rows,self.case.db.snapshots['S3'])
  self.assertTrue(phase['ledger_exists'])
  self.assertEqual(len(revs),6)
  self.assertEqual(out['schema'],c.OID_EVIDENCE_SCHEMA)
  self.assertEqual(out['portable_stage_sha256'],c.portable_stage_hash(rows))
  self.assertEqual(out['collector_source_sha256'],
   c.sha(Path(c.__file__).read_bytes()))
  self.assertEqual(out['branch_id'],runner.BRANCH)
  self.assertEqual(out['database'],runner.DB)
  self.assertEqual(out['backend_pid'],4399)
  self.assertEqual(out['snapshot'],'8:8:')
  self.assertEqual(len(out['raw_oid_sha256']),64)
  self.assertEqual(len(out['transport_sha256']),64)
  self.assertEqual(len(out['collection_id']),64)
  # A new cluster gets another physical observation/evidence ID, but same
  # approved stage fingerprint.
  old=self.case.db.snapshots['S3']
  self.case.db.snapshots['S3']=renumber(old,900000)
  try:
   b=self.case.db.sql('S3')
   second={}
   rb,_,_=c.collect(lambda q:b(q,{}),include_phase=True,
    expected_identity=(runner.DB,runner.OWNER,runner.PGNUM),
    evidence_out=second,branch_id=runner.BRANCH)
   self.assertEqual(out['portable_stage_sha256'],
    second['portable_stage_sha256'])
   self.assertNotEqual(out['raw_oid_sha256'],second['raw_oid_sha256'])
   self.assertNotEqual(out['collection_id'],second['collection_id'])
  finally:self.case.db.snapshots['S3']=old

 def test_revision_and_reference_changes_remain_rejected(self):
  for stage in c.STAGES:
   changed=copy.deepcopy(self.case.db.snapshots[stage])
   changed['role_membership_census'].append(fx.census_grant(
    'intermediate_generic','pg_read_server_files','neondb_owner',
    changed['role_census']))
   self.assertNotEqual(c.portable_stage_hash(changed),
    self.case.refpaths[stage].read_text().strip())
  before=c.stage_reference_bundle(self.case.refpaths)
  self.case.refpaths['S3'].write_text('e'*64+'\n')
  self.assertNotEqual(c.stage_reference_bundle(self.case.refpaths),before)
  with self.assertRaisesRegex(ValueError,'STAGE_'):
   self.verify('S3',self.case.db.snapshots['S3'])
  self.assertEqual(len(runner.MIGS),6)
  self.assertEqual([h for _,_,h in runner.MIGS],list(c.CANONICAL_SHA))


if __name__=='__main__':
 unittest.main()
