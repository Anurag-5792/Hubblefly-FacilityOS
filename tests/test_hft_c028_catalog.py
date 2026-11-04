"""C028-01 exact catalog collector source-only positive/negative tests."""
import json,tempfile,unittest
from pathlib import Path
from tools import hft_c028_catalog as c

class ExactCatalog(unittest.TestCase):
 def fixture(self,post):
  rows={k:[] for k in c.CATEGORIES}
  rows['schemas']=[{'id':'public'}]
  rows['database_security']=[{'id':'neondb','owner':'neondb_owner','public_connect':False,'public_create':False,'public_temporary':False}]
  rows['provider_roles']=[{'id':'neon_superuser'},{'id':'neondb_owner'}]
  rows['schema_public_grants']=[{'id':'public','public_create':False,'public_usage':True}]
  if post:
   rows['schemas']=[{'id':'hft'},{'id':'public'}]
   rows['relations']=[{'id':'hft.schema_revision'},{'id':'hft.stock_entry'}]
   rows['columns']=[{'id':'hft.stock_entry.id'},{'id':'hft.stock_entry.qty_delta_micro'}]
   rows['sequence_settings']=[]
   rows['functions']=[{'id':'hft.deny_fact_mutation()'}]
   rows['triggers']=[{'id':'hft.stock_entry.no_stock_entry_change'}]
   rows['constraints']=[{'id':'hft.stock_entry_pkey@stock_entry'}]
   rows['indexes']=[{'id':'hft.stock_entry_pkey'}]
  return rows
 def source(self,rows,mutate=None):
  events=[]
  def call(sql):
   events.append(sql)
   self.assertEqual(sql.count('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'),1)
   self.assertEqual(sql.count('ROLLBACK;'),1)
   self.assertIn("pg_current_snapshot()::text",sql)
   if mutate is not None:mutate(rows)
   frames=[]
   for kind in c.CATEGORIES:
    frame={'kind':kind,'pid':918,'snapshot':'3:3:','database':'neondb',
      'db_user':'neondb_owner','session_user':'neondb_owner','version':'180006',
      'isolation':'repeatable read','read_only':'on','data':rows[kind]}
    frames.append(json.dumps(frame,separators=(',',':')))
   return '\n'.join(frames)
  return call,events
 def test_complete_canonical_queries_include_all_protected_categories(self):
  c.check_manifest()
  self.assertEqual(len(c.CATEGORIES),28)
  for required in ('schemas','relations','columns','sequence_settings','functions','triggers','constraints',
   'indexes','policies','extensions','roles','memberships','effective_grants',
   'function_grants','sequence_grants','schema_grants','database_grants',
   'types','rules','event_triggers','publications','operators','collations',
   'default_privileges','database_security','provider_roles','provider_memberships','schema_public_grants'):
   self.assertIn(required,c.CATEGORIES)
 def test_clean_prebootstrap_catalog(self):
  query,events=self.source(self.fixture(False))
  self.assertEqual(c.verify_prebootstrap(query),c.sha(c.canonical(self.fixture(False))))
  self.assertEqual(len(events),1)
 def test_rogue_public_function_is_denied_prebootstrap(self):
  data=self.fixture(False)
  data['functions']=[{'id':'public.rogue_writer()'}]
  with self.assertRaisesRegex(ValueError,'C028_CATALOG_PRE_UNAPPROVED_FUNCTIONS'):
   c.verify_prebootstrap(self.source(data)[0])
 def test_extra_user_table_denied_after_canonical(self):
  with tempfile.TemporaryDirectory() as tmp:
   f=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   f.write_text(c.sha(c.canonical(baseline))+'\n')
   self.assertEqual(c.verify_postcanonical(self.source(baseline)[0],f),
    c.sha(c.canonical(baseline)))
   changed=self.fixture(True)
   changed['relations'].append({'id':'hft.unapproved_table'})
   with self.assertRaisesRegex(ValueError,'C028_CATALOG_EXTRA_MISSING_OR_ALTERED_CATALOG'):
    c.verify_postcanonical(self.source(changed)[0],f)
 def test_extra_column_and_sequence_setting_change_denied(self):
  with tempfile.TemporaryDirectory() as tmp:
   pin=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   pin.write_text(c.sha(c.canonical(baseline))+'\n')
   for category,rogue in (
    ('columns',{'id':'hft.stock_entry.rogue_column'}),
    ('sequence_settings',{'id':'hft.rogue_sequence','increment_by':999})):
    with self.subTest(category=category):
     altered=self.fixture(True);altered[category].append(rogue)
     with self.assertRaisesRegex(ValueError,'C028_CATALOG_EXTRA_MISSING_OR_ALTERED_CATALOG'):
      c.verify_postcanonical(self.source(altered)[0],pin)
 def test_column_attribute_and_sequence_parameters_cannot_drift(self):
  with tempfile.TemporaryDirectory() as tmp:
   pin=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   baseline['sequence_settings']=[{'id':'hft.audit_seq',
     'increment_by':1,'start_value':1,'cache_size':1}]
   baseline['columns']=[{'id':'hft.stock_entry.id','data_type':'uuid',
     'not_null':True,'default_expression':None}]
   pin.write_text(c.sha(c.canonical(baseline))+'\n')
   self.assertEqual(c.verify_postcanonical(self.source(baseline)[0],pin),
     c.sha(c.canonical(baseline)))
   for category,key,value in (('columns','data_type','text'),
     ('columns','not_null',False),('sequence_settings','increment_by',2),
     ('sequence_settings','cache_size',100)):
    with self.subTest(category=category,attribute=key):
     altered={k:[dict(x) for x in v] for k,v in baseline.items()}
     altered[category][0][key]=value
     with self.assertRaisesRegex(ValueError,'C028_CATALOG_EXTRA_MISSING_OR_ALTERED_CATALOG'):
      c.verify_postcanonical(self.source(altered)[0],pin)
 def test_missing_canonical_column_denied(self):
  with tempfile.TemporaryDirectory() as tmp:
   pin=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   pin.write_text(c.sha(c.canonical(baseline))+'\n')
   altered=self.fixture(True);altered['columns']=[]
   with self.assertRaisesRegex(ValueError,'C028_CATALOG_REQUIRED_COLUMNS_MISSING'):
    c.verify_postcanonical(self.source(altered)[0],pin)
 def test_extra_unapproved_function_denied_after_canonical(self):
  with tempfile.TemporaryDirectory() as tmp:
   f=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   f.write_text(c.sha(c.canonical(baseline))+'\n')
   changed=self.fixture(True)
   changed['functions'].append({'id':'hft.rogue_writer()'})
   with self.assertRaisesRegex(ValueError,'C028_CATALOG_EXTRA_MISSING_OR_ALTERED_CATALOG'):
    c.verify_postcanonical(self.source(changed)[0],f)
 def test_missing_canonical_function_trigger_constraint_denied(self):
  with tempfile.TemporaryDirectory() as tmp:
   f=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   f.write_text(c.sha(c.canonical(baseline))+'\n')
   for category in ('functions','triggers','constraints'):
    with self.subTest(category=category):
     changed=self.fixture(True);changed[category]=[]
     with self.assertRaisesRegex(ValueError,'C028_CATALOG_REQUIRED_|C028_CATALOG_EXTRA_MISSING'):
      c.verify_postcanonical(self.source(changed)[0],f)
 def test_effective_role_permission_drift_denied(self):
  with tempfile.TemporaryDirectory() as tmp:
   f=Path(tmp)/'catalog.sha256';baseline=self.fixture(True)
   baseline['effective_grants']=[{'id':'hft_staging_app_runtime:hft.stock_account',
     'can_insert':False}]
   f.write_text(c.sha(c.canonical(baseline))+'\n')
   changed=self.fixture(True)
   changed['effective_grants']=[{'id':'hft_staging_app_runtime:hft.stock_account',
     'can_insert':True}]
   with self.assertRaisesRegex(ValueError,'C028_CATALOG_EXTRA_MISSING_OR_ALTERED_CATALOG'):
    c.verify_postcanonical(self.source(changed)[0],f)
 def test_unapproved_catalog_pin_remains_hold(self):
  data=self.fixture(True)
  with self.assertRaisesRegex(ValueError,'C028_CATALOG_EXPECTED_FINGERPRINT_NOT_APPROVED'):
   c.verify_postcanonical(self.source(data)[0])

if __name__=='__main__':unittest.main()

