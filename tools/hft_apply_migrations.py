#!/usr/bin/env python3
"""HFT R1 isolated PostgreSQL forward-only migrator. Requires external psql and test DB."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "db" / "migrations"
# The manifest is the ONLY executable discovery authority for all environments.
# Rejected historical revisions live outside SQL_DIR and cannot execute.
MANIFEST = SQL_DIR / "manifest.v1.json"
PROVENANCE_0005 = ROOT / "db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql"
LEGACY_0005_SHA256 = "8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e"
PATTERN = re.compile(r"^([0-9]{4})_hft_[a-z0-9_]+\.sql$")
WRAPPER = re.compile(r"\A(?:\s*--[^\n]*\n)*\s*BEGIN;\s*(.*?)\s*COMMIT;\s*\Z", re.S)

def validate_environment(env: dict[str, str]) -> tuple[str, str]:
    if env.get("NODE_ENV") == "production" or env.get("HFT_ENVIRONMENT") == "production":
        raise RuntimeError("PRODUCTION_ENVIRONMENT_FORBIDDEN")
    if env.get("HFT_ENVIRONMENT") not in ("development", "test"):
        raise RuntimeError("EXPLICIT_ISOLATED_ENVIRONMENT_REQUIRED")
    if env.get("HFT_AUTH_SOURCE") != "verified":
        raise RuntimeError("VERIFIED_AUTH_SOURCE_REQUIRED")
    if env.get("HFT_OPERATIONS_SOURCE") in ("preview", "sample"):
        raise RuntimeError("SAMPLE_OPERATIONS_SOURCE_REJECTED")
    if env.get("HFT_LIVE_POSTING_ENABLED") != "false":
        raise RuntimeError("LIVE_POSTING_NOT_EXPLICITLY_DISABLED")
    if env.get("HFT_POSTING_RUN_MODE") != "ISOLATED_DB_TEST":
        raise RuntimeError("ISOLATED_DATABASE_GATE_REQUIRED")
    db = env.get("HFT_TEST_PG_DATABASE", "")
    if not re.fullmatch(r"hft_r1_disposable_[a-z0-9_]{6,40}", db) or env.get("PGDATABASE") != db:
        raise RuntimeError("DISPOSABLE_DATABASE_IDENTITY_INVALID")
    if env.get("PGHOST") not in ("localhost", "127.0.0.1", "::1") or env.get("PGUSER") != "hft_engineering":
        raise RuntimeError("POSTGRES_HOST_OR_ROLE_NOT_AUTHORIZED")
    if shutil.which("psql") is None:
        raise RuntimeError("PSQL_TOOL_NOT_AVAILABLE")
    return db, env["PGUSER"]


def revisions() -> list[tuple[int, Path, str, str]]:
    """One pinned, ordered manifest; reject extra/duplicate/executable SQL and drift."""
    if not MANIFEST.is_file() or MANIFEST.is_symlink():
        raise RuntimeError("CANONICAL_MIGRATION_MANIFEST_MISSING")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or set(manifest) != {
        "schema", "mode", "minimum_postgresql_major", "executable_directory",
        "migrations", "incompatible_provenance"
    } or manifest["schema"] != "HFT_R1_CANONICAL_MIGRATION_MANIFEST_V1" or (
        manifest["mode"] != "ISOLATED_NONPRODUCTION"
        or manifest["minimum_postgresql_major"] != 15
        or manifest["executable_directory"] != "db/migrations"
    ):
        raise RuntimeError("CANONICAL_MIGRATION_MANIFEST_FORMAT_INVALID")
    entries = manifest["migrations"]
    if not isinstance(entries, list) or len(entries) != 6:
        raise RuntimeError("MANIFEST_EXACT_MIGRATION_COUNT_REQUIRED")
    found = []
    expected_files = set()
    for version, item in enumerate(entries, 1):
        if not isinstance(item, dict) or set(item) != {"version", "file", "sha256"}:
            raise RuntimeError("MANIFEST_ENTRY_INVALID")
        name, digest = item["file"], item["sha256"]
        match = PATTERN.fullmatch(name) if isinstance(name, str) else None
        if item["version"] != version or not match or int(match.group(1)) != version:
            raise RuntimeError(f"MANIFEST_SEQUENCE_OR_FILE_INVALID:{version}")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise RuntimeError("MANIFEST_DIGEST_FORMAT_INVALID")
        if name in expected_files:
            raise RuntimeError("DUPLICATE_EXECUTABLE_MIGRATION")
        expected_files.add(name)
        path = SQL_DIR / name
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f"CANONICAL_MIGRATION_MISSING:{name}")
        raw = path.read_bytes()
        actual = hashlib.sha256(raw).hexdigest()
        if actual != digest:
            raise RuntimeError(f"CANONICAL_MIGRATION_SHA256_DRIFT:{version}")
        sql = raw.decode("utf-8")
        wrapper = WRAPPER.fullmatch(sql)
        if not wrapper:
            raise RuntimeError(f"MIGRATION_TRANSACTION_WRAPPER_INVALID:{name}")
        found.append((version, path, actual, wrapper.group(1)))
    discovered = {p.name for p in SQL_DIR.rglob("*") if p.is_file() and p.name.lower().endswith(".sql")}
    if discovered != expected_files or len(list(SQL_DIR.rglob("*_hft_*.sql"))) != len(expected_files):
        raise RuntimeError("UNEXPECTED_OR_DUPLICATE_EXECUTABLE_MIGRATION")
    archive = manifest["incompatible_provenance"]
    if (not isinstance(archive, list) or len(archive) != 1
        or archive[0] != {
            "version": 5,
            "file": "db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql",
            "sha256": LEGACY_0005_SHA256,
            "execution": "PROHIBITED",
            "applied_database_policy": "STOP_REQUIRES_SEPARATE_AUTHORIZED_FORWARD_MIGRATION"
        }):
        raise RuntimeError("PROVENANCE_ARCHIVE_MANIFEST_INVALID")
    if (not PROVENANCE_0005.is_file() or PROVENANCE_0005.is_symlink()
        or hashlib.sha256(PROVENANCE_0005.read_bytes()).hexdigest() != LEGACY_0005_SHA256):
        raise RuntimeError("INCOMPATIBLE_REVISION_PROVENANCE_DRIFT")
    forbidden = ROOT / "db/migration_candidates"
    if forbidden.exists() and any(
        x.is_file() and x.name.lower().endswith(".sql") for x in forbidden.rglob("*")
    ):
        raise RuntimeError("PARALLEL_MIGRATION_CANDIDATE_PROHIBITED")
    return found


def verify_database_revision_ledger(env: dict[str, str],
                                    plan: list[tuple[int, Path, str, str]]) -> None:
    """Refuse unknown, incompatible or gapped applied revisions before any DDL."""
    if execute_sql("SELECT to_regclass('hft.schema_revision') IS NOT NULL;", env) != "t":
        return
    recorded = execute_sql(
        "SELECT version::text || '|' || sha256 FROM hft.schema_revision ORDER BY version;", env
    )
    for expected, line in enumerate(recorded.splitlines(), 1):
        parts = line.split("|")
        if len(parts) != 2 or not parts[0].isdigit():
            raise RuntimeError("DATABASE_REVISION_LEDGER_MALFORMED")
        version = int(parts[0])
        if version != expected or version > len(plan):
            raise RuntimeError("DATABASE_REVISION_GAP_OR_UNDECLARED_VERSION")
        if version == 5 and parts[1] == LEGACY_0005_SHA256:
            raise RuntimeError("APPLIED_LEGACY_0005_REQUIRES_SEPARATE_FORWARD_MIGRATION")
        if parts[1] != plan[version - 1][2]:
            raise RuntimeError(f"MIGRATION_CHECKSUM_MISMATCH:{version}")

def execute_sql(sql: str, env: dict[str, str]) -> str:
    # Password stays in libpq environment/credential store, never argv, logs, or output.
    process = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"],
                             input=sql, text=True, capture_output=True, env=env, check=False)
    if process.returncode:
        # Do not print arbitrary server errors which may contain sensitive SQL/data.
        raise RuntimeError(f"PSQL_SQL_EXECUTION_FAILED:exit={process.returncode}")
    return process.stdout.strip()



def build_locked_statement(version: int, sha: str, ddl: str,
                           plan: list[tuple[int, Path, str, str]]) -> str:
    """Recheck revision state *inside* advisory-locked transaction.

    A simultaneous migrator must fail without running duplicate DDL. This is a
    fail-closed conflict, never treated as an automatically successful migration.
    """
    if not (1 <= version <= len(plan)) or plan[version - 1][0] != version or plan[version - 1][2] != sha:
        raise RuntimeError("MIGRATION_SOURCE_REVISION_MISMATCH")
    if version == 1:
        guard = ("DO $$ BEGIN IF to_regclass('hft.schema_revision') IS NOT NULL "
                 "THEN RAISE EXCEPTION 'MIGRATION_0001_CONFLICT'; END IF; END $$;\n")
    else:
        prior_sha = plan[version - 2][2]
        guard = ("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM hft.schema_revision WHERE version="
                 f"{version - 1} AND sha256='{prior_sha}') "
                 "THEN RAISE EXCEPTION 'PRIOR_MIGRATION_MISSING_OR_MISMATCHED'; END IF; "
                 "IF EXISTS (SELECT 1 FROM hft.schema_revision WHERE version="
                 f"{version}) THEN RAISE EXCEPTION 'MIGRATION_CONCURRENTLY_APPLIED'; END IF; END $$;\n")
    return ("BEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:MIGRATIONS',0));\n"
            + guard + ddl + "\nINSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES ("
            + str(version) + ", '" + sha + "', current_user);\nCOMMIT;")


def run() -> None:
    env = dict(os.environ)
    db, role = validate_environment(env)
    plan = revisions()
    actual = execute_sql("SELECT current_database()||'|'||current_user||'|'||"
                         "current_setting('server_version_num')||'|'||"
                         "(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)::text;", env)
    fields = actual.split("|")
    if len(fields) != 4 or fields[0] != db or fields[1] != role or int(fields[2]) < 150000 or fields[3] != "false":
        raise RuntimeError("POSTGRES_IDENTITY_VERSION_OR_PRIVILEGE_MISMATCH")
    print(f"POSTGRES_VERSION_NUM={fields[2]} DB_IDENTITY_VERIFIED=true SUPERUSER=false")
    verify_database_revision_ledger(env, plan)
    for version, path, sha, ddl in plan:
        # A single database transaction covers DDL, checksum verification and revision recording.
        # Revision check and advisory lock occur inside the *same* transaction.
        table_exists = execute_sql("SELECT to_regclass('hft.schema_revision') IS NOT NULL;", env)
        exists = (execute_sql(f"SELECT COALESCE((SELECT sha256 FROM hft.schema_revision WHERE version={version}), '');", env)
                  if table_exists == "t" else "")
        if exists:
            if exists != sha:
                raise RuntimeError(f"MIGRATION_CHECKSUM_MISMATCH:{version}")
            print(f"MIGRATION_{version:04d}=EXISTING_VALIDATED sha256={sha}")
            continue
        statement = build_locked_statement(version, sha, ddl, plan)
        execute_sql(statement, env)
        print(f"MIGRATION_{version:04d}=APPLIED sha256={sha}")
    print("MIGRATION_SEQUENCE_COMPLETE=TRUE (database schema only; no production authority)")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--verify-manifest"]:
            plan = revisions()
            for version, path, digest, _ in plan:
                print(f"MIGRATION_{version:04d}=CANONICAL_VALIDATED file={path.name} sha256={digest}")
            print("MANIFEST_ONLY_VALIDATED_NO_DATABASE_EXECUTION")
        elif len(sys.argv) == 1:
            run()
        else:
            raise RuntimeError("UNSUPPORTED_MIGRATION_RUNNER_ARGUMENTS")
    except Exception as exc:
        print(f"HFT_R1_MIGRATION_STOP={str(exc)}", file=sys.stderr)
        raise SystemExit(1)
