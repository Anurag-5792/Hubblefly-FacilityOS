"""C028-01 exact catalog collector source-only positive/negative tests."""
import json,tempfile,unittest
from pathlib import Path
from tools import hft_c028_catalog as c

class ExactCatalog(unittest.TestCase):
 def fixture(self,post):
  rows={k:[] for k in c.CATEGORIES}
  rows['schemas']=[{'id':'public'}]
  if post:
   rows['schemas']=[{'id':'hft'},{'id':'public'}]
   rows['relations']=[{'id':'hft.schema_revision'},{'id':'hft.stock_entry'}]
   rows['functions']=[{'id':'hft.deny_fact_mutation()'}]
   rows['triggers']=[{'id':'hft.stock_entry.no_stock_entry_change'}]
   rows['constraints']=[{'id':'hft.stock_entry_pkey@stock_entry'}]
   rows['indexes']=[{'id':'hft.stock_entry_pkey'}]
  return rows
 def source(self,rows):
  events=[]
  outputs=iter([json.dumps(rows[k],separators=(',',':')) for k in c.CATEGORIES])
  def call(sql):
   events.append(sql)
   if not sql.startswith('BEGIN READ ONLY;') or not sql.rstrip().endswith('ROLLBACK;'):
    raise AssertionError('MUTATION_SQL_FORBIDDEN')
   return next(outputs)
  return call,events
 def test_complete_canonical_queries_include_all_protected_categories(self):
  c.check_manifest()
  self.assertEqual(len(c.CATEGORIES),22)
  for required in ('schemas','relations','functions','triggers','constraints',
   'indexes','policies','extensions','roles','memberships','effective_grants',
   'function_grants','sequence_grants','schema_grants','database_grants',
   'types','rules','event_triggers','publications','operators','collations',
   'default_privileges'):
   self.assertIn(required,c.CATEGORIES)
 def test_clean_prebootstrap_catalog(self):
  query,events=self.source(self.fixture(False))
  self.assertEqual(c.verify_prebootstrap(query),c.sha(c.canonical(self.fixture(False))))
  self.assertEqual(len(events),len(c.CATEGORIES))
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

