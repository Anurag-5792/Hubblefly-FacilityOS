"""Synthetic file-level regression for the private offline B3 staging boundary."""
import hashlib
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools/hft_b3_offline_stage.mjs"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"

def workbook(path, live=False):
    opening_header = [""]*53
    for i, h in {
        0:"S. No.",1:"Item Name",2:"Proposed Item Name",3:"Use Proposed?",
        4:"Selected Nomenclature",5:"Dimesnions",7:"Tracking Type",8:"Item Group",
        9:"Rack",10:"Shelve",13:"Qty",14:"Bin/Box",15:"Bin/Box No.",20:"Count_date",
        42:"Item Code (existing ref / draft proposal)",43:"Batch No. (proposed)",
        46:"Item Identity Status",52:"Previous Corporate Master Reference",
    }.items():
        opening_header[i] = h
    def item(n, name, code, track, q):
        row = [""]*53
        row[0:5] = [n,name,name+" revised",live and n==1,name+" revised" if live and n==1 else name]
        row[7],row[13],row[42],row[43],row[46] = track,q,code,code+"-B003","DRAFT"
        return row
    sheets = {
        "Opening":[opening_header,item(1,"Part","PART-01","Batch",4),item(2,"Unit","UNIT-01","Serial",1),[3,"","",False]],
        "Batch Tracked Items":[[],[],["Opening Row","S. No.","Item Code (existing / draft)","Batch No. (proposed)","Mapping Status","Opening Qty","Tracking Type","Legacy Printed QR (NOT batch number)","Label Assignment Status"],[2,1,"PART-01","PART-01-B003","DRAFT",4,"Batch","OLD-B","VERIFY"]],
        "Serial Tracked Items":[[],[],["Item Code (existing / draft)","Batch No. (proposed)","Proposed Item Serial No. (NOT issued)","Legacy QR / Sticker ID","Unit Qty","Looks/Packaging","Working Condition","Manufacturer Serial No.","Inspection Remarks","Checked By","Checked On","Opening Row at Build","Opening S. No.","Unit Index","Location (source)","Record Status","Earlier Item Serial Pattern","Identity / Mapping Status","Unresolved Source Qty (HOLD only)","Count Date (source)"],["UNIT-01","UNIT-01-B003","UNIT-01-S0001","OLD-S",1,"Not checked","Not tested","","","","",3,2,1,"","PENDING","","DRAFT"]],
        "Batch 3 Sticker Register":[["Sticker / QR ID","Opening Row","Opening S. No.","Validation State"],["OLD-B",2,1,"VERIFY"],["OLD-S",3,2,"VERIFY"]],
        "B3 Movement Validation 25Nov":[[],[],[],[],["Register","Source row","Raw qty","Disposition"],["Out",12,2,"HOLD"]],
        "SFG Register":[[],[],[],[],["Status","SFG Item Code"],["DESIGN","SFG-CW"]],
        "SFG Components":[[],[],[],[],["Record Class","SFG Code"],["DESIGN","SFG-CW"]],
    }
    def col(n):
        out = ""
        while n:
            n,r = divmod(n-1,26)
            out = chr(65+r)+out
        return out
    wb = ET.Element("{"+NS+"}workbook")
    ss = ET.SubElement(wb,"{"+NS+"}sheets")
    rels = ET.Element("{"+PKG+"}Relationships")
    with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for i,(name,rows) in enumerate(sheets.items(),1):
            rid = "rId"+str(i)
            ET.SubElement(ss,"{"+NS+"}sheet",{"name":name,"sheetId":str(i),"{"+REL+"}id":rid})
            ET.SubElement(rels,"{"+PKG+"}Relationship",{"Id":rid,"Target":"worksheets/sheet"+str(i)+".xml","Type":REL+"/worksheet"})
            ws = ET.Element("{"+NS+"}worksheet")
            sd = ET.SubElement(ws,"{"+NS+"}sheetData")
            for j,values in enumerate(rows,1):
                row = ET.SubElement(sd,"{"+NS+"}row",{"r":str(j)})
                for k,value in enumerate(values,1):
                    if value == "":
                        continue
                    cell = ET.SubElement(row,"{"+NS+"}c",{"r":col(k)+str(j)})
                    if isinstance(value,bool):
                        cell.set("t","b")
                        ET.SubElement(cell,"{"+NS+"}v").text = "1" if value else "0"
                    elif isinstance(value,(int,float)):
                        ET.SubElement(cell,"{"+NS+"}v").text = str(value)
                    else:
                        cell.set("t","inlineStr")
                        ET.SubElement(ET.SubElement(cell,"{"+NS+"}is"),"{"+NS+"}t").text = value
            z.writestr("xl/worksheets/sheet"+str(i)+".xml",ET.tostring(ws,encoding="utf-8"))
        z.writestr("xl/workbook.xml",ET.tostring(wb,encoding="utf-8"))
        z.writestr("xl/_rels/workbook.xml.rels",ET.tostring(rels,encoding="utf-8"))

class B3StageTest(unittest.TestCase):
    def test_self_test(self):
        run = subprocess.run(["node",str(TOOL),"--self-test"],capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(run.stdout)["state"],"PASS")

    def test_file_level_manifest_and_no_admission(self):
        with tempfile.TemporaryDirectory() as directory:
            d = Path(directory)
            retained, live = d/"retained.xlsx", d/"live.xlsx"
            workbook(retained)
            workbook(live,live=True)
            args = ["node",str(TOOL),"--retained",str(retained),"--live",str(live),"--live-revision","1","--output"]
            manifests = []
            for name in ("stage-a","stage-b"):
                dst = d/name
                p = subprocess.run(args+[str(dst)],capture_output=True,text=True)
                self.assertEqual(p.returncode,0,p.stderr+p.stdout)
                report = json.loads(p.stdout)
                self.assertEqual(report["admitted_rows"],0)
                self.assertEqual(report["changed_opening_rows"],1)
                self.assertEqual(report["ignored_identical_opening_scaffolds"],1)
                self.assertEqual(report["serial_candidates"],1)
                self.assertEqual(report["mixed_uom_quantity"],5)
                raw_manifest = (dst/"manifest.json").read_bytes()
                manifest = json.loads(raw_manifest)
                self.assertEqual(manifest["sources"]["retained"]["sha256"],hashlib.sha256(retained.read_bytes()).hexdigest())
                self.assertEqual(report["manifest_sha256"],hashlib.sha256(raw_manifest).hexdigest())
                for filename,meta in manifest["files"].items():
                    raw = (dst/filename).read_bytes()
                    self.assertEqual(meta["sha256"],hashlib.sha256(raw).hexdigest())
                    self.assertEqual(meta["bytes"],len(raw))
                manifests.append(raw_manifest)
            self.assertEqual(manifests[0],manifests[1])
            p = subprocess.run(args+[str(d/"stage-a")],capture_output=True,text=True)
            self.assertEqual(p.returncode,1)
            self.assertIn("OUTPUT_ALREADY_EXISTS",p.stderr)

if __name__ == "__main__":
    unittest.main()
