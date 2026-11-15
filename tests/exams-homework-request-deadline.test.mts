import assert from 'node:assert/strict';
import {withHomeworkDeadline,assertHomeworkRequestActive,assertHomeworkResponseHeaders,HomeworkRequestTimeout,HOMEWORK_SESSION_UNCERTAIN} from '../src/native/homework/request-deadline';
import {createHomeworkSaver} from '../src/native/homework/remote-save';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {createDraft} from '../src/native/exams/store';

const pause=(ms=8)=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
let count=0;
async function test(name:string,run:()=>Promise<void>){await run();console.log('ĐẠT '+(++count)+' '+name);}

for(const action of ['classes','state','select','start','save','submit'])await test('Hết hạn cả khi trình duyệt không ngắt fetch: '+action,async()=>{
  let signal!:AbortSignal;
  await assert.rejects(withHomeworkDeadline(action,s=>{signal=s;return new Promise(()=>{});},2),HomeworkRequestTimeout);
  assert.equal(signal.aborted,true);
  assert.equal(await withHomeworkDeadline(action,async()=> 'same-request-recovered',20),'same-request-recovered');
});

await test('Deadline còn hiệu lực khi đã nhận headers nhưng thân JSON không trả',async()=>{
  const body=pending<{ok:boolean}>();let applied=false;
  const request=withHomeworkDeadline('state',async signal=>{
    assertHomeworkResponseHeaders(signal,'state');
    const result=await body.promise;
    assertHomeworkRequestActive(signal,'state');applied=true;return result;
  },2);
  await assert.rejects(request,HomeworkRequestTimeout);
  body.resolve({ok:true});await pause();assert.equal(applied,false,'Phản hồi muộn không cập nhật giao diện');
});

await test('Lưu/nộp bị treo trả về lỗi thử lại, giữ nguyên lượt và đáp án',async()=>{
  const f=pipelineFixture(),made=createDraft(f.exam,'fake-deadline-attempt',Date.now());assert.ok(made.ok);
  const sent={...made.value,answers:{'mc-1':'B'},revision:4};
  const replies=pending<any>();let calls=0;const saved:any[]=[],statuses:any[]=[],requests:any[]=[];
  const saver=createHomeworkSaver({delay:60000,send:draft=>{
    requests.push(draft);calls++;
    return calls===1?withHomeworkDeadline('save',async()=>replies.promise,2):Promise.resolve({draft:sent,receipts:[]});
  },onSaved:s=>saved.push(s),onStatus:s=>statuses.push(s)});
  saver.update(sent);saver.retry();await saver.settled();
  assert.equal(saver.pending(),true);assert.equal(statuses.at(-1).failed,true);assert.equal(saved.length,0);
  saver.retry();await saver.settled();assert.equal(saved.length,1);assert.equal(saver.pending(),false);
  assert.equal(requests[0].attemptId,requests[1].attemptId);assert.equal(requests[0].revision,requests[1].revision);assert.deepEqual(requests[1].answers,{'mc-1':'B'});
  replies.resolve({draft:{...sent,answers:{'mc-1':'A'}},receipts:[]});await pause();assert.equal(saved.length,1,'ACK cũ không ghi đè bản mới');
  saver.dispose();
});

await test('Auth trả headers muộn báo phiên chưa chắc; JSON muộn không hủy phiên mới',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');const win=new EventTarget();
  Object.defineProperty(globalThis,'window',{value:win,configurable:true});let notices=0;win.addEventListener(HOMEWORK_SESSION_UNCERTAIN,()=>notices++);
  try{
    let signal!:AbortSignal;
    await assert.rejects(withHomeworkDeadline('login',s=>{signal=s;return new Promise(()=>{});},2),HomeworkRequestTimeout);
    assert.equal(notices,1);
    assert.throws(()=>assertHomeworkResponseHeaders(signal,'login'),HomeworkRequestTimeout);assert.equal(notices,2,'Late Set-Cookie phải đóng nội dung riêng đang mở');
    assert.throws(()=>assertHomeworkRequestActive(signal,'login'),HomeworkRequestTimeout);assert.equal(notices,2,'Thân JSON muộn không đổi cookie và không hủy phiên mới');
    assert.throws(()=>assertHomeworkResponseHeaders(signal,'save'),HomeworkRequestTimeout);assert.equal(notices,2);
  }finally{if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete (globalThis as any).window;}
});

await test('Thành công/lỗi thường dọn timer và giữ nguyên nguyên nhân',async()=>{
  let signal!:AbortSignal;
  assert.equal(await withHomeworkDeadline('classes',async s=>{signal=s;return 7;},2),7);
  await pause();assert.equal(signal.aborted,false);
  const error=new Error('FAKE_API_ERROR');await assert.rejects(withHomeworkDeadline('save',async()=>{throw error;},2),e=>e===error);
});
