/** Path B retained Draft API — never invokes P3, P0 or stock posting. */
import {resolveVerifiedRequestOperator} from '../../../../lib/hft/security/verified-request.ts';
import {assertDraftProfile} from '../../../../lib/hft/draft/draft-profile.ts';
import {DRAFT_CONTRACT,validateDraftRequest,validateDraftSave,isDraftKind,
 type DraftSave,type DraftScope}
 from '../../../../lib/hft/draft/draft-contract.ts';
import {openDraftPool,readDrafts,saveDraft}
 from '../../../../lib/hft/draft/draft-service.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0',
 'Content-Type':'application/json; charset=utf-8'};
function response(status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers});
}
function codeOf(e:unknown):string{
 const value=e&&typeof e==='object'&&'code' in e?
  String((e as {code:unknown}).code):'';
 const message=e instanceof Error?e.message:'';
 if(value==='23505'||/DUPLICATE|ALREADY_EXISTS/.test(message))
  return 'DRAFT077_DUPLICATE';
 if(value==='40001'||value==='40P01'||/REVISION|CONFLICT|STALE/.test(message))
  return 'DRAFT077_REVISION_CONFLICT';
 if(message.includes('COMMIT_OUTCOME_UNCERTAIN')||
  message.includes('READBACK_REQUIRED_NO_RETRY'))
  return 'DRAFT077_RECONCILIATION_REQUIRED_NO_RETRY';
 if(message.startsWith('DRAFT077_'))return message.slice(0,100);
 return 'DRAFT077_DATABASE_OPERATION_UNAVAILABLE';
}
async function batch(raw:Record<string,unknown>,pool:ReturnType<typeof openDraftPool>,
 operator:ReturnType<typeof resolveVerifiedRequestOperator>){
 const keys=['contractVersion','intent','kind','legalEntityId','siteId',
  'warehouseId','rows'];
 if(Object.keys(raw).length!==keys.length||
  keys.some(k=>!Object.hasOwn(raw,k))||
  raw.contractVersion!==DRAFT_CONTRACT||raw.intent!=='BATCH'||
  !isDraftKind(raw.kind)||!Array.isArray(raw.rows)||raw.rows.length<1||
  raw.rows.length>20)
  return response(422,{state:'REJECTED',code:'DRAFT077_BATCH_CONTRACT_INVALID'});
 const scope:DraftScope={
  legalEntityId:String(raw.legalEntityId),
  siteId:String(raw.siteId),warehouseId:String(raw.warehouseId)};
 const results:{row:number;recordId:string;state:string;code?:string;revision?:number}[]=[];
 const seen=new Set<string>();
 for(let i=0;i<raw.rows.length;i++){
  const entry=raw.rows[i];
  const item=entry&&typeof entry==='object'&&!Array.isArray(entry)?
   entry as Record<string,unknown>:{};
  const row=Number.isSafeInteger(item.sourceRow)&&
   Number(item.sourceRow)>=2&&Number(item.sourceRow)<=10000?
   Number(item.sourceRow):i+2;
  let cmd:DraftSave;
  try{
   if(Object.keys(item).length!==2||
    !Object.hasOwn(item,'sourceRow')||!Object.hasOwn(item,'change')||
    !Number.isSafeInteger(item.sourceRow))
    throw Error('DRAFT077_BATCH_ROW_WRAPPER_INVALID');
   cmd=validateDraftSave(item.change);
   if(cmd.kind!==raw.kind||
    cmd.legalEntityId!==scope.legalEntityId||
    cmd.siteId!==scope.siteId||cmd.warehouseId!==scope.warehouseId||
    seen.has(cmd.recordId))
    throw Error('DRAFT077_BATCH_SCOPE_OR_DUPLICATE');
   seen.add(cmd.recordId);
  }catch(e){
   const possible=item.change;
   const recordId=possible&&typeof possible==='object'&&
      'recordId' in possible?String(possible.recordId).slice(0,64):'';
   results.push({row,recordId,state:'INVALID',code:codeOf(e)});
   continue;
  }
  try{
   const saved=await saveDraft(pool,process.env,operator,cmd);
   results.push({row,recordId:saved.record_id,state:'SAVED_DRAFT',
    revision:saved.revision});
  }catch(e){
   const code=codeOf(e);
   results.push({row,recordId:cmd.recordId,state:'REJECTED',code});
   if(code==='DRAFT077_RECONCILIATION_REQUIRED_NO_RETRY'||
    code==='DRAFT077_DATABASE_OPERATION_UNAVAILABLE'||
    code==='DRAFT077_DATABASE_IDENTITY_OR_PRIVILEGES_NOT_ADMITTED'){
    return response(409,{state:'PARTIAL_STOP_NO_RETRY',results,
     confirmed:results.filter(r=>r.state==='SAVED_DRAFT').length});
   }
  }
 }
 return response(200,{state:'DRAFT_BATCH_RESULT',results,
  confirmed:results.filter(r=>r.state==='SAVED_DRAFT').length});
}
export async function POST(request:Request):Promise<Response>{
 try{assertDraftProfile(process.env);}
 catch{return response(503,{state:'UNAVAILABLE',code:'DRAFT077_RUNTIME_NOT_ADMITTED'});}
 let operator:ReturnType<typeof resolveVerifiedRequestOperator>;
 try{operator=resolveVerifiedRequestOperator(request,process.env,'DRAFT_MASTERS');}
 catch{return response(401,{state:'UNAUTHORIZED',code:'DRAFT077_SIGNED_SESSION_REQUIRED'});}
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return response(415,{state:'REJECTED',code:'DRAFT077_JSON_REQUIRED'});
 let raw:unknown;
 try{
  const text=await request.text();
  if(text.length>100000)throw Error('DRAFT077_REQUEST_TOO_LARGE');
  raw=JSON.parse(text);
 }catch{return response(422,{state:'REJECTED',code:'DRAFT077_JSON_INVALID'});}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  return response(422,{state:'REJECTED',code:'DRAFT077_REQUEST_OBJECT_REQUIRED'});
 const pool=openDraftPool(process.env);
 try{
  const input=raw as Record<string,unknown>;
  if(input.intent==='BATCH')return await batch(input,pool,operator);
  const cmd=validateDraftRequest(input);
  if(cmd.intent==='READ'){
   const records=await readDrafts(pool,process.env,operator,cmd);
   return response(200,{state:'DRAFT_ONLY',records});
  }
  const record=await saveDraft(pool,process.env,operator,cmd);
  return response(200,{state:'SAVED_DRAFT_NOT_APPROVED',record});
 }catch(e){
  const code=codeOf(e);
  return response(code==='DRAFT077_DUPLICATE'||code==='DRAFT077_REVISION_CONFLICT'||
   code==='DRAFT077_RECONCILIATION_REQUIRED_NO_RETRY'?409:
   code.includes('PROFILE')||code.includes('DATABASE')?503:422,
   {state:'NOT_SAVED_OR_RECONCILIATION_REQUIRED',code});
 }finally{await pool.end();}
}
export async function GET():Promise<Response>{
 return response(405,{state:'REJECTED',code:'DRAFT077_POST_ONLY'});
}
