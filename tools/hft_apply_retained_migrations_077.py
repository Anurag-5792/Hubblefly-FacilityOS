#!/usr/bin/env python3
"""HF13 R77 retained PG18.7 canonical migrations. Review candidate, NOT admitted.

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

from hft_apply_migrations import revisions, build_locked_statement

ROOT = Path(__file__).resolve().parents[1]
HOST = "ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech"
DB = "hft_r1_retained_masters_np077"
ROLE = "hft_engineering"
PROJECT = "wandering-cake-50222227"
BRANCH = "br-shiny-night-b3qgsj8t"
ENDPOINT = "ep-hidden-fire-b324s21q"
PIN_SOURCE = "5fe71565a2b0343ffd4a2ec5a25be5e0dfce27cc"
MANIFEST_HASH = "ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355"
VERSION = "180007"
HEX64 = re.compile(r"[0-9a-f]{64}\Z")

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def canonical():
    manifest = ROOT / "db" / "migrations" / "manifest.v1.json"
    if sha(manifest.read_bytes()) != MANIFEST_HASH:
        raise RuntimeError("CANONICAL_MANIFEST_DIGEST_DRIFT")
    plan = revisions()  # Canonical original checksum/provenance validation.
    if len(plan) != 6:
        raise RuntimeError("CANONICAL_SIX_REQUIRED")
    return plan

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

def approve_admission(path: str):
    # This *does not authenticate corporate approval*. A separate trusted
    # reviewer must attest exact file SHA and countersign this admission.
    p = Path(path)
    if not p.is_absolute() or not p.is_file() or p.is_symlink():
        raise RuntimeError("EXTERNAL_ADMISSION_RECORD_REQUIRED")
    record = json.loads(p.read_text(encoding="utf-8"))
    mandatory = {
        "technical_status": "APPROVED",
        "resource_project_id": PROJECT,
        "resource_branch_id": BRANCH,
        "resource_database": DB,
        "resource_endpoint_id": ENDPOINT,
        "source_sha": PIN_SOURCE,
        "manifest_sha256": MANIFEST_HASH,
    }
    if any(record.get(k) != v for k, v in mandatory.items()):
        raise RuntimeError("ADMISSION_RECORD_SCOPE_OR_SHA_INVALID")
    if not record.get("independent_reviewer") or not record.get("approved_backup_sha256"):
        raise RuntimeError("INDEPENDENT_REVIEW_AND_RECOVERABLE_BASELINE_REQUIRED")
    if not HEX64.fullmatch(str(record["approved_backup_sha256"])):
        raise RuntimeError("BACKUP_SHA256_INVALID")
    b = Path(record.get("approved_backup_path", ""))
    if not b.is_absolute() or not b.is_file() or b.is_symlink():
        raise RuntimeError("BASELINE_FILE_NOT_AVAILABLE")
    if sha(b.read_bytes()) != record["approved_backup_sha256"]:
        raise RuntimeError("BACKUP_BYTES_DO_NOT_MATCH_REVIEW")
    # A signed external approval and independent restore are STILL mandatory.

def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--inspect", action="store_true")
    cli.add_argument("--preflight", action="store_true")
    cli.add_argument("--apply", action="store_true")
    cli.add_argument("--admission-file")
    args = cli.parse_args()
    if sum(bool(x) for x in [args.inspect, args.preflight, args.apply]) != 1:
        raise RuntimeError("EXACTLY_ONE_OPERATION_REQUIRED")
    plan = canonical()
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
    print("CANONICAL_SIX_INSTALLED_ONLY; P3/ROLES/KEYS/OWNER_DATA_NOT_AUTHORIZED")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("HFT_RETAINED_INSTALL_STOP=" + str(exc), file=sys.stderr)
        sys.exit(1)
