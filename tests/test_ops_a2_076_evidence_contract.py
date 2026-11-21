"""Synthetic structural regressions. No PostgreSQL evidence or acceptance."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from hft_ops_a2_076_evidence_contract import (NEGATIVES, ROLES, STATUS,
    original_archive, reconstruct, validate_connected_session, validate_negative)


def uid(number):
    return f"00000000-0000-4000-8000-{number:012d}"


def facts():
    def leg(entry, command, account, bucket, delta, before, after):
        return dict(entry_id=str(entry), command_uuid=uid(command),
                    account_id=None if account is None else uid(account), bucket=bucket,
                    delta_micro=str(delta), before_version=before, after_version=after)
    return dict(accounts=[dict(account_id=uid(1), quantity_micro="5", version="2"),
                          dict(account_id=uid(2), quantity_micro="5", version="1")],
                movements=[leg(1, 101, None, "EXTERNAL", -10, None, None),
                           leg(2, 101, 1, "AVAILABLE", 10, "0", "1"),
                           leg(3, 102, 1, "AVAILABLE", -5, "1", "2"),
                           leg(4, 102, 2, "CUSTODY", 5, "0", "1")],
                source_counters={"receipt": "10", "issue": "5"},
                original_nonce="a" * 48, seal={"original": "b" * 64},
                custody=[{"issue": uid(102), "employee": "EMP1", "outstanding": "5"}],
                original_issues=[uid(102)], acknowledgements=[{"issue": uid(102), "state": "ACKNOWLEDGED"}],
                audit=[{"command": uid(102), "digest": "c" * 64}])


def sample(case):
    binding = dict(fixture_id=uid(201), source_sha="d" * 40, migration_sha256="e" * 64,
                   gateway_sha256="f" * 64, constructor_sha256="a" * 64,
                   project_id="PROJECT1", branch_id="BRANCH1", database="DISPOSABLE1")
    common = dict(server_version_num=180006, backend_pid=101, session_id="SESSION1",
                  connection_id="CONNECTION1", current_user="QA-OWNER", session_user="FAULT1",
                  transaction_id="123456", original_capture_sha256="b" * 64)
    phase, control = NEGATIVES[case]
    attempt = dict(common, status="REJECTED_ROLLED_BACK", phase=phase, sqlstate="P0001",
                   control=control, origin="POSTGRESQL_ORIGINAL_PROTOCOL_CAPTURE",
                   execution_id=uid(301), rollback_capture_sha256="c" * 64,
                   query_scope="FOREIGN")
    positive = dict(common, status="COMMIT_OBSERVED", session_user="POSITIVE1",
                    transaction_id="123455", commit_lsn="0/1ABC", query_scope="ORIGINAL")
    return binding, dict(case_id=case, binding=copy.deepcopy(binding), attempt=attempt,
                         positive=positive, prestate=facts(), poststate=facts(),
                         post_capture_sha256="c" * 64, positive_entry_id="1",
                         unauthorized_rows=[], unauthorized_bytes_disclosed=0)


def session():
    admitted = dict(project_id="PROJECT1", branch_id="BRANCH1", host="db.invalid",
                    port=5432, database="DISPOSABLE1", ca_sha256="a" * 64,
                    peer_sha256="b" * 64, connection_id="SQL-CONNECTION1",
                    tls_exporter_sha256="c" * 64, challenge_sha256="d" * 64)
    report = dict(admitted, capture_origin="SQL_RUNNING_CONNECTION",
                  tls_verified_hostname="db.invalid", channel_binding="SCRAM-SHA-256-PLUS",
                  tls_version="TLSv1.3", server_version_num=180006)
    report["roles"] = {name: dict(login="LOGIN_" + name, superuser=False, bypassrls=False,
                                  createrole=False, replication=False, posting_owner_member=False,
                                  forbidden_set_role_denied=True, effective_acl_sha256="e" * 64,
                                  protected_dml_denied=True, constructor_execute_denied=True)
                       for name in ROLES}
    return admitted, report


class OriginalEvidence076(unittest.TestCase):
    def test_structural_result_never_claims_execution_or_acceptance(self):
        for case in NEGATIVES:
            with self.subTest(case=case):
                binding, evidence = sample(case)
                self.assertEqual(validate_negative(case, evidence, binding), STATUS)
                self.assertNotIn("PASS", STATUS)

    def test_preserve_original_raw_archive_and_duplicate_json_key_denial(self):
        raw = b'{"original":"bytes"}'
        self.assertEqual(original_archive(raw, hashlib.sha256(raw).hexdigest()), {"original": "bytes"})
        with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
            original_archive(raw + b" ", hashlib.sha256(raw).hexdigest())
        for raw in (b'{"a":1,"a":2}', b'{"a":NaN}'):
            with self.assertRaises(ValueError):
                original_archive(raw, hashlib.sha256(raw).hexdigest())

    def test_zero_based_history_reconstructs_with_external_leg(self):
        reconstruct(facts())

    def test_entry_revision_magnitude_external_and_pair_corruption_rejected(self):
        changes = [lambda f: f["movements"][0].update(account_id=uid(1)),
                   lambda f: f["movements"][2].update(before_version="0"),
                   lambda f: f["movements"][2].update(delta_micro="-6"),
                   lambda f: f["movements"].pop(),
                   lambda f: f["accounts"][0].update(quantity_micro="6"),
                   lambda f: f["movements"][0].update(entry_id="2")]
        for change in changes:
            f = facts(); change(f)
            with self.assertRaises(ValueError):
                reconstruct(f)

    def test_queued_or_synthetic_error_cannot_count_as_execution(self):
        case = "OPS063-F06/COUNTER_ONLY"
        for field, value in (("status", "PENDING_INDEPENDENT_FAULT_CONSTRUCTION_NOT_EXECUTED"),
                             ("origin", "SIGNED_JSON_ASSERTION"), ("sqlstate", "42501"),
                             ("phase", "DEFERRED_COMMIT"), ("control", "UNRELATED_FAILURE")):
            binding, evidence = sample(case)
            evidence["attempt"][field] = value
            with self.assertRaisesRegex(ValueError, "NOT_EXECUTION"):
                validate_negative(case, evidence, binding)

    def test_source_fixture_migration_and_execution_substitution(self):
        case = "OPS063-F01/MAGNITUDE"
        binding, evidence = sample(case)
        for key in binding:
            altered = copy.deepcopy(evidence); altered["binding"][key] = "substituted"
            with self.assertRaisesRegex(ValueError, "BINDING_MISMATCH"):
                validate_negative(case, altered, binding)

    def test_missing_original_capture_backend_and_transaction_denied(self):
        case = "OPS063-F02/HISTORIC_AVAILABLE_SEAL"
        for key in ("original_capture_sha256", "backend_pid", "transaction_id", "session_id"):
            binding, evidence = sample(case); del evidence["attempt"][key]
            with self.assertRaises((ValueError, KeyError)):
                validate_negative(case, evidence, binding)

    def test_positive_commit_and_fault_actor_must_be_separate(self):
        case = "OPS063-F03/FULL_V2_DIGEST"
        for field in ("transaction_id", "session_user"):
            binding, evidence = sample(case)
            evidence["attempt"][field] = evidence["positive"][field]
            with self.assertRaisesRegex(ValueError, "NOT_SEPARATE"):
                validate_negative(case, evidence, binding)

    def test_every_committed_fact_must_remain_unchanged_on_rejection(self):
        case = "OPS063-F04/MISSING_CUSTODY_EVIDENCE"
        for field in ("source_counters", "original_nonce", "seal", "custody",
                      "original_issues", "acknowledgements", "audit"):
            binding, evidence = sample(case)
            evidence["poststate"][field] = "a" * 48 if field == "original_nonce" else ["tampered"]
            if field == "original_nonce": evidence["poststate"][field] = "b" * 48
            with self.assertRaises(ValueError):
                validate_negative(case, evidence, binding)

    def test_f07_needs_positive_one_and_foreign_scope_no_disclosure(self):
        case = "OPS063-F07/FOREIGN_WAREHOUSE_READ"
        for field, value in (("positive_entry_id", "10"), ("unauthorized_rows", [{"entry_id": "1"}]),
                             ("unauthorized_bytes_disclosed", 1), ("unauthorized_bytes_disclosed", False)):
            binding, evidence = sample(case); evidence[field] = value
            with self.assertRaisesRegex(ValueError, "F07"):
                validate_negative(case, evidence, binding)
        binding, evidence = sample(case); evidence["attempt"]["query_scope"] = "ORIGINAL"
        with self.assertRaisesRegex(ValueError, "F07"):
            validate_negative(case, evidence, binding)

    def test_unknown_fault_subcase_cannot_borrow_another_expected_error(self):
        binding, evidence = sample("OPS063-F03/FULL_V2_DIGEST")
        with self.assertRaisesRegex(ValueError, "UNQUALIFIED_FAULT"):
            validate_negative("OPS063-F03/ACCOUNT_REVISION", evidence, binding)

    def test_same_sql_session_contract_requires_all_six_role_reports(self):
        admitted, observed = session()
        self.assertEqual(validate_connected_session(admitted, observed), STATUS)
        for role in ROLES:
            altered = copy.deepcopy(observed); del altered["roles"][role]
            with self.assertRaisesRegex(ValueError, "ROLE_REPORTS"):
                validate_connected_session(admitted, altered)

    def test_preliminary_socket_and_unbound_exporter_do_not_prove_sql_connection(self):
        admitted, observed = session()
        for field, value in (("capture_origin", "PRELIMINARY_TLS_SOCKET"),
                             ("connection_id", "OTHER"), ("channel_binding", "require"),
                             ("tls_verified_hostname", "other.invalid"),
                             ("tls_exporter_sha256", "f" * 64)):
            altered = dict(observed, **{field: value})
            with self.assertRaises(ValueError):
                validate_connected_session(admitted, altered)

    def test_privilege_inheritance_and_forbidden_role_switch_fail_closed(self):
        admitted, observed = session()
        for role in ROLES:
            for field, value in (("posting_owner_member", True), ("bypassrls", True),
                                 ("superuser", True), ("forbidden_set_role_denied", False)):
                altered = copy.deepcopy(observed); altered["roles"][role][field] = value
                with self.assertRaises(ValueError):
                    validate_connected_session(admitted, altered)

    def test_observer_never_gets_constructor_or_protected_dml(self):
        admitted, observed = session()
        for role in ("qa", "independent_verifier", "witness"):
            for field in ("constructor_execute_denied", "protected_dml_denied"):
                altered = copy.deepcopy(observed); altered["roles"][role][field] = False
                with self.assertRaisesRegex(ValueError, "OBSERVER_INHERITS"):
                    validate_connected_session(admitted, altered)


if __name__ == "__main__":
    unittest.main()
