-- P2-SEC-T04 posting-first B: independent governance issuer, NOT RUN.
-- Run while posting A is paused. Expect exact SQLSTATE 55P03. Afterwards
-- A must commit, then run a separate new transaction to insert the Hold.
\set ON_ERROR_STOP on
\if :{?entity_id}
\else
 \echo 'STOP T04_POST_B_NO_ENTITY'
 \quit
\endif
\if :{?hold_id}
\else
 \echo 'STOP T04_POST_B_NO_HOLD'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT pg_catalog.set_config('hft.t04.entity',:'entity_id',true);
SELECT pg_catalog.set_config('hft.t04.hold',:'hold_id',true);
SET LOCAL lock_timeout = '1200ms';
DO $blocked$
DECLARE code text;detail text;
BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user OR
 NOT pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 THEN RAISE EXCEPTION 'P2_T04_REAL_GOVERNED_LOGIN_REQUIRED'; END IF;
 BEGIN
  INSERT INTO hft.posting_parent_hold
  (legal_entity_id,hold_id,scope_kind,site_id,active,hold_purpose,reason,placed_by)
  VALUES(pg_catalog.current_setting('hft.t04.entity'),
   pg_catalog.current_setting('hft.t04.hold'),'ENTITY',NULL,true,
   'SAFETY','Synthetic posting-first Hold race','GOV-TEST-ACTOR');
  RAISE EXCEPTION 'P2_T04_HOLD_BYPASSED_POSTING_GATE';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,detail=MESSAGE_TEXT;
  IF code<>'55P03' OR detail='P2_T04_HOLD_BYPASSED_POSTING_GATE'
  THEN RAISE EXCEPTION 'P2_T04_WRONG_HOLD_BARRIER_RESULT:%:%',code,detail; END IF;
 END;
END $blocked$;
ROLLBACK;
\prompt 'After A_COMMIT confirmed type COMMITTED: ' t04_post_committed
SELECT 1 / CASE WHEN :'t04_post_committed'='COMMITTED' THEN 1 ELSE 0 END
 AS posting_commit_barrier;
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO hft.posting_parent_hold
(legal_entity_id,hold_id,scope_kind,site_id,active,hold_purpose,reason,placed_by)
VALUES(:'entity_id',:'hold_id','ENTITY',NULL,true,'SAFETY',
 'Synthetic posting-first Hold race','GOV-TEST-ACTOR');
COMMIT;
SELECT 'T04_POSTING_FIRST_HOLD_APPLIED_AFTER_COMMAND' AS outcome;
-- Independent auditor must confirm posting first, Hold second, no partial B.
-- A subsequent freshly signed posting against the scope must be denied.
