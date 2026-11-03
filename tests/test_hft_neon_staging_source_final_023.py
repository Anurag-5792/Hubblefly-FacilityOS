"""BOOTSTRAP-019 SOURCE-FINAL-023 enforcement tests. No Neon mutation."""
import importlib.util,json,os,pathlib,shutil,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('hft023',ROOT/'tools/hft_neon_staging_bootstrap.py')
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)
TOKEN='SYNTHETIC_CONTROL_PLANE_TOKEN_023_NOT_SECRET'
def fake_get(path,token):
 if token!=TOKEN: raise AssertionError('token')
 if path.endswith('/branches'):
  return {'branches':[{'id':m.BRANCH,'name':m.BRANCH_NAME,'default':False,'primary':False},
    {'id':'br-production','name':'production','default':True,'primary':True}]}
 if path.endswith('/endpoints'):
  return {'endpoints':[{'id':m.ENDPOINT,'host':m.HOST,'branch_id':m.BRANCH,'type':'read_write','region_id':'aws-ap-southeast-1'}]}
 if path.endswith('/databases'):
  return {'databases':[{'name':m.DB,'owner_name':m.OWNER}]}
 if path.endswith('/snapshots'):
  return {'snapshots':[{'id':'snap-good','name':'hft-r1-bootstrap019-prechange-001','source_branch_id':m.BRANCH,'manual':True,'created_at':'2026-11-02T08:00:00Z','expires_at':'2026-11-04T20:00:00Z'}]}
 return {'project':{'id':m.PROJECT}}
class SourceFinal023(unittest.TestCase):
 def live(self): return m.control_plane_live({'HFT_NEON_CONTROL_PLANE_API_TOKEN':TOKEN},fake_get)
 def test_live_control_plane_binds_target_database_and_production_exclusion(self):
  x=self.live();self.assertEqual(x['br¶»§q«^