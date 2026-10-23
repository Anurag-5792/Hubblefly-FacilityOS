"""Offline negative tests; do not represent actual PostgreSQL execution."""
import os
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'tools'))
from hft_apply_migrations import revisions, validate_environment, build_locked_statement

class MigratorContracts(unittest.TestCase):
    def test_revision_order_and_checksums(self):
        rows = revisions()
        self.assertEqual([r[0] for r in rows],[1,2,3,4])
        self.assertTrue(all(len(row[2])==64 for row in rows))
    def test_atomic_migration_source_and_concurrent_application_guards(self):
        plan = revisions()
        first = build_locked_statement(1, plan[0][2], plan[0][3], plan)
        fourth = build_locked_statement(4, plan[3][2], plan[3][3], plan)
        self.assertIn("pg_advisory_xact_lock", first)
        self.assertIn("MIGRATION_0001_CONFLICT", first)
        self.assertIn("MIGRATION_CONCURRENTLY_APPLIED", fourth)
        self.assertIn(plan[2][2], fourth)
        self.assertLess(fourth.index("pg_advisory_xact_lock"), fourth.index("CREATE TABLE"))
        with self.assertRaisesRegex(RuntimeError,"MIGRATION_SOURCE_REVISION_MISMATCH"):
            build_locked_statement(4, "0"*64, plan[3][3], plan)
    def test_rejects_production_and_missing_gates(self):
        baseline=dict(HFT_ENVIRONMENT='test',HFT_AUTH_SOURCE='verified',HFT_OPERATIONS_SOURCE='database',HFT_LIVE_POSTING_ENABLED='false',HFT_POSTING_RUN_MODE='ISOLATED_DB_TEST',
                      HFT_TEST_PG_DATABASE='hft_r1_disposable_synthetic',PGDATABASE='hft_r1_disposable_synthetic',
                      PGUSER='hft_engineering',PGHOST='127.0.0.1')
        cases=[dict(NODE_ENV='production'),dict(HFT_ENVIRONMENT=''),dict(HFT_AUTH_SOURCE='preview'),dict(HFT_OPERATIONS_SOURCE='sample'),dict(HFT_LIVE_POSTING_ENABLED='true'),
               dict(PGDATABASE='hft_production'),dict(PGHOST='db.company.com'),dict(PGUSER='postgres')]
        for updates in cases:
            with self.subTest(updates=updates), self.assertRaises(RuntimeError):
                validate_environment({**baseline,**updates})

if __name__=='__main__':unittest.main()
