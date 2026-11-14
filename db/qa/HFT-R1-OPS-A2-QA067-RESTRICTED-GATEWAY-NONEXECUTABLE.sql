-- HFT OPS-A2 QA067 GATEWAY — SOURCE CANDIDATE ONLY; NO INSTALLATION.
-- This gateway CANNOT execute stock postings or construct privileged faults.
-- Positive/negative exercise requests are queued for a separately authorized
-- fault constructor; a request is never evidence that the fault occurred.
BEGIN;
DO $STOP_QA067_GATEWAY$ BEGIN
 RAISE EXCEPTION 'HFT_QA067_GATEWAY_PROTECTED_INSTALLATION_HOLD';
END $STOP_QA067_GATEWAY$;

CREATE SCHEMA hft_qa067;
REVOKE ALL ON SCHEMA hft_qa067 FROM PUBLIC;

-- Independently admitted exact fixture registry. Ordinary QA has no DML.
CREATE TABLE hft_qa067.fixture_v1(
 fixture_id uuid PRIMARY KEY,
 case_id text NOT NULL CHECK(case_id IN (
  'OPS063-F01','OPS063-F02','OPS063-F03','OPS063-F04',
  'OPS063-F05','OPS063-F06','OPS063-F07','OPS063-F08')),
 qa_login name NOT NULL,
 legal_entity_id text NOT NULL,
 site_id text NOT NULL,
 warehouse_id text NOT NULL,
 item_code text NOT NULL,
 product_version_code text NOT NULL,
 original_command_uuid uuid NOT NULL,
 source_account_uuid uuid NOT NULL,
 destination_account_uuid uuid NOT NULL,
 approved_source_sha256 text NOT NULL CHECK(approved_source_sha256~'^[0-9a-f]{64}$'),
 approved_migration_sha256 text NOT NULL CHECK(approved_migration_sha256~'^[0-9a-f]{64}$'),
 independent_admission_sha256 text NOT NULL CHECK(independent_admission_sha256~'^[0-9a-f]{64}$'),
 positive_commit_sha256 text NOT NULL CHECK(positive_commit_sha256~'^[0-9a-f]{64}$'),
 independent_prestate_sha256 text NOT NULL CHECK(independent_prestate_sha256~'^[0-9a-f]{64}$'),
 admitted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK(admitted_at<expires_at),
 UNIQUE(case_id,fixture_id),
 FOREIGN KEY(original_command_uuid) REFERENCES hft.stock_command(id),
 FOREIGN KEY(source_account_uuid) REFERENCES hft.stock_account(id),
 FOREIGN KEY(destination_account_uuid) REFERENCES hft.stock_account(id)
);
REVOKE ALL ON hft_qa067.fixture_v1 FROM PUBLIC;

-- This table is a REQUEST queue, not the asserted result. Separate technical
-- installer grants determine which login may append requests.
CREATE TABLE hft_qa067.exercise_request_v1(
 request_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 fixture_id uuid NOT NULL REFERENCES hft_qa067.fixture_v1(fixture_id),
 case_id text NOT NULL,
 requested_by name NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 backend_pid integer NOT NULL,
 UNIQUE(fixture_id,case_id),
 FOREIGN KEY(case_id,fixture_id) REFERENCES hft_qa067.fixture_v1(case_id,fixture_id)
);
REVOKE ALL ON hft_qa067.exercise_request_v1 FROM PUBLIC;

CREATE OR REPLACE FUNCTION hft_qa067.observe_case_v1(
 p_case text,p_fixture uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $qa_observe$
DECLARE
 f hft_qa067.fixture_v1%ROWTYPE;
 observed_accounts jsonb;
 observed_legs jsonb;
 observed_command jsonb;
 observed_audit jsonb;
BEGIN
 IF p_case NOT IN ('OPS063-F01','OPS063-F02','OPS063-F03','OPS063-F04',
  'OPS063-F05','OPS063-F06','OPS063-F07','OPS063-F08')
 OR pg_catalog.current_setting('transaction_read_only')<>'on'
 OR pg_catalog.current_setting('transaction_isolation')<>'repeatable read'
 OR pg_catalog.current_setting('server_version_num')::integer<>180006
 OR pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_fault_constructor','MEMBER')
 THEN RAISE EXCEPTION 'HFT_QA067_OBSERVER_READ_ONLY_ROLE_OR_VERSION_REQUIRED'; END IF;
 SELECT * INTO f FROM hft_qa067.fixture_v1
 WHERE fixture_id=p_fixture AND case_id=p_case
 AND qa_login=session_user
 AND admitted_at<=pg_catalog.clock_timestamp()
 AND expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'HFT_QA067_FIXTURE_NOT_ADMITTED_FOR_LOGIN';
 END IF;
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'accountId',a.id,'quantity',a.qty_micro,'reserved',a.reserved_micro,
  'version',a.version,'location',a.location_key,
  'condition',a.condition) ORDER BY a.id)
 INTO observed_accounts FROM hft.stock_account a
 WHERE a.id IN(f.source_account_uuid,f.destination_account_uuid)
 AND a.legal_entity_id=f.legal_entity_id
 AND a.site_id=f.site_id AND a.warehouse_id=f.warehouse_id
 AND a.item_code=f.item_code
 AND a.product_version_code=f.product_version_code;
 IF pg_catalog.jsonb_array_length(
  pg_catalog.coalesce(observed_accounts,'[]'::jsonb))<>2
 THEN RAISE EXCEPTION 'HFT_QA067_ACCOUNT_SOURCE_NOT_EXACT'; END IF;
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'entryId',e.id,'commandId',e.command_id,
  'accountId',e.account_id,'bucket',e.bucket,'delta',e.qty_delta_micro)
  ORDER BY e.id)
 INTO observed_legs FROM hft.stock_entry e
 WHERE e.command_id=f.original_command_uuid;
 SELECT pg_catalog.to_jsonb(c) INTO observed_command
 FROM hft.stock_command c WHERE c.id=f.original_command_uuid
 AND c.legal_entity_id=f.legal_entity_id
 AND c.site_id=f.site_id AND c.warehouse_id=f.warehouse_id
 AND c.item_code=f.item_code;
 IF observed_command IS NULL
 THEN RAISE EXCEPTION 'HFT_QA067_ORIGINAL_COMMAND_SCOPE_INVALID'; END IF;
 -- F07 positive-control identity: a genuine one-character numeric BIGINT ID
 -- belongs to the exact original command and is not a foreign-scope alias.
 IF p_case='OPS063-F07' AND NOT EXISTS(
  SELECT 1 FROM hft.stock_entry e
  WHERE e.id BETWEEN 1 AND 9
  AND e.command_id=f.original_command_uuid
  AND EXISTS(SELECT 1 FROM hft.stock_command c
   WHERE c.id=e.command_id AND c.legal_entity_id=f.legal_entity_id
   AND c.site_id=f.site_id AND c.warehouse_id=f.warehouse_id
   AND c.item_code=f.item_code))
 THEN RAISE EXCEPTION 'HFT_QA067_F07_ORIGINAL_SHORT_ID_SCOPE_MISSING'; END IF;
 SELECT pg_catalog.to_jsonb(a) INTO observed_audit
 FROM hft.audit_outbox a WHERE a.command_id=f.original_command_uuid;
 IF observed_audit IS NULL
 THEN RAISE EXCEPTION 'HFT_QA067_ORIGINAL_AUDIT_MISSING'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'status','DATABASE_OBSERVATION_ONLY_NOT_ACCEPTANCE',
  'case_id',p_case,'fixture_id',p_fixture,
  'session_user',session_user,'current_user',current_user,
  'backend_pid',pg_catalog.pg_backend_pid(),
  'database',pg_catalog.current_database(),
  'server_version_num',pg_catalog.current_setting('server_version_num')::integer,
  'snapshot',pg_catalog.txid_current_snapshot()::text,
  'observed_epoch',pg_catalog.extract(epoch FROM pg_catalog.clock_timestamp()),
  'account_facts',observed_accounts,'movement_facts',observed_legs,
  'original_command',observed_command,'original_audit',observed_audit,
  'admission_sha256',f.independent_admission_sha256,
  'positive_commit_sha256',f.positive_commit_sha256,
  'original_prestate_sha256',f.independent_prestate_sha256);
END $qa_observe$;

CREATE OR REPLACE FUNCTION hft_qa067.exercise_case_v1(
 p_case text,p_fixture uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $qa_exercise$
DECLARE f hft_qa067.fixture_v1%ROWTYPE; queued uuid;
BEGIN
 -- A bounded dispatch request is not protected stock execution.
 IF p_case NOT IN ('OPS063-F01','OPS063-F02','OPS063-F03','OPS063-F04',
   'OPS063-F05','OPS063-F06','OPS063-F07','OPS063-F08')
 OR pg_catalog.current_setting('transaction_read_only')<>'off'
 OR pg_catalog.pg_has_role(session_user,'hft_r1_posting_owner','MEMBER')
 OR pg_catalog.pg_has_role(session_user,'hft_r1_fault_constructor','MEMBER')
 THEN RAISE EXCEPTION 'HFT_QA067_REQUEST_ROLE_OR_TRANSACTION_INVALID'; END IF;
 SELECT * INTO f FROM hft_qa067.fixture_v1
 WHERE fixture_id=p_fixture AND case_id=p_case
 AND qa_login=session_user
 AND admitted_at<=pg_catalog.clock_timestamp()
 AND expires_at>pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'HFT_QA067_FIXTURE_NOT_ADMITTED_FOR_LOGIN'; END IF;
 INSERT INTO hft_qa067.exercise_request_v1(
  fixture_id,case_id,requested_by,backend_pid)
 VALUES(p_fixture,p_case,session_user,pg_catalog.pg_backend_pid())
 ON CONFLICT(fixture_id,case_id) DO NOTHING
 RETURNING request_id INTO queued;
 IF queued IS NULL THEN
  SELECT request_id INTO queued FROM hft_qa067.exercise_request_v1
  WHERE fixture_id=p_fixture AND case_id=p_case
    AND requested_by=session_user;
 END IF;
 IF queued IS NULL THEN RAISE EXCEPTION 'HFT_QA067_REQUEST_ORIGIN_CONFLICT'; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'case_id',p_case,'fixture_id',p_fixture,'request_id',queued,
  'backend_pid',pg_catalog.pg_backend_pid(),
  'status','PENDING_INDEPENDENT_FAULT_CONSTRUCTION_NOT_EXECUTED');
END $qa_exercise$;

-- No grants here. A separate independently signed installation ACL must:
-- 1. Own the schema/functions under a nonlogin restricted QA owner.
-- 2. Grant only exact EXECUTE to the admitted disposable QA role.
-- 3. Grant neither protected DML, posting-owner membership nor role switch.
-- 4. Keep fixture INSERT and qualification-signature verification installer-only.
REVOKE ALL ON FUNCTION hft_qa067.observe_case_v1(text,uuid),
 hft_qa067.exercise_case_v1(text,uuid) FROM PUBLIC;
COMMIT;
