"""Static P0 candidate checks only. NOT SQL parse, migration or PostgreSQL execution."""
import json
from pathlib import Path
import re
import unittest
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql").read_text()
API=(ROOT/"app/api/hft/stores/submit/route.ts").read_text()
READ_API=(ROOT/"app/api/hft/stores/read/route.ts").read_text()
SERVICE=(ROOT/"lib/hft/stores/p0-persistence.ts").read_text()
READ=(ROOT/"lib/hft/stores/p0-readback.ts").read_text()

class P0Contract(unittest.TestCase):
 def test_01_migrations_0001_0006_unchanged_inventory(self):
  migrations=sorted(p.name for p in (ROOT/"db/migrations").glob("*.sql"))
  self.assertEqual(len(migrations),6)
  manifest=json.loads((ROOT/"db/migrations/manifest.v1.json").read_text())
  self.assertEqual(len(manifest["migrations"]),6)
  self.assertIn("NOT AN AUTHORIZED MIGRATION",SQL)
  self.assertNotIn("CREATE EXTENSION",SQL)

 def test_02_one_existing_p2_protected_writer_not_second_table_adapter(self):
  self.assertIn("postProtectedStockCommand",SERVICE)
  self.assertIn("P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION",SERVICE)
  self.assertIn("P2_WRITER_VERSION_COUPLED_V1",SERVICE)
  self.assertIn("P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED",SQL)
  for forbidden in ("INSERT INTO hft.stock_account","UPDATE hft.stock_account",
                    "INSERT INTO hft.stock_command","INSERT INTO hft.stock_entry"):
   self.assertNotIn(forbidden,SERVICE)
   self.assertNotIn(forbidden,SQL)

 def test_03_signed_identity_no_fake_posted_or_browser_actor(self):
  for source in (API,READ_API):
   self.assertIn("resolveVerifiedRequestOperator",source)
   self.assertIn("assertVerifiedRequestOperator",source)
   self.assertIn("no-store",source)
   self.assertNotIn("NEXT_PUBLIC_",source)
  for field in ("actorSubject","sessionId","payloadSha256",
                "macSha256","keyVersion","nonce"):
   self.assertIn(field,SQL)
   self.assertIn(field,SERVICE)
  self.assertIn("hft_crypto.hmac",SQL)
  self.assertIn("p0_stores_payload_fields_v1",SQL)

 def test_04_count_is_nonposting_immutable_evidence(self):
  for token in ("p0_count_epoch","p0_count_snapshot","p0_count_observation",
    "p0_count_audit","p0_count_proof_nonce",
    "immutable", "COUNT_OBSERVATION_COMMITTED",
    "'stockChanged',false","'postingAuthorized',false",
    "P0_COUNT_VERIFIED_EPOCH_REQUIRED","P0_COUNT_COUNTER_NOT_QUALIFIED"):
   self.assertIn(token,SQL)
  self.assertIn("HFT:GATE:",SQL)
  self.assertIn("P0_COUNT_SNAPSHOT_LOCATION_DRIFT",SQL)
  self.assertIn("p0_count_serial_unique_epoch",SQL)
  self.assertIn("p0_reconcile_count_observation_v1",SQL)
  self.assertIn("P0_COUNT_COMMITTED_READBACK_REQUIRED_NO_RETRY",SERVICE)

 def test_05_location_requires_certified_actual_p3_parent_path(self):
  self.assertIn("certified_location_version",SQL)
  self.assertIn("p0_resolve_count_leaf_v1",SQL)
  self.assertIn("P0_COUNT_LOCATION_NOT_LEAF",SQL)
  self.assertIn("P0_COUNT_LOCATION_HIERARCHY_INVALID",SQL)
  self.assertIn("floor_approved",SQL)
  self.assertIn("P0_COUNT_LEAF_PATH_INCOMPLETE",SQL)
  self.assertIn("item_version_catalog",SQL)

 def test_06_proposed_sql_does_not_grant_runtime_table_access(self):
  self.assertIn("REVOKE ALL ON hft_secret.p0_stores_proof_key",SQL)
  self.assertIn("REVOKE EXECUTE ON FUNCTION",SQL)
  self.assertNotIn("GRANT INSERT ON hft.p0_count_observation TO hft_r1_app_runtime",SQL)
  self.assertNotIn("GRANT SELECT ON hft.p0_count_observation TO hft_r1_app_runtime",SQL)
  self.assertNotIn("GRANT EXECUTE ON FUNCTION hft.p0_append_count_observation_v1(jsonb,jsonb)\n TO hft_r1_app_runtime",SQL)

 def test_07_readback_only_vetted_function_and_version(self):
  self.assertIn("hft.p0_read_authoritative_stores_v1",READ)
  self.assertIn("P2_VERSION_AWARE_V1",READ)
  self.assertIn("P0_READ_ROW_SCOPE_OR_VERSION_MISMATCH",READ)
  self.assertNotRegex(READ,r"\bFROM hft\.(stock_account|employee_custody|stock_entry)")
  self.assertIn("P0_READ_AUTHORITY_UNQUALIFIED",READ_API)
  self.assertIn("P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED",SQL)
  self.assertIn("hft.p0_read_authoritative_stores_v1(jsonb,jsonb)",SQL)

 def test_08_sql_name_mapping_for_js_p0_count_proof(self):
  fields=["contractVersion","requestId","kind","legalEntityId","siteId","warehouseId",
     "itemCode","productVersion","controlType","quantity","uom","serialNo","batchNo"]
  match=re.search(r"DECLARE names text\[\]:=ARRAY\[(.*?)\];\s*extra text\[\]",SQL,re.S)
  self.assertIsNotNone(match)
  self.assertEqual(re.findall(r"'([A-Za-z0-9]+)'",match.group(1)),fields)
  self.assertIn("hft.p2_length_prefixed_v1",SQL)
  self.assertIn("ORDER BY ordinal",SQL)

if __name__=="__main__":
 unittest.main()
