"""Independent Python vectors/static checks; never PostgreSQL qualification."""
from pathlib import Path
import hashlib,hmac,json,re,unittest
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=ROOT/'tests/fixtures/hft-p2-invocation-v1.synthetic.json'
SQL=ROOT/'db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql'
TS=ROOT/'lib/hft/security/posting-invocation-proof.ts'
ORDER=['contractVersion','commandId','idempotencyKey','kind','legalEntityId','siteId',
'warehouseId','itemCode','locationId','batchNo','serialNo','condition','employeeId',
'originalIssueId','sourceDocumentId','sourceActionKey','fragmentId','quantityMicro',
'sourceRevision','approvalId','approvalRevision','policyGeneration',
'expectedBalanceVersion','approvedPayloadSha256','inspectionEvidenceId']
def frame(values):
 return b''.join(len(value.encode('utf8')).to_bytes(4,'big')+value.encode('utf8') for value in values)
class InvocationVectors(unittest.TestCase):
 def test_python_independent_length_prefix_digest_and_hmac(self):
  o=json.loads(FIXTURE.read_text());p=o['payload'];a=o['proofFields']
  self.assertEqual(set(p),set(ORDER))
  digest=hashlib.sha256(frame([p[k] for k in ORDER])).hexdigest()
  self.assertEqual(digest,o['expectedPayloadSha256'])
  self.assertEqual(digest,a['payloadSha256'])
  fields=['HFT-R1-P2-HMAC-SHA256-V1',a['actorSubject'],a['sessionId'],
    p['commandId'],p['idempotencyKey'],p['kind'],digest,p['sourceRevision'],
    p['legalEntityId'],p['siteId'],p['warehouseId'],p['sourceDocumentId'],
    p['sourceActionKey'],p['fragmentId'],p['quantityMicro'],a['issuedAt'],
    a['expiresAt'],a['nonce'],a['keyVersion']]
  mac=hmac.new(o['testKeyUtf8'].encode('utf8'),frame(fields),hashlib.sha256).hexdigest()
  self.assertEqual(mac,o['expectedMacSha256'])
 def test_sql_and_typescript_payload_field_order_match_golden(self):
  ts=TS.read_text()
  m=re.search(r'export const PAYLOAD_FIELDS=\[(.*?)\] as const',ts,re.S)
  self.assertIsNotNone(m)
  ts_order=re.findall(r"'([A-Za-z][A-Za-z0-9]*)'",m.group(1))
  self.assertEqual(ts_order,ORDER)
  sql=SQL.read_text()
  m=re.search(r"DECLARE names text\[\]:=ARRAY\[(.*?)\];\s*k text",sql,re.S)
  self.assertIsNotNone(m)
  sql_order=re.findall(r"'([A-Za-z][A-Za-z0-9]*)'",m.group(1))
  self.assertEqual(sql_order,ORDER)
 def test_security_defaults_owner_binding_and_no_runtime_helper_execute(self):
  sql=SQL.read_text()
  self.assertIn('ALTER DEFAULT PRIVILEGES FOR ROLE hft_engineering\n  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',sql)
  self.assertIn('ALTER DEFAULT PRIVILEGES FOR ROLE hft_r1_posting_owner\n  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',sql)
  self.assertIn('SECURITY DEFINER',sql)
  self.assertIn('SET search_path=pg_catalog,pg_temp',sql)
  self.assertIn('GRANT EXECUTE ON FUNCTION hft.post_stock_command_protected_v1(jsonb,jsonb)',sql)
  self.assertIn('REVOKE EXECUTE ON FUNCTION hft.seal_stock_command_v1(uuid) FROM PUBLIC,hft_r1_app_runtime',sql)
  self.assertNotIn('CREATE EXTENSION',sql)
  self.assertIn('GRANT EXECUTE ON FUNCTION hft.p2_length_prefixed_v1(text[])',sql)
  self.assertRegex(sql,r'RETURN ARRAY\(SELECT p->>x\.field\s+FROM pg_catalog\.unnest\(names\) WITH ORDINALITY AS x\(field,ordinality\)\s+ORDER BY x\.ordinality\)')
 def test_one_nonce_per_proof_and_current_approval_and_hold_checks(self):
  sql=SQL.read_text()
  for check in ('PRIMARY KEY(key_version,nonce)', 'P2_INVOCATION_PROOF_MAC_INVALID',
    'P2_PROOF_EXPIRED_OR_FUTURE','P2_SESSION_REVOKED_OR_UNKNOWN',
    'P2_EXACT_PERSISTED_APPROVAL_REQUIRED','P2_BLOCKING_HOLD',
    'P2_POLICY_GENERATION_INVALID', 'P2_EMPLOYEE_CUSTODY_CEILING_EXCEEDED',
    'P2_PARTIAL_ISSUE_CEILING_EXCEEDED','P2_PARTIAL_RETURN_CEILING_EXCEEDED',
    "PERFORM hft.seal_stock_command_v1(command_uuid)",
    'RAISE EXCEPTION', 'hft.posting_fragment'):
   self.assertIn(check,sql)
  self.assertNotIn('SET LOCAL actor_subject',sql)
 def test_no_second_executable_migration_in_staging(self):
  path=ROOT/'db/migrations'
  self.assertFalse(any(path.glob('0007_*.sql')))
if __name__=='__main__':unittest.main()
