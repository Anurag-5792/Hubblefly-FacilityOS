"""Independent synthetic BOOTSTRAP-019-021 controls. No real Neon or SQL execution."""
import importlib.util, pathlib, sys, unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('staging_021',ROOT/'tools/hft_neon_staging_bootstrap.py')
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)
TOKEN='SYNTHETIC_CONTROL_PLANE_UNIT_TOKEN_NOT_A_SECRET'

def fake_control(kind='GOOD'):
 def get(url,token):
  if token!=TOKEN or not url.startswith('https://console.neon.tech/api/v2/projects/'+m.PROJECT):
   raise AssertionError('UNTRUSTED_API_REQUEST')
  if url.endswith('/branches/'+m.BRANCH):
   return {'branch':{'id':m.BRANCH,'name':'production' if kind=='BAD_BRANCH' else m.BRANCH_NAME}}
  if url.endswith('/endpoints'):
   return {'endpoints':[{'id':m.ENDPOINT,'host':'evil.neon.tech' if kind=='BAD_HOST' else m.HOST,
    'branch_id':m.BRANCH,'type':'read_write',
    'region_id':'aws-us-east-1' if kind=='BAD_REGION' else 'aws-ap-southeast-1'}]}
  return {'project':{'id':'unapproved' if kind=='BAD_PROJECT' else m.PROJECT,
    'region_id':'aws-ap-southeast-1'}}
 return get

class CorrectedRunner(unittest.TestCase):
 def test_manifest_hash_pinned_and_all_six_sources_exact(self):
  self.assertEqual(len(m.manifest()),6)
  self.assertEqual(m.sha(m.MANIFEST.read_bytes()),m.MANIFEST_SHA)
  with patch.object(m,'MANIFEST_SHA','f'*64):
   with self.assertRaisesRegex(m.Stop,'MANIFEST_SHA256_DRIFT'):m.manifest()
 def test_live_provider_endpoint_project_branch_host_region_attested(self):
  snap={'endpoint_id':m.ENDPOINT,'endpoint_host':m.HOST}
  env={'HFT_NEON_CONTROL_PLANE_API_TOKEN':TOKEN}
  result=m.control_plane_live(snap,env,fake_control())
  self.assertEqual(len(result),64)
  for bad in ('BAD_PROJECT','BAD_BRANCH','BAD_HOST','BAD_REGION'):
   with self.subTest(bad=bad),self.assertRaises(m.Stop):
    m.control_plane_live(snap,env,fake_control(bad))
  with self.assertRaisesRegex(m.Stop,'CONTROL_PLANE_TOKEN_NOT_PROVISIONED'):
   m.control_plane_live(snap,{})
 def test_static_attestation_cannot_bypass_live_provider(self):
  snap={'endpoint_id':m.ENDPOINT,'endpoint_host':'wrong.neon.tech'}
  with self.assertRaisesRegex(m.Stop,'CONTROL_PLANE_ATTESTATION_NOT_CURRENT'):
   m.control_plane_live(snap,{'HFT_NEON_CONTROL_PLANE_API_TOKEN':TOKEN},fake_control())
 def test_source_auth_review_hold_denies_before_network_and_before_sql(self):
  class A:pass
  a=A();a.execute=True;a.authorization_id='HFT-R1-MASTER-V3-EXPLICIT'
  a.decision_maker='Director A';a.operator='Operator B'
  a.evidence_custodian='Custodian C';a.independent_verifier='Verifier D'
  a.review_evidence=None
  with self.assertRaisesRegex(m.Stop,'BOOTSTRAP019_INDEPENDENT_REVIEW_HOLD'):
   m.authority(a)
  with patch.object(sys,'argv',['staging_runner','migrate']),\
       patch.object(m,'q',side_effect=AssertionError('DML_CALL_FORBIDDEN')):
   with self.assertRaisesRegex(m.Stop,'BOOTSTRAP019_INDEPENDENT_REVIEW_HOLD'):
    m.main()
 def test_single_lock_single_atomic_commit_all_six_revision_rows(self):
  plan=m.manifest();sql=m.batch_sql(plan)
  self.assertEqual(sql.count('BEGIN;'),1)
  self.assertEqual(sql.count('COMMIT;'),1)
  self.assertEqual(sql.count('pg_try_advisory_xact_lock'),1)
  self.assertEqual(sql.count('INSERT INTO hft.schema_revision'),6)
  self.assertEqual(sql.count('CREATE SCHEMA IF NOT EXISTS hft'),1)
  self.assertLess(sql.index('pg_try_advisory_xact_lock'),sql.index('CREATE SCHEMA IF NOT EXISTS hft'))
  self.assertLess(sql.index('INSERT INTO hft.schema_revision'),sql.index('COMMIT;'))
  self.assertIn('MIGRATION_CONCURRENT_RUNNER_DENIED',sql)
  self.assertIn('MIGRATION_GLOBAL_FUNCTION_DEFAULT_NOT_REVOKED',sql)
  self.assertIn('HFT_CANONICAL_BATCH_COMMIT_ACK|0001-0006',sql)
 def test_first_revision_and_subsequent_revision_checks_are_atomic(self):
  sql=m.batch_sql(m.manifest())
  self.assertIn('MIGRATION_0001_UNEXPECTED_STATE',sql)
  for i in range(2,7):
   self.assertIn('MIGRATION_{:04d}_REVISION_STATE'.format(i),sql)
  with self.assertRaisesRegex(m.Stop,'CANONICAL_BATCH_PLAN_NOT_PINNED'):
   m.batch_sql(m.manifest()[:5])
 def test_role_bootstrap_sql_is_sha_pinned_and_separate_from_manifest(self):
  self.assertEqual(len(m.manifest()),6)
  for name,digest,source in ((m.ROLE_SQL,m.ROLE_SHA,m.security_sql()),
   (m.CREATOR_SQL,m.CREATOR_SHA,m.creator_sql()),
   (m.CLOSE_SQL,m.CLOSE_SHA,m.finalize_sql())):
   p=ROOT/'db/security'/name
   self.assertTrue(p.is_file())
   self.assertEqual(m.sha(p.read_bytes()),digest)
   self.assertIn('REVIEW ONLY',source)
  with patch.object(m,'ROLE_SHA','0'*64):
   with self.assertRaisesRegex(m.Stop,'REVIEW_SQL_SOURCE_DRIFT'):m.security_sql()
 def test_roles_support_actual_creator_defaults_and_final_revoke(self):
  role=m.security_sql();defaults=m.creator_sql();final=m.finalize_sql()
  for name in (m.MIG,m.POST_OWNER,m.P3_OWNER,m.P3GROUP,m.MLOGIN,m.RLOGIN,m.ALOGIN):
   self.assertIn(name,role)
  for creator in (m.MIG,m.POST_OWNER,m.P3_OWNER):
   self.assertIn('ALTER DEFAULT PRIVILEGES FOR ROLE '+creator,defaults)
  self.assertIn('defaclnamespace=0',defaults)
  self.assertIn('REVOKE CREATE ON DATABASE neondb FROM '+m.MIG,final)
  self.assertIn('HFT019_RUNTIME_DIRECT_TABLE_PRIVILEGE',final)
  self.assertIn('HFT019_PUBLIC_FUNCTION_EXECUTE_NOT_REVOKED',final)
  self.assertNotIn('PASSWORD ',role)
 def test_proxy_backend_pg_stat_ssl_false_is_not_incorrectly_called_client_failure(self):
  with patch.object(m,'q',return_value=m.DB+'|'+m.MIG+'|'+m.PGNUM+'|false|'):
   info=m.sql_attest({},m.MIG)
  self.assertEqual(info.split('|')[3],'false')
 def test_psql_error_is_sanitized(self):
  fake=type('R',(),{'returncode':1,'stdout':'','stderr':'SYNTHETIC_PRIVATE_SECRET'})()
  with patch.object(m.subprocess,'run',return_value=fake):
   with self.assertRaises(m.Stop) as ctx:m.q('SELECT 1',{})
  self.assertEqual(str(ctx.exception),'PSQL_EXIT:1')
  self.assertNotIn('SYNTHETIC_PRIVATE_SECRET',str(ctx.exception))

if __name__=='__main__': unittest.main()

