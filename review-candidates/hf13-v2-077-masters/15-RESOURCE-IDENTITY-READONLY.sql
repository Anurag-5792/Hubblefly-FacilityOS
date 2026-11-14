-- HF13-V2-077 resource identity capture. READ-ONLY ONLY.
-- Run only AFTER independent new-project creation authorization; executing this
-- query is NOT authorization to install roles, extensions, protected P3 or stock.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT
 current_database() AS sql_database,
 session_user AS sql_session_login,
 current_user AS effective_sql_role,
 current_setting('server_version') AS server_version,
 current_setting('server_version_num')::integer AS server_version_num,
 inet_server_addr()::text AS backend_address,
 inet_server_port()::integer AS backend_port,
 pg_is_in_recovery() AS read_replica,
 tls.ssl AS backend_tls,
 tls.version AS backend_tls_version,
 tls.cipher AS backend_tls_cipher,
 clock_timestamp() AS observed_at
FROM pg_stat_ssl tls WHERE tls.pid=pg_backend_pid();
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,
 rolreplication,rolbypassrls,rolinherit
FROM pg_roles WHERE rolname IN
 ('hft_r1_retained_admin','hft_engineering','hft_r1_p3_master_owner',
 'hft_r1_p3_master_runtime','hft_r1_retained_p3_login',
 'hft_r1_posting_owner','hft_r1_governance_issuer','hft_r1_audit_verify')
ORDER BY rolname;
COMMIT;
-- The above SQL cannot attest DNS/TLS peer certificate, provider project ID,
-- Neon branch ID, compute ID or independent billing authorization.
-- Correlate all with provider API response, actual verified client TLS chain
-- and cryptographically signed external resource admission.
