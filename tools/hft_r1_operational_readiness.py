"""HFT R1 OPS-014 source-only operational-readiness inventory.

This is an intentionally NON-AUTHORIZING, filesystem-only report. It can
never issue Gate R, Gate A, a PostgreSQL migration, or production GO.
Removing a rejecting stub changes its result to REVIEW REQUIRED, not PASS.
No network, provider, subprocess, database, approval or secret operations.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "HFT_R1_OPS014_SOURCE_BLOCKER_CENSUS_V1"

# Reviewable blockers grounded in exact, existing source (not a deployment
# completion percentage). Future engineering updates must independently
# requalify each changed source identity and release evidence.
SOURCE_BLOCKERS = (
 ("MIDDLEWARE_HFT_API_DENY", "middleware.ts",
  "HFT_R1_API_NOT_QUALIFIED"),
 ("P2_PROTECTED_WRITER_REVIEW_ONLY",
  "db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql",
  "SOURCE REVIEW CANDIDATE, NOT EXECUTABLE"),
 ("P3_MASTER_SQL_REVIEW_ONLY",
  "db/security/HFT-R1-P3-MASTERS-REVIEW.sql",
  "NONEXECUTABLE DESIGN SOURCE"),
 ("VERSION_PHOTO_SCHEMA_REVIEW_ONLY",
  "db/security/HFT-R1-ITEM-VERSION-PHOTOS-REVIEW.sql",
  "REVIEW ONLY, NOT AN EXECUTABLE MIGRATION"),
 ("P0_COUNT_SQL_REVIEW_ONLY",
  "db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql",
  "REVIEW CANDIDATE / NOT AN AUTHORIZED MIGRATION"),
 ("P0_RECEIPT_ISSUE_VERSION_WRITER_REJECTS",
  "db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql",
  "RAISE EXCEPTION 'P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED'"),
 ("P0_VERSION_AWARE_READBACK_REJECTS",
  "db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql",
  "RAISE EXCEPTION 'P0_VERSION_AWARE_STOCK_READBACK_NOT_QUALIFIED'"),
 ("TRANSFER_PROTECTED_SUBMISSION_REJECTS",
  "lib/hft/stores/p0-persistence.ts",
  "P0_TRANSFER_REQUIRES_P2_SINGLE_WRITER_EXTENSION"),
 ("P0_RETURN_INTERFACE_NOT_IMPLEMENTED",
  "lib/hft/stores/p0-operations.ts",
  "P0_KINDS=['IN','OUT','COUNT','TRANSFER']"),
 ("OPENING_STOCK_NONPOSTING_ONLY",
  "lib/hft/domain/opening-stock.ts",
  "Strictly nonposting opening-stock count reconciliation"),
 ("PHOTO_INTAKE_NOT_QUALIFIED",
  "app/stores/items/[itemCode]/page.tsx",
  "image approval remain blocked until the governed HFT media service is qualified"),
 ("P3_INDEPENDENT_DECISION_EMPLOYEE_ONLY",
  "lib/hft/masters/p3-service.ts",
  "P3_REVIEW_QUEUE_EMPLOYEE_ONLY"),
)

PROTECTED_HOLD_PINS = tuple(
 f"config/hft-bootstrap019-stage-s{n}.sha256" for n in range(6)
) + (
 "config/hft-bootstrap019-review.sha256",
 "config/hft-bootstrap019-execution.sha256",
 "config/hft-bootstrap019-canonical-catalog.sha256",
 "config/hft-recovery-v2-collector-trust.sha256",
 "config/hft-recovery-v2-witness-trust.sha256",
)


def evaluate_source(root:Path=ROOT)->dict:
 """Read-only source census. The result is NEVER a release authorization."""
 checks=[]
 for ident,path,expected in SOURCE_BLOCKERS:
  source=root/path
  if not source.is_file() or source.is_symlink():
   checks.append({"id":ident,"path":path,"status":"SOURCE_UNAVAILABLE_REVIEW_REQUIRED"})
   continue
  raw=source.read_bytes()
  try: text=raw.decode("utf-8")
  except UnicodeDecodeError: text=""
  checks.append({
   "id":ident,"path":path,"sha256":hashlib.sha256(raw).hexdigest(),
   "status":("KNOWN_SOURCE_BLOCKER" if expected in text else
             "SOURCE_CHANGED_INDEPENDENT_REQUALIFICATION_REQUIRED")
  })
 pins=[]
 for name in PROTECTED_HOLD_PINS:
  file=root/name
  value=file.read_text(encoding="utf-8").strip() if file.is_file() and not file.is_symlink() else None
  pins.append({"path":name,"status":("HOLD" if value=="HOLD" else
                        "MISSING_OR_CHANGED_REVIEW_REQUIRED")})
 return {
  "schema":SCHEMA,
  "mode":"READ_ONLY_SOURCE_ONLY_NEVER_AUTHORIZES",
  "release":"NO_GO",
  "gateR":"HOLD",
  "gateA":"HOLD",
  "production":"NO_GO",
  "source_checks":checks,
  "protected_hold_pins":pins,
  "remaining_external_requirements":[
   "INDEPENDENT_P2_VERSIONED_LEDGER_SOURCE_AND_MIGRATION_REVIEW",
   "INDEPENDENT_P3_MASTER_AND_ITEM_PHOTO_AUTHORITY",
   "APPROVED_DISPOSABLE_PG18_6_AND_ONLINE_ACL_TESTS",
   "REAL_IN_OUT_COUNT_TRANSFER_RETURN_AND_BALANCE_READBACK",
   "INDEPENDENT_APPROVERS_WITNESSES_AND_IMMUTABLE_AUDIT",
   "OPENING_STOCK_AND_PHYSICAL_CUTOVER_RECONCILIATION",
   "RECOVERY_GATE_R_AND_WITNESSED_RESTORE",
   "SOURCE_BOUND_GATE_A_AND_PRODUCTION_QA",
  ],
 }


def main()->int:
 parser=argparse.ArgumentParser(description="Read-only, never-GO Stores source census")
 parser.add_argument("--json",action="store_true")
 args=parser.parse_args()
 outcome=evaluate_source()
 if args.json:
  print(json.dumps(outcome,sort_keys=True,indent=2))
 else:
  print("HFT_R1_OPS014_RELEASE=NO_GO;GATE_R=HOLD;GATE_A=HOLD")
  for result in outcome["source_checks"]:
   print(result["id"]+"="+result["status"])
 return 0  # Command reports faithfully; it is NOT an execution approval.


if __name__=="__main__":
 raise SystemExit(main())
