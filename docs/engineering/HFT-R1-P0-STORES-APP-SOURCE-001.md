# HFT-R1-P0-STORES-APP-SOURCE-001 — Stores screens and signed preflight

**Authority:** 29 October 2026 owner PRODUCTION GO for 1 November P0 IN/OUT/COUNT/physical-location operation. **Engineering mode:** SOURCE ONLY; **TECHNICAL RELEASE:** NO-GO pending mandatory acceptance.

## Implemented on existing branch and PR #11

- `lib/hft/stores/p0-operations.ts`: Strict versioned request input contract for physical IN, employee OUT, physical COUNT and bin TRANSFER, including company/site/warehouse, product version, exact leaf identifier, quantity/UOM, traceability and action-specific evidence. Enforces exact key sets and rejects injected client approval or posted/stock balance fields. Validation does not imply genuine document/warehouse/location/employee provenance.
- `app/api/hft/stores/prepare/route.ts`: Signed-session and same-origin/CSRF scope validation with bounded UTF-8 JSON body; returns only **VALIDATED_NOT_POSTED, stockChanged=false, durable=false, locationVerified=false, businessAuthorityVerified=false**. All production runtime modes remain denied under existing `assertSecureStartup` pending reviewed operational activation. Never includes a privileged posting token, writes to a DB, issues an approval or claims a count record.
- `app/stores/operations/page.tsx` and local stylesheet: Accessible responsive workbench with IN, OUT, COUNT, TRANSFER structured form, real scope and product-version fields and prominent **NOT SAVED / NOT POSTED** presentation.
- `app/stores/page.tsx`: Integrated workspace link without replacing or bypassing the existing P3 Masters application.
- Unit tests: 18 input/domain cases executed using Node.js v22.16.0, zero failures; the independent TypeScript strict isolated check passed. Signed API tests are authored for exact checkout verification; do not claim they executed until run against original authorization source.

## Critical remaining engineering integration, not completed by this source work

1. **Actual database authority:** qualified PostgreSQL 15+, approved forward migration for P2 protected writer and P3 masters, real runtime roles, approved signer/session/key custody, approved human authorities and security-negative execution.
2. **Location registry:** trusted database-scoped rack→level→position→stack→bin graph and immutable authoritative leaf identity. User-supplied IDs must never act as verified addresses. Approved floor-area exception required for physically inapplicable levels.
3. **GRN/QC and IN:** validated supplier invoice, receipt line and accepted quality source; only a protected writer may atomically add available stock with current source/approval versions.
4. **OUT:** approved active employee/work-order, exact item/location/serial/batch, original source and custody, immutable movement and acknowledgement; work-order-only issuance requires independently approved extension of the existing P2 SQL contract rather than fake employee data.
5. **COUNT:** durable, scoped count session and observed lines with trusted server counter/time, immutable evidence, independent opening-stock/reconciliation and no automatic posting on count alone.
6. **TRANSFER:** one authorized, balanced source/destination movement, not a display field overwrite or separate stock engine. The existing P2 writer lacks TRANSFER kind and must not be forced into RECEIVE/ISSUE to simulate a move.
7. **Readback:** actual stock by scanned item/version/serial/leaf and condition, current stock epoch, invoices, issue/custody, documented audit and honest dashboard.
8. **Qualification:** committed authentic dependency lock, clean CI/build/typecheck/lint, real restricted-login PG/acls/nonce/race/lost-COMMIT tests, two-human policy, responsive E2E, backup/restore and physical counted cutover evidence. No workstation installation or production switch is performed by this package.

**Release stance:** The owner production GO is already given and will not be requested again. It authorizes the goal; it does not establish evidence for technical GO. Fail closed, escalate unqualified items and preserve the original 26 October missed milestone and binding 1 November target. No DD runtime integration; confidential source/reuse dossiers remain in restricted internal records, source-free handover is separately maintained.
