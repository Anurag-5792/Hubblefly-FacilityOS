/** Actual mounted Next/Chromium UI regression, using ONLY synthetic intercepted responses.
 * No real credentials, database, actor enrollment, or production access.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url))),PORT=31166,URL_ROOT='http://127.0.0.1:'+PORT;
let server,browser,ws,tmp,sequence=0;
const pending=new Map();
async function wait(check,label,limit=25000){
 const end=Date.now()+limit;
 while(Date.now()<end){try{if(await check())return;}catch{/* bounded polling */}await sleep(100);}
 throw Error('LIVE_MASTERS_BROWSER_TIMEOUT_'+label);
}
function chrome(){
 for(const binary of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  try{return execFileSync('which',[binary],{encoding:'utf8'}).trim();}catch{/* try next */}
 }
 throw Error('CHROMIUM_UNAVAILABLE');
}
function send(method,params={}){
 const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
}
async function run(expression){
 const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
 if(r.exceptionDetails)throw Error('BROWSER_JS:'+JSON.stringify(r.exceptionDetails));
 return r.result?.value;
}
const mock=`(()=>{
 const orig=window.fetch.bind(window),key='hft.live.fixture.records',login='hft.live.fixture.login';
 const read=()=>JSON.parse(sessionStorage.getItem(key)||'{}');
 const write=value=>sessionStorage.setItem(key,JSON.stringify(value));
 const base={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE'};
 const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
 const isPending=k=>String(k).startsWith('hft.liveMasters.pending.');
 const failure=()=>get.call(sessionStorage,'hft.live.fixture.storageFailure');
 window.__pendingReads=[];window.__contextReturned=false;window.__liveCalls=[];window.__unknownSave=false;
 Storage.prototype.getItem=function(k){
  if(this===sessionStorage&&isPending(k)){
   window.__pendingReads.push({key:k,verified:window.__contextReturned});
   if(failure()==='read')throw Error('SYNTHETIC_STORAGE_READ_FAILURE');
  }
  return get.call(this,k);
 };
 Storage.prototype.setItem=function(k,v){
  if(this===sessionStorage&&isPending(k)&&failure()==='write')throw Error('SYNTHETIC_STORAGE_WRITE_FAILURE');
  return set.call(this,k,v);
 };
 Storage.prototype.removeItem=function(k){
  if(this===sessionStorage&&isPending(k)&&failure()==='remove')throw Error('SYNTHETIC_STORAGE_REMOVE_FAILURE');
  return remove.call(this,k);
 };
 const ok=data=>new Response(JSON.stringify({state:'AUTHORITATIVE_RESULT',data}),{headers:{'Content-Type':'application/json'}});
 const deny=(status,code)=>new Response(JSON.stringify({state:'UNAVAILABLE',code}),{status,headers:{'Content-Type':'application/json'}});
 const idOf=p=>[p.scope.warehouseId,p.kind,p.recordId].join('|');
 window.fetch=async(input,options={})=>{
  const path=typeof input==='string'?input:new URL(input.url).pathname;
  if(path==='/api/hft/live-masters/signout'){
   sessionStorage.removeItem(login);
   return new Response(JSON.stringify({state:'SIGNED_OUT'}),{headers:{'Content-Type':'application/json'}});
  }
  if(path!=='/api/hft/live-masters')return orig(input,options);
  const p=JSON.parse(options.body);window.__liveCalls.push(p);
  const who=sessionStorage.getItem(login);
  if(!['yes','other','other-disjoint','invalid-partition'].includes(who))return deny(401,'LIVE_R1_CORPORATE_SESSION_REQUIRED');
  const isA=who==='yes',subject=isA?'FIXTURE-A':'FIXTURE-B',partition=(isA?'a':'b').repeat(64);
  const context={...base,warehouseIds:isA?['FIXTURE-WH1','FIXTURE-WH2']:who==='other-disjoint'?['FIXTURE-WH3']:['FIXTURE-WH2','FIXTURE-WH3']};
  if(p.intent==='SESSION_CONTEXT'){
   window.__contextReturned=true;
   return ok({state:'SIGNED_SESSION_CONTEXT',scope:context,actorPartition:who==='invalid-partition'?'bad':partition,expiresAt:Math.floor(Date.now()/1000)+600,qualification:true});
  }
  if(new Headers(options.headers).get('x-hft-live-actor-partition')!==partition)
   return deny(401,'LIVE_R1_ACTOR_CONTEXT_CHANGED');
  if(!p.scope||p.scope.legalEntityId!==context.legalEntityId||p.scope.siteId!==context.siteId||!context.warehouseIds.includes(p.scope.warehouseId))
   return deny(403,'LIVE_R1_SCOPE_OR_PERMISSION_DENIED');
  const rows=read(),keyId=idOf(p),current=rows[keyId];
  if(p.intent==='LIST')return ok(Object.values(rows).filter(x=>x.record.kind===p.kind&&x.record.scope.warehouseId===p.scope.warehouseId&&x.record.recordId.toLowerCase().includes(p.search.toLowerCase())).map(x=>x.record));
  if(p.intent==='GET')return ok(current?.record||null);
  if(p.intent==='HISTORY')return ok((current?.history||[]).map(event=>({...event,actorMatchesSession:event.actor_subject===subject})));
  if(p.intent==='SAVE'){
   if(!['CREATE','UPDATE'].includes(p.action)||p.expectedRevision!==(current?.record.revision||0))return deny(409,'LIVE_R1_REVISION_OR_REQUEST_CONFLICT');
   const record={kind:p.kind,scope:p.scope,recordId:p.recordId,revision:p.expectedRevision+1,deleted:false,values:p.values,state:'RECORDED_UNAPPROVED',
    createdBy:current?.record.createdBy||subject,updatedBy:subject,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   const event={revision:record.revision,action:p.action,actor_subject:subject,occurred_at:new Date().toISOString(),reason:p.reason,event_sha256:'a'.repeat(64),request_id:p.requestId};
   rows[keyId]={record,history:[event,...(current?.history||[])]};write(rows);
   if(window.__unknownSave){window.__unknownSave=false;return deny(409,'LIVE_R1_RECONCILE_ORIGINAL_REQUEST_NO_RETRY');}
   return ok({state:'SAVED_VERIFIED',record,requestId:p.requestId,historyRevision:record.revision,auditSha256:event.event_sha256,operationalApproval:false});
  }
  return deny(422,'LIVE_R1_CONTRACT_REJECTED');
 };
})();`;
async function click(text){
 await wait(()=>run('Boolean([...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(text)+'&&!x.disabled))'),'BUTTON_'+text);
 await run('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(text)+'&&!x.disabled);if(!b)throw Error("BUTTON_UNAVAILABLE");b.click();return true;})()');
}
async function field(label,value){
 await run('(()=>{const l=[...document.querySelectorAll("form label")].find(x=>x.textContent.trim()==='+JSON.stringify(label)+');const n=l?.querySelector("input,textarea,select");if(!n||n.disabled)throw Error("FIELD_UNAVAILABLE");Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n),"value").set.call(n,'+JSON.stringify(value)+');n.dispatchEvent(new Event("input",{bubbles:true}));n.dispatchEvent(new Event("change",{bubbles:true}));return n.value;})()');
 await sleep(80);
}
async function has(text){return run('document.body.innerText.includes('+JSON.stringify(text)+')');}
async function viewport(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
async function workflow(){
 await viewport(1440,900);
 await send('Page.navigate',{url:URL_ROOT+'/masters/live'});
 await wait(()=>has('Corporate Google sign-in'),'SIGNED_OUT');
 assert.equal(await run('document.querySelector("form")===null'),true);
 assert.equal(await run('window.__pendingReads.length'),0);
 await run('sessionStorage.setItem("hft.live.fixture.login","yes")');
 await send('Page.reload');
 await wait(()=>has('No employees recorded'),'EMPTY_DIRECTORY');
 assert.equal(await run('document.querySelector("input[aria-label=Company]").value'),'FIXTURE-HFT');
 assert.equal(await run('document.querySelector("input[aria-label=Company]").readOnly'),true);
 assert.equal(await run('document.querySelector("input[aria-label=Site]").readOnly'),true);
 await click('Add employee');await wait(()=>run('Boolean(document.querySelector("form"))'),'CREATE_FORM');
 await field('Employee ID','FIXTURE-EMP-01');await field('Full name','Synthetic Employee');
 await field('Department','QA');await field('Designation','Operator');await field('Reason for adding this record','Synthetic initial create');
 await click('Save record');await wait(()=>has('Record saved and verified'),'CREATE');
 await wait(()=>has('Synthetic Employee'),'DIRECTORY_READBACK');
 const create=await run('window.__liveCalls.find(p=>p.intent==="SAVE")');
 assert.equal(create.action,'CREATE');assert.equal(create.expectedRevision,0);assert.equal(create.scope.warehouseId,'FIXTURE-WH1');
 assert.equal(await run('document.body.innerText.includes("Prepare soft delete")'),false);
 await click('Sign out');await wait(()=>has('Corporate Google sign-in'),'SIGNOUT');
 assert.equal(await has('Synthetic Employee'),false);
 await run('sessionStorage.setItem("hft.live.fixture.login","yes")');await send('Page.reload');
 await wait(()=>has('Synthetic Employee'),'PERSISTED_REOPEN');
 await click('Open');await wait(()=>has('Edit employee'),'EDIT_FORM');
 await field('Designation','Supervisor');await field('Reason for updating this record','Synthetic change verification');
 await click('Save changes');await wait(()=>has('Record saved and verified'),'EDIT');
 await wait(()=>has('Supervisor'),'EDIT_READBACK');
 const update=await run('window.__liveCalls.find(p=>p.intent==="SAVE")');
 assert.equal(update.action,'UPDATE');assert.equal(update.expectedRevision,1);
 await wait(()=>has('Audit details · revision 2'),'AUDIT');
 await run('(()=>{const n=[...document.querySelectorAll("label")].find(x=>x.firstChild?.textContent==="Warehouse").querySelector("select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(n,"FIXTURE-WH2");n.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await wait(()=>has('No employees recorded'),'SCOPE_SWITCH');
 assert.equal(await has('Synthetic Employee'),false);
 assert.equal(await run('document.querySelector("form")===null'),true);
 await click('Add employee');await wait(()=>run('Boolean(document.querySelector("form"))'),'SECOND_CREATE_FORM');
 await field('Employee ID','FIXTURE-EMP-02');await field('Full name','Uncertain Fixture');
 await field('Department','QA');await field('Designation','Operator');await field('Reason for adding this record','Synthetic unknown commit response');
 await run('window.__unknownSave=true');await click('Save record');
 await wait(()=>has('Check original save before continuing'),'UNKNOWN_OUTCOME');
 const keyA='hft.liveMasters.pending.v2.'+'a'.repeat(64),keyB='hft.liveMasters.pending.v2.'+'b'.repeat(64);
 const stored=k=>run('sessionStorage.getItem('+JSON.stringify(k)+')');
 const before=await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length');
 assert.equal(before,2);
 const markerA=await stored(keyA);assert.ok(markerA);
 const requestA=JSON.parse(markerA).requestId;
 assert.equal(JSON.parse(markerA).actorPartition,'a'.repeat(64));
 assert.equal(await stored(keyB),null);
 // Sign-out must remove the pending state from the mounted screen, not storage.
 await click('Sign out');await wait(()=>has('Corporate Google sign-in'),'SIGNOUT_WITH_PENDING');
 assert.equal(await has(requestA),false);assert.equal(await stored(keyA),markerA);
 await send('Page.reload');await wait(()=>has('Corporate Google sign-in'),'SIGNED_OUT_WITH_MARKER');
 assert.equal(await run('window.__pendingReads.length'),0);
 // B has an overlapping scope. B cannot see, reconcile or clear A's marker.
 await run('sessionStorage.setItem("hft.live.fixture.login","other")');await send('Page.reload');
 await wait(()=>has('Uncertain Fixture'),'B_OVERLAP_LIST');
 assert.equal(await has(requestA),false);assert.equal(await has('Check original save before continuing'),false);
 assert.equal(await run('window.__pendingReads.every(x=>x.verified&&!x.key.endsWith("a".repeat(64)))'),true);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="HISTORY"||p.intent==="SAVE").length'),0);
 await click('Add employee');await wait(()=>run('Boolean(document.querySelector("form"))'),'B_CREATE');
 await field('Employee ID','FIXTURE-EMP-B');await field('Full name','Actor B Fixture');
 await field('Department','QA');await field('Designation','Operator');await field('Reason for adding this record','Synthetic second actor unknown save');
 await run('window.__unknownSave=true');await click('Save record');await wait(()=>has('Check original save before continuing'),'B_UNKNOWN');
 const markerB=await stored(keyB);assert.ok(markerB);assert.notEqual(JSON.parse(markerB).requestId,requestA);
 assert.equal(await stored(keyA),markerA);
 const beforeB=await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length');
 await click('Check change history');await wait(()=>has('original request is present'),'B_RECONCILES_OWN');
 assert.equal(await stored(keyB),null);assert.equal(await stored(keyA),markerA);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),beforeB);
 // A corrupted B-local copy of A's reference still cannot be reconciled as B.
 await run('sessionStorage.setItem('+JSON.stringify(keyB)+','+JSON.stringify(JSON.stringify({...JSON.parse(markerA),actorPartition:'b'.repeat(64)}))+')');
 await send('Page.reload');await wait(()=>has('Check original save before continuing'),'B_CORRUPTED_MARKER');
 await click('Check change history');await wait(()=>has('original request has not been confirmed'),'B_NOT_EVENT_OWNER');
 assert.ok(await stored(keyB));assert.equal(await stored(keyA),markerA);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 // Remove only the synthetic injected B marker, not A's actual unresolved save.
 await run('sessionStorage.removeItem('+JSON.stringify(keyB)+')');
 await click('Sign out');await wait(()=>has('Corporate Google sign-in'),'B_SIGNOUT');
 await run('sessionStorage.setItem("hft.live.fixture.login","other-disjoint")');await send('Page.reload');
 await wait(()=>has('No employees recorded'),'B_DISJOINT_LIST');
 assert.equal(await has(requestA),false);assert.equal(await has('Check original save before continuing'),false);
 assert.equal(await run('window.__pendingReads.every(x=>x.verified&&!x.key.endsWith("a".repeat(64)))'),true);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="HISTORY"||p.intent==="SAVE").length'),0);
 await click('Sign out');await wait(()=>has('Corporate Google sign-in'),'B_DISJOINT_SIGNOUT');
 // Original actor re-login recovers the original marker even with default WH1.
 await run('sessionStorage.setItem("hft.live.fixture.login","yes")');await send('Page.reload');
 await wait(()=>has(requestA),'A_RELOGIN');
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 // Cookie changed without reload (e.g. another tab): server-side binding rejects.
 await run('sessionStorage.setItem("hft.live.fixture.login","other")');await click('Check change history');
 await wait(()=>has('Corporate Google sign-in'),'STALE_CONTEXT_DENIED');
 assert.equal(await has(requestA),false);assert.equal(await stored(keyA),markerA);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 await run('sessionStorage.setItem("hft.live.fixture.login","yes")');await send('Page.reload');
 await wait(()=>has(requestA),'A_RELOGIN_AGAIN');
 // Storage clear failure holds the marker; no retry is sent.
 await run('sessionStorage.setItem("hft.live.fixture.storageFailure","remove")');
 await click('Check change history');await wait(()=>has('Browser request tracking is unavailable'),'CLEAR_FAILURE');
 assert.equal(await stored(keyA),markerA);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 await run('sessionStorage.removeItem("hft.live.fixture.storageFailure")');await send('Page.reload');
 await wait(()=>has(requestA),'A_RESTORED_STORAGE');
 await click('Check change history');await wait(()=>has('original request is present'),'READ_ONLY_RECONCILIATION');
 assert.equal(await stored(keyA),null);assert.equal(await stored(keyB),null);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 // Legacy marker is retained without showing its reference or submitting a mutation.
 const legacy='hft.liveMasters.pending.v1';
 await run('sessionStorage.setItem('+JSON.stringify(legacy)+','+JSON.stringify(markerA)+')');
 await send('Page.reload');await wait(()=>has('unbound legacy request requires administrator review'),'LEGACY_QUARANTINE');
 assert.equal(await has(requestA),false);assert.equal(await stored(legacy),markerA);
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="HISTORY"||p.intent==="SAVE").length'),0);
 assert.equal(await run('[...document.querySelectorAll("button")].filter(x=>x.textContent.trim()==="Add employee").every(x=>x.disabled)'),true);
 await run('sessionStorage.removeItem('+JSON.stringify(legacy)+')');
 // Invalid context cannot cause hydration; read failure blocks mutations.
 await run('sessionStorage.setItem("hft.live.fixture.login","invalid-partition")');await send('Page.reload');
 await wait(()=>has('workspace is not available right now'),'INVALID_ACTOR_CONTEXT');
 assert.equal(await run('window.__pendingReads.length'),0);
 await run('sessionStorage.setItem("hft.live.fixture.login","yes");sessionStorage.setItem("hft.live.fixture.storageFailure","read")');
 await send('Page.reload');await wait(()=>has('Browser request tracking is unavailable'),'READ_FAILURE');
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 await run('sessionStorage.removeItem("hft.live.fixture.storageFailure")');await send('Page.reload');
 await wait(()=>has('Synthetic Employee'),'STORAGE_RESTORED');
 await click('Add employee');await wait(()=>run('Boolean(document.querySelector("form"))'),'STORAGE_WRITE_FORM');
 await field('Employee ID','FIXTURE-NOT-SAVED');await field('Full name','Storage Failure Fixture');
 await field('Department','QA');await field('Designation','Operator');await field('Reason for adding this record','Synthetic write failure');
 await run('sessionStorage.setItem("hft.live.fixture.storageFailure","write")');await click('Save record');
 await wait(()=>has('Browser request tracking is unavailable'),'WRITE_FAILURE');
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),0);
 assert.equal(await stored(keyA),null);
 await run('sessionStorage.removeItem("hft.live.fixture.storageFailure")');
 await viewport(390,844);await sleep(300);
 assert.ok(await run('document.documentElement.scrollWidth<=window.innerWidth+2'),'MOBILE_HORIZONTAL_OVERFLOW');
 assert.ok(await run('document.querySelector("input[aria-label=Company]").getBoundingClientRect().height>=36'),'INPUT_STYLING');
 console.log('LIVE_MASTERS_MOUNTED=PASS; synthetic signed-out/context/scope/create/edit/history/actor isolation/re-login/legacy/storage failures/mobile');
}
try{
 tmp=await mkdtemp(join(tmpdir(),'hft-live-ui-'));
 let tail='';
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(PORT)],{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,NODE_ENV:'development',HFT_ENVIRONMENT:'production-qualification',
   HFT_LIVE_R1_PROFILE:'HFT_R1_PRODUCTION_LIVE_MASTERS_V1',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
   HFT_LIVE_POSTING_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',HFT_ENABLE_PREVIEW_NEON_DISCOVERY:'false'}});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>{tail=(tail+String(v)).slice(-3000);});
 try{await wait(async()=>(await fetch(URL_ROOT+'/masters/live')).status===200,'NEXT_DEV',75000);}
 catch(e){throw Error(String(e)+'; '+tail);}
 browser=spawn(chrome(),['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+join(tmp,'chrome'),'about:blank'],{detached:true,stdio:'ignore'});
 const portFile=join(tmp,'chrome','DevToolsActivePort');
 await wait(async()=>Boolean((await readFile(portFile,'utf8')).trim()),'CHROMIUM_START',30000);
 const port=Number((await readFile(portFile,'utf8')).split('\n')[0]);
 const tab=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
 if(!tab)throw Error('NO_PAGE');
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',evt=>{const m=JSON.parse(String(evt.data));const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);});
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:mock});
 await workflow();
}catch(error){console.error('LIVE_MASTERS_MOUNTED=FAIL',error);process.exitCode=1;}
finally{
 if(ws)ws.close();
 for(const child of [browser,server])if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{/* already stopped */}}
 await sleep(350);if(tmp)await rm(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:250});
}
