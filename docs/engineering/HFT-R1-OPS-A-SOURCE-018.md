# HFT R1 OPS-A — Version-coupled stock authority and authoritative readback

**Directive:** `HFT-R1-MASTER-V4-OPS-A-SOURCE-018`  
**Date:** 4 November 2026  
**Source baseline:** `d04eb1fd7d937b9d4473c9715f3b3a902fab6b62`  
**Mode:** authorized NONPRODUCTION source engineering; **NO** SQL execution.  
**Gate R:** HOLD; **Gate A:** HOLD; **Production:** NO-GO.

## 1. Source-level decision — one authoritative ledger

The only authoritative operational quantity chain continues to be canonical
`hft.stock_command` → immutable `hft.stock_entry` →
`hft.stock_account`, `hft.employee_custody`,
`hft.stock_command_seal`, `hft.audit_outbox` and immutable source facts.

**No parallel quantity ledger, new stock balance table, donor database, second
writer, direct runtime table DML, or unapproved inventory adjustment is added.**

The existing P2 V1 signed posting payload does **not** contain productVersion;
its currently protected SQL covers RECEIVE, ISSUE, RETURN (not TRANSFER).
`db/security/HFT-R1-P0-STORES-PERSISTENCE-REVIEW.sql` is NONEXECUTABLE
and deliberately contains the rejecting functions
`p0_resolve_authorized_stock_v1` and `p0_read_authoritative_stores_v1`.
They remain unchanged and must not be interpreted as working functions.

The new pure TypeScript module
`lib/hft/persistence/ops-a-versioned-evidence.ts` is a **source-only
immutable fact/reconstruction verifier**, not a posting engine or IAM
authority. It never creates or modifies stock accounts; it expects
authoritative PostgreSQL facts to be supplied *after* a future independently
qualified readback. Source tests supply entirely synthetic facts.

## 2. Functionality actually implemented at source

### Exact versioned stock account identity

Account key SHA-256 is derived using the existing HFT length-prefixed byte
codec and requires the exact tuple:

`legalEntityId, siteId, warehouseId, itemCode, productVersion, controlType,
serialNo, batchNo, leafLocationId, account kind, condition,
custodianEmployeeId`.

Versions are product/manufacturing version identities, not the unrelated P3
Item Master optimistic row version. No version may be inferred from item
code, filename, supplier invoice or a browser field.

One serial number retains a unique legal-entity/item identity across product
versions; it cannot be registered again under another version. Batches remain
lot-specific. Custody is a separate account category, retaining physical
origin, legal owner and exact employee identity; it is NOT included in
available-on-shelf stock.

### Balanced, sealed single-command legs

`verifyVersionedImmutableFact` checks a complete proposed immutable command
and its two committed stock-entry legs, source scope, actor/independent
approver identity, positive quantity and serial-unit requirements, expected
source/destination account revisions and version-coupled account identity.

- RECEIVE: EXTERNAL debit, matching destination AVAILABLE credit; QC evidence.
- ISSUE: exact leaf AVAILABLE debit, same-version employee CUSTODY credit.
- RETURN: original employee/ISSUE, inspected CUSTODY debit, matching
  AVAILABLE/DAMAGED/QUARANTINE credit and exact physical destination.
- TRANSFER: AVAILABLE source leaf debit and distinct AVAILABLE destination
  leaf credit in the SAME command/version/entity/site/warehouse.

Every command requires a balanced pair (debit `-q`, credit `+q`).
Identity or quantity drift, same-account transfer, unsupported condition,
missing inspected return, cross-version/serial or stale optimistic versions
fail closed. Exact movement SHA-256 and audit canonical bytes/digest are
validated as a proposed source protocol. These hashes alone **do not**
authenticate the source; true PostgreSQL authority, immutable seals and
independent key/custody verification remain separate requirements.

### Reconstruction from existing immutable facts

`verifyVersionedLedgerReadback` verifies a **full-history** set of
immutable stock-entry facts against the **same existing** stock-account rows.
It rejects duplicate command IDs, idempotency keys, source actions and
entry IDs; wrong employee/source ISSUE on returns; reused serials across
versions; skipped/stale account revisions; negative quantities; unknown or
duplicated account identities; changed persisted balances; and incomplete
history explicitly flagged as partial.

The reconstructing function is a source-level consistency check only.
It does not establish that PostgreSQL supplied a complete authenticated
snapshot. A future protected SECURITY DEFINER function must prove
completeness, scope, source epoch, immutable audit/seal identity,
opening-stock cutover and pagination **in the database**, and the
application must verify that returned proof before calling it authoritative.
Do not derive operational balances from this in-memory test model.

### Proposed P2 V2 signed payload source reference

`lib/hft/security/ops-a-versioned-invocation.ts` defines a distinct,
**not activated** `HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED` field
contract (33 ordered string fields). It includes productVersion,
serial/batch, both leaf IDs, both distinct account IDs, expected source
and destination account versions, employee/original ISSUE, source document
and fragment, quantity micro, source/policy/approval revisions, approver,
actor and independent QC evidence. The approved payload digest uses the
existing length-prefixed byte codec. A separate synthetic-key HMAC
reference and negative test-vector verifier bind session, payload,
expiry, nonce and key version. No production proof is issued and no
signing key is enrolled or accepted.

The protected SQL candidate contains a matching **SECURITY INVOKER,
REVOKED**, non-authorizing field-order/digest reference using the existing
P2 length-prefixed encoder and trusted hft_crypto digest. A Python
source-contract test checks all 33 JS and SQL field names are exactly
identical in order. Neither this reference digest nor the test HMAC
constitutes a protected P2 writer/receiver: the real future
SECURITY DEFINER must authenticate the session and key, bind the actual
approved source state/revisions, Holds, human independence, account
locks, nonce/replay, seal and audit in the same transaction.

## 3. Prospective forward-only SQL — NOT AUTHORIZED

File: `db/security/HFT-R1-OPS-A-VERSIONED-FORWARD-NONEXECUTABLE-CANDIDATE.sql`.

- **NOT** `db/migrations/0007`; not in the canonical manifest or runner.
- Starts with an unconditional RAISE EXCEPTION
  `OPS_A_PROTECTED_MIGRATION_NOT_AUTHORIZED`.
- Preconditions prohibit silently converting existing posted account,
  serial, custody, GRN, approval, audit or opening history. Historical
  cutover requires separately accepted original evidence.
- Proposes `product_version_code` and site binding on the **existing**
  stock accounts; version and scope FKs; unchanged global serial uniqueness;
  version on immutable stock command, entry, seal and custody; full versioned
  account identity unique index and immutable site/version.
- Proposes entry-level source/target account before/after revision identity,
  unique sequential account versions and deferred command/account/version
  consistency at COMMIT.
- Proposes an **internal review-only reconstruction VIEW** over
  `stock_account` joined to existing `stock_entry`; no new balance table
  and no PUBLIC or runtime reader grant.
- Does **not** activate TRANSFER or replace the existing P2 definer,
  P0 resolver/readback, nonce/HMAC validation, posted fact seals or
  approval/Hold checks. Such replacement requires a separately accepted,
  complete source/migration package; a DDL-only version column does not
  make protected posting safe.

Do not execute, trim out the STOP or promote this file into a migration
merely because source CI passes.

## 4. Explicit still-blocking engineering dependencies

| ID | Needed work | Release consequence |
|---|---|---|
| OPS-A-H01 | Proposed 33-field P2 V2 payload and test-HMAC byte codec are source-authored with JS/SQL parity; **actual** P2 PostgreSQL authentication, protected signed key/actor proof, effective approved source, nonce/replay and SQL issuer remain unimplemented | No approved version-aware posting |
| OPS-A-H02 | Fully revised single SECURITY DEFINER P2 writer and COMMIT-time seal: deterministic source/destination locks, balanced versioned legs, serial/custody state, idempotency, holds, approvals, audit | IN/OUT/TRANSFER/RETURN remain blocked |
| OPS-A-H03 | True version-aware P0 protected resolver, source/receipt/QC verification and separate restricted readback (including full audit reconstruction and pagination) | Current rejecting stubs must stay in force |
| OPS-A-H04 | Approved HFT item/version/PRIMARY-photo, legal/site/warehouse/bin, employee, invoice/GRN/QC and human identity masters | Candidate SQL cannot legitimately resolve source identities |
| OPS-A-H05 | Independent counted opening-stock cutover with frozen session/epoch and no duplicate history | No authoritative opening balance |
| OPS-A-H06 | Effective runtime PG18.6 roles/ACL/RLS/SECURITY DEFINER qualification, real two-person approvals and HMAC key custody | No authorized database writer or reader |
| OPS-A-H07 | Genuine SQL concurrency, rollback, serial races, stale auth, duplicate/replay, lost-COMMIT no-retry, restore and audit reconstruction | No operational acceptance |

The P2 V1 nonce, approval and human identity controls and the P3 master
contract are preserved. A future source proposal may introduce a new signed
P2 version, but must not silently reinterpret the V1 signed bytes or
reuse an earlier Gate A source identity.

## 5. Independent QA / Chat 17 acceptance

**Synthetic source tests:** valid cross-version RECEIVE/ISSUE/RETURN/TRANSFER
single-command legs; receipt and employee custody; balancing and quantities;
serial/batch, wrong item-version/site/bin; duplicate command/action,
idempotency and immutable entry; stale before/after versions; reconstruction
against persisted quantities/versions; return exceeding original ISSUE;
false audit/seal; negative/nonzero external account; no silent transfer
workaround. Static Python tests confirm the candidate STOP, canonical
0001–0006 count, unchanged P0 rejecting stubs, one-ledger schema and HOLD
pins. These tests do not run SQL.

**Mandatory independently witnessed PG18.6 negative tests** (not authorized
here): cross-company/site/warehouse/leaf/version rows; duplicated serial
across warehouses/versions, stale account versions under parallel commits,
competing issue/transfer/return, split-transfer rollback after second
leg failure, inspection and parent-Hold races, frozen history and approved
photo/GRN identity, forged actor/approval/proof and revoked signers, direct
table DML/definer privilege abuse, seal tampering, uncertain COMMIT with
no blind retry, monotonic account versions, complete ledger balance and
real multi-session snapshot consistency. Chat 17 must witness invariants and
original-byte audit/backup recovery before operational acceptance.

**Release proof requires** one authorized online PostgreSQL staging target,
independently witnessed role and key enrollment, exact branch source-bound
migration, correct version catalog and opening cutover, real operator and
independent approver, real source docs, actual committed balance/custody
readback, audit reconstruction, online app route tests, backup/restore and
separate Gate R and Gate A. No dates or percentages are inferred.

## 6. Parallel work and exclusions

OPS-B can complete approved Employee/Item/Supplier/Warehouse/Location
masters and HFT-owned version photograph intake/rights in parallel.
OPS-C can complete invoice/GRN/partial receipt and independent QC sources
in parallel. Neither can authorize stock posting before OPS-A-H01..H07.
Post-pilot analytics, manufacturing/WIP, ERPNext Phase 2 and DD MRO are
outside this OPS-A source correction. Donor-source rights remain governed
by COPY → ISOLATE → ADAPT → TEST → INTEGRATE → VERIFY.

No original private donor code, donor database/stock writer, new stock
ledger, protected migration modification, production IAM grants, Neon
action, trust-pin change or PR merge is permitted by OPS-A.
