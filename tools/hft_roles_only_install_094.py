#!/usr/bin/env python3
"""HF094 minimal retained ROLES_ONLY installer. Source candidate, not admission.
--inspect is offline; --apply requires two authenticated authorities and pinned
technical trust. No credential, enrollment, stock posting or runtime activation.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "review-candidates/hf094-roles-only"
APP = "4681edbfddfa960b4af9ad8597745a7d66b9c90e"
APP_TREE = "f090740ac321d92e0663bcab48f5610de83caede"
MANIFEST_SHA = "351ff5621e79bc7120ead7895cc2bc35e4403684ef36495999708f9e3b7ddd85"
CANONICAL_SHA = "ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355"
HELPER_SHA = "3cc1e19e2e72ad2a4f30c24285707e9331063cdb9fa45a3c59c7e3ba202b6e91"
ORIGINAL_ROLE_SHA = "e9d34e58be95cca5ce83a848243e88cb95919dec843763dc234de78559644641"
TARGET = {
    "project": "wandering-cake-50222227", "branch": "br-shiny-night-b3qgsj8t",
    "endpoint": "ep-hidden-fire-b324s21q",
    "host": "ep-hidden-fire-b324s21q.c-4.ap-southeast-1.aws.neon.tech", "port": 5432,
    "database": "hft_r1_retained_masters_np077", "database_oid": 16397,
    "server_version_num": 180007, "installer": "hft_r1_retained_masters_np077_owner",
}
FILES = ("10-role-bootstrap.sql", "20-role-assignment.sql", "90-catalog-acl-postflight.sql")
ACTION = "HF094_RETAINED_ROLES_ONLY_CANONICAL_0001_0006_AND_ROLE_SQL"
# Enrollment of the authentic independent technical reviewer requires a separate
# reviewed trust-pin update. Never accept a caller-provided fingerprint as trust.
TECHNICAL_REVIEWER_PUBKEY_SHA256 = ""
HEX = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
FINGERPRINT = re.compile(r"[0-9A-F]{40,64}\Z")


def deny(code):
    raise RuntimeError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(path, private=False):
    p = Path(path)
    if not p.is_absolute() or p.is_symlink() or not p.is_file():
        deny("HF094_UNTRUSTED_FILE")
    mode = p.stat().st_mode
    if not stat.S_ISREG(mode) or mode & 0o022 or (private and mode & 0o077):
        deny("HF094_UNTRUSTED_FILE_MODE")
    return p


def checked(path, digest):
    if not isinstance(digest, str) or not HEX.fullmatch(digest):
        deny("HF094_INVALID_DIGEST")
    p = regular(path)
    h = hashlib.sha256()
    with p.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    if h.hexdigest() != digest:
        deny("HF094_FILE_SHA256_MISMATCH")
    return p


def exact_bytes(path, digest):
    p = regular(path)
    raw = p.read_bytes()
    if sha(raw) != digest:
        deny("HF094_SOURCE_SHA256_MISMATCH")
    return raw


def strict_json(raw):
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out:
                deny("HF094_DUPLICATE_JSON_KEY")
            out[k] = v
        return out
    v = json.loads(raw, object_pairs_hook=pairs)
    if not isinstance(v, dict):
        deny("HF094_JSON_OBJECT_REQUIRED")
    return v


def load_package():
    manifest = strict_json(exact_bytes(PKG / "manifest.json", MANIFEST_SHA))
    if (manifest.get("schema") != "HF094_ROLES_ONLY_INSTALLER_V1"
        or manifest.get("state") != "REVIEW_CANDIDATE_NOT_ADMITTED"
        or manifest.get("application_source_commit") != APP
        or manifest.get("application_source_tree") != APP_TREE
        or manifest.get("target") != TARGET
        or manifest.get("canonical_manifest_sha256") != CANONICAL_SHA
        or manifest.get("canonical_helper_sha256") != HELPER_SHA
        or manifest.get("original_role_sql_sha256") != ORIGINAL_ROLE_SHA
        or manifest.get("runtime_login") != "hft_r1_roles_np_login"
        or any(manifest.get(k) is not False for k in ("login_enabled","stock_posting","owner_bootstrap"))):
        deny("HF094_MANIFEST_SCOPE_MISMATCH")
    entries = manifest.get("files", [])
    if tuple(x["path"] for x in entries) != FILES:
        deny("HF094_MANIFEST_ORDER")
    sql = {}
    for x in entries:
        raw = exact_bytes(PKG / x["path"], x["sha256"])
        git_blob = hashlib.sha1(("blob %d\0" % len(raw)).encode() + raw).hexdigest()
        if git_blob != x["git_blob"]:
            deny("HF094_GIT_BLOB_MISMATCH")
        sql[x["path"]] = raw.decode("utf-8")
    exact_bytes(ROOT / "db/migrations/manifest.v1.json", CANONICAL_SHA)
    exact_bytes(ROOT / "db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql", ORIGINAL_ROLE_SHA)
    helper = ROOT / "tools/hft_apply_migrations.py"
    exact_bytes(helper, HELPER_SHA)
    spec = importlib.util.spec_from_file_location("hft094_canonical", helper)
    if spec is None or spec.loader is None:
        deny("HF094_CANONICAL_HELPER_MISSING")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    plan = module.revisions()
    if [x[0] for x in plan] != list(range(1,7)):
        deny("HF094_CANONICAL_SEQUENCE_MISMATCH")
    return manifest, sql, plan


def command(argv, **kwargs):
    return subprocess.run(argv, capture_output=True, timeout=kwargs.pop("timeout", 20), check=False, **kwargs)


def tool(name):
    path = shutil.which(name)
    if not path:
        deny("HF094_REQUIRED_TOOL_" + name.upper())
    return path


def git(*args):
    p = command([tool("git"), "-C", str(ROOT), *args], text=True)
    if p.returncode:
        deny("HF094_GIT_IDENTITY_UNVERIFIED")
    return p.stdout.strip()


def date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", value):
        deny("HF094_ADMISSION_TIME_FORMAT")
    return dt.datetime.fromisoformat(value.replace("Z","+00:00"))


def lifetime(record):
    issued, expires = date(record.get("issued_at")), date(record.get("expires_at"))
    now = dt.datetime.now(dt.timezone.utc)
    if not (issued <= now < expires and dt.timedelta(0) < expires-issued <= dt.timedelta(hours=24)):
        deny("HF094_ADMISSION_EXPIRED_OR_WINDOW_INVALID")


def checked_source(record):
    commit = record.get("installer_source_commit")
    tree = record.get("installer_source_tree")
    if not isinstance(commit,str) or not COMMIT.fullmatch(commit) or not isinstance(tree,str) or not COMMIT.fullmatch(tree):
        deny("HF094_INSTALLER_SOURCE_ID_REQUIRED")
    if git("rev-parse","HEAD") != commit or git("rev-parse","HEAD^{tree}") != tree:
        deny("HF094_CHECKOUT_NOT_SIGNED_SOURCE")
    if git("rev-parse", APP+"^{tree}") != APP_TREE or git("status","--porcelain","--untracked-files=no"):
        deny("HF094_APPLICATION_BASE_OR_DIRTY_CHECKOUT")
    p = command([tool("git"),"-C",str(ROOT),"merge-base","--is-ancestor",APP,commit])
    if p.returncode:
        deny("HF094_APPLICATION_BASE_NOT_ANCESTOR")
    changes = git("diff","--name-only",APP,commit).splitlines()
    if not changes or any(not (x.startswith("review-candidates/hf094-roles-only/")
        or x in ("tools/hft_roles_only_install_094.py","tests/test_hf094_roles_only_installer.py",
                 "tests/postgres/hf094_roles_only_fixture.py",".github/workflows/hft-roles-only-installer-094.yml")) for x in changes):
        deny("HF094_INSTALLER_DIFF_OUTSIDE_SCOPE")


def authorize(args, manifest):
    # Fail closed BEFORE any libpq invocation or password lookup.
    if not HEX.fullmatch(TECHNICAL_REVIEWER_PUBKEY_SHA256):
        deny("HF094_INDEPENDENT_TECHNICAL_TRUST_NOT_ENROLLED")
    if not all((args.technical_record, args.technical_signature, args.technical_key,
                args.owner_order, args.owner_signature, args.owner_keyring)):
        deny("HF094_DUAL_AUTHORITY_FILES_REQUIRED")
    raw = regular(args.technical_record, True).read_bytes()
    sig = regular(args.technical_signature, True).read_bytes()
    key = exact_bytes(args.technical_key, TECHNICAL_REVIEWER_PUBKEY_SHA256)
    # Verify the very bytes subsequently parsed, avoiding file reopen races.
    with tempfile.TemporaryDirectory(prefix="hf094-signature-") as d:
        p = Path(d)
        for name, data in (("record",raw),("signature",sig),("key.pem",key)):
            (p/name).write_bytes(data)
        verify = command([tool("openssl"),"pkeyutl","-verify","-pubin","-inkey",str(p/"key.pem"),
            "-rawin","-in",str(p/"record"),"-sigfile",str(p/"signature")])
        if verify.returncode or len(sig)!=64:
            deny("HF094_TECHNICAL_SIGNATURE_INVALID")
        # Enrolled trust must actually be Ed25519, not another signing algorithm.
        public = command([tool("openssl"),"pkey","-pubin","-in",str(p/"key.pem"),"-text_pub","-noout"],text=True)
        if public.returncode or "ED25519 Public-Key" not in public.stdout:
            deny("HF094_TECHNICAL_KEY_NOT_ED25519")
    record = strict_json(raw)
    pins = {x["path"]:x["sha256"] for x in manifest["files"]}
    mandatory = {
        "schema":"HF094_TECHNICAL_ADMISSION_V1","technical_status":"APPROVED",
        "authorized_action":ACTION,"target":TARGET,"application_source_commit":APP,
        "application_source_tree":APP_TREE,"installer_manifest_sha256":MANIFEST_SHA,
        "canonical_manifest_sha256":CANONICAL_SHA,"canonical_helper_sha256":HELPER_SHA,
        "original_role_sql_sha256":ORIGINAL_ROLE_SHA,"sql_sha256":pins,
        "runner_sha256":sha(Path(__file__).read_bytes()),"owner_order_exact_scope_verified":True,
        "owner_signature_and_revocation_verified":True,"technical_revocation_checked":True,
        "stop_active":False,"backup_encrypted":True,"restore_independently_verified":True,
        "runtime_login_enabled":False,"stock_posting_authorized":False,
        "identity_or_owner_bootstrap_authorized":False,"tls_mode":"verify-full",
        "channel_binding":"require","resource_purpose":"RETAINED_NONPRODUCTION_ROLES_ONLY",
    }
    if any(record.get(k)!=v for k,v in mandatory.items()):
        deny("HF094_TECHNICAL_ADMISSION_SCOPE_OR_PIN_MISMATCH")
    for k in ("independent_reviewer","independent_restore_witness","appointed_executor",
              "installer_host_identity","restore_destination_identity","authority_ref"):
        if not isinstance(record.get(k),str) or not record[k].strip() or record[k].upper() in ("UNASSIGNED","TBD","NONE"):
            deny("HF094_NAMED_AUTHORITY_EVIDENCE_MISSING")
    if record["independent_reviewer"] == record["appointed_executor"] or record["independent_restore_witness"] == record["appointed_executor"]:
        deny("HF094_INDEPENDENT_WITNESS_REQUIRED")
    lifetime(record)
    checked_source(record)
    # The independent technical signer must have validated the actual corporate
    # order's exact scope against Chat11's original schema and all final pins.
    # This runner additionally verifies the detached OpenPGP signature on the
    # exact order bytes, using the keyring and primary fingerprint bound by that
    # already trusted independent signer. It does not reinterpret Chat11's JSON.
    order = exact_bytes(args.owner_order,record.get("owner_order_sha256",""))
    owner_sig = exact_bytes(args.owner_signature,record.get("owner_signature_sha256",""))
    keyring = exact_bytes(args.owner_keyring,record.get("owner_keyring_sha256",""))
    fp = record.get("owner_primary_fingerprint","")
    if not isinstance(fp,str) or not FINGERPRINT.fullmatch(fp):
        deny("HF094_OWNER_FINGERPRINT_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="hf094-owner-") as d:
        p = Path(d)
        for name,data in (("order.json",order),("order.sig",owner_sig),("keyring.gpg",keyring)):
            (p/name).write_bytes(data)
        v = command([tool("gpgv"),"--homedir",d,"--keyring",str(p/"keyring.gpg"),"--status-fd","1",
                     str(p/"order.sig"),str(p/"order.json")],text=True)
        lines = [x.split() for x in v.stdout.splitlines() if x.startswith("[GNUPG:] VALIDSIG ")]
        if v.returncode or len(lines)!=1 or lines[0][-1]!=fp or any(
            ("[GNUPG:] "+x) in v.stdout for x in ("BADSIG","ERRSIG","REVKEYSIG","EXPKEYSIG","EXPSIG","KEYEXPIRED","SIGEXPIRED")):
            deny("HF094_OWNER_SIGNATURE_INVALID")
    checked(regular(record.get("backup_path",""),True),record.get("backup_sha256",""))
    checked(regular(record.get("restore_evidence_path",""),True),record.get("restore_evidence_sha256",""))
    return record, sha(raw)


def transport(record, directory):
    if os.environ.get("HFT_ENVIRONMENT")!="retained-stores-nonproduction" or os.environ.get("HFT_LIVE_POSTING_ENABLED")!="false" or os.environ.get("VERCEL_ENV") is not None:
        deny("HF094_NONPRODUCTION_INSTALLER_HOST_REQUIRED")
    for k,v in {"PGHOST":TARGET["host"],"PGPORT":"5432","PGDATABASE":TARGET["database"],
        "PGUSER":TARGET["installer"],"PGSSLMODE":"verify-full","PGCHANNELBINDING":"require"}.items():
        if os.environ.get(k)!=v:
            deny("HF094_EXACT_TLS_TARGET_REQUIRED")
    if any(os.environ.get(k) for k in ("PGHOSTADDR","PGSERVICE","PGSERVICEFILE","PGOPTIONS","PGPASSFILE",
        "PGTARGETSESSIONATTRS","PGSSLCERT","PGSSLKEY","DATABASE_URL","POSTGRES_URL")):
        deny("HF094_AMBIENT_ROUTING_DENIED")
    ca = exact_bytes(os.environ.get("PGSSLROOTCERT",""),record.get("ca_sha256",""))
    ca_path = Path(directory)/"ca.pem"
    ca_path.write_bytes(ca)
    ca_path.chmod(0o600)
    password = os.environ.get("PGPASSWORD","")
    if not 16<=len(password)<=4096:
        deny("HF094_MANAGED_INSTALLER_SECRET_REQUIRED")
    return {"PATH":os.defpath,"HOME":directory,"LANG":"C.UTF-8","PGHOST":TARGET["host"],"PGPORT":"5432",
        "PGDATABASE":TARGET["database"],"PGUSER":TARGET["installer"],"PGSSLMODE":"verify-full",
        "PGCHANNELBINDING":"require","PGSSLROOTCERT":str(ca_path),"PGPASSWORD":password,
        "PGCONNECT_TIMEOUT":"10","PGAPPNAME":"hf094-roles-only-installer","PGPASSFILE":"/dev/null"}


def sql_session(sql, env):
    p = command([tool("psql"),"-X","-w","-A","-t","-q","-v","ON_ERROR_STOP=1",
        "-h",TARGET["host"],"-p","5432","-d",TARGET["database"],"-U",TARGET["installer"]],
        input=sql,text=True,env=env,timeout=180)
    if p.returncode:
        # No SQL/server errors, credential material or signed documents in logs.
        deny("HF094_SQL_FAILURE_OR_COMMIT_UNCERTAIN_NO_RETRY")
    return p.stdout.strip()


def build_transaction(sql, plan, owner_sha, tech_sha, expires_at):
    if not HEX.fullmatch(owner_sha) or not HEX.fullmatch(tech_sha):
        deny("HF094_ADMISSION_DIGEST_INVALID")
    date(expires_at)
    # Original transaction wrappers are removed by the pinned canonical helper.
    # All DDL/role creation/ACLs/revision records and catalog checks are atomic.
    parts = ["BEGIN ISOLATION LEVEL SERIALIZABLE;",
      "SET LOCAL search_path=pg_catalog,pg_temp;",
      "SET LOCAL lock_timeout='5s';","SET LOCAL statement_timeout='60s';",
      "SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:MIGRATIONS',0));",
      "SET LOCAL hft.hf094_admitted='roles-only-v1';",
      "SET LOCAL hft.hf094_order_sha256='"+owner_sha+"';",
      "SET LOCAL hft.hf094_technical_sha256='"+tech_sha+"';",
      "SET LOCAL hft.hf094_expires_at='"+expires_at+"';", sql[FILES[0]]]
    for version, _, digest, ddl in plan:
        parts.extend([ddl, "INSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES ("+
                      str(version)+",'"+digest+"',current_user);"])
    parts.extend([sql[FILES[1]],sql[FILES[2]],
        "DO $$ BEGIN IF clock_timestamp()>=current_setting('hft.hf094_expires_at')::timestamptz THEN RAISE EXCEPTION 'HF094_ADMISSION_EXPIRED_BEFORE_COMMIT'; END IF; END $$;",
        "COMMIT;"])
    return "\n".join(parts)+"\n"


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inspect",action="store_true")
    mode.add_argument("--apply",action="store_true")
    mode.add_argument("--postflight",action="store_true")
    for name in ("technical-record","technical-signature","technical-key","owner-order","owner-signature","owner-keyring"):
        cli.add_argument("--"+name)
    args=cli.parse_args()
    manifest, sql, plan=load_package()
    if args.inspect:
        for x in manifest["files"]:
            print(x["path"]+" SHA256="+x["sha256"])
        print("HF094_MANIFEST_SHA256="+MANIFEST_SHA)
        print("HF094_RUNNER_SHA256="+sha(Path(__file__).read_bytes()))
        print("HF094_OFFLINE_SOURCE_VERIFIED_NO_DATABASE_CONNECTION")
        return
    record, tech_sha=authorize(args,manifest)
    with tempfile.TemporaryDirectory(prefix="hf094-transport-") as d:
        env=transport(record,d)
        lifetime(record)
        if args.apply:
            statement=build_transaction(sql,plan,record["owner_order_sha256"],tech_sha,record["expires_at"])
            if "HF094_ROLES_ONLY_CATALOG_ACL_PASS" not in sql_session(statement,env).splitlines():
                deny("HF094_COMMIT_READBACK_UNCERTAIN_NO_RETRY")
        # Fresh authenticated TLS connection; read-only verification only.
        result=sql_session("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[FILES[2]]+"\nCOMMIT;\n",env)
        if result!="HF094_ROLES_ONLY_CATALOG_ACL_PASS":
            deny("HF094_INDEPENDENT_POSTFLIGHT_FAILED_NO_RETRY")
        print("HF094_ROLES_ONLY_INSTALL_COMMITTED_AND_CATALOG_READ_BACK" if args.apply else "HF094_ROLES_ONLY_READONLY_POSTFLIGHT_PASS")
        print("RUNTIME_LOGIN_DISABLED_NO_STOCK_OR_IDENTITY_ACTIVATION")


if __name__=="__main__":
    try:
        main()
    except RuntimeError as e:
        # RuntimeError codes emitted by this runner or pinned migration helper;
        # avoid dumping external tool output or arbitrary exception text.
        print("HF094_INSTALL_STOP="+str(e),file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("HF094_INSTALL_STOP=UNVERIFIED_FAILURE_NO_RETRY",file=sys.stderr)
        sys.exit(1)
