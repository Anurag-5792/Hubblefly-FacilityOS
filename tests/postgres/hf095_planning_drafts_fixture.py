#!/usr/bin/env python3
"""Actual canonical DRAFT persistence fixture. No target or provider connection."""
from __future__ import annotations
import json
from pathlib import Path
import subprocess
import time
import uuid
import re

ROOT=Path(__file__).resolve().parents[2]
CONTAINER="hf095-planning-fixture-"+uuid.uuid4().hex[:10]
DB="hft_r1_disposable_hf095plan"
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
    return "SELECT hft.planning_draft_write_v1("+",".join(lit(x) for x in args[:-4])+","+lit(req)+"::uuid,"+lit(action)+","+lit(args[-2])+","+lit(args[-1])+"::jsonb);"

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
        req=str(uuid.uuid4());drone={"name":"Synthetic drone","variant":"Fixture V1"}
        a=write("DRONE_CREATE",drone,req)
        assert a["state"]=="DRAFT" and a["corporateCode"] is None
        assert write("DRONE_CREATE",drone,req)==a
        deny(command("DRONE_CREATE",{**drone,"name":"Different"},req),"PLANNING_REQUEST_ID_REUSED")
        deny(command("DRONE_CREATE",drone,person="WRONG-PERSON"),"ACTOR_SCOPE_DENIED")
        deny(command("DRONE_CREATE",drone,warehouse="OTHER"),"ACTOR_SCOPE_DENIED")
        deny(command("DRONE_CREATE",drone),"planning_drone_identity_unique")
        mid=a["modelId"]
        def line(code,qty="1",child=None,uom="PCS"):
            return {"itemCode":code,"versionCode":"V1","uom":uom,"quantity":qty,"childRevisionId":child}
        def bom(code,lines,prior=None):
            return {"subjectKind":"SFG" if code else "DRONE","droneModelId":None if code else mid,
              "itemCode":code,"versionCode":"V1" if code else None,"priorRevisionId":prior,"modelIds":[mid],"lines":lines}
        r1=write("BOM_CREATE",bom("SFG-A",[line("RAW","2")]))
        r2=write("BOM_CREATE",bom("SFG-B",[line("SFG-A",child=r1["revisionId"])]))
        deny(command("BOM_REVISE",bom("SFG-A",[line("SFG-B",child=r2["revisionId"])],r1["revisionId"])),"PLANNING_BOM_CYCLE")
        r3=write("BOM_REVISE",bom("SFG-A",[line("RAW","3")],r1["revisionId"]))
        assert r3["revision"]==2 and r3["priorRevisionId"]==r1["revisionId"]
        assert q("SELECT quantity_micro FROM hft.planning_bom_line WHERE revision_id="+lit(r1["revisionId"])+";").stdout.strip()=="2000000"
        deny(command("BOM_REVISE",bom("SFG-A",[line("RAW","4")],r1["revisionId"])),"REVISION_CONFLICT")
        deny(command("BOM_CREATE",bom(None,[line("RAW","1",uom="KG")])),"CANONICAL_LINE_DENIED")
        deny(command("BOM_CREATE",bom(None,[line("SFG-A")])),"SFG_REVISION_REQUIRED")
        deny(command("BOM_CREATE",bom(None,[line("RAW"),line("RAW")])),"duplicate key")
        valid=write("BOM_CREATE",bom(None,[line("SFG-A",child=r3["revisionId"]),line("RAW")]))
        assert valid["state"]=="DRAFT"
        assert q("SELECT count(*) FROM hft.planning_bom_revision;").stdout.strip()=="4"
        assert q("SELECT count(*) FROM hft.planning_draft_request;").stdout.strip()=="5"
        assert q("SELECT count(*) FROM hft.stock_entry;").stdout.strip()=="0"
        deny("DELETE FROM hft.planning_draft_request;","immutable")
        deny("UPDATE hft.planning_bom_line SET quantity_micro=1;","immutable")
        q("CREATE ROLE fixture_planning_runtime NOLOGIN; GRANT USAGE ON SCHEMA hft TO fixture_planning_runtime;")
        deny("SET ROLE fixture_planning_runtime; "+command("DRONE_CREATE",{"name":"Other","variant":"Fixture"}),"permission denied")
        deny("SET ROLE fixture_planning_runtime; SELECT * FROM hft.planning_draft_request;","permission denied")
        print("HF095_CANONICAL_PLANNING_DRAFTS_PG187=PASS; actual draft model persistence, scoped canonical item/SFG references, append-only revisions, idempotent requests, audit and runtime denial, no stock")
    finally:
        if started:run("docker","rm","-f",CONTAINER,check=False)

if __name__=="__main__":main()
