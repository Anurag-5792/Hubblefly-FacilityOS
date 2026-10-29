# HFT-R1-EXISTING-ASSET-REUSE-001 — GitHub reuse-first engineering assessment

**Programme:** Hubblefly FacilityOS, Phase 1 standalone operational stock authority.
**Status:** NONPRODUCTION SOURCE ONLY; no remote HR data was accessed, imported or changed.
**Review date:** 29 October 2026. **Production:** NO-GO. **Delivery:** 26 October 2026 live target missed and unchanged.

## Accessible repository discovery and source evidence

The connected GitHub integration listed 39 accessible repositories across
`Anurag-5792` and `Drone-Destination-Limited`. The repositories below were
selected because their trees or inspected files overlap with FacilityOS.
This is not a claim of independently qualifying or executing 39 applications.

| Existing asset (pinned main commit) | Concrete reuse finding | Boundary and required work |
|---|---|---|
| `Drone-Destination-Limited/Drone-Destination-SBAI` (`ec1f2d49e147c1148c359097c5a16cb38bbdd45f`) | `app/api/(software)/hr/employees/route.ts`; `.../attendance/route.ts`; `.../leaves/route.ts`; HR employees/attendance/leave/payslip pages, employee form and access route | Reuse screen patterns, fields, HR source identifiers and approved workflows; do **not** copy its MongoDB authority, Clerk session, raw HR API or personnel secrets into HFT. |
| `Drone-Destination-Limited/AI-MIS-System` (`25ff3b6ff4ecbba14463012570e13df202046872`) | `app/api/hr/employees/route.ts`, `app/api/hr/attendance/route.ts`, `lib/models/Employee.ts` | Reference for employee/attendance reporting. Verify legal employer and data ownership before any HFT import. Existing employee schema includes banking/identity/compensation fields not needed by Stores. |
| `Drone-Destination-Limited/Drone-Destination-Monorepo` (`2fa14240b706a7eeaa0db4081a135833836ed63d`) | `apps/aimis` employee/attendance source; `apps/inventory` suppliers, warehouses, inventory transactions, transfers, employees and stock UI | Reuse operational UI concepts and explicit source identifiers; **do not** migrate MongoDB stock writes or employee cross-DB joins as an alternative to P1/P2 protected PostgreSQL ledger. |
| `Drone-Destination-Limited/warehouse-management` (`1587d69180d088d1307b5b08483400097045ae37`) | Next.js warehouse application with inventory-style screens and components | Assess reusable UX and fields, not as a second stock system of record. |
| `Drone-Destination-Limited/Stock-Inventory-Management-System--NextJS-FullStack` (`a23910e653c6337808020011dc78d88c35214476`) | Inventory UX/reference; MongoDB/Prisma-style application per repository description | Reference only; no stock authority or unqualified runtime code reuse. |
| `Anurag-5792/Hubblefly-FacilityOS` (existing branch `engineering/hft-r1-stores-foundation`) | P1 immutable ledger, P2 protected-writer candidate, P3 employee/store master UI and pending-request API | **Only production implementation repository.** Do not fork, copy unsafe authorization shortcuts or change approved P1 migrations. |

## Legacy integration security boundary

The source repositories contain interfaces and data models that cannot be
promoted directly into HFT without their owners' explicit source review.
Authentication, employer/tenant scope, data minimization, audit provenance
and transactional semantics must be independently qualified before reuse.

**Confidential security findings about private repositories belong in
restricted owner-controlled reviews, not a public HFT repository.** This
public reuse register intentionally excludes any private endpoint weakness,
personal fields, exploitable route conditions, sample personnel records
or credentials. No legacy runtime endpoint or production HR record was used.

## Additional high-value assets located

| Existing source (main revision) | Reusable surface | HFT disposition |
|---|---|---|
| `Drone-Destination-Limited/warehouse-management` (`1587d69180d088d1307b5b08483400097045ae37`) | Product/serial screens, QR labels and a `public/products/` photo collection | Evaluate image rights, SKU/version match and media provenance before any HFT photo import; never invent a photo-to-item match. |
| `Drone-Destination-Limited/qr-label-system` (`91ede6b853c69f23b2069c31357dd506b98907a7`) | Product instances, labels, serial identifiers | Reuse label/serial UX concepts only; require canonical HFT asset identity. |
| `Drone-Destination-Limited/Scan-QR-to-PDF` (`5746f562cc978f61af7b361f95075389537a1cfb`) | QR-scanner UI, PDF/label presentation | Assess portable client components without copying unsupported scanning authority. |
| `Drone-Destination-Limited/QR-To-Excel` (`b5e47047b7af2df1c59abb96e189e639eb06e548`) | QR-based data capture/export | Reference workflow only; HFT exports require scoped permissions and audit. |
| `Drone-Destination-Limited/Tool-Certificate-to-Excel` (`72e63efc0a633014c94df8529a0f454cf4d90205`) | Certificate-to-record extraction script | Possible separately validated document-ingestion utility; never authorize a master edit from unverified extraction. |
| `Drone-Destination-Limited/MIS-Agentic-AI` (`f0f167d7fd06fe3919df3a26f83276ad592b6cd1`) | Management reporting interaction | UI/research reference; HFT metrics must come from qualified HFT accounts and approved evidence. |


## Reuse contract implemented in this revision

`lib/hft/integrations/hrms-employee-source.ts` is a *pure*, side-effect-free
reference normalizer. It deliberately supports the different employee field
names in existing SBAI and AIMIS source records, then creates **only** a
`HFT-R1-P3-MASTER-V1` inactive CREATE request candidate with scope, source
commit, source checksum and an explicit unverified/prospective status.

- Source `company` must match the explicitly supplied legal-employer label;
  a `clientName`, shared MongoDB database or company nickname cannot establish
  HFT employee authority.
- The source's active status is retained only for comparison; it never activates
  an HFT Employee Master.
- Bank details, PAN/Aadhaar, salary, personal contacts, birth dates, leave and
  attendance content are not copied into the FacilityOS employee candidate.
- Source fingerprint is an **identifier**, not proof the HRMS issuer authenticated
  the export. Only an independently accepted export/identity connector may make
  that assertion in a later scoped implementation.
- A candidate is not inserted into PostgreSQL, does not call `p3_submit_master_change_v1`,
  does not use any protected writer, and does not approve any HR change.
- Duplicate employee IDs or request IDs fail the entire proposed batch.

Unit tests: `node --experimental-strip-types --test tests/unit/hft-hrms-employee-source.test.ts`.
Record exact executed Node version, pass counts and environment separately.

## Integration sequence (no duplicate HRMS)

**HRMS:** The existing HRMS remains the owner of its verified human-resources
records and attendance. First establish an appropriately scoped, authenticated,
versioned, minimal-field HR employee reference service with an independently
approved legal-entity/employee ID mapping. Do not use the existing broad public
employee listing or directly couple HFT to a foreign MongoDB credential.

**FacilityOS:** P3 remains the owner of local manufacturing eligibility,
Employee Master approval and activation; P2 remains the **sole** operational
stock/custody writer. Source imports produce pending approval requests and are
subject to genuine human approval, scope and immutable audit.

**Stores UX:** Reuse valid warehouse/supplier/inventory interaction patterns
from `apps/inventory` and `warehouse-management` while connecting only to
FacilityOS protected commands. Do not implement or activate a second ledger.

**Attendance:** Where required for HFT's own employees, integrate the existing
HRMS attendance authority through an approved read-only, scoped interface;
never infer possession, stock authorization or human approval from attendance.

**MIS:** Reuse chart and filtering patterns; metrics must come from qualified
FacilityOS data, never static previews or legacy cross-entity aggregation.

## Still required before any live claim

- Source ownership/licensing and human-resources data sharing approved across
  companies and repositories; identify the actual canonical HRMS service.
- Independent security review and correction of legacy employee APIs.
- A trusted source-to-HFT identity mapping and authenticated export mechanism.
- Existing P3 independently approved master APPLY, P2 protected stock writer,
  database-scoped reads, safe runtime key custody and actual PostgreSQL tests.
- Real reproducible build, driver/lockfile installation approval, browser E2E,
  operational audit and backup/restore, and genuinely independent approvers.

**Do not confuse this source-only reuse connector with live HRMS integration,
working Employee Master, or production FacilityOS.** The agreed 26 October
live-use milestone remains missed; no replacement date has been authorized.
