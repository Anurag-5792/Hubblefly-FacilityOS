# HFT-R1-MASTER-V3-CODEBASE-HYGIENE-017 — source inventory and cleanup evidence

Date: 31 October 2026. Repository: Anurag-5792/Hubblefly-FacilityOS.
Authority: MASTER V3 directive 017, existing engineering branch, draft PR #11.
Scope: nonproduction source hygiene alongside Neon staging integration.
Production technical status remains NO-GO.

## Audited baseline and method

At baseline 9677ceb, Git reported 191 tracked files, including 85
JavaScript/TypeScript modules. AST-based relative-import traversal found no
unresolved relative module references. Application + middleware + tools had
18 production entrypoints and 40 reachable JS/TS modules. Strict TypeScript
unused-local and unused-parameter verification passed before cleanup.

The current tracked source was scanned for generated files, environment
files, executable binaries, certificate/private-key files, high-confidence
access keys and password-bearing Neon connection strings, without printing
any matched contents. Result: no detected high-confidence secret matches in
the current tracked tree. An additional read-only Git-history scan fetched complete available
repository history (1,349 Git objects, 430 blobs) and found zero matches for
the defined high-confidence private-key, GitHub token, AWS key and
password-bearing Neon URL signatures, plus zero historical sensitive-filename
matches. It did not print credential contents. These checks do not establish
the absence of every possible secret, external fork exposure, unrelated
connected-app secrets or lower-confidence token formats. Independent security
review and provider-side secret-scanning alerts remain required.
Independent security review and full Git history scanning remain necessary.

The runtime was examined for direct stock-account, stock-command, stock-entry,
serial-registry and custody DML. One competing legacy test-only adapter was
identified in lib/hft/persistence/post-stock-command.ts; no active application
route imported it. It is now isolated under tests/legacy and retained for its
existing two scripted regression suites. This prevents accidental production
import without discarding historic source evidence.

## File classification

| Class | Files/area | Decision and reason |
|---|---|---|
| CONSOLIDATE | Former lib/hft/persistence/post-stock-command.ts | Relocated to tests/legacy/hft-p1-post-stock-command.ts; unqualified direct-table P1 adapter cannot serve as runtime writer |
| RETAIN | lib/hft/persistence/protected-stock-posting.ts | Only protected P2 stock-authority source candidate; further SQL/database acceptance remains required |
| RETAIN | app/api/hft/stores/submit, read, prepare | Preparation, posting candidate and safe readback are different controlled contracts; removal would compromise accepted boundaries |
| RETAIN | db/migrations/0001 through 0006 and manifest.v1.json | Exact migration identities independently guarded by SHA-256 |
| ARCHIVE (already correctly located) | db/provenance/rejected-0005 and superseded-0006 | Immutable historical provenance retained outside executable migrations |
| REVIEW REQUIRED | db/security review SQL, P0/P2/P3 candidates | Approval and source evidence dependencies; never silently execute or delete |
| REVIEW REQUIRED | lib/domain/types.ts | Unreferenced generic QR/genealogy definitions; QR workflows remain an approved requirement, so do not remove without domain review |
| REVIEW REQUIRED | Other test-only lib/hft domain/persistence modules | Pure P1/P2 contract/reference algorithms with active tests; not proven safely disposable |
| REVIEW REQUIRED | middleware.ts and current Stores operations UI | Intentionally deny unqualified mutation; UI currently uses preparation-only endpoint; do not make fake posting operational by deleting guards |
| REMOVE | Tracked generated assets, local env secrets, accidental archives | No such tracked files detected in this revision; ignore patterns extended to prevent recurrence |

## Dependencies and configuration

Current pinned dependencies are Next.js, React, PostgreSQL node driver and
required TypeScript/ESLint toolchain. The PostgreSQL driver is loaded through
server-only runtime paths, so a simple static import count would incorrectly
treat it as unused. Types for PostgreSQL remain approved integration support.
No dependency removed without evidence.

The PostCSS security override remains as previously qualified. Runtime
repository Node 22 engines override Vercel project's displayed Node 24
preference during build; coordinate target-version settings through Chat 13.
No new database packages, auth bypass or stock ledger were introduced.

Git ignore patterns now cover generated Next/TS/Python outputs, local secret
files and development artifacts. The hygiene gate runs in npm verify and
checks the tracked manifest, canonical migration hashes, high-confidence
secrets and absence of direct stock DML from runtime source. TypeScript
unused-locals and unused-parameters checks remain mandatory in CI.

## Online Neon staging boundary

Actual Vercel Preview read-only Neon discovery at source 9677ceb confirmed
PostgreSQL 18, client TLS certificate validation, READ ONLY transaction,
matching staging database/login and absence of HFT schema, ledger and
protected writer. Current staging login has owner-like privileges.
No DDL, migration, stock posting, genuine human approval, transfer, physical
count persistence, browser-to-database POST or backup/restore was executed.

Remaining critical engineering and independent qualification:
- Chat 13: qualified Neon staging roles, schema migrations, secrets and restore
- Chat 10 and Chat 11: least privileges, key/human approvals, holds, audit
- Chat 17: real concurrency, rollback, negative stock, browser and recovery
- Chat 04: actual witnessed Stores locations/GRNs/counts/custody acceptance
- Chat 16: finish version-aware protected writer and physical COUNT/TRANSFER,
  route the UI only after DB authority qualification, and resolve all gates

No production promotion, PR merge, blanket migration authority or release GO
is established by this cleanup.

