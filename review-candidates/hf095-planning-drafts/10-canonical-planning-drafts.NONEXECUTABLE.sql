-- HF095 / Issue 19: canonical planning DRAFT persistence candidate.
-- This is not a canonical migration or runtime grant. Do not execute on retained
-- or production targets. Future admitted gateway must enforce explicit current
-- MasterAction permissions; canonical identity alone does NOT grant them.
BEGIN;
DO $STOP_HF095_PLANNING$ BEGIN
 RAISE EXCEPTION 'HF095_PLANNING_INSTALLATION_NOT_ADMITTED';
END $STOP_HF095_PLANNING$;

CREATE TABLE hft.planning_drone_model(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 model_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
 model_name text NOT NULL CHECK(length(btrim(model_name)) BETWEEN 1 AND 160),
 variant_name text NOT NULL CHECK(length(btrim(variant_name)) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,model_id),
 FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
 FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id)
);
-- Internal stable UUID is NOT an issued corporate drone code. No format guessed.
CREATE UNIQUE INDEX planning_drone_identity_unique ON hft.planning_drone_model
 (legal_entity_id,site_id,warehouse_id,lower(btrim(model_name)),lower(btrim(variant_name)));

CREATE TABLE hft.planning_bom_subject(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 bom_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
 subject_kind text NOT NULL CHECK(subject_kind IN('DRONE','SFG')),
 drone_model_id uuid,item_code text,version_code text,
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,bom_id),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,drone_model_id)
 REFERENCES hft.planning_drone_model(legal_entity_id,site_id,warehouse_id,model_id),
 FOREIGN KEY(legal_entity_id,item_code,version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code),
 CHECK((subject_kind='DRONE' AND drone_model_id IS NOT NULL AND item_code IS NULL AND version_code IS NULL)
 OR (subject_kind='SFG' AND drone_model_id IS NULL AND item_code IS NOT NULL AND version_code IS NOT NULL))
);
CREATE UNIQUE INDEX planning_drone_bom_unique ON hft.planning_bom_subject
 (legal_entity_id,site_id,warehouse_id,drone_model_id) WHERE subject_kind='DRONE';
CREATE UNIQUE INDEX planning_sfg_bom_unique ON hft.planning_bom_subject
 (legal_entity_id,site_id,warehouse_id,item_code,version_code) WHERE subject_kind='SFG';

CREATE TABLE hft.planning_bom_revision(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,bom_id uuid NOT NULL,
 revision_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
 revision_no integer NOT NULL CHECK(revision_no>0),
 prior_revision_id uuid, state text NOT NULL DEFAULT 'DRAFT' CHECK(state='DRAFT'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,bom_id,revision_id),
 UNIQUE(legal_entity_id,site_id,warehouse_id,revision_id),
 UNIQUE(legal_entity_id,site_id,warehouse_id,bom_id,revision_no),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,bom_id)
 REFERENCES hft.planning_bom_subject,
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,bom_id,prior_revision_id)
 REFERENCES hft.planning_bom_revision,
 CHECK((revision_no=1)=(prior_revision_id IS NULL))
);
CREATE TABLE hft.planning_bom_applicability(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,revision_id uuid NOT NULL,
 model_id uuid NOT NULL,
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,revision_id,model_id),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,revision_id)
 REFERENCES hft.planning_bom_revision(legal_entity_id,site_id,warehouse_id,revision_id),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,model_id)
 REFERENCES hft.planning_drone_model(legal_entity_id,site_id,warehouse_id,model_id)
);
CREATE TABLE hft.planning_bom_line(
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,revision_id uuid NOT NULL,
 item_code text NOT NULL,version_code text NOT NULL,uom text NOT NULL,
 quantity_micro bigint NOT NULL CHECK(quantity_micro>0),child_revision_id uuid,
 PRIMARY KEY(legal_entity_id,site_id,warehouse_id,revision_id,item_code,version_code,uom),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,revision_id)
 REFERENCES hft.planning_bom_revision(legal_entity_id,site_id,warehouse_id,revision_id),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,child_revision_id)
 REFERENCES hft.planning_bom_revision(legal_entity_id,site_id,warehouse_id,revision_id),
 FOREIGN KEY(legal_entity_id,item_code,version_code)
 REFERENCES hft.item_version_catalog(legal_entity_id,item_code,version_code)
);
CREATE TABLE hft.planning_draft_request(
 request_id uuid PRIMARY KEY,legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 actor_subject text NOT NULL,actor_employee_id text NOT NULL,actor_person_id text NOT NULL,
 action text NOT NULL CHECK(action IN('DRONE_CREATE','BOM_CREATE','BOM_REVISE')),
 payload jsonb NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 8 AND 300),
 result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(legal_entity_id,actor_employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
DO $immutable$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['planning_drone_model','planning_bom_subject','planning_bom_revision','planning_bom_applicability','planning_bom_line','planning_draft_request'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON hft.%I FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation()', 'immutable_'||t,t);
 EXECUTE format('ALTER TABLE hft.%I ENABLE ALWAYS TRIGGER %I',t,'immutable_'||t);
 EXECUTE format('REVOKE ALL ON hft.%I FROM PUBLIC',t);
 END LOOP;
END $immutable$;

-- Owner-only source gateway. Explicit application action admission is NOT
-- inferred from this canonical identity check. No EXECUTE to any runtime.
CREATE FUNCTION hft.planning_draft_write_v1(
 p_entity text,p_site text,p_warehouse text,p_subject text,p_employee text,p_person text,
 p_request uuid,p_action text,p_reason text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $write$
DECLARE old hft.planning_draft_request%ROWTYPE; digest text; result jsonb;
 drone uuid; bid uuid; rid uuid; prior uuid; n integer; kind text; code text; ver text;
 model_ids uuid[]; m uuid; line jsonb; child uuid; q numeric; target hft.planning_bom_subject%ROWTYPE;
BEGIN
 IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_action NOT IN('DRONE_CREATE','BOM_CREATE','BOM_REVISE')
 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 300 OR p_subject IS NULL OR p_employee IS NULL OR p_person IS NULL
 THEN RAISE EXCEPTION 'PLANNING_DRAFT_INVALID'; END IF;
 -- Preserve existing role revocation fence; actor linkage/scopes checked in
 -- the same transaction. No browser-provided authority or stock capability.
 PERFORM pg_advisory_xact_lock(1212568624,77);
 IF NOT EXISTS(SELECT 1 FROM hft_app_roles.identity_binding b JOIN hft.employee e
 ON e.legal_entity_id=b.legal_entity_id AND e.employee_id=b.employee_id
 JOIN hft.warehouse w ON w.legal_entity_id=e.legal_entity_id
 JOIN hft.site s ON s.legal_entity_id=w.legal_entity_id AND s.id=w.site_id
 JOIN hft.legal_entity z ON z.id=e.legal_entity_id
 JOIN hft_app_roles.scope_lock l ON l.legal_entity_id=w.legal_entity_id AND l.site_id=w.site_id AND l.warehouse_id=w.warehouse_id
 WHERE b.legal_entity_id=p_entity AND b.subject=p_subject AND b.employee_id=p_employee AND b.person_id=p_person AND b.active
 AND e.active AND e.site_id=p_site AND w.site_id=p_site AND w.warehouse_id=p_warehouse AND w.active AND s.active AND z.active)
 THEN RAISE EXCEPTION 'PLANNING_DRAFT_ACTOR_SCOPE_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('HFT:PLANNING:DRAFT:'||p_request::text,0));
 digest=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 SELECT * INTO old FROM hft.planning_draft_request WHERE request_id=p_request;
 IF FOUND THEN
  IF (old.legal_entity_id,old.site_id,old.warehouse_id,old.actor_subject,old.actor_employee_id,old.actor_person_id,old.action,old.reason,old.payload_sha256)
   IS DISTINCT FROM (p_entity,p_site,p_warehouse,p_subject,p_employee,p_person,p_action,p_reason,digest)
   OR old.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'PLANNING_REQUEST_ID_REUSED'; END IF;
  RETURN old.result;
 END IF;
 IF p_action='DRONE_CREATE' THEN
  IF NOT (p_payload ?& ARRAY['name','variant']) OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>2
   OR jsonb_typeof(p_payload->'name')<>'string' OR jsonb_typeof(p_payload->'variant')<>'string'
   THEN RAISE EXCEPTION 'PLANNING_DRONE_FIELDS'; END IF;
  INSERT INTO hft.planning_drone_model(legal_entity_id,site_id,warehouse_id,model_name,variant_name)
   VALUES(p_entity,p_site,p_warehouse,btrim(p_payload->>'name'),btrim(p_payload->>'variant')) RETURNING model_id INTO drone;
  result=jsonb_build_object('state','DRAFT','modelId',drone,'corporateCode',NULL);
 ELSE
  IF NOT (p_payload ?& ARRAY['subjectKind','droneModelId','itemCode','versionCode','priorRevisionId','modelIds','lines'])
   OR (SELECT count(*) FROM jsonb_object_keys(p_payload))<>7 OR jsonb_typeof(p_payload->'modelIds')<>'array' OR jsonb_typeof(p_payload->'lines')<>'array'
   OR jsonb_array_length(p_payload->'modelIds') NOT BETWEEN 1 AND 100 OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 2000
  THEN RAISE EXCEPTION 'PLANNING_BOM_FIELDS'; END IF;
  kind=p_payload->>'subjectKind'; drone=(p_payload->>'droneModelId')::uuid; code=p_payload->>'itemCode';ver=p_payload->>'versionCode';prior=(p_payload->>'priorRevisionId')::uuid;
  IF kind IS NULL OR kind NOT IN('DRONE','SFG') OR (p_action='BOM_CREATE' AND prior IS NOT NULL) OR (p_action='BOM_REVISE' AND prior IS NULL)
   OR (kind='DRONE' AND (drone IS NULL OR code IS NOT NULL OR ver IS NOT NULL))
   OR (kind='SFG' AND (drone IS NOT NULL OR code IS NULL OR ver IS NULL))
   THEN RAISE EXCEPTION 'PLANNING_BOM_SUBJECT_INVALID'; END IF;
  SELECT array_agg(v::uuid ORDER BY v) INTO model_ids FROM jsonb_array_elements_text(p_payload->'modelIds') v;
  IF array_position(model_ids,NULL) IS NOT NULL OR cardinality(model_ids)<>(SELECT count(DISTINCT v) FROM unnest(model_ids) v)
   OR (SELECT count(*) FROM hft.planning_drone_model d WHERE (d.legal_entity_id,d.site_id,d.warehouse_id)=(p_entity,p_site,p_warehouse) AND d.model_id=ANY(model_ids))<>cardinality(model_ids)
   OR (kind='DRONE' AND model_ids<>ARRAY[drone])
   OR (kind='SFG' AND p_action='BOM_CREATE' AND cardinality(model_ids)<>1)
   THEN RAISE EXCEPTION 'PLANNING_BOM_APPLICABILITY_DENIED'; END IF;
  IF kind='SFG' AND NOT EXISTS(SELECT 1 FROM hft.item i JOIN hft.item_version_catalog v USING(legal_entity_id,item_code)
   WHERE i.legal_entity_id=p_entity AND i.item_code=code AND i.active AND v.version_code=ver AND v.state='ACTIVE')
   THEN RAISE EXCEPTION 'PLANNING_SFG_CANONICAL_VERSION_DENIED'; END IF;
  IF p_action='BOM_CREATE' THEN
   INSERT INTO hft.planning_bom_subject(legal_entity_id,site_id,warehouse_id,subject_kind,drone_model_id,item_code,version_code)
    VALUES(p_entity,p_site,p_warehouse,kind,drone,code,ver) RETURNING bom_id INTO bid;
   n=1;
  ELSE
   SELECT b.* INTO target FROM hft.planning_bom_subject b JOIN hft.planning_bom_revision r USING(legal_entity_id,site_id,warehouse_id,bom_id)
    WHERE (r.legal_entity_id,r.site_id,r.warehouse_id,r.revision_id)=(p_entity,p_site,p_warehouse,prior);
   IF NOT FOUND OR (target.subject_kind,target.drone_model_id,target.item_code,target.version_code) IS DISTINCT FROM (kind,drone,code,ver)
    THEN RAISE EXCEPTION 'PLANNING_BOM_PRIOR_SCOPE_DENIED'; END IF;
   bid=target.bom_id;
   SELECT r.revision_no+1 INTO n FROM hft.planning_bom_revision r WHERE (r.legal_entity_id,r.site_id,r.warehouse_id,r.bom_id,r.revision_id)=(p_entity,p_site,p_warehouse,bid,prior)
    AND NOT EXISTS(SELECT 1 FROM hft.planning_bom_revision later WHERE (later.legal_entity_id,later.site_id,later.warehouse_id,later.bom_id)=(p_entity,p_site,p_warehouse,bid) AND later.revision_no>r.revision_no);
   IF NOT FOUND THEN RAISE EXCEPTION 'PLANNING_BOM_REVISION_CONFLICT'; END IF;
  END IF;
  INSERT INTO hft.planning_bom_revision(legal_entity_id,site_id,warehouse_id,bom_id,revision_no,prior_revision_id)
   VALUES(p_entity,p_site,p_warehouse,bid,n,prior) RETURNING revision_id INTO rid;
  FOREACH m IN ARRAY model_ids LOOP
   INSERT INTO hft.planning_bom_applicability VALUES(p_entity,p_site,p_warehouse,rid,m);
  END LOOP;
  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   IF jsonb_typeof(line)<>'object' OR NOT(line ?& ARRAY['itemCode','versionCode','uom','quantity','childRevisionId'])
    OR (SELECT count(*) FROM jsonb_object_keys(line))<>5 OR jsonb_typeof(line->'quantity')<>'string'
    OR (line->>'quantity')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
    THEN RAISE EXCEPTION 'PLANNING_BOM_LINE_INVALID'; END IF;
   q=(line->>'quantity')::numeric*1000000;child=(line->>'childRevisionId')::uuid;
   IF q<=0 OR q>9223372036854775807 OR NOT EXISTS(SELECT 1 FROM hft.item i JOIN hft.item_version_catalog v USING(legal_entity_id,item_code)
    WHERE i.legal_entity_id=p_entity AND i.item_code=line->>'itemCode' AND i.active AND i.uom=line->>'uom' AND v.version_code=line->>'versionCode' AND v.state='ACTIVE')
    THEN RAISE EXCEPTION 'PLANNING_BOM_CANONICAL_LINE_DENIED'; END IF;
   IF child IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM hft.planning_bom_revision r JOIN hft.planning_bom_subject b USING(legal_entity_id,site_id,warehouse_id,bom_id)
     WHERE (r.legal_entity_id,r.site_id,r.warehouse_id,r.revision_id)=(p_entity,p_site,p_warehouse,child) AND b.subject_kind='SFG' AND b.item_code=line->>'itemCode' AND b.version_code=line->>'versionCode')
     OR EXISTS(SELECT 1 FROM unnest(model_ids) x WHERE NOT EXISTS(SELECT 1 FROM hft.planning_bom_applicability a WHERE (a.legal_entity_id,a.site_id,a.warehouse_id,a.revision_id,a.model_id)=(p_entity,p_site,p_warehouse,child,x)))
     THEN RAISE EXCEPTION 'PLANNING_SFG_CHILD_SCOPE_DENIED'; END IF;
    IF EXISTS(WITH RECURSIVE edges(rev) AS (
     SELECT child UNION SELECT l.child_revision_id FROM edges e JOIN hft.planning_bom_line l ON (l.legal_entity_id,l.site_id,l.warehouse_id,l.revision_id)=(p_entity,p_site,p_warehouse,e.rev) WHERE l.child_revision_id IS NOT NULL
    ) SELECT 1 FROM edges e JOIN hft.planning_bom_revision r ON (r.legal_entity_id,r.site_id,r.warehouse_id,r.revision_id)=(p_entity,p_site,p_warehouse,e.rev) WHERE r.bom_id=bid)
     THEN RAISE EXCEPTION 'PLANNING_BOM_CYCLE'; END IF;
   ELSIF EXISTS(SELECT 1 FROM hft.planning_bom_subject b WHERE (b.legal_entity_id,b.site_id,b.warehouse_id)=(p_entity,p_site,p_warehouse) AND b.subject_kind='SFG' AND b.item_code=line->>'itemCode' AND b.version_code=line->>'versionCode')
    THEN RAISE EXCEPTION 'PLANNING_SFG_REVISION_REQUIRED';
   END IF;
   INSERT INTO hft.planning_bom_line VALUES(p_entity,p_site,p_warehouse,rid,line->>'itemCode',line->>'versionCode',line->>'uom',q::bigint,child);
  END LOOP;
  result=jsonb_build_object('state','DRAFT','bomId',bid,'revisionId',rid,'revision',n,'priorRevisionId',prior);
 END IF;
 INSERT INTO hft.planning_draft_request(request_id,legal_entity_id,site_id,warehouse_id,actor_subject,actor_employee_id,actor_person_id,action,payload,payload_sha256,reason,result)
 VALUES(p_request,p_entity,p_site,p_warehouse,p_subject,p_employee,p_person,p_action,p_payload,digest,p_reason,result);
 RETURN result;
END $write$;
REVOKE ALL ON FUNCTION hft.planning_draft_write_v1(text,text,text,text,text,text,uuid,text,text,jsonb) FROM PUBLIC;
-- No LOGIN, GRANT, stock table write, effective/approved BOM or business code.
COMMIT;
