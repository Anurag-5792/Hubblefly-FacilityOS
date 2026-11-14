"""R77 weekend offline CSV intake acceptance: no external database or actor.
All example values in this test are synthetic and never supplier/stock records.
"""
import csv
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
TEMPLATES=ROOT/"data-entry/weekend-077/templates"
SCRIPT=ROOT/"tools/hft_weekend_master_intake.mjs"
FILES=("legal_entities","sites","warehouses","locations","employees","items",
       "item_versions","suppliers","opening_stock_observations","invoice_grn_preparation")

def append(path, name, values):
    file=path/(name+".csv")
    with file.open("a",newline="",encoding="utf-8") as f:
        csv.writer(f).writerow(values)

class R77WeekendOfflineIntake(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="hft-r77-offline-")
        self.base=Path(self.tmp.name)
        self.directory=self.base/"private_input"
        self.directory.mkdir()
        for name in FILES:
            shutil.copyfile(TEMPLATES/(name+".csv"),self.directory/(name+".csv"))
        (self.directory/"photos").mkdir()
    def tearDown(self):
        self.tmp.cleanup()
    def run_stage(self,suffix="result"):
        folder=self.base/suffix
        result=subprocess.run(["node",str(SCRIPT),"--input",str(self.directory),
          "--output",str(folder)],capture_output=True,text=True,cwd=ROOT,timeout=20)
        return folder,result
    def synthetic_masters(self):
        append(self.directory,"legal_entities",["HFT","Synthetic company - TEST ONLY"])
        append(self.directory,"sites",["HFT","SITE1","Synthetic test site"])
        append(self.directory,"warehouses",["HFT","SITE1","WH1",
          "Synthetic test warehouse","Synthetic initial capture only"])
        append(self.directory,"employees",["HFT","SITE1","WH1","EMP001",
          "Synthetic employee","Stores","Operator","Synthetic personnel review only"])
        append(self.directory,"items",["HFT","SITE1","WH1","ITEM001",
          "PCS","NONE","Synthetic item entry only"])
        append(self.directory,"suppliers",["HFT","SITE1","WH1","SUP001",
          "Synthetic supplier","Synthetic supplier review only"])
        append(self.directory,"item_versions",["HFT","ITEM001","V1","DRAFT","","",""])
        for loc,parent,kind in (("RACK1","","RACK"),("LEVEL1","RACK1","LEVEL"),
                                ("POS1","LEVEL1","POSITION"),("BIN1","POS1","BIN")):
            append(self.directory,"locations",["HFT","SITE1","WH1",loc,parent,kind,
              "YES","synthetic-inspection-ref","Synthetic physical review only"])
    def test_blank_templates_produce_zero_records_never_post(self):
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,0,p.stderr)
        manifest=json.loads((folder/"manifest.json").read_text())
        self.assertEqual(manifest["rows"],0)
        self.assertEqual(manifest["stock"],"NO_AUTHORITATIVE_BALANCE")
        self.assertEqual(manifest["state"],"OFFLINE_ONLY_NOT_PERSISTED")
        self.assertEqual(json.loads(
          (folder/"p3-create-candidates.UNSUBMITTED.json").read_text())["entries"],[])
    def test_synthetic_scope_proposals_not_signed_or_auto_applied(self):
        self.synthetic_masters()
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,0,p.stderr)
        payload=json.loads((folder/"p3-create-candidates.UNSUBMITTED.json").read_text())
        self.assertEqual(len(payload["entries"]),8)
        for e in payload["entries"]:
            c=e["change"]
            self.assertEqual(c["requestId"],None)
            self.assertEqual(c["operation"],"CREATE")
            self.assertEqual(c["expectedVersion"],"0")
            self.assertEqual(e["status"],"UNSUBMITTED_OFFLINE_CANDIDATE")
            self.assertNotIn("approval",c)
            self.assertNotIn("active",c["values"])
        self.assertEqual((folder/"separate-nonposting-data.json").exists(),True)
        self.assertEqual(payload["authentication"],"NONE_NO_HMAC_NO_APPROVAL")
    def test_real_p3_validator_accepts_only_complete_fresh_request_fields(self):
        self.synthetic_masters()
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,0,p.stderr)
        script=r"""
import {readFileSync} from 'node:fs';
import {validateMasterChange} from './lib/hft/masters/p3-contract.ts';
const body=JSON.parse(readFileSync(process.argv[1],'utf8'));
for(const candidate of body.entries){
 const command={...candidate.change,requestId:'11111111-1111-4111-8111-111111111111'};
 const validated=validateMasterChange(command);
 if(validated.kind!==candidate.change.kind)throw Error('P3_DIFFERENT_KIND');
}
"""
        executed=subprocess.run(["node","--experimental-strip-types","--input-type=module",
           "-e",script,str(folder/"p3-create-candidates.UNSUBMITTED.json")],
           capture_output=True,text=True,cwd=ROOT,timeout=20)
        self.assertEqual(executed.returncode,0,executed.stderr)
    def test_duplicate_employee_global_entity_id_is_hard_failure(self):
        self.synthetic_masters()
        append(self.directory,"employees",["HFT","SITE1","WH1","EMP001",
          "Synthetic duplicate","Stores","Operator","Synthetic duplicated request"])
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,2)
        report=json.loads((folder/"validation-report.json").read_text())
        self.assertIn("DUPLICATE_SCOPED_IDENTITY",[x["code"] for x in report["errors"]])
        self.assertFalse((folder/"p3-create-candidates.UNSUBMITTED.json").exists())
    def test_scope_and_physical_bin_hierarchy_are_not_invented(self):
        self.synthetic_masters()
        with (self.directory/"locations.csv").open("a",newline="",encoding="utf-8") as f:
            csv.writer(f).writerow(["HFT","SITE1","WH1","BIN2","RACK1","BIN",
                                   "NO","","Synthetic invalid hierarchy"])
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,2)
        report=json.loads((folder/"validation-report.json").read_text())
        self.assertIn("LOCATION_KIND_PATH_INVALID",[x["code"] for x in report["errors"]])
    def test_csv_formula_injection_blocked(self):
        self.synthetic_masters()
        append(self.directory,"suppliers",["HFT","SITE1","WH1","SUP002",
          "=HYPERLINK('bad')","Synthetic formula test"])
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,2)
        errors=json.loads((folder/"validation-report.json").read_text())["errors"]
        self.assertIn("CSV_FORMULA_INJECTION",[x["code"] for x in errors])
    def test_serial_observation_must_be_exact_real_unit(self):
        self.synthetic_masters()
        file=self.directory/"items.csv"
        file.write_text(file.read_text().replace(",NONE,",",SERIAL,"),encoding="utf-8")
        append(self.directory,"opening_stock_observations",["HFT","SITE1","WH1",
          "BIN1","ITEM001","V1","","","2","PCS","2026-11-14","EMP001","synthetic-count"])
        folder,p=self.run_stage()
        self.assertEqual(p.returncode,2)
        errors=json.loads((folder/"validation-report.json").read_text())["errors"]
        self.assertIn("SERIAL_EXACT_ONE_UNIT_REQUIRED",[x["code"] for x in errors])
    def test_no_overwrite_and_no_runtime_adapter(self):
        first,p=self.run_stage()
        self.assertEqual(p.returncode,0)
        again=subprocess.run(["node",str(SCRIPT),"--input",str(self.directory),
            "--output",str(first)],capture_output=True,text=True,cwd=ROOT,timeout=20)
        self.assertEqual(again.returncode,2)
        src=SCRIPT.read_text()
        self.assertNotIn("fetch(",src)
        self.assertNotIn("INSERT INTO hft.",src)
        self.assertNotIn("createHmac(",src)
        self.assertIn("HFT_R1_API_NOT_QUALIFIED",(ROOT/"middleware.ts").read_text())
        self.assertIn("OPS_A2_PROTECTED_SQL_EXECUTION_NOT_AUTHORIZED",
          (ROOT/"db/security/HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql").read_text())

if __name__=="__main__":
 unittest.main()
