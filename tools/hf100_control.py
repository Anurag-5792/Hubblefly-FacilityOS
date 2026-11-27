"""HF100 AWS-free owner-order, authenticated Drive control/custody and receipts."""
from __future__ import annotations
import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid

TEMPLATE_SHA="89e12950ceddd7d01eaa722fb9f92bf395b378fe68e657b9a7ca8db06d1f68ff"
ORIGINAL_ZIP_SHA="bd0fdbfc9e158dbafc2d3c0ae847493952e4429e82f3828f02ae5a39d05ca8eb"
ORIGINAL_TEMPLATE_SHA="308af08b67c138667a28b748f43b476f8366f53d801cf8b671004b5161a0c52f"
SCHEMA="HF11_HFT_R1_OWNER_ONLY_STANDING_HF094_V2"
RUNNER_PATH="tools/hft_roles_only_install_100.py"
FINAL_FIELDS=("accepted_runner_commit","accepted_runner_tree","bounded_security_acceptance_ref","exact_head_ci_ref",
 "runner_path","runner_sha256","versioned_contract_sha256")
TIME_FIELDS=("issued_at_utc","not_before_utc","expires_at_utc","accepted_key_expiry_and_revocation_policy_ref")
BINS=("git","gpgv","gpg","openssl","psql","pg_dump","pg_restore","initdb","pg_ctl","postgres","unshare")
HEX=re.compile(r"[0-9a-f]{64}\Z")
SHA=re.compile(r"[0-9a-f]{40}\Z")
FP=re.compile(r"[A-F0-9]{40}\Z")

def deny(code): raise RuntimeError(code)
def need(test,code):
    if not test: deny(code)
def sha(raw): return hashlib.sha256(raw).hexdigest()
def canonical(x): return (json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def original_canonical(x): return (json.dumps(x,sort_keys=True,indent=2,ensure_ascii=False)+"\n").encode()
def strict(raw):
    def unique(items):
        d={}
        for k,v in items:
            need(k not in d,"V2_DUPLICATE_JSON_KEY");d[k]=v
        return d
    x=json.loads(raw,object_pairs_hook=unique)
    need(isinstance(x,dict),"V2_JSON_OBJECT_REQUIRED")
    return x
def exact(x,keys):need(isinstance(x,dict) and set(x)==set(keys),"V2_EXACT_FIELDS_REQUIRED")
def pin(x):return isinstance(x,str) and bool(HEX.fullmatch(x)) and x!="0"*64
def utc(s):
    need(isinstance(s,str) and bool(re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ",s)),"V2_TIME_FORMAT")
    return dt.datetime.fromisoformat(s.replace("Z","+00:00"))
def clock():return dt.datetime.now(dt.timezone.utc)
def iso(t):return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def file_hash(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def combined(raw,contract_raw,v1,runner_sha,policy_sha,now=None):
    """Normalize ONLY the original designated final fields back to NULL.
    Digest matches the independently recovered actual HF11 unsigned template.
    All routine actions, exclusions, owner, targets and SQL pins stay exact.
    """
    o=strict(raw);c=strict(contract_raw);now=now or clock()
    need(raw==original_canonical(o),"V2_ORIGINAL_CANONICAL_BYTES_REQUIRED")
    need(contract_raw==canonical(c),"V2_CONTRACT_CANONICAL_BYTES_REQUIRED")
    need(o.get("schema")==SCHEMA,"V2_COMBINED_ORIGINAL_REQUIRED")
    f=o["single_initial_hf094_order"]["final_v2_successor"];v=o["validity"]
    exact(f,FINAL_FIELDS)
    n=copy.deepcopy(o)
    n["status"]="PROPOSED_UNSIGNED_NOT_EFFECTIVE"
    n["execution_status"]="UNSIGNED_PENDING_SUCCESSOR_RUNNER_AND_AUTHENTIC_TECHNICAL_EVIDENCE"
    for k in FINAL_FIELDS:n["single_initial_hf094_order"]["final_v2_successor"][k]=None
    for k in TIME_FIELDS:n["validity"][k]=None
    need(sha(canonical(n))==TEMPLATE_SHA,"V2_ORIGINAL_STANDING_SCOPE_OR_SQL_DRIFT")
    need(o["status"]=="FINAL_UNSIGNED_AWAITING_OWNER_SIGNATURE" and o["execution_status"]=="FINAL_UNSIGNED_AWAITING_CORPORATE_SIGNATURE","V2_ORIGINAL_NOT_FINAL")
    issued,start,end=[utc(v[k]) for k in TIME_FIELDS[:3]]
    need(issued<=start<=now<end<=utc("2026-12-26T18:29:59Z") and end-issued<=dt.timedelta(days=366),"V2_ORIGINAL_VALIDITY_DENIED")
    need(f["runner_path"]==RUNNER_PATH and f["runner_sha256"]==runner_sha and f["versioned_contract_sha256"]==sha(contract_raw),"V2_SIGNED_RUNNER_OR_CONTRACT_DRIFT")
    need(all(isinstance(f[k],str) and SHA.fullmatch(f[k]) for k in FINAL_FIELDS[:2]),"V2_SUCCESSOR_SOURCE_UNBOUND")
    ci=re.fullmatch(r"https://github\.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/([1-9]\d*)",str(f["exact_head_ci_ref"]))
    refpat=r"https://github\.com/Anurag-5792/Hubblefly-FacilityOS/(?:pull/[1-9]\d*|issues/12)#issuecomment-([1-9]\d*)"
    sec=re.fullmatch(refpat,str(f["bounded_security_acceptance_ref"]))
    kp=re.fullmatch(refpat,str(v["accepted_key_expiry_and_revocation_policy_ref"]))
    need(ci and sec and kp,"V2_FINAL_ACCEPTANCE_OR_KEY_POLICY_REFERENCE_REQUIRED")
    need(o["resources"]["retained_roles_only"]==v1.TARGET and o["single_initial_hf094_order"]["authorized_action"]==v1.ACTION,"V2_TARGET_ACTION_DENIED")
    exact(c,("schema","nonce","policy_sha256","security_acceptance_sha256","key_policy_sha256","owner_keyring_sha256","provider_database_id",
     "ca_sha256","host","tools","control","custody","backup","receipt_key_sha256","baseline_sha256"))
    need(c["schema"]=="HF100_MACHINE_CONTRACT_V3" and c["policy_sha256"]==policy_sha and c["provider_database_id"]==860001,"HF100_CONTRACT_DENIED")
    need(all(pin(c[k]) for k in ("security_acceptance_sha256","key_policy_sha256","owner_keyring_sha256","ca_sha256","receipt_key_sha256","baseline_sha256")),"HF100_PIN_INVALID")
    need(str(uuid.UUID(c["nonce"]))==c["nonce"] and uuid.UUID(c["nonce"]).version==4,"HF100_NONCE_INVALID")
    exact(c["tools"],BINS);need(all(pin(x) for x in c["tools"].values()),"HF100_TOOL_PIN_REQUIRED")
    h=c["host"];exact(h,("kind","host_id","source_root","uid","machine_id_path","machine_id_sha256","python_sha256","manifest_path","manifest_sha256","pg_bin"))
    need(h["kind"] in ("LINUX_WSL","VERCEL_SANDBOX") and isinstance(h["host_id"],str) and 8<=len(h["host_id"])<=128,"HF100_HOST_KIND_OR_ID")
    need(type(h["uid"]) is int and h["uid"]>0 and all(pin(h[k]) for k in ("machine_id_sha256","python_sha256","manifest_sha256")),"HF100_HOST_PIN_REQUIRED")
    need(all(isinstance(h[k],str) and Path(h[k]).is_absolute() for k in ("source_root","machine_id_path","manifest_path","pg_bin")),"HF100_HOST_PATH_REQUIRED")
    control=c["control"];exact(control,("folder_id","folder_acl_sha256","reader_permission_id","status","owner_keyring","recovery_keyring"))
    custody=c["custody"];exact(custody,("folder_id","folder_acl_sha256","writer_permission_id","file_acl_sha256"))
    idpat=re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
    need(all(isinstance(x,str) and idpat.fullmatch(x) for x in (control["folder_id"],control["reader_permission_id"],custody["folder_id"],custody["writer_permission_id"])) and control["folder_id"]!=custody["folder_id"],"HF100_DRIVE_ID_INVALID")
    need(all(pin(x) for x in (control["folder_acl_sha256"],custody["folder_acl_sha256"],custody["file_acl_sha256"])),"HF100_DRIVE_ACL_PIN_REQUIRED")
    for field in ("status","owner_keyring","recovery_keyring"):
        file_pin=control[field];exact(file_pin,("id","version","sha256","acl_sha256"))
        need(isinstance(file_pin["id"],str) and idpat.fullmatch(file_pin["id"]) and isinstance(file_pin["version"],str) and re.fullmatch(r"[1-9]\d{0,19}",file_pin["version"]) and pin(file_pin["sha256"]) and pin(file_pin["acl_sha256"]),"HF100_CONTROL_FILE_PIN_REQUIRED")
    need(len({control[k]["id"] for k in ("status","owner_keyring","recovery_keyring")})==3 and control["owner_keyring"]["sha256"]==c["owner_keyring_sha256"],"HF100_CONTROL_KEY_PIN_MISMATCH")
    b=c["backup"];exact(b,("recovery_fingerprint","recovery_keyring_sha256"))
    need(isinstance(b["recovery_fingerprint"],str) and FP.fullmatch(b["recovery_fingerprint"]) and pin(b["recovery_keyring_sha256"]) and b["recovery_keyring_sha256"]==control["recovery_keyring"]["sha256"],"HF100_RECOVERY_PIN_INVALID")
    need(o["issuer"]["corporate_openpgp_primary_fingerprint"]=="7C2FED6F5C4288AB5BA2662BC26C479D6885C73C","HF100_OWNER_PIN_DENIED")
    return {**c,"owner_fingerprint":o["issuer"]["corporate_openpgp_primary_fingerprint"],"order_id":c["nonce"],"owner_order_sha256":sha(raw),"contract_sha256":sha(contract_raw),
      "issued_at":v["issued_at_utc"],"not_before":v["not_before_utc"],"expires_at":v["expires_at_utc"],
      "installer_source_commit":f["accepted_runner_commit"],"installer_source_tree":f["accepted_runner_tree"],"ci_run_id":int(ci.group(1)),
      "security_comment_id":int(sec.group(1)),"key_policy_comment_id":int(kp.group(1)),
      "security_ref":f["bounded_security_acceptance_ref"],"key_policy_ref":v["accepted_key_expiry_and_revocation_policy_ref"]}

# No storage immutability claim. Database and Drive are distinct replay witnesses.
# Control file versions are signed exact pins: changed-and-restored content has
# a different version; missing, trashed or extra objects deny.
import hmac
import base64
import ssl
import urllib.parse
import urllib.request

STEM="HF100-retained-oid16397-canonical-roles-only-"
NAMES=("claim.json","target-backup.pgp","backup-capture.json","prepared.json","terminal.json")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kw):deny("HF100_REMOTE_REDIRECT_DENIED")

class Drive:
    def __init__(self,token,permission_id):
        need(isinstance(token,str) and len(token)>=16,"HF100_DRIVE_CREDENTIAL_REQUIRED")
        self.token=token
        self.permission_id=permission_id
    def request(self,path,*,query=None,data=None,content_type=None,upload=False,limit=8*1024*1024):
        base="https://www.googleapis.com/"+("upload/" if upload else "")+"drive/v3/"
        u=base+path+("?" +urllib.parse.urlencode(query) if query else "")
        headers={"Authorization":"Bearer "+self.token,"Accept":"application/json","User-Agent":"HF100-owner-installer"}
        if content_type:headers["Content-Type"]=content_type
        op=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        with op.open(urllib.request.Request(u,data=data,headers=headers),timeout=45) as r:raw=r.read(limit+1)
        need(len(raw)<=limit,"HF100_DRIVE_RESPONSE_LIMIT");return raw
    def obj(self,*args,**kw):return strict(self.request(*args,**kw))
    def identity(self):
        need(self.obj("about",query={"fields":"user(permissionId)"}).get("user",{}).get("permissionId")==self.permission_id,"HF100_DRIVE_PRINCIPAL_DRIFT")
    def pages(self,path,query,key):
        result=[];token=None
        for _ in range(20):
            p=dict(query)
            if token:p["pageToken"]=token
            x=self.obj(path,query=p);r=x.get(key)
            need(isinstance(r,list) and x.get("incompleteSearch",False) is False,"HF100_DRIVE_CENSUS_INCOMPLETE")
            result+=r;token=x.get("nextPageToken")
            if not token:return result
        deny("HF100_DRIVE_CENSUS_LIMIT")
    def acl(self,id):
        rows=self.pages("files/"+id+"/permissions",{"fields":"nextPageToken,permissions(id,type,role,deleted)","pageSize":100},"permissions")
        need(rows and all(p.get("type")=="user" and p.get("deleted",False) is False and isinstance(p.get("id"),str) and p.get("role") in ("owner","writer","reader","commenter","organizer","fileOrganizer") for p in rows),"HF100_DRIVE_PRIVATE_ACL_REQUIRED")
        return sha(canonical(sorted([{"id":p["id"],"type":p["type"],"role":p["role"]} for p in rows],key=lambda p:p["id"])))
    def meta(self,id):
        return self.obj("files/"+id,query={"fields":"id,name,parents,mimeType,trashed,version,size"})
    def folder(self,id,pin):
        self.identity();m=self.meta(id)
        need(m.get("id")==id and m.get("trashed") is False and m.get("mimeType")=="application/vnd.google-apps.folder" and self.acl(id)==pin,"HF100_PRIVATE_FOLDER_DRIFT")
    def children(self,id):
        rows=self.pages("files",{"q":"'"+id+"' in parents","fields":"nextPageToken,incompleteSearch,files(id,name,parents,trashed,version)","pageSize":100},"files")
        need(all(id in x.get("parents",[]) and isinstance(x.get("id"),str) and isinstance(x.get("name"),str) for x in rows),"HF100_DRIVE_PARENT_DRIFT")
        return rows
    def read(self,id,parent,acl_pin,version=None):
        m=self.meta(id)
        need(m.get("id")==id and m.get("parents")==[parent] and m.get("trashed") is False and isinstance(m.get("version"),str) and re.fullmatch(r"[1-9]\d{0,19}",m["version"]) and (version is None or m["version"]==version),"HF100_DRIVE_OBJECT_DRIFT")
        need(m.get("mimeType") not in ("application/vnd.google-apps.folder","application/vnd.google-apps.shortcut") and self.acl(id)==acl_pin,"HF100_DRIVE_FILE_ACL_DRIFT")
        raw=self.request("files/"+id,query={"alt":"media"},limit=64*1024*1024)
        need(str(len(raw))==m.get("size") and self.meta(id)==m and self.acl(id)==acl_pin,"HF100_DRIVE_READBACK_CHANGED")
        return raw,{"id":id,"version":m["version"],"sha256":sha(raw),"size":len(raw)}
    def create(self,parent,name,raw,acl_pin):
        need(len(raw)<=64*1024*1024,"HF100_DRIVE_WRITE_LIMIT")
        boundary="hf100"+uuid.uuid4().hex
        meta=canonical({"name":name,"parents":[parent],"mimeType":"application/octet-stream"})
        data=(("--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").encode()+meta+
           ("\r\n--"+boundary+"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()+raw+("\r\n--"+boundary+"--\r\n").encode())
        o=self.obj("files",query={"uploadType":"multipart","fields":"id,parents"},data=data,content_type="multipart/related; boundary="+boundary,upload=True)
        need(isinstance(o.get("id"),str) and re.fullmatch(r"[A-Za-z0-9_-]{8,128}",o["id"]) and o.get("parents")==[parent],"HF100_DRIVE_WRITE_UNCERTAIN")
        got,ref=self.read(o["id"],parent,acl_pin);need(got==raw,"HF100_DRIVE_WRITE_READBACK_FAILED")
        return ref

class RegistryDrive:
    def __init__(self,order,control,custody):
        self.o=order;self.control=control;self.custody=custody
    def authority(self):
        c=self.o["control"];self.control.folder(c["folder_id"],c["folder_acl_sha256"])
        items=self.control.children(c["folder_id"])
        pins={c[k]["id"] for k in ("status","owner_keyring","recovery_keyring")}
        need(len(items)==3 and {x["id"] for x in items}==pins and all(x.get("trashed") is False for x in items),"HF100_STOP_REVOKED_OR_CONTROL_CENSUS_DRIFT")
        data={};refs={}
        for k in ("status","owner_keyring","recovery_keyring"):
            f=c[k];raw,ref=self.control.read(f["id"],c["folder_id"],f["acl_sha256"],f["version"])
            need(sha(raw)==f["sha256"],"HF100_CONTROL_CONTENT_DRIFT");data[k]=raw;refs[k]=ref
        st=strict(data["status"])
        need(st=={"schema":"HF100_ACTIVE_V3","nonce":self.o["order_id"],"owner_fingerprint":self.o["owner_fingerprint"],"expires_at":self.o["expires_at"],"state":"ACTIVE"},"HF100_STOP_OR_REVOCATION_ACTIVE")
        need(utc(self.o["not_before"])<=clock()<utc(self.o["expires_at"]),"HF100_AUTHORITY_EXPIRED")
        return refs,data
    def census(self):
        c=self.o["custody"];self.custody.folder(c["folder_id"],c["folder_acl_sha256"])
        rows=[x for x in self.custody.children(c["folder_id"]) if x["name"].startswith(STEM)]
        need(all(x.get("trashed") is False and x["name"] in {STEM+n for n in NAMES} for x in rows) and len({x["name"] for x in rows})==len(rows),"HF100_CUSTODY_DUPLICATE_OR_TRASHED")
        return {x["name"][len(STEM):]:x for x in rows}
    def absent(self):
        need(not self.census(),"HF100_DRIVE_PRIOR_EXECUTION_NO_RETRY")
    def read(self,name):
        r=self.census().get(name);need(r is not None,"HF100_CUSTODY_OBJECT_MISSING")
        c=self.o["custody"]
        return self.custody.read(r["id"],c["folder_id"],c["file_acl_sha256"],r["version"])
    def put_once(self,name,raw):
        need(name in NAMES and name not in self.census(),"HF100_CUSTODY_PRIOR_OBJECT_NO_RETRY")
        c=self.o["custody"]
        ref=self.custody.create(c["folder_id"],STEM+name,raw,c["file_acl_sha256"])
        got,again=self.read(name)
        need(got==raw and ref==again,"HF100_CUSTODY_WRITE_UNCERTAIN_NO_RETRY")
        return ref

def seal(key,order,attempt,phase,previous,data):
    record={"schema":"HF100_RECEIPT_V3","order_sha256":order["owner_order_sha256"],"contract_sha256":order["contract_sha256"],
     "target_action":"retained-oid16397-canonical-roles-only","attempt":attempt,"phase":phase,"previous_sha256":previous,
     "timestamp":iso(clock()),"data":data}
    return canonical({"receipt":record,"hmac_sha256":hmac.new(key,canonical(record),hashlib.sha256).hexdigest()})

def unseal(key,raw):
    r=strict(raw);exact(r,("receipt","hmac_sha256"))
    need(raw==canonical(r) and isinstance(r["receipt"],dict) and isinstance(r["hmac_sha256"],str) and
         hmac.compare_digest(r["hmac_sha256"],hmac.new(key,canonical(r["receipt"]),hashlib.sha256).hexdigest()),"HF100_RECEIPT_AUTHENTICATION_FAILED")
    return r["receipt"]
