"""067 source checks and deterministic synthetic signed-scope negative vectors.

These tests do not connect to PostgreSQL or enroll scope signing keys.
Independent PostgreSQL qualification, human authorization and actual
SQLSTATE/COMMIT evidence remain NOT_TESTED.
"""
from pathlib import Path
import hashlib
import hmac
import json
import unittest

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"db/security"
FOUND=(BASE/"HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql").read_text()
READ=(BASE/"HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql").read_text()
WRITER=(BASE/"HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql").read_text()
ACL=(BASE/"HFT-R1-OPS-A2-ACL-CLOSURE-NONEXECUTABLE.sql").read_text()
CAND=(BASE/"HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql").read_text()

def function(source,full,start_marker,end_marker):
 i=source.index(start_marker)
 j=source.index(end_marker,i)
 return source[i:j]

def canonical_scope(fields):
 # The SQL source uses PostgreSQL jsonb::text; this synthetic vector checks
 # exact field and MAC tampering conceptually, NOT SQL/TS byte parity.
 return json.dumps(fields,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()

def signed_reference(fields,key):
 return hmac.new(key,canonical_scope(fields),hashlib.sha256).hexdigest()

class Source067(unittest.TestCase):
 def test_f01_full_account_scope_is_signed_and_separate_from_legacy_approval(self):
  f=function(FOUND,"", "CREATE OR REPLACE FUNCTION hft.ops_a2_provision_zero_account_v2(",
             "END $provision$;")
  for marker in (
   "'legalEntityId',o.legal_entity_id","'siteId',o.site_id",
   "'warehouseId',o.warehouse_id","'itemCode',o.item_code",
   "'productVersion',o.product_version_code","'leaf',o.leaf_location_id",
   "'accountKind',o.account_kind","'condition',o.condition",
   "'custodianEmployeeId',o.custodian_employee_id",
   "'serialNo',o.serial_no","'batchNo',o.batch_no",
   "'controlType',track_type",
   "'sourceDocumentId',o.source_document_id",
   "'sourceRevision',o.source_revision",
   "'approvedPayloadSha256',a.payload_sha256",
   "'approvedScopeSha256',a.approved_scope_sha256",
   "'decisionSha256',d.decision_evidence_sha256",
   "'policyRevision',pol.policy_revision",
   "hft.ops_a2_assert_independent_scope_v1(",
   "OPS_A2_067_ACCOUNT_TYPED_SOURCE_REVISION_NOT_AUTHORIZED",
   "OPS_A2_067_ACCOUNT_TRACEABILITY_NOT_AUTHORIZED",
   "OPS_A2_067_ACCOUNT_LATEST_POLICY_OR_APPROVAL_EXPIRED",
   "protected_approval_revocation","protected_approval_supersession",
   "o.condition,o.custodian_employee_id,o.serial_no,o.batch_no,0,0,0)"
  ):
   with self.subTest(marker=marker):self.assertIn(marker,f)
  self.assertLess(f.index("SELECT * INTO pol FROM hft.posting_action_policy"),
                  f.index("IF pol.policy_revision IS NULL"))
  self.assertNotIn("GRANT EXECUTE ON FUNCTION hft.ops_a2_provision_zero_account_v2",f)

 def test_f02_exact_transfer_approval_latest_policy_first_and_signed_scope(self):
  f=function(FOUND,"","CREATE OR REPLACE FUNCTION hft.ops_a2_issue_transfer_document_v2(",
             "END $issue_transfer$;")
  for marker in (
   "approved.approval_id=o.approval_id",
   "approved.approval_revision=o.approval_revision",
   "a.approved_scope_sha256<>o.approved_scope_sha256",
   "a.source_action_key<>o.source_action_key",
   "a.quantity_micro<>o.authorized_micro",
   "a.location_id<>o.source_leaf",
   "d.decision_evidence_sha256<>o.decision_evidence_sha256",
   "protected_approval_revocation","protected_approval_supersession",
   "'sourceLeaf',o.source_leaf","'destinationLeaf',o.destination_leaf",
   "'productVersion',o.product_version_code",
   "'authorizedMicro',o.authorized_micro",
   "'makerPerson',maker","'checkerPerson',checker","'approverPerson',approver",
   "OPS_A2_067_TRANSFER_LATEST_POLICY_REJECTED",
   "hft.ops_a2_assert_independent_scope_v1(",
  ):
   with self.subTest(marker=marker):self.assertIn(marker,f)
  policy=f.split("SELECT * INTO latest_policy FROM hft.posting_action_policy",1)[1]
  latest=policy.split("LIMIT 1 FOR SHARE;",1)[0]
  self.assertIn("ORDER BY pol.policy_revision DESC",latest)
  self.assertNotIn("pol.require_preparer",latest)
  self.assertNotIn("pol.valid_from",latest)
  self.assertLess(f.index("ORDER BY pol.policy_revision DESC LIMIT 1 FOR SHARE;"),
                  f.index("NOT latest_policy.require_preparer"))

 def test_independent_original_signature_cannot_be_fabricated_by_orders(self):
  f=function(FOUND,"","CREATE OR REPLACE FUNCTION hft.ops_a2_assert_independent_scope_v1(",
             "END $scope067$;")
  for token in ("att.approved_scope IS DISTINCT FROM p_scope",
   "att.scope_sha256 IS DISTINCT FROM scoped_hash",
   "att.original_decision_sha256 IS DISTINCT FROM p_decision_sha",
   "hft_secret.ops_a2_scope_key_v1","signed_key.revoked_at IS NOT NULL",
   "att.expires_epoch<=now_epoch",
   "hft.p2_qualified_human_v1","att.signer_person_id=ANY(p_prohibited_people)",
   "hft_crypto.hmac(hft.p2_length_prefixed_v1",
   "OPS_A2_067_ORIGINAL_SIGNED_SCOPE_MAC_INVALID"):
   with self.subTest(token=token):self.assertIn(token,f)
  self.assertIn("immutable_ops_a2_independent_scope",FOUND)
  self.assertIn("REVOKE ALL ON hft.ops_a2_independent_scope_v1",FOUND)
  self.assertIn("REVOKE ALL ON hft_secret.ops_a2_scope_key_v1",FOUND)

 def test_synthetic_account_identity_substitutions_change_signed_mac(self):
  base={"legalEntityId":"HFT","siteId":"SITE1","warehouseId":"WH1",
   "itemCode":"ITEM1","productVersion":"PV1","leaf":"BIN01",
   "accountKind":"AVAILABLE","condition":"GOOD","custodianEmployeeId":"",
   "serialNo":"SER01","batchNo":"","approvedPayloadSha256":"a"*64,
   "sourceDocumentId":"GRN1","sourceRevision":3,"approvalRevision":2,
   "policyRevision":6}
  key=bytes(range(32));original=signed_reference(base,key)
  for k,v in (
   ("condition","QUARANTINE"),("leaf","BIN02"),
   ("custodianEmployeeId","EMP02"),("productVersion","PV02"),
   ("serialNo","SER02"),("batchNo","LOT02"),
   ("approvedPayloadSha256","b"*64),("sourceRevision",4),
   ("policyRevision",5),("accountKind","CUSTODY")):
   with self.subTest(field=k):
    forged={**base,k:v}
    self.assertNotEqual(signed_reference(forged,key),original)
  self.assertNotEqual(signed_reference(base,bytes([9])*32),original)

 def test_latest_policy_model_refuses_old_permissive_rule(self):
  policies=[{"revision":5,"enabled":True,"valid":True},
            {"revision":6,"enabled":False,"valid":True}]
  actual=max(policies,key=lambda x:x["revision"])
  self.assertEqual(actual["revision"],6)
  self.assertFalse(actual["enabled"])
  self.assertNotEqual(actual, next(p for p in policies if p["enabled"] and p["valid"]))
  for expired in ({"revision":7,"enabled":True,"valid":False},
                  {"revision":8,"enabled":False,"valid":True}):
   latest=max([*policies,expired],key=lambda x:x["revision"])
   self.assertFalse(latest["enabled"] and latest["valid"])

 def test_f03_readonly_recovery_requires_original_actor_or_signed_reviewer(self):
  f=function(READ,"","CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v3(",
             "END $reconcile_v3$;")
  for marker in (
   "IF authenticated_actor IS DISTINCT FROM p->>'actorSubject' THEN",
   "hft.ops_a2_recovery_reviewer_entitlement_v1",
   "hft.ops_a2_recovery_reviewer_revocation_v1",
   "g.original_nonce=original_proof->>'nonce'",
   "g.original_command_id=p->>'commandId'",
   "g.original_actor_subject=p->>'actorSubject'",
   "g.reviewer_subject=authenticated_actor",
   "OPS_A2_067_DIFFERENT_ACTOR_RECOVERY_ENTITLEMENT_REQUIRED",
   "OPS_A2_067_RECOVERY_REVIEW_PERSON_POLICY_OR_SOURCE_INVALID",
   "hft.ops_a2_assert_independent_scope_v1('RECOVERY_REVIEW'",
   "hft.ops_a2_reconcile_original_attempt_private_v3(p,original_proof)"):
   with self.subTest(marker=marker):self.assertIn(marker,f)
  self.assertEqual(f.count("RETURN hft.ops_a2_reconcile_original_attempt_private_v3"),1)
  self.assertIn("immutable_ops_a2_recovery_entitlement",READ)
  self.assertIn("immutable_ops_a2_recovery_reviewer_revocation",READ)
  self.assertNotIn("INSERT INTO hft.stock_command",f)
  self.assertNotIn("UPDATE hft.stock_account",f)

 def test_h01_good_return_seal_credits_actual_destination_not_custody_source(self):
  f=function(WRITER,"","CREATE OR REPLACE FUNCTION hft.ops_a2_assert_command_seal_v2(",
             "END $assertseal$;")
  self.assertIn("WHEN c.kind='RECEIVE' OR (c.kind='RETURN' AND",f)
  self.assertIn("envelope.exact_payload->>'inspectedCondition'='GOOD')",f)
  self.assertIn("THEN c.ops_a2_destination_leaf",f)
  self.assertIn("ELSE c.ops_a2_source_leaf END;",f)
  for control in ("OPS_A2_V2_FULL_MOVEMENT_FACT_DIGEST_INVALID",
   "OPS_A2_V2_SEALED_AVAILABLE_HISTORIC_POSTSTATE_INVALID",
   "OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS",
   "OPS_A2_V2_HISTORIC_ENTRY_REVISION_OR_QUANTITY_INVALID"):
   self.assertIn(control,f)
  self.assertIn("PERFORM hft.ops_a2_assert_command_seal_v2(NEW.id)",WRITER)

 def test_acl_has_no_runtime_trust_secret_or_reviewer_mutations(self):
  for marker in ("hft.ops_a2_independent_scope_v1",
   "hft_secret.ops_a2_scope_key_v1",
   "hft.ops_a2_recovery_reviewer_entitlement_v1",
   "hft.ops_a2_recovery_reviewer_revocation_v1",
   "hft.ops_a2_assert_independent_scope_v1(",
   "OPS_A2_067_TRUST_SCHEMA_TEMP_CREATE_NOT_REVOKED"):
   self.assertIn(marker,ACL)
  self.assertIn("REVOKE CREATE ON SCHEMA hft_secret FROM hft_engineering",ACL)
  self.assertNotIn("GRANT INSERT ON TABLE hft.ops_a2_independent_scope_v1",ACL)
  self.assertNotIn("GRANT INSERT ON TABLE hft_secret.ops_a2_scope_key_v1",ACL)
  self.assertIn("OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED",CAND)
  self.assertNotIn("INSERT INTO hft_secret.ops_a2_scope_key_v1",CAND)

if __name__=="__main__":unittest.main()
