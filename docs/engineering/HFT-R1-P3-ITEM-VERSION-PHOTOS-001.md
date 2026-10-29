# HFT R1 — Item Master: photographs for **every** item version

**Directive:** HFT-R1-MASTER-P3-ITEM-VERSION-PHOTOS-001. **Priority:** P0, current overdue Stores delivery.
**Decision date:** 29 October 2026. **Production:** NO-GO. **Mode:** nonproduction source contract only.

## Binding product requirement

Every legal-entity-owned inventory item shall have an authoritative list of **all**
product/manufacturing versions, including active, draft, superseded and retired
versions. Each listed version shall have **at least one independently verified,
rights-cleared PRIMARY photograph**, with optional front/side/back/label/detail
views. A version missing that photograph is `MISSING_PRIMARY` or
`PENDING_VERIFICATION`, never marked `COMPLETE`. Item Master lists and details
must surface exact version-photo coverage and never show an unrelated placeholder
as an approved inventory photograph.

**Do not confuse `item.version` with `item_version.version_code`.** The existing
`hft.item.version` is the optimistic master-record revision. Product versions
need their own stable version identifiers such as `REV-A`, `REV-B` or `V2`.
Existing versions/serial-batch genealogy must never be overwritten by an item
master edit or a new version's image.

## Authoritative linking model

- `hft.item`: `(legal_entity_id, item_code)` identifies the HFT item family.
- `hft.item_version_catalog`: `(legal_entity_id, item_code, version_code)`
  identifies one immutable product/manufacturing version. Historical versions
  remain visible even after retirement.
- `hft.item_photo_asset`: `media_id`, the **captured version code**, HFT-owned
  storage key, actual-byte SHA-256, supported MIME, dimensions, source, approved
  reuse rights, verification state and verifier/decision evidence.
- `hft.item_version_photo_link`: explicit composite link
  `(legal_entity_id, item_code, version_code, media_id)`, photo role
  (`PRIMARY`, `FRONT`, `SIDE`, `BACK`, `LABEL`, `DETAIL`) and governed active
  state. The asset's captured-version identity must match the link exactly.
- At most one **active PRIMARY** link per product version; **exactly one approved
  PRIMARY** is required to claim photo completeness or to release/activate a
  newly versioned product. Additional images are version-specific.
- Replacing an image requires new approved evidence, preserved historical media
  and an immutable revocation/replacement decision. Never silently reassign an
  older-version image to a newer version, even when filenames look alike.

## DD source-code reuse policy — COPY, NOT CONNECT

HFT is a separate manufacturing organization. Copy only reviewed, legally
reusable **code** from existing DD HRMS, inventory, warehouse, QR and photo UI
sources into `Anurag-5792/Hubblefly-FacilityOS` and adapt it to HFT identity,
local PostgreSQL and guarded approval/stock contracts. **No DD API, MongoDB,
attendance system, inventory ledger or runtime data connection to FacilityOS.**

The DD warehouse repository contains product image files, but their filenames
are not authoritative HFT SKU/version links. Do not autoimport or display them
as HFT photographs. A separately authorized owner may copy approved media bytes
into HFT-owned storage **only after** confirming image ownership, matching exact
HFT item/version, rights, provenance and content SHA-256. No real DD or HFT
personnel/inventory records were accessed for this source contract.

The earlier side-effect-free `hrms-employee-source.ts` compatibility helper is
**not a runtime connector**; no DD data sync or cross-company HR database import
is part of the current delivery. Copy and adapt safe UI/validation code locally.

## Intake, rights and UI

The operational Item Master must support HFT-owned upload/capture, preview,
multiple images/angles, primary selection, replace/revoke history, per-version
browsing and a coverage exception report. The uploader must independently verify
actual bytes and SHA-256, actual MIME/magic, dimensions, malware and EXIF policy,
size <=15 MB and least-privilege protected media storage. Use allowed JPEG, PNG
or WebP only. Don't rely on filename extension or claimed upload MIME.

Media read/download must enforce HFT legal entity, item and version scopes. No
public DD-image hotlinks. An original image may be retired or replaced only under
governed evidence with protected retention. Source files alone do not provision
storage, access controls or a trustworthy media verification service.

The initial Item Master UI now displays the photo-by-version requirement and
**truthfully states that upload and approved HFT media have not been enabled**.
The P3 master request currently accepts only `uom` and `controlType` for ITEM;
photo/version records are a distinct governed child workflow, not silently
inserted into the existing signed change payload.

## P0 delivery and acceptance

1. HFT Item Master version census lists every recorded SKU version, including
   retired ones; independent physical/catalog reconciliation prevents omitted
   historic versions from producing a false all-covered result.
2. Select an item and version; upload photo to HFT-only storage; verify bytes,
   MIME/magic, digest, dimensions and rights; separately approve with audit.
3. Link via exact `(legal_entity_id,item_code,version_code,media_id)`. A photo
   belonging to V1 cannot be assigned to V2 just by changing a label. More than
   one active PRIMARY is rejected. Valid multiple angles are supported.
4. Require one approved PRIMARY for **every version** before Item photo coverage
   status can become COMPLETE. Newly active/released versions without a verified
   primary must be denied; historic gaps stay visible for remediation, without
   corrupting existing stock records.
5. Item detail, search, version history and QR/serial traceability display the
   appropriate approved version image only when the exact version is known.
6. Actual PostgreSQL tests: per-entity row isolation, duplicate-primary denial,
   cross-item/version denial, immutable media/revocation, append-only evidence,
   approved activation, historical gap handling and concurrent photo/approval
   updates under real restricted-role credentials.
7. Real-media tests: JPEG/PNG/WebP valid bytes, truncated/altered bytes, MIME
   spoofing, malformed/oversized files, EXIF/privacy, wrong rights, missing
   underlying blob, independent storage readback and failed upload rollback.
8. Full application: supported UI/browser tests upload, preview, gallery,
   cover status, version selector and denied actions; image is not claimed
   usable before exact version linking/storage persistence passes.

## Current implementation evidence

- `lib/hft/domain/item-version-photo.ts`: pure item/photo-version association,
  rights/status, SHA-256 and coverage checks; **no DB/media write**.
- `tests/unit/hft-item-version-photo.test.ts`: isolated Node source tests,
  covering missing historical photos, wrong versions, duplicate primaries,
  cross-company images, copied-DD rights, corrupted bytes and MIME/size limits.
- `db/security/HFT-R1-ITEM-VERSION-PHOTOS-REVIEW.sql`: candidate normalized
  tables and coverage view. This is **NOT** a canonical migration; not compiled
  or executed, and cannot receive runtime grants without independent review.

**Still not qualified:** actual Item Master version list, approved photo
inventory, uploaded HFT bytes, true storage permissions, SQL migration,
real PostgreSQL tests, UI upload, authenticated approvals, clean build/browser
and production. No production release or replacement deadline is authorized.

## Actual source test receipt — 29 October 2026

Executed in the isolated ChatGPT engineering runtime using Node.js `v22.16.0`:

`node --experimental-strip-types --test tests/unit/hft-item-version-photo.test.ts`

**17 PASSED, 0 FAILED, process exit 0.** Covers all-version coverage,
retired and draft versions, explicit primary, additional views, duplicate
primary and duplicate links, cross-entity and wrong-version links,
nonapproved/rights-pending DD-copy metadata, unsafe media metadata, exact byte
SHA-256 and changed-byte rejection. The test uses synthetic in-memory media,
not actual HFT photographs or persistent data. It is **not** a clean full
FacilityOS checkout test, PostgreSQL execution, media upload, or browser E2E.
