-- HF13-R77 FIRST-RECORD MVP: RESTRICTED CORPORATE/P3 ROLE CLOSURE CANDIDATE
-- REVIEW ONLY, STOP-GUARDED: original master data and stock writer remain untouched.
-- Source pin: 5fe71565a2b0343ffd4a2ec5a25be5e0dfce27cc
-- Target: Neon wandering-cake-50222227/br-shiny-night-b3qgsj8t,
-- database hft_r1_retained_masters_np077, PostgreSQL 180007.
-- MUST run only AFTER: canonical 0001-0006 + approved P2 crypto/session/human
-- dependencies, stage 40 corporate function DDL, stage 50 retained P3 DDL,
-- independently attested actual (remote) TLS and explicit technical approval.
BEGIN;
DO $HF13_MVP_ROLE_GRANT_HOLD$
BEGIN
 RAISE EXCEPTION 'HF13_MVP_ROLE_GRANTS_REQUIRE_SEPARATE_TECHNICAL_ADMISSION';
END $HF13_MVP_ROLE_GRANT_HOLD$;
DO $HF13_MVP_ROLE_PREFLIGHT$
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR pg_is_in_recovery()
 OR session_user<>'hft_engineering' OR current_user<>session_user
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN ('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version=6
   AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 OR to_regprocedure('hft.p3_read_masters_v1(jsonb,jsonb)') IS NULL
 OR to_regprocedure('hft.p3_submit_master_change_v1(jsonb,jsonb)') IS NULL
 OR to_regprocedure('hft.p3_decide_apply_employee_v1(jsonb,jsonb)') IS NULL
 OR to_regprocedure('hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)') IS NULL
 OR to_regrole('hft_r1_p3_corporate_bootstrap_owner') IS NULL
 OR to_regrole('hft_r1_p3_corporate_bootstrap_runtime') IS NULL
 OR to_regrole('hft_r1_p3_master_runtime') IS NULL
 OR to_regrole('hft_r1_retained_p3_login') IS NULL
 OR to_regrole('hft_r1_corporate077_login') IS NULL
 OR pg_has_role('hft_r1_retained_p3_login',
                'hft_r1_p3_corporate_bootstrap_owner','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_corporate077_login','hft_r1_p3_master_runtime','MEMBER')
 THEN RAISE EXCEPTION 'HF13_MVP_RESOURCE_DEPENDENCY_OR_IDENTITY_MISMATCH'; END IF;
END $HF13_MVP_ROLE_PREFLIGHT$;

-- The corporate bootstrap SECDEF owner is a separate NOLOGIN authority.
-- Corporate order/key enrollment and its original signed execution are NOT
-- authorized by granting this function privilege.
GRANT USAGE ON SCHEMA hft,hft_crypto,hft_secret
 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT USAGE ON SCHEMA hft TO hft_r1_p3_corporate_bootstrap_runtime;
GRANT SELECT ON hft.posting_session,hft.p3_corporate_bootstrap_order_v1,
 hft.p3_corporate_bootstrap_receipt_v1,hft.legal_entity,hft.site,
 hft.warehouse TO hft_r1_p3_corporate_bootstrap_owner;
-- SELECT FOR UPDATE on the independent order requires UPDATE privilege.
-- The immutable source-order trigger still rejects actual UPDATE and DELETE.
GRANT UPDATE ON hft.p3_corporate_bootstrap_order_v1
 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT SELECT ON hft_secret.p3_corporate_bootstrap_key_v1
 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT INSERT ON hft.legal_entity,hft.site,hft.warehouse,
 hft.p3_corporate_bootstrap_receipt_v1
 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT EXECUTE ON FUNCTION hft.p2_length_prefixed_v1(text[]),
 hft_crypto.hmac(bytea,bytea,text),
 hft_crypto.digest(bytea,text)
 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT CREATE ON SCHEMA hft TO hft_r1_p3_corporate_bootstrap_owner;
ALTER FUNCTION hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)
 OWNER TO hft_r1_p3_corporate_bootstrap_owner;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_p3_corporate_bootstrap_owner;

REVOKE ALL ON FUNCTION hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime,
 hft_r1_retained_p3_login;
GRANT EXECUTE ON FUNCTION hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)
 TO hft_r1_p3_corporate_bootstrap_runtime;

-- P3 base migration already grants EXACT THREE protected P3 functions
-- to hft_r1_p3_master_runtime. Do not widen for nonemployee or stock.
REVOKE ALL ON hft.p3_master_change_request,
 hft.p3_master_invocation_nonce,hft.p3_master_decision
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_retained_p3_login;
-- No nonemployee APPLY helpers/functions are installed by this package.
-- Independent catalog postflight MUST prove the fourth P3 EXECUTE absent.
-- No direct protected stock posting/receive function grant is made.
COMMIT;
