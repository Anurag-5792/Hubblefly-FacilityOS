"""HF094 V2 negative guards and actual isolated encrypted recovery. Synthetic only."""
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
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hf094_v2",ROOT/"tools/hft_roles_only_install_094_v2.py")
v2=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
v1=v2.load_v1()
manifest,sql,plan=v1.load_package()
now=dt.datetime(2026,11,28,tzinfo=dt.timezone.utc)

def fixture_order():
    return {"schema":v2.ORDER_SCHEMA,"owner_primary_fingerprint":v2.OWNER,"order_id":"00000000-0000-4000-8000-000000000001",
      "authorized_action":v1.ACTION,"target":dict(v1.TARGET),"application_source_commit":v1.APP,"application_source_tree":v1.APP_TREE,
      "installer_source_commit":"a"*40,"installer_source_tree":"b"*40,"v1_commit":v2.V1_COMMIT,"v1_runner_sha256":v2.V1_SHA,
      "v2_runner_sha256":v2.digest(v2.file_bytes(v2.V2_PATH)),"policy_sha256":v2.digest(v2.policy_bytes()),"installer_manifest_sha256":v1.MANIFEST_SHA,
      "canonical_manifest_sha256":v1.CANONICAL_SHA,"sql_sha256":{x["path"]:x["sha256"] for x in manifest["files"]},
      "issued_at":"2026-11-27T00:00:00Z","expires_at":"2026-12-01T00:00:00Z","ci_run_id":999,
      "status_sha256":"c"*64,"ca_sha256":"d"*64,"provider_database_id":860001,
      "backup":{"drive_file_id":"fixture_file","drive_folder_id":"fixture_folder","ciphertext_sha256":"e"*64,"plaintext_sha256":"f"*64,
      "recovery_fingerprint":"A"*40,"restore_image":"postgres@sha256:"+"9"*64},"evidence_folder_id":"fixture_evidence","tools":{k:"1"*64 for k in v2.BINS}}

def gpg(home,*args,input=None):
    p=subprocess.run(["gpg","--homedir",str(home),"--batch","--no-tty","--pinentry-mode","loopback","--passphrase","",*args],input=input,capture_output=True,check=True,timeout=60)
    return p.stdout

def fingerprint(home):
    raw=gpg(home,"--with-colons","--list-keys").decode()
    return next(x.split(":")[9] for x in raw.splitlines() if x.startswith("fpr:"))

class Guard(unittest.TestCase):
    def test_exact_owner_scope_and_frozen_artifacts(self):
        o=fixture_order();v2.validate_order(o,v1,manifest,now)
        changes=[{"authorized_action":"PRODUCTION"},{"owner_primary_fingerprint":"B"*40},{"target":{**v1.TARGET,"database_oid":99}},
          {"target":{**v1.TARGET,"database":"other"}},{"sql_sha256":{}},{"v1_runner_sha256":"f"*64},{"v2_runner_sha256":"e"*64},
          {"policy_sha256":"d"*64},{"expires_at":"2027-01-01T00:00:00Z"},{"expires_at":"2026-11-27T01:00:00Z"},
          {"provider_database_id":1},{"application_source_commit":"a"*40},{"status_sha256":"0"*64},{"ci_run_id":True},
          {"backup":{**o["backup"],"restore_image":"postgres:latest"}},{"technical_status":"APPROVED"},{"restore_verified":True}]
        for x in changes:
            with self.subTest(x=x),self.assertRaises((RuntimeError,ValueError,TypeError)):
                v2.validate_order({**o,**x},v1,manifest,now)
        self.assertEqual(v2.digest(v2.file_bytes(v2.V1_PATH)),v2.V1_SHA)
        self.assertEqual(v1.TECHNICAL_REVIEWER_PUBKEY_SHA256,"")

    def test_unsigned_never_connects(self):
        with patch("sys.argv",["hf094","--apply"]),patch.object(v2,"remote",side_effect=AssertionError("network")),patch.object(v2,"wire",side_effect=AssertionError("SQL")):
            with self.assertRaisesRegex(RuntimeError,"SIGNED_ORDER"):
                v2.main()

    def test_duplicate_json_and_remote_host_denied(self):
        with self.assertRaisesRegex(RuntimeError,"DUPLICATE"):v2.strict(b'{"state":"STOP","state":"ACTIVE"}')
        for u in ("http://api.github.com/x","https://outside.invalid/x","https://api.github.com:444/x","https://token@api.github.com/x"):
            with self.assertRaisesRegex(RuntimeError,"REMOTE_HOST"):v2.remote(u,"synthetic")

    def test_actual_owner_signature_and_wrong_key(self):
        with tempfile.TemporaryDirectory() as td:
            h=Path(td);h.chmod(0o700)
            gpg(h,"--quick-generate-key","HF094 synthetic signer <fixture@example.invalid>","ed25519","sign","1d")
            fp=fingerprint(h)
            current=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
            fmt=lambda t:t.strftime("%Y-%m-%dT%H:%M:%SZ")
            order={**fixture_order(),"issued_at":fmt(current-dt.timedelta(seconds=10)),"expires_at":fmt(current+dt.timedelta(minutes=20))}
            raw=v2.canonical(order);p=h/"order";p.write_bytes(raw)
            gpg(h,"--local-user",fp,"--output",str(h/"sig"),"--detach-sign",str(p))
            sig=(h/"sig").read_bytes();key=gpg(h,"--export",fp)
            with self.assertRaisesRegex(RuntimeError,"OWNER_SIGNATURE_DENIED"):v2.verify_owner(raw,sig,key,order,current)
            with patch.object(v2,"OWNER",fp):
                self.assertEqual(v2.verify_owner(raw,sig,key,order,current)["fingerprint"],fp)
                with self.assertRaisesRegex(RuntimeError,"OWNER_SIGNATURE_DENIED"):v2.verify_owner(raw+b" ",sig,key,order,current)

    def test_ci_checks_exact_head_steps_and_provider(self):
        sha="a"*40;path=v2.WORKFLOW;steps=("Verify immutable V1 and owner V2 guards","Execute isolated encrypted recovery fixture")
        r={"id":9,"head_sha":sha,"path":path,"event":"push","status":"completed","conclusion":"success","repository":{"id":v2.REPO_ID}}
        j={"total_count":1,"jobs":[{"id":12,"head_sha":sha,"status":"completed","conclusion":"success","steps":[{"name":x,"conclusion":"success"} for x in steps]}]}
        self.assertEqual(v2.check_ci_run(r,j,sha,path,steps)["job"],12)
        for change in ({"head_sha":"b"*40},{"conclusion":"failure"},{"event":"pull_request"},{"repository":{"id":0}}):
            with self.assertRaisesRegex(RuntimeError,"CI_RUN"):v2.check_ci_run({**r,**change},j,sha,path,steps)
        with self.assertRaisesRegex(RuntimeError,"CI_REQUIRED_STEP"):v2.check_ci_run(r,j,sha,path,steps+("unexecuted",))
        t=v1.TARGET;e={"id":t["endpoint"],"project_id":t["project"],"branch_id":t["branch"],"host":t["host"],"disabled":False,"type":"read_write"}
        d={"id":860001,"name":t["database"],"branch_id":t["branch"],"owner_name":t["installer"]}
        self.assertEqual(v2.check_provider(e,[d],t,860001)["database"],d)
        for patch_values in ({"branch_id":"wrong"},{"host":"wrong"},{"disabled":True}):
            with self.assertRaisesRegex(RuntimeError,"ENDPOINT"):v2.check_provider({**e,**patch_values},[d],t,860001)
        with self.assertRaisesRegex(RuntimeError,"DATABASE"):v2.check_provider(e,[{**d,"id":1}],t,860001)

    def test_current_stop_pin_and_expiry(self):
        o=fixture_order();st={"schema":"HF094_V2_CURRENT_STATUS","order_id":o["order_id"],"state":"ACTIVE","owner_primary_fingerprint":v2.OWNER,"expires_at":o["expires_at"]}
        raw=v2.canonical(st);o["status_sha256"]=v2.digest(raw)
        ref={"object":{"sha":"a"*40}};import base64
        x={"encoding":"base64","path":v2.STATUS_PATH,"content":base64.b64encode(raw).decode()}
        with patch.object(v2,"gh",side_effect=[ref,x]),patch.object(v2,"lifetime",lambda _:None):self.assertEqual(v2.check_stop(o)["sha256"],o["status_sha256"])
        stop={**x,"content":base64.b64encode(v2.canonical({**st,"state":"STOP"})).decode()}
        with patch.object(v2,"gh",side_effect=[ref,stop]):
            with self.assertRaisesRegex(RuntimeError,"STOP_OR_REVOCATION"):v2.check_stop(o)

    def test_real_restore_shape_and_evidence_replay(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);a,b=v2.write_once(p,"evidence.json",{"phase":"PREPARED"})
            self.assertEqual(v2.digest(b),a)
            with self.assertRaises(FileExistsError):v2.write_once(p,"evidence.json",{"phase":"REPLAY"})
        with self.assertRaisesRegex(RuntimeError,"CUSTOM_FORMAT"):v2.restore_actual(b"not-a-dump",{},"postgres:fixture")
        with patch.object(v2,"drive",return_value=b'{"files":[{"id":"prior"}]}'),patch.object(v2,"private_folder"):
            with self.assertRaisesRegex(RuntimeError,"REPLAY"):v2.remote_evidence(fixture_order(),"PREPARED",b"evidence")

def actual_recovery():
    """Run actual pg_dump -> encrypted bytes -> gpg decrypt -> isolated pg_restore.
    Drive retrieval is synthetic in this fixture; no provider credentials or data."""
    docker=v2.binary("docker")
    def d(*args,input=None,check=True):return subprocess.run([docker,*args],input=input,capture_output=True,check=check,timeout=180)
    d("pull","postgres:18.7")
    image=json.loads(d("image","inspect","postgres:18.7","--format","{{json .RepoDigests}}").stdout)[0]
    assert image.startswith("postgres@sha256:")
    name="hf094-v2-source-fixture-"+uuid.uuid4().hex
    db="hft_r1_disposable_v2backup"
    try:
        d("run","-d","--rm","--network","none","--name",name,"-e","POSTGRES_HOST_AUTH_METHOD=trust",image)
        for _ in range(60):
            if d("exec",name,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError("fixture database unavailable")
        def q(s,database="postgres"):
            return d("exec","-i",name,"psql","-X","-Atq","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,input=s.encode()).stdout
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
            cipher=gpg(home,"--trust-model","always","--recipient",fp,"--encrypt",input=dump)
            o=fixture_order();o["backup"]={**o["backup"],"ciphertext_sha256":v2.digest(cipher),"plaintext_sha256":v2.digest(dump),"recovery_fingerprint":fp,"restore_image":image}
            b=o["backup"]
            def fake_drive(path,**kwargs):
                if path.endswith("?alt=media"):return cipher
                if path.startswith("files/"+b["drive_file_id"]+"?"):
                    return v2.canonical({"id":b["drive_file_id"],"parents":[b["drive_folder_id"]],"trashed":False,"size":str(len(cipher)),"permissions":[{"type":"user","role":"owner"}]})
                if path.startswith("files/"+b["drive_folder_id"]+"?"):
                    return v2.canonical({"id":b["drive_folder_id"],"mimeType":"application/vnd.google-apps.folder","trashed":False,"permissions":[{"type":"user","role":"owner"}]})
                raise RuntimeError("unexpected fixture drive call")
            with patch.object(v2,"drive",side_effect=fake_drive),patch.dict(os.environ,{"HFT_HF094_RECOVERY_GNUPGHOME":str(home)}):
                out=v2.recover(o,c)
                assert out["restore"]["restored_shape_sha256"]==v2.digest(v2.canonical(v2.restore_shape(c)))
                with unittest.TestCase().assertRaisesRegex(RuntimeError,"ENCRYPTED_ORIGINAL_HASH_MISMATCH"):
                    v2.recover({**o,"backup":{**b,"ciphertext_sha256":"0"*64}},c)
            print("HF094_V2_ACTUAL_ISOLATED_ENCRYPTED_RESTORE=PASS; actual encryption/decryption, custom dump and PG18.7 restore/catalog/ACL comparison; Drive transport synthetic only")
    finally:d("rm","-f",name,check=False)

if __name__=="__main__":
    if sys.argv[1:]==["--restore"]:actual_recovery()
    else:unittest.main()
