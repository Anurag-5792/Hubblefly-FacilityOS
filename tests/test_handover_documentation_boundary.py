"""Focused tests for the recipient-documentation source-segregation backstop."""
import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "tools" / "hft_check_handover_docs.py"
spec = importlib.util.spec_from_file_location("hft_check_handover_docs", MODULE)
assert spec and spec.loader
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class HandoverDocumentationBoundaryTest(unittest.TestCase):
    def test_operational_text_is_accepted(self):
        self.assertEqual(
            checker.check_document("# Inventory\nSelect a product version and upload its photograph.\n"), []
        )

    def test_release_artifact_sha256_can_be_described(self):
        self.assertEqual(checker.check_document("Installer checksum: " + "a" * 64), [])

    def test_developer_source_paths_are_rejected(self):
        self.assertEqual(len(checker.check_document("See lib/hft/domain/masters.ts")), 2)

    def test_private_repo_reference_is_rejected(self):
        self.assertEqual(len(checker.check_document("github.com/example/repo")), 1)

    def test_commit_hash_is_rejected(self):
        self.assertEqual(len(checker.check_document("commit " + "c" * 40)), 1)

    def test_code_fence_is_rejected(self):
        self.assertEqual(len(checker.check_document("```typescript\nconst secret=1\n```")), 1)

    def test_current_handover_docs_have_no_internal_source_refs(self):
        docs = sorted(checker.HANDOVER.rglob("*.md"))
        self.assertGreaterEqual(len(docs), 2)
        for doc in docs:
            self.assertEqual(checker.check_document(doc.read_text(), doc.name), [])


if __name__ == "__main__":
    unittest.main()
