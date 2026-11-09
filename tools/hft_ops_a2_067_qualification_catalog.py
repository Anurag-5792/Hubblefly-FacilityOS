"""OPS-A2 067 source-only PostgreSQL qualification catalog.

The independent HF17-PG-F01..F08 fixtures are NOT aliases of OPS063-F01..F08.
The original frozen QA definitions are not in this repository. No equivalence
or independent ACCEPT is asserted. Case status is NOT_TESTED until executed
with approved fault constructor, witness and independently reconstructed facts.
"""
from dataclasses import dataclass

HF17_ORIGINAL = tuple(f"HF17-PG-F{i:02d}" for i in range(1,9))
A2_ORIGINAL = tuple(f"A2-PG-{i:02d}" for i in range(1,17))

@dataclass(frozen=True)
class Diagnostic:
    id: str
    defect: str
    positive: str
    adverse: str
    required_prestate: tuple[str,...]
    expected_negative_code: str|None
    expected_sqlstate: str|None
    required_poststate: tuple[str,...]
    controls_supported: tuple[str,...]
    independently_verified_original_alias: None = None
    status: str = "NOT_TESTED"

CASES: dict[str,Diagnostic] = {
 "OPS063-F01":Diagnostic(
  "OPS063-F01","Wrong-magnitude balanced pair",
  "Qualify correct signed -Q/+Q with full deferred COMMIT seal",
  "Approved disposable fault writer creates -2Q/+2Q against signed Q",
  ("signed_quantity","original_nonce","two_real_legs","exact_command_id",
   "approved_disposable_fault_authority","positive_control_committed"),
  "OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS","P0001",
  ("no_unauthorized_stock_command","unchanged_stock_accounts",
   "unchanged_seals","immutable_audit_reconstruction"),
  ("SEC-064","HF17-OPS-A2-QA-066","OPS-A2-063-SEAL")),
 "OPS063-F02":Diagnostic(
  "OPS063-F02","Forged sealed AVAILABLE poststate",
  "Qualify correct historical quantity/version after legitimate COMMIT",
  "Protected fault constructor stages forged historical AVAILABLE seal",
  ("actual_available_account","sealed_before_after_version",
   "positive_control_committed","approved_disposable_fault_authority"),
  "OPS_A2_V2_SEALED_AVAILABLE_HISTORIC_POSTSTATE_INVALID","P0001",
  ("seals_unchanged","balances_unchanged","original_audit_unchanged"),
  ("OPS-A2-063-SEAL",)),
 "OPS063-F03":Diagnostic(
  "OPS063-F03","Forged V2 digest/account identity",
  "Reconstruct valid full V2 movement SHA and audit hash",
  "Construct fake source/destination account revision or modified signed digest",
  ("original_v2_payload","actual_account_revisions","positive_control_committed",
   "approved_disposable_fault_authority"),
  "OPS_A2_V2_FULL_MOVEMENT_FACT_DIGEST_INVALID","P0001",
  ("unchanged_movements","unchanged_nonce","unchanged_audit"),
  ("OPS-A2-063-SEAL",)),
 "OPS063-F04":Diagnostic(
  "OPS063-F04","Missing base custody ISSUE evidence",
  "Complete original ISSUE census, signed ACK and original fragment",
  "Disposable fixture removes only one QA evidence relation row",
  ("original_issue_command","outstanding_custody","verified_ack",
   "positive_control_committed","approved_disposable_fault_authority"),
  "OPS_A2_CUSTODY_BASE_CENSUS_MISSING_ISSUE_ACK_AUDIT_FRAGMENT_OR_ACCOUNT","P0001",
  ("custody_conservation","no_missing_issue_silently_returned","audit_reconstructed"),
  ("GOV-065","OPS-A2-063-CUSTODY",)),
 "OPS063-F05":Diagnostic(
  "OPS063-F05","Ambiguous typed GRN receipt line",
  "One genuine UUID GRN with distinct approved receiptKey:line identities",
  "Distinct lines reuse the same raw signed receiptKey with otherwise exact scope",
  ("real_grn_id","invoice_line","typed_receipt_lines",
   "signed_raw_receipt_key","positive_control_committed",
   "approved_disposable_fault_authority"),
  "OPS_A2_GRN_RAW_RECEIPT_LINE_AMBIGUOUS_OR_FORGED","P0001",
  ("grn_authorized_remaining_unchanged","no_stock_post","audit_unchanged"),
  ("OPS-A2-063-GRN",)),
 "OPS063-F06":Diagnostic(
  "OPS063-F06","TRANSFER counter-only movement",
  "Unique command-bound transfer counter and two-ledger-leg COMMIT",
  "Disposable fault issuer attempts privileged counter UPDATE without command",
  ("original_transfer_approval","exact_document_revision","original_counter",
   "positive_control_committed","approved_disposable_fault_authority"),
  "OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION","P0001",
  ("counter_unchanged","no_unbacked_command_link","unchanged_ledger"),
  ("OPS-A2-063-TRANSFER",)),
 "OPS063-F07":Diagnostic(
  "OPS063-F07","Single-digit PostgreSQL stock-entry ID",
  "Real stock_entry.id=1 is returned with full immutable evidence",
  "Attempt substitution of corporate or foreign-scope one-character identifier",
  ("stock_entry_id_1_exists","approved_read_session","full_read_snapshot",
   "positive_control_committed"),
  None,None,
  ("exact_entry_id_and_command","complete_account_versions",
   "no_scope_substitution","audit_reconstructed"),
  ("OPS-A2-063-READBACK",)),
 "OPS063-F08":Diagnostic(
  "OPS063-F08","RETURN original ISSUE/inspection",
  "Real inspected GOOD RETURN from BIN01 to BIN02, signed and sealed",
  "Wrong original ISSUE or forged inspection condition/credit account",
  ("original_issue_id","employee_custody","independent_inspection",
   "positive_control_committed","approved_disposable_fault_authority"),
  "OPS_A2_RETURN_ORIGINAL_CUSTODY_MISMATCH","P0001",
  ("zero_partial_return","unchanged_original_issue","balances_conserved",
   "unchanged_audit_on_rejection"),
  ("OPS-A2-063-RETURN","GOV-065-H01")),
}

# Machine-inspectable transaction plan. Every adverse fixture must be
# independently constructed and attested BEFORE the QA gateway is invoked.
# No caller-supplied SQL string or broad posting-owner login is accepted.
CASE_SEQUENCES={
 "OPS063-F01":("POSITIVE_VALID_POST_COMMIT","ATTEST_ORIGINAL_Q_AND_NONCE",
  "FAULT_CONSTRUCTOR_STAGE_BALANCED_WRONG_MAGNITUDE",
  "SERIALIZABLE_NEGATIVE_COMMIT","VERIFY_SQLSTATE_AND_FULL_ROLLBACK"),
 "OPS063-F02":("POSITIVE_VALID_AVAILABLE_SEAL_COMMIT","ATTEST_ORIGINAL_HISTORIC_VERSIONS",
  "FAULT_CONSTRUCTOR_STAGE_FORGED_AVAILABLE_POSTSTATE",
  "SERIALIZABLE_NEGATIVE_COMMIT","VERIFY_SQLSTATE_AND_FULL_ROLLBACK"),
 "OPS063-F03":("POSITIVE_FULL_V2_DIGEST_COMMIT","ATTEST_ORIGINAL_ENTRY_AND_AUDIT_SHA",
  "FAULT_CONSTRUCTOR_STAGE_RESEALED_FACT_DRIFT",
  "SERIALIZABLE_NEGATIVE_COMMIT","VERIFY_SQLSTATE_AND_FULL_ROLLBACK"),
 "OPS063-F04":("POSITIVE_FULL_CUSTODY_CENSUS","ATTEST_ORIGINAL_ISSUE_FRAGMENT_ACK",
  "FAULT_CONSTRUCTOR_STAGE_ONE_MISSING_EVIDENCE","READ_ONLY_CENSUS_DENIAL",
  "RECONSTRUCT_ALL_OUTSTANDING_ISSUES"),
 "OPS063-F05":("POSITIVE_DISTINCT_MULTILINE_GRN","ATTEST_RAW_HMAC_AND_TYPED_GRN",
  "FAULT_CONSTRUCTOR_STAGE_AMBIGUOUS_RECEIPT_KEY","READ_ONLY_GRN_DENIAL",
  "VERIFY_UNCHANGED_GRN_AND_STOCK"),
 "OPS063-F06":("POSITIVE_LINKED_TRANSFER_COMMIT","ATTEST_APPROVED_COUNTER_AND_LINK",
  "FAULT_CONSTRUCTOR_STAGE_COUNTER_ONLY_UPDATE","SERIALIZABLE_UPDATE_DENIAL",
  "VERIFY_UNCHANGED_COUNTER_AND_LEDGER"),
 "OPS063-F07":("POSITIVE_ENTRY_ID_ONE_AUTHORITATIVE_READ",
  "ATTEST_ENTRY_ONE_AND_COMPLETE_HISTORY",
  "FAULT_CONSTRUCTOR_STAGE_FOREIGN_SCOPE_ONE_DIGIT_ALIAS",
  "READ_ONLY_ENTRY_SCOPE_DENIAL","VERIFY_NO_DATA_LEAK"),
 "OPS063-F08":("POSITIVE_GOOD_RETURN_BIN01_TO_BIN02",
  "ATTEST_ORIGINAL_ISSUE_AND_INSPECTOR",
  "FAULT_CONSTRUCTOR_STAGE_FORGED_ISSUE_OR_CONDITION",
  "SERIALIZABLE_RETURN_SOURCE_DENIAL",
  "VERIFY_NO_CUSTODY_OR_LEDGER_MUTATION"),
}
CASE_NEGATIVE_PHASE={
 "OPS063-F01":"DEFERRED_COMMIT",
 "OPS063-F02":"DEFERRED_COMMIT",
 "OPS063-F03":"DEFERRED_COMMIT",
 "OPS063-F04":"READ_ONLY_CENSUS",
 "OPS063-F05":"READ_ONLY_GRN",
 "OPS063-F06":"BEFORE_UPDATE",
 "OPS063-F07":"READ_ONLY_SCOPE",
 "OPS063-F08":"SERIALIZABLE_SOURCE",
}
CASE_AUTHORITIES=("independent_migration_installer","human_witness",
 "qualified_positive_posting_actor","independent_fault_constructor",
 "restricted_qa_observer","independent_fact_verifier")

# Exact, explicit NON-EQUIVALENCE crosswalk. Chat 17 must supply and authorize
# the original signed fixture definitions before any semantic mapping exists.
CROSSWALK = {
 "original_hf17_fixture_ids": list(HF17_ORIGINAL),
 "original_a2_pg_ids": list(A2_ORIGINAL),
 "diagnostic_finding_support": {name:list(case.controls_supported)
                                for name,case in CASES.items()},
 "hf17_to_ops063": {id:[] for id in HF17_ORIGINAL},
 "unverified_original_fixture_ids": list(HF17_ORIGINAL),
 "all_original_postgres_results":"NOT_TESTED",
 "all_ops063_postgres_results":"NOT_TESTED",
 "equivalence":"NONE_ASSERTED_WITHOUT_ORIGINAL_HF17_FROZEN_FIXTURE_EVIDENCE",
}
def validate_catalog()->None:
 assert tuple(CASES)==tuple(f"OPS063-F{i:02d}" for i in range(1,9))
 assert len(HF17_ORIGINAL)==8 and len(A2_ORIGINAL)==16
 assert len({case.id for case in CASES.values()})==8
 assert all(case.status=="NOT_TESTED" for case in CASES.values())
 assert set(CASE_SEQUENCES)==set(CASES)
 assert set(CASE_NEGATIVE_PHASE)==set(CASES)
 assert all(len(steps)==5 and steps[0].startswith("POSITIVE_")
            and "FAULT_CONSTRUCTOR" in steps[2]
            for steps in CASE_SEQUENCES.values())
 assert all(case.positive and case.adverse and case.required_prestate and
            case.required_poststate for case in CASES.values())
 assert not set(CASES).intersection(HF17_ORIGINAL)
validate_catalog()
