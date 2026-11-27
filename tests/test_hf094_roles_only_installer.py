"""Offline exact-byte and fail-closed source tests for HF094, no remote SQL."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hf094",ROOT/"tools/hft_roles_only_install_094.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Installer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest,cls.sql,cls.plan=mod.load_package()

    def test_exact_source_and_transaction(self):
        self.assertEqual(len(self.plan),6)
        ddl=mod.build_transaction(self.sql,self.plan,"a"*64,"b"*64,"2030-01-01T00:00:00Z")
        self.assertTrue(ddl.startswith("BEGIN ISOLATION LEVEL SERIALIZABLE;"))
        self.assertEqual(ddl.count("\nCOMMIT;"),1)
        self.assertEqual(ddl.count("INSERT INTO hft.schema_revision(version,sha256,applied_by)"),6)
        self.assertLess(ddl.index("HF094_INSTALLATION_NOT_ADMITTED"),ddl.index("CREATE ROLE hft_engineering"))
        self.assertLess(ddl.index("CREATE TABLE hft.employee"),ddl.index("CREATE TABLE hft_app_roles.identity_binding"))
        self.assertLess(ddl.index("HF094_POSTFLIGHT_TRIGGER_CONTRACT"),ddl.rindex("COMMIT;"))
        self.assertNotIn("CREATE SCHEMA hft_secret",ddl)
        self.assertNotIn("CREATE EXTENSION",ddl)
        self.assertNotIn("GRANT SELECT ON hft.stock",ddl)
        self.assertNotIn("INSERT INTO hft_app_roles.assignment(",ddl)
        self.assertIn("HF094_TARGET_NOT_FRESH_OR_ROLE_COLLISION",ddl)
        self.assertIn("HF094_ADMISSION_EXPIRED_BEFORE_COMMIT",ddl)
        self.assertEqual(ddl.count("CREATE ROLE "),3)

    def test_original_fence_and_audit_bodies_retained(self):
        original=(ROOT/"db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql").read_text()
        ddl=self.sql["20-role-assignment.sql"]
        a=original[original.index("CREATE SCHEMA hft_app_roles;"):original.index("-- QUAL077-LOCK-01:")]
        self.assertIn(a,ddl)
        dep=original[original.index("CREATE TRIGGER role_dependency_fence BEFORE"):original.index("-- Installer must own")]
        # The four dependency trigger bodies and two ENABLE ALWAYS statements are
        # retained, but placed under their actual canonical and role owners.
        for line in dep.splitlines():
            if line.strip() and not line.startswith("--"):
                self.assertIn(line,ddl)
        self.assertIn("RAISE EXCEPTION 'HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED'",original)
        self.assertNotIn("HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED",ddl)
        self.assertIn("HF094_INSTALLATION_NOT_ADMITTED",ddl)
        self.assertEqual(ddl.count("ENABLE ALWAYS TRIGGER"),9)

    def test_guard_fails_before_any_connection(self):
        with patch.object(mod,"sql_session",side_effect=AssertionError("network called")), \
             patch.object(mod,"transport",side_effect=AssertionError("transport called")), \
             patch.object(mod,"TECHNICAL_REVIEWER_PUBKEY_SHA256",""), \
             patch("sys.argv",["hf094","--apply"]):
            with self.assertRaisesRegex(RuntimeError,"INDEPENDENT_TECHNICAL_TRUST_NOT_ENROLLED"):
                mod.main()

    def test_lifetime_and_input_strictness(self):
        now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        fmt=lambda x:x.strftime("%Y-%m-%dT%H:%M:%SZ")
        rec={"issued_at":fmt(now-dt.timedelta(minutes=1)),"expires_at":fmt(now+dt.timedelta(minutes=1))}
        mod.lifetime(rec)
        for patch_values in ({"expires_at":fmt(now-dt.timedelta(seconds=1))},
                {"expires_at":fmt(now+dt.timedelta(days=2))},{"issued_at":"invalid"}):
            with self.assertRaises(RuntimeError):
                mod.lifetime({**rec,**patch_values})
        with self.assertRaisesRegex(RuntimeError,"DUPLICATE_JSON_KEY"):
            mod.strict_json(b'{"approved":false,"approved":true}')
        with self.assertRaises(RuntimeError):
            mod.build_transaction(self.sql,self.plan,"x","b"*64,rec["expires_at"])

    def test_byte_drift_detected(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/"file"
            p.write_bytes(b"original")
            p.chmod(0o600)
            self.assertEqual(mod.exact_bytes(p,mod.sha(b"original")),b"original")
            p.write_bytes(b"modified")
            with self.assertRaisesRegex(RuntimeError,"SHA256_MISMATCH"):
                mod.exact_bytes(p,mod.sha(b"original"))

    def test_catalog_explicit_runtime_principal_and_denials(self):
        s=self.sql["90-catalog-acl-postflight.sql"]
        self.assertIn("runtime_oid",s)
        self.assertIn("pg_has_role(installer_oid,runtime_oid,'SET')",s)
        self.assertIn("secret_schema", (ROOT/"lib/hft/roles/role-backend.ts").read_text())
        self.assertIn("to_regnamespace('hft_secret') IS NOT NULL",s)
        self.assertIn("has_function_privilege(runtime_oid",s)
        self.assertIn("HF094_POSTFLIGHT_EFFECTIVE_ACL",s)
        self.assertIn("jsonb_array_length(actual)<>9",s)
        self.assertIn("actual @> expected AND expected @> actual",s)


if __name__=="__main__":
    unittest.main()
