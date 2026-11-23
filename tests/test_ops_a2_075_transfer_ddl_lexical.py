"""GOV-069-H01 lexical check rejects original malformed transfer DDL."""
from importlib.util import module_from_spec,spec_from_file_location
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/"tools/hft_ops_a2_075_transfer_ddl_static.py"
spec=spec_from_file_location("ops_a2_075_ddl",p)
module=module_from_spec(spec)
spec.loader.exec_module(module)

class TransferDDL075(unittest.TestCase):
 def test_actual_components(self):
  for path in (
   "db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql",
   "db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql"):
   with self.subTest(path=path):
    self.assertTrue(module.check((ROOT/path).read_text()))

 def test_reject_original_corruption(self):
  source=(ROOT/"db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql").read_text()
  broken=source.replace(
   "CHECK(approved_scope_sha256~'^[0-9a-f]{64}$'),",
   "CHECK(approved_scope_sha256~'^[0-9a-f]{64} text NOT NULL,")
  with self.assertRaises(ValueError):
   module.check(broken)

 def test_reject_duplicate_column_and_missing_fk(self):
  source=(ROOT/"db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql").read_text()
  with self.assertRaisesRegex(ValueError,"COLUMN_COUNT"):
   module.check(source.replace("prepared_subject text NOT NULL,",
                               "prepared_subject text NOT NULL,prepared_subject text NOT NULL,"))
  with self.assertRaisesRegex(ValueError,"CONSTRAINT_MISSING"):
   module.check(source.replace(
    "FOREIGN KEY(legal_entity_id,warehouse_id,source_leaf)",
    "FOREIGN KEY(legal_entity_id,warehouse_id,other_leaf)"))

if __name__=="__main__":unittest.main()
