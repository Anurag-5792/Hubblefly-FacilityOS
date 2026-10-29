-- HFT-R1 P2 SEC-T06 AUDITOR: controlled source acceptance, NOT EXECUTED.
-- Run only after separately authorized, committed synthetic fixture T06 in
-- disposable PostgreSQL15+ using a real audit LOGIN, never migration owner.
-- The T06 positive fixture MUST be RECEIVE5, ISSUE2+3, RETURN GOOD1+1.
\set ON_ERROR_STOP on
\if :{?audit_entity}
\else
 \echo 'STOP P2_T06_MISSING_AUDIT_ENTITY'
 \quit
\endif
\if :{?audit_item}
\else
 \echo 'STOP P2_T06_MISSING_AUDIT_ITEM'
 \quit
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_catalog.set_config('hft.t06.entity',:'audit_entity',true);
SELECT pg_catalog.set_config('hft.t06.item',:'audit_item',true);
DO $checks$
DECLARE
 v_entity text:=pg_catalog.current_setting('hft.t06.entity');
 v_item text:=pg_catalog.current_setting('hft.t06.item');
 v_commands bigint;v_fragments bigint;v_issues bigint;v_returns bigint;
 v_receives bigint;v_bad bigint;v_available numeric;v_custody numeric;v_total numeric;
 v_total_legs bigint;v_audits bigint;v_outcomes bigint;v_seals bigint;
 v_ack_pending bigint;v_nonce_count numeric;
BEGIN
 IF pg_catalog.current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR pg_catalog.current_user<>pg_catalog.session_user
 OR NOT pg_catalog.pg_has_role(pg_catalog.session_user,
     'hft_r1_audit_verify','MEMBER')
 THEN RAISE EXCEPTION 'P2_T06_INDEPENDENT_AUDITOR_REQUIRED'; END IF;
 SELECT pg_catalog.count(*),
  pg_catalog.count(*) FILTER (WHERE kind='RECEIVE'),
  pg_catalog.count(*) FILTER (WHERE kind='ISSUE'),
  pg_catalog.count(*) FILTER (WHERE kind='RETURN')
 INTO v_commands,v_receives,v_issues,v_returns
 FROM hft.stock_command AS c WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 IF (v_commands,v_receives,v_issues,v_returns) IS DISTINCT FROM (5::bigint,1::bigint,2::bigint,2::bigint)
 THEN RAISE EXCEPTION 'P2_T06_COMMAND_CARDINALITY_INVALID:%/%/%/%',
  v_commands,v_receives,v_issues,v_returns; END IF;
 SELECT pg_catalog.count(*) INTO v_fragments
 FROM hft.posting_fragment AS f JOIN hft.stock_command AS c ON c.id=f.command_uuid
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 IF v_fragments<>4 THEN RAISE EXCEPTION 'P2_T06_EXPECTED_FOUR_UNIQUE_FRAGMENTS:%',v_fragments; END IF;
 SELECT pg_catalog.count(*) INTO v_total_legs FROM hft.stock_entry AS leg
 JOIN hft.stock_command AS c ON c.id=leg.command_id
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 IF v_total_legs<>10 THEN RAISE EXCEPTION 'P2_T06_EXPECTED_EXACT_TWO_LEGS_EACH:%',v_total_legs; END IF;
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.stock_command_seal_reconstruction_v1 AS sr
 JOIN hft.stock_command AS c ON c.id=sr.command_uuid
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item
 AND (sr.seal_missing OR sr.seal_mismatch OR sr.leg_count<>2 OR sr.net_micro<>0);
 IF v_bad<>0 THEN RAISE EXCEPTION 'P2_T06_SEAL_OR_LEDGER_MISMATCH:%',v_bad; END IF;
 SELECT pg_catalog.count(*) INTO v_bad FROM hft.stock_account_reconstruction_v2 AS a
 WHERE a.legal_entity_id=v_entity AND a.item_code=v_item
 AND a.persisted_micro<>a.reconstructed_micro;
 IF v_bad<>0 THEN RAISE EXCEPTION 'P2_T06_ACCOUNT_RECONSTRUCTION_FAILED:%',v_bad; END IF;
 SELECT pg_catalog.coalesce(pg_catalog.sum(
  CASE WHEN a.account_kind='AVAILABLE' THEN a.persisted_micro ELSE 0 END),0),
  pg_catalog.coalesce(pg_catalog.sum(
  CASE WHEN a.account_kind='CUSTODY' THEN a.persisted_micro ELSE 0 END),0),
  pg_catalog.coalesce(pg_catalog.sum(a.persisted_micro),0)
 INTO v_available,v_custody,v_total
 FROM hft.stock_account_reconstruction_v2 AS a
 WHERE a.legal_entity_id=v_entity AND a.item_code=v_item;
 IF v_available<>2000000 OR v_custody<>3000000 OR v_total<>5000000
 THEN RAISE EXCEPTION 'P2_T06_OWNED_STOCK_OR_CUSTODY_MISMATCH:%/%/%',
 v_available,v_custody,v_total; END IF;
 SELECT pg_catalog.count(*) INTO v_audits
 FROM hft.audit_outbox AS a JOIN hft.stock_command AS c ON c.id=a.command_id
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 SELECT pg_catalog.count(*) INTO v_outcomes
 FROM hft.stock_command_outcome AS o JOIN hft.stock_command AS c ON c.id=o.command_id
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 SELECT pg_catalog.count(*) INTO v_seals
 FROM hft.stock_command_seal AS s JOIN hft.stock_command AS c ON c.id=s.command_id
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 IF v_audits<>5 OR v_outcomes<>5 OR v_seals<>5
 THEN RAISE EXCEPTION 'P2_T06_OUTCOME_AUDIT_SEAL_INCOMPLETE'; END IF;
 SELECT pg_catalog.count(*) INTO v_bad
 FROM hft.audit_outbox AS a JOIN hft.stock_command AS c ON c.id=a.command_id
 LEFT JOIN hft.audit_delivery AS d ON d.outbox_id=a.id
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item AND d.outbox_id IS NULL;
 IF v_bad<>0 THEN RAISE EXCEPTION 'P2_T06_AUDIT_DELIVERY_MISSING:%',v_bad; END IF;
 SELECT pg_catalog.count(*) INTO v_ack_pending FROM hft.custody_ack_status_v1 AS ack
 JOIN hft.stock_command AS c ON c.id=ack.issue_command_uuid
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item AND ack.state='ACK_PENDING';
 IF v_ack_pending<>2 THEN RAISE EXCEPTION 'P2_T06_CUSTODY_ACK_FABRICATED_OR_MISSING'; END IF;
 SELECT pg_catalog.coalesce(pg_catalog.sum(n.nonce_count),0) INTO v_nonce_count
 FROM hft.posting_nonce_audit_v1 AS n JOIN hft.stock_command AS c
 ON c.command_id=n.command_id AND c.legal_entity_id=n.legal_entity_id
 WHERE c.legal_entity_id=v_entity AND c.item_code=v_item;
 IF v_nonce_count<>5 THEN RAISE EXCEPTION 'P2_T06_NONCE_CARDINALITY_INVALID:%',v_nonce_count; END IF;
END $checks$;
SELECT 'P2_SEC_T06_AUDITOR_ASSERTIONS_PASS' AS result;
COMMIT;
