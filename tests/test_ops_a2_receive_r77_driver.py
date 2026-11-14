"""R77 executable acceptance-driver source controls. Never connects to PostgreSQL."""
from pathlib import Path
import unittest

SOURCE=Path(__file__).resolve().parents[1]/"tools/hft_r77_receive_pg18_acceptance.mjs"
class R77ReceiveDriverContract(unittest.TestCase):
 def test_execution_is_independently_gated(self):
  text=SOURCE.read_text()
  for token in ("--execute","HFT_R77_DISPOSABLE_EXECUTION_APPROVED",
   "HFT_ENVIRONMENT","HFT_LIVE_POSTING_ENABLED",
   "hft_r1_disposable_","server_version_num","180006",
   "HFT_R77_FIXTURE_FILE"):
   self.assertIn(token,text)
  self.assertNotIn("CREATE ROLE",text)
  self.assertNotIn("CREATE SCHEMA",text)
 def test_late_stage_fault_occurs_after_protected_writer(self):
  text=SOURCE.read_text()
  start=text.index("await p.query('BEGIN ISOLATION LEVEL SERIALIZABLE');")
  fault=text.index("await p.query('SELECT 1/0 AS deliberate_late_failure');",start)
  self.assertIn("await post(p,rollback);",text[start:fault])
  self.assertLess(fault,text.index("await p.query('ROLLBACK');",fault))
  self.assertIn("absent.state==='INDETERMINATE_NOT_FOUND'",text)
  self.assertIn("absent.automaticRetryAllowed===false",text)
 def test_independent_commit_readback_never_reposts(self):
  text=SOURCE.read_text()
  self.assertEqual(text.count("await post(p,good);"),1)
  self.assertIn("await recover(reader,good)",text)
  self.assertIn("COMMIT_OUTCOME_UNCERTAIN_NO_RETRY",text)
 def test_external_is_accountless_and_available_has_version(self):
  text=SOURCE.read_text()
  for token in ("debit.bucket==='EXTERNAL'","debit.accountId===null",
   "debit.account===null","debit.accountBeforeVersion===null",
   "debit.accountAfterVersion===null","credit.bucket==='AVAILABLE'",
   "credit.accountAfterVersion===credit.accountBeforeVersion+1",
   "IMMUTABLE_AUDIT_DIGEST_INVALID"):
   self.assertIn(token,text)
if __name__=='__main__':unittest.main()
