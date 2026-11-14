# HF13-V2-077 retained Masters — executable activation order and evidence gates

**14 November 2026. Source branch:** `engineering/hft-r1-stores-foundation` at `5b45cc3fe9f62b56906a0820afcf1397f7b7f254`.  
**Status:** NONPRODUCTION REVIEW MATERIAL ONLY. No Neon project created, SQL executed, role/key enrolled, deployment bound, backup taken or owner UI readback proven.

## Exact resource operation awaiting independent approval

Neon organization `org-broad-glade-52476265` (provider readback: **Free plan**); new project
`hft-r1-masters-retained-np-077`; region `aws-ap-southeast-1`; PostgreSQL major 18;
fresh root branch `masters-retained-np`; fresh database `hft_r1_retained_masters_np077`;
initial cloud administrator `hft_r1_retained_admin`, NOT the runtime identity.

The exact tool argument object is in `10-NEON-RESOURCE-REQUEST.json`.
**Creation is not authorized by this document.** Independent resource admission must expressly
accept owner-personal-data residency in Singapore, billing, public/private access model and separate backups.
The archived `production` and `vercel-dev` branches on project `red-silence-36758131`
are excluded. No cloning from these branches.

The proposed 0.25 CU/300s suspend profile should fit Neon Free within 100 CU-hours and 1 GB, if usage stays below its limits; bill is not guaranteed. The Free plan's short native history is NOT a sufficient independent backup. See https://neon.com/pricing.

## Independent control gates (stop at first failure)

1. **RESOURCE APPROVAL** — MASTER signs the single new-project operation and security/data-residency risk.
2. **CREATE (separate operator execution)** — create the new blank Neon project with the exact approved arguments; record *provider-returned* project, branch and compute IDs and endpoint host/port. Confirm project is new and not cloned from either archived branch.
3. **IDENTITY & TLS** — prove `SELECT current_database(),session_user,current_user,current_setting('server_version_num')` from the actual SQL-running session; require exact `180006`. Record `pg_stat_ssl` and independently verify server certificate hostname/CA and protected client connection. SQL `pg_stat_ssl` alone is NOT peer/hostname verification. Reject unpinned endpoints and passwords in Git.
4. **ROLES** — independently create least-privileged `hft_engineering` migration login, `hft_r1_p3_master_owner` and `hft_r1_p3_master_runtime` NOLOGIN groups, `hft_r1_retained_p3_login` runtime login and necessary independent P2/issuer/audit nonlogin roles under Chat 10. No superuser, CREATEROLE/CREATEDB, BYPASSRLS, cross-duty SET ROLE or login ownership. Do not use the Neon initial administrator as runtime. Temporary installer membership must be removed after reviewed installation.
5. **CANONICAL MIGRATIONS** — prepare an independently reviewed remote PostgreSQL-18.6 migration transport. The existing `tools/hft_apply_migrations.py` is **loopback + disposable only** and must not be pointed remotely, renamed or weakened. Apply canonical 0001..0006 with byte-exact SHA-256s from `db/migrations/manifest.v1.json` and verify all recorded revisions after each transaction. No automatic 0007.
6. **P2 / P0 / CRYPTO DEPENDENCIES** — source-qualified P2 posting-session/length-prefix codec, `hft_crypto` pgcrypto, approved role and default-ACL close, governed human/custody relations required by the exact P3 SQL. INSTALLING THIS DEPENDENCY IS PROTECTED SQL; a distinct approval is needed. Stock writer API remains CLOSED; no stock posting, fixtures or balance mutation.
7. **P3 INSTALLER ADMISSION** — inspect `50-P3-RETAINED-EXECUTABLE-REVIEW.sql`, derived from original `db/security/HFT-R1-P3-MASTERS-REVIEW.sql` pinned SHA-256 `33eac12f493ca70463ffe50cfec62377e904d9a84d51e1c6eedb6797f34bb4c1`. The derived candidate requires exact retained database identity, PG18.6, SQL TLS, all six revisions, no stock rows and an empty P3 install. It has **not** been approved, parsed by PostgreSQL or executed. The source file in `db/security` is untouched.
8. **ORIGINAL ANCHOR BOOTSTRAP** — Chat 11/16 must independently authorize the initial **active legal entity, site and warehouse** with original records, corporate maker/checker and audit before any P3 change. P3 cannot create its own first active warehouse; never directly promote `PENDING_APPROVAL` to an active Master.
9. **SIGNER / AUTH ENROLLMENT** — independently qualify a real Ed25519 short-lived verified-session issuer/audience and same-origin cookie, separately controlled P3 request/read and Employee decision keys, active key version and protected SQL key-table custody. Do not fabricate signing secrets or approve one's own change.
10. **CATALOG POSTFLIGHT** — independently execute reviewed `60-INDEPENDENT-READ-ONLY-POSTFLIGHT.sql` under the approved read-only verifier and capture complete role membership/default-ACL ownership evidence. The runtime login must have exactly the three signed P3 function EXECUTEs; no table DML/SELECT, no extra helpers, no protected stock EXECUTE.
11. **BACKUP + INDEPENDENT RESTORE** — before real records, take encrypted custom-format `pg_dump`, hash it, store out of the app/project under restricted custody. Restore to a separately approved isolated destination, compare revision/ACL/data checksums, and verify read-only recovery; never restore over the retained source. Neon PITR cannot replace this gate.
12. **DEPLOYMENT BINDING** — deploy ONLY the four routes on a separately admitted TLS URL: `/stores/masters`, `/stores/masters/approvals`, POST `/api/hft/masters`, POST `/api/hft/masters/decision`. Exact `HFT_R1_RETAINED_NONPRODUCTION_MASTERS_V1` profile, `HFT_POSTING_RUN_MODE=RETAINED_MASTERS_ONLY_NO_STOCK`, `HFT_LIVE_POSTING_ENABLED=false`, managed database secret, verified backend CA/identity, signed-session issuer and admission hashes. The `NODE_ENV=production` value is a Next.js server mode, not production FacilityOS authorization. All stock, items/gallery, miscellaneous and unrelated HFT routes must still return HTTP 503.
13. **REAL OWNER ACCEPTANCE** — two distinct authenticated people. Via browser: submit a real Employee CREATE; record authenticated signed `REQUESTS` readback of exact request ID, source, scope and `PENDING_APPROVAL`. Independently approve/apply Employee and use a fresh POST intent `GET` to verify version/active state. Submit EDIT with expectedVersion; reread and approve. Submit Item/Supplier/Warehouse/Location requests and prove durable pending reads only; these are **NOT active masters** until Chat 16 implements independently reviewed APPLY paths.
14. **RESTART PERSISTENCE** — capture original IDs/revision on one session. Restart web service; reauthenticate and reread fresh. Where approved, restart DB compute, reconnect with same verified TLS role and reread. Demonstrate duplicate rejection, site-scope denial, stale version denial and no automatic retry on uncertain COMMIT.
15. **EVIDENCE** — retain screenshots/request IDs (redacted), signed actors/approvers, DB session facts, backup SHA-256, independent restore SHA-256, catalog/ACL postflight, immutable audit events and restart readback. Owner/master data is never copied to disposable R77 QA.

## Exact blocker to operational entry

A NEW retained DB has **not been authorized/created**. Accordingly no real DB identity, SQL admission,
signer/role enrollment, anchor bootstrap, independently successful backup/restore, deployed Masters URL
or UI save/read/edit/restart evidence exists for this workstream.

The current V7 P3 SQL allows independent Employee APPLY; Item, Supplier, Warehouse and Location
persist **pending requests only**. These four require separately reviewed APPLY functions and signed
maker/checker decisions before Monday operational Master GO. Photo/version authoring remains separate.

## Monday 16 November scope

* **Authenticated pending-request entry** — NO-GO until resource + P3 + URL + actual UI readback.
* **Employee active Master** — NO-GO until independent signed APPLY, readback and restart persistence.
* **Item/Supplier/Warehouse/Location active Masters** — SOURCE INCOMPLETE; NO-GO irrespective of pending-request successes.
* **R77 RECEIVE / stock** — separate qualification HOLD, not opened by this Masters profile.
* **Production** — NO-GO.

Any runtime error must report exact missing gate, not 'CI pass means operational'. PR #11 remains draft/unmerged.
