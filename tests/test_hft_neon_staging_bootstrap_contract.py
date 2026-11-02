"""BOOTSTRAP-019 baseline contract retained under SOURCE-FINAL-023."""
import importlib.util,pathlib,unittest
P=pathlib.Path(__file__).resolve().parents[1]/'tools'/'hft_neon_staging_bootstrap.py';S=importlib.util.spec_from_file_location('m',P);m=importlib.util.module_from_spec(S);S.loader.exec_module(m)
class T(unittest.TestCase):
 def test_target(self):self.assertEqual((m.PROJECT,m.BRANCH,m.DB,m.PGNUM),('red-silence-36758131','br-dawn-moon-azd9xzrp','neondb','180006'))
 def test_hashes(self):self.assertEqual(len(m.manifest()),6);self.assertEqual(m.MIGS[-1][2],'664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 def test_source_holds(self):self.assertEqual(m.REVIEW_PIN.read_text().strip(),'HOLD');self.assertEqual(m.EXEC_PIN.read_text().strip(),'HOLD')
 def test_owner_split(self):self.assertIn('GRANT SELECT ON hft.schema_revision',m.owner_close_sql());self.assertNotIn('GRANT SELECT ON hft.schema_revision',m.dba_close_sql())
if __name__=='__main__':unittest.main()
