/** HFT 077: keep real lint + TS typecheck while excluding the unpatched
 * development-only picomatch/TS-eslint transitive chain. Never suppress npm
 * audit. TypeScript parses TS syntax; espree validates the emitted ESTree.
 * Rule coverage is deliberate: React hooks, JSX a11y, imports, JS safety.
 * Production and protected SQL sources are untouched.
 */
import ts from 'typescript';
import * as espree from 'espree';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

const tsParser={
 meta:{name:'hft-ts-compiler-espree',version:'1.0.0'},
 parseForESLint(source,options){
  const fileName=options.filePath||'input.tsx';
  const transpiled=ts.transpileModule(source,{
   fileName,reportDiagnostics:false,
   compilerOptions:{
    module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
    jsx:ts.JsxEmit.Preserve,isolatedModules:true,
    removeComments:false,newLine:ts.NewLineKind.LineFeed
   }
  }).outputText;
  return {ast:espree.parse(transpiled,{
   ecmaVersion:'latest',sourceType:'module',
   ecmaFeatures:{jsx:true},loc:true,range:true,
   tokens:true,comment:true
  })};
 }
};
const globalNames={...globals.node,...globals.browser,...globals.es2021};
const safeguards={
 'no-debugger':'error',
 'no-eval':'error',
 'no-implied-eval':'error',
 'no-new-func':'error',
 'no-unsafe-finally':'error',
 'no-dupe-args':'error',
 'no-dupe-else-if':'error',
 'no-duplicate-imports':'off',
 'import/no-duplicates':'error',
 'react-hooks/rules-of-hooks':'error',
 'react-hooks/exhaustive-deps':'warn',
 'react/jsx-key':'error',
 'react/jsx-no-duplicate-props':'error',
 'jsx-a11y/alt-text':'error',
 'jsx-a11y/anchor-has-content':'error',
 'jsx-a11y/aria-props':'error',
 'jsx-a11y/aria-proptypes':'error',
 'jsx-a11y/aria-unsupported-elements':'error',
 '@next/next/no-img-element':'warn'
};
const localNextRules={
 'no-img-element':{
  meta:{type:'suggestion',schema:[],
   docs:{description:'Use optimized images unless separately reviewed'}},
  create(context){
   return {JSXOpeningElement(node){
    if(node.name?.type==='JSXIdentifier'&&node.name.name==='img')
     context.report({node,message:'Prefer optimized Next images.'});
   }};
  }
 }
};
const plugins={'react-hooks':reactHooks,react, 'jsx-a11y':jsxA11y,
 import:importPlugin,'@next/next':{rules:localNextRules}};
export default [
 {ignores:['node_modules/**','.next/**','out/**','build/**','next-env.d.ts','**/*.d.ts']},
 {
  files:['**/*.{js,mjs,cjs}'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:globalNames},
  plugins,
  rules:{...safeguards,
   'no-undef':'error','no-unused-vars':['error',{argsIgnorePattern:'^_'}]}
 },
 {
  files:['**/*.{ts,tsx}'],
  languageOptions:{parser:tsParser,globals:globalNames},
  plugins,
  // TypeScript's strict noUnusedLocals/noUnusedParameters checks the original
  // TS source; avoid treating erased type imports as JavaScript unused vars.
  rules:safeguards
 },
 // C050 test-only isolated React VM loader uses new Function on transpiled
 // trusted repository sources; no runtime route or browser bundle imports it.
 {files:['tests/unit/hft-c050-react-render.test.ts'],
  rules:{'no-new-func':'off'}}
];
