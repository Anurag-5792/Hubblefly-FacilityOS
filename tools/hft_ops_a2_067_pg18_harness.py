#!/usr/bin/env python3
"""OPS-A2 067 independently admitted disposable PG18 evidence runner.

SOURCE ONLY. No protected migration, fault constructor or trust root is
installed by this program. Without a protected external trust registry,
signed technical admission, independently signed fixture receipts, and an
approved hft_qa067 restricted gateway, --execute fails CLOSED.
Ordinary QA must NEVER inherit posting-owner or fault-constructor roles.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from importlib.util import module_from_spec,spec_from_file_location

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"tools/hft_ops_a2_067_qualification_catalog.py"
TRUST=Path("/etc/hft/ops-a2/067-approved-roots.json")
CONTRACT="HFT-OPS-A2-PG18-067-TECHNICAL-ADMISSION-V1"
RECEIPT="HFT-OPS-A2-PG18-067-ADVERSE-FIXTURE-V1"
VERSION=180006

def _catalog():
 spec=spec_from_file_location("hft_067_catalog",CATALOG)
 assert spec and spec.loader
 module=module_from_spec(spec);sys.modules[spec.name]=module
 spec.loader.exec_module(module)
 return module

def canonical(v):
 return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode("utf8")

def checksum(path):
 return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def _private_source(path,require_root=True):
 p=Path(path)
 if p.is_symlink() or not p.is_absolute():
  raise ValueError("067_UNTRUSTED_OR_SYMLINK_PROTECTED_SOURCE")
 meta=p.stat()
 if (require_root and meta.st_uid!=0) or meta.st_mode & 0o022 or not stat.S_ISREG(meta.st_mode):
  raise ValueError("067_PROTECTED_SOURCE_MODE_OR_OWNER_INVALID")
 return json.loads(p.read_text(encoding="utf8"))

def _time_int(v):
 return isinstance(v,int) and not isinstance(v,bool) and v>0

def signed_record(path,root,required_roles,contract):
 rec=_private_source(Path(path).resolve(strict=True),require_root=False)
 if set(rec)!={"payload","signatures"} or not isinstance(rec["payload"],dict) or (
  rec["payload"].get("contract")!=contract):
  raise ValueError("067_WRONG_SIGNED_RECORD_CONTRACT")
 payload=rec["payload"];rid=payload.get("record_id")
 if not isinstance(rid,str) or not re.fullmatch(r"[0-9a-f-]{36}",rid):
  raise ValueError("067_APPROVAL_RECORD_ID_INVALID")
 now=int(time.time())
 if not _time_int(payload.get("valid_from")) or not _time_int(payload.get("valid_until")):
  raise ValueError("067_APPROVAL_WINDOW_INVALID")
 if not payload["valid_from"]<=now<payload["valid_until"] or payload["valid_until"]-now>86400:
  raise ValueError("067_APPROVAL_EXPIRED_OR_UNBOUNDED")
 if rid in root.get("revoked_record_ids",[]):
  raise ValueError("067_APPROVAL_REVOKED")
 try:
  from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
 except ImportError as error:
  raise ValueError("067_PINNED_ED25519_VERIFIER_NOT_INSTALLED") from error
 data=canonical(payload)
 used=set();people=set();roles=set()
 for signed in rec["signatures"]:
  keyid=signed.get("key_id")
  if keyid in used or keyid in root.get("revoked_key_ids",[]):
   raise ValueError("067_SIGNATURE_REPLAY_OR_REVOKED_KEY")
  key=root.get("keys",{}).get(keyid)
  if not key or key.get("role") not in required_roles:
   raise ValueError("067_UNAPPROVED_SIGNING_KEY_OR_ROLE")
  pid=key.get("person_id")
  if not pid or pid in people:
   raise ValueError("067_SIGNERS_NOT_DISTINCT_CORPORATE_PERSONS")
  try:
   pub=bytes.fromhex(key["ed25519_public_hex"])
   sig=base64.b64decode(signed["ed25519_signature_b64"],validate=True)
   if len(pub)!=32 or len(sig)!=64:raise ValueError("bad signature lengths")
   Ed25519PublicKey.from_public_bytes(pub).verify(sig,data)
  except Exception as error:
   raise ValueError("067_APPROVAL_SIGNATURE_INVALID") from error
  used.add(keyid);people.add(pid);roles.add(key["role"])
 if roles!=set(required_roles):
  raise ValueError("067_INDEPENDENT_REQUIRED_SIGNATURES_ABSENT")
 return payload

def read_root():
 root=_private_source(TRUST)
 now=int(time.time())
 if root.get("contract")!="HFT-OPS-A2-067-EXTERNAL-TRUST-ROOT-V1":
  raise ValueError("067_TRUST_ROOT_CONTRACT_INVALID")
 if not _time_int(root.get("revocations_checked_epoch")) or (
  now-root["revocations_checked_epoch"]>300 or
  root["revocations_checked_epoch"]>now+30):
  raise ValueError("067_REVOCATION_REGISTRY_STALE")
 if not isinstance(root.get("keys"),dict) or not root["keys"]:
  raise ValueError("067_TRUST_ROOT_NOT_ENROLLED")
 return root

def head_clean():
 try:
  h=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,
   check=True,text=True).stdout.strip()
  dirty=subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,
   check=True,text=True).stdout.strip()
 except subprocess.CalledProcessError as e:
  raise ValueError("067_GIT_CHECKOUT_UNVERIFIABLE") from e
 if dirty:raise ValueError("067_UNCLEAN_GIT_CHECKOUT")
 return h

def admit(payload,env,allowed_cases):
 if payload.get("approved_source_sha")!=head_clean():
  raise ValueError("067_SOURCE_SHA_NOT_APPROVED")
 if payload.get("repository")!="Anurag-5792/Hubblefly-FacilityOS" or (
  payload.get("branch")!="engineering/hft-r1-stores-foundation"):
  raise ValueError("067_SOURCE_BRANCH_OR_REPOSITORY_NOT_APPROVED")
 digests=payload.get("migration_sha256")
 required=[
  "db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql",
  "db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql",
  "db/security/HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql",
  "db/security/HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql",
  "db/security/HFT-R1-OPS-A2-ACL-CLOSURE-NONEXECUTABLE.sql",
 ]
 if not isinstance(digests,dict) or set(digests)!=set(required):
  raise ValueError("067_MIGRATION_HASH_COVERAGE_INCOMPLETE")
 if any(checksum(ROOT/f)!=digests[f] for f in required):
  raise ValueError("067_MIGRATION_HASH_PIN_MISMATCH")
 if payload.get("server_version_num")!=VERSION:
  raise ValueError("067_PG18_6_EXACT_VERSION_REQUIRED")
 if set(payload.get("permitted_cases",[]))!=set(allowed_cases):
  raise ValueError("067_EXACT_DIAGNOSTIC_OPERATION_ALLOWLIST_REQUIRED")
 for field in ("project_id","project_branch_id","endpoint_attestation_sha256",
               "backup_custody_sha256","independent_witness_evidence_sha256"):
  if not isinstance(payload.get(field),str) or len(payload[field])<20:
   raise ValueError("067_PROTECTED_PROJECT_BACKUP_OR_WITNESS_EVIDENCE_MISSING")
 roles=payload.get("roles",{})
 expected={"qa","fault_constructor","migration_installer",
           "independent_verifier","witness"}
 if set(roles)!=expected or len(set(roles.values()))!=len(expected):
  raise ValueError("067_SEPARATE_TEST_AUTHORITY_NOT_ESTABLISHED")
 if any(r=="hft_r1_posting_owner" for r in roles.values()):
  raise ValueError("067_POSTING_OWNER_CANNOT_BE_QA_AUTHORITY")
 if roles.get("qa")!=env.get("PGUSER") or not re.fullmatch(
  r"hft_r1_(qa|review)_[a-z0-9_]{3,32}",str(env.get("PGUSER",""))):
  raise ValueError("067_WRONG_QA_LOGIN")
 endpoint=payload.get("endpoint",{})
 if not isinstance(endpoint,dict) or set(endpoint)!={
  "host","port","database","sslrootcert_sha256","tls_peer_sha256"}:
  raise ValueError("067_ENDPOINT_ATTESTATION_INCOMPLETE")
 if endpoint["host"]!=env.get("PGHOST") or str(endpoint["port"])!=env.get("PGPORT") or (
  endpoint["database"]!=env.get("PGDATABASE")):
  raise ValueError("067_DB_ENDPOINT_NOT_PINNED")
 if env.get("PGSSLMODE")!="verify-full" or env.get("PGCHANNELBINDING")!="require":
  raise ValueError("067_TLS_OR_CHANNEL_BINDING_UNQUALIFIED")
 if not re.fullmatch(r"hft_r1_disposable_[a-z0-9_]{6,40}",endpoint["database"]):
  raise ValueError("067_NOT_DISPOSABLE_DATABASE")
 cert=Path(env.get("PGSSLROOTCERT",""))
 if not cert.is_file() or checksum(cert)!=endpoint["sslrootcert_sha256"]:
  raise ValueError("067_TLS_CA_HASH_NOT_PINNED")
 if not re.fullmatch(r"[0-9a-f]{64}",str(endpoint["tls_peer_sha256"])):
  raise ValueError("067_TLS_PEER_ATTESTATION_MISSING")
 return True

def verify_fixture(receipt,admission,case_id):
 cat=_catalog()
 c=cat.CASES[case_id]
 if receipt.get("admission_id")!=admission["record_id"] or (
  receipt.get("case_id")!=case_id):
  raise ValueError("067_FIXTURE_ADMISSION_OR_CASE_MISMATCH")
 for field in ("fixture_id","db_project_id","db_branch_id","prestate_sha256",
               "positive_evidence_sha256","adverse_evidence_sha256",
               "independent_witness_sha256","constructor_source_sha256"):
  if not isinstance(receipt.get(field),str) or len(receipt[field])<20:
   raise ValueError("067_FIXTURE_ORIGINAL_INDEPENDENT_EVIDENCE_ABSENT:"+field)
 if receipt["db_project_id"]!=admission["project_id"] or (
  receipt["db_branch_id"]!=admission["project_branch_id"]):
  raise ValueError("067_FIXTURE_TARGET_SUBSTITUTION")
 if not receipt.get("positive_control_committed") or not receipt.get("adverse_established"):
  raise ValueError("067_POSITIVE_OR_GENUINE_ADVERSE_STATE_NOT_PROVEN")
 if set(receipt.get("source_identities",{})) != {
  "command_uuid","source_document_id","source_revision","item_code",
  "product_version","legal_entity_id","site_id","warehouse_id",
  "original_nonce","source_account_id","destination_account_id"}:
  raise ValueError("067_FIXTURE_EXACT_SOURCE_IDENTITIES_MISSING")
 if set(receipt.get("prestate_assertions",[])) != set(c.required_prestate):
  raise ValueError("067_FIXTURE_ADVERSE_PRESTATE_COVERAGE_INCOMPLETE")
 return True

def evidence_complete(result,receipt,c):
 # A mere matching stderr substring or unrelated permission failure cannot
 # make a negative test PASS. Actual error SQLSTATE, control, original
 # transaction, backend, timestamps, immutable poststate and observer receipts
 # are independently required, with ALL pre/post values reconstructed.
 if not isinstance(result,dict) or result.get("fixture_id")!=receipt["fixture_id"]:
  raise ValueError("067_CASE_RESULT_FIXTURE_MISMATCH")
 if result.get("case_id")!=c.id or result.get("sqlstate")!=c.expected_sqlstate and (
  c.expected_sqlstate is not None):
  raise ValueError("067_REAL_SQLSTATE_NOT_OBSERVED")
 if c.expected_negative_code is not None and (
  result.get("protected_rejection")!=c.expected_negative_code):
  raise ValueError("067_UNRELATED_CONTROL_OR_PERMISSION_FAILURE")
 if c.expected_negative_code is not None and (
  result.get("negative_phase")!="DEFERRED_COMMIT" and c.id in {
   "OPS063-F01","OPS063-F02","OPS063-F03"}):
  raise ValueError("067_NOT_A_DEFERRED_COMMIT_FAILURE")
 for k in ("backend_pid","transaction_id","server_version_num",
           "session_user","current_user","started_epoch","finished_epoch",
           "positive_control_evidence","prestate","poststate",
           "independent_reconstruction_sha256","witness_receipt_sha256"):
  if result.get(k) in (None,"",[],{}):
   raise ValueError("067_RESULT_PROVENANCE_ABSENT:"+k)
 if result["server_version_num"]!=VERSION:
  raise ValueError("067_RESULT_WRONG_PG_VERSION")
 if set(result.get("poststate_assertions",[]))!=set(c.required_poststate):
  raise ValueError("067_POSTSTATE_RECONSTRUCTION_NOT_COMPLETE")
 if not result.get("rollback_verified") and c.expected_negative_code:
  raise ValueError("067_ROLLBACK_NOT_INDEPENDENTLY_VERIFIED")
 for fact in ("account_balances","account_versions","source_counters",
              "original_nonce","movement_rows","seal","custody","audit"):
  if fact not in result["prestate"] or fact not in result["poststate"]:
   raise ValueError("067_AUTHORITATIVE_FACT_MISSING:"+fact)
 if c.expected_negative_code and any(result["prestate"][f] != result["poststate"][f]
       for f in ("account_balances","account_versions","source_counters",
                 "original_nonce","movement_rows","seal","custody","audit")):
  raise ValueError("067_NEGATIVE_TRANSACTION_MUTATED_COMMITTED_FACTS")
 # This only marks evidence ready for INDEPENDENT QA, not a release PASS.
 return "EXECUTED_EVIDENCE_PENDING_INDEPENDENT_REVIEW"

def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument("--list",action="store_true")
 p.add_argument("--execute",action="store_true")
 p.add_argument("--admission",type=Path)
 p.add_argument("--fixture-receipts",type=Path)
 args=p.parse_args(argv)
 cat=_catalog()
 if args.list:
  print(json.dumps({"status":"NOT_TESTED","cases":list(cat.CASES),
   "crosswalk":cat.CROSSWALK},indent=2,sort_keys=True))
  return 0
 if not args.execute or not args.admission or not args.fixture_receipts:
  p.error("067_SOURCE_ONLY_OR_INDEPENDENT_ADMISSION_ABSENT")
 try:
  trust=read_root()
  admission=signed_record(args.admission,trust,
   {"technical_authority","independent_security_reviewer"},CONTRACT)
  admit(admission,os.environ,cat.CASES)
  receipts=json.loads(args.fixture_receipts.read_text(encoding="utf8"))
  if set(receipts)!=set(cat.CASES):
   raise ValueError("067_ALL_EIGHT_FIXTURE_RECEIPTS_REQUIRED")
  # Actual PG18 execution is delegated to a SEPARATELY installed, restricted
  # hft_qa067 gateway and independent observer. No QA owner DML or bypass
  # is implemented here. Until those trusted role/endpoint functions are
  # independently qualified, fail closed (no psql, no mutation).
  for cid in cat.CASES:
   record=signed_record(Path(receipts[cid]),trust,
    {"fault_constructor","independent_verifier"},RECEIPT)
   verify_fixture(record,admission,cid)
  raise ValueError("067_DISPOSABLE_FAULT_GATEWAY_AND_INDEPENDENT_OBSERVER_NOT_YET_QUALIFIED")
 except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as e:
  print("OPS067_TECHNICAL_GATE_DENIED:"+str(e),file=sys.stderr)
  return 2
if __name__=="__main__":
 raise SystemExit(main())
