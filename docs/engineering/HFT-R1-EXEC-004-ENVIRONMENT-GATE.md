# HFT-R1-EXEC-004 — Disposable Environment Execution Gate

Status: OPERATOR PREREQUISITES / NONPRODUCTION ONLY. This file does not grant infrastructure permission.

## PostgreSQL prerequisite (not available in the present execution container)

1. Programme operator and Chat 13 must first authorize a disposable, private, loopback-only PostgreSQL >=15 instance on an approved host. Do not connect to a live ERPNext or production database.
2. Provision one database named `hft_r1_disposable_<unique_suffix>` and dedicated non-superuser login `hft_engineering` with only that database's required schema ownership/DDL privileges. Do not grant CREATEDB, CREATEROLE, replication, superuser or access to other databases. Store its password outside Git and shell history.
3. Install PostgreSQL client `psql`, verify its server identity on the same host and ensure the disposable role can create the `hft` schema. Bind PostgreSQL to loopback only, restrict its database access policy, and use synthetic HFT/employee/sample inventory identifiers only.
4. In an authorized local shell configure `PGHOST=127.0.0.1`, `PGUSER=hft_engineering`, `PGDATABASE=hft_r1_disposable_<unique_suffix>`, `HFT_TEST_PG_DATABASE` to the same string, `HFT_ENVIRONMENT=test`, `HFT_AUTH_SOURCE=verified`, `HFT_OPERATIONS_SOURCE=database`, `HFT_LIVE_POSTING_ENABLED=false`, `HFT_POSTING_RUN_MODE=ISOLATED_DB_TEST`. Set `NODE_ENV=test` only on this disposable test host. Provide credentials through the local approved secret mechanism; do not paste real secrets into evidence logs.
5. Run `python3 tools/hft_apply_migrations.py`, capture exit status and the SHA-256 revision ledger, and verify recorded versions 0001–0004 match the exact committed SQL bytes. An error or competing migrator requires explicit review; do not auto-retry or repair production systems.
6. Run isolated real-database transactional and concurrency tests using an approved PostgreSQL driver, with duplicate GRN, simultaneous issue, serial collision, rollback, restart, Hold/approval races, source action reuse, uncertainty/readback and audit-outbox completeness assertions. The current source does not include a qualified real-DB runner, therefore THIS GATE REMAINS OPEN.

## Reproducible application prerequisite (currently blocked)

1. Provide operator-approved access to a trusted npm registry/cache without disabling TLS verification. Dependency versions are pinned in `package.json` but `package-lock.json` has NOT been generated or approved.
2. On a fully trusted checkout at the exact Git SHA, run `npm install --package-lock-only --ignore-scripts`, inspect the entire resolved graph, transitive advisories, integrity digests and `sharp` mitigation, then commit the reviewed lockfile on this engineering branch in a separate bounded commit.
3. Execute `npm ci`, `npm run verify:lock`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:migrations:contract`, `npm run build`, and `npm audit --audit-level=high`; archive exact-commit logs and record failures. Do not use `--legacy-peer-deps`, `--force`, `--ignore-scripts` for the acceptance install, or skip a failing check to obtain a PASS.

## Identity, review and production separation

Only a test Ed25519 issuer exists in test-support code. A trusted identity issuer, session revocation, authorization policy administration, browser session issuance, API integration and actual DB-grant enforcement must be independently reviewed and implemented before a production candidate. Real posting and server-side exposure are PROHIBITED. U-09, production host and recovery, MASTER stock-source-of-record amendment, segregation-of-duties and business acceptance remain independent release blockers.
