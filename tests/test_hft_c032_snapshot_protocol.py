"""C032 security catalog and single-backend protocol: synthetic transport only.

No PostgreSQL/Neon connection is made. The transport emulates psql framing
and a frozen repeatable-read snapshot, including deliberate protocol faults.
"""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import hft_c028_catalog as catalog
from tools import hft_neon_staging_bootstrap as runner


class SyntheticPg18:
 def __init__(self):
  self.calls=0
  self.rows={key:[] for key in catalog.CATEGORIES}
  self.rows['schemas']=[{'id':'public'}]
  self.rows['database_security']=[{'id':'neondb','owner':'neondb_owner',
   'acl':'{=Tc/neondb_owner}', 'public_connect':True,
   'public_create':False,'public_temporary':True}]
  self.rows['provider_roles']=[{'id':'neon_superuser','rolsuper':False},
   {'id':'neondb_owner','rolsuper':False}]
  self.rows['role_census']=[{'id':name} for name in
   sorted(set(catalog.PG18_PREDEFINED_ROLES)|{'neondb_owner','neon_superuser'})]
  self.rows['role_membership_census']=[{'id':'member=901;role=902;grantor=902',
   'member':'neondb_owner','granted_role':'neon_superuser',
   'grantor':'neon_superuser','member_oid':'901','granted_role_oid':'902',
   'grantor_oid':'902','admin_option':False,'inherit_option':True,
   'set_option':False}]
  self.rows['provider_memberships']=[{'id':'neondb_owner->neon_superuser',
   'admin_option':False,'inherit_option':True,'set_option':False}]
  self.rows['schema_public_grants']=[{'id':'public','owner':'neondb_owner',
   'public_create':False,'public_usage':True}]
  self.fault=None

 def execute(self,sql):
  self.calls+=1
  assert sql.startswith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
  assert sql.endswith('ROLLBACK;\n')
  assert sql.count('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')==1
  assert sql.count('ROLLBACK;')==1
  assert all(catalog.SQL[k] in sql for k in catalog.CATEGORIES)
  assert 'pg_current_snapshot()::text' in sql
  assert 'pg_backend_pid()' in sql
  frozen=copy.deepcopy(self.rows)
  packets=[]
  for kind in catalog.CATEGORIES:
   packet={'kind':kind,'pid':445,'snapshot':'77:77:',
    'database':'neondb','db_user':'neondb_owner',
    'session_user':'neondb_owner','version':'180006',
    'isolation':'repeatable read','read_only':'on',
    'data':frozen[kind]}
   packets.append(packet)
  if self.fault:
   self.fault(packets)
  return '\n'.join(json.dumps(p,sort_keys=True) for p in packets)


class C032SnapshotProtocol(unittest.TestCase):
 def setUp(self):
  self.pg=SyntheticPg18()

 def test_one_backend_one_transaction_all_security_categories(self):
  got=catalog.collect(self.pg.execute,expected_identity=('neondb','neondb_owner','180006'))
  self.assertEqual(got,self.pg.rows)
  self.assertEqual(self.pg.calls,1)
  for key in ('database_security','provider_roles','provider_memberships',
   'schema_public_grants'):
   self.assertIn(key,got)
  self.assertIn('\\if :hft_has_revision',catalog.snapshot_statement(True))
  self.assertIn('FROM hft.schema_revision',catalog.snapshot_statement(True))

 def test_s0_independently_approved_baseline_cannot_drift(self):
  with tempfile.TemporaryDirectory() as t:
   paths={}
   for i,stage in enumerate(catalog.STAGES):
    path=Path(t)/(stage+'.sha256')
    value=catalog.sha(catalog.canonical(self.pg.rows)) if stage=='S0' else ('%064x'%(i+1))
    path.write_text(value+'\n')
    paths[stage]=path
   self.assertEqual(catalog.verify_stage(self.pg.execute,'S0',paths),
    catalog.sha(catalog.canonical(self.pg.rows)))
   for key in ('public_create','public_connect','public_temporary'):
    previous=self.pg.rows['database_security'][0][key]
    self.pg.rows['database_security'][0][key]=not previous
    with self.subTest(key=key),self.assertRaisesRegex(ValueError,'EXTRA_MISSING_OR_ALTERED'):
     catalog.verify_stage(self.pg.execute,'S0',paths)
    self.pg.rows['database_security'][0][key]=previous

 def test_invalid_or_interrupted_collection_is_rejected(self):
  failures=[
   lambda p:p.pop(),
   lambda p:p.append(copy.deepcopy(p[-1])),
   lambda p:p[4].update(pid=999),
   lambda p:p[4].update(snapshot='80:80:'),
   lambda p:p[4].update(db_user='other'),
   lambda p:p[4].update(session_user='other'),
   lambda p:p[4].update(database='other'),
   lambda p:p[4].update(version='170000'),
   lambda p:p[4].update(isolation='read committed'),
   lambda p:p[4].update(read_only='off'),
   lambda p:p[4].pop('kind'),
   lambda p:p[4].update(data='not rows')]
  for fault in failures:
   with self.subTest(fault=str(fault)):
    self.pg.fault=fault
    with self.assertRaises(ValueError):
     catalog.collect(self.pg.execute,
      expected_identity=('neondb','neondb_owner','180006'))
  self.pg.fault=None

 def test_runner_phase_snapshot_failure_before_mutation(self):
  with patch.object(runner,'psql',side_effect=lambda q,e:self.pg.execute(q)):
   # A fixture without phase/revision packets must be rejected, rather than
   # accidentally treating catalog-only packets as a trusted phase snapshot.
   with self.assertRaises(runner.Stop):
    runner.live_database_phase_state({'PGUSER':'neondb_owner'},'prepare-security')
  self.assertEqual(self.pg.calls,1)

 def test_post_security_public_and_provider_elevation_denied(self):
  roles,members=catalog.source_role_contract()
  rows=copy.deepcopy(self.pg.rows)
  rows['database_security'][0].update(public_connect=False,public_temporary=False)
  rows['roles']=[{'id':x,'rolsuper':False,'rolcreatedb':False,
    'rolcreaterole':False,'rolreplication':False,'rolbypassrls':False}
    for x in sorted(roles)]
  rows['role_census'].extend({'id':name} for name in sorted(roles))
  for i,name in enumerate(sorted(members)):
   member,parent=name.split('->')
   rows['role_membership_census'].append({
    'id':f'member={910+i};role={920+i};grantor=902',
    'member':member,'granted_role':parent,'grantor':'neon_superuser',
    'member_oid':str(910+i),'granted_role_oid':str(920+i),
    'grantor_oid':'902','admin_option':False,'inherit_option':True,
    'set_option':False})
  rows['role_census'].sort(key=lambda x:x['id'])
  rows['role_membership_census'].sort(key=lambda x:x['id'])
  rows['memberships']=[{'id':x,'admin_option':False,
    'inherit_option':True,'set_option':False} for x in sorted(members)]
  rows['database_grants']=[{'id':'hft_staging_migration_owner:neondb'}]
  rows['schema_grants']=[{'id':'hft_staging_migration_owner:public'}]
  catalog.structural_stage_checks(rows,'S1')
  for kind,mutation in (
   ('database_security',{'public_connect':True}),
   ('database_security',{'public_temporary':True}),
   ('database_security',{'public_create':True}),
   ('schema_public_grants',{'public_create':True})):
   changed=copy.deepcopy(rows)
   changed[kind][0].update(mutation)
   with self.subTest(kind=kind,mutation=mutation),self.assertRaises(ValueError):
    catalog.structural_stage_checks(changed,'S1')
  changed=copy.deepcopy(rows)
  changed['provider_memberships'].append({'id':'hft_staging_migration_owner->neon_superuser',
   'admin_option':True,'set_option':True,'inherit_option':True})
  with self.assertRaises(ValueError):
   catalog.structural_stage_checks(changed,'S1')
  changed=copy.deepcopy(rows)
  changed['provider_roles']=[{'id':'neondb_owner'}]
  with self.assertRaises(ValueError):
   catalog.structural_stage_checks(changed,'S1')


if __name__=='__main__':
 unittest.main()
