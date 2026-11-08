"""Bounded no-database qualification manifest tests; no GitHub or PG writes."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
 "hft_ops_a2_pg18_qualification_bundle",
 ROOT/"tools/hft_ops_a2_pg18_qualification_bundle.py")
assert spec is not None and spec.loader is not None
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Manifest061(unittest.TestCase):
 def test_exact_head_and_source_hashes_without_any_db_execution(self):
  expected="a"*40
  with patch.object(mod,"run_head",return_value=expected):
   result=mod.create_manifest(expected)
  self.assertEqual(result["frozen_review_head"],expected)
  self.assertEqual(result["postgresql_required"],"18.6")
  self.assertEqual(result["execution_evidence"],"NOT_EXECUTED")
  self.assertEqual(result["gate_r"],"HOLD")
  self.assertEqual(result["gate_a"],"HOLD")
  self.assertEqual(result["production"],"NO-GO")
  self.assertEqual(len(result["test_matrix"]),16)
  self.assertEqual([v["id"] for v in result["test_matrix"]],mod.MATRIX)
  self.assertTrue(all(v["result"]=="NOT_EXECUTED" for v in result["test_matrix"]))
  self.assertTrue(all(len(v["sha256"])==64 for v in result["source_files"].values()))
  self.assertIn("db/migrations/0006_hft_posted_fact_integrity.sql",
                result["source_files"])
 def test_wrong_head_or_unpinned_sha_fails_before_manifest(self):
  with patch.object(mod,"run_head",return_value="a"*40):
   with self.assertRaisesRegex(ValueError,"FROZEN_HEAD_MISMATCH"):
    mod.create_manifest("b"*40)
   with self.assertRaisesRegex(ValueError,"EXACT_HEAD_SHA_REQUIRED"):
    mod.create_manifest("HEAD")
 def test_no_runtime_write_or_protected_sql_execution_in_manifest_tool(self):
  tool=(ROOT/"tools/hft_ops_a2_pg18_qualification_bundle.py").read_text()
  self.assertNotIn("psycopg.connect",tool)
  self.assertNotIn("psql -f",tool)
  self.assertNotIn("ALTER TABLE hft",tool)
  self.assertNotIn("CREATE ROLE ",tool)
  self.assertIn("NOT_EXECUTED",tool)
  self.assertIn("Protected execution gate",tool)

if __name__=="__main__":unittest.main()
