-- P2-SEC-T03 — source contract, NOT RUN. MUST use approved runtime login
-- and DBA-provisioned TEST-only key/session/approval on disposable PG.
-- Inputs :payload_json and :valid_proof_json from controlled one-session
-- test evidence; never embed actual signing bytes in SQL, shell args or logs.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $guard$ BEGIN
 IF current_database() !~ '^hft_r1_disposable_[a-z0-9_]{6,40}$'
 THEN RAISE EXCEPTION 'P2_DISPOSABLE_ONLY'; END IF;
END $guard$;
-- Direct attacker claims must NOT be trusted by the protected writer.
SELECT pg_catalog.set_config('hft.actor_subject','FORGED',true);
-- The helper must never read the above value as authentication.
-- Separate fixture cases to submit to the sole writer and REQUIRE rejection:
-- T03a JSON `actorSubject` changed without MAC update (bad HMAC).
-- T03b signed actor valid but missing/expired/revoked posting_session.
-- T03c JSON payload amount 2 -> 4 after MAC is signed.
-- T03d one-time `(keyVersion,nonce)` reused after committed post.
-- T03e expired/future issuedAt or key revoked/rotated.
-- T03f unauthorized login/SET ROLE owner attempt (T02).
-- For T03a-c/e, authorized harness must catch the expected exception and
-- check command, nonce, account, custody, and audit unchanged at ROLLBACK.
-- T03d needs a separate COMMITTED first invocation and same replay proof.
ROLLBACK;
