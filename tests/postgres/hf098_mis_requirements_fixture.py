#!/usr/bin/env python3
"""Disposable HF098 PostgreSQL requirements and explicit lifecycle fixture. No target connection."""
from __future__ import annotations
import json
from pathlib import Path
import subprocess
import time
import uuid
import re

ROOT=Path(__file__).resolve().parents[2]
CONTAINER="hf098-mis-fixture-"+uuid.uuid4().hex[:10]
DB="hft_r1_disposable_hf098mis"
STOP="DO $STOP_HF095_PLANNING$ BEGIN\n RAISE EXCEPTION 'HF095_PLANNING_INSTALLATION_NOT_ADMITTED';\nEND $STOP_HF095_PLANNING$;"

def run(*args,input=None,check=True):
    p=subprocess.run(args,input=input,text=True,capture_output=True,timeout=180)
    if check and p.returncode:raise RuntimeError(p.stderr[-3000:])
    return p

def q(s,db=DB,check=True):
    return run("docker","exec","-i",CONTAINER,"psql","-X","-Atq","-U","postgres","-d",db,"-v","ON_ERROR_STOP=1",input=s,check=check)

def deny(sql,code):
    p=q(sql,check=False)
    assert p.returncode!=0 and code in p.stderr,p.stderr[-3000:]

def lit(s):
    return "'"+str(s).replace("'","''")+"'"

def command(action,payload,req=None,person="FIXTURE-PERSON",site="FIXTURE-SITE",warehouse="FIXTURE-WH"):
    req=req or str(uuid.uuid4())
    args=["FIXTURE-HFT",site,warehouse,"FIXTURE-ACTOR","FIXTURE-EMP",person,req,action,"Synthetic draft qualification",json.dumps(payload)]
    return "SELECT hft.planning_draft_authorized_v1("+",".join(lit(x) for x in args[:-4])+","+lit(req)+"::uuid,"+lit(action)+","+lit(args[-2])+","+lit(args[-1])+"::jsonb);"

def write(action,payload,req=None,**kw):
    return json.loads(q(command(action,payload,req,**kw)).stdout)

def main():
    started=False
    try:
        run("docker","run","-d","--rm","--network","none","--name",CONTAINER,"-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18.7")
        started=True
        for _ in range(60):
            if run("docker","exec",CONTAINER,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError("fixture startup")
        q("CREATE DATABASE "+DB+";",db="postgres")
        assert q("SHOW server_version_num;").stdout.strip()=="180007"
        manifest=json.loads((ROOT/"db/migrations/manifest.v1.json").read_text())
        import hashlib
        for m in manifest["migrations"]:
            raw=(ROOT/"db/migrations"/m["file"]).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==m["sha256"]
            q(raw.decode())
        # Reuse exact item-version table from the existing reviewed product-version
        # contract; no duplicate item table or alternate version model in fixture.
        original=(ROOT/"db/security/HFT-R1-ITEM-VERSION-PHOTOS-REVIEW.sql").read_text()
        table=re.search(r"CREATE TABLE hft\.item_version_catalog \([\s\S]*?\n\);",original).group()
        q(table)
        roles=(ROOT/"db/security/HFT-R1-APP-ROLE-ASSIGNMENT-NONEXECUTABLE.sql").read_text()
        role_stop="DO $STOP_APP_ROLE_ASSIGNMENT$ BEGIN\n RAISE EXCEPTION 'HFT_APP_ROLE_BACKEND_INSTALLATION_NOT_ADMITTED';\nEND $STOP_APP_ROLE_ASSIGNMENT$;"
        assert roles.count(role_stop)==1
        assert q("SELECT current_database();").stdout.strip()==DB
        q(roles.replace(role_stop,""))
        source=(ROOT/"review-candidates/hf095-planning-drafts/10-canonical-planning-drafts.NONEXECUTABLE.sql").read_text()
        assert source.count(STOP)==1
        deny(source,"HF095_PLANNING_INSTALLATION_NOT_ADMITTED")
        q(source.replace(STOP,""))
        q("""
        INSERT INTO hft.legal_entity(id,name) VALUES('FIXTURE-HFT','Synthetic company');
        INSERT INTO hft.site VALUES('FIXTURE-HFT','FIXTURE-SITE','Synthetic site',true);
        INSERT INTO hft.warehouse(legal_entity_id,warehouse_id,site_id,name) VALUES('FIXTURE-HFT','FIXTURE-WH','FIXTURE-SITE','Synthetic warehouse');
        INSERT INTO hft.employee(legal_entity_id,employee_id,site_id,full_name,department,designation,active)
          VALUES('FIXTURE-HFT','FIXTURE-EMP','FIXTURE-SITE','Synthetic person','QA','Fixture',true);
        INSERT INTO hft_app_roles.identity_binding VALUES('FIXTURE-ACTOR','FIXTURE-HFT','FIXTURE-EMP','FIXTURE-PERSON',true);
        INSERT INTO hft_app_roles.scope_lock(legal_entity_id,site_id,warehouse_id) VALUES('FIXTURE-HFT','FIXTURE-SITE','FIXTURE-WH');
        INSERT INTO hft.item(legal_entity_id,item_code,uom,control_type) VALUES
          ('FIXTURE-HFT','RAW','PCS','NONE'),('FIXTURE-HFT','SFG-A','PCS','NONE'),('FIXTURE-HFT','SFG-B','PCS','NONE');
        INSERT INTO hft.item_version_catalog(legal_entity_id,item_code,version_code,state,created_by) VALUES
          ('FIXTURE-HFT','RAW','V1','ACTIVE','FIXTURE-ACTOR'),('FIXTURE-HFT','SFG-A','V1','ACTIVE','FIXTURE-ACTOR'),
          ('FIXTURE-HFT','SFG-B','V1','ACTIVE','FIXTURE-ACTOR');
        """)
        lifecycle=(ROOT/"review-candidates/hf098-mis/20-planning-lifecycle-requirements.NONEXECUTABLE.sql").read_text()
        stop="DO $STOP_HF098$ BEGIN\n RAISE EXCEPTION 'HF098_PLANNING_LIFECYCLE_NOT_ADMITTED';\nEND $STOP_HF098$;"
        assert lifecycle.count(stop)==1
        deny(lifecycle,"HF098_PLANNING_LIFECYCLE_NOT_ADMITTED")
        q(lifecycle.replace(stop,""))
        actor=["FIXTURE-HFT","FIXTURE-SITE","FIXTURE-WH","FIXTURE-ACTOR","FIXTURE-EMP","FIXTURE-PERSON"]
        prefix=",".join(lit(x) for x in actor)
        def grant_event(action,enabled=True):
            q("INSERT INTO hft.planning_action_event(legal_entity_id,site_id,warehouse_id,actor_subject,actor_employee_id,actor_person_id,action,enabled,valid_from,valid_until,authority_sha256) VALUES("+prefix+","+lit(action)+","+str(enabled).lower()+",clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',repeat('a',64));")
        drone={"name":"Synthetic approved drone","variant":"Fixture V1"}
        deny(command("DRONE_CREATE",drone),"PLANNING_ACTION_DENIED")
        for action in ["DRONE_CREATE","BOM_CREATE","BOM_REVISE","BOM_APPROVE","BOM_RETIRE","MIS_REQUIREMENTS_READ"]:
            grant_event(action)
        request=str(uuid.uuid4())
        d=write("DRONE_CREATE",drone,request); mid=d["modelId"]
        assert write("DRONE_CREATE",drone,request)==d
        readback="SELECT hft.planning_draft_readback_v1("+prefix+","+lit(request)+"::uuid);"
        assert json.loads(q(readback).stdout)["result"]==d
        deny(readback.replace("'FIXTURE-PERSON'","'WRONG-PERSON'"),"PLANNING_READBACK_DENIED")
        def line(code,qty="1",child=None):
            return {"itemCode":code,"versionCode":"V1","uom":"PCS","quantity":qty,"childRevisionId":child}
        def bom(code,lines,prior=None):
            return {"subjectKind":"SFG" if code else "DRONE","droneModelId":None if code else mid,
              "itemCode":code,"versionCode":"V1" if code else None,"priorRevisionId":prior,"modelIds":[mid],"lines":lines}
        child=write("BOM_CREATE",bom("SFG-A",[line("RAW","2")]))["revisionId"]
        root=write("BOM_CREATE",bom(None,[line("SFG-A","2",child),line("RAW")]))["revisionId"]
        def decision(rev,act="BOM_APPROVE",start="2026-01-01T00:00:00Z",req=None):
            return "SELECT hft.planning_bom_decide_v1("+prefix+","+lit(req or str(uuid.uuid4()))+"::uuid,"+lit(act)+","+lit(rev)+"::uuid,"+lit(start)+"::timestamptz,NULL,repeat('b',64),'Synthetic approval evidence only');"
        def reader(model=None,p=prefix):
            return "SELECT hft.planning_requirements_read_v1("+p+","+("NULL" if model is None else lit(model)+"::uuid")+");"
        assert json.loads(q(reader()).stdout)["models"]==[]
        deny(decision(root),"PLANNING_APPROVAL_CHILD_NOT_EFFECTIVE")
        q(decision(child))
        approval=decision(root); assert q(approval).stdout==q(approval).stdout
        newroot=write("BOM_REVISE",bom(None,[line("SFG-A","2",child),line("RAW","2")],root))["revisionId"]
        deny(decision(newroot),"PLANNING_APPROVAL_INTERVAL_OVERLAP")
        owner="hft_r1_planning_reader_owner";login="hft_r1_planning_read_np_login"
        read_sig="hft.planning_requirements_read_v1(text,text,text,text,text,text,uuid)"
        action_sig="hft.planning_action_allowed_v1(text,text,text,text,text,text,text)"
        backend=(ROOT/"lib/hft/planning/mis-read-backend.ts").read_text()
        reads=re.findall(r"'(hft(?:_app_roles)?\.[a-z_]+)'",backend.split("const reads=[",1)[1].split("];",1)[0])
        assert len(reads)==16
        q("CREATE ROLE "+owner+" NOLOGIN NOINHERIT; CREATE ROLE "+login+" LOGIN NOINHERIT; REVOKE ALL ON DATABASE "+DB+" FROM PUBLIC; GRANT CONNECT ON DATABASE "+DB+" TO "+login+"; REVOKE ALL ON SCHEMA hft,hft_app_roles FROM PUBLIC; REVOKE ALL ON ALL TABLES IN SCHEMA hft,hft_app_roles FROM PUBLIC; REVOKE ALL ON ALL SEQUENCES IN SCHEMA hft,hft_app_roles FROM PUBLIC; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hft,hft_app_roles FROM PUBLIC; GRANT USAGE ON SCHEMA hft TO "+login+","+owner+"; GRANT USAGE ON SCHEMA hft_app_roles TO "+owner+"; GRANT SELECT ON "+",".join(reads)+" TO "+owner+"; ALTER FUNCTION "+read_sig+" OWNER TO "+owner+"; GRANT EXECUTE ON FUNCTION "+action_sig+" TO "+owner+"; GRANT EXECUTE ON FUNCTION "+read_sig+" TO "+login+";")
        def qr(s,check=True):
            return run("docker","exec","-i",CONTAINER,"psql","-X","-Atq","-U",login,"-d",DB,"-v","ON_ERROR_STOP=1",input=s,check=check)
        def rd(s,err):
            p=qr(s,False);assert p.returncode and err in p.stderr,p.stderr[-3000:]
        view_hash=q("SELECT encode(sha256(convert_to(pg_get_viewdef('hft.planning_effective_interval_v1'::regclass,true),'UTF8')),'hex');").stdout.strip()
        profile=(ROOT/"lib/hft/planning/mis-profile.ts").read_text()
        hashes=[re.search(k+r"[^\n]*?([0-9a-f]{64})",profile).group(1) for k in ["HFT_MIS_READER_BODY_SHA256","HFT_MIS_ACTION_BODY_SHA256"]]
        catalog_sql=backend.split("MIS_READER_CATALOG_SQL=String.raw\x60",1)[1].split("\x60;",1)[0]
        fence_hash=re.search(r"e.HFT_MIS_VIEW_SHA256,'([0-9a-f]{64})'",backend).group(1)
        values=[lit(owner),lit(read_sig),lit(action_sig),"ARRAY["+",".join(lit(x) for x in reads)+"]",lit(hashes[0]),lit(hashes[1]),lit(view_hash),lit(fence_hash)]
        check_sql=re.sub(r"\$([1-8])(?!\d)",lambda m:values[int(m.group(1))-1],catalog_sql)
        def catalog():
            return json.loads(qr("SELECT row_to_json(t) FROM ("+check_sql+") t;").stdout)
        expected={"runtime_ok":1,"owner_ok":1,"membership_count":0,"runtime_db_extra":False,"owner_db_extra":False,"runtime_schema_extra":0,"owner_schema_extra":0,"runtime_rel_extra":0,"owner_rel_extra":0,"owner_read_count":16,"runtime_fn_extra":0,"owner_fn_extra":0,"reader_fn_ok":1,"action_fn_ok":1,"interval_view_ok":1,"action_fence_ok":1}
        actual=catalog()
        assert all(actual[k]==v for k,v in expected.items()),actual
        q("GRANT SELECT ON hft.stock_entry TO "+login+";")
        assert catalog()["runtime_rel_extra"]==1
        q("REVOKE SELECT ON hft.stock_entry FROM "+login+";")
        rd("SELECT * FROM hft.stock_entry;","permission denied")
        rd("SELECT * FROM hft.planning_action_event;","permission denied")
        rd(command("DRONE_CREATE",{"name":"Other","variant":"Fixture"}),"permission denied")
        rd(reader(mid,prefix.replace("'FIXTURE-WH'","'OTHER'")),"MIS_REQUIREMENTS_SCOPE_DENIED")
        rd(reader(mid,prefix.replace("'FIXTURE-PERSON'","'OTHER'")),"MIS_REQUIREMENTS_SCOPE_DENIED")
        approved=json.loads(qr(reader()).stdout)
        assert len(approved["models"])==1 and approved["models"][0]["revisionId"]==root
        raw=qr("BEGIN READ ONLY; "+reader(mid)+" COMMIT;").stdout.strip()
        code="""import assert from 'node:assert/strict';import fs from 'node:fs';import {calculateRequirements} from './lib/hft/planning/requirements.ts'; const x=JSON.parse(fs.readFileSync(0,'utf8'));const r=calculateRequirements(x,x.scope,x.models[0].id,3);assert.equal(r.direct.find(v=>v.itemCode==='SFG-A').required,'6');assert.equal(r.grossLeaf.find(v=>v.itemCode==='RAW').required,'15');assert.equal(r.capacity,null);assert.equal(r.coverage,null);assert.ok([...r.direct,...r.grossLeaf,...r.assemblies].every(v=>v.available===null&&v.shortage===null));console.log('HF098_SQL_TO_REQUIREMENTS=PASS');"""
        p=subprocess.run(["node","--experimental-strip-types","--input-type=module","-e",code],input=raw,text=True,capture_output=True,cwd=ROOT)
        assert p.returncode==0,p.stderr; print(p.stdout.strip())
        q(decision(root,"BOM_RETIRE","2026-06-01T00:00:00Z"))
        q(decision(newroot,start="2026-06-01T00:00:00Z"))
        assert json.loads(qr(reader()).stdout)["models"][0]["revisionId"]==newroot
        grant_event("MIS_REQUIREMENTS_READ",False);rd(reader(mid),"MIS_REQUIREMENTS_SCOPE_DENIED")
        deny("DELETE FROM hft.planning_bom_decision;","IMMUTABLE_HFT_FACT")
        deny("UPDATE hft.planning_action_event SET enabled=true;","IMMUTABLE_HFT_FACT")
        assert q("SELECT count(*) FROM hft.stock_entry;").stdout.strip()=="0"
        print("HF098_LIFECYCLE_READER_PG187=PASS; action grants, scoped replay, approved interval, nested requirements, actual least privilege, revocation, no stock; view SHA256="+view_hash)
    finally:
        if started:run("docker","rm","-f",CONTAINER,check=False)
if __name__=="__main__":main()
