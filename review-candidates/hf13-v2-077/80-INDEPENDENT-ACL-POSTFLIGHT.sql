-- HF13-V2 077 INDEPENDENT SQL CATALOG POSTFLIGHT CANDIDATE
-- NOT EXECUTED. Must be run with independently approved verifier and session identity.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $HF13_INDEPENDENT_POSTFLIGHT$
DECLARE p text;t text; r record; n integer;
BEGIN
 IF current_database()<>'hft_r1_disposable_r77qa_20261114'
 OR current_setting('server_version_num')::integer<>180006
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl)
 OR pg_has_role('hft_r77_qa_077','hft_r77_gateway_owner','MEMBER')
 OR pg_has_role('hft_r77_qa_077','hft_r1_posting_owner','MEMBER')
 OR NOT pg_has_role('hft_r77_qa_077','hft_r1_app_runtime','MEMBER')
 OR pg_has_role('hft_r77_gateway_owner','hft_r1_posting_owner','MEMBER')
 OR has_schema_privilege('hft_r77_gateway_owner','hft_qa077','CREATE')
 OR has_schema_privilege('hft_r77_qa_077','hft_qa077','CREATE')
 THEN RAISE EXCEPTION 'HF13_R77_UNQUALIFIED_RESOURCE_ROLE_OR_TLS'; END IF;
 SELECT count(*) INTO n FROM pg_proc f JOIN pg_namespace s ON s.oid=f.pronamespace
 JOIN pg_roles owner_role ON owner_role.oid=f.proowner
 WHERE s.nspname='hft_qa077' AND f.proname IN
 ('post_receive_v1','challenge_receive_v1','read_receive_v1','observe_receive_v1','reconcile_receive_v1')
 AND f.prosecdef AND owner_role.rolname='hft_r77_gateway_owner';
 IF n<>5 THEN RAISE EXCEPTION 'HF13_R77_SECDEF_OWNER_NOT_QUALIFIED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace s ON s.oid=f.pronamespace
   WHERE s.nspname='hft_qa077' AND f.proname='assert_receive_fixture_v1' AND f.prosecdef)
 THEN RAISE EXCEPTION 'HF13_R77_HELPER_SECDEF_UNEXPECTED'; END IF;
 FOREACH p IN ARRAY ARRAY[
 'hft_qa077.post_receive_v1(uuid,text,jsonb,jsonb)',
 'hft_qa077.challenge_receive_v1(uuid,text,jsonb,jsonb)',
 'hft_qa077.read_receive_v1(uuid,text,jsonb,jsonb)',
 'hft_qa077.observe_receive_v1(uuid,text,jsonb,jsonb)',
 'hft_qa077.reconcile_receive_v1(uuid,text,jsonb,jsonb,jsonb,jsonb)'] LOOP
  IF NOT has_function_privilege('hft_r77_qa_077',p,'EXECUTE')
    OR has_function_privilege('hft_r1_app_runtime',p,'EXECUTE')
    OR has_function_privilege('hft_r1_audit_verify',p,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc f
      WHERE f.oid=to_regprocedure(p) AND EXISTS(SELECT 1 FROM
       aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a
       WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
   THEN RAISE EXCEPTION 'HF13_R77_QA_GATEWAY_EFFECTIVE_EXECUTE_INVALID:%',p; END IF;
 END LOOP;
 IF has_function_privilege('hft_r77_qa_077',
  'hft_qa077.assert_receive_fixture_v1(uuid,text,jsonb,jsonb)','EXECUTE')
 OR has_table_privilege('hft_r77_qa_077','hft_qa077.receive_fixture_v1',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 THEN RAISE EXCEPTION 'HF13_R77_QA_PRIVATE_FIXTURE_ACCESS'; END IF;
 FOREACH p IN ARRAY ARRAY[
 'hft.ops_a2_post_stock_command_v2(jsonb,jsonb)',
 'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)',
 'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)'] LOOP
  IF NOT has_function_privilege('hft_r77_gateway_owner',p,'EXECUTE')
    OR has_function_privilege('hft_r77_qa_077',p,'EXECUTE')
    OR has_function_privilege('hft_r1_app_runtime',p,'EXECUTE')
   THEN RAISE EXCEPTION 'HF13_R77_PROTECTED_FUNCTION_SCOPE_INVALID:%',p; END IF;
 END LOOP;
 FOR r IN SELECT f.oid,f.proname FROM pg_proc f
  JOIN pg_namespace s ON s.oid=f.pronamespace
  WHERE s.nspname='hft' AND f.oid NOT IN
   ('hft.ops_a2_post_stock_command_v2(jsonb,jsonb)'::regprocedure,
    'hft.ops_a2_reconcile_post_v3(jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'hft.ops_a2_read_authoritative_v2(jsonb,jsonb)'::regprocedure)
 LOOP
  IF has_function_privilege('hft_r77_gateway_owner',r.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'HF13_R77_GATEWAY_EXTRA_HELPER_EXECUTE:%',r.proname; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY[
 'hft.grn','hft.grn_line','hft.grn_partial_receipt',
 'hft.supplier_invoice','hft.supplier_invoice_line',
 'hft.ops_a2_source_binding','hft.protected_stock_approval',
 'hft.protected_approval_decision','hft.stock_account',
 'hft.employee_custody','hft.serial_registry',
 'hft.stock_command','hft.stock_entry','hft.posting_invocation_nonce',
 'hft.stock_command_seal','hft.audit_outbox','hft.audit_delivery',
 'hft.ops_a2_command_envelope','hft.stock_command_outcome',
 'hft_qa077.receive_fixture_v1'] LOOP
  IF NOT has_table_privilege('hft_r77_gateway_owner',t,'SELECT')
    OR has_table_privilege('hft_r77_gateway_owner',t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('hft_r77_qa_077',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION 'HF13_R77_TABLE_PRIVILEGE_INVALID:%',t; END IF;
 END LOOP;
 FOR r IN SELECT c.oid,s.nspname||'.'||c.relname AS full_name
 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
 WHERE s.nspname IN ('hft','hft_qa077') AND c.relkind IN ('r','p','v','m')
 LOOP
  IF has_table_privilege('hft_r77_gateway_owner',r.oid,'SELECT')
    AND r.full_name<>ALL(ARRAY[
     'hft.grn','hft.grn_line','hft.grn_partial_receipt',
     'hft.supplier_invoice','hft.supplier_invoice_line',
     'hft.ops_a2_source_binding','hft.protected_stock_approval',
     'hft.protected_approval_decision','hft.stock_account',
     'hft.employee_custody','hft.serial_registry',
     'hft.stock_command','hft.stock_entry','hft.posting_invocation_nonce',
     'hft.stock_command_seal','hft.audit_outbox','hft.audit_delivery',
     'hft.ops_a2_command_envelope','hft.stock_command_outcome',
     'hft_qa077.receive_fixture_v1'])
  THEN RAISE EXCEPTION 'HF13_R77_EXTRA_SELECT:%',r.full_name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.member
 JOIN pg_roles b ON b.oid=m.roleid WHERE a.rolname='hft_r77_qa_077'
 AND (b.rolname<>'hft_r1_app_runtime' OR m.admin_option OR m.set_option OR m.inherit_option))
 THEN RAISE EXCEPTION 'HF13_R77_QA_MEMBERSHIP_NOT_EXACT'; END IF;
END $HF13_INDEPENDENT_POSTFLIGHT$;
COMMIT;
