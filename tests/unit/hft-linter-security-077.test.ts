/** Exact lint-toolchain replacement verification for R77 audit remediation.
 * All inputs are synthetic source snippets; no network, database or secrets.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ESLint} from 'eslint';

const lint=new ESLint({overrideConfigFile:'eslint.config.mjs',fix:false});
async function rules(source:string,filename:string):Promise<Set<string>>{
 const results=await lint.lintText(source,{filePath:filename});
 return new Set(results.flatMap(x=>x.messages).map(x=>x.ruleId||'parser-error'));
}

test('TypeScript/TSX linter still detects unsafe conditional React hooks',async()=>{
 const failed=await rules(`
  import {useState} from 'react';
  export function Conditional({ready}:{ready:boolean}) {
   if(ready)useState(0);
   return <div>Only a synthetic test component</div>;
  }
 `,'app/hft-eslint-probe.tsx');
 assert.ok(failed.has('react-hooks/rules-of-hooks'),[...failed].join(','));
});

test('TypeScript/TSX linter preserves Next image exception and JSX a11y',async()=>{
 const failed=await rules(`
  export function ImageWithoutAlt() {return <img src="/synthetic.png" />;}
 `,'app/hft-eslint-a11y-probe.tsx');
 assert.ok(failed.has('@next/next/no-img-element'),[...failed].join(','));
 assert.ok(failed.has('jsx-a11y/alt-text'),[...failed].join(','));
});

test('JavaScript and TypeScript retain direct eval/Function denial',async()=>{
 for(const [snippet,path,rule] of [
  ['eval("1+1")','tools/hft-eslint-eval-probe.mjs','no-eval'],
  ['const invoke = new Function("return 1");','app/hft-eslint-function-probe.ts','no-new-func']
 ]){
  const failed=await rules(snippet,path);
  assert.ok(failed.has(rule),`${path}: ${[...failed].join(',')}`);
 }
});
