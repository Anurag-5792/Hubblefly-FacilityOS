"""Offline SQL/source contract checks. These are NOT PostgreSQL acceptance tests."""
import hashlib
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'db/migrations/0006_hft_posted_fact_integrity.sql').read_text()
MANIFEST=json.loads((ROOT/'db/migrations/manifest.v1.json').read_text())
ORIGINAL=(ROOT/'db/provenance/superseded-0006-hft-posted-fact-integrity.sql').read_text()

def fn_block(name):
    match=re.search(rf'CREATE OR REPLACE FUNCTION hft\.{name}\(.*?END \$\$;',SQL,re.S)
    if not match:
        raise AssertionError('missing function '+name)
    return match.group(0)

class Correct001Contract(unittest.TestCase):
    def test_canonical_v6_digest_and_immutable_history(self):
        self.assertEqual(len(MANIFEST['migrations']),6)
        self.assertEqual([x['version'] for x in MANIFEST['migrations']],list(range(1,7)))
        self.assertEqual(MANIFEST['migrations'][-1]['file'],'0006_hft_posted_fact_integrity.sql')
        self.assertEqual(MANIFEST['migrations'][-1]['sha256'], hashlib.sha256(SQL.encode()).hexdigest())
        self.assertEqual(hashlib.sha256(ORIGINAL.encode()).hexdigest(),
             'f6b92c89468b59b596dad6fa27453f78ccfeb3a2c578ed6d125cde54bbf5f371')
    def test_h3_exact_bijection_is_not_exists_matching(self):
        f=fn_block('assert_command_seal_v1')
        self.assertIn('WITH ORDINALITY',f)
        self.assertIn('FULL JOIN outcome_legs',f)
        self.assertIn('USING(leg_ordinal)',f)
        self.assertIn('POSTED_OUTCOME_MOVEMENT_BIJECTION_FAILED',f)
        self.assertNotIn('OR NOT EXISTS(',f)
        self.assertIn('POSTED_OUTCOME_SOURCE_ACTOR_OR_SCOPE_MISMATCH',f)
        self.assertIn('POSTED_OUTCOME_HISTORICAL_BALANCE_OR_VERSION_MISMATCH',f)
        self.assertIn("a.canonical_event->'accountVersion'",f)
    def test_readonly_assertion_has_no_row_or_advisory_locks(self):
        f=fn_block('assert_command_seal_v1')
        self.assertNotRegex(f,r'FOR\s+(UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)')
        self.assertNotIn('pg_advisory_xact_lock',f)
        self.assertIn("SELECT * INTO available_identity",f)
        verifier=(ROOT/'tools/hft_verify_quantitative_accounts.sql').read_text()
        self.assertIn('REPEATABLE READ READ ONLY',verifier)
        self.assertIn('SELECT hft.assert_command_seal_v1(id)',verifier)
        self.assertIn('SELECT hft.assert_grn_receipt_cumulative_v2(id)',verifier)
    def test_posting_retains_locks_and_immutable_historic_snapshot(self):
        locks=fn_block('lock_seal_posting_dependencies_v2')
        self.assertIn('FOR UPDATE',locks)
        self.assertIn('FOR SHARE',locks)
        seal=fn_block('seal_stock_command_v1')
        self.assertIn('hft.lock_seal_posting_dependencies_v2(p_id)',seal)
        self.assertIn('available_now.qty_micro',seal)
        self.assertIn('available_now.version',seal)
        self.assertIn('available_now.id',seal)
        deferred=fn_block('require_stock_command_seal_v1')
        self.assertIn('hft.lock_seal_posting_dependencies_v2(NEW.id)',deferred)
        self.assertIn('hft.assert_command_seal_v1(NEW.id)',deferred)
        self.assertIn('immutable_stock_command_seal_v1',SQL)
    def test_h4_original_accepted_immutability_unchanged(self):
        left='CREATE OR REPLACE FUNCTION hft.deny_stock_account_identity_change_v1()'
        right='-- The seal belongs to ONE immutable posting command'
        self.assertEqual(ORIGINAL.split(left,1)[1].split(right,1)[0],
                         SQL.split(left,1)[1].split(right,1)[0])
    def test_h5_cumulative_lines_and_status_enforced_at_commit(self):
        f=fn_block('assert_grn_receipt_cumulative_v2')
        self.assertIn('SUM(c.quantity_micro)',f)
        self.assertIn('li.accepted_micro::numeric<>li.posted_micro',f)
        self.assertIn('GRN_ACCEPTED_QTY_NOT_BACKED_BY_POSTED_RECEIPTS',f)
        self.assertIn('g.status',f)
        self.assertIn('GRN_STATUS_NOT_BACKED_BY_CUMULATIVE_RECEIPTS',f)
        self.assertIn('c.quantity_micro<>r.accepted_micro',f)
        self.assertIn("r.qc_state<>'ACCEPTED'",f)
        for name in ('grn_line_requires_posted_receipts_v2','grn_header_requires_posted_receipts_v2',
                     'physical_receipt_requires_posting_consistency_v2','stock_command_receipt_counter_v2'):
            self.assertRegex(SQL,re.compile(rf'CREATE CONSTRAINT TRIGGER {name}\s+AFTER .*?DEFERRABLE INITIALLY DEFERRED',re.S))
    def test_authored_sql_positive_and_negative_scenarios(self):
        directory=ROOT/'tests/pg'
        for name in ('hft_r1_p1_qa_outcome_negative.sql','hft_r1_p1_qa_readonly_receive_issue.sql',
                     'hft_r1_p1_qa_grn_partial_receipts.sql'):
            self.assertTrue((directory/name).is_file(),name)
        neg=(directory/'hft_r1_p1_qa_outcome_negative.sql').read_text()
        for value in ('DUPLICATED_LEG','MISSING_LEG','WRONG_ACTION','WRONG_SOURCE',
                      'WRONG_ACTOR','FABRICATED_AVAILABLE','WRONG_VERSION'):
            self.assertIn(value,neg)
        ro=(directory/'hft_r1_p1_qa_readonly_receive_issue.sql').read_text()
        self.assertIn('REPEATABLE READ READ ONLY',ro)
        self.assertIn('CMD-ISSUE-P1',ro)
        self.assertIn('old_post<>5000000',ro)
        h5=(directory/'hft_r1_p1_qa_grn_partial_receipts.sql').read_text()
        self.assertIn('H5-DEL-2',h5)
        self.assertIn('H5-DEL-3',h5)
        self.assertIn('UNBACKED_ACCEPTANCE_COUNTER_WAS_ALLOWED',h5)
        self.assertIn('SET CONSTRAINTS ALL IMMEDIATE',h5)
        self.assertIn('POSTED_RECEIPT_IMMUTABLE',h5)

if __name__=='__main__': unittest.main()
