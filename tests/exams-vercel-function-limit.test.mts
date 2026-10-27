import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Vite project: Vercel's zero-config Node API detector uses api/**/*.+(js|mjs|ts|tsx),
// excluding dot/underscore segments, node_modules and .d.ts, including subfolders.
// Source: https://github.com/vercel/vercel/blob/main/packages/fs-detectors/src/detect-builders.ts
function functionsUnder(dir:string,prefix='api'):string[]{
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  if(/^[._]/.test(entry.name)||entry.name==='node_modules')return [];
  const name=prefix+'/'+entry.name;
  if(entry.isDirectory())return functionsUnder(join(dir,entry.name),name);
  return entry.isFile()&&/\.(js|mjs|ts|tsx)$/.test(entry.name)&&!entry.name.endsWith('.d.ts')?[name]:[];
 }).sort();
}
function assertBudget(files:string[]){
 assert.ok(files.length<=12,`Vercel function count=${files.length}; limit=12. Reuse an existing route; move helpers to server/.\n${files.join('\n')}`);
}
const root=process.env.MTM_ROOT??process.cwd();
const temp=mkdtempSync(join(root,'.qa-temp','function-limit-'));
try{
 for(let i=0;i<11;i++)writeFileSync(join(temp,`route${i}.ts`),'export default ()=>{};');
 mkdirSync(join(temp,'btvn'));writeFileSync(join(temp,'btvn','avatar.ts'),'export default ()=>{};');
 for(const folder of ['_helpers','.hidden','node_modules']){mkdirSync(join(temp,folder));writeFileSync(join(temp,folder,'helper.ts'),'');}
 for(const file of ['_helper.ts','.hidden.ts','types.d.ts','README.md'])writeFileSync(join(temp,file),'');
 assert.equal(functionsUnder(temp).length,12);assertBudget(functionsUnder(temp));
 writeFileSync(join(temp,'btvn','thirteenth.mjs'),'export default ()=>{};');
 assert.throws(()=>assertBudget(functionsUnder(temp)),/function count=13; limit=12/);
}finally{rmSync(temp,{recursive:true,force:true});}
const files=functionsUnder(join(root,'api'));
assert.ok(files.includes('api/btvn/avatar.ts'),'Nested avatar function must be counted');
assertBudget(files);
console.log(`Vercel function count=${files.length}/12; recursive budget and 13th-function regression passed.`);
