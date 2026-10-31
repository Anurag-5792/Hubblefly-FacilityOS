import importlib.util, json, tempfile, unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/'tools'/'hft_neon_staging_bootstrap.py'; S=importlib.util.spec_from_file_location('m',P); m=importlib.util.module_from_spec(S); S.loader.exec_module(m)
class T(unittest.TestCase):
 def test_target(self): self.assertEqual((m.PROJECT,m.BRANCH,m.BRANCH_NAME,m.DB,m.BASE),('red-silence-36758131','br-dawn-moon-azd9xzrp','vercel-dev','neondb','59fc9b758b28692103bb7bcc99fa8173cee478b5'))
 def test_hashes(self): self.assertEqual([x[0] for x in m.MIGS],list(range(1,7))); self.assertEqual(m.MIGS[-1][2],'664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 def test_security(self):
  s=m.security_sql(); self.assertIn('REVOKE CONNECT,TEMPORARY,CREATE ON DATABASE neondb FROM PUBLIC;',s); self.assertIn('GRANT CONNECT,CREATE ON DATABASE neondb TO hft_staging_migration_owner;',s); self.assertNotIn('GRANT CREATE ON DATABASE neondb TO hft_staging_app_runtime',s)
 def test_public_function_default(self): self.assertIn('ALTER DEFAULT PRIVILEGES FOR ROLE hft_staging_migration_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;',m.creator_sql())
 def test_0001(self):
  s=m.statement(1,m.MIGS[0][2],'CREATE SCHEMA hft;'); self.assertIn('MIGRATION_0001_UNEXPECTED_STATE',s); self.assertIn('INSERT INTO hft.schema_revision',s); self.assertNotIn('COMMIT;',s); self.assertNotIn('pg_try_advisory_xact_lock',s)
 def test_later_hash_guard(self): self.assertIn(m.MIGS[0][2],m.statement(2,m.MIGS[1][2],'SELECT 1;'))
 def test_finalize(self):
  s=m.finalize_sql(); self.assertIn('REVOKE CREATE ON DATABASE neondb FROM hft_staging_migration_owner;',s); self.assertIn('GRANT SELECT ON hft.schema_revision TO hft_r1_audit_verify;',s)
 def test_human_separation(self):
  class A: pass
  a=A(); a.execute=True; a.authorization_id='HFT-R1-MASTER-V3-EXEC'; a.decision_maker='Officer A'; a.operator='Operator A'; a.evidence_custodian='Custodian A'; a.independent_verifier='Operator A'
  with self.assertRaises(m.Stop): m.authority(a)
 def test_attestation(self):
  d={'project_id':m.PROJECT,'branch_id':m.BRANCH,'branch_name':m.BRANCH_NAME,'database':m.DB,'database_owner':m.OWNER,'endpoint_id':m.ENDPOINT,'endpoint_host':m.HOST,'endpoint_type':'read_write','region_id':'aws-ap-southeast-1','postgres_version':'18.6','production_branch_touched':False,'captured_at_utc':'2026-10-31T09:00:00Z'}
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'a.json'; p.write_text(json.dumps(d)); self.assertEqual(len(m.attest(p)),64); d['endpoint_id']='bad'; p.write_text(json.dumps(d));
   with self.assertRaises(m.Stop): m.attest(p)
if __name__=='__main__': unittest.main()
