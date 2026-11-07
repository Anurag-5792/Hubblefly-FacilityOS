"""P2-M3 offline libpq endpoint refusals; NO PostgreSQL connection is made."""
from pathlib import Path
from unittest.mock import patch
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import hft_apply_migrations as m

class P2EndpointTests(unittest.TestCase):
    def setUp(self):
        self.env=dict(NODE_ENV="test",HFT_ENVIRONMENT="test",
            HFT_AUTH_SOURCE="verified",HFT_OPERATIONS_SOURCE="database",
            HFT_LIVE_POSTING_ENABLED="false",HFT_POSTING_RUN_MODE="ISOLATED_DB_TEST",
            PGHOST="127.0.0.1",PGPORT="54329",HFT_APPROVED_PG_PORT="54329",
            PGUSER="hft_engineering",PGDATABASE="hft_r1_disposable_synthetic",
            HFT_TEST_PG_DATABASE="hft_r1_disposable_synthetic")
    def test_expected_explicit_endpoint_contract(self):
        with patch.object(m.shutil,"which",return_value="/usr/bin/psql"):
            self.assertEqual(m.validate_environment(self.env),
                             ("hft_r1_disposable_synthetic","hft_engineering"))
    def test_ambient_pg_parameters_stop_before_connecting(self):
        with patch.object(m.shutil,"which",return_value="/usr/bin/psql"):
            for k,v in [("PGHOSTADDR","10.1.2.3"),("PGSERVICE","cloud"),
                ("PGSERVICEFILE","/tmp/other"),("PGOPTIONS","-c search_path=public"),
                ("PGTARGETSESSIONATTRS","prefer-standby")]:
                with self.subTest(parameter=k), self.assertRaisesRegex(RuntimeError,"AMBIENT_LIBPQ_ROUTING_FORBIDDEN"):
                    m.validate_environment({**self.env,k:v})
    def test_exact_approved_port_is_mandatory(self):
        with patch.object(m.shutil,"which",return_value="/usr/bin/psql"):
            for k,v in [("PGPORT",""),("PGPORT","5432"),("PGPORT","054329"),
                         ("PGPORT","65536"),("HFT_APPROVED_PG_PORT","5432")]:
                with self.subTest(parameter=k,value=v),self.assertRaisesRegex(RuntimeError,"EXACT_APPROVED_POSTGRES_PORT_REQUIRED"):
                    m.validate_environment({**self.env,k:v})
    def test_psql_uses_explicit_arguments_not_shell_or_ambient_hostaddr(self):
        captured=[]
        class SuccessfulProcess:
            returncode=0
            stdout="OK\n"
        def fake_run(argv,**kw):
            captured.append((argv,kw))
            return SuccessfulProcess()
        with patch.object(m.subprocess,"run",side_effect=fake_run):
            self.assertEqual(m.execute_sql("SELECT 1;",self.env),"OK")
        argv,kw=captured[0]
        self.assertEqual(argv[:8],["psql","-X","-h","127.0.0.1","-p","54329","-U","hft_engineering"])
        self.assertEqual(argv[8:10],["-d","hft_r1_disposable_synthetic"])
        self.assertFalse(kw.get("shell",False))
        self.assertEqual(kw["input"],"SELECT 1;")

if __name__=="__main__":unittest.main()
