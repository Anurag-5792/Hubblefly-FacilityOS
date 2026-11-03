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
   'id':'br-v2-preserve-abc123','name¶»§q«^