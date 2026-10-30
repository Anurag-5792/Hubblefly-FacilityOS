# HFT-R1 P0 Stores persistence bridge — 30 October 2026

**Authority:** HFT-R1-MASTER-V3-ENG-CONTINUATION-001; existing branch
engineering/hft-r1-stores-foundation and Draft PR #11 only.

**Disposition:** NONPRODUCTION SOURCE CANDIDATE. **PRODUCTION NO-GO.**
1 November owner GO remains recognized; neither technical GO nor SQL migration
authorization is implied. Canonical migrations 0001–0006 and manifest protected.

## What is genuinely implemented in source

- POST /api/hft/stores/submit: Ed25519 signed-session, same-origin and
  exact-scope validated IN / OUT / COUNT, no acceptance of caller-provided
  approval, actor, posted flag, stock balance or human ACK.
- lib/hft/stores/p0-persistence.ts: independent P0 HMAC issuer; strict
  disposable DB identity; a protected, DB-resolved posting command goes only
  through the existing P2 postProtectedStockCommand function, not direct
  stock-account or stock-entry DML. The P2 writer independently rechecks
  source, human approval, Holds, idempotency, serial rules and atomic ledger.
- COUNT: one prospective hft.p0_append_count_observation_v1 protected
  function in a serializable transaction; a second read-only connection checks
  the original nonce, immutable record and count audit. Ambiguous COMMIT is
  reconciled without an automatic append retry; every response keeps
  stockChanged=false and postingAuthorized=false.
- POST /api/hft/stores/read: signed, filtered, paginated intent for balances,
  movements and employee custody; only the proposed scoped read function,
  never direct-table SELECT or synthetic numbers.
- db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql: review-only proposal
  for typed physical leaf identity, version-aware frozen count epochs,
  immutable bin observations, signed counter authority, duplicate serial
  rejection, count audit and nonce recovery. No schema execution.
- TRANSFER is explicitly rejected rather than bypassing the existing single
  writer or faking a debit/credit. Employee physical receipt ACK is never
  automatically completed from an OUT submission.

## Critical hard stops

1. P2 V1 authoritative stock accounts and protected payload are **not
   product/manufacturing-version coupled**. The existing writer cannot be
   treated as a versioned production posting authority. The P0 SQL resolver
   therefore deliberately raises P0_P2_VERSION_COUPLED_WRITER_NOT_QUALIFIED
   and needs an independently reviewed P2 extension and version conservation
   proof. This is not a toggle-only acceptance criterion.
2. No qualified, version-aware source snapshot, controlled count-session
   opening/closing, physical-location certifications, genuine counter
   enrollment or independent reconciliation decision is provisioned. Merely
   creating a COUNT table cannot establish an authoritative variance.
3. p0_read_authoritative_stores_v1 deliberately raises unqualified until
   a version-aware, strictly scoped P2 stock/account/custody projection and
   protected SQL read HMAC verifier are independently accepted.
4. P2 currently has RECEIVE / ISSUE / RETURN only. Approved between-bin
   TRANSFER requires changes within the single protected writer and sealed
   ledger/serial provenance, plus source and destination atomicity; no second
   writer or direct table DML is permitted.
5. P2 runtime function allowlist, non-login SECURITY DEFINER ownership, key
   handling, effective grants, immutable data retention and audit tamper
   detection require Chats 10/11/17 review at an exact source SHA.
6. Real on-prem PostgreSQL roles, PG15+ schema, pgcrypto/key provision,
   human signers, production session issuance and physical stock evidence
   require Chats 13/04. No actual HFT workstation or production PostgreSQL
   access was used here.
7. A Vercel preview build is not an on-prem stock authority or live posting
   environment; every P0 persistence route currently remains fail-closed.

## Review and testing boundary

TypeScript + isolated scripted client/HTTP tests can validate request
binding, no direct DML, deterministic command mapping, zero synthetic
success, expired/cross-site denials and uncertain-COMMIT handling. Python
source checks are static contract assertions only. They do **not** execute
or parse the review SQL, install a migration, establish SQL ACLs, simulate
a real simultaneous database race, independently approve a human, perform
QR field workflows or verify backup/restore.

Approval to execute a new forward migration and actual live stock posting
must be separately issued after exact-revision security, governance,
DB operations and independent QA evidence. Never copy confidential donor
material or secrets into this public repository; source-free recipient
handover remains separate.
