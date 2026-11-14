"""OPS-A2 061 frozen source qualification checks. NO DATABASE execution.

These tests intentionally distinguish source contracts from real PostgreSQL 18.6
parse, ownership, grant/RLS and multi-session acceptance.
"""
from pathlib import Path
import hashlib
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SEC=ROOT/"db/security"
NAMES=("FOUNDATION","PROOF-AUTHORITY","WRITER","RESOLVER-READ")
FILES=[SEC/f"HFT-R1-OPS-A2-{x}-NONEXECUTABLE.sql" for x in NAMES]
CONSOLIDATED=SEC/"HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql"

class OpsA2061Source(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.sources=[path.read_text(encoding="utf8") for path in FILES]
  cls.foundation,cls.proof,cls.writer,cls.read=cls.sources
  cls.forward=CONSOLIDATED.read_text(encoding="utf8")

 def test_forward_candidate_is_one_guarded_source_not_a_live_migration(self):
  self.assertEqual(len(re.findall(r"^BEGIN;$",self.forward,re.M)),1)
  self.assertEqual(len(re.findall(r"^COMMIT;$",self.forward,re.M)),1)
  self.assertEqual(self.forward.count("OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED"),1)
  self.assertLess(self.forward.index("OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED"),
                  self.forward.index("CREATE TABLE hft.ops_a2_"))
  for source in self.sources:
   self.assertIn("OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED",source)
  self.assertNotIn("GRANT EXECUTE ON FUNCTION hft.ops_a2_",self.forward)
  self.assertEqual(self.forward.count("-- ===== BEGIN SOURCE"),4)

 def test_issuer_roles_and_cryptographic_source_dependencies_preflight_before_ddl(self):
  preflight=self.foundation.split("DO $preflight$",1)[1].split("END $preflight$;",1)[0]
  for required in (
   "to_regrole('hft_r1_posting_owner')",
   "to_regrole('hft_r1_governance_issuer')",
   "to_regrole('hft_r1_app_runtime')",
   "to_regprocedure('hft.ops_a_payload_digest_v2(jsonb)')",
   "to_regprocedure('hft.p2_length_prefixed_v1(text[])')",
   "to_regprocedure('hft_crypto.hmac(bytea,bytea,text)')",
   "to_regclass('hft_secret.p0_stores_proof_key')",
   "to_regclass('hft.protected_approval_decision')",
   "to_regclass('hft.actor_warehouse_grant')",
   "to_regclass('hft.stock_hold')",
   "to_regclass('hft.return_inspection_attestation')",
   "to_regclass('hft.custody_ack_status_v1')"):
   with self.subTest(required=required):self.assertIn(required,preflight)
  self.assertLess(self.foundation.index("END $preflight$;"),
                  self.foundation.index("ALTER TABLE hft.stock_command"))

 def test_zero_only_account_provision_requires_external_approval_and_fact(self):
  f=self.foundation
  for token in (
   "CREATE TABLE hft.ops_a2_account_provision_order(",
   "CREATE TABLE hft.ops_a2_account_provision_receipt(",
   "immutable_ops_a2_account_order","immutable_ops_a2_account_receipt",
   "CREATE OR REPLACE FUNCTION hft.ops_a2_provision_zero_account_v2(",
   "hft.protected_stock_approval","hft.protected_approval_decision",
   "hft.p2_qualified_human_v1","maker=checker",
   "OPS_A2_ACCOUNT_CORPORATE_PERSON_SEPARATION_DENIED",
   "OPS_A2_ACCOUNT_STALE_POLICY","OPS_A2_ACCOUNT_ACTIVE_HOLD",
   "OPS_A2_ACCOUNT_PARENT_HOLD_ACTIVE","OPS_A2_ACCOUNT_CROSS_VERSION_SERIAL_DENIED",
   "INSERT INTO hft.ops_a2_account_provision_receipt(",
   "VALUES(o.account_id,o.legal_entity_id,o.site_id,o.warehouse_id,",
   "o.condition,o.custodian_employee_id,o.serial_no,o.batch_no,0,0,0)",
   "OWNER TO hft_r1_posting_owner"):
   with self.subTest(token=token):self.assertIn(token,f)
  self.assertNotRegex(f,r"GRANT\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+hft\.stock_account")

 def test_transfer_and_binding_issuers_are_independent_of_runtime_posting(self):
  f=self.foundation
  for token in (
   "ops_a2_transfer_issuance_order","ops_a2_transfer_issuance_receipt",
   "immutable_ops_a2_transfer_order",
   "ops_a2_issue_transfer_document_v2(p_order uuid)",
   "OPS_A2_TRANSFER_STABLE_PERSON_INDEPENDENCE_REQUIRED",
   "OPS_A2_TRANSFER_STOCK_HOLD_ACTIVE",
   "OPS_A2_TRANSFER_PARENT_HOLD_ACTIVE",
   "ops_a2_issue_source_binding_v2(",
   "hft.ops_a2_verify_return_proof_v1(p0,p0_proof)",
   "hft.p0_verify_stores_proof_v1(p0,p0_proof)",
   "hft.ops_a2_return_payload_sha256_v1(p0)",
   "OPS_A2_ISSUER_ORIGINAL_CUSTODY_OR_INSPECTION_DENIED",
   "hft.ops_a2_authorized_source_v2(p2)",
   "hft.protected_approval_decision",
   "hft.protected_approval_revocation",
   "hft.protected_approval_supersession",
   "hft.ops_a2_source_binding(",
   "REVOKE ALL ON FUNCTION hft.ops_a2_issue_source_binding_v2",
   "REVOKE ALL ON FUNCTION hft.ops_a2_issue_transfer_document_v2",
   "REVOKE ALL ON FUNCTION hft.ops_a2_provision_zero_account_v2",
   "hft_r1_governance_issuer",
   "pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')"):
   with self.subTest(token=token):self.assertIn(token,f)
  for name in ("ops_a2_provision_zero_account_v2",
               "ops_a2_issue_transfer_document_v2",
               "ops_a2_issue_source_binding_v2"):
   self.assertIn(name,self.forward)
  routes=ROOT/"app/api/hft/stores"
  for path in routes.rglob("route.ts"):
   source=path.read_text()
   self.assertNotIn("ops_a2_issue_source_binding_v2",source)
   self.assertNotIn("ops_a2_provision_zero_account_v2",source)

 def test_return_p0_signed_field_order_is_exact_ts_sql_parity(self):
  source=(ROOT/"lib/hft/stores/ops-a2-return-preparation.ts").read_text()
  ts=source.split("export const OPS_A2_RETURN_REQUEST_FIELDS=[",1)[1].split(
   "] as const;",1)[0]
  sql=self.read.split("CREATE OR REPLACE FUNCTION hft.ops_a2_return_payload_fields_v1",1)[1]
  sql=sql.split("keys text[]:=ARRAY[",1)[1].split("];",1)[0]
  ts_names=re.findall(r"'([^']+)'",ts)
  sql_names=re.findall(r"'([^']+)'",sql)
  self.assertEqual(len(ts_names),20)
  self.assertEqual(ts_names,sql_names)
  test_values={
   "contractVersion":"HFT-R1-OPS-A2-RETURN-PREPARE-V1",
   "kind":"RETURN","requestId":"123e4567-e89b-42d3-a456-426614174000",
   "legalEntityId":"HFT","siteId":"SITE1","warehouseId":"WH1",
   "itemCode":"ITEM1","productVersion":"PV1","controlType":"SERIAL",
   "quantity":"1","uom":"PCS","serialNo":"SER1","batchNo":"",
   "leafLocationId":"BIN2","employeeId":"EMP1",
   "returnDocumentId":"A123E456-E89B-42D3-A456-426614174001",
   "returnLineKey":"LINE1",
   "originalIssueId":"123e4567-e89b-42d3-a456-426614174002",
   "inspectionEvidenceId":"QC1","inspectedCondition":"GOOD"}
  encoded=b"".join(len(test_values[k].encode()).to_bytes(4,"big")+
                   test_values[k].encode() for k in ts_names)
  self.assertEqual(hashlib.sha256(encoded).hexdigest(),
    "66e6a1f31b69c3e42c0bd0950f4d0558f10937ccd53b210d7c99405c2443e2bb")
  self.assertIn("hft_crypto.hmac(hft.p2_length_prefixed_v1(",self.read)

 def test_recovery_requires_new_proof_without_reactivating_original_session(self):
  s=self.read
  for token in ("OPS_A2_RECOVERY_FRESH_AUTHENTICATION_V3_REQUIRED",
    "ops_a2_reconcile_original_attempt_private_v3",
    "hft.ops_a2_reconcile_post_v3(",
    "authenticated_actor:=hft.ops_a2_verify_readproof_v2(q,fresh_read_proof)",
    "hft.posting_invocation_nonce",
    "ops_a2_assert_command_seal_v2",
    "OPS_A2_RECOVERY_NEW_ACTOR_SOURCE_SCOPE_MISMATCH"):
   with self.subTest(token=token):self.assertIn(token,s)
  scoped=s.split("CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_original_attempt_private_v3",1)[1]
  scoped=scoped.split("END $reconcile$;",1)[0]
  self.assertNotIn("AND revoked_at IS NULL AND expires_at>pg_catalog.clock_timestamp()",scoped)
  self.assertIn("AND actor_subject=proof->>'actorSubject';",scoped)
  self.assertNotIn("INSERT INTO hft.stock_entry",scoped)

 def test_paged_reader_is_snapshot_only_and_complete_counts_are_bound(self):
  s=self.read.split("CREATE OR REPLACE FUNCTION hft.ops_a2_verify_paged_readproof_v3",1)[1]
  for token in ("transaction_isolation')<>'repeatable read'",
    "ops_a2_read_snapshot_page_v3",
    "snapshotTotalRows","expected_total>10000",
    "OPS_A2_SNAPSHOT_SCOPE_LIMIT_OR_OFFSET_INVALID",
    "OFFSET offset_num","next_offset",
    "OPS_A2_READ_ACCOUNT_RECONSTRUCTION_INVALID",
    "hft.ops_a2_assert_command_seal_v2"):
   with self.subTest(token=token):self.assertIn(token,s)
  app=(ROOT/"lib/hft/persistence/ops-a2-stores-readback.ts").read_text()
  for token in ("readOpsA2CompleteSyntheticSource",
    "OPS_A2_SNAPSHOT_EARLY_TERMINAL_OR_MISSING_ROWS",
    "OPS_A2_SNAPSHOT_TOTAL_SCOPE_MISMATCH",
    "OPS_A2_SNAPSHOT_DUPLICATE_MOVEMENT",
    "withProtectedReadbackTransaction","HFT_LIVE_POSTING_ENABLED!=='false'"):
   self.assertIn(token,app)

if __name__=="__main__":unittest.main()
