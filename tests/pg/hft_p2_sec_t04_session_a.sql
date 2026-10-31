-- P2-SEC-T04 Hold-first A: governance issuer blocks a scope, NOT RUN.
-- Launch B only after A_HOLD_GATE_HELD. A remains open until explicit release.
\set ON_ERROR_STOP on
\if :{?entity_id}
\else
 \echo 'STOP T04_A_NO_ENTITY'
 \quit
\endif
\if :{?hold_id}
\else
 \echo 'STOP T04_A_NO_HOLD_ID'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_governance_issuer','MEMBER')
 THEN RAISE EXCEPTION 'P2_T04_GOVERNED_LOGIN_REQUIRED'; END IF;
END $pre$;
INSERT INTO hft.posting_parent_hold
(legal_entity_id,hold_id,scope_kind,site_id,active,hold_purpose,
 reason,placed_by)
VALUES(:'entity_id',:'hold_id','ENTITY',NULL,true,'SAFETY',
 'Synthetic parent Hold race','GOV-TEST-ACTOR');
SELECT 'A_HOLD_GATE_HELD' AS barrier,pg_catalog.pg_backend_pid();
\prompt 'After B has reported lock denial type RELEASE: ' t04_release
SELECT 1 / CASE WHEN :'t04_release'='RELEASE' THEN 1 ELSE 0 END AS barrier_acknowledged;
COMMIT;
SELECT 'T04_A_HOLD_COMMITTED' AS barrier;
