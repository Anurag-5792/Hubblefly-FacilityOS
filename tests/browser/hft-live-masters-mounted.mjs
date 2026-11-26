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
 const context={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseIds:['FIXTURE-WH1','FIXTURE-WH2']};
 window.__liveCalls=[];window.__unknownSave=false;
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
  if(sessionStorage.getItem(login)!=='yes')return deny(401,'LIVE_R1_CORPORATE_SESSION_REQUIRED');
  if(p.intent==='SESSION_CONTEXT')return ok({state:'SIGNED_SESSION_CONTEXT',scope:context,expiresAt:Math.floor(Date.now()/1000)+600,qualification:true});
  if(!p.scope||p.scope.legalEntityId!==context.legalEntityId||p.scope.siteId!==context.siteId||!context.warehouseIds.includes(p.scope.warehouseId))
   return deny(403,'LIVE_R1_SCOPE_OR_PERMISSION_DENIED');
  const rows=read(),keyId=idOf(p),current=rows[keyId];
  if(p.intent==='LIST')return ok(Object.values(rows).filter(x=>x.record.kind===p.kind&&x.record.scope.warehouseId===p.scope.warehouseId&&x.record.recordId.toLowerCase().includes(p.search.toLowerCase())).map(x=>x.record));
  if(p.intent==='GET')return ok(current?.record||null);
  if(p.intent==='HISTORY')return ok(current?.history||[]);
  if(p.intent==='SAVE'){
   if(!['CREATE','UPDATE'].includes(p.action)||p.expectedRevision!==(current?.record.revision||0))return deny(409,'LIVE_R1_REVISION_OR_REQUEST_CONFLICT');
   const record={kind:p.kind,scope:p.scope,recordId:p.recordId,revision:p.expectedRevision+1,deleted:false,values:p.values,state:'RECORDED_UNAPPROVED',
    createdBy:'FIXTURE',updatedBy:'FIXTURE',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   const event={revision:record.revision,action:p.action,actor_subject:'FIXTURE',occurred_at:new Date().toISOString(),reason:p.reason,event_sha256:'a'.repeat(64),request_id:p.requestId};
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
 assert.equal(await run('Boolean(sessionStorage.getItem("hft.liveMasters.pending.v1"))'),true);
 const before=await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length');
 assert.equal(before,2);
 await click('Check change history');await wait(()=>has('original request is present'),'READ_ONLY_RECONCILIATION');
 assert.equal(await run('window.__liveCalls.filter(p=>p.intent==="SAVE").length'),before);
 await viewport(390,844);await sleep(300);
 assert.ok(await run('document.documentElement.scrollWidth<=window.innerWidth+2'),'MOBILE_HORIZONTAL_OVERFLOW');
 assert.ok(await run('document.querySelector("input[aria-label=Company]").getBoundingClientRect().height>=36'),'INPUT_STYLING');
 console.log('LIVE_MASTERS_MOUNTED=PASS; synthetic signed-out/context/scope/create/edit/history/reconciliation/mobile');
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
