"""Independent Python OPS-A V2 exact-byte vectors and static SQL/TS order checks.

NO PostgreSQL execution; no production, secret or real human identity is used.
"""
from pathlib import Path
import hashlib
import hmac
import json
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
V2_SQL=(ROOT/"db/security/HFT-R1-OPS-A-VERSIONED-FORWARD-NONEXECUTABLE-CANDIDATE.sql").read_text()
V2_TS=(ROOT/"lib/hft/security/ops-a-versioned-invocation.ts").read_text()
FACT_SQL=(ROOT/"db/security/HFT-R1-OPS-A2-WRITER-NONEXECUTABLE.sql").read_text()

def bytes_v1(fields):
 return b"".join(len(v.encode("utf8")).to_bytes(4,"big")+v.encode("utf8") for v in fields)
def sha(values):
 return hashlib.sha256(bytes_v1(values)).hexdigest()

class V2IndependentVectors(unittest.TestCase):
 def test_thirty_three_fixed_fields_match_sql_typescript_and_sha256(self):
  src=V2_TS.split("export const OPS_A_PAYLOAD_FIELDS=[",1)[1].split("] as const;",1)[0]
  sql=V2_SQL.split("CREATE OR REPLACE FUNCTION hft.ops_a_payload_fields_v2",1)[1]
  sql=sql.split("keys text[]:=ARRAY[",1)[1].split("];",1)[0]
  ts_fields=re.findall(r"'([^']+)'",src)
  sql_fields=re.findall(r"'([^']+)'",sql)
  self.assertEqual(len(ts_fields),33)
  self.assertEqual(ts_fields,sql_fields)
  p={
   "contractVersion":"HFT-R1-OPS-A-P2-VERSIONED-POST-V2-PROPOSED",
   "commandId":"CMD1","idempotencyKey":"KEY1","kind":"RECEIVE",
   "legalEntityId":"HFT","siteId":"SITE1","warehouseId":"WH1",
   "itemCode":"ITEM1","productVersion":"PV1","controlType":"NONE",
   "serialNo":"","batchNo":"","sourceLeafId":"","destinationLeafId":"BIN1",
   "sourceAccountId":"","destinationAccountId":"ACCT1",
   "sourceAccountBeforeVersion":"","destinationAccountBeforeVersion":"0",
   "employeeId":"","originalIssueId":"","sourceDocumentId":"GRN1",
   "sourceActionKey":"RECEIPT1","fragmentId":"","quantityMicro":"2000000",
   "sourceRevision":"1","approvalId":"APP1","approvalRevision":"1",
   "policyGeneration":"5","approvedPayloadSha256":"a"*64,
   "approvedBy":"CHECKER1","actorSubject":"STORE1",
   "inspectedCondition":"GOOD","inspectionEvidenceId":"QC1"}
  digest=sha([p[k] for k in ts_fields])
  self.assertEqual(digest,
   "3a428034c3de3896c84eab58a31cd8b9cd7c9f39cd44ee232a2e6e90099b7e1f")
  proof=["HFT-R1-OPS-A-P2-HMAC-V2-PROPOSED","STORE1","SESSION1",
   digest,"1750000000","1750000040","a"*48,"1"]
  mac=hmac.new(bytes([17])*32,bytes_v1(proof),"sha256").hexdigest()
  self.assertEqual(mac,
   "c2bf6c4dfbbf15874bb19df5f66d56a1e85cfb17a6f4aec30b0854a625a81927")

 def test_account_movement_audit_fixture_matches_sql_and_typescript_contract(self):
  ev="HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1"
  identity=[ev,"HFT","SITE1","WH1","ITEM1","PV1","NONE","","",
            "BIN1","AVAILABLE","GOOD",""]
  key=sha(identity)
  self.assertEqual(key,"c01fe8029aee913dd2bd6ad6c0c3ef3a943f0b544be2d99ce3bde2a15bfec40b")
  external=["ENTRY-1","CMD1","EXTERNAL","","","","","-2"]
  credit=["ENTRY-2","CMD1","AVAILABLE","ACCT1",key,"0","1","2"]
  digest=sha([ev,"CMD1",*external,*credit])
  self.assertEqual(digest,
   "208ce574a5ef1c74e168c4cd06a2322c3be12522033bf83e9485781aebc51905")
  cmd=[ev,"CMD1","KEY1","RECEIVE","HFT","SITE1","WH1","ITEM1",
   "PV1","NONE","","","GRN1","RECEIPT1","","2","","BIN1","","0",
   "","","1","APP1","1","5","CHECKER1","STORE1","GOOD","QC1"]
  audit="|".join(json.dumps(v,ensure_ascii=False) for v in
                 ["OPS_A_AUDIT_V1",*cmd,*external,*credit])
  self.assertEqual(hashlib.sha256(audit.encode("utf8")).hexdigest(),
   "ae26f9b500df1c8f90497cd735251c21f13eca628e8cf184751b72ac049a7608")
  sql=FACT_SQL.split("CREATE OR REPLACE FUNCTION hft.ops_a2_fact_v2(",1)[1]
  sql=sql.split("END $fact$;",1)[0]
  for required in ("ARRAY['HFT-R1-OPS-A-VERSION-LEDGER-EVIDENCE-V1'",
   "entry.account_before_version","entry.account_after_version",
   "'ENTRY-'||entry.id::text","delta_fields:=delta_fields||leg_fields",
   "movement_sha:=pg_catalog.encode(hft_crypto.digest(",
   "hft.p2_length_prefixed_v1(fields||delta_fields)",
   "fields:=ARRAY['OPS_A_AUDIT_V1']||fields||delta_fields",
   "pg_catalog.to_jsonb(f)::text"):
   with self.subTest(check=required):self.assertIn(required,sql)

if __name__=="__main__":
 unittest.main()
