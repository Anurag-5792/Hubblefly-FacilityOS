"""Static source contract checks only; not a real online database test."""
from pathlib import Path
import json
import unittest
ROOT=Path(__file__).resolve().parents[1]
def read(path): return (ROOT/path).read_text()
T=read("lib/hft/persistence/online-pg-transport.ts")
C=read("lib/hft/persistence/online-db-qualification.ts")
P2=read("lib/hft/persistence/protected-posting-transaction.ts")
P3=read("lib/hft/masters/p3-database.ts")
P0=read("lib/hft/stores/p0-persistence.ts")
class OnlineSource(unittest.TestCase):
 def test_online_security_and_separate_roles(self):
  for s in ("rejectUnauthorized:true","servername:c.host","minVersion:'TLSv1.2'",
   "HFT_ONLINE_P2_DB_PASSWORD","HFT_ONLINE_P3_DB_PASSWORD",
   "HFT_P2_RUNTIME_LOGIN","HFT_P3_RUNTIME_LOGIN","'PGUSER','PGPASSWORD'"):
   self.assertIn(s,T)
  self.assertNotIn("rejectUnauthorized:false",T)
 def test_existing_single_writer_and_production_denials(self):
  self.assertIn("postProtectedStockCommand",P0)
  self.assertIn("P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION",P0)
  self.assertIn("ISOLATED_ONLINE_DB_TEST",P2)
  self.assertIn("ISOLATED_ONLINE_DB_TEST",P3)
  self.assertIn("PRODUCTION_STARTUP_NOT_AUTHORIZED",read("lib/hft/security/authorization.ts"))
 def test_actual_role_catalog_guards(self):
  for s in ("has_table_privilege","has_sequence_privilege","has_function_privilege",
   "NOT owner.rolcanlogin","hft.p0_append_count_observation_v1"):
   self.assertIn(s,C)
  self.assertIn("assertOnlineRuntimeCatalog(client,'P2_STORES')",P2)
  self.assertIn("assertOnlineRuntimeCatalog(client,'P3_MASTERS')",P3)
 def test_no_migration_replacement(self):
  self.assertEqual(len(list((ROOT/"db/migrations").glob("*.sql"))),6)
  self.assertEqual(len(json.loads(read("db/migrations/manifest.v1.json"))["migrations"]),6)
 def test_online_preflight_is_separate_from_full_source_verify(self):
  p=json.loads(read("package.json"))["scripts"]
  self.assertIn("verify:online-db",p)
  self.assertIn("verify:online-db:masters",p)
  self.assertNotIn("verify:online-db",p["verify"])
if __name__=="__main__":
 unittest.main()
