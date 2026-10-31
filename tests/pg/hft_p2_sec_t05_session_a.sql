-- P2-SEC-T05 session A: deterministic human-operated gate barrier, NOT RUN.
-- Start A first; launch B only after A_GATE_HELD is displayed. Do not use
-- fixed pg_sleep to guess lock ownership. gate_key must be exact HFT:GATE:...
\set ON_ERROR_STOP on
\if :{?gate_key}
\else
 \echo 'STOP T05_A_MISSING_EXACT_SCOPE_GATE'
 \quit
\endif
BEGIN;
DO $pre$
BEGIN
 IF pg_catalog.current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 THEN RAISE EXCEPTION 'P2_T05_DISPOSABLE_ONLY'; END IF;
END $pre$;
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(:'gate_key',0));
SELECT 'A_GATE_HELD' AS barrier,pg_catalog.pg_backend_pid() AS backend;
\prompt 'After B produces its timeout/serialization result type RELEASE: ' t05_release
SELECT 1 / CASE WHEN :'t05_release'='RELEASE' THEN 1 ELSE 0 END AS barrier_acknowledged;
COMMIT;
SELECT 'T05_A_GATE_RELEASED' AS barrier;
