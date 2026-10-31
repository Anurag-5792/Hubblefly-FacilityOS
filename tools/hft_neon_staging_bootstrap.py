#!/usr/bin/env python3
"""Neon staging bootstrap runner. SOURCE ONLY under CORRECT-020; execution needs later MASTER GO."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; SQL_DIR=ROOT/'db'/'migrations'; MANIFEST=SQL_DIR/'manifest.v1.json'
PROJECT='red-silence-36758131'; BRANCH='br-dawn-moon-azd9xzrp'; BRANCH_NAME='vercel-dev'; DB='neondb'
PGNUM='180006'; BASE='59fc9b758b28692103bb7bcc99fa8173cee478b5'; ENDPOINT='ep-lingering-tooth-azvv1jmr'
HOST='ep-lingering-tooth-azvv1jmr.c-3.ap-southeast-1.aws.neon.tech'; OWNER='neondb_owner'
MIG='hft_staging_migration_owner'; RG='hft_r1_app_runtime'; RLOGIN='hft_staging_app_runtime'
AG='hft_r1_audit_verify'; ALOGIN='hft_staging_audit_verify'; LOCK='HFT:R1:NEON:STAGING:MIGRATIONS'
MIGS=((1,'0001_hft_masters.sql','8e7253652591c5ce7ef3935d0dc8893e4f503479fa59e7748583ec9ec2215723'),
(2,'0002_hft_ledger.sql','6e1981c6314b604f470c4a5d9e7c255891fc7e3f693e5cde7780ea77ff12da36'),
(3,'0003_hft_workflows.sql','bf8a4987d1f3c82f3016a1d340edb79a6d238229e23f28dbc65cc75c0a181cf8'),
(4,'0004_hft_posting_authority.sql','27375f432d476e8e88f8402af1970422d62de898a1fbcc91a9ec30efce79d7e2'),
(5,'0005_hft_quantitative_accounts_receipts.sql','01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf'),
(6,'0006_hft_posted_fact_integrity.sql','664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044'))
WRAP=re.compile(r'\A(?:\s*--[^\n]*\n)*\s*BEGIN;\s*(.*?)\s*COMMIT;\s*\Z',re.S); HUMAN=re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:@/+ -]{1,255}$')
class Stop(RuntimeError): pass
def sha(b): return hashlib.sha256(b).hexdigest()
def now(): return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')

def manifest():
 d=json.loads(MANIFEST.read_text()); es=d.get('migrations')
 if len(es or [])!=6: raise Stop('MANIFEST_COUNT')
 out=[]
 for exp,item in zip(MIGS,es,strict=True):
  v,n,h=exp
  if item!={'version':v,'file':n,'sha256':h}: raise Stop(f'MANIFEST_ENTRY:{v}')
  p=SQL_DIR/n; raw=p.read_bytes() if p.is_file() and not p.is_symlink() else b''
  if sha(raw)!=h: raise Stop(f'MIGRATION_HASH:{v}')
  m=WRAP.fullmatch(raw.decode())
  if not m: raise Stop(f'MIGRATION_WRAPPER:{v}')
  out.append((v,p,h,m.group(1)))
 if {p.name for p in SQL_DIR.glob('*.sql')}!={n for _,n,_ in MIGS}: raise Stop('UNEXPECTED_MIGRATION_SQL')
 return out

def attest(path, roles=False):
 raw=path.read_bytes(); d=json.loads(raw)
 req={'project_id':PROJECT,'branch_id':BRANCH,'branch_name':BRANCH_NAME,'database':DB,'database_owner':OWNER,
      'endpoint_id':ENDPOINT,'endpoint_host':HOST,'endpoint_type':'read_write','region_id':'aws-ap-southeast-1','postgres_version':'18.6'}
 for k,v in req.items():
  if d.get(k)!=v: raise Stop(f'CONTROL_PLANE:{k}')
 if d.get('production_branch_touched') is not False or not str(d.get('captured_at_utc','')).endswith('Z'): raise Stop('CONTROL_PLANE_BOUNDARY')
 if roles:
  r=d.get('roles',{})
  for name in (MIG,RLOGIN,ALOGIN):
   if r.get(name,{}).get('authentication_method')!='password': raise Stop(f'ROLE_ATTESTATION:{name}')
 return sha(raw)

def env_for(user):
 e=dict(os.environ); req={'PGHOST':HOST,'PGDATABASE':DB,'PGUSER':user,'PGSSLMODE':'verify-full'}
 for k,v in req.items():
  if e.get(k)!=v: raise Stop(f'ENV:{k}')
 if e.get('PGPORT','5432')!='5432': raise Stop('ENV:PGPORT')
 for k in ('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGTARGETSESSIONATTRS'):
  if e.get(k): raise Stop(f'AMBIENT:{k}')
 if not shutil.which('psql'): raise Stop('PSQL_MISSING')
 return e

def q(sql,e):
 p=subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-A','-t','-q'],input=sql,text=True,capture_output=True,env=e)
 if p.returncode: raise Stop(f'PSQL_EXIT:{p.returncode}')
 return p.stdout.strip()

def sql_attest(e,user):
 s=f"SELECT current_database()||'|'||current_user||'|'||current_setting('server_version_num')||'|'||COALESCE((SELECT ssl::text FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'false')||'|'||COALESCE((SELECT version FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'') WHERE current_database()='{DB}' AND current_user='{user}';"
 x=q(s,e).split('|')
 if len(x)!=5 or x[:3]!=[DB,user,PGNUM] or x[3]!='true' or not x[4].startswith('TLSv'): raise Stop('SQL_TARGET_TLS')
 return '|'.join(x)

def empty(e):
 s="SELECT (to_regnamespace('hft') IS NULL)::text||'|'||(to_regclass('hft.schema_revision') IS NULL)::text||'|'||(SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S'));"
 if q(s,e)!='true|true|0': raise Stop('UNEXPECTED_PREEXISTING_OBJECTS')

def security_sql():
 roles=','.join("'"+x+"'" for x in (MIG,RG,RLOGIN,AG,ALOGIN))
 return f"""BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $g$ BEGIN IF current_database()<>'{DB}' OR current_user<>'{OWNER}' OR current_setting('server_version_num')::int<>{PGNUM} OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) OR to_regnamespace('hft') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ({roles})) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')) THEN RAISE EXCEPTION 'HFT_SECURITY_PREFLIGHT'; END IF; END $g$;
REVOKE CONNECT,TEMPORARY ON DATABASE {DB} FROM PUBLIC;
CREATE ROLE {MIG} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE {RG} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE {RLOGIN} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE {AG} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE {ALOGIN} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT {RG} TO {RLOGIN}; GRANT {AG} TO {ALOGIN};
GRANT CONNECT,CREATE ON DATABASE {DB} TO {MIG}; GRANT CONNECT ON DATABASE {DB} TO {RLOGIN},{ALOGIN};
COMMIT; SELECT 'HFT_SECURITY_BOOTSTRAP_ACK';"""

def creator_sql():
 return f"""BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0));
DO $g$ BEGIN IF current_user<>'{MIG}' OR current_setting('server_version_num')::int<>{PGNUM} OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) OR NOT has_database_privilege(current_user,current_database(),'CREATE') OR has_database_privilege(current_user,current_database(),'TEMP') OR to_regnamespace('hft') IS NOT NULL THEN RAISE EXCEPTION 'HFT_MIGRATION_ROLE_PREFLIGHT'; END IF; END $g$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $v$ BEGIN IF EXISTS(SELECT 1 FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl)x WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND d.defaclobjtype='f' AND x.grantee=0 AND x.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC_FUNCTION_EXECUTE_DEFAULT'; END IF; END $v$;
COMMIT; SELECT 'HFT_MIGRATION_OWNER_PREPARED_ACK';"""

def statement(v,h,body):
 if v==1:
  guard="DO $g$ BEGIN IF to_regnamespace('hft') IS NOT NULL OR to_regclass('hft.schema_revision') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')) THEN RAISE EXCEPTION 'MIGRATION_0001_UNEXPECTED_STATE'; END IF; END $g$;\n"
 else:
  ph=MIGS[v-2][2]; guard=f"DO $g$ BEGIN IF NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version={v-1} AND sha256='{ph}') OR EXISTS(SELECT 1 FROM hft.schema_revision WHERE version={v}) THEN RAISE EXCEPTION 'MIGRATION_{v:04d}_REVISION_STATE'; END IF; END $g$;\n"
 return f"BEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('{LOCK}',0));\n"+guard+body+f"\nINSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES({v},'{h}',current_user);\nCOMMIT;\nSELECT 'HFT_MIGRATION_COMMIT_ACK|{v}|{h}';\n"

def ledger(e,n=6):
 got=q("SELECT version::text||'|'||sha256 FROM hft.schema_revision ORDER BY version;",e).splitlines(); exp=[f'{v}|{h}' for v,_,h in MIGS[:n]]
 if got!=exp: raise Stop('REVISION_LEDGER')

def finalize_sql(): return f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('HFT:R1:NEON:STAGING:SECURITY',0)); REVOKE CREATE ON DATABASE {DB} FROM {MIG}; GRANT USAGE ON SCHEMA hft TO {AG}; GRANT SELECT ON hft.schema_revision TO {AG}; COMMIT; SELECT 'HFT_FINALIZE_ACK';"
def verify_sql():
 return f"""WITH pdb AS(SELECT count(*) n FROM pg_database d,LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba)))x WHERE d.datname='{DB}' AND x.grantee=0 AND x.privilege_type IN('CONNECT','TEMPORARY')), pex AS(SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))x WHERE n.nspname='hft' AND x.grantee=0 AND x.privilege_type='EXECUTE'), bro AS(SELECT count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hft' AND c.relkind IN('r','p','v','m','S') AND pg_get_userbyid(c.relowner)<>'{MIG}'), bfo AS(SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft' AND pg_get_userbyid(p.proowner)<>'{MIG}') SELECT (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='hft')||'|'||has_database_privilege('{MIG}','{DB}','CREATE')::text||'|'||has_database_privilege('{RLOGIN}','{DB}','CONNECT')::text||'|'||has_database_privilege('{RLOGIN}','{DB}','CREATE')::text||'|'||has_schema_privilege('{RLOGIN}','hft','USAGE')::text||'|'||has_schema_privilege('{ALOGIN}','hft','USAGE')::text||'|'||has_table_privilege('{ALOGIN}','hft.schema_revision','SELECT')::text||'|'||(SELECT n FROM pdb)||'|'||(SELECT n FROM pex)||'|'||(SELECT n FROM bro)||'|'||(SELECT n FROM bfo);"""

def log(p,event,**kw):
 p.parent.mkdir(parents=True,exist_ok=True); p.open('a',encoding='utf-8').write(json.dumps({'ts_utc':now(),'event':event,**kw},sort_keys=True,separators=(',',':'))+'\n')
def authority(a):
 if not a.execute or not a.authorization_id.startswith('HFT-R1-MASTER-V3-'): raise Stop('MASTER_EXECUTION_AUTHORIZATION')
 vals=[a.decision_maker,a.operator,a.evidence_custodian,a.independent_verifier]
 if any(not HUMAN.fullmatch(x.strip()) or x.strip().upper() in {'TBD','UNKNOWN','AI','CHATGPT','MAVERICK'} for x in vals): raise Stop('HUMAN_ATTRIBUTION')
 if a.operator.strip()==a.independent_verifier.strip(): raise Stop('INDEPENDENT_HUMAN_VERIFIER')

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('phase',choices=['verify-manifest','preflight-owner','prepare-security','prepare-migration-owner','migrate','finalize','verify-final']); ap.add_argument('--attestation',type=Path); ap.add_argument('--journal',type=Path); ap.add_argument('--execute',action='store_true'); ap.add_argument('--authorization-id',default=''); ap.add_argument('--decision-maker',default=''); ap.add_argument('--operator',default=''); ap.add_argument('--evidence-custodian',default=''); ap.add_argument('--independent-verifier',default=''); a=ap.parse_args(); plan=manifest()
 if a.phase=='verify-manifest':
  [print(f'MIGRATION_{v:04d}=CANONICAL_VALIDATED file={p.name} sha256={h}') for v,p,h,_ in plan]; print(f'SOURCE_BASELINE={BASE}'); print('MANIFEST_ONLY_VALIDATED_NO_DATABASE_EXECUTION'); return 0
 if not a.attestation or not a.journal: raise Stop('ATTESTATION_AND_JOURNAL')
 need_roles=a.phase in {'prepare-migration-owner','migrate','finalize','verify-final'}; ah=attest(a.attestation,need_roles); user=OWNER if a.phase in {'preflight-owner','prepare-security','finalize','verify-final'} else MIG; e=env_for(user); ident=sql_attest(e,user); log(a.journal,'target_attested',phase=a.phase,project_id=PROJECT,branch_id=BRANCH,endpoint_id=ENDPOINT,database=DB,db_user=user,attestation_sha256=ah,sql_identity=ident,source_baseline=BASE)
 if a.phase=='preflight-owner': empty(e); print('OWNER_PREFLIGHT=PASS_EMPTY_HFT_TARGET'); return 0
 authority(a); log(a.journal,'execution_authority',phase=a.phase,authorization_id=a.authorization_id,decision_maker=a.decision_maker,operator=a.operator,evidence_custodian=a.evidence_custodian,independent_verifier=a.independent_verifier)
 if a.phase=='prepare-security': empty(e); out=q(security_sql(),e); assert 'HFT_SECURITY_BOOTSTRAP_ACK' in out; log(a.journal,'security_bootstrap_committed'); print('SECURITY_BOOTSTRAP=COMMITTED; RESET_LOGIN_PASSWORDS_AND_REFRESH_ROLE_ATTESTATION'); return 0
 if a.phase=='prepare-migration-owner': empty(e); out=q(creator_sql(),e); assert 'HFT_MIGRATION_OWNER_PREPARED_ACK' in out; log(a.journal,'migration_owner_prepared'); print('MIGRATION_OWNER_PREPARED=TRUE'); return 0
 if a.phase=='migrate':
  empty(e)
  for v,p,h,b in plan:
   s=statement(v,h,b); log(a.journal,'migration_started',version=v,file=p.name,source_sha256=h,statement_sha256=sha(s.encode()))
   try: out=q(s,e)
   except Stop as x: log(a.journal,'migration_outcome_uncertain',version=v,reason=str(x)); print(f'HFT_NEON_MIGRATION_OUTCOME_UNCERTAIN={v:04d};DO_NOT_RETRY',file=sys.stderr); return 2
   if f'HFT_MIGRATION_COMMIT_ACK|{v}|{h}' not in out: log(a.journal,'migration_outcome_uncertain',version=v,reason='ACK_MISSING'); return 2
   ledger(e,v); log(a.journal,'migration_committed',version=v,source_sha256=h); print(f'MIGRATION_{v:04d}=APPLIED sha256={h}')
  print('CANONICAL_MIGRATIONS_0001_0006=COMPLETE'); return 0
 if a.phase=='finalize': ledger(e); out=q(finalize_sql(),e); assert 'HFT_FINALIZE_ACK' in out; log(a.journal,'finalize_committed'); print('FINALIZE=COMMITTED'); return 0
 if a.phase=='verify-final':
  ledger(e); got=q(verify_sql(),e); exp=f'{MIG}|false|true|false|false|true|true|0|0|0|0'
  if got!=exp: raise Stop(f'FINAL_PRIVILEGES:{got}')
  log(a.journal,'final_verification_passed',result=got); print('FINAL_PRIVILEGE_ATTESTATION=PASS'); return 0
if __name__=='__main__':
 try: raise SystemExit(main())
 except (Stop,AssertionError) as x: print(f'HFT_NEON_BOOTSTRAP_STOP={x}',file=sys.stderr); raise SystemExit(1)
