/** C050 React server-render integration smoke tests.
 * Load HFT TSX via the repository's existing TypeScript compiler; no new
 * runtime packages, jsdom, donor components or browser authority.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createElement,type ComponentType} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const requireModule=createRequire(import.meta.url);
const root=resolve(process.cwd());
type Entry=Record<string,unknown>;
function loadComponent(filename:string,exportName:string):ComponentType<Entry>{
 const source=readFileSync(filename,'utf8');
 const generated=ts.transpileModule(source,{
  fileName:filename,reportDiagnostics:true,compilerOptions:{
   module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,
   target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 assert.equal(generated.diagnostics?.length??0,0);
 const css=new Proxy({}, {get(_target,prop){return typeof prop==='string'?prop:undefined;}});
 const module={exports:{} as Record<string,unknown>};
 function localRequire(name:string):unknown{
  if(name.endsWith('.module.css'))return {__esModule:true,default:css};
  if(name.startsWith('.')&&name.endsWith('.ts'))
   return requireModule(resolve(dirname(filename),name));
  return requireModule(name);
 }
 const execute=new Function('require','module','exports',generated.outputText) as
  (req:(name:string)=>unknown,mod:typeof module,exp:Record<string,unknown>)=>void;
 execute(localRequire,module,module.exports);
 const component=module.exports[exportName];
 assert.equal(typeof component,'function');
 return component as ComponentType<Entry>;
}
const employee=loadComponent(resolve(root,'lib/hft/ui-reuse/EmployeeMasterDirectory.tsx'),
 'EmployeeMasterDirectory');
const owner=loadComponent(resolve(root,'lib/hft/ui-reuse/OwnerAccessProposalEditor.tsx'),
 'OwnerAccessProposalEditor');
const scope={legalEntityId:'HFT',siteId:'SITE1',warehouseId:'WH1'};
const rows=[{kind:'EMPLOYEE',record_id:'EMP1',legal_entity_id:'HFT',
 site_id:'SITE1',warehouse_id:'',version:2,active:true,
 master_values:{fullName:'Employee One',department:'Stores',
  designation:'Operator',siteId:'SITE1'}}];
test('C050 integrated Employee directory server-renders a real scoped P3 LIST',()=>{
 const output=renderToStaticMarkup(createElement(employee,{
  rawP3Records:rows,requestedScope:scope,verifiedReadResponse:true,
  mayRequestEdit:true,onRequestEdit:()=>{throw Error('CALLBACK_NOT_FOR_SSR');}}));
 assert.match(output,/Employee directory/);
 assert.match(output,/Employee One/);
 assert.match(output,/Stores/);
 assert.match(output,/Operator/);
 assert.match(output,/Request edit/);
 assert.match(output,/SCOPED P3 LIST/);
});
test('C050 Employee directory never renders unverified or cross-scope data',()=>{
 for(const input of [
  {rawP3Records:rows,verifiedReadResponse:false},
  {rawP3Records:[{...rows[0],site_id:'SITE2'}],verifiedReadResponse:true}
 ]){
  const output=renderToStaticMarkup(createElement(employee,{
   ...input,requestedScope:scope,mayRequestEdit:true,onRequestEdit:()=>{}}));
  assert.doesNotMatch(output,/Employee One/);
  assert.match(output,/READ UNAVAILABLE/);
  assert.match(output,/disabled/);
 }
});
test('C050 OWNER UI renders blocked while IAM role and scope are unqualified',()=>{
 const output=renderToStaticMarkup(createElement(owner,{
  actor:null,...scope,policyGeneration:0,onPropose:()=>{throw Error('NOT_ALLOWED');}}));
 assert.match(output,/Verified OWNER policy/);
 assert.match(output,/NO EFFECTIVE GRANTS/);
 assert.match(output,/PROPOSED_NOT_APPLIED/);
 assert.doesNotMatch(output,/type="checkbox"/);
 assert.doesNotMatch(output,/<form/);
});
test('C050 OWNER proposal editor lists seven exact registered views only for fixture OWNER',()=>{
 const actor={subject:'PERSON_OWNER',active:true,
  systemRoles:['OWNER_SUPERADMIN'],viewPermissions:[],
  grantableScopes:[scope],policyGeneration:3};
 const output=renderToStaticMarkup(createElement(owner,{
  actor,...scope,policyGeneration:3,onPropose:()=>{}}));
 assert.equal((output.match(/type="checkbox"/g)||[]).length,7);
 assert.match(output,/stores.operations.view/);
 assert.doesNotMatch(output,/stock.post/);
 assert.doesNotMatch(output,/admin\/access/);
});
test('C050 components mounted on existing Masters page; no operational admin route',()=>{
 const page=readFileSync(resolve(root,'app/stores/masters/page.tsx'),'utf8');
 assert.match(page,/EmployeeMasterDirectory/);
 assert.match(page,/OwnerAccessProposalEditor/);
 assert.match(page,/setEmployeeList/);
 assert.match(page,/P3_SIGNED_LIST_READBACK_NOT_AVAILABLE/);
 assert.match(page,/actor=\{null\}/);
 assert.equal(existsSync(resolve(root,'app/admin/access/page.tsx')),false);
});
