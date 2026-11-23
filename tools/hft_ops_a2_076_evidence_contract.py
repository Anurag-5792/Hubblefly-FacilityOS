"""Directive 076: inspect ORIGINAL negative-execution evidence, never award PASS.

Pure offline checks. Caller must separately verify the collector's signature,
independent verifier/witness, artifact custody and effective database privileges.
Matching JSON (even a signed assertion) is not proof that PostgreSQL executed it.
No connection, SQL, trust enrollment, migration or protected DML occurs here.
"""
import hashlib
import json
import re
from typing import Any

STATUS = "STRUCTURALLY_CONSISTENT_PENDING_ORIGIN_AND_INDEPENDENT_REVIEW"
HEX = re.compile(r"[0-9a-f]{64}")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)")
# Immutable, separately named subcases. Expected strings come from protected
# source, NOT from a broad stderr match. Constructors/PG execution are unqualified.
NEGATIVES = {
    "OPS063-F01/MAGNITUDE": ("DEFERRED_COMMIT", "OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS"),
    "OPS063-F02/HISTORIC_AVAILABLE_SEAL": ("DEFERRED_COMMIT", "OPS_A2_V2_SEALED_AVAILABLE_HISTORIC_POSTSTATE_INVALID"),
    "OPS063-F03/FULL_V2_DIGEST": ("DEFERRED_COMMIT", "OPS_A2_V2_FULL_MOVEMENT_FACT_DIGEST_INVALID"),
    "OPS063-F04/MISSING_CUSTODY_EVIDENCE": ("READ_ONLY_CENSUS", "OPS_A2_CUSTODY_BASE_CENSUS_MISSING_ISSUE_ACK_AUDIT_FRAGMENT_OR_ACCOUNT"),
    "OPS063-F05/AMBIGUOUS_RECEIPT": ("READ_ONLY_GRN", "OPS_A2_GRN_RAW_RECEIPT_LINE_AMBIGUOUS_OR_FORGED"),
    "OPS063-F06/COUNTER_ONLY": ("BEFORE_UPDATE", "OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION"),
    "OPS063-F07/FOREIGN_WAREHOUSE_READ": ("READ_ONLY_SCOPE", "OPS_A2_READ_PERSISTED_SCOPE_DENIED"),
    "OPS063-F07/FOREIGN_FIXTURE_LOGIN": ("READ_ONLY_SCOPE", "HFT_QA067_FIXTURE_NOT_ADMITTED_FOR_LOGIN"),
    "OPS063-F08/ORIGINAL_ISSUE": ("SERIALIZABLE_SOURCE", "OPS_A2_RETURN_ORIGINAL_CUSTODY_MISMATCH"),
}
FACTS = {"accounts", "movements", "source_counters", "original_nonce",
         "seal", "custody", "original_issues", "acknowledgements", "audit"}
ROLES = {"qa", "fault_constructor", "migration_installer", "positive_posting_actor",
         "independent_verifier", "witness"}


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError("OPS076_" + code)


def decimal(value: Any, positive: bool = False) -> int:
    require(isinstance(value, str) and DECIMAL.fullmatch(value) is not None,
            "CANONICAL_DECIMAL_REQUIRED")
    number = int(value)
    require(number <= 9223372036854775807 and (not positive or number > 0),
            "DECIMAL_OUT_OF_RANGE")
    return number


def original_archive(raw: bytes, expected_sha256: str) -> dict:
    """Verify exact independently pinned archive bytes; reject duplicate JSON keys."""
    require(isinstance(raw, bytes) and 0 < len(raw) <= 5_000_000, "ARCHIVE_SIZE")
    require(isinstance(expected_sha256, str) and HEX.fullmatch(expected_sha256) is not None,
            "ARCHIVE_PIN_REQUIRED")
    require(hashlib.sha256(raw).hexdigest() == expected_sha256, "ARCHIVE_HASH_MISMATCH")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "DUPLICATE_JSON_KEY")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError("OPS076_NONFINITE_JSON_NUMBER:" + value)

    data = json.loads(raw.decode("utf-8"), object_pairs_hook=unique,
                      parse_constant=invalid_constant)
    require(type(data) is dict, "ARCHIVE_OBJECT_REQUIRED")
    return data


def reconstruct(facts: dict) -> None:
    """Reconstruct complete affected-account histories; completeness needs custody evidence."""
    require(type(facts) is dict and set(facts) == FACTS, "FACT_COVERAGE")
    accounts, movements = facts["accounts"], facts["movements"]
    require(type(accounts) is list and bool(accounts) and type(movements) is list,
            "ACCOUNT_AND_MOVEMENT_ROWS_REQUIRED")
    quantities, versions, pairs, seen = {}, {}, {}, set()
    for account in accounts:
        identity = account["account_id"]
        require(isinstance(identity, str) and UUID.fullmatch(identity) is not None,
                "ACCOUNT_UUID")
        require(identity not in quantities, "DUPLICATE_ACCOUNT")
        quantities[identity] = 0
        versions[identity] = 0
    for row in sorted(movements, key=lambda entry: decimal(entry["entry_id"], True)):
        entry = decimal(row["entry_id"], True)
        require(entry not in seen, "DUPLICATE_MOVEMENT")
        seen.add(entry)
        raw_delta = row["delta_micro"]
        require(isinstance(raw_delta, str) and re.fullmatch(r"-?[1-9][0-9]*", raw_delta) is not None,
                "SIGNED_MOVEMENT_REQUIRED")
        delta = int(raw_delta)
        require(abs(delta) <= 9223372036854775807, "DELTA_OUT_OF_RANGE")
        command = row["command_uuid"]
        require(isinstance(command, str) and UUID.fullmatch(command) is not None, "COMMAND_UUID")
        pairs.setdefault(command, []).append(delta)
        account = row["account_id"]
        if row["bucket"] == "EXTERNAL":
            require(account is None and row["before_version"] is None and
                    row["after_version"] is None, "EXTERNAL_HAS_NO_ACCOUNT_VERSION")
            continue
        require(account in quantities, "MOVEMENT_ACCOUNT_OUTSIDE_CAPTURE")
        require(decimal(row["before_version"]) == versions[account] and
                decimal(row["after_version"]) == versions[account] + 1,
                "HISTORICAL_REVISION_GAP")
        quantities[account] += delta
        versions[account] += 1
        require(quantities[account] >= 0, "HISTORICAL_NEGATIVE_BALANCE")
    require(bool(pairs) and all(len(legs) == 2 and sum(legs) == 0 for legs in pairs.values()),
            "INCOMPLETE_OR_UNBALANCED_COMMAND")
    for account in accounts:
        identity = account["account_id"]
        require(decimal(account["quantity_micro"]) == quantities[identity] and
                decimal(account["version"]) == versions[identity], "POSTSTATE_NOT_RECONSTRUCTED")
    require(isinstance(facts["original_nonce"], str) and
            re.fullmatch(r"[0-9a-f]{48}", facts["original_nonce"]) is not None,
            "ORIGINAL_NONCE_REQUIRED")
    require(bool(facts["seal"]) and bool(facts["audit"]), "SEAL_AND_AUDIT_REQUIRED")


def validate_negative(case_id: str, evidence: dict, binding: dict) -> str:
    require(case_id in NEGATIVES, "UNKNOWN_OR_UNQUALIFIED_FAULT")
    expected_phase, control = NEGATIVES[case_id]
    required_binding = {"fixture_id", "source_sha", "migration_sha256", "gateway_sha256",
                        "constructor_sha256", "project_id", "branch_id", "database"}
    require(set(binding) == required_binding, "EXACT_ADMISSION_BINDING_REQUIRED")
    require(UUID.fullmatch(str(binding["fixture_id"])) is not None, "FIXTURE_UUID")
    require(re.fullmatch(r"[0-9a-f]{40}", str(binding["source_sha"])) is not None, "SOURCE_SHA")
    for field in ("migration_sha256", "gateway_sha256", "constructor_sha256"):
        require(HEX.fullmatch(str(binding[field])) is not None, "ARTIFACT_HASH_REQUIRED")
    require(all(isinstance(binding[k], str) and binding[k] for k in required_binding), "BINDING_VALUE")
    require(evidence.get("case_id") == case_id and evidence.get("binding") == binding,
            "EXECUTION_BINDING_MISMATCH")
    attempt, positive = evidence["attempt"], evidence["positive"]
    require(attempt.get("status") == "REJECTED_ROLLED_BACK" and
            attempt.get("phase") == expected_phase and attempt.get("sqlstate") == "P0001" and
            attempt.get("control") == control and
            attempt.get("origin") == "POSTGRESQL_ORIGINAL_PROTOCOL_CAPTURE",
            "QUEUE_ASSERTION_OR_WRONG_REJECTION_NOT_EXECUTION")
    for record in (attempt, positive):
        require(record.get("server_version_num") == 180006, "PG18_6_REQUIRED")
        require(type(record.get("backend_pid")) is int and record["backend_pid"] > 0,
                "ACTUAL_BACKEND_REQUIRED")
        require(all(isinstance(record.get(k), str) and record[k]
                    for k in ("session_id", "connection_id", "session_user", "current_user")),
                "ACTUAL_SESSION_REQUIRED")
        decimal(record["transaction_id"], True)
        require(HEX.fullmatch(str(record.get("original_capture_sha256"))) is not None,
                "ORIGINAL_CAPTURE_REQUIRED")
    require(UUID.fullmatch(str(attempt.get("execution_id"))) is not None, "EXECUTION_UUID")
    require(positive.get("status") == "COMMIT_OBSERVED" and
            re.fullmatch(r"[0-9A-F]+/[0-9A-F]+", str(positive.get("commit_lsn"))) is not None,
            "POSITIVE_COMMIT_NOT_OBSERVED")
    require(attempt["transaction_id"] != positive["transaction_id"] and
            attempt["session_user"] != positive["session_user"], "POSITIVE_AND_FAULT_NOT_SEPARATE")
    require(attempt.get("rollback_capture_sha256") == evidence.get("post_capture_sha256") and
            HEX.fullmatch(str(evidence.get("post_capture_sha256"))) is not None,
            "ROLLBACK_ORIGINAL_CAPTURE_MISSING")
    reconstruct(evidence["prestate"])
    reconstruct(evidence["poststate"])
    require(evidence["prestate"] == evidence["poststate"], "NEGATIVE_CHANGED_DURABLE_FACTS")
    if case_id.startswith("OPS063-F07/"):
        require(evidence.get("positive_entry_id") == "1", "F07_POSITIVE_ENTRY_ONE_REQUIRED")
        require(any(row["entry_id"] == "1" for row in evidence["prestate"]["movements"]),
                "F07_ORIGINAL_SHORT_ID_MISSING")
        require(evidence.get("unauthorized_rows") == [] and
                evidence.get("unauthorized_bytes_disclosed") == 0 and
                type(evidence.get("unauthorized_bytes_disclosed")) is int and
                attempt.get("query_scope") != positive.get("query_scope"),
                "F07_FOREIGN_SCOPE_OR_NO_DISCLOSURE_NOT_PROVEN")
    return STATUS


def validate_connected_session(admitted: dict, observed: dict) -> str:
    """Check attested SAME SQL-session identity, not a separate preliminary socket.

    The independently signed provider/collector record and driver must establish
    these fields. This function cannot manufacture or authenticate that record.
    """
    fields = {"project_id", "branch_id", "host", "port", "database", "ca_sha256",
              "peer_sha256", "connection_id", "tls_exporter_sha256", "challenge_sha256"}
    require(set(admitted) == fields and all(observed.get(k) == admitted[k] for k in fields),
            "SQL_CONNECTION_NOT_EXACT_ADMITTED_SESSION")
    require(all(isinstance(admitted[k], str) and admitted[k] for k in fields - {"port"}),
            "SESSION_BINDING_VALUE")
    require(type(admitted["port"]) is int and 1 <= admitted["port"] <= 65535, "PORT_INVALID")
    for field in ("ca_sha256", "peer_sha256", "tls_exporter_sha256", "challenge_sha256"):
        require(HEX.fullmatch(admitted[field]) is not None, "SESSION_CRYPTOGRAPHIC_PIN_MISSING")
    require(observed.get("capture_origin") == "SQL_RUNNING_CONNECTION" and
            observed.get("tls_verified_hostname") == admitted["host"] and
            observed.get("channel_binding") == "SCRAM-SHA-256-PLUS" and
            observed.get("tls_version") in ("TLSv1.2", "TLSv1.3") and
            observed.get("server_version_num") == 180006,
            "SEPARATE_SOCKET_OR_UNVERIFIED_CHANNEL_NOT_ACCEPTED")
    roles = observed.get("roles", {})
    require(set(roles) == ROLES, "SIX_SEPARATE_ROLE_REPORTS_REQUIRED")
    logins = set()
    for role, value in roles.items():
        require(isinstance(value.get("login"), str) and value["login"] and
                value["login"] not in logins and value["login"] != "hft_r1_posting_owner",
                "ROLE_IDENTITY_NOT_SEPARATE")
        logins.add(value["login"])
        require(all(value.get(k) is False for k in
                    ("superuser", "bypassrls", "createrole", "replication", "posting_owner_member")),
                "ROLE_EFFECTIVE_PRIVILEGE_UNSAFE")
        require(value.get("forbidden_set_role_denied") is True and
                HEX.fullmatch(str(value.get("effective_acl_sha256"))) is not None,
                "EFFECTIVE_GRANTS_AND_ROLE_SWITCH_NOT_PROVEN")
        if role in {"qa", "independent_verifier", "witness"}:
            require(value.get("protected_dml_denied") is True and
                    value.get("constructor_execute_denied") is True,
                    "OBSERVER_INHERITS_CONSTRUCTOR_OR_DML")
    return STATUS
