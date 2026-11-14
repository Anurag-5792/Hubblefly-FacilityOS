-- HFT P3 independent audit reconstruction. SOURCE ONLY / PG NOT RUN.
-- Execute under an actual dedicated hft_r1_audit_verify login after
-- authorized synthetic Employee CREATE + ACTIVATE. No P3 runtime login.
\set ON_ERROR_STOP on
\if :{?audit_entity}
\else
 \echo 'STOP P3_AUDIT_ENTITY_REQUIRED'
 \quit
\endif
\if :{?audit_employee}
\else
 \echo 'STOP P3_AUDIT_EMPLOYEE_REQUIRED'
 \quit
\endif
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_catalog.set_config('hft.p3.audit.entity',:'audit_entity',true);
SELECT pg_catalog.set_config('hft.p3.audit.employee',:'audit_employee',true);
DO $p3_audit$
DECLARE e text:=pg_catalog.current_setting('hft.p3.audit.entity');
 who text:=pg_catalog.current_setting('hft.p3.audit.employee');
 revisions bigint;accepted bigint;requested bigint;applied bigint;denied bigint;
 invalid bigint;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_audit_verify','MEMBER')
 THEN RAISE EXCEPTION 'P3_INDEPENDENT_AUDIT_LOGIN_REQUIRED'; END IF;
 SELECT pg_catalog.count(*) INTO revisions FROM hft.p3_master_revision r
 WHERE r.legal_entity_id=e AND r.kind='EMPLOYEE' AND r.record_id=who;
 IF revisions<>2 THEN RAISE EXCEPTION 'P3_EXPECTED_TWO_EMPLOYEE_REVISIONS:%',revisions; END IF;
 SELECT pg_catalog.count(*) INTO invalid FROM hft.p3_master_revision r
 LEFT JOIN hft.employee_revision er ON er.legal_entity_id=r.legal_entity_id
 AND er.employee_id=r.record_id AND er.version=r.version
 WHERE r.legal_entity_id=e AND r.kind='EMPLOYEE' AND r.record_id=who
 AND (er.version IS NULL OR er.snapshot IS DISTINCT FROM r.after_snapshot);
 IF invalid<>0 THEN RAISE EXCEPTION 'P3_EMPLOYEE_REVISION_DIVERGENCE:%',invalid; END IF;
 SELECT
 pg_catalog.count(*) FILTER (WHERE a.event_type='REQUESTED'),
 pg_catalog.count(*) FILTER (WHERE a.event_type='APPROVED'),
 pg_catalog.count(*) FILTER (WHERE a.event_type='APPLIED'),
 pg_catalog.count(*) FILTER (WHERE a.event_type='DENIED')
 INTO requested,accepted,applied,denied
 FROM hft.p3_master_audit a JOIN hft.p3_master_change_request r
 ON r.request_id=a.request_id WHERE r.legal_entity_id=e
 AND r.kind='EMPLOYEE' AND r.record_id=who;
 IF (requested,accepted,applied,denied) IS DISTINCT FROM (2::bigint,2::bigint,2::bigint,0::bigint)
 THEN RAISE EXCEPTION 'P3_REQUEST_DECISION_APPLY_AUDIT_MISMATCH'; END IF;
 SELECT pg_catalog.count(*) INTO invalid FROM hft.p3_master_revision r
 JOIN hft.p3_master_decision d ON d.request_id=r.request_id
 JOIN hft.p3_master_change_request req ON req.request_id=r.request_id
 WHERE r.legal_entity_id=e AND r.kind='EMPLOYEE' AND r.record_id=who
 AND (d.decision<>'APPROVED' OR d.request_payload_sha256<>req.payload_sha256
 OR d.approver_subject=req.requester_subject OR
 d.signed_decision_sha256 !~ '^[0-9a-f]{64}$');
 IF invalid<>0 THEN RAISE EXCEPTION 'P3_APPROVAL_SOURCE_EVIDENCE_DIVERGENCE'; END IF;
END $p3_audit$;
SELECT 'P3_EMPLOYEE_AUDIT_RECONSTRUCTION_PASS' AS result;
COMMIT;
