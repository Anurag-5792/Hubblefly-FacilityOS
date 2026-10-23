#!/usr/bin/env python3
"""HFT R1 isolated PostgreSQL forward-only migrator. Requires external psql and test DB."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "db" / "migrations"
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
    files = sorted(SQL_DIR.glob("*.sql"))
    if not files:
        raise RuntimeError("MIGRATIONS_MISSING")
    found = []
    for expected, path in enumerate(files, 1):
        match = PATTERN.fullmatch(path.name)
        if not match or int(match.group(1)) != expected:
            raise RuntimeError(f"MIGRATION_SEQUENCE_INVALID:{path.name}")
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        wrapper = WRAPPER.fullmatch(text)
        if not wrapper:
            raise RuntimeError(f"MIGRATION_TRANSACTION_WRAPPER_INVALID:{path.name}")
        found.append((expected, path, hashlib.sha256(raw).hexdigest(), wrapper.group(1)))
    return found


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
    """Recheck revision state inside advisory-locked transaction.

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
        run()
    except Exception as exc:
        print(f"HFT_R1_MIGRATION_STOP={str(exc)}", file=sys.stderr)
        raise SystemExit(1)
