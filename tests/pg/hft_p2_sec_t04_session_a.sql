-- P2-SEC-T04 A: governed parent Hold placement. NOT RUN.
-- Requires separately authorized governance LOGIN/qualified placement policy.
-- Use a UNIQUE synthetic hold id and scope from the approved fixture.
-- Barrier: start this session FIRST; begin B only after 'A_GATE_HELD'.
\set ON_ERROR_STOP on
\if :{?entity_id}
\else
 \echo 'STOP P2_T04_NO_ENTITY'
 \quit
\endif
\if :{?hold_id}
\else
 \echo 'STOP P2_T04_NO_HOLD_ID'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 THEN RAISE EXCEPTION 'P2_T04_DISPOSABLE_REQUIRED'; END IF;
END $pre$;
INSERT INTO hft.posting_parent_hold
(legal_entity_id,hold_id,scope_kind,site_id,active,reason,placed_by)
VALUES(:'entity_id',:'hold_id','ENTITY',NULL,true,
 'Synthetic parent Hold race','GOV-TEST-ACTOR');
SELECT 'A_GATE_HELD' AS barrier,pg_catalog.pg_backend_pid() AS backend,
 pg_catalog.clock_timestamp() AS lock_time;
SELECT pg_catalog.pg_sleep(5);
COMMIT;
-- B must be executed AFTER this session reports committed Hold.
-- For concurrent lock-timeout case, run B DURING the sleep and assert
-- SQLSTATE 55P03/40P01/40001 without partial facts; use a NEW proof after A.
