"""Offline migration-manifest regression tests. Not PostgreSQL acceptance."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import shutil
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import hft_apply_migrations as m


class CanonicalMigrationContract(unittest.TestCase):
    def test_exact_manifest_and_canonical_sha(self):
        rows = m.revisions()
        self.assertEqual([x[0] for x in rows], [1, 2, 3, 4, 5])
        self.assertEqual(rows[-1][1], m.SQL_DIR / "0005_hft_quantitative_accounts_receipts.sql")
        self.assertEqual(rows[-1][2], "01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf")
        self.assertNotEqual(rows[-1][2], m.LEGACY_0005_SHA256)
        manifest=json.loads(m.MANIFEST.read_text())
        self.assertEqual(len(manifest["migrations"]), 5)
        self.assertTrue(all(row[2] == manifest["migrations"][i]["sha256"] for i, row in enumerate(rows)))
        self.assertTrue(all(len(row[2]) == 64 for row in rows))
        self.assertTrue(m.PROVENANCE_0005.is_file())

    def test_reject_manifest_absent_and_tampering(self):
        with patch.object(m, "MANIFEST", Path("/never-present/manifest.v1.json")):
            with self.assertRaisesRegex(RuntimeError, "CANONICAL_MIGRATION_MANIFEST_MISSING"):
                m.revisions()
        with TemporaryDirectory() as directory:
            f = Path(directory) / "manifest.v1.json"
            original = json.loads(m.MANIFEST.read_text())
            original["migrations"][-1]["sha256"] = "0" * 64
            f.write_text(json.dumps(original))
            with patch.object(m, "MANIFEST", f):
                with self.assertRaisesRegex(RuntimeError, "CANONICAL_MIGRATION_SHA256_DRIFT:5"):
                    m.revisions()

    def test_extra_sql_and_duplicate_execution_are_blocked(self):
        with TemporaryDirectory() as directory:
            dest=Path(directory)
            for p in m.SQL_DIR.glob("*.sql"):
                shutil.copy2(p,dest/p.name)
            (dest/"0006_hft_rogue.sql").write_text("BEGIN; SELECT 1; COMMIT;")
            with patch.object(m,"SQL_DIR",dest):
                with self.assertRaisesRegex(RuntimeError,"UNEXPECTED_OR_DUPLICATE_EXECUTABLE_MIGRATION"):
                    m.revisions()
            (dest/"0006_hft_rogue.sql").unlink()
            (dest/"nested").mkdir()
            shutil.copy2(dest/"0005_hft_quantitative_accounts_receipts.sql",dest/"nested/0005_hft_quantitative_accounts_receipts.sql")
            with patch.object(m,"SQL_DIR",dest):
                with self.assertRaisesRegex(RuntimeError,"UNEXPECTED_OR_DUPLICATE_EXECUTABLE_MIGRATION"):
                    m.revisions()

    def test_old_revision_5_is_incompatible_not_auto_upgraded(self):
        plan=m.revisions()
        recorded="\n".join(f"{v}|{sha}" for v,_,sha,_ in plan[:4]) + "\n5|" + m.LEGACY_0005_SHA256
        def fake_sql(sql, env):
            if "to_regclass('hft.schema_revision')" in sql:
                return "t"
            if "SELECT version::text ||" in sql:
                return recorded
            raise AssertionError("Unexpected mutation/query "+sql[:120])
        with patch.object(m,"execute_sql",side_effect=fake_sql):
            with self.assertRaisesRegex(RuntimeError, "APPLIED_LEGACY_0005_REQUIRES_SEPARATE_FORWARD_MIGRATION"):
                m.verify_database_revision_ledger({},plan)

    def test_unknown_and_missing_database_revisions_rejected(self):
        plan=m.revisions()
        for ledger in (f"1|{plan[0][2]}\n7|{'0'*64}",f"2|{plan[1][2]}"):
            def query(sql,env):
                return "t" if "to_regclass" in sql else ledger
            with patch.object(m,"execute_sql",side_effect=query):
                with self.assertRaisesRegex(RuntimeError,"DATABASE_REVISION_GAP_OR_UNDECLARED_VERSION"):
                    m.verify_database_revision_ledger({},plan)

    def test_migration_is_atomic_and_locked(self):
        plan=m.revisions()
        for v,path,sha,ddl in plan:
            statement=m.build_locked_statement(v,sha,ddl,plan)
            self.assertTrue(statement.startswith("BEGIN;"))
            self.assertTrue(statement.endswith("COMMIT;"))
            self.assertLess(statement.index("pg_advisory_xact_lock"),statement.index(ddl[:30]))
        self.assertIn("MIGRATION_CONCURRENTLY_APPLIED",m.build_locked_statement(5,plan[4][2],plan[4][3],plan))

    def test_no_runtime_or_production_database_permission(self):
        minimal=dict(HFT_ENVIRONMENT="test",HFT_AUTH_SOURCE="verified",
                     HFT_OPERATIONS_SOURCE="database",HFT_LIVE_POSTING_ENABLED="false",
                     HFT_POSTING_RUN_MODE="ISOLATED_DB_TEST",
                     HFT_TEST_PG_DATABASE="hft_r1_disposable_synthetic",
                     PGDATABASE="hft_r1_disposable_synthetic",
                     PGUSER="hft_engineering",PGHOST="127.0.0.1")
        cases=[dict(NODE_ENV="production"),dict(HFT_ENVIRONMENT="production"),
               dict(PGUSER="hft_app_runtime"),dict(PGHOST="example.com"),
               dict(PGDATABASE="hft_business"),dict(HFT_AUTH_SOURCE="preview"),
               dict(HFT_LIVE_POSTING_ENABLED="true")]
        for change in cases:
            with self.subTest(change=change),self.assertRaises(RuntimeError):
                m.validate_environment({**minimal,**change})


if __name__=="__main__":
    unittest.main()
