-- HF094 executable Roles-only candidate, derived from original STOP-guarded SQL.
-- Original trigger bodies/table definitions unchanged. No standalone authority.
RESET ROLE;
DO $hf094_stop$ BEGIN
 IF current_database()<>'hft_r1_retained_masters_np077'
 OR (SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())<>16397
 OR current_setting('server_version_num')<>'180007'
 OR session_user<>'hft_r1_retained_masters_np077_owner' OR current_user<>session_user
 OR pg_catalog.pg_is_in_recovery()
 OR current_setting('hft.hf094_admitted',true) IS DISTINCT FROM 'roles-only-v1'
 OR COALESCE(current_setting('hft.hf094_order_sha256',true),'') !~ '^[0-9a-f]{64}$'
 OR COALESCE(current_setting('hft.hf094_technical_sha256',true),'') !~ '^[0-9a-f]{64}$'
 OR COALESCE(current_setting('hft.hf094_expires_at',true),'')=''
 THEN RAISE EXCEPTION 'HF094_INSTALLATION_NOT_ADMITTED'; END IF;
 IF pg_catalog.clock_timestamp()>=current_setting('hft.hf094_expires_at')::timestamptz
 THEN RAISE EXCEPTION 'HF094_INSTALLATION_ADMISSION_EXPIRED'; END IF;
END $hf094_stop$;

SET LOCAL ROLE hft_engineering;
DO $revision_check$ BEGIN
 IF (SELECT count(*) FROM hft.schema_revision)<>6 OR EXISTS(
 SELECT 1 FROM (VALUES (1,'8e7253652591c5ce7ef3935d0dc8893e4f503479fa59e7748583ec9ec2215723'),
 (2,'6e1981c6314b604f470c4a5d9e7c255891fc7e3f693e5cde7780ea77ff12da36'),
 (3,'bf8a4987d1f3c82f3016a1d340edb79a6d238229e23f28dbc65cc75c0a181cf8'),
 (4,'27375f432d476e8e88f8402af1970422d62de898a1fbcc91a9ec30efce79d7e2'),
 (5,'01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf'),
 (6,'664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044')) AS expected_revision(version,sha256)
 LEFT JOIN hft.schema_revision s USING(version)
 WHERE s.sha256 IS DISTINCT FROM expected_revision.sha256)
 THEN RAISE EXCEPTION 'HF094_CANONICAL_REVISION_READBACK_MISMATCH'; END IF;
END $revision_check$;
REVOKE ALL ON SCHEMA hft FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hft FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft FROM PUBLIC;
GRANT USAGE ON SCHEMA hft TO hft_r1_roles_owner,hft_r1_roles_np_login;
GRANT REFERENCES ON hft.employee,hft.site,hft.warehouse TO hft_r1_roles_owner;
GRANT SELECT ON hft.employee,hft.legal_entity,hft.site,hft.warehouse TO hft_r1_roles_np_login;
RESET ROLE;
SET LOCAL ROLE hft_r1_roles_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE SCHEMA hft_app_roles;
REVOKE ALL ON SCHEMA hft_app_roles FROM PUBLIC;
-- Onboarding populates this from authoritative identity/person/employee records.
-- Neither the browser nor the assignment service may create/change bindings.
CREATE TABLE hft_app_roles.identity_binding(
 subject text NOT NULL,
 legal_entity_id text NOT NULL,
 employee_id text NOT NULL,
 person_id text NOT NULL CHECK(length(person_id)>1),
 active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(subject,legal_entity_id),
 UNIQUE(legal_entity_id,employee_id),
 FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
-- Pre-enrolled exact scopes; no wildcard scope or runtime scope creation.
CREATE TABLE hft_app_roles.scope_lock(
 legal_entity_id text NOT NULL,
 site_id text NOT NULL,
 warehouse_id text NOT NULL,
 epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id),
 FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
 FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id)
);
CREATE TABLE hft_app_roles.assignment(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 employee_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0 AND revision<9007199254740992),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND jsonb_typeof(snapshot->'periods')='array'),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,employee_id),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id) REFERENCES hft_app_roles.scope_lock,
 FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft.employee(legal_entity_id,employee_id),
 CHECK(snapshot->>'employeeId'=employee_id AND (snapshot->>'revision')::bigint=revision),
 CHECK(snapshot->'scope'->>'legalEntityId'=legal_entity_id AND snapshot->'scope'->>'siteId'=site_id
  AND snapshot->'scope'->>'warehouseId'=warehouse_id)
);
CREATE TABLE hft_app_roles.assignment_event(
 request_id uuid PRIMARY KEY,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 employee_id text NOT NULL,revision bigint NOT NULL CHECK(revision>0),
 event jsonb NOT NULL,
 event_sha256 text NOT NULL CHECK(event_sha256~'^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 recorded_by name NOT NULL DEFAULT session_user,
 UNIQUE(legal_entity_id,site_id,warehouse_id,employee_id,revision),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,employee_id) REFERENCES hft_app_roles.assignment,
 CHECK(event->>'requestId'=request_id::text AND event->'after'->>'employeeId'=employee_id
  AND (event->'after'->>'revision')::bigint=revision),
 CHECK(length(event->>'actorSubject')>1 AND length(event->>'actorSessionId')>1 AND length(event->>'reason')>=8)
);
CREATE FUNCTION hft_app_roles.deny_event_mutation() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,pg_temp AS $immutable$
BEGIN RAISE EXCEPTION 'HFT_APP_ROLE_AUDIT_IMMUTABLE'; END $immutable$;
CREATE TRIGGER immutable_assignment_event BEFORE UPDATE OR DELETE ON hft_app_roles.assignment_event
 FOR EACH ROW EXECUTE FUNCTION hft_app_roles.deny_event_mutation();
-- Every changed current snapshot needs its exact immutable history row at COMMIT.
CREATE FUNCTION hft_app_roles.require_assignment_event() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,pg_temp AS $audit$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hft_app_roles.assignment_event e
  WHERE e.legal_entity_id=NEW.legal_entity_id AND e.site_id=NEW.site_id
   AND e.warehouse_id=NEW.warehouse_id AND e.employee_id=NEW.employee_id
   AND e.revision=NEW.revision AND e.event->'after'=NEW.snapshot)
 THEN RAISE EXCEPTION 'HFT_APP_ROLE_SNAPSHOT_AUDIT_MISSING'; END IF;
 RETURN NULL;
END $audit$;
CREATE CONSTRAINT TRIGGER assignment_requires_audit AFTER INSERT OR UPDATE ON hft_app_roles.assignment
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hft_app_roles.require_assignment_event();
-- All role/identity/scope mutations participate, including separately authorized
-- revocation writers. Stock login only acquires a shared advisory fence; the
-- role-only login receives NO stock/helper EXECUTE or stock table DML.
CREATE FUNCTION hft_app_roles.fence_role_mutation() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,pg_temp AS $fence$
BEGIN
 -- Database-local exclusive transaction fence; conflicts with stock operations.
 PERFORM pg_catalog.pg_advisory_xact_lock(1212568624,77);
 RETURN NULL;
END $fence$;
CREATE TRIGGER role_revocation_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft_app_roles.assignment FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft_app_roles.assignment ENABLE ALWAYS TRIGGER role_revocation_fence;
CREATE TRIGGER role_revocation_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft_app_roles.identity_binding FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft_app_roles.identity_binding ENABLE ALWAYS TRIGGER role_revocation_fence;
CREATE TRIGGER role_revocation_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft_app_roles.scope_lock FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft_app_roles.scope_lock ENABLE ALWAYS TRIGGER role_revocation_fence;
ALTER TABLE hft_app_roles.assignment ENABLE ALWAYS TRIGGER assignment_requires_audit;
ALTER TABLE hft_app_roles.assignment_event ENABLE ALWAYS TRIGGER immutable_assignment_event;

REVOKE ALL ON ALL TABLES IN SCHEMA hft_app_roles FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_app_roles FROM PUBLIC;
-- Temporary trigger-creation privileges; removed before commit.
GRANT USAGE ON SCHEMA hft_app_roles TO hft_engineering;
GRANT EXECUTE ON FUNCTION hft_app_roles.fence_role_mutation() TO hft_engineering;
GRANT USAGE ON SCHEMA hft_app_roles TO hft_r1_roles_np_login;
GRANT SELECT ON hft_app_roles.identity_binding,hft_app_roles.scope_lock TO hft_r1_roles_np_login;
GRANT UPDATE(epoch) ON hft_app_roles.scope_lock TO hft_r1_roles_np_login;
GRANT SELECT,INSERT,UPDATE ON hft_app_roles.assignment TO hft_r1_roles_np_login;
GRANT SELECT,INSERT ON hft_app_roles.assignment_event TO hft_r1_roles_np_login;
RESET ROLE;
SET LOCAL ROLE hft_engineering;
CREATE TRIGGER role_dependency_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft.employee FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft.employee ENABLE ALWAYS TRIGGER role_dependency_fence;
CREATE TRIGGER role_dependency_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft.legal_entity FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft.legal_entity ENABLE ALWAYS TRIGGER role_dependency_fence;
CREATE TRIGGER role_dependency_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft.site FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft.site ENABLE ALWAYS TRIGGER role_dependency_fence;
CREATE TRIGGER role_dependency_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft.warehouse FOR EACH STATEMENT
 EXECUTE FUNCTION hft_app_roles.fence_role_mutation();
ALTER TABLE hft.warehouse ENABLE ALWAYS TRIGGER role_dependency_fence;

REVOKE REFERENCES ON hft.employee,hft.site,hft.warehouse FROM hft_r1_roles_owner;
REVOKE USAGE ON SCHEMA hft FROM hft_r1_roles_owner;
RESET ROLE;
SET LOCAL ROLE hft_r1_roles_owner;
DO $empty_roles$ BEGIN
 IF EXISTS(SELECT 1 FROM hft_app_roles.identity_binding) OR EXISTS(SELECT 1 FROM hft_app_roles.scope_lock)
 OR EXISTS(SELECT 1 FROM hft_app_roles.assignment) OR EXISTS(SELECT 1 FROM hft_app_roles.assignment_event)
 THEN RAISE EXCEPTION 'HF094_UNEXPECTED_INITIAL_ROLE_STATE'; END IF;
END $empty_roles$;
REVOKE EXECUTE ON FUNCTION hft_app_roles.fence_role_mutation() FROM hft_engineering;
REVOKE USAGE ON SCHEMA hft_app_roles FROM hft_engineering;
RESET ROLE;
REVOKE CREATE ON DATABASE hft_r1_retained_masters_np077 FROM hft_engineering,hft_r1_roles_owner;
-- Keep only the provider's unavoidable ADMIN-only relationship if present;
-- remove effective SET/INHERIT; postflight rejects any additional edge.
GRANT hft_engineering,hft_r1_roles_owner TO hft_r1_retained_masters_np077_owner
 WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
-- No initial Owner Admin, identity, scope, employee, role assignment, password or LOGIN.
