-- Run only after a deliberately rejected revision 0005 application attempt.
-- Must return one unchanged legacy GRN and NO recorded v5 revision.
DO $$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user <> 'hft_engineering'
 THEN RAISE EXCEPTION 'QA002_DISPOSABLE_DB_IDENTITY_REQUIRED'; END IF;
 IF (SELECT count(*) FROM hft.schema_revision WHERE version=5)<>0
 OR (SELECT count(*) FROM hft.grn WHERE id='00000000-0000-4000-8000-000000000201')<>1
 OR (SELECT count(*) FROM hft.grn WHERE invoice_key='LEGACY-ONLY' AND status='DRAFT')<>1
 THEN RAISE EXCEPTION 'QA002_HISTORICAL_ROLLBACK_OR_HISTORY_INTEGRITY_FAILED'; END IF;
END $$;
SELECT current_database() AS database_name, current_user AS database_role,
 (SELECT count(*) FROM hft.grn WHERE invoice_key='LEGACY-ONLY') AS preserved_legacy_grn,
 (SELECT count(*) FROM hft.schema_revision WHERE version=5) AS forbidden_revision_5;
