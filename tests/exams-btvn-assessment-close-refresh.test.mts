import assert from 'node:assert/strict';
import {mount,state,all,f} from './daily20-session-harness.mts';
import {HomeworkService} from '../server/btvn/service';
import {MemoryHomeworkRepository} from '../server/btvn/repository';
import type {HomeworkState} from '../src/native/homework/btvn-contract';

// Mount the actual HomeworkSession and fire its real interval callback. The
// transport is held in RAM by the shared harness; no browser/server is contacted.
const originalNow=Date.now,originalSetInterval=globalThis.setInterval,originalClearInterval=globalThis.clearInterval;
const T0=Date.UTC(2026,10,14,10),closesAt=T0+120000,clientSkew=7*60*60*1000;
let serverClock=T0,nextTimer=0;
const timers=new Map<number,()=>void>();
Date.now=()=>serverClock+clientSkew;
globalThis.setInterval=((callback:()=>void,delay:number)=>{assert.equal(delay,60000);timers.set(++nextTimer,callback);return nextTimer;}) as any;
globalThis.clearInterval=((id:number)=>{timers.delete(id);}) as any;
const fire=()=>{assert.equal(timers.size,1,'One session renewal timer is active.');[...timers.values()][0]();};
const current=(view:Awaited<ReturnType<typeof mount>>):HomeworkState=>{
 const node=all(view.runtime.value,n=>n.props?.state?.lessonCode==='buoi-gia')[0];
 assert.ok(node,'The mounted session exposes its actual current state to its child.');return node.props.state;
};
let cases=0;
try{
 for(const kind of ['kiem-tra-thang','kiem-tra'] as const){
  serverClock=T0;
  const exam={...f.exam,durationMinutes:kind==='kiem-tra'?2:120};
  const student={studentCode:'SYNTHETIC-CLOSE-ONLY',fullName:'Người học GIẢ A',phone:'0000000000',className:'LỚP GIẢ'};
  const repository=new MemoryHomeworkRepository([student]);
  const service=new HomeworkService(repository,exam,closesAt,'synthetic-class','buoi-gia',()=>serverClock,[{
   kind,lessonCode:'buoi-gia',title:exam.title,classNames:[student.className],date:'2026-11-14',opensAt:T0-60000,closesAt,
   videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null,
  }]);
  const token=service.login({studentCode:student.studentCode},'synthetic-network');
  const draft=service.start(token).draft!;
  const answers=Object.fromEntries(exam.questions.map(q=>[q.id,q.kind==='short'?q.acceptedAnswers[0]:q.kind==='self'?'':q.answer]));
  const hidden:HomeworkState={...service.submit(token,draft.attemptId,answers),demo:false,assetsExpiresAt:T0+150*60*1000};
  assert.equal(hidden.solutionsAvailable,false);assert.equal(hidden.receipts[0].score,null);
  const view=await mount(hidden);
  try{
   const initialRequests=view.requests.length;
   for(const beforeClose of [T0+60000,closesAt-1]){
    serverClock=beforeClose;fire();await view.settle();
    assert.equal(view.requests.length,initialRequests,kind+': a fast client clock must not reveal results or bypass the fresh-asset renewal window before the server close.');
    assert.equal(current(view).solutionsAvailable,false);assert.equal(current(view).bestScore,null);
   }
   serverClock=closesAt;fire();await view.settle();
   assert.equal(view.requests.length,initialRequests+1,kind+': reaching the actual close must fetch server state even with 150-minute asset signatures.');
   const request=view.requests.at(-1)!;
   assert.equal(request.body.action,'state');assert.equal(request.body.lessonCode,hidden.lessonCode);
   assert.equal(request.body.answers,undefined,'The reveal refresh must not submit or modify answers.');
   fire();await view.settle();assert.equal(view.requests.length,initialRequests+1,'Concurrent ticks share the same pending state read.');
   const published={...service.state(token),demo:false,assetsExpiresAt:hidden.assetsExpiresAt};
   assert.equal(published.solutionsAvailable,true);assert.equal(published.receipts[0].score,10);
   request.reply(200,published);await view.settle();
   assert.equal(current(view).solutionsAvailable,true);assert.equal(current(view).bestScore,10);
   assert.equal(current(view).receipts[0].score,10);assert.equal(current(view).draft?.attemptId,draft.attemptId);
   serverClock+=60000;fire();await view.settle();
   assert.equal(view.requests.length,initialRequests+1,'Already published results must not force another read while asset signatures are fresh.');cases++;
  }finally{view.dispose();assert.equal(timers.size,0);}
 }
 // A homework response carrying an incidental closesAt is not a timed test.
 serverClock=T0;
 const homework=await mount({...state(),kind:'btvn',serverNow:T0,closesAt,solutionsAvailable:false,assetsExpiresAt:T0+150*60*1000});
 try{const count=homework.requests.length;serverClock=closesAt;fire();await homework.settle();assert.equal(homework.requests.length,count);cases++;}
 finally{homework.dispose();assert.equal(timers.size,0);}
}finally{Date.now=originalNow;globalThis.setInterval=originalSetInterval;globalThis.clearInterval=originalClearInterval;}
console.log('Assessment close refresh: '+cases+' mounted-session cases PASS (both timed kinds, server-clock boundary, coalescing, publication and homework control).');
