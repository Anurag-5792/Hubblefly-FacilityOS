-- P2-SEC-T05 A: deliberate gate hold; NOT RUN.
-- Requires authorized governance test login and preapproved synthetic scope.
\set ON_ERROR_STOP on
\if :{?gate_key}
\else
 \echo 'STOP P2_T05_NO_GATE_KEY'
 \quit
\endif
BEGIN;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 THEN RAISE EXCEPTION 'P2_T05_DISPOSABLE_REQUIRED'; END IF;
END $pre$;
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(:'gate_key',0));
SELECT 'A_GATE_LOCK_HELD' AS barrier,pg_catalog.pg_backend_pid(),pg_catalog.clock_timestamp();
SELECT pg_catalog.pg_sleep(6);
COMMIT;
-- B must execute while A holds the precise same scope gate.
-- Opposing source-document edits require a SECOND independently approved
-- governed editor session; do not use an unauthenticated SQL variable.
