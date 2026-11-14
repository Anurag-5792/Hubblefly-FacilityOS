-- HF13-V2-077: OWNER/ACL CLOSURE REVIEW CANDIDATE. NEVER EXECUTE AS-IS.
-- This deliberately fails before any DDL; an independently reviewed admitted
-- successor is required, with real role memberships and explicit DBA attestation.
BEGIN;
DO $HF13_OWNER_ACL_STOP$ BEGIN
 RAISE EXCEPTION 'HF13_PG187_OWNER_ROLE_AND_GRANTS_NOT_AUTHORIZED';
END $HF13_OWNER_ACL_STOP$;
-- Prerequisites: separate DBA-created NOLOGIN hft_r1_p3_corporate_bootstrap_owner,
-- NOLOGIN hft_r1_p3_corporate_bootstrap_runtime, NOLOGIN
-- hft_r1_p3_master_owner, NOLOGIN hft_r1_p3_master_runtime;
-- separate unprivileged LOGIN hft_r1_retained_p3_login and qualified
-- one-time corporate bootstrap login. NO SET ROLE to an owner for runtime.
-- The real Neon initial owner hft_r1_retained_masters_np077_owner must
-- never become application runtime.
DO $hft_acl_pre$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_r1_p3_corporate_bootstrap_owner'
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_r1_p3_master_owner'
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_r1_p3_master_runtime'
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_r1_retained_p3_login'
 AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_p3_master_owner','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_p3_corporate_bootstrap_owner','MEMBER')
 OR pg_has_role('hft_r1_retained_p3_login','hft_r1_posting_owner','MEMBER')
 THEN RAISE EXCEPTION 'HF13_PG187_ACTUAL_ROLE_CUSTODY_NOT_QUALIFIED'; END IF;
END $hft_acl_pre$;
-- Governance/corporate bootstrap NOLOGIN owner; never grant function to P3 runtime.
GRANT USAGE ON SCHEMA hft,hft_secret,hft_crypto TO hft_r1_p3_corporate_bootstrap_owner;
GRANT SELECT ON hft.posting_session,hft.p3_corporate_bootstrap_order_v1,
 hft.p3_corporate_bootstrap_receipt_v1,
 hft.legal_entity,hft.site,hft.warehouse TO hft_r1_p3_corporate_bootstrap_owner;
-- FOR UPDATE in the function requires careful privilege review.
-- Grant only to nonlogin function owner; immutable source trigger prevents row mutation.
GRANT UPDATE ON hft.p3_corporate_bootstrap_order_v1 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT SELECT ON hft_secret.p3_corporate_bootstrap_key_v1 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT INSERT ON hft.legal_entity,hft.site,hft.warehouse,
 hft.p3_corporate_bootstrap_receipt_v1 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT EXECUTE ON FUNCTION hft.p2_length_prefixed_v1(text[]),
 hft_crypto.hmac(bytea,bytea,text),hft_crypto.digest(bytea,text)
 TO hft_r1_p3_corporate_bootstrap_owner;
GRANT CREATE ON SCHEMA hft TO hft_r1_p3_corporate_bootstrap_owner;
ALTER FUNCTION hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)
 OWNER TO hft_r1_p3_corporate_bootstrap_owner;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_p3_corporate_bootstrap_owner;
REVOKE EXECUTE ON FUNCTION hft.p3_bootstrap_first_approved_scope_v1(uuid,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime;
-- A separate, independently enrolled corporate-bootstrap LOGIN can receive
-- this exact EXECUTE only after corporate order/key/signature authority is qualified.
-- Nonemployee P3 function owner SELECT/INSERT/UPDATE scope.
GRANT SELECT ON hft.item,hft.supplier,hft.warehouse,hft.location,
 hft.stock_account,hft.stock_command,hft.serial_registry,hft.grn_line,
 hft.grn,hft.item_version_photo_coverage_v1
 TO hft_r1_p3_master_owner;
GRANT INSERT,UPDATE ON hft.item,hft.supplier,hft.location TO hft_r1_p3_master_owner;
GRANT UPDATE ON hft.warehouse TO hft_r1_p3_master_owner;
GRANT EXECUTE ON FUNCTION hft.p3_nonemployee_decision_fields_v1(jsonb),
 hft.p3_nonemployee_decision_digest_v1(jsonb)
 TO hft_r1_p3_master_owner;
GRANT CREATE ON SCHEMA hft TO hft_r1_p3_master_owner;
ALTER FUNCTION hft.p3_decide_apply_nonemployee_v1(jsonb,jsonb)
 OWNER TO hft_r1_p3_master_owner;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_p3_master_owner;
REVOKE EXECUTE ON FUNCTION hft.p3_decide_apply_nonemployee_v1(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_p3_master_runtime,hft_r1_retained_p3_login;
-- Remain DENIED until Chat16 wires authenticated decision service, Chat10
-- authorizes exact new runtime allowlist and independent QA tests apply.
-- No stock-account, stock-entry, GRN, invoice, or approval DML grants.
COMMIT;
