"""Synthetic offline vectors for OPS-A2 independent signed scope.

NOT PostgreSQL parity evidence. JSONB input order is not preserved; the contract
is the normalized jsonb::text output, not source JSON key order.
No corporate keys or enrolled signing material are used.
"""
import hashlib
import hmac
import json
import unittest

TEST_KEY=bytes.fromhex("11"*32)
EXPECTED={
 "ACCOUNT_ZERO":("8234a174abbc6a73d99ad3f918b82a5270bfbb64c75914086a51d154617efbed",
                 "1eceeb5a997ae4f782d3dfe17276bc16c638f24b7323f04388cb232f17a0c2ab"),
 "TRANSFER_ISSUE":("18792d174ed3635edeea9379ed426a889a05efa8e4739e7bb702a1bd1a922409",
                   "384c92a67e2b41ae308a33cb49a0c4a3ccff00e3c7dda2b987b1fec1c6a86b5e"),
 "RECOVERY_REVIEW":("cade1fcbad00c35daa17e9b5a62672762854b2f46ebaf8503d6ab16aa5854278",
                    "e6d56c0650d09041daa40c725b1ae88895b3f21306d5814de49fe851361e3a9e"),
}
DOMAIN="HFT-OPS-A2-ORIGINAL-SCOPE-HMAC-V1"
DOC="00000000-0000-4000-8000-000000000001"
ORDER="00000000-0000-4000-8000-000000000002"

def simulated_jsonb_text(obj):
 """Limited flat ASCII-only approximation; actual PostgreSQL must validate."""
 if any(not isinstance(k,str) or not k.isascii() for k in obj):
  raise ValueError("OFFLINE_VECTOR_REQUIRES_ASCII_KEYS")
 if any(not isinstance(v,(str,int)) or isinstance(v,bool) or (
        isinstance(v,str) and not v.isascii()) for v in obj.values()):
  raise ValueError("OFFLINE_VECTOR_VALUE_OUTSIDE_TEST_DOMAIN")
 return "{"+", ".join(json.dumps(k)+": "+json.dumps(obj[k])
        for k in sorted(obj,key=lambda k:(len(k.encode("utf8")),k.encode("utf8"))))+"}"

def wire(fields):
 pieces=[]
 for field in fields:
  part=field.encode("utf8")
  if len(part)>65535:raise ValueError("P2_MAC_FIELD_TOO_LARGE")
  pieces.append(len(part).to_bytes(4,"big")+part)
 return b"".join(pieces)

def signature(purpose,scope,nonce="cd"*24,signer="signer",version="1",
              expiry="1790000120"):
 scope_text=simulated_jsonb_text(scope)
 scope_hash=hashlib.sha256(scope_text.encode("utf8")).hexdigest()
 fields=[DOMAIN,purpose,ORDER,"HFT","APR-075","3",scope_text,
         scope_hash,"ab"*32,signer,"session","person",version,nonce,
         "1790000000",expiry]
 return scope_hash,hmac.new(TEST_KEY,wire(fields),hashlib.sha256).hexdigest()

def fixture(purpose):
 return {"contract":"HFT-OPS-A2-"+purpose+"-TEST-V1",
         "actionKind":"TRANSFER" if purpose=="TRANSFER_ISSUE" else "RECEIVE",
         "leaf":"BIN01","sourceDocumentId":DOC,"sourceRevision":2}

class IndependentScopeOfflineVectors(unittest.TestCase):
 def test_three_purpose_isolated_vectors(self):
  for purpose,expected in EXPECTED.items():
   with self.subTest(purpose=purpose):
    self.assertEqual(signature(purpose,fixture(purpose)),expected)

 def test_exact_fields_and_domain_are_signed(self):
  for purpose in EXPECTED:
   scope=fixture(purpose)
   original=signature(purpose,scope)
   for key,value in (("leaf","BIN02"),("sourceRevision",3),
                     ("actionKind","ISSUE"),("contract","TAMPERED")):
    modified=dict(scope);modified[key]=value
    self.assertNotEqual(signature(purpose,modified),original)
   self.assertNotEqual(signature(purpose,scope,nonce="aa"*24),original)
   self.assertNotEqual(signature(purpose,scope,signer="stolen"),original)
   self.assertNotEqual(signature(purpose,scope,version="2"),original)
   self.assertNotEqual(signature(purpose,scope,expiry="1790000121"),original)
   for other in EXPECTED:
    if other!=purpose:
     self.assertNotEqual(signature(other,scope),original)

 def test_jsonb_order_normalization_not_raw_order(self):
  obj=fixture("ACCOUNT_ZERO")
  self.assertEqual(simulated_jsonb_text(obj),
                   simulated_jsonb_text(dict(reversed(list(obj.items())))))
  self.assertNotEqual(signature("ACCOUNT_ZERO",dict(obj,sourceRevision="2")),
                      signature("ACCOUNT_ZERO",obj))

if __name__=="__main__":
 unittest.main()
