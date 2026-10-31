# HFT-R1-BOOTSTRAP-019-CORRECT-020 — Neon staging bootstrap package

**Status:** SOURCE/DESIGN PREPARATION ONLY. **NO DATABASE-CHANGING EXECUTION AUTHORIZED.**  
**Frozen canonical source:** `59fc9b758b28692103bb7bcc99fa8173cee478b5`  
**Repo / PR:** `Anurag-5792/Hubblefly-FacilityOS`, draft PR #11.  
**Local-only migrator:** `tools/hft_apply_migrations.py` is unchanged and is not used for Neon.

## 1. Frozen target

| Control | Exact value |
| --- | --- |
| Project | `red-silence-36758131` |
| Branch | `vercel-dev` / `br-dawn-moon-azd9xzrp` |
| Database | `neondb` |
| PostgreSQL | `18.6` / `180006` |
| Region | `aws-ap-southeast-1` |
| RW endpoint | `ep-lingering-tooth-azvv1jmr` |
| Direct host | `ep-lingering-tooth-azvv1jmr.c-3.ap-southeast-1.aws.neon.tech` |
| Bootstrap owner | `neondb_owner` |

The separate Neon branch named `production` is excluded. The runner fails if its attestation does not explicitly state `production_branch_touched=false`.

## 2. Package

- `tools/hft_neon_staging_bootstrap.py` — exact Neon-only runner.
- `tests/test_hft_neon_staging_bootstrap_contract.py` — source-only contract tests.
- this document — lifecycle, recovery, evidence and authorization contract.

Canonical migrations and hashes are unchanged. No P2/P0 candidate SQL is executable through this package.

## 3. Required human accountability

Before any mutating phase, MASTER must name real humans for:

1. corporate decision maker;
2. operator;
3. evidence custodian;
4. independent verifier, different from the operator.

The runner rejects `TBD`, `UNKNOWN`, `AI`, `CHATGPT`, `MAVERICK` and operator=verifier. Chat 10/11/13 AI review is not an independent human approval.

**Current blocker:** these names are not established in this package.

## 4. Control-plane + TLS attestation

Before privileged SQL, preserve a sanitized Neon control-plane JSON record containing:

```json
{
  "project_id":"red-silence-36758131",
  "branch_id":"br-dawn-moon-azd9xzrp",
  "branch_name":"vercel-dev",
  "database":"neondb",
  "database_owner":"neondb_owner",
  "endpoint_id":"ep-lingering-tooth-azvv1jmr",
  "endpoint_host":"ep-lingering-tooth-azvv1jmr.c-3.ap-southeast-1.aws.neon.tech",
  "endpoint_type":"read_write",
  "region_id":"aws-ap-southeast-1",
  "postgres_version":"18.6",
  "production_branch_touched":false,
  "captured_at_utc":"<UTC Z>"
}
```

After role creation/password setup, refresh it with password-auth metadata for:

- `hft_staging_migration_owner`;
- `hft_staging_app_runtime`;
- `hft_staging_audit_verify`.

No password or connection string belongs in the attestation.

Runner connection requirements are exact direct host, `PGDATABASE=neondb`, exact phase role, port 5432 and `PGSSLMODE=verify-full`. `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, `PGOPTIONS`, and `PGTARGETSESSIONATTRS` are rejected. SQL also requires exact PostgreSQL `180006` and `pg_stat_ssl.ssl=true`.

## 5. Pre-change recovery point

Before any role/ACL/DDL change under a future execution directive:

- preserve branch/endpoint/database/role/schema/ACL inventory;
- preserve source HEAD and six canonical hashes;
- create a named Neon snapshot of `br-dawn-moon-azd9xzrp` and record snapshot ID, UTC, retention/expiry and custodian.

`vercel-dev` is a child branch, so root-branch PITR is not accepted as the sole rollback proof. Snapshot recovery plus the independent restore test in §11 is required.

## 6. Role / ownership lifecycle

Future security-bootstrap phase creates:

| Role | Initial authority |
| --- | --- |
| `hft_staging_migration_owner` | LOGIN; no super/createdb/createrole/replication/bypassrls; CONNECT + **temporary database CREATE** |
| `hft_r1_app_runtime` | NOLOGIN restricted capability group |
| `hft_staging_app_runtime` | restricted LOGIN, member of runtime group; CONNECT only |
| `hft_r1_audit_verify` | NOLOGIN restricted audit group |
| `hft_staging_audit_verify` | restricted LOGIN, member of audit group; CONNECT initially |

Roles are created without passwords in source. After role creation the authorized operator uses Neon control plane password reset/setup, moves secrets directly into approved staging secret custody, and refreshes control-plane role attestation. Secrets never enter Git, journal or chat.

Database defaults before DDL:

```sql
REVOKE CONNECT,TEMPORARY ON DATABASE neondb FROM PUBLIC;
GRANT CONNECT,CREATE ON DATABASE neondb TO hft_staging_migration_owner;
GRANT CONNECT ON DATABASE neondb TO hft_staging_app_runtime,hft_staging_audit_verify;
```

Neon-managed `neondb_owner` / `neon_superuser` access is not revoked.

After canonical 0001–0006, database-level CREATE is mandatory-revoked from the migration owner. The `hft` schema stays owned by the migration owner so later DDL still requires that separately controlled identity.

## 7. PUBLIC function EXECUTE

Before canonical DDL, while connected as the **actual creating role** `hft_staging_migration_owner`, the runner executes and verifies:

```sql
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Final verification fails if any `hft` function exposes PUBLIC EXECUTE. A future P2/P0 SECURITY DEFINER creator requires its own separately reviewed default-privilege setup.

## 8. Immutable migration contract

Exact canonical set:

| # | File | SHA-256 |
|---:|---|---|
|1|`0001_hft_masters.sql`|`8e7253652591c5ce7ef3935d0dc8893e4f503479fa59e7748583ec9ec2215723`|
|2|`0002_hft_ledger.sql`|`6e1981c6314b604f470c4a5d9e7c255891fc7e3f693e5cde7780ea77ff12da36`|
|3|`0003_hft_workflows.sql`|`bf8a4987d1f3c82f3016a1d340edb79a6d238229e23f28dbc65cc75c0a181cf8`|
|4|`0004_hft_posting_authority.sql`|`27375f432d476e8e88f8402af1970422d62de898a1fbcc91a9ec30efce79d7e2`|
|5|`0005_hft_quantitative_accounts_receipts.sql`|`01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf`|
|6|`0006_hft_posted_fact_integrity.sql`|`664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044`|

The runner reads the existing manifest, re-hashes every SQL file, rejects extra SQL/symlinks/wrapper drift, and extracts only the already-reviewed outer `BEGIN; ... COMMIT;` body.

Each migration uses one transaction:

1. advisory transaction lock `HFT:R1:NEON:STAGING:MIGRATIONS`;
2. exact revision-state recheck inside the lock;
3. unchanged canonical body;
4. exact `hft.schema_revision` insert;
5. COMMIT;
6. explicit post-COMMIT ACK;
7. independent revision-ledger readback.

Any nonzero psql result or missing ACK is **OUTCOME UNCERTAIN**. No automatic retry is permitted.

### 0001 special bootstrap

Before and inside migration 0001, require:

- no `hft` schema;
- no `hft.schema_revision`;
- zero non-system user relations;
- exact target/TLS/migration-role attestation;
- PUBLIC function EXECUTE default already revoked.

Unexpected/historical objects or revisions cause STOP; no repair/backfill/drop is attempted.

## 9. Exact future phase order

CORRECT-020 authorizes source only. After a separate execution directive:

1. `verify-manifest` — source only.
2. Create/record pre-change Neon snapshot.
3. `preflight-owner` — read-only owner/TLS/empty-state attestation.
4. `prepare-security` — owner-only role + database ACL bootstrap.
5. Neon control-plane password setup; secret custody; refreshed role attestation.
6. `prepare-migration-owner` — actual creator revokes PUBLIC default function EXECUTE.
7. `migrate` — canonical 0001–0006 only.
8. `finalize` — owner revokes migration DB CREATE; audit group gets only schema USAGE + `SELECT` on `hft.schema_revision`.
9. `verify-final` — read-only ownership/ACL/revision verification; stop.

Final verification requires migration DB CREATE=false, runtime DB CREATE=false, runtime schema USAGE=false, audit ledger read=true, no PUBLIC DB CONNECT/TEMP, no PUBLIC hft function EXECUTE, exact migration ownership and exact six-entry ledger.

## 10. STOP conditions

STOP for any target/endpoint/branch mismatch; any production-branch operation; TLS/hostname-verification failure; non-18.6 server; stale/malformed control-plane attestation; unexpected schema/relations/revisions; migration/hash drift; incorrect role attributes; PUBLIC function EXECUTE; PUBLIC DB CONNECT/TEMP; runtime DDL/DML/posting privilege; missing pre-change snapshot; uncertain migration result; ledger mismatch; failed CREATE revocation; ownership/ACL mismatch; missing named humans; or any attempt to install `pgcrypto`, run review-only P2/P0 SQL, provision posting keys, use real inventory, or alter Vercel production secrets.

## 11. Independent restore contract

Final staging acceptance requires actual restore evidence, not backup configuration alone:

1. after successful canonical staging install, create a reviewed logical `pg_dump` over direct TLS without exposing credentials;
2. SHA-256 the dump and place it in evidence custody;
3. create/identify a separately isolated Neon restore target, neither `vercel-dev` nor `production`;
4. restore with `pg_restore` under a separately authorized restore owner;
5. verify PG18 compatibility, exact six revision hashes, object/schema ownership, no PUBLIC function EXECUTE, expected object counts and empty operational data;
6. record source/restore IDs, dump hash, UTC start/end and result;
7. a named independent human verifier witnesses/signs the evidence.

Restore execution is **not** authorized by CORRECT-020.

## 12. Execution journal

Every mutating runner invocation requires the future MASTER authorization ID plus named decision maker, operator, custodian and independent human verifier. JSONL evidence records UTC, exact target IDs, sanitized attestation SHA, source baseline, migration/source/statement hashes, ACK/uncertainty and final verification. It never records passwords, connection strings, HMAC keys or company data.

## 13. P2/P0 boundary

`pgcrypto` remains uninstalled. The package does not execute P2/P0 review SQL, posting owner/governance roles, HMAC keys, protected runtime grants or production posting. Those require a new checksummed forward migration and separate review/authorization.

## 14. Source verification and PR integration

- Python compile: PASS.
- Contract tests: **9 PASS / 0 FAIL**, no DB/network execution.
- Frozen `59fc9b7…` to pre-existing PR HEAD `9422f237…`: three intervening commits changed only `app/stores/operations/page.tsx`; canonical migrations were untouched.
- Package is added on top of current PR #11; no rewind or overwrite of Chat 16 work.

## 15. Exact next database-changing authorization requested

After Chat 10/11 re-review the exact committed package SHA, MASTER may separately authorize only:

- pre-change `vercel-dev` snapshot;
- owner preflight;
- role/ACL bootstrap;
- role-secret setup and refreshed attestation;
- creator default-privilege setup;
- canonical 0001–0006;
- CREATE revocation + final verification;
- evidence preservation and STOP.

Explicitly exclude Neon `production`, `pgcrypto`, P2/P0 review SQL, posting keys, Vercel production secrets, real inventory and production posting. Independent restore execution remains a separately witnessed acceptance activity.

---

**31 October 2026 supersession:** The per-migration COMMIT model, static attestation-only
control and original five-role plan in this historical CORRECT-020 record were
superseded by HFT-R1-BOOTSTRAP-019-RUNNER-021-CORRECTION. The corrected runner
uses live Neon API attestation, one atomic six-revision transaction, SHA-pinned
separate role/ACL SQL sources and an explicit unresolved independent-review hold.
This earlier document remains preserved as provenance, NOT execution authority.
