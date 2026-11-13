"""Directive 075 source-only recovery and approval subset regressions."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
FOUNDATION=ROOT/"db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql"
RESOLVER=ROOT/"db/security/HFT-R1-OPS-A2-RESOLVER-READ-NONEXECUTABLE.sql"
CONSOLIDATED=ROOT/"db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql"

def function(sql,name,tag):
 start=sql.index("CREATE OR REPLACE FUNCTION hft."+name+"(")
 end=sql.index("END $"+tag+"$;",start)
 return sql[start:end+len("END $"+tag+"$;")]

class RecoveryAndOriginalScope075(unittest.TestCase):
 def test_readonly_verifier_is_separate_from_writer(self):
  for path in (FOUNDATION,CONSOLIDATED):
   with self.subTest(source=path.name):
    sql=path.read_text()
    writer=function(sql,"ops_a2_assert_independent_scope_v1","scope067")
    recovery=function(sql,"ops_a2_assert_independent_scope_read_v1","scope067_ro")
    self.assertIn("'serializable'",writer)
    self.assertIn("FOR SHARE",writer)
    self.assertIn("'repeatable read'",recovery)
    self.assertIn("transaction_read_only",recovery)
    self.assertNotRegex(recovery,r"FOR\s+(SHARE|UPDATE)\b")
    self.assertNotRegex(recovery,r"\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+")
    for identity in ("att.approved_scope::text","att.mac_sha256",
                     "att.signer_person_id","signed_key.revoked_at"):
     self.assertIn(identity,recovery)
    self.assertIn("PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED",sql)

 def test_recovery_calls_only_readonly_verifier(self):
  for path in (RESOLVER,CONSOLIDATED):
   sql=path.read_text()
   recovery=function(sql,"ops_a2_reconcile_post_v3","reconcile_v3")
   self.assertIn("ops_a2_assert_independent_scope_read_v1",recovery)
   self.assertNotIn("PERFORM hft.ops_a2_assert_independent_scope_v1",recovery)
   self.assertIn("ops_a2_recovery_reviewer_revocation_v1",recovery)
   self.assertIn("original_proof->>'nonce'",recovery)
   self.assertIn("reviewer_person=original_person",recovery)
   self.assertIn("transaction_read_only",recovery)

 def test_original_leaf_restricts_supplemental_scope(self):
  for path in (FOUNDATION,CONSOLIDATED):
   sql=path.read_text()
   provision=function(sql,"ops_a2_provision_zero_account_v2","provision")
   self.assertIn("a.location_id IS DISTINCT FROM o.leaf_location_id",provision)
   self.assertIn("o.leaf_location_id IN(x.source_leaf,x.destination_leaf)",provision)
   self.assertIn("x.product_version_code=o.product_version_code",provision)
   self.assertIn("x.revision=o.source_revision",provision)
   self.assertIn("x.batch_no=o.batch_no AND x.serial_no=o.serial_no",provision)
   self.assertLess(provision.index("a.location_id IS DISTINCT"),
                   provision.index("INSERT INTO hft.stock_account"))
   self.assertLess(provision.index("OPS_A2_075_TRANSFER_ORIGINAL_LEAF_NOT_AUTHORIZED"),
                   provision.index("INSERT INTO hft.stock_account"))

if __name__=="__main__":
 unittest.main()
