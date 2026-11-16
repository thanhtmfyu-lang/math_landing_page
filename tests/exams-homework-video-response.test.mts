import assert from 'node:assert/strict';
import {createBtvnApi} from '../api/btvn';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {createDraft} from '../src/native/exams/store';
import type {HomeworkState} from '../src/native/homework/btvn-contract';

const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'fake-video-response.vercel.app',MTM_BTVN_ENABLED:'1',SUPABASE_URL:'https://fake.invalid',SUPABASE_SERVICE_ROLE_KEY:'FAKE-SERVER-KEY',MTM_HOMEWORK_PUBLISHABLE_KEY:'FAKE-PUBLIC-KEY',MTM_BTVN_NETWORK_SECRET:'fake-network-test-only-'.repeat(3)};
const f=pipelineFixture(),made=createDraft(f.exam,'fake-video-attempt',1000000);assert.ok(made.ok);
function state(mode:'none'|'active'|'submitted'):HomeworkState{
 return {serverNow:1000000,exam:f.exam,fullName:'Người học giả',className:f.material.classNames[0],lessonCode:f.material.lessonCode,dueAt:null,maxAttempts:5,attemptsUsed:mode==='none'?0:1,draft:mode==='none'?null:{...made.value,submittedAt:mode==='active'?null:1000100},receipts:[],bestScore:null,demo:false,lessons:[{...f.material,videoId:'abcdefghijk',videoEmbeddable:true,available:true,dueAt:null,bestScore:null,late:null,submittedAt:null},{...f.material,lessonCode:'fake-no-video',videoId:null,available:true,dueAt:null,bestScore:null,late:null,submittedAt:null}]};
}
function fixture(mode:'none'|'active'|'submitted',checker:(id:string)=>Promise<boolean|null>,clock=()=>1000200){
 const repo=new SupabaseHomeworkRepository({async rpc(){throw Error('Không RPC thật trong fixture');}},async()=>({}));
 repo.call=async()=>state(mode);repo.login=async()=> 'a'.repeat(64);
 const api=createBtvnApi(()=>env,async()=>()=>repo,{checkVideoEmbed:checker,clock});
 return async(action:string)=>{
  let status=0,body:any;const headers:Record<string,string>={};
  const requestBody={action,...(action==='login'?{gate:{studentCode:'FAKE-CODE'}}:{}),...(['save','submit'].includes(action)?{attemptId:made.value.attemptId,answers:made.value.answers}:{})};
  await api({method:'POST',body:requestBody,headers:{host:env.VERCEL_URL,origin:'https://'+env.VERCEL_URL,'x-vercel-forwarded-for':'203.0.113.17',cookie:'mtm_btvn_demo='+'a'.repeat(64)}},{setHeader(key,value){headers[key]=value;},status(code){status=code;return {json(value){body=value;}};}});
  return {status,body,headers};
 };
}
const microtasks=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
// Bất kỳ transport fetch nào chạy ở đây đều là lỗi test, không gọi YouTube thật.
(globalThis as any).fetch=async()=>{throw Error('Không được ra mạng trong test video response');};
let count=0;
async function test(name:string,run:()=>Promise<void>){await run();console.log('ĐẠT '+(++count)+' '+name);}

await test('start không gọi checker dù có video và draft nào',async()=>{
 for(const mode of ['none','active','submitted'] as const){let calls=0;const call=fixture(mode,async()=>{calls++;throw Error('start không được gọi checker');});const response=await call('start');assert.equal(response.status,200);assert.equal(calls,0);assert.ok(response.body.lessons.every((lesson:any)=>lesson.videoEmbeddable===null));assert.equal(response.body.serverNow,1000200);}
});
await test('Gia hạn state/select khi draft active không gọi checker',async()=>{
 for(const action of ['state','select','login']){let calls=0;const call=fixture('active',async()=>{calls++;throw Error('Lượt đang chạy không được chờ metadata');});const response=await call(action);assert.equal(response.status,200);assert.equal(calls,0);assert.equal(response.body.lessons[0].videoEmbeddable,null);assert.equal(response.body.draft.submittedAt,null);}
});
await test('ACK save/submit không gọi checker, kể cả khi có lessons',async()=>{
 for(const action of ['save','submit']){let calls=0;const response=await fixture('submitted',async()=>{calls++;return true;})(action);assert.equal(response.status,200);assert.equal(calls,0);assert.equal(response.body.lessons[0].videoEmbeddable,null);}
});
await test('Danh sách buổi kiểm video, chờ kết quả và cập nhật serverNow sau await',async()=>{
 for(const action of ['login','state','select']){
  let calls=0,done=false,now=1000200,release!:(value:boolean)=>void;
  const call=fixture('none',async id=>{assert.equal(id,'abcdefghijk');calls++;return new Promise<boolean>(resolve=>{release=resolve;});},()=>now);
  const pending=call(action).then(response=>{done=true;return response;});await microtasks();assert.equal(calls,1);assert.equal(done,false,'Chưa xuất JSON khi kiểm danh sách còn pending');
  now=1002700;release(true);const response=await pending;assert.equal(response.status,200);assert.equal(response.body.lessons[0].videoEmbeddable,true);assert.equal(response.body.lessons[1].videoEmbeddable,null);assert.equal(response.body.serverNow,1002700);
 }
});
await test('Đã nộp xem danh sách vẫn kiểm; metadata lỗi không làm mất response bài',async()=>{
 let calls=0;const response=await fixture('submitted',async()=>{calls++;throw Error('Lỗi metadata giả');})('state');assert.equal(calls,1);assert.equal(response.status,200);assert.equal(response.body.lessons[0].videoEmbeddable,null);assert.equal(response.body.draft.submittedAt,1000100);assert.match(response.headers['Cache-Control'],/no-store/);
 const denied=await fixture('none',async()=>false)('state');assert.equal(denied.status,200);assert.equal(denied.body.lessons[0].videoEmbeddable,false);
});
console.log(`${count}/${count} ca video response đạt. Injection checker/clock và repository giả, không YouTube, không mạng thật.`);
