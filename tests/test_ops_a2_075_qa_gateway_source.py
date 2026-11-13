"""075 source-only checks for STOP-guarded QA gateway and fault constructor.
None of these tests establishes PostgreSQL parsing, installation or execution.
"""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
GATE=ROOT/"db/qa/HFT-R1-OPS-A2-QA067-RESTRICTED-GATEWAY-NONEXECUTABLE.sql"
FAULT=ROOT/"db/qa/HFT-R1-OPS-A2-QA067-FAULT-CONSTRUCTOR-NONEXECUTABLE.sql"

class QA067RestrictedSource(unittest.TestCase):
 def test_gateway_stopped_before_all_ddl(self):
  text=GATE.read_text()
  self.assertLess(text.index("HFT_QA067_GATEWAY_PROTECTED_INSTALLATION_HOLD"),
                  text.index("CREATE SCHEMA hft_qa067"))
  self.assertIn("CREATE OR REPLACE FUNCTION hft_qa067.exercise_case_v1(",text)
  self.assertIn("CREATE OR REPLACE FUNCTION hft_qa067.observe_case_v1(",text)
  self.assertIn("REVOKE ALL ON FUNCTION hft_qa067.observe_case_v1",text)
  self.assertNotIn("EXECUTE ",text.split("CREATE OR REPLACE FUNCTION hft_qa067.exercise_case_v1(",1)[1].split("END $qa_exercise$;",1)[0])
  self.assertNotIn("UPDATE hft.stock_account",text)
  self.assertIn("PENDING_INDEPENDENT_FAULT_CONSTRUCTION_NOT_EXECUTED",text)
  self.assertIn("qa_login=session_user",text)
  self.assertIn("pg_catalog.current_setting('transaction_read_only')<>'on'",text)
  self.assertIn("HFT_QA067_FIXTURE_NOT_ADMITTED_FOR_LOGIN",text)

 def test_counter_only_constructor_is_independent_rollback_test(self):
  text=FAULT.read_text()
  self.assertLess(text.index("HFT_QA067_FAULT_CONSTRUCTOR_INSTALLATION_HOLD"),
                  text.index("CREATE SCHEMA hft_qa067_fault"))
  self.assertIn("session_user<>'hft_r1_fault_constructor'",text)
  self.assertIn("pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')",text)
  self.assertIn("SET moved_micro=moved_micro+1",text)
  self.assertIn("RAISE EXCEPTION 'QA067_FAULT_UNEXPECTEDLY_WRITABLE'",text)
  self.assertIn("EXCEPTION WHEN OTHERS THEN",text)
  self.assertIn("GET STACKED DIAGNOSTICS attempted_state=RETURNED_SQLSTATE",text)
  self.assertIn("observed_after IS DISTINCT FROM source.moved_micro",text)
  self.assertIn("UNVERIFIED_CONSTRUCTOR_RESULT_NOT_QA_ACCEPTANCE",text)
  self.assertIn("REVOKE ALL ON FUNCTION hft_qa067_fault.exercise_counter_only_v1",text)

 def test_no_source_file_is_executable_migration(self):
  self.assertTrue(GATE.name.endswith("-NONEXECUTABLE.sql"))
  self.assertTrue(FAULT.name.endswith("-NONEXECUTABLE.sql"))
  self.assertNotIn("/db/migrations/",str(GATE))
  self.assertNotIn("/db/migrations/",str(FAULT))

if __name__=="__main__":unittest.main()
