import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pipelineFixture} from './btvn-pipeline-fixture';

// Import the actual checked-in deployment artifact by runtime file URL, rather
// than letting this test's esbuild step silently substitute the TS handler.
const generated=resolve('supabase/functions/mtm-btvn-publish/handler.generated.js');
const hash=createHash('sha256').update(readFileSync(generated)).digest('hex');
const {createBtvnPublishHandler}=await import(pathToFileURL(generated).href+'?sha256='+hash);
const secret='generated-publisher-local-fixture-'.repeat(2),commits:any[]=[],uploads:string[]=[];
const handler=createBtvnPublishHandler({async rpc(action:string,payload:any){if(action==='lookup')return {status:null};assert.equal(action,'publish');commits.push(payload);return {status:'da_dang'};},async upload(path:string){uploads.push(path);}},secret,{scheduleEnv:{}});
const fixture=pipelineFixture(),title='Đề kiểm tra tự đặt · lớp 11 · fixture riêng';
fixture.exam.grade=11;fixture.exam.title=title;fixture.exam.durationMinutes=2;
const body={...fixture,kind:'kiem-tra',assessmentId:'11111111-1111-4111-8111-111111111111',examType:'custom',opensAt:'2026-11-14T05:42:17.551+00:00',closesAt:'2026-11-14T08:47:17.551+00:00',material:{...fixture.material,title,classNames:['Lớp giả pipeline'],classDates:{'Lớp giả pipeline':fixture.material.date}}};
const send=(value:unknown)=>handler(new Request('https://generated-fixture.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify(value)}));
const result=await send(body);
assert.equal(result.status,200,result.headers.get('X-MTM-Reject-Code')??'');
assert.equal((await result.json()).status,'da_dang');assert.equal(commits.length,1);assert.equal(uploads.length,fixture.assets.length);
const actual=commits[0];assert.equal(actual.kind,'kiem-tra');assert.equal(actual.assessmentId,body.assessmentId);assert.equal(actual.examType,'custom');assert.equal(actual.opensAt,body.opensAt);assert.equal(actual.closesAt,body.closesAt);assert.equal(actual.exam.title,title);assert.equal(actual.material.title,title);assert.equal(actual.exam.durationMinutes,2);assert.equal(actual.exam.grade,11);assert.deepEqual(actual.material.classNames,body.material.classNames);assert.deepEqual(actual.material.classDates,body.material.classDates);
for(const mutation of [{kind:'unknown-kind'},{assessmentId:'bad-id'},{examType:'other'},{closesAt:body.opensAt},{exam:{...fixture.exam,title:'Mismatched title'}}]){
 const rejected=await send({...body,...mutation});assert.equal(rejected.status,422);assert.equal((await rejected.json()).error_code,'PUBLISH_REJECTED');assert.equal(commits.length,1,'invalid input must never reach publish');
 assert.equal(rejected.headers.get('X-MTM-Reject-Code'),Object.hasOwn(mutation,'kind')?'INVALID_KIND':Object.hasOwn(mutation,'closesAt')?'INVALID_ASSESSMENT_WINDOW':Object.hasOwn(mutation,'exam')?'ASSESSMENT_SOURCE_MISMATCH':'INVALID_ASSESSMENT_METADATA');
}
// Rebuild to memory and compare bytes. A later TS change without regeneration
// fails this test even when the old deployment artifact still imports cleanly.
execFileSync(process.execPath,['scripts/build-btvn-publish.mjs','--check'],{cwd:process.cwd(),stdio:'pipe'});
console.log('generated publisher: actual artifact custom assessment + five invalid cases + deterministic source parity PASS');
