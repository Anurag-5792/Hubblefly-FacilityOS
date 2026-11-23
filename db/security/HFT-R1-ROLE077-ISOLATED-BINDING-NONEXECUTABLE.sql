-- Addendum for Chat13's target-specific fixture installer; NOT a fresh package.
-- Never install on retained/production. Runtime grants are NOT made here.
-- Exact signed admission data and source/installer hashes come from Chat13/11.
BEGIN;
DO $STOP_QUAL077_BINDING$ BEGIN
 RAISE EXCEPTION 'QUAL077_TARGET_SPECIFIC_INSTALLATION_NOT_ADMITTED';
END $STOP_QUAL077_BINDING$;
CREATE SCHEMA hft_qual077;
REVOKE ALL ON SCHEMA hft_qual077 FROM PUBLIC;
CREATE TABLE hft_qual077.execution_binding(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 admission_sha256 text NOT NULL CHECK(admission_sha256~'^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload->>'fixtureOnly'='true')
);
-- The accepted installer inserts exactly ONE independently signed admission
-- payload here before creating the immutable trigger. There is deliberately no
-- fabricated INSERT, target, key, executor appointment or approval in source.
CREATE FUNCTION hft_qual077.deny_binding_mutation() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,pg_temp AS $immutable$
BEGIN RAISE EXCEPTION 'QUAL077_BINDING_IMMUTABLE'; END $immutable$;
CREATE TRIGGER immutable_qualification_binding BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON hft_qual077.execution_binding FOR EACH STATEMENT
 EXECUTE FUNCTION hft_qual077.deny_binding_mutation();
ALTER TABLE hft_qual077.execution_binding ENABLE ALWAYS TRIGGER immutable_qualification_binding;
REVOKE ALL ON ALL TABLES IN SCHEMA hft_qual077 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_qual077 FROM PUBLIC;
-- Nonlogin/nonsuperuser schema/table/function ownership must match. The role
-- and stock logins receive only USAGE on this schema and SELECT on this table
-- from the separately admitted installer. No ownership/member/helper privileges.
COMMIT;
