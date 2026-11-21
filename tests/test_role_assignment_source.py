"""Application-role integration guards. No SQL execution or production grants."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]

class RoleAssignmentSource(unittest.TestCase):
 def test_candidate_is_stopped_and_never_changes_stock_or_database_roles(self):
  s=(ROOT/'db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql').read_text()
  self.assertLess(s.index("RAISE EXCEPTION 'HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED'"),s.index('CREATE SCHEMA'))
  self.assertIn('DEFERRABLE INITIALLY DEFERRED',s)
  self.assertIn('HFT_APP_ROLE_AUDIT_IMMUTABLE',s)
  executable='\n'.join(l for l in s.splitlines() if not l.strip().startswith('--'))
  self.assertNotRegex(executable,r'(?i)\b(GRANT|CREATE ROLE|ALTER ROLE)\b')
  self.assertNotRegex(executable,r'(?i)(INSERT INTO|UPDATE|DELETE FROM) hft\.stock_')
 def test_no_installed_store_or_fabricated_success_in_route(self):
  s=(ROOT/'app/api/hft/settings/roles/route.ts').read_text()
  self.assertIn('resolveVerifiedRequestOperator',s)
  self.assertIn("throw new RoleError('ROLE_BACKEND_NOT_ADMITTED')",s)
  self.assertNotIn('SAVED_VERIFIED',s)
 def test_ui_has_catalog_scopes_history_real_server_and_uncertain_state(self):
  s=(ROOT/'app/settings/users-roles/page.tsx').read_text()
  for text in ('Role Assignment','Employee name or ID','Legal entity','Warehouse','Permission preview',
               'Assignment history','Save assignment','Revoke roles','RECONCILE','SAVED_VERIFIED','UNCONFIRMED'):
   self.assertIn(text,s)
  self.assertNotIn('localStorage',s)
  self.assertNotIn('sessionStorage',s)
  self.assertIn('AbortController',s)
 def test_existing_middleware_protections_remain(self):
  s=(ROOT/'middleware.ts').read_text()
  self.assertIn("path==='/api/hft/settings/roles'",s)
  self.assertIn('HFT_R1_API_NOT_QUALIFIED',s)
  self.assertIn('HFT_STORES_OPERATIONAL_NOT_ADMITTED',s)
  self.assertNotIn("path.startsWith('/api/hft/settings')",s)

if __name__=='__main__': unittest.main()
