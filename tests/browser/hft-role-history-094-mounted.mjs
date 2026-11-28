/** HF094 mounted role-history authentication regression, using ONLY synthetic intercepted responses.
 * No real credentials, database, actor enrollment, or production access.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url))),PORT=31168,URL_ROOT='http://127.0.0.1:'+PORT;
let server,browser,ws,tmp,sequence=0;
const pending=new Map();
async function wait(check,label,limit=25000){
 const end=Date.now()+limit;
 while(Date.now()<end){try{if(await check())return;}catch{/* bounded polling */}await sleep(100);}
 throw Error('HF094_ROLES_BROWSER_TIMEOUT_'+label);
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
 const orig=window.fetch.bind(window),context='a'.repeat(64),scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH1'};
 const employee={employeeId:'FIXTURE-EMP',personId:'FIXTURE-PERSON',fullName:'Private synthetic employee',active:true,version:1};
 const assignment={employeeId:employee.employeeId,scope,revision:2,revokedFrom:null,periods:[{from:'2026-01-01T00:00:00.000Z',to:null,roles:['VIEWER']}]};
 const event=(revision,reason)=>({requestId:'00000000-0000-4000-8000-00000000000'+revision,action:'ASSIGN',actorSubject:'FIXTURE-ACTOR',actorEmployeeId:'FIXTURE-ADMIN',actorPersonId:'FIXTURE-ADMIN-PERSON',actorSessionId:'FIXTURE-SESSION',recordedAt:'2026-01-01T00:00:00.000Z',reason,after:{...assignment,revision}});
 window.__fixtureLoad=crypto.randomUUID();window.__calls=[];window.__next='';window.__release=null;
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 window.fetch=async(input,options={})=>{
  const path=typeof input==='string'?input:new URL(input.url).pathname;
  if(path!=='/api/hft/settings/roles')return orig(input,options);
  const p=JSON.parse(options.body),bound=new Headers(options.headers).get('x-hft-operator-context');
  window.__calls.push({action:p.action,bound,before:p.beforeRevision});
  if(p.action==='BOOTSTRAP')return reply({state:'CONNECTED',scopes:[scope],actorEmployeeId:'FIXTURE-ADMIN',contextId:context,expiresAt:Math.floor(Date.now()/1000)+Number(sessionStorage.getItem('fixture.expiry')||600)});
  if(bound!==context)return reply({state:'UNAVAILABLE',code:'HOSTED_OPERATOR_CONTEXT_CHANGED'},401);
  if(p.action==='SEARCH')return reply({state:'RESULTS',scope,employees:[employee]});
  if(p.action==='VIEW'){
   const older=p.beforeRevision!==Number.MAX_SAFE_INTEGER;
   const result=reply({state:'READ_VERIFIED',scope,employee,assignment,history:[older?event(1,'Older private fixture event'):event(2,'Current private fixture event')],
    status:'ACTIVE',grantableRoles:['VIEWER'],nextBeforeRevision:older?null:2,effectivePermissions:['stock.read'],canConfigureModules:false,canDelegateAdministration:false});
   if(older){
    const mode=window.__next;window.__next='';
    if(mode==='401')return reply({state:'UNAVAILABLE',code:'HOSTED_OPERATOR_SESSION_REQUIRED'},401);
    if(mode==='403')return new Response('Forbidden',{status:403});
    if(mode==='hold'||mode==='stale403'){
     await new Promise(resolve=>{window.__release=resolve;});window.__release=null;
     if(mode==='stale403')return reply({state:'UNAVAILABLE',code:'ROLE_PERMISSION_DENIED'},403);
    }
   }
   return result;
  }
  if(['ASSIGN','CHANGE','REVOKE'].includes(p.action))return reply({state:'UNCONFIRMED',requestId:p.requestId},409);
  return reply({state:'UNAVAILABLE',code:'FIXTURE_UNSUPPORTED'},422);
 };
})();`;
async function has(value){return run('document.body.innerText.includes('+JSON.stringify(value)+')');}
async function click(label){
 await wait(()=>run('Boolean([...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(label)+'&&!x.disabled))'),'BUTTON_'+label);
 await run('([...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(label)+'&&!x.disabled)).click()');
}
async function input(selector,value){
 await run('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled)throw Error("INPUT_UNAVAILABLE");Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value").set.call(el,'+JSON.stringify(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await sleep(100);
}
async function openEmployee(){
 await wait(()=>has('Role source connected'),'CONNECTED');
 await input('#employee-search','fixture');await click('Search');
 await wait(()=>has('Private synthetic employee'),'SEARCH');
 await run('[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Private synthetic employee")&&!x.disabled).click()');
 await wait(()=>has('Current private fixture event'),'HISTORY');
}
async function reload(){const old=await run('window.__fixtureLoad');await send('Page.reload');await wait(async()=>{const id=await run('window.__fixtureLoad');return !!id&&id!==old&&await has('Role source connected');},'RELOADED');}
async function workflow(){
 await send('Page.navigate',{url:URL_ROOT+'/settings/users-roles'});
 await openEmployee();await click('Load older history');await wait(()=>has('Older private fixture event'),'PAGINATION_OK');
 assert.equal(await run('window.__calls.filter(x=>x.action==="VIEW").every(x=>x.bound==="a".repeat(64))'),true);
 await reload();await openEmployee();
 await click('Assign or change roles');await wait(()=>run('document.querySelector("dialog").open'),'DIALOG');
 await input('dialog textarea','Synthetic regression only');await click('Save assignment');await wait(()=>has('Unconfirmed save'),'MARKER');
 const key='hft.hosted.role.pending.v1.'+'a'.repeat(64),stored=()=>run('sessionStorage.getItem('+JSON.stringify(key)+')');
 const original=await stored();assert.ok(original);
 await click('Close');await run('window.__next="401"');await click('Load older history');
 await wait(()=>has('Backend not connected'),'PAGINATION_AUTH_LOSS');
 assert.equal(await has('Private synthetic employee'),false);assert.equal(await has('Current private fixture event'),false);assert.equal(await has(JSON.parse(original).requestId),false);
 assert.equal(await stored(),original);assert.equal(await run('document.querySelector("dialog").open'),false);
 await reload();await wait(()=>has(JSON.parse(original).requestId),'ORIGINAL_REAUTH');
 // Only the harness removes its synthetic marker before separate cases.
 await run('sessionStorage.removeItem('+JSON.stringify(key)+')');await reload();await openEmployee();
 await run('window.__next="403"');await click('Load older history');await wait(()=>has('Backend not connected'),'NON_JSON_403');
 assert.equal(await has('Private synthetic employee'),false);assert.equal(await has('Current private fixture event'),false);
 for(const mode of ['hold','stale403']){
  await reload();await openEmployee();await run('window.__next='+JSON.stringify(mode));await click('Load older history');
  await wait(()=>run('Boolean(window.__release)'),'HELD_'+mode);
  await input('#employee-search','different fixture');await run('window.__release()');await sleep(300);
  assert.equal(await has('Older private fixture event'),false);assert.equal(await has('Current private fixture event'),false);
  assert.equal(await has('Role source connected'),true);
 }
 await run('sessionStorage.setItem("fixture.expiry","6")');await reload();await openEmployee();
 await run('window.__next="hold"');await click('Load older history');await wait(()=>run('Boolean(window.__release)'),'EXPIRY_HELD');
 await wait(()=>has('Session expired.'),'EXPIRY',12000);await run('window.__release()');await sleep(300);
 assert.equal(await has('Older private fixture event'),false);assert.equal(await has('Current private fixture event'),false);
 assert.equal(await has('Backend not connected'),true);
 console.log('HF094_ROLE_HISTORY_MOUNTED=PASS; successful history pagination, 401/403, stale success/denial, expiry, pending preservation and same-context reauth');
}

try{
 tmp=await mkdtemp(join(tmpdir(),'hft-role-history-'));
 let tail='';
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(PORT)],{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,NODE_ENV:'development',HFT_ENVIRONMENT:'production-qualification',
   HFT_LIVE_R1_PROFILE:'HFT_R1_PRODUCTION_LIVE_MASTERS_V1',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
   HFT_LIVE_POSTING_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',HFT_ENABLE_PREVIEW_NEON_DISCOVERY:'false'}});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>{tail=(tail+String(v)).slice(-3000);});
 try{await wait(async()=>(await fetch(URL_ROOT+'/settings/users-roles')).status===200,'NEXT_DEV',75000);}
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
}catch(error){console.error('HF094_ROLE_HISTORY_MOUNTED=FAIL',error);process.exitCode=1;}
finally{
 if(ws)ws.close();
 for(const child of [browser,server])if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{/* already stopped */}}
 await sleep(350);if(tmp)await rm(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:250});
}
