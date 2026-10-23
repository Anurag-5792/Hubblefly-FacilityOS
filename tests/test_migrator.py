"""Offline negative tests; do not represent actual PostgreSQL execution."""
import os
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'tools'))
from hft_apply_migrations import revisions, validate_environment, build_locked_statement, LEGACY_0005_SHA256, CORRECTED_0005, SQL_DIR

class MigratorContracts(unittest.TestCase):
    def test_revision_order_and_checksums(self):
        rows = revisions()
        self.assertEqual([r[0] for r in rows],[1,2,3,4,5])
        self.assertTrue(all(len(row[2])==64 for row in rows))
        self.assertEqual(rows[4][1],CORRECTED_0005)
        self.assertEqual(__import__('hashlib').sha256((SQL_DIR/'0005_hft_quantitative_accounts_receipts.sql').read_bytes()).hexdigest(),LEGACY_0005_SHA256)
        migration = rows[4][3]
        for required in ('stock_account_full_identity_v2','stock_account_reconstruction_v2',
                         'supplier_invoice_line','grn_unique_physical_delivery_v2','grn_unique_supplier_delivery_v2','invoice_line_receipt_reconstruction_v2',
                         'stock_command_unique_receipt_v2','material_issue_line','material_return_line','stock_command_scope_and_receipt_v2',
                         'HISTORICAL_OPERATIONAL_DATA_REQUIRES_APPROVED_CUTOVER','supplier_invoice_entity_identity_v2','grn_line_invoice_item_v3','return_parent_issue_scope_v3','stock_command_scoped_parent_v3','stock_command_warehouse_site_v3','stock_account_employee_fk_v3'):
            self.assertIn(required,migration)
        self.assertIn('FOREIGN KEY(legal_entity_id,warehouse_id,location_key)',migration)
    def test_composite_fk_precedes_declaring_child_fk(self):
        migration = revisions()[4][3]
        self.assertLess(migration.index('ADD CONSTRAINT supplier_invoice_entity_identity_v2'),
                        migration.index('FOREIGN KEY(invoice_id,legal_entity_id)'))
        self.assertIn('REFERENCES hft.grn(id,legal_entity_id,warehouse_id)', migration)
        self.assertIn('REFERENCES hft.material_issue(id,legal_entity_id,warehouse_id)', migration)
        self.assertIn('REFERENCES hft.material_return(id,legal_entity_id,warehouse_id)', migration)
        self.assertIn('REFERENCES hft.supplier_invoice_line(id,invoice_id,legal_entity_id,item_code)', migration)
        self.assertIn('VALIDATE CONSTRAINT receipt_scoped_location_v2', migration)
        self.assertNotIn('UPDATE hft.grn SET physical_receipt_id=', migration)
        self.assertIn('RETURN_ORIGINAL_ISSUE_SCOPE_MISMATCH', migration)
    def test_legacy_migration_checksum_guard(self):
        from unittest.mock import patch
        with patch('hft_apply_migrations.LEGACY_0005_SHA256','0'*64):
            with self.assertRaisesRegex(RuntimeError,'LEGACY_0005_SOURCE_MUTATION_FORBIDDEN'):
                revisions()
    def test_atomic_migration_source_and_concurrent_application_guards(self):
        plan = revisions()
        first = build_locked_statement(1, plan[0][2], plan[0][3], plan)
        fourth = build_locked_statement(4, plan[3][2], plan[3][3], plan)
        self.assertIn("pg_advisory_xact_lock", first)
        self.assertIn("MIGRATION_0001_CONFLICT", first)
        self.assertIn("MIGRATION_CONCURRENTLY_APPLIED", fourth)
        self.assertIn(plan[2][2], fourth)  # predecessor SHA pinned under lock
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
