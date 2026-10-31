# HFT-R1 Online PostgreSQL Application Integration — 013

Status: NONPRODUCTION SOURCE INTEGRATION. PRODUCTION NO-GO.
Authority: HFT MASTER V3, existing engineering branch and draft PR #11.
Infrastructure, SQL execution, credential issuance and backup/restore: Chat 13.
ERPNext/Frappe and live DD integration are excluded from Phase 1.

## One authoritative PostgreSQL database

Browser -> signed Next.js Stores APIs -> scoped and approved P0 command ->
P2 protected PostgreSQL writer -> immutable movement/custody/audit ->
authenticated committed readback.

The online transport cannot create a second ledger or authorize production.
P3 Masters and P2 Stores connect to the SAME database with different
least-privilege database roles and separate managed server-only passwords.
Browsers never receive a PostgreSQL credential, network address or connection.

## Required managed nonproduction environment

- NODE_ENV=test; HFT_ENVIRONMENT=test; HFT_AUTH_SOURCE=verified
- HFT_OPERATIONS_SOURCE=database; HFT_LIVE_POSTING_ENABLED=false
- HFT_POSTING_RUN_MODE=ISOLATED_ONLINE_DB_TEST
- HFT_DATABASE_TRANSPORT=ONLINE_TLS
- HFT_ONLINE_DB_CREDENTIAL_SOURCE=MANAGED_RUNTIME_SECRET
- PGHOST and HFT_ONLINE_DB_ENDPOINT_HOST: same qualified DNS hostname
- PGPORT and HFT_APPROVED_PG_PORT: same endpoint or PgBouncer port
- HFT_ONLINE_DB_BACKEND_PORT: attested actual PostgreSQL backend port
- PGDATABASE and HFT_TEST_PG_DATABASE: same approved disposable DB
- HFT_ONLINE_DB_TLS_CA_PEM: validated public CA chain
- HFT_P2_RUNTIME_LOGIN and HFT_ONLINE_P2_DB_PASSWORD: posting runtime
- HFT_P3_RUNTIME_LOGIN and HFT_ONLINE_P3_DB_PASSWORD: master runtime
- HFT_STORES_P0_SOURCE=qualified_disposable_review
- HFT_STORES_P0_SQL_CONTRACT=HFT_R1_P0_PERSISTENCE_V1
- HFT_MASTERS_SOURCE=postgres_review

Signers, approval issuers and protected P2/P3 keys require separately approved
custody and evidence. Store managed secrets only in runtime environment
controls; no production secret values or connection URLs in Git, browser
code, CI output, chat transcripts or handover documentation.
Generic PGUSER/PGPASSWORD, DATABASE_URL, ambient service/SSL overrides and
insecure TLS are explicitly rejected by the online transport.

## Enforced runtime gates

- CA-pinned certificate verification and TLS 1.2+ with hostname checking
- Exact DNS endpoint, port, disposable database and independent role login
- Transaction-level backend DB identity, pg_stat_ssl, and TLS cipher checks
- Catalog verification of SECURITY DEFINER nonlogin owners, precise function
  EXECUTE allowlists, no direct table/sequence privileges, no CREATE and no
  hft_secret or hft_crypto schema USAGE
- Rollback/discard semantics and no automatic retry after uncertain COMMIT
- Existing independent approval/Hold, identity and source checks remain
  owned by the protected P2/P3 functions

Read-only preflight commands (from Chat 13 approved runner):
npm run verify:online-db
npm run verify:online-db:masters

They never execute migrations or write stock. A PASS only verifies
connectivity, TLS and effective role/function grants; it cannot prove actual
inventory correctness, independent approvals, concurrency or backup/restore.

## Still NOT qualified

Current P2 writer is RECEIVE/ISSUE/RETURN without version-coupled stock
identities; TRANSFER is explicitly unavailable. P0 COUNT and read SQL are
review-only candidates requiring protected migrations, true opening snapshot,
reconciliation approval and actual PostgreSQL tests. No online endpoint or
managed DB credentials were available in connected project metadata at the
31 October 2026 check. No live online database, transaction or end-to-end
browser/API/DB workflow was tested. Owner production GO is not technical GO.

Chat 13 must provide independently approved online PostgreSQL region, endpoint,
network isolation, distinct role/password secrets, TLS CA/rotation, schema
and least-privilege evidence, backup and ACTUAL restore. Chats 10, 11, 17 and
04 must perform independent security, governance, integration and Stores
business acceptance. MASTER authorizes final cutover only after evidence.
