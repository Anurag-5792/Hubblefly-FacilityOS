#!/usr/bin/env python3
"""HF094 V2 owner-governed candidate. No human technical signer substitution.
One enrolled-owner signed order; independently re-fetch CI/provider/STOP,
verify actual client TLS and recover an encrypted off-site original in an
isolated PostgreSQL container before assembling the immutable V1 SQL.
Never use caller-supplied PASS booleans. Not admitted by this file.
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
STATUS_REF="governance/hf094-v2-authority"
STATUS_PATH="governance/hf094-v2-status.json"
ORDER_SCHEMA="HF094_OWNER_ONLY_INSTALL_ORDER_V2"
HEX=re.compile(r"[0-9a-f]{64}\Z")
SHA=re.compile(r"[0-9a-f]{40}\Z")
ID=re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
FP=re.compile(r"[0-9A-F]{40}\Z")
BINS=("git","gpgv","gpg","psql","docker")
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

def validate_order(o,v1,manifest,now=None):
    exact(o,("schema","owner_primary_fingerprint","order_id","authorized_action","target","application_source_commit",
      "application_source_tree","installer_source_commit","installer_source_tree","v1_commit","v1_runner_sha256",
      "v2_runner_sha256","policy_sha256","installer_manifest_sha256","canonical_manifest_sha256","sql_sha256",
      "issued_at","expires_at","ci_run_id","status_sha256","ca_sha256","provider_database_id",
      "backup","evidence_folder_id","tools"))
    mandatory={"schema":ORDER_SCHEMA,"owner_primary_fingerprint":OWNER,"authorized_action":v1.ACTION,
      "target":v1.TARGET,"application_source_commit":v1.APP,"application_source_tree":v1.APP_TREE,
      "v1_commit":V1_COMMIT,"v1_runner_sha256":V1_SHA,"v2_runner_sha256":digest(file_bytes(V2_PATH)),
      "policy_sha256":digest(policy_bytes()),"installer_manifest_sha256":v1.MANIFEST_SHA,
      "canonical_manifest_sha256":v1.CANONICAL_SHA,"sql_sha256":{x["path"]:x["sha256"] for x in manifest["files"]},
      "provider_database_id":860001}
    if any(o.get(k)!=v for k,v in mandatory.items()): fail("V2_SIGNED_SCOPE_OR_PIN_MISMATCH")
    if str(uuid.UUID(o["order_id"]))!=o["order_id"] or uuid.UUID(o["order_id"]).version!=4: fail("V2_ORDER_ID_INVALID")
    for k in ("installer_source_commit","installer_source_tree"):
        if not isinstance(o[k],str) or not SHA.fullmatch(o[k]): fail("V2_SOURCE_PIN_INVALID")
    if type(o["ci_run_id"]) is not int or o["ci_run_id"]<1: fail("V2_CI_ID_INVALID")
    if not all(hex64(o[k]) for k in ("status_sha256","ca_sha256")): fail("V2_DIGEST_INVALID")
    if not isinstance(o["evidence_folder_id"],str) or not ID.fullmatch(o["evidence_folder_id"]): fail("V2_EVIDENCE_FOLDER_INVALID")
    b=o["backup"]
    exact(b,("drive_file_id","drive_folder_id","ciphertext_sha256","plaintext_sha256","recovery_fingerprint","restore_image"))
    if not all(isinstance(b[k],str) and ID.fullmatch(b[k]) for k in ("drive_file_id","drive_folder_id")) or not all(hex64(b[k]) for k in ("ciphertext_sha256","plaintext_sha256")):
        fail("V2_BACKUP_PIN_INVALID")
    if not FP.fullmatch(b["recovery_fingerprint"]) or not re.fullmatch(r"postgres@sha256:[0-9a-f]{64}",b["restore_image"]):
        fail("V2_RESTORE_TRUST_PIN_INVALID")
    exact(o["tools"],BINS)
    if not all(hex64(x) for x in o["tools"].values()): fail("V2_TOOL_PIN_INVALID")
    lifetime(o,now)

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
    return run([binary("git"),"-C",str(ROOT),*args],env={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8","GIT_CONFIG_NOSYSTEM":"1","GIT_CONFIG_GLOBAL":"/dev/null"}).stdout.decode().strip()

def source(order):
    if git("rev-parse","HEAD")!=order["installer_source_commit"] or git("rev-parse","HEAD^{tree}")!=order["installer_source_tree"]:
        fail("V2_CHECKOUT_NOT_SIGNED_SOURCE")
    if git("status","--porcelain","--untracked-files=no") or run([binary("git"),"-C",str(ROOT),"merge-base","--is-ancestor",V1_COMMIT,order["installer_source_commit"]],check=False).returncode:
        fail("V2_DIRTY_OR_WRONG_ANCESTRY")
    allowed={"tools/hft_roles_only_install_094_v2.py","tests/test_hf094_owner_installer_v2.py",".github/workflows/hft-roles-only-installer-094-v2.yml"}
    changed=git("diff","--name-only",V1_COMMIT,"HEAD").splitlines()
    if not changed or any(x not in allowed and not x.startswith("review-candidates/hf094-owner-only-v2/") for x in changed):
        fail("V2_UNRELATED_SOURCE_DIFF")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        fail("V2_REMOTE_REDIRECT_DENIED")

def remote(url,token,*,data=None,content_type=None,limit=8*1024*1024):
    # No configurable endpoints, proxy environment, redirects or TLS bypass.
    host=urllib.parse.urlparse(url)
    if host.scheme!="https" or host.hostname not in ("api.github.com","console.neon.tech","www.googleapis.com") or host.username or host.password or host.port:
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
      (order["ci_run_id"],order["installer_source_commit"],WORKFLOW,("Verify immutable V1 and owner V2 guards","Execute disposable PostgreSQL ACL and rollback campaign","Execute isolated encrypted recovery fixture"))]
    out=[]
    for ident,sha,path,steps in specs:
        r=gh("/actions/runs/"+str(ident))
        j=gh("/actions/runs/"+str(ident)+"/attempts/"+str(r["run_attempt"])+"/jobs?per_page=100")
        out.append(check_ci_run(r,j,sha,path,steps))
    c=gh("/git/commits/"+order["installer_source_commit"])
    if c.get("sha")!=order["installer_source_commit"] or c.get("tree",{}).get("sha")!=order["installer_source_tree"]:fail("V2_REMOTE_TREE_MISMATCH")
    return out

def check_stop(order):
    # An authenticated current repository ref is read afresh. Any STOP/revocation,
    # edit, missing ref or network failure invalidates the original signed pin.
    ref=gh("/git/ref/heads/"+STATUS_REF)
    commit=ref.get("object",{}).get("sha","")
    if not SHA.fullmatch(commit):fail("V2_STATUS_REF_INVALID")
    x=gh("/contents/"+STATUS_PATH+"?ref="+commit)
    if x.get("encoding")!="base64" or x.get("path")!=STATUS_PATH:fail("V2_STATUS_SOURCE_INVALID")
    raw=base64.b64decode(x["content"],validate=False)
    if digest(raw)!=order["status_sha256"]:fail("V2_STOP_OR_REVOCATION_CHANGED")
    st=strict(raw)
    exact(st,("schema","order_id","state","owner_primary_fingerprint","expires_at"))
    if st!={"schema":"HF094_V2_CURRENT_STATUS","order_id":order["order_id"],"state":"ACTIVE","owner_primary_fingerprint":OWNER,"expires_at":order["expires_at"]}:
        fail("V2_STOP_OR_REVOCATION_ACTIVE")
    lifetime(order)
    return {"ref":STATUS_REF,"commit":commit,"sha256":digest(raw)}

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

def restore_actual(dump,c,image):
    # No host mount, port exposure, network, provider secrets or remote target.
    if not dump.startswith(b"PGDMP"):fail("V2_BACKUP_CUSTOM_FORMAT_REQUIRED")
    docker=binary("docker")
    name="hf094-v2-restore-"+uuid.uuid4().hex
    env={"PATH":PATH,"HOME":"/nonexistent","LANG":"C.UTF-8"}
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

def drive(path,**kw):
    return remote("https://www.googleapis.com/drive/v3/"+path,os.environ.get("HFT_HF094_DRIVE_TOKEN",""),**kw)

def private_folder(fid):
    x=strict(drive("files/"+fid+"?fields=id,mimeType,trashed,permissions(type,role)"))
    if x.get("id")!=fid or x.get("mimeType")!="application/vnd.google-apps.folder" or x.get("trashed") is not False or not isinstance(x.get("permissions"),list) or not x["permissions"] or any(p.get("type") in ("anyone","domain") for p in x["permissions"]):fail("V2_PRIVATE_EVIDENCE_FOLDER_REQUIRED")

def recover(order,c):
    b=order["backup"];private_folder(b["drive_folder_id"])
    meta=strict(drive("files/"+b["drive_file_id"]+"?fields=id,parents,trashed,size,permissions(type,role)"))
    if meta.get("id")!=b["drive_file_id"] or meta.get("trashed") is not False or b["drive_folder_id"] not in meta.get("parents",[]) or not isinstance(meta.get("permissions"),list) or not meta["permissions"] or any(p.get("type") in ("anyone","domain") for p in meta["permissions"]):fail("V2_OFFSITE_BACKUP_METADATA_DENIED")
    ciphertext=drive("files/"+b["drive_file_id"]+"?alt=media",limit=64*1024*1024)
    if len(ciphertext)!=int(meta["size"]) or digest(ciphertext)!=b["ciphertext_sha256"]:fail("V2_ENCRYPTED_ORIGINAL_HASH_MISMATCH")
    home=Path(os.environ.get("HFT_HF094_RECOVERY_GNUPGHOME",""))
    if not home.is_absolute() or home.is_symlink() or not home.is_dir() or home.stat().st_mode&0o077:fail("V2_PRIVATE_RECOVERY_KEY_HOME_REQUIRED")
    p=run([binary("gpg"),"--homedir",str(home),"--batch","--no-tty","--no-auto-key-retrieve","--status-fd","2","--decrypt"],input=ciphertext,timeout=60,check=False)
    status=p.stderr.decode(errors="replace")
    keys=[x.split() for x in status.splitlines() if x.startswith("[GNUPG:] DECRYPTION_KEY ")]
    if p.returncode or "[GNUPG:] DECRYPTION_OKAY" not in status or len(keys)!=1 or keys[0][3]!=b["recovery_fingerprint"] or digest(p.stdout)!=b["plaintext_sha256"]:
        fail("V2_ACTUAL_ENCRYPTED_BACKUP_DECRYPTION_DENIED")
    out=restore_actual(p.stdout,c,b["restore_image"])
    return {"offsite_file":b["drive_file_id"],"ciphertext_sha256":digest(ciphertext),"recovery_fingerprint":b["recovery_fingerprint"],"restore":out}

def write_once(folder,name,record):
    raw=canonical(record)
    p=folder/name
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
    return digest(raw),raw

def remote_evidence(order,phase,raw):
    # Write new evidence objects only; never modify/delete previous evidence.
    fid=order["evidence_folder_id"];private_folder(fid)
    tok=os.environ.get("HFT_HF094_DRIVE_TOKEN","")
    name="HF094-V2-"+order["order_id"]+"-"+phase+".json"
    q="'"+fid+"' in parents and trashed = false and name = '"+name+"'"
    existing=strict(drive("files?"+urllib.parse.urlencode({"q":q,"fields":"files(id),nextPageToken","pageSize":100})))
    if existing.get("files") or existing.get("nextPageToken"):fail("V2_EVIDENCE_REPLAY_OR_UNCERTAIN_NO_RETRY")
    boundary="hf094"+uuid.uuid4().hex
    metadata=canonical({"name":name,"parents":[fid],"mimeType":"application/json"})
    data=(("--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").encode()+metadata+
      ("\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n").encode()+raw+("\r\n--"+boundary+"--\r\n").encode())
    created=strict(remote("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,parents",tok,data=data,content_type="multipart/related; boundary="+boundary))
    ident=created.get("id","")
    if not ID.fullmatch(ident) or fid not in created.get("parents",[]) or drive("files/"+ident+"?alt=media")!=raw:fail("V2_OFFSITE_EVIDENCE_READBACK_FAILED")
    return ident

def main():
    p=argparse.ArgumentParser(description=__doc__)
    g=p.add_mutually_exclusive_group(required=True)
    g.add_argument("--inspect",action="store_true");g.add_argument("--qualify",action="store_true");g.add_argument("--apply",action="store_true")
    for name in ("owner-order","owner-signature","owner-keyring","evidence-directory"):p.add_argument("--"+name)
    a=p.parse_args()
    v1=load_v1();manifest,sql,plan=v1.load_package()
    if a.inspect:
        print("V2_RUNNER_SHA256="+digest(file_bytes(V2_PATH)));print("V2_POLICY_SHA256="+digest(policy_bytes()))
        print("V2_V1_SQL_AND_SOURCE_BYTES_VERIFIED; NO AUTHORITY OR CONNECTION");return
    if not all((a.owner_order,a.owner_signature,a.owner_keyring,a.evidence_directory)):fail("V2_SIGNED_ORDER_AND_EVIDENCE_REQUIRED")
    raw=file_bytes(a.owner_order,True);order=strict(raw)
    validate_order(order,v1,manifest);verify_tools(order)
    owner=verify_owner(raw,file_bytes(a.owner_signature,True),file_bytes(a.owner_keyring),order)
    source(order);check_stop(order)
    root=Path(a.evidence_directory)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir() or root.stat().st_mode&0o077:fail("V2_PRIVATE_EVIDENCE_DIRECTORY_REQUIRED")
    folder=root/(order["order_id"]+("-apply" if a.apply else "-qualification"))
    folder.mkdir(mode=0o700,exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="hf094-v2-transport-") as tmp:
        env=v1.transport(order,tmp)
        # v1 transport already pins libpq verify-full/channel binding and CA.
        ci_result=ci(order,v1);prov=provider(order,v1)
        cat,tls=wire(v1,env);recovery=recover(order,cat)
        # Fresh read after real recovery; fail closed if baseline changed.
        cat2,tls2=wire(v1,env)
        if cat!=cat2:fail("V2_BASELINE_CHANGED_DURING_RECOVERY")
        stop=check_stop(order);prov2=provider(order,v1)
        if prov2!=prov:fail("V2_PROVIDER_CHANGED_DURING_RECOVERY")
        evidence={"schema":"HF094_V2_MACHINE_EVIDENCE","phase":"PREPARED" if a.apply else "QUALIFICATION",
          "order_sha256":digest(raw),"owner":owner,"source_commit":order["installer_source_commit"],"ci":ci_result,
          "provider":prov,"stop":stop,"wire":tls2,"baseline_sha256":digest(canonical(cat2)),"recovery":recovery,
          "timestamp":dt.datetime.now(dt.timezone.utc).isoformat(),"prior_phase_sha256":None}
        tech_sha,tech_raw=write_once(folder,"machine-evidence.json",evidence)
        if not a.apply:
            print("V2_MACHINE_QUALIFICATION_PASS="+tech_sha+"; NO DDL");return
        remote_id=remote_evidence(order,"PREPARED",tech_raw)
        lifetime(order);check_stop(order)
        # No unverified local PASS JSON is accepted. Freeze the exact fresh
        # catalog in the *same* serializable transaction before V1 bootstrap.
        cat3,_=wire(v1,env)
        if cat3!=cat2:fail("V2_BASELINE_CHANGED_BEFORE_APPLY")
        literal=canonical(cat3).decode().strip().replace("'","''")
        gate="DO $hf094v2$ BEGIN IF ("+CATALOG.strip()+")::jsonb IS DISTINCT FROM '"+literal+"'::jsonb THEN RAISE EXCEPTION 'HF094_V2_BASELINE_DRIFT'; END IF; END $hf094v2$;\n"
        statement=v1.build_transaction(sql,plan,digest(raw),tech_sha,order["expires_at"])
        if statement.count(sql[v1.FILES[0]])!=1:fail("V2_SQL_ASSEMBLY_MISMATCH")
        statement=statement.replace(sql[v1.FILES[0]],gate+sql[v1.FILES[0]])
        # Use trusted pinned psql and strict original libpq environment.
        t=v1.TARGET
        def execute(body):
            return run([binary("psql"),"-X","-w","-Atq","-v","ON_ERROR_STOP=1","-h",t["host"],"-p","5432","-d",t["database"],"-U",t["installer"]],input=body.encode(),env=env,timeout=180).stdout.decode().strip()
        if "HF094_ROLES_ONLY_CATALOG_ACL_PASS" not in execute(statement).splitlines():fail("V2_COMMIT_UNCERTAIN_NO_RETRY")
        result=execute("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[v1.FILES[2]]+"\nCOMMIT;")
        if result!="HF094_ROLES_ONLY_CATALOG_ACL_PASS":fail("V2_POSTFLIGHT_UNCONFIRMED_NO_RETRY")
        final={"schema":"HF094_V2_MACHINE_EVIDENCE","phase":"COMMITTED_CATALOG_READBACK","order_sha256":digest(raw),
          "prior_phase_sha256":tech_sha,"prepared_file_id":remote_id,"postflight_sha256":digest(result.encode()),
          "timestamp":dt.datetime.now(dt.timezone.utc).isoformat(),"runtime_login_enabled":False}
        end_sha,end_raw=write_once(folder,"result.json",final);remote_evidence(order,"RESULT",end_raw)
        print("V2_COMMITTED_AND_POSTFLIGHT_READ_BACK="+end_sha+"; RUNTIME_DISABLED")

if __name__=="__main__":
    try:main()
    except RuntimeError as e:print("HF094_V2_STOP="+str(e),file=sys.stderr);sys.exit(1)
    except Exception:print("HF094_V2_STOP=UNVERIFIED_OR_UNCERTAIN_NO_RETRY",file=sys.stderr);sys.exit(1)
