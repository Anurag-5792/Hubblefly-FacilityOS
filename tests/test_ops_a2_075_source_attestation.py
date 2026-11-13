"""Source hash inventory and HF17 documentary traceability; NO PG acceptance."""
from pathlib import Path
import importlib.util
import unittest

ROOT=Path(__file__).resolve().parents[1]

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path)
 m=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(m)
 return m

class SourceQualification075(unittest.TestCase):
 def test_manifest_and_protected_source_hash_inventory(self):
  m=load("hft_075_attest","tools/hft_ops_a2_075_migration_attestation.py")
  result=m.source_attestation(require_clean=False)
  self.assertEqual(result["observed_pg18_installation"],"NOT_EXECUTED")
  self.assertIsNone(result["executable_migration_sha256"])
  self.assertIsNone(result["approved_database_identity"])
  self.assertEqual(len(result["canonical_migrations"]),6)
  self.assertEqual(len(result["protected_candidate_sha256"]),7)
  self.assertEqual(result["sql_parser_acceptance"],"NOT_TESTED")

 def test_original_fixture_coverage_not_fabricated(self):
  m=load("hft_075_crosswalk","tools/hft_ops_a2_075_hf17_documentary_crosswalk.py")
  m.validate()
  self.assertEqual(len(m.DOCUMENTARY),8)
  self.assertEqual(len(m.A2_STATUS),16)
  self.assertTrue(all(f.status=="NOT_TESTED" for f in m.DOCUMENTARY))
  self.assertTrue(all(f.coverage!="COMPLETE" for f in m.DOCUMENTARY))
  self.assertEqual(len(m.FAULT_SPLITS),11)
  self.assertEqual(m.ASSERTION_F07["execution"],"NOT_TESTED")
  self.assertEqual(m.ASSERTION_F07["expected_sqlstate"],"NOT_QUALIFIED")

if __name__=="__main__":
 unittest.main()
