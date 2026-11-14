"""Exact 16 original A2-PG fixture intents for constructor development.

SOURCE FIXTURE CATALOG ONLY, NOT EXECUTED. No invented SQLSTATE or signed
original HF17 fixture bytes. Each row explicitly requires real admission,
positive COMMIT, constructed fault, database-origin facts and independent
witness; the single F06 constructor does not cover the other scenarios.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class FixturePlan:
 id: str
 positive: str
 adverse: str
 negative_boundary: str
 poststate: str
 required_evidence: tuple[str,...]
 status: str="NOT_TESTED"

BASE=("approved_fixture_uuid","approved_source_sha","approved_executable_migration_sha",
 "actual_pg18_backend","positive_transaction_commit","original_nonce",
 "stock_account_versions_before_after","source_counter_before_after",
 "movement_legs","immutable_seal","audit_outbox","independent_verifier",
 "accountable_witness")
PLANS=(
 FixturePlan("A2-PG-01","Independent signed TRANSFER approval and atomic two-leg COMMIT",
  "Self-approved/forged-person TRANSFER","APPROVAL_PERSON_SEPARATION",
  "No unauthorized command, balance or counter",BASE),
 FixturePlan("A2-PG-02","Valid signed -Q/+Q dual movement",
  "Forged -2Q/+2Q magnitude with same signed Q","DEFERRED_SEAL_QUANTITY",
  "Exactly unchanged committed accounts and seal",BASE),
 FixturePlan("A2-PG-03","Two genuine GRN UUID lines, independently approved receipt",
  "Substitute receipt line, duplicate and QC denial","TYPED_GRN_RECEIPT_LINE_QC",
  "No receipt decrement or stock command",BASE),
 FixturePlan("A2-PG-04","AVAILABLE-to-employee-CUSTODY original ISSUE",
  "Wrong destination or unauthorized holder","ISSUE_SOURCE_ACCOUNT_HOLDER",
  "No additional custody or movement",BASE),
 FixturePlan("A2-PG-05","Original ISSUE ACK and inspected RETURN",
  "Forged inspected condition or stale original ISSUE","RETURN_INSPECTOR_ORIGINAL_ISSUE",
  "No custody reduction on rejection",BASE),
 FixturePlan("A2-PG-06","Correct version and sealed AVAILABLE historical state",
  "Wrong account revision and historical seal","DEFERRED_VERSION_HISTORY",
  "Unchanged sealed accounts",BASE),
 FixturePlan("A2-PG-07","Valid command-bound TRANSFER counter",
  "Unauthorized document metadata/counter update or deletion",
  "BEFORE_UPDATE_PROTECTED_WRITER_ONLY","Unchanged counter and ledger",BASE),
 FixturePlan("A2-PG-08","Two independent original ISSUE commands and outcomes",
  "Cross-link ACKNOWLEDGED and DISPUTED records",
  "ORIGINAL_ISSUE_CUSTODY_CENSUS","Two independent histories unchanged",BASE),
 FixturePlan("A2-PG-09","Complete custody ACK and audit evidence",
  "Missing ACK, audit or one source ISSUE","CUSTODY_EVIDENCE_COMPLETENESS",
  "No silent return or quantity drift",BASE),
 FixturePlan("A2-PG-10","EXTERNAL/internal pagination and revisions",
  "Omit EXTERNAL leg or substitute foreign page cursor","SCOPED_HISTORY_READBACK",
  "Complete authorized pagination; no foreign disclosure",BASE),
 FixturePlan("A2-PG-11","Original nonce reconstruction after posting session expiry",
  "Missing or revoked separate reviewer grant","READ_ONLY_RECOVERY_AUTHORITY",
  "No expired posting session reactivation",BASE),
 FixturePlan("A2-PG-12","Committed command reconstructed by original nonce",
  "Unknown COMMIT triggers blind retry","UNKNOWN_COMMIT_NON_REPOST",
  "Exactly one committed command",BASE),
 FixturePlan("A2-PG-13","Two competing ISSUE reductions from same version",
  "Concurrent attempt uses stale account revision","SERIALIZABLE_CONCURRENT_POST",
  "No negative balance, one valid winner",BASE),
 FixturePlan("A2-PG-14","Signed atomic two-leg transfer",
  "Second leg rejected after first leg prepared","ATOMIC_SECOND_LEG_ROLLBACK",
  "No committed one-leg movement",BASE),
 FixturePlan("A2-PG-15","Inspected GOOD RETURN BIN01 CUSTODY to BIN02 AVAILABLE",
  "Substitute BIN02 without original approved destination","GOOD_RETURN_LEAF_AUTHORITY",
  "No unauthorized new account or stock",BASE),
 FixturePlan("A2-PG-16","Valid inspector/original ISSUE/destination account",
  "Invalid inspector, original issue, condition or destination",
  "RETURN_TYPED_SOURCE_AUTHORITY","Unchanged custody, stock and audit",BASE),
)
def validate():
 assert [x.id for x in PLANS]==[f"A2-PG-{i:02d}" for i in range(1,17)]
 assert all(x.status=="NOT_TESTED" and x.positive and x.adverse
            and x.negative_boundary and x.poststate for x in PLANS)
 assert all(x.required_evidence==BASE for x in PLANS)
validate()
