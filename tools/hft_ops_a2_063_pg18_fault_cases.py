#!/usr/bin/env python3
"""A2-PG-F01..F08 disposable PostgreSQL18.6 *future* fault-injection runner.

NOT invoked by repository CI. Source-only until separate technical authority,
isolated PG18.6 connection, actual qualified human approvals and fixture seeds.
No fixture records, production grants, keys or trust roots are manufactured.
Test commands are run only upon explicit --execute and SHA-bound environment.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
REQUIRED_ENV=("HFT_OPS_A2_PG063_TECHNICAL_AUTHORITY",
              "HFT_APPROVED_SOURCE_SHA","PGDATABASE","PGUSER")
# Each case requires a real disposable DB with independently prepared,
# transaction-scoped adversarial fixture state. A lacking fixture MUST FAIL.
CASES={
 "PG-F01":{
  "purpose":"balanced wrong-magnitude two-leg command rejected despite matching legacy digest",
  "variables":["cmd"],
  "sql":"BEGIN ISOLATION LEVEL SERIALIZABLE;\n"
        "SELECT hft.ops_a2_assert_command_seal_v2(:'cmd'::uuid);\nROLLBACK;",
  "expect":"OPS_A2_V2_UNBALANCED_OR_INCOMPLETE_MOVEMENTS"},
 "PG-F02":{
  "purpose":"forged historical AVAILABLE poststate quantity or revision rejected",
  "variables":["cmd"],
  "sql":"BEGIN ISOLATION LEVEL SERIALIZABLE;\n"
        "SELECT hft.ops_a2_assert_command_seal_v2(:'cmd'::uuid);\nROLLBACK;",
  "expect":"OPS_A2_V2_SEALED_AVAILABLE_HISTORIC_POSTSTATE_INVALID"},
 "PG-F03":{
  "purpose":"full V2 movement digest/audit payload drift rejected",
  "variables":["cmd"],
  "sql":"BEGIN ISOLATION LEVEL SERIALIZABLE;\n"
        "SELECT hft.ops_a2_assert_command_seal_v2(:'cmd'::uuid);\nROLLBACK;",
  "expect":"OPS_A2_V2_FULL_MOVEMENT_FACT_DIGEST_INVALID"},
 "PG-F04":{
  "purpose":"outstanding custody omitted by an inner join is denied by BASE census",
  "variables":["query"],
  "sql":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "SELECT hft.ops_a2_assert_outstanding_custody_census_v3(:'query'::jsonb);\nROLLBACK;",
  "expect":"OPS_A2_CUSTODY_BASE_CENSUS_MISSING_ISSUE_ACK_AUDIT_FRAGMENT_OR_ACCOUNT"},
 "PG-F05":{
  "purpose":"genuine multi-line GRN receipt identity collision rejected",
  "variables":["p0","p2"],
  "sql":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "SELECT hft.ops_a2_resolve_signed_grn_line_v3(:'p0'::jsonb,:'p2'::jsonb);\nROLLBACK;",
  "expect":"OPS_A2_GRN_RAW_RECEIPT_LINE_AMBIGUOUS_OR_FORGED"},
 "PG-F06":{
  "purpose":"privileged transfer counter-only edit without a unique command link fails",
  "variables":["document","quantity"],
  "sql":"BEGIN ISOLATION LEVEL SERIALIZABLE;\n"
        "UPDATE hft.ops_a2_transfer_document "
        "SET moved_micro=moved_micro+:'quantity'::bigint,"
        "status='PARTIALLY_MOVED' WHERE id=:'document'::uuid;\nROLLBACK;",
  "expect":"OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION"},
 "PG-F07":{
  "purpose":"one-character PostgreSQL entry ID is returned without weakening scope",
  "variables":["query","proof"],
  "sql":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "WITH result AS (SELECT hft.ops_a2_read_snapshot_page_v3("
        ":'query'::jsonb,:'proof'::jsonb) AS payload) "
        "SELECT CASE WHEN EXISTS (SELECT 1 FROM result,"
        "LATERAL jsonb_array_elements(result.payload->'rows') AS pgf_row(value) "
        "WHERE pgf_row.value->>'entryId'='1') THEN 'PG_F07_ONE_DIGIT_ENTRY_PASS' "
        "ELSE 'PG_F07_ONE_DIGIT_ENTRY_MISSING' END;\nROLLBACK;",
  "expect_output":"PG_F07_ONE_DIGIT_ENTRY_PASS"},
 "PG-F08":{
  "purpose":"canonical signed RETURN original ISSUE UUID, custody and inspector binding",
  "variables":["p0","proof"],
  "sql":"BEGIN ISOLATION LEVEL SERIALIZABLE;\n"
        "SELECT hft.ops_a2_resolve_return_authorized_v2("
        ":'p0'::jsonb,:'proof'::jsonb)->>'state';\nROLLBACK;",
  "expect_output":"OPS_A2_AUTHORIZED_SOURCE_V2"},
}

def head():
 return subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
  capture_output=True,text=True,check=True).stdout.strip()

def qualify_env(env):
 missing=[k for k in REQUIRED_ENV if not env.get(k)]
 if missing:raise ValueError("PG063_MISSING_AUTHORITY_OR_CONNECTION:"+",".join(missing))
 if env["HFT_OPS_A2_PG063_TECHNICAL_AUTHORITY"]!="INDEPENDENT_EXPLICIT_063":
  raise ValueError("PG063_NOT_INDEPENDENTLY_AUTHORIZED")
 if head()!=env["HFT_APPROVED_SOURCE_SHA"]:
  raise ValueError("PG063_APPROVED_SOURCE_SHA_MISMATCH")
 if not re.fullmatch(r"hft_r1_disposable_[a-z0-9_]{6,40}",env["PGDATABASE"]):
  raise ValueError("PG063_NONDISPOSABLE_DATABASE_DENIED")
 if not re.fullmatch(r"hft_r1_(?:qa|review)_[a-z0-9_]{3,32}",env["PGUSER"]):
  raise ValueError("PG063_NONQA_LOGIN_DENIED")

def run_case(case_id,values,env):
 spec=CASES[case_id]
 if set(values)!=set(spec["variables"]):
  raise ValueError("PG063_EXACT_CASE_FIXTURE_VARIABLES_REQUIRED")
 if any(not isinstance(v,str) or len(v)>8192 or "\x00" in v
        for v in values.values()):
  raise ValueError("PG063_FIXTURE_ENCODING_INVALID")
 script=(
  "DO $preflight$ BEGIN "
  "IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$' "
  "OR current_setting('server_version_num')::integer < 180000 "
  "OR current_setting('server_version_num')::integer >= 190000 "+
  "OR session_user !~ '^hft_r1_(qa|review)_[a-z0-9_]{3,32}$' "
  "THEN RAISE EXCEPTION 'PG063_DISPOSABLE_PG18_REQUIRED'; END IF; "
  "END $preflight$;\n"+spec["sql"]+"\n")
 argv=["psql","-X","-v","ON_ERROR_STOP=1","-A","-t"]
 for k,v in values.items(): argv.extend(["-v",f"{k}={v}"])
 # Run from stdin, never by shell. No credentials emitted.
 result=subprocess.run(argv,input=script,text=True,
  capture_output=True,env=env,check=False)
 if "expect" in spec:
  good=(result.returncode!=0 and spec["expect"] in result.stderr)
 else:
  good=(result.returncode==0 and spec["expect_output"] in result.stdout)
 return {"case":case_id,"result":"PASS" if good else "FAIL",
         "exit_code":result.returncode,
         "expected":spec.get("expect",spec.get("expect_output"))}

def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument("--list",action="store_true")
 p.add_argument("--execute",action="store_true")
 p.add_argument("--fixtures",type=Path)
 args=p.parse_args(argv)
 if args.list:
  print(json.dumps({"execution":"NOT_EXECUTED",
   "cases":{k:{"purpose":v["purpose"],"requires":v["variables"]}
            for k,v in CASES.items()}},indent=2))
  return 0
 if not args.execute or args.fixtures is None:
  p.error("PG063_SOURCE_ONLY_USE_LIST_OR_EXPLICIT_APPROVED_EXECUTION")
 try:
  qualify_env(os.environ)
  fixtures=json.loads(args.fixtures.read_text(encoding="utf8"))
  if set(fixtures)!=set(CASES):raise ValueError("PG063_ALL_EIGHT_CASES_REQUIRED")
  for case in CASES:
   result=run_case(case,fixtures[case],os.environ.copy())
   print(json.dumps(result,sort_keys=True))
   if result["result"]!="PASS":return 1
 except (OSError,subprocess.SubprocessError,ValueError,KeyError) as exc:
  print("PG063_QUALIFICATION_DENIED:"+str(exc),file=sys.stderr)
  return 2
 return 0

if __name__=="__main__":
 raise SystemExit(main())
