"""Application-role integration guards. No SQL execution or production grants."""
from pathlib import Path
import re
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
  self.assertIn("'RETAINED_APP_ROLES'",s)
  self.assertIn('assertRoleBackendProfile',s)
  self.assertIn('assertRoleConnection',s)
  self.assertIn('PostgresRoleStore',s)
  self.assertIn("code:'ROLE_BACKEND_NOT_ADMITTED'",s)
  self.assertNotIn('SAVED_VERIFIED',s)
  admission=(ROOT/'lib/hft/roles/role-backend.ts').read_text()
  for guard in ('ROLE_DATABASE_IDENTITY_ACL_OR_AUDIT_NOT_ADMITTED',
   'HFT_ROLE_INDEPENDENT_ADMISSION_SHA256',
   'protected_relation_write_count','protected_function_execute_count',
   'audit_trigger_count','identity_binding_write','privileged_role_memberships'):
   self.assertIn(guard,admission)
  for api in ('app/api/hft/stores/receive/route.ts',
              'app/api/hft/stores/read/route.ts'):
   src=(ROOT/api).read_text()
   self.assertIn('requireApiBusinessRole',src)
   self.assertNotIn('hft_qa077',src)
 def test_ui_has_catalog_scopes_history_real_server_and_uncertain_state(self):
  s=(ROOT/'app/settings/users-roles/page.tsx').read_text()
  for text in ('Role Assignment','Employee name or ID','Legal entity','Warehouse','Permission preview',
               'Assignment history','Save assignment','Revoke roles','RECONCILE','SAVED_VERIFIED','UNCONFIRMED'):
   self.assertIn(text,s)
  self.assertNotIn('localStorage',s)
  # HF094 permits only context-bound original-request evidence, not cached authorization.
  # Every browser storage reference must enter one of the four reviewed marker helpers.
  approved=r"\b(?:operatorPending|operatorOtherPending|writeOperatorPending|clearOperatorPending)\(sessionStorage,\s*'role',"
  self.assertGreaterEqual(len(re.findall(approved,s)),4)
  self.assertNotIn('sessionStorage',re.sub(approved,'',s))
  self.assertIn('original={requestId,scope}',s)
  helper=(ROOT/'lib/hft/roles/hosted-operator-client.ts').read_text()
  self.assertIn('type PendingOperatorRequest={requestId:string;scope:OperatorScope}',helper)
  self.assertIn("Object.keys(p).length!==2",helper)
  self.assertIn("Object.keys(s).length!==3",helper)
  self.assertIn("if(!digest.test(c))throw Error",helper)
  self.assertIn("s.setItem(key(d,c),JSON.stringify(p))",helper)
  self.assertIn("s.removeItem(key(d,c))",helper)
  self.assertNotIn('localStorage',helper)
  self.assertEqual(len(re.findall(r'\.setItem\(',helper)),1)
  self.assertEqual(len(re.findall(r'\.getItem\(',helper)),1)
  self.assertEqual(len(re.findall(r'\.removeItem\(',helper)),1)
  self.assertIn('AbortController',s)
 def test_existing_middleware_protections_remain(self):
  s=(ROOT/'middleware.ts').read_text()
  self.assertIn("path==='/api/hft/settings/roles'",s)
  self.assertIn('HFT_R1_API_NOT_QUALIFIED',s)
  self.assertIn('HFT_STORES_OPERATIONAL_NOT_ADMITTED',s)
  self.assertNotIn("path.startsWith('/api/hft/settings')",s)

if __name__=='__main__': unittest.main()
