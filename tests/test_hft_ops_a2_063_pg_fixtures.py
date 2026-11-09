"""Tests for the offline, gated PG-F01..PG-F08 fixture runner. No psql calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import subprocess

ROOT=Path(__file__).resolve().parents[1]
file=ROOT/"tools/hft_ops_a2_063_pg18_fault_cases.py"
spec=importlib.util.spec_from_file_location("pg063_fault_cases",file)
assert spec is not None and spec.loader is not None
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class PG063Manifest(unittest.TestCase):
 def test_eight_declared_fixtures_and_no_execution_by_default(self):
  self.assertEqual(tuple(m.CASES),tuple("PG-F%02d"%i for i in range(1,9)))
  self.assertIn("pgf_row.value->>'entryId'='1'",m.CASES["PG-F07"]["sql"])
  self.assertIn("OR session_user !~",file.read_text())
  for name,c in m.CASES.items():
   with self.subTest(case=name):
    self.assertIn("purpose",c)
    self.assertIn("variables",c)
    self.assertIn("BEGIN ISOLATION LEVEL",c["sql"])
    self.assertIn("ROLLBACK;",c["sql"])
    self.assertTrue(c.get("expect") or c.get("expect_output"))
  with patch.object(m,"subprocess") as calls:
   self.assertEqual(m.main(["--list"]),0)
   calls.run.assert_not_called()

 def test_denies_missing_authority_production_db_and_stale_source_hash(self):
  base={"HFT_OPS_A2_PG063_TECHNICAL_AUTHORITY":"INDEPENDENT_EXPLICIT_063",
    "HFT_APPROVED_SOURCE_SHA":"a"*40,
    "PGDATABASE":"hft_r1_disposable_063tests",
    "PGUSER":"hft_r1_qa_review"}
  with patch.object(m,"head",return_value="a"*40):
   m.qualify_env(base)
   for changes in ({"PGDATABASE":"production"},
    {"PGUSER":"postgres"},
    {"HFT_OPS_A2_PG063_TECHNICAL_AUTHORITY":"SELF_APPROVED"},
    {"HFT_APPROVED_SOURCE_SHA":"b"*40}):
    with self.subTest(changes=changes),self.assertRaises(ValueError):
     m.qualify_env({**base,**changes})

 def test_positive_and_negative_cases_only_pass_expected_db_evidence(self):
  fixture={"cmd":"123e4567-e89b-42d3-a456-426614174000"}
  result=subprocess.CompletedProcess([],3,"","ERROR: OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS")
  with patch.object(m.subprocess,"run",return_value=result) as mock:
   self.assertEqual(m.run_case("PG-F01",fixture,{"PGDATABASE":"hft_r1_disposable_063tests"})["result"],"PASS")
   self.assertIn("BEGIN ISOLATION LEVEL",mock.call_args.kwargs["input"])
   self.assertNotIn("shell",mock.call_args.kwargs)
  with patch.object(m.subprocess,"run",return_value=subprocess.CompletedProcess([],0,"","")):
   self.assertEqual(m.run_case("PG-F01",fixture,{})["result"],"FAIL")
  with patch.object(m.subprocess,"run",return_value=subprocess.CompletedProcess([],0,
    "PG_F07_ONE_DIGIT_ENTRY_PASS","")):
   self.assertEqual(m.run_case("PG-F07",{"query":"{}","proof":"{}"}, {})["result"],"PASS")
  with self.assertRaises(ValueError):
   m.run_case("PG-F06",{"document":"test"}, {})

if __name__=="__main__":unittest.main()
