/** Mounted Next/Chromium employee account and real HTTP deny tests. No live credentials or provider session. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url))),PORT=31201,base='http://127.0.0.1:'+PORT;
let server,browser,ws,tmp,sequence=0,tail='';
const pending=new Map();
async function wait(f,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){try{if(await f())return;}catch{}await sleep(100);}throw Error('HF101_TIMEOUT_'+label+'; '+tail.slice(-1200));}
function chrome(){for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser'])try{return execFileSync('which',[name],{encoding:'utf8'}).trim();}catch{}throw Error('CHROME_MISSING');}
function send(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error('JS '+JSON.stringify(r.exceptionDetails));return r.result?.value;}
const has=t=>run('document.body.innerText.includes('+JSON.stringify(t)+')');
async function click(t){await wait(()=>run('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==='+JSON.stringify(t)+'&&!b.disabled)'),'BUTTON_'+t);await run('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+JSON.stringify(t)+'&&!b.disabled).click()');}
async function field(label,value){await run('(()=>{const l=[...document.querySelectorAll("label")].find(l=>l.textContent.trim().startsWith('+JSON.stringify(label)+'));const e=l?.querySelector("input");if(!e||e.disabled)throw Error("FIELD");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');}
const mock=`(()=>{
 const original=window.fetch.bind(window);window.__calls=[];window.__deny=false;let registered=false,rebound=false;
 window.fetch=async(input,options={})=>{
  const path=typeof input==='string'?input:new URL(input.url).pathname;
  if(path==='/api/hft/live-masters/signout'){sessionStorage.setItem('hf101-mode','out');return Response.json({state:'SIGNED_OUT'});}
  if(path!=='/api/hft/employee-account')return original(input,options);
  const p=JSON.parse(options.body);window.__calls.push(p);
  const mode=sessionStorage.getItem('hf101-mode')||'out';
  if(mode==='out'||window.__deny)return Response.json({state:'UNAVAILABLE',code:'HF101_SESSION_REQUIRED'},{status:401});
  const owner=mode==='owner',context={state:owner?'ROLE_ASSIGNED':'PENDING_ROLE',employeeId:owner?'FIXTURE-OWNER':'FIXTURE-A',fullName:owner?'Synthetic Owner':'Synthetic Employee A',email:owner?'owner@example.invalid':'a@example.invalid',legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',expiresAt:Math.floor(Date.now()/1000)+600,registrationWarehouses:owner?['FIXTURE-WH']:[],scopes:owner?[{warehouseId:'FIXTURE-WH',permissions:['roles.read','roles.manage','roles.manage-admin']}]:[]};
  if(p.action==='CONTEXT')return Response.json(context);
  if(!owner)return Response.json({state:'UNAVAILABLE',code:'HF101_ACCESS_DENIED'},{status:403});
  if(p.action==='DIRECTORY')return Response.json({state:'DIRECTORY_VERIFIED',employees:[{employeeId:'FIXTURE-B',fullName:'Synthetic Employee B',department:'QA',designation:'Operator',active:true,email:registered?'b@example.invalid':null,registrationStatus:registered?'AWAITING_FIRST_SIGN_IN':'UNREGISTERED'},{employeeId:'FIXTURE-C',fullName:'Synthetic Employee C',department:'QA',designation:'Operator',active:true,email:null,registrationStatus:'BINDING_REQUIRED'}],limit:30});
  if(p.action==='TARGET'&&p.employeeId==='FIXTURE-B')return Response.json({state:'TARGET_VERIFIED',target:{employeeId:p.employeeId,fullName:'Synthetic Employee B',email:rebound?'replacement@example.invalid':registered?'b@example.invalid':null,version:rebound?3:registered?2:0,employeeVersion:1,bound:registered&&!rebound}});
  if(p.action==='REGISTER'&&p.employeeId==='FIXTURE-B'&&p.warehouseId==='FIXTURE-WH'&&p.version===0&&p.email==='b@example.invalid'&&p.reason.length>=8){
   registered=true;return Response.json({state:'SAVED_VERIFIED',target:{employeeId:p.employeeId,fullName:'Synthetic Employee B',email:p.email,version:1,employeeVersion:1,bound:false}});
  }
  if(p.action==='REBIND'&&registered&&!rebound&&p.employeeId==='FIXTURE-B'&&p.warehouseId==='FIXTURE-WH'&&p.version===2&&p.employeeVersion===1&&p.email==='replacement@example.invalid'&&p.confirm===true&&p.evidenceSha256==='c'.repeat(64)){
   rebound=true;return Response.json({state:'REBIND_VERIFIED',target:{employeeId:p.employeeId,fullName:'Synthetic Employee B',email:p.email,version:3,employeeVersion:1,bound:false}});
  }
  return Response.json({state:'UNAVAILABLE',code:'HF101_INPUT_INVALID'},{status:422});
 };
})();`;
try{
 const commit=process.env.GITHUB_SHA;if(!/^[0-9a-f]{40}$/.test(commit||''))throw Error('EXACT_SOURCE_REQUIRED');
 tmp=await mkdtemp(join(tmpdir(),'hf101-mounted-'));
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(PORT)],{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',VERCEL_ENV:'preview',HFT_ENVIRONMENT:'retained-stores-nonproduction',
  HFT_EMPLOYEE_LOGIN_PROFILE:'HFT_R1_CANONICAL_EMPLOYEE_LOGIN_V1',HFT_EMPLOYEE_LOGIN_SOURCE_COMMIT:commit,VERCEL_GIT_COMMIT_SHA:commit,HFT_EMPLOYEE_LOGIN_ADMISSION_SHA256:'b'.repeat(64),
  HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',HFT_LIVE_POSTING_ENABLED:'false',HFT_ROLE_ASSIGNMENT_RUNTIME_PROFILE:'HFT_R1_APP_ROLES_RETAINED_NP_077_V1',
  HFT_ROLE_RESOURCE_PROJECT:'wandering-cake-50222227',HFT_ROLE_RESOURCE_BRANCH:'br-shiny-night-b3qgsj8t',HFT_ROLE_PG_DATABASE:'hft_r1_retained_masters_np077',HFT_ROLE_PG_SERVER_VERSION_NUM:'180007',
  HFT_SESSION_ISSUER:'hft-r1-employee-v1',HFT_SESSION_AUDIENCE:'hft-r1-canonical-employee-v1',HFT_PUBLIC_ORIGIN:'https://fixture.example.invalid',NEXT_TELEMETRY_DISABLED:'1',HFT_ENABLE_PREVIEW_NEON_DISCOVERY:'false'}});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>tail=(tail+String(v)).slice(-3000));
 await wait(async()=>(await fetch(base+'/employee/account')).status===200,'NEXT_START',75000);
 const html=await (await fetch(base+'/employee/account')).text();assert.match(html,/Employee account/);assert.ok(!html.includes('Synthetic Employee A'));
 for(const path of ['/api/hft/employee-account','/api/hft/settings/roles']){
  const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CONTEXT'})});assert.equal(res.status,401,path);assert.match(res.headers.get('cache-control')||'',/no-store/);
 }
 for(const path of ['/api/hft/stores/receive','/api/hft/mis','/api/hft/intake','/api/hft/live-masters']){
  const res=await fetch(base+path,{method:'POST'});assert.equal(res.status,503,path);assert.equal((await res.json()).code,'HF101_ROUTE_NOT_ADMITTED');
 }
 assert.equal((await fetch(base+'/api/hft/live-masters/auth/start?return=employee',{redirect:'manual'})).status,503);
 browser=spawn(chrome(),['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+join(tmp,'chrome'),'about:blank'],{detached:true,stdio:'ignore'});
 const portFile=join(tmp,'chrome','DevToolsActivePort');await wait(async()=>Boolean((await readFile(portFile,'utf8')).trim()),'CHROME_START',30000);
 const port=Number((await readFile(portFile,'utf8')).split('\n')[0]);
 const tab=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');assert.ok(tab);
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data)),p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}});
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:mock});await send('Page.navigate',{url:base+'/employee/account'});
 await wait(()=>has('Sign in with your registered email.'),'SIGNED_OUT');
 await run('sessionStorage.setItem("hf101-mode","pending")');await send('Page.reload');
 await wait(()=>has('Awaiting role assignment.'),'PENDING_ROLE');
 assert.ok(await has('Synthetic Employee A'));assert.equal(await run('[...document.querySelectorAll("a")].every(a=>a.getAttribute("href")!=="/settings/users-roles")'),true);
 assert.equal(await has('Employee email registration'),false);assert.equal(await has('Synthetic Owner'),false);
 await run('sessionStorage.setItem("hf101-mode","owner")');await send('Page.reload');
 await wait(()=>has('Employee email registration'),'OWNER_FORM');assert.ok(await has('Synthetic Owner'));
 await field('Search canonical employees','Synthetic');await click('Search employees');await wait(()=>has('Canonical Employee Master'),'DIRECTORY');
 assert.ok(await has('Synthetic Employee C'));assert.equal(await run('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Select FIXTURE-C").disabled'),true);
 await click('Select FIXTURE-B');await wait(()=>has('Provider identity will bind after verified first sign-in.'),'TARGET');
 await field('Registered email','b@example.invalid');await field('Reason','Synthetic employee registration');await click('Save email');
 await wait(()=>has('Employee email saved and independently read back.'),'SAVE');
 assert.deepEqual(await run('window.__calls.at(-1)'),{action:'REGISTER',employeeId:'FIXTURE-B',warehouseId:'FIXTURE-WH',email:'b@example.invalid',version:0,reason:'Synthetic employee registration'});
 await click('Find employee');await wait(()=>has('Provider identity already bound'),'BOUND_TARGET');
 await click('Replace provider identity');await field('Registered email','replacement@example.invalid');await field('Reason','Synthetic verified provider replacement');await field('Recovery evidence SHA-256','c'.repeat(64));
 assert.equal(await run('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Authorize provider replacement").disabled'),true);
 await run('document.querySelector("input[type=checkbox]").click()');await click('Authorize provider replacement');await wait(()=>has('Provider replacement authorized and read back.'),'REBIND');
 await run('window.__deny=true');await click('Refresh access');await wait(()=>has('Sign in with your registered email.'),'SESSION_LOSS');
 assert.equal(await has('Synthetic Owner'),false);assert.equal(await has('Synthetic Employee B'),false);assert.equal(await has('Synthetic Employee C'),false);assert.equal(await has('Employee email registration'),false);
 console.log('HF101_EMPLOYEE_ACCOUNT_MOUNTED=PASS; actual HTTP denial and mounted synthetic pending/owner directory/registration/provider replacement/session-loss UI; no live login');
}catch(e){console.error('HF101_EMPLOYEE_ACCOUNT_MOUNTED=FAIL',e);process.exitCode=1;}
finally{if(ws)ws.close();for(const c of [browser,server])if(c?.pid)try{process.kill(-c.pid,'SIGTERM');}catch{}await sleep(350);if(tmp)await rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
