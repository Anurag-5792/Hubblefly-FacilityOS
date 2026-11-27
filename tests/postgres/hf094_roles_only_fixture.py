#!/usr/bin/env python3
"""Run SQL parser/ACL/rollback regression in a new network-disabled CI container.
Never connects to the retained endpoint. Adapt target name/OID/provider grantor
ONLY for disposable fixture; signed runner never accepts those substitutions.
"""
from __future__ import annotations
import datetime as dt
import importlib.util
from pathlib import Path
import subprocess
import re
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("hf094",ROOT/"tools/hft_roles_only_install_094.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
CONTAINER="hf094-sql-fixture-"+uuid.uuid4().hex[:10]
DB="hft_r1_disposable_hf094fixture"
INSTALLER=mod.TARGET["installer"]

def run(*args,input=None,check=True):
    p=subprocess.run(args,input=input,text=True,capture_output=True,timeout=180)
    if check and p.returncode:
        raise RuntimeError("fixture command failed: "+p.stderr[-3000:])
    return p

def sql(text, db=DB, user="postgres", check=True):
    return run("docker","exec","-i",CONTAINER,"psql","-X","-v","ON_ERROR_STOP=1","-Atq","-U",user,"-d",db,input=text,check=check)

def as_installer(text,check=True):
    return sql(text,user=INSTALLER,check=check)

def must_fail(p,code):
    assert p.returncode!=0, "unexpected SQL success"
    assert code in p.stderr, p.stderr[-3000:]

def main():
    manifest,artifacts,plan=mod.load_package()
    started=False
    try:
        run("docker","run","-d","--rm","--network","none","--name",CONTAINER,
            "-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18.7")
        started=True
        for _ in range(60):
            if run("docker","exec",CONTAINER,"pg_isready","-U","postgres",check=False).returncode==0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("fixture postgres unavailable")
        assert sql("SHOW server_version_num;",db="postgres").stdout.strip()=="180007"
        sql("CREATE ROLE "+INSTALLER+" LOGIN NOINHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION BYPASSRLS;",db="postgres")
        sql("CREATE DATABASE "+DB+" OWNER "+INSTALLER+";",db="postgres")
        sql("REVOKE ALL ON DATABASE "+DB+" FROM PUBLIC;",db="postgres")
        oid=sql("SELECT oid FROM pg_database WHERE datname=current_database();").stdout.strip()
        assert oid.isdigit()
        def fixture(s):
            return re.sub(r"\b"+re.escape(mod.TARGET["database"])+r"\b",DB,s).replace("<>16397","<>"+oid).replace("'cloud_admin'","'postgres'")
        adapted={k:fixture(v) for k,v in artifacts.items()}
        expiry=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        # Unmodified production-shaped guard must reject the disposable database.
        must_fail(as_installer(artifacts[mod.FILES[0]],False),"HF094_INSTALLATION_NOT_ADMITTED")
        # Adapted SQL still rejects missing signed-runner markers.
        must_fail(as_installer(adapted[mod.FILES[0]],False),"HF094_INSTALLATION_NOT_ADMITTED")
        ddl=mod.build_transaction(adapted,plan,"a"*64,"b"*64,expiry)
        # Deliberately late fault; role creation and all DDL must roll back.
        fault=ddl.replace("\nCOMMIT;","\nSELECT 1/0;\nCOMMIT;")
        assert fault!=ddl
        must_fail(as_installer(fault,False),"division by zero")
        assert sql("SELECT count(*) FROM pg_roles WHERE rolname IN('hft_engineering','hft_r1_roles_owner','hft_r1_roles_np_login');").stdout.strip()=="0"
        assert sql("SELECT to_regnamespace('hft') IS NULL;").stdout.strip()=="t"
        result=as_installer(ddl)
        assert "HF094_ROLES_ONLY_CATALOG_ACL_PASS" in result.stdout
        post="BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+adapted[mod.FILES[2]]+"\nCOMMIT;"
        assert as_installer(post).stdout.strip()=="HF094_ROLES_ONLY_CATALOG_ACL_PASS"
        assert sql("SELECT count(*) FROM hft.schema_revision;").stdout.strip()=="6"
        assert sql("SELECT count(*) FROM hft_app_roles.assignment_event;").stdout.strip()=="0"
        must_fail(as_installer(ddl,False),"HF094_TARGET_NOT_FRESH_OR_ROLE_COLLISION")
        # Negative privilege drift, tested by disposable superuser only.
        for grant,revoke in (
            ("GRANT SELECT ON hft.stock_entry TO hft_r1_roles_np_login;",
             "REVOKE SELECT ON hft.stock_entry FROM hft_r1_roles_np_login;"),
            ("GRANT UPDATE(person_id) ON hft_app_roles.identity_binding TO hft_r1_roles_np_login;",
             "REVOKE UPDATE(person_id) ON hft_app_roles.identity_binding FROM hft_r1_roles_np_login;"),
            ("GRANT EXECUTE ON FUNCTION hft_app_roles.fence_role_mutation() TO hft_r1_roles_np_login;",
             "REVOKE EXECUTE ON FUNCTION hft_app_roles.fence_role_mutation() FROM hft_r1_roles_np_login;"),
            ("ALTER TABLE hft.employee DISABLE TRIGGER role_dependency_fence;",
             "ALTER TABLE hft.employee ENABLE ALWAYS TRIGGER role_dependency_fence;"),
        ):
            sql(grant)
            p=as_installer(post,False)
            assert p.returncode!=0 and "HF094_POSTFLIGHT_" in p.stderr, p.stderr
            sql(revoke)
            assert as_installer(post).stdout.strip()=="HF094_ROLES_ONLY_CATALOG_ACL_PASS"
        sql("CREATE SCHEMA hft_secret;")
        must_fail(as_installer(post,False),"HF094_POSTFLIGHT_TARGET_OR_SCHEMA")
        sql("DROP SCHEMA hft_secret;")
        # Test effective restricted role without enabling LOGIN or enrolling an actor.
        for statement in ("SELECT * FROM hft.stock_entry;",
                          "UPDATE hft_app_roles.identity_binding SET active=true;",
                          "DELETE FROM hft_app_roles.assignment_event;"):
            must_fail(sql("SET ROLE hft_r1_roles_np_login;\n"+statement,check=False),"permission denied")
        assert as_installer(post).stdout.strip()=="HF094_ROLES_ONLY_CATALOG_ACL_PASS"
        print("HF094_DISPOSABLE_PG187_INSTALLER=PASS; target-adapted SQL parser, atomic rollback, revision ledger, fresh catalog, replay refusal, ACL and trigger drift, no login or stock")
    finally:
        if started:
            run("docker","rm","-f",CONTAINER,check=False)


if __name__=="__main__":
    main()
