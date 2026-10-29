# HFT-R1 DELIVERY REGISTER — nonproduction source-only checkpoints

| Original live-use date | Current outcome | New authorized date | Evidence |
| --- | --- | --- | --- |
| 26 October 2026 | **MISSED — no qualified working Stores application** | **NONE** | P3 source-only receipt HFT-R1-P3-DELIVERY-002, PR #11 Draft, PostgreSQL/build/browser NOT RUN |

The original 26 October 2026 commitment remains a missed milestone. Neither P2 backend completion nor P3 rendered screens qualify as a live-use release. No replacement date may be inferred from code commits.

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

Engineering must maintain a restricted internal source/reuse dossier for each copied/adapted module, including provenance, exact changes, rights, security, verification and maintenance. Recipient handover documentation must be separately authored and **source-free**, covering only approved functions, user/admin procedures, support and release acceptance. Public repository paths are not access-control boundaries. See `docs/engineering/HFT-R1-DOCUMENTATION-SEGREGATION-001.md` for the governing rule. Handover drafts are not production evidence; no replacement live-use date is authorized.
