"""HF094 V2 admission/custody successor. No resource provisioning.
One original combined HF11 signature; AWS compliance Object Lock is a
supported custody candidate ONLY if an existing approved bucket and host
satisfy the actual provider checks. No local/Drive fallback.
"""
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
RUNNER_PATH="tools/hft_roles_only_install_094_v2.py"
FINAL_FIELDS=("accepted_runner_commit","accepted_runner_tree","bounded_security_acceptance_ref","exact_head_ci_ref",
 "runner_path","runner_sha256","versioned_contract_sha256")
TIME_FIELDS=("issued_at_utc","not_before_utc","expires_at_utc","accepted_key_expiry_and_revocation_policy_ref")
BINS=("git","gpgv","gpg","psql","pg_dump","docker","aws")
HEX=re.compile(r"[0-9a-f]{64}\Z")
SHA=re.compile(r"[0-9a-f]{40}\Z")
FP=re.compile(r"[A-F0-9]{40}\Z")
BUCKET=re.compile(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\Z")
REGION=re.compile(r"[a-z]{2}-[a-z]+-\d\Z")
ACCOUNT=re.compile(r"\d{12}\Z")
ARN=re.compile(r"arn:aws:iam::\d{12}:role/[A-Za-z0-9_+=,.@/-]+\Z")

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
    refpat=r"https://github\.com/Anurag-5792/Hubblefly-FacilityOS/(?:pull/24|issues/12|pull/20)#issuecomment-([1-9]\d*)"
    sec=re.fullmatch(refpat,str(f["bounded_security_acceptance_ref"]))
    kp=re.fullmatch(refpat,str(v["accepted_key_expiry_and_revocation_policy_ref"]))
    need(ci and sec and kp,"V2_FINAL_ACCEPTANCE_OR_KEY_POLICY_REFERENCE_REQUIRED")
    need(o["resources"]["retained_roles_only"]==v1.TARGET and o["single_initial_hf094_order"]["authorized_action"]==v1.ACTION,"V2_TARGET_ACTION_DENIED")
    exact(c,("schema","nonce","policy_sha256","security_acceptance_sha256","key_policy_sha256","owner_keyring_sha256","provider_database_id",
     "ca_sha256","host","tools","registry","backup"))
    need(c["schema"]=="HF094_MACHINE_CONTRACT_V2" and c["policy_sha256"]==policy_sha and c["provider_database_id"]==860001,"V2_MACHINE_CONTRACT_DENIED")
    need(all(pin(c[k]) for k in ("security_acceptance_sha256","key_policy_sha256","owner_keyring_sha256","ca_sha256")),"V2_MACHINE_CONTRACT_PIN_INVALID")
    need(str(uuid.UUID(c["nonce"]))==c["nonce"] and uuid.UUID(c["nonce"]).version==4,"V2_EXECUTION_NONCE_INVALID")
    exact(c["tools"],BINS);need(all(pin(x) for x in c["tools"].values()),"V2_TOOL_PIN_REQUIRED")
    h=c["host"];exact(h,("source_root","uid","machine_id_sha256","python_sha256","manifest_path","manifest_sha256","instance_id","image_id","instance_profile_arn","sts_arn"))
    need(isinstance(h["uid"],int) and type(h["uid"]) is int and h["uid"]>0 and all(pin(h[k]) for k in ("machine_id_sha256","python_sha256","manifest_sha256")),"V2_HOST_PIN_REQUIRED")
    need(all(isinstance(h[k],str) and Path(h[k]).is_absolute() for k in ("source_root","manifest_path")) and re.fullmatch(r"i-[0-9a-f]{8,17}",h["instance_id"]) and re.fullmatch(r"ami-[0-9a-f]{8,17}",h["image_id"]),"V2_HOST_IDENTITY_INVALID")
    r=c["registry"];exact(r,("bucket","account","region","prefix","policy_sha256","owner_control_role","executor_role","retain_until"))
    need(BUCKET.fullmatch(r["bucket"]) and ACCOUNT.fullmatch(r["account"]) and REGION.fullmatch(r["region"]) and pin(r["policy_sha256"]),"V2_PROTECTED_REGISTRY_PIN_REQUIRED")
    need(r["prefix"]=="hf094/retained-roles-only/v2" and all(ARN.fullmatch(r[k]) and r[k].split(":")[4]==r["account"] for k in ("owner_control_role","executor_role")) and r["owner_control_role"]!=r["executor_role"],"V2_REGISTRY_PRINCIPAL_INVALID")
    # Distinct machine IAM duties, NOT distinct human approvers.
    role=r["executor_role"].split("/")[-1]
    need(h["sts_arn"]=="arn:aws:sts::"+r["account"]+":assumed-role/"+role+"/"+h["instance_id"] and h["instance_profile_arn"].startswith("arn:aws:iam::"+r["account"]+":instance-profile/"),"V2_INSTANCE_ROLE_BINDING_DENIED")
    need(utc(r["retain_until"])>=utc("2026-12-26T18:29:59Z")+dt.timedelta(days=90),"V2_RETENTION_TOO_SHORT")
    b=c["backup"];exact(b,("recovery_fingerprint","recovery_keyring_sha256","restore_image"))
    need(FP.fullmatch(b["recovery_fingerprint"]) and pin(b["recovery_keyring_sha256"]) and re.fullmatch(r"postgres@sha256:[0-9a-f]{64}",b["restore_image"]),"V2_BACKUP_RECOVERY_PIN_INVALID")
    # Internal derived arguments are never independently accepted or signed.
    return {**c,"owner_fingerprint":o["issuer"]["corporate_openpgp_primary_fingerprint"],"order_id":c["nonce"],"owner_order_sha256":sha(raw),"contract_sha256":sha(contract_raw),
      "issued_at":v["issued_at_utc"],"not_before":v["not_before_utc"],"expires_at":v["expires_at_utc"],
      "installer_source_commit":f["accepted_runner_commit"],"installer_source_tree":f["accepted_runner_tree"],
      "ci_run_id":int(ci.group(1)),"security_comment_id":int(sec.group(1)),"key_policy_comment_id":int(kp.group(1)),
      "security_ref":f["bounded_security_acceptance_ref"],"key_policy_ref":v["accepted_key_expiry_and_revocation_policy_ref"]}

def root_readonly(path):
    p=Path(path)
    need(p.is_absolute() and not p.is_symlink() and p.exists(),"V2_HOST_PATH_DENIED")
    for q in [p,*p.parents]:
        st=q.stat()
        need(not q.is_symlink() and st.st_uid==0 and not st.st_mode&0o022 and not os.access(q,os.W_OK),"V2_HOST_PATH_MUTABLE")
    return p

class AWS:
    def __init__(self,order,run,binary):
        self.r=order["registry"];self.run=run;self.bin=binary("aws")
        # Instance profile credentials only; no caller-configured profile,
        # endpoint override, proxy, environment secret or AWS_CA_BUNDLE.
        self.env={"PATH":"/usr/local/bin:/usr/bin:/bin","HOME":"/nonexistent","LANG":"C.UTF-8",
          "AWS_CONFIG_FILE":"/dev/null","AWS_SHARED_CREDENTIALS_FILE":"/dev/null","AWS_DEFAULT_REGION":self.r["region"],
          "AWS_PAGER":"","AWS_CLI_AUTO_PROMPT":"off","AWS_MAX_ATTEMPTS":"1"}
    def call(self,service,operation,*args,check=True):
        p=self.run([self.bin,"--no-cli-pager","--no-paginate","--output","json","--region",self.r["region"],service,operation,*args],
          env=self.env,check=check)
        if not check:return p
        return strict(p.stdout) if p.stdout.strip() else {}
    def s3(self,op,*args,check=True):
        return self.call("s3api",op,"--bucket",self.r["bucket"],"--expected-bucket-owner",self.r["account"],*args,check=check)

def verify_host(order,aws,binary,root):
    h=order["host"]
    need(sys.flags.isolated and sys.dont_write_bytecode and os.geteuid()==h["uid"] and os.geteuid()!=0,"V2_APPROVED_ISOLATED_HOST_REQUIRED")
    need(str(Path(root).resolve())==h["source_root"],"V2_APPROVED_CHECKOUT_PATH_MISMATCH")
    root_readonly(root);root_readonly(root/".git");root_readonly(Path(__file__).resolve())
    need(file_hash(root_readonly("/etc/machine-id"))==h["machine_id_sha256"] and file_hash(root_readonly(Path(sys.executable).resolve()))==h["python_sha256"],"V2_HOST_MACHINE_OR_PYTHON_DRIFT")
    mf=root_readonly(h["manifest_path"]);need(file_hash(mf)==h["manifest_sha256"],"V2_APPROVED_HOST_MANIFEST_DRIFT")
    m=strict(mf.read_bytes());exact(m,("schema","files"))
    need(m["schema"]=="HF094_ROOT_OWNED_HOST_TOOLCHAIN_V1" and isinstance(m["files"],dict) and len(m["files"])>=len(BINS)+1,"V2_HOST_DEPENDENCY_MANIFEST_REQUIRED")
    for path,expected in m["files"].items():
        need(pin(expected) and file_hash(root_readonly(path))==expected,"V2_HOST_DEPENDENCY_DRIFT")
    for name in BINS:
        p=binary(name);need(m["files"].get(p)==order["tools"][name] and file_hash(root_readonly(p))==order["tools"][name],"V2_HOST_TOOL_DRIFT")
    need(m["files"].get(str(Path(sys.executable).resolve()))==h["python_sha256"],"V2_PYTHON_NOT_IN_HOST_MANIFEST")
    identity=aws.call("sts","get-caller-identity")
    need(identity.get("Account")==order["registry"]["account"] and identity.get("Arn")==h["sts_arn"],"V2_APPROVED_INSTANCE_PRINCIPAL_DENIED")
    d=aws.call("ec2","describe-instances","--instance-ids",h["instance_id"])
    instances=[i for r in d.get("Reservations",[]) for i in r.get("Instances",[])]
    need(len(instances)==1,"V2_INSTANCE_IDENTITY_NOT_UNIQUE")
    i=instances[0];need(i.get("InstanceId")==h["instance_id"] and i.get("ImageId")==h["image_id"] and i.get("IamInstanceProfile",{}).get("Arn")==h["instance_profile_arn"] and i.get("State",{}).get("Name")=="running","V2_APPROVED_INSTANCE_IMAGE_OR_PROFILE_DENIED")
    return {"instance_id":h["instance_id"],"image_id":h["image_id"],"sts_arn":identity["Arn"],"toolchain_sha256":h["manifest_sha256"],"machine_id_sha256":h["machine_id_sha256"]}

def required_denials(r):
    """Exact Deny statements required in independently retrieved bucket policy.
    No mutable latest-only reference or local replay ledger is authoritative.
    """
    base="arn:aws:s3:::"+r["bucket"]+"/"+r["prefix"]
    def d(sid,actions,resource,condition=None):
        x={"Sid":sid,"Effect":"Deny","Principal":"*","Action":actions,"Resource":resource}
        if condition is not None:x["Condition"]=condition
        return x
    return [
      d("HF094NoDeletion",["s3:DeleteObject","s3:DeleteObjectVersion"],base+"/*"),
      d("HF094NoUnconditionalWrite","s3:PutObject",base+"/*",{"Null":{"s3:if-none-match":"true"}}),
      d("HF094OnlyCreate","s3:PutObject",base+"/*",{"StringNotEquals":{"s3:if-none-match":"*"}}),
      d("HF094ComplianceOnly","s3:PutObject",base+"/*",{"StringNotEquals":{"s3:object-lock-mode":"COMPLIANCE"}}),
      d("HF094RetentionFloor","s3:PutObject",base+"/*",{"DateLessThan":{"s3:object-lock-retain-until-date":r["retain_until"]}}),
      d("HF094ExplicitRetention","s3:PutObject",base+"/*",{"Null":{"s3:object-lock-retain-until-date":"true"}}),
      d("HF094ControlPrincipal","s3:PutObject",base+"/control/*",{"ArnNotEquals":{"aws:PrincipalArn":r["owner_control_role"]}}),
      d("HF094ExecutionPrincipal","s3:PutObject",base+"/execution/*",{"ArnNotEquals":{"aws:PrincipalArn":r["executor_role"]}}),
      d("HF094NoDutyPolicyMutation",["s3:PutBucketPolicy","s3:DeleteBucketPolicy","s3:PutBucketVersioning","s3:PutLifecycleConfiguration","s3:PutBucketObjectLockConfiguration","s3:DeleteBucket"],"arn:aws:s3:::"+r["bucket"],{"ArnEquals":{"aws:PrincipalArn":[r["owner_control_role"],r["executor_role"]]}})
    ]

class ProtectedRegistry:
    def __init__(self,order,aws):
        self.o=order;self.r=order["registry"];self.aws=aws
        self.prefix=self.r["prefix"]+"/"
    def qualify(self):
        r=self.r
        need(self.aws.s3("get-bucket-versioning").get("Status")=="Enabled","V2_REGISTRY_VERSIONING_REQUIRED")
        lock=self.aws.s3("get-object-lock-configuration").get("ObjectLockConfiguration",{})
        need(lock.get("ObjectLockEnabled")=="Enabled" and lock.get("Rule",{}).get("DefaultRetention",{}).get("Mode")=="COMPLIANCE","V2_REGISTRY_COMPLIANCE_LOCK_REQUIRED")
        policy=strict(self.aws.s3("get-bucket-policy")["Policy"])
        need(sha(canonical(policy))==r["policy_sha256"] and all(x in policy.get("Statement",[]) for x in required_denials(r)),"V2_REGISTRY_POLICY_DRIFT_OR_UNSAFE")
        lifecycle=self.aws.s3("get-bucket-lifecycle-configuration",check=False)
        need(lifecycle.returncode!=0 and b"NoSuchLifecycleConfiguration" in lifecycle.stderr,"V2_REGISTRY_LIFECYCLE_NOT_PROVEN_ABSENT")
    def versions(self,key):
        # No pagination ambiguity; includes historical versions and delete markers.
        path=self.prefix+key
        d=self.aws.s3("list-object-versions","--prefix",path)
        need(d.get("IsTruncated") is False and not d.get("NextKeyMarker") and not d.get("NextVersionIdMarker"),"V2_REGISTRY_LIST_INCOMPLETE")
        return [x for k in ("Versions","DeleteMarkers") for x in d.get(k,[]) if x.get("Key")==path]
    def absent(self,key):
        need(not self.versions(key),"V2_PROTECTED_STOP_REVOCATION_OR_REPLAY")
    def read(self,key):
        vs=self.versions(key)
        need(len(vs)==1 and vs[0].get("IsLatest") is True and vs[0].get("VersionId") not in (None,"null"),"V2_REGISTRY_VERSION_AMBIGUOUS_OR_MISSING")
        v=vs[0]["VersionId"];path=self.prefix+key
        retention=self.aws.s3("get-object-retention","--key",path,"--version-id",v).get("Retention",{})
        try:until=dt.datetime.fromisoformat(retention["RetainUntilDate"].replace("Z","+00:00"))
        except (ValueError,KeyError,TypeError):deny("V2_REGISTRY_RETENTION_INVALID")
        need(retention.get("Mode")=="COMPLIANCE" and until>=utc(self.r["retain_until"]),"V2_REGISTRY_VERSION_NOT_PROTECTED")
        with tempfile.TemporaryDirectory(prefix="hf094-protected-read-") as tmp:
            p=Path(tmp)/"object"
            obj=self.aws.s3("get-object","--key",path,"--version-id",v,str(p))
            need(obj.get("VersionId")==v and p.is_file() and p.stat().st_size<=64*1024*1024,"V2_REGISTRY_READBACK_INVALID")
            raw=p.read_bytes()
        return raw,{"key":path,"version_id":v,"sha256":sha(raw),"retention_until":retention["RetainUntilDate"]}
    def put_once(self,key,raw):
        need(key.startswith("execution/") and len(raw)<=64*1024*1024,"V2_REGISTRY_EXECUTION_NAMESPACE_REQUIRED")
        self.qualify();self.absent(key)
        with tempfile.TemporaryDirectory(prefix="hf094-protected-write-") as tmp:
            p=Path(tmp)/"object";p.write_bytes(raw);p.chmod(0o600)
            o=self.aws.s3("put-object","--key",self.prefix+key,"--body",str(p),"--if-none-match","*",
              "--checksum-algorithm","SHA256","--server-side-encryption","AES256","--object-lock-mode","COMPLIANCE","--object-lock-retain-until-date",self.r["retain_until"])
        b,ref=self.read(key)
        need(b==raw and ref["version_id"]==o.get("VersionId"),"V2_REGISTRY_WRITE_UNCERTAIN_NO_RETRY")
        return ref
    def authority(self):
        self.qualify()
        # Stop is monotonic: ANY version, including a historical STOP masked by
        # a later version or delete marker, denies. No ACTIVE reactivation.
        for k in ("control/STOP","control/revoked/"+self.o["owner_fingerprint"],"control/stop/"+self.o["order_id"]):self.absent(k)
        raw,ref=self.read("control/active/"+self.o["order_id"])
        need(strict(raw)=={"schema":"HF094_PROTECTED_ACTIVE_V2","order_sha256":self.o["owner_order_sha256"],
          "contract_sha256":self.o["contract_sha256"],"owner_fingerprint":self.o["owner_fingerprint"],"expires_at":self.o["expires_at"]},"V2_PROTECTED_ACTIVE_PIN_MISMATCH")
        need(utc(self.o["not_before"])<=clock()<utc(self.o["expires_at"]),"V2_AUTHORITY_EXPIRED")
        return ref
    def keyring(self):
        b,_=self.read("control/owner.gpg")
        need(sha(b)==self.o["owner_keyring_sha256"],"V2_CURRENT_ENROLLED_KEYRING_DRIFT")
        return b
    def recovery_keyring(self):
        b,_=self.read("control/recovery.gpg")
        need(sha(b)==self.o["backup"]["recovery_keyring_sha256"],"V2_RECOVERY_KEYRING_DRIFT")
        return b

# One permanent key per exact target/action, not per re-signed nonce.
CONSUMED="execution/retained-oid16397-canonical-roles-only/consumed.json"
def guarded_apply(order,registry,host,ci,provider,wire,capture,assemble,execute,postflight):
    """The actual entrypoint uses these dependencies only after original
    signature/host/provider qualification. Tests may inject isolated fixtures.
    Claim before any target dump/DDL; all failure/uncertain paths retain claim.
    """
    registry.authority()
    consumed={"schema":"HF094_CONSUMED_V2","order_sha256":order["owner_order_sha256"],
      "nonce":order["order_id"],"attempt":str(uuid.uuid4()),"timestamp":iso(clock()),"host":host}
    stem="execution/retained-oid16397-canonical-roles-only/"
    claim_bytes=canonical(consumed)
    try:ref=registry.put_once(CONSUMED,claim_bytes)
    except BaseException:
        # A network error can occur after the conditional claim succeeded.
        # Try to record linked failure only for this exact attempted claim.
        try:
            b,found=registry.read(CONSUMED)
            if b==claim_bytes:registry.put_once(stem+"terminal.json",canonical({"schema":"HF094_TERMINAL_V2","state":"CLAIM_UNCERTAIN_NO_DDL","claim":found,"prepared":None,"timestamp":iso(clock())}))
        except BaseException:pass
        deny("V2_CLAIM_UNCONFIRMED_OR_CONSUMED_STOP_NO_RETRY")
    prepared=None;ddl_started=False;commit_observed=False
    try:
        baseline,tls=wire()
        recovery=capture(baseline,tls,registry,stem)
        again,tls2=wire()
        need(again==baseline,"V2_BASELINE_CHANGED_DURING_RECOVERY")
        current=registry.authority()
        need(provider()==order["provider_evidence"],"V2_PROVIDER_DRIFT")
        record={"schema":"HF094_PREPARED_V2","claim":ref,"order_sha256":order["owner_order_sha256"],
          "ci":ci,"host":host,"provider":order["provider_evidence"],"authority":current,"wire":tls2,
          "baseline_sha256":sha(canonical(baseline)),"recovery":recovery,"timestamp":iso(clock())}
        prepared=registry.put_once(stem+"prepared.json",canonical(record))
        registry.authority()
        _,claim=registry.read(CONSUMED);need(claim==ref,"V2_CONSUMED_CLAIM_DRIFT")
        final,_=wire();need(final==baseline,"V2_BASELINE_CHANGED_BEFORE_APPLY")
        statement=assemble(baseline,prepared["sha256"])
        registry.authority()
        _,finalclaim=registry.read(CONSUMED);need(finalclaim==ref,"V2_CONSUMED_CLAIM_DRIFT")
        ddl_started=True
        execute(statement)
        commit_observed=True
        post=postflight()
        result={"schema":"HF094_TERMINAL_V2","state":"COMMITTED_CATALOG_READBACK","claim":ref,"prepared":prepared,
          "postflight_sha256":sha(post.encode()),"timestamp":iso(clock()),"runtime_login_enabled":False}
        return registry.put_once(stem+"terminal.json",canonical(result))
    except BaseException:
        # Unknown commit is NEVER converted into a rollback claim. If terminal
        # persistence is down the compliance-locked consumption still denies retry.
        state="COMMIT_OBSERVED_POSTFLIGHT_OR_CUSTODY_UNCONFIRMED" if commit_observed else "SQL_OUTCOME_UNCERTAIN_NO_RETRY" if ddl_started else "FAILED_BEFORE_DDL_NO_RETRY"
        record={"schema":"HF094_TERMINAL_V2","state":state,"claim":ref,"prepared":prepared,"timestamp":iso(clock())}
        try:registry.put_once(stem+"terminal.json",canonical(record))
        except BaseException:deny("V2_TERMINAL_RECEIPT_UNAVAILABLE_CONSUMED_STOP_NO_RETRY")
        deny("V2_"+state)
