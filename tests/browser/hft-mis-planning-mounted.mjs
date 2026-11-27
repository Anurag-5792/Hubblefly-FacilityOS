/** Actual mounted Next/Chromium UI regression, using ONLY synthetic intercepted responses.
 * No real credentials, database, actor enrollment, or production access.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url))),PORT=31169,URL_ROOT='http://127.0.0.1:'+PORT;
let server,browser,ws,tmp,sequence=0;
const pending=new Map();
async function wait(check,label,limit=25000){
 const end=Date.now()+limit;
 while(Date.now()<end){try{if(await check())return;}catch{/* bounded polling */}await sleep(100);}
 throw Error('MIS_PLANNING_BROWSER_TIMEOUT_'+label);
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

import {buildPlan} from '../../lib/hft/planning/build-plan.ts';
const scope={legalEntityId:'FIXTURE-HFT',siteId:'FIXTURE-SITE',warehouseId:'FIXTURE-WH'};
const at='2026-11-28T00:00:00.000Z';
const line=itemCode=>({itemCode,productVersion:'V1',uom:'PCS',quantity:'1'});
const bom=lines=>({revisionId:'FIXTURE-BOM',state:'APPROVED',complete:true,effectiveFrom:'2026-01-01T00:00:00.000Z',effectiveTo:null,lines});
const model=(id,lines)=>({id,name:'Synthetic drone '+id,version:'V1',active:true,bom:bom(lines)});
const item=(code,count,models)=>({...line(code),name:'Synthetic '+code,active:true,verified:true,applicableModels:models,usedEligibleModels:models,
 newOnHand:count,usedOnHand:'0',newFree:count,usedFree:'0',held:'0',unknown:'0',reservations:[],assembly:null});
const snapshot={scope,asOf:at,sourceEpoch:'FIXTURE-EPOCH',provenance:'SYNTHETIC BROWSER FIXTURE ONLY',authoritative:true,complete:true,
 models:[model('A',[line('COMMON'),line('AA')]),model('B',[line('COMMON'),line('BB')])],
 items:[item('COMMON','12',['A','B']),item('AA','10',['A']),item('BB','10',['B'])]};
const common=[{itemCode:'COMMON',productVersion:'V1',uom:'PCS',name:'Synthetic COMMON'}];
const catalog={state:'CATALOG',scope,asOf:at,sourceEpoch:snapshot.sourceEpoch,complete:true,models:snapshot.models.map(m=>({id:m.id,name:m.name,version:m.version,active:true,bomReady:true})),common};
const request=(mode,order)=>({scope,mode,condition:'NEW_ONLY',priorities:order.map(modelId=>({modelId,cap:null})),protect:[],ignore:mode==='CORE'?[{itemCode:'COMMON',productVersion:'V1',uom:'PCS'}]:[]});
const outcomes={FULL_AB:buildPlan(snapshot,request('FULL',['A','B'])),FULL_BA:buildPlan(snapshot,request('FULL',['B','A'])),CORE_BA:buildPlan(snapshot,request('CORE',['B','A']))};
assert.equal(outcomes.FULL_AB.combinedTotal,12);assert.equal(outcomes.CORE_BA.combinedTotal,20);
const mock=`(()=>{const catalog=${JSON.stringify(catalog)},outcomes=${JSON.stringify(outcomes)};
 const orig=window.fetch.bind(window);window.__misCalls=[];window.__deny=false;
 window.fetch=async(input,options={})=>{
 const path=typeof input==="string"?input:new URL(input.url).pathname;if(path!=="/api/hft/mis")return orig(input,options);
 const p=JSON.parse(options.body);window.__misCalls.push(p);
 if(window.__deny||JSON.stringify(p.scope)!==JSON.stringify(catalog.scope))return new Response(JSON.stringify({state:"UNAVAILABLE"}),{status:403});
 if(p.intent==="CATALOG")return new Response(JSON.stringify(catalog),{status:200});
 if(p.intent==="PLAN"){const k=p.scenario.mode+"_"+p.scenario.priorities.map(x=>x.modelId).join("");const d=outcomes[k];return new Response(JSON.stringify(d??{state:"UNAVAILABLE"}),{status:d?200:422});}
 return new Response(JSON.stringify({state:"UNAVAILABLE"}),{status:422});
 };})()`;

const captureDir=process.env.HFT_MIS_CAPTURE_DIR;
const captures=[];
async function viewport(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
async function has(t){return run('document.body.innerText.includes('+JSON.stringify(t)+')');}
async function click(text){
 await wait(()=>run('Boolean([...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(text)+'&&!x.disabled))'),'BUTTON_'+text);
 await run('[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==='+JSON.stringify(text)+'&&!x.disabled).click()');
}
async function field(index,value){
 await run('(()=>{const n=document.querySelectorAll("form input")['+index+'];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,'+JSON.stringify(value)+');n.dispatchEvent(new Event("input",{bubbles:true}));n.dispatchEvent(new Event("change",{bubbles:true}));})()');await sleep(100);
}
async function capture(name,width,height){
 if(!captureDir)throw Error('MIS_CAPTURE_DIR_REQUIRED');
 await viewport(width,height);await run('window.scrollTo(0,0)');await sleep(600);
 await run('(()=>{const e=document.createElement("div");e.id="test-watermark";e.textContent="SYNTHETIC TEST DATA · CI BROWSER CAPTURE";Object.assign(e.style,{padding:"10px",background:"#193632",color:"white",textAlign:"center"});document.body.append(e);const p=document.querySelector("nextjs-portal");if(p)p.style.display="none";})()');
 assert.ok(await run('document.documentElement.scrollWidth<=innerWidth+2'),'MOBILE_HORIZONTAL_OVERFLOW');
 assert.equal(await run('Boolean(document.getElementById("test-watermark"))'),true,'CAPTURE_WATERMARK_MISSING');
 const metrics=await send('Page.getLayoutMetrics');const h=Math.min(4000,Math.max(height,Math.ceil(metrics.cssContentSize.height)));
 const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:h,scale:1}});
 const bytes=Buffer.from(result.data,'base64');await writeFile(join(captureDir,name+'.png'),bytes,{flag:'wx'});
 captures.push({file:name+'.png',viewport:{width,height},sha256:createHash('sha256').update(bytes).digest('hex')});await run('document.getElementById("test-watermark")?.remove()');
}
async function workflow(){
 await mkdir(captureDir,{recursive:true});await viewport(1440,900);await send('Page.navigate',{url:URL_ROOT+'/mis'});
 await wait(()=>has('Verified model and effective BOM catalog unavailable.'),'NO_SOURCE');
 await capture('01-desktop-no-source',1440,900);await capture('02-mobile-no-source',390,844);await viewport(1440,900);
 for(const [i,value] of Object.values(scope).entries())await field(i,value);
 await click('Load source');await wait(()=>has('Synthetic drone A'),'CATALOG');
 await run('[...document.querySelectorAll("label")].find(l=>l.innerText.includes("Synthetic drone A")&&l.querySelector("input[type=checkbox]")).querySelector("input").click()');
 await run('[...document.querySelectorAll("label")].find(l=>l.innerText.includes("Synthetic drone B")&&l.querySelector("input[type=checkbox]")).querySelector("input").click()');
 await click('Show Build Readiness');await wait(()=>has('Full material-supported build plan'),'FULL_RESULT');
 await wait(()=>run('[...document.querySelectorAll("strong")].some(e=>e.textContent==="12")'),'FULL_TOTAL');
 await capture('03-desktop-full-build',1440,900);await capture('04-mobile-full-build',390,844);await viewport(1440,900);
 await run('document.querySelector("button[aria-label=\\"Move B up\\"]").click()');await click('Show Build Readiness');
 await wait(()=>run('window.__misCalls.at(-1).scenario.priorities[0].modelId==="B"'),'PRIORITY_REVERSAL');await wait(()=>has('Full material-supported build plan'),'REVERSED_RESULT');
 await run('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Core Build Potential")).click()');
 await wait(()=>has('Ignored shared requirements'),'CORE_OPTIONS');
 await run('[...document.querySelectorAll("label")].find(l=>l.innerText.includes("Synthetic COMMON")&&l.querySelector("input[type=checkbox]")).querySelector("input").click()');
 await click('Show Build Readiness');await wait(()=>has('Conditional core build potential'),'CORE_RESULT');await wait(()=>has('Full plan: 12 · Conditional core: 20'),'COMPARISON');
 await capture('05-desktop-core-build',1440,900);await capture('06-mobile-core-build',390,844);await viewport(1440,900);
 await run('window.__deny=true');await click('Show Build Readiness');await wait(()=>has('Source or authorization could not be verified.'),'DENIAL');
 assert.equal(await has('Synthetic drone A'),false);
 await writeFile(join(captureDir,'capture-metadata.json'),JSON.stringify({synthetic:true,source:process.env.GITHUB_SHA,images:captures},null,2)+'\n',{flag:'wx'});
 console.log('MIS_PLANNING_MOUNTED=PASS; source unavailable, priority controls, full/core results, denial clearing, desktop/mobile synthetic captures');
}

try{
 tmp=await mkdtemp(join(tmpdir(),'hft-mis-ui-'));
 let tail='';
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(PORT)],{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,NODE_ENV:'development',HFT_ENVIRONMENT:'test',
   HFT_AUTH_SOURCE:'verified',HFT_OPERATIONS_SOURCE:'database',
   HFT_LIVE_POSTING_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1',HFT_ENABLE_PREVIEW_NEON_DISCOVERY:'false'}});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>{tail=(tail+String(v)).slice(-3000);});
 try{await wait(async()=>(await fetch(URL_ROOT+'/mis')).status===200,'NEXT_DEV',75000);}
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
}catch(error){console.error('MIS_PLANNING_MOUNTED=FAIL',error);process.exitCode=1;}
finally{
 if(ws)ws.close();
 for(const child of [browser,server])if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{/* already stopped */}}
 await sleep(350);if(tmp)await rm(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:250});
}
