#!/usr/bin/env python3
"""Build an UNAPPROVED source-hash attestation, never executable migration approval.

No SQL is installed, parsed by PostgreSQL, or executed. Protected STOPs stay
intact. Hashes and dependencies are read from the exact local checkout only.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"db/migrations/manifest.v1.json"
PROTECTED=(
 "db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-ACL-CLOSURE-NONEXECUTABLE.sql",
 "db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql",
 "db/qa/HFT-R1-OPS-A2-QA067-RESTRICTED-GATEWAY-NONEXECUTABLE.sql",
 "db/qa/HFT-R1-OPS-A2-QA067-FAULT-CONSTRUCTOR-NONEXECUTABLE.sql",
)
def sha(path):
 return hashlib.sha256(path.read_bytes()).hexdigest()

def _git(*args):
 return subprocess.run(("git",*args),cwd=ROOT,check=True,
                       capture_output=True,text=True).stdout.strip()

def source_attestation(require_clean=True):
 head=_git("rev-parse","HEAD")
 if require_clean and _git("status","--porcelain"):
  raise ValueError("075_DIRTY_SOURCE_CANNOT_QUALIFY")
 manifest=json.loads(MANIFEST.read_text())
 assert manifest["schema"]=="HFT_R1_CANONICAL_MIGRATION_MANIFEST_V1"
 files=manifest["migrations"]
 if [m["version"] for m in files]!=list(range(1,7)):
  raise ValueError("075_CANONICAL_MIGRATION_SEQUENCE_INVALID")
 for migration in files:
  path=ROOT/"db/migrations"/migration["file"]
  if not path.is_file() or sha(path)!=migration["sha256"]:
   raise ValueError("075_CANONICAL_MIGRATION_HASH_MISMATCH")
 hashes={}
 for relative in PROTECTED:
  file=ROOT/relative
  if not file.is_file():raise ValueError("075_PROTECTED_SOURCE_MISSING:"+relative)
  text=file.read_text()
  if not re.search(r"DO\s+\$(?:STOP_[A-Z0-9_]+|OPS_A2_CONSOLIDATED_STOP)\$",text):
   raise ValueError("075_UNCONDITIONAL_SQL_STOP_MISSING:"+relative)
  if not re.search(r"RAISE\s+EXCEPTION",text):
   raise ValueError("075_STOP_HAS_NO_EXCEPTION:"+relative)
  if text.index("RAISE EXCEPTION")>text.find("CREATE TABLE")>0:
   raise ValueError("075_DDL_PRECEDES_SQL_STOP:"+relative)
  hashes[relative]=sha(file)
 full=(ROOT/PROTECTED[4]).read_text()
 for declaration in (
  "CREATE TABLE hft.ops_a2_transfer_issuance_order(",
  "CREATE OR REPLACE FUNCTION hft.ops_a2_assert_independent_scope_read_v1(",
  "CREATE OR REPLACE FUNCTION hft.ops_a2_reconcile_post_v3(",
  "CREATE OR REPLACE FUNCTION hft.ops_a2_post_stock_command_v2("):
  if full.count(declaration)!=1:
   raise ValueError("075_CONSOLIDATED_DEPENDENCY_OR_DUPLICATE:"+declaration)
 if not (full.index("CREATE TABLE hft.ops_a2_transfer_issuance_order(")<
         full.index("CREATE OR REPLACE FUNCTION hft.ops_a2_post_stock_command_v2(")):
  raise ValueError("075_TRANSFER_SOURCE_DEPENDENCY_ORDER_INVALID")
 return {
  "status":"SOURCE_HASH_INVENTORY_ONLY_NOT_EXECUTABLE_MIGRATION",
  "git_head":head,
  "manifest_sha256":sha(MANIFEST),
  "canonical_migrations":{str(m["version"]):m["sha256"] for m in files},
  "protected_candidate_sha256":hashes,
  "executable_migration_sha256":None,
  "approved_database_identity":None,
  "approved_installer":None,
  "observed_pg18_installation":"NOT_EXECUTED",
  "sql_parser_acceptance":"NOT_TESTED",
  "production":"NO_GO",
 }

if __name__=="__main__":
 try:
  print(json.dumps(source_attestation(),sort_keys=True,indent=2))
 except (OSError,ValueError,subprocess.CalledProcessError,AssertionError) as e:
  print("075_SOURCE_ATTESTATION_DENIED:"+str(e),file=sys.stderr)
  sys.exit(2)
