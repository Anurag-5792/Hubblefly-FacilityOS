"""OPS-A2 061 owner/ACL closure source review. NOT PostgreSQL execution.

Validate that every newly introduced SECURITY DEFINER receives the intended
non-login owner and the consolidated forward candidate has one transaction,
one unconditional STOP, and no new app-runtime posting entitlement.
"""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"db/security"
FORWARD=BASE/"HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql"
ACL=BASE/"HFT-R1-OPS-A2-ACL-CLOSURE-NONEXECUTABLE.sql"
SOURCES=tuple(BASE/f"HFT-R1-OPS-A2-{part}-NONEXECUTABLE.sql" for part in
 ("FOUNDATION","PROOF-AUTHORITY","WRITER","RESOLVER-READ"))

# Preserve all existing P2 V1 functions; these were separately accepted.
NEW_DEFINERS=(
 "ops_a2_provision_zero_account_v2",
 "ops_a2_issue_transfer_document_v2",
 "ops_a2_issue_source_binding_v2",
 "ops_a2_post_stock_command_v2",
 "ops_a2_resolve_authorized_v2",
 "ops_a2_resolve_return_authorized_v2",
 "ops_a2_reconcile_post_v2",
 "ops_a2_reconcile_post_v3",
 "ops_a2_read_authoritative_v2",
 "ops_a2_read_snapshot_page_v3",
)
SIGS={
 "ops_a2_provision_zero_account_v2":"uuid",
 "ops_a2_issue_transfer_document_v2":"uuid",
 "ops_a2_issue_source_binding_v2":"jsonb,jsonb,jsonb",
 "ops_a2_post_stock_command_v2":"jsonb,jsonb",
 "ops_a2_resolve_authorized_v2":"jsonb,jsonb",
 "ops_a2_resolve_return_authorized_v2":"jsonb,jsonb",
 "ops_a2_reconcile_post_v2":"jsonb,jsonb",
 "ops_a2_reconcile_post_v3":"jsonb,jsonb,jsonb,jsonb",
 "ops_a2_read_authoritative_v2":"jsonb,jsonb",
 "ops_a2_read_snapshot_page_v3":"jsonb,jsonb",
}
class BoundedAclClosure(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.forward=FORWARD.read_text()
  cls.acl=ACL.read_text()
  cls.sources=[p.read_text() for p in SOURCES]

 def test_single_guarded_atomic_installation_with_temporary_owner_grant(self):
  s=self.forward
  self.assertEqual(len(re.findall(r"(?m)^BEGIN;$",s)),1)
  self.assertEqual(len(re.findall(r"(?m)^COMMIT;$",s)),1)
  self.assertEqual(s.count("RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'"),1)
  self.assertIn("GRANT CREATE ON SCHEMA hft TO hft_r1_posting_owner;",s)
  self.assertIn("REVOKE CREATE ON SCHEMA hft FROM hft_r1_posting_owner;",s)
  self.assertLess(s.index("RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'"),
                  s.index("GRANT CREATE ON SCHEMA hft"))
  self.assertLess(s.index("GRANT CREATE ON SCHEMA hft"),
                  s.index("OWNER TO hft_r1_posting_owner;"))
  self.assertLess(s.rindex("REVOKE CREATE ON SCHEMA hft"),
                  s.rindex("COMMIT;"))
  self.assertIn("OPS_A2_POST_OWNER_SCHEMA_OR_INHERITANCE_BYPASS",s)
  self.assertNotIn("CREATE ROLE ",s)
  self.assertNotIn("ALTER ROLE ",s)
  self.assertNotIn("SET ROLE ",s)
  self.assertEqual(s.count("-- ===== BEGIN SOURCE"),4)
  self.assertEqual(s.count("-- ===== BEGIN POSTFLIGHT PROTECTED OWNER"),1)
  self.assertEqual(self.acl.count("OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED"),1)

 def test_all_new_security_definers_owned_by_exact_nonlogin_owner(self):
  s=self.forward
  for name in NEW_DEFINERS:
   with self.subTest(name=name):
    # Every effective function definition uses SECURITY DEFINER.
    marker=re.search(
     r"CREATE OR REPLACE FUNCTION hft\."+re.escape(name)+
     r"\s*\([\s\S]*?\)\s*RETURNS[\s\S]*?"
     r"SECURITY DEFINER",s)
    self.assertIsNotNone(marker,name)
    self.assertIn(
     f"ALTER FUNCTION hft.{name}({SIGS[name]})",s)
  post=s.split("-- ===== BEGIN POSTFLIGHT PROTECTED OWNER",1)[1]
  for name in ("ops_a2_post_stock_command_v2",
    "ops_a2_resolve_authorized_v2","ops_a2_resolve_return_authorized_v2",
    "ops_a2_read_authoritative_v2","ops_a2_read_snapshot_page_v3"):
   with self.subTest("postflight-owner",name=name):
    self.assertIn(
     f"ALTER FUNCTION hft.{name}({SIGS[name]})\n OWNER TO hft_r1_posting_owner;",post)
  self.assertIn("OPS_A2_SECURITY_DEFINER_OWNER_NOT_QUALIFIED",post)

 def test_private_owner_only_relation_and_helper_rights(self):
  s=self.forward.split("-- ===== BEGIN POSTFLIGHT PROTECTED OWNER",1)[1]
  for required in (
   "GRANT SELECT,INSERT ON TABLE",
   "hft.ops_a2_source_binding,hft.ops_a2_command_envelope",
   "hft.ops_a2_account_provision_receipt",
   "hft.ops_a2_transfer_issuance_receipt",
   "GRANT SELECT,INSERT,UPDATE ON TABLE hft.ops_a2_transfer_document",
   "hft.item_version_catalog",
   "hft.item_version_photo_coverage_v1",
   "hft.p0_location_kind",
   "GRANT SELECT ON TABLE hft_secret.p0_stores_proof_key",
   "hft.p0_verify_stores_proof_v1(jsonb,jsonb)",
   "hft.p0_resolve_count_leaf_v1(text,text,text)",
   "hft.ops_a2_authorized_source_v2(jsonb)",
   "hft.ops_a2_verify_return_proof_v1(jsonb,jsonb)",
   "hft.ops_a2_verify_invocation_v2(jsonb,jsonb)",
   "hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)",
   "TO hft_r1_posting_owner;",
  ):
   with self.subTest(right=required):self.assertIn(required,s)
  self.assertIn("TO hft_r1_audit_verify;",s)
  self.assertIn("OPS_A2_INDEPENDENT_AUDIT_ACL_INVALID",s)
  self.assertNotIn("GRANT INSERT ON TABLE hft.ops_a2_source_binding TO hft_r1_audit_verify",s)
  self.assertNotRegex(s,re.compile(r"GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON\s+TABLE[\s\S]*?TO\s+hft_r1_app_runtime\s*;",re.I))

 def test_runtime_inheritance_and_executable_helpers_fail_closed(self):
  s=self.forward.split("-- ===== BEGIN POSTFLIGHT PROTECTED OWNER",1)[1]
  for forbidden in (
   "pg_has_role('hft_r1_app_runtime','hft_r1_posting_owner','MEMBER')",
   "pg_has_role('hft_r1_app_runtime','hft_r1_governance_issuer','MEMBER')",
   "pg_has_role('hft_r1_governance_issuer','hft_r1_posting_owner','MEMBER')",
   "pg_has_role('hft_r1_posting_owner','hft_r1_governance_issuer','MEMBER')",
   "person_login.rolcanlogin",
   "protected_role.rolbypassrls",
   "protected_role.rolsuper",
   "operator_login.rolbypassrls",
   "'hft_r1_governance_issuer'::pg_catalog.regrole",
   "'hft_r1_posting_owner'::pg_catalog.regrole",
   "has_table_privilege(login.rolname",
   "'hft.ops_a2_source_binding','INSERT,UPDATE,DELETE'",
   "'hft.ops_a2_account_provision_order','INSERT,UPDATE,DELETE'",
   "'hft.stock_account','INSERT,UPDATE,DELETE'",
   "'hft.stock_entry','INSERT,UPDATE,DELETE'",
   "'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)','EXECUTE'",
   "'hft.ops_a2_issue_source_binding_v2(jsonb,jsonb,jsonb)','EXECUTE'",
   "'hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)','EXECUTE'",
   "OPS_A2_APP_RUNTIME_DIRECT_DML_OR_HELPER_EXECUTE",
  ):
   with self.subTest(check=forbidden):self.assertIn(forbidden,s)
  self.assertNotIn("GRANT EXECUTE ON FUNCTION hft.post_stock_command_protected_v1",s)
  self.assertNotIn("REVOKE EXECUTE ON FUNCTION hft.post_stock_command_protected_v1",s)
  self.assertNotIn("GRANT EXECUTE ON FUNCTION hft.ops_a2_post_stock_command_v2",s)

if __name__=="__main__":
 unittest.main()
