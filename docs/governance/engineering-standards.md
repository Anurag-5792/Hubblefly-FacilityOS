# Engineering Standards and Inward Dependency Rule

**Programme:** Hubblefly FacilityOS & ERPNext Program  
**Implementation package:** R1-02  
**Authoritative source:** MASTER-approved R1 SDLC Governance Design **v1.2**, 8 October 2026; historical Design v1.1 technical content remains incorporated in v1.2.  
**Implementation baseline:** S_BOOT `46d2d74c8744ac7d4949604cdd3b7a0466d22e37`; integration target `rebaseline/sdlc-v1`.  
**Status:** R1 DOCUMENTATION IMPLEMENTATION — PENDING INDEPENDENT R1-09 REVIEW AND MASTER PR ACCEPTANCE.

> This implements the previously approved governance contract. It does not itself authorise product changes, GitHub settings, R2–R6, W0-09/W0-10, a merge or a production deployment.

## 3. Engineering architecture and contribution standard

### 3.1 Compile-time dependencies (normative)

**Source-code imports point inward:**

```text
Delivery adapters (React / Next.js route handlers) ---> Application services ---> Domain
Infrastructure adapters (ERPNext, Kysely/pg, Supabase) ---> Application/domain ports and models
Composition root wires concrete implementations to inward-facing interfaces
```

Domain entities/value objects/domain services may depend on domain-owned contracts and approved platform-neutral primitives, not on Next.js, Supabase, PostgreSQL, Kysely, `pg`, external ERP clients or concrete adapter classes. Repository/transaction interfaces are owned by inward application/domain boundaries and must expose domain intent instead of database client types. Application service contracts cannot import outward implementation packages. Infrastructure implements ports and owns persistence mapping; dependency inversion is mandatory. Disallow framework/database-specific types in the public inward contracts.

### 3.2 Runtime call/execution flow (not an import licence)

```text
HTTP adapter → application orchestration → domain/authorization validation
→ transaction port / existing W0-03 UnitOfWork → repository port
→ Kysely/pg adapter → PostgreSQL
```

This is a *call sequence*, not compile-time dependency direction. Continue using the accepted W0-03 UnitOfWork transaction ownership and its server-only boundary. Do not create independent transactions within repositories; do not make network ERP calls during long-held database transactions. Use durable intent/outbox and idempotent workers where applicable. No R1 refactoring of the existing modules is authorised.

### 3.3 Engineering controls

- Every material change requires approved requirement/design, issue, DoR, plan, short-lived branch, CI, independent review, docs, evidence, and acceptance of an exact SHA.
- TypeScript strict, typed interfaces, Zod at untrusted boundaries, safe error serialization, domain intent methods, optimistic concurrency and idempotency where applicable.
- Node 24/pnpm pinned from current repository baseline; use `pnpm install --frozen-lockfile` and preserve `pnpm-lock.yaml` authority.
- No untracked credentials, private inventory files, production data or client-visible ERP secrets in the public repository.
- New dependencies disclose purpose, licence, security advisories, maintenance and lockfile effect. No unapproved new build/security tool within R1.
- Version-controlled Supabase SQL migrations are schema authority. Test clean install and upgrade, constraint/RLS behaviour, generated types and deterministic fingerprint; destructive migration requires separate approval.
- No direct ERP SQL, uncontrolled dual-write, silent architecture drift, opportunistic cross-package refactor, history rewrite or force-push to protected integration branches.
- Any architecture choice changing long-term module contracts, system-of-record authority, security boundary, data migration or deployment model requires accepted ADR/design approval.

## Mandatory inventory, ERPNext and legacy review invariants

## 2. Mandatory business/system boundaries

### 2.1 Inventory Management is core product scope

The complete operational lifecycle includes: Gate Inward → Operational GRN → IQC disposition → storage and physical location → movements → reservations → kitting → issues → manufacturing consumption → returns → physical count → reconciliation → traceability → MIS. Explicit paths cover rejection, hold, shortage, damage, quarantine, exceptions, adjustment and ERP posting eligibility. Inventory is not merely QR screens or a demonstration module.

**Distinct truth dimensions** must be declared per change: (a) actual physical presence/location/container/serial/batch, (b) quality disposition, (c) reservation/availability, (d) production issue and consumption, (e) official ERP ledger/valuation, and (f) ERP posting command/status and reconciliation. Never conflate these states.

**Review vocabulary, not a newly approved runtime state machine:**

| Process | Distinctions to model and test |
|---|---|
| Inward/GRN | Draft, received, pending verification, rejected/returned |
| IQC | Pending, accepted, rejected, held/released |
| Storage | Located, unlocated/exception, in transit |
| Availability | Available, reserved, held, rejected, issued, consumed, dispatched as context requires |
| Movement | Requested, validated, executed, failed/cancelled |
| Kitting/issue | Requested, reserved, released, issued, returned, cancelled |
| Count/reconciliation | Draft, counted, exception, inventory-validated, admin-approved, rejected/returned for correction |
| ERP posting | Not eligible, ready for approval, authorised, pending, posted, failed/reconciliation-required |

These labels are governance examples; an owner must approve exact domain transitions before implementation. Non-negotiable invariant checks: rejected/held material is not usable without authorised disposition; serial/label printing does not create stock; physical location movement does not imply ERP ledger movement; reservation is not consumption; inventory validation and admin approval do not post opening stock; approval stages requiring distinct humans cannot be met by two roles of one human; ERP posting failure must not appear as posted; retries cannot duplicate official documents; adjustment/return/reversal leave auditable evidence.

### 2.2 ERPNext system of record

ERPNext is authoritative for **official stock ledger, item/warehouse-related ERP masters, purchasing and official goods receipts/stock entries, accounting, valuation, invoicing, financial and official ERP manufacturing/dispatch documents**. FacilityOS is authoritative for its operational Sales Requirement/Manufacturing Job, engineering release/PPC, detailed physical locations and containers, operational inward/GRN/IQC evidence, reservations/kitting, route cards, shopfloor/genealogy, As-Built, NCR/rework/test/FG-release evidence, dispatch controls, Installed Base and MRO/As-Maintained, and operational audit. Actual fact ownership must be made explicit at API and migration boundaries.

**Direct ERPNext database writes are prohibited.** An authorised ERP write uses controlled supported API/document services, explicit document mapping, idempotency, retries, compensating transactions and reconciliation. FacilityOS and ERPNext must not have competing official stock-ledger writers. Read-model freshness cannot be mistaken for authoritative stock. An ERP-posting eligibility approval is distinct from successful ERP posting.

### 2.3 Legacy preservation

`frappe_app/` and historical `app/`/`lib/` capabilities remain migration/reference evidence until module-specific replacement, tests, data/evidence mapping, comparison, cutover, reconciliation, recovery strategy and explicit cleanup approval are complete. The nine mandatory deletion preconditions are: (1) replacement implemented, (2) replacement TESTED, (3) historical records mapped, (4) attachment/evidence mapped, (5) materially comparable behaviour verified, (6) migration/cutover performed where required, (7) reconciliation passed, (8) rollback/recovery understood, and (9) cleanup separately accepted. **R1 cannot delete, migrate or structurally relocate legacy assets.**

## Architecture / security / test review checklists

## 6. Security, tests and architecture review checklists

### 6.1 Architecture checklist

- [ ] Source imports obey inward dependency direction; domain/application contracts have no infrastructure/Next.js/Kysely/Supabase/PostgreSQL imports.
- [ ] Runtime call sequence distinguished from source imports; existing W0-03 UnitOfWork contract preserved.
- [ ] One canonical write owner per fact; ERP official stock and FacilityOS operational physical truth separated.
- [ ] Domain invariants outside React/HTTP adapters; no generic business-rule-free direct CRUD escape.
- [ ] Transactions, outbox, concurrency, retry/idempotency and external failure/compensation appropriate.
- [ ] API versions/migrations/ADR, legacy impact and cutover handled without R1 restructuring.

### 6.2 Security checklist

- [ ] Server-trusted actor identity; no client role/capability/scope granting authority.
- [ ] W0-07 server-side scoped authorization and default deny; SUPERUSER never bypasses explicit policy or SoD.
- [ ] W0-08 RLS, FORCE RLS and non-owner/NOBYPASSRLS runtime; direct SQL and pooling negative tests.
- [ ] Migration-function ownership, SECURITY DEFINER fixed search paths/EXECUTE grants, privilege escalation and role-membership checks.
- [ ] Secrets excluded from browser/logs/commits, fail-closed privilege behaviour, controlled public errors.
- [ ] Human dual approval, hold/release and irreversible evidence behaviour negative-tested when applicable.

### 6.3 Testing checklist

- [ ] AC-ID-to-test-to-evidence coverage table complete; tests validate domain invariants, not just counts.
- [ ] Unit, service/adapter contract, database integration and relevant negative/security cases.
- [ ] Fresh migration and upgrades, generated-type/drift/fingerprint, security/role behaviour.
- [ ] ERP API retry/idempotency, partial failure, duplicate prevention and reconciliation when relevant.
- [ ] Inventory reject/hold/return, shortage, count exception, same-human approval denial, post-failure truth.
- [ ] Existing W0-01–W0-08 regression coverage reachable, legacy Frappe Python/23 DocType structural checks preserved.
- [ ] UI/E2E/UAT requirements stated; synthetic/demo data never misrepresented as production verification.

### 6.4 Code-review checklist

- [ ] Scope/design/base SHA matches approved issue and implementation plan.
- [ ] No unrelated mass formatting, dependency, architecture or legacy deletion changes.
- [ ] Types, errors, input validation, pagination/query allowlisting, logging and config safe.
- [ ] DB schema, transactions, concurrency, idempotency and security boundaries are correct.
- [ ] Documentation, test evidence, review signatures and current HEAD are consistent.

### Required review evidence

For any proposed implementation, establish the exact HEAD, complete touched-file graph, no domain or application contract imports of infrastructure modules, application-level UnitOfWork control, DB role/RLS negatives where relevant, reversible operational workflows, package/lockfile delta, actual authoritative ERP integration route, test/CI links and an independently assigned reviewer verdict. These are governance checks only; R1-02 changes no source.
