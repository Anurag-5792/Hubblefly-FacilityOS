/** Offline only: deterministic retained P3 installation REVIEW candidate.
 * Does NOT execute SQL, remove protected checks, approve grants or admit a DB.
 * Emits a STOP-GUARDED derived artifact only to a new private local file.
 */
import {readFileSync,writeFileSync,existsSync,lstatSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const PIN='33eac12f493ca70463ffe50cfec62377e904d9a84d51e1c6eedb6797f34bb4c1';
const source=new URL('../db/security/HFT-R1-P3-MASTERS-REVIEW.sql',import.meta.url);
const sha=s=>createHash('sha256').update(s).digest('hex');
function one(text,part,name){
 if(text.split(part).length!==2)throw Error('P3_RETAINED_SOURCE_'+name+'_DRIFT');
}
export function retainedP3ReviewCandidate(){
 const original=readFileSync(source,'utf8');
 if(sha(original)!==PIN)throw Error('P3_RETAINED_FROZEN_REVIEW_HASH_DRIFT');
 const prior="'^hft_r1_disposable_[a-z0-9_]{6,40}$'";
 const next="'^hft_r1_retained_[a-z0-9_]{6,40}$'";
 one(original,prior,'DATABASE_GUARD');
 one(original,'BEGIN;\nDO $preflight$','TRANSACTION_PREFLIGHT');
 for(const name of ['p3_submit_master_change_v1','p3_decide_apply_employee_v1',
  'p3_read_masters_v1']){
  if(!original.includes('hft.'+name+'('))throw Error('P3_RETAINED_PROTECTED_FUNCTION_MISSING');
 }
 const stopped=original.replace('BEGIN;\nDO $preflight$',`BEGIN;
DO $HFT_P3_RETAINED_INSTALLATION_STOP$
BEGIN
 RAISE EXCEPTION 'HFT_P3_RETAINED_NONPRODUCTION_INSTALLATION_NOT_AUTHORIZED';
END $HFT_P3_RETAINED_INSTALLATION_STOP$;
DO $preflight$`);
 // A regex ends in 
 if(candidate.includes(prior)||!candidate.includes(next)||
   candidate.indexOf("HFT_P3_RETAINED_NONPRODUCTION_INSTALLATION_NOT_AUTHORIZED")>
    candidate.indexOf('CREATE TABLE'))
  throw Error('P3_RETAINED_CANDIDATE_NOT_STOP_GUARDED');
 return Object.freeze({sourceSha256:PIN,derivedSha256:sha(candidate),
  sql:candidate,executable:false,installed:false});
}
function main(args){
 const result=retainedP3ReviewCandidate();
 if(args.length===1&&args[0]==='--inspect'){
  process.stdout.write(JSON.stringify({contract:'HFT-P3-RETAINED-MASTERS-SOURCE-077',
    originalSha256:result.sourceSha256,derivedSha256:result.derivedSha256,
    derivedBytes:Buffer.byteLength(result.sql),stopGuarded:true,
    executable:false,installed:false,ownerApprovalRequired:true})+'\n');
  return;
 }
 if(args.length===2&&args[0]==='--emit-review'){
  const path=args[1];
  if(!isAbsolute(path)||!path.endsWith('.NONEXECUTABLE.sql')||existsSync(path)||
     !lstatSync(dirname(path)).isDirectory()||lstatSync(dirname(path)).isSymbolicLink())
   throw Error('P3_RETAINED_REVIEW_OUTPUT_MUST_BE_NEW_PRIVATE_SQL');
  writeFileSync(path,result.sql,{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({state:'STOP_GUARDED_REVIEW_ONLY',
    sha256:result.derivedSha256,output:path})+'\n');
  return;
 }
 throw Error('P3_RETAINED_SOURCE_ONLY_USAGE');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2));}
 catch(error){
  process.stderr.write(error instanceof Error?error.message:'P3_RETAINED_BUILDER_FAILED');
  process.exitCode=2;
 }
}
 and JS string replacement treats that as a special
 // suffix expansion. Use a callback to preserve the literal SQL regex bytes.
 const candidate=stopped.replace(prior,()=>next);
 if(candidate.includes(prior)||!candidate.includes(next)||
   candidate.indexOf("HFT_P3_RETAINED_NONPRODUCTION_INSTALLATION_NOT_AUTHORIZED")>
    candidate.indexOf('CREATE TABLE'))
  throw Error('P3_RETAINED_CANDIDATE_NOT_STOP_GUARDED');
 return Object.freeze({sourceSha256:PIN,derivedSha256:sha(candidate),
  sql:candidate,executable:false,installed:false});
}
function main(args){
 const result=retainedP3ReviewCandidate();
 if(args.length===1&&args[0]==='--inspect'){
  process.stdout.write(JSON.stringify({contract:'HFT-P3-RETAINED-MASTERS-SOURCE-077',
    originalSha256:result.sourceSha256,derivedSha256:result.derivedSha256,
    derivedBytes:Buffer.byteLength(result.sql),stopGuarded:true,
    executable:false,installed:false,ownerApprovalRequired:true})+'\n');
  return;
 }
 if(args.length===2&&args[0]==='--emit-review'){
  const path=args[1];
  if(!isAbsolute(path)||!path.endsWith('.NONEXECUTABLE.sql')||existsSync(path)||
     !lstatSync(dirname(path)).isDirectory()||lstatSync(dirname(path)).isSymbolicLink())
   throw Error('P3_RETAINED_REVIEW_OUTPUT_MUST_BE_NEW_PRIVATE_SQL');
  writeFileSync(path,result.sql,{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({state:'STOP_GUARDED_REVIEW_ONLY',
    sha256:result.derivedSha256,output:path})+'\n');
  return;
 }
 throw Error('P3_RETAINED_SOURCE_ONLY_USAGE');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2));}
 catch(error){
  process.stderr.write(error instanceof Error?error.message:'P3_RETAINED_BUILDER_FAILED');
  process.exitCode=2;
 }
}
