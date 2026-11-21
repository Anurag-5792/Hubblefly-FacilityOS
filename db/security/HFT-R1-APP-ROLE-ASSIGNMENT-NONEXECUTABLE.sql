-- Settings / Users & Roles. Application permissions, not PostgreSQL roles.
-- Source candidate only. Internal nonproduction backend admission is required;
-- routine feature iteration does NOT require an outside consultant.
BEGIN;
DO $STOP_APP_ROLE_ASSIGNMENT$ BEGIN
 RAISE EXCEPTION 'HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED';
END $STOP_APP_ROLE_ASSIGNMENT$;
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
REVOKE ALL ON ALL TABLES IN SCHEMA hft_app_roles FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_app_roles FROM PUBLIC;
-- NO CREATE ROLE, GRANT, enrollment, bootstrap owner or activation is performed.
-- Future installation: a dedicated nonowner service login gets only SELECT on
-- admitted employee/identity/scope inputs, UPDATE(epoch) on scope_lock,
-- SELECT/INSERT/UPDATE on assignment,
-- SELECT/INSERT on assignment_event. No DELETE/TRUNCATE or audit UPDATE.
-- It gets NO protected-stock DML/EXECUTE and no role-creation/membership ability.
-- SQL-owning/admin credentials remain outside the application. All assignment
-- operations lock and increment scope epoch before reading delegating authority.
-- A waiter with an older SERIALIZABLE snapshot must abort on the changed row;
-- no timestamp or cached token role substitutes for this ordering boundary.
-- Initial Owner Admin is an internally authenticated onboarding operation with
-- the same immutable event, never an email/domain/first-login bootstrap rule.
COMMIT;
