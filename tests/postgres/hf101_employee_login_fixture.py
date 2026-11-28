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
 ('HF101-HFT','HF101-B','HF101-SITE','Synthetic B','QA','Fixture',true),
 ('HF101-HFT','HF101-C','HF101-SITE','Synthetic C unbound','QA','Fixture',true),
 ('HF101-HFT','HF101-D','HF101-SITE','Synthetic D inactive','QA','Fixture',false);
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
 hft_employee_login.employee_email_target_v1(text,text,text,text,text,bigint,bigint,text),
 hft_employee_login.employee_directory_v1(text,text,text,text,bigint,bigint,text,text),
 hft_employee_login.employee_provider_rebind_v1(text,text,text,bigint,bigint,text,text,text,bigint,bigint,text,text,text) TO hf101_gateway;
CREATE ROLE hf101_role_runtime LOGIN NOINHERIT;
GRANT USAGE ON SCHEMA hft_employee_login TO hf101_role_runtime;
GRANT EXECUTE ON FUNCTION hft_employee_login.employee_session_assert_v1(text,text,text,text,bigint,bigint,text) TO hf101_role_runtime;
""")
        # Compare actual native PostgreSQL prosrc (not a fixture-invented pass)
        # to the source-pinned function catalog and dedicated ownership.
        pins=json.loads((ROOT/"lib/hft/live/employee-login-pins.ts").read_text().split(">>=",1)[1].strip().rstrip(";"))
        cat=json.loads(q("SELECT jsonb_agg(jsonb_build_object('name',p.proname,'args',oidvectortypes(p.proargtypes),'sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_employee_login';").stdout)
        assert len(cat)==len(pins)
        for x in cat:
            assert x.pop("owner")=="hft_r1_employee_login_owner"
            assert {k:v for k,v in x.items() if k!="name"}==pins[x["name"]],x
        assert q("SELECT has_table_privilege('hft_r1_employee_login_owner','hft.employee','SELECT') AND NOT has_table_privilege('hft_r1_employee_login_owner','hft.employee','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('hft_r1_employee_login_owner','hft_app_roles.assignment','INSERT,UPDATE,DELETE');").stdout.strip()=="t"
        assert q("SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hft_employee_login' AND NOT t.tgisinternal AND t.tgenabled='A' AND t.tgtype=58;").stdout.strip()=="1"
        # Execute the exact runtime catalog queries, including the dedicated
        # definer privilege census, as each least-privilege fixture login.
        import re
        backend=(ROOT/"lib/hft/live/employee-login-backend.ts").read_text()
        for user in ("hf101_gateway","hf101_role_runtime"):
            for name in ("identitySql","functionsSql","ownerAclSql","triggerSql"):
                raw=re.search(r"const "+name+r'=("(?:[^"\\\\]|\\\\.)*");',backend)
                assert raw is not None,name
                query_sql=json.loads(raw.group(1))
                rows=json.loads(q("SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM ("+query_sql+") t;",user=user).stdout)
                if name=="identitySql":assert len(rows)==1 and rows[0]["restricted"] and rows[0]["memberships"]==0 and rows[0]["schema_owner"]=="hft_r1_employee_login_owner" and rows[0]["usage"] and not rows[0]["create_schema"],rows
                if name=="functionsSql":assert len(rows)==8 and sum(x["executable"] for x in rows)==(6 if user=="hf101_gateway" else 1),rows
                if name=="ownerAclSql":assert rows==[{"memberships":0,"excess":0,"reads":7}],rows
                if name=="triggerSql":assert len(rows)==1 and rows[0]["enabled"]=="A" and rows[0]["type"]==58,rows
        print("HF101_NATIVE_FUNCTION_PINS_AND_DEFINER_ACL=PASS; actual runtime catalog queries")
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
        def directory(search=""):
            return "SELECT hft_employee_login.employee_directory_v1('HF101-HFT','HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1,'HF101-WH','"+search+"');"
        rows={x["employeeId"]:x for x in query(directory())}
        assert set(rows)=={"HF101-A","HF101-B","HF101-C","HF101-D"}
        assert rows["HF101-C"]["registrationStatus"]=="BINDING_REQUIRED" and rows["HF101-D"]["registrationStatus"]=="INACTIVE"
        assert query(directory("Synthetic C"))==[rows["HF101-C"]]
        deny(directory().replace("'HF101-WH'","'CROSS-SCOPE'"),"HF101_EMPLOYEE_REGISTRATION_DENIED")
        deny(target("HF101-C"),"HF101_CANONICAL_BINDING_REQUIRED")
        deny(claim("unknown@example.invalid","20000"),"HF101_EMPLOYEE_LOGIN_DENIED")
        assert q(reg("HF101-A","A@example.invalid"),user="hf101_gateway").stdout.strip()=="1"
        deny(reg("HF101-B","a@example.invalid"),"duplicate key")
        assert q(reg("HF101-B","b@example.invalid"),user="hf101_gateway").stdout.strip()=="1"
        a=query(claim("a@example.invalid","20001"));b=query(claim("b@example.invalid","20002"))
        assert a["employeeId"]=="HF101-A" and b["employeeId"]=="HF101-B" and a["loginVersion"]==b["loginVersion"]==2
        assert a["assignments"]==b["assignments"]==[]
        assert query(target("HF101-A"))=={"employeeId":"HF101-A","fullName":"Synthetic A","email":"a@example.invalid","version":2,"employeeVersion":1,"bound":True}
        deny(target("HF101-A").replace("'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1","'HF101-B','HF101-B-SUB','HF101-B-PERSON',2,1"),"HF101_EMPLOYEE_REGISTRATION_DENIED")
        check="SELECT hft_employee_login.employee_session_assert_v1('HF101-HFT','HF101-A','HF101-A-SUB','HF101-A-PERSON',2,1,'HF101-SITE');"
        assert q(check,user="hf101_role_runtime").stdout.strip()=="t"
        deny(check.replace("HF101-SITE","WRONG-SITE"),"HF101_EMPLOYEE_SESSION_DENIED",user="hf101_role_runtime")
        deny(ctx("A",2),"permission denied",user="hf101_role_runtime")
        deny(check,"permission denied")
        deny(claim("a@example.invalid","20002"),"HF101_EMPLOYEE_LOGIN_DENIED")
        deny(claim("a@example.invalid","99999"),"HF101_EMPLOYEE_LOGIN_DENIED")
        deny(reg("HF101-B","other@example.invalid",2).replace("'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1","'HF101-A','HF101-A-SUB','HF101-A-PERSON',2,1"),"HF101_EMPLOYEE_REGISTRATION_DENIED")
        assert {x["employeeId"]:x for x in query(directory())}["HF101-A"]["registrationStatus"]=="REGISTERED"
        deny(directory().replace("'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1","'HF101-A','HF101-A-SUB','HF101-A-PERSON',2,1"),"HF101_EMPLOYEE_REGISTRATION_DENIED")
        def rebind(emp,email,version,ev=1):
            return "SELECT hft_employee_login.employee_provider_rebind_v1('HF101-HFT','"+emp+"','"+email+"',"+str(version)+","+str(ev)+",'HF101-OWNER','HF101-OWNER-SUB','HF101-OWNER-PERSON',1,1,'HF101-WH','Synthetic recovery authority',repeat('c',64));"
        assignment("HF101-A",1,["VIEWER"]);assert query(ctx("A",2))["assignments"][0]["periods"][0]["roles"]==["VIEWER"]
        deny(rebind("HF101-A","a@example.invalid",2),"HF101_REBIND_REVOKE_ROLES_FIRST")
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
        deny(rebind("HF101-A","replacement@example.invalid",3,1),"HF101_LOGIN_VERSION_CONFLICT")
        deny(rebind("HF101-A","replacement@example.invalid",3,3).replace("repeat('c',64)","repeat('0',64)"),"HF101_REBIND_EVIDENCE_REQUIRED")
        assert q(rebind("HF101-A","replacement@example.invalid",3,3),user="hf101_gateway").stdout.strip()=="4"
        deny(ctx("A",3,3),"HF101_EMPLOYEE_SESSION_DENIED")
        deny(claim("replacement@example.invalid","20001"),"HF101_EMPLOYEE_LOGIN_DENIED")
        deny(claim("replacement@example.invalid","20002"),"HF101_EMPLOYEE_LOGIN_DENIED")
        recovered=query(claim("replacement@example.invalid","20003"))
        assert recovered["employeeId"]=="HF101-A" and recovered["loginVersion"]==5 and recovered["assignments"][0]["periods"]==[]
        assert q("SELECT count(*) FROM hft_employee_login.employee_login_event WHERE action='PROVIDER_REBIND' AND previous_email='a-new@example.invalid' AND new_email='replacement@example.invalid' AND evidence_sha256=repeat('c',64) AND retired_subject_sha256=encode(sha256(convert_to('20001','UTF8')),'hex');").stdout.strip()=="1"
        deny("SELECT * FROM hft_employee_login.employee_login_registration","permission denied")
        deny("SELECT * FROM hft_employee_login.employee_login_registration","permission denied",user="hf101_role_runtime")
        deny("SELECT * FROM hft.employee","permission denied")
        assert q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft_employee_login' AND has_function_privilege('hf101_gateway',p.oid,'EXECUTE')").stdout.strip()=="6"
        deny("UPDATE hft_employee_login.employee_login_event SET reason='tampered'","permission denied")
        deny("DELETE FROM hft_employee_login.employee_login_event","HF101_LOGIN_AUDIT_IMMUTABLE",user="postgres")
        assert int(q("SELECT count(*) FROM hft_employee_login.employee_login_event").stdout)>5
        print("HF101_DIRECTORY_AND_PROVIDER_REBIND_PG18=PASS; scoped directory, missing binding, role revocation, old provider denial, immutable recovery event")
        print("HF101_EMPLOYEE_LOGIN_PG18=PASS; canonical registration, two identities, pending role, duplicate/conflict denial, role persistence/revocation, email change, deactivation/old session denial, audit and gateway ACL")
    finally:run("rm","-f",C,check=False)
if __name__=="__main__":main()
