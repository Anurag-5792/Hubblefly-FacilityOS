# HF16-V7-077 — RETAINED NONPRODUCTION MASTERS SOURCE DELIVERY

**Directive:** `HFT-R1-MASTER-V4-DELIVERY-QUALITY-077`  
**Date:** 14 November 2026  
**Status:** SOURCE ONLY — NOT INSTALLED, NOT DEPLOYED, NO DATABASE ACCEPTANCE  
**Gate R HOLD · Gate A HOLD · Production NO-GO.**

## Exact source boundaries

Only these four paths are eligible for the **separately admitted**
retained-nonproduction Masters profile:

- UI: `/stores/masters`
- UI: `/stores/masters/approvals`
- HTTP POST: `/api/hft/masters` (LIST / GET / REQUESTS / SUBMIT)
- HTTP POST: `/api/hft/masters/decision` (Employee-only signed APPROVED/DENIED)

All `/api/hft/stores/*`, `/api/hft/items/*`, unrelated HFT routes,
stock postings, audit, shopfloor, and public operations remain HTTP 503.
The global startup guard continues to prohibit `NODE_ENV=production`
for all other paths and contexts. It is **not** modified to grant stock
access. Each admitted API checks the actual signed Ed25519 cookie,
same-origin request, approved issuer/audience, entity/site/warehouse
scope and existing protected P3 SQL authorization.

### Required exact retained runtime profile

The following strings are **constraints**, not permission to invent
values or activate any service:

| Variable | Independently admitted requirement |
|---|---|
| `NODE_ENV` | `production` (Next.js server runtime only; not an HFT production release) |
| `HFT_ENVIRONMENT` | `retained-nonproduction` |
| `HFT_MASTERS_RUNTIME_PROFILE` | `HFT_R1_RETAINED_NONPRODUCTION_MASTERS_V1` |
| `HFT_POSTING_RUN_MODE` | `RETAINED_MASTERS_ONLY_NO_STOCK` |
| `HFT_LIVE_POSTING_ENABLED` | `false` |
| `HFT_AUTH_SOURCE` | `verified` |
| `HFT_OPERATIONS_SOURCE` | `database` |
| `HFT_MASTERS_SOURCE` | `postgres_review` |
| `HFT_DATABASE_TRANSPORT` | `ONLINE_TLS` |
| `HFT_ONLINE_DB_CREDENTIAL_SOURCE` | `MANAGED_RUNTIME_SECRET` |
| `PGDATABASE` | `hft_r1_retained_[a-z0-9_]{6,40}`, exactly matching `HFT_MASTERS_APPROVED_PG_DATABASE` |
| `HFT_TEST_PG_DATABASE` | Must be absent; retained profile cannot masquerade as disposable |
| `HFT_MASTERS_INDEPENDENT_ADMISSION_SHA256` | 64-digit nonzero SHA-256 of original external independent admission |
| `HFT_MASTERS_APPROVED_INSTALLER_SHA256` | 64-digit nonzero SHA-256 of separately qualified executable P3 installer |
| `HFT_MASTERS_APPROVED_RESOURCE_SHA256` | 64-digit nonzero SHA-256 of separately qualified database and connection identity |
| `HFT_ONLINE_DB_ENDPOINT_HOST`, `PGHOST` | Same approved lowercase DNS hostname |
| `HFT_ONLINE_DB_TLS_CA_PEM` | Current valid certificate-authority chain, hostname-verified |
| `PGPORT`, `HFT_APPROVED_PG_PORT` | Same approved TLS endpoint port |
| `HFT_ONLINE_DB_BACKEND_PORT` | Independently attested actual backend port |
| `HFT_P2_RUNTIME_LOGIN`, `HFT_P3_RUNTIME_LOGIN` | Distinct role names, P3 must be unprivileged, neither posting nor P3 function owner |
| `HFT_ONLINE_P3_DB_PASSWORD` | Managed runtime secret only; not in repository |
| `HFT_SESSION_ED25519_PUBLIC_KEY_PEM`, `HFT_SESSION_ISSUER`, `HFT_SESSION_AUDIENCE` | Verified real short-lived signed-session authority |
| `HFT_PUBLIC_ORIGIN` | Exact TLS origin used by the retained web application |
| `HFT_P3_SIGNING_KEY_BASE64`, `HFT_P3_SIGNING_KEY_VERSION` | Independently enrolled P3 request/read signer |
| `HFT_P3_DECISION_SIGNING_KEY_BASE64`, `HFT_P3_DECISION_SIGNING_KEY_VERSION` | Separately enrolled decision signer |

The presence of pin strings in environment variables does **not**
constitute actual independent admission. Chat 13 must verify the actual
installation, DB resource, TLS identity, and backup/restore. Chat 10 must
verify effective login ACLs, signer custody and protected P3 function
owners; the runtime catalog denies extra function, relation and elevated
role access. The P3 retained transaction also verifies PG 18.6
(`server_version_num=180006`). Recheck every connection.

The canonical `tools/hft_apply_migrations.py` is **disposable,
loopback-only**. It must NOT be pointed at the retained online database
or bypassed. This source supplies a deterministic **STOP-guarded review
derivation** of the frozen P3 SQL instead of activating SQL.

```bash
node tools/hft_p3_retained_source_builder.mjs --inspect
node tools/hft_p3_retained_source_builder.mjs --emit-review /secure/location/p3-review.NONEXECUTABLE.sql
```

The candidate retains P3 checks and changes only the reviewed
disposable-database preflight to the retained naming profile while
adding an unconditional installer STOP. It is **not an installer**.
Exact source hash, executable conversion, role grants, rollback and
postflight still require independent technical approval. No source
write here installs or modifies database objects.

## Persisted and active states — no false GO

| Kind | Authenticated pending change persisted/readable when P3 installed? | Independently approved real master APPLY in currently reviewed SQL? |
|---|---|---|
| Employee | Yes (requires real P3 roles and sessions) | Employee only; CREATE registers inactive after independent approval, separate ACTIVATE required |
| Item | Yes | **NO** |
| Supplier | Yes | **NO** |
| Warehouse | Yes if an existing active anchor warehouse exists | **NO** |
| Location / Bin | Yes if an existing active warehouse exists | **NO**, P0 physical-location certification remains separate |

**Existing active legal entity, site and warehouse are prerequisites
for every P3 request**. They must come from independently authorized
original master/bootstrap evidence; the owner cannot create the first
active warehouse solely through P3 SUBMIT, because its protected SQL
checks the warehouse is already active.

A create/edit click saves only a protected `PENDING_APPROVAL` request.
The UI exposes an independent signed reread of that request. The original
Employee maker/checker database approval checks remain intact. An
Employee APPLY is accepted by the service only after a separate
authenticated `GET` returns the exact record, revision and active state.
A missing readback is a **NO RETRY** exception, not an automatic resubmit.

Item/Version master photos, GRN, QC, opening stock, receipts and serial
registry cannot be created or authorized by this Masters profile.

## Required demonstration and Monday capability labels

The acceptance campaign must use original real data, two distinct
authorized humans, verified TLS credentials and actual PostgreSQL. QA
must demonstrate (a) CREATE request persisted, (b) independent REQUESTS
readback, (c) duplicate/forged request rejection, (d) eligible Employee
independent approval/apply, (e) fresh GET exact version, (f) EDIT
pending request, (g) separate maker/checker apply, (h) fresh GET revised
record, and (i) denial on role, site and revision conflicts.
These outcomes cannot be inferred from local Node and Python tests.

No working application URL or real database-backed save/readback
evidence exists in this source delivery. Do not market the page as a
working production Stores application.

**Chat 13 V2:** new independently admitted retained PostgreSQL resource,
migrations, TLS and installation, backup/restore; not existing Neon
production/archived branches.

**Chat 10 V2:** effective P3 owner/EXECUTE/secret/key custody, nonproduction
sign-in issuer, protected role catalog and allowlist.

**Chat 11 V2:** independent human maker/checker and original master
records, actual legal entity/site/warehouse bootstrap, policies and
reviewer qualifications.

**Chat 17:** real PostgreSQL operational Masters acceptance plus separate
R77 stock qualification. Neither synthetic tests nor pending requests
constitute Master activation.

**Status remains: source-only; production NO-GO.**
