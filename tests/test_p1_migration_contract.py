"""Offline source contracts for HFT-R1 Package 1. Not PostgreSQL tests."""
import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "db" / "migrations" / "0006_hft_posted_fact_integrity.sql"
MANIFEST = ROOT / "db" / "migrations" / "manifest.v1.json"


class PostedFactIntegritySourceContract(unittest.TestCase):
    def test_sequential_manifest_and_exact_v6_digest(self):
        manifest = json.loads(MANIFEST.read_text())
        entries = manifest["migrations"]
        self.assertEqual([e["version"] for e in entries], [1, 2, 3, 4, 5, 6])
        self.assertEqual(entries[-1]["file"], SQL.name)
        self.assertEqual(entries[-1]["sha256"], hashlib.sha256(SQL.read_bytes()).hexdigest())
        self.assertEqual(entries[4]["sha256"], "01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf")
        self.assertEqual(manifest["incompatible_provenance"][0]["sha256"], "8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e")

    def test_wrapped_forward_migration_and_explicit_cutover_refusal(self):
        sql = SQL.read_text()
        self.assertRegex(sql, r"(?s)^--.*?\nBEGIN;\n")
        self.assertTrue(sql.rstrip().endswith("COMMIT;"))
        for diagnostic in (
            "HFT_0006_POSTED_HISTORY_REQUIRES_APPROVED_RECONCILIATION",
            "HFT_0006_ACCOUNT_RECONSTRUCTION_FAILED",
            "HFT_0006_NONZERO_LEGACY_ACCOUNT_REQUIRES_APPROVED_CUTOVER",
        ):
            self.assertIn(diagnostic, sql)
        self.assertNotIn("UPDATE hft.stock_entry SET", sql)
        self.assertNotIn("UPDATE hft.stock_command SET", sql)

    def test_account_identity_all_fields_and_delete_are_immutable(self):
        sql = SQL.read_text()
        for name in ("id", "legal_entity_id", "warehouse_id", "item_code",
                     "location_key", "batch_key", "serial_key", "condition",
                     "account_kind", "custodian_employee_id"):
            self.assertIn("NEW." + name, sql)
            self.assertIn("OLD." + name, sql)
        self.assertIn("BEFORE UPDATE OR DELETE ON hft.stock_account", sql)
        self.assertIn("STOCK_ACCOUNT_IDENTITY_IMMUTABLE", sql)

    def test_seal_cannot_be_mutated_and_is_mandatory_at_commit(self):
        sql = SQL.read_text()
        self.assertIn("CREATE TABLE hft.stock_command_seal", sql)
        self.assertIn("BEFORE UPDATE OR DELETE ON hft.stock_command_seal", sql)
        self.assertIn("block_stock_entry_after_seal_v1 BEFORE INSERT", sql)
        self.assertIn("AFTER INSERT ON hft.stock_command DEFERRABLE INITIALLY DEFERRED", sql)
        self.assertIn("STOCK_COMMAND_MOVEMENTS_SEALED", sql)
        self.assertIn("result_count<>2 OR debit_count<>1 OR credit_count<>1", sql)
        self.assertIn("e.qty_delta_micro=-c.quantity_micro", sql)
        self.assertIn("e.qty_delta_micro=c.quantity_micro", sql)
        self.assertIn("PERFORM hft.assert_command_seal_v1(p_id)", sql)

    def test_posted_receipt_qc_source_and_invoice_history_frozen(self):
        sql = SQL.read_text()
        for trigger in ("posted_receipt_immutable_v1", "posted_grn_line_immutable_v1",
                        "posted_grn_header_immutable_v1", "posted_invoice_line_immutable_v1",
                        "posted_invoice_header_immutable_v1"):
            self.assertIn(trigger, sql)
        self.assertIn("POSTED_RECEIPT_IMMUTABLE", sql)
        self.assertIn("BEFORE UPDATE OR DELETE ON hft.grn_partial_receipt", sql)
        self.assertIn("PERFORM 1 FROM hft.stock_command WHERE source_receipt_id=OLD.id FOR SHARE", sql)

    def test_fixtures_require_real_commit_and_deferred_assertions(self):
        negative = (ROOT / "tests/pg/hft_r1_posted_fact_integrity_negative.sql").read_text()
        shapes = (ROOT / "tests/pg/hft_r1_posted_fact_shapes_negative.sql").read_text()
        for s in (negative, shapes):
            self.assertIn("SET CONSTRAINTS ALL IMMEDIATE", s)
            self.assertIn("COMMIT;", s)
        for code in ("STOCK_COMMAND_MOVEMENTS_SEALED", "STOCK_ACCOUNT_IDENTITY_IMMUTABLE",
                     "POSTED_RECEIPT_IMMUTABLE"):
            self.assertIn(code, negative)
        for name in ("WRONG_SIZE", "EXTRA_LEGS", "MISSING_LEG", "WRONG_BUCKET"):
            self.assertIn(name, shapes)


if __name__ == "__main__":
    unittest.main()
