#!/usr/bin/env python3
"""HF094 V2 corrected owner-governed candidate; one original HF11 signature.
Protected registry and approved host must exist and independently qualify.
No resource provisioning, local/Drive fallback, or actual admission by source.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import stat
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[1]
V1_COMMIT="5739772d850cbaba5cd8e5256d56430ce78d80df"
V1_SHA="92c0bcd00e9974d9676dd0f9dbabb120706c8cf19bc645476a55ead95bd00d56"
OWNER="7C2FED6F5C4288AB5BA2662BC26C479D6885C73C"
MAX_VALIDITY="2026-12-26T18:29:59Z"
REPO="Anurag-5792/Hubblefly-FacilityOS"
REPO_ID=1374507425
BRANCH="engineering/hft-r1-roles-only-installer-094-v2"
WORKFLOW=".github/workflows/hft-roles-only-installer-094-v2.yml"
ORDER_SCHEMA="HF11_HFT_R1_OWNER_ONLY_STANDING_HF094_V2"
HEX=re.compile(r"[0-9a-f]{64}\Z")
SHA=re.compile(r"[0-9a-f]{40}\Z")
ID=re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
FP=re.compile(r"[0-9A-F]{40}\Z")
BINS=("git","gpgv","gpg","psql","pg_dump","docker","aws")
PATH="/usr/local/bin:/usr/bin:/bin"
POLICY_PATH=ROOT/"review-candidates/hf094-owner-only-v2/policy.json"
V1_PATH=ROOT/"tools/hft_roles_only_install_094.py"
V2_PATH=Path(__file__).resolve()

def fail(code):
    raise RuntimeError(code)

def digest(b):
    return hashlib.sha256(b).hexdigest()

def canonical(x):
    return (json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()

def strict(raw):
    def pairs(xs):
        d={}
        for k,v in xs:
            if k in d: fail("V2_DUPLICATE_JSON_KEY")
            d[k]=v
        return d
    d=json.loads(raw,object_pairs_hook=pairs)
    if not isinstance(d,dict): fail("V2_JSON_OBJECT_REQUIRED")
    return d

def exact(x,keys):
    if not isinstance(x,dict) or set(x)!=set(keys): fail("V2_EXACT_FIELDS_REQUIRED")

def hex64(x):
    return isinstance(x,str) and HEX.fullmatch(x) is not None and x!="0"*64

def file_bytes(path,private=False,limit=8*1024*1024):
    p=Path(path)
    if not p.is_absolute() or p.is_symlink() or not p.is_file(): fail("V2_FILE_UNTRUSTED")
    st=p.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_mode&0o022 or (private and st.st_mode&0o077) or st.st_size>limit:
        fail("V2_FILE_MODE_OR_SIZE")
    return p.read_bytes()

def load_v1():
    if digest(file_bytes(V1_PATH))!=V1_SHA: fail("V2_IMMUTABLE_V1_DRIFT")
    spec=importlib.util.spec_from_file_location("hf094_v1_frozen",V1_PATH)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def instant(s):
    if not isinstance(s,str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ",s): fail("V2_TIME_FORMAT")
    return dt.datetime.fromisoformat(s.replace("Z","+00:00"))

def lifetime(o,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    issued,until=instant(o["issued_at"]),instant(o["expires_at"])
    if not issued<=now<until<=instant(MAX_VALIDITY) or until<=issued: fail("V2_EXPIRED_OR_SCOPE_WINDOW")

def policy_bytes():
    return file_bytes(POLICY_PATH)

def admission_module():
    path=ROOT/"tools/hf094_v2_protected.py"
    spec=importlib.util.spec_from_file_location("hf094_v2_protected",path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

admission=admission_module()

def validate_original(raw,contract,v1,now=None):
    return admission.combined(raw,contract,v1,digest(file_bytes(V2_PATH)),digest(policy_bytes()),now)

def run(argv,*,input=None,env=None,timeout=60,check=True):
    p=subprocess.run(argv,input=input,capture_output=True,env=env,timeout=timeout,check=False)
    if check and p.returncode: fail("V2_EXTERNAL_COMMAND_FAILED_NO_RETRY:"+Path(argv[0]).name)
    return p

def binary(name):
    p=shutil.which(name,path=PATH)
    if not p: fail("V2_TOOL_MISSING:"+name)
    x=Path(p).resolve()
    st=x.stat()
    if st.st_uid!=0 or st.st_mode&0o022 or not stat.S_ISREG(st.st_mode): fail("V2_TOOL_UNTRUSTED:"+name)
    return str(x)

def verify_tools(order):
    for n in BINS:
        p=Path(binary(n))
        h=hashlib.sha256()
        with p.open("rb") as f:
            for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
        if h.hexdigest()!=order["tools"][n]: fail("V2_TOOL_DIGEST_MISMATCH:"+n)

def verify_owner(raw,sig,keyring,order,now=None):
    # Only the already enrolled corporate owner fingerprint is a trust root.
    # The keyring is input bytes, not an authorization choice.
    with tempfile.TemporaryDirectory(prefix="hf094-owner-v2-") as tmp:
        d=Path(tmp)
        for n,b in (("order.json",raw),("order.sig",sig),("owner.gpg",keyring)):
            (d/n).write_bytes(b)
        p=run([binary("gpgv"),"--homedir",tmp,"--keyring",str(d/"owner.gpg"),"--status-fd","1",str(d/"order.sig"),str(d/"order.json")],check=False)
        status=p.stdout.decode("utf-8",errors="strict")
    lines=[x.split() for x in status.splitlines() if x.startswith("[GNUPG:] VALIDSIG ")]
    bad=("BADSIG","ERRSIG","REVKEYSIG","EXPKEYSIG","EXPSIG","KEYEXPIRED","SIGEXPIRED","NO_PUBKEY")
    if p.returncode or len(lines)!=1 or len(lines[0])<12 or lines[0][-1]!=OWNER or any("[GNUPG:] "+x in status for x in bad):
        fail("V2_OWNER_SIGNATURE_DENIED")
    signed=dt.datetime.fromtimestamp(int(lines[0][4]),tz=dt.timezone.utc)
    now=now or dt.datetime.now(dt.timezone.utc)
    if signed<instant(order["issued_at"])-dt.timedelta(seconds=30) or signed>now+dt.timedelta(seconds=30) or signed>=instant(order["expires_at"]):
        fail("V2_OWNER_SIGNATURE_TIME_DENIED")
    return {"fingerprint":OWNER,"signature_sha256":digest(sig),"keyring_sha256":digest(keyring)}

def git(*args):
    return run([binary("git"),"-c","safe.directory="+str(ROOT),"-c","core.hooksPath=/dev/null","-C",str(ROOT),*args],env={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8","GIT_CONFIG_NOSYSTEM":"1","GIT_CONFIG_GLOBAL":"/dev/null"}).stdout.decode().strip()

def source(order):
    if git("rev-parse","HEAD")!=order["installer_source_commit"] or git("rev-parse","HEAD^{tree}")!=order["installer_source_tree"]:
        fail("V2_CHECKOUT_NOT_SIGNED_SOURCE")
    if git("status","--porcelain","--untracked-files=no") or git("merge-base",V1_COMMIT,order["installer_source_commit"])!=V1_COMMIT:
        fail("V2_DIRTY_OR_WRONG_ANCESTRY")
    allowed={"tools/hft_roles_only_install_094_v2.py","tools/hf094_v2_protected.py","tests/test_hf094_owner_installer_v2.py",".github/workflows/hft-roles-only-installer-094-v2.yml","tests/postgres/hf094_v2_guarded_assembly.py"}
    changed=git("diff","--name-only",V1_COMMIT,"HEAD").splitlines()
    if not changed or any(x not in allowed and not x.startswith("review-candidates/hf094-owner-only-v2/") for x in changed):
        fail("V2_UNRELATED_SOURCE_DIFF")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        fail("V2_REMOTE_REDIRECT_DENIED")

def remote(url,token,*,data=None,content_type=None,limit=8*1024*1024):
    # No configurable endpoints, proxy environment, redirects or TLS bypass.
    host=urllib.parse.urlparse(url)
    if host.scheme!="https" or host.hostname not in ("api.github.com","console.neon.tech") or host.username or host.password or host.port:
        fail("V2_REMOTE_HOST_DENIED")
    if not token: fail("V2_PROVIDER_CREDENTIAL_REQUIRED")
    h={"Authorization":"Bearer "+token,"Accept":"application/json","User-Agent":"HF094-owner-v2"}
    if content_type:h["Content-Type"]=content_type
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    with opener.open(urllib.request.Request(url,data=data,headers=h),timeout=20) as r:
        b=r.read(limit+1)
    if len(b)>limit: fail("V2_REMOTE_RESPONSE_LIMIT")
    return b

def gh(path):
    return strict(remote("https://api.github.com/repos/"+REPO+path,os.environ.get("HFT_HF094_GITHUB_READ_TOKEN","")))

def check_ci_run(run,joblist,sha,path,steps):
    if run.get("head_sha")!=sha or run.get("path")!=path or run.get("event")!="push" or run.get("status")!="completed" or run.get("conclusion")!="success" or run.get("repository",{}).get("id")!=REPO_ID:
        fail("V2_CI_RUN_NOT_EXACT_SUCCESS")
    jobs=joblist.get("jobs",[])
    if joblist.get("total_count")!=1 or len(jobs)!=1 or jobs[0].get("head_sha")!=sha or jobs[0].get("conclusion")!="success" or jobs[0].get("status")!="completed":
        fail("V2_CI_JOB_NOT_EXACT_SUCCESS")
    actual={s.get("name"):s.get("conclusion") for s in jobs[0].get("steps",[])}
    if any(actual.get(s)!="success" for s in steps):fail("V2_CI_REQUIRED_STEP_NOT_PASS")
    return {"id":run["id"],"job":jobs[0]["id"],"head":sha,"steps":list(steps),"run_sha256":digest(canonical(run)),"jobs_sha256":digest(canonical(joblist))}

def ci(order,v1):
    specs=[
      (46033975835,v1.APP,".github/workflows/hft-stores-source.yml",("Verify source contracts and production build","C050 mounted React scope regression (CI-local synthetic P3)","Live Masters mounted workspace regression (CI-local synthetic records)","Hosted role history security regression (CI-local synthetic records)","Production dependency audit (moderate or above)","Full dependency tree advisory scan (high or above)")),
      (46036474589,V1_COMMIT,".github/workflows/hft-roles-only-installer-094.yml",("Inspect exact installer bytes and application baseline","PostgreSQL 18.7 disposable parser, ACL, rollback and negative postflight")),
      (order["ci_run_id"],order["installer_source_commit"],WORKFLOW,("Verify immutable V1 and owner V2 guards","Execute disposable PostgreSQL ACL and rollback campaign","Execute isolated encrypted recovery fixture","Execute V2 guarded assembly and terminal receipt campaign"))]
    out=[]
    for ident,sha,path,steps in specs:
        r=gh("/actions/runs/"+str(ident))
        j=gh("/actions/runs/"+str(ident)+"/attempts/"+str(r["run_attempt"])+"/jobs?per_page=100")
        out.append(check_ci_run(r,j,sha,path,steps))
    c=gh("/git/commits/"+order["installer_source_commit"])
    if c.get("sha")!=order["installer_source_commit"] or c.get("tree",{}).get("sha")!=order["installer_source_tree"]:fail("V2_REMOTE_TREE_MISMATCH")
    return out

def accepted_refs(order):
    for field,marker,pin_field in (("security","HF094_V2_SECURITY=ACCEPT","security_acceptance_sha256"),
                                   ("key_policy","HF094_OWNER_KEY_POLICY=ACCEPT","key_policy_sha256")):
        c=gh("/issues/comments/"+str(order[field+"_comment_id"]))
        body=c.get("body")
        if c.get("html_url")!=order[field+"_ref"] or not isinstance(body,str) or digest(body.encode())!=order[pin_field]:
            fail("V2_ACCEPTANCE_REFERENCE_DRIFT")
        lines=body.splitlines()
        if marker not in lines:fail("V2_AUTHENTIC_ACCEPTANCE_MARKER_REQUIRED")
        expected="HEAD="+order["installer_source_commit"] if field=="security" else "FINGERPRINT="+OWNER
        if expected not in lines:fail("V2_ACCEPTANCE_IDENTITY_MISMATCH")
        if field=="key_policy" and "VALID_UNTIL="+MAX_VALIDITY not in lines:fail("V2_ACCEPTED_KEY_WINDOW_REQUIRED")

def check_provider(e,dbs,target,provider_id):
    expected={"id":target["endpoint"],"project_id":target["project"],"branch_id":target["branch"],"host":target["host"],"disabled":False,"type":"read_write"}
    if any(e.get(k)!=v for k,v in expected.items()):fail("V2_PROVIDER_ENDPOINT_MISMATCH")
    matches=[d for d in dbs if d.get("name")==target["database"]]
    if len(matches)!=1 or any(matches[0].get(k)!=v for k,v in {"id":provider_id,"branch_id":target["branch"],"owner_name":target["installer"]}.items()):
        fail("V2_PROVIDER_DATABASE_MISMATCH")
    return {"endpoint":expected,"database":matches[0]}

def provider(order,v1):
    t=v1.TARGET; prefix="https://console.neon.tech/api/v2/projects/"+t["project"]
    tok=os.environ.get("HFT_HF094_NEON_READ_TOKEN","")
    e=strict(remote(prefix+"/endpoints/"+t["endpoint"],tok))
    d=strict(remote(prefix+"/branches/"+t["branch"]+"/databases",tok))
    return check_provider(e["endpoint"],d["databases"],t,order["provider_database_id"])

# A deliberately narrow fresh retained target: no business rows or arbitrary
# user schemas/objects. Preserve DB attributes and explicit ACL/default ACLs.
CATALOG=r"""
SELECT jsonb_build_object(
 'database',current_database(),'oid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
 'session',session_user,'current',current_user,'version',current_setting('server_version_num'),
 'replica',pg_is_in_recovery(),'address',host(inet_server_addr()),'port',inet_server_port(),
 'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'db', (SELECT jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'provider',datlocprovider,'locale',datlocale,'connection_limit',datconnlimit,
   'acl',COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(COALESCE(datacl,acldefault('d',datdba))) a),'[]'::jsonb))
  FROM pg_database WHERE datname=current_database()),
 'schemas',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(COALESCE(nspacl,acldefault('n',nspowner))) a),'[]'::jsonb)) ORDER BY nspname),'[]'::jsonb) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'),
 'extensions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname),'[]'::jsonb) FROM pg_extension),
 'user_objects',((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')+
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')+
 (SELECT count(*) FROM pg_type p JOIN pg_namespace n ON n.oid=p.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')+
 (SELECT count(*) FROM pg_largeobject_metadata)+(SELECT count(*) FROM pg_event_trigger)+(SELECT count(*) FROM pg_foreign_server)),
 'db_settings',(SELECT count(*) FROM pg_db_role_setting WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())),
 'default_acl',(SELECT COALESCE(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(a.defaclrole),'schema',COALESCE(n.nspname,''),'type',a.defaclobjtype,'acl',COALESCE((SELECT jsonb_agg(z::text ORDER BY z::text) FROM unnest(a.defaclacl) z),'[]'::jsonb)) ORDER BY pg_get_userbyid(a.defaclrole),COALESCE(n.nspname,''),a.defaclobjtype),'[]'::jsonb) FROM pg_default_acl a LEFT JOIN pg_namespace n ON n.oid=a.defaclnamespace),
 'role_collisions',(SELECT count(*) FROM pg_roles WHERE rolname IN('hft_engineering','hft_r1_roles_owner','hft_r1_roles_np_login','hft_r1_stores_np_login','hft_r1_posting_owner','hft_r1_stores_gateway_owner','hft_r1_app_runtime','hft_r1_governance_issuer'))
)::text
"""
def catalog_sql():
    return CATALOG.strip()+";\n"

def fresh(c,t):
    if c.get("database")!=t["database"] or c.get("owner")!=t["installer"] or c.get("version")!=str(t["server_version_num"]) or c.get("replica") is not False or c.get("user_objects")!=0 or c.get("db_settings")!=0 or c.get("role_collisions")!=0 or [x.get("name") for x in c.get("schemas",[])]!=["public"] or c.get("extensions")!=[{"name":"plpgsql","version":"1.0"}]:
        fail("V2_BASELINE_NOT_EMPTY_OR_EXACT")

def wire(v1,env):
    sql="\\conninfo\nBEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+catalog_sql()+"COMMIT;\n"
    t=v1.TARGET
    p=run([binary("psql"),"-X","-w","-A","-t","-q","-v","ON_ERROR_STOP=1","-h",t["host"],"-p","5432","-d",t["database"],"-U",t["installer"]],input=sql.encode(),env=env)
    lines=p.stdout.decode().splitlines()
    tls=[x for x in lines if re.search(r"SSL connection \(protocol: TLSv1\.[23], cipher: [A-Za-z0-9_-]+",x)]
    rows=[x for x in lines if x.startswith("{")]
    if len(tls)!=1 or len(rows)!=1:fail("V2_ACTUAL_CLIENT_TLS_REQUIRED")
    c=strict(rows[0]);fresh(c,t)
    if c["oid"]!=str(t["database_oid"]) or c["session"]!=t["installer"] or c["current"]!=t["installer"] or c["port"]!=5432 or not c["address"]:fail("V2_ACTUAL_WIRE_TARGET_MISMATCH")
    return c,{"client_tls":tls[0],"verify_full":env["PGSSLMODE"],"channel_binding":env["PGCHANNELBINDING"],"catalog_sha256":digest(canonical(c))}

def restore_shape(c):
    return {k:c[k] for k in ("database","owner","version","db","schemas","extensions","user_objects","db_settings","default_acl","role_collisions")}

def role_names(c):
    names={c["owner"]}
    for entry in [c["db"],*c["schemas"],*c["default_acl"]]:
        if "owner" in entry:names.add(entry["owner"])
        for a in entry["acl"]:
            m=re.fullmatch(r"([A-Za-z0-9_]*)=[A-Za-z*]*/([A-Za-z0-9_]+)",a)
            if not m:fail("V2_BACKUP_ACL_NAME_UNSUPPORTED")
            names.update(x for x in m.groups() if x)
    if any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}",x) for x in names):fail("V2_RESTORE_ROLE_INVALID")
    return sorted(x for x in names if x!="postgres" and not x.startswith("pg_"))

def restore_actual(dump,c,image,rootless=False):
    # No host mount, port exposure, network, provider secrets or remote target.
    if not dump.startswith(b"PGDMP"):fail("V2_BACKUP_CUSTOM_FORMAT_REQUIRED")
    docker=binary("docker")
    name="hf094-v2-restore-"+uuid.uuid4().hex
    env={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8"}
    if rootless:
        env["DOCKER_HOST"]="unix:///run/user/"+str(os.geteuid())+"/docker.sock"
        info=run([docker,"info","--format","{{json .SecurityOptions}}"],env=env)
        if not any("rootless" in x for x in json.loads(info.stdout)):fail("V2_ROOTLESS_RESTORE_REQUIRED")
    def d(*args,**kw):return run([docker,*args],env=env,**kw)
    d("image","inspect",image)
    started=False
    try:
        d("run","-d","--rm","--pull=never","--network","none","--security-opt","no-new-privileges","--pids-limit","128","--name",name,"-e","POSTGRES_HOST_AUTH_METHOD=trust",image)
        started=True
        for _ in range(60):
            if d("exec",name,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:fail("V2_ISOLATED_RESTORE_START_FAILED")
        iso=strict(d("inspect","--format","{{json .HostConfig}}",name).stdout)
        if iso.get("NetworkMode")!="none" or iso.get("Privileged") is not False or iso.get("Binds") or iso.get("PortBindings"):fail("V2_RESTORE_NOT_ISOLATED")
        def local(q,db="postgres"):
            return d("exec","-i",name,"psql","-X","-w","-Atq","-v","ON_ERROR_STOP=1","-U","postgres","-d",db,input=q.encode()).stdout
        if local("SHOW server_version_num;").strip()!=c["version"].encode():fail("V2_RESTORE_PG_VERSION_MISMATCH")
        for role in role_names(c):local('CREATE ROLE "'+role+'" NOLOGIN;')
        d("exec","-i",name,"pg_restore","--exit-on-error","--create","-U","postgres","-d","postgres",input=dump,timeout=180)
        restored=strict(local("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;\n"+catalog_sql()+"COMMIT;",c["database"]))
        if restore_shape(c)!=restore_shape(restored):fail("V2_ACTUAL_RESTORE_CATALOG_MISMATCH")
        return {"isolated_container":name,"image":image,"version":restored["version"],"restored_shape_sha256":digest(canonical(restore_shape(restored))),"dump_sha256":digest(dump)}
    finally:
        if started:d("rm","-f",name,check=False)

def encrypt_restore(dump,c,order,registry,stem,provenance,rootless=True):
    """Encrypt actual target-derived custom dump, store/read exact locked version,
    decrypt with existing admitted recovery key, restore and compare actual facts.
    No external supplied dump or asserted backup PASS is accepted by main.
    """
    if not dump.startswith(b"PGDMP") or len(dump)>32*1024*1024:fail("V2_TARGET_DUMP_INVALID")
    b=order["backup"];keyring=registry.recovery_keyring()
    genv={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8"}
    with tempfile.TemporaryDirectory(prefix="hf094-v2-encrypt-") as temp:
        p=Path(temp);(p/"recovery.gpg").write_bytes(keyring)
        run([binary("gpg"),"--homedir",temp,"--batch","--no-tty","--import",str(p/"recovery.gpg")],env=genv)
        keys=run([binary("gpg"),"--homedir",temp,"--batch","--with-colons","--list-keys"],env=genv).stdout.decode()
        primary=[];want=False
        for l in keys.splitlines():
            f=l.split(":")
            if f[0]=="pub":want=True
            elif f[0]=="fpr" and want:primary.append(f[9]);want=False
        if primary!=[b["recovery_fingerprint"]]:fail("V2_RECOVERY_KEY_BINDING_DENIED")
        cipher=run([binary("gpg"),"--homedir",temp,"--batch","--no-tty","--trust-model","always","--recipient",b["recovery_fingerprint"],"--encrypt"],input=dump,env=genv,timeout=120).stdout
    original=registry.put_once(stem+"target-backup.pgp",cipher)
    read,ref=registry.read(stem+"target-backup.pgp")
    if ref!=original or read!=cipher:fail("V2_ENCRYPTED_ORIGINAL_READBACK_DENIED")
    capture={"schema":"HF094_TARGET_CAPTURE_V2","source":provenance,"original":ref,
      "dump_sha256":digest(dump),"ciphertext_sha256":digest(cipher),"catalog_sha256":digest(canonical(c))}
    receipt=registry.put_once(stem+"backup-capture.json",canonical(capture))
    home=Path(os.environ.get("HFT_HF094_RECOVERY_GNUPGHOME",""))
    if not home.is_absolute() or home.is_symlink() or not home.is_dir() or home.stat().st_uid!=os.geteuid() or home.stat().st_mode&0o077:fail("V2_PRIVATE_RECOVERY_KEY_HOME_REQUIRED")
    p=run([binary("gpg"),"--homedir",str(home),"--batch","--no-tty","--no-auto-key-retrieve","--status-fd","2","--decrypt"],input=read,env=genv,timeout=120,check=False)
    status=p.stderr.decode(errors="replace")
    keys=[x.split() for x in status.splitlines() if x.startswith("[GNUPG:] DECRYPTION_KEY ")]
    if p.returncode or "[GNUPG:] DECRYPTION_OKAY" not in status or len(keys)!=1 or keys[0][3]!=b["recovery_fingerprint"] or p.stdout!=dump:
        fail("V2_ACTUAL_ENCRYPTED_BACKUP_DECRYPTION_DENIED")
    restored=restore_actual(p.stdout,c,b["restore_image"],rootless=rootless)
    return {"capture":receipt,"encrypted_original":ref,"recovery_fingerprint":b["recovery_fingerprint"],"restore":restored}

def capture_target(v1,env,order,host,c,tls,registry,stem):
    t=v1.TARGET
    # Same exact pinned libpq endpoint and verified CA/channel-binding settings
    # as the wire reads. Never accept caller-provided backup bytes.
    for key,val in {"PGHOST":t["host"],"PGPORT":str(t["port"]),"PGDATABASE":t["database"],
       "PGUSER":t["installer"],"PGSSLMODE":"verify-full","PGCHANNELBINDING":"require"}.items():
        if env.get(key)!=val:fail("V2_TARGET_BACKUP_TRANSPORT_DENIED")
    started=admission.iso(admission.clock())
    dump=run([binary("pg_dump"),"-w","-Fc","--create","-h",t["host"],"-p",str(t["port"]),"-U",t["installer"],"-d",t["database"]],env=env,timeout=180).stdout
    return encrypt_restore(dump,c,order,registry,stem,{"target":t,"provider":order["provider_evidence"],
      "host":host,"wire":tls,"pg_dump_sha256":order["tools"]["pg_dump"],"started":started,"completed":admission.iso(admission.clock())})

def assemble(v1,sql,plan,order,baseline,prepared_sha):
    literal=canonical(baseline).decode().strip().replace("'","''")
    gate="DO $hf094v2$ BEGIN IF ("+CATALOG.strip()+")::jsonb IS DISTINCT FROM '"+literal+"'::jsonb THEN RAISE EXCEPTION 'HF094_V2_BASELINE_DRIFT'; END IF; END $hf094v2$;\n"
    statement=v1.build_transaction(sql,plan,order["owner_order_sha256"],prepared_sha,order["expires_at"])
    if statement.count(sql[v1.FILES[0]])!=1:fail("V2_SQL_ASSEMBLY_MISMATCH")
    return statement.replace(sql[v1.FILES[0]],gate+sql[v1.FILES[0]])

def main():
    p=argparse.ArgumentParser(description=__doc__)
    g=p.add_mutually_exclusive_group(required=True)
    g.add_argument("--inspect",action="store_true");g.add_argument("--qualify",action="store_true");g.add_argument("--apply",action="store_true")
    for name in ("owner-order","owner-signature","machine-contract"):p.add_argument("--"+name)
    a=p.parse_args()
    v1=load_v1();manifest,sql,plan=v1.load_package()
    if a.inspect:
        print("V2_RUNNER_SHA256="+digest(file_bytes(V2_PATH)));print("V2_POLICY_SHA256="+digest(policy_bytes()))
        print("V2_PROTECTED_HELPER_SHA256="+digest(file_bytes(ROOT/"tools/hf094_v2_protected.py")))
        print("V2_V1_SQL_AND_SOURCE_BYTES_VERIFIED; NO AUTHORITY OR CONNECTION");return
    if not all((a.owner_order,a.owner_signature,a.machine_contract)):fail("V2_SIGNED_ORDER_AND_CONTRACT_REQUIRED")
    raw=file_bytes(a.owner_order,True);contract=file_bytes(a.machine_contract,True)
    order=validate_original(raw,contract,v1)
    # Verify helper and every tracked source byte in a root-owned immutable
    # checkout. Exact reviewed commit/tree and CI checked before any target SQL.
    verify_tools(order)
    aws=admission.AWS(order,run,binary)
    host=admission.verify_host(order,aws,binary,ROOT)
    source(order)
    for path in git("ls-files").splitlines():admission.root_readonly(ROOT/path)
    registry=admission.ProtectedRegistry(order,aws)
    registry.authority()
    owner=verify_owner(raw,file_bytes(a.owner_signature,True),registry.keyring(),order)
    registry.authority();accepted_refs(order)
    ci_result=ci(order,v1);prov=provider(order,v1);order["provider_evidence"]=prov
    registry.absent(admission.CONSUMED)
    with tempfile.TemporaryDirectory(prefix="hf094-v2-transport-") as tmp:
        env=v1.transport(order,tmp)
        registry.authority()
        if not a.apply:
            cat,tls=wire(v1,env);registry.authority()
            print("V2_SOURCE_HOST_REGISTRY_WIRE_PRECHECK="+digest(canonical({"owner":owner,"host":host,"provider":prov,"catalog":cat,"wire":tls}))+"; NO BACKUP/RESTORE/DDL OR FULL ADMISSION");return
        t=v1.TARGET
        def execute(body):
            return run([binary("psql"),"-X","-w","-Atq","-v","ON_ERROR_STOP=1","-h",t["host"],"-p","5432","-d",t["database"],"-U",t["installer"]],input=body.encode(),env=env,timeout=180).stdout.decode().strip()
        def apply(body):
            if "HF094_ROLES_ONLY_CATALOG_ACL_PASS" not in execute(body).splitlines():fail("V2_COMMIT_UNCERTAIN_NO_RETRY")
        def post():
            r=execute("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[v1.FILES[2]]+"\nCOMMIT;")
            if r!="HF094_ROLES_ONLY_CATALOG_ACL_PASS":fail("V2_POSTFLIGHT_UNCONFIRMED_NO_RETRY")
            return r
        result=admission.guarded_apply(order,registry,{"machine":host,"owner":owner},ci_result,lambda:provider(order,v1),
          lambda:wire(v1,env),lambda c,tls,reg,stem:capture_target(v1,env,order,host,c,tls,reg,stem),
          lambda c,pin:assemble(v1,sql,plan,order,c,pin),apply,post)
        print("V2_COMMITTED_AND_POSTFLIGHT_READ_BACK="+result["sha256"]+"; RUNTIME_DISABLED")

if __name__=="__main__":
    try:main()
    except RuntimeError as e:print("HF094_V2_STOP="+str(e),file=sys.stderr);sys.exit(1)
    except Exception:print("HF094_V2_STOP=UNVERIFIED_OR_UNCERTAIN_NO_RETRY",file=sys.stderr);sys.exit(1)
