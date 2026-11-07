"""HFT OPS-A2 protected SQL review-only contract tests.

These tests read files ONLY. No PostgreSQL, Neon, signing credentials, grants,
migrations, protected DML or runtime posting is ever performed.
"""
import hashlib
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL_ROOT=ROOT/'db/security'
FILES={
 'foundation':SQL_ROOT/'HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql',
 'proof':SQL_ROOT/'HFT-R1-OPS-A2-PROOF-AUTHORITY-NONEXECUTABLE.sql',
 'writer':SQL_ROOT/'HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql',
 'read':SQL_ROOT/'HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql',
}
V1=SQL_ROOT/'HFT-R1-P2-ONE-WRITER-REVIEW.sql'
P0=SQL_ROOT/'HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql'
OPS_A=SQL_ROOT/'HFT-R1-OPS-A-VERSIONED-FORWARD-NONEXECUTABLE-CANDIDATE.sql'
STOCK=ROOT/'lib/hft/persistence/ops-a2-stores-source.ts'
READ=ROOT/'lib/hft/persistence/ops-a2-stores-readback.ts'


class OpsA2ProtectedSource(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.sql={name:path.read_text() for name,path in FILES.items()}

 def test_all_four_sql_candidates_have_unconditional_stop_before_ddl(self):
  for name,sql in self.sql.items():
   with self.subTest(name=name):
    stop=sql.index("RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'")
    first_ddl=min(i for i in [sql.find('ALTER TABLE'),sql.find('CREATE TABLE'),
       sql.find('CREATE OR REPLACE FUNCTION')] if i>=0)
    self.assertLess(stop,first_ddl)
    self.assertNotIn('GRANT EXECUTE ON FUNCTION hft.ops_a2_',sql)
    self.assertIn('BEGIN;',sql)
    self.assertIn('COMMIT;',sql)

 def test_versioned_tables_are_extensions_of_one_existing_ledger(self):
  sql=self.sql['foundation']+self.sql['writer']
  for table in ('hft.stock_account','hft.stock_entry','hft.stock_command',
                'hft.serial_registry','hft.employee_custody',
                'hft.stock_command_seal','hft.audit_outbox'):
   self.assertIn(table,sql)
  self.assertNotRegex(sql,r'CREATE TABLE\s+(?:hft\.)?ops_a2_(?:stock_account|stock_entry|stock_balance)\b')
  self.assertIn('CREATE TABLE hft.ops_a2_command_envelope',sql)
  self.assertIn('CREATE TABLE hft.ops_a2_source_binding',sql)

 def test_exact_V1_middleware_and_P0_hard_stops_remain(self):
  p0=P0.read_text()
  self.assertIn("RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED'",p0)
  self.assertIn("RAISE EXCEPTION 'P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED'",p0)
  self.assertIn('P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION',
   (ROOT/'lib/hft/stores/p0-persistence.ts').read_text())
  self.assertIn('HFT_R1_API_NOT_QUALIFIED',(ROOT/'middleware.ts').read_text())
  v1=V1.read_text()
  self.assertIn('CREATE OR REPLACE FUNCTION hft.post_stock_command_protected_v1',v1)
  self.assertIn("p->>'contractVersion'<>'HFT_STOCK_POST_V1'",v1)
  self.assertIn('hft.reconcile_protected_stock_command_v1',v1)

 def test_only_canonical_migrations_0001_through_0006_are_present(self):
  revisions=sorted((ROOT/'db/migrations').glob('000?_*.sql'))
  self.assertEqual([int(p.name[:4]) for p in revisions],[1,2,3,4,5,6])
  self.assertTrue((ROOT/'db/migrations/manifest.v1.json').is_file())
  self.assertTrue(all(len(hashlib.sha256(p.read_bytes()).hexdigest())==64
                      for p in revisions))

 def test_source_protocol_is_exact_version_v2_and_signer_qualified(self):
  sql=self.sql['proof']
  self.assertIn('hft.ops_a_payload_fields_v2(p)',sql)
  self.assertIn('hft.ops_a_payload_digest_v2(p)',sql)
  self.assertIn("HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED",sql)
  self.assertIn('hft_secret.invocation_key',sql)
  self.assertIn('hft.posting_session',sql)
  self.assertIn('hft.posting_invocation_nonce',sql)
  self.assertIn('hft_crypto.hmac',sql)
  self.assertIn('get_byte(expected,i)',sql)
  self.assertIn('ops_a2_authorized_source_v2',sql)
  self.assertIn('hft.protected_stock_approval',sql)
  self.assertIn('hft.protected_approval_decision',sql)

 def test_whole_source_and_person_approvals_are_rechecked(self):
  proof=self.sql['proof']
  for token in ('hft.posting_policy_epoch','hft.stock_hold',
    'hft.posting_parent_hold','hft.protected_approval_revocation',
    'hft.protected_approval_supersession','hft.approval_human_login',
    'hft.p2_qualified_human_v1','hft.return_inspection_attestation',
    'hft.material_return_line','hft.material_issue_line',
    'hft.grn_partial_receipt','hft.supplier_invoice',
    'hft.ops_a2_transfer_document','source_account_before_version',
    'dest_account_before_version'):
   self.assertIn(token,proof)
  self.assertIn('actor_person=approver_person',proof)

 def test_atomic_protected_writer_is_serializable_and_two_legged(self):
  w=self.sql['writer']
  self.assertIn("transaction_isolation')<>'serializable'",w)
  self.assertIn('pg_advisory_xact_lock',w)
  self.assertIn('ORDER BY a.id FOR UPDATE',w)
  self.assertIn('source.qty_micro-source.reserved_micro<qty',w)
  self.assertIn('version=src_version',w)
  self.assertIn('version=dst_version',w)
  self.assertIn('ops_a2_verify_invocation_v2(p,proof)',w)
  self.assertIn('ops_a2_authorized_source_v2(p)',w)
  self.assertIn('INSERT INTO hft.stock_command',w)
  self.assertIn('INSERT INTO hft.stock_entry',w)
  self.assertIn('INSERT INTO hft.audit_outbox',w)
  self.assertIn('INSERT INTO hft.stock_command_seal',w)
  self.assertIn('INSERT INTO hft.ops_a2_command_envelope',w)
  self.assertIn('ops_a2_assert_command_seal_v2',w)
  self.assertIn("GET DIAGNOSTICS n=ROW_COUNT",w)

 def test_issue_custody_retains_original_physical_leaf(self):
  w=self.sql['writer']
  self.assertIn("CASE WHEN action='ISSUE' THEN p->>'sourceLeafId'",w)
  self.assertIn("NEW.qty_delta_micro<0 OR c.kind='ISSUE'",w)
  self.assertIn('INSERT INTO hft.employee_custody',w)
  self.assertIn('INSERT INTO hft.custody_ack_pending',w)

 def test_transfers_are_one_document_and_one_ledger_command(self):
  w=self.sql['writer'];sql=self.sql['foundation']
  self.assertIn('ops_a2_transfer_document',sql)
  self.assertIn('UPDATE hft.ops_a2_transfer_document',w)
  self.assertIn('source_uuid=target_uuid',w)
  self.assertIn("action='TRANSFER'",w)
  self.assertIn('hft.stock_entry',w)
  self.assertNotIn('post_stock_command_protected_v1(',w)
  self.assertNotIn('UPDATE hft.stock_account SET product_version_code',w)

 def test_source_and_postproof_reconciliation_read_original_nonce_only(self):
  read=self.sql['read']
  self.assertIn("READ ONLY",read)
  self.assertIn('hft.posting_invocation_nonce',read)
  self.assertIn('proof_mac_sha256',read)
  self.assertIn('ops_a2_assert_command_seal_v2',read)
  self.assertIn('automaticRetryAllowed',read)
  self.assertNotIn('INSERT INTO hft.stock_entry',read)
  self.assertNotIn('UPDATE hft.stock_account',read)
  self.assertIn('hft.ops_a2_read_authoritative_v2',read)
  self.assertIn('hft.ops_a2_verify_readproof_v2',read)
  self.assertIn('OPS_A2_READ_UNQUALIFIED_MULTI_PAGE_SNAPSHOT',read)

 def test_no_runtime_activation_or_new_authoritative_API_routes(self):
  app=STOCK.read_text();reader=READ.read_text()
  self.assertIn('OPS_A2_SYNTHETIC_PG_CLIENT_ONLY',app)
  self.assertIn('OPS_A2_SYNTHETIC_PG_CLIENT_ONLY',reader)
  self.assertIn('withProtectedPostingTransaction',app)
  self.assertIn('withProtectedReadbackTransaction',app)
  self.assertIn('withProtectedReadbackTransaction',reader)
  self.assertIn('OpsA2SourceResult',app)
  self.assertIn('SOURCE_ONLY_COMMITTED_FACT_VERIFIED_NOT_OPERATIONAL',app)
  self.assertIn('SOURCE_ONLY_VERSIONED_READ_NOT_OPERATIONAL',reader)
  for path in (ROOT/'app/api/hft').rglob('route.ts'):
   source=path.read_text()
   self.assertNotIn('ops-a2-stores-source',source)
   self.assertNotIn('ops-a2-stores-readback',source)

 def test_all_source_holds_still_set(self):
  ps=[ROOT/f'config/hft-bootstrap019-stage-s{i}.sha256' for i in range(6)]
  ps +=[ROOT/'config/hft-bootstrap019-review.sha256',
        ROOT/'config/hft-bootstrap019-execution.sha256',
        ROOT/'config/hft-bootstrap019-canonical-catalog.sha256',
        ROOT/'config/hft-recovery-v2-collector-trust.sha256',
        ROOT/'config/hft-recovery-v2-witness-trust.sha256']
  self.assertEqual(len(ps),11)
  self.assertTrue(all(p.read_text().strip()=='HOLD' for p in ps))


if __name__=='__main__':
 unittest.main()
