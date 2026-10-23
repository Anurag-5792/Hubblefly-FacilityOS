"""Offline negative tests; do not represent actual PostgreSQL execution."""
import os
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'tools'))
from hft_apply_migrations import revisions, validate_environment

class MigratorContracts(unittest.TestCase):
    def test_revision_order_and_checksums(self):
        rows = revisions()
        self.assertEqual([r[0] for r in rows],[1,2,3,4])
        self.assertTrue(all(len(row[2])==64 for row in rows))
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
