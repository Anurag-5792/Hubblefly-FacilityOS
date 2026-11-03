"""Recovery V2 source tests: synthetic provider records, subprocess receipts and real test Ed25519 signatures."""
import datetime as dt
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from tools import hft_neon_recovery_v2 as m

class RecoveryV2Contract(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='hft-v2-test-')
  self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name)
  self.now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
  self.ts=lambda mins:(self.now+dt.timedelta(minutes=mins)).isoformat().replace('+00:00','Z')
  self.files={}
  def save(k,v,binary=False):
   path=self.root/k
   path.write_bytes(v if binary else m.normalized(v))
   self.files[k]=str(path)
   return m.sha(path.read_bytes())
  self.save=save
  lsn='1/ABCD'
  sections={'roles':[{'name':'synthetic-staging-owner','login':False}],
   'memberships':[],'schemas':[{'name':'public'}],
   'extensions':[],'objects':[],'owners':[],'acls':[],'revisions':[]}
  state=m.sha(m.normalized(sections))
  inv={'schema':'HFT_R1_PRECHANGE_INVENTORY_V2','source_branch_id':m.STAGING,
   'database':m.DB,'source_lsn':lsn,'captured_at':self.ts(-25),**sections}
  inventory_hash=save('inventory',inv)
  dump=b'PGDMP synthetic staging data - never a real PostgreSQL dump'
  dump_hash=save('dump',dump,True)
  list_hash=save('dump_list',b'pg_restore custom-format table listing\n',True)
  preservation={
   'id':'br-v2-preserve-abc123','name':'hft-prechange-preserve',
   'project_id':m.PROJECT,'parent_id':m.STAGING,'parent_lsn':lsn,
   'parent_timestamp':self.ts(-30),'created_at':self.ts(-30),
   'default':False,'primary':False,'expires_at':self.ts(2880),
   'ttl_interval_seconds':172800,'current_state':'ready'}
  self.provider={'branch':preservation,'endpoints':[],'verified_at':self.ts(-2)}
  self.e={
   'schema':m.SCHEMA,'project_id':m.PROJECT,'source_branch_id':m.STAGING,
   'database':m.DB,'source_lsn':lsn,'source_state_sha256':state,
   'evidence_created_at':self.ts(-30),'evidence_expires_at':self.ts(120),
   'preservation':{'branch_id':preservation['id'],'name':preservation['name'],
    'parent_id':m.STAGING,'parent_lsn':lsn,
    'parent_timestamp':preservation['parent_timestamp'],
    'created_at':preservation['created_at'],'is_default':False,
    'is_primary':False,'endpoint_count':0,
    'retention':{'mode':'FINITE','expires_at':preservation['expires_at'],
     'ttl_interval_seconds':172800,'provider_verified_at':self.ts(-2)},
    'provider_record_sha256':m.sha(m.normalized(
     m.preservation_provider_projection(preservation,[])))},
   'dump':{'sha256':dump_hash,'size_bytes':len(dump),'format':'custom',
    'postgres_major':18,'pg_dump_version':'18.6','pg_restore_version':'18.6',
    'created_at':self.ts(-22),'direct_tls_verified':True,
    'endpoint_id':'ep-lingering-tooth-azvv1jmr','source_lsn':lsn,
    'source_state_sha256':state,'dump_list_sha256':list_hash,
    'file_ref':'restricted/dump'},
   'inventory':{'sha256':inventory_hash,'file_ref':'restricted/inventory',
    'source_state_sha256':state,'source_lsn':lsn,'captured_at':inv['captured_at'],
    **{k:m.sha(m.normalized(v)) for k,v in sections.items()}}}
  self.targets={'verified_at':self.ts(-2),'production_branch_id':m.PRODUCTION_ID,
   'restore_a_branch':{'id':'br-restore-a-abc123','name':'hft-recovery-a',
    'project_id':m.PROJECT,'parent_id':preservation['id'],
    'default':False,'primary':False,'current_state':'ready',
    'created_at':self.ts(-7)},
   'restore_b_branch':{'id':'br-restore-b-abc123','name':'hft-recovery-b',
    'project_id':m.PROJECT,'parent_id':'br-independent-seed-abc123',
    'default':False,'primary':False,'current_state':'ready',
    'created_at':self.ts(-20)},
   'restore_b_databases':[{'name':'hft_restore_abc12345',
    'branch_id':'br-restore-b-abc123'}]}
  for kind_name,kind in (('restore_a','preservation_branch'),('restore_b','logical_database')):
   a=kind_name=='restore_a'
   branch=self.targets['restore_a_branch' if a else 'restore_b_branch']['id']
   target=branch if a else 'hft_restore_abc12345'
   common={'branch_id':branch,'database':m.DB if a else target,
    'source_lsn':lsn,'source_state_sha256':state,'captured_at':self.ts(-3)}
   catalog={'schema':'HFT_R1_RESTORED_CATALOG_READBACK_V2',**common,
    **{k:self.e['inventory'][k] for k in ('schemas','extensions','objects','revisions')}}
   acl={'schema':'HFT_R1_RESTORED_ACL_READBACK_V2',**common,
    **{k:self.e['inventory'][k] for k in ('roles','memberships','owners','acls')}}
   cat_sha=save(kind_name+'_catalog',catalog)
   acl_sha=save(kind_name+'_acl',acl)
   stdout_sha=save(kind_name+'_stdout',b'SYNTHETIC SUCCESS',True)
   stderr_sha=save(kind_name+'_stderr',b'',True)
   receipt={'schema':'HFT_R1_RESTORE_EXECUTION_RECEIPT_V2','kind':kind,
    'operation':'NEON_BRANCH_DERIVE_FROM_PRESERVATION' if a else 'PG_RESTORE_SINGLE_TRANSACTION',
    'target_id':target,'recovery_branch_id':branch,
    'source_branch_id':preservation['id'],'source_lsn':lsn,
    'source_state_sha256':state,'dump_sha256':dump_hash,'inventory_sha256':inventory_hash,
    'started_at':self.ts(-8),'completed_at':self.ts(-5),'exit_code':0,
    'command_argv':['neon','branches','create','--parent',preservation['id']] if a
      else ['pg_restore','--single-transaction','--exit-on-error','<REDACTED>'],
    'provider_operation_id':'test-provider-operation-001' if a else None,
    'stdout_sha256':stdout_sha,'stderr_sha256':stderr_sha,
    'catalog_sha256':cat_sha,'role_acl_sha256':acl_sha}
   receipt_sha=save(kind_name,receipt)
   self.e[kind_name]={'kind':kind,'target_id':target,
    'source_branch_id':preservation['id'],'recovery_branch_id':branch,
    'dump_sha256':dump_hash,'inventory_sha256':inventory_hash,
    'status':'PASS','exit_code':0,'catalog_sha256':cat_sha,
    'role_acl_sha256':acl_sha,'evidence_sha256':receipt_sha}
  private=self.root/'private.key';public=self.root/'public.key'
  subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(private)],
   capture_output=True,check=True)
  subprocess.run(['openssl','pkey','-in',str(private),'-pubout','-out',str(public)],
   capture_output=True,check=True)
  trust={'schema':'HFT_R1_INDEPENDENT_HUMAN_TRUST_V2',
   'witness_id':'HFT-TEST-WITNESS-0123','name':'Test Human Witness',
   'identity_issuer':'HFT_CORPORATE_IDENTITY',
   'verified_by':'Different Corporate Identity Reviewer',
   'verified_at':self.ts(-60),'public_key_pem':public.read_text(),
   'status':'ACTIVE'}
  self.trust_sha=save('witness_trust',trust)
  witness={'schema':'HFT_R1_INDEPENDENT_HUMAN_WITNESS_V2',
   'witness_id':trust['witness_id'],'name':trust['name'],
   'operator_id':'HFT-TEST-OPERATOR-1234','witnessed_at':self.ts(-1),
   'recovery_scope':m.SCHEMA,'subject_sha256':m.sha(m.normalized(self.e))}
  w_sha=save('witness',witness)
  signature=self.root/'witness_signature'
  subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(private),
   '-rawin','-in',self.files['witness'],'-out',str(signature)],
   capture_output=True,check=True)
  self.files['witness_signature']=str(signature)
  self.e['independent_witness']={'witness_id':trust['witness_id'],'name':trust['name'],
   'operator_id':witness['operator_id'],'witness_file_sha256':w_sha,
   'signature_sha256':m.sha(signature.read_bytes()),'trust_record_sha256':self.trust_sha}
 def verify(self):
  return m.validate_v2(self.e,self.provider,self.files,now=self.now,
   targets=self.targets,trust_sha256=self.trust_sha)
 def denial(self,reason):
  with self.assertRaises(ValueError) as error:self.verify()
  self.assertIn(reason,str(error.exception))
 def test_positive_actual_test_signature(self):
  self.assertEqual(self.verify()['schema'],m.SCHEMA)
 def test_missing_preservation(self):
  self.provider['branch']=None;self.denial('PROVIDER_RECORD_MISSING')
 def test_parent_production(self):
  self.e['preservation']['parent_id']=m.PRODUCTION_ID
  self.denial('PRESERVATION_NOT_FROM_STAGING')
 def test_parent_lsn_wrong(self):
  self.e['source_lsn']='3/AB'
  self.denial('SOURCE_PRESERVATION_LSN_MISMATCH')
 def test_finite_expiry_not_covering_recovery(self):
  self.provider['branch']['expires_at']=self.ts(10)
  self.e['preservation']['retention']['expires_at']=self.ts(10)
  self.e['preservation']['provider_record_sha256']=m.sha(m.normalized(
   m.preservation_provider_projection(self.provider['branch'],[])))
  self.denial('PRESERVATION_EXPIRES_BEFORE_RECOVERY_WINDOW')
 def test_false_indefinite_claim(self):
  self.e['preservation']['retention']['mode']='INDEFINITE'
  self.denial('UNSUPPORTED_INDEFINITE_OR_UNVERIFIED_RETENTION')
 def test_missing_ttl(self):
  self.provider['branch']['ttl_interval_seconds']=None
  self.denial('PRESERVATION_PROVIDER_HASH_DRIFT')
 def test_dump_tampered(self):
  Path(self.files['dump']).write_bytes(b'PGDMP altered')
  self.denial('CUSTOM_DUMP_LENGTH_INVALID')
 def test_dump_list_tampered(self):
  Path(self.files['dump_list']).write_bytes(b'alt')
  self.denial('EVIDENCE_HASH_DRIFT')
 def test_acl_inventory_tampered(self):
  Path(self.files['inventory']).write_bytes(b'{}')
  self.denial('EVIDENCE_HASH_DRIFT')
 def test_recovery_a_wrong_parent(self):
  self.targets['restore_a_branch']['parent_id']=m.PRODUCTION_ID
  self.denial('RESTORE_A_NOT_DERIVED_FROM_PRESERVATION')
 def test_recovery_a_actual_production_id(self):
  self.targets['restore_a_branch']['id']=m.PRODUCTION_ID
  self.denial('RESTORE_PRODUCTION_STAGING_OR_DEFAULT_TARGET')
 def test_restore_a_provider_creation_not_in_receipt_window(self):
  self.targets['restore_a_branch']['created_at']=self.ts(-60)
  self.denial('RESTORE_PROVIDER_CREATION_TIMESTAMP_INVALID')
 def test_restore_b_branch_created_after_restore_started(self):
  self.targets['restore_b_branch']['created_at']=self.ts(-4)
  self.denial('RESTORE_B_BRANCH_NOT_READY_BEFORE_RESTORE')
 def test_recovery_b_database_wrong_branch(self):
  self.targets['restore_b_databases'][0]['branch_id']=m.STAGING
  self.denial('RESTORE_B_DATABASE_PROVIDER_NOT_BOUND')
 def test_recovery_b_actual_production_id(self):
  self.targets['restore_b_branch']['id']=m.PRODUCTION_ID
  self.denial('RESTORE_PRODUCTION_STAGING_OR_DEFAULT_TARGET')
 def test_recovery_b_name_equals_active_database(self):
  self.e['restore_b']['target_id']=m.DB
  self.denial('RESTORE_B_DATABASE_NOT_ISOLATED')
 def test_restore_self_pass_but_failed_status(self):
  self.e['restore_b']['status']='FAIL'
  self.denial('RESTORE_FAILED')
 def test_restore_missing_execution_receipt(self):
  Path(self.files['restore_a']).unlink()
  self.denial('EVIDENCE_FILE_MISSING')
 def test_restore_tampered_exit(self):
  p=Path(self.files['restore_b']);r=json.loads(p.read_text())
  r['exit_code']=1;p.write_bytes(m.normalized(r))
  self.denial('EVIDENCE_HASH_DRIFT')
 def test_catalog_readback_missing(self):
  Path(self.files['restore_a_catalog']).unlink()
  self.denial('EVIDENCE_FILE_MISSING')
 def test_witness_missing(self):
  Path(self.files['witness']).unlink()
  self.denial('EVIDENCE_FILE_MISSING')
 def test_fake_witness_signature(self):
  Path(self.files['witness_signature']).write_bytes(b'spoofed')
  self.e['independent_witness']['signature_sha256']=m.sha(b'spoofed')
  self.denial('INDEPENDENT_WITNESS_SIGNATURE_INVALID')
 def test_trust_not_pinned(self):
  with self.assertRaisesRegex(ValueError,'TRUST_NOT_APPROVED'):
   m.validate_v2(self.e,self.provider,self.files,now=self.now,
    targets=self.targets,trust_sha256='HOLD')
 def test_stale_provider(self):
  self.targets['verified_at']=self.ts(-60)
  self.denial('PROVIDER_READBACK_STALE')
 def test_wrong_phase(self):
  for phase,state in (
   ('prepare-security','APPROVED_EMPTY'),
   ('prepare-migration-owner','APPROVED_EMPTY'),
   ('migrate','APPROVED_EMPTY'),
   ('finalize-owner','EXACT_CANONICAL_0001_0006'),
   ('finalize-dba','EXACT_CANONICAL_0001_0006')):
   self.assertTrue(m.validate_phase(phase,state,'A_AUTHORIZED'))
   other='APPROVED_EMPTY' if state.startswith('EXACT_') else 'EXACT_CANONICAL_0001_0006'
   with self.assertRaises(ValueError):m.validate_phase(phase,other,'A_AUTHORIZED')
  with self.assertRaises(ValueError):
   m.validate_phase('migrate','APPROVED_EMPTY','R_PREPARED')
if __name__=='__main__':unittest.main()

