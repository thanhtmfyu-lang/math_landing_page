import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {normalizeStudentCode,validStudentCode,STUDENT_CODE_ERROR} from '../src/native/homework/student-code';
import {createHomeworkHandler} from '../supabase/functions/mtm-homework-access/handler';
import {mathTokens} from '../src/native/exams/review';
import {gatewayErrorMessage,BUSY} from '../server/btvn/supabase-transport';
for(const status of [400,401,403,404,409,415,429])assert.notEqual(gatewayErrorMessage(status,'resolve'),BUSY);
for(const status of [408,500,502,503,504])assert.equal(gatewayErrorMessage(status,'resolve'),BUSY);
assert.equal(gatewayErrorMessage(400,'resolve'),STUDENT_CODE_ERROR);
const code='0123456789abcdef'.repeat(2);
for(const input of [code,code.toUpperCase(),'HS-'+code,' Hs—'+code.slice(0,16)+' ‐‑‒–−\u200B\u200C\u200D\uFEFF'+code.slice(16)]){
  assert.equal(normalizeStudentCode(input),code);assert.ok(validStudentCode(normalizeStudentCode(input)));
}
for(const input of ['',code.slice(1),code+'f','x'.repeat(32),'other-student/'+code])assert.equal(validStudentCode(normalizeStudentCode(input)),false);
const calls:{name:string;args:Record<string,unknown>}[]=[];
const handler=createHomeworkHandler({publishableKey:'fixture',origins:['https://fixture.invalid'],networkKey:async()=> 'f'.repeat(64),rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};},download:async()=>{throw Error('not allowed');}});
const send=(value:string)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{Origin:'https://fixture.invalid',apikey:'fixture','Content-Type':'application/json'},body:JSON.stringify({operation:'resolve',code:value})}));
assert.equal((await send('HS–'+code.toUpperCase())).status,200);
assert.equal(calls.find(c=>c.name==='mtm_hw_resolve_code')?.args.p_code,code);
calls.length=0;assert.equal((await send('bad')).status,400);assert.ok(!calls.some(c=>c.name==='mtm_hw_resolve_code'));
for(const input of ['x^2 + y^-3','(x)^12','x^2^3','a^2b','^2','x^2.5'])assert.equal(mathTokens(input).map(t=>t.raw).join(''),input);
assert.deepEqual(mathTokens('x^2 + y^-3').filter(t=>t.exponent).map(t=>t.exponent),['2','-3']);

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file:string){const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;const mod={exports:{} as any};new Function('require','module','exports',code)(require,mod,mod.exports);return mod.exports;}
const file={url:`/exam-assets/${'a'.repeat(64)}.pdf`,sha256:'a'.repeat(64),verified:true,bytes:100,totalPages:1,questionPages:[1]};
const Fallback=load('src/native/exams/QuestionPdfFallback.tsx').default;
const html=renderToStaticMarkup(React.createElement(Fallback,{file}));
assert.ok(html.includes('Mở đề PDF ở tab mới'));assert.ok(html.includes('target="_blank"'));assert.ok(html.includes(file.url));
assert.equal(renderToStaticMarkup(React.createElement(Fallback,{file:{...file,url:'javascript:alert(1)'}})),'');
const Gate=load('src/native/homework/HomeworkGate.tsx').default;
const gate=renderToStaticMarkup(React.createElement(Gate,{studentCode:'bad',identity:{fullName:'',phone:'',className:''},busy:false,onCode(){},onIdentity(){},onLogin(){}}));
assert.match(gate,/type="text"[^>]*autoCapitalize="none"[^>]*autoCorrect="off"[^>]*spellcheck="false"/);
assert.ok(STUDENT_CODE_ERROR.includes('kiểm tra lại mã'));
console.log('F1-F5 browser compatibility: normalization, gateway, exponent text, authorized fallback and code field passed.');
