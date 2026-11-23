"""Source controls only. PostgreSQL execution is a separate target-bound campaign."""
from pathlib import Path
import subprocess
import unittest
ROOT=Path(__file__).resolve().parents[1]
class Role077IsolatedRuntime(unittest.TestCase):
 def test_harness_has_real_entrypoints_and_no_test_doubles(self):
  s=(ROOT/'tests/postgres/role077-qualification.ts').read_text()
  for entry in ('POST as receive','POST as read','POST as roles','assertRoleConnection',
                '42501','pg_locks','audit-disable','audit-misplace','audit-noop','audit-replace',
                'SAVED_VERIFIED','READ_VERIFIED','withProtectedPostingTransaction'):
   self.assertIn(entry,s)
  self.assertNotRegex(s,r'mock\.module|node:test|TEST=true|verifiedFixtureOperator')
  self.assertLess(s.index('assertRoleQualificationProfile(env)'),s.index('new pg.Pool'))
  for s in (p.read_text() for p in (ROOT/'lib').rglob('*.ts')):
   self.assertNotIn('role077-observer',s)
 def test_fixture_helpers_are_stopped_and_no_runtime_privileges(self):
  s=(ROOT/'db/security/HFT-R1-ROLE077-FIXTURE-CONTROLS-NONEXECUTABLE.sql').read_text()
  self.assertLess(s.index("RAISE EXCEPTION 'QUAL077_FIXTURE_CONTROLS_NOT_ADMITTED'"),s.index('CREATE FUNCTION'))
  executable='\n'.join(l for l in s.splitlines() if not l.strip().startswith('--'))
  self.assertNotRegex(executable,r'(?i)\b(GRANT|CREATE ROLE|ALTER ROLE|SET ROLE)\b')
  self.assertNotRegex(executable,r'(?i)(INSERT INTO|UPDATE|DELETE FROM) hft\.stock_')
  self.assertEqual(s.count('IS DISTINCT FROM (a->>\'fixtureSha256\')'),2)
  self.assertEqual(s.count("session_user IS DISTINCT FROM (a->'logins'->>'fixtureExecutor')"),2)
 def test_row_lock_removal_is_backed_by_session_and_dependency_fences(self):
  s=(ROOT/'lib/hft/roles/role-postgres.ts').read_text()
  self.assertNotIn('FOR SHARE',s)
  self.assertIn('ROLE_SESSION_FENCE_AFFINITY_DENIED',s)
  self.assertIn('FOR UPDATE OF s',s)
  sql=(ROOT/'db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql').read_text()
  for relation in ('employee','legal_entity','site','warehouse'):
   self.assertIn(f'ALTER TABLE hft.{relation} ENABLE ALWAYS TRIGGER role_dependency_fence;',sql)
 def test_catalog_checks_effective_columns_and_safe_schema_lookup(self):
  s=(ROOT/'lib/hft/roles/role-backend.ts').read_text()
  for check in ('protected_column_write_count','binding_column_write_count','scope_unauthorized_write','to_regnamespace'):
   self.assertIn(check,s)
  self.assertNotRegex(s,r'pg_catalog\.coalesce')
 def test_installed_binding_is_immutable_and_stopped(self):
  s=(ROOT/'db/security/HFT-R1-ROLE077-ISOLATED-BINDING-NONEXECUTABLE.sql').read_text()
  self.assertLess(s.index("RAISE EXCEPTION 'QUAL077_TARGET_SPECIFIC_INSTALLATION_NOT_ADMITTED'"),s.index('CREATE SCHEMA'))
  self.assertIn('ENABLE ALWAYS TRIGGER immutable_qualification_binding',s)
 def test_harness_describe_does_not_need_a_database(self):
  r=subprocess.run(['node','--experimental-strip-types','tests/postgres/role077-qualification.ts','--describe'],cwd=ROOT,text=True,capture_output=True,timeout=20)
  self.assertEqual(r.returncode,0,r.stderr)
  self.assertIn('"execution": "NONE"',r.stdout)
if __name__=='__main__':unittest.main()
