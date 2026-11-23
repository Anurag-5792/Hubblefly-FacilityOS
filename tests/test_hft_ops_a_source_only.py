"""OPS-A independent source-only guardrails for protected SQL candidate.

DO NOT connect to PostgreSQL, install roles, modify migrations or infer GO.
"""
import hashlib
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'db/security/HFT-R1-OPS-A-VERSIONED-FORWARD-NONEXECUTABLE-CANDIDATE.sql'
EVIDENCE=ROOT/'lib/hft/persistence/ops-a-versioned-evidence.ts'
INVOCATION=ROOT/'lib/hft/security/ops-a-versioned-invocation.ts'
P2=ROOT/'db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql'
P0=ROOT/'db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql'
MIG=ROOT/'db/migrations'
PROTECTED=ROOT/'config'


class OpsAContractReview(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.sql=SQL.read_text()
  cls.code=EVIDENCE.read_text()

 def test_source_candidate_explicitly_nonexecutable(self):
  self.assertIn('OPS_A_PROTECTED_MIGRATION_NOT_AUTHORIZED',self.sql)
  self.assertLess(self.sql.index('OPS_A_PROTECTED_MIGRATION_NOT_AUTHORIZED'),
                  self.sql.index('ALTER TABLE hft.stock_account'))
  self.assertIn('NOT an approved migration',self.sql)
  self.assertNotIn('CREATE ROLE',self.sql)
  self.assertNotIn('GRANT EXECUTE',self.sql)
  self.assertNotIn('GRANT ALL',self.sql)
  self.assertNotIn('CREATE TABLE hft.stock_account',self.sql)

 def test_exactly_six_canonical_migrations_remain_authoritative(self):
  revisions=sorted(MIG.glob('000[0-9]_*.sql'))
  self.assertEqual([int(p.name[:4]) for p in revisions],[1,2,3,4,5,6])
  self.assertFalse((MIG/'0007_hft_ops_a_versioned_authority.sql').exists())
  self.assertTrue((MIG/'manifest.v1.json').is_file())
  for path in revisions:
   self.assertEqual(len(hashlib.sha256(path.read_bytes()).hexdigest()),64)

 def test_p0_rejecting_stubs_are_still_in_place(self):
  p0=P0.read_text()
  self.assertIn("RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED'",p0)
  self.assertIn("RAISE EXCEPTION 'P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED'",p0)
  self.assertIn('NOT AN AUTHORIZED MIGRATION',p0)
  self.assertIn('P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION',
                (ROOT/'lib/hft/stores/p0-persistence.ts').read_text())

 def test_single_ledger_retains_original_tables_and_immutable_seal(self):
  self.assertIn('ALTER TABLE hft.stock_account',self.sql)
  self.assertIn('ALTER TABLE hft.stock_command',self.sql)
  self.assertIn('ALTER TABLE hft.stock_entry',self.sql)
  self.assertIn('ALTER TABLE hft.stock_command_seal',self.sql)
  self.assertIn('hft.ops_a_versioned_reconstruction_review_v1',self.sql)
  self.assertNotRegex(self.sql,r'CREATE TABLE\s+(?:hft\.)?ops_a_stock')
  self.assertIn('immutable_stock_account_identity_v1',
                (MIG/'0006_hft_posted_fact_integrity.sql').read_text())
  self.assertIn('post_stock_command_protected_v1',P2.read_text())
  self.assertNotIn('hft.ops_a_versioned_reconstruction_review_v1',
                   (ROOT/'app/api/hft/stores/read/route.ts').read_text())

 def test_version_joins_are_company_item_scoped(self):
  for name in ('hft.stock_account','hft.stock_command','hft.serial_registry',
               'hft.employee_custody'):
   self.assertIn('ALTER TABLE '+name,self.sql)
  self.assertGreaterEqual(self.sql.count(
   'REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code)'),3)
  self.assertIn('hft.warehouse(legal_entity_id,warehouse_id,site_id)',self.sql)
  self.assertIn('REFERENCES hft.location',
                (MIG/'0005_hft_quantitative_accounts_receipts.sql').read_text())
  self.assertIn('ops_a_account_sequential_version_v1',self.sql)

 def test_version_coupled_evidence_requires_immutable_ledger_fact_and_audit(self):
  for token in ('OPS_A_EVIDENCE_V1','movementSha256','auditSha256',
      'accountBeforeVersion','accountAfterVersion','legalEntityId','siteId',
      'warehouseId','itemCode','productVersion','leafLocationId','serialNo',
      'batchNo','custodianEmployeeId','ORIGINAL_ISSUE',
      'DUPLICATE_IMMUTABLE_ENTRY_ID','ACCOUNT_LEDGER_RECONSTRUCTION_MISMATCH',
      'STALE_AUTHORIZED_ACCOUNT_REVISION'):
   self.assertIn(token,self.code)
  self.assertNotIn('openOnlinePgPool',self.code)
  self.assertNotIn('INSERT INTO hft.',self.code)
  self.assertNotIn('UPDATE hft.',self.code)

 def test_prospective_v2_js_and_sql_payload_field_parity(self):
  js=INVOCATION.read_text()
  marker='export const OPS_A_PAYLOAD_FIELDS=['
  self.assertIn(marker,js)
  js_fields=re.findall(r"'([^']+)'",
    js.split(marker,1)[1].split('] as const;',1)[0])
  sql_marker='DECLARE keys text[]:=ARRAY['
  self.assertIn(sql_marker,self.sql)
  sql_fields=re.findall(r"'([^']+)'",
    self.sql.split(sql_marker,1)[1].split('];',1)[0])
  self.assertEqual(len(js_fields),33)
  self.assertEqual(len(sql_fields),33)
  self.assertEqual(js_fields,sql_fields)
  self.assertIn('hft.p2_length_prefixed_v1',self.sql)
  self.assertIn('hft_crypto.digest',self.sql)
  self.assertIn('REVOKE EXECUTE ON FUNCTION hft.ops_a_payload_fields_v2',self.sql)
  self.assertIn('REVOKE EXECUTE ON FUNCTION hft.ops_a_payload_digest_v2',self.sql)
  self.assertIn('OPS_A_POST_V2',js)
  self.assertIn('opsATestOnlyMac',js)
  self.assertNotIn('openOnlinePgPool',js)
  self.assertNotIn('postProtectedStockCommand',js)

 def test_transfer_requires_one_future_p2_writer_and_not_receive_issue_pair(self):
  self.assertIn("There is intentionally NO executable ALTER to add TRANSFER",self.sql)
  self.assertIn('TRANSF',self.code)
  self.assertNotIn('ops_a_post_stock_command',self.sql)
  self.assertIn('stock_entry facts',self.sql)

 def test_all_protected_hold_pins_remain_held(self):
  pins=[PROTECTED/f'hft-bootstrap019-stage-s{i}.sha256' for i in range(6)]
  pins +=[PROTECTED/'hft-bootstrap019-review.sha256',
          PROTECTED/'hft-bootstrap019-execution.sha256',
          PROTECTED/'hft-bootstrap019-canonical-catalog.sha256',
          PROTECTED/'hft-recovery-v2-collector-trust.sha256',
          PROTECTED/'hft-recovery-v2-witness-trust.sha256']
  self.assertTrue(all(p.read_text().strip()=='HOLD' for p in pins))
  self.assertEqual(len(pins),11)


if __name__=='__main__':
 unittest.main()
