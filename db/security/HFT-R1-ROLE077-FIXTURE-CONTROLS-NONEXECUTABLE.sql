-- ISOLATED FIXTURE ADDENDUM ONLY. No runtime grants or installation authority.
-- Chat13 installs the two exact helpers only after target-specific admission.
-- role_fixture_control_v1 owner: existing nonlogin hft_r1_roles_owner.
-- master_fixture_control_v1 owner: existing nonlogin protected master owner.
-- Each owner needs SELECT of the immutable binding; no new owner memberships.
-- Only the separately restricted fixture executor may EXECUTE these helpers.
-- Role/stock logins must have NO EXECUTE; they never receive master/binding DML.
BEGIN;
DO $STOP_QUAL077_FIXTURE$ BEGIN
 RAISE EXCEPTION 'QUAL077_FIXTURE_CONTROLS_NOT_ADMITTED';
END $STOP_QUAL077_FIXTURE$;
CREATE FUNCTION hft_qual077.role_fixture_control_v1(action text,fixture_text text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $role_fixture$
DECLARE a jsonb; f jsonb; le text; employee text; actor text;
BEGIN
 SELECT payload INTO STRICT a FROM hft_qual077.execution_binding;
 IF (a->>'fixtureOnly') IS DISTINCT FROM 'true' OR (a->'target'->>'database') IS DISTINCT FROM current_database()
  OR current_database()!~'^hft_r1_disposable_role077_[a-z0-9_]{6,24}$'
  OR session_user IS DISTINCT FROM (a->'logins'->>'fixtureExecutor')
  OR (a->>'expiresAt') IS NULL OR clock_timestamp()>=(a->>'expiresAt')::timestamptz
  OR encode(sha256(convert_to(fixture_text,'UTF8')),'hex') IS DISTINCT FROM (a->>'fixtureSha256')
 THEN RAISE EXCEPTION 'QUAL077_FIXTURE_AUTHORITY_DENIED'; END IF;
 f:=fixture_text::jsonb; le:=f->'scope'->>'legalEntityId';
 employee:=f->'target'->>'employeeId';actor:=f->'admin'->>'employeeId';
 IF le IS NULL OR employee IS NULL OR actor IS NULL OR le NOT LIKE 'QUAL077-%' OR employee NOT LIKE 'QUAL077-%' OR actor NOT LIKE 'QUAL077-%'
 THEN RAISE EXCEPTION 'QUAL077_FIXTURE_ID_REQUIRED'; END IF;
 CASE action
 WHEN 'binding-deactivate' THEN
  UPDATE hft_app_roles.identity_binding SET active=false WHERE legal_entity_id=le AND employee_id=employee;
 WHEN 'binding-restore' THEN
  UPDATE hft_app_roles.identity_binding SET active=true,person_id=f->'target'->>'personId'
   WHERE legal_entity_id=le AND employee_id=employee;
 WHEN 'identity-self' THEN
  UPDATE hft_app_roles.identity_binding SET person_id=f->'admin'->>'personId'
   WHERE legal_entity_id=le AND employee_id=employee;
 WHEN 'audit-disable' THEN
  ALTER TABLE hft_app_roles.assignment_event DISABLE TRIGGER immutable_assignment_event;
 WHEN 'constraint-disable' THEN
  ALTER TABLE hft_app_roles.assignment DISABLE TRIGGER assignment_requires_audit;
 WHEN 'audit-misplace' THEN
  DROP TRIGGER immutable_assignment_event ON hft_app_roles.assignment_event;
  CREATE TRIGGER immutable_assignment_event BEFORE UPDATE OR DELETE ON hft_app_roles.identity_binding
   FOR EACH ROW EXECUTE FUNCTION hft_app_roles.deny_event_mutation();
  ALTER TABLE hft_app_roles.identity_binding ENABLE ALWAYS TRIGGER immutable_assignment_event;
 WHEN 'audit-replace' THEN
  DROP TRIGGER immutable_assignment_event ON hft_app_roles.assignment_event;
  CREATE TRIGGER immutable_assignment_event BEFORE UPDATE OR DELETE ON hft_app_roles.assignment_event
   FOR EACH ROW EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
  ALTER TABLE hft_app_roles.assignment_event ENABLE ALWAYS TRIGGER immutable_assignment_event;
 WHEN 'audit-noop' THEN
  EXECUTE 'CREATE OR REPLACE FUNCTION hft_app_roles.deny_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $noop$BEGIN RETURN OLD; END $noop$';
 WHEN 'audit-restore' THEN
  DROP TRIGGER IF EXISTS immutable_assignment_event ON hft_app_roles.identity_binding;
  DROP TRIGGER IF EXISTS immutable_assignment_event ON hft_app_roles.assignment_event;
  EXECUTE 'CREATE OR REPLACE FUNCTION hft_app_roles.deny_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $immutable$
BEGIN RAISE EXCEPTION ''HFT_APP_ROLE_AUDIT_IMMUTABLE''; END $immutable$';
  CREATE TRIGGER immutable_assignment_event BEFORE UPDATE OR DELETE ON hft_app_roles.assignment_event
   FOR EACH ROW EXECUTE FUNCTION hft_app_roles.deny_event_mutation();
  ALTER TABLE hft_app_roles.assignment_event ENABLE ALWAYS TRIGGER immutable_assignment_event;
  ALTER TABLE hft_app_roles.assignment ENABLE ALWAYS TRIGGER assignment_requires_audit;
 WHEN 'audit-update' THEN
  UPDATE hft_app_roles.assignment_event SET event=event WHERE legal_entity_id=le AND employee_id=employee;
 ELSE RAISE EXCEPTION 'QUAL077_FIXTURE_ACTION_DENIED';
 END CASE;
 RETURN jsonb_build_object('action',action,'fixtureOnly',true);
END
$role_fixture$;
CREATE FUNCTION hft_qual077.master_fixture_control_v1(action text,fixture_text text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $master_fixture$
DECLARE a jsonb; f jsonb; le text; site text; warehouse text; employee text; actor text;
BEGIN
 SELECT payload INTO STRICT a FROM hft_qual077.execution_binding;
 IF (a->>'fixtureOnly') IS DISTINCT FROM 'true' OR (a->'target'->>'database') IS DISTINCT FROM current_database()
  OR current_database()!~'^hft_r1_disposable_role077_[a-z0-9_]{6,24}$'
  OR session_user IS DISTINCT FROM (a->'logins'->>'fixtureExecutor')
  OR (a->>'expiresAt') IS NULL OR clock_timestamp()>=(a->>'expiresAt')::timestamptz
  OR encode(sha256(convert_to(fixture_text,'UTF8')),'hex') IS DISTINCT FROM (a->>'fixtureSha256')
 THEN RAISE EXCEPTION 'QUAL077_FIXTURE_AUTHORITY_DENIED'; END IF;
 f:=fixture_text::jsonb; le:=f->'scope'->>'legalEntityId';site:=f->'scope'->>'siteId';
 warehouse:=f->'scope'->>'warehouseId';employee:=f->'target'->>'employeeId';actor:=f->'admin'->>'employeeId';
 IF le IS NULL OR employee IS NULL OR actor IS NULL OR le NOT LIKE 'QUAL077-%' OR site NOT LIKE 'QUAL077-%' OR warehouse NOT LIKE 'QUAL077-%'
  OR employee NOT LIKE 'QUAL077-%' OR actor NOT LIKE 'QUAL077-%'
 THEN RAISE EXCEPTION 'QUAL077_FIXTURE_ID_REQUIRED'; END IF;
 CASE action
 WHEN 'actor-deactivate' THEN UPDATE hft.employee SET active=false,version=version+1 WHERE legal_entity_id=le AND employee_id=actor;
 WHEN 'actor-restore' THEN UPDATE hft.employee SET active=true,version=version+1 WHERE legal_entity_id=le AND employee_id=actor;
 WHEN 'employee-deactivate' THEN UPDATE hft.employee SET active=false,version=version+1 WHERE legal_entity_id=le AND employee_id=employee;
 WHEN 'employee-restore' THEN UPDATE hft.employee SET active=true,version=version+1 WHERE legal_entity_id=le AND employee_id=employee;
 WHEN 'entity-deactivate' THEN UPDATE hft.legal_entity SET active=false WHERE id=le;
 WHEN 'entity-restore' THEN UPDATE hft.legal_entity SET active=true WHERE id=le;
 WHEN 'site-deactivate' THEN UPDATE hft.site SET active=false WHERE legal_entity_id=le AND id=site;
 WHEN 'site-restore' THEN UPDATE hft.site SET active=true WHERE legal_entity_id=le AND id=site;
 WHEN 'warehouse-deactivate' THEN UPDATE hft.warehouse SET active=false WHERE legal_entity_id=le AND warehouse_id=warehouse;
 WHEN 'warehouse-restore' THEN UPDATE hft.warehouse SET active=true WHERE legal_entity_id=le AND warehouse_id=warehouse;
 ELSE RAISE EXCEPTION 'QUAL077_FIXTURE_ACTION_DENIED';
 END CASE;
 RETURN jsonb_build_object('action',action,'fixtureOnly',true);
END
$master_fixture$;
REVOKE ALL ON FUNCTION hft_qual077.role_fixture_control_v1(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hft_qual077.master_fixture_control_v1(text,text) FROM PUBLIC;
-- No GRANT, CREATE ROLE, SET ROLE, bootstrap, stock writer or ledger mutation.
-- Installer binds exact helper bodies to these owners. The executor is neither
-- an owner nor a member of either owner role. Runtime logins cannot call them.
COMMIT;
