#!/usr/bin/env python3
"""HF13 Stores PG18.7 canonical migrations. Review candidate, NOT admitted.

This is a separate remote transport. It does not change the canonical
disposable-loopback tools/hft_apply_migrations.py. --inspect is OFFLINE.
--preflight reads one authenticated TLS SQL session. --apply IS PROTECTED DDL:
never invoke without separate signed installation/role and backup approval.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

import importlib.util

ROOT = Path(__file__).resolve().parents[1]
HOST = "ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech"
DB = "hft_r1_retained_masters_np077"
ROLE = "hft_engineering"
PROJECT = "wandering-cake-50222227"
BRANCH = "br-shiny-night-b3qgsj8t"
ENDPOINT = "ep-hidden-fire-b324s21q"
PIN_SOURCE = "3a1c4bc2737cfa478eee21ab8a6e4a832999fe9a"
MANIFEST_HASH = "ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355"
VERSION = "180007"
HELPER_SHA256 = "3cc1e19e2e72ad2a4f30c24285707e9331063cdb9fa45a3c59c7e3ba202b6e91"
STORES_MANIFEST_SHA256 = "a4817073266cca12a536142876903a9f81265d35375ddb94d0ba1c03577bbf8d"
# MUST be replaced ONLY by a separately reviewed new source commit after Chat 10
# independently enrolls the authentic technical-review Ed25519 public key.
# Unassigned = guaranteed fail-closed --apply; never use an arbitrary env pin.
TECHNICAL_REVIEWER_PUBKEY_SHA256 = ""
HEX64 = re.compile(r"[0-9a-f]{64}\Z")

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def canonical():
    manifest = ROOT / "db" / "migrations" / "manifest.v1.json"
    stores = ROOT / "review-candidates" / "hf13-077-stores-pg187" / "manifest.EXECUTION-REVIEW.json"
    helper = ROOT / "tools" / "hft_apply_migrations.py"
    if sha(manifest.read_bytes()) != MANIFEST_HASH:
        raise RuntimeError("CANONICAL_MANIFEST_DIGEST_DRIFT")
    if not stores.is_file() or stores.is_symlink() or sha(stores.read_bytes()) != STORES_MANIFEST_SHA256:
        raise RuntimeError("STORES_INSTALLER_MANIFEST_DRIFT")
    if not helper.is_file() or helper.is_symlink() or sha(helper.read_bytes()) != HELPER_SHA256:
        raise RuntimeError("CANONICAL_HELPER_SOURCE_DRIFT")
    spec = importlib.util.spec_from_file_location("hft_pinned_migrator", helper)
    if not spec or not spec.loader:
        raise RuntimeError("CANONICAL_HELPER_IMPORT_FAILURE")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    plan = module.revisions()  # Original migration SHA/provenance validation.
    if len(plan) != 6:
        raise RuntimeError("CANONICAL_SIX_REQUIRED")
    return plan, module.build_locked_statement

def trusted_transport():
    env = os.environ
    if shutil.which("psql") is None:
        raise RuntimeError("PSQL_REQUIRED")
    if any(env.get(k) for k in (
        "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS",
        "PGTARGETSESSIONATTRS", "PGPASSFILE", "DATABASE_URL",
        "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING",
        "PGSSLCERT", "PGSSLKEY"
    )):
        raise RuntimeError("AMBIENT_DATABASE_ROUTING_FORBIDDEN")
    for k, value in {
        "PGHOST": HOST, "PGPORT": "5432", "PGDATABASE": DB, "PGUSER": ROLE,
        "PGSSLMODE": "verify-full", "PGCHANNELBINDING": "require",
        "HFT_APPROVED_PROJECT_ID": PROJECT, "HFT_APPROVED_BRANCH_ID": BRANCH,
        "HFT_APPROVED_ENDPOINT_ID": ENDPOINT,
        "HFT_APPROVED_SOURCE_SHA": PIN_SOURCE,
        "HFT_APPROVED_PG_SERVER_VERSION_NUM": VERSION,
    }.items():
        if env.get(k) != value:
            raise RuntimeError("RETAINED_EXACT_RESOURCE_OR_TLS_GUARD:" + k)
    ca = env.get("PGSSLROOTCERT", "")
    if not ca or not os.path.isabs(ca):
        raise RuntimeError("ABSOLUTE_APPROVED_CA_REQUIRED")
    p = Path(ca)
    if not p.is_file() or p.is_symlink() or p.stat().st_size == 0:
        raise RuntimeError("APPROVED_CA_FILE_MISSING")
    if not env.get("PGPASSWORD") or len(env["PGPASSWORD"]) < 16:
        raise RuntimeError("MANAGED_INSTALLER_CREDENTIAL_MISSING")
    keep = {
        "PATH": env.get("PATH", "/usr/bin:/bin"),
        "HOME": env.get("HOME", "/nonexistent"),
        "LANG": "C.UTF-8",
        "PGHOST": HOST, "PGPORT": "5432", "PGDATABASE": DB, "PGUSER": ROLE,
        "PGSSLMODE": "verify-full", "PGCHANNELBINDING": "require",
        "PGSSLROOTCERT": ca, "PGPASSWORD": env["PGPASSWORD"],
        "PGCONNECT_TIMEOUT": "10", "PGAPPNAME": "hf13-retained-077-migration",
    }
    return keep

def query(sql: str, transport: dict[str, str]) -> str:
    proc = subprocess.run(
        ["psql", "-X", "-w", "-A", "-t", "-q", "-P", "pager=off",
         "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", "5432",
         "-U", ROLE, "-d", DB],
        input=sql, capture_output=True, text=True, env=transport,
        timeout=90, check=False)
    if proc.returncode:
        # Never echo SQL errors, credentials, signed payloads or server logs.
        raise RuntimeError("REMOTE_SQL_FAILURE_NO_AUTOMATIC_RETRY:exit=" + str(proc.returncode))
    return proc.stdout.strip()

IDENTITY = """
SELECT current_database()||'|'||session_user||'|'||current_user||'|'||
 current_setting('server_version_num')||'|'||
 (SELECT rolsuper::text||':'||rolcreaterole::text||':'||
         rolbypassrls::text FROM pg_roles WHERE rolname=current_user)||'|'||
 COALESCE((SELECT ssl::text||':'||version||':'||cipher
  FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'missing')||'|'||
 pg_is_in_recovery()::text;
"""

def verify_identity(transport):
    fields = query(IDENTITY, transport).split("|")
    if (len(fields) != 7 or fields[0] != DB
            or fields[1] != ROLE or fields[2] != ROLE
            or fields[3] != VERSION or fields[4] != "false:false:false"
            or not (fields[5].startswith("true:TLSv1.2:")
                    or fields[5].startswith("true:TLSv1.3:"))
            or fields[6] != "false"):
        raise RuntimeError("REMOTE_TLS_SESSION_ROLE_OR_PG187_NOT_QUALIFIED")
    print("RETAINED_REMOTE_SESSION_ATTESTED: PG18.7 TLS_SESSION=true "
          "CLIENT_TLS=verify-full CHANNEL_BINDING=require LOGIN=hft_engineering")

def verify_ledger(plan, transport):
    exists = query("SELECT to_regclass('hft.schema_revision') IS NOT NULL;", transport)
    if exists not in ("t", "f"):
        raise RuntimeError("REVISION_CATALOG_INVALID")
    if exists == "f":
        if query("SELECT to_regnamespace('hft') IS NOT NULL;", transport) != "f":
            raise RuntimeError("UNTRACKED_HFT_SCHEMA_DENIED")
        return []
    rows = query("SELECT version::text||':'||sha256 FROM hft.schema_revision ORDER BY version", transport)
    applied = rows.splitlines() if rows else []
    for i, row in enumerate(applied):
        if i >= 6 or row != f"{i+1}:{plan[i][2]}":
            raise RuntimeError("APPLIED_REVISION_SEQUENCE_OR_SHA_INVALID")
    return applied

def checked_file(path: str, label: str) -> Path:
    p = Path(path)
    if not p.is_absolute() or not p.is_file() or p.is_symlink():
        raise RuntimeError(label + "_MISSING_OR_UNTRUSTED")
    return p

def checked_backup(path: str, digest: str, label: str) -> None:
    if not HEX64.fullmatch(digest):
        raise RuntimeError(label + "_DIGEST_INVALID")
    p = checked_file(path, label)
    hasher = hashlib.sha256()
    with p.open("rb") as stream:
        for piece in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(piece)
    if hasher.hexdigest() != digest:
        raise RuntimeError(label + "_BYTES_MISMATCH")

def approve_admission(path: str):
    # A local JSON name/status is NEVER sufficient permission for SQL DDL.
    # Verify a detached Ed25519 signature using an independently PINNED key.
    if not HEX64.fullmatch(TECHNICAL_REVIEWER_PUBKEY_SHA256):
        raise RuntimeError("INDEPENDENT_SIGNER_TRUST_ROOT_NOT_ENROLLED_NO_APPLY")
    p = checked_file(path, "SIGNED_TECHNICAL_ADMISSION")
    key = checked_file(os.environ.get("HFT_TECH_ADMISSION_PUBLIC_KEY_FILE", ""),
                       "ADMISSION_PUBLIC_KEY")
    signature = checked_file(os.environ.get("HFT_TECH_ADMISSION_SIGNATURE_FILE", ""),
                             "ADMISSION_DETACHED_SIGNATURE")
    if sha(key.read_bytes()) != TECHNICAL_REVIEWER_PUBKEY_SHA256:
        raise RuntimeError("ADMISSION_PUBLIC_KEY_TRUST_ROOT_MISMATCH")
    openssl = shutil.which("openssl")
    if not openssl:
        raise RuntimeError("OPENSSL_ED25519_SIGNATURE_VERIFIER_REQUIRED")
    signed = subprocess.run([
        openssl, "pkeyutl", "-verify", "-pubin", "-inkey", str(key),
        "-rawin", "-in", str(p), "-sigfile", str(signature)
    ], capture_output=True, check=False, timeout=10)
    if signed.returncode != 0:
        raise RuntimeError("SIGNED_TECHNICAL_ADMISSION_VERIFICATION_FAILED")
    record = json.loads(p.read_text(encoding="utf-8"))
    mandatory = {
        "technical_status": "APPROVED",
        "resource_project_id": PROJECT,
        "resource_branch_id": BRANCH,
        "resource_database": DB,
        "resource_endpoint_id": ENDPOINT,
        "source_sha": PIN_SOURCE,
        "manifest_sha256": MANIFEST_HASH,
        "stores_manifest_sha256": STORES_MANIFEST_SHA256,
        "resource_purpose": "NONPRODUCTION_OPERATIONAL_STORES",
        "canonical_helper_sha256": HELPER_SHA256,
        "remote_runner_sha256": sha(Path(__file__).read_bytes()),
        "pg_version_num": VERSION,
        "authorized_action": "STORES_CANONICAL_0001_0006_ONLY",
    }
    if any(record.get(k) != v for k, v in mandatory.items()):
        raise RuntimeError("SIGNED_ADMISSION_RESOURCE_ACTION_OR_SOURCE_MISMATCH")
    if not record.get("independent_reviewer") or not record.get("independent_restore_witness"):
        raise RuntimeError("INDEPENDENT_INSTALL_AND_RESTORE_ATTESTATION_REQUIRED")
    checked_backup(record.get("approved_backup_path", ""),
                   record.get("approved_backup_sha256", ""), "BASELINE_BACKUP")
    checked_backup(record.get("restore_evidence_path", ""),
                   record.get("restore_evidence_sha256", ""), "RESTORE_EVIDENCE")
    # Canonical SQL is the ONLY authorized action here; this signed admission
    # cannot bootstrap corporate scope, create roles/keys, or activate P3.

def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--inspect", action="store_true")
    cli.add_argument("--preflight", action="store_true")
    cli.add_argument("--apply", action="store_true")
    cli.add_argument("--admission-file")
    args = cli.parse_args()
    if sum(bool(x) for x in [args.inspect, args.preflight, args.apply]) != 1:
        raise RuntimeError("EXACTLY_ONE_OPERATION_REQUIRED")
    plan, build_locked_statement = canonical()
    if args.inspect:
        print("MANIFEST_VALIDATED_NO_DATABASE_CONNECTION")
        for ver, path, digest, _ in plan:
            print(f"000{ver} {path.name} SHA256={digest}")
        return
    transport = trusted_transport()
    verify_identity(transport)
    state = verify_ledger(plan, transport)
    if args.preflight:
        print(f"READ_ONLY_PREFLIGHT_OK revisions={len(state)}; NO_SQL_MUTATION")
        return
    if not args.admission_file:
        raise RuntimeError("TECHNICAL_ADMISSION_MISSING_APPLY_FORBIDDEN")
    approve_admission(args.admission_file)
    for ver, path, digest, body in plan:
        if ver <= len(state):
            continue
        if ver != len(state) + 1:
            raise RuntimeError("REVISION_GAP_NO_AUTOMATIC_REPAIR")
        statement = build_locked_statement(ver, digest, body, plan)
        query(statement, transport)  # One serializable transactional DDL revision.
        state = verify_ledger(plan, transport)
        if len(state) != ver:
            raise RuntimeError("COMMIT_OR_READBACK_UNCERTAIN_NO_RETRY")
        print(f"REVISION_{ver:04d}=COMMITTED_AND_READ_BACK SHA256={digest}")
    print("CANONICAL_SIX_ONLY; STORES_P2_P0_OPS_A2_ROLES_KEYS_NOT_INSTALLED_BY_THIS_ACTION")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("HFT_RETAINED_INSTALL_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
