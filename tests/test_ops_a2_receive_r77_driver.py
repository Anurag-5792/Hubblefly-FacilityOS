"""R77 receive gateway/driver contract checks only. No PostgreSQL execution."""
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
DRIVER=ROOT/"tools/hft_r77_receive_pg18_acceptance.mjs"
GATE=ROOT/"db/qa/HFT-R1-R77-RECEIVE-QUALIFICATION-GATEWAY-NONEXECUTABLE.sql"
SCHEMA=ROOT/"tests/fixtures/hft_r77_receive_admission.schema.json"
ACL=ROOT/"db/security/HFT-R1-OPS-A2-ACL-CLOSURE-NONEXECUTABLE.sql"
class R77ReceiveDriverContract(unittest.TestCase):
 def test_direct_protected_writer_or_recovery_never_called_by_qa_driver(self):
  text=DRIVER.read_text()
  for sql in ("SELECT hft.ops_a2_post_stock_command_v2(",
              "SELECT hft.ops_a2_reconcile_post_v3(",
              "SELECT hft.ops_a2_read_authoritative_v2("):
   self.assertNotIn(sql,text)
  for sql in ("hft_qa077.post_receive_v1(", "hft_qa077.reconcile_receive_v1(",
              "hft_qa077.observe_receive_v1(", "hft_qa077.read_receive_v1(",
              "hft_qa077.challenge_receive_v1("):
   self.assertIn(sql,text)
 def test_runtime_acl_closed_and_gateway_is_new_stop_guarded_candidate(self):
  sql=GATE.read_text();acl=ACL.read_text()
  self.assertIn("HFT_R77_RECEIVE_QUALIFICATION_INSTALLATION_HOLD",sql)
  self.assertLess(sql.index("RAISE EXCEPTION 'HFT_R77_RECEIVE_QUALIFICATION_INSTALLATION_HOLD'"),
    sql.index("CREATE SCHEMA hft_qa077"))
  self.assertNotIn("GRANT EXECUTE ON FUNCTION",sql)
  self.assertNotIn("CREATE ROLE",sql)
  self.assertIn("REVOKE ALL ON FUNCTION",sql)
  self.assertIn("hft_r77_gateway_owner",sql)
  self.assertIn("SECURITY DEFINER",sql)
  self.assertIn("pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')",sql)
  self.assertIn("hft.ops_a2_post_stock_command_v2(p,original_proof)",sql)
  self.assertIn("hft.ops_a2_reconcile_post_v3(",sql)
  self.assertIn("hft.ops_a2_read_authoritative_v2(",sql)
  self.assertIn("'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)','EXECUTE'",acl)
 def test_pg18_session_identity_denies_direct_acl(self):
  text=DRIVER.read_text()
  for token in ("HFT_R77_DISPOSABLE_EXECUTION_APPROVED",
   "HFT_LIVE_POSTING_ENABLED","hft_r1_disposable_",
   "server_version_num","180006","PGSSLMODE==='verify-full'",
   "HFT_R77_PG_CA_FILE","direct_writer===false",
   "direct_recovery===false","direct_reader===false",
   "gateway_member===false","owner_member===false",
   "other_login_gateway_post_execute===0",
   "qa_stock_entry_dml===false","gateway_ledger_dml===false",
   "resourceSha256","ONLINE_TLS","LOCAL_TLS",
   "PG_RESOURCE_OR_ACL_NOT_QUALIFIED"):
   self.assertIn(token,text)
 def test_real_distinct_5u_and_serial_fixtures_with_signed_sources(self):
  text=DRIVER.read_text()
  for token in ("FIVE_UNIT_BULK_MANDATORY","ONE_UNIT_SERIAL_MANDATORY",
   "REAL_SIGNED_ORIGINAL_PROOF_REQUIRED","ORIGINAL_INVOICE_QC_RECEIPT",
   "EXACT_PHYSICAL_RECEIPT_UNVERIFIED","SIGNED_READ_PAIR_REQUIRED",
   "FRESH_DISTINCT_READ_NONCES_REQUIRED","approvalDecisionSha256"):
   self.assertIn(token,text)
  schema=json.loads(SCHEMA.read_text())
  self.assertEqual(schema["properties"]["caseId"]["enum"][:2],["BULK_5","SERIAL_1"])
  self.assertIn("postingProof",schema["required"])
  self.assertEqual(len(schema["properties"]["payload"]["required"]),33)
  self.assertIn("resourceSha256",schema["properties"]["admission"]["required"])
  for key in ("invoiceEvidenceSha256","qcEvidenceSha256",
              "physicalReceiptEvidenceSha256"):
   self.assertIn(key,schema["properties"]["admission"]["required"])
   self.assertIn(key,GATE.read_text())
  self.assertNotIn("example",schema.get("properties",{}))
 def test_true_late_posting_fault_and_complete_rollback_observer(self):
  text=DRIVER.read_text()
  start=text.index("if(f.caseId==='LATE_ROLLBACK')")
  fault=text.index("await p.query('SELECT 1/0 AS intentional_failure_after_writer')",start)
  self.assertIn("await posting(p,f);posted=true;",text[start:fault])
  self.assertLess(fault,text.index("await p.query('ROLLBACK');rolledBack=true;",fault))
  self.assertIn("stableEvidence(before)===stableEvidence(after)",text)
  self.assertIn("countZero(after)",text)
  self.assertIn("await recover(reader,f)",text)
  for token in ("'allGrnLines'","'invoiceLine'","'sourceBinding'","'approval'",
   "'approvalDecision'","'receipt'","'serial'","'account'","'nonce'",
   "'seals'","'audit'","'auditDelivery'","'envelopes'","'outcomes'"):
   self.assertIn(token,GATE.read_text())
 def test_separate_authenticated_balance_movement_and_recovery(self):
  text=DRIVER.read_text()
  for token in ("'BALANCES'","'MOVEMENTS'","after.balances.rows",
   "read.rows.filter","EXTERNAL","AVAILABLE","accountBeforeVersion",
   "accountAfterVersion","auditSha256","COMMITTED_VERIFIED",
   "UNKNOWN_COMMIT_DO_NOT_REPOST","automaticRetryAllowed===false"):
   self.assertIn(token,text)
 def test_exact_negative_cases_without_actor_or_proof_fabrication(self):
  text=DRIVER.read_text();sql=GATE.read_text()
  for case in ("INVALID_ACTOR","WRONG_BIN","CHANGED_QUANTITY",
   "FORGED_RECEIPT","INVALID_APPROVAL","REPLAY"):
   self.assertIn(case,text);self.assertIn(case,sql)
  self.assertIn("PROTECTED_WRITER_REJECTED",sql)
  self.assertIn("EXCEPTION WHEN OTHERS",sql)
  self.assertIn("R77_UNEXPECTED_NEGATIVE_WRITER_ACCEPTANCE",sql)
  self.assertIn("NEGATIVE_EXACT_PROTECTED_DENIAL_REQUIRED",text)
if __name__=="__main__":unittest.main()
