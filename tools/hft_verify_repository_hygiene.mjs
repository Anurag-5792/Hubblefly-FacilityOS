/**
 * Fail-closed hygiene gate for CURRENT tracked source only.
 * Does not scan Git history or replace independent security review.
 * Never prints matching secret contents, tokens or connection strings.
 */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

function stop(code,path=''){
 process.stderr.write('HFT_REPO_HYGIENE_FAIL='+code+(path?':'+path:'')+'\n');
 process.exitCode=1;
}
let files;
try{
 files=execFileSync('git',['ls-files','-z'],{encoding:'buffer',maxBuffer:4e6})
  .toString('utf8').split('\0').filter(Boolean);
}catch{stop('GIT_TRACKED_MANIFEST_UNAVAILABLE');process.exit(1)}
const forbiddenPath=/(?:^|\/)(?:node_modules|\.next|\.vercel|__pycache__|coverage|\.cache)(?:\/|$)|(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$)[^/]*)?|next-env\.d\.ts|tsconfig\.tsbuildinfo)$|\.(?:log|pyc|pyo|p12|pfx|pem|key|exe|dll|apk|zip|sqlite|db)$/i;
const secret=[
 ['PRIVATE_KEY',/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
 ['GITHUB_TOKEN',/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
 ['AWS_ACCESS_KEY',/\bAKIA[A-Z0-9]{16}\b/],
 ['NEON_CREDENTIAL_URI',/postgres(?:ql)?:\/\/[^\s:@/]{1,80}:[^\s@/]{5,}@[^/\s]+\.neon\.tech\b/i]
];
const stockDml=/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+hft\.(?:stock_account|stock_command|stock_entry|serial_registry|employee_custody)\b/i;
const historical='tests/legacy/hft-p1-post-stock-command.ts';
if(files.includes('lib/hft/persistence/post-stock-command.ts')||
 !files.includes(historical)||!files.includes('lib/hft/persistence/protected-stock-posting.ts'))
 stop('CONCURRENT_LEDGER_WRITER_NOT_ISOLATED');
const caseSeen=new Set();
for(const p of files){
 const lc=p.toLowerCase();
 if(caseSeen.has(lc))stop('CASE_COLLIDING_TRACKED_PATH',p);
 caseSeen.add(lc);
 if(forbiddenPath.test(p))stop('GENERATED_OR_SENSITIVE_FILE_TRACKED',p);
 let body;
 try{body=readFileSync(p,'utf8')}catch{stop('TRACKED_SOURCE_UNREADABLE',p);continue}
 for(const [code,pattern] of secret)if(pattern.test(body))stop(code,p);
 if(/^(app\/|lib\/|middleware\.ts$)/.test(p)&&/\.(?:ts|tsx|mjs|js)$/.test(p)){
  if(stockDml.test(body))stop('UNPROTECTED_RUNTIME_STOCK_DML',p);
  if(/(?:from|import)\s*\(?\s*['"][^'"]*tests\/legacy\//.test(body))
   stop('PRODUCTION_IMPORTS_LEGACY_TEST_WRITER',p);
 }
}
const manifest=JSON.parse(readFileSync('db/migrations/manifest.v1.json','utf8'));
if(manifest.migrations?.length!==6)stop('CANONICAL_MIGRATION_COUNT_CHANGED');
for(let i=1;i<=6;i++){
 const x=manifest.migrations?.[i-1];
 if(x?.version!==i||!files.includes('db/migrations/'+x.file)||
  createHash('sha256').update(readFileSync('db/migrations/'+x.file))
   .digest('hex')!==x.sha256)
  stop('PROTECTED_MIGRATION_IDENTITY_CHANGED');
}
const sql=files.filter(x=>x.startsWith('db/migrations/')&&x.endsWith('.sql'));
if(sql.length!==6)stop('UNREVIEWED_EXECUTABLE_MIGRATION_DETECTED');
if(process.exitCode)process.exit(process.exitCode);
process.stdout.write('HFT_REPO_HYGIENE=PASS;tracked='+files.length+
 ';protected_migrations=6;runtime_legacy_writer=absent;current_tree_secret_signatures=none\n');

