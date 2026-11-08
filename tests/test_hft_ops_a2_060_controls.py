"""060 focused negative-control source contracts, not PostgreSQL acceptance."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SEC=ROOT/'db/security'
WRITER=(SEC/'HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql').read_text()
BASE=(SEC/'HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql').read_text()
MIG=(SEC/'HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql').read_text()

class SecurityGov060(unittest.TestCase):
 def test_two_legs_require_exact_authorized_magnitudes(self):
  # A balanced -2/+2 must fail if the command authorizes only 1.
  for required in ('debit.qty_delta_micro=-c.quantity_micro',
                   'credit.qty_delta_micro=c.quantity_micro',
                   'debit.account_id IS NOT DISTINCT FROM c.ops_a2_source_account_id',
                   'credit.account_id=c.ops_a2_destination_account_id',
                   'debit.account_after_version=debit.account_before_version+1',
                   'credit.account_after_version=credit.account_before_version+1'):
   with self.subTest(check=required):self.assertIn(required,WRITER)
  self.assertIn('OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS',WRITER)
  self.assertIn('DEFERRABLE INITIALLY DEFERRED',WRITER)

 def test_transfer_signed_identity_cannot_be_mutated(self):
  for field in ('NEW.item_code','NEW.product_version_code','NEW.source_leaf',
                'NEW.destination_leaf','NEW.approval_evidence_sha256',
                'NEW.prepared_by','NEW.checked_by','NEW.approved_by','NEW.revision'):
   self.assertIn(field,BASE)
  self.assertIn("current_user<>'hft_r1_posting_owner'",BASE)
  self.assertIn("OLD.status NOT IN('AUTHORIZED','PARTIALLY_MOVED')",BASE)
  self.assertIn('NEW.moved_micro<=OLD.moved_micro',BASE)
  self.assertIn('NEW.moved_micro>OLD.authorized_micro',BASE)
  self.assertIn('TRANSFER_DOCUMENT_DELETION_DENIED',BASE)
  self.assertIn('BEFORE UPDATE OR DELETE ON hft.ops_a2_transfer_document',BASE)

 def test_guarded_consensus_source_contains_same_protections(self):
  for token in ('debit.qty_delta_micro=-c.quantity_micro',
                'credit.qty_delta_micro=c.quantity_micro',
                'OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION',
                'OPS_A2_TRANSFER_DOCUMENT_DELETION_DENIED'):
   self.assertIn(token,MIG)
  self.assertLess(MIG.index("RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'"),
                  MIG.index('CREATE TABLE hft.ops_a2_transfer_document'))

if __name__=='__main__':unittest.main()
