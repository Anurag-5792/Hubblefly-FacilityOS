-- HFT LIVE R1 / 0002 — restricted function gateway, APPEND ONLY audit, no table DML for API.
-- Compatible with 0001. Apply as hft_r1_live_owner only after isolated target admission.
BEGIN;
DO $only_live$ BEGIN
 IF current_database() !~ '^hft_r1_live_[a-z0-9_]{6,40}$'
  OR current_user<>'hft_r1_live_owner'
  OR to_regclass('hft_live_r1.master_record') IS NULL
 THEN RAISE EXCEPTION 'LIVE_R1_WRONG_TARGET_OR_SEQUENCE'; END IF;
END $only_live$;
CREATE FUNCTION hft_live_r1.authorized_person(
 p_subject text,p_entity text,p_site text,p_warehouse text,p_permission text
) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $auth$
DECLARE person text;
BEGIN
 IF session_user<>'hft_r1_live_api_login' OR current_user<>'hft_r1_live_owner'
 THEN RAISE EXCEPTION 'LIVE_R1_LOGIN_NOT_AUTHORIZED'; END IF;
 SELECT a.person_id INTO STRICT person
 FROM hft_live_r1.actor_scope a WHERE
 a.subject=p_subject AND a.legal_entity_id=p_entity
 AND a.site_id=p_site AND a.warehouse_id=p_warehouse AND a.active=true
 AND a.valid_from<=clock_timestamp()
 AND (a.valid_until IS NULL OR a.valid_until>clock_timestamp())
 AND p_permission=ANY(a.permission_codes);
 RETURN person;
EXCEPTION WHEN no_data_found THEN
 RAISE EXCEPTION 'LIVE_R1_PERMISSION_OR_SCOPE_DENIED';
END $auth$;
CREATE FUNCTION hft_live_r1.save_v1(p_actor text,p_session text,p_body jsonb)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $save$
DECLARE
 k text; act text; ent text; st text; wh text; rec text; rev bigint;
 rid uuid; reason text; val jsonb; allowed text[]; supplied text[];
 actor_person text; previous hft_live_r1.master_record%ROWTYPE;
 updated hft_live_r1.master_record%ROWTYPE; prior jsonb;
 evidence jsonb; digest text;
BEGIN
 IF jsonb_typeof(p_body)<>'object' OR p_actor IS NULL OR p_session IS NULL
  OR length(p_session)<8 THEN RAISE EXCEPTION 'LIVE_R1_SAVE_INVALID'; END IF;
 k:=p_body->>'kind';act:=p_body->>'action';
 ent:=p_body->'scope'->>'legalEntityId';st:=p_body->'scope'->>'siteId';
 wh:=p_body->'scope'->>'warehouseId';rec:=p_body->>'recordId';
 reason:=p_body->>'reason';rid:=(p_body->>'requestId')::uuid;
 rev:=(p_body->>'expectedRevision')::bigint;val:=p_body->'values';
 IF k NOT IN('EMPLOYEE','ITEM','SUPPLIER','WAREHOUSE','LOCATION','SITE')
 OR act NOT IN('CREATE','UPDATE','DELETE')
 OR COALESCE(ent,'')!~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
 OR COALESCE(st,'')!~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
 OR COALESCE(wh,'')!~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
 OR COALESCE(rec,'')!~'^[A-Z0-9][A-Z0-9._-]{1,63}$'
 OR COALESCE(length(reason),0)<8 OR length(reason)>300
 OR rev<0 OR (act='CREATE')<>(rev=0)
 OR jsonb_typeof(val)<>'object' THEN
 RAISE EXCEPTION 'LIVE_R1_SAVE_CONTRACT_DENIED';END IF;
 IF (k='SITE' AND rec<>st) OR (k='WAREHOUSE' AND rec<>wh) THEN
  RAISE EXCEPTION 'LIVE_R1_SCOPE_ANCHOR_DENIED'; END IF;
 allowed:=CASE k
  WHEN 'EMPLOYEE' THEN ARRAY['department','designation','fullName']
  WHEN 'ITEM' THEN ARRAY['controlType','uom']
  WHEN 'SUPPLIER' THEN ARRAY['legalName']
  WHEN 'WAREHOUSE' THEN ARRAY['name']
  WHEN 'LOCATION' THEN ARRAY['parentLocationId']
  WHEN 'SITE' THEN ARRAY['siteName'] END;
 SELECT array_agg(v.key ORDER BY v.key) INTO supplied
 FROM jsonb_object_keys(val) v(key);
 IF act='DELETE' THEN
  IF supplied IS NOT NULL THEN RAISE EXCEPTION 'LIVE_R1_DELETE_VALUES_DENIED'; END IF;
 ELSIF supplied IS DISTINCT FROM allowed OR EXISTS(
  SELECT 1 FROM jsonb_each(val) x
  WHERE jsonb_typeof(x.value)<>'string' OR length(x.value #>> '{}')>160
   OR (x.key<>'parentLocationId' AND trim(x.value #>> '{}')='')
   OR x.value #>> '{}'<>trim(x.value #>> '{}')
 ) THEN RAISE EXCEPTION 'LIVE_R1_VALUES_DENIED'; END IF;
 IF k='ITEM' AND act<>'DELETE' AND
  (val->>'controlType' NOT IN ('NONE','BATCH','SERIAL') OR
   val->>'uom' !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$')
 THEN RAISE EXCEPTION 'LIVE_R1_ITEM_INVALID'; END IF;
 IF k='LOCATION' AND act<>'DELETE' AND val->>'parentLocationId'<>'' AND
  (val->>'parentLocationId' !~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
   OR val->>'parentLocationId'=rec)
 THEN RAISE EXCEPTION 'LIVE_R1_PARENT_INVALID'; END IF;
 actor_person:=hft_live_r1.authorized_person(p_actor,ent,st,wh,k||'.'||act);
 IF EXISTS(SELECT 1 FROM hft_live_r1.revision_event WHERE request_id=rid)
 THEN RAISE EXCEPTION 'LIVE_R1_REQUEST_REUSE_RECONCILE_NO_RETRY'; END IF;
 IF act='CREATE' THEN
  INSERT INTO hft_live_r1.master_record(kind,legal_entity_id,site_id,warehouse_id,
   record_id,revision,values_json,deleted,created_by,updated_by)
  VALUES(k,ent,st,wh,rec,1,val,false,p_actor,p_actor)
  RETURNING * INTO STRICT updated;
  prior:=NULL;
 ELSE
  SELECT * INTO STRICT previous FROM hft_live_r1.master_record WHERE
   kind=k AND legal_entity_id=ent AND site_id=st AND warehouse_id=wh
   AND record_id=rec FOR UPDATE;
  IF previous.deleted OR previous.revision<>rev
  THEN RAISE EXCEPTION 'LIVE_R1_REVISION_CONFLICT'; END IF;
  prior:=to_jsonb(previous);
  UPDATE hft_live_r1.master_record
   SET revision=revision+1,values_json=CASE WHEN act='DELETE' THEN previous.values_json ELSE val END,
    deleted=(act='DELETE'),updated_by=p_actor,updated_at=clock_timestamp()
   WHERE kind=k AND legal_entity_id=ent AND site_id=st AND warehouse_id=wh
   AND record_id=rec AND revision=rev
  RETURNING * INTO STRICT updated;
 END IF;
 evidence:=jsonb_build_object('before',prior,'after',to_jsonb(updated),
  'actor',p_actor,'person',actor_person,'session',p_session,
  'reason',reason,'requestId',rid,'action',act);
 digest:=encode(pg_catalog.sha256(pg_catalog.convert_to(evidence::text,'UTF8')),'hex');
 INSERT INTO hft_live_r1.revision_event(request_id,kind,legal_entity_id,site_id,warehouse_id,
  record_id,revision,action,before_snapshot,after_snapshot,actor_subject,
  actor_person_id,actor_session_id,reason,event_sha256)
 VALUES(rid,k,ent,st,wh,rec,updated.revision,act,prior,to_jsonb(updated),
  p_actor,actor_person,p_session,reason,digest);
 RETURN jsonb_build_object('state','COMMITTED_UNAPPROVED','record',to_jsonb(updated),
  'auditSha256',digest,'requestId',rid);
EXCEPTION WHEN no_data_found THEN
 RAISE EXCEPTION 'LIVE_R1_RECORD_NOT_FOUND_OR_SCOPE_DENIED';
END $save$;
CREATE FUNCTION hft_live_r1.get_v1(p_actor text,p_entity text,p_site text,
 p_warehouse text,p_kind text,p_id text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $get$
DECLARE rec jsonb;
BEGIN
 PERFORM hft_live_r1.authorized_person(p_actor,p_entity,p_site,p_warehouse,p_kind||'.READ');
 SELECT to_jsonb(r) INTO rec FROM hft_live_r1.master_record r
 WHERE r.kind=p_kind AND r.legal_entity_id=p_entity AND r.site_id=p_site
 AND r.warehouse_id=p_warehouse AND r.record_id=p_id;
 RETURN jsonb_build_object('record',rec,'state','AUTHORITATIVE_UNAPPROVED');
END $get$;
CREATE FUNCTION hft_live_r1.list_v1(p_actor text,p_entity text,p_site text,
 p_warehouse text,p_kind text,p_search text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $list$
DECLARE rows jsonb;
BEGIN
 PERFORM hft_live_r1.authorized_person(p_actor,p_entity,p_site,p_warehouse,p_kind||'.READ');
 SELECT COALESCE(jsonb_agg(to_jsonb(z) ORDER BY z.record_id),'[]'::jsonb) INTO rows FROM(
  SELECT * FROM hft_live_r1.master_record r WHERE r.kind=p_kind
   AND r.legal_entity_id=p_entity AND r.site_id=p_site AND r.warehouse_id=p_warehouse
   AND (p_search='' OR position(lower(p_search) in lower(r.record_id))>0)
   ORDER BY r.record_id LIMIT 100
 ) z;
 RETURN jsonb_build_object('state','AUTHORITATIVE_UNAPPROVED','records',rows);
END $list$;
CREATE FUNCTION hft_live_r1.history_v1(p_actor text,p_entity text,p_site text,
 p_warehouse text,p_kind text,p_id text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $history$
DECLARE rows jsonb;
BEGIN
 PERFORM hft_live_r1.authorized_person(p_actor,p_entity,p_site,p_warehouse,p_kind||'.READ');
 SELECT COALESCE(jsonb_agg(to_jsonb(z) ORDER BY z.revision DESC),'[]'::jsonb)
 INTO rows FROM(SELECT e.* FROM hft_live_r1.revision_event e WHERE
  e.kind=p_kind AND e.legal_entity_id=p_entity AND e.site_id=p_site
  AND e.warehouse_id=p_warehouse AND e.record_id=p_id
  ORDER BY e.revision DESC LIMIT 100) z;
 RETURN jsonb_build_object('state','AUTHORITATIVE_UNAPPROVED','history',rows);
END $history$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_live_r1 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hft_live_r1 FROM PUBLIC;
-- The dedicated restricted hft_r1_live_api_login is provisioned only by Chat 13.
GRANT USAGE ON SCHEMA hft_live_r1 TO hft_r1_live_api_login;
-- Read-only installer metadata is inspectable; business records and actor grants are not.
GRANT SELECT ON hft_live_r1.installation,hft_live_r1.schema_revision TO hft_r1_live_api_login;
GRANT EXECUTE ON FUNCTION hft_live_r1.save_v1(text,text,jsonb) TO hft_r1_live_api_login;
GRANT EXECUTE ON FUNCTION hft_live_r1.get_v1(text,text,text,text,text,text)
 TO hft_r1_live_api_login;
GRANT EXECUTE ON FUNCTION hft_live_r1.list_v1(text,text,text,text,text,text)
 TO hft_r1_live_api_login;
GRANT EXECUTE ON FUNCTION hft_live_r1.history_v1(text,text,text,text,text,text)
 TO hft_r1_live_api_login;
-- The app does not enroll subject/person/scope grants and has NO direct table DML.
COMMIT;
