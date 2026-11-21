"""A2-PG-01..16 are traceable plans, not claimed PostgreSQL executions."""
from importlib.util import module_from_spec,spec_from_file_location
from pathlib import Path
import unittest

PATH=Path(__file__).resolve().parents[1]/"tools/hft_ops_a2_075_original_fixture_registry.py"
spec=spec_from_file_location("ops_a2_075_fixture_registry",PATH)
module=module_from_spec(spec)
spec.loader.exec_module(module)

class OriginalFixtureRegistry075(unittest.TestCase):
 def test_all_sixteen_exact_and_unexecuted(self):
  module.validate()
  self.assertEqual(len(module.PLANS),16)
  self.assertEqual(len({p.id for p in module.PLANS}),16)
  self.assertTrue(all(p.status=="NOT_TESTED" for p in module.PLANS))
  self.assertTrue(all("positive_transaction_commit" in p.required_evidence
      and "independent_verifier" in p.required_evidence
      and "accountable_witness" in p.required_evidence
      and "approved_executable_migration_sha" in p.required_evidence
      for p in module.PLANS))
 def test_required_adverse_cases_traceable(self):
  all_text=" ".join(p.positive+" "+p.adverse for p in module.PLANS)
  for marker in ("self","2Q","GRN","CUSTODY","RETURN",
                 "revision","metadata","DISPUTED","ACK","EXTERNAL",
                 "nonce","blind","Concurrent","Second leg","BIN02","inspector"):
   self.assertIn(marker.lower(),all_text.lower())

if __name__=="__main__":unittest.main()
