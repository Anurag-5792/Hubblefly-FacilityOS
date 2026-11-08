#!/usr/bin/env python3
"""Prepare a source-hash-pinned, NONEXECUTED OPS-A2 PG18 acceptance manifest.

No network, credentials, database connection, SQL execution, extension or
resource modification. This does not accept a Gate, a migration, or a PR.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL_DIR=Path("db/security")
CANONICAL=[f"db/migrations/000{i}_"+name+".sql" for i,name in (
 (1,"hft_masters"),(2,"hft_ledger"),(3,"hft_workflows"),
 (4,"hft_posting_authority"),(5,"hft_quantitative_accounts_receipts"),
 (6,"hft_posted_fact_integrity"))]
CANDIDATES=[
 "db/security/HFT-R1-OPS-A-VERSIONED-FORWARD-NONEXECUTABLE-CANDIDATE.sql",
 "db/security/HFT-R1-P2-ONE-WRITER-REVIEW.sql",
 "db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql",
 "db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-PROOF-AUTHORITY-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql",
]
TESTS=[
 "tests/test_hft_ops_a2_review_source.py",
 "tests/test_hft_ops_a2_pg18_consolidated.py",
 "tests/test_hft_ops_a2_060_controls.py",
 "tests/test_hft_ops_a2_061_source.py",
 "tests/test_hft_ops_a2_061_v2_vectors.py",
 "tests/test_hft_ops_a2_061_manifest.py",
 "tests/unit/hft-ops-a2-protected-service.test.ts",
 "tests/unit/hft-ops-a2-return-proof.test.ts",
 "tests/unit/hft-ops-a2-complete-snapshot.test.ts",
 "tests/unit/hft-ops-a2-v2-golden-parity.test.ts",
]
MATRIX=[f"A2-PG-{n:02d}" for n in range(1,17)]
STOP="OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED"
SHA=re.compile(r"^[0-9a-f]{40}$")

def run_head()->str:
 result=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
  capture_output=True,text=True,check=True)
 return result.stdout.strip()

def create_manifest(expected_head:str)->dict:
 if not SHA.fullmatch(expected_head):
  raise ValueError("OPS_A2_EXPECTED_EXACT_HEAD_SHA_REQUIRED")
 actual=run_head()
 if actual!=expected_head:
  raise ValueError("OPS_A2_FROZEN_HEAD_MISMATCH")
 blobs={}
 for path in CANONICAL+CANDIDATES+TESTS:
  data=(ROOT/path).read_bytes()
  blobs[path]={"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)}
 candidate=(ROOT/CANDIDATES[-1]).read_text(encoding="utf8")
 if candidate.count("RAISE EXCEPTION '"+STOP+"'")!=1 or (
  len(re.findall(r"^BEGIN;$",candidate,re.M))!=1 or
  len(re.findall(r"^COMMIT;$",candidate,re.M))!=1):
  raise ValueError("OPS_A2_GUARDED_CONSOLIDATED_CANDIDATE_INVALID")
 return {
  "contract":"HFT-R1-OPS-A2-PG18-ACCEPTANCE-MANIFEST-061-V1",
  "frozen_review_head":actual,
  "repository":"Anurag-5792/Hubblefly-FacilityOS",
  "postgresql_required":"18.6",
  "execution_evidence":"NOT_EXECUTED",
  "no_database_or_resource_access":True,
  "protected_sql_installation":"HOLD",
  "gate_r":"HOLD","gate_a":"HOLD","production":"NO-GO",
  "source_files":blobs,
  "test_matrix":[{"id":case,"result":"NOT_EXECUTED",
                  "requires":"independent qualified disposable PostgreSQL 18.6 evidence"}
                 for case in MATRIX],
  "technical_prerequisites":[
   "Exact independent source and sha256 approval against frozen HEAD",
   "Canonical 0001-0006 revision hashes, history preflight and approved cutover",
   "Qualified separate PostgreSQL 18.6 disposable database, roles, pgcrypto and secrets",
   "Accepted P0 P2 P3 item photo and OPS-A source schemas",
   "Independently verified SECURITY DEFINER ownership, grants, inheritance and RLS",
   "Separate human approval/issuer identity, stable corporate people and audit evidence",
   "Multi-session SQL parse, race, rollback, lost-COMMIT and readback tests witnessed by Chat 17",
   "Independent Chat 10 and Chat 11 V2 security/governance delta acceptance",
   "Protected execution gate satisfied before any SQL is installed"
  ]
 }

def main()->int:
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument("--expected-head",required=True)
 parser.add_argument("--output",default="-",
  help="report output path, or - for standard output (never SQL execution)")
 args=parser.parse_args()
 try:
  manifest=create_manifest(args.expected_head)
 except (OSError,subprocess.CalledProcessError,ValueError) as exc:
  parser.error(str(exc))
 result=json.dumps(manifest,indent=2,sort_keys=True)+"\n"
 if args.output=="-":
  print(result,end="")
 else:
  target=Path(args.output)
  target.write_text(result,encoding="utf8")
 return 0

if __name__=="__main__":
 raise SystemExit(main())
