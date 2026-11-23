"""Source-only production R1 contract checks. No database installation or user enrollment."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class LiveR1Source(unittest.TestCase):
    def read(self, name):
        return (ROOT / name).read_text(encoding="utf-8")

    def test_distinct_production_profile(self):
        s = self.read("lib/hft/live/live-profile.ts")
        for value in ("HFT_R1_PRODUCTION_LIVE_MASTERS_V1", "production-qualification",
                      "HFT_LIVE_R1_BACKUP_RESTORE_SHA256", "HFT_LIVE_R1_OIDC_ADMISSION_SHA256",
                      "HFT_LIVE_R1_TARGET_ADMISSION_SHA256", "rejectUnauthorized:true",
                      "hft_r1_retained_masters_np077"):
            self.assertIn(value, s)
        self.assertNotIn("retained-nonproduction'", s)

    def test_no_stock_or_p3_operations_in_live_service(self):
        s = self.read("lib/hft/live/live-service.ts")
        self.assertIn("hft_live_r1.save_v1", s)
        self.assertIn("LIVE_R1_COMMITTED_READBACK_REQUIRED_NO_RETRY", s)
        self.assertNotRegex(s, r"(?i)INSERT INTO hft\\.|UPDATE hft\\.|DELETE FROM hft\\.")
        self.assertNotIn("ops_a2_operator_post", s)
        self.assertNotIn("P3_APPROVED", s)

    def test_sql_is_guarded_by_dedicated_database_and_owners(self):
        a = self.read("db/live/0001_live_r1_records.sql")
        b = self.read("db/live/0002_live_r1_gateway.sql")
        for s in (a,b):
            self.assertIn("current_database() !~ '^hft_r1_live_", s)
            self.assertIn("current_user", s)
            self.assertIn("hft_r1_live_owner", s)
            self.assertIn("BEGIN;",s)
            self.assertIn("COMMIT;",s)
            self.assertNotRegex(s, r"(?im)^\\s*(?:DROP\\s+(?:SCHEMA|TABLE)|TRUNCATE\\s+hft\\.)")
        self.assertIn("RECORDED_UNAPPROVED", a)
        self.assertIn("ENABLE ALWAYS TRIGGER immutable_audit", a)
        self.assertIn("ENABLE ALWAYS TRIGGER record_requires_audit", a)
        self.assertIn("FOR UPDATE", b)
        self.assertIn("REVISION_CONFLICT", b)
        self.assertIn("GRANT EXECUTE ON FUNCTION hft_live_r1.save_v1", b)
        self.assertNotIn("GRANT ALL",b)
        self.assertNotIn("GRANT UPDATE ON hft.", b)
        self.assertNotIn("GRANT INSERT ON hft.", b)

    def test_oidc_binds_verified_provider_subject_and_no_default_owner(self):
        s = self.read("lib/hft/live/live-oidc.ts")
        self.assertIn("email_verified",s)
        self.assertIn("claims.sub!==actor.providerSubject",s)
        self.assertIn("HFT_LIVE_R1_OIDC_APPROVED_ACTORS_JSON",s)
        self.assertNotIn("Rishabh",s)
        self.assertNotIn("Anurag",s)
        self.assertNotIn("support@example",s)

    def test_browser_and_api_do_not_enable_protected_stores(self):
        m = self.read("middleware.ts")
        self.assertIn("HFT_LIVE_R1_PROFILE",m)
        self.assertIn("liveRoutes.has(path)",m)
        r = self.read("app/api/hft/live-masters/route.ts")
        self.assertIn("LIVE_R1_MASTERS",r)
        self.assertIn("assertLiveProfile",r)
        self.assertIn("executeLive",r)
        self.assertNotIn("submitOpsA2",r)
        self.assertNotIn("handleP3MasterRequest",r)

    def test_harness_is_real_pg_only_and_not_auto_ci(self):
        s = self.read("tests/postgres/hft-live-r1-qualification.ts")
        self.assertIn("admitLiveConnection",s)
        self.assertIn("openLivePool",s)
        self.assertIn("POST(request)",s)
        self.assertIn("PRODUCTION_DB_TEST_FORBIDDEN",s)
        self.assertIn("UPGRADE_MUST_USE_NEW_RELEASE_ADMISSION",s)
        self.assertNotIn("mock.module",s)

if __name__=="__main__":
    unittest.main()
