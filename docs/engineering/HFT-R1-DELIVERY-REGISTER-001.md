# HFT-R1 DELIVERY REGISTER — nonproduction source-only checkpoints

| Milestone | Outcome | Owner-authorized target | Evidence |
| --- | --- | --- | --- |
| 26 October 2026 — original full initial live-use | **MISSED — no qualified working Stores application** | Historical baseline retained | P3 source-only receipt HFT-R1-P3-DELIVERY-002; PostgreSQL/build/browser NOT RUN |
| 1 November 2026 — minimum Stores IN/OUT and counted-item location | **OWNER PRODUCTION GO GRANTED; TECHNICAL GO PENDING** | **1 November 2026** | Owner GO 29 October; mandatory runtime/build/security/approval/physical-cutover acceptance unqualified |

The original 26 October 2026 commitment remains a missed milestone. Neither P2 backend completion nor P3 rendered screens qualify as a live-use release. The owner explicitly issued **production GO for 1 November 2026** as the P0 minimum Stores operational release on 29 October; no repeat owner approval is required. This does **not** waive the existing production acceptance gates or establish a passing release.

Source packages: P1 immutable stock source; P2 protected stock writer review-only; P3 Employee Master pending approval/governed apply and signed DB-scoped read source-only. All real PostgreSQL migration, approvals, key custody, full build, end-to-end UI, and production acceptance remain **NO-GO**.

## P0 Item Master version photographs — binding 29 October 2026 amendment

Every HFT inventory item and **every separately identified product version** must have
at least one verified, rights-cleared PRIMARY image. Historical/retired versions
remain included. Version-to-photo identity uses the exact
`(legal_entity_id,item_code,version_code,media_id)` relation; the existing
`item.version` optimistic record revision is NOT the product version. Missing,
unverified or incorrect photos must not display as complete.

**Current source:** `HFT-R1-P3-ITEM-VERSION-PHOTOS-001.md`,
`lib/hft/domain/item-version-photo.ts`, and reviewed SQL candidate
`db/security/HFT-R1-ITEM-VERSION-PHOTOS-REVIEW.sql`.
This work adds a source contract and Item Master UI disclosure; no HFT media
upload, approved photo dataset, operational version registry, SQL migration,
PostgreSQL or browser qualification is established.

**DD/HFT segregation:** reuse only selected reviewed DD code by
copying/adapting into HFT. Never connect HFT at runtime to DD systems or data;
DD product-photo filenames do not establish HFT item/version identity.
Images from DD, if ever copied, need independently approved rights, exact
version match, file digest and HFT-owned storage.

The original 26 October live-use date remains missed and unrevised.

## Two-part documentation deliverable — binding

Engineering must maintain a restricted internal source/reuse dossier for each copied/adapted module, including provenance, exact changes, rights, security, verification and maintenance. Recipient handover documentation must be separately authored and **source-free**, covering only approved functions, user/admin procedures, support and release acceptance. Public repository paths are not access-control boundaries. See `docs/engineering/HFT-R1-DOCUMENTATION-SEGREGATION-001.md` for the governing rule. Handover drafts are not production evidence; the 1 November P0 target is owner-authorized but still unqualified.

## Binding 1 November P0 Stores IN/OUT and location/count acceptance

**Owner decision:** `HFT-R1-MASTER-STORES-NOV1-001` (29 October 2026). The exact minimum business scope and release-test matrix are documented in `docs/engineering/HFT-R1-MASTER-STORES-NOV1-001.md`.

- All Stores IN: invoice/GRN/QC-accepted material, item/version and serial/batch, quantity, condition, trusted source and **exact destination leaf location** before availability is posted.
- All Stores OUT: authorized employee/work-order issue, item/version, quantity, **exact source leaf location**, custody/consumption, immutable balance and audit. Employee acknowledgement remains separately evidenced.
- Physical COUNT: each counted item/serial/batch and quantity binds to full **warehouse → rack/area → level → position → stack slot → bin/container** path, with separate lines for each bin and count epoch. Count is evidence, not automatic stock creation.
- Physical location changes require authorized transfers or reconciliation preserving origin, destination, quantity and audit. No direct history overwrite; independent opening-count cutover prevents double counting.
- Before any real posting: qualified database/roles/HMAC and distinct humans, real transaction/concurrency/idempotency and negative tests, clean build/browser/QR, backup/restore and owner GO. **If any relevant gate fails, production remains NO-GO even on 1 November**.

**Current delivery blocker:** No qualified Stores IN/OUT/count routes or location-hierarchy workflow; protected writer not runtime accepted, installer evidence HOLD, no lockfile/build/browser acceptance. Escalate to MASTER immediately. No new repository, competing stock engine or unqualified fallback deployment.

**Owner production authorization already issued:** 29 October 2026 for the exact 1 November P0 Stores scope, subject to international production-quality and safety acceptance. All technical/environment/SoD acceptance gates remain independently evidenced; no unqualified deployment is authorized by a date alone.

**Source engineering progress:** `lib/hft/domain/physical-location-count.ts` and `tests/unit/hft-nov1-physical-location-count.test.ts` establish exact physical leaf-path validation, count evidence per item/version/bin and nonposting transfer plans; **19/19 isolated Node 22.16.0 tests PASS**. This is not database-backed In/Out/Count operation. Retain source-only classification until real qualified persistence, API, transaction, browser and restore execution.
