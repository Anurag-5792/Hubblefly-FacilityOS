"""Actual disposable PG18.7 claim, frozen DDL, encrypted restore, denial and receipt tests.
Only target name/OID/provider creator are adapted for a network-disabled fixture.
No live credentials or external Drive; synthetic custody API.
"""
from __future__ import annotations
import datetime as dt, importlib.util, json, os, re, shutil, subprocess, tempfile, time, uuid
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,ROOT/p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
t=load("hf100_test","tests/test_hf100_installer.py")
h=t.h;a=h.control;r=h.registry;v1=h.v1
f=load("v1_fixture","tests/postgres/hf094_roles_only_fixture.py")
legacy=load("v2_test","tests/test_hf094_owner_installer_v2.py")
KEY=b"q"*32
IMAGE="hf100-ci-native-pg18:fixture"
def docker(*args,data=None,check=True,timeout=180):
    p=subprocess.run(["docker",*args],input=data,capture_output=True,check=False,timeout=timeout)
    if check and p.returncode:raise RuntimeError("fixture docker: "+p.stderr.decode(errors="replace")[-4000:])
    return p
def native_fixture_restore(paths,dump,cat,shape):
    # Actual native worker in a disposable no-network container. The production
    # unshare wrapper is a separate host-specific admission requirement.
    name="hf100-native-"+uuid.uuid4().hex[:12]
    try:
        docker("run","-d","--rm","--network","none","--entrypoint","sleep","--name",name,IMAGE,"300")
        docker("exec",name,"mkdir","-m","700","/tmp/hf100-worker")
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp);(d/"target.dump").write_bytes(dump)
            req={"paths":{k:"/usr/lib/postgresql/18/bin/"+k for k in h.PG},"database":cat["database"],"catalog":h.v2.catalog_sql(),
             "shape":r.SHAPE.strip()+";","roles":sorted(set(h.v2.role_names(cat))|{r.OWNER}),"parent_net":str(Path("/proc/self/ns/net").readlink())}
            (d/"request.json").write_bytes(a.canonical(req))
            for path in (d/"target.dump",d/"request.json",ROOT/"tools/hf100_native_restore.py"):
                docker("cp",str(path),name+":/tmp/hf100-worker/"+path.name)
        docker("exec",name,"chown","-R","postgres:postgres","/tmp/hf100-worker")
        p=docker("exec","-u","postgres",name,"python3","-IB","/tmp/hf100-worker/hf100_native_restore.py","/tmp/hf100-worker/request.json",check=False,timeout=300)
        assert p.returncode==0,p.stderr.decode(errors="replace")
        out=a.strict(p.stdout);assert out["unix_socket_only"] and out["uid"]!=0 and out["network_namespace"]!=req["parent_net"]
        assert h.v2.restore_shape(out["catalog"])==h.v2.restore_shape(cat),(h.v2.restore_shape(out["catalog"]),h.v2.restore_shape(cat))
        assert out["registry"]==shape
        return {"catalog_sha256":a.sha(a.canonical(h.v2.restore_shape(out["catalog"]))),"registry_sha256":a.sha(a.canonical(shape)),"dump_sha256":a.sha(dump),"native_isolated":True}
    finally:docker("rm","-f",name,check=False)
class FixturePg(h.Pg):
    def __init__(self,target,mode):self.target=target;self.mode=mode;self.statements=0
    def exec(self,sql):
        if "CREATE ROLE hft_engineering" in sql:
            self.statements+=1
            if self.mode=="late":sql=sql.replace("\nCOMMIT;","\nSELECT 1/0;\nCOMMIT;")
            if self.mode=="interrupted":raise KeyboardInterrupt()
        p=f.as_installer(sql,False)
        if p.returncode:
            print("HF100_FIXTURE_SQL_DENIAL",p.stderr[-1200:])
            raise RuntimeError(p.stderr)
        if "CREATE ROLE hft_engineering" in sql and self.mode=="commit_unknown":raise RuntimeError("synthetic lost commit reply")
        return p.stdout.strip()
    def wire(self):
        row=self.exec("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;\n"+r.catalog_query(h.v2.CATALOG)+";\nCOMMIT;")
        return a.strict(row),{"tls":"SYNTHETIC_LOCAL_SOCKET"}
    def dump(self):
        if self.mode=="backup":raise RuntimeError("synthetic backup transport failure")
        return docker("exec",f.CONTAINER,"pg_dump","-Fc","--create","-U",f.INSTALLER,f.DB).stdout
class Custody:
    def __init__(self,key):self.items={};self.key=key;self.revoked=False
    def authority(self):
        a.need(not self.revoked,"HF100_STOP_REVOKED");return {"synthetic":"current control"},{"recovery_keyring":self.key}
    def absent(self):a.need(not self.items,"HF100_DRIVE_PRIOR_EXECUTION_NO_RETRY")
    def put_once(self,name,raw):
        a.need(name not in self.items,"HF100_CUSTODY_PRIOR_OBJECT_NO_RETRY")
        ref={"id":"fixture-"+name,"version":"1","sha256":a.sha(raw),"size":len(raw)}
        self.items[name]=(raw,ref);return ref
    def read(self,name):return self.items[name]
def case(mode,home,fp,key):
    f.CONTAINER="hf100-guard-"+uuid.uuid4().hex[:12]
    try:
        docker("run","-d","--rm","--network","none","--name",f.CONTAINER,"-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:18.7")
        for _ in range(60):
            if docker("exec",f.CONTAINER,"pg_isready","-U","postgres",check=False).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError("fixture startup")
        assert f.sql("SHOW server_version_num;",db="postgres").stdout.strip()=="180007"
        f.sql("CREATE ROLE "+f.INSTALLER+" LOGIN NOINHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION BYPASSRLS;",db="postgres")
        f.sql("CREATE DATABASE "+f.DB+" OWNER "+f.INSTALLER+";",db="postgres")
        f.sql("REVOKE ALL ON DATABASE "+f.DB+" FROM PUBLIC;",db="postgres")
        oid=int(f.sql("SELECT oid FROM pg_database WHERE datname=current_database();").stdout.strip())
        target={**v1.TARGET,"database":f.DB,"database_oid":oid}
        def adapt(s):return re.sub(r"\b"+re.escape(v1.TARGET["database"])+r"\b",f.DB,s).replace("<>16397","<>"+str(oid)).replace("'cloud_admin'","'postgres'")
        _,raw,plan=v1.load_package();sql={k:adapt(v) for k,v in raw.items()}
        if mode.startswith("provider_"):
            f.sql("CREATE ROLE neon_superuser NOLOGIN INHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS; CREATE ROLE neon_service LOGIN INHERIT CREATEROLE CREATEDB REPLICATION BYPASSRLS; GRANT pg_read_all_data,pg_write_all_data TO neon_superuser WITH ADMIN TRUE, INHERIT TRUE, SET TRUE; GRANT pg_maintain TO neon_superuser WITH ADMIN TRUE, INHERIT TRUE, SET FALSE; ALTER ROLE "+f.INSTALLER+" INHERIT; GRANT neon_superuser TO "+f.INSTALLER+",neon_service WITH ADMIN FALSE, INHERIT TRUE, SET TRUE; CREATE ROLE ordinary_fixture NOLOGIN;")
            if mode=="provider_ordinary":f.sql("GRANT pg_read_all_data TO ordinary_fixture;")
        pg=FixturePg(target,mode);base,_=pg.wire()
        if mode=="provider_success":
            # PostgreSQL native OID JSON is a string. Exercise the real retained-name
            # identity gate with synthetic retained IDs, not the disposable DB name.
            expected={v1.TARGET["installer"]:16393,"neon_superuser":16384,"neon_service":16395,
                      "cloud_admin":10,"pg_read_all_data":6181,"pg_write_all_data":6182,"pg_maintain":6337}
            projected=a.strict(f.sql("SELECT jsonb_object_agg(n::text,to_jsonb(n::oid))::text FROM unnest(ARRAY[16393,16384,16395,10,6181,6182,6337]) AS x(n);").stdout.strip())
            assert projected=={str(n):str(n) for n in expected.values()},projected
            roles=[]
            for row in base["registry_privileges"]["roles"]:
                name={"postgres":"cloud_admin",f.INSTALLER:v1.TARGET["installer"]}.get(row["rolname"],row["rolname"])
                roles.append({**row,"rolname":name,"oid":projected[str(expected[name])] if name in expected else row["oid"]})
            identity_fixture={"roles":roles,"memberships":[]}
            assert set(expected)<=set(x["rolname"] for x in roles)
            r.eligible(identity_fixture,v1.TARGET)
            for name,oid in expected.items():
                for bad in (str(oid+1),oid):
                    altered={"roles":[{**x,"oid":bad} if x["rolname"]==name else x for x in roles],"memberships":[]}
                    try:r.eligible(altered,v1.TARGET)
                    except RuntimeError as e:assert str(e)=="HF100_PROVIDER_IDENTITY_DRIFT",str(e)
                    else:raise AssertionError("retained OID drift accepted: "+name)
            print("HF100_RETAINED_NATIVE_OID_IDENTITY=PASS")
        if mode=="provider_membership_drift":f.sql("GRANT pg_monitor TO ordinary_fixture;")
        if mode=="provider_role_drift":f.sql("ALTER ROLE ordinary_fixture LOGIN;")
        order=t.derived();order["expires_at"]=a.iso(a.clock()+dt.timedelta(minutes=10));order["not_before"]=a.iso(a.clock()-dt.timedelta(minutes=1))
        order["baseline_sha256"]=a.sha(a.canonical(base));order["provider_evidence"]={"synthetic":"disposable fixture"};order["backup"]={"recovery_fingerprint":fp,"recovery_keyring_sha256":a.sha(key)}
        paths={"gpg":shutil.which("gpg")};cust=Custody(key)
        def auth():
            if mode=="unauthorized":raise RuntimeError("synthetic invalid signature")
            return cust.authority()[0]
        if mode=="revoked":cust.revoked=True
        def backup(c,s,attempt,anchor):
            def restore(paths,dump,cat,shape):
                if mode=="restore":raise RuntimeError("synthetic recovery failure")
                return native_fixture_restore(paths,dump,cat,shape)
            out=h.capture(pg,order,cust,paths,c,s,KEY,attempt,anchor,restore=restore)
            if mode=="revoked_after_backup":cust.revoked=True
            return out
        def act():return h.guarded_apply(pg,cust,order,KEY,{"synthetic":"host"},[],lambda:order["provider_evidence"],auth,backup,sql,plan)
        with patch.dict(os.environ,{"HFT_HF094_RECOVERY_GNUPGHOME":str(home)}):
            if mode in ("success","provider_success"):act()
            else:
                try:act()
                except RuntimeError as e:print("HF100_FIXTURE_EXPECTED_STOP",mode,str(e))
                else:raise AssertionError("unexpected success "+mode)
        if mode in ("unauthorized","revoked","provider_ordinary","provider_membership_drift","provider_role_drift"):
            assert not cust.items
            assert f.sql("SELECT to_regclass('public.hf100_install_receipt') IS NULL;").stdout.strip()=="t"
            assert pg.statements==0
            print("HF100_CASE="+mode+" PASS");return
        shape=pg.shape();r.verify_shape(shape,target)
        records=[a.unseal(KEY,x["raw"].encode()) for x in shape["rows"]]
        assert records[0]["phase"]=="CLAIM" and records[-1]["phase"]=="TERMINAL",records
        assert all(records[i]["previous_sha256"]==shape["rows"][i-1]["sha"] for i in range(1,len(records)))
        expected="COMMITTED_CATALOG_READBACK" if mode in ("success","provider_success") else "SQL_OUTCOME_UNCERTAIN_NO_RETRY" if mode in ("late","interrupted","commit_unknown") else "FAILED_BEFORE_DDL_NO_RETRY"
        assert records[-1]["data"]["state"]==expected,records
        assert cust.read("terminal.json")[0]==shape["rows"][-1]["raw"].encode()
        installed=mode in ("success","commit_unknown","provider_success")
        assert f.sql("SELECT to_regnamespace('hft') IS NOT NULL;").stdout.strip()==("t" if installed else "f")
        if installed:
            assert f.sql("SELECT count(*) FROM hft.schema_revision;").stdout.strip()=="6"
            assert f.sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='hft_r1_roles_np_login';").stdout.strip()=="f"
            assert pg.exec("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;\n"+sql[v1.FILES[2]]+"\nCOMMIT;")=="HF094_ROLES_ONLY_CATALOG_ACL_PASS"
            f.must_fail(f.sql("SET ROLE hft_r1_roles_np_login; SELECT * FROM public.hf100_install_receipt;",check=False),"permission denied")
        else:
            assert f.sql("SELECT count(*) FROM pg_roles WHERE rolname IN('hft_engineering','hft_r1_roles_owner','hft_r1_roles_np_login');").stdout.strip()=="0"
        if mode=="provider_success":
            assert f.as_installer("SELECT has_table_privilege(current_user,'public.hf100_install_receipt','SELECT,INSERT,UPDATE,DELETE');").stdout.strip()=="t"
            assert f.sql("SELECT has_table_privilege('ordinary_fixture','public.hf100_install_receipt','SELECT,INSERT,UPDATE,DELETE,MAINTAIN');").stdout.strip()=="f"
            assert f.sql("SELECT has_function_privilege('ordinary_fixture','public.hf100_append_receipt(text,text)','EXECUTE');").stdout.strip()=="f"
        else:f.must_fail(f.as_installer("DELETE FROM public.hf100_install_receipt;",False),"permission denied")
        f.must_fail(f.as_installer(r.append_sql(shape["rows"][0]["raw"].encode()),False),"HF100_ALREADY_CONSUMED")
        n=pg.statements
        try:act()
        except RuntimeError:pass
        else:raise AssertionError("duplicate allowed")
        assert pg.statements==n
        # Drive deletion/rollback alone cannot reopen DB claim.
        if not installed:
            cust.items.clear();cust.revoked=False
            try:act()
            except RuntimeError:pass
            else:raise AssertionError("database witness failed")
            assert pg.statements==n
        print("HF100_CASE="+mode+" PASS; "+expected)
    finally:docker("rm","-f",f.CONTAINER,check=False)
def main():
    # CI-local image only; no hosted service, provider credential or paid resource.
    docker("build","-t",IMAGE,"-",data=b"FROM postgres:18.7\nRUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*\n",timeout=300)
    with tempfile.TemporaryDirectory() as d:
        home=Path(d);home.chmod(0o700)
        legacy.gpg(home,"--quick-generate-key","HF100 fixture <fixture@example.invalid>","ed25519","cert","1d")
        fp=legacy.fingerprint(home);legacy.gpg(home,"--quick-add-key",fp,"cv25519","encr","1d");key=legacy.gpg(home,"--export",fp)
        for mode in ("unauthorized","revoked","backup","restore","revoked_after_backup","late","interrupted","commit_unknown","success","provider_success","provider_ordinary","provider_membership_drift","provider_role_drift"):case(mode,home,fp,key)
    print("HF100_PG18_GUARDED_INSTALLER=PASS; actual persistent claim, encrypted backup/native isolated restore, rollback, revoked/duplicate denial, interrupted/unknown outcome and independent postflight; synthetic custody")
if __name__=="__main__":main()
