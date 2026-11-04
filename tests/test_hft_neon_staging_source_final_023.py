"""BOOTSTRAP-019 SOURCE-FINAL-023 enforcement tests. No Neon mutation."""
import importlib.util,json,os,pathlib,shutil,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('hft023',ROOT/'tools/hft_neon_staging_bootstrap.py')
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)
TOKEN='SYNTHETIC_CONTROL_PLANE_TOKEN_023_NOT_SECRET'
def fake_get(path,token):
 if token!=TOKEN: raise AssertionError('token')
 if path.endswith('/branches'):
  return {'branches':[{'id':m.BRANCH,'name':m.BRANCH_NAME,'default':False,'primary':False},
    {'id':'br-production','name':'production','default':True,'primary':True}]}
 if path.endswith('/endpoints'):
  return {'endpoints':[{'id':m.ENDPOINT,'host':m.HOST,'branch_id':m.BRANCH,'type':'read_write','region_id':'aws-ap-southeast-1'}]}
 if path.endswith('/databases'):
  return {'databases':[{'name':m.DB,'owner_name':m.OWNER}]}
 if path.endswith('/snapshots'):
  return {'snapshots':[{'id':'snap-good','name':'hft-r1-bootstrap019-prechange-001','source_branch_id':m.BRANCH,'manual':True,'created_at':'2026-11-02T08:00:00Z','expires_at':'2026-11-04T20:00:00Z'}]}
 return {'project':{'id':m.PROJECT}}
class SourceFinal023(unittest.TestCase):
 def live(self): return m.control_plane_live({'HFT_NEON_CONTROL_PLANE_API_TOKEN':TOKEN},fake_get)
 def test_live_control_plane_binds_target_database_and_production_exclusion(self):
  x=self.live();self.assertEqual(x['branch']['id'],m.BRANCH);self.assertEqual(x['database']['owner_name'],m.OWNER)
  def bad(path,token):
   x=fake_get(path,token)
   if path.endswith('/branches'):x['branches'][1]['primary']=False
   return x
  with self.assertRaisesRegex(m.Stop,'PRODUCTION_BRANCH_EXCLUSION'):
   m.control_plane_live({'HFT_NEON_CONTROL_PLANE_API_TOKEN':TOKEN},bad)
 def test_manifest_exact_and_recursive_extra_sql_rejected(self):
  self.assertEqual(len(m.manifest()),6)
  with tempfile.TemporaryDirectory() as td:
   d=pathlib.Path(td)
   shutil.copy(m.MANIFEST,d/'manifest.v1.json')
   for _,name,_ in m.MIGS: shutil.copy(m.SQL_DIR/name,d/name)
   (d/'nested').mkdir();(d/'nested'/'extra.sql').write_text('SELECT 1;')
   with patch.object(m,'SQL_DIR',d),patch.object(m,'MANIFEST',d/'manifest.v1.json'):
    with self.assertRaisesRegex(m.Stop,'UNEXPECTED_MIGRATION_SQL'):m.manifest()
 def test_review_and_execution_hold_cannot_be_cli_bypassed(self):
  with tempfile.TemporaryDirectory() as td:
   rp=pathlib.Path(td)/'review';ep=pathlib.Path(td)/'exec';rp.write_text('HOLD\n');ep.write_text('HOLD\n')
   with patch.object(m,'REVIEW_PIN',rp),patch.object(m,'EXEC_PIN',ep):
    with self.assertRaisesRegex(m.Stop,'INDEPENDENT_REVIEW_HOLD'):m.pin(rp,'INDEPENDENT_REVIEW')
 def test_authorization_hash_window_and_recovery_binding(self):
  with tempfile.TemporaryDirectory() as td:
   td=pathlib.Path(td);review=td/'review.json';review.write_text('accepted-review')
   recovery=td/'recovery.json'
   recovery_obj={'schema':'HFT_R1_NEON_PRECHANGE_RECOVERY_V2','project_id':m.PROJECT,'source_branch_id':m.BRANCH,'database':m.DB,'source_state_sha256':'0'*64}

   recovery.write_text(json.dumps(recovery_obj,separators=(',',':'),sort_keys=True))
   # TEST-ONLY approved reference SHA fixtures, NEVER committed approvals.
   stage_paths={}
   for idx,stage in enumerate(m.c028_catalog.STAGES):
    stage_file=td/(stage+'.sha256')
    stage_file.write_text(format(idx+1,'x')*64+'\n')
    stage_paths[stage]=stage_file
   with patch.object(m.c028_catalog,'STAGE_PATHS',stage_paths):
    synthetic_bundle=m.c028_catalog.stage_reference_bundle()
   continuity=td/'role-continuity.synthetic.json'
   continuity.write_text(json.dumps({
    'schema':m.c028_catalog.ROLE_CONTINUITY_SCHEMA,
    'stage':'S2','project_id':m.PROJECT,'branch_id':m.BRANCH,
    'database':m.DB,'anchor_stage':'S1',
    'previous_collection_sha256':'a'*64,
    'witness_evidence_sha256':'b'*64,
    'collector_source_sha256':m.sha((ROOT/'tools/hft_c028_catalog.py').read_bytes()),
    'prior_role_oids':{'neondb_owner':'10001'}}))
   auth=td/'auth.json';t=m.now()
   obj={'schema':'HFT_R1_MASTER_V3_BOOTSTRAP019_EXEC_AUTH_V2','authorization_id':'AUTH-1','project_id':m.PROJECT,'branch_id':m.BRANCH,'database':m.DB,'approved_phases':['migrate'],'not_before_utc':(t-m.dt.timedelta(minutes=5)).isoformat().replace('+00:00','Z'),'expires_at_utc':(t+m.dt.timedelta(hours=1)).isoformat().replace('+00:00','Z'),'decision_maker':'Director Human','operator':'Operator Human','evidence_custodian':'Custodian Human','independent_verifier':'Verifier Human','recovery_evidence_sha256':m.sha(recovery.read_bytes()),'recovery_validator_sha256':m.sha((ROOT/'tools/hft_neon_recovery_v2.py').read_bytes()),'catalog_collector_sha256':m.sha((ROOT/'tools/hft_c028_catalog.py').read_bytes()),'phase_reference_bundle_sha256':synthetic_bundle,'role_continuity_evidence_sha256':m.sha(continuity.read_bytes()),'runner_sha256':m.sha(pathlib.Path(m.__file__).read_bytes()),'role_sql_sha256':m.ROLE_SHA,'creator_sql_sha256':m.CREATOR_SHA,'owner_close_sql_sha256':m.OWNER_CLOSE_SHA,'dba_close_sql_sha256':m.DBA_CLOSE_SHA,'manifest_sha256':m.MANIFEST_SHA,'production_branch_excluded':True,'scope':'CANONICAL_0001_0006_STAGING_ONLY'}
   auth.write_text(json.dumps(obj,separators=(',',':'),sort_keys=True))
   rp=td/'rp';ep=td/'ep';rp.write_text(m.sha(review.read_bytes()));ep.write_text(m.sha(auth.read_bytes()))
   with patch.object(m,'REVIEW_PIN',rp),patch.object(m,'EXEC_PIN',ep),patch.object(m.c028_catalog,'STAGE_PATHS',stage_paths),patch.dict(os.environ,{'HFT_BOOTSTRAP019_REVIEW_EVIDENCE':str(review)},clear=False):
    a=m.auth_artifact(auth,'migrate',recovery,continuity);self.assertEqual(a['operator'],'Operator Human')
    bad=dict(obj);bad['expires_at_utc']='2020-01-01T00:00:00Z';auth.write_text(json.dumps(bad,separators=(',',':'),sort_keys=True));ep.write_text(m.sha(auth.read_bytes()))
    with patch.object(m,'EXEC_PIN',ep):
     with self.assertRaisesRegex(m.Stop,'EXECUTION_AUTHORIZATION_WINDOW'):m.auth_artifact(auth,'migrate',recovery,continuity)
    invalid=dict(obj);invalid['recovery_validator_sha256']='0'*64
    auth.write_text(json.dumps(invalid,separators=(',',':'),sort_keys=True))
    ep.write_text(m.sha(auth.read_bytes()))
    with self.assertRaisesRegex(m.Stop,'AUTHORIZED_PACKAGE_HASH'):m.auth_artifact(auth,'migrate',recovery,continuity)
    # A modified exact PostgreSQL catalog collector must invalidate Gate A
    # even when all other Recovery V2 hashes still match.
    invalid=dict(obj);invalid['catalog_collector_sha256']='0'*64
    auth.write_text(json.dumps(invalid,separators=(',',':'),sort_keys=True))
    ep.write_text(m.sha(auth.read_bytes()))
    with self.assertRaisesRegex(m.Stop,'AUTHORIZED_PACKAGE_HASH'):
     m.auth_artifact(auth,'migrate',recovery,continuity)
    # Gate A must bind exact target-local continuity evidence bytes.
    auth.write_text(json.dumps(obj,separators=(',',':'),sort_keys=True))
    ep.write_text(m.sha(auth.read_bytes()))
    original_continuity=continuity.read_bytes()
    continuity.write_bytes(original_continuity+b' ')
    with self.assertRaisesRegex(m.Stop,'ROLE_OID_CONTINUITY_AUTHORIZATION_HASH'):
     m.auth_artifact(auth,'migrate',recovery,continuity)
    continuity.write_bytes(original_continuity)
    # Legacy V1 authorizations cannot silently be reused with V2 references.
    legacy=dict(obj);legacy['schema']='HFT_R1_MASTER_V3_BOOTSTRAP019_EXEC_AUTH_V1'
    auth.write_text(json.dumps(legacy,separators=(',',':'),sort_keys=True))
    ep.write_text(m.sha(auth.read_bytes()))
    with self.assertRaisesRegex(m.Stop,'EXECUTION_AUTHORIZATION_SCOPE'):
     m.auth_artifact(auth,'migrate',recovery,continuity)
    # Even if the old approval payload and original runner code remain
    # unchanged, replacing an S2 reference must invalidate that Gate A hash.
    auth.write_text(json.dumps(obj,separators=(',',':'),sort_keys=True))
    ep.write_text(m.sha(auth.read_bytes()))
    stage_paths['S2'].write_text('e'*64+'\n')
    with self.assertRaisesRegex(m.Stop,'AUTHORIZED_PACKAGE_HASH'):
     m.auth_artifact(auth,'migrate',recovery,continuity)
 def test_phase_pin_hash_change_invalidates_gate_a(self):
  # Synthetic local auth: no real approval pins altered.
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp)
   ref_paths={}
   for i,stage in enumerate(m.c028_catalog.STAGES):
    f=root/(stage+'.sha256')
    f.write_text(format(i+1,'x')*64+'\n')
    ref_paths[stage]=f
   with patch.object(m.c028_catalog,'STAGE_PATHS',ref_paths):
    before=m.c028_catalog.stage_reference_bundle()
    ref_paths['S2'].write_text('e'*64+'\n')
    self.assertNotEqual(m.c028_catalog.stage_reference_bundle(),before)
 def test_recovery_v1_child_snapshot_is_prohibited(self):
  with tempfile.TemporaryDirectory() as td:
   td=pathlib.Path(td);e=td/'legacy.json'
   e.write_text(json.dumps({'schema':'HFT_R1_NEON_PRECHANGE_RECOVERY_V1'}))
   with self.assertRaisesRegex(m.Stop,'RECOVERY_V1_CHILD_SNAPSHOT_PROHIBITED'):
    m.recovery_evidence(e,{},self.live(),None)

 def test_atomic_batch_and_0001_state_guard(self):
  s=m.batch_sql(m.manifest());self.assertEqual(s.count('BEGIN;'),1);self.assertEqual(s.count('COMMIT;'),1);self.assertEqual(s.count('INSERT INTO hft.schema_revision'),6);self.assertIn('MIGRATION_0001_UNEXPECTED_STATE',s)
 def test_owner_aware_acl_sources(self):
  owner=m.owner_close_sql();dba=m.dba_close_sql()
  self.assertIn('GRANT SELECT ON hft.schema_revision TO hft_r1_audit_verify',owner)
  self.assertNotIn('GRANT SELECT ON hft.schema_revision',dba)
  self.assertIn('REVOKE CREATE ON DATABASE neondb FROM hft_staging_migration_owner',dba)
 def test_actual_negative_probe_enforcement(self):
  denied=type('R',(),{'returncode':1,'stdout':'','stderr':'ERROR:  42501'})()
  with patch.object(m.subprocess,'run',return_value=denied):m.expect_denied('CREATE TABLE hft.x(a int);',{},'DDL')
  allowed=type('R',(),{'returncode':0,'stdout':'','stderr':''})()
  with patch.object(m.subprocess,'run',return_value=allowed):
   with self.assertRaisesRegex(m.Stop,'UNEXPECTEDLY_ALLOWED'):m.expect_denied('CREATE TABLE hft.x(a int);',{},'DDL')
 def test_sql_roles_are_restricted_and_not_future_p2_roles(self):
  s=m.security_sql()
  self.assertNotIn('neon_superuser TO',s);self.assertNotIn('hft_r1_posting_owner',s);self.assertIn('HFT_RESTRICTED_ROLE_ELEVATION',s)
if __name__=='__main__':unittest.main()
