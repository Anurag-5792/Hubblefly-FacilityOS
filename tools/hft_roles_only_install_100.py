#!/usr/bin/env python3
"""HF100 V3 AWS-free successor. No resource provisioning or runtime activation."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, importlib.util, json, os, re, shutil, stat, subprocess, sys, tempfile, uuid
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
BASE="d7d27ec86d97f4cdb83589882b6cf60b060b956d"
PROBE="273da99f04f9c0f98c691ab4c40a0744a0f48d9e"
BRANCH="engineering/hft-r1-roles-only-installer-100-v3"
WORKFLOW=".github/workflows/hft-roles-only-installer-100-v3.yml"
POLICY=ROOT/"review-candidates/hf100-v3/policy.json"
SELF=Path(__file__).resolve()
PATH="/usr/local/bin:/usr/bin:/bin"
PG=("psql","pg_dump","pg_restore","initdb","pg_ctl","postgres")
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
control=load("hf100_control",ROOT/"tools/hf100_control.py")
registry=load("hf100_registry",ROOT/"tools/hf100_registry.py")
probe=load("hf100_host_probe",ROOT/"tools/hf100-host-probe/hf100_host_probe.py")
# Only the pure accepted V2 source, provider, signature and SQL helpers are
# reused. Neither its infrastructure driver nor its executable entrypoint runs.
v2=load("hf094_v2_frozen",ROOT/"tools/hft_roles_only_install_094_v2.py")
v1=v2.load_v1()
need=control.need
sha=control.sha
canonical=control.canonical
strict=control.strict
def private(path,limit=8*1024*1024):
    need(probe.private_regular(str(path),os.geteuid()),"HF100_PRIVATE_FILE_REQUIRED")
    return v2.file_bytes(path,True,limit)
def protected(path):
    return v2.admission.root_readonly(path)
def bytes_pin(path,expected):
    raw=v2.file_bytes(path);need(sha(raw)==expected,"HF100_SOURCE_PIN_DRIFT");return raw
def inspect():
    for path,pin in (("tools/hft_roles_only_install_094_v2.py","8cc38390499f22319347d7fa3d665dba5e134afc8090e2d531e00e885da4c27a"),
     ("tools/hf094_v2_protected.py","1700b95baab9eec4dcecdeba2ef31720ad53b76dd86c4ff22083062027aad831"),
     ("tools/hf100-host-probe/hf100_host_probe.py","29e69a1948fddeb17e198a084fc074fda97945e540c7d12141d8b315e9a20b84"),
     ("tools/hf100-host-probe/test_hf100_host_probe.py","42bfa5883fdd08ca035792b01b24dba0ba024af3181949736a1d035fd3197820")):
        bytes_pin(ROOT/path,pin)
    return v1.load_package()
def run(args,*,env=None,data=None,timeout=90,check=True):
    p=subprocess.run(args,input=data,capture_output=True,env=env or {"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8"},timeout=timeout,check=False)
    if check:need(p.returncode==0,"HF100_COMMAND_FAILED_NO_RETRY:"+Path(args[0]).name)
    return p
def tool_paths(order):
    h=order["host"];paths={}
    for n in control.BINS:
        p=Path(h["pg_bin"])/n if n in PG else shutil.which(n,path=PATH)
        need(p is not None,"HF100_TOOL_MISSING:"+n)
        p=Path(p).resolve();protected(p)
        need(p.is_file() and probe.digest(p)==order["tools"][n],"HF100_TOOL_DRIFT:"+n)
        paths[n]=str(p)
    return paths
def verify_host(order):
    h=order["host"]
    need(sys.flags.isolated and sys.dont_write_bytecode and os.geteuid()==h["uid"] and os.geteuid()!=0 and sys.platform=="linux","HF100_APPROVED_NONROOT_HOST_REQUIRED")
    need(str(ROOT)==h["source_root"],"HF100_APPROVED_SOURCE_ROOT_DRIFT")
    protected(ROOT);protected(ROOT/".git");protected(SELF)
    need(probe.digest(protected(h["machine_id_path"]))==h["machine_id_sha256"] and probe.digest(protected(Path(sys.executable).resolve()))==h["python_sha256"],"HF100_HOST_IDENTITY_DRIFT")
    mf=protected(h["manifest_path"]);need(probe.digest(mf)==h["manifest_sha256"],"HF100_HOST_MANIFEST_DRIFT")
    m=strict(mf.read_bytes());control.exact(m,("schema","files"))
    need(m["schema"]=="HF100_ROOT_OWNED_TOOLCHAIN_V1" and isinstance(m["files"],dict) and len(m["files"])>=len(control.BINS)+1,"HF100_TOOLCHAIN_MANIFEST_REQUIRED")
    for path,pin in m["files"].items():need(control.pin(pin) and probe.digest(protected(path))==pin,"HF100_DEPENDENCY_DRIFT")
    paths=tool_paths(order)
    need(all(m["files"].get(paths[n])==order["tools"][n] for n in paths) and m["files"].get(str(Path(sys.executable).resolve()))==h["python_sha256"],"HF100_TOOLCHAIN_NOT_PINNED")
    for n in PG:
        p=run([paths[n],"--version"])
        need(probe.pg18({"available":True,"version_exit":p.returncode,"version":p.stdout.decode()}),"HF100_PG18_TOOL_REQUIRED")
    # Same identity mapping, nonroot inside the new namespace. Do not use
    # -r (root-mapped) for initdb.
    p=run([paths["unshare"],"--user","--map-current-user","--net","--",str(Path(sys.executable).resolve()),"-IB","-c","import os; print(os.geteuid())"])
    need(p.stdout.decode().strip()==str(h["uid"]),"HF100_NATIVE_ISOLATION_UNAVAILABLE")
    return paths,{"kind":h["kind"],"host_id":h["host_id"],"uid":h["uid"],"machine_id_sha256":h["machine_id_sha256"],"toolchain_sha256":h["manifest_sha256"]}
def source(order,paths):
    def git(*args):
        return run([paths["git"],"-c","safe.directory="+str(ROOT),"-c","core.hooksPath=/dev/null","-C",str(ROOT),*args],
          env={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8","GIT_CONFIG_NOSYSTEM":"1","GIT_CONFIG_GLOBAL":"/dev/null"}).stdout.decode().strip()
    need(git("rev-parse","HEAD")==order["installer_source_commit"] and git("rev-parse","HEAD^{tree}")==order["installer_source_tree"] and git("merge-base",PROBE,"HEAD")==PROBE and not git("status","--porcelain","--untracked-files=no"),"HF100_CHECKOUT_NOT_SIGNED_CLEAN_SOURCE")
    allowed={"tools/hft_roles_only_install_100.py","tools/hf100_control.py","tools/hf100_registry.py","tools/hf100_native_restore.py","tests/test_hf100_installer.py","tests/postgres/hf100_guarded_fixture.py",WORKFLOW}
    changes=git("diff","--name-only",PROBE,"HEAD").splitlines()
    need(changes and all(p in allowed or p.startswith("review-candidates/hf100-v3/") for p in changes),"HF100_UNRELATED_SOURCE_DIFF")
    for path in git("ls-files").splitlines():protected(ROOT/path)
def accepted_refs(order):
    for field,marker,pin_field in (("security","HF100_V3_SECURITY=ACCEPT","security_acceptance_sha256"),("key_policy","HF094_OWNER_KEY_POLICY=ACCEPT","key_policy_sha256")):
        c=v2.gh("/issues/comments/"+str(order[field+"_comment_id"]));body=c.get("body")
        need(c.get("html_url")==order[field+"_ref"] and isinstance(body,str) and sha(body.encode())==order[pin_field] and marker in body.splitlines(),"HF100_ACCEPTANCE_REFERENCE_DRIFT")
        expected="HEAD="+order["installer_source_commit"] if field=="security" else "FINGERPRINT="+v2.OWNER
        need(expected in body.splitlines(),"HF100_ACCEPTANCE_IDENTITY_DRIFT")
        if field=="key_policy":need("VALID_UNTIL="+v2.MAX_VALIDITY in body.splitlines(),"HF100_KEY_POLICY_WINDOW")
def ci(order):
    specs=[(46033975835,v1.APP,".github/workflows/hft-stores-source.yml",("Verify source contracts and production build","C050 mounted React scope regression (CI-local synthetic P3)","Live Masters mounted workspace regression (CI-local synthetic records)","Hosted role history security regression (CI-local synthetic records)","Production dependency audit (moderate or above)","Full dependency tree advisory scan (high or above)")),
     (46036474589,v2.V1_COMMIT,".github/workflows/hft-roles-only-installer-094.yml",("Inspect exact installer bytes and application baseline","PostgreSQL 18.7 disposable parser, ACL, rollback and negative postflight")),
     (46053920946,BASE,v2.WORKFLOW,("Verify immutable V1 and owner V2 guards","Execute disposable PostgreSQL ACL and rollback campaign","Execute isolated encrypted recovery fixture","Execute V2 guarded assembly and terminal receipt campaign")),
     (order["ci_run_id"],order["installer_source_commit"],WORKFLOW,("Verify frozen source and HF100 guards","Execute PostgreSQL 18 guarded registry and installation campaign"))]
    out=[]
    for n,head,path,steps in specs:
        r=v2.gh("/actions/runs/"+str(n));j=v2.gh("/actions/runs/"+str(n)+"/attempts/"+str(r["run_attempt"])+"/jobs?per_page=100")
        out.append(v2.check_ci_run(r,j,head,path,steps))
    c=v2.gh("/git/commits/"+order["installer_source_commit"])
    need(c.get("sha")==order["installer_source_commit"] and c.get("tree",{}).get("sha")==order["installer_source_tree"],"HF100_REMOTE_SOURCE_DRIFT")
    return out
def transport(order,paths,passfile,ca,directory):
    need(os.environ.get("HFT_ENVIRONMENT")=="retained-stores-nonproduction" and os.environ.get("HFT_LIVE_POSTING_ENABLED")=="false" and os.environ.get("VERCEL_ENV") is None,"HF100_NONPRODUCTION_HOST_REQUIRED")
    need(probe.private_regular(passfile,os.geteuid()),"HF100_PRIVATE_PASSFILE_REQUIRED")
    raw=bytes_pin(Path(ca),order["ca_sha256"])
    for k in ("PGHOSTADDR","PGSERVICE","PGSERVICEFILE","PGOPTIONS","PGPASSWORD","PGSSLCERT","PGSSLKEY","DATABASE_URL","POSTGRES_URL"):
        need(not os.environ.get(k),"HF100_AMBIENT_ROUTING_DENIED")
    t=v1.TARGET
    # Passfile and CA are copied to the private session directory to eliminate
    # path substitution between probe, dump and installer connections.
    pp=Path(directory)/"pass";pp.write_bytes(private(passfile,65536));pp.chmod(0o600)
    cp=Path(directory)/"ca.pem";cp.write_bytes(raw);cp.chmod(0o600)
    args=SimpleNamespace(connect=True,ca=str(cp),ca_sha256=order["ca_sha256"],passfile=str(pp),host=t["host"],port=t["port"],database=t["database"],user=t["installer"],oid=t["database_oid"])
    tools={n:{"available":True,"version_exit":0,"version":run([paths[n],"--version"]).stdout.decode(),"path":paths[n]} for n in probe.CLIENTS}
    result=probe.connect_probe(args,tools,os.geteuid())
    need(result.get("pass") is True,"HF100_STRICT_WIRE_PROBE_DENIED")
    env={"PATH":PATH,"HOME":directory,"LANG":"C.UTF-8","PGHOST":t["host"],"PGPORT":str(t["port"]),"PGDATABASE":t["database"],"PGUSER":t["installer"],
       "PGPASSFILE":str(pp),"PGSSLMODE":"verify-full","PGSSLROOTCERT":str(cp),"PGCHANNELBINDING":"require","PGCONNECT_TIMEOUT":"10","PGAPPNAME":"hf100-roles-only-installer"}
    return env,result

class Pg:
    def __init__(self,target,paths,env):self.target=target;self.paths=paths;self.env=env
    def exec(self,sql):
        t=self.target
        return run([self.paths["psql"],"-X","-w","-Atq","-v","ON_ERROR_STOP=1","-h",t["host"],"-p",str(t["port"]),"-U",t["installer"],"-d",t["database"]],
          env=self.env,data=sql.encode(),timeout=180).stdout.decode().strip()
    def wire(self):
        t=self.target
        out=self.exec("\\conninfo\nBEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+v2.catalog_sql()+"COMMIT;").splitlines()
        ssl=[l for l in out if re.search(r"SSL connection \(protocol: TLSv1\.[23], cipher: [A-Za-z0-9_-]+",l)]
        rows=[l for l in out if l.startswith("{")]
        need(len(ssl)==1 and len(rows)==1,"HF100_ACTUAL_CLIENT_TLS_REQUIRED")
        c=strict(rows[0]);need(c["database"]==t["database"] and c["oid"]==str(t["database_oid"]) and c["session"]==c["current"]==c["owner"]==t["installer"] and c["version"]==str(t["server_version_num"]) and c["replica"] is False and c["port"]==t["port"] and c["address"],"HF100_WIRE_IDENTITY_MISMATCH")
        return c,{"client_tls":ssl[0],"verify_full":self.env["PGSSLMODE"],"channel_binding":self.env["PGCHANNELBINDING"],"catalog_sha256":sha(canonical(c))}
    def shape(self):
        return strict(self.exec("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+registry.privilege_gate(self.target)+registry.SHAPE.strip()+";\nCOMMIT;"))
    def claim(self,baseline,raw):
        need(sha(raw) in self.exec(registry.bootstrap(self.target,v2.CATALOG,baseline,raw)).splitlines(),"HF100_DB_CLAIM_UNCERTAIN_NO_RETRY")
    def append(self,raw):
        need(sha(raw) in self.exec("BEGIN ISOLATION LEVEL SERIALIZABLE;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+registry.privilege_gate(self.target)+registry.append_sql(raw)+"COMMIT;").splitlines(),"HF100_DB_RECEIPT_UNCERTAIN")
    def dump(self):
        t=self.target
        return run([self.paths["pg_dump"],"-w","-Fc","--create","-h",t["host"],"-p",str(t["port"]),"-U",t["installer"],"-d",t["database"]],env=self.env,timeout=180).stdout
def native_restore(paths,dump,cat,shape):
    roles=sorted(set(v2.role_names(cat))|{registry.OWNER})
    with tempfile.TemporaryDirectory(prefix="hf100-recovery-") as tmp:
        d=Path(tmp);d.chmod(0o700)
        (d/"target.dump").write_bytes(dump)
        request={"paths":{k:paths[k] for k in PG},"database":cat["database"],"catalog":v2.catalog_sql(),"shape":registry.SHAPE.strip()+";",
          "roles":roles,"parent_net":str(Path("/proc/self/ns/net").readlink())}
        p=d/"request.json";p.write_bytes(canonical(request))
        result=strict(run([paths["unshare"],"--user","--map-current-user","--net","--",str(Path(sys.executable).resolve()),"-IB",str(ROOT/"tools/hf100_native_restore.py"),str(p)],
          env={"PATH":PATH,"HOME":tmp,"LANG":"C.UTF-8"},timeout=300).stdout)
    need(result["network_namespace"]!=request["parent_net"] and result["unix_socket_only"] is True and result["uid"]==os.geteuid() and v2.restore_shape(result["catalog"])==v2.restore_shape(cat) and result["registry"]==shape,"HF100_ACTUAL_RESTORE_MISMATCH")
    return {"catalog_sha256":sha(canonical(v2.restore_shape(result["catalog"]))),"registry_sha256":sha(canonical(result["registry"])),"dump_sha256":sha(dump),"native_isolated":True}
def capture(pg,order,custody,paths,cat,shape,key,attempt,claim_ref,restore=native_restore):
    # Fresh actual dump from the same pinned target, no user-provided dump.
    _,keys=custody.authority();dump=pg.dump()
    need(dump.startswith(b"PGDMP") and len(dump)<=32*1024*1024,"HF100_TARGET_DUMP_INVALID")
    fp=order["backup"]["recovery_fingerprint"]
    genv={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8"}
    with tempfile.TemporaryDirectory(prefix="hf100-encrypt-") as tmp:
        p=Path(tmp)/"recovery.gpg";p.write_bytes(keys["recovery_keyring"])
        run([paths["gpg"],"--homedir",tmp,"--batch","--no-tty","--import",str(p)],env=genv)
        lines=run([paths["gpg"],"--homedir",tmp,"--batch","--with-colons","--list-keys"],env=genv).stdout.decode().splitlines()
        primary=[];want=False
        for l in lines:
            f=l.split(":")
            if f[0]=="pub":want=True
            elif f[0]=="fpr" and want:primary.append(f[9]);want=False
        need(primary==[fp],"HF100_RECOVERY_KEY_BINDING_DENIED")
        cipher=run([paths["gpg"],"--homedir",tmp,"--batch","--no-tty","--trust-model","always","--recipient",fp,"--encrypt"],env=genv,data=dump,timeout=120).stdout
    original=custody.put_once("target-backup.pgp",cipher)
    got,ref=custody.read("target-backup.pgp");need(got==cipher and ref==original,"HF100_BACKUP_READBACK_DENIED")
    record=control.seal(key,order,attempt,"BACKUP_CAPTURE",claim_ref["sha256"],{"original":original,"target":pg.target,"dump_sha256":sha(dump),"catalog_sha256":sha(canonical(cat)),"registry_sha256":sha(canonical(shape)),"pg_dump_sha256":order["tools"]["pg_dump"]})
    receipt=custody.put_once("backup-capture.json",record)
    home=Path(os.environ.get("HFT_HF094_RECOVERY_GNUPGHOME",""))
    need(home.is_absolute() and home.is_dir() and not home.is_symlink() and home.stat().st_uid==os.geteuid() and not home.stat().st_mode&0o077,"HF100_RECOVERY_HOME_DENIED")
    p=run([paths["gpg"],"--homedir",str(home),"--batch","--no-tty","--no-auto-key-retrieve","--status-fd","2","--decrypt"],env=genv,data=got,timeout=120,check=False)
    lines=p.stderr.decode(errors="replace");ids=[l.split() for l in lines.splitlines() if l.startswith("[GNUPG:] DECRYPTION_KEY ")]
    need(p.returncode==0 and "[GNUPG:] DECRYPTION_OKAY" in lines and len(ids)==1 and len(ids[0])>=4 and ids[0][3]==fp and p.stdout==dump,"HF100_DECRYPTION_READBACK_DENIED")
    return {"original":original,"capture":receipt,"restore":restore(paths,p.stdout,cat,shape),"recovery_fingerprint":fp}
def assemble(sql,plan,order,cat,shape,prepared_sha,target):
    statement=v1.build_transaction(sql,plan,order["owner_order_sha256"],prepared_sha,order["expires_at"])
    need(statement.count(sql[v1.FILES[0]])==1,"HF100_FROZEN_SQL_ASSEMBLY_DENIED")
    return statement.replace(sql[v1.FILES[0]],registry.equality_gate(v2.CATALOG,cat,"HF100_PRE_DDL_BASELINE_DRIFT")+registry.install_fence(target,shape)+sql[v1.FILES[0]])
def verify_chain(pg,custody,key,raws,refs):
    shape=pg.shape();registry.verify_shape(shape,pg.target);registry.check_rows(shape,raws)
    for raw in raws:
        r=control.unseal(key,raw)
        name={"CLAIM":"claim.json","PREPARED":"prepared.json","TERMINAL":"terminal.json"}[r["phase"]]
        got,ref=custody.read(name);need(got==raw and ref["sha256"]==sha(raw) and ref==refs[name],"HF100_DUAL_CUSTODY_DRIFT")
    return shape
def guarded_apply(pg,custody,order,key,host,ci_result,provider,authorize,backup,sql,plan):
    # All production calls reach here only after genuine owner signature and
    # exact host/CI/target checks. No public flag permits fixture substitutions.
    authorize();custody.absent()
    base,tls=pg.wire();v2.fresh(base,pg.target)
    need(sha(canonical(base))==order["baseline_sha256"],"HF100_SIGNED_BASELINE_DRIFT")
    attempt=str(uuid.uuid4())
    claim=control.seal(key,order,attempt,"CLAIM",None,{"host":host,"provider":order["provider_evidence"],"baseline_sha256":sha(canonical(base))})
    raws=[];refs={};claimed=False;ddl=False;committed=False
    # Drive intent first is an external witness if the database is restored.
    # Drive create isn't atomic; the serializable fixed-target DB claim is.
    # Any missing/uncertain evidence is terminal. Never clean/reset/retry.
    try:
        anchor=custody.put_once("claim.json",claim);refs["claim.json"]=anchor
        authorize();pg.claim(base,claim);claimed=True;raws.append(claim)
        c,tls=pg.wire();registry.check_delta(base,c)
        shape=verify_chain(pg,custody,key,raws,refs)
        recovery=backup(c,shape,attempt,anchor)
        again,_=pg.wire();need(again==c,"HF100_BASELINE_CHANGED_DURING_RECOVERY")
        need(verify_chain(pg,custody,key,raws,refs)==shape,"HF100_REGISTRY_CHANGED_DURING_RECOVERY")
        auth=authorize();need(provider()==order["provider_evidence"],"HF100_PROVIDER_DRIFT")
        prepared=control.seal(key,order,attempt,"PREPARED",sha(claim),{"claim":anchor,"ci":ci_result,"authority":auth,"wire":tls,"recovery":recovery,"catalog_sha256":sha(canonical(c))})
        pref=custody.put_once("prepared.json",prepared);refs["prepared.json"]=pref;pg.append(prepared);raws.append(prepared)
        final_shape=verify_chain(pg,custody,key,raws,refs)
        final,_=pg.wire();need(final==c,"HF100_PRE_DDL_BASELINE_DRIFT")
        # Recheck actual encrypted original and authenticated capture, not just
        # an earlier successful restore receipt.
        enc,eref=custody.read("target-backup.pgp");cap,cref=custody.read("backup-capture.json")
        caprecord=control.unseal(key,cap)
        need(eref==recovery["original"] and cref==recovery["capture"] and sha(enc)==eref["sha256"] and
          caprecord["phase"]=="BACKUP_CAPTURE" and caprecord["previous_sha256"]==sha(claim) and caprecord["data"]["original"]==eref and
          caprecord["data"]["dump_sha256"]==recovery["restore"]["dump_sha256"],"HF100_BACKUP_CUSTODY_DRIFT")
        authorize();need(provider()==order["provider_evidence"],"HF100_PRE_DDL_PROVIDER_DRIFT")
        statement=assemble(sql,plan,order,c,final_shape,pref["sha256"],pg.target)
        ddl=True
        need("HF094_ROLES_ONLY_CATALOG_ACL_PASS" in pg.exec(statement).splitlines(),"HF100_COMMIT_UNCERTAIN_NO_RETRY")
        committed=True
        post=pg.exec("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[v1.FILES[2]]+"\nCOMMIT;")
        need(post=="HF094_ROLES_ONLY_CATALOG_ACL_PASS" and verify_chain(pg,custody,key,raws,refs)==final_shape,"HF100_POSTFLIGHT_UNCONFIRMED")
        terminal=control.seal(key,order,attempt,"TERMINAL",sha(prepared),{"state":"COMMITTED_CATALOG_READBACK","prepared":pref,"postflight_sha256":sha(post.encode()),"runtime_login_enabled":False})
        pg.append(terminal);raws.append(terminal);ref=custody.put_once("terminal.json",terminal);refs["terminal.json"]=ref;verify_chain(pg,custody,key,raws,refs)
        return ref
    except BaseException:
        state="COMMIT_OBSERVED_POSTFLIGHT_OR_CUSTODY_UNCONFIRMED" if committed else "SQL_OUTCOME_UNCERTAIN_NO_RETRY" if ddl else "FAILED_BEFORE_DDL_NO_RETRY"
        # A failed claim call may have committed. No new claim is attempted.
        # Don't append a conflicting terminal if an earlier terminal write was
        # uncertain. The existing DB and Drive witnesses keep execution blocked.
        try:
            if claimed and len(raws)<3 and control.unseal(key,raws[-1])["phase"]!="TERMINAL":
                terminal=control.seal(key,order,attempt,"TERMINAL",sha(raws[-1]),{"state":state})
                pg.append(terminal);custody.put_once("terminal.json",terminal)
            elif not claimed:
                got,_=custody.read("claim.json")
                if got==claim:
                    terminal=control.seal(key,order,attempt,"TERMINAL",sha(claim),{"state":"CLAIM_UNCERTAIN_NO_DDL"})
                    custody.put_once("terminal.json",terminal)
        except BaseException:raise RuntimeError("HF100_TERMINAL_CUSTODY_UNCONFIRMED_NO_RETRY") from None
        raise RuntimeError("HF100_"+state) from None
def main():
    p=argparse.ArgumentParser(description=__doc__);g=p.add_mutually_exclusive_group(required=True)
    for mode in ("inspect","qualify","apply"):g.add_argument("--"+mode,action="store_true")
    for n in ("owner-order","owner-signature","machine-contract","passfile","ca","receipt-key"):p.add_argument("--"+n)
    a=p.parse_args();manifest,sql,plan=inspect()
    if a.inspect:
        for path in (SELF,ROOT/"tools/hf100_control.py",ROOT/"tools/hf100_registry.py",ROOT/"tools/hf100_native_restore.py",POLICY):print(str(path.relative_to(ROOT))+" SHA256="+sha(path.read_bytes()))
        print("HF100_FROZEN_V2_SQL_PROBE_VERIFIED; NO CONNECTION");return
    need(all((a.owner_order,a.owner_signature,a.machine_contract,a.passfile,a.ca,a.receipt_key)),"HF100_SIGNED_ORDER_AND_PRIVATE_INPUTS_REQUIRED")
    for n in ("SSL_CERT_FILE","SSL_CERT_DIR","REQUESTS_CA_BUNDLE","CURL_CA_BUNDLE","LD_PRELOAD","LD_LIBRARY_PATH","GIT_CONFIG_COUNT","GIT_CONFIG_PARAMETERS"):
        need(not os.environ.get(n),"HF100_AMBIENT_TRUST_OVERRIDE_DENIED")
    os.environ["PATH"]=PATH
    raw=private(a.owner_order);sig=private(a.owner_signature);contract=private(a.machine_contract)
    order=control.combined(raw,contract,v1,sha(SELF.read_bytes()),sha(POLICY.read_bytes()))
    paths,host=verify_host(order);source(order,paths)
    key=private(a.receipt_key,64);need(len(key)==32 and sha(key)==order["receipt_key_sha256"],"HF100_RECEIPT_KEY_PIN_DENIED")
    c=order["control"];d=order["custody"]
    custody=control.RegistryDrive(order,control.Drive(os.environ.get("HFT_HF100_DRIVE_CONTROL_TOKEN",""),c["reader_permission_id"]),control.Drive(os.environ.get("HFT_HF100_DRIVE_CUSTODY_TOKEN",""),d["writer_permission_id"]))
    def authorize():
        refs,keys=custody.authority()
        owner=v2.verify_owner(raw,sig,keys["owner_keyring"],order)
        return {"control":refs,"owner":owner}
    host["owner"]=authorize();accepted_refs(order);ci_result=ci(order)
    prov=v2.provider(order,v1);order["provider_evidence"]=prov
    with tempfile.TemporaryDirectory(prefix="hf100-transport-") as tmp:
        env,proof=transport(order,paths,a.passfile,a.ca,tmp);host["probe"]=proof
        pg=Pg(v1.TARGET,paths,env)
        if a.qualify:
            custody.absent();cat,_=pg.wire();v2.fresh(cat,v1.TARGET);need(sha(canonical(cat))==order["baseline_sha256"],"HF100_SIGNED_BASELINE_DRIFT");authorize()
            print("HF100_READONLY_PRECHECK_PASS; NO CLAIM, DUMP, RESTORE OR DDL");return
        result=guarded_apply(pg,custody,order,key,host,ci_result,lambda:v2.provider(order,v1),authorize,
            lambda cat,shape,attempt,anchor:capture(pg,order,custody,paths,cat,shape,key,attempt,anchor),sql,plan)
        print("HF100_COMMITTED_AND_POSTFLIGHT_READ_BACK="+result["sha256"]+"; RUNTIME_DISABLED")
if __name__=="__main__":
    try:main()
    except RuntimeError as e:
        print("HF100_STOP="+str(e),file=sys.stderr);sys.exit(1)
    except BaseException:
        print("HF100_STOP=UNVERIFIED_OR_UNCERTAIN_NO_RETRY",file=sys.stderr);sys.exit(1)
