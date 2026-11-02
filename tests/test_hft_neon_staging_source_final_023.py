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
   recovery_obj={'schema':'HFT_R1_NEON_PRECHANGE_RECOVERY_V1','authorization_id':'AUTH-1','project_id':m.PROJECT,'branch_id':m.BRANCH,'database':m.DB,'snapshot_id':'snap-good','snapshot_name':'hft-r1-bootstrap019-prechange-001','snapshot_created_at_utc':'2026-11-02T08:00:00Z','snapshot_retention_mode':'INDEFINITE','snapshot_detail_readback_sha256':'0'*64,'readback_at_utc':'2026-11-02T08:10:00Z','readback_by':'Verifier Human','evidence_custodian':'Custodian Human','restore_contract':'RESTORE_TO_SEPARATE_NONPRODUCTION_BRANCH'}
   recovery.write_text(json.dumps(recovery_obj,separators=(',',':'),sort_keys=True))
   auth=td/'auth.json';t=m.now()
   obj={'schema':'HFT_R1_MASTER_V3_BOOTSTRAP019_EXEC_AUTH_V1','authorization_id':'AUTH-1','project_id':m.PROJECT,'branch_id':m.BRANCH,'database':m.DB,'approved_phases':['migrate'],'not_before_utc':(t-m.dt.timedelta(minutes=5)).isoformat().replace('+00:00','Z'),'expires_at_utc':(t+m.dt.timedelta(hours=1)).isoformat().replace('+00:00','Z'),'decision_maker':'Director Human','operator':'Operator Human','evidence_custodian':'Custodian Human','independent_verifier':'Verifier Human','recovery_evidence_sha256':m.sha(recovery.read_bytes()),'runner_sha256':m.sha(pathlib.Path(m.__file__).read_bytes()),'role_sql_sha256':m.ROLE_SHA,'creator_sql_sha256':m.CREATOR_SHA,'owner_close_sql_sha256':m.OWNER_CLOSE_SHA,'dba_close_sql_sha256':m.DBA_CLOSE_SHA,'manifest_sha256':m.MANIFEST_SHA,'production_branch_excluded':True,'scope':'CANONICAL_0001_0006_STAGING_ONLY'}
   auth.write_text(json.dumps(obj,separators=(',',':'),sort_keys=True))
   rp=td/'rp';ep=td/'ep';rp.write_text(m.sha(review.read_bytes()));ep.write_text(m.sha(auth.read_bytes()))
   with patch.object(m,'REVIEW_PIN',rp),patch.object(m,'EXEC_PIN',ep),patch.dict(os.environ,{'HFT_BOOTSTRAP019_REVIEW_EVIDENCE':str(review)},clear=False):
    a=m.auth_artifact(auth,'migrate',recovery);self.assertEqual(a['operator'],'Operator Human')
    bad=dict(obj);bad['expires_at_utc']='2020-01-01T00:00:00Z';auth.write_text(json.dumps(bad,separators=(',',':'),sort_keys=True));ep.write_text(m.sha(auth.read_bytes()))
    with patch.object(m,'EXEC_PIN',ep):
     with self.assertRaisesRegex(m.Stop,'EXECUTION_AUTHORIZATION_WINDOW'):m.auth_artifact(auth,'migrate',recovery)
 def test_recovery_requires_live_snapshot_and_hash_bound_independent_detail_readback(self):
  t=m.now();created=(t-m.dt.timedelta(minutes=10)).isoformat().replace('+00:00','Z');readback=(t-m.dt.timedelta(minutes=1)).isoformat().replace('+00:00','Z')
  live=self.live();live['snapshots'][0].update(created_at=created)
  a={'authorization_id':'AUTH-1','expires_at_utc':(t+m.dt.timedelta(hours=1)).isoformat().replace('+00:00','Z'),'independent_verifier':'Verifier Human','evidence_custodian':'Custodian Human'}
  with tempfile.TemporaryDirectory() as td:
   td=pathlib.Path(td);detail=td/'detail.json'
   det={'schema':'HFT_R1_NEON_SNAPSHOT_DETAIL_READBACK_V1','project_id':m.PROJECT,'snapshot_id':'snap-good','snapshot_name':'hft-r1-bootstrap019-prechange-001','source_branch_id':m.BRANCH,'created_at_utc':created,'retention_mode':'INDEFINITE','readback_at_utc':readback,'readback_by':'Verifier Human','readback_method':'NEON_SNAPSHOTS_GET'}
   detail.write_text(json.dumps(det,separators=(',',':'),sort_keys=True))
   p=td/'r';obj={'schema':'HFT_R1_NEON_PRECHANGE_RECOVERY_V1','authorization_id':'AUTH-1','project_id':m.PROJECT,'branch_id':m.BRANCH,'database':m.DB,'snapshot_id':'snap-good','snapshot_name':'hft-r1-bootstrap019-prechange-001','snapshot_created_at_utc':created,'snapshot_retention_mode':'INDEFINITE','snapshot_detail_readback_sha256':m.sha(detail.read_bytes()),'readback_at_utc':readback,'readback_by':'Verifier Human','evidence_custodian':'Custodian Human','restore_contract':'RESTORE_TO_SEPARATE_NONPRODUCTION_BRANCH'};p.write_text(json.dumps(obj))
   self.assertEqual(m.recovery_evidence(p,a,live,detail)['snapshot_id'],'snap-good')
   detail.write_text('{}')
   with self.assertRaisesRegex(m.Stop,'RECOVERY_DETAIL_READBACK_HASH'):m.recovery_evidence(p,a,live,detail)
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
