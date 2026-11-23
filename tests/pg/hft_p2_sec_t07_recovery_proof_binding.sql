-- P2-SEC-T07: original MAC-bound read-only recovery assertions.
-- AUTHORED / NOT RUN; requires committed synthetic T06 ISSUE-A and a real
-- restricted runtime LOGIN on an approved disposable PG15+ instance.
\set ON_ERROR_STOP on
\if :{?issue_a_payload}
\else
 \echo 'STOP P2_T07_NO_ISSUE_PAYLOAD'
 \quit
\endif
\if :{?issue_a_proof}
\else
 \echo 'STOP P2_T07_NO_ORIGINAL_PROOF'
 \quit
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_catalog.set_config('hft.t07.payload',:'issue_a_payload',true);
SELECT pg_catalog.set_config('hft.t07.proof',:'issue_a_proof',true);
DO $t07$
DECLARE payload jsonb:=pg_catalog.current_setting('hft.t07.payload')::jsonb;
 proof jsonb:=pg_catalog.current_setting('hft.t07.proof')::jsonb;
 recovered jsonb; variant jsonb; state text; message text;
BEGIN
 IF pg_catalog.current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user OR
 NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T07_RESTRICTED_DISPOSABLE_LOGIN_REQUIRED'; END IF;
 recovered:=hft.reconcile_protected_stock_command_v1(payload,proof);
 IF recovered->>'state'<>'COMMITTED_VERIFIED'
 OR recovered->'result'->>'commandId'<>payload->>'commandId'
 THEN RAISE EXCEPTION 'P2_T07_ORIGINAL_PROOF_NOT_VERIFIED'; END IF;
 FOR variant IN SELECT v.value FROM pg_catalog.jsonb_array_elements(
   pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('macSha256',
     (CASE WHEN pg_catalog.left(proof->>'macSha256',1)='0' THEN '1' ELSE '0' END)
      ||pg_catalog.substr(proof->>'macSha256',2)),
    pg_catalog.jsonb_build_object('issuedAt',((proof->>'issuedAt')::bigint+1)::text),
    pg_catalog.jsonb_build_object('expiresAt',((proof->>'expiresAt')::bigint+1)::text),
    pg_catalog.jsonb_build_object('sessionId','FORGED'),
    pg_catalog.jsonb_build_object('actorSubject','FORGED'),
    pg_catalog.jsonb_build_object('proofVersion','FORGED'),
    pg_catalog.jsonb_build_object('keyVersion','0')
   )) AS v(value)
 LOOP
  BEGIN
   PERFORM hft.reconcile_protected_stock_command_v1(payload,proof||variant);
   RAISE EXCEPTION 'P2_T07_FORGED_PROOF_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
   IF state<>'P0001' OR message NOT IN (
     'P2_RECOVERY_ORIGINAL_SIGNED_NONCE_NOT_COMMITTED',
     'P2_RECOVERY_PROOF_ENCODING_INVALID')
   THEN RAISE EXCEPTION 'P2_T07_UNEXPECTED_READBACK_RESULT:%:%',state,message; END IF;
  END;
 END LOOP;
END $t07$;
SELECT 'P2_SEC_T07_ORIGINAL_MAC_BOUND_PASS' AS result;
COMMIT;
