-- HFT R1 Item Master version/photo data model — REVIEW ONLY, NOT AN EXECUTABLE MIGRATION.
-- Phase 1 standalone HFT; source-owned and approved HFT media only. NO DD runtime connection.
-- This candidate is outside db/migrations; DO NOT RUN, apply, or auto-promote.
-- Require owner-approved version census, effective ACL/approvals, media storage and
-- migration preflight for existing items BEFORE a future forward migration.
BEGIN;
-- Every version is a product/manufacturing identity, not item.version (master-row revision).
CREATE TABLE hft.item_version_catalog (
 legal_entity_id text NOT NULL,
 item_code text NOT NULL,
 version_code text NOT NULL CHECK(version_code ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'),
 state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','ACTIVE','RETIRED')),
 introduced_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 created_by text NOT NULL,
 PRIMARY KEY(legal_entity_id,item_code,version_code),
 FOREIGN KEY(legal_entity_id,item_code) REFERENCES hft.item(legal_entity_id,item_code)
);
-- Media metadata is NOT evidence that bytes were ingested. HFT media service must
-- verify SHA-256 from actual bytes, MIME magic, dimensions and sanitized EXIF.
-- Source approval must include legal rights for a copied DD asset.
CREATE TABLE hft.item_photo_asset (
 legal_entity_id text NOT NULL,
 item_code text NOT NULL,
 captured_version_code text NOT NULL,
 media_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 15000000),
 width integer NOT NULL CHECK(width BETWEEN 128 AND 10000),
 height integer NOT NULL CHECK(height BETWEEN 128 AND 10000),
 storage_key text NOT NULL CHECK(storage_key LIKE 'hft-item-media/%'),
 source text NOT NULL CHECK(source IN ('HFT_CAPTURE','DD_CODE_ASSET_COPY','SUPPLIER')),
 rights_evidence_sha256 text CHECK(rights_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 review_state text NOT NULL DEFAULT 'PENDING' CHECK(review_state IN ('PENDING','APPROVED','REJECTED')),
 verified_by text,verified_at timestamptz,
 PRIMARY KEY(legal_entity_id,item_code,captured_version_code,media_id),
 FOREIGN KEY(legal_entity_id,item_code,captured_version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 CHECK(review_state<>'APPROVED' OR (rights_evidence_sha256 IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
-- One photo may have multiple roles only through explicit new entries; the same
-- asset is bound to exactly one version and cannot silently label another one.
CREATE TABLE hft.item_version_photo_link (
 legal_entity_id text NOT NULL,
 item_code text NOT NULL,
 version_code text NOT NULL,
 media_id uuid NOT NULL,
 photo_role text NOT NULL CHECK(photo_role IN ('PRIMARY','FRONT','SIDE','BACK','LABEL','DETAIL')),
 active boolean NOT NULL DEFAULT true,
 linked_by text NOT NULL, linked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(legal_entity_id,item_code,version_code,media_id),
 FOREIGN KEY(legal_entity_id,item_code,version_code,media_id)
 REFERENCES hft.item_photo_asset(legal_entity_id,item_code,captured_version_code,media_id)
);
CREATE UNIQUE INDEX item_version_one_active_primary_v1 ON hft.item_version_photo_link
 (legal_entity_id,item_code,version_code)
 WHERE active AND photo_role='PRIMARY';
-- All link state changes require a separately governed approval + immutable audit.
-- Runtime must have no direct UPDATE/DELETE on version, media or photo-link rows.
-- A future activation guard MUST reject ACTIVE versions lacking one approved,
-- rights-cleared primary image. Historic RETIRED rows must remain in coverage.
CREATE VIEW hft.item_version_photo_coverage_v1 AS
 SELECT v.legal_entity_id,v.item_code,v.version_code,v.state,
 COUNT(l.media_id) FILTER(WHERE l.active) AS linked_count,
 COUNT(l.media_id) FILTER(WHERE l.active AND a.review_state='APPROVED'
  AND a.rights_evidence_sha256 IS NOT NULL) AS approved_count,
 COUNT(l.media_id) FILTER(WHERE l.active AND l.photo_role='PRIMARY'
  AND a.review_state='APPROVED' AND a.rights_evidence_sha256 IS NOT NULL) AS approved_primary_count
 FROM hft.item_version_catalog v
 LEFT JOIN hft.item_version_photo_link l
 ON l.legal_entity_id=v.legal_entity_id AND l.item_code=v.item_code
 AND l.version_code=v.version_code
 LEFT JOIN hft.item_photo_asset a
 ON a.legal_entity_id=l.legal_entity_id AND a.item_code=l.item_code
 AND a.captured_version_code=l.version_code AND a.media_id=l.media_id
 GROUP BY v.legal_entity_id,v.item_code,v.version_code,v.state;
-- This view is a REVIEW surface. Do NOT grant broad shared runtime SELECT;
-- qualified, scoped HFT-owned read function with independent auth is required.
COMMIT;
