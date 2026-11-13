-- QA067 independently privileged FAULT-CONSTRUCTOR candidate; STOP-GUARDED.
-- The ordinary QA observer MUST NOT own or execute this function.
-- All results are forensic observations, never independent QA acceptance.
BEGIN;
DO $STOP_QA067_FAULT$ BEGIN
 RAISE EXCEPTION 'HFT_QA067_FAULT_CONSTRUCTOR_INSTALLATION_HOLD';
END $STOP_QA067_FAULT$;

CREATE SCHEMA hft_qa067_fault;
REVOKE ALL ON SCHEMA hft_qa067_fault FROM PUBLIC;

-- Precisely scoped unauthorized counter-only modification attempt, F06.
-- PL/pgSQL EXCEPTION creates a subtransaction: ANY unexpectedly successful
-- protected DML is rolled back by the forced exception before returning.
CREATE OR REPLACE FUNCTION hft_qa067_fault.exercise_counter_only_v1(
 p_fixture uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $counter_fault$
DECLARE
 f hft_qa067.fixture_v1%ROWTYPE;
 source hft.ops_a2_transfer_document%ROWTYPE;
 attempted_state text;
 attempted_message text;
 observed_after bigint;
BEGIN
 IF session_user<>'hft_r1_fault_constructor'
 OR pg_catalog.current_setting('transaction_read_only')<>'off'
 OR pg_catalog.current_setting('transaction_isolation')<>'serializable'
 OR pg_catalog.current_setting('server_version_num')::integer<>180006
 OR pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 THEN RAISE EXCEPTION 'QA067_INDEPENDENT_DISPOSABLE_CONSTRUCTOR_REQUIRED'; END IF;
 SELECT * INTO f FROM hft_qa067.fixture_v1
 WHERE fixture_id=p_fixture AND case_id='OPS063-F06'
 AND admitted_at<=pg_catalog.clock_timestamp()
 AND expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'QA067_FIXTURE_NOT_EXACTLY_ADMITTED'; END IF;
 SELECT * INTO source FROM hft.ops_a2_transfer_document
 WHERE id=(SELECT c.source_document_id::uuid FROM hft.stock_command c
           WHERE c.id=f.original_command_uuid
           AND c.legal_entity_id=f.legal_entity_id)
 AND legal_entity_id=f.legal_entity_id
 AND site_id=f.site_id AND warehouse_id=f.warehouse_id
 AND item_code=f.item_code
 AND product_version_code=f.product_version_code;
 IF source.id IS NULL OR source.moved_micro>=source.authorized_micro
 THEN RAISE EXCEPTION 'QA067_TRANSFER_FAULT_PRESTATE_INVALID'; END IF;
 -- Independently validate committed original positive-control provenance.
 PERFORM 1 FROM hft.audit_outbox a
 WHERE a.command_id=f.original_command_uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA067_ORIGINAL_POSITIVE_AUDIT_MISSING'; END IF;
 BEGIN
  UPDATE hft.ops_a2_transfer_document
   SET moved_micro=moved_micro+1 WHERE id=source.id
   AND legal_entity_id=f.legal_entity_id;
  RAISE EXCEPTION 'QA067_FAULT_UNEXPECTEDLY_WRITABLE';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS attempted_state=RETURNED_SQLSTATE,
    attempted_message=MESSAGE_TEXT;
 END;
 SELECT moved_micro INTO observed_after FROM hft.ops_a2_transfer_document
 WHERE id=source.id AND legal_entity_id=f.legal_entity_id;
 IF observed_after IS DISTINCT FROM source.moved_micro
 THEN RAISE EXCEPTION 'QA067_FAULT_COMMITTED_STATE_CHANGED'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'case_id','OPS063-F06','fixture_id',p_fixture,
  'actual_sqlstate',attempted_state,
  'actual_rejection',attempted_message,
  'backend_pid',pg_catalog.pg_backend_pid(),
  'session_user',session_user,'current_user',current_user,
  'source_counter_before',source.moved_micro,
  'source_counter_after',observed_after,
  'protected_rejection_matches_expected',
    (attempted_state='P0001' AND
     attempted_message='OPS_A2_TRANSFER_ONLY_PROTECTED_WRITER_TRANSITION'),
  'status','UNVERIFIED_CONSTRUCTOR_RESULT_NOT_QA_ACCEPTANCE');
END $counter_fault$;

REVOKE ALL ON FUNCTION hft_qa067_fault.exercise_counter_only_v1(uuid)
 FROM PUBLIC;
-- Exact installer-owned GRANT and a qualified disposable DML permission are
-- separate, independently approved steps. No grant, role creation or runtime
-- privilege activation is included in this source.
COMMIT;
