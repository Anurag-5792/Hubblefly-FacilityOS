"""QA070-07: deny any observer SQL other than fixed approved operations."""
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"tools/hft_ops_a2_067_pg18_harness.py"
spec=importlib.util.spec_from_file_location("hft_qa067_harness_allowlist",PATH)
harness=importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

class ExactObserverSQL(unittest.TestCase):
 def test_fixed_backend_identity_query(self):
  self.assertTrue(harness._observer_query_allowed(harness.GATEWAY_IDENTITY_QUERY))
  self.assertFalse(harness._observer_query_allowed(
   harness.GATEWAY_IDENTITY_QUERY+" SELECT 1;"))

 def test_exact_catalog_gateway(self):
  uuid="00000000-0000-4000-8000-000000000001"
  for execute in (False,True):
   function="exercise_case_v1" if execute else "observe_case_v1"
   sql=("SELECT pg_catalog.row_to_json(v)::text FROM ("
        f"SELECT hft_qa067.{function}('OPS063-F01'::text,"
        f"'{uuid}'::uuid) AS evidence) AS v;")
   self.assertTrue(harness._observer_query_allowed(sql))
   for altered in (
    sql+" DELETE FROM hft.stock_entry;",
    sql.replace("OPS063-F01","OPS063-F99"),
    sql.replace("hft_qa067.","public."),
    sql.replace(uuid,"' || current_user || '"),
    sql.replace("SELECT", "WITH x AS (SELECT 1) SELECT",1),
    "select "+sql[7:],
   ):
    self.assertFalse(harness._observer_query_allowed(altered))

 def test_no_arbitrary_sql_or_role_switch(self):
  for sql in ("SELECT 1;","SET ROLE hft_r1_posting_owner;",
              "UPDATE hft.stock_entry SET id=1;",
              "SELECT hft_qa067.exercise_case_v1('OPS063-F01'::text,"
              "'00000000-0000-4000-8000-000000000001'::uuid);"):
   self.assertFalse(harness._observer_query_allowed(sql))

if __name__=="__main__":
 unittest.main()
