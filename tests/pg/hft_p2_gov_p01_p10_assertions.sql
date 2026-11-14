-- GOV-P2-01..10 source-level qualification assertions. NOT EXECUTED.
-- Requires independently governed SYNTHETIC approval/inspection/stock
-- fixtures, a qualified read-only governance verifier and disposable PG15+.
-- This is a POSITIVE state-integrity assertion, not proof of forgery rejection.
-- GOV-01/02/03/05/06/07/09 can be inspected here; G04 pending ACK, G08/10
-- must also execute separate fault/COMMIT recovery tests.
\set ON_ERROR_STOP on
\if :{?gov_entity}
\else
 \echo 'STOP GOV_P2_NO_SYNTHETIC_ENTITY'
 SELECT 1/0;
 \quit
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_catalog.set_config('hft.gov.entity',:'gov_entity',true);
DO $test$
DECLARE v_entity text:=pg_catalog.current_setting('hft.gov.entity');
 v_approved bigint;v_bad bigint;v_expected bigint;v_ack bigint;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 THEN RAISE EXCEPTION 'GOV_P2_ISOLATED_INDEPENDENT_READ_LOGIN_REQUIRED'; END IF;
 SELECT pg_catalog.count(*) INTO v_approved FROM hft.protected_stock_approval AS a
 WHERE a.legal_entity_id=v_entity;
 IF v_approved=0 THEN RAISE EXCEPTION 'GOV_P2_NO_APPROVED_SYNTHETIC_FIXTURE'; END IF;

 -- GOV-P2-01/02/06: every approval has original source-role identities,
 -- stable human duty evidence, exact payload digest and current policy revision.
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.protected_stock_approval AS a
 LEFT JOIN hft.protected_approval_decision AS d
 ON d.legal_entity_id=a.legal_entity_id AND d.approval_id=a.approval_id
 AND d.approval_revision=a.approval_revision
 LEFT JOIN hft.posting_action_policy AS pol
 ON pol.legal_entity_id=a.legal_entity_id AND pol.site_id=a.site_id
 AND pol.warehouse_id=a.warehouse_id AND pol.action_kind=a.kind
 AND pol.policy_revision=a.policy_revision
 WHERE a.legal_entity_id=v_entity AND
 (d.approval_id IS NULL OR pol.action_kind IS NULL
 OR a.payload_sha256 IS DISTINCT FROM d.payload_sha256
 OR a.document_revision IS DISTINCT FROM d.source_revision
 OR a.approver_subject IS DISTINCT FROM d.approver_subject
 OR a.valid_from>=a.valid_until OR d.policy_revision<>a.policy_revision);
 IF v_bad<>0 THEN RAISE EXCEPTION 'GOV_P2_APPROVAL_DECISION_OR_POLICY_INCONSISTENT:%',v_bad; END IF;

 -- GOV-P2-09: different login aliases are NOT automatically independent.
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.protected_stock_approval AS a
 JOIN hft.protected_approval_decision AS d ON d.legal_entity_id=a.legal_entity_id
 AND d.approval_id=a.approval_id AND d.approval_revision=a.approval_revision
 JOIN hft.posting_action_policy AS pol ON pol.legal_entity_id=a.legal_entity_id
 AND pol.site_id=a.site_id AND pol.warehouse_id=a.warehouse_id
 AND pol.action_kind=a.kind AND pol.policy_revision=a.policy_revision
 LEFT JOIN hft.approval_human_login AS maker ON maker.legal_entity_id=a.legal_entity_id
 AND maker.actor_subject=d.prepared_subject
 LEFT JOIN hft.approval_human_login AS checker ON checker.legal_entity_id=a.legal_entity_id
 AND checker.actor_subject=d.checked_subject
 LEFT JOIN hft.approval_human_login AS approver ON approver.legal_entity_id=a.legal_entity_id
 AND approver.actor_subject=d.approver_subject
 LEFT JOIN hft.approval_human_login AS actor ON actor.legal_entity_id=a.legal_entity_id
 AND actor.actor_subject=a.actor_subject
 WHERE a.legal_entity_id=v_entity AND
 (approver.person_id IS NULL OR actor.person_id IS NULL
 OR pol.require_checker AND
    (checker.person_id IS NULL OR maker.person_id=checker.person_id)
 OR pol.require_independent_approver AND
    (approver.person_id=actor.person_id OR approver.person_id=maker.person_id
     OR approver.person_id=checker.person_id));
 IF v_bad<>0 THEN RAISE EXCEPTION 'GOV_P2_DISTINCT_PERSON_POLICY_FAILED:%',v_bad; END IF;

 -- GOV-P2-03/05: exact signed RETURN inspection identity and attested inspector.
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.protected_stock_approval AS a
 JOIN hft.protected_approval_decision AS d ON d.legal_entity_id=a.legal_entity_id
 AND d.approval_id=a.approval_id AND d.approval_revision=a.approval_revision
 LEFT JOIN hft.material_return AS m ON m.id::text=a.document_id
 LEFT JOIN hft.return_inspection_attestation AS att
 ON att.legal_entity_id=a.legal_entity_id AND att.return_document_id=a.document_id
 AND att.evidence_id=a.inspection_evidence_id
 AND att.inspector_subject=d.inspector_subject
 AND att.inspector_session_id=d.inspector_session_id
 WHERE a.legal_entity_id=v_entity AND a.kind='RETURN'
 AND (a.inspection_evidence_id='' OR a.inspection_evidence_id<>d.inspection_evidence_id
   OR a.inspection_evidence_id IS DISTINCT FROM m.evidence_reference
   OR att.evidence_id IS NULL);
 IF v_bad<>0 THEN RAISE EXCEPTION 'GOV_P2_RETURN_INSPECTION_BINDING_FAILED:%',v_bad; END IF;

 -- GOV-P2-04: a posted employee ISSUE MUST enter ACK_PENDING or have
 -- separately persisted signed acknowledgement; no assumed receipt.
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.stock_command AS c
 LEFT JOIN hft.custody_ack_status_v1 AS ack ON ack.issue_command_uuid=c.id
 WHERE c.legal_entity_id=v_entity AND c.kind='ISSUE'
 AND (ack.issue_command_uuid IS NULL OR ack.state NOT IN
 ('ACK_PENDING','ACKNOWLEDGED','DISPUTED'));
 IF v_bad<>0 THEN RAISE EXCEPTION 'GOV_P2_CUSTODY_ACK_STATE_NOT_PERSISTED:%',v_bad; END IF;

 -- GOV-P2-07 cumulative approved source fragments and command counts:
 -- every fragment must be tied to one immutable command with exact quantity.
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.posting_fragment AS f
 LEFT JOIN hft.stock_command AS c ON c.id=f.command_uuid
 WHERE f.legal_entity_id=v_entity AND
 (c.id IS NULL OR c.legal_entity_id<>f.legal_entity_id
 OR c.quantity_micro<>f.quantity_micro OR c.fragment_id<>f.fragment_id);
 IF v_bad<>0 THEN RAISE EXCEPTION 'GOV_P2_FRAGMENT_EVIDENCE_UNBOUND:%',v_bad; END IF;
END $test$;
SELECT 'GOV_P2_POSITIVE_ASSERTIONS_PASS' AS result;
COMMIT;

-- Negative acceptance GOV-01/02/03/05/06/09: separately signed synthetic
-- forged role/expired approval/parent-Hold/inspection mutation payloads
-- MUST be denied using P2-SEC-T03/T04 and preserve unchanged balances,
-- custody, fragments, command, nonce, seal, outcome and audit counts.
-- GOV-08 fault injection and GOV-10 lost COMMIT need separate authorized
-- runtime simulation and exact durable readback. NOT RUN / NOT ACCEPTED.
