#!/usr/bin/env python3
"""Read XLSX cached values, preserving row positions; no workbook writes."""
import hashlib
import io
import json
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
COLS = {"Opening":53,"Serial Tracked Items":35,"Batch Tracked Items":27,"Batch 3 Sticker Register":20,"B3 Movement Validation 25Nov":18,"SFG Register":16,"SFG Components":14}
def extract(path):
    raw = Path(path).read_bytes()
    if len(raw) > 100*1024*1024:
        raise ValueError("XLSX_FILE_TOO_LARGE")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError("DUPLICATE_ARCHIVE_ENTRY")
        def root(name):
            info = z.getinfo(name)
            if info.file_size > 100*1024*1024:
                raise ValueError("XLSX_MEMBER_TOO_LARGE")
            return ET.fromstring(z.read(info))
        ss = []
        if "xl/sharedStrings.xml" in names:
            ss = ["".join(t.text or "" for t in item.iter(NS+"t")) for item in root("xl/sharedStrings.xml").findall(NS+"si")]
        rels = {r.get("Id"):r.get("Target") for r in root("xl/_rels/workbook.xml.rels") if r.get("TargetMode") != "External"}
        out, errors = {}, []
        for sheet in root("xl/workbook.xml").findall(".//"+NS+"sheet"):
            name = sheet.get("name")
            if name not in COLS:
                continue
            target = rels[sheet.get(REL)]
            member = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl",target))
            if not member.startswith("xl/worksheets/"):
                raise ValueError("UNEXPECTED_WORKSHEET_PATH")
            rows = []
            for row in root(member).findall(".//"+NS+"sheetData/"+NS+"row"):
                rn = int(row.get("r"))
                if not 1 <= rn <= 20000:
                    raise ValueError("WORKSHEET_ROW_LIMIT")
                vals = [""]*COLS[name]
                for cell in row.findall(NS+"c"):
                    addr = cell.get("r","")
                    m = re.fullmatch(r"([A-Z]+)([0-9]+)",addr)
                    if not m or int(m.group(2)) != rn:
                        raise ValueError("INVALID_CELL_ADDRESS")
                    col = 0
                    for ch in m.group(1):
                        col = col*26+ord(ch)-64
                    if col > COLS[name]:
                        continue
                    typ = cell.get("t","")
                    v = cell.find(NS+"v")
                    text = v.text if v is not None else None
                    if typ == "inlineStr":
                        value = "".join(t.text or "" for t in cell.iter(NS+"t"))
                    elif typ == "s":
                        value = ss[int(text)] if text is not None else ""
                    elif typ == "b":
                        if text not in ("0","1"):
                            raise ValueError("INVALID_BOOLEAN")
                        value = text == "1"
                    elif typ in ("str","e","d"):
                        value = text or ""
                    elif text is None:
                        value = ""
                    else:
                        value = float(text) if any(c in text.lower() for c in ".e") else int(text)
                    if (cell.find(NS+"f") is not None and v is None) or typ == "e":
                        errors.append(name+"!"+addr)
                    vals[col-1] = value
                if any(v != "" for v in vals):
                    while len(rows) < rn:
                        rows.append([])
                    rows[rn-1] = vals
            out[name] = rows
    return {"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),"sheets":out,"cache_exceptions":errors}
if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: hft_b3_extract_xlsx.py workbook.xlsx")
    print(json.dumps(extract(sys.argv[1]),ensure_ascii=True,allow_nan=False,separators=(",",":")))
