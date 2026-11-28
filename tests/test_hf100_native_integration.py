import importlib.util, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location("hf100_native",ROOT/"tools/hf100-native-transport/native-guarded.py")
n=importlib.util.module_from_spec(s);s.loader.exec_module(n)
class NativeTests(unittest.TestCase):
    def test_compiler_and_frozen_assembly(self):
        t=n.h.v1.TARGET
        statements=n.compile_transaction("BEGIN READ ONLY;\nSELECT 'a;b';\nCOMMIT;",t)
        self.assertEqual(statements[0],"SET TRANSACTION READ ONLY")
        self.assertIn("HF100_TARGET_IDENTITY_DENIED",statements[2])
        self.assertEqual(statements[-1],"SELECT 'a;b';")
        _,sql,plan=n.h.inspect()
        original=n.h.v1.build_transaction(sql,plan,"a"*64,"b"*64,"2026-12-01T00:00:00Z")
        compiled=n.compile_transaction(original,t)
        self.assertGreater(len(compiled),240)
        self.assertEqual(sum("INSERT INTO hft.schema_revision" in x for x in compiled),6)
        self.assertTrue(any(n.MARKER in x for x in compiled))
        for invalid in ("BEGIN;\nSELECT 1;\nCOMMIT;","BEGIN READ ONLY;\nCOMMIT;\nCOMMIT;"):
            with self.assertRaises(RuntimeError):n.compile_transaction(invalid,t)
    def test_strict_connector_results(self):
        good={"data":[{"rows":[],"totalRowCount":0,"truncated":False},{"rows":[{"v":"pass"}],"totalRowCount":1,"truncated":False}]}
        self.assertEqual(n.result_lines(good,2),"pass")
        for bad in ({"data":[]},{"data":[{"rows":[],"totalRowCount":1,"truncated":False}]},{"data":[{"rows":[{"a":"b","c":"d"}],"totalRowCount":1,"truncated":False}]},{"data":[{"rows":[],"totalRowCount":0,"truncated":True}]}):
            with self.assertRaises(RuntimeError):n.result_lines(bad,2 if not bad["data"] else 1)
    def test_native_adapter_exact_provider_selectors(self):
        t=n.h.v1.TARGET
        ep={"id":t["endpoint"],"project_id":t["project"],"branch_id":t["branch"],"host":t["host"],"disabled":False,"type":"read_write"}
        db={"id":860001,"branch_id":t["branch"],"name":t["database"],"owner_name":t["installer"]}
        called=[]
        def transact(payload):
            called.append(payload);return {"data":[{"rows":[],"totalRowCount":0,"truncated":False} for _ in payload["sql_statements"]]}
        p=n.NativePg(t,860001,lambda *args:(ep,[db]),transact)
        self.assertEqual(p.exec("BEGIN READ ONLY;\nSELECT 1;\nCOMMIT;"),"")
        self.assertEqual({k:called[0][k] for k in ("project_id","branch_id","compute_id","database_name","role_name")},{"project_id":t["project"],"branch_id":t["branch"],"compute_id":t["endpoint"],"database_name":t["database"],"role_name":t["installer"]})
        ep["branch_id"]="wrong"
        with self.assertRaises(RuntimeError):p.exec("BEGIN READ ONLY;\nSELECT 1;\nCOMMIT;")
        self.assertEqual(len(called),1)
    def test_unsigned_does_not_reach_provider(self):
        with self.assertRaises(Exception):n.apply_native(raw=b"{}",contract=b"{}",signature=b"",receipt_key=b"",control_drive=None,custody_drive=None,github_read=lambda *_:self.fail("GitHub reached"),provider_read=lambda *_:self.fail("provider reached"),transact=lambda *_:self.fail("SQL reached"),recovery_read=lambda:self.fail("recovery reached"))
if __name__=="__main__":unittest.main()
