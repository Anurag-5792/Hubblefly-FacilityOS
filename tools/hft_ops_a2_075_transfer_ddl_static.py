"""Nonexecuting lexical DDL checks for the exact OPS-A2 transfer table.

This is NOT PostgreSQL parsing or server acceptance. It checks the original
GOV-069-H01 truncation, bracket structure and unique column declarations.
"""
from pathlib import Path
import re

START="CREATE TABLE hft.ops_a2_transfer_issuance_order("
FIELDS=("order_id","document_id","legal_entity_id","site_id","warehouse_id",
 "item_code","product_version_code","source_leaf","destination_leaf",
 "batch_no","serial_no","authorized_micro","revision","approval_id",
 "approval_revision","source_action_key","approved_scope_sha256",
 "prepared_subject","prepared_session_id","checked_subject",
 "checked_session_id","approved_subject","approved_session_id",
 "approved_at","decision_evidence_sha256","policy_generation","status")

def extract_table(source):
 if source.count(START)!=1:raise ValueError("075_TRANSFER_DDL_NOT_UNIQUE")
 start=source.index(START)
 i=start+len(START)
 depth=1
 quote=False
 while i<len(source):
  ch=source[i]
  if quote:
   if ch=="'":
    if i+1<len(source) and source[i+1]=="'":i+=2;continue
    quote=False
  elif ch=="'":
   quote=True
  elif ch=="(":
   depth+=1
  elif ch==")":
   depth-=1
   if depth==0:
    if source[i+1:i+2]!=";":
     raise ValueError("075_TRANSFER_DDL_NO_TERMINATOR")
    return source[start:i+2]
   if depth<0:raise ValueError("075_TRANSFER_DDL_UNBALANCED")
  i+=1
 raise ValueError("075_TRANSFER_DDL_TRUNCATED_OR_UNCLOSED")

def check(source):
 table=extract_table(source)
 match=re.search(
  r"approved_scope_sha256\s+text\s+NOT\s+NULL\s+"
  r"CHECK\s*\(approved_scope_sha256\s*~\s*'\^\[0-9a-f\]\{64\}\$'\)",
  table)
 if not match:raise ValueError("075_TRANSFER_SCOPE_REGEX_INVALID")
 if "^[0-9a-f]{64} text NOT NULL" in table:
  raise ValueError("075_TRANSFER_CORRUPTED_CHECK_RETAINED")
 for name in FIELDS:
  count=len(re.findall(r"(?m)^\s*"+name+r"\s+(?:uuid|text|bigint|timestamptz)\b",table))
  if count!=1:raise ValueError("075_TRANSFER_COLUMN_COUNT:"+name)
 for constraint in ("CHECK(source_leaf<>destination_leaf)",
   "FOREIGN KEY(legal_entity_id,approval_id,approval_revision)",
   "FOREIGN KEY(legal_entity_id,warehouse_id,source_leaf)",
   "FOREIGN KEY(legal_entity_id,warehouse_id,destination_leaf)",
   "prepared_subject<>checked_subject",
   "prepared_subject<>approved_subject",
   "checked_subject<>approved_subject"):
  if constraint not in table:raise ValueError("075_TRANSFER_CONSTRAINT_MISSING:"+constraint)
 tail=source[source.index(table)+len(table):]
 if re.match(r"\s*\),",tail):raise ValueError("075_TRANSFER_DUPLICATE_TRAILING_FRAGMENT")
 return True

def main():
 root=Path(__file__).resolve().parents[1]
 for relative in ("db/security/HFT-R1-OPS-A2-FOUNDATION-NONEXECUTABLE.sql",
  "db/security/HFT-R1-OPS-A2-PG18-CONSOLIDATED-FORWARD-NONEXECUTABLE.sql"):
  check((root/relative).read_text())
 print("TRANSFER_GOV069_H01_SOURCE_LEXICAL_CHECK=PASS;PG_PARSER_NOT_TESTED")

if __name__=="__main__":main()
