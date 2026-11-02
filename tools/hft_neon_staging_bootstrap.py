#!/usr/bin/env python3
"""HFT R1 Neon staging bootstrap runner. Source preparation only until review/execution pins are populated."""
from __future__ import annotations
try:
 from tools.hft_neon_recovery_v2 import validate_v2,validate_phase
except ModuleNotFoundError:
 from hft_neon_recovery_v2 import validate_v2,validate_phase
import argparse, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys, ssl, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; SQL_DIR=ROOT/'db'/'migrations'; MANIFEST=SQL_DIR/'manifest.v1.json'
PROJECT='red-silence-36758131'; BRANCH='br-dawn-moon-azd9xzrp'; BRANCH_NAME='vercel-dev'; DB='neondb'
PGNUM='180006'; BASE='59fc9b758b28692103bb7bcc99fa8173cee478b5'
ENDPOINT='ep-lingering-tooth-azvv1jmr'; HOST='ep-lingering-tooth-azvv1jmr.c-3.ap-southeast-1.aws.neon.tech'; OWNER='neondb_owner'
MIG='hft_staging_migration_owner'; RG='hft_r1_app_runtime'; RLOGIN='hft_staging_app_runtime'; AG='hft_r1_audit_verify'; ALOGIN='hft_staging_audit_verify'
LOCK='HFT:R1:NEON:STAGING:MIGRATIONS'; MANIFEST_SHA='ce51d77af4db16b8d97dcbcc10cd0472ef806f7c581b16982f95f21120fa7355'
REVIEW_PIN=ROOT/'config/hft-bootstrap019-review.sha256'; EXEC_PIN=ROOT/'config/hft-bootstrap019-execution.sha256'
ROLE_SQL='HFT-R1-BOOTSTRAP-019-DBA-ROLE-NONEXECUTABLE.sql'; ROLE_SHA='d652a7489e877c5039a58d8b68f7734a9a0aa71b736a48b49599ce69e8999b01'
CREATOR_SQL='HFT-R1-BOOTSTRAP-019-CREATOR-ACL-NONEXECUTABLE.sql'; CREATOR_SHA='e7e9c3b58fcb468addc3d7e1220a81034e4e86c0a67bfbfe5a34ca955c29d09a'
OWNER_CLOSE_SQL='HFT-R1-BOOTSTRAP-019-OWNER-CLOSE-NONEXECUTABLE.sql'; OWNER_CLOSE_SHA='d21c9794d4fffce91fb2eef0abc39300afbc9e0acc1a33ce46c47cb72c6be9f8'
DBA_CLOSE_SQL='HFT-R1-BOOTSTRAP-019-DBA-CLOSE-NONEXECUTABLE.sql'; DBA_CLOSE_SHA='0ed8e0d359da041629d42a706b5c454b76bc270a954ecff1daa516b8b0627fce'
MIGS=((1,'0001_hft_masters.sql','8e7253652591c5ce7ef3935d0dc8893e4f503479fa59e7748583ec9ec2215723'),(2,'0002_hft_ledger.sql','6e1981c6314b604f470c4a5d9e7c255891fc7e3f693e5cde7780ea77ff12da36'),(3,'0003_hft_workflows.sql','bf8a4987d1f3c82f3016a1d340edb79a6d238229e23f28dbc65cc75c0a181cf8'),(4,'0004_hft_posting_authority.sql','27375f432d476e8e88f8402af1970422d62de898a1fbcc91a9ec30efce79d7e2'),(5,'0005_hft_quantitative_accounts_receipts.sql','01fe977d55540b31cf6a0691e88969ecb01c63e6e25d30c75e5c06a61b70aedf'),(6,'0006_hft_posted_fact_integrity.sql','664c7fcb57bbc699cc8cd727046e8a1048ecb89792d27abe1dd3aef024754044'))
WRAP=re.compile(r'\A(?:\s*--[^\n]*\n)*\s*BEGIN;\s*(.*?)\s*COMMIT;\s*\Z',re.S); HEX64=re.compile(r'^[0-9a-f]{64}$'); HUMAN=re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:@/+ -]{1,255}$')
class Stop(RuntimeError): pass
def sha(b): return hashlib.sha256(b).hexdigest()
def utc(s):
 try:
  x=dt.datetime.fromisoformat(s.replace('Z','+00:00'))
  if x.tzinfo is None: raise ValueError
  return x.astimezone(dt.timezone.utc)
 except Exception: raise Stop('INVALID_UTC') from None
def now(): return dt.datetime.now(dt.timezone.utc)

def pin(path,label):
 v=path.read_text().strip() if path.is_file() and not path.is_symlink() else ''
 if not HEX64.fullmatch(v): raise Stop(label+'_HOLD')
 return v
def clean_worktree():
 p=subprocess.run(['git','-C',str(ROOT),'status','--porcelain','--untracked-files=no'],text=True,capture_output=True)
 if p.returncode or p.stdout.strip(): raise Stop('TRACKED_WORKTREE_NOT_CLEAN')

def manifest():
 raw=MANIFEST.read_bytes()
 if MANIFEST.is_symlink() or sha(raw)!=MANIFEST_SHA: raise Stop('MANIFEST_SHA256_DRIFT')
 d=json.loads(raw)
 if set(d)!={'schema','mode','minimum_postgresql_major','executable_directory','migrations','incompatible_provenance'} or d['schema']!='HFT_R1_CANONICAL_MIGRATION_MANIFEST_V1' or d['mode']!='ISOLATED_NONPRODUCTION' or d['minimum_postgresql_major']!=15 or d['executable_directory']!='db/migrations': raise Stop('MANIFEST_FORMAT')
 if len(d.get('migrations') or [])!=6: raise Stop('MANIFEST_COUNT')
 out=[]
 for exp,item in zip(MIGS,d['migrations']):
  v,n,h=exp
  if item!={'version':v,'file':n,'sha256':h}: raise Stop(f'MANIFEST_ENTRY:{v}')
  p=SQL_DIR/n
  if p.is_symlink() or not p.is_file() or sha(p.read_bytes())!=h: raise Stop(f'MIGRATION_HASH:{v}')
  m=WRAP.fullmatch(p.read_text())
  if not m: raise Stop(f'MIGRATION_WRAPPER:{v}')
  out.append((v,p,h,m.group(1)))
 expected={n for _,n,_ in MIGS}
 for p in SQL_DIR.rglob('*'):
  if p.is_symlink() and p.suffix.lower()=='.sql': raise Stop('MIGRATION_SQL_SYMLINK')
  if p.is_file() and p.suffix.lower()=='.sql' and str(p.relative_to(SQL_DIR)) not in expected: raise Stop('UNEXPECTED_MIGRATION_SQL')
 rejected=ROOT/'db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql'; rh='8e38ed17ecd4d2fdc7c3184d2f0ea2100feca67e30fa146b8965cb0c2c4ebc5e'
 if rejected.is_symlink() or not rejected.is_file() or sha(rejected.read_bytes())!=rh: raise Stop('INCOMPATIBLE_PROVENANCE_CHANGED')
 if d['incompatible_provenance']!=[{'version':5,'file':'db/provenance/rejected-0005-hft-quantitative-accounts-receipts.sql','sha256':rh,'execution':'PROHIBITED','applied_database_policy':'STOP_REQUIRES_SEPARATE_AUTHORIZED_FORWARD_MIGRATION'}]: raise Stop('MANIFEST_PROVENANCE_CHANGED')
 cand=ROOT/'db/migration_candidates'
 if cand.exists() and any(p.is_file() and p.suffix.lower()=='.sql' for p in cand.rglob('*')): raise Stop('PARALLEL_MIGRATION_SQL_DENIED')
 return out

def reviewed_sql(name,digest):
 p=ROOT/'db/security'/name; b=p.read_bytes() if p.is_file() and not p.is_symlink() else b''
 if sha(b)!=digest or not b.startswith(b'-- HFT-R1-BOOTSTRAP-019 SOURCE REVIEW ONLY'): raise Stop('REVIEW_SQL_SOURCE_DRIFT')
 return b.decode()
def security_sql(): return reviewed_sql(ROLE_SQL,ROLE_SHA)
def creator_sql(): return reviewed_sql(CREATOR_SQL,CREATOR_SHA)
def owner_close_sql(): return reviewed_sql(OWNER_CLOSE_SQL,OWNER_CLOSE_SHA)
def dba_close_sql(): return reviewed_sql(DBA_CLOSE_SQL,DBA_CLOSE_SHA)

class DenyRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*_): raise Stop('CONTROL_PLANE_REDIRECT_DENIED')
def _get(path,token):
 if not path.startswith('/api/v2/projects/'+PROJECT): raise Stop('CONTROL_PLANE_PATH')
 req=urllib.request.Request('https://console.neon.tech'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/json'},method='GET')
 try:
  op=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context()),DenyRedirect())
  with op.open(req,timeout=8) as r:
   if r.status!=200 or 'application/json' not in r.headers.get('Content-Type',''): raise Stop('CONTROL_PLANE_HTTP')
   b=r.read(262145)
   if len(b)>262144: raise Stop('CONTROL_PLANE_SIZE')
   x=json.loads(b)
   if not isinstance(x,dict): raise Stop('CONTROL_PLANE_BODY')
   return x
 except Stop: raise
 except Exception: raise Stop('CONTROL_PLANE_NETWORK') from None

def control_plane_live(env=None,getter=None):
 env=os.environ if env is None else env; token=env.get('HFT_NEON_CONTROL_PLANE_API_TOKEN','')
 if not 20<=len(token)<=4096: raise Stop('CONTROL_PLANE_TOKEN_NOT_PROVISIONED')
 get=(lambda p:getter(p,token)) if getter else (lambda p:_get(p,token))
 root='/api/v2/projects/'+PROJECT
 project=get(root).get('project'); branches=get(root+'/branches').get('branches'); endpoints=get(root+'/endpoints').get('endpoints')
 dbs=get(root+'/branches/'+BRANCH+'/databases').get('databases')
 if not isinstance(project,dict) or not all(isinstance(x,list) for x in (branches,endpoints,dbs)): raise Stop('CONTROL_PLANE_INCOMPLETE')
 target=[x for x in branches if x.get('id')==BRANCH]; prod=[x for x in branches if x.get('name')=='production']
 ep=[x for x in endpoints if x.get('id')==ENDPOINT]; database=[x for x in dbs if x.get('name')==DB]
 if project.get('id')!=PROJECT or len(target)!=1 or target[0].get('name')!=BRANCH_NAME or target[0].get('default') is not False or target[0].get('primary') is not False: raise Stop('CONTROL_PLANE_TARGET')
 if len(prod)!=1 or prod[0].get('id')==BRANCH or prod[0].get('default') is not True or prod[0].get('primary') is not True: raise Stop('PRODUCTION_BRANCH_EXCLUSION')
 if len(ep)!=1 or ep[0].get('host')!=HOST or ep[0].get('branch_id')!=BRANCH or ep[0].get('type')!='read_write' or ep[0].get('region_id')!='aws-ap-southeast-1': raise Stop('CONTROL_PLANE_ENDPOINT')
 if len(database)!=1 or database[0].get('owner_name')!=OWNER: raise Stop('CONTROL_PLANE_DATABASE')
 return {'captured_at_utc':now().isoformat().replace('+00:00','Z'),'project':project,'branch':target[0],'production_branch':prod[0],'endpoint':ep[0],'database':database[0],'preservation_branch':None}

def auth_artifact(path,phase,recovery_path):
 expected=pin(REVIEW_PIN,'INDEPENDENT_REVIEW') ; review_path=os.environ.get('HFT_BOOTSTRAP019_REVIEW_EVIDENCE','')
 if not review_path or sha(Path(review_path).read_bytes())!=expected: raise Stop('INDEPENDENT_REVIEW_EVIDENCE')
 apin=pin(EXEC_PIN,'EXECUTION_AUTHORIZATION'); raw=path.read_bytes()
 if sha(raw)!=apin: raise Stop('EXECUTION_AUTHORIZATION_HASH')
 a=json.loads(raw); required={'schema','authorization_id','project_id','branch_id','database','approved_phases','not_before_utc','expires_at_utc','decision_maker','operator','evidence_custodian','independent_verifier','recovery_evidence_sha256','runner_sha256','role_sql_sha256','creator_sql_sha256','owner_close_sql_sha256','dba_close_sql_sha256','manifest_sha256','production_branch_excluded','scope'}
 if set(a)!=required or a['schema']!='HFT_R1_MASTER_V3_BOOTSTRAP019_EXEC_AUTH_V1' or a['project_id']!=PROJECT or a['branch_id']!=BRANCH or a['database']!=DB or a['production_branch_excluded'] is not True or a['scope']!='CANONICAL_0001_0006_STAGING_ONLY' or phase not in a['approved_phases']: raise Stop('EXECUTION_AUTHORIZATION_SCOPE')
 t=now(); nb=utc(a['not_before_utc']); ex=utc(a['expires_at_utc'])
 if not nb<=t<=ex or ex-nb>dt.timedelta(hours=12): raise Stop('EXECUTION_AUTHORIZATION_WINDOW')
 vals=[a[k].strip() for k in ('decision_maker','operator','evidence_custodian','independent_verifier')]
 if any(not HUMAN.fullmatch(v) or v.upper() in {'TBD','UNKNOWN','AI','CHATGPT','MAVERICK'} for v in vals) or vals[1]==vals[3]: raise Stop('HUMAN_AUTHORIZATION')
 if sha(Path(__file__).read_bytes())!=a['runner_sha256'] or a['role_sql_sha256']!=ROLE_SHA or a['creator_sql_sha256']!=CREATOR_SHA or a['owner_close_sql_sha256']!=OWNER_CLOSE_SHA or a['dba_close_sql_sha256']!=DBA_CLOSE_SHA or a['manifest_sha256']!=MANIFEST_SHA: raise Stop('AUTHORIZED_PACKAGE_HASH')
 if sha(recovery_path.read_bytes())!=a['recovery_evidence_sha256']: raise Stop('RECOVERY_NOT_BOUND_TO_AUTHORIZATION')
 return a

def recovery_evidence(path,a,live,detail_path):
 # The old child-branch manual-snapshot contract is prohibited.
 # Detail path now holds a canonical manifest of independently preserved files.
 r=json.loads(path.read_bytes())
 if r.get('schema')!='HFT_R1_NEON_PRECHANGE_RECOVERY_V2':
  raise Stop('RECOVERY_V1_CHILD_SNAPSHOT_PROHIBITED')
 if not detail_path or not detail_path.is_file() or detail_path.is_symlink():
  raise Stop('RECOVERY_V2_EVIDENCE_FILE_MAP_REQUIRED')
 files=json.loads(detail_path.read_text())
 provider=live.get('preservation_branch')
 if not isinstance(provider,dict): raise Stop('RECOVERY_V2_PRESERVATION_NOT_ATTESTED')
 try: result=validate_v2(r,provider,files)
 except (ValueError,KeyError,TypeError) as ex:
  raise Stop('RECOVERY_V2_INVALID') from None
 if a.get('recovery_evidence_sha256')!=sha(path.read_bytes()):
  raise Stop('RECOVERY_V2_AUTHORIZATION_HASH_MISMATCH')
 return result

def env_for(user):
 e=dict(os.environ)
 for k,v in {'PGHOST':HOST,'PGDATABASE':DB,'PGUSER':user,'PGSSLMODE':'verify-full'}.items():
  if e.get(k)!=v: raise Stop('ENV:'+k)
 if e.get('PGPORT','5432')!='5432': raise Stop('ENV:PGPORT')
 for k in ('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGTARGETSESSIONATTRS'):
  if e.get(k): raise Stop('AMBIENT:'+k)
 if not shutil.which('psql'): raise Stop('PSQL_MISSING')
 return e
def psql(sql,e):
 p=subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-A','-t','-q'],input=sql,text=True,capture_output=True,env=e)
 if p.returncode: raise Stop('PSQL_EXIT:'+str(p.returncode))
 return p.stdout.strip()
def sql_attest(e,user):
 x=psql("SELECT current_database()||'|'||current_user||'|'||current_setting('server_version_num');",e).split('|')
 if x!=[DB,user,PGNUM]: raise Stop('SQL_IDENTITY')
 return '|'.join(x)
def empty(e):
 if psql("SELECT (to_regnamespace('hft') IS NULL)::text||'|'||(to_regclass('hft.schema_revision') IS NULL)::text||'|'||(SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S'));",e)!='true|true|0': raise Stop('UNEXPECTED_PREEXISTING_OBJECTS')
def expect_denied(sql,e,label):
 p=subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-A','-t','-q'],input="\\set VERBOSITY sqlstate\nBEGIN;\n"+sql+"\nROLLBACK;\n",text=True,capture_output=True,env=e)
 if p.returncode==0: raise Stop(label+'_UNEXPECTEDLY_ALLOWED')
 if '42501' not in p.stderr: raise Stop(label+'_WRONG_FAILURE')
def ledger(e):
 got=psql("SELECT version::text||'|'||sha256 FROM hft.schema_revision ORDER BY version;",e).splitlines()
 if got!=[f'{v}|{h}' for v,_,h in MIGS]: raise Stop('REVISION_LEDGER')

def statement(v,h,body):
 if v==1: guard="DO $g$ BEGIN IF to_regnamespace('hft') IS NOT NULL OR to_regclass('hft.schema_revision') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')) THEN RAISE EXCEPTION 'MIGRATION_0001_UNEXPECTED_STATE'; END IF; END $g$;\n"
 else:
  prior=MIGS[v-2][2]; guard=f"DO $g$ BEGIN IF NOT EXISTS(SELECT 1 FROM hft.schema_revision WHERE version={v-1} AND sha256='{prior}') OR EXISTS(SELECT 1 FROM hft.schema_revision WHERE version={v}) THEN RAISE EXCEPTION 'MIGRATION_{v:04d}_REVISION_STATE'; END IF; END $g$;\n"
 return guard+body+f"\nINSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES({v},'{h}',current_user);\n"
def batch_sql(plan):
 if [(v,p.name,h) for v,p,h,_ in plan]!=list(MIGS): raise Stop('CANONICAL_BATCH_PLAN')
 pre=f"DO $p$ BEGIN IF current_database()<>'{DB}' OR current_user<>'{MIG}' OR session_user<>current_user OR current_setting('server_version_num')::int<>{PGNUM} OR pg_has_role(current_user,'neon_superuser','MEMBER') OR NOT has_database_privilege(current_user,current_database(),'CREATE') OR has_database_privilege(current_user,current_database(),'TEMP') THEN RAISE EXCEPTION 'MIGRATION_IDENTITY'; END IF; END $p$;\n"
 lock=f"DO $l$ BEGIN IF NOT pg_try_advisory_xact_lock(hashtextextended('{LOCK}',0)) THEN RAISE EXCEPTION 'MIGRATION_CONCURRENT_RUNNER_DENIED'; END IF; END $l$;\n"
 ack='HFT_CANONICAL_BATCH_COMMIT_ACK|0001-0006|'+MIGS[-1][2]
 return 'BEGIN;\n'+lock+pre+''.join(statement(v,h,b) for v,_,h,b in plan)+"COMMIT;\nSELECT '"+ack+"';\n"

def final_catalog_sql():
 return f"""WITH pex AS(SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))a WHERE n.nspname='hft' AND a.grantee=0 AND a.privilege_type='EXECUTE'), badattrs AS(SELECT count(*) n FROM pg_roles r WHERE r.rolname IN ('hft_staging_migration_owner','hft_r1_app_runtime','hft_staging_app_runtime','hft_r1_audit_verify','hft_staging_audit_verify') AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)), badmembers AS(SELECT count(*) n FROM pg_auth_members m JOIN pg_roles x ON x.oid=m.member JOIN pg_roles y ON y.oid=m.roleid WHERE x.rolname IN ('hft_staging_migration_owner','hft_staging_app_runtime','hft_staging_audit_verify') AND NOT ((x.rolname='hft_staging_app_runtime' AND y.rolname='hft_r1_app_runtime' AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option) OR (x.rolname='hft_staging_audit_verify' AND y.rolname='hft_r1_audit_verify' AND NOT m.admin_option AND m.inherit_option AND NOT m.set_option))) SELECT (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='hft')||'|'||has_database_privilege('{MIG}','{DB}','CREATE')::text||'|'||has_database_privilege('{RLOGIN}','{DB}','CREATE')::text||'|'||has_schema_privilege('{RLOGIN}','hft','USAGE')::text||'|'||has_schema_privilege('{ALOGIN}','hft','USAGE')::text||'|'||has_table_privilege('{ALOGIN}','hft.schema_revision','SELECT')::text||'|'||(SELECT n FROM pex)||'|'||(SELECT n FROM badattrs)||'|'||(SELECT n FROM badmembers)||'|'||(SELECT count(*) FROM pg_auth_members m JOIN pg_roles x ON x.oid=m.member JOIN pg_roles y ON y.oid=m.roleid WHERE x.rolname IN ('{MIG}','{RLOGIN}','{ALOGIN}') AND y.rolname='neon_superuser');"""
def journal(path,event,**kw):
 path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('a',encoding='utf-8') as f:f.write(json.dumps({'ts_utc':now().isoformat().replace('+00:00','Z'),'event':event,**kw},sort_keys=True,separators=(',',':'))+'\n')

MUTATING={'prepare-security','prepare-migration-owner','migrate','finalize-owner','finalize-dba'}
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('phase',choices=['verify-manifest','preflight-control','preflight-owner','prepare-security','prepare-migration-owner','migrate','finalize-owner','finalize-dba','verify-final-dba','verify-runtime-negative','verify-audit'])
 ap.add_argument('--authorization-artifact',type=Path); ap.add_argument('--recovery-evidence',type=Path); ap.add_argument('--snapshot-detail-readback',type=Path); ap.add_argument('--journal',type=Path); a=ap.parse_args(); plan=manifest()
 if a.phase=='verify-manifest':
  for v,p,h,_ in plan: print(f'MIGRATION_{v:04d}=CANONICAL_VALIDATED file={p.name} sha256={h}')
  print('MANIFEST_ONLY_VALIDATED_NO_DATABASE_EXECUTION'); return 0
 clean_worktree(); live=control_plane_live()
 if a.phase=='preflight-control': print('CONTROL_PLANE_LIVE=PASS captured_at_utc='+live['captured_at_utc']); return 0
 if not a.journal: raise Stop('JOURNAL_REQUIRED')
 if a.phase in MUTATING:
  if not a.authorization_artifact or not a.recovery_evidence: raise Stop('AUTHORIZATION_AND_RECOVERY_REQUIRED')
  auth=auth_artifact(a.authorization_artifact,a.phase,a.recovery_evidence)
  recovery_document=json.loads(a.recovery_evidence.read_bytes())
  preservation_id=recovery_document.get('preservation',{}).get('branch_id','')
  if not isinstance(preservation_id,str) or not re.fullmatch(r'br-[a-z0-9-]{8,80}',preservation_id):
   raise Stop('RECOVERY_V2_PRESERVATION_ID_REQUIRED')
  token=os.environ.get('HFT_NEON_CONTROL_PLANE_API_TOKEN','')
  detail=_get('/api/v2/projects/'+PROJECT+'/branches/'+preservation_id,token)
  b=detail.get('branch')
  if not isinstance(b,dict): raise Stop('RECOVERY_V2_PROVIDER_BRANCH_NOT_FOUND')
  live['preservation_branch']={'id':b.get('id'),'name':b.get('name'),
    'parent_id':b.get('parent_id'),'parent_lsn':b.get('parent_lsn'),
    'parent_timestamp':b.get('parent_timestamp'),'created_at':b.get('created_at'),
    'is_default':b.get('default'),'is_primary':b.get('primary'),
    'endpoints':b.get('endpoints',[]),'retention':b.get('retention')}
  rec=recovery_evidence(a.recovery_evidence,auth,live,a.snapshot_detail_readback)
  journal(a.journal,'authorization_and_recovery_verified',phase=a.phase,authorization_id=auth['authorization_id'],operator=auth['operator'],custodian=auth['evidence_custodian'],independent_verifier=auth['independent_verifier'],recovery_v2_sha256=rec['recovery_hash'],control_plane_sha256=sha(json.dumps(live,sort_keys=True,default=str).encode()))
 user=OWNER if a.phase in {'preflight-owner','prepare-security','finalize-dba','verify-final-dba'} else (RLOGIN if a.phase=='verify-runtime-negative' else (ALOGIN if a.phase=='verify-audit' else MIG))
 e=env_for(user); ident=sql_attest(e,user); journal(a.journal,'sql_identity_verified',phase=a.phase,user=user,identity=ident)
 if a.phase=='preflight-owner': empty(e); print('OWNER_PREFLIGHT=PASS'); return 0
 if a.phase=='prepare-security': empty(e); out=psql(security_sql(),e); assert 'HFT_SECURITY_BOOTSTRAP_ACK' in out; print('SECURITY_BOOTSTRAP=COMMITTED;ATTENDED_PASSWORD_SETTING_REQUIRED'); return 0
 if a.phase=='prepare-migration-owner': empty(e); out=psql(creator_sql(),e); assert 'HFT_MIGRATION_OWNER_PREPARED_ACK' in out; print('MIGRATION_OWNER_PREPARED=TRUE'); return 0
 if a.phase=='migrate':
  empty(e); sql=batch_sql(plan); journal(a.journal,'canonical_batch_started',statement_sha256=sha(sql.encode()))
  try: out=psql(sql,e)
  except Stop: journal(a.journal,'canonical_batch_outcome_uncertain'); print('HFT_NEON_CANONICAL_BATCH_OUTCOME_UNCERTAIN;DO_NOT_RETRY',file=sys.stderr); return 2
  ack='HFT_CANONICAL_BATCH_COMMIT_ACK|0001-0006|'+MIGS[-1][2]
  if ack not in out: journal(a.journal,'canonical_batch_ack_missing'); return 2
  ledger(e); print('CANONICAL_MIGRATIONS_0001_0006=BATCH_COMMITTED_READBACK_PASS'); return 0
 if a.phase=='finalize-owner': ledger(e); out=psql(owner_close_sql(),e); assert 'HFT_OWNER_CLOSE_ACK' in out; print('OWNER_OBJECT_ACL_CLOSE=PASS'); return 0
 if a.phase=='finalize-dba': ledger(e); out=psql(dba_close_sql(),e); assert 'HFT_DBA_CLOSE_ACK' in out; print('DBA_DATABASE_CREATE_CLOSE=PASS'); return 0
 if a.phase=='verify-final-dba':
  ledger(e); got=psql(final_catalog_sql(),e); exp=f'{MIG}|false|false|false|true|true|0|0|0|0'
  if got!=exp: raise Stop('FINAL_CATALOG:'+got)
  print('FINAL_CATALOG_SECURITY=PASS'); return 0
 if a.phase=='verify-runtime-negative':
  expect_denied("CREATE TABLE hft.__hft_denied_probe(id int);",e,'RUNTIME_DDL')
  expect_denied("INSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES(999999,repeat('0',64),current_user);",e,'RUNTIME_DML')
  expect_denied("SELECT hft.format_signed_micro_v2(1);",e,'RUNTIME_FUNCTION_EXECUTE')
  expect_denied(f"SET ROLE {MIG};",e,'RUNTIME_ROLE_SWITCH')
  print('RUNTIME_NEGATIVE_ENFORCEMENT=PASS'); return 0
 if a.phase=='verify-audit':
  if psql("SELECT count(*)::text FROM hft.schema_revision;",e)!='6': raise Stop('AUDIT_READ')
  expect_denied("INSERT INTO hft.schema_revision(version,sha256,applied_by) VALUES(999999,repeat('0',64),current_user);",e,'AUDIT_DML')
  expect_denied(f"SET ROLE {MIG};",e,'AUDIT_ROLE_SWITCH')
  print('AUDIT_ENFORCEMENT=PASS'); return 0
if __name__=='__main__':
 try: raise SystemExit(main())
 except (Stop,AssertionError) as x: print('HFT_NEON_BOOTSTRAP_STOP='+str(x),file=sys.stderr); raise SystemExit(1)
