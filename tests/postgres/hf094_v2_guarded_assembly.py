"""Actual V2 guarded assembly on disposable PG18.7, synthetic authority/custody.
No real target, AWS, credentials or provider access. Existing V1 SQL unchanged.
"""
from __future__ import annotations
import datetime as dt
import importlib.util
from pathlib import Path
import re
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
f=load("v1_fixture",ROOT/"tests/postgres/hf094_roles_only_fixture.py")
test=load("v2_fixture",ROOT/"tests/test_hf094_owner_installer_v2.py")
v2=test.v2;a=test.a;v1=test.v1

def case(mode):
    f.CONTAINER="hf094-v2-assembly-"+uuid.uuid4().hex[:12]
    started=False
    try:
        f.run("docker","run","-d","--rm","--network","none","--name",f.CONTAINER,
              "-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18.7")
        started=True
        for _ in range(60):
            if f.run("docker","exec",f.CONTAINER,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError("fixture startup")
        assert f.sql("SHOW server_version_num;",db="postgres").stdout.strip()=="180007"
        f.sql("CREATE ROLE "+f.INSTALLER+" LOGIN NOINHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION BYPASSRLS;",db="postgres")
        f.sql("CREATE DATABASE "+f.DB+" OWNER "+f.INSTALLER+";",db="postgres")
        f.sql("REVOKE ALL ON DATABASE "+f.DB+" FROM PUBLIC;",db="postgres")
        oid=f.sql("SELECT oid FROM pg_database WHERE datname=current_database();").stdout.strip()
        assert oid.isdigit()
        def adapt(s):return re.sub(r"\b"+re.escape(v1.TARGET["database"])+r"\b",f.DB,s).replace("<>16397","<>"+oid).replace("'cloud_admin'","'postgres'")
        sql={k:adapt(v) for k,v in test.sql.items()}
        order=test.derived();order["expires_at"]=a.iso(a.clock()+dt.timedelta(minutes=10))
        order["provider_evidence"]={"synthetic":"local fixture"};reg=test.MemoryRegistry();calls=[]
        def wire():
            row=f.as_installer("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;\n"+v2.catalog_sql()+"COMMIT;").stdout.strip()
            return a.strict(row),{"tls":"SYNTHETIC_LOCAL_SOCKET"}
        def capture(*args):
            if mode=="before":raise RuntimeError("fixture backup denial")
            return {"synthetic":"separate encrypted recovery fixture"}
        def assemble(c,pin):
            statement=v2.assemble(v1,sql,test.plan,order,c,pin)
            assert statement.count("\nCOMMIT;")==1 and statement.index("HF094_V2_BASELINE_DRIFT")<statement.index("CREATE ROLE hft_engineering")
            if mode=="late":statement=statement.replace("\nCOMMIT;","\nSELECT 1/0;\nCOMMIT;")
            if mode=="drift":
                # Change only disposable baseline, immediately before the actual
                # SQL transaction. Guard must deny before any role creation.
                f.sql("CREATE SCHEMA fixture_drift;")
            return statement
        def execute(statement):
            calls.append(statement)
            r=f.as_installer(statement,False)
            if r.returncode:
                if mode=="drift":assert "HF094_V2_BASELINE_DRIFT" in r.stderr,r.stderr
                elif mode=="late":assert "division by zero" in r.stderr,r.stderr
                else:raise AssertionError(r.stderr)
                raise RuntimeError("fixture SQL outcome uncertain")
            assert "HF094_ROLES_ONLY_CATALOG_ACL_PASS" in r.stdout
        def postflight():
            r=f.as_installer("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[v1.FILES[2]]+"\nCOMMIT;").stdout.strip()
            assert r=="HF094_ROLES_ONLY_CATALOG_ACL_PASS";return r
        def act():return a.guarded_apply(order,reg,{"synthetic":"host"},[],lambda:order["provider_evidence"],wire,capture,assemble,execute,postflight)
        if mode=="success":
            act()
            assert f.sql("SELECT count(*) FROM hft.schema_revision;").stdout.strip()=="6"
            assert f.sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='hft_r1_roles_np_login';").stdout.strip()=="f"
        else:
            try:act()
            except RuntimeError:pass
            else:raise AssertionError("unexpected success "+mode)
            assert f.sql("SELECT to_regnamespace('hft') IS NULL;").stdout.strip()=="t"
            assert f.sql("SELECT count(*) FROM pg_roles WHERE rolname IN('hft_engineering','hft_r1_roles_owner','hft_r1_roles_np_login');").stdout.strip()=="0"
        result=a.strict(reg.read("execution/retained-oid16397-canonical-roles-only/terminal.json")[0])
        assert result["claim"]==reg.read(a.CONSUMED)[1]
        expected="COMMITTED_CATALOG_READBACK" if mode=="success" else "FAILED_BEFORE_DDL_NO_RETRY" if mode=="before" else "SQL_OUTCOME_UNCERTAIN_NO_RETRY"
        assert result["state"]==expected,result
        n=len(calls)
        try:act()
        except RuntimeError:pass
        else:raise AssertionError("replay succeeded")
        assert len(calls)==n
        print("HF094_V2_GUARDED_ASSEMBLY_CASE="+mode+" PASS; "+expected)
    finally:
        if started:f.run("docker","rm","-f",f.CONTAINER,check=False)

if __name__=="__main__":
    for mode in ("before","drift","late","success"):case(mode)
    print("HF094_V2_GUARDED_ASSEMBLY=PASS; actual PostgreSQL guarded DDL, drift, rollback and receipt/replay orchestration; synthetic custody only")
