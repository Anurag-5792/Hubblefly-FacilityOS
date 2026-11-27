-- HF094 independent catalog/ACL postflight. No mutation.
-- Inspect privileges for the exact disabled runtime principal, not installer rights.
DO $hf094_postflight$
DECLARE
 runtime_oid oid; canonical_oid oid; role_owner_oid oid; installer_oid oid; assignment_oid oid; event_oid oid; scope_oid oid; epoch_attnum smallint; actual jsonb;
 expected jsonb:=$expected$[{"relation_schema":"hft_app_roles","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"assignment","trigger":"assignment_requires_audit","function_name":"require_assignment_event","body":"\nBEGIN\n IF NOT EXISTS(SELECT 1 FROM hft_app_roles.assignment_event e\n  WHERE e.legal_entity_id=NEW.legal_entity_id AND e.site_id=NEW.site_id\n   AND e.warehouse_id=NEW.warehouse_id AND e.employee_id=NEW.employee_id\n   AND e.revision=NEW.revision AND e.event->'after'=NEW.snapshot)\n THEN RAISE EXCEPTION 'HFT_APP_ROLE_SNAPSHOT_AUDIT_MISSING'; END IF;\n RETURN NULL;\nEND ","type":21,"constraint_type":"t","deferrable":true,"deferred":true},{"relation_schema":"hft_app_roles","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"assignment_event","trigger":"immutable_assignment_event","function_name":"deny_event_mutation","body":"\nBEGIN RAISE EXCEPTION 'HFT_APP_ROLE_AUDIT_IMMUTABLE'; END ","type":27,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft_app_roles","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"assignment","trigger":"role_revocation_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft_app_roles","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"identity_binding","trigger":"role_revocation_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft_app_roles","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"scope_lock","trigger":"role_revocation_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"employee","trigger":"role_dependency_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"legal_entity","trigger":"role_dependency_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"site","trigger":"role_dependency_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false},{"relation_schema":"hft","relation_owner_secure":true,"enabled":"A","owner":"hft_r1_roles_owner","owner_login":false,"owner_super":false,"owners_match":true,"relation_kind":"r","function_schema":"hft_app_roles","language":"plpgsql","security_definer":false,"volatility":"v","strict":false,"parallel":"u","leakproof":false,"returns_trigger":true,"ordinary_function":true,"no_arguments":true,"config":["search_path=pg_catalog, pg_temp"],"function_executable":false,"no_filter":true,"constraint_relation_matches":true,"relation":"warehouse","trigger":"role_dependency_fence","function_name":"fence_role_mutation","body":"\nBEGIN\n -- Database-local exclusive transaction fence; conflicts with stock operations.\n PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);\n RETURN NULL;\nEND ","type":62,"constraint_type":"","deferrable":false,"deferred":false}]$expected$::jsonb;
BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077' OR
 (SELECT oid FROM pg_database WHERE datname=current_database())<>16397 OR current_setting('server_version_num')<>'180007'
 OR session_user<>'hft_r1_retained_masters_np077_owner' OR current_user<>session_user OR pg_is_in_recovery()
 OR current_setting('session_replication_role')<>'origin'
 OR to_regnamespace('hft') IS NULL OR to_regnamespace('hft_app_roles') IS NULL
 OR to_regnamespace('hft_secret') IS NOT NULL OR to_regnamespace('hft_crypto') IS NOT NULL
 THEN RAISE EXCEPTION 'HF094_POSTFLIGHT_TARGET_OR_SCHEMA'; END IF;
 SELECT oid INTO STRICT runtime_oid FROM pg_roles WHERE rolname='hft_r1_roles_np_login';
 SELECT oid INTO STRICT canonical_oid FROM pg_roles WHERE rolname='hft_engineering';
 SELECT oid INTO STRICT role_owner_oid FROM pg_roles WHERE rolname='hft_r1_roles_owner';
 SELECT oid INTO STRICT installer_oid FROM pg_roles WHERE rolname=session_user;
 IF (SELECT count(*) FROM pg_roles WHERE oid IN(runtime_oid,canonical_oid,role_owner_oid)
  AND NOT(rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))<>3
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN(runtime_oid,canonical_oid,role_owner_oid))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid IN(runtime_oid,canonical_oid,role_owner_oid)
   AND NOT COALESCE(member=installer_oid AND grantor IN(installer_oid,
    (SELECT oid FROM pg_roles WHERE rolname='cloud_admin'))
    AND admin_option AND NOT inherit_option AND NOT set_option,false))
 OR pg_has_role(installer_oid,runtime_oid,'SET') OR pg_has_role(installer_oid,runtime_oid,'USAGE')
 OR pg_has_role(installer_oid,canonical_oid,'SET') OR pg_has_role(installer_oid,role_owner_oid,'SET')
 OR pg_has_role(installer_oid,canonical_oid,'USAGE') OR pg_has_role(installer_oid,role_owner_oid,'USAGE')
 OR NOT has_database_privilege(runtime_oid,current_database(),'CONNECT')
 OR has_database_privilege(runtime_oid,current_database(),'CREATE,TEMP,CONNECT WITH GRANT OPTION')
 OR has_database_privilege(canonical_oid,current_database(),'CREATE')
 OR has_database_privilege(role_owner_oid,current_database(),'CREATE')
 THEN RAISE EXCEPTION 'HF094_POSTFLIGHT_ROLE_OR_MEMBERSHIP'; END IF;
 IF (SELECT nspowner FROM pg_namespace WHERE nspname='hft')<>canonical_oid OR
 (SELECT nspowner FROM pg_namespace WHERE nspname='hft_app_roles')<>role_owner_oid OR
 EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
  WHERE n.nspname IN('hft','hft_app_roles') AND c.relowner<>CASE n.nspname WHEN 'hft' THEN canonical_oid ELSE role_owner_oid END)
 OR EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace=n.oid
  WHERE n.nspname IN('hft','hft_app_roles') AND (p.proowner<>CASE n.nspname WHEN 'hft' THEN canonical_oid ELSE role_owner_oid END OR p.prosecdef))
 OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
  AND has_schema_privilege(runtime_oid,n.oid,'CREATE'))
 OR NOT has_schema_privilege(runtime_oid,'hft','USAGE')
 OR NOT has_schema_privilege(runtime_oid,'hft_app_roles','USAGE')
 OR EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace=n.oid
  WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_function_privilege(runtime_oid,p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'HF094_POSTFLIGHT_OWNER_OR_FUNCTION'; END IF;
 -- Resolve relations and columns through catalogs, never through installer schema USAGE.
 SELECT c.oid INTO STRICT assignment_oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='hft_app_roles' AND c.relname='assignment' AND c.relkind='r';
 SELECT c.oid INTO STRICT event_oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='hft_app_roles' AND c.relname='assignment_event' AND c.relkind='r';
 SELECT c.oid INTO STRICT scope_oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='hft_app_roles' AND c.relname='scope_lock' AND c.relkind='r';
 SELECT attnum INTO STRICT epoch_attnum FROM pg_attribute WHERE attrelid=scope_oid AND attname='epoch' AND attnum>0 AND NOT attisdropped;
 -- Eight exact SELECT relations; only two assignment tables can INSERT;
 -- assignment UPDATE and scope_lock.epoch UPDATE only. No column grant options.
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname,c.relname) IN (('hft','employee'),('hft','legal_entity'),('hft','site'),('hft','warehouse'),
   ('hft_app_roles','identity_binding'),('hft_app_roles','scope_lock'),('hft_app_roles','assignment'),('hft_app_roles','assignment_event'))
  AND has_table_privilege(runtime_oid,c.oid,'SELECT'))<>8
 OR NOT has_table_privilege(runtime_oid,assignment_oid,'INSERT')
 OR NOT has_table_privilege(runtime_oid,assignment_oid,'UPDATE')
 OR NOT has_table_privilege(runtime_oid,event_oid,'INSERT')
 OR NOT has_column_privilege(runtime_oid,scope_oid,epoch_attnum,'UPDATE')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND
   CASE WHEN c.relkind='S' THEN has_sequence_privilege(runtime_oid,c.oid,'USAGE,SELECT,UPDATE')
   WHEN c.relkind IN('r','p','v','m','f') THEN
    c.relowner=runtime_oid OR has_table_privilege(runtime_oid,c.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
    OR (has_any_column_privilege(runtime_oid,c.oid,'SELECT') AND (n.nspname,c.relname) NOT IN
      (('hft','employee'),('hft','legal_entity'),('hft','site'),('hft','warehouse'),
       ('hft_app_roles','identity_binding'),('hft_app_roles','scope_lock'),('hft_app_roles','assignment'),('hft_app_roles','assignment_event')))
    OR (has_any_column_privilege(runtime_oid,c.oid,'INSERT') AND (n.nspname,c.relname) NOT IN
      (('hft_app_roles','assignment'),('hft_app_roles','assignment_event')))
    OR (has_table_privilege(runtime_oid,c.oid,'UPDATE') AND (n.nspname,c.relname)<>('hft_app_roles','assignment'))
    OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
     AND (has_column_privilege(runtime_oid,c.oid,a.attnum,'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
       OR (has_column_privilege(runtime_oid,c.oid,a.attnum,'UPDATE') AND NOT
        (n.nspname='hft_app_roles' AND (c.relname='assignment' OR (c.relname='scope_lock' AND a.attname='epoch'))))))
   ELSE false END)
 THEN RAISE EXCEPTION 'HF094_POSTFLIGHT_EFFECTIVE_ACL'; END IF;
 -- Exact nine trigger definitions from accepted app source, unordered multiset.
 actual:=(
SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'relation_schema',n.nspname,'relation',c.relname,'trigger',t.tgname,'enabled',t.tgenabled::text,
 'owner',r.rolname,'owner_login',r.rolcanlogin,'owner_super',r.rolsuper,
 'owners_match',p.proowner=pn.nspowner AND (n.nspname<>'hft_app_roles' OR c.relowner=n.nspowner),
 'relation_owner_secure',NOT ro.rolcanlogin AND NOT ro.rolsuper AND NOT ro.rolbypassrls
  AND NOT pg_catalog.pg_has_role(runtime_oid,ro.oid,'MEMBER'),
 'relation_kind',c.relkind::text,'function_schema',pn.nspname,
 'function_name',p.proname,'body',p.prosrc,'language',l.lanname,
 'security_definer',p.prosecdef,'volatility',p.provolatile::text,
 'strict',p.proisstrict,'parallel',p.proparallel::text,'leakproof',p.proleakproof,
 'returns_trigger',p.prorettype='pg_catalog.trigger'::pg_catalog.regtype,
 'ordinary_function',p.prokind='f','no_arguments',p.pronargs=0,
 'config',p.proconfig,'function_executable',pg_catalog.has_function_privilege(runtime_oid,p.oid,'EXECUTE'),
 'type',t.tgtype::integer,'constraint_type',COALESCE(k.contype::text,''),
 'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,
 'constraint_relation_matches',t.tgconstraint=0 OR
  (k.conrelid=t.tgrelid AND k.condeferrable=t.tgdeferrable AND k.condeferred=t.tginitdeferred),
 'no_filter',t.tgqual IS NULL AND t.tgnargs=0 AND t.tgargs=''::bytea
  AND t.tgattr=''::pg_catalog.int2vector AND t.tgoldtable IS NULL
  AND t.tgnewtable IS NULL AND t.tgparentid=0
) ORDER BY c.relname,t.tgname),'[]'::jsonb)
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
JOIN pg_catalog.pg_roles ro ON ro.oid=c.relowner
LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint
WHERE NOT t.tgisinternal AND (n.nspname='hft_app_roles' OR
 (n.nspname='hft' AND c.relname IN('employee','legal_entity','site','warehouse')
  AND t.tgname='role_dependency_fence')));
 IF jsonb_array_length(actual)<>9 OR NOT (actual @> expected AND expected @> actual)
 THEN RAISE EXCEPTION 'HF094_POSTFLIGHT_TRIGGER_CONTRACT'; END IF;
 -- Canonical revision bytes and initial empty roles are checked as their actual
 -- NOLOGIN owners before the temporary SET rights are closed. This independent
 -- read-only catalog check deliberately requires no retained installer data grants.
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='hft' AND c.relkind='r' AND c.relname IN('schema_revision','stock_entry','stock_account'))<>3
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='hft_app_roles' AND c.relkind IN('r','p'))<>4
 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_app_roles')<>3
 THEN RAISE EXCEPTION 'HF094_POSTFLIGHT_REQUIRED_RELATIONS'; END IF;
END $hf094_postflight$;
SELECT 'HF094_ROLES_ONLY_CATALOG_ACL_PASS';
