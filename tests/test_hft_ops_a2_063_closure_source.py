"""Directive 063 high-severity source and integration negative controls.

These tests inspect real protected SQL definitions; they are NOT PostgreSQL
transaction proofs. Real negative COMMIT, rollback and concurrency PG-F cases
remain gated and require independent executable disposable PG18 qualification.
"""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SEC=ROOT/"db/security"
WRITER=(SEC/"HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql").read_text()
FOUND=(SEC/"HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql").read_text()
READ=(SEC/"HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql").read_text()
ACL=(SEC/"HFT-R1-OPS-A2-ACL-CLOSURE-NONEXECUTABLE.sql").read_text()
COMBINED=(SEC/"HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql").read_text()
APP=(ROOT/"lib/hft/persistence/ops-a2-stores-readback.ts").read_text()
STORE=(ROOT/"lib/hft/persistence/ops-a2-stores-source.ts").read_text()

class Source063(unittest.TestCase):
 def test_f01_exact_signed_deferred_fact_historical_poststate(self):
  fact=WRITER.split("CREATE OR REPLACE FUNCTION hft.ops_a2_assert_command_seal_v2",1)[1]
  fact=fact.split("END $assertseal$;",1)[0]
  deferred=WRITER.split("CREATE OR REPLACE FUNCTION hft.ops_a2_require_command_seal_v2",1)[1]
  deferred=deferred.split("END $verify$;",1)[0]
  for required in (
   "debit.qty_delta_micro=-c.quantity_micro",
   "credit.qty_delta_micro=c.quantity_micro",
   "fact_v2:=hft.ops_a2_fact_v2(p_id)",
   "fact_v2->>'movementSha256' IS DISTINCT FROM envelope.version_movement_sha256",
   "outbox.canonical_event->'fact' IS DISTINCT FROM fact_v2",
   "leg_check.account_before_version IS DISTINCT FROM historic_version-1",
   "leg_check.account_after_version IS DISTINCT FROM historic_version",
   "seal.available_after_micro IS DISTINCT FROM historic_qty",
   "seal.available_after_version IS DISTINCT FROM historic_version",
   "OPS_A2_V2_SEALED_AVAILABLE_HISTORIC_POSTSTATE_INVALID"):
   with self.subTest(control=required):self.assertIn(required,fact)
  for required in (
   "account_current.qty_micro<>derived_qty",
   "account_current.version<>derived_revision",
   "sealed.available_after_micro<>account_current.qty_micro",
   "sealed.available_after_version<>account_current.version",
   "OPS_A2_V2_DEFERRED_POSTSTATE_QUANTITY_OR_REVISION_INVALID",
   "OPS_A2_V2_DEFERRED_AVAILABLE_SEAL_POSTSTATE_INVALID"):
   with self.subTest(control=required):self.assertIn(required,deferred)
  self.assertIn("DEFERRABLE INITIALLY DEFERRED",WRITER)

 def test_f02_full_base_custody_census_and_complete_all_page_count(self):
  helper=READ.split("CREATE OR REPLACE FUNCTION hft.ops_a2_assert_outstanding_custody_census_v3",1)[1]
  helper=helper.split("END $custody_census$;",1)[0]
  for required in (
   "SELECT count(*) INTO base_count FROM hft.employee_custody",
   "SELECT count(*) INTO qualified_count",
   "JOIN hft.stock_command AS original",
   "JOIN hft.posting_fragment AS fragment",
   "JOIN hft.custody_ack_pending AS pending",
   "JOIN hft.custody_ack_status_v1 AS ack",
   "JOIN hft.audit_outbox AS audit",
   "JOIN hft.stock_account AS acct",
   "fragment.quantity_micro=cu.issued_micro",
   "original.kind='ISSUE'",
   "ack.state IN('ACK_PENDING','ACKNOWLEDGED','DISPUTED')",
   "qualified_count<>base_count",
   "OPS_A2_CUSTODY_BASE_CENSUS_MISSING_ISSUE_ACK_AUDIT_FRAGMENT_OR_ACCOUNT",
   "OPS_A2_CUSTODY_CENSUS_ACCOUNT_OUTSTANDING_MISMATCH"):
   with self.subTest(control=required):self.assertIn(required,helper)
  self.assertIn("expected_total:=hft.ops_a2_assert_outstanding_custody_census_v3(q)",READ)
  self.assertIn("originalFragmentId",READ)
  self.assertIn("ackEvidenceSha256",READ)
  self.assertIn("OPS_A2_SNAPSHOT_EARLY_TERMINAL_OR_MISSING_ROWS",APP)
  self.assertIn("OPS_A2_SNAPSHOT_TOTAL_SCOPE_MISMATCH",APP)

 def test_f03_canonical_p0_typed_multiline_grn_rejects_identity_swap(self):
  grn=FOUND.split("CREATE OR REPLACE FUNCTION hft.ops_a2_resolve_signed_grn_line_v3",1)[1]
  grn=grn.split("END $grn_bridge$;",1)[0]
  for required in (
   "p0->>'grnId' !~ '^[0-9A-F]",
   "p2->>'sourceDocumentId'<>pg_catalog.lower(p0->>'grnId')",
   "r.receipt_key=p0->>'receiptKey'",
   "max(r.receipt_key||':'||r.line_no::text)",
   "matches<>1",
   "typed_line IS DISTINCT FROM p2->>'sourceActionKey'",
   "g.supplier_id=p0->>'supplierId'",
   "g.invoice_key=p0->>'invoiceNumber'",
   "r.ops_a2_product_version_code=p2->>'productVersion'",
   "r.batch_no=p2->>'batchNo'",
   "r.qc_state='ACCEPTED'",
   "OPS_A2_GRN_RAW_RECEIPT_LINE_AMBIGUOUS_OR_FORGED"):
   with self.subTest(check=required):self.assertIn(required,grn)
  self.assertIn("hft.ops_a2_resolve_signed_grn_line_v3(p0,p2)",FOUND)
  self.assertIn("hft.ops_a2_resolve_signed_grn_line_v3(p,",READ)
  self.assertIn("source.sourceDocumentId!==op.grnId.toLowerCase()",STORE)
  self.assertIn("source.sourceActionKey.startsWith(op.receiptKey+':')",STORE)
  return_bridge=(ROOT/"lib/hft/persistence/ops-a2-return-source.ts").read_text()
  self.assertIn("c.originalIssueId!==req.originalIssueId",return_bridge)

 def test_f04_transfer_counter_must_have_one_original_command_and_ledger(self):
  guard=FOUND.split("CREATE OR REPLACE FUNCTION hft.ops_a2_protect_transfer_document_v2",1)[1]
  guard=guard.split("END $protect_transfer$;",1)[0]
  deferred=FOUND.split("CREATE OR REPLACE FUNCTION hft.ops_a2_verify_transfer_counter_link_v3",1)[1]
  deferred=deferred.split("END $transfer_link_commit$;",1)[0]
  for required in (
   "CREATE TABLE hft.ops_a2_transfer_counter_link(",
   "command_uuid uuid PRIMARY KEY REFERENCES hft.stock_command(id)",
   "CHECK(after_micro=before_micro+quantity_micro)",
   "immutable_ops_a2_transfer_counter_link",
   "CREATE CONSTRAINT TRIGGER ops_a2_transfer_counter_link_requires_command_v3",
   "CREATE CONSTRAINT TRIGGER ops_a2_transfer_counter_change_requires_command_v3"):
   self.assertIn(required,FOUND)
  for required in (
   "link.before_micro=OLD.moved_micro",
   "link.after_micro=NEW.moved_micro",
   "link.quantity_micro=NEW.moved_micro-OLD.moved_micro",
   "command.kind='TRANSFER'",
   "(SELECT count(*) FROM hft.stock_entry AS leg"):
   self.assertIn(required,guard)
  for required in (
   "hft.ops_a2_assert_command_seal_v2(c.id)",
   "linked_total<>d.moved_micro",
   "OPS_A2_TRANSFER_COUNTER_LEDGER_CHAIN_MISMATCH",
   "OPS_A2_TRANSFER_ORIGINAL_COMMAND_BINDING_INVALID"):
   self.assertIn(required,deferred)
  self.assertLess(WRITER.index("INSERT INTO hft.ops_a2_transfer_counter_link"),
                  WRITER.index("UPDATE hft.ops_a2_transfer_document SET moved_micro"))
  self.assertIn("hft.ops_a2_transfer_counter_link",ACL)
  self.assertIn("TO hft_r1_audit_verify",ACL)

 def test_f05_single_character_entry_id_without_scope_weakening(self):
  self.assertIn("const pgEntryId=/^[1-9][0-9]{0,18}$/",APP)
  self.assertIn("BigInt(r.entryId)>9223372036854775807n",APP)
  self.assertIn("const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/",APP)
  self.assertIn("!pgEntryId.test(r.entryId)",APP)
  self.assertIn("!id.test(r.itemCode)",APP)
  self.assertIn("!id.test(r.productVersion)",APP)

 def test_f06_return_and_061_security_paths_preserved(self):
  for required in ("ops_a2_verify_return_proof_v1",
   "ops_a2_resolve_return_authorized_v2","ops_a2_reconcile_post_v3",
   "ops_a2_read_snapshot_page_v3","ops_a2_assert_outstanding_custody_census_v3"):
   self.assertIn(required,READ)
  for required in ("ops_a2_account_provision_order","ops_a2_source_binding",
   "ops_a2_transfer_issuance_order","ops_a2_issue_source_binding_v2"):
   self.assertIn(required,FOUND)
  for required in ("hft.ops_a2_resolve_signed_grn_line_v3(jsonb,jsonb)",
    "hft.ops_a2_assert_outstanding_custody_census_v3(jsonb)",
    "hft.ops_a2_verify_transfer_counter_link_v3()"):
   self.assertIn(required,ACL)

 def test_guarded_consolidated_source_has_single_atomic_stop(self):
  self.assertEqual(len(re.findall(r"(?m)^BEGIN;$",COMBINED)),1)
  self.assertEqual(len(re.findall(r"(?m)^COMMIT;$",COMBINED)),1)
  self.assertEqual(COMBINED.count(
   "RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'"),1)
  self.assertIn("-- ===== BEGIN POSTFLIGHT PROTECTED OWNER",COMBINED)
  self.assertNotIn("GRANT EXECUTE ON FUNCTION hft.ops_a2_post_stock_command_v2",COMBINED)
  self.assertNotIn("CREATE ROLE ",COMBINED)
  for needle in ("OPS_A2_V2_FULL_MOVEMENT_FACT_DIGEST_INVALID",
   "OPS_A2_CUSTODY_BASE_CENSUS_MISSING_ISSUE_ACK_AUDIT_FRAGMENT_OR_ACCOUNT",
   "OPS_A2_GRN_RAW_RECEIPT_LINE_AMBIGUOUS_OR_FORGED",
   "OPS_A2_TRANSFER_COUNTER_LEDGER_CHAIN_MISMATCH"):
   self.assertIn(needle,COMBINED)

if __name__=="__main__":unittest.main()
