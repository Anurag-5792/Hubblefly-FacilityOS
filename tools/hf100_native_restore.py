#!/usr/bin/env python3
"""HF100 native PostgreSQL recovery worker. No external database connection.
Production entry uses a new user/network namespace, nonroot UID, Unix socket
only, clean environment, and no provider or recovery secrets.
"""
from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path

def need(x,code):
    if not x:raise RuntimeError(code)
def run(args,env,*,data=None,timeout=120):
    p=subprocess.run(args,input=data,env=env,capture_output=True,timeout=timeout)
    need(p.returncode==0,"HF100_NATIVE_RESTORE_COMMAND_FAILED:"+Path(args[0]).name)
    return p.stdout
def local_restore(root,paths,target,catalog,shape,roles,dump,parent_net):
    root=Path(root)
    need(os.geteuid()!=0 and Path("/proc/self/ns/net").readlink()!=Path(parent_net),"HF100_RESTORE_NAMESPACE_REQUIRED")
    need(set(os.listdir("/sys/class/net"))<={"lo"},"HF100_RESTORE_NETWORK_NOT_ISOLATED")
    need(root.is_absolute() and root.is_dir() and root.stat().st_uid==os.geteuid() and not root.stat().st_mode&0o077,"HF100_RESTORE_PRIVATE_ROOT")
    need(dump.startswith(b"PGDMP"),"HF100_RESTORE_CUSTOM_DUMP_REQUIRED")
    need(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}",target) is not None,"HF100_RESTORE_DB_INVALID")
    need(all(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}",r) and r!="postgres" and not r.startswith("pg_") for r in roles),"HF100_RESTORE_ROLE_INVALID")
    data=root/"data";sock=root/"s";sock.mkdir(mode=0o700)
    env={"PATH":"/usr/bin:/bin","HOME":str(root),"LANG":"C.UTF-8","PGHOST":str(sock),"PGPORT":"5432","PGUSER":"postgres","PGDATABASE":"postgres","PGSSLMODE":"disable","PGPASSFILE":"/dev/null","PGCONNECT_TIMEOUT":"5"}
    run([paths["initdb"],"-D",str(data),"--username=postgres","--auth=trust","--no-locale"],env)
    started=False
    try:
        # Socket path is a generated private directory with no whitespace.
        need(re.fullmatch(r"[/A-Za-z0-9_.-]+",str(sock)) is not None,"HF100_RESTORE_SOCKET_INVALID")
        run([paths["pg_ctl"],"-D",str(data),"-l",str(root/"postgres.log"),"-w","-o","-h '' -k "+str(sock)+" -p 5432 -c unix_socket_permissions=0700","start"],env)
        started=True
        def q(sql,db="postgres"):
            return run([paths["psql"],"-X","-w","-Atq","-v","ON_ERROR_STOP=1","-d",db],env,data=sql.encode()).decode().strip()
        need(q("SHOW server_version_num;")=="180007","HF100_RESTORE_PG_VERSION")
        need(q("SHOW listen_addresses;")=="" and q("SELECT inet_server_addr() IS NULL;")=="t","HF100_RESTORE_SOCKET_ONLY")
        for role in roles:q('CREATE ROLE "'+role+'" NOLOGIN;')
        run([paths["pg_restore"],"--exit-on-error","--create","-w","-d","postgres"],env,data=dump,timeout=180)
        result={"catalog":json.loads(q("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;\n"+catalog+"\nCOMMIT;",target)),
          "registry":json.loads(q("BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;\n"+shape+"\nCOMMIT;",target)),
          "network_namespace":str(Path("/proc/self/ns/net").readlink()),"unix_socket_only":True,"uid":os.geteuid()}
        return result
    finally:
        if started:run([paths["pg_ctl"],"-D",str(data),"-m","immediate","-w","stop"],env)
def main():
    # Request and dump are in the parent's private temporary directory.
    request=Path(sys.argv[1]);p=json.loads(request.read_bytes());dump=(request.parent/"target.dump").read_bytes()
    print(json.dumps(local_restore(request.parent,p["paths"],p["database"],p["catalog"],p["shape"],p["roles"],dump,p["parent_net"]),sort_keys=True))
if __name__=="__main__":
    try:main()
    except Exception:
        print("HF100_NATIVE_RESTORE_FAILED",file=sys.stderr);sys.exit(1)
