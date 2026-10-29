-- P2-SEC-T06: authorized synthetic positive fragments and exactly-once.
-- NOT RUN. Fixture issuer supplies six distinct MAC-protected payload/proof
-- pairs after qualified human approvals, active policy/roles, and stock count.
-- Use REAL restricted LOGIN. Execute each command in its own transaction.
\set ON_ERROR_STOP on
\if :{?receive_payload}
\else
 \echo 'STOP P2_T06_NO_AUTHORIZED_FIXTURE'
 \quit
\endif
\if :{?receive_proof}
\else
 \echo 'STOP P2_T06_NO_PROOF'
 \quit
\endif
BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $pre$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 OR current_user<>session_user
 OR NOT pg_catalog.pg_has_role(session_user,'hft_r1_app_runtime','MEMBER')
 THEN RAISE EXCEPTION 'P2_T06_RESTRICTED_RUNTIME_REQUIRED'; END IF;
END $pre$;
SELECT hft.post_stock_command_protected_v1(:'receive_payload'::jsonb,
 : 'receive_proof'::jsonb);
COMMIT;
-- Subsequent independent committed calls must be issued by fixture runner:
-- ISSUE-A 2, ISSUE-B 3 (distinct fragment+approval+nonce), RETURN-A1 1,
-- RETURN-A2 1, then attempt ISSUE-C 1 and RETURN-A3 1 as denied negatives.
-- A real verifier must prove account/custody source ceilings and one
-- command/seal/outbox/nonce for each committed positive; no double movement.
-- The fixture runner must record SQLSTATE and durable readback after each
-- separate COMMIT. Never automatically retry an uncertain outcome.
