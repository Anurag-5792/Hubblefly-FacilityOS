-- P3 Item version signed read qualification: PG NOT RUN.
-- Requires approved HFT photo census, dedicated runtime LOGIN and HMAC proof.
\set ON_ERROR_STOP on
\if :{?item_gallery_query}
\else
 \echo 'STOP P3_GALLERY_QUERY_REQUIRED'
 \quit
\endif
\if :{?item_gallery_proof}
\else
 \echo 'STOP P3_GALLERY_PROOF_REQUIRED'
 \quit
\endif
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_catalog.set_config('hft.test.gallery.q',:'item_gallery_query',true);
SELECT pg_catalog.set_config('hft.test.gallery.proof',:'item_gallery_proof',true);
DO $gallery$
DECLARE q jsonb:=pg_catalog.current_setting('hft.test.gallery.q')::jsonb;
 proof jsonb:=pg_catalog.current_setting('hft.test.gallery.proof')::jsonb;
 r jsonb;v jsonb;p jsonb;forged jsonb;state text;message text;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 OR pg_catalog.current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'P3_GALLERY_REAL_RESTRICTED_LOGIN_REQUIRED'; END IF;
 IF q->>'kind'<>'ITEM' OR q->>'intent'<>'ITEM_GALLERY'
 THEN RAISE EXCEPTION 'P3_GALLERY_FIXTURE_MISMATCH'; END IF;
 r:=hft.p3_read_masters_v1(q,proof);
 IF r->>'state'<>'AVAILABLE' OR
  pg_catalog.jsonb_array_length(r->'records')<>1 OR
  pg_catalog.jsonb_array_length(r->'records'->0->'versions')<1
 THEN RAISE EXCEPTION 'P3_GALLERY_CENSUS_NOT_PRESENT'; END IF;
 FOR v IN SELECT x.value FROM pg_catalog.jsonb_array_elements(
  r->'records'->0->'versions') AS x(value)
 LOOP
  IF (v->>'approvedPrimaryCount')::bigint>1
   OR (v->>'approvedPrimaryCount')::bigint>(v->>'primaryLinkedCount')::bigint
  THEN RAISE EXCEPTION 'P3_GALLERY_FALSE_PRIMARY'; END IF;
  FOR p IN SELECT x.value FROM pg_catalog.jsonb_array_elements(
   v->'photos') AS x(value)
  LOOP
   IF p->>'verification'<>'APPROVED'
   OR p->>'versionCode'<>v->>'versionCode'
   OR (p->>'rightsEvidenceSha256') !~ '^[0-9a-f]{64}$'
   THEN RAISE EXCEPTION 'P3_GALLERY_PHOTO_NOT_VERIFIED'; END IF;
  END LOOP;
 END LOOP;
 FOR forged IN SELECT x.value FROM pg_catalog.jsonb_array_elements(
  pg_catalog.jsonb_build_array(
    q||pg_catalog.jsonb_build_object('recordId','FORGED.ITEM'),
    q||pg_catalog.jsonb_build_object('legalEntityId','FORGED.ENTITY'),
    q||pg_catalog.jsonb_build_object('siteId','FORGED.SITE'),
    q||pg_catalog.jsonb_build_object('warehouseId','FORGED.WH')
  )) AS x(value)
 LOOP
  BEGIN
   PERFORM hft.p3_read_masters_v1(forged,proof);
   RAISE EXCEPTION 'P3_GALLERY_FORGED_SCOPE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   IF state<>'P0001' OR message<>'P3_READ_PROOF_FORMAT_INVALID'
   THEN RAISE EXCEPTION 'P3_GALLERY_WRONG_FORGED_SCOPE_RESULT:%:%',state,message; END IF;
  END;
 END LOOP;
END $gallery$;
SELECT 'P3_GALLERY_SIGNED_READ_ASSERTIONS_PASS' AS result;
COMMIT;
-- Independent auditor verifies no new media, nonce, ledger, audit or revocation.
