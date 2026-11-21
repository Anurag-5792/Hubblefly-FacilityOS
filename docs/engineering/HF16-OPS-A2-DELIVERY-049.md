# HF16-OPS-A2-DELIVERY-049 — Protected Stores V2 Engineering Source Package

**Directive:** `HFT-R1-MASTER-V4-OPS-A2-DELIVERY-049`  
**Date:** 7 November 2026  
**Starting accepted HEAD:** `c39cd5aa03613c6aa301333a5919f494e8517798`  
**Mode:** Authorized nonproduction source engineering; **NO SQL execution**  
**Gate R:** HOLD | **Gate A:** HOLD | **Production:** NO-GO

## 1. Delivery boundary

This package adds actual P0→P2 version-aware source adapters, proposed protected
PostgreSQL routines for authorized resolution, atomic writer, immutable
stock/audit verification and restricted readback, and synthetic integration
tests. It is deliberately **NOT operational**. The existing P2 V1 PostgreSQL
writer, P0 resolver/readback STOP functions, HTTP middleware 503 guard,
canonical migrations 0001–0006 and the existing one authoritative stock
ledger remain unchanged.

The four OPS-A2 SQL files are **review-only, not a migration**. Each begins
with an unconditional exception
`OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED`, before any DDL.
No role, key, IAM grant, PostgreSQL function or stock record was installed,
executed or provisioned by this source engineering.

| Source | Responsibility |
|---|---|
| `lib/hft/persistence/ops-a2-stores-source.ts` | Synthetic-only signed P0 source resolution, V2 posting request, original-proof independent reconciliation; no HTTP route activation |
| `lib/hft/persistence/ops-a2-stores-readback.ts` | Synthetic-only scoped version, bin, movement, custody read validation, rejects unqualified provenance and no hidden pagination |
| `db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql` | Proposed new columns and constraints on EXISTING stock accounts, entries, commands, seals, custody; independently governed transfer document, source binding and immutable nonce envelope; unchanged ledger |
| `db/security/HFT-R1-OPS-A2-PROOF-AUTHORITY-NONEXECUTABLE.sql` | Proposed exact V2 33-string-field HMAC, qualified human/session, source document, approval/Hold, policy and photo/version verification |
| `db/security/HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql` | Proposed single SECURITY DEFINER versioned RECEIVE/ISSUE/RETURN/TRANSFER writer, deterministic account locks, 2-leg CAS and balances, serial/custody, counter updates, original immutable stock entries and audit/seal |
| `db/security/HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql` | Proposed P0 signed request resolver, original nonce reconciliation with NO REPOST, read-only scoped balance/movement/custody projections |
| `tests/unit/hft-ops-a2-protected-service.test.ts` | Scripted protected PG client positive/negative proof, one-writer, rollback and lost-COMMIT tests |
| `tests/unit/hft-ops-a2-readback.test.ts` | Scripted signed scoped version/custody readback and negative assertions |
| `tests/test_hft_ops_a2_review_source.py` | Read-only structural review tests, unchanged P0 V1 STOP and protected HOLD verification |

## 2. Source implemented / never automatically activated

The P0 signed operator's original scope and HMAC are tested against an
independently persisted source approval. The prospective P2 V2 payload
contains item/version, legal entity/site/warehouse, exact source/destination
leaf and account identities, two expected account revisions, control/serial/
batch, original source document, fragment/quantity, current approval/policy,
actor/independent approver and inspection evidence.

The SQL **proposal** rechecks current signed V2 key/session, persisted human
and policy authority, actor grant, active item/version with approved photo,
company/site/warehouse and certified leaf, parent/warehouse Holds, invoice/
GRN QC, issue material line, return inspector/original ISSUE or governed
transfer document. It preserves all stock changes inside one SERIALIZABLE
transaction. Source/destination account identities lock in deterministic
order; optimistic versions prevent a stale or competing commit.

RECEIVE: original verified supplier invoice/GRN/QC → EXTERNAL debit and
VERSIONED AVAILABLE credit. ISSUE: VERSIONED AVAILABLE debit → employee
CUSTODY credit and ACK_PENDING. RETURN: original employee/ISSUE fragment →
approved inspected AVAILABLE, DAMAGED or QUARANTINE. TRANSFER: exact bin
AVAILABLE debit/credit within ONE version and ONE protected command (not
separate IN+OUT). Stock-entry and command records use the same canonical
`hft.stock_account`, `hft.stock_entry` and `hft.stock_command`.

A single atomic posting also proposes immutable original command, two
movement rows, same-source outbox event, outcome, posting nonce evidence,
envelope and seal. Reconciliation is READ ONLY and must bind the original
nonce/key version, exact payload, signed actor, immutable audit and original
commit. Unknown COMMIT cannot be re-posted blindly.

The new source adapters are intentionally guarded by
`HFT_OPS_A2_SOURCE_MODE=OPS_A2_SYNTHETIC_PG_CLIENT_ONLY`,
`NODE_ENV=test`, `HFT_ENVIRONMENT=test`. They return
`SOURCE_ONLY_COMMITTED_FACT_VERIFIED_NOT_OPERATIONAL` or
`SOURCE_ONLY_VERSIONED_READ_NOT_OPERATIONAL`; no route imports them.

## 3. Mandatory security / governance and technical qualification

**The source is NOT PostgreSQL-qualified.** SQL parses, object dependency
order, exact security definer semantics, physical account initial creation,
key/issuer enrollment, source records, role inheritance, locking, race
behavior, item-photo trust and real money/stock evidence must be accepted
independently on an authorized PostgreSQL 18.6 disposable database.

The STOP-guarded SQL files are presently separate review sources. A
designated migration engineer must reconcile and combine them into a **single
correct, forward-only, source-hash-pinned approved migration**, replacing
separate STOP blocks only following Gate A. The 0001–0006 hashes stay frozen.
The existing immutable prior history cannot be silently backfilled with
assumed product versions; a nonempty database requires separately approved
historical reconciliation before this forward candidate is executable.

**Known gaps before an operational pilot**:

1. No accepted application API/writer activation; middleware and P0 V1
   rejecting stubs deliberately remain unchanged. No real POST can succeed.
2. Runtime P0 V1 excludes RETURN; prospective P2 SQL supports RETURN, but the
   actual signed RETURN front-end/document transport remains an OPS-F dependency.
3. Pre-provisioned account identities and independently approved
   `ops_a2_source_binding`/transfer governance issuer workflow require
   independent qualification; application code may not mint those approvals.
4. Native SQL readback currently denies requests requiring additional pages;
   versioned consistent-snapshot cursor continuation is not yet qualified.
5. Actual runtime PostgreSQL V2 HMAC/verifier parity, privilege allowlist,
   granted function ownership and deferred seal source correctness are NOT
   verified by TypeScript/Python source CI. Do not report as production-ready.
6. Physical GRN, version-photo and returned-item approval source must be
   enrolled with real identities. Warehouse/location and custody readback
   must be reconciled with original immutable stock-entry history.
7. Real PostgreSQL multi-session conflicts, inventory underflow, duplicate
   source/receipt/serial, split-transfer rollback, no-blind-retry ambiguous
   COMMIT, approval/parent Hold revocation, authentic key/session replay,
   audited return/ACK, recovery and backup/restore are NOT RUN.
8. The program still needs independent Chat 10 security, Chat 11 governance,
   Chat 17 QA source acceptance, protected migration authorization, genuine
   Gate R/Gate A and operational pilot evidence.

## 4. Mandatory negative / positive acceptance tests (actual DB)

Under independently authorized disposable PG18.6, run exact V2 HMAC
parity with Postgres pgcrypto and a frozen SQL/JS test vector. Test scope
denials; malformed/wrong-version original source; cancelled/over-ceiling
GRN; QC pending or rejected; approval no longer qualified, self-approval or
same-person aliases; revoked counter/signing key; active Holds at entity,
site, warehouse, document, item and employee; stale account CAS under
competing sessions; same serial in a different version; correct custody and
original-issue return condition; exact location transfer under concurrent
source/destination postings; deliberate second-leg SQL failure rolls back
both; no half-committed command/outbox/nonce; read-only nonce reconciliation
with original signature and zero retry; independently reconstructed immutable
movement/account balances and audit digests.

Test runtime login effective ACL and SECURITY DEFINER search_path/owner
isolation, PostgreSQL RLS or equivalent bounded protected-function
authorization, non-owner direct DML and function-owner inheritance denial,
readback snapshot/pagination, real browser signed session and full backup/
restore evidence. Any negative failure means technical NO-GO.

## 5. Nonproduction work and ongoing streams

Preserve existing C041/C047/C050 and OPS-A source, P1/P2/P3 authority, no
new stock ledger, independent human approval and all 11 protected HOLD pins.
OPS-B masters/photos and OPS-C GRN/QC source development may continue
separately without destabilizing the protected OPS-A2 source candidate.

The next controlled source package should resolve exact PostgreSQL SQL
dependency/byte-parity findings, qualified account and source-issuer
provisioning, RETURN P0 contract and bounded cursor readback. Once
independently accepted, request a **separate scoped protected database
execution directive**, not an implicit permission from this report.
