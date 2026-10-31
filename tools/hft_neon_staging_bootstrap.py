#!/usr/bin/env python3
"""Neon staging bootstrap runner. SOURCE ONLY under CORRECT-020; execution needs later MASTER GO."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys, ssl, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; SQL_DIR=ROOT/'db'/'migrations'; MANIFEST=SQL_DIR/'manifest.v1.json'
PROJECT='red-silence-36758131'; BRANCH='br-dawn-moon-azd9xzrp'; BRANCH_NAME='vercel-dev'; DB='neondb'
MANIFEST_SHA='ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355'
REVIEW_APPROVAL_SHA256=''  # REQUEST CHANGES: never set through environment.
PGNUM='180006'; BASE='59fc9b758b28692103bb7bcc99fa8173cee478b5'; ENDPOINT='ep-lingering-tooth-azvv1jmr'
HOST='ep-lingering-tooth-azvv1jmr.c-3.ap-southeast-1.aws.neon.tech'; OWNER='neondb_owner'
MIG='hft_staging_migration_owner'; RG='hft_r1_app_runtime'; RLOGIN='hft_staging_app_runtime'
AG='hft_r1_audit_verify'; ALOGIN='hft_staging_audit_verify'; POST_OWNER='hft_r1_posting_owner'; P3_OWNER='hft_r1_p3_master_owner'; P3GROUP='hft_r1_p3_master_runtime'; MLOGIN='hft_staging_masters_runtime'; GOV='hft_r1_governance_issuer'; LOCK='HFT:R1:NEON:STAGING:MIGRATIONS'
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
 raw=MANIFEST.read_bytes()
 if MANIFEST.is_symlink() or sha(raw)!=MANIFEST_SHA: raise Stop('MANIFEST_SHA256_DRIFT')
 d=json.loads(raw); es=d.get('migrations')
 if set(d)!={'schema','mode','minimum_postgresql_major','executable_directory',
 'migrations','incompatible_provenance'} or d['schema']!='HFT_R1_CANONICAL_MIGRATION_MANIFEST_V1' or (
  d['mode']!='ISOLATED_NONPRODUCTION' or d['minimum_postgresql_major']!=15
  or d['executable_directory']!='db/migrations'):
  raise Stop('MANIFEST_FORMAT')
 if len(es or [])!=6: raise Stop('MANIFEST_COUNT')
 out=[]
 for exp,item in zip(MIGS,es):
  v,n,h=exp
  if item!={'version':v,'file':n,'sha256':h}: raise Stop(f'MANIFEST_ENTRY:{v}')
  p=SQL_DIR/n; raw=p.read_bytes() if p.is_file() and not p.is_symlink() else b''
  if sha(raw)!=h: raise Stop(f'MIGRATION_HASH:{v}')
  m=WRAP.fullmatch(raw.decode())
  if not m: raise Stop(f'MIGRATION_WRAPPER:{v}')
  out.append((v,p,h,m.group(1)))
 if {str(p.relative_to(SQL_DIR)) for p in SQL_DIR.rglob('*.sql')}!={n for _,n,_ in MIGS}:
  raise Stop('UNEXPECTED_MIGRATION_SQL')
 rejected=ROOT/'db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql'
 rejected_sha='8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e'
 if rejected.is_symlink() or not rejected.is_file() or sha(rejected.read_bytes())!=rejected_sha:
  raise Stop('INCOMPATIBLE_PROVENANCE_CHANGED')
 if d['incompatible_provenance']!=[{'version':5,
    'file':'db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql',
    'sha256':rejected_sha,'execution':'PROHIBITED',
    'applied_database_policy':'STOP_REQUIRES_SEPARATE_AUTHORIZED_FORWARD_MIGRATION'}]:
  raise Stop('MANIFEST_PROVENANCE_CHANGED')
 if any(p.suffix.lower()=='.sql' for p in (ROOT/'db/migration_candidates').rglob('*')):
  raise Stop('PARALLEL_MIGRATION_SQL_DENIED')
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
  for name in (MIG,RLOGIN,ALOGIN,MLOGIN):
   if r.get(name,{}).get('authentication_method')!='password': raise Stop(f'ROLE_ATTESTATION:{name}')
 return sha(raw)

class DenyRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  raise Stop('CONTROL_PLANE_REDIRECT_DENIED')

def _neon_control_get(url,token):
 if not url.startswith('https://console.neon.tech/api/v2/projects/'+PROJECT):
  raise Stop('CONTROL_PLANE_URL_NOT_PINNED')
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,
  'Accept':'application/json'},method='GET')
 try:
  opener=urllib.request.build_opener(
   urllib.request.HTTPSHandler(context=ssl.create_default_context()),DenyRedirect())
  with opener.open(req,timeout=8) as response:
   if response.status!=200 or 'application/json' not in response.headers.get('Content-Type',''):
    raise Stop('CONTROL_PLANE_HTTP_DENIED')
   body=response.read(131073)
   if len(body)>131072: raise Stop('CONTROL_PLANE_BODY_TOO_LARGE')
   result=json.loads(body)
   if not isinstance(result,dict): raise Stop('CONTROL_PLANE_BODY_NOT_OBJECT')
   return result
 except Stop: raise
 except Exception: raise Stop('CONTROL_PLANE_NETWORK_OR_RESPONSE_DENIED') from None

def control_plane_live(attestation,env=None,getter=None):
 # The saved Chat 13 attestation alone is NOT proof of an actual Neon endpoint.
 # Authenticate against live provider control plane over certificate-verified
 # HTTPS with redirect denial. No token, URI or provider error is ever logged.
 env=os.environ if env is None else env
 token=env.get('HFT_NEON_CONTROL_PLANE_API_TOKEN','')
 if len(token)<20 or len(token)>4096: raise Stop('CONTROL_PLANE_TOKEN_NOT_PROVISIONED')
 getter=_neon_control_get if getter is None else getter
 root='https://console.neon.tech/api/v2/projects/'+PROJECT
 try:
  project=getter(root,token).get('project')
  branch=getter(root+'/branches/'+BRANCH,token).get('branch')
  endpoints=getter(root+'/endpoints',token).get('endpoints')
  if not isinstance(project,dict) or not isinstance(branch,dict) or not isinstance(endpoints,list):
   raise Stop('CONTROL_PLANE_INCOMPLETE')
  if project.get('id')!=PROJECT or project.get('region_id', 'aws-ap-southeast-1')!='aws-ap-southeast-1':
   raise Stop('CONTROL_PLANE_PROJECT_MISMATCH')
  if branch.get('id')!=BRANCH or branch.get('name')!=BRANCH_NAME or branch.get('project_id',PROJECT)!=PROJECT:
   raise Stop('CONTROL_PLANE_BRANCH_MISMATCH')
  found=[x for x in endpoints if isinstance(x,dict) and x.get('id')==ENDPOINT]
  if len(found)!=1 or found[0].get('host')!=HOST or found[0].get('branch_id')!=BRANCH or found[0].get('type')!='read_write' or found[0].get('region_id')!='aws-ap-southeast-1':
   raise Stop('CONTROL_PLANE_ENDPOINT_MISMATCH')
  if attestation.get('endpoint_host')!=found[0]['host'] or attestation.get('endpoint_id')!=found[0]['id']:
   raise Stop('CONTROL_PLANE_ATTESTATION_NOT_CURRENT')
  return sha((PROJECT+'|'+BRANCH+'|'+ENDPOINT+'|'+HOST).encode())
 except Stop: raise
 except Exception: raise Stop('CONTROL_PLANE_INVALID_RESPONSE') from None

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
 if len(x)!=5 or x[:3]!=[DB,user,PGNUM] or x[3] not in ('true','false'):
  raise Stop('SQL_TARGET_IDENTITY')
 # The client-to-Neon transport is required to use libpq PGSSLMODE=verify-full
 # and the provider-attested direct hostname. pg_stat_ssl is only the
 # Neon-proxy-to-backend leg; it may legitimately report SSL=false.
 return '|'.join(x)

def empty(e):
 s="SELECT (to_regnamespace('hft') IS NULL)::text||'|'||(to_regclass('hft.schema_revision') IS NULL)::text||'|'||(SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S'));"
 if q(s,e)!='true|true|0': raise Stop('UNEXPECTED_PREEXISTING_OBJECTS')

# One authoritative set of independently reviewable role/ACL SQL sources;
# runner checks each exact SHA before any future approved execution.
ROLE_SQL='HFT-R1-BOOTSTRAP-019-DBA-ROLE-NONEXECUTABLE.sql'
ROLE_SHA='d3794d7dc8949b4d7b1398a0c77eb8c8b31761d4558440d31e0146d935bd3b21'
CREATOR_SQL='HFT-R1-BOOTSTRAP-019-CREATOR-ACL-NONEXECUTABLE.sql'
CREATOR_SHA='88be0664f15044e46c483b7120f3e7e319b423ac387289a1032d58d9cba34769'
CLOSE_SQL='HFT-R1-BOOTSTRAP-019-DBA-CLOSE-NONEXECUTABLE.sql'
CLOSE_SHA='1d974602adc2f1696ab340bc60724018c6f1a5b4b1364597f05c90b5f4669970'

def reviewed_sql(name,digest):
 p=ROOT/'db/security'/name
 if p.is_symlink() or not p.is_file():raise Stop('BOOTSTRAP019_REVIEW_SQL_SOURCE_UNAVAILABLE')
 data=p.read_bytes()
 if sha(data)!=digest or not data.startswith(b'-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY'):
  raise Stop('BOOTSTRAP019_REVIEW_SQL_SOURCE_DRIFT')
 return data.decode('utf-8')

def security_sql(): return reviewed_sql(ROLE_SQL,ROLE_SHA)
def creator_sql(): return reviewed_sql(CREATOR_SQL,CREATOR_SHA)

def statement(v,h,body):
 # NO COMMIT in substatement. The batch owns one atomic transaction.
 if v==1:
  guard="DO $g$ BEGIN IF to_regnamespace('hft') IS NOT NULL OR to_regclass('hft.schema_revision') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')) THEN RAISE EXCEPTION 'MIGRATION_0001_UNEXPECTED_STATE'; END IF; END $g$;\n"
 else:
  prior=MIGS[v-2][2]
  guard=f"DO $g$ BEGIN IF NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version={v-1} AND sha256='{prior}') OR EXISTS(SELECT 1 FROM hft.schema_revision WHERE version={v}) THEN RAISE EXCEPTION 'MIGRATION_{v:04d}_REVISION_STATE'; END IF; END $g$;\n"
 return guard+body+f"\nINSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES({v},'{h}',current_user);\n"

def batch_sql(plan):
 # Exactly one advisory xact lock + one transaction for all canonical 0001-0006.
 if [(v,p.name,h) for v,p,h,_ in plan]!=list(MIGS):
  raise Stop('CANONICAL_BATCH_PLAN_NOT_PINNED')
 lock_guard=f"DO $lock$ BEGIN IF NOT pg_try_advisory_xact_lock(hashtextextended('{LOCK}',0)) THEN RAISE EXCEPTION 'MIGRATION_CONCURRENT_RUNNER_DENIED'; END IF; END $lock$;\n"
 preflight=f"DO $pre$ BEGIN IF current_database()<>'{DB}' OR session_user<>'{MIG}' OR current_user<>'{MIG}' OR current_setting('server_version_num')::integer<>{PGNUM} OR (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) OR NOT has_database_privilege(current_user,current_database(),'CREATE') OR has_database_privilege(current_user,current_database(),'TEMP') THEN RAISE EXCEPTION 'MIGRATION_BATCH_IDENTITY_OR_CREATE_DENIED'; END IF; IF NOT EXISTS(SELECT 1 FROM pg_default_acl d WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND d.defaclnamespace=0 AND d.defaclobjtype='f' AND NOT EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) x WHERE x.grantee=0 AND x.privilege_type='EXECUTE')) THEN RAISE EXCEPTION 'MIGRATION_GLOBAL_FUNCTION_DEFAULT_NOT_REVOKED'; END IF; END $pre$;\n"
 chunks=''.join(statement(v,h,b) for v,_,h,b in plan)
 ack='HFT_CANONICAL_BATCH_COMMIT_ACK|0001-0006|'+MIGS[-1][2]
 return "BEGIN;\n"+lock_guard+preflight+chunks+"\nCOMMIT;\nSELECT '"+ack+"';\n"


def ledger(e,n=6):
 got=q("SELECT version::text||'|'||sha256 FROM hft.schema_revision ORDER BY version;",e).splitlines(); exp=[f'{v}|{h}' for v,_,h in MIGS[:n]]
 if got!=exp: raise Stop('REVISION_LEDGER')

def finalize_sql(): return reviewed_sql(CLOSE_SQL,CLOSE_SHA)
def verify_sql():
 return f"""WITH pdb AS(SELECT count(*) n FROM pg_database d,LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba)))x WHERE d.datname='{DB}' AND x.grantee=0 AND x.privilege_type IN('CONNECT','TEMPORARY')), pex AS(SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))x WHERE n.nspname='hft' AND x.grantee=0 AND x.privilege_type='EXECUTE'), bro AS(SELECT count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hft' AND c.relkind IN('r','p','v','m','S') AND pg_get_userbyid(c.relowner)<>'{MIG}'), bfo AS(SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hft' AND pg_get_userbyid(p.proowner)<>'{MIG}') SELECT (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='hft')||'|'||has_database_privilege('{MIG}','{DB}','CREATE')::text||'|'||has_database_privilege('{RLOGIN}','{DB}','CONNECT')::text||'|'||has_database_privilege('{RLOGIN}','{DB}','CREATE')::text||'|'||has_schema_privilege('{RLOGIN}','hft','USAGE')::text||'|'||has_schema_privilege('{ALOGIN}','hft','USAGE')::text||'|'||has_table_privilege('{ALOGIN}','hft.schema_revision','SELECT')::text||'|'||(SELECT n FROM pdb)||'|'||(SELECT n FROM pex)||'|'||(SELECT n FROM bro)||'|'||(SELECT n FROM bfo);"""

def log(p,event,**kw):
 p.parent.mkdir(parents=True,exist_ok=True); p.open('a',encoding='utf-8').write(json.dumps({'ts_utc':now(),'event':event,**kw},sort_keys=True,separators=(',',':'))+'\n')
def authority(a):
 if not a.execute or not a.authorization_id.startswith('HFT-R1-MASTER-V3-'): raise Stop('MASTER_EXECUTION_AUTHORIZATION')
 vals=[a.decision_maker,a.operator,a.evidence_custodian,a.independent_verifier]
 if any(not HUMAN.fullmatch(x.strip()) or x.strip().upper() in {'TBD','UNKNOWN','AI','CHATGPT','MAVERICK'} for x in vals): raise Stop('HUMAN_ATTRIBUTION')
 if a.operator.strip()==a.independent_verifier.strip(): raise Stop('INDEPENDENT_HUMAN_VERIFIER')
 # REQUEST CHANGES cannot be cleared with CLI flags or unverifiable names.
 # A separately reviewed source commit must pin the acceptance evidence hash.
 if not REVIEW_APPROVAL_SHA256: raise Stop('BOOTSTRAP019_INDEPENDENT_REVIEW_HOLD')
 if not a.review_evidence or sha(a.review_evidence.read_bytes())!=REVIEW_APPROVAL_SHA256:
  raise Stop('BOOTSTRAP019_APPROVAL_EVIDENCE_NOT_VERIFIED')

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('phase',choices=['verify-manifest','preflight-owner','prepare-security','prepare-migration-owner','migrate','finalize','verify-final']); ap.add_argument('--attestation',type=Path); ap.add_argument('--journal',type=Path); ap.add_argument('--execute',action='store_true'); ap.add_argument('--authorization-id',default=''); ap.add_argument('--decision-maker',default=''); ap.add_argument('--operator',default=''); ap.add_argument('--evidence-custodian',default=''); ap.add_argument('--independent-verifier',default=''); ap.add_argument('--review-evidence',type=Path); a=ap.parse_args(); plan=manifest()
 if a.phase=='verify-manifest':
  [print(f'MIGRATION_{v:04d}=CANONICAL_VALIDATED file={p.name} sha256={h}') for v,p,h,_ in plan]; print(f'SOURCE_BASELINE={BASE}'); print('MANIFEST_ONLY_VALIDATED_NO_DATABASE_EXECUTION'); return 0
 if a.phase in {'prepare-security','prepare-migration-owner','migrate','finalize'} and not REVIEW_APPROVAL_SHA256:
  raise Stop('BOOTSTRAP019_INDEPENDENT_REVIEW_HOLD')
 if not a.attestation or not a.journal: raise Stop('ATTESTATION_AND_JOURNAL')
 need_roles=a.phase in {'prepare-migration-owner','migrate','finalize','verify-final'}; ah=attest(a.attestation,need_roles); live_control=control_plane_live(json.loads(a.attestation.read_text())); user=OWNER if a.phase in {'preflight-owner','prepare-security','finalize','verify-final'} else MIG; e=env_for(user); ident=sql_attest(e,user); log(a.journal,'target_attested',phase=a.phase,project_id=PROJECT,branch_id=BRANCH,endpoint_id=ENDPOINT,database=DB,db_user=user,attestation_sha256=ah,provider_scope_sha256=live_control,sql_identity=ident,source_baseline=BASE)
 if a.phase=='preflight-owner': empty(e); print('OWNER_PREFLIGHT=PASS_EMPTY_HFT_TARGET'); return 0
 authority(a); log(a.journal,'execution_authority',phase=a.phase,authorization_id=a.authorization_id,decision_maker=a.decision_maker,operator=a.operator,evidence_custodian=a.evidence_custodian,independent_verifier=a.independent_verifier)
 if a.phase=='prepare-security': empty(e); out=q(security_sql(),e); assert 'HFT_SECURITY_BOOTSTRAP_ACK' in out; log(a.journal,'security_bootstrap_committed'); print('SECURITY_BOOTSTRAP=COMMITTED; RESET_LOGIN_PASSWORDS_AND_REFRESH_ROLE_ATTESTATION'); return 0
 if a.phase=='prepare-migration-owner': empty(e); out=q(creator_sql(),e); assert 'HFT_MIGRATION_OWNER_PREPARED_ACK' in out; log(a.journal,'migration_owner_prepared'); print('MIGRATION_OWNER_PREPARED=TRUE'); return 0
 if a.phase=='migrate':
  empty(e)
  complete=batch_sql(plan)
  log(a.journal,'canonical_batch_started',first_version=1,last_version=6,
      manifest_sha256=sha(MANIFEST.read_bytes()),statement_sha256=sha(complete.encode()))
  try: reply=q(complete,e)
  except Stop:
   # The server may have COMMITTED while transport acknowledgment was lost.
   # Never attempt to rerun SQL automatically. Independent ledger/readback first.
   log(a.journal,'canonical_batch_outcome_uncertain',first_version=1,last_version=6)
   print('HFT_NEON_CANONICAL_BATCH_OUTCOME_UNCERTAIN;DO_NOT_RETRY',file=sys.stderr)
   return 2
  ack='HFT_CANONICAL_BATCH_COMMIT_ACK|0001-0006|'+MIGS[-1][2]
  if ack not in reply:
   log(a.journal,'canonical_batch_outcome_uncertain',reason='ACK_MISSING')
   print('HFT_NEON_CANONICAL_BATCH_ACK_MISSING;DO_NOT_RETRY',file=sys.stderr)
   return 2
  try: ledger(e,6)
  except Stop:
   log(a.journal,'canonical_batch_readback_unverified')
   print('HFT_NEON_CANONICAL_BATCH_READBACK_UNVERIFIED;DO_NOT_RETRY',file=sys.stderr)
   return 2
  log(a.journal,'canonical_batch_committed_verified',first_version=1,last_version=6)
  print('CANONICAL_MIGRATIONS_0001_0006=BATCH_COMMITTED_READBACK_PASS;DBA_FINAL_REVOKE_PENDING')
  return 0

 if a.phase=='finalize': ledger(e); out=q(finalize_sql(),e); assert 'HFT_FINALIZE_ACK' in out; log(a.journal,'finalize_committed'); print('FINALIZE=COMMITTED'); return 0
 if a.phase=='verify-final':
  ledger(e); got=q(verify_sql(),e); exp=f'{MIG}|false|true|false|false|true|true|0|0|0|0'
  if got!=exp: raise Stop(f'FINAL_PRIVILEGES:{got}')
  log(a.journal,'final_verification_passed',result=got); print('FINAL_PRIVILEGE_ATTESTATION=PASS'); return 0
if __name__=='__main__':
 try: raise SystemExit(main())
 except (Stop,AssertionError) as x: print(f'HFT_NEON_BOOTSTRAP_STOP={x}',file=sys.stderr); raise SystemExit(1)
