# HFT-R1-CODE-QUALITY-REGISTER-001 v0.1

Baseline: main ae5d60909bbc6ec1b90e82ad5511351d55066977; donor cf5d45d1c5c1823e4a2d34dd3465bad9f37d9271.
Scope: read-only donor inventory; no dead-code removal. Classifications are provisional until reachability, runtime and independent review.

| ID | Exact legacy source | Classification | Dependency / action |
|---|---|---|---|
| CQ-01 | lib/auth/frappe-session.ts; lib/auth/server-guard.ts | REPLACE | Preview authentication bypass; production fail-closed adapter required |
| CQ-02 | lib/inventory-transactions.ts | REFACTOR | Preview-only transactions; retain UI validation, never use to post |
| CQ-03 | lib/inventory-workflows.ts; frappe_app/facility_os/facility_os/api/move.py | DEFER | Location-only move and preview count, preserve container workflows |
| CQ-04 | frappe_app/facility_os/facility_os/facility_os/doctype/facility_stock_balance/facility_stock_balance.json | DEFER | ERPNext synced projection, not standalone ledger; retain Phase 2 provenance |
| CQ-05 | frappe_app/facility_os/facility_os/api/documents.py | REUSE/REFACTOR | Existing GRN drafts and approvals; preserve historical records |
| CQ-06 | frappe_app/facility_os/facility_os/api/security.py | REPLACE | Global role-only guard; entity/site/warehouse checks required |
| CQ-07 | frappe_app/facility_os/facility_os/api/validation.py | REFACTOR | Count approvals; require all-stage SoD and version validation |
| CQ-08 | .env.example | REPLACE | Sample/preview defaults and ERPNext coupling; no production fallbacks |
| CQ-09 | package.json; .github/workflows/ci.yml | REFACTOR | Unlocked dependencies, npm install, missing meaningful tests |
| CQ-10 | lib/facility/sample-provider.ts; lib/mis/sample-provider.ts | DEFER | Demo read paths; inspect reachability before cleanup |
| CQ-11 | frappe_app/facility_os/facility_os/api/shopfloor.py | DEFER | Manufacturing historical genealogy; separate approved review |
| CQ-12 | frappe_app/facility_os/facility_os/facility_os/doctype/facility_operational_audit/facility_operational_audit.json | REPLACE for HFT R1 | No verified independent audit integrity; preserve records |

Current authorized change: new isolated secure authorization and exact fixed-point quantity contracts, with synthetic Node tests.
No legacy file was removed, copied or changed. No database writes, production operations or actual stock postings.
Outstanding: full dead-code reachability, duplicate call-graph, dependency CVEs, schema/runtime migration qualification, lint/type/build, independent architecture/security/QA reviews.

## HFT-R1-ENG-EXEC-FOLLOWUP-002 defect reproduction and corrective action (2026-10-23)

Source reference: `20a5ce022426b765a587e38e672dabc4f8d98a1e`.
- ENG-QA-001 HIGH, `lib/hft/domain/ledger.ts`: signed debit deltas incorrectly routed through unsigned quantity formatter. **REFACTOR** using `formatSignedQuantity`; retain `formatQuantity` for nonnegative balances.
- ENG-QA-002 HIGH, `lib/hft/domain/opening-stock.ts`: negative variance incorrectly routed through unsigned formatter. **REFACTOR** using signed representation for variances only.
- ENG-QA-003 HIGH test-evidence discrepancy, `lib/hft/domain/quantity.ts`: committed source lacked `requirePositive` export imported by GRN and ledger; source-matched tests reproduced 3 PASS and 2 test-file load failures. **REPAIR** export and add regression tests. Previous 23/23 local evidence does not qualify original HEAD.

Remediation: source-specific regression `tests/unit/hft-signed-ledger-regression.test.ts` covers RECEIVE→ISSUE→RETURN, conservation, replay, positive/zero/negative variances and Holds/SoD. Test evidence must be rerun against the new committed blob hashes; local checks before commit are provisional.

Open gates: no actual PostgreSQL instance, PostgreSQL migrations not executed, real transaction/concurrency/rollback/audit-outbox unproven; exact full checkout build/typecheck/lint, independent AI architecture/security/QA reviews, browser E2E and dependency audit outstanding. **NO-GO**.

## Isolated PostgreSQL transaction foundation (2026-10-23)

- `lib/hft/persistence/isolated-pg-transaction.ts` establishes **nonproduction-only** transaction control: explicit disabled live-posting flag, local disposable database name and role attestation, SERIALIZABLE transaction isolation, timeouts, rollback attempts and ambiguous COMMIT handling.
- `tests/unit/hft-isolated-pg-contract.test.ts` tests this envelope with a *synthetic fake client*, including invalid environment, successful sequence, rollback, wrong database, uncertain COMMIT and lost BEGIN response.
- This is **NOT** a stock posting implementation. No database SQL migrations, persisted balances, employee custody, audit-outbox, Holds, or concurrency were actually tested against PostgreSQL.
- Dependency blocking integration: PostgreSQL server/psql executable/isolated database are absent in current execution container, and application dependencies are not installed. Build/lint/fully clean Git checkout pending.
- Before the next bounded implementation: deploy a disposable PG15+ service under authorized local control, install pinned adapter, run migrations and real-db positive/negative and concurrency tests; obtain independent architecture, security and QA review.
- Security limitation: environment variables and database naming conventions are preflight checks, not authorization for live use or proof of infrastructure identity. Production remains NO-GO.


## Addendum — CQ-16 (2026-10-23), bounded security hardening

- **Finding CQ-16 / High (REFACTOR):** `lib/hft/security/authorization.ts::assertSecureStartup` allowed absent/unrecognized authentication source and unspecified HFT environment when not in production. This was an unsafe default for the isolated engineering runtime. Main baseline `ae5d60909bbc6ec1b90e82ad5511351d55066977`; engineering precursor `c08892c490e09456f43a3cc7264ac0846c52fb18`.
- **Change:** require explicit `HFT_AUTH_SOURCE=verified` and `HFT_ENVIRONMENT=development|test`; reject preview/sample operational sources; preserve strict production and live-posting prohibitions. No legacy security module was copied. Updated PostgreSQL synthetic-client test fixture to supply explicit isolated auth/environment identity, and added `tests/unit/hft-secure-config.test.ts`.
- **Dependency impact:** isolated PostgreSQL envelope invokes `assertSecureStartup` and now rejects unspecified environment. Verified identity is a **configuration contract only**; a production-capable identity adapter and API integration have not been implemented. This change must not be described as having secured legacy routes.
- **Regression evidence:** reconstructed affected source/test staging; `node --experimental-strip-types --test tests/unit/*.test.ts`: **32 passed / 0 failed**. Node v22.16.0. Tests use synthetic PG client and do not demonstrate real database behavior, application build or production readiness.
- **Deferred CQ-09:** floating Next/React dependencies and absent lockfile still block reproducible full build. No unauthorized dependency upgrades or broad legacy deletion attempted.
- **Independent code review:** outstanding. Security / architecture / QA independent AI reviews of final exact SHA remain required.
- **Release:** NO-GO. Stock posting gate remains blocked; no production use approved.

## HFT-R1-ENG-EXEC-003 — Nonproduction posting candidate (2026-10-23)

- **CQ-20 / REFACTOR / OPEN:** `db/migrations/0001-0004`. New `0004_hft_posting_authority.sql` adds per-warehouse persisted actor grants, SoD-constrained approvals, Holds, mutation gating, append-only outcomes and deferred command completeness. All migrations remain **UNEXECUTED** against PostgreSQL; external `psql` unavailable.
- **CQ-21 / REPLACE / OPEN:** `lib/hft/persistence/post-stock-command.ts`. Isolated candidate loads persisted ACL, active Holds, approvals, source documents and masters, then applies existing deterministic `applyCommand`. Proposed serializable changes persist balances, journal legs, custody, audit-outbox and idempotency in one transaction. **Not database-qualified**; no HTTP endpoint or live mode permitted.
- **CQ-22 / REFACTOR / OPEN:** `tools/hft_apply_migrations.py`. New guarded, ordered SHA256-revision migration runner. Local Python contract tests passed; PostgreSQL version identity, SQL execution, failure atomicity and rollback still unverified. Requires local non-superuser and disposable DB.
- **CQ-23 / REFACTOR / OPEN:** `package.json`. Adds executable Node/Python/unit/typecheck scripts. Deprecation of `next lint`, missing lockfile, uninstalled dependencies and blocked registry prevent full clean build/lint/audit. Do not claim reproducibility.
- **CQ-24 / DEFER / HIGH:** No independent trust-boundary verification of `NonproductionOperator`, no real DB isolation, location_key unavailable in adapter, single-command material issue, source/receipt attachment validation incomplete, no protected audit-integrity anchor or disaster-recovery proof.
- **CQ-25 / KEEP / SYNTHETIC ONLY:** `tests/unit/hft-postgres-posting-contract.test.ts`, `tests/test_migrator.py` check SQL protocol/control flow and fail-closed migrator preconditions. They **do not** assert PostgreSQL ACID behavior.
- **Evidence:** after reconciliation with concurrent authorized security hardening at `1c3c2b743b3c26cb95ddee68d8aad62873871248`, local source suite **35/35 PASS**, Python migration contract **2/2 PASS**, strict TS affected subtree **PASS**. `npm ci`, full build/lint, npm audit and real PostgreSQL remain blocked. No independent AI reviewer sign-offs. **PRODUCTION NO-GO.**

## EXEC-004 quality and security amendment — 23 October 2026

Reference precursor: `811443dccaa4b834d9565303225a72e8835ba4c0`. Nonproduction work only; this addendum is not independent review or production acceptance.

| Finding | Source/function | Disposition | Downstream dependency / residual risk |
|---|---|---|---|
| CQ-26 / HIGH identity marker | `lib/hft/persistence/post-stock-command.ts::postIsolatedStockCommand` formerly accepted caller-provided `trustedServerContext` | REPLACE implemented | Now accepts an operator object constructed by `lib/hft/security/verified-request.ts::resolveVerifiedRequestOperator` with Ed25519 signature, issuer/audience/time, origin and warehouse scope checks, runtime WeakSet proof; **no real issuer, session revocation or HTTP adapter qualification** |
| CQ-27 / HIGH uncertain COMMIT | `lib/hft/persistence/isolated-pg-transaction.ts` marked uncertainty without a durable resolver | REFACTOR implemented | `lib/hft/persistence/stock-command-readback.ts::reconcileIsolatedCommand` checks durable outcome, conservation, audit hash and delivery existence; absent row is explicitly INDETERMINATE and automatic retry forbidden; real database verification absent |
| CQ-28 / HIGH duplicated fingerprint | `post-stock-command.ts::fingerprint` and `stock-command-readback.ts::stockRequestFingerprint` | REFACTOR completed | One `lib/hft/persistence/command-fingerprint.ts` implementation; tests exercise shared function. Any future payload-contract change must version this fingerprint with backward-compatible replay |
| CQ-29 / HIGH migrator race | `tools/hft_apply_migrations.py::run` checked revision before acquiring the per-transaction lock | REFACTOR completed | `build_locked_statement` now repeats first/prior/current revision and predecessor checksum checks under the advisory lock, conflicting concurrent DDL fails closed; PostgreSQL semantics unexecuted |
| CQ-30 / CRITICAL dependency baseline | `package.json` Next 15 loose range, obsolete `next lint`, no dependency lock | REFACTOR partially | Pinned Next 15.5.28, React/React DOM 19.3.1, TS/node type versions, ESLint 9.39.5; explicit ESLint flat config. `tools/hft_check_lockfile.mjs` refuses absent/unverifiable lock; **no package-lock / install / lint / full build evidence** |
| CQ-31 / HIGH production mismatch | `docs/adr/ADR-HFT-R1-001-postgres-candidate.md`, PG migrations 0001–0004 | DEFER with owner 13/16 | PostgreSQL server/client unavailable, so migration execution, ACID/rollback/concurrency and recovery do not have passing evidence; only candidate contracts exist |

- **Preservation:** main and donor branches unchanged; no legacy deletion, actual HFT data, ERPNext integration or production migration.
- **Testing:** isolated local synthetic Node suite 48/48 PASS; Python migrator contract 3/3 PASS; affected TS source subtree strict typecheck PASS, using local TypeScript 5.8.3 and temporary Node type definitions. These are not full checkout tests at the remote exact commit. The lock gate intentionally exits nonzero with `HFT_LOCK_GATE_STOP=REVIEWED_PACKAGE_LOCK_REQUIRED`.
- **Failed gates:** `npm ci`: missing lockfile; `npm run lint`: eslint missing; `npm run build`: Next missing; `npm run typecheck`: full checkout absent/noninstalled TypeScript dependencies; actual PostgreSQL: psql/server missing. No successful end-to-end persisted stock command.
- **Security and QA reviewer evidence:** same-assistant implementation/self-check only. Required separate AI architecture/security/code-quality/QA reviews and human release authorization remain outstanding. Do NOT describe self-review as independent.
- **Release:** NO-GO. Source-of-record amendment, U-09, protected audit integrity and hosting/backup qualification remain blocked.


## QA-001/002/003/004/008/009 corrective increment — 23 October 2026

- **CQ-QA-01 / REPLACE (source correction):** `post-stock-command.ts` formerly reused the AVAILABLE account ID for every internal `CUSTODY` leg. `account-model.ts` and migration 0005 introduce separately identified, location-scoped, employee-held quantitative custody accounts. Deferred DB reconstruction trigger and immutable fact retention proposed; real SQL execution outstanding.
- **CQ-QA-02 / REFACTOR (source correction):** `stock-command-readback.ts` formerly checked only transaction total = 0. It now separately matches each ledger leg's bucket, legal entity, warehouse, location, item, lot/serial and holder, and compares per-account persisted balance with immutable-entry sum. Scripted negative tests reject equal-and-opposite misattribution.
- **CQ-QA-03 / REFACTOR (source correction):** location was always `''` in stock-account queries. New physical location binding is checked against active master and database FKs; no unlocated stock posting permitted by new adapter. Existing historical data must be manually reconciled before migrating.
- **CQ-QA-04 / REFACTOR (source correction):** supplier invoice is now a verified header with global authorized/received invoice-line totals. Distinct GRNs/partial physical receipts are uniquely identified and tied to posted source receipt UUID, item, lot/serial, actual location, QC/evidence and exact quantity. Constraint/readback and partial/cross-invoice concurrency remain real-DB unverified.
- **CQ-QA-05 / KEEP WITH VERSION:** original migration checksums 0001–0004 preserved; append-only 0005 adds new constraints/views/triggers, requires operator-approved disposable PostgreSQL qualification. Original source code/ledger facts, audit and historical records not deleted.
- **CQ-QA-06 / DEFER (HIGH):** material/identity policy, privileged DB bypass and protected external audit anchoring are not qualified; owner security (10), audit (11), deployment (13). No production authorization.
- **Regression evidence:** local **60 Node test passes, 3 Python contract test passes, affected TypeScript strict check exit 0**. Actual PostgreSQL tests remain **NOT RUN**; full clean install/build/lint fail for missing lock and packages. These numbers are local source staging, not clean exact-commit CI acceptance.
- **Review evidence:** independent Chat 17 bounded re-review package prepared in `HFT-R1-QA-REVIEW-REQUEST-001.md`, not yet returned. Review disposition remains **REQUEST CHANGES / NO-GO**.

## QA-CORRECT-002 (2026-10-23) — Source-only correction, real database still unqualified

Reviewed precursor: `f2bf6a3f237b0d61001d4a2cd9194e440501799a`. MASTER directive `HFT-R1-ENG-QA-CORRECT-002`. Owner: Chat 16; independent rereview: Chat 17 (pending).

| Finding | Severity | Exact source and disposition | Evidence / residual |
|---|---|---|---|
| QA-011 | HIGH | `db/migrations/0005_hft_quantitative_accounts_receipts.sql` preserved byte-for-byte SHA-256 `8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e`; corrected fresh-only v5 at `db/migration_candidates/0005_hft_quantitative_accounts_receipts_qa_corrected.sql` adds `supplier_invoice_entity_identity_v2 UNIQUE(id,legal_entity_id)` before referenced FK | Source corrected but NOT PostgreSQL-qualified; applied-old-v5 must STOP for a separate forward migration; governed environment status not attested |
| QA-012 | MEDIUM | Corrected v5 adds scoped GRN/invoice parent-child composite keys, invoice item identity, physical receipt warehouse/location and lot, issue/return header and line keys, stock command site/warehouse/item/receipt keys, and transaction-locked typed-document/original-issue triggers | `tests/pg/hft_qa_correct_002_schema_negative.sql` is prepared but NOT RUN; real constraint catalog and cross-entity evidence required |
| QA-013 | MEDIUM | Fresh-only v5 preflight blocks existing operational balances, serials, movement history, custody, approvals/Holds, GRNs, audit and counts; no synthetic delivery IDs or silent data rewriting; validates both originally `NOT VALID` receipt constraints | Separate historical seed/assertion SQL prepared, NOT RUN. Governing historical data migration requires separate MASTER scope and independently validated provenance |
| ENG-SCOPE-002 | HIGH | `lib/hft/persistence/post-stock-command.ts` includes authenticated `site_id` in `hft.stock_command` insert to match new composite warehouse/site FK | Synthetic TS protocol tests pass; no real insert or server issuer integration tested |
| ENG-MIG-002 | HIGH | `tools/hft_apply_migrations.py` explicitly pins legacy v5 bytes and selects independently checked corrected v5 in an isolated disposable DB. Existing original v5 checksum is refused; 0001–0004 remain unchanged | 7 Python migration-contract tests PASS locally, including simulated previously-applied legacy v5 refusal without any migration writes and missing-candidate refusal; no psql or authorized database |
| ENG-ENV-002 | CRITICAL BLOCK | No reviewed `package-lock.json`, npm install, full lint/build, approved PostgreSQL host, real migration evidence, CI, browser E2E or backup/restore | Local 60 synthetic Node tests PASS; 7 Python migration-contract tests PASS; affected subtree strict TypeScript PASS; actual database 0 tests. Full application and PostgreSQL NO-GO |

- **No controlled deletion, production deployment, source-of-record amendment, real employee/inventory data, ERPNext posting or PR merge performed.**
- **Independent Chat 17 review requested via** `docs/engineering/HFT-R1-QA-REREVIEW-003-REQUEST.md`; no separate AI reviewer has yet returned findings at this commit.
- **Release:** REQUEST CHANGES / NO-GO. Do not claim QA-011/012/013 closed without independent PostgreSQL and historical-data verification.

## EXEC-005 — Canonical migration, approval binding and DB privilege candidate (2026-10-23)

Source baseline: \`76d850ae97658515e91d634801817ae9cdfa6209\`. Directive HFT-R1-ENG-EXEC-005.
Classification below differentiates committed source fixes from unexecuted PostgreSQL design.

| Finding | Status | Exact source/mitigation | Unqualified obligation |
|---|---|---|---|
| QA-013A / QA-013B | SOURCE CORRECTED; DB NOT QUALIFIED | \`db/migrations/0005_hft_quantitative_accounts_receipts.sql\` now contains only the reviewed corrected digest \`01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf\`. Original invalid digest \`8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e\` archived in \`db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql\`. \`db/migrations/manifest.v1.json\` has exact allowlist/checksums 0001–0005; \`tools/hft_apply_migrations.py\` enforces manifest and refuses unknown SQL, drift, and incompatible DB revision-5 | Real disposable PostgreSQL version/catalog/migration and historical refusal test NOT RUN |
| QA-012A | CONTRACT IMPLEMENTED; DB BINDING OPEN | \`lib/hft/security/approval-binding.ts\` + \`tests/unit/hft-approval-binding.test.ts\`. Stable approval tuple binds doc/action/revision, entity/site/warehouse/item/location/lot, exact quantity, actor/approver, policy generation, and inspection evidence. 6 targeted tests PASS in isolated local Node staging including approved 2 → attempted 4 rejection | Persist approved payload/actual source with protected DB transaction and enforce from a single trusted write path; candidate SQL review still required |
| QA-012B | NONEXECUTABLE CANDIDATE; HIGH OPEN | \`db/security/HFT-R1-APPROVAL-AUTHORITY-NONEXECUTABLE-CANDIDATE.sql\` proposes DB-side validation, protected source revision generation, actor login mapping, Hold epoch and exact canonical hash with CHECK/trigger path | No active migration, DB tests or qualified SECURITY DEFINER posting procedure. Current test adapter retains privileged per-table SQL. DO NOT enable production runtime writes |
| QA-014 | NONEXECUTABLE CANDIDATE; HIGH OPEN | \`db/security/HFT-R1-DISPOSABLE-ROLE-BOOTSTRAP-REVIEW.sql\` proposes nonlogin least-privilege runtime and audit reader roles; \`tests/pg/hft_r1_runtime_grant_catalog.sql\` and \`tests/pg/hft_r1_direct_dml_negative.sql\` specify actual denied-role proof | PostgreSQL catalog grants, table ownership, trigger tampering denial, row-level site isolation and attacker DML not executed. No claim of qualified RLS |
| APP-LOCK | CRITICAL OPEN | Pinned package.json exists, but reviewed \`package-lock.json\` not present. Local \`npm ci --offline\` fails EUSAGE: lockfile absent | Trusted registry/cache access, lockfile review, clean install, full application lint/typecheck/build, vulnerability/license/secret scans |
| PG-QUAL | CRITICAL OPEN | Disposable PostgreSQL 15+ runtime not present here; \`psql --version\` exit 127 | Operator-approved PG host, separate migration/runtime/audit roles, catalog evidence, real postings/concurrent issues/reconciliation/rollback/uncertain COMMIT, and historical-data refusal |
| REV-005 | HIGH OPEN | QA/architecture/security/release reviewers must independently inspect exact Git SHA and corrected candidate source | Chat 17 and workstreams 10/11/13 review dispositions, human approvals, MASTER stock authority and U-09 remain pending |

**Evidence standard:** This turn executed **6/6 targeted Node synthetic approval-binding tests** (Node 22.16.0) in an isolated reconstructed test workspace, not a full GitHub checkout. \`npm ci --offline\` failed EUSAGE due absent lockfile. \`psql\` unavailable. Full repository tests, Python canonical manifest test suite, database acceptance and build were **not executed** from the exact latest SHA. Earlier reported tests from other increments remain historical only.

**Release:** PRODUCTION NO-GO. PR #11 remains DRAFT and unmerged. Do not apply review-only security SQL or import real records.

## HFT-R1-ENG-SCOPE-006-P1 — source checkpoint (2026-10-28)

**Authorized source scope:** HFT-R1-MASTER-ENG-SCOPE-AMENDMENT-002. **P1 code commit:** `1337414df00d2408e150a931c00c119652f894bf`. **Independent review/real PG execution:** NOT RUN / PENDING.

| Finding | Source disposition | Exact revision and files | Qualification still required |
| --- | --- | --- | --- |
| H3 HIGH — appendable command legs | IMPLEMENTED IN SOURCE; OPEN | `db/migrations/0006_hft_posted_fact_integrity.sql` mandates exact two-leg typed movement shape and quantity, immutable command seal, postseal INSERT denial, deferred seal-at-commit requirement, outcome/audit hash checks; `lib/hft/persistence/post-stock-command.ts` supplies command quantity and invokes seal in the same transaction; `stock-command-readback.ts` verifies durable seal | Real PG fresh/historical migration, COMMIT-time and SET CONSTRAINTS IMMEDIATE negative cases, actor/owner privilege tests. Package 2 must seal from one protected writer and bind approved quantity. |
| H4 HIGH — mutable account identity | IMPLEMENTED IN SOURCE; OPEN | `0006` BEFORE UPDATE/DELETE trigger refuses changing account UUID, legal owner, item, warehouse, location, lot/serial, condition, account kind, custodian. `tools/hft_verify_quantitative_accounts.sql` checks immutable attribution and account balances. | Real DB mutation with otherwise-valid FK identities, rollback integrity, independent audit readback. |
| H5 HIGH — mutable posted receipts | IMPLEMENTED IN SOURCE; OPEN | `0006` refuses posted receipt mutation and protected GRN/invoice header/line identity edits, preserving unposted workflow edits and legitimate counters; source SQL negative fixtures under `tests/pg/`. | Real posted receipt quantity/QC/evidence/source mutation tests; concurrency with posting and approval generation. |
| CQ-P1-01 — canonical provenance | KEEP / EXTEND | Migrations 0001–0005 and rejected-v5 archive preserved; `manifest.v1.json` now pins 0006 SHA-256 `f6b92c89468b59b596dad6fa27453f78ccfeb3a2c578ed6d125cde54bbf5f371`. `tools/hft_apply_migrations.py` exact six-revision manifest gate; `tests/test_migrator.py` updated. | Execute migrator only after separate Chat13 environment acceptance and migration/test authorization. |
| CQ-P1-02 — test evidence | AUTHOR/EXECUTE LIMITED | 6 offline Python source-contract tests PASS, exit 0, isolated container Python; source/manifest/test bytes verified equal to the committed GitHub contents. New PostgreSQL SQL fixtures authored but NOT RUN. | Full exact-commit Node/TypeScript/CI, actual PostgreSQL migration/constraint catalog/role-negative/concurrency/recovery. |
| CQ-P1-03 — preserved restrictions | KEEP | Production-deny middleware unmodified; no source import from legacy, no historical fact rewrite, no database or install operation; no new branch/PR. | Protected runtime posting authority (H1/H2), authentic dependency lock and browser E2E remain NO-GO. |

**Important execution limitation:** No KES checkout is mounted in the active Chat 16 container. Windows local HEAD/unpushed changes could not be reconciled. Source changes were additive and committed with an exact expected remote SHA, without reset, replacement checkout, force push, or changes to the owner's workstation. KES custody check remains required before pulling these remote changes.

**Residual:** H3–H5 are **NOT CLOSED** by synthetic/static source tests; Package 2 actor/approval/role integration and real-PostgreSQL authorization remain mandatory. **Production NO-GO.**
