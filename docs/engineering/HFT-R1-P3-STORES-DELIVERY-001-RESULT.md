# HFT-R1-P3-STORES-DELIVERY-001 — source engineering receipt

Authority HFT-R1-MASTER-P3-STORES-DELIVERY-001. Mode: nonproduction source only. PRODUCTION NO-GO.
Branch engineering/hft-r1-stores-foundation, existing Draft PR #11. P1 and P2 unchanged.

## Implemented source
- app/stores/masters/page.tsx: Employee, Item, Supplier, Warehouse, Location scope chooser, list/search, record editing proposals and pending request/denied/blocked status UI.
- app/stores/page.tsx: truthful Stores workflow navigation and qualification states.
- app/api/hft/masters/route.ts: POST-only signed-cookie/Origin/CSRF API; no anonymous preview, no stock posting. Returns 503 when persistence or authority is unavailable.
- lib/hft/masters/p3-contract.ts: exact fields and identity/scope validation for five kinds; CREATE is inactive; ACTIVATE/DEACTIVATE separate governed requests; revision conflict checks.
- lib/hft/masters/p3-database.ts: disposable/nonprivileged database identity, read-only/serializable transaction, rollback, uncertain COMMIT protection.
- lib/hft/masters/p3-service.ts: SQL-backed per-warehouse grant read, scoped list and one immutable pending request function; same-transaction persisted status readback; no operational master-table or stock DML from API.
- db/security/HFT-R1-P3-MASTERS-REVIEW.sql: NONEXECUTABLE candidate for read projection, request, nonce, policy grant, immutable pending decision/history/audit, isolated HMAC verifier. No real keys, roles or migration.
- app/page.tsx and app/mis/page.tsx: fabricated inventory counts, sample movements, multiplied MIS metrics removed; unavailable until qualified source.

## Not yet working in a qualified installation
Actual P3 database driver, approved master migration, signing keys, role grants, issuer and DB credentials are absent. The API fails closed. A rendered form is NOT accepted proof of persistence or an operational Stores app. No actual Employee Master, master activation, GRN, Issue or Return transaction has been executed.

HIGH SECURITY BLOCKER: Proposed P3 runtime role currently has broad SELECT on read views and actor grants; authorization is scoped at the signed API but a compromised database login could read across scopes. A DB-verified scoped read function or independently accepted RLS equivalent is required BEFORE executing this candidate.

HIGH FUNCTIONAL BLOCKER: Independent authenticated master approval, denial, policy and approved APPLY transaction do not exist yet. APPROVED must not directly mutate employee/item/supplier/warehouse/location without real human separation, source lock, exact approval and immutable revision/audit evidence. Denied/blocked are display states only until a trusted issuer is implemented.

## Tests
Authored: tests/unit/hft-p3-masters-contract.test.ts and hft-p3-masters-persistence.test.ts (synthetic only); tests/pg/hft_p3_masters_catalog_assertions.sql and hft_p3_masters_negative.sql (not executed). Source-backed connector checks separate.
Node unit tests, full typecheck/lint/build, and PostgreSQL migration/ACL/ACID/rollback: NOT RUN in a complete exact-commit checkout. No production data or deployment.

Isolated available toolchain checks:
- psql --version -> exit 127, executable absent.
- npm install --package-lock-only --offline --ignore-scripts --no-audit --no-fund (temporary directory, exact pinned dependencies, no package installation) -> exit 1, ENOTCACHED @eslint/eslintrc. No lockfile created.
- Node 22.16.0; npm 10.9.2; global tsc 5.8.3 available. No successful clean build.

## Accepted/rejected/replaced
KEEP: canonical migrations 0001–0006, manifest, P1 immutable facts, P2 protected writer and review, production-deny gate, preexisting tests. REPLACE: homepage/MIS fabricated operational metrics. ADD: scoped Stores master UI, contracts, API, pending-request and audit candidate. DEFER: qualified PG driver and signed-session issuer, P3 DB scoping, governance decision/apply and independent review, approved lockfile, real tests, GRN/QC, Issue/Return/custody, stock balances/reconciliation.

## Next qualified workflow
Resolve DB-level scoped read and independent human approval before candidate promotion. Then run Employee registration inactive -> independent approval -> activation -> scoped readback and cross-site/denied/stale-revision negatives on an approved disposable PG installation. Continue GRN with invoice/QC, partial Issue and inspected Return only through the qualified existing P2 writer. No revised production deadline authorized.
