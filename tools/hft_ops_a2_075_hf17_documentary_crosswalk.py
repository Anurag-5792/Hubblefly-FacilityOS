"""Documentary HF17 fixture traceability, not signed-fixture equivalence.

ORIGINAL SIGNED HF17 FIXTURE EVIDENCE UNVERIFIED.
All A2-PG-01..16 and HF17-PG-F01..F08 database executions NOT_TESTED.
Mapping states are topic overlap only; independent QA must adjudicate each.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class Fixture:
 original: str
 original_scope: str
 diagnostics: tuple[str,...]
 coverage: str
 remaining: str
 status: str="NOT_TESTED"

DOCUMENTARY=(
 Fixture("HF17-PG-F01","Approved TRANSFER governance COMMIT; independent people and approval negatives",
         ("OPS063-F06",),"PARTIAL","Independent people, signed approval and self-approval negatives"),
 Fixture("HF17-PG-F02","Deferred seal magnitude, revision, digest and poststate integrity",
         ("OPS063-F01","OPS063-F02","OPS063-F03"),"PARTIAL","Separate exact fault origins and SQLSTATE"),
 Fixture("HF17-PG-F03","Genuine two-line UUID GRN, receipt substitution, duplicate and QC denial",
         ("OPS063-F05",),"PARTIAL","Real GRN lines, duplicate receipt and QC authority"),
 Fixture("HF17-PG-F04","AVAILABLE-to-employee-CUSTODY ISSUE and invalid destination/holder",
         ("OPS063-F04",),"PARTIAL","Authorized positive ISSUE, destination/holder negatives"),
 Fixture("HF17-PG-F05","Valid TRANSFER progression, unauthorized metadata mutation and deletion",
         ("OPS063-F06",),"PARTIAL","Exact metadata mutation/delete guards and progression"),
 Fixture("HF17-PG-F06","Two original ISSUE records, ACKNOWLEDGED/DISPUTED outcomes, missing ACK and partial RETURN",
         ("OPS063-F04","OPS063-F08"),"PARTIAL","Two separate original issues and partial return"),
 Fixture("HF17-PG-F07","EXTERNAL/internal history, historical revisions and complete pagination",
         ("OPS063-F07",),"PARTIAL","EXTERNAL pages, historical revisions and negative cross-scope disclosure"),
 Fixture("HF17-PG-F08","Original nonce, uncertain COMMIT, concurrent ISSUE, rollback and restore",
         (),"NO COVERAGE","Unknown COMMIT, concurrent reductions, second-leg rollback, restore"),
)
A2_CASES=tuple(f"A2-PG-{n:02d}" for n in range(1,17))
A2_STATUS={key:"NOT_TESTED" for key in A2_CASES}
ASSERTION_F07={
 "positive":"Authorized exact stock_entry.id=1 with immutable command/movement facts",
 "negative":"Unauthorized foreign-scope short ID must return a protected denial",
 "required_checks":("original_command_id","account_version","movement_digest",
                    "audit","no_foreign_row","no_side_channel_disclosure"),
 "expected_sqlstate":"NOT_QUALIFIED",
 "expected_rejecting_control":"NOT_QUALIFIED",
 "execution":"NOT_TESTED",
}
FAULT_SPLITS={
 "wrong_magnitude":("OPS063-F01","DEFERRED_COMMIT"),
 "wrong_account_revision":("OPS063-F03","DEFERRED_COMMIT"),
 "wrong_full_v2_digest":("OPS063-F03","DEFERRED_COMMIT"),
 "wrong_historical_available_seal":("OPS063-F02","DEFERRED_COMMIT"),
 "incorrect_original_issue":("OPS063-F08","SERIALIZABLE_SOURCE"),
 "invalid_inspection_authority":("OPS063-F08","SERIALIZABLE_SOURCE"),
 "altered_return_condition":("OPS063-F08","SERIALIZABLE_SOURCE"),
 "wrong_destination_account":("OPS063-F08","SERIALIZABLE_SOURCE"),
 "unauthorized_transfer_counter":("OPS063-F06","BEFORE_UPDATE"),
 "substituted_receipt_line":("OPS063-F05","READ_ONLY_GRN"),
 "expired_session_missing_reviewer_entitlement":(None,"READ_ONLY_RECOVERY"),
}
def validate():
 assert len(DOCUMENTARY)==8
 assert len({x.original for x in DOCUMENTARY})==8
 assert all(x.coverage in ("PARTIAL","NO COVERAGE") and x.status=="NOT_TESTED"
            for x in DOCUMENTARY)
 assert len(A2_STATUS)==16 and set(A2_STATUS)==set(A2_CASES)
 assert all(v=="NOT_TESTED" for v in A2_STATUS.values())
 assert len(FAULT_SPLITS)==11
validate()
