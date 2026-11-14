"""R77 source regressions and independent arithmetic oracle. NO PostgreSQL execution."""
from pathlib import Path
import copy
import hashlib
import unittest
ROOT=Path(__file__).resolve().parents[1]
SEC=ROOT/'db/security'
WRITER=SEC/'HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql'
PROOF=SEC/'HFT-R1-OPS-A2-PROOF-AUTHORITY-NONEXECUTABLE.sql'
READ=SEC/'HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql'
FULL=SEC/'HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql'
def function(text,name,tag):
 start=text.index('CREATE OR REPLACE FUNCTION hft.'+name+'(')
 end=text.index('END $'+tag+'$;',start)+len('END $'+tag+'$;')
 return text[start:end]
def status_from_lines(lines):
 if not lines or any(type(o) is not int or type(a) is not int or o<=0 or a<0 or a>o for o,a in lines):
  raise ValueError('INCONSISTENT_LINES')
 ordered,accepted=map(sum,zip(*lines))
 return 'AUTHORIZED' if accepted==0 else ('RECEIVED' if ordered==accepted else 'PARTIALLY_RECEIVED')
def oracle_receive(state,receipt,signed,binding,approval,*,proof=True,late=False):
 """Independent test oracle only, not database persistence."""
 next_state=copy.deepcopy(state)
 if not proof:raise ValueError('INVALID_PROOF')
 if state['status']!=status_from_lines(state['lines']):raise ValueError('INCONSISTENT_STATUS')
 if receipt['id'] in state['receipts']:raise ValueError('REPLAY')
 if receipt['qc']!='ACCEPTED' or receipt['bin']!='BIN01':raise ValueError('SOURCE_OR_QC')
 if not(receipt['quantity']==signed==binding==approval and signed>0):raise ValueError('EXACT_PHYSICAL_QUANTITY_REQUIRED')
 line=receipt['line'];order,before=state['lines'][line]
 if before+signed>order:raise ValueError('CEILING')
 next_state['lines'][line]=(order,before+signed)
 next_state['status']=status_from_lines(next_state['lines'])
 next_state['receipts'].add(receipt['id'])
 next_state['legs'] += [(None,'EXTERNAL',-signed),('ACCT01','AVAILABLE',signed)]
 next_state['quantity']+=signed;next_state['version']+=1
 if late:raise ValueError('LATE_STAGE_ROLLBACK_MODEL_ONLY')
 return next_state
class ReceiveSourceR77(unittest.TestCase):
 def test_canonical_0005_0006_unchanged(self):
  for path,digest in (('0005_hft_quantitative_accounts_receipts.sql','01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf'),('0006_hft_posted_fact_integrity.sql','664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')):
   self.assertEqual(hashlib.sha256((ROOT/'db/migrations'/path).read_bytes()).hexdigest(),digest)
 def test_stop_in_every_candidate(self):
  for path in (WRITER,PROOF,READ,FULL):
   sql=path.read_text();stop="RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED'"
   self.assertIn(stop,sql);self.assertLess(sql.index(stop),sql.index('CREATE OR REPLACE FUNCTION'))
 def test_lock_header_and_all_lines_before_verifier_and_stock_dml(self):
  for path in (WRITER,FULL):
   sql=function(path.read_text(),'ops_a2_post_stock_command_v2','writer');verify=sql.index('binding:=hft.ops_a2_authorized_source_v2(p)')
   self.assertLess(sql.index('FOR UPDATE OF g'),verify)
   self.assertLess(sql.index('ORDER BY gl.line_no FOR UPDATE'),verify)
   self.assertLess(sql.index('assert_grn_receipt_cumulative_v2(receive_grn.id)'),verify)
   self.assertLess(sql.index('INTO STRICT receipt_uuid,receipt_line'),sql.index('UPDATE hft.stock_account'))
   self.assertIn('w.site_id=site',sql)
   self.assertIn("g.authorization_revision=(p->>'sourceRevision')::bigint",sql)
   self.assertIn("g.authorized_by=p->>'approvedBy'",sql)
 def test_status_uses_all_lines_and_changes_no_authorization(self):
  for path in (WRITER,FULL):
   sql=function(path.read_text(),'ops_a2_post_stock_command_v2','writer')
   segment=sql.split('-- R77-R01: derive status',1)[1].split("ELSIF action='ISSUE'",1)[0]
   self.assertIn('FROM hft.grn_line AS gl WHERE gl.grn_id=receive_grn.id;',segment)
   self.assertNotIn('gl.item_code=',segment)
   self.assertIn("THEN 'RECEIVED'",segment);self.assertIn("ELSE 'PARTIALLY_RECEIVED'",segment)
   update=segment.split('UPDATE hft.grn AS g',1)[1].split('WHERE g.id=',1)[0]
   self.assertNotIn('authorization_revision=',update);self.assertNotIn('authorized_by=',update)
   self.assertIn('g.status=receive_grn.status',segment)
   self.assertEqual(sql.count('PERFORM hft.assert_grn_receipt_cumulative_v2(receive_grn.id);'),2)
   self.assertLess(sql.index('OPS_A2_INVOICE_OVER_RECEIPT'),sql.index('UPDATE hft.grn AS g'))
 def test_receipt_exact_quantity_and_identity_precedes_mutation(self):
  sql=function(WRITER.read_text(),'ops_a2_post_stock_command_v2','writer')
  segment=sql.split('-- R77-R02: one physical receipt',1)[1].split('UPDATE hft.stock_account',1)[0]
  for part in ('r.accepted_micro=qty','r.batch_no=lot AND r.serial_no=serial',"r.evidence_reference=p->>'inspectionEvidenceId'",'INTO STRICT','NO_DATA_FOUND OR TOO_MANY_ROWS','source_receipt_id=receipt_uuid','OPS_A2_R77_PHYSICAL_RECEIPT_ALREADY_POSTED'):
   self.assertIn(part,segment)
  self.assertNotIn('r.accepted_micro>=qty',segment);self.assertEqual(sql.count('INTO STRICT receipt_uuid,receipt_line'),1)
 def test_p0_binding_approval_and_receipt_quantities_agree(self):
  auth=function(PROOF.read_text(),'ops_a2_authorized_source_v2','authorized')
  self.assertIn("b.action_kind='RECEIVE' AND source_rev IS NOT NULL",auth)
  self.assertIn('source_qty IS DISTINCT FROM b.authorized_micro',auth)
  self.assertIn('a.quantity_micro<>b.authorized_micro',auth)
  self.assertIn("b.authorized_micro<>(p->>'quantityMicro')::bigint",auth)
  read=function(READ.read_text(),'ops_a2_resolve_authorized_v2','resolve')
  self.assertIn("((p->>'quantity')::numeric*1000000)",read)
  self.assertLess(read.index('p0_verify_stores_proof_v1'),read.index('OPS_A2_R77_P0_RECEIPT_QUANTITY_MISMATCH'))
 def test_v2_historical_seal_rechecks_original_receipt(self):
  sql=function(WRITER.read_text(),'ops_a2_assert_command_seal_v2','assertseal')
  for part in ('r.id=c.source_receipt_id','r.accepted_micro=c.quantity_micro','r.line_no=c.source_line_no','r.ops_a2_product_version_code=c.product_version_code','OPS_A2_R77_SEALED_RECEIPT_QUANTITY_OR_IDENTITY_MISMATCH'):
   self.assertIn(part,sql)
  self.assertNotIn('FOR UPDATE',sql)
 def test_component_bundle_identity(self):
  bundle=FULL.read_text()
  for path,name,tag in ((WRITER,'ops_a2_post_stock_command_v2','writer'),(WRITER,'ops_a2_assert_command_seal_v2','assertseal'),(PROOF,'ops_a2_authorized_source_v2','authorized'),(READ,'ops_a2_resolve_authorized_v2','resolve')):
   self.assertEqual(function(path.read_text(),name,tag),function(bundle,name,tag))
 def test_atomicity_and_protected_gates_retained(self):
  sql=WRITER.read_text()
  self.assertIn("transaction_isolation')<>'serializable'",sql)
  self.assertIn('OPS_A2_DUPLICATE_COMMAND_RECONCILE_ONLY',sql)
  self.assertNotIn('UPDATE hft.grn_partial_receipt',sql);self.assertNotIn('DISABLE TRIGGER',sql)
  self.assertIn('DEFERRABLE INITIALLY DEFERRED',sql)
  self.assertIn('HFT_R1_API_NOT_QUALIFIED',(ROOT/'middleware.ts').read_text())
class ReceiveArithmeticOracleR77(unittest.TestCase):
 def setUp(self):
  self.state=dict(lines=[(10000000,0),(1000000,0)],status='AUTHORIZED',receipts=set(),legs=[],quantity=0,version=0)
  self.receipt=dict(id='PHYSICAL01',quantity=5000000,line=0,bin='BIN01',qc='ACCEPTED')
 def test_batch_five_partial(self):
  result=oracle_receive(self.state,self.receipt,5000000,5000000,5000000)
  self.assertEqual(result['status'],'PARTIALLY_RECEIVED');self.assertEqual(result['quantity'],5000000)
  self.assertEqual(result['version'],1)
  self.assertEqual(result['legs'],[(None,'EXTERNAL',-5000000),('ACCT01','AVAILABLE',5000000)])
 def test_complete_one_line_not_whole_grn(self):
  self.state['lines'][0]=(5000000,0)
  self.assertEqual(oracle_receive(self.state,self.receipt,5000000,5000000,5000000)['status'],'PARTIALLY_RECEIVED')
 def test_new_partial_delivery_requires_new_receipt(self):
  first=oracle_receive(self.state,self.receipt,5000000,5000000,5000000)
  with self.assertRaisesRegex(ValueError,'REPLAY'):oracle_receive(first,self.receipt,5000000,5000000,5000000)
  second=oracle_receive(first,dict(self.receipt,id='PHYSICAL02'),5000000,5000000,5000000)
  self.assertEqual(second['status'],'PARTIALLY_RECEIVED')
  third=oracle_receive(second,dict(self.receipt,id='SERIAL01',quantity=1000000,line=1),1000000,1000000,1000000)
  self.assertEqual(third['status'],'RECEIVED')
 def test_serial_one_full(self):
  self.state['lines']=[(1000000,0)]
  self.assertEqual(oracle_receive(self.state,dict(self.receipt,quantity=1000000),1000000,1000000,1000000)['status'],'RECEIVED')
 def test_under_and_over_even_with_new_matching_approval(self):
  for q in (4000000,6000000):
   with self.subTest(q=q),self.assertRaisesRegex(ValueError,'EXACT_PHYSICAL'):oracle_receive(self.state,self.receipt,q,q,q)
 def test_binding_approval_mismatch(self):
  for s,b,a in ((5000000,4000000,5000000),(5000000,5000000,4000000)):
   with self.assertRaisesRegex(ValueError,'EXACT_PHYSICAL'):oracle_receive(self.state,self.receipt,s,b,a)
 def test_inconsistent_status_rejected_not_repaired(self):
  for status in ('RECEIVED','PARTIALLY_RECEIVED'):
   with self.assertRaisesRegex(ValueError,'INCONSISTENT_STATUS'):oracle_receive(dict(self.state,status=status),self.receipt,5000000,5000000,5000000)
 def test_altered_proof_bin_qc(self):
  with self.assertRaisesRegex(ValueError,'INVALID_PROOF'):oracle_receive(self.state,self.receipt,5000000,5000000,5000000,proof=False)
  for patch in ({'bin':'BIN02'},{'qc':'REJECTED'}):
   with self.assertRaisesRegex(ValueError,'SOURCE_OR_QC'):oracle_receive(self.state,dict(self.receipt,**patch),5000000,5000000,5000000)
 def test_late_failure_model_unchanged(self):
  before=copy.deepcopy(self.state)
  with self.assertRaisesRegex(ValueError,'LATE_STAGE'):oracle_receive(self.state,self.receipt,5000000,5000000,5000000,late=True)
  self.assertEqual(self.state,before)
 def test_exact_numeric_all_lines(self):
  self.assertEqual(status_from_lines([(9223372036854775000,9223372036854775000),(10,10)]),'RECEIVED')
  for lines in ([],[(1,2)],[(1,-1)],[(0,0)]):
   with self.assertRaises(ValueError):status_from_lines(lines)
if __name__=='__main__':unittest.main(verbosity=2)
