-- HF098 requirements-only lifecycle and reader. Forward candidate only.
-- Preserve PR26 draft tables/functions and accepted canonical migrations.
BEGIN;
DO $STOP_HF098$ BEGIN
 RAISE EXCEPTION 'HF098_PLANNING_LIFECYCLE_NOT_ADMITTED';
END $STOP_HF098$;

-- Explicit governed planning actions. No business role, signed session,
-- corporate email or stock.read permission automatically creates a grant.
-- Owner-controlled enrollment is separate; no runtime grants or seeds here.
CREATE TABLE hft.planning_action_event(
 event_no bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,
 actor_subject text NOT NULL,actor_employee_id text NOT NULL,actor_person_id text NOT NULL,
 action text NOT NULL CHECK(action IN('MIS_REQUIREMENTS_READ','DRONE_CREATE','BOM_CREATE','BOM_REVISE','BOM_APPROVE','BOM_RETIRE')),
 enabled boolean NOT NULL,valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 authority_sha256 text NOT NULL CHECK(authority_sha256~'^[0-9a-f]{64}$' AND authority_sha256<>repeat('0',64)),
 recorded_by text NOT NULL DEFAULT session_user,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(valid_until>valid_from),
 FOREIGN KEY(legal_entity_id,actor_employee_id) REFERENCES hft.employee(legal_entity_id,employee_id),
 FOREIGN KEY(legal_entity_id,site_id) REFERENCES hft.site(legal_entity_id,id),
 FOREIGN KEY(legal_entity_id,warehouse_id) REFERENCES hft.warehouse(legal_entity_id,warehouse_id)
);
CREATE INDEX planning_action_latest_v1 ON hft.planning_action_event
 (legal_entity_id,site_id,warehouse_id,actor_subject,actor_employee_id,actor_person_id,action,event_no DESC);
CREATE FUNCTION hft.planning_action_fence_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,pg_temp AS $fence$
BEGIN
 PERFORM pg_advisory_xact_lock(1212568624,77);
 RETURN NEW;
END $fence$;
CREATE TRIGGER planning_action_fence BEFORE INSERT ON hft.planning_action_event
 FOR EACH ROW EXECUTE FUNCTION hft.planning_action_fence_v1();
ALTER TABLE hft.planning_action_event ENABLE ALWAYS TRIGGER planning_action_fence;

CREATE FUNCTION hft.planning_action_allowed_v1(e text,s text,w text,sub text,emp text,person text,act text)
 RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $allowed$
 SELECT EXISTS(
 SELECT 1 FROM hft_app_roles.identity_binding b JOIN hft.employee p
 ON p.legal_entity_id=b.legal_entity_id AND p.employee_id=b.employee_id
 JOIN hft.legal_entity z ON z.id=p.legal_entity_id
 JOIN hft.site t ON t.legal_entity_id=p.legal_entity_id AND t.id=p.site_id
 JOIN hft.warehouse q ON q.legal_entity_id=t.legal_entity_id AND q.site_id=t.id
 JOIN hft_app_roles.scope_lock l ON l.legal_entity_id=q.legal_entity_id AND l.site_id=q.site_id AND l.warehouse_id=q.warehouse_id
 WHERE b.legal_entity_id=e AND b.subject=sub AND b.employee_id=emp AND b.person_id=person
 AND p.site_id=s AND q.warehouse_id=w AND b.active AND p.active AND z.active AND t.active AND q.active)
 AND COALESCE((SELECT a.enabled AND a.valid_from<=clock_timestamp() AND a.valid_until>clock_timestamp()
 FROM hft.planning_action_event a
 WHERE (a.legal_entity_id,a.site_id,a.warehouse_id,a.actor_subject,a.actor_employee_id,a.actor_person_id,a.action)=(e,s,w,sub,emp,person,act)
 ORDER BY a.event_no DESC LIMIT 1),false)
$allowed$;

CREATE TABLE hft.planning_bom_decision(
 request_id uuid PRIMARY KEY,
 legal_entity_id text NOT NULL,site_id text NOT NULL,warehouse_id text NOT NULL,revision_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('BOM_APPROVE','BOM_RETIRE')),
 effective_from timestamptz NOT NULL,effective_to timestamptz,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$' AND evidence_sha256<>repeat('0',64)),
 actor_subject text NOT NULL,actor_employee_id text NOT NULL,actor_person_id text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 8 AND 300),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(effective_to IS NULL OR effective_to>effective_from),
 CHECK(action<>'BOM_RETIRE' OR effective_to IS NULL),
 FOREIGN KEY(legal_entity_id,site_id,warehouse_id,revision_id) REFERENCES hft.planning_bom_revision(legal_entity_id,site_id,warehouse_id,revision_id),
 FOREIGN KEY(legal_entity_id,actor_employee_id) REFERENCES hft.employee(legal_entity_id,employee_id)
);
CREATE UNIQUE INDEX planning_one_approval_v1 ON hft.planning_bom_decision(legal_entity_id,site_id,warehouse_id,revision_id) WHERE action='BOM_APPROVE';
CREATE UNIQUE INDEX planning_one_retirement_v1 ON hft.planning_bom_decision(legal_entity_id,site_id,warehouse_id,revision_id) WHERE action='BOM_RETIRE';
DO $immutable$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['planning_action_event','planning_bom_decision'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON hft.%I FOR EACH ROW EXECUTE FUNCTION hft.deny_fact_mutation()','immutable_'||tab,tab);
 EXECUTE format('ALTER TABLE hft.%I ENABLE ALWAYS TRIGGER %I',tab,'immutable_'||tab);
 EXECUTE format('REVOKE ALL ON hft.%I FROM PUBLIC',tab);
 END LOOP;
END $immutable$;
CREATE VIEW hft.planning_effective_interval_v1 WITH (security_invoker=true) AS
 SELECT a.legal_entity_id,a.site_id,a.warehouse_id,a.revision_id,a.effective_from,
 least(a.effective_to,r.effective_from) AS effective_to,a.evidence_sha256,a.request_id
 FROM hft.planning_bom_decision a LEFT JOIN hft.planning_bom_decision r
 ON (a.legal_entity_id,a.site_id,a.warehouse_id,a.revision_id)=(r.legal_entity_id,r.site_id,r.warehouse_id,r.revision_id) AND r.action='BOM_RETIRE'
 WHERE a.action='BOM_APPROVE';
REVOKE ALL ON hft.planning_effective_interval_v1 FROM PUBLIC;

-- First persistent command boundary; same immutable PR26 writer and lock.
-- These writer functions remain owner-only candidates, no runtime EXECUTE.
CREATE FUNCTION hft.planning_draft_authorized_v1(e text,s text,w text,sub text,emp text,person text,req uuid,act text,reason text,payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $draft$
BEGIN
 PERFORM pg_advisory_xact_lock(1212568624,77);
 IF act NOT IN('DRONE_CREATE','BOM_CREATE','BOM_REVISE') OR NOT hft.planning_action_allowed_v1(e,s,w,sub,emp,person,act)
 THEN RAISE EXCEPTION 'PLANNING_ACTION_DENIED'; END IF;
 RETURN hft.planning_draft_write_v1(e,s,w,sub,emp,person,req,act,reason,payload);
END $draft$;
CREATE FUNCTION hft.planning_draft_readback_v1(e text,s text,w text,sub text,emp text,person text,req uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $readback$
DECLARE r hft.planning_draft_request%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1212568624,77);
 SELECT * INTO r FROM hft.planning_draft_request q WHERE q.request_id=req AND
 (q.legal_entity_id,q.site_id,q.warehouse_id,q.actor_subject,q.actor_employee_id,q.actor_person_id)=(e,s,w,sub,emp,person);
 IF NOT FOUND OR NOT hft.planning_action_allowed_v1(e,s,w,sub,emp,person,r.action)
 OR r.payload_sha256<>encode(sha256(convert_to(r.payload::text,'UTF8')),'hex')
 THEN RAISE EXCEPTION 'PLANNING_READBACK_DENIED'; END IF;
 IF r.action='DRONE_CREATE' THEN
  IF NOT EXISTS(SELECT 1 FROM hft.planning_drone_model m WHERE (m.legal_entity_id,m.site_id,m.warehouse_id,m.model_id)=(e,s,w,(r.result->>'modelId')::uuid))
   THEN RAISE EXCEPTION 'PLANNING_READBACK_MISSING'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM hft.planning_bom_revision b WHERE (b.legal_entity_id,b.site_id,b.warehouse_id,b.revision_id)=(e,s,w,(r.result->>'revisionId')::uuid))
   THEN RAISE EXCEPTION 'PLANNING_READBACK_MISSING'; END IF;
 END IF;
 RETURN jsonb_build_object('state','DRAFT_READ_VERIFIED','requestId',req,'result',r.result,'payloadSha256',r.payload_sha256);
END $readback$;

-- Approval/retirement are append-only decisions, not edits to the frozen draft.
CREATE FUNCTION hft.planning_bom_decide_v1(e text,s text,w text,sub text,emp text,person text,
 req uuid,act text,rev uuid,starts timestamptz,ends timestamptz,evidence text,why text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $decision$
DECLARE old hft.planning_bom_decision%ROWTYPE; draft hft.planning_bom_revision%ROWTYPE; approved record;
BEGIN
 PERFORM pg_advisory_xact_lock(1212568624,77);
 IF act NOT IN('BOM_APPROVE','BOM_RETIRE') OR NOT hft.planning_action_allowed_v1(e,s,w,sub,emp,person,act)
 THEN RAISE EXCEPTION 'PLANNING_ACTION_DENIED'; END IF;
 IF req IS NULL OR rev IS NULL OR starts IS NULL OR NOT isfinite(starts) OR (ends IS NOT NULL AND (NOT isfinite(ends) OR ends<=starts))
 OR evidence IS NULL OR evidence!~'^[0-9a-f]{64}$' OR evidence=repeat('0',64) OR why IS NULL OR length(btrim(why)) NOT BETWEEN 8 AND 300
 THEN RAISE EXCEPTION 'PLANNING_DECISION_FIELDS'; END IF;
 SELECT * INTO old FROM hft.planning_bom_decision d WHERE d.request_id=req;
 IF FOUND THEN
  IF (old.legal_entity_id,old.site_id,old.warehouse_id,old.revision_id,old.action,old.effective_from,old.effective_to,old.evidence_sha256,old.actor_subject,old.actor_employee_id,old.actor_person_id,old.reason)
  IS DISTINCT FROM (e,s,w,rev,act,starts,ends,evidence,sub,emp,person,why)
  THEN RAISE EXCEPTION 'PLANNING_DECISION_REQUEST_REUSED'; END IF;
  RETURN jsonb_build_object('state','DECISION_RECORDED','requestId',req,'revisionId',rev,'action',act);
 END IF;
 SELECT * INTO draft FROM hft.planning_bom_revision b WHERE (b.legal_entity_id,b.site_id,b.warehouse_id,b.revision_id)=(e,s,w,rev);
 IF NOT FOUND THEN RAISE EXCEPTION 'PLANNING_DECISION_REVISION_DENIED'; END IF;
 IF act='BOM_APPROVE' THEN
  IF EXISTS(SELECT 1 FROM hft.planning_bom_revision b WHERE (b.legal_entity_id,b.site_id,b.warehouse_id,b.bom_id)=(e,s,w,draft.bom_id) AND b.revision_no>draft.revision_no)
   THEN RAISE EXCEPTION 'PLANNING_APPROVAL_STALE_REVISION'; END IF;
  IF EXISTS(SELECT 1 FROM hft.planning_effective_interval_v1 p JOIN hft.planning_bom_revision b USING(legal_entity_id,site_id,warehouse_id,revision_id)
   WHERE (b.legal_entity_id,b.site_id,b.warehouse_id,b.bom_id)=(e,s,w,draft.bom_id)
   AND tstzrange(p.effective_from,p.effective_to,'[)') && tstzrange(starts,ends,'[)'))
   THEN RAISE EXCEPTION 'PLANNING_APPROVAL_INTERVAL_OVERLAP'; END IF;
  IF NOT EXISTS(SELECT 1 FROM hft.planning_bom_line l WHERE (l.legal_entity_id,l.site_id,l.warehouse_id,l.revision_id)=(e,s,w,rev))
   OR NOT EXISTS(SELECT 1 FROM hft.planning_bom_applicability a WHERE (a.legal_entity_id,a.site_id,a.warehouse_id,a.revision_id)=(e,s,w,rev))
   OR EXISTS(SELECT 1 FROM hft.planning_bom_line l LEFT JOIN hft.item i USING(legal_entity_id,item_code)
    LEFT JOIN hft.item_version_catalog v ON (v.legal_entity_id,v.item_code,v.version_code)=(l.legal_entity_id,l.item_code,l.version_code)
    WHERE (l.legal_entity_id,l.site_id,l.warehouse_id,l.revision_id)=(e,s,w,rev)
    AND (i.active IS DISTINCT FROM true OR v.state IS DISTINCT FROM 'ACTIVE' OR i.uom IS DISTINCT FROM l.uom))
   THEN RAISE EXCEPTION 'PLANNING_APPROVAL_CANONICAL_LINES_DENIED'; END IF;
  IF EXISTS(SELECT 1 FROM hft.planning_bom_line l WHERE (l.legal_entity_id,l.site_id,l.warehouse_id,l.revision_id)=(e,s,w,rev)
    AND l.child_revision_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM hft.planning_effective_interval_v1 p JOIN hft.planning_bom_revision b USING(legal_entity_id,site_id,warehouse_id,revision_id)
      JOIN hft.planning_bom_subject x USING(legal_entity_id,site_id,warehouse_id,bom_id)
      WHERE (p.legal_entity_id,p.site_id,p.warehouse_id,p.revision_id)=(e,s,w,l.child_revision_id)
      AND x.subject_kind='SFG' AND x.item_code=l.item_code AND x.version_code=l.version_code
      AND tstzrange(p.effective_from,p.effective_to,'[)') @> tstzrange(starts,ends,'[)')))
   THEN RAISE EXCEPTION 'PLANNING_APPROVAL_CHILD_NOT_EFFECTIVE'; END IF;
 ELSE
  SELECT * INTO approved FROM hft.planning_effective_interval_v1 p WHERE (p.legal_entity_id,p.site_id,p.warehouse_id,p.revision_id)=(e,s,w,rev);
  IF NOT FOUND OR ends IS NOT NULL OR starts<=approved.effective_from OR (approved.effective_to IS NOT NULL AND starts>approved.effective_to)
   THEN RAISE EXCEPTION 'PLANNING_RETIREMENT_INTERVAL_DENIED'; END IF;
 END IF;
 INSERT INTO hft.planning_bom_decision(request_id,legal_entity_id,site_id,warehouse_id,revision_id,action,effective_from,effective_to,evidence_sha256,actor_subject,actor_employee_id,actor_person_id,reason)
 VALUES(req,e,s,w,rev,act,starts,ends,evidence,sub,emp,person,why);
 RETURN jsonb_build_object('state','DECISION_RECORDED','requestId',req,'revisionId',rev,'action',act);
END $decision$;

-- Read-only requirement projection. Installation must transfer this function to
-- a restricted NOLOGIN reader owner, give it exact read-only underlying rights,
-- and admit only the dedicated runtime EXECUTE. No grant in this source.
CREATE FUNCTION hft.planning_requirements_read_v1(e text,s text,w text,sub text,emp text,person text,model uuid)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $requirements$
DECLARE at timestamptz; model_rows jsonb; root uuid; nodes jsonb; scope_name jsonb; node_count integer; line_count bigint;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1212568624,77);
 IF NOT hft.planning_action_allowed_v1(e,s,w,sub,emp,person,'MIS_REQUIREMENTS_READ')
 THEN RAISE EXCEPTION 'MIS_REQUIREMENTS_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 at=clock_timestamp();
 SELECT jsonb_build_object('companyName',z.name,'siteName',t.name,'warehouseName',q.name) INTO STRICT scope_name
 FROM hft.legal_entity z JOIN hft.site t ON t.legal_entity_id=z.id
 JOIN hft.warehouse q ON q.legal_entity_id=t.legal_entity_id AND q.site_id=t.id
 WHERE z.id=e AND t.id=s AND q.warehouse_id=w;
 SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.model_id),'[]'::jsonb) INTO model_rows FROM(
 SELECT m.model_id,jsonb_build_object('id',m.model_id,'name',m.model_name,'variant',m.variant_name,'revisionId',r.revision_id,
  'revision',r.revision_no,'evidenceSha256',p.evidence_sha256,'effectiveFrom',p.effective_from,'effectiveTo',p.effective_to) obj
 FROM hft.planning_drone_model m JOIN hft.planning_bom_subject b
 ON (b.legal_entity_id,b.site_id,b.warehouse_id,b.drone_model_id)=(m.legal_entity_id,m.site_id,m.warehouse_id,m.model_id)
 JOIN hft.planning_bom_revision r ON (r.legal_entity_id,r.site_id,r.warehouse_id,r.bom_id)=(b.legal_entity_id,b.site_id,b.warehouse_id,b.bom_id)
 JOIN hft.planning_effective_interval_v1 p ON (p.legal_entity_id,p.site_id,p.warehouse_id,p.revision_id)=(r.legal_entity_id,r.site_id,r.warehouse_id,r.revision_id)
 WHERE (m.legal_entity_id,m.site_id,m.warehouse_id)=(e,s,w) AND b.subject_kind='DRONE'
 AND tstzrange(p.effective_from,p.effective_to,'[)') @> at
 ORDER BY m.model_id LIMIT 101) x;
 IF jsonb_array_length(model_rows)>100 OR jsonb_array_length(model_rows)<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(model_rows) x)
 THEN RAISE EXCEPTION 'MIS_APPROVED_MODEL_CATALOG_NOT_COMPLETE'; END IF;
 IF model IS NOT NULL THEN
  SELECT (x->>'revisionId')::uuid INTO root FROM jsonb_array_elements(model_rows) x WHERE (x->>'id')::uuid=model;
  IF NOT FOUND THEN RAISE EXCEPTION 'MIS_MODEL_NOT_EFFECTIVE'; END IF;
  WITH RECURSIVE reachable(id) AS (
    SELECT root UNION SELECT l.child_revision_id FROM reachable q JOIN hft.planning_bom_line l
      ON (l.legal_entity_id,l.site_id,l.warehouse_id,l.revision_id)=(e,s,w,q.id) WHERE l.child_revision_id IS NOT NULL
  ), checked AS (
    SELECT q.id,p.evidence_sha256,b.subject_kind,b.item_code,b.version_code,b.bom_id,
    (p.revision_id IS NOT NULL AND tstzrange(p.effective_from,p.effective_to,'[)') @> at
    AND EXISTS(SELECT 1 FROM hft.planning_bom_applicability a WHERE (a.legal_entity_id,a.site_id,a.warehouse_id,a.revision_id,a.model_id)=(e,s,w,q.id,model))) ok
    FROM reachable q LEFT JOIN hft.planning_bom_revision r ON (r.legal_entity_id,r.site_id,r.warehouse_id,r.revision_id)=(e,s,w,q.id)
    LEFT JOIN hft.planning_bom_subject b ON (b.legal_entity_id,b.site_id,b.warehouse_id,b.bom_id)=(e,s,w,r.bom_id)
    LEFT JOIN hft.planning_effective_interval_v1 p ON (p.legal_entity_id,p.site_id,p.warehouse_id,p.revision_id)=(e,s,w,q.id)
  ), line_rows AS (
    SELECT l.*, (i.active IS TRUE AND v.state='ACTIVE' AND i.uom=l.uom
      AND (l.child_revision_id IS NULL OR EXISTS(SELECT 1 FROM checked c WHERE c.id=l.child_revision_id AND c.subject_kind='SFG' AND c.item_code=l.item_code AND c.version_code=l.version_code))) AS ok
    FROM reachable q JOIN hft.planning_bom_line l ON (l.legal_entity_id,l.site_id,l.warehouse_id,l.revision_id)=(e,s,w,q.id)
    LEFT JOIN hft.item i USING(legal_entity_id,item_code)
    LEFT JOIN hft.item_version_catalog v ON (v.legal_entity_id,v.item_code,v.version_code)=(l.legal_entity_id,l.item_code,l.version_code)
  )
  SELECT count(*)::int,(SELECT count(*) FROM line_rows),
  COALESCE(jsonb_agg(jsonb_build_object('revisionId',c.id,'bomId',c.bom_id,'kind',c.subject_kind,'itemCode',c.item_code,'versionCode',c.version_code,
    'evidenceSha256',c.evidence_sha256,'verified',c.ok,
    'lines',(SELECT COALESCE(jsonb_agg(jsonb_build_object('itemCode',l.item_code,'productVersion',l.version_code,'uom',l.uom,
      'quantityMicro',l.quantity_micro::text,'childRevisionId',l.child_revision_id,'verified',l.ok) ORDER BY l.item_code,l.version_code,l.uom),'[]'::jsonb) FROM line_rows l WHERE l.revision_id=c.id)) ORDER BY c.id),'[]'::jsonb)
  INTO node_count,line_count,nodes FROM checked c;
  IF node_count NOT BETWEEN 1 AND 2000 OR line_count NOT BETWEEN 1 AND 10000
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(nodes) n WHERE n->'verified' IS DISTINCT FROM 'true'::jsonb OR jsonb_array_length(n->'lines')=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(n->'lines') l WHERE l->'verified' IS DISTINCT FROM 'true'::jsonb))
   THEN RAISE EXCEPTION 'MIS_REQUIREMENTS_GRAPH_NOT_VERIFIED'; END IF;
 END IF;
 -- Authorization checked again after reads; callers independently check signed expiry.
 IF NOT hft.planning_action_allowed_v1(e,s,w,sub,emp,person,'MIS_REQUIREMENTS_READ')
 THEN RAISE EXCEPTION 'MIS_REQUIREMENTS_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('state',CASE WHEN model IS NULL THEN 'CATALOG' ELSE 'REQUIREMENTS_SOURCE' END,
   'scope',jsonb_build_object('legalEntityId',e,'siteId',s,'warehouseId',w),'scopeName',scope_name,
   'asOf',to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'models',model_rows,
   'rootRevisionId',root,'nodes',nodes,'stockAdmitted',false,'sourceEpoch',encode(sha256(convert_to(jsonb_build_object('models',model_rows,'root',root,'nodes',nodes)::text,'UTF8')),'hex'));
END $requirements$;
REVOKE ALL ON FUNCTION hft.planning_action_fence_v1(),hft.planning_action_allowed_v1(text,text,text,text,text,text,text),
 hft.planning_draft_authorized_v1(text,text,text,text,text,text,uuid,text,text,jsonb),
 hft.planning_draft_readback_v1(text,text,text,text,text,text,uuid),
 hft.planning_bom_decide_v1(text,text,text,text,text,text,uuid,text,uuid,timestamptz,timestamptz,text,text),
 hft.planning_requirements_read_v1(text,text,text,text,text,text,uuid) FROM PUBLIC;
-- No login, role/permission seed, stock read/write, canonical migration change.
COMMIT;
