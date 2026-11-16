import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import type {PracticeExam} from '../src/native/exams/data';
import {createDraft,draftKey,type Draft} from '../src/native/exams/store';
import {FakeStore} from './exams-harness.mts';
import {pipelineFixture} from './btvn-pipeline-fixture';

// Synthetic hook lifecycle only. No browser, live student, server or network.
const root=process.env.MTM_ROOT??process.cwd(),require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild'),fixture=join(root,'tests/fixtures/attempt-react.mts');
const code=buildSync({stdin:{contents:"export {usePracticeAttempt} from './usePracticeAttempt'; export {SOURCE_HOLDS} from './source-holds'; export {PRACTICE_ERRATA} from './practice-errata';",resolveDir:join(root,'src/native/exams'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture},loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const module={exports:{} as any};
new Function('require','module','exports',code)((name:string)=>name.endsWith('.css')?{}:require(name),module,module.exports);
const {usePracticeAttempt,SOURCE_HOLDS,PRACTICE_ERRATA}=module.exports;

class Runtime {
 slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;
 constructor(public fn:()=>any){}
 state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return [this.slots[i].value,(value:any)=>{const next=typeof value==='function'?value(this.slots[i].value):value;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
 ref(value:any){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
 same(a:any,b:any){return a&&b&&a.length===b.length&&a.every((value:any,i:number)=>Object.is(value,b[i]));}
 memo(value:any,deps:any){const i=this.index++;if(!this.slots[i]||!this.same(this.slots[i].deps,deps))this.slots[i]={value,deps};return this.slots[i].value;}
 effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!this.same(old.deps,deps)){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
 flush(){for(let round=0;round<30;round++){(globalThis as any).__mtmHookRuntime=this;this.index=0;this.changed=false;this.value=this.fn();this.effects.splice(0).forEach(fn=>fn());if(!this.changed)return this.value;}throw Error('Synthetic hook did not settle');}
 dispose(){this.slots.forEach(slot=>slot?.cleanup?.());}
}
class BrowserEvents extends EventTarget {
 removeEventListener(type:string,listener:any,options?:boolean|EventListenerOptions){super.removeEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}
}
const T0=Date.UTC(2026,10,16,1),originalNow=Date.now,originalClearInterval=globalThis.clearInterval;
let clock=T0+5000,timerId=0;
const timers=new Map<number,()=>void>(),windows=new BrowserEvents(),documents=new BrowserEvents();
const oldGlobals=new Map(['window','document','location','history'].map(key=>[key,(globalThis as any)[key]]));
const browser=Object.assign(windows,{localStorage:new FakeStore(),setInterval(fn:()=>void){timers.set(++timerId,fn);return timerId;}});
Object.assign(globalThis,{window:browser,document:Object.assign(documents,{getElementById(){return null;},querySelector(){return null;}}),location:new URL('https://synthetic.invalid/btvn'),history:{pushState(){},back(){}}});
globalThis.clearInterval=((id:number)=>{timers.delete(id);}) as any;
Date.now=()=>clock;

const source=pipelineFixture().exam;
const exam:PracticeExam={...source,id:'mtm-custom-synthetic-server-resume',title:'Đề GIẢ kiểm tiếp tục lượt máy chủ',sections:[{label:'Trắc nghiệm GIẢ',kind:'mc',count:3}],questions:[3000,3000,4000].map((maxMillipoints,index)=>({id:'SYNTHETIC-MC-'+(index+1),kind:'mc' as const,sourceRef:'Câu GIẢ '+(index+1),prompt:'Câu hỏi GIẢ, không giao học sinh.',choices:['0','1','2','3'],answer:'B' as const,maxMillipoints})),questionCount:3};
function serverDraft(current=exam,answers:Draft['answers']={}):Draft{
 const made=createDraft(current,'SYNTHETIC-SERVER-ATTEMPT',T0);assert.ok(made.ok,JSON.stringify(made));
 return {...made.value,revision:3,updatedAt:T0+1000,answers:structuredClone(answers)};
}
const storeFor=(draft:Draft,current=exam)=>new FakeStore({[draftKey(current.id)]:JSON.stringify(draft)});
function mount(store:FakeStore|undefined,extra:Record<string,unknown>={},current=exam){
 const starts:unknown[]=[],submits:Draft[]=[];
 const props={exam:current,catalogUrl:'/btvn',isHomework:true,autoResumeServerDraft:true,...(store?{storeOverride:store}:{}),onServerStart:async(previous:Draft|null)=>{starts.push(previous);},onServerSubmit:async(draft:Draft)=>{submits.push(structuredClone(draft));return draft.answers;},...extra};
 const runtime=new Runtime(()=>usePracticeAttempt(props));
 return {runtime,props,starts,submits,draw:()=>runtime.flush(),dispose:()=>runtime.dispose()};
}
async function settle(view:ReturnType<typeof mount>){for(let i=0;i<8;i++){await Promise.resolve();view.draw();}}
let passed=0;
async function test(name:string,run:()=>void|Promise<void>){await run();assert.equal(timers.size,0,'Every mounted hook must release its timers');console.log('ĐẠT '+(++passed)+' '+name);}

try{
 await test('Mặc định và opt-out không tự tiếp tục; cờ không áp dụng cho luyện tập hoặc localStore',()=>{
  for(const extra of [{autoResumeServerDraft:undefined},{autoResumeServerDraft:false},{isHomework:false,autoResumeServerDraft:true}]){
   const draft=serverDraft(),store=storeFor(draft),view=mount(store,extra);
   try{const state=view.draw();assert.equal(state.draft,null);assert.equal(state.startLabel,'Tiếp tục làm bài');assert.equal(store.sets,0);assert.equal(view.starts.length,0);assert.equal(view.submits.length,0);}
   finally{view.dispose();}
  }
  const draft=serverDraft();browser.localStorage=storeFor(draft);
  const view=mount(undefined);
  try{assert.equal(view.draw().draft,null,'A localStorage draft is not an injected server draft');assert.equal(browser.localStorage.sets,0);}
  finally{view.dispose();browser.localStorage=new FakeStore();}
 });

 await test('Draft máy chủ hợp lệ vào RAM ngay, không bấm tiếp lần hai và không ghi/gọi start lúc mount',()=>{
  const draft=serverDraft(),store=storeFor(draft),bytes=store.getItem(draftKey(exam.id)),view=mount(store);
  try{
   const state=view.draw();assert.deepEqual(state.draft,draft);assert.equal(state.submitted,false);
   assert.equal(state.draft.attemptId,draft.attemptId);assert.equal(state.draft.startedAt,T0);assert.equal(state.draft.deadline,draft.deadline);
   assert.equal(store.getItem(draftKey(exam.id)),bytes);assert.equal(store.sets,0);assert.equal(view.starts.length,0);assert.equal(view.submits.length,0);
  }finally{view.dispose();}
 });

 await test('Tải lại và chuyển browser giữ một B, thêm hai B rồi nộp cùng lượt và không sửa hạn',async()=>{
  clock=T0+5000;
  const first=serverDraft(),safari=storeFor(first),a=mount(safari);
  let saved!:Draft;
  try{
   a.draw();a.runtime.value.changeAnswer(exam.questions[0].id,'B');a.draw();
   saved=JSON.parse(safari.getItem(draftKey(exam.id))!);assert.deepEqual(saved.answers,{[exam.questions[0].id]:'B'});
  }finally{a.dispose();}
  clock+=7000;
  const reload=mount(safari);
  try{assert.deepEqual(reload.draw().draft.answers,saved.answers);assert.equal(reload.runtime.value.draft.deadline,first.deadline);assert.equal(reload.starts.length,0);}
  finally{reload.dispose();}
  // Separate synthetic storage instances model the same server snapshot received
  // by another browser. This is not an HTTP/server ACK or a physical-phone test.
  const zalo=storeFor(saved),b=mount(zalo);
  try{
   assert.deepEqual(b.draw().draft.answers,saved.answers);
   for(const question of exam.questions.slice(1)){clock+=1000;b.runtime.value.changeAnswer(question.id,'B');b.draw();}
   assert.equal(b.runtime.value.answered,3);
   await b.runtime.value.finish(false);await settle(b);
   assert.equal(b.runtime.value.submitted,true);assert.equal(b.submits.length,1);assert.equal(b.starts.length,0);
   const submitted=b.submits[0];assert.equal(submitted.attemptId,first.attemptId);assert.equal(submitted.startedAt,first.startedAt);assert.equal(submitted.deadline,first.deadline);
   assert.deepEqual(submitted.answers,Object.fromEntries(exam.questions.map(question=>[question.id,'B'])));
   await b.runtime.value.finish(false);await settle(b);assert.equal(b.submits.length,1,'Repeated click must not submit twice');
  }finally{b.dispose();}
  const result=mount(zalo);
  try{assert.equal(result.draw().submitted,true);assert.deepEqual(result.runtime.value.draft.answers,Object.fromEntries(exam.questions.map(question=>[question.id,'B'])));assert.equal(result.submits.length,0);}
  finally{result.dispose();}
 });

 await test('Sai phiên bản và bản lưu không hợp lệ không tự vào phòng hoặc ghi đè dữ liệu',()=>{
  for(const invalid of [{...serverDraft(),examVersionHash:'c'.repeat(64)},{...serverDraft(),answers:{'UNKNOWN-SYNTHETIC':'B'}}]){
   const store=storeFor(invalid),bytes=store.getItem(draftKey(exam.id)),view=mount(store);
   try{const state=view.draw();assert.equal(state.draft,null);assert.ok(state.notice);assert.equal(store.getItem(draftKey(exam.id)),bytes);assert.equal(store.sets,0);assert.equal(view.starts.length,0);assert.equal(view.submits.length,0);}
   finally{view.dispose();}
  }
 });

 await test('Source hold và erratum chưa chấp nhận giữ gate; chấp nhận erratum mới được tiếp tục',async()=>{
  const hold=serverDraft(),heldStore=storeFor(hold);SOURCE_HOLDS[exam.id]='Điều kiện nguồn GIẢ cần kiểm';
  const held=mount(heldStore);
  try{const state=held.draw();assert.equal(state.draft,null);assert.equal(state.startDisabled,true);assert.equal(heldStore.sets,0);assert.equal(held.starts.length,0);}
  finally{held.dispose();delete SOURCE_HOLDS[exam.id];}
  // Mutate only the isolated bundled module's gate fixture, not a public exam.
  const syntheticErratum={baseId:exam.id+'-base',id:exam.id+'-erratum',condition:'Điều kiện đính chính GIẢ',baseVersionHash:exam.versionHash,versionHash:exam.versionHash};
  PRACTICE_ERRATA.push(syntheticErratum);
  const erratumExam={...exam,id:syntheticErratum.id},draft=serverDraft(erratumExam),store=storeFor(draft,erratumExam),view=mount(store,{},erratumExam);
  try{
   const state=view.draw();assert.equal(state.draft,null);assert.equal(state.acceptedErratum,false);assert.equal(state.startDisabled,true);assert.equal(store.sets,0);
   state.setAcceptedErratum(true);view.draw();await view.runtime.value.begin();await settle(view);
   assert.equal(view.runtime.value.draft.attemptId,draft.attemptId);assert.equal(view.runtime.value.draft.deadline,draft.deadline);
  }finally{view.dispose();PRACTICE_ERRATA.splice(PRACTICE_ERRATA.indexOf(syntheticErratum),1);}
 });

 await test('PDF chưa tải không chặn draft có sẵn; source asset unavailable vẫn không nhận chọn đáp án',()=>{
  const draft=serverDraft(),store=storeFor(draft),view=mount(store);
  try{const state=view.draw();assert.equal(state.pdfReady,false);assert.equal(state.draft.attemptId,draft.attemptId);state.changeAnswer(exam.questions[0].id,'B');view.draw();assert.equal(view.runtime.value.draft.answers[exam.questions[0].id],'B');}
  finally{view.dispose();}
  const unavailable=structuredClone(exam);
  unavailable.questions[0].sourceContent={questions:[{path:'synthetic/failed-page.png',sha256:'d'.repeat(64),sourcePage:1,width:100,height:100,privateUnavailable:true}],solutions:[{path:'synthetic/solution-page.png',sha256:'e'.repeat(64),sourcePage:1,width:100,height:100}]};
  const missing=serverDraft(unavailable),missingStore=storeFor(missing,unavailable),blocked=mount(missingStore,{},unavailable);
  try{const state=blocked.draw();assert.ok(state.failedQuestions.has(unavailable.questions[0].id));state.changeAnswer(unavailable.questions[0].id,'B');blocked.draw();assert.deepEqual(blocked.runtime.value.draft.answers,{});assert.equal(missingStore.sets,0);}
  finally{blocked.dispose();}
 });

 await test('Draft hết giờ nộp đúng một lần với ID và đáp án cũ, không mở lượt mới',async()=>{
  const draft=serverDraft(exam,{[exam.questions[0].id]:'B'});clock=draft.deadline+1000;
  const store=storeFor(draft),view=mount(store);
  try{
   view.draw();await settle(view);
   assert.equal(view.submits.length,1);assert.equal(view.starts.length,0);assert.equal(view.runtime.value.submitted,true);
   assert.equal(view.submits[0].attemptId,draft.attemptId);assert.equal(view.submits[0].deadline,draft.deadline);assert.deepEqual(view.submits[0].answers,draft.answers);
   for(let n=0;n<3;n++){clock+=1000;timers.forEach(fn=>fn());view.draw();await settle(view);}
   await view.runtime.value.finish(true);await settle(view);assert.equal(view.submits.length,1);
  }finally{view.dispose();clock=T0+5000;}
 });
 console.log('Server-draft auto-resume: '+passed+' synthetic hook lifecycle cases PASS. No HTTP, physical phone or live ACK was exercised.');
}finally{
 Date.now=originalNow;globalThis.clearInterval=originalClearInterval;
 for(const [key,value]of oldGlobals){if(value===undefined)delete(globalThis as any)[key];else(globalThis as any)[key]=value;}
 delete(globalThis as any).__mtmHookRuntime;
}
