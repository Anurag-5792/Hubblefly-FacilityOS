"""RUNNER-021 regression redirected to SOURCE-FINAL-023 controls."""
import importlib.util,pathlib,unittest
P=pathlib.Path(__file__).resolve().parents[1]/'tools'/'hft_neon_staging_bootstrap.py';S=importlib.util.spec_from_file_location('m',P);m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class T(unittest.TestCase):
 def test_single_atomic_batch(self):
  s=m.batch_sql(m.manifest());self.assertEqual(s.count('BEGIN;'),1);self.assertEqual(s.count('COMMIT;'),1);self.assertEqual(s.count('INSERT INTO hft.schema_revision'),6)
 def test_review_sql_pinned(self):
  for f in (m.security_sql,m.creator_sql,m.owner_close_sql,m.dba_close_sql):self.assertIn('SOURCE REVIEW ONLY',f())
 def test_runtime_negative_probe_exists(self):self.assertTrue(callable(m.expect_denied))
if __name__=='__main__':unittest.main()
