# ADR-HFT-R1-001 — Isolated PostgreSQL candidate

Status: PROVISIONAL, NONPRODUCTION ONLY. Approval: independent architecture and security review pending.
Decision owner: 00 MASTER V2. Directive: HFT-R1-MASTER-ENG-AUTH-001 v0.1.
Source: main ae5d60909bbc6ec1b90e82ad5511351d55066977; legacy donor cf5d45d1c5c1823e4a2d34dd3465bad9f37d9271.

## Context
Phase 1 HFT Stores requires independent operational inventory without using ERPNext as a live source of stock authority. The legacy Frappe application relied on ERPNext for authoritative stock data. An authoritative transaction service must guarantee atomic, idempotent and concurrent-safe posting.

## Candidate decision
Use isolated PostgreSQL >= 15 for NONPRODUCTION domain modelling and database qualification. Define hft schema tables for master data, command idempotency, stock accounts, append-only movement entries, custody, approvals, operational documents and audit outbox. The database is NOT production-authoritative under this ADR. All commands must execute in a database transaction, locking stock accounts and serial identities in deterministic order; no write endpoint may be connected to live stock. Database role permission review is mandatory.

## Invariants
Ledger conservation per command, nonnegative available balances, explicit source-document-action uniqueness, item/UOM scoped by legal entity, unique active serial assignment, compensating correction (no edits/deletes), approval and Hold revalidation under locking, source version checks, separately protected audit-integrity evidence. External ERPNext identifiers remain nullable integration references, never live posting triggers.

## Migration contract
Migrations are forward-only and ordered. Run from a pristine database and from each supported prior schema using a tightly scoped migration role. Record checksums and actor of each migration. No production migration is allowed. Upgrades need a rehearsed recovery path; schema revision is separate from business data.

## Rejected alternatives and risks
- Reusing legacy ERPNext Stock Ledger as live backing: violates Phase 1 scope and pending system-of-record amendment.
- In-memory engine as the source of truth: lacks durability and concurrency; may only support unit tests.
- Implicit SQLite fallback: not authorized and could split authority.
- Automatic cloud provisioning: unapproved cost/security boundary.
- PostgreSQL as production system of record: BLOCKED until MASTER amendment and independent qualification.

## Required before production consideration
Real PostgreSQL migrations and transaction tests, backup/restore, power-loss/retry simulation, concurrency and serial uniqueness under load, authorization and audit boundary reviews, signed off release architecture, human operations and HOST acceptance.
