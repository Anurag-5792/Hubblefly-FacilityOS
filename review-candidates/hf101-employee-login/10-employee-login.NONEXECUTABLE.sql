-- HF101 incremental canonical employee identity gateway. Candidate only.
-- Do not install in a retained or live database through this file.
BEGIN;
DO $STOP_HF101$ BEGIN
 RAISE EXCEPTION 'HF101_EMPLOYEE_LOGIN_INSTALLATION_NOT_ADMITTED';
END $STOP_HF101$;
-- No duplicate employee or assignment master. The existing canonical binding
-- supplies stable subject/person identity. Registration does not confer roles.
-- Dedicated NOLOGIN owner requires only SELECT on canonical employee/entity/site/warehouse,
-- identity_binding/scope_lock/assignment and REFERENCES on identity_binding.
-- Existing HF100 role owner, tables, triggers and grants remain unchanged.
CREATE SCHEMA hft_employee_login;
REVOKE ALL ON SCHEMA hft_employee_login FROM PUBLIC;
CREATE TABLE hft_employee_login.employee_login_registration(
 legal_entity_id text NOT NULL, employee_id text NOT NULL,
 subject text NOT NULL UNIQUE, person_id text NOT NULL UNIQUE,
 email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND length(email)<=254 AND email~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 google_subject text UNIQUE CHECK(google_subject IS NULL OR (length(google_subject) BETWEEN 1 AND 256 AND google_subject~'^[!-~]+$')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0 AND version<9007199254740992),
 PRIMARY KEY(legal_entity_id,employee_id),
 FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft_app_roles.identity_binding(legal_entity_id,employee_id)
);
CREATE TABLE hft_employee_login.employee_login_event(
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 legal_entity_id text NOT NULL, employee_id text NOT NULL,
 version bigint NOT NULL, action text NOT NULL CHECK(action IN('REGISTER','EMAIL_CHANGE','FIRST_BIND','SIGN_IN')),
 actor_subject text NOT NULL, reason text NOT NULL CHECK(length(reason)>=8),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(legal_entity_id,employee_id) REFERENCES hft_employee_login.employee_login_registration(legal_entity_id,employee_id)
);
CREATE FUNCTION hft_employee_login.employee_login_audit_immutable_v1() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $f$
BEGIN RAISE EXCEPTION 'HF101_LOGIN_AUDIT_IMMUTABLE'; END $f$;
CREATE TRIGGER employee_login_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
 ON hft_employee_login.employee_login_event FOR EACH STATEMENT EXECUTE FUNCTION hft_employee_login.employee_login_audit_immutable_v1();
ALTER TABLE hft_employee_login.employee_login_event ENABLE ALWAYS TRIGGER employee_login_audit_immutable;
CREATE FUNCTION hft_employee_login.employee_login_context_v1(p_entity text,p_employee text,p_subject text,p_person text,p_version bigint,p_employee_version bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE c jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1212568624,77);
 SELECT jsonb_build_object('legalEntityId',e.legal_entity_id,'employeeId',e.employee_id,
  'personId',b.person_id,'subject',b.subject,'siteId',e.site_id,'fullName',e.full_name,
  'employeeVersion',e.version,'loginVersion',l.version,'email',l.email,
  'assignments',COALESCE((SELECT jsonb_agg(a.snapshot ORDER BY a.warehouse_id)
   FROM hft_app_roles.assignment a JOIN hft_app_roles.scope_lock sl
   ON (sl.legal_entity_id,sl.site_id,sl.warehouse_id)=(a.legal_entity_id,a.site_id,a.warehouse_id)
   JOIN hft.warehouse w ON (w.legal_entity_id,w.site_id,w.warehouse_id)=(a.legal_entity_id,a.site_id,a.warehouse_id)
   WHERE a.legal_entity_id=e.legal_entity_id AND a.employee_id=e.employee_id AND a.site_id=e.site_id AND w.active),'[]'::jsonb))
 INTO c FROM hft_employee_login.employee_login_registration l
 JOIN hft_app_roles.identity_binding b USING(legal_entity_id,employee_id)
 JOIN hft.employee e USING(legal_entity_id,employee_id)
 JOIN hft.legal_entity le ON le.id=e.legal_entity_id
 JOIN hft.site st ON st.legal_entity_id=e.legal_entity_id AND st.id=e.site_id
 WHERE e.legal_entity_id=p_entity AND e.employee_id=p_employee AND b.subject=p_subject AND b.person_id=p_person
 AND l.subject=b.subject AND l.person_id=b.person_id AND l.version=p_version AND e.version=p_employee_version
 AND l.google_subject IS NOT NULL AND b.active AND e.active AND le.active AND st.active;
 IF c IS NULL THEN RAISE EXCEPTION 'HF101_EMPLOYEE_SESSION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN c;
END $f$;
-- Called ONLY by a restricted identity gateway after actual Google token
-- verification, not by browser-supplied claims. Never derive a role from email.
CREATE FUNCTION hft_employee_login.employee_google_claim_v1(p_email text,p_google_subject text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE l hft_employee_login.employee_login_registration%ROWTYPE; ev bigint; first_bind boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(1212568624,77);
 IF p_email IS NULL OR p_google_subject IS NULL OR length(p_google_subject) NOT BETWEEN 1 AND 256 OR p_google_subject!~'^[!-~]+$' THEN RAISE EXCEPTION 'HF101_EMPLOYEE_LOGIN_DENIED' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO l FROM hft_employee_login.employee_login_registration x
 JOIN hft_app_roles.identity_binding b USING(legal_entity_id,employee_id)
 JOIN hft.employee e USING(legal_entity_id,employee_id)
 WHERE x.email=lower(btrim(p_email)) AND x.subject=b.subject AND x.person_id=b.person_id AND b.active AND e.active;
 IF NOT FOUND OR (l.google_subject IS NOT NULL AND l.google_subject<>p_google_subject)
 OR EXISTS(SELECT 1 FROM hft_employee_login.employee_login_registration x WHERE x.google_subject=p_google_subject AND (x.legal_entity_id,x.employee_id)<>(l.legal_entity_id,l.employee_id))
 THEN RAISE EXCEPTION 'HF101_EMPLOYEE_LOGIN_DENIED' USING ERRCODE='42501'; END IF;
 first_bind:=l.google_subject IS NULL;
 IF first_bind THEN
  UPDATE hft_employee_login.employee_login_registration SET google_subject=p_google_subject,version=version+1
  WHERE legal_entity_id=l.legal_entity_id AND employee_id=l.employee_id RETURNING * INTO l;
 END IF;
 SELECT version INTO STRICT ev FROM hft.employee WHERE legal_entity_id=l.legal_entity_id AND employee_id=l.employee_id;
 INSERT INTO hft_employee_login.employee_login_event(legal_entity_id,employee_id,version,action,actor_subject,reason)
 VALUES(l.legal_entity_id,l.employee_id,l.version,CASE WHEN first_bind THEN 'FIRST_BIND' ELSE 'SIGN_IN' END,l.subject,'Verified Google sign-in');
 RETURN hft_employee_login.employee_login_context_v1(l.legal_entity_id,l.employee_id,l.subject,l.person_id,l.version,ev);
END $f$;
-- Existing persisted Owner Admin only, at the employee's exact entity/site
-- and a valid warehouse. No first-login owner elevation or email/domain admin.
CREATE FUNCTION hft_employee_login.employee_email_register_v1(p_entity text,p_employee text,p_email text,p_expected bigint,
 p_actor_employee text,p_actor_subject text,p_actor_person text,p_actor_version bigint,p_actor_employee_version bigint,p_warehouse text,p_reason text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor jsonb; b hft_app_roles.identity_binding%ROWTYPE; e hft.employee%ROWTYPE; l hft_employee_login.employee_login_registration%ROWTYPE; changed bigint; action text;
BEGIN
 PERFORM pg_advisory_xact_lock(1212568624,77);
 actor:=hft_employee_login.employee_login_context_v1(p_entity,p_actor_employee,p_actor_subject,p_actor_person,p_actor_version,p_actor_employee_version);
 SELECT * INTO e FROM hft.employee WHERE legal_entity_id=p_entity AND employee_id=p_employee AND active;
 IF NOT FOUND OR p_employee=p_actor_employee OR e.site_id<>actor->>'siteId' OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actor->'assignments') a CROSS JOIN LATERAL jsonb_array_elements(a->'periods') period
  WHERE a->'scope'->>'warehouseId'=p_warehouse AND a->'scope'->>'legalEntityId'=p_entity AND a->'scope'->>'siteId'=e.site_id
   AND (period->>'from')::timestamptz<=clock_timestamp() AND (period->>'to' IS NULL OR (period->>'to')::timestamptz>clock_timestamp())
   AND period->'roles' @> '["OWNER_ADMIN"]'::jsonb)
 THEN RAISE EXCEPTION 'HF101_EMPLOYEE_REGISTRATION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM hft_app_roles.identity_binding WHERE legal_entity_id=p_entity AND employee_id=p_employee AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'HF101_CANONICAL_BINDING_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM hft_employee_login.employee_login_registration WHERE legal_entity_id=p_entity AND employee_id=p_employee;
 IF NOT FOUND THEN
  IF p_expected IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'HF101_LOGIN_VERSION_CONFLICT'; END IF;
  INSERT INTO hft_employee_login.employee_login_registration(legal_entity_id,employee_id,subject,person_id,email)
  VALUES(p_entity,p_employee,b.subject,b.person_id,lower(btrim(p_email))) RETURNING version INTO changed;
  action:='REGISTER';
 ELSE
  IF p_expected IS DISTINCT FROM l.version OR b.subject<>l.subject OR b.person_id<>l.person_id THEN RAISE EXCEPTION 'HF101_LOGIN_VERSION_CONFLICT'; END IF;
  IF l.email=lower(btrim(p_email)) THEN RAISE EXCEPTION 'HF101_EMAIL_UNCHANGED'; END IF;
  -- Preserve the already verified provider subject; never silently rebind.
  UPDATE hft_employee_login.employee_login_registration SET email=lower(btrim(p_email)),version=version+1
  WHERE legal_entity_id=p_entity AND employee_id=p_employee RETURNING version INTO changed;
  action:='EMAIL_CHANGE';
 END IF;
 INSERT INTO hft_employee_login.employee_login_event(legal_entity_id,employee_id,version,action,actor_subject,reason)
 VALUES(p_entity,p_employee,changed,action,p_actor_subject,btrim(p_reason));
 RETURN changed;
END $f$;
REVOKE ALL ON hft_employee_login.employee_login_registration,hft_employee_login.employee_login_event FROM PUBLIC;
REVOKE ALL ON FUNCTION hft_employee_login.employee_login_audit_immutable_v1(),hft_employee_login.employee_login_context_v1(text,text,text,text,bigint,bigint),hft_employee_login.employee_google_claim_v1(text,text),hft_employee_login.employee_email_register_v1(text,text,text,bigint,text,text,text,bigint,bigint,text,text) FROM PUBLIC;
-- Fresh owner-scoped read of a single canonical employee's registration.
CREATE FUNCTION hft_employee_login.employee_email_target_v1(p_entity text,p_employee text,
 p_actor_employee text,p_actor_subject text,p_actor_person text,p_actor_version bigint,p_actor_employee_version bigint,p_warehouse text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor jsonb; result jsonb;
BEGIN
 actor:=hft_employee_login.employee_login_context_v1(p_entity,p_actor_employee,p_actor_subject,p_actor_person,p_actor_version,p_actor_employee_version);
 IF p_employee=p_actor_employee OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(actor->'assignments') a CROSS JOIN LATERAL jsonb_array_elements(a->'periods') period
 WHERE a->'scope'->>'warehouseId'=p_warehouse AND a->'scope'->>'legalEntityId'=p_entity
 AND a->'scope'->>'siteId'=actor->>'siteId'
 AND (period->>'from')::timestamptz<=clock_timestamp() AND (period->>'to' IS NULL OR (period->>'to')::timestamptz>clock_timestamp())
 AND period->'roles' @> '["OWNER_ADMIN"]'::jsonb)
 THEN RAISE EXCEPTION 'HF101_EMPLOYEE_REGISTRATION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('employeeId',e.employee_id,'fullName',e.full_name,'email',l.email,
 'version',COALESCE(l.version,0),'bound',COALESCE(l.google_subject IS NOT NULL,false))
 INTO result FROM hft.employee e JOIN hft_app_roles.identity_binding b USING(legal_entity_id,employee_id)
 LEFT JOIN hft_employee_login.employee_login_registration l USING(legal_entity_id,employee_id)
 WHERE e.legal_entity_id=p_entity AND e.employee_id=p_employee AND e.site_id=actor->>'siteId' AND e.active AND b.active
 AND (l.employee_id IS NULL OR (l.subject=b.subject AND l.person_id=b.person_id));
 IF result IS NULL THEN RAISE EXCEPTION 'HF101_CANONICAL_BINDING_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN result;
END $f$;
-- Restricted role service can assert a current identity inside its own fenced
-- transaction without receiving registration table access or provider secrets.
CREATE FUNCTION hft_employee_login.employee_session_assert_v1(p_entity text,p_employee text,p_subject text,p_person text,p_version bigint,p_employee_version bigint,p_site text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE c jsonb;
BEGIN
 c:=hft_employee_login.employee_login_context_v1(p_entity,p_employee,p_subject,p_person,p_version,p_employee_version);
 IF c->>'siteId' IS DISTINCT FROM p_site THEN RAISE EXCEPTION 'HF101_EMPLOYEE_SESSION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN true;
END $f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_employee_login FROM PUBLIC;
-- No runtime grant, existing data mutation, owner bootstrap, or schema admission.
COMMIT;
