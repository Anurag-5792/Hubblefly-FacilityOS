#!/usr/bin/env python3
"""Actual disposable canonical PG18 employee identity lifecycle. No provider or live credentials."""
from pathlib import Path
import hashlib, json, subprocess, time, uuid
ROOT=Path(__file__).resolve().parents[2]
DB="hft_r1_disposable_hf101"
C="hf101-"+uuid.uuid4().hex[:12]
def run(*args,data=None,check=True):
    p=subprocess.run(["docker",*args],input=data,text=True,capture_output=True,timeout=180)
    if check and p.returncode:raise RuntimeError(p.stderr[-4000:])
    return p
def q(s,db=DB,user="postgres",check=True):
    return run("exec","-i",C,"psql","-X","-Atq","-v","ON_ERROR_STOP=1","-U",user,"-d",db,data=s,check=check)
def deny(s,code,user="hf101_gateway"):
    p=q(s,user=user,check=False);assert p.returncode and code in p.stderr,p.stderr
def query(s):return json.loads(q(s,user="hf101_gateway").stdout)
def main():
    try:
        run("run","-d","--rm","--network","none","--name",C,"-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18.7")
        for _ in range(60):
            if run("exec",C,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError("fixture startup")
        q("CREATE DATABASE "+DB,db="postgres")
        assert q("SHOW server_version_num;").stdout.strip()=="180007"
        manifest=json.loads((ROOT/"db/migrations/manifest.v1.json").read_text())
        for m in manifest["migrations"]:
            raw=(ROOT/"db/migrations"/m["file"]).read_bytes();assert hashlib.sha256(raw).hexdigest()==m["sha256"];q(raw.decode())
        base=(ROOT/"db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql").read_text()
        stop="DO $STOP_APP_ROLE_ASSIGNMENT$ BEGIN\n RAISE EXCEPTION 'HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED';\nEND $STOP_APP_ROLE_ASSIGNMENT$;"
        assert base.count(stop)==1;q(base.replace(stop,""))
        src=(ROOT/"review-candidates/hf101-employee-login/10-employee-login.NONEXECUTABLE.sql").read_text()
        stop="DO $STOP_HF101$ BEGIN\n RAISE EXCEPTION 'HF101_EMPLOYEE_LOGIN_INSTALLATION_NOT_ADMITTED';\nEND $STOP_HF101$;"
        deny(src,"HF101_EMPLOYEE_LOGIN_INSTALLATION_NOT_ADMITTED",user="postgres")
        assert src.count(stop)==1
        q("CREATE ROLE hft_r1_employee_login_owner NOLOGIN NOINHERIT; GRANT CREATE ON DATABASE "+DB+" TO hft_r1_employee_login_owner; GRANT USAGE ON SCHEMA hft,hft_app_roles TO hft_r1_employee_login_owner; GRANT SELECT ON hft.employee,hft.legal_entity,hft.site,hft.warehouse,hft_app_roles.identity_binding,hft_app_roles.scope_lock,hft_app_roles.assignment TO hft_r1_employee_login_owner; GRANT REFERENCES ON hft_app_roles.identity_binding TO hft_r1_employee_login_owner;")
        q("SET ROLE hft_r1_employee_login_owner;\n"+src.replace(stop,"")+"\nRESET ROLE;")
        q("REVOKE CREATE ON DATABASE "+DB+" FROM hft_r1_employee_login_owner;")
        q("""
INSERT INTO hft.legal_entity(id,name) VALUES('HF101-HFT','Synthetic company');
INSERT INTO hft.site VALUES('HF101-HFT','HF101-SITE','Synthetic site',true);
INSERT INTO hft.warehouse(legal_entity_id,warehouse_id,site_id,name) VALUES('HF101-HFT','HF101-WH','HF101-SITE','Synthetic warehouse');
INSERT INTO hft.employee(legal_entity_id,employee_id,site_id,full_name,department,designation,active) VALUES
 ('HF101-HFT','HF101-OWNER','HF101-SITE','Synthetic owner','QA','Fixture',true),
 ('HF101-HFT','HF101-A','HF101-SITE','Synthetic A','QA','Fixture',true),
 ('HF101-HFT','HF101-B','HF101-SITE','Synthetic B','QA','Fixture',true);
INSERT INTO hft_app_roles.identity_binding VALUES
 ('HF101-OWNER-SUB','HF101-HFT','HF101-OWNER','HF101-OWNER-PERSON',true),
 ('HF101-A-SUB','HF101-HFT','HF101-A','HF101-A-PERSON',true),
 ('HF101-B-SUB','HF101-HFT','HF101-B','HF101-B-PERSON',true);
INSERT INTO hft_app_roles.scope_lock(legal_entity_id,site_id,warehouse_id) VALUES('HF101-HFT','HF101-SITE','HF101-WH');
INSERT INTO hft_employee_login.employee_login_registration(legal_entity_id,employee_id,subject,person_id,email,google_subject)
 VALUES('HF101-HFT','HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON','owner@example.invalid','10001');
INSERT INTO hft_employee_login.employee_login_event(legal_entity_id,employee_id,version,action,actor_subject,reason)
 VALUES('HF101-HFT','HF101-OWNER',1,'REGISTER','FIXTURE-AUTHORITY','Synthetic owner fixture only');
CREATE ROLE hf101_gateway LOGIN NOINHERIT;
GRANT USAGE ON SCHEMA hft_employee_login TO hf101_gateway;
GRANT EXECUTE ON FUNCTION hft_employee_login.employee_login_context_v1(text,text,text,text,bigint,bigint),
 hft_employee_login.employee_google_claim_v1(text,text),
 hft_employee_login.employee_email_register_v1(text,text,text,bigint,text,text,text,bigint,bigint,text,text),
 hft_employee_login.employee_email_target_v1(text,text,text,text,text,bigint,bigint,text) TO hf101_gateway;
CREATE ROLE hf101_role_runtime LOGIN NOINHERIT;
GRANT USAGE ON SCHEMA hft_employee_login TO hf101_role_runtime;
GRANT EXECUTE ON FUNCTION hft_employee_login.employee_session_assert_v1(text,text,text,text,bigint,bigint,text) TO hf101_role_runtime;
""")
        def assignment(emp,rev,roles):
            s={"employeeId":emp,"scope":{"legalEntityId":"HF101-HFT","siteId":"HF101-SITE","warehouseId":"HF101-WH"},"revision":rev,"revokedFrom":None,"periods":[{"from":"2020-01-01T00:00:00.000Z","to":None,"roles":roles}] if roles else []}
            req=str(uuid.uuid4());ev={"requestId":req,"after":s,"actorSubject":"HF101-OWNER-SUB","actorSessionId":"FIXTURE","reason":"Synthetic role fixture"}
            q("BEGIN; INSERT INTO hft_app_roles.assignment VALUES('HF101-HFT','HF101-SITE','HF101-WH','"+emp+"',"+str(rev)+",'"+json.dumps(s)+"') ON CONFLICT(legal_entity_id,site_id,warehouse_id,employee_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot; INSERT INTO hft_app_roles.assignment_event(request_id,legal_entity_id,site_id,warehouse_id,employee_id,revision,event,event_sha256) VALUES('"+req+"','HF101-HFT','HF101-SITE','HF101-WH','"+emp+"',"+str(rev)+",'"+json.dumps(ev)+"',repeat('a',64)); COMMIT;")
        assignment("HF101-OWNER",1,["OWNER_ADMIN"])
        def reg(emp,email,expected=0):
            return "SELECT hft_employee_login.employee_email_register_v1('HF101-HFT','"+emp+"','"+email+"',"+str(expected)+",'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1,'HF101-WH','Synthetic registration');"
        def claim(email,sub):return "SELECT hft_employee_login.employee_google_claim_v1('"+email+"','"+sub+"');"
        def ctx(emp,ver,ev=1):return "SELECT hft_employee_login.employee_login_context_v1('HF101-HFT','HF101-"+emp+"','HF101-"+emp+"-SUB','HF101-"+emp+"-PERSON',"+str(ver)+","+str(ev)+");"
        def target(emp):
            return "SELECT hft_employee_login.employee_email_target_v1('HF101-HFT','"+emp+"','HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1,'HF101-WH');"
        assert query(target("HF101-A"))["version"]==0
        deny(claim("unknown@example.invalid","20000"),"HF101_EMPLOYEE_LOGIN_DENIED")
        assert q(reg("HF101-A","A@example.invalid"),user="hf101_gateway").stdout.strip()=="1"
        deny(reg("HF101-B","a@example.invalid"),"duplicate key")
        assert q(reg("HF101-B","b@example.invalid"),user="hf101_gateway").stdout.strip()=="1"
        a=query(claim("a@example.invalid","20001"));b=query(claim("b@example.invalid","20002"))
        assert a["employeeId"]=="HF101-A" and b["employeeId"]=="HF101-B" and a["loginVersion"]==b["loginVersion"]==2
        assert a["assignments"]==b["assignments"]==[]
        assert query(target("HF101-A"))=={"employeeId":"HF101-A","fullName":"Synthetic A","email":"a@example.invalid","version":2,"bound":True}
        deny(target("HF101-A").replace("'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1","'HF101-B','HF101-B-SUB','HF101-B-PERSON',2,1"),"HF101_EMPLOYEE_REGISTRATION_DENIED")
        check="SELECT hft_employee_login.employee_session_assert_v1('HF101-HFT','HF101-A','HF101-A-SUB','HF101-A-PERSON',2,1,'HF101-SITE');"
        assert q(check,user="hf101_role_runtime").stdout.strip()=="t"
        deny(check.replace("HF101-SITE","WRONG-SITE"),"HF101_EMPLOYEE_SESSION_DENIED",user="hf101_role_runtime")
        deny(ctx("A",2),"permission denied",user="hf101_role_runtime")
        deny(check,"permission denied")
        deny(claim("a@example.invalid","20002"),"HF101_EMPLOYEE_LOGIN_DENIED")
        deny(claim("a@example.invalid","99999"),"HF101_EMPLOYEE_LOGIN_DENIED")
        deny(reg("HF101-B","other@example.invalid",2).replace("'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1","'HF101-A','HF101-A-SUB','HF101-A-PERSON',2,1"),"HF101_EMPLOYEE_REGISTRATION_DENIED")
        assignment("HF101-A",1,["VIEWER"]);assert query(ctx("A",2))["assignments"][0]["periods"][0]["roles"]==["VIEWER"]
        assignment("HF101-A",2,[]);assert query(ctx("A",2))["assignments"][0]["periods"]==[]
        assert q(reg("HF101-A","a-new@example.invalid",2),user="hf101_gateway").stdout.strip()=="3"
        deny(ctx("A",2),"HF101_EMPLOYEE_SESSION_DENIED")
        deny(check,"HF101_EMPLOYEE_SESSION_DENIED",user="hf101_role_runtime")
        deny(claim("a@example.invalid","20001"),"HF101_EMPLOYEE_LOGIN_DENIED")
        deny(claim("a-new@example.invalid","99999"),"HF101_EMPLOYEE_LOGIN_DENIED")
        assert query(claim("a-new@example.invalid","20001"))["loginVersion"]==3
        q("UPDATE hft.employee SET active=false,version=version+1 WHERE employee_id='HF101-A';")
        deny(ctx("A",3),"HF101_EMPLOYEE_SESSION_DENIED")
        deny(claim("a-new@example.invalid","20001"),"HF101_EMPLOYEE_LOGIN_DENIED")
        q("UPDATE hft.employee SET active=true,version=version+1 WHERE employee_id='HF101-A';")
        deny(ctx("A",3),"HF101_EMPLOYEE_SESSION_DENIED")
        assert query(claim("a-new@example.invalid","20001"))["employeeVersion"]==3
        deny("SELECT * FROM hft_employee_login.employee_login_registration","permission denied")
        deny("SELECT * FROM hft_employee_login.employee_login_registration","permission denied",user="hf101_role_runtime")
        deny("SELECT * FROM hft.employee","permission denied")
        assert q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_employee_login' AND has_function_privilege('hf101_gateway',p.oid,'EXECUTE')").stdout.strip()=="4"
        deny("UPDATE hft_employee_login.employee_login_event SET reason='tampered'","permission denied")
        deny("DELETE FROM hft_employee_login.employee_login_event","HF101_LOGIN_AUDIT_IMMUTABLE",user="postgres")
        assert int(q("SELECT count(*) FROM hft_employee_login.employee_login_event").stdout)>5
        print("HF101_EMPLOYEE_LOGIN_PG18=PASS; canonical registration, two identities, pending role, duplicate/conflict denial, role persistence/revocation, email change, deactivation/old session denial, audit and gateway ACL")
    finally:run("rm","-f",C,check=False)
if __name__=="__main__":main()
