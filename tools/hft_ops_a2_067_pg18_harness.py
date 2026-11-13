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
import socket
import ssl
import stat
import struct
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
           "independent_verifier","witness","positive_posting_actor"}
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
 if tuple(receipt.get("transaction_sequence",[])) != cat.CASE_SEQUENCES[case_id]:
  raise ValueError("067_CASE_TRANSACTION_SEQUENCE_NOT_INDEPENDENTLY_ATTESTED")
 if any(not isinstance(receipt.get(k),str) or len(receipt[k])<8
  for k in ("positive_control_transaction_id",
            "fault_constructor_transaction_id")):
  raise ValueError("067_INDEPENDENT_POSITIVE_AND_ADVERSE_TX_IDENTITIES_ABSENT")
 if any(not isinstance(v,str) for v in receipt["source_identities"].values()):
  raise ValueError("067_SOURCE_IDENTITY_NOT_CANONICAL_TEXT")
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
 if result.get("negative_phase")!=_catalog().CASE_NEGATIVE_PHASE[c.id]:
  raise ValueError("067_WRONG_TEST_CONTROL_OR_TRANSACTION_PHASE")
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

def verify_postgres_tls_peer(admission,env):
 # PostgreSQL STARTTLS/SSLRequest protocol, not HTTPS. The wrapped socket
 # performs normal CA-chain and DNS hostname verification AND the separately
 # signed exact certificate SHA-256 pin check. No SQL or login occurs here.
 endpoint=admission.get("endpoint",{})
 host=endpoint.get("host")
 try:
  port=int(endpoint.get("port"))
  if not isinstance(host,str) or not host or not 1<=port<=65535:
   raise ValueError("067_TLS_PINNED_ENDPOINT_INVALID")
  cert=Path(env["PGSSLROOTCERT"])
  if checksum(cert)!=endpoint["sslrootcert_sha256"]:
   raise ValueError("067_TLS_APPROVED_CA_CHANGED")
  context=ssl.create_default_context(cafile=str(cert))
  context.check_hostname=True
  context.verify_mode=ssl.CERT_REQUIRED
  with socket.create_connection((host,port),timeout=8) as sock:
   sock.sendall(struct.pack("!II",8,80877103))
   if sock.recv(1)!=b"S":
    raise ValueError("067_POSTGRES_SSL_REQUEST_REJECTED")
   with context.wrap_socket(sock,server_hostname=host) as secure:
    certificate=secure.getpeercert(binary_form=True)
    if not certificate or hashlib.sha256(certificate).hexdigest()!=endpoint["tls_peer_sha256"]:
     raise ValueError("067_TLS_PEER_SHA256_NOT_APPROVED")
    if secure.version() not in ("TLSv1.2","TLSv1.3"):
     raise ValueError("067_TLS_PROTOCOL_UNQUALIFIED")
  return True
 except (OSError,ssl.SSLError,ValueError,KeyError,TypeError) as exc:
  raise ValueError("067_PG_ENDPOINT_TLS_IDENTITY_UNVERIFIED") from exc

GATEWAY_IDENTITY_QUERY="""SELECT row_to_json(x)::text FROM (
 SELECT current_database() AS db_name,session_user AS db_login,
 current_user AS db_role,current_setting('server_version_num')::integer AS pg_version,
 inet_server_addr()::text AS backend_ip,inet_server_port() AS backend_port,
 ssl.ssl AS tls_active,ssl.version AS tls_version,
 r.rolsuper AS qa_super,r.rolbypassrls AS qa_bypassrls,
 pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
  AS qa_owner_member,
 pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
  AS qa_issuer_member,
 pg_catalog.pg_has_role(session_user,'hft_r1_fault_constructor','MEMBER')
  AS qa_fault_ctor_member,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.pg_get_functiondef(
   pg_catalog.to_regprocedure('hft_qa067.exercise_case_v1(text,uuid)')),
  'UTF8')),'hex') AS exercise_sha256,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.pg_get_functiondef(
   pg_catalog.to_regprocedure('hft_qa067.observe_case_v1(text,uuid)')),
  'UTF8')),'hex') AS observe_sha256
 FROM pg_catalog.pg_roles r
 JOIN pg_catalog.pg_stat_ssl ssl ON ssl.pid=pg_catalog.pg_backend_pid()
 WHERE r.rolname=session_user
 ) AS x;"""
# Exact observer operations only: the identity inspector above, or one
# catalog-bound gateway call. PostgreSQL grants remain authoritative.
_GATEWAY_SELECT = re.compile(
 r"SELECT pg_catalog\\.row_to_json\\(v\\)::text FROM \\("
 r"SELECT hft_qa067\\.(exercise_case_v1|observe_case_v1)\\("
 r"'(OPS063-F0[1-8])'::text,"
 r"'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'::uuid\\)"
 r" AS evidence\\) AS v;"
)

def _observer_query_allowed(sql):
 if sql==GATEWAY_IDENTITY_QUERY:
  return True
 match=_GATEWAY_SELECT.fullmatch(sql)
 return bool(match and match.group(2) in _catalog().CASES)

def _qa_sql(env,sql):
 # The QA login may SELECT only prequalified observer and narrow disposable
 # gateway functions; it must never run raw UPDATE/DDL or CREATE credentials.
 if not _observer_query_allowed(sql):
  raise ValueError("067_QA_SQL_NOT_IN_EXACT_OBSERVER_ALLOWLIST")
 argv=["psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1"]
 result=subprocess.run(argv,input=sql,text=True,capture_output=True,
                       env=env,check=False)
 if result.returncode!=0:
  # A permission error, missing gateway, or unrelated SQLSTATE is NEVER PASS.
  raise ValueError("067_POSTGRES_OBSERVER_OR_GATEWAY_FAILED_NOT_PASS")
 raw=result.stdout.strip()
 if not raw or "\n" in raw:
  raise ValueError("067_DATABASE_RESPONSE_NON_SINGULAR")
 try:
  return json.loads(raw)
 except json.JSONDecodeError as e:
  raise ValueError("067_DATABASE_RESPONSE_NOT_CANONICAL_JSON") from e

def qualify_live_gateway(admission,env):
 # This can be called only AFTER pinned independent technical admission.
 # It NEVER installs hft_qa067 functions or grants.
 expected=admission.get("qualified_gateway",{})
 if not isinstance(expected,dict) or set(expected)!={
  "exercise_sha256","observe_sha256","installer_evidence_sha256",
  "isolation_boundary_evidence_sha256"} or any(
   not re.fullmatch("[0-9a-f]{64}",str(v)) for v in expected.values()):
  raise ValueError("067_PROTECTED_GATEWAY_EXACT_SOURCE_NOT_ADMITTED")
 sql=GATEWAY_IDENTITY_QUERY
 result=_qa_sql(env,sql)
 endpoint=admission["endpoint"]
 if result.get("db_name")!=endpoint["database"] or (
  result.get("db_login")!=admission["roles"]["qa"]) or (
  result.get("db_role")!=result.get("db_login")) or (
  result.get("pg_version")!=VERSION) or not result.get("tls_active") or (
  result.get("qa_super")) or result.get("qa_bypassrls") or (
  result.get("qa_owner_member")) or result.get("qa_issuer_member") or (
  result.get("qa_fault_ctor_member")) or (
  result.get("backend_port")!=endpoint["port"]):
  raise ValueError("067_LIVE_PG18_QA_TLS_ROLE_OR_SERVER_BOUNDARY_DENIED")
 if result.get("exercise_sha256")!=expected["exercise_sha256"] or (
  result.get("observe_sha256")!=expected["observe_sha256"]):
  raise ValueError("067_LIVE_GATEWAY_FUNCTION_SHA_MISMATCH")
 return result

def _fixture_id(value):
 if not isinstance(value,str) or not re.fullmatch(
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",value):
  raise ValueError("067_EXACT_UUID_FIXTURE_REQUIRED")
 return value

def _call_gateway(case,fixture,env,execute):
 # Input is ONLY one canonical catalog ID and one validated fixture UUID,
 # never a browser-supplied SQL fragment, condition or table identifier.
 if case not in _catalog().CASES:
  raise ValueError("067_UNKNOWN_DIAGNOSTIC_CASE")
 identity=_fixture_id(fixture)
 function="exercise_case_v1" if execute else "observe_case_v1"
 return _qa_sql(env,(
  "SELECT pg_catalog.row_to_json(v)::text FROM ("
  f"SELECT hft_qa067.{function}('{case}'::text,"
  f"'{identity}'::uuid) AS evidence) AS v;"))

def verify_independent_results(result_envelopes,trust,admission,receipts):
 # All independent post-observation receipts must be signed by a qualified
 # verifier AND separate human witness. Nothing self-certifies Gate A.
 cat=_catalog();results={}
 if set(result_envelopes)!=set(cat.CASES):
  raise ValueError("067_ALL_EIGHT_INDEPENDENT_RESULT_RECEIPTS_REQUIRED")
 for name,c in cat.CASES.items():
  proof=signed_record(result_envelopes[name],trust,
   {"independent_verifier","witness"}, "HFT-OPS-A2-067-INDEPENDENT-CASE-EVIDENCE-V1")
  if proof.get("admission_id")!=admission["record_id"]:
   raise ValueError("067_RESULT_ADMISSION_MISMATCH")
  results[name]=evidence_complete(proof,receipts[name],c)
 return results

def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument("--list",action="store_true")
 p.add_argument("--execute",action="store_true")
 p.add_argument("--admission",type=Path)
 p.add_argument("--fixture-receipts",type=Path)
 p.add_argument("--verify-results",type=Path,
  help="independently signed poststate receipts; never self-certifies")
 args=p.parse_args(argv)
 cat=_catalog()
 if args.list:
  print(json.dumps({"status":"NOT_TESTED","cases":list(cat.CASES),
   "crosswalk":cat.CROSSWALK,
   "case_sequences":cat.CASE_SEQUENCES,
   "separate_authorities":cat.CASE_AUTHORITIES},indent=2,sort_keys=True))
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
  verified={}
  for cid in cat.CASES:
   record=signed_record(Path(receipts[cid]),trust,
    {"fault_constructor","independent_verifier"},RECEIPT)
   verify_fixture(record,admission,cid)
   verified[cid]=record
  if args.verify_results is not None:
   paths=json.loads(args.verify_results.read_text(encoding="utf8"))
   results=verify_independent_results(paths,trust,admission,verified)
   print(json.dumps({"status":"EXECUTED_EVIDENCE_PENDING_INDEPENDENT_REVIEW",
    "results":results,"all_postgres_gate_results":"NOT_ACCEPTED"},sort_keys=True))
   return 0
  verify_postgres_tls_peer(admission,os.environ)
  qualify_live_gateway(admission,os.environ)
  for cid,receipt in verified.items():
   before=_call_gateway(cid,receipt["fixture_id"],os.environ,False)
   if before.get("evidence",{}).get("prestate_sha256")!=receipt["prestate_sha256"] or (
    before.get("evidence",{}).get("positive_control_committed") is not True) or (
    before.get("evidence",{}).get("adverse_established") is not True):
    raise ValueError("067_ACTUAL_ADVERSE_PRESTATE_OR_POSITIVE_CONTROL_MISSING")
   outcome=_call_gateway(cid,receipt["fixture_id"],os.environ,True)
   after=_call_gateway(cid,receipt["fixture_id"],os.environ,False)
   print(json.dumps({"case":cid,"status":"EXECUTED_UNVERIFIED_NO_PASS",
    "fixture_id":receipt["fixture_id"],"gateway_result":outcome,
    "post_observation":after,
    "next":"INDEPENDENT_SIGNED_RECONSTRUCTION_AND_HUMAN_WITNESS_REQUIRED"},
    sort_keys=True))
  return 3
 except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as e:
  print("OPS067_TECHNICAL_GATE_DENIED:"+str(e),file=sys.stderr)
  return 2
if __name__=="__main__":
 raise SystemExit(main())
