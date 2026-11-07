-- P2-SEC-T04 posting-first A. Signed runtime posting occurs FIRST,
-- before parent Hold placement. NOT RUN, must use fresh synthetic proof.
\set ON_ERROR_STOP on
\if :{?post_payload}
\else
 \echo 'STOP T04_POST_A_NO_PAYLOAD'
 \quit
\endif
\if :{?post_proof}
\else
 \echo 'STOP T04_POST_A_NO_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hft.post_stock_command_protected_v1(:'post_payload'::jsonb,:'post_proof'::jsonb)
 AS original_posting_result;
SELECT 'A_POSTING_FIRST_GATE_HELD' AS barrier,pg_catalog.pg_backend_pid();
\prompt 'After B confirms gated Hold timeout type RELEASE: ' t04_post_release
SELECT 1 / CASE WHEN :'t04_post_release'='RELEASE' THEN 1 ELSE 0 END
 AS barrier_acknowledged;
COMMIT;
SELECT 'T04_POSTING_FIRST_COMMITTED' AS barrier;
