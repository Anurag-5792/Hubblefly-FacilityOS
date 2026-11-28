"""HF100 native transaction successor; internal integration, not a live CLI.

The accepted V3 installer and frozen SQL remain unchanged. A deployment
adapter must provide authenticated Neon/GitHub/Drive operations. No connector
credentials are exported. No environment switch enables fixtures in this code.
An original owner order finalized for this exact native contract, current
owner signature, independent execution-method acceptance, fixed target and
private receipt custody remain mandatory. Provider snapshots are NOT portable
encrypted backups or immutable storage. No parent rewind/finalization API.
"""
from __future__ import annotations
import copy, datetime as dt, importlib.util, json, re, subprocess, uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
h=load("hf100_accepted",ROOT/"tools/hft_roles_only_install_100.py")
control=h.control
registry=h.registry
v2=h.v2
need=control.need
sha=control.sha
canonical=control.canonical
strict=control.strict
exact=control.exact
pin=control.pin
utc=control.utc
clock=control.clock
original_canonical=control.original_canonical
SCHEMA=control.SCHEMA
TEMPLATE_SHA=control.TEMPLATE_SHA
FINAL_FIELDS=control.FINAL_FIELDS
TIME_FIELDS=control.TIME_FIELDS
SHA=control.SHA
RUNNER_PATH="tools/hf100-native-transport/native-guarded.py"
POLICY=ROOT/"review-candidates/hf100-native/policy.json"
FROZEN="281ddaff096c37910395e5470d6948f966010834"
TRANSPORT="9984ed1434be65a80668d061754dd98a15e19a0c"
COMPILER=ROOT/"tools/hf100-native-transport/native-statements.mjs"
COMPILER_SHA="bba2d9a92121bb9496c1f8d8d82acf3d0a4529ed984da28b24ecb23d799224bd"
WORKFLOW=".github/workflows/hft-roles-only-native-integration.yml"
MARKER="HF094_ROLES_ONLY_CATALOG_ACL_PASS"
def compile_transaction(sql,target):
    # Exact reviewed lexer, not naive semicolon splitting. Connector owns the
    # single outer transaction; the original bodies and ordering are preserved.
    need(sha(COMPILER.read_bytes())==COMPILER_SHA,"HF100_NATIVE_COMPILER_DRIFT")
    p=subprocess.run(["node","--input-type=module","-e",
        "import{readFileSync}from'node:fs';import{compileGuardedTransaction}from "+json.dumps(COMPILER.as_uri())+";process.stdout.write(JSON.stringify(compileGuardedTransaction(readFileSync(0,'utf8'))));"],
        input=sql.encode(),capture_output=True,check=False,timeout=20)
    need(p.returncode==0,"HF100_NATIVE_SQL_ENVELOPE_DENIED")
    statements=json.loads(p.stdout)
    need(isinstance(statements,list) and 2<=len(statements)<=1000 and statements[0] in ("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE","SET TRANSACTION READ ONLY") and all(isinstance(x,str) and x for x in statements),"HF100_NATIVE_SQL_ENVELOPE_DENIED")
    # Explicit standard-conforming parser setting and in-transaction identity
    # guard. External branch/compute/DB ID is also checked before EVERY call.
    return [statements[0],"SET LOCAL standard_conforming_strings=on",registry.identity_gate(target).strip(),*statements[1:]]
def result_lines(response,count):
    need(isinstance(response,dict) and isinstance(response.get("data"),list) and len(response["data"])==count,"HF100_NATIVE_RESULT_COUNT_UNCERTAIN_NO_RETRY")
    lines=[]
    for result in response["data"]:
        need(isinstance(result,dict) and result.get("truncated") is False and isinstance(result.get("rows"),list) and type(result.get("totalRowCount")) is int and result["totalRowCount"]==len(result["rows"]),"HF100_NATIVE_RESULT_TRUNCATED_OR_UNCERTAIN")
        for row in result["rows"]:
            need(isinstance(row,dict) and len(row)==1,"HF100_NATIVE_RESULT_SHAPE_DENIED")
            value=next(iter(row.values()))
            if value not in (None,""):
                need(isinstance(value,str),"HF100_NATIVE_RESULT_TYPE_DENIED")
                lines.append(value)
    return "\n".join(lines)

class NativePg(h.Pg):
    """An authenticated operation adapter, not an authorization boundary.
    transact must invoke exactly one provider run_sql_transaction with the
    explicit selectors below. provider_read returns fresh endpoint/db metadata.
    The application must never expose these callbacks to HTTP users.
    """
    def __init__(self,target,provider_id,provider_read,transact):
        self.target=copy.deepcopy(target);self.provider_id=provider_id
        self.provider_read=provider_read;self.transact=transact
    def provider(self):
        endpoint,databases=self.provider_read(self.target["project"],self.target["branch"],self.target["endpoint"])
        return v2.check_provider(endpoint,databases,self.target,self.provider_id)
    def exec(self,sql):
        self.provider()
        statements=compile_transaction(sql,self.target)
        t=self.target
        return result_lines(self.transact({"project_id":t["project"],"branch_id":t["branch"],"compute_id":t["endpoint"],"database_name":t["database"],"role_name":t["installer"],"sql_statements":statements,"max_rows":100}),len(statements))
    def wire(self):
        q="BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+registry.catalog_query(v2.CATALOG)+";\nCOMMIT;"
        c=strict(self.exec(q));t=self.target
        need(c["database"]==t["database"] and c["oid"]==str(t["database_oid"]) and c["session"]==c["current"]==c["owner"]==t["installer"] and c["version"]==str(t["server_version_num"]) and c["replica"] is False and c["port"]==t["port"] and c["address"],"HF100_NATIVE_DATABASE_IDENTITY_DENIED")
        return c,{"transport":"authenticated_neon_connector","provider":self.provider(),"catalog_sha256":sha(canonical(c)),"direct_client_tls":"NOT_OBSERVED_PROVIDER_MANAGED"}
    def dump(self):
        raise RuntimeError("HF100_NATIVE_NO_PORTABLE_DUMP")

def native_order(raw,contract_raw,now=None):
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
    need(f["runner_path"]==RUNNER_PATH and f["runner_sha256"]==sha(Path(__file__).read_bytes()) and f["versioned_contract_sha256"]==sha(contract_raw),"V2_SIGNED_RUNNER_OR_CONTRACT_DRIFT")
    need(all(isinstance(f[k],str) and SHA.fullmatch(f[k]) for k in FINAL_FIELDS[:2]),"V2_SUCCESSOR_SOURCE_UNBOUND")
    ci=re.fullmatch(r"https://github\.com/Anurag-5792/Hubblefly-FacilityOS/actions/runs/([1-9]\d*)",str(f["exact_head_ci_ref"]))
    refpat=r"https://github\.com/Anurag-5792/Hubblefly-FacilityOS/(?:pull/[1-9]\d*|issues/12)#issuecomment-([1-9]\d*)"
    sec=re.fullmatch(refpat,str(f["bounded_security_acceptance_ref"]))
    kp=re.fullmatch(refpat,str(v["accepted_key_expiry_and_revocation_policy_ref"]))
    need(ci and sec and kp,"V2_FINAL_ACCEPTANCE_OR_KEY_POLICY_REFERENCE_REQUIRED")
    need(o["resources"]["retained_roles_only"]==h.v1.TARGET and o["single_initial_hf094_order"]["authorized_action"]==h.v1.ACTION,"V2_TARGET_ACTION_DENIED")
    exact(c,("schema","nonce","policy_sha256","security_acceptance_sha256","key_policy_sha256","owner_keyring_sha256","provider_database_id",
     "control","custody","recovery","receipt_key_sha256","baseline_sha256"))
    need(c["schema"]=="HF100_NEON_NATIVE_CONTRACT_V1" and c["policy_sha256"]==sha(POLICY.read_bytes()) and c["provider_database_id"]==860001,"HF100_CONTRACT_DENIED")
    need(all(pin(c[k]) for k in ("security_acceptance_sha256","key_policy_sha256","owner_keyring_sha256","receipt_key_sha256","baseline_sha256")),"HF100_PIN_INVALID")
    need(str(uuid.UUID(c["nonce"]))==c["nonce"] and uuid.UUID(c["nonce"]).version==4,"HF100_NONCE_INVALID")
    control=c["control"];exact(control,("folder_id","folder_acl_sha256","reader_permission_id","status","owner_keyring","recovery_keyring"))
    custody=c["custody"];exact(custody,("folder_id","folder_acl_sha256","writer_permission_id","file_acl_sha256"))
    idpat=re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
    need(all(isinstance(x,str) and idpat.fullmatch(x) for x in (control["folder_id"],control["reader_permission_id"],custody["folder_id"],custody["writer_permission_id"])) and control["folder_id"]!=custody["folder_id"],"HF100_DRIVE_ID_INVALID")
    need(all(pin(x) for x in (control["folder_acl_sha256"],custody["folder_acl_sha256"],custody["file_acl_sha256"])),"HF100_DRIVE_ACL_PIN_REQUIRED")
    for field in ("status","owner_keyring","recovery_keyring"):
        file_pin=control[field];exact(file_pin,("id","version","sha256","acl_sha256"))
        need(isinstance(file_pin["id"],str) and idpat.fullmatch(file_pin["id"]) and isinstance(file_pin["version"],str) and re.fullmatch(r"[1-9]\d{0,19}",file_pin["version"]) and pin(file_pin["sha256"]) and pin(file_pin["acl_sha256"]),"HF100_CONTROL_FILE_PIN_REQUIRED")
    need(len({control[k]["id"] for k in ("status","owner_keyring","recovery_keyring")})==3 and control["owner_keyring"]["sha256"]==c["owner_keyring_sha256"],"HF100_CONTROL_KEY_PIN_MISMATCH")
    recovery=c["recovery"]
    exact(recovery,("snapshot_id","restore_branch_id","restore_endpoint_id","restore_database_id","proof_sha256","expires_at"))
    need(re.fullmatch(r"snap-[a-z0-9-]{1,90}",recovery["snapshot_id"]) and re.fullmatch(r"br-[a-z0-9-]{1,90}",recovery["restore_branch_id"]) and re.fullmatch(r"ep-[a-z0-9-]{1,90}",recovery["restore_endpoint_id"]) and recovery["restore_branch_id"]!=h.v1.TARGET["branch"] and recovery["restore_endpoint_id"]!=h.v1.TARGET["endpoint"] and type(recovery["restore_database_id"]) is int and recovery["restore_database_id"]!=860001 and pin(recovery["proof_sha256"]) and utc(recovery["expires_at"])>=end,"HF100_NATIVE_RECOVERY_CONTRACT_DENIED")
    need(o["issuer"]["corporate_openpgp_primary_fingerprint"]=="7C2FED6F5C4288AB5BA2662BC26C479D6885C73C","HF100_OWNER_PIN_DENIED")
    return {**c,"owner_fingerprint":o["issuer"]["corporate_openpgp_primary_fingerprint"],"order_id":c["nonce"],"owner_order_sha256":sha(raw),"contract_sha256":sha(contract_raw),
      "issued_at":v["issued_at_utc"],"not_before":v["not_before_utc"],"expires_at":v["expires_at_utc"],
      "installer_source_commit":f["accepted_runner_commit"],"installer_source_tree":f["accepted_runner_tree"],"ci_run_id":int(ci.group(1)),
      "security_comment_id":int(sec.group(1)),"key_policy_comment_id":int(kp.group(1)),
      "security_ref":f["bounded_security_acceptance_ref"],"key_policy_ref":v["accepted_key_expiry_and_revocation_policy_ref"]}


def verify_source(order,github_read):
    """Read GitHub exact accepted source, pinned native successor and CI using
    authenticated connector metadata; never trust a supplied success boolean."""
    ref=order["installer_source_commit"];root="/repos/Anurag-5792/Hubblefly-FacilityOS"
    def gh(path):return github_read(root+path)
    commit=gh("/git/commits/"+ref)
    need(commit.get("sha")==ref and commit.get("tree",{}).get("sha")==order["installer_source_tree"],"HF100_NATIVE_SOURCE_TREE_DRIFT")
    comparison=gh("/compare/"+FROZEN+"..."+ref)
    allowed={"tools/hf100-native-transport/native-statements.mjs","tools/hf100-native-transport/native-statements.test.mjs",RUNNER_PATH,
             "tests/test_hf100_native_integration.py","tests/postgres/hf100_native_connector_fixture.py",WORKFLOW,"review-candidates/hf100-native/policy.json","review-candidates/hf100-native/README.md"}
    files=comparison.get("files",[])
    need(comparison.get("merge_base_commit",{}).get("sha")==FROZEN and files and len(files)<50 and all(x["filename"] in allowed for x in files),"HF100_NATIVE_FROZEN_SOURCE_DRIFT")
    # Pin local executable and helper to the exact remote Git blobs before any
    # SQL assembly. All original SQL also receives accepted V1 byte checks.
    for path in (RUNNER_PATH,"tools/hf100-native-transport/native-statements.mjs","review-candidates/hf100-native/policy.json",
                 "tools/hft_roles_only_install_100.py","tools/hf100_registry.py","tools/hf100_control.py","tools/hft_roles_only_install_094.py","tools/hft_roles_only_install_094_v2.py"):
        obj=gh("/contents/"+path+"?ref="+ref)
        raw=(ROOT/path).read_bytes()
        import hashlib
        need(obj.get("sha")==hashlib.sha1(("blob %d\0"%len(raw)).encode()+raw).hexdigest(),"HF100_NATIVE_EXECUTABLE_SOURCE_DRIFT")
    for field,marker,pin_field,identity in (
        ("security","HF100_NATIVE_METHOD_SECURITY=ACCEPT","security_acceptance_sha256","HEAD="+ref),
        ("key_policy","HF094_OWNER_KEY_POLICY=ACCEPT","key_policy_sha256","FINGERPRINT="+v2.OWNER)):
        comment=gh("/issues/comments/"+str(order[field+"_comment_id"]))
        body=comment.get("body")
        need(comment.get("html_url")==order[field+"_ref"] and isinstance(body,str) and sha(body.encode())==order[pin_field] and marker in body.splitlines() and identity in body.splitlines(),"HF100_NATIVE_ACCEPTANCE_REFERENCE_DRIFT")
        if field=="key_policy":need("VALID_UNTIL="+v2.MAX_VALIDITY in body.splitlines(),"HF100_NATIVE_KEY_POLICY_WINDOW")
    run=gh("/actions/runs/"+str(order["ci_run_id"]))
    jobs=gh("/actions/runs/"+str(order["ci_run_id"])+"/attempts/"+str(run["run_attempt"])+"/jobs?per_page=100")
    return v2.check_ci_run(run,jobs,ref,WORKFLOW,("Verify frozen source and native transport guards","Execute native adapter PostgreSQL campaign"))
def stable_catalog(c):
    # Restored compute has a different backend address; all other catalog and
    # effective privilege details must match, including SQL database OID.
    return {k:v for k,v in c.items() if k!="address"}
def recovery_proof(order,base,observed):
    """Validate actual independently collected provider and SQL evidence.
    A snapshot of the pre-claim empty target is sufficient for recovery ONLY
    under the separately signed native method contract. The independent Drive
    claim remains the replay witness even if a database is restored.
    """
    exact(observed,("snapshot","restore_branch","restore_endpoint","restore_database","restore_catalog","parent_siblings","restore_siblings"))
    p=order["recovery"];t=h.v1.TARGET;s=observed["snapshot"];b=observed["restore_branch"];e=observed["restore_endpoint"];d=observed["restore_database"]
    need(s.get("id")==p["snapshot_id"] and s.get("source_branch_id")==t["branch"] and s.get("manual") is True and s.get("expires_at")==p["expires_at"] and utc(s["expires_at"])>=utc(order["expires_at"]) and clock()<utc(s["expires_at"]),"HF100_NATIVE_SNAPSHOT_NOT_CURRENT")
    need(b.get("id")==p["restore_branch_id"] and b.get("project_id")==t["project"] and b.get("default") is False and b.get("primary") is False and b.get("current_state")=="ready" and b.get("restore_status")=="restored" and b.get("restored_from")==p["snapshot_id"] and b.get("restored_as")==t["branch"] and utc(b["expires_at"])>=utc(order["expires_at"]),"HF100_NATIVE_ISOLATED_RESTORE_DENIED")
    need(e.get("id")==p["restore_endpoint_id"] and e.get("project_id")==t["project"] and e.get("branch_id")==p["restore_branch_id"] and e.get("disabled") is False and e.get("type")=="read_write","HF100_NATIVE_RESTORE_ENDPOINT_DENIED")
    need(d.get("id")==p["restore_database_id"] and d.get("id")!=order["provider_database_id"] and d.get("branch_id")==p["restore_branch_id"] and d.get("name")==t["database"] and d.get("owner_name")==t["installer"],"HF100_NATIVE_RESTORE_DATABASE_DENIED")
    restored=observed["restore_catalog"]
    need(stable_catalog(restored)==stable_catalog(base),"HF100_NATIVE_RESTORE_CATALOG_MISMATCH")
    # No whole-branch restore; verify the sibling inventory source is preserved.
    siblings=observed["parent_siblings"]
    need(isinstance(siblings,dict) and set(siblings)=={"item_candidates","opening_observations","source_rows","snapshots","grants","change_events","rename_events"} and siblings==observed["restore_siblings"],"HF100_NATIVE_SIBLING_RECOVERY_MISMATCH")
    for value in siblings.values():
        exact(value,("count","sha256"));need(type(value["count"]) is int and value["count"]>=0 and pin(value["sha256"]),"HF100_NATIVE_SIBLING_DIGEST_DENIED")
    # Hash the stable evidence, not mutable endpoint state timestamps. This
    # exact digest is pinned in the signed native order.
    evidence={"snapshot_id":s["id"],"snapshot_created_at":s["created_at"],"snapshot_expires_at":s["expires_at"],
      "restore_branch":b["id"],"restore_parent_lsn":b["parent_lsn"],"restore_endpoint":e["id"],"restore_database":d["id"],
      "catalog_sha256":sha(canonical(stable_catalog(base))),"siblings":siblings,
      "whole_branch_rewind_authorized":False,"portable_encrypted_backup":False,"provider_admin_immutable":False}
    need(sha(canonical(evidence))==p["proof_sha256"],"HF100_NATIVE_RECOVERY_PROOF_PIN_DRIFT")
    return evidence

def guarded_native(pg,custody,order,key,ci_result,authorize,recovery_read,sql,plan):
    # Private integration core; the public entry function below verifies the
    # genuine signature and current source/CI before calling this.
    authorize();custody.absent()
    provider=pg.provider();base,wire=pg.wire();v2.fresh(base,pg.target)
    registry.eligible(base["registry_privileges"],pg.target)
    need(sha(canonical(base))==order["baseline_sha256"],"HF100_SIGNED_BASELINE_DRIFT")
    evidence=recovery_proof(order,base,recovery_read())
    authorize();need(pg.provider()==provider,"HF100_NATIVE_PROVIDER_DRIFT")
    attempt=str(uuid.uuid4())
    claim=control.seal(key,order,attempt,"CLAIM",None,{"transport":"NEON_NATIVE","provider":provider,"baseline_sha256":sha(canonical(base)),"recovery_sha256":sha(canonical(evidence))})
    raws=[];refs={};claimed=False;ddl=False;committed=False
    try:
        anchor=custody.put_once("claim.json",claim);refs["claim.json"]=anchor
        authorize();pg.claim(base,claim);claimed=True;raws.append(claim)
        cat,wire=pg.wire();registry.check_delta(base,cat)
        shape=h.verify_chain(pg,custody,key,raws,refs)
        # Unlike V3, this receipt records the actual provider recovery proof,
        # not a fake target-backup.pgp or a claimed encrypted dump.
        capture=control.seal(key,order,attempt,"BACKUP_CAPTURE",sha(claim),{"method":"NEON_SNAPSHOT_ISOLATED_RESTORE","evidence":evidence})
        capture_ref=custody.put_once("backup-capture.json",capture)
        need(custody.read("backup-capture.json")== (capture,capture_ref),"HF100_NATIVE_CAPTURE_READBACK_DENIED")
        again,_=pg.wire();need(again==cat and h.verify_chain(pg,custody,key,raws,refs)==shape,"HF100_NATIVE_PREPARE_DRIFT")
        auth=authorize();need(pg.provider()==provider and recovery_proof(order,base,recovery_read())==evidence,"HF100_NATIVE_RECOVERY_DRIFT")
        prepared=control.seal(key,order,attempt,"PREPARED",sha(claim),{"claim":anchor,"ci":ci_result,"authority":auth,"wire":wire,"recovery":capture_ref,"catalog_sha256":sha(canonical(cat))})
        pref=custody.put_once("prepared.json",prepared);refs["prepared.json"]=pref
        pg.append(prepared);raws.append(prepared)
        final_shape=h.verify_chain(pg,custody,key,raws,refs)
        final,_=pg.wire();need(final==cat,"HF100_PRE_DDL_BASELINE_DRIFT")
        raw,ref=custody.read("backup-capture.json");need(raw==capture and ref==capture_ref and control.unseal(key,raw)["previous_sha256"]==sha(claim),"HF100_NATIVE_RECOVERY_CUSTODY_DRIFT")
        authorize();need(pg.provider()==provider and recovery_proof(order,base,recovery_read())==evidence,"HF100_NATIVE_PRE_DDL_PROVIDER_OR_RECOVERY_DRIFT")
        statement=h.assemble(sql,plan,order,cat,final_shape,pref["sha256"],pg.target)
        ddl=True
        need(MARKER in pg.exec(statement).splitlines(),"HF100_COMMIT_UNCERTAIN_NO_RETRY")
        committed=True
        post=pg.exec("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[h.v1.FILES[2]]+"\nCOMMIT;")
        need(post==MARKER and h.verify_chain(pg,custody,key,raws,refs)==final_shape,"HF100_POSTFLIGHT_UNCONFIRMED")
        terminal=control.seal(key,order,attempt,"TERMINAL",sha(prepared),{"state":"COMMITTED_CATALOG_READBACK","prepared":pref,"postflight_sha256":sha(post.encode()),"runtime_login_enabled":False})
        pg.append(terminal);raws.append(terminal);refs["terminal.json"]=custody.put_once("terminal.json",terminal)
        h.verify_chain(pg,custody,key,raws,refs)
        return refs["terminal.json"]
    except BaseException:
        state="COMMIT_OBSERVED_POSTFLIGHT_OR_CUSTODY_UNCONFIRMED" if committed else "SQL_OUTCOME_UNCERTAIN_NO_RETRY" if ddl else "FAILED_BEFORE_DDL_NO_RETRY"
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

def apply_native(*,raw,contract,signature,receipt_key,control_drive,custody_drive,github_read,provider_read,transact,recovery_read):
    """Integration entrypoint; no caller-supplied 'accepted' flag or target.
    Trusted provider adapter and private custody connections are mandatory.
    No CLI, token export, fake fixture admission or automatic retries.
    """
    order=native_order(raw,contract)
    need(isinstance(receipt_key,bytes) and len(receipt_key)==32 and sha(receipt_key)==order["receipt_key_sha256"],"HF100_RECEIPT_KEY_PIN_DENIED")
    custody=control.RegistryDrive(order,control_drive,custody_drive)
    def authorize():
        refs,keys=custody.authority()
        verified=v2.verify_owner(raw,signature,keys["owner_keyring"],order)
        return {"control":refs,"owner":verified}
    authorize()
    ci_result=verify_source(order,github_read)
    _,sql,plan=h.inspect()
    pg=NativePg(h.v1.TARGET,order["provider_database_id"],provider_read,transact)
    return guarded_native(pg,custody,order,receipt_key,ci_result,authorize,recovery_read,sql,plan)
