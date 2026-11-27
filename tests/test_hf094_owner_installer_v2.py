"""HF094 corrected V2 controls. All records/keys/registry responses here synthetic.
Actual OpenPGP and disposable PostgreSQL recovery are exercised; not AWS admission.
"""
import copy
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hf094_v2",ROOT/"tools/hft_roles_only_install_094_v2.py")
v2=importlib.util.module_from_spec(spec);spec.loader.exec_module(v2)
a=v2.admission;v1=v2.load_v1();manifest,sql,plan=v1.load_package()
NOW=dt.datetime(2026,11,28,tzinfo=dt.timezone.utc)
ACCOUNT="123456789012"
def fixture_contract():
    return {"schema":"HF094_MACHINE_CONTRACT_V2","nonce":"00000000-0000-4000-8000-000000000001",
      "policy_sha256":v2.digest(v2.policy_bytes()),"security_acceptance_sha256":"a"*64,"key_policy_sha256":"b"*64,
      "owner_keyring_sha256":"c"*64,"provider_database_id":860001,"ca_sha256":"d"*64,
      "tools":{k:"1"*64 for k in a.BINS},
      "host":{"source_root":"/opt/fixture","uid":1001,"machine_id_sha256":"1"*64,"python_sha256":"2"*64,
       "manifest_path":"/etc/fixture.json","manifest_sha256":"3"*64,"instance_id":"i-1234567890abcdef0","image_id":"ami-1234567890abcdef0",
       "instance_profile_arn":"arn:aws:iam::"+ACCOUNT+":instance-profile/fixture",
       "sts_arn":"arn:aws:sts::"+ACCOUNT+":assumed-role/fixture-executor/i-1234567890abcdef0"},
      "registry":{"bucket":"fixture-locked-registry","account":ACCOUNT,"region":"ap-south-1","prefix":"hf094/retained-roles-only/v2",
       "policy_sha256":"e"*64,"owner_control_role":"arn:aws:iam::"+ACCOUNT+":role/fixture-control","executor_role":"arn:aws:iam::"+ACCOUNT+":role/fixture-executor",
       "retain_until":"2027-04-01T00:00:00Z"},
      "backup":{"recovery_fingerprint":"A"*40,"recovery_keyring_sha256":"f"*64,"restore_image":"postgres@sha256:"+"9"*64}}

def original_fixture(c):
    # Structurally equivalent synthetic order. The actual private template is
    # NOT checked into Git. Its independently verified normalization pin is
    # immutable in the runtime source; this fixture replaces it only in test.
    o={"schema":a.SCHEMA,"decision_id":"SYNTHETIC-HF11","issuer":{"corporate_openpgp_primary_fingerprint":v2.OWNER},
       "status":"PROPOSED_UNSIGNED_NOT_EFFECTIVE","execution_status":"UNSIGNED_PENDING_SUCCESSOR_RUNNER_AND_AUTHENTIC_TECHNICAL_EVIDENCE",
       "resources":{"retained_roles_only":v1.TARGET},"routine_without_per_release_owner_signature":{"actions":["SOURCE_ENGINEERING"]},
       "technical_evidence":{"no_operator_provided_pass_boolean":True},"validity":{k:None for k in a.TIME_FIELDS},
       "single_initial_hf094_order":{"authorized_action":v1.ACTION,"one_time_atomic_install":True,
         "immutable_sql":{x["path"]:x["sha256"] for x in manifest["files"]},"final_v2_successor":{k:None for k in a.FINAL_FIELDS}}}
    pin=a.sha(a.canonical(o))
    o["status"]="FINAL_UNSIGNED_AWAITING_OWNER_SIGNATURE";o["execution_status"]="FINAL_UNSIGNED_AWAITING_CORPORATE_SIGNATURE"
    o["validity"].update({"issued_at_utc":"2026-11-27T00:00:00Z","not_before_utc":"2026-11-27T00:00:00Z","expires_at_utc":"2026-12-01T00:00:00Z",
       "accepted_key_expiry_and_revocation_policy_ref":"https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/20#issuecomment-123"})
    o["single_initial_hf094_order"]["final_v2_successor"].update({
       "accepted_runner_commit":"a"*40,"accepted_runner_tree":"b"*40,"bounded_security_acceptance_ref":"https://github.com/Anurag-5792/Hubblefly-FacilityOS/pull/24#issuecomment-124",
       "exact_head_ci_ref":"https://github.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/999",
       "runner_path":a.RUNNER_PATH,"runner_sha256":v2.digest(v2.file_bytes(v2.V2_PATH)),"versioned_contract_sha256":a.sha(a.canonical(c))})
    return o,pin

def derived():
    c=fixture_contract();o,pin=original_fixture(c)
    with patch.object(a,"TEMPLATE_SHA",pin):return v2.validate_original(a.original_canonical(o),a.canonical(c),v1,NOW)

class FakeAWS:
    """Synthetic version-list API. Models historical versions and delete markers;
    does not claim actual S3 conditional-write semantics or real protected custody."""
    def __init__(self,r):
        self.r=r;self.policy={"Version":"2012-10-17","Statement":a.required_denials(r)}
        r["policy_sha256"]=a.sha(a.canonical(self.policy))
        self.objects={};self.bad_lock=False;self.bad_lifecycle=False;self.truncated=False
    def s3(self,op,*args,check=True):
        p=list(args)
        def arg(n):return p[p.index(n)+1]
        if op=="get-bucket-versioning":return {"Status":"Enabled"}
        if op=="get-object-lock-configuration":return {"ObjectLockConfiguration":{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"GOVERNANCE" if self.bad_lock else "COMPLIANCE"}}}}
        if op=="get-bucket-policy":return {"Policy":json.dumps(self.policy)}
        if op=="get-bucket-lifecycle-configuration":return SimpleNamespace(returncode=1,stderr=b"AccessDenied" if self.bad_lifecycle else b"NoSuchLifecycleConfiguration")
        if op=="list-object-versions":
            key=arg("--prefix");versions=self.objects.get(key,[])
            return {"IsTruncated":self.truncated,"Versions":[{"Key":key,"VersionId":str(i+1),"IsLatest":i==len(versions)-1} for i,x in enumerate(versions) if x is not None],
               "DeleteMarkers":[{"Key":key,"VersionId":str(i+1),"IsLatest":i==len(versions)-1} for i,x in enumerate(versions) if x is None]}
        key=arg("--key");versions=self.objects.get(key,[])
        if op=="get-object-retention":return {"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":self.r["retain_until"]}}
        if op=="get-object":
            ix=int(arg("--version-id"))-1
            Path(p[-1]).write_bytes(versions[ix]);return {"VersionId":str(ix+1)}
        if op=="put-object":
            assert arg("--if-none-match")=="*" and arg("--object-lock-mode")=="COMPLIANCE"
            if versions:raise RuntimeError("FIXTURE_CONDITIONAL_WRITE_DENIED")
            self.objects[key]=[Path(arg("--body")).read_bytes()];return {"VersionId":"1"}
        raise AssertionError(op)

def fake_registry():
    o=derived();o["expires_at"]="2026-12-26T18:29:59Z"
    o["not_before"]="2026-11-01T00:00:00Z"
    aws=FakeAWS(o["registry"]);reg=a.ProtectedRegistry(o,aws)
    key=reg.prefix+"control/active/"+o["order_id"]
    aws.objects[key]=[a.canonical({"schema":"HF094_PROTECTED_ACTIVE_V2","order_sha256":o["owner_order_sha256"],
      "contract_sha256":o["contract_sha256"],"owner_fingerprint":v2.OWNER,"expires_at":o["expires_at"]})]
    return o,aws,reg

class MemoryRegistry:
    """Only for local fixture execution of the actual orchestration function."""
    def __init__(self,key=b""):
        self.objects={};self.key=key;self.stop=False;self.fail_terminal=False
    def authority(self):
        if self.stop:raise RuntimeError("STOP")
        return {"state":"SYNTHETIC_AUTHORITY"}
    def recovery_keyring(self):return self.key
    def put_once(self,k,b):
        if k in self.objects or self.fail_terminal and k.endswith("terminal.json"):raise RuntimeError("CUSTODY_UNAVAILABLE_OR_REPLAY")
        ref={"key":k,"version_id":"1","sha256":a.sha(b),"retention_until":"SYNTHETIC"}
        self.objects[k]=(b,ref);return ref
    def read(self,k):return self.objects[k]

def gpg(home,*args,input=None):
    p=subprocess.run(["gpg","--homedir",str(home),"--batch","--no-tty","--pinentry-mode","loopback","--passphrase","",*args],input=input,capture_output=True,check=True,timeout=60)
    return p.stdout

def fingerprint(home):
    return next(x.split(":")[9] for x in gpg(home,"--with-colons","--list-keys").decode().splitlines() if x.startswith("fpr:"))

class Guard(unittest.TestCase):
    def test_combined_original_not_flat_projection(self):
        self.assertEqual(a.ORIGINAL_ZIP_SHA,"bd0fdbfc9e158dbafc2d3c0ae847493952e4429e82f3828f02ae5a39d05ca8eb")
        self.assertEqual(a.TEMPLATE_SHA,"89e12950ceddd7d01eaa722fb9f92bf395b378fe68e657b9a7ca8db06d1f68ff")
        c=fixture_contract();o,pin=original_fixture(c)
        with patch.object(a,"TEMPLATE_SHA",pin):
            r=v2.validate_original(a.original_canonical(o),a.canonical(c),v1,NOW);self.assertEqual(r["ci_run_id"],999)
            self.assertEqual(r["owner_fingerprint"],v2.OWNER)
            for mutate in (lambda x:x["resources"]["retained_roles_only"].update(database_oid=9),
                 lambda x:x["routine_without_per_release_owner_signature"]["actions"].append("PRODUCTION"),
                 lambda x:x["single_initial_hf094_order"]["immutable_sql"].clear(),
                 lambda x:x["technical_evidence"].update(no_operator_provided_pass_boolean=False),
                 lambda x:x.update(status="PROPOSED_UNSIGNED_NOT_EFFECTIVE"),
                 lambda x:x["validity"].update(expires_at_utc="2027-01-01T00:00:00Z"),
                 lambda x:x["validity"].update(not_before_utc="2026-12-01T00:00:00Z"),
                 lambda x:x["single_initial_hf094_order"]["final_v2_successor"].update(runner_sha256="f"*64)):
                bad=copy.deepcopy(o);mutate(bad)
                with self.assertRaises((RuntimeError,ValueError,TypeError)):v2.validate_original(a.original_canonical(bad),a.canonical(c),v1,NOW)
            for change in ({"backup":{**c["backup"],"restore_image":"postgres:latest"}},{"provider_database_id":1},{"tools":{}},{"restore_verified":True}):
                bad={**c,**change};edited=copy.deepcopy(o)
                edited["single_initial_hf094_order"]["final_v2_successor"]["versioned_contract_sha256"]=a.sha(a.canonical(bad))
                with self.assertRaises((RuntimeError,ValueError,TypeError)):v2.validate_original(a.original_canonical(edited),a.canonical(bad),v1,NOW)
            with self.assertRaises(RuntimeError):v2.validate_original(a.canonical(o),a.canonical(c),v1,NOW)
            with self.assertRaises(RuntimeError):v2.validate_original(a.original_canonical({"schema":"HF094_OWNER_ONLY_INSTALL_ORDER_V2"}),a.canonical(c),v1,NOW)
        self.assertEqual(v2.digest(v2.file_bytes(v2.V1_PATH)),v2.V1_SHA)
        self.assertEqual(v1.TECHNICAL_REVIEWER_PUBKEY_SHA256,"")

    def test_unsigned_never_connects(self):
        with patch("sys.argv",["hf094","--apply"]),patch.object(v2,"remote",side_effect=AssertionError("network")),patch.object(v2,"wire",side_effect=AssertionError("SQL")):
            with self.assertRaisesRegex(RuntimeError,"SIGNED_ORDER"):v2.main()
    def test_duplicate_json_and_remote_host_denied(self):
        with self.assertRaisesRegex(RuntimeError,"DUPLICATE"):v2.strict(b'{"state":"STOP","state":"ACTIVE"}')
        for u in ("http://api.github.com/x","https://outside.invalid/x","https://api.github.com:444/x","https://token@api.github.com/x"):
            with self.assertRaisesRegex(RuntimeError,"REMOTE_HOST"):v2.remote(u,"synthetic")
    def test_actual_original_signature_and_wrong_key(self):
        with tempfile.TemporaryDirectory() as td:
            h=Path(td);h.chmod(0o700)
            gpg(h,"--quick-generate-key","HF094 synthetic signer <fixture@example.invalid>","ed25519","sign","1d")
            fp=fingerprint(h);current=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
            c=fixture_contract();o,pin=original_fixture(c)
            o["validity"]["issued_at_utc"]=a.iso(current-dt.timedelta(seconds=10));o["validity"]["not_before_utc"]=o["validity"]["issued_at_utc"];o["validity"]["expires_at_utc"]=a.iso(current+dt.timedelta(minutes=20))
            raw=a.original_canonical(o);p=h/"order";p.write_bytes(raw)
            gpg(h,"--local-user",fp,"--output",str(h/"sig"),"--detach-sign",str(p))
            sig=(h/"sig").read_bytes();key=gpg(h,"--export",fp)
            order={"issued_at":o["validity"]["issued_at_utc"],"expires_at":o["validity"]["expires_at_utc"]}
            with self.assertRaisesRegex(RuntimeError,"OWNER_SIGNATURE_DENIED"):v2.verify_owner(raw,sig,key,order,current)
            with patch.object(v2,"OWNER",fp):
                self.assertEqual(v2.verify_owner(raw,sig,key,order,current)["fingerprint"],fp)
                with self.assertRaisesRegex(RuntimeError,"OWNER_SIGNATURE_DENIED"):v2.verify_owner(raw+b" ",sig,key,order,current)
    def test_ci_and_provider_pins(self):
        sha="a"*40;path=v2.WORKFLOW;steps=("Verify immutable V1 and owner V2 guards","Execute V2 guarded assembly and terminal receipt campaign")
        r={"id":9,"head_sha":sha,"path":path,"event":"push","status":"completed","conclusion":"success","repository":{"id":v2.REPO_ID}}
        j={"total_count":1,"jobs":[{"id":12,"head_sha":sha,"status":"completed","conclusion":"success","steps":[{"name":x,"conclusion":"success"} for x in steps]}]}
        self.assertEqual(v2.check_ci_run(r,j,sha,path,steps)["job"],12)
        for change in ({"head_sha":"b"*40},{"conclusion":"failure"},{"event":"pull_request"},{"repository":{"id":0}}):
            with self.assertRaisesRegex(RuntimeError,"CI_RUN"):v2.check_ci_run({**r,**change},j,sha,path,steps)
        with self.assertRaisesRegex(RuntimeError,"CI_REQUIRED_STEP"):v2.check_ci_run(r,j,sha,path,steps+("unexecuted",))
        t=v1.TARGET;e={"id":t["endpoint"],"project_id":t["project"],"branch_id":t["branch"],"host":t["host"],"disabled":False,"type":"read_write"}
        d={"id":860001,"name":t["database"],"branch_id":t["branch"],"owner_name":t["installer"]}
        self.assertEqual(v2.check_provider(e,[d],t,860001)["database"],d)
        for x in ({"branch_id":"wrong"},{"host":"wrong"},{"disabled":True}):
            with self.assertRaisesRegex(RuntimeError,"ENDPOINT"):v2.check_provider({**e,**x},[d],t,860001)
        with self.assertRaisesRegex(RuntimeError,"DATABASE"):v2.check_provider(e,[{**d,"id":1}],t,860001)
    def test_actual_registry_checks_and_historical_stop(self):
        o,aws,reg=fake_registry()
        with patch.object(a,"clock",return_value=NOW):
            self.assertEqual(reg.authority()["version_id"],"1")
            for key in ("control/STOP","control/stop/"+o["order_id"],"control/revoked/"+v2.OWNER):
                aws.objects[reg.prefix+key]=[b"STOP",None] # hidden historical STOP, not latest
                with self.assertRaisesRegex(RuntimeError,"STOP_REVOCATION"):reg.authority()
                del aws.objects[reg.prefix+key] # synthetic fixture reset only
            for name,code in (("bad_lock","COMPLIANCE"),("bad_lifecycle","LIFECYCLE"),("truncated","LIST_INCOMPLETE")):
                setattr(aws,name,True)
                with self.assertRaisesRegex(RuntimeError,code):reg.authority()
                setattr(aws,name,False)
            reg.put_once(a.CONSUMED,b"claim")
            with self.assertRaisesRegex(RuntimeError,"REPLAY"):reg.put_once(a.CONSUMED,b"again")
            aws.objects[reg.prefix+a.CONSUMED].append(None)
            with self.assertRaisesRegex(RuntimeError,"REPLAY"):reg.put_once(a.CONSUMED,b"again")
            aws.policy["Statement"].pop()
            with self.assertRaisesRegex(RuntimeError,"POLICY"):reg.authority()
    def test_terminal_receipts_and_no_retry(self):
        order={**derived(),"provider_evidence":{"id":"fixture"}}
        for kind in ("before","uncertain","post","custody","stop","success"):
            reg=MemoryRegistry();reg.fail_terminal=kind=="custody";calls=[]
            def capture(*args):
                if kind=="before":raise RuntimeError("backup failed")
                if kind=="stop":reg.stop=True
                return {"synthetic":"recovery"}
            def execute(stmt):
                calls.append(stmt)
                if kind=="uncertain":raise RuntimeError("commit unknown")
            def post():
                if kind=="post":raise RuntimeError("post unknown")
                return "verified fixture"
            def act():return a.guarded_apply(order,reg,{"fixture":"host"},[],lambda:order["provider_evidence"],lambda:({"fresh":1},{"tls":"synthetic"}),capture,lambda c,pin:"DDL "+pin,execute,post)
            if kind=="success":act()
            else:
                with self.assertRaises(RuntimeError):act()
            self.assertIn(a.CONSUMED,reg.objects)
            if kind!="custody":
                terminal=a.strict(reg.read("execution/retained-oid16397-canonical-roles-only/terminal.json")[0])
                self.assertEqual(terminal["claim"],reg.read(a.CONSUMED)[1])
                expected={"before":"FAILED_BEFORE_DDL_NO_RETRY","stop":"FAILED_BEFORE_DDL_NO_RETRY","uncertain":"SQL_OUTCOME_UNCERTAIN_NO_RETRY","post":"COMMIT_OBSERVED_POSTFLIGHT_OR_CUSTODY_UNCONFIRMED","success":"COMMITTED_CATALOG_READBACK"}[kind]
                self.assertEqual(terminal["state"],expected)
            self.assertEqual(len(calls),0 if kind in ("before","stop") else 1)
            with self.assertRaises(RuntimeError):act()
    def test_approved_host_and_target_dump_gate(self):
        o=derived()
        with self.assertRaisesRegex(RuntimeError,"APPROVED_ISOLATED_HOST"):a.verify_host(o,None,None,ROOT)
        with self.assertRaisesRegex(RuntimeError,"TARGET_BACKUP_TRANSPORT"):v2.capture_target(v1,{},o,{}, {}, {},None,"fixture/")
        t=v1.TARGET;env={"PGHOST":t["host"],"PGPORT":str(t["port"]),"PGDATABASE":t["database"],"PGUSER":t["installer"],"PGSSLMODE":"verify-full","PGCHANNELBINDING":"require"}
        o["provider_evidence"]={"fixture":"provider"}
        with patch.object(v2,"binary",return_value="/usr/bin/pg_dump"),patch.object(v2,"run",return_value=SimpleNamespace(stdout=b"PGDMPfixture")) as run,patch.object(v2,"encrypt_restore",return_value={"synthetic":"restore"}) as enc:
            v2.capture_target(v1,env,o,{"fixture":"host"},{"fresh":1},{"tls":"synthetic"},None,"fixture/")
            cmd=run.call_args.args[0];self.assertIn(t["host"],cmd);self.assertIn(t["database"],cmd);self.assertIn(t["installer"],cmd)
            self.assertEqual(run.call_args.kwargs["env"],env)
            self.assertEqual(enc.call_args.args[0],b"PGDMPfixture")
            self.assertEqual(enc.call_args.args[5]["target"],t)

def actual_recovery():
    """Actual target-shaped local pg_dump -> locked-registry fixture -> GPG
    decrypt -> new isolated PG restore. Protected service API synthetic only."""
    docker=v2.binary("docker")
    def d(*args,input=None,check=True):return subprocess.run([docker,*args],input=input,capture_output=True,check=check,timeout=180)
    d("pull","postgres:18.7")
    image=json.loads(d("image","inspect","postgres:18.7","--format","{{json .RepoDigests}}").stdout)[0]
    name="hf094-v2-source-fixture-"+uuid.uuid4().hex
    db="hft_r1_disposable_v2backup"
    try:
        d("run","-d","--rm","--network","none","--name",name,"-e","POSTGRES_HOST_AUTH_METHOD=trust",image)
        for _ in range(60):
            if d("exec",name,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError("fixture database unavailable")
        def q(s,database="postgres"):return d("exec","-i",name,"psql","-X","-Atq","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,input=s.encode()).stdout
        q("CREATE ROLE fixture_owner NOLOGIN; CREATE ROLE fixture_reader NOLOGIN;")
        q("CREATE DATABASE "+db+" OWNER fixture_owner TEMPLATE template0;")
        q("REVOKE ALL ON DATABASE "+db+" FROM PUBLIC; GRANT CONNECT ON DATABASE "+db+" TO fixture_reader;")
        q("ALTER DEFAULT PRIVILEGES FOR ROLE fixture_owner IN SCHEMA public GRANT SELECT ON TABLES TO fixture_reader;",db)
        c=v2.strict(q(v2.catalog_sql(),db));assert c["user_objects"]==0 and c["version"]=="180007"
        dump=d("exec",name,"pg_dump","-Fc","--create","-U","postgres",db).stdout
        with tempfile.TemporaryDirectory() as td:
            home=Path(td);home.chmod(0o700)
            gpg(home,"--quick-generate-key","HF094 synthetic recovery <recovery@example.invalid>","ed25519","cert","1d")
            fp=fingerprint(home);gpg(home,"--quick-add-key",fp,"cv25519","encr","1d")
            key=gpg(home,"--export",fp);o=derived();o["backup"]={"recovery_fingerprint":fp,"recovery_keyring_sha256":a.sha(key),"restore_image":image}
            reg=MemoryRegistry(key)
            with patch.dict(os.environ,{"HFT_HF094_RECOVERY_GNUPGHOME":str(home)}):
                out=v2.encrypt_restore(dump,c,o,reg,"execution/fixture/",{"source":"SYNTHETIC actual local pg_dump"},rootless=False)
                assert out["restore"]["restored_shape_sha256"]==a.sha(a.canonical(v2.restore_shape(c)))
                assert reg.read("execution/fixture/target-backup.pgp")[0]!=dump
                assert a.strict(reg.read("execution/fixture/backup-capture.json")[0])["dump_sha256"]==a.sha(dump)
            print("HF094_V2_ACTUAL_ISOLATED_ENCRYPTED_RESTORE=PASS; real local pg_dump, encryption, protected-registry fixture readback, decrypt and PG18.7 restore/catalog; NOT corporate custody")
    finally:d("rm","-f",name,check=False)

if __name__=="__main__":
    if sys.argv[1:]==["--restore"]:actual_recovery()
    else:unittest.main()
