"""Source-only regression for GOV-069-H01. Never executes protected SQL."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql",
    "db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql",
)
TABLE_START = "CREATE TABLE hft.ops_a2_transfer_issuance_order("

class TransferIssuanceDDLRegression(unittest.TestCase):
    def test_unique_valid_table_in_both_sources(self):
        for relative in FILES:
            with self.subTest(path=relative):
                source = (ROOT / relative).read_text(encoding="utf-8")
                self.assertEqual(source.count(TABLE_START), 1)
                table = source.split(TABLE_START, 1)[1].split("\n);", 1)[0]
                self.assertRegex(
                    table,
                    r"approved_scope_sha256 text NOT NULL\s+"
                    r"CHECK\(approved_scope_sha256~'\^\[0-9a-f\]\{64\}\$'\)",
                )
                for field in (
                    "prepared_subject", "prepared_session_id",
                    "checked_subject", "checked_session_id",
                    "approved_subject", "approved_session_id",
                    "decision_evidence_sha256", "policy_generation",
                ):
                    self.assertEqual(
                        len(re.findall(r"\b" + field + r"\s+"
                                       r"(?:text|bigint)\s+NOT NULL\b", table)),
                        1, field,
                    )
                self.assertIn("FOREIGN KEY(legal_entity_id,approval_id,approval_revision)", table)
                self.assertIn("CHECK(source_leaf<>destination_leaf)", table)
                self.assertNotIn("^[0-9a-f]{64} text NOT NULL", table)
                self.assertNotIn("\n);\n),", source)
                self.assertIn("PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED", source)

if __name__ == "__main__":
    unittest.main()
