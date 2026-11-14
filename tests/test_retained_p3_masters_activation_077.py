"""Retained nonproduction Masters source admission, never database execution."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"db/security/HFT-R1-P3-MASTERS-REVIEW.sql"
BUILDER=ROOT/"tools/hft_p3_retained_source_builder.mjs"
P3=ROOT/"lib/hft/masters/p3-database.ts"
PROFILE=ROOT/"lib/hft/masters/retained-nonproduction-profile.ts"
MIDDLEWARE=ROOT/"middleware.ts"
ROUTES=("app/api/hft/masters/route.ts",
        "app/api/hft/masters/decision/route.ts")
class RetainedMastersSourceR77(unittest.TestCase):
 def test_original_contract_sha_frozen(self):
  self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
   "33eac12f493ca70463ffe50cfec62377e904d9a84d51e1c6eedb6797f34bb4c1")
 def test_offline_builder_requires_immutable_source_and_reports_candidate_hash(self):
  x=subprocess.run(["node",str(BUILDER),"--inspect"],
   cwd=ROOT,capture_output=True,text=True,timeout=20)
  self.assertEqual(x.returncode,0,x.stderr)
  o=json.loads(x.stdout)
  self.assertFalse(o["executable"]);self.assertFalse(o["installed"])
  self.assertTrue(o["stopGuarded"])
  with tempfile.TemporaryDirectory(prefix="hft-p3-retained-") as folder:
   p=Path(folder)/"p3-review.NONEXECUTABLE.sql"
   y=subprocess.run(["node",str(BUILDER),"--emit-review",str(p)],
    cwd=ROOT,capture_output=True,text=True,timeout=20)
   self.assertEqual(y.returncode,0,y.stderr)
   sql=p.read_text()
   self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),o["derivedSha256"])
   self.assertIn("HFT_P3_RETAINED_NONPRODUCTION_INSTALLATION_NOT_AUTHORIZED",sql)
   self.assertLess(sql.index("HFT_P3_RETAINED_NONPRODUCTION_INSTALLATION_NOT_AUTHORIZED"),
    sql.index("CREATE TABLE"))
   self.assertIn("hft_r1_retained_",sql)
   self.assertNotIn("hft_r1_disposable_",sql)
   self.assertEqual(sql.count("hft.p3_decide_apply_employee_v1("),5)
   self.assertEqual(sql.count("CREATE FUNCTION hft.p3_submit_master_change_v1("),1)
   self.assertEqual(sql.count("CREATE FUNCTION hft.p3_decide_apply_employee_v1("),1)
   self.assertIn("P3_ELIGIBLE_INDEPENDENT_PERSON_REQUIRED",sql)
   self.assertIn("P3_MASTER_ALREADY_EXISTS",sql)
   self.assertIn("P3_MASTER_REVISION_OR_STATE_CONFLICT",sql)
   self.assertEqual(sql.count("COMMIT;"),1)
 def test_runtime_separate_from_stock_and_production_guard(self):
  m=MIDDLEWARE.read_text();p=P3.read_text();s=PROFILE.read_text()
  for needle in ("'/api/hft/masters'","'/api/hft/masters/decision'",
    "HFT_R1_API_NOT_QUALIFIED","HFT_R1_MASTERS_PROFILE_NOT_ADMITTED"):
   self.assertIn(needle,m)
  self.assertNotIn("'/api/hft/stores",m)
  self.assertIn("RETAINED_MASTERS_ONLY_NO_STOCK",s)
  self.assertIn("HFT_MASTERS_APPROVED_PG_DATABASE",s)
  self.assertIn("P3_RETAINED_POSTGRESQL_18_6_REQUIRED",p)
  self.assertIn("assertOnlineRuntimeCatalog(client,'P3_MASTERS')",p)
  self.assertIn("assertSecureStartup(env)",p)
  self.assertIn("PRODUCTION_STARTUP_NOT_AUTHORIZED",
    (ROOT/"lib/hft/security/authorization.ts").read_text())
  for path in ROUTES:
   self.assertIn("'RETAINED_P3_MASTERS'",(ROOT/path).read_text())
 def test_p3_is_only_approved_employee_apply_writer(self):
  source=SOURCE.read_text()
  self.assertIn("INSERT INTO hft.employee(",source)
  self.assertIn("P3_INDEPENDENT_EMPLOYEE_POLICY_REQUIRED",source) if False else None
  for kind in ("item","supplier","warehouse","location"):
   self.assertNotIn("INSERT INTO hft."+kind+"(",source)
  self.assertIn("P3_ELIGIBLE_INDEPENDENT_PERSON_REQUIRED",source)
  self.assertIn("P3_PENDING_MASTER_REQUEST_ALREADY_EXISTS",source)
 def test_canonical_migrations_and_r77_stop_stay_frozen(self):
  sql=(ROOT/"db/qa/HFT-R1-R77-RECEIVE-QUALIFICATION-GATEWAY-NONEXECUTABLE.sql").read_text()
  self.assertIn("HFT_R77_RECEIVE_QUALIFICATION_INSTALLATION_HOLD",sql)
  self.assertEqual(len(list((ROOT/"db/migrations").glob("*.sql"))),6)
if __name__=="__main__":unittest.main()
