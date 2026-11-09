-- HFT OPS-A2 PG18 INTERNAL OWNER / ACL CLOSURE -- REVIEW ONLY, NONEXECUTABLE
-- HF16-OPS-A2-REMAINDER-061 | post-four-source exact ACL & owner proposal.
-- This is NOT a role provisioning script, production entitlement or migration.
-- Install ONLY inside a separately accepted one-transaction consolidated source.
BEGIN;
DO $STOP_OPS_A2_ACL$
BEGIN
 RAISE EXCEPTION 'OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED';
END $STOP_OPS_A2_ACL$;

DO $ops_a2_acl_preflight$
BEGIN
 IF session_user<>'hft_engineering'
 OR NOT pg_catalog.pg_has_role('hft_engineering','hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role('hft_r1_app_runtime','hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role('hft_r1_app_runtime','hft_r1_governance_issuer','MEMBER')
 OR pg_catalog.pg_has_role('hft_r1_governance_issuer','hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role('hft_r1_posting_owner','hft_r1_governance_issuer','MEMBER')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles AS person_login
   WHERE person_login.rolcanlogin
   AND pg_catalog.pg_has_role(person_login.oid,
    'hft_r1_governance_issuer'::pg_catalog.regrole,'MEMBER')
   AND pg_catalog.pg_has_role(person_login.oid,
    'hft_r1_posting_owner'::pg_catalog.regrole,'MEMBER'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles AS protected_role
  WHERE protected_role.rolname IN('hft_r1_posting_owner',
   'hft_r1_governance_issuer','hft_r1_audit_verify','hft_r1_app_runtime')
   AND (protected_role.rolsuper OR protected_role.rolbypassrls
    OR protected_role.rolcanlogin OR protected_role.rolcreaterole
    OR protected_role.rolcreatedb))
 OR NOT pg_catalog.has_schema_privilege('hft_r1_posting_owner','hft','CREATE')
 THEN RAISE EXCEPTION 'OPS_A2_ACL_OWNER_AND_ROLE_ISOLATION_REQUIRED'; END IF;
END $ops_a2_acl_preflight$;

-- These are source-only internal owner privileges. Never grant table DML to
-- the app runtime. Account and transfer orders remain independently enrolled:
-- NO INSERT/UPDATE/DELETE grants to any governed source-order issuer here.
GRANT SELECT,INSERT ON TABLE
 hft.ops_a2_source_binding,hft.ops_a2_command_envelope,
 hft.ops_a2_account_provision_receipt,
 hft.ops_a2_transfer_issuance_receipt,
 hft.ops_a2_transfer_counter_link
 TO hft_r1_posting_owner;
GRANT SELECT ON TABLE
 hft.ops_a2_account_provision_order,
 hft.ops_a2_transfer_issuance_order
 TO hft_r1_posting_owner;
-- The protected single writer alone can advance moved_micro/status;
-- immutable transfer identity is enforced by the guarded trigger.
GRANT SELECT,INSERT,UPDATE ON TABLE hft.ops_a2_transfer_document
 TO hft_r1_posting_owner;
-- Independent audit may READ immutable provenance and source authority,
-- never issue approvals, provision accounts, mutate transfers or post stock.
GRANT SELECT ON TABLE
 hft.ops_a2_source_binding,hft.ops_a2_command_envelope,
 hft.ops_a2_account_provision_order,hft.ops_a2_account_provision_receipt,
 hft.ops_a2_transfer_issuance_order,hft.ops_a2_transfer_issuance_receipt,
 hft.ops_a2_transfer_document,hft.ops_a2_transfer_counter_link
 TO hft_r1_audit_verify;
-- OPS-A and P0 objects were created AFTER the original P2 allowlist:
-- do not assume P2's previous blanket grants cover future relations.
GRANT SELECT ON TABLE
 hft.item_version_catalog,
 hft.item_version_photo_coverage_v1,
 hft.p0_location_kind,hft.custody_ack_status_v1
 TO hft_r1_posting_owner;
GRANT SELECT ON TABLE hft_secret.p0_stores_proof_key
 TO hft_r1_posting_owner;

-- Private helpers are callable by the protected non-login owner only.
-- DO NOT expose these to the app, issuer or PUBLIC.
GRANT EXECUTE ON FUNCTION
 hft.ops_a_payload_fields_v2(jsonb),
 hft.ops_a_payload_digest_v2(jsonb),
 hft.p0_stores_payload_fields_v1(jsonb),
 hft.p0_stores_payload_sha256_v1(jsonb),
 hft.p0_verify_stores_proof_v1(jsonb,jsonb),
 hft.p0_resolve_count_leaf_v1(text,text,text),
 hft.ops_a2_verify_invocation_v2(jsonb,jsonb),
 hft.ops_a2_authorized_source_v2(jsonb),
 hft.ops_a2_resolve_signed_grn_line_v3(jsonb,jsonb),
 hft.ops_a2_assert_outstanding_custody_census_v3(jsonb),
 hft.ops_a2_verify_transfer_counter_link_v3(),
 hft.ops_a2_return_payload_fields_v1(jsonb),
 hft.ops_a2_return_payload_sha256_v1(jsonb),
 hft.ops_a2_verify_return_proof_v1(jsonb,jsonb),
 hft.ops_a2_assert_command_seal_v2(uuid),
 hft.ops_a2_fact_v2(uuid,jsonb),
 hft.ops_a2_verify_readproof_v2(jsonb,jsonb),
 hft.ops_a2_verify_paged_readproof_v3(jsonb,jsonb),
 hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)
 TO hft_r1_posting_owner;

-- The original P2 V1 functions and their ACLs remain untouched.
-- SECURITY DEFINER must NEVER execute with the migration owner's privileges.
ALTER FUNCTION hft.ops_a2_post_stock_command_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
ALTER FUNCTION hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
ALTER FUNCTION hft.ops_a2_resolve_return_authorized_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
ALTER FUNCTION hft.ops_a2_reconcile_post_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
ALTER FUNCTION hft.ops_a2_read_authoritative_v2(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;
ALTER FUNCTION hft.ops_a2_read_snapshot_page_v3(jsonb,jsonb)
 OWNER TO hft_r1_posting_owner;

-- Existing owner transfers in foundation and resolver are also verified.
-- All temporary CREATE authority is revoked BEFORE the same COMMIT.
REVOKE CREATE ON SCHEMA hft FROM hft_r1_posting_owner;

DO $ops_a2_check_final_acl$
DECLARE f text; login record;
BEGIN
 IF pg_catalog.has_schema_privilege('hft_r1_posting_owner','hft','CREATE')
 OR pg_catalog.pg_has_role('hft_r1_app_runtime','hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role('hft_r1_app_runtime','hft_r1_governance_issuer','MEMBER')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles AS protected_role
  WHERE protected_role.rolname IN('hft_r1_posting_owner',
   'hft_r1_governance_issuer','hft_r1_audit_verify','hft_r1_app_runtime')
   AND (protected_role.rolsuper OR protected_role.rolbypassrls
    OR protected_role.rolcanlogin OR protected_role.rolcreaterole
    OR protected_role.rolcreatedb))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles AS operator_login
  WHERE operator_login.rolcanlogin
  AND pg_catalog.pg_has_role(operator_login.oid,
   'hft_r1_app_runtime'::pg_catalog.regrole,'MEMBER')
  AND (operator_login.rolsuper OR operator_login.rolbypassrls))
 THEN RAISE EXCEPTION 'OPS_A2_POST_OWNER_SCHEMA_OR_INHERITANCE_BYPASS'; END IF;
 FOREACH f IN ARRAY ARRAY[
  'ops_a2_post_stock_command_v2',
  'ops_a2_resolve_authorized_v2',
  'ops_a2_resolve_return_authorized_v2',
  'ops_a2_reconcile_post_v2',
  'ops_a2_reconcile_post_v3',
  'ops_a2_read_authoritative_v2',
  'ops_a2_read_snapshot_page_v3',
  'ops_a2_provision_zero_account_v2',
  'ops_a2_issue_transfer_document_v2',
  'ops_a2_issue_source_binding_v2'
 ] LOOP
  IF NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc AS proc
   JOIN pg_catalog.pg_namespace AS ns ON ns.oid=proc.pronamespace
   JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=proc.proowner
   WHERE ns.nspname='hft' AND proc.proname=f
    AND owner_role.rolname='hft_r1_posting_owner'
    AND proc.prosecdef)
  THEN RAISE EXCEPTION 'OPS_A2_SECURITY_DEFINER_OWNER_NOT_QUALIFIED:%',f; END IF;
 END LOOP;
 IF NOT pg_catalog.has_table_privilege(
  'hft_r1_audit_verify','hft.ops_a2_source_binding','SELECT')
 OR NOT pg_catalog.has_table_privilege(
  'hft_r1_audit_verify','hft.ops_a2_account_provision_receipt','SELECT')
 OR NOT pg_catalog.has_table_privilege(
  'hft_r1_audit_verify','hft.ops_a2_transfer_document','SELECT')
 OR pg_catalog.has_table_privilege(
  'hft_r1_audit_verify','hft.ops_a2_source_binding','INSERT,UPDATE,DELETE')
 OR pg_catalog.has_table_privilege(
  'hft_r1_audit_verify','hft.ops_a2_transfer_document','INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'OPS_A2_INDEPENDENT_AUDIT_ACL_INVALID'; END IF;
 FOR login IN
  SELECT rolname FROM pg_catalog.pg_roles
  WHERE rolname='hft_r1_app_runtime'
   OR (rolcanlogin AND pg_catalog.pg_has_role(
    oid,'hft_r1_app_runtime'::pg_catalog.regrole,'MEMBER'))
 LOOP
  IF pg_catalog.has_schema_privilege(login.rolname,'hft','CREATE')
   OR pg_catalog.has_table_privilege(login.rolname,
    'hft.ops_a2_source_binding','INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege(login.rolname,
    'hft.ops_a2_account_provision_order','INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege(login.rolname,
    'hft.ops_a2_transfer_counter_link','INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege(login.rolname,
    'hft.ops_a2_transfer_issuance_order','INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege(login.rolname,
    'hft.stock_account','INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege(login.rolname,
    'hft.stock_entry','INSERT,UPDATE,DELETE')
   OR pg_catalog.has_function_privilege(login.rolname,
    'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)','EXECUTE')
   OR pg_catalog.has_function_privilege(login.rolname,
    'hft.ops_a2_issue_source_binding_v2(jsonb,jsonb,jsonb)','EXECUTE')
   OR pg_catalog.has_function_privilege(login.rolname,
    'hft.ops_a2_provision_zero_account_v2(uuid)','EXECUTE')
   OR pg_catalog.has_function_privilege(login.rolname,
    'hft.ops_a2_issue_transfer_document_v2(uuid)','EXECUTE')
   OR pg_catalog.has_function_privilege(login.rolname,
    'hft.ops_a2_reconcile_original_attempt_private_v3(jsonb,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'OPS_A2_APP_RUNTIME_DIRECT_DML_OR_HELPER_EXECUTE:%',login.rolname; END IF;
 END LOOP;
END $ops_a2_check_final_acl$;

-- No runtime function activation or protected issuer order enrollment here.
COMMIT;
