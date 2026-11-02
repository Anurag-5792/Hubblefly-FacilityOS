"""Synthetic Recovery V2 evidence and denial tests; never touches Neon."""
import copy,datetime as dt,hashlib,json,tempfile,unittest
from pathlib import Path
from tools.hft_neon_recovery_v2 import validate_v2,validate_phase
H=lambda b:hashlib.sha256(b).hexdigest()
NOW=dt.datetime.now(dt.timezone.utc)
UTC=lambda d:(NOW+dt.timedelta(days=d)).isoformat().replace('+00:00','Z')
class V2(unittest.TestCase):
 def make(self,d):
  dump=b'PGDMP'+b'0123456789';lst=b'pg_restore inventory';inv=b'canonical normalized roles ACL inventory'
  files={'dump':d/'dump.backup','dump_list':d/'dump.list','inventory':d/'inventory.json',
   'restore_a':d/'restore_a.json','restore_b':d/'restore_b.json'}
  for k,body in [('dump',dump),('dump_list',lst),('inventory',inv),
   ('restore_a',b'PASS recovery branch'),('restore_b',b'PASS isolated pg_restore')]:
   files[k].write_bytes(body)
  provider={'id':'br-preservation-abc123','name':'hft-recovery-001',
   'parent_id':'br-dawn-moon-azd9xzrp','parent_lsn':'1/ABCD',
   'parent_timestamp':UTC(-1),'created_at':UTC(-1),
   'is_default':False,'is_primary':False,'endpoints':[],
   'retention':{'mode':'FINITE','expires_at':UTC(4),'provider_verified_at':UTC(-1)}}
  preservation={'branch_id':provider['id'],'name':provider['name'],'parent_id':provider['parent_id'],
   'parent_lsn':provider['parent_lsn'],'parent_timestamp':provider['parent_timestamp'],
   'created_at':provider['created_at'],'is_default':False,'is_primary':False,
   'endpoint_count':0,'retention':provider['retention'],
   'provider_record_sha256':H(json.dumps(provider,sort_keys=True,separators=(',',':')).encode())}
  witness={'name':'Independent Human Verifier','identity_verified':True,
   'independent_of_operator':True,'signed_evidence_sha256':H(b'human signed evidence')}
  restore=lambda kind,key:{'kind':kind,'target_id':'br-restore-123' if key=='restore_a' else 'hft_isolated_restore_db',
   'source_branch_id':provider['id'],'dump_sha256':H(dump),'inventory_sha256':H(inv),
   'status':'PASS','exit_code':0,'catalog_sha256':H(b'catalog'),'role_acl_sha256':H(b'acl'),
   'witness_sha256':witness['signed_evidence_sha256'],'evidence_sha256':H(files[key].read_bytes())}
  e={'schema':'HFT_R1_NEON_PRECHANGE_RECOVERY_V2',
   'project_id':'red-silence-36758131','source_branch_id':'br-dawn-moon-azd9xzrp','database':'neondb',
   'source_state_sha256':H(b'stage epoch 001'),
   'preservation':preservation,'dump':{'sha256':H(dump),'size_bytes':len(dump),
     'format':'custom','postgres_major':18,'pg_dump_version':'18.6','pg_restore_version':'18.6',
     'created_at':UTC(-1),'direct_tls_verified':True,'endpoint_id':'ep-lingering-tooth-azvv1jmr',
     'dump_list_sha256':H(lst),'file_ref':'restricted/custody/dump'},
   'inventory':{'sha256':H(inv),'file_ref':'restricted/custody/inventory',
     'source_state_sha256':H(b'stage epoch 001'),'captured_at':UTC(-1),
     **{k:H(k.encode()) for k in ('roles','memberships','schemas','extensions','objects','owners','acls','revisions')}},
   'restore_a':restore('preservation_branch','restore_a'),
   'restore_b':restore('logical_database','restore_b'),
   'independent_witness':witness,'evidence_created_at':UTC(-1),'evidence_expires_at':UTC(2)}
  return e,provider,files
 def check(self,change,expected=None):
  with tempfile.TemporaryDirectory() as tmp:
   e,p,f=self.make(Path(tmp));change(e,p,f)
   with self.assertRaises(ValueError) as error:validate_v2(e,p,f)
   if expected:self.assertIn(expected,str(error.exception))
 def test_positive(self):
  with tempfile.TemporaryDirectory() as tmp:
   e,p,f=self.make(Path(tmp))
   r=validate_v2(e,p,f);self.assertEqual(r['status'],'QUALIFIED_SOURCE_EVIDENCE')
 def test_wrong_parent(self):self.check(lambda e,p,f:e['preservation'].update(parent_id='br-production'),'PRESERVATION_PARENT')
 def test_wrong_parent_lsn(self):self.check(lambda e,p,f:e['preservation'].update(parent_lsn='2/ABCD'),'PROVIDER_BRANCH_MISMATCH')
 def test_expired_retention(self):self.check(lambda e,p,f:e['preservation']['retention'].update(expires_at=UTC(-2)),'RETENTION_EXPIRED')
 def test_indefinite_contradiction(self):self.check(lambda e,p,f:e['preservation']['retention'].update(mode='INDEFINITE'),'RETENTION_CONTRADICTION')
 def test_tampered_dump(self):self.check(lambda e,p,f:f['dump'].write_bytes(b'PGDMP changed'),'EVIDENCE_TAMPERED')
 def test_tampered_dump_list(self):self.check(lambda e,p,f:f['dump_list'].write_bytes(b'bad list'),'EVIDENCE_TAMPERED')
 def test_tampered_inventory(self):self.check(lambda e,p,f:f['inventory'].write_bytes(b'bad acl'),'EVIDENCE_TAMPERED')
 def test_failed_restore(self):self.check(lambda e,p,f:e['restore_b'].update(status='FAIL'),'RESTORE_TARGET_OR_RESULT')
 def test_production_restore(self):self.check(lambda e,p,f:e['restore_a'].update(target_id='production'),'RESTORE_TARGET_OR_RESULT')
 def test_staging_restore(self):self.check(lambda e,p,f:e['restore_b'].update(target_id='br-dawn-moon-azd9xzrp'),'RESTORE_TARGET_OR_RESULT')
 def test_missing_witness(self):self.check(lambda e,p,f:e['independent_witness'].update(identity_verified=False),'INDEPENDENT_WITNESS')
 def test_missing_preservation(self):self.check(lambda e,p,f:p.update(id='other'),'PROVIDER_BRANCH_MISMATCH')
 def test_hash_mismatch(self):self.check(lambda e,p,f:e['preservation'].update(provider_record_sha256='0'*64),'PROVIDER_HASH')
 def test_gate_phase(self):
  for phase,state,gate,pass_expected in [
    ('prepare-security','APPROVED_EMPTY','A_AUTHORIZED',True),
    ('finalize','EXACT_CANONICAL_0001_0006','A_AUTHORIZED',True),
    ('finalize','APPROVED_EMPTY','A_AUTHORIZED',False),
    ('migrate','EXACT_CANONICAL_0001_0006','A_AUTHORIZED',False),
    ('prepare-security','APPROVED_EMPTY','R_PREPARED',False)]:
   if pass_expected:self.assertTrue(validate_phase(phase,state,gate))
   else:
    with self.assertRaises(ValueError):validate_phase(phase,state,gate)
if __name__=='__main__':unittest.main()

