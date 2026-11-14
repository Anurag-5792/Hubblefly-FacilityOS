"""OPS-014 source qualification regression; NEVER invokes a live database."""
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.hft_r1_operational_readiness import (
 ROOT,SCHEMA,SOURCE_BLOCKERS,PROTECTED_HOLD_PINS,evaluate_source
)


class OperationalFirstReadiness(unittest.TestCase):
 def test_exact_current_source_blockers_are_reported_without_go(self):
  report=evaluate_source(ROOT)
  self.assertEqual(report["schema"],SCHEMA)
  self.assertEqual(report["mode"],"READ_ONLY_SOURCE_ONLY_NEVER_AUTHORIZES")
  self.assertEqual(report["release"],"NO_GO")
  self.assertEqual(report["gateR"],"HOLD")
  self.assertEqual(report["gateA"],"HOLD")
  self.assertEqual(report["production"],"NO_GO")
  self.assertEqual(len(report["source_checks"]),len(SOURCE_BLOCKERS))
  self.assertTrue(all(x["status"]=="KNOWN_SOURCE_BLOCKER"
                      for x in report["source_checks"]))
  self.assertTrue(all(len(x["sha256"])==64 for x in report["source_checks"]))
  self.assertGreaterEqual(len(report["remaining_external_requirements"]),7)

 def test_actual_protected_references_and_trust_remain_hold(self):
  report=evaluate_source(ROOT)
  self.assertEqual(len(report["protected_hold_pins"]),11)
  self.assertEqual(len(PROTECTED_HOLD_PINS),11)
  self.assertTrue(all(x["status"]=="HOLD"
                      for x in report["protected_hold_pins"]))
  self.assertFalse(any("GO"==x["status"]
                       for x in report["protected_hold_pins"]))

 def test_missing_source_never_infers_operational_readiness(self):
  with tempfile.TemporaryDirectory() as td:
   report=evaluate_source(Path(td))
  self.assertEqual(report["release"],"NO_GO")
  self.assertTrue(all(x["status"]=="SOURCE_UNAVAILABLE_REVIEW_REQUIRED"
                      for x in report["source_checks"]))
  self.assertTrue(all(x["status"]=="MISSING_OR_CHANGED_REVIEW_REQUIRED"
                      for x in report["protected_hold_pins"]))

 def test_removed_rejection_stub_requires_independent_review_not_auto_go(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td)
   for _id,path,_marker in SOURCE_BLOCKERS:
    source=ROOT/path
    target=root/path
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
     shutil.copyfile(source,target)
   sql=root/"db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql"
   source=sql.read_text()
   self.assertIn("RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED'",source)
   sql.write_text(source.replace(
    "RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED'",
    "RAISE EXCEPTION 'UNREVIEWED_CHANGE';"))
   report=evaluate_source(root)
  found=next(x for x in report["source_checks"] if
             x["id"]=="P0_RECEIPT_ISSUE_VERSION_WRITER_REJECTS")
  self.assertEqual(found["status"],
                   "SOURCE_CHANGED_INDEPENDENT_REQUALIFICATION_REQUIRED")
  self.assertEqual(report["release"],"NO_GO")
  self.assertEqual(report["gateA"],"HOLD")

 def test_protected_pin_change_never_clears_gate_a(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td)
   path=root/PROTECTED_HOLD_PINS[0]
   path.parent.mkdir(parents=True)
   path.write_text("a"*64+"\n")
   report=evaluate_source(root)
  self.assertEqual(report["protected_hold_pins"][0]["status"],
                   "MISSING_OR_CHANGED_REVIEW_REQUIRED")
  self.assertEqual(report["release"],"NO_GO")
  self.assertEqual(report["gateR"],"HOLD")
  self.assertEqual(report["gateA"],"HOLD")

 def test_no_db_or_external_providers_in_preflight(self):
  source=(ROOT/"tools/hft_r1_operational_readiness.py").read_text()
  for forbidden in ("import pg","import requests","import psycopg",
                    "import subprocess","import urllib","connect(",
                    "requests.get","CREATE ROLE","ALTER ROLE"):
   self.assertNotIn(forbidden,source)


if __name__=="__main__":
 unittest.main()
