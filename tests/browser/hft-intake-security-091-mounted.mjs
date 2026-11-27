/** SEC-090-05 mounted Next/Chromium regression, using ONLY synthetic intercepted responses.
 * No real credentials, database, actor enrollment, or production access.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url))),PORT=31167,URL_ROOT='http://127.0.0.1:'+PORT;
let server,browser,ws,tmp,sequence=0;
const pending=new Map();
async function wait(check,label,limit=25000){
 const end=Date.now()+limit;
 while(Date.now()<end){try{if(await check())return;}catch{/* bounded polling */}await sleep(100);}
 throw Error('INTAKE_BROWSER_TIMEOUT_'+label);
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
const mock="(()=>{\n const orig=window.fetch.bind(window),A='a'.repeat(64),B='b'.repeat(64);\n window.__owner='A';window.__calls=[];window.__deny='';window.__hold='';window.__expiry=600;window.__release=null;\n const context=()=>window.__owner==='A'?A:window.__owner==='B'?B:'';\n const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});\n const ok=(ctx,data)=>response({state:'INVENTORY_REVIEW_RESULT',contextId:ctx,expiresAt:Math.floor(Date.now()/1000)+window.__expiry,data});\n window.fetch=async(input,opts={})=>{\n  const path=typeof input==='string'?input:new URL(input.url).pathname;\n  if(path==='/api/hft/live-masters/signout'){window.__owner='';return response({state:'SIGNED_OUT'});}\n  if(path!=='/api/hft/intake')return orig(input,opts);\n  const body=JSON.parse(opts.body),ctx=context(),bound=new Headers(opts.headers).get('x-hft-intake-context');\n  window.__calls.push({intent:body.intent,bound,ctx});\n  if(!ctx||(bound!==null&&bound!==ctx)||(body.intent!=='READ'&&bound!==ctx))return response({code:'INTAKE_CONTEXT_CHANGED'},401);\n  if(window.__deny===body.intent){window.__deny='';return response({code:'INTAKE_ACCESS_DENIED'},403);}\n  let result;\n  if(body.intent==='READ')result=ok(ctx,{classification:'UNADMITTED_INVENTORY_REVIEW',headers:['Intake ID','Item code','Display name','Original name','Category','Tracking','Recorded UOM','Opening rows','Revision','Review status'],rows:[['OP-12','SYNTHETIC-ITEM','Fixture '+window.__owner+' private','Original fixture','Category','Batch','PCS',1,1,'HOLD']],total:1,offset:0,canRename:true});\n  else if(body.intent==='RENAME')result=ok(ctx,{state:'RECORDED',requestId:body.requestId,itemId:body.itemId,revision:body.revision+1,name:body.name});\n  else if(body.intent==='RECONCILE')result=ok(ctx,{state:'RECORDED',requestId:body.requestId,itemId:'OP-12',revision:2});\n  else return response({code:'INTAKE_INVALID'},422);\n  // Intentionally ignore AbortSignal for delayed responses: the mounted lifetime fence must reject them.\n  if(window.__hold===body.intent){window.__hold='';await new Promise(resolve=>{window.__release=resolve;});window.__release=null;}\n  return result;\n };\n})();";
async function has(text){return run('document.body.innerText.includes('+JSON.stringify(text)+')');}
async function click(text){
 await wait(()=>run('Boolean([...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(text)+'&&!x.disabled))'),'BUTTON_'+text);
 await run('([...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(text)+'&&!x.disabled)).click()');
}
async function field(label,value){
 const expression='(()=>{const l=[...document.querySelectorAll("label")].find(x=>x.textContent.trim().startsWith('+JSON.stringify(label)+'));const el=l?.querySelector("input,textarea");if(!el)throw Error("FIELD_NOT_FOUND");Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value").set.call(el,'+JSON.stringify(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()';
 await run(expression);await sleep(120);
}
async function edit(){
 await click('Edit name');await wait(()=>has('Edit display name'),'EDITOR');
 await field('Display name','Updated synthetic name');await field('Reason','Synthetic regression only');
}
async function workflow(){
 await send('Page.navigate',{url:URL_ROOT+'/stores/intake'});
 await wait(()=>has('Fixture A private'),'A_INITIAL');
 assert.equal(await run('window.__calls[0].bound'),null);
 await click('Refresh');await wait(()=>run('window.__calls.length>=2'),'BOUND_READ');
 await wait(()=>has('Fixture A private'),'A_REFRESH');assert.equal(await run('window.__calls[1].bound'),'a'.repeat(64));
 // Revocation during rename or its readback is a 403; remove sensitive UI, preserve evidence.
 await edit();await run('window.__deny="RENAME"');await click('Save name');
 await wait(()=>has('Access ended.'),'RENAME_REVOKED');assert.equal(await has('Fixture A private'),false);assert.equal(await has('Edit display name'),false);
 const markerKey='hft.intake.pending.v2.'+'a'.repeat(64);
 const saved=await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')');assert.ok(saved);
 await click('Refresh connection');await wait(()=>has('Original request requires verification'),'RELOGIN_A');
 await run('window.__deny="RECONCILE"');await click('Check original request');await wait(()=>has('Access ended.'),'RECONCILE_REVOKED');
 assert.equal(await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')'),saved);
 // Changed provider context must not silently adopt the new owner or expose the old marker.
 await run('window.__owner="B"');await click('Refresh connection');await wait(()=>has('Fixture B private'),'B_INITIAL');
 await wait(()=>has('prior or unbound context'),'FOREIGN_MARKER_HOLD');assert.equal(await has(JSON.parse(saved).requestId),false);
 assert.equal(await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')'),saved);
 await run('window.__owner="A"');await click('Refresh');await wait(()=>has('Access ended.'),'STALE_BOUND_READ');
 assert.equal(await has('Fixture B private'),false);
 await click('Refresh connection');await wait(()=>has('Original request requires verification'),'RECOVER_A');
 await click('Check original request');await wait(()=>has('The original change is recorded.'),'RECONCILED_A');
 assert.equal(await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')'),null);
 // Logout during an in-flight successful save must not clear its original request.
 await wait(()=>has('Fixture A private'),'A_RELOADED');await edit();await run('window.__hold="RENAME"');await click('Save name');
 await wait(()=>run('Boolean(window.__release)'),'SAVE_HELD');const pendingSave=await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')');assert.ok(pendingSave);
 await click('Sign out');await wait(()=>has('Signed out of this workspace.'),'LOGOUT');
 await run('window.__release()');await sleep(250);
 assert.equal(await has('Fixture A private'),false);assert.equal(await has('Name saved and verified.'),false);
 assert.equal(await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')'),pendingSave);
 // Same owner reauth, expiry while reconciliation is in flight; late success cannot erase evidence.
 await run('window.__owner="A";window.__expiry=4');await click('Refresh connection');await wait(()=>has('Original request requires verification'),'A_EXPIRY_SETUP');
 await run('window.__hold="RECONCILE"');await click('Check original request');await wait(()=>run('Boolean(window.__release)'),'RECONCILE_HELD');
 await wait(()=>has('corporate access has expired'),'EXPIRED',10000);await run('window.__release()');await sleep(250);
 assert.equal(await has('Fixture A private'),false);assert.equal(await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')'),pendingSave);
 // Logout while a bound READ is in flight; delayed data must not repopulate the page.
 await run('window.__owner="A";window.__expiry=600');await click('Refresh connection');await wait(()=>has('Fixture A private'),'A_FINAL');
 await run('window.__hold="READ"');await click('Refresh');await wait(()=>run('Boolean(window.__release)'),'READ_HELD');
 await click('Sign out');await wait(()=>has('Signed out of this workspace.'),'READ_LOGOUT');await run('window.__release()');await sleep(250);
 assert.equal(await has('Fixture A private'),false);assert.equal(await run('sessionStorage.getItem('+JSON.stringify(markerKey)+')'),pendingSave);
 assert.equal(await run('window.__calls.filter(c=>c.intent==="RENAME").length'),2);
 console.log('INTAKE_SECURITY_091_MOUNTED=PASS; bound reads, revocation, owner change, retained markers, logout/expiry and delayed responses');
}
try{
 tmp=await mkdtemp(join(tmpdir(),'hft-intake-ui-'));
 let tail='';
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(PORT)],{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,NODE_ENV:'development',HFT_ENVIRONMENT:'production-qualification',
   VERCEL_ENV:'preview',HFT_INTAKE_PROFILE:'HFT_INTAKE_OWNER_REVIEW_V1',HFT_LIVE_R1_PROFILE:'HFT_R1_PRODUCTION_LIVE_MASTERS_V1',HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
   HFT_LIVE_POSTING_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',HFT_ENABLE_PREVIEW_NEON_DISCOVERY:'false'}});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>{tail=(tail+String(v)).slice(-3000);});
 try{await wait(async()=>(await fetch(URL_ROOT+'/stores/intake')).status===200,'NEXT_DEV',75000);}
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
}catch(error){console.error('INTAKE_SECURITY_091_MOUNTED=FAIL',error);process.exitCode=1;}
finally{
 if(ws)ws.close();
 for(const child of [browser,server])if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{/* already stopped */}}
 await sleep(350);if(tmp)await rm(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:250});
}
