"""HF100 source/control tests, no live credentials or resources."""
import copy, datetime as dt, importlib.util, os, sys, tempfile, unittest, uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hf100",ROOT/"tools/hft_roles_only_install_100.py")
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
a=h.control;r=h.registry
now=dt.datetime(2026,11,28,tzinfo=dt.timezone.utc)
def order_contract():
    f=lambda i:{"id":"fixture_id_"+i,"version":"1","sha256":"a"*64,"acl_sha256":"b"*64}
    return {"schema":"HF100_MACHINE_CONTRACT_V3","nonce":"00000000-0000-4000-8000-000000000001","policy_sha256":h.sha(h.POLICY.read_bytes()),
      "security_acceptance_sha256":"c"*64,"key_policy_sha256":"d"*64,"owner_keyring_sha256":"a"*64,"provider_database_id":860001,
      "ca_sha256":"e"*64,"receipt_key_sha256":"f"*64,"baseline_sha256":"b"*64,
      "host":{"kind":"LINUX_WSL","host_id":"fixture-host","source_root":"/opt/fixture","uid":1001,"machine_id_path":"/etc/machine-id","machine_id_sha256":"1"*64,"python_sha256":"2"*64,"manifest_path":"/etc/fixture.json","manifest_sha256":"3"*64,"pg_bin":"/usr/lib/postgresql/18/bin"},
      "tools":{k:"1"*64 for k in a.BINS},
      "control":{"folder_id":"fixture_control","folder_acl_sha256":"b"*64,"reader_permission_id":"fixture_reader","status":f("status"),"owner_keyring":f("owner"),"recovery_keyring":f("recovery")},
      "custody":{"folder_id":"fixture_custody","folder_acl_sha256":"b"*64,"writer_permission_id":"fixture_writer","file_acl_sha256":"b"*64},
      "backup":{"recovery_fingerprint":"A"*40,"recovery_keyring_sha256":"a"*64}}
def original(c):
    v=h.v2
    o={"schema":a.SCHEMA,"decision_id":"SYNTHETIC-HF11","issuer":{"corporate_openpgp_primary_fingerprint":v.OWNER},
       "status":"PROPOSED_UNSIGNED_NOT_EFFECTIVE","execution_status":"UNSIGNED_PENDING_SUCCESSOR_RUNNER_AND_AUTHENTIC_TECHNICAL_EVIDENCE",
       "resources":{"retained_roles_only":h.v1.TARGET},"routine_without_per_release_owner_signature":{"actions":["SOURCE_ENGINEERING"]},
       "technical_evidence":{"no_operator_provided_pass_boolean":True},"validity":{k:None for k in a.TIME_FIELDS},
       "single_initial_hf094_order":{"authorized_action":h.v1.ACTION,"one_time_atomic_install":True,
         "immutable_sql":{x["path"]:x["sha256"] for x in h.v1.load_package()[0]["files"]},"final_v2_successor":{k:None for k in a.FINAL_FIELDS}}}
    pin=a.sha(a.canonical(o))
    o["status"]="FINAL_UNSIGNED_AWAITING_OWNER_SIGNATURE";o["execution_status"]="FINAL_UNSIGNED_AWAITING_CORPORATE_SIGNATURE"
    o["validity"].update({"issued_at_utc":"2026-11-27T00:00:00Z","not_before_utc":"2026-11-27T00:00:00Z","expires_at_utc":"2026-12-01T00:00:00Z",
       "accepted_key_expiry_and_revocation_policy_ref":"https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/20#issuecomment-123"})
    o["single_initial_hf094_order"]["final_v2_successor"].update({"accepted_runner_commit":"a"*40,"accepted_runner_tree":"b"*40,
       "bounded_security_acceptance_ref":"https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/28#issuecomment-124","exact_head_ci_ref":"https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/999",
       "runner_path":a.RUNNER_PATH,"runner_sha256":h.sha(h.SELF.read_bytes()),"versioned_contract_sha256":a.sha(a.canonical(c))})
    return o,pin
def derived(c=None):
    c=c or order_contract();o,pin=original(c)
    with patch.object(a,"TEMPLATE_SHA",pin):
        return a.combined(a.original_canonical(o),a.canonical(c),h.v1,h.sha(h.SELF.read_bytes()),h.sha(h.POLICY.read_bytes()),now)
class FakeDrive:
    def __init__(self):self.items={}
    def folder(self,*x):pass
    def children(self,parent):return [dict(v[0]) for v in self.items.values() if v[0]["parents"]==[parent]]
    def add(self,parent,name,raw,id=None):
        id=id or "fixture_"+uuid.uuid4().hex
        m={"id":id,"name":name,"parents":[parent],"version":"1","trashed":False}
        self.items[id]=(m,raw);return id
    def read(self,id,parent,acl,version=None):
        m,raw=self.items[id]
        a.need(m["parents"]==[parent] and not m["trashed"] and (version is None or m["version"]==version),"HF100_DRIVE_OBJECT_DRIFT")
        return raw,{"id":id,"version":m["version"],"sha256":a.sha(raw),"size":len(raw)}
    def create(self,parent,name,raw,acl):
        return self.read(self.add(parent,name,raw),parent,acl)[1]
def fake_control(o):
    f=FakeDrive();c=o["control"]
    st=a.canonical({"schema":"HF100_ACTIVE_V3","nonce":o["order_id"],"owner_fingerprint":o["owner_fingerprint"],"expires_at":o["expires_at"],"state":"ACTIVE"})
    for k,raw in (("status",st),("owner_keyring",b"synthetic owner"),("recovery_keyring",b"synthetic recovery")):
        c[k]["sha256"]=a.sha(raw);f.add(c["folder_id"],k,raw,c[k]["id"])
    return f
class Tests(unittest.TestCase):
    def test_original_scope_and_new_contract(self):
        d=derived();self.assertEqual(d["ci_run_id"],999);self.assertEqual(d["owner_fingerprint"],h.v2.OWNER)
        for change in ({"schema":"HF094_MACHINE_CONTRACT_V2"},{"baseline_sha256":"0"*64},{"receipt_key_sha256":"0"*64},{"provider_database_id":1},{"registry":{}},{"tools":{}}):
            with self.assertRaises(RuntimeError):derived({**order_contract(),**change})
        for kind in ("VERCEL_SANDBOX","LINUX_WSL"):
            c=order_contract();c["host"]["kind"]=kind;self.assertEqual(derived(c)["host"]["kind"],kind)
        c=order_contract();o,pin=original(c);o["resources"]["retained_roles_only"]["database_oid"]=1
        with patch.object(a,"TEMPLATE_SHA",pin),self.assertRaisesRegex(RuntimeError,"STANDING_SCOPE"):
            a.combined(a.original_canonical(o),a.canonical(c),h.v1,h.sha(h.SELF.read_bytes()),h.sha(h.POLICY.read_bytes()),now)
    def test_unsigned_never_connects(self):
        with patch("sys.argv",["hf100","--apply"]),patch.object(h,"verify_host",side_effect=AssertionError("host")),patch.object(h,"Pg",side_effect=AssertionError("SQL")):
            with self.assertRaisesRegex(RuntimeError,"SIGNED_ORDER"):h.main()
    def test_current_control_version_and_replay(self):
        o=derived();o["not_before"]="2026-01-01T00:00:00Z";o["expires_at"]="2026-12-26T18:29:59Z"
        ctrl=fake_control(o);cust=FakeDrive();d=a.RegistryDrive(o,ctrl,cust)
        with patch.object(a,"clock",lambda:now):
            d.authority();d.absent();ref=d.put_once("claim.json",b"claim")
            self.assertEqual(d.read("claim.json"),(b"claim",ref))
            with self.assertRaisesRegex(RuntimeError,"PRIOR"):d.absent()
            with self.assertRaisesRegex(RuntimeError,"PRIOR"):d.put_once("claim.json",b"again")
            st=o["control"]["status"]["id"];ctrl.items[st][0]["version"]="2" # same content after rollback
            with self.assertRaisesRegex(RuntimeError,"DRIFT"):d.authority()
            ctrl.items[st][0]["version"]="1";ctrl.add(o["control"]["folder_id"],"STOP",b"stop")
            with self.assertRaisesRegex(RuntimeError,"STOP"):d.authority()
    def test_receipt_auth_and_chain(self):
        o=derived();key=b"k"*32;attempt=str(uuid.uuid4())
        c=a.seal(key,o,attempt,"CLAIM",None,{"test":True})
        p=a.seal(key,o,attempt,"PREPARED",a.sha(c),{})
        self.assertEqual(a.unseal(key,p)["previous_sha256"],a.sha(c))
        with self.assertRaisesRegex(RuntimeError,"AUTHENTICATION"):a.unseal(b"x"*32,c)
        with self.assertRaisesRegex(RuntimeError,"AUTHENTICATION"):a.unseal(key,c.replace(b'"test":true',b'"test":false'))
    def test_fixed_claim_assembly_no_raw_sql_injection(self):
        c=a.seal(b"k"*32,derived(),str(uuid.uuid4()),"CLAIM",None,{"text":"$hf100_gate$'; DROP TABLE secret;"})
        s=r.bootstrap(h.v1.TARGET,h.v2.CATALOG,{"test":"$hf100_gate$"},c)
        self.assertNotIn("DROP TABLE",s);self.assertIn("BEGIN ISOLATION LEVEL SERIALIZABLE",s)
        self.assertIn("HF100_PRECLAIM_BASELINE_DRIFT",s);self.assertTrue(s.endswith("COMMIT;\n"))
if __name__=="__main__":unittest.main()
