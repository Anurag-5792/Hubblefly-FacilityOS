-- Private inventory review gateway. Not a stock writer or canonical Stores migration.
-- Install only in the separately admitted, populated inventory intake database.
DO $guard$ BEGIN
 IF current_database() !~ '^hft_inventory_intake_[0-9]{3}$'
 OR to_regclass('hft_intake.item_candidate') IS NULL
 OR to_regclass('hft_intake.source_snapshot') IS NULL
 OR to_regclass('hft.stock_account') IS NOT NULL
 OR EXISTS(SELECT 1 FROM hft_intake.source_snapshot WHERE snapshot_sha256 IS NULL)
 THEN RAISE EXCEPTION 'INTAKE_TARGET_NOT_ADMITTED'; END IF;
END $guard$;
CREATE ROLE hft_intake_api_login NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA hft_intake TO hft_intake_api_login;
DO $grant$ BEGIN
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO hft_intake_api_login',current_database());
END $grant$;
CREATE TABLE hft_intake.access_grant(
 grant_id uuid PRIMARY KEY, identity_binding_sha256 text NOT NULL CHECK(identity_binding_sha256 ~ '^[0-9a-f]{64}$'),
 active boolean NOT NULL DEFAULT false, valid_until timestamptz NOT NULL,
 can_rename boolean NOT NULL DEFAULT false, authority_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE hft_intake.rename_request(
 request_id uuid PRIMARY KEY, grant_id uuid NOT NULL REFERENCES hft_intake.access_grant,
 intake_item_id text NOT NULL REFERENCES hft_intake.item_candidate,
 expected_revision integer NOT NULL CHECK(expected_revision>0),
 previous_name text NOT NULL, new_name text NOT NULL, reason text NOT NULL,
 committed_revision integer NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(committed_revision=expected_revision+1)
);
CREATE TRIGGER intake_rename_no_changes BEFORE UPDATE OR DELETE ON hft_intake.rename_request
 FOR EACH ROW EXECUTE FUNCTION hft_intake.protect_source_row();
CREATE FUNCTION hft_intake.assert_access(p_grant uuid,p_binding text,p_write boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hft_intake AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hft_intake.access_grant g
 WHERE g.grant_id=p_grant AND g.identity_binding_sha256=p_binding AND g.active
 AND g.valid_until>clock_timestamp() AND (NOT p_write OR g.can_rename))
 THEN RAISE EXCEPTION 'INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION hft_intake.read_page(p_grant uuid,p_binding text,p_view text,p_search text,p_offset integer,p_limit integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hft_intake AS $$
DECLARE n bigint; rows_json jsonb; heads jsonb; k text;
BEGIN
 PERFORM hft_intake.assert_access(p_grant,p_binding,false);
 IF p_view IS NULL OR p_search IS NULL OR char_length(p_search)>100 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
 OR p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'INTAKE_QUERY_INVALID'; END IF;
 IF p_view='items' THEN
 heads:=jsonb_build_array('Intake ID','Item code','Display name','Original name','Category','Tracking','Recorded UOM','Opening rows','Revision','Review status');
 SELECT count(*) INTO n FROM hft_intake.item_candidate i WHERE strpos(lower(concat_ws(' ',i.intake_item_id,i.proposed_item_code,i.original_name,i.display_name,i.category,i.tracking_type)),lower(p_search))>0;
 SELECT coalesce(jsonb_agg(x.cells ORDER BY x.intake_item_id),'[]'::jsonb) INTO rows_json FROM (
 SELECT i.intake_item_id,jsonb_build_array(i.intake_item_id,i.proposed_item_code,i.display_name,i.original_name,i.category,i.tracking_type,i.recorded_uom,
 (SELECT count(*) FROM hft_intake.opening_observation o WHERE o.intake_item_id=i.intake_item_id),i.revision,i.identity_status) cells
 FROM hft_intake.item_candidate i WHERE strpos(lower(concat_ws(' ',i.intake_item_id,i.proposed_item_code,i.original_name,i.display_name,i.category,i.tracking_type)),lower(p_search))>0
 ORDER BY i.intake_item_id OFFSET p_offset LIMIT p_limit) x;
 ELSIF p_view='opening' THEN
 heads:=jsonb_build_array('Source row','Item intake ID','Item code','Display name','Original name','Tracking','Observed quantity','Recorded UOM (linked reference)','Rack','Shelf','Position','Stack position','Container type','Container number','Count date','Admission');
 SELECT count(*) INTO n FROM hft_intake.opening_observation o JOIN hft_intake.item_candidate i USING(intake_item_id)
 WHERE strpos(lower(concat_ws(' ',o.source_row_number::text,o.candidate_item_code,o.original_name,i.display_name,o.rack,o.container_number)),lower(p_search))>0;
 SELECT coalesce(jsonb_agg(x.cells ORDER BY x.source_row_number),'[]'::jsonb) INTO rows_json FROM (
 SELECT o.source_row_number,jsonb_build_array(o.source_row_number,i.intake_item_id,o.candidate_item_code,i.display_name,o.original_name,o.tracking_type,o.recorded_qty_text,i.recorded_uom,o.rack,o.shelf,o.position,o.stack_slot,o.container_type,o.container_number,o.count_date_raw,o.admission_state) cells
 FROM hft_intake.opening_observation o JOIN hft_intake.item_candidate i USING(intake_item_id)
 WHERE strpos(lower(concat_ws(' ',o.source_row_number::text,o.candidate_item_code,o.original_name,i.display_name,o.rack,o.container_number)),lower(p_search))>0
 ORDER BY o.source_row_number OFFSET p_offset LIMIT p_limit) x;
 ELSE
 k:=CASE p_view WHEN 'current' THEN 'B3_CURRENT_STOCK' WHEN 'issues' THEN 'B3_OUT' WHEN 'hft_issues' THEN 'B3_HFT_OUT'
 WHEN 'movement_holds' THEN 'B3_MOVEMENT_HOLDS' WHEN 'racks' THEN 'RACK_LEVEL_REFERENCE'
 WHEN 'positions' THEN 'POSITION_REFERENCE' WHEN 'containers' THEN 'CONTAINER_REFERENCE'
 WHEN 'stickers' THEN 'B3_STICKER_REGISTER' ELSE NULL END;
 SELECT headers INTO heads FROM hft_intake.source_snapshot WHERE source_key=k AND snapshot_sha256 IS NOT NULL;
 IF heads IS NULL THEN RAISE EXCEPTION 'INTAKE_VIEW_INVALID'; END IF;
 SELECT count(*) INTO n FROM hft_intake.source_row r WHERE r.source_key=k AND strpos(lower(r.cells::text),lower(p_search))>0;
 SELECT coalesce(jsonb_agg(x.cells ORDER BY x.source_row_number),'[]'::jsonb) INTO rows_json FROM (
 SELECT r.source_row_number,r.cells FROM hft_intake.source_row r WHERE r.source_key=k AND strpos(lower(r.cells::text),lower(p_search))>0
 ORDER BY r.source_row_number OFFSET p_offset LIMIT p_limit) x;
 END IF;
 RETURN jsonb_build_object('view',p_view,'headers',heads,'rows',rows_json,'total',n,'offset',p_offset,'canRename',
 EXISTS(SELECT 1 FROM hft_intake.access_grant g WHERE g.grant_id=p_grant AND g.active AND g.valid_until>clock_timestamp() AND g.can_rename),'classification','UNADMITTED_INVENTORY_REVIEW');
END $$;
CREATE FUNCTION hft_intake.rename_item(p_grant uuid,p_binding text,p_request uuid,p_item text,p_revision integer,p_name text,p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hft_intake AS $$
DECLARE old_name text; rev integer; existing hft_intake.rename_request%ROWTYPE;
BEGIN
 PERFORM hft_intake.assert_access(p_grant,p_binding,true);
 IF p_request IS NULL OR p_item IS NULL OR p_item !~ '^(CM|OP)-[0-9]+$' OR p_revision IS NULL OR p_revision<1
 OR p_name IS NULL OR char_length(p_name)>240 OR btrim(p_name)<>p_name OR p_name='' OR p_name ~ '[[:cntrl:]]'
 OR p_reason IS NULL OR char_length(p_reason)<8 OR char_length(p_reason)>300 OR btrim(p_reason)<>p_reason OR p_reason ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'INTAKE_RENAME_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO existing FROM hft_intake.rename_request WHERE request_id=p_request;
 IF FOUND THEN
 IF existing.grant_id<>p_grant OR existing.intake_item_id<>p_item OR existing.expected_revision<>p_revision OR existing.new_name<>p_name OR existing.reason<>p_reason
 THEN RAISE EXCEPTION 'INTAKE_REQUEST_REUSE'; END IF;
 RETURN jsonb_build_object('requestId',existing.request_id,'itemId',existing.intake_item_id,'name',existing.new_name,'revision',existing.committed_revision,'state','RECORDED');
 END IF;
 SELECT display_name,revision INTO old_name,rev FROM hft_intake.item_candidate WHERE intake_item_id=p_item FOR UPDATE;
 IF NOT FOUND OR rev<>p_revision THEN RAISE EXCEPTION 'INTAKE_REVISION_CONFLICT'; END IF;
 IF old_name=p_name THEN RAISE EXCEPTION 'INTAKE_NO_CHANGE'; END IF;
 PERFORM hft_intake.assert_access(p_grant,p_binding,true);
 UPDATE hft_intake.item_candidate SET display_name=p_name WHERE intake_item_id=p_item RETURNING revision INTO rev;
 INSERT INTO hft_intake.rename_request(request_id,grant_id,intake_item_id,expected_revision,previous_name,new_name,reason,committed_revision)
 VALUES(p_request,p_grant,p_item,p_revision,old_name,p_name,p_reason,rev);
 RETURN jsonb_build_object('requestId',p_request,'itemId',p_item,'name',p_name,'revision',rev,'state','RECORDED');
END $$;
CREATE FUNCTION hft_intake.read_rename(p_grant uuid,p_binding text,p_request uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,hft_intake AS $$
DECLARE r hft_intake.rename_request%ROWTYPE;
BEGIN
 PERFORM hft_intake.assert_access(p_grant,p_binding,false);
 SELECT * INTO r FROM hft_intake.rename_request WHERE request_id=p_request AND grant_id=p_grant;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','NOT_FOUND'); END IF;
 RETURN jsonb_build_object('requestId',r.request_id,'itemId',r.intake_item_id,'name',r.new_name,'revision',r.committed_revision,'state','RECORDED');
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hft_intake FROM PUBLIC,hft_intake_api_login;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft_intake FROM PUBLIC,hft_intake_api_login;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft_intake FROM PUBLIC,hft_intake_api_login;
GRANT EXECUTE ON FUNCTION hft_intake.read_page(uuid,text,text,text,integer,integer) TO hft_intake_api_login;
GRANT EXECUTE ON FUNCTION hft_intake.rename_item(uuid,text,uuid,text,integer,text,text) TO hft_intake_api_login;
GRANT EXECUTE ON FUNCTION hft_intake.read_rename(uuid,text,uuid) TO hft_intake_api_login;
