/** C050-CORRECT mounted React/Next.js browser regression.
 * Isolated CI-local Next server + headless Chromium CDP, no extra dependencies.
 * All P3 API responses are SYNTHETIC and intercepted in the browser before
 * first page load. No real SQL, Neon, live IAM, external network or deployment.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const PORT=31165;
const URL_ROOT='http://127.0.0.1:'+PORT;
let server,browser,devtools,tmp;
const reqs=new Map();let sequence=0;
async function wait(condition,reason,limit=25000){
 const end=Date.now()+limit;
 while(Date.now()<end){
  try{if(await condition())return;}catch{/* startup/teardown retries */}
  await sleep(90);
 }
 throw Error('C050_BROWSER_TIMEOUT_'+reason);
}
function findChrome(){
 for(const binary of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  try{return execFileSync('which',[binary],{encoding:'utf8'}).trim();}
  catch{/* next */}
 }
 throw Error('C050_BROWSER_CHROMIUM_UNAVAILABLE');
}
async function browserEvaluate(expression){
 const response=await devtools.send('Runtime.evaluate',{
  expression,returnByValue:true,awaitPromise:true,userGesture:true});
 if(response.exceptionDetails)throw Error('C050_BROWSER_JS_'+
  (response.exceptionDetails.text||JSON.stringify(response.exceptionDetails)));
 return response.result?.value;
}
class CDP {
 constructor(socket){
  this.socket=socket;
  socket.addEventListener('message',evt=>{
   const message=JSON.parse(String(evt.data));
   if(!message.id)return;
   const p=reqs.get(message.id);if(!p)return;
   reqs.delete(message.id);
   if(message.error)p.reject(Error('CDP '+JSON.stringify(message.error)));
   else p.resolve(message.result);
  });
 }
 send(method,params={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
   reqs.set(id,{resolve,reject});
   this.socket.send(JSON.stringify({id,method,params}));
  });
 }
}
const browserMock=`(()=>{
 const original=window.fetch.bind(window);
 window.__HFT_C050_CALLS=[];
 window.__HFT_C050_PENDING=[];
 window.__HFT_C050_DEFER_NEXT_LIST=false;
 const reply=(body)=>new Response(JSON.stringify(body),{
  status:200,headers:{'Content-Type':'application/json'}});
 window.__HFT_C050_RELEASE=()=>{
  const pending=window.__HFT_C050_PENDING.shift();
  if(!pending)throw Error('NO_PENDING_SYNTHETIC_LIST');
  pending.resolve(reply(pending.response));
 };
 window.fetch=(input,options={})=>{
  const path=typeof input==='string'?input:input.url;
  if(path!=='/api/hft/masters')return original(input,options);
  const payload=JSON.parse(options.body);
  window.__HFT_C050_CALLS.push(payload);
  if(payload.intent==='LIST'){
   const scope=payload;
   const result={state:'AVAILABLE',records:[{
    kind:'EMPLOYEE',record_id:'EMP1',legal_entity_id:scope.legalEntityId,
    site_id:scope.siteId,warehouse_id:'',version:'3',active:true,
    master_values:{fullName:'Synthetic Employee',department:'Stores',
     designation:'Officer',siteId:scope.siteId}
   }]};
   if(window.__HFT_C050_DEFER_NEXT_LIST){
    window.__HFT_C050_DEFER_NEXT_LIST=false;
    return new Promise(resolve=>window.__HFT_C050_PENDING.push({
     response:result,resolve}));
   }
   return Promise.resolve(reply(result));
  }
  if(payload.intent==='SUBMIT')
   return Promise.resolve(reply({state:'PENDING_APPROVAL',records:[]}));
  return Promise.resolve(reply({state:'AVAILABLE',records:[]}));
 };
})();`;
const ui=`(()=>{
 const form=document.querySelector('.masters-form');
 const directory=document.querySelector('section[aria-label="Employee Master directory"]');
 return {operation:form?.querySelector('select')?.value,
  recordId:form?.querySelector('input[placeholder="Employee ID"]')?.value,
  revision:form?.querySelector('input[inputmode="numeric"]')?.value,
  names:[...(directory?.querySelectorAll('tbody tr')||[])].map(x=>x.textContent),
  status:document.querySelector('.masters-result')?.textContent||'',
  calls:window.__HFT_C050_CALLS.length,
  submits:window.__HFT_C050_CALLS.filter(x=>x.intent==='SUBMIT').length,
  pending:window.__HFT_C050_PENDING.length};
})()`;
async function state(){return browserEvaluate(ui);}
const byLabel=(label)=>`[...document.querySelectorAll('.masters-scope label')].find(
 el=>el.textContent.includes(${JSON.stringify(label)}))?.querySelector('input')`;
async function setScope(label,value){
 const result=await browserEvaluate(`(()=>{
  const node=${byLabel(label)};
  if(!node||node.disabled)throw Error('SCOPE_INPUT_NOT_AVAILABLE');
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(node,${JSON.stringify(value)});
  node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
  node.dispatchEvent(new Event('change',{bubbles:true}));
  return node.value;
 })()`);
 assert.equal(result,value);
 await sleep(90);
}
async function setOperation(value){
 await browserEvaluate(`(()=>{
  const node=document.querySelector('.masters-form select');
  const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
  set.call(node,${JSON.stringify(value)});
  node.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await wait(async()=>(await state()).operation===value,'OPERATION_CHANGE');
}
async function setFormValue(selector,value){
 await browserEvaluate(`(()=>{
  const node=document.querySelector('.masters-form '+${JSON.stringify(selector)});
  if(!node)throw Error('FORM_FIELD_NOT_FOUND');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(
   node,${JSON.stringify(value)});
  node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
  node.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await sleep(80);
}
async function clickButton(text){
 await browserEvaluate(`(()=>{
  const button=[...document.querySelectorAll('button')]
   .find(node=>node.textContent.trim()===${JSON.stringify(text)} &&
    !node.disabled);
  if(!button)throw Error('BUTTON_NOT_CLICKABLE '+${JSON.stringify(text)});
  button.click();
 })()`);
}
async function listAndSelect(){
 await clickButton('Load masters');
 await wait(async()=>(await state()).names.some(x=>x.includes('Synthetic Employee')),
  'AUTHENTICATED_LIST');
 await clickButton('Request edit');
 await wait(async()=>{const x=await state();return x.operation==='EDIT'&&x.recordId==='EMP1'&&x.revision==='3';},
  'EMPLOYEE_SELECTION');
}
async function submitEvent(){
 await browserEvaluate(`(()=>{
  const form=document.querySelector('.masters-form');
  if(!form)throw Error('P3_EDIT_FORM_MISSING');
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 })()`);
 await sleep(180);
}
async function attemptedStaleSubmission(){
 await setOperation('EDIT');
 await setFormValue('input[placeholder="Employee ID"]','EMP1');
 await setFormValue('input[inputmode="numeric"]','3');
 const before=(await state()).submits;
 await submitEvent();
 assert.equal((await state()).submits,before,'Stale EDIT caused an API SUBMIT');
 assert.match((await state()).status,/STALE_SELECTION_SCOPE_OR_REVISION/);
}
async function testMountedWorkflow(){
 await wait(async()=>Boolean(await browserEvaluate(`document.querySelector('h1')?.textContent?.includes('Employee & Stores Masters')&&window.__HFT_C050_CALLS`)),
 'REACT_PAGE_LOAD');
 await sleep(550); // ensure client hydration before event dispatch
 await setScope('Legal entity ID','HFT');
 await setScope('Site ID','SITE1');
 await setScope('Warehouse ID','WH1');
 await listAndSelect();
 await setScope('Warehouse ID','WH2');
 await wait(async()=>{const x=await state();return x.operation==='CREATE'&&x.recordId===''&&x.revision==='0';},
  'WAREHOUSE_INVALIDATION');
 await attemptedStaleSubmission();
 await setScope('Warehouse ID','WH1');
 await attemptedStaleSubmission(); // reverted value is NOT a fresh selection
 await listAndSelect();
 await setScope('Site ID','SITE2');
 await attemptedStaleSubmission();
 await setScope('Site ID','SITE1');
 await listAndSelect();
 await setScope('Legal entity ID','DDL');
 await attemptedStaleSubmission();
 await setScope('Legal entity ID','HFT');
 await listAndSelect();
 await browserEvaluate('window.__HFT_C050_DEFER_NEXT_LIST=true');
 await clickButton('Load masters');
 await wait(async()=>(await state()).pending===1,'DEFERRED_P3_LIST');
 await setScope('Warehouse ID','WH2'); // allowed while LIST fetch pending
 await browserEvaluate('window.__HFT_C050_RELEASE()');
 await sleep(220);
 const afterStale=await state();
 assert.equal(afterStale.names.length,0,'Late WH1 LIST was rendered under WH2');
 assert.match(afterStale.status,/Fresh authenticated LIST/);
 await attemptedStaleSubmission();
 await listAndSelect(); // fresh WH2 LIST
 await browserEvaluate(`(()=>{
  const node=document.querySelector('.masters-form textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(
   node,'Change approved employee metadata');
  node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
 })()`);
 await sleep(110);
 const before=(await state()).submits;
 await submitEvent();
 await wait(async()=>(await state()).submits===before+1,'FRESH_WH2_EDIT_SUBMIT');
 const check=await browserEvaluate(`(()=>{
  const calls=window.__HFT_C050_CALLS.filter(p=>p.intent==='SUBMIT');
  return calls[calls.length-1]?.change||null;
 })()`);
 assert.equal(check.kind,'EMPLOYEE');
 assert.equal(check.operation,'EDIT');
 assert.equal(check.recordId,'EMP1');
 assert.equal(check.expectedVersion,'3');
 assert.equal(check.warehouseId,'WH2');
 assert.equal(check.legalEntityId,'HFT');
 assert.equal(check.siteId,'SITE1');
 console.log('C050_MOUNTED_REACT=PASS; warehouse/site/entity scope, restoration, async stale LIST and pre-API denial');
}
try{
 tmp=await mkdtemp(join(tmpdir(),'hft-c050-browser-'));
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(PORT)],{
  cwd:ROOT,detached:true,stdio:'ignore',
  env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',
   HFT_LIVE_POSTING_ENABLED:'false',HFT_ENABLE_PREVIEW_NEON_DISCOVERY:'false'}});
 await wait(async()=>{
  const result=await fetch(URL_ROOT+'/stores/masters');
  return result.status===200;
 },'CI_LOCAL_NEXT_SERVER',30000);
 browser=spawn(findChrome(),['--headless=new','--no-sandbox',
  '--disable-dev-shm-usage','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+join(tmp,'chrome'),
  'about:blank'],{detached:true,stdio:'ignore'});
 const portFile=join(tmp,'chrome','DevToolsActivePort');
 await wait(async()=>{try{return Boolean((await readFile(portFile,'utf8')).trim());}catch{return false}},
 'CHROMIUM_CDP_START',12000);
 const port=Number((await readFile(portFile,'utf8')).split('\n')[0]);
 const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=tabs.find(x=>x.type==='page');
 if(!tab)throw Error('C050_BROWSER_NO_PAGE_TARGET');
 const ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',reject,{once:true});
 });
 devtools=new CDP(ws);
 await devtools.send('Page.enable');
 await devtools.send('Runtime.enable');
 await devtools.send('Page.addScriptToEvaluateOnNewDocument',{source:browserMock});
 await devtools.send('Page.navigate',{url:URL_ROOT+'/stores/masters'});
 await testMountedWorkflow();
}catch(error){
 console.error('C050_MOUNTED_REACT=FAIL',error);
 process.exitCode=1;
}finally{
 if(devtools)devtools.socket.close();
 for(const child of [browser,server]){
  if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{/* already stopped */}}
 }
 if(tmp)await rm(tmp,{recursive:true,force:true});
}
