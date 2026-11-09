"""067: verify OPS063 diagnostic IDs, non-equivalence and nonexecution gates.

No psql, Docker, migration, fault SQL, secrets or trust-root enrollment.
"""
import importlib.util
import io
from contextlib import redirect_stdout,redirect_stderr
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
TOOL=ROOT/"tools/hft_ops_a2_063_pg18_fault_cases.py"
spec=importlib.util.spec_from_file_location("ops063_wrapper",TOOL)
assert spec is not None and spec.loader is not None
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
from hft_ops_a2_067_pg18_harness import _catalog,admit,evidence_complete,verify_fixture,qualify_live_gateway,_qa_sql,verify_independent_results,verify_postgres_tls_peer

class Diagnostic067(unittest.TestCase):
 def test_exact_independent_qa_fixture_namespaces(self):
  self.assertEqual(tuple(m.CASES),tuple("OPS063-F%02d"%i for i in range(1,9)))
  self.assertEqual(m.HF17_ORIGINAL,tuple("HF17-PG-F%02d"%i for i in range(1,9)))
  self.assertEqual(m.A2_ORIGINAL,tuple("A2-PG-%02d"%i for i in range(1,17)))
  self.assertTrue(all(x.status=="NOT_TESTED" for x in m.CASES.values()))
  self.assertTrue(all(not v for v in m.CROSSWALK["hf17_to_ops063"].values()))
  self.assertEqual(m.CROSSWALK["all_original_postgres_results"],"NOT_TESTED")
  self.assertEqual(m.CROSSWALK["all_ops063_postgres_results"],"NOT_TESTED")
 def test_no_authority_means_no_execution_and_no_false_pass(self):
  with patch("hft_ops_a2_067_pg18_harness.subprocess.run") as called:
   with redirect_stdout(io.StringIO()):
    self.assertEqual(m.main(["--list"]),0)
   called.assert_not_called()
  with patch("hft_ops_a2_067_pg18_harness.subprocess.run") as called:
   with redirect_stderr(io.StringIO()):
    self.assertEqual(m.main(["--execute","--admission","/missing/admission.json",
                              "--fixture-receipts","/missing/fixtures.json"]),2)
   called.assert_not_called()
 def test_bare_environment_claims_are_not_approval(self):
  env={"PGUSER":"hft_r1_qa_review","PGHOST":"database.example",
       "PGPORT":"5432","PGDATABASE":"hft_r1_disposable_067tests",
       "PGSSLMODE":"verify-full","PGCHANNELBINDING":"require"}
  payload={"approved_source_sha":"a"*40}
  with patch("hft_ops_a2_067_pg18_harness.head_clean",return_value="b"*40):
   with self.assertRaisesRegex(ValueError,"SOURCE_SHA_NOT_APPROVED"):
    admit(payload,env,m.CASES)
 def test_missing_positive_control_or_adverse_construction_is_denied(self):
  c=_catalog().CASES["OPS063-F01"]
  values={"admission_id":"A"*36,"case_id":c.id,
   "fixture_id":"123e4567-e89b-42d3-a456-426614174000",
   "db_project_id":"fake-project-reference-synthetic",
   "db_branch_id":"fake-branch-reference-synthetic",
   "prestate_sha256":"a"*64,"positive_evidence_sha256":"b"*64,
   "adverse_evidence_sha256":"c"*64,"independent_witness_sha256":"d"*64,
   "constructor_source_sha256":"e"*64,
   "positive_control_committed":False,"adverse_established":True,
   "source_identities":dict.fromkeys(
    ("command_uuid","source_document_id","source_revision","item_code",
     "product_version","legal_entity_id","site_id","warehouse_id",
     "original_nonce","source_account_id","destination_account_id"),"synthetic"),
   "prestate_assertions":list(c.required_prestate)}
  admission={"record_id":"A"*36,"project_id":"fake-project-reference-synthetic",
             "project_branch_id":"fake-branch-reference-synthetic"}
  with self.assertRaisesRegex(ValueError,"POSITIVE_OR_GENUINE_ADVERSE_STATE"):
   verify_fixture(values,admission,c.id)
  values["positive_control_committed"]=True
  values["adverse_established"]=False
  with self.assertRaisesRegex(ValueError,"POSITIVE_OR_GENUINE_ADVERSE_STATE"):
   verify_fixture(values,admission,c.id)
 def test_independent_case_sequence_and_distinct_actual_transactions_are_required(self):
  c=_catalog().CASES["OPS063-F02"]
  record={"admission_id":"A"*36,"case_id":c.id,
   "fixture_id":"123e4567-e89b-42d3-a456-426614174000",
   "db_project_id":"fake-project-reference-synthetic",
   "db_branch_id":"fake-branch-reference-synthetic",
   "prestate_sha256":"a"*64,"positive_evidence_sha256":"b"*64,
   "adverse_evidence_sha256":"c"*64,"independent_witness_sha256":"d"*64,
   "constructor_source_sha256":"e"*64,
   "positive_control_committed":True,"adverse_established":True,
   "source_identities":dict.fromkeys(
    ("command_uuid","source_document_id","source_revision","item_code",
     "product_version","legal_entity_id","site_id","warehouse_id",
     "original_nonce","source_account_id","destination_account_id"),"synthetic"),
   "prestate_assertions":list(c.required_prestate)}
  auth={"record_id":"A"*36,"project_id":"fake-project-reference-synthetic",
        "project_branch_id":"fake-branch-reference-synthetic"}
  with self.assertRaisesRegex(ValueError,"TRANSACTION_SEQUENCE"):
   verify_fixture(record,auth,c.id)
  record["transaction_sequence"]=list(_catalog().CASE_SEQUENCES[c.id])
  with self.assertRaisesRegex(ValueError,"POSITIVE_AND_ADVERSE_TX_IDENTITIES"):
   verify_fixture(record,auth,c.id)
  record["positive_control_transaction_id"]="tx-positive-synthetic"
  record["fault_constructor_transaction_id"]="tx-fault-synthetic"
  self.assertTrue(verify_fixture(record,auth,c.id))
 def test_rejected_transaction_cannot_pass_without_real_sqlstate_and_reconstruction(self):
  c=_catalog().CASES["OPS063-F01"]
  receipt={"fixture_id":"123e4567-e89b-42d3-a456-426614174000"}
  result={"fixture_id":receipt["fixture_id"],"case_id":c.id,
   "protected_rejection":c.expected_negative_code,
   "sqlstate":"42501"}
  with self.assertRaisesRegex(ValueError,"REAL_SQLSTATE"):
   evidence_complete(result,receipt,c)
  result["sqlstate"]="P0001"
  result["negative_phase"]="DEFERRED_COMMIT"
  with self.assertRaisesRegex(ValueError,"RESULT_PROVENANCE_ABSENT"):
   evidence_complete(result,receipt,c)
 def test_no_substring_only_success_path(self):
  tool=(ROOT/"tools/hft_ops_a2_067_pg18_harness.py").read_text()
  old=(ROOT/"tools/hft_ops_a2_063_pg18_fault_cases.py").read_text()
  self.assertNotIn("result.returncode!=0 and",old)
  self.assertIn("067_REAL_SQLSTATE_NOT_OBSERVED",tool)
  self.assertIn("067_NEGATIVE_TRANSACTION_MUTATED_COMMITTED_FACTS",tool)
  self.assertIn("067_PINNED_ED25519_VERIFIER_NOT_INSTALLED",tool)
  self.assertIn("067_PROTECTED_GATEWAY_EXACT_SOURCE_NOT_ADMITTED",tool)
  self.assertIn("067_ACTUAL_ADVERSE_PRESTATE_OR_POSITIVE_CONTROL_MISSING",tool)
  self.assertIn("EXECUTED_UNVERIFIED_NO_PASS",tool)
  self.assertIn("EXECUTED_EVIDENCE_PENDING_INDEPENDENT_REVIEW",tool)
 def test_unpinned_gateway_is_denied_before_psql_and_never_directly_updates(self):
  with patch("hft_ops_a2_067_pg18_harness.subprocess.run") as run:
   with self.assertRaisesRegex(ValueError,"GATEWAY_EXACT_SOURCE_NOT_ADMITTED"):
    qualify_live_gateway({}, {})
   run.assert_not_called()
   with self.assertRaisesRegex(ValueError,"QA_DIRECT_DATABASE_MUTATION_DENIED"):
    _qa_sql({},"UPDATE hft.stock_account SET qty_micro=10")
   run.assert_not_called()
 def test_actual_pg_starttls_peer_pin_is_mandatory_before_gateway(self):
  claim={"endpoint":{"host":"db.example.invalid","port":5432,
    "sslrootcert_sha256":"a"*64,"tls_peer_sha256":"b"*64}}
  with patch("hft_ops_a2_067_pg18_harness.socket.create_connection") as dial:
   with self.assertRaisesRegex(ValueError,"TLS_IDENTITY_UNVERIFIED"):
    verify_postgres_tls_peer(claim,{"PGSSLROOTCERT":"/nonexistent/qa-root.pem"})
   dial.assert_not_called()
  source=(ROOT/"tools/hft_ops_a2_067_pg18_harness.py").read_text()
  for control in ("struct.pack(\"!II\",8,80877103)",
    "context.check_hostname=True","ssl.CERT_REQUIRED",
    "endpoint[\"tls_peer_sha256\"]",
    "verify_postgres_tls_peer(admission,os.environ)"):
   self.assertIn(control,source)
 def test_independent_post_reconstruction_requires_all_eight_signed_case_results(self):
  with self.assertRaisesRegex(ValueError,"ALL_EIGHT_INDEPENDENT_RESULT"):
   verify_independent_results({}, {}, {"record_id":"fake"}, {})


if __name__=="__main__":unittest.main()
