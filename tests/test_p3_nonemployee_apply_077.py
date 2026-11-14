"""R77 P3 nonemployee APPLY: reviewed source candidate only; no DB execution."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"db/security/HFT-R1-P3-NONEMPLOYEE-APPLY-NONEXECUTABLE.sql"
P3=(ROOT/"db/security/HFT-R1-P3-MASTERS-REVIEW.sql").read_text()
class NonEmployeeApply077(unittest.TestCase):
 def test_stop_before_ddl_and_no_migration_or_runtime_grants(self):
  sql=PATH.read_text()
  self.assertIn("P3_R77_NONEMPLOYEE_APPLY_INSTALLATION_NOT_AUTHORIZED",sql)
  self.assertLess(sql.index("RAISE EXCEPTION 'P3_R77_NONEMPLOYEE_APPLY_INSTALLATION_NOT_AUTHORIZED'"),
   sql.index("ALTER TABLE"))
  self.assertEqual(sql.count("CREATE FUNCTION hft.p3_decide_apply_nonemployee_v1("),1)
  self.assertEqual(sql.count("COMMIT;"),1)
  self.assertNotIn("GRANT EXECUTE ON FUNCTION",sql)
  self.assertNotIn("CREATE ROLE",sql)
  self.assertNotIn("hft.stock_entry SET",sql)
  self.assertNotIn("INSERT INTO hft.stock_entry",sql)
  self.assertEqual(len(list((ROOT/"db/migrations").glob("*.sql"))),6)
 def test_signed_original_maker_checker_and_acl(self):
  sql=PATH.read_text()
  for text in (
   "HFT-R1-P3-NONEMPLOYEE-DECISION-HMAC-V1",
   "P3_R77_INDEPENDENT_HUMAN_REVIEW_REQUIRED",
   "maker_person=reviewer_person",
   "hft.p3_master_approver_qualification",
   "hft.p3_master_qualification_revocation",
   "hft.p3_master_actor_grant_revocation",
   "hft.p3_master_action_policy",
   "hft.p3_master_decision_nonce",
   "hft.p3_master_revision",
   "hft.p3_master_audit",
   "HFT:GATE:",
   "HFT:P3:MASTER:",
   "P3_R77_DUPLICATE_MASTER_IDENTITY",
   "P3_R77_STALE_MASTER_REVISION_OR_STATE",
   "P3_R77_MASTER_ATOMIC_COMPARE_AND_SET_FAILED",
   "P3_R77_APPLIED_REVISION_OR_INACTIVE_CREATE_FAILED",
   "SERIALIZABLE",
  ):
   if text=="SERIALIZABLE":
    self.assertIn("'serializable'",sql)
   else:self.assertIn(text,sql)
 def test_no_autoactive_or_warehouse_bootstrap(self):
  sql=PATH.read_text()
  for name in ("item","supplier","location"):
   self.assertIn("INSERT INTO hft."+name+"(",sql)
  self.assertIn("false,1",sql)
  self.assertIn("P3_R77_FIRST_OR_NEW_WAREHOUSE_REQUIRES_SEPARATE_BOOTSTRAP",sql)
  self.assertIn("P3_R77_LOCATION_P0_CERTIFICATION_APPLY_NOT_QUALIFIED",sql)
  self.assertIn("P3_R77_LOCATION_INDIRECT_PARENT_CYCLE",sql)
  self.assertIn("P3_R77_ITEM_HAS_PROTECTED_STOCK_HISTORY",sql)
  self.assertIn("P3_R77_WAREHOUSE_OPERATIONAL_HISTORY_HOLD",sql)
 def test_employee_authority_is_unchanged(self):
  sql=PATH.read_text()
  self.assertNotIn("INSERT INTO hft.employee(",sql)
  self.assertIn("CREATE FUNCTION hft.p3_decide_apply_employee_v1(",P3)
  self.assertIn("P3_ELIGIBLE_INDEPENDENT_PERSON_REQUIRED",P3)
 def test_no_public_or_unqualified_service_integration(self):
  sql=PATH.read_text()
  self.assertIn("REVOKE ALL ON FUNCTION",sql)
  service=(ROOT/"lib/hft/masters/p3-service.ts").read_text()
  self.assertNotIn("p3_decide_apply_nonemployee_v1",service)
  middleware=(ROOT/"middleware.ts").read_text()
  self.assertNotIn("/api/hft/masters/nonemployee",middleware)
if __name__=="__main__":unittest.main()
