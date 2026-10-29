-- HFT P3 cryptographically scoped DB read negatives, SOURCE ONLY / NOT RUN.
-- Must run with actual nonprivileged P3 runtime LOGIN, authorized disposable
-- PostgreSQL 15+, separately issued test read proof (short-lived).
-- Original signed query/proof must bind the SAME entity, site and warehouse.
-- Real database acceptance requires independent before/after audit snapshots.
\set ON_ERROR_STOP on
\if :{?valid_query}
\else
 \echo 'STOP P3_SIGNED_READ_QUERY_REQUIRED'
 \quit
\endif
\if :{?valid_read_proof}
\else
 \echo 'STOP P3_SIGNED_READ_PROOF_REQUIRED'
 \quit
\endif
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_catalog.set_config('hft.p3.test.read_query',:'valid_query',true);
SELECT pg_catalog.set_config('hft.p3.test.read_proof',:'valid_read_proof',true);
DO $p3_read_negative$
DECLARE q jsonb:=pg_catalog.current_setting('hft.p3.test.read_query')::jsonb;
 proof jsonb:=pg_catalog.current_setting('hft.p3.test.read_proof')::jsonb;
 sample jsonb; response jsonb; variant jsonb;
 state text; message text; expected text;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_p3_master_runtime','MEMBER')
 OR pg_catalog.current_setting('transaction_read_only')<>'on'
 THEN RAISE EXCEPTION 'P3_SIGNED_READ_RESTRICTED_LOGIN_REQUIRED'; END IF;
 response:=hft.p3_read_masters_v1(q,proof);
 IF response->>'state'<>'AVAILABLE'
 OR pg_catalog.jsonb_typeof(response->'records')<>'array'
 THEN RAISE EXCEPTION 'P3_SIGNED_SCOPED_READ_POSITIVE_FAILED'; END IF;
 -- Reuse the ORIGINAL proof unchanged while forging a different requested
 -- entity/site/warehouse or filter: payload digest MUST fail before SELECT.
 FOR variant IN SELECT x.value FROM pg_catalog.jsonb_array_elements(
  pg_catalog.jsonb_build_array(
    q||pg_catalog.jsonb_build_object('legalEntityId','FORGED_ENTITY'),
    q||pg_catalog.jsonb_build_object('siteId','FORGED_SITE'),
    q||pg_catalog.jsonb_build_object('warehouseId','FORGED_WH'),
    q||pg_catalog.jsonb_build_object('search','FORGED_SEARCH')
  )) AS x(value)
 LOOP
  BEGIN
   PERFORM hft.p3_read_masters_v1(variant,proof);
   RAISE EXCEPTION 'P3_CROSS_SCOPE_OR_FILTER_READ_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   IF state<>'P0001' OR message<>'P3_READ_PROOF_FORMAT_INVALID'
   THEN RAISE EXCEPTION 'P3_READ_CROSS_SCOPE_WRONG_RESULT:%:%',state,message; END IF;
  END;
 END LOOP;
 -- Original query with a mutated authenticated person/session/MAC must fail.
 FOR variant IN SELECT x.value FROM pg_catalog.jsonb_array_elements(
  pg_catalog.jsonb_build_array(
    proof||pg_catalog.jsonb_build_object('actorSubject','FORGED_ACTOR'),
    proof||pg_catalog.jsonb_build_object('sessionId','FORGED_SESSION'),
    proof||pg_catalog.jsonb_build_object('macSha256',pg_catalog.repeat('0',64))
  )) AS x(value)
 LOOP
  BEGIN
   PERFORM hft.p3_read_masters_v1(q,variant);
   RAISE EXCEPTION 'P3_FORGED_SIGNED_READ_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   IF state<>'P0001' OR message NOT IN
    ('P3_READ_MAC_INVALID','P3_READ_SIGNING_KEY_INACTIVE')
   THEN RAISE EXCEPTION 'P3_SIGNED_READ_WRONG_REJECTION:%:%',state,message; END IF;
  END;
 END LOOP;
 -- Expired proof MUST be denied, never silently treated as a valid session.
 BEGIN
  PERFORM hft.p3_read_masters_v1(q,
   proof||pg_catalog.jsonb_build_object('expiresAt','1'));
  RAISE EXCEPTION 'P3_EXPIRED_READ_PROOF_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF state<>'P0001' OR message<>'P3_READ_PROOF_EXPIRED'
  THEN RAISE EXCEPTION 'P3_READ_EXPIRY_WRONG_REJECTION:%:%',state,message; END IF;
 END;
END $p3_read_negative$;
-- READ ONLY proves no new command/nonce/audit writes in this transaction.
SELECT 'P3_SIGNED_READ_NEGATIVES_ASSERTED' AS result;
COMMIT;
