-- QA-014 PostgreSQL privilege negative catalogue; EXECUTION NOT PERFORMED.
-- After provisioning the NOLOGIN roles on an approved disposable DB,
-- this SELECT must report false for ALL runtime mutation capabilities.
SELECT current_database() AS db_name,current_user,session_user,
 has_schema_privilege('hft_r1_app_runtime','hft','CREATE') AS runtime_may_create_schema_objects,
 has_table_privilege('hft_r1_app_runtime','hft.stock_entry','INSERT') AS runtime_may_insert_entry,
 has_table_privilege('hft_r1_app_runtime','hft.stock_command','INSERT') AS runtime_may_insert_command,
 has_table_privilege('hft_r1_app_runtime','hft.stock_account','UPDATE') AS runtime_may_update_balance,
 has_table_privilege('hft_r1_app_runtime','hft.stock_approval','UPDATE') AS runtime_may_mutate_approvals,
 has_table_privilege('hft_r1_app_runtime','hft.stock_hold','DELETE') AS runtime_may_remove_hold,
 has_table_privilege('hft_r1_app_runtime','hft.audit_outbox','DELETE') AS runtime_may_delete_audit,
 has_table_privilege('hft_r1_audit_verify','hft.stock_entry','INSERT') AS audit_may_mutate_entry;
-- Additionally inspect pg_class.relowner, pg_roles rolcreaterole / rolsuper,
-- pg_proc.prosecdef, pg_trigger.tgenabled, pg_constraint.convalidated.
-- Read-only catalog values do not replace an actual denied-role DML attempt.
