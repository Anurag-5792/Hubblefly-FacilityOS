"""OPS-A2 PG18 consolidated candidate assembly and denial contracts.

Source validation only. No PostgreSQL connection, migration, DDL or role mutation.
"""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/'db/security'
TARGET=DIR/'HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql'
NAMES=('FOUNDATION','PROOF-AUTHORITY','WRITER','RESOLVER-READ')
STOP="OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED"
DDL=re.compile(r'(?im)^\s*(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TABLE|TRIGGER|VIEW|INDEX)|ALTER\s+TABLE|DROP\s+TRIGGER)\b')
FUNCTION=re.compile(r'(?i)CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(hft\.[\w]+)\s*\(')

def body(section: str)->str:
    marker=re.search(r'^BEGIN;\s*\nDO\s+(\$[\w]+\$)\s*\nBEGIN\s+RAISE EXCEPTION \''
      +STOP+r"';\s*END\s*\n?\1;\s*",section,re.M)
    if marker is None: raise AssertionError('missing exact source guard')
    assert re.search(r'\nCOMMIT;\s*$',section)
    return re.sub(r'\nCOMMIT;\s*$','\n',section[marker.end():])

class ConsolidatedForward(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql=TARGET.read_text(encoding='utf8')
        cls.sources=[(DIR/f'HFT-R1-OPS-A2-{n}-NONEXECUTABLE.sql').read_text(encoding='utf8')
                     for n in NAMES]

    def test_single_atomic_transaction_and_unconditional_guard(self):
        s=self.sql
        self.assertEqual(len(re.findall(r'^BEGIN;$',s,re.M)),1)
        self.assertEqual(len(re.findall(r'^COMMIT;$',s,re.M)),1)
        stop=s.index("RAISE EXCEPTION '"+STOP+"'")
        self.assertLess(stop,DDL.search(s).start())
        self.assertLess(s.index('BEGIN;'),stop)
        self.assertLess(stop,s.rindex('COMMIT;'))
        self.assertNotIn('GRANT EXECUTE ON FUNCTION hft.ops_a2_',s)

    def test_all_four_original_sources_exactly_preserved_in_order(self):
        s=self.sql
        prior=0
        for n,section in zip(NAMES,self.sources):
            start=s.index('-- ===== BEGIN SOURCE',prior)
            content=body(section)
            self.assertEqual(s[start:].count(content),1,n)
            self.assertLess(start,s.index(content,start))
            prior=s.index('-- ===== END SOURCE',start)
        self.assertEqual(s.count('-- ===== BEGIN SOURCE'),4)
        self.assertEqual(s.count('-- ===== END SOURCE'),4)

    def test_all_functions_present_once_and_ordered(self):
        canonical=[name for section in self.sources for name in FUNCTION.findall(body(section))]
        consolidated=FUNCTION.findall(self.sql)
        self.assertEqual(consolidated,canonical)
        self.assertEqual(len(consolidated),len(set(consolidated)))
        first=lambda name:self.sql.index('CREATE OR REPLACE FUNCTION '+name+'(')
        self.assertLess(first('hft.ops_a2_verify_invocation_v2'),
                        first('hft.ops_a2_post_stock_command_v2'))
        self.assertLess(first('hft.ops_a2_post_stock_command_v2'),
                        first('hft.ops_a2_resolve_authorized_v2'))

    def test_external_authority_is_not_implicitly_installed(self):
        s=self.sql
        self.assertNotIn('CREATE TABLE hft.stock_account(',s)
        self.assertNotIn('CREATE TABLE hft.stock_entry(',s)
        self.assertNotIn('CREATE ROLE ',s)
        self.assertNotIn('ALTER ROLE ',s)
        self.assertNotIn('SET ROLE ',s)
        self.assertIn("current_database() !~ '^hft_r1_disposable_",s)
        self.assertIn("session_user<>'hft_engineering'",s)
        self.assertIn('OPS_A2_HISTORICAL_CUTOVER_AND_SOURCE_NOT_QUALIFIED',s)
        for name in ('ops_a2_source_binding','ops_a2_transfer_document',
                     'ops_a2_post_stock_command_v2','ops_a2_reconcile_post_v2',
                     'ops_a2_read_authoritative_v2'):
            self.assertIn(name,s)

if __name__=='__main__':
    unittest.main()
