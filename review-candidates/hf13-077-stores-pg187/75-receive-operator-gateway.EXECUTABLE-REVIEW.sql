-- HF13-077 STORES PG18.7 — FOUR-FUNCTION OPERATOR RECEIVE GATEWAY
-- EXACT-SOURCE EXECUTABLE REVIEW CANDIDATE; NOT ADMITTED OR EXECUTED.
-- Source dependency: engineering 14a85dfba4a239642116157caa84a6a29b06747d
-- OPS-A2 protected source original SHA256:
-- d5b8bec248fa69151fcf25cdf8c7a33806c01fbff829e725ac0b449e6797e47e
-- Must run AFTER approved stages 10, canonical 0001-0006, 20-70,
-- and BEFORE approved DBA privilege close stage 80.
-- No hft_qa077, no direct runtime execute on original protected functions,
-- no new ledger, signer, approval, invoice, GRN, QC or stock seed.
BEGIN;
DO $hf13_operator_install_preflight$ DECLARE n integer;
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR session_user<>'hft_engineering' OR current_user<>session_user
 OR pg_is_in_recovery()
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR to_regnamespace('hft_qa077') IS NOT NULL
 OR to_regclass('hft.schema_revision') IS NULL
 OR (SELECT count(*) FROM hft.schema_revision)<>6
 OR NOT EXISTS(SELECT 1 FROM hft.schema_revision
    WHERE version=6 AND sha256='664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')
 OR NOT EXISTS(SELECT 1 FROM pg_roles r
    WHERE r.rolname='hft_r1_stores_gateway_owner'
    AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
    AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolbypassrls)
 OR NOT pg_has_role('hft_engineering','hft_r1_stores_gateway_owner','MEMBER')
 OR NOT pg_has_role('hft_engineering','hft_r1_posting_owner','MEMBER')
 OR NOT pg_has_role('hft_r1_stores_np_login','hft_r1_app_runtime','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_stores_gateway_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_governance_issuer','MEMBER')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hft_r1_stores_np_login' AND rolcanlogin)
 OR EXISTS(SELECT 1 FROM hft.stock_entry)
 OR EXISTS(SELECT 1 FROM hft.stock_command)
 OR EXISTS(SELECT 1 FROM hft.stock_account)
 THEN RAISE EXCEPTION 'HF13_OPERATOR_GATEWAY_RESOURCE_ROLE_OR_CUTOVER_NOT_QUALIFIED'; END IF;
 SELECT count(*) INTO n FROM pg_proc f
 JOIN pg_namespace ns ON ns.oid=f.pronamespace
 JOIN pg_roles owner_role ON owner_role.oid=f.proowner
 WHERE ns.nspname='hft' AND f.oid IN (
  'hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)'::regprocedure,
  'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)'::regprocedure,
  'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)'::regprocedure,
  'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)'::regprocedure
 ) AND f.prosecdef AND owner_role.rolname='hft_r1_posting_owner'
 AND EXISTS(SELECT 1 FROM unnest(f.proconfig) cfg
     WHERE replace(cfg,' ','')='search_path=pg_catalog,pg_temp');
 IF n<>4
 OR to_regprocedure('hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb)') IS NOT NULL
 OR to_regprocedure('hft.ops_a2_operator_post_receive_v1(jsonb,jsonb)') IS NOT NULL
 OR to_regprocedure('hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)') IS NOT NULL
 OR to_regprocedure('hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'HF13_OPERATOR_GATEWAY_PROTECTED_OWNER_OR_EMPTY_FUNCTIONS_INVALID'; END IF;
END $hf13_operator_install_preflight$;

-- The gateway owner has EXECUTE on four existing SECURITY DEFINER entrypoints
-- only, not ownership, no protected table rights and no signing-key SELECT.
-- Original app runtime and login retain direct EXECUTE DENIAL on all four.
SET ROLE hft_r1_posting_owner;
REVOKE EXECUTE ON FUNCTION
 hft.ops_a2_resolve_authorized_v2(jsonb,jsonb),
 hft.ops_a2_post_stock_command_v2(jsonb,jsonb),
 hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb),
 hft.ops_a2_read_authoritative_v2(jsonb,jsonb)
 FROM PUBLIC,hft_r1_app_runtime,hft_r1_stores_np_login;
GRANT EXECUTE ON FUNCTION
 hft.ops_a2_resolve_authorized_v2(jsonb,jsonb),
 hft.ops_a2_post_stock_command_v2(jsonb,jsonb),
 hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb),
 hft.ops_a2_read_authoritative_v2(jsonb,jsonb)
 TO hft_r1_stores_gateway_owner;
RESET ROLE;

GRANT USAGE ON SCHEMA hft
 TO hft_r1_app_runtime,hft_r1_stores_np_login,hft_r1_stores_gateway_owner;
-- Ownership transfer requires temporary CREATE on the function schema.
-- It is explicitly revoked before COMMIT.
GRANT CREATE ON SCHEMA hft TO hft_r1_stores_gateway_owner;

CREATE FUNCTION hft.ops_a2_operator_resolve_receive_v1(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $operator_resolve$
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR current_user<>'hft_r1_stores_gateway_owner'
 OR session_user<>'hft_r1_stores_np_login'
 OR NOT pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR current_setting('transaction_isolation')<>'serializable'
 OR current_setting('transaction_read_only')<>'off'
 OR jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR jsonb_typeof(proof) IS DISTINCT FROM 'object'
 OR p->>'kind' IS DISTINCT FROM 'IN'
 OR p->>'qcState' IS DISTINCT FROM 'ACCEPTED'
 OR COALESCE(p->>'leafLocationId','')=''
 OR COALESCE(p->>'grnId','')=''
 OR COALESCE(p->>'invoiceNumber','')=''
 OR COALESCE(p->>'qcEvidenceId','')=''
 THEN RAISE EXCEPTION 'HF13_OPERATOR_RECEIVE_RESOLVER_SCOPE_DENIED'; END IF;
 RETURN hft.ops_a2_resolve_authorized_v2(p,proof);
END $operator_resolve$;

CREATE FUNCTION hft.ops_a2_operator_post_receive_v1(p jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $operator_post$
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR current_user<>'hft_r1_stores_gateway_owner'
 OR session_user<>'hft_r1_stores_np_login'
 OR NOT pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR current_setting('transaction_isolation')<>'serializable'
 OR current_setting('transaction_read_only')<>'off'
 OR jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR jsonb_typeof(proof) IS DISTINCT FROM 'object'
 OR p->>'kind' IS DISTINCT FROM 'RECEIVE'
 OR COALESCE(p->>'sourceDocumentId','')=''
 OR COALESCE(p->>'sourceActionKey','')=''
 OR COALESCE(p->>'inspectionEvidenceId','')=''
 OR COALESCE(p->>'destinationLeafId','')=''
 OR COALESCE(p->>'approvedBy','')=''
 OR p->>'approvedBy' IS NOT DISTINCT FROM p->>'actorSubject'
 THEN RAISE EXCEPTION 'HF13_OPERATOR_RECEIVE_POST_SCOPE_DENIED'; END IF;
 RETURN hft.ops_a2_post_stock_command_v2(p,proof);
END $operator_post$;

CREATE FUNCTION hft.ops_a2_operator_reconcile_receive_v1(
 p jsonb,original_proof jsonb,q jsonb,fresh_read_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $operator_reconcile$
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR current_user<>'hft_r1_stores_gateway_owner'
 OR session_user<>'hft_r1_stores_np_login'
 OR NOT pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR current_setting('transaction_read_only')<>'on'
 OR jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR jsonb_typeof(original_proof) IS DISTINCT FROM 'object'
 OR jsonb_typeof(q) IS DISTINCT FROM 'object'
 OR jsonb_typeof(fresh_read_proof) IS DISTINCT FROM 'object'
 OR p->>'kind' IS DISTINCT FROM 'RECEIVE'
 OR q->>'intent' IS DISTINCT FROM 'MOVEMENTS'
 OR q->>'legalEntityId' IS DISTINCT FROM p->>'legalEntityId'
 OR q->>'siteId' IS DISTINCT FROM p->>'siteId'
 OR q->>'warehouseId' IS DISTINCT FROM p->>'warehouseId'
 OR q->>'itemCode' IS DISTINCT FROM p->>'itemCode'
 OR q->>'productVersion' IS DISTINCT FROM p->>'productVersion'
 THEN RAISE EXCEPTION 'HF13_OPERATOR_RECEIVE_RECONCILIATION_SCOPE_DENIED'; END IF;
 RETURN hft.ops_a2_reconcile_post_v3(p,original_proof,q,fresh_read_proof);
END $operator_reconcile$;

CREATE FUNCTION hft.ops_a2_operator_read_receive_v1(q jsonb,proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $operator_read$
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR current_setting('server_version_num')::integer<>180007
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid()
    AND ssl AND version IN('TLSv1.2','TLSv1.3') AND cipher IS NOT NULL)
 OR current_user<>'hft_r1_stores_gateway_owner'
 OR session_user<>'hft_r1_stores_np_login'
 OR NOT pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 OR current_setting('transaction_read_only')<>'on'
 OR jsonb_typeof(q) IS DISTINCT FROM 'object'
 OR jsonb_typeof(proof) IS DISTINCT FROM 'object'
 OR (q->>'intent' IS DISTINCT FROM 'BALANCES'
     AND q->>'intent' IS DISTINCT FROM 'MOVEMENTS')
 OR COALESCE(q->>'legalEntityId','')=''
 OR COALESCE(q->>'siteId','')=''
 OR COALESCE(q->>'warehouseId','')=''
 OR COALESCE(q->>'itemCode','')=''
 OR COALESCE(q->>'productVersion','')=''
 OR (q->>'intent'='BALANCES' AND COALESCE(q->>'leafLocationId','')='')
 THEN RAISE EXCEPTION 'HF13_OPERATOR_RECEIVE_READ_SCOPE_DENIED'; END IF;
 RETURN hft.ops_a2_read_authoritative_v2(q,proof);
END $operator_read$;

ALTER FUNCTION hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb)
 OWNER TO hft_r1_stores_gateway_owner;
ALTER FUNCTION hft.ops_a2_operator_post_receive_v1(jsonb,jsonb)
 OWNER TO hft_r1_stores_gateway_owner;
ALTER FUNCTION hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)
 OWNER TO hft_r1_stores_gateway_owner;
ALTER FUNCTION hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)
 OWNER TO hft_r1_stores_gateway_owner;

-- In the same installation transaction, close implicit PUBLIC EXECUTE,
-- avoid any general app protected-writer grants, close CREATE on the schema.
REVOKE EXECUTE ON FUNCTION
 hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb),
 hft.ops_a2_operator_post_receive_v1(jsonb,jsonb),
 hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb),
 hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)
 FROM PUBLIC,hft_r1_governance_issuer,hft_r1_audit_verify;
GRANT EXECUTE ON FUNCTION
 hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb),
 hft.ops_a2_operator_post_receive_v1(jsonb,jsonb),
 hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb),
 hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)
 TO hft_r1_app_runtime;
REVOKE CREATE ON SCHEMA hft FROM hft_r1_stores_gateway_owner;

DO $hf13_operator_acl_postflight$
DECLARE f text; t record; proc record; allowed text[];
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='hft_r1_stores_gateway_owner'
    AND (r.rolcanlogin OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb
      OR r.rolbypassrls OR r.rolinherit))
 OR has_schema_privilege('hft_r1_stores_gateway_owner','hft','CREATE')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_stores_gateway_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_gateway_owner','hft_r1_governance_issuer','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_posting_owner','MEMBER')
 OR pg_has_role('hft_r1_stores_np_login','hft_r1_governance_issuer','MEMBER')
 THEN RAISE EXCEPTION 'HF13_OPERATOR_GATEWAY_ROLE_MEMBERSHIP_OR_CREATOR_LEAK'; END IF;
 allowed:=ARRAY[
  'hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)',
  'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)',
  'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)',
  'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)'];
 FOREACH f IN ARRAY allowed LOOP
  IF NOT has_function_privilege('hft_r1_stores_gateway_owner',f,'EXECUTE')
   OR has_function_privilege('hft_r1_stores_np_login',f,'EXECUTE')
   OR has_function_privilege('hft_r1_app_runtime',f,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f)
     AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
       WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  THEN RAISE EXCEPTION 'HF13_OPERATOR_PROTECTED_EXECUTE_NOT_EXCLUSIVE:%',f; END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY[
  'hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb)',
  'hft.ops_a2_operator_post_receive_v1(jsonb,jsonb)',
  'hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)',
  'hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)'] LOOP
  IF NOT has_function_privilege('hft_r1_stores_np_login',f,'EXECUTE')
    OR NOT has_function_privilege('hft_r1_app_runtime',f,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f)
      AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
   THEN RAISE EXCEPTION 'HF13_OPERATOR_GATEWAY_EXECUTE_OR_PUBLIC_ACL:%',f; END IF;
 END LOOP;
 FOR proc IN SELECT p.oid,p.proname,p.prosecdef,r.rolname AS owner_name,
      p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='hft' AND p.proname LIKE 'ops_a2_operator_%_v1'
 LOOP
  IF proc.owner_name<>'hft_r1_stores_gateway_owner' OR NOT proc.prosecdef
   OR NOT EXISTS(SELECT 1 FROM unnest(proc.proconfig) cfg
       WHERE replace(cfg,' ','')='search_path=pg_catalog,pg_temp')
  THEN RAISE EXCEPTION 'HF13_OPERATOR_GATEWAY_SECDEF_OWNER_OR_PATH:%',proc.proname; END IF;
 END LOOP;
 FOR t IN SELECT c.oid,n.nspname,c.relname,c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('hft','hft_secret','hft_crypto')
   AND c.relkind IN ('r','p','v','m','S')
 LOOP
  IF (t.relkind='S' AND has_sequence_privilege('hft_r1_stores_gateway_owner',t.oid,'SELECT,USAGE,UPDATE'))
   OR (t.relkind<>'S' AND has_table_privilege('hft_r1_stores_gateway_owner',t.oid,
     'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
   OR (t.relkind='S' AND has_sequence_privilege('hft_r1_stores_np_login',t.oid,'SELECT,USAGE,UPDATE'))
   OR (t.relkind<>'S' AND has_table_privilege('hft_r1_stores_np_login',t.oid,
     'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  THEN RAISE EXCEPTION 'HF13_OPERATOR_DIRECT_RELATION_RIGHTS:%:%',t.nspname,t.relname; END IF;
 END LOOP;
 -- The gateway owner may call only the four named protected functions.
 FOR proc IN SELECT p.oid,p.proname FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='hft'
 LOOP
  IF has_function_privilege('hft_r1_stores_gateway_owner',proc.oid,'EXECUTE')
   AND proc.oid NOT IN (
     'hft.ops_a2_resolve_authorized_v2(jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_operator_resolve_receive_v1(jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_operator_post_receive_v1(jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_operator_reconcile_receive_v1(jsonb,jsonb,jsonb,jsonb)'::regprocedure,
     'hft.ops_a2_operator_read_receive_v1(jsonb,jsonb)'::regprocedure)
  THEN RAISE EXCEPTION 'HF13_OPERATOR_GATEWAY_OWNER_EXTRA_FUNCTION:%',proc.proname; END IF;
 END LOOP;
END $hf13_operator_acl_postflight$;
COMMIT;
