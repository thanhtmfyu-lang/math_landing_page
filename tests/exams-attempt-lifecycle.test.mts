import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {PRACTICE_EXAMS} from '../src/native/exams/data';
import {readDraft,draftKey} from '../src/native/exams/store';
import {FakeStore,suite} from './exams-harness.mts';

const root=process.env.MTM_ROOT!;
const require=createRequire(join(root,'package.json'));
const {buildSync}=require('esbuild');
function load(file:string) {
  const fixture=join(root,'tests/fixtures/attempt-react.mts');
  const code=buildSync({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture},logLevel:'silent'}).outputFiles[0].text;
  const module={exports:{} as any};
  new Function('require','module','exports',code)(require,module,module.exports);
  return module.exports;
}
const {usePracticeAttempt}=load('src/native/exams/usePracticeAttempt.ts');
const {navigate,useRoute}=load('src/migration/navigation.tsx');
const T0=Date.UTC(2026,9,14,1);
const originalNow=Date.now;
let clock=T0;
Date.now=()=>clock;
class BrowserEvents extends EventTarget {
  removeEventListener(type:string,listener:any,options?:boolean|EventListenerOptions){
    super.removeEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);
  }
}
const windows=new BrowserEvents(),documents=new BrowserEvents();
const intervals=new Map<number,()=>void>();
let serial=0;
const entries=['https://mtm.test/thi-thu?lop=12&ky=GK1'];let cursor=0;
const location=new URL(entries[0]);
const move=(href:string)=>{const url=new URL(href,location.href);location.href=url.href;};
const history={pushState(_s:unknown,_t:string,url:string){entries.splice(++cursor);entries.push(new URL(url,location.href).href);move(entries[cursor]);},replaceState(_s:unknown,_t:string,url:string){entries[cursor]=new URL(url,location.href).href;move(entries[cursor]);},back(){if(cursor){move(entries[--cursor]);windows.dispatchEvent(new Event('popstate'));}},forward(){if(cursor+1<entries.length){move(entries[++cursor]);windows.dispatchEvent(new Event('popstate'));}}};
Object.assign(globalThis,{window:Object.assign(windows,{setInterval(fn:()=>void){intervals.set(++serial,fn);return serial;}}),document:Object.assign(documents,{getElementById(){return null;},querySelector(){return null;}}),location,history,clearInterval(id:number){intervals.delete(id);}});
class Runtime {
  slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;
  constructor(public fn:()=>any){}
  state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return [this.slots[i].value,(v:any)=>{const next=typeof v==='function'?v(this.slots[i].value):v;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
  ref(value:any){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
  same(a:any,b:any){return a&&b&&a.length===b.length&&a.every((v:any,i:number)=>Object.is(v,b[i]));}
  memo(value:any,deps:any){const i=this.index++;if(!this.slots[i]||!this.same(this.slots[i].deps,deps))this.slots[i]={value,deps};return this.slots[i].value;}
  effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!this.same(old.deps,deps)){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
  flush(){for(let round=0;round<30;round++){(globalThis as any).__mtmHookRuntime=this;this.index=0;this.changed=false;this.value=this.fn();this.effects.splice(0).forEach(fn=>fn());if(!this.changed)return this.value;}throw Error('Hook không ổn định');}
  dispose(){this.slots.forEach(s=>s?.cleanup?.());}
}
const exam=PRACTICE_EXAMS.find(e=>e.id==='mtm-g12-gk1-2025-2026-code1201')!;
function mount(store:FakeStore,e=exam){return new Runtime(()=>usePracticeAttempt({exam:e,catalogUrl:'/thi-thu',storeOverride:store}));}
function ready(r:Runtime){r.flush().setPdfReady(true);return r.flush();}
const {test,finish}=suite('L');
test('Làm trọn đề thi và bài luyện với đủ loại câu, chấm rồi mở lại cùng điểm',()=>{
  const practice=JSON.parse(readFileSync(join(root,'src/native/chapters/exact-tests.json'),'utf8'));
  const candidates=(Array.isArray(practice)?practice:practice.exams).map((p:any)=>p.exam??p);
  const e=candidates.find((e:any)=>e.id==='mtm-drive-g10-c1-t02-mtm-errata-v1');
  assert.ok(e);
  for(const current of [exam,e]){
    clock=T0;const store=new FakeStore(),r=mount(store,current);ready(r);r.value.setAcceptedErratum(true);r.flush().begin();r.flush();assert.ok(r.value.draft);
    for(const q of current.questions){clock+=100;r.value.changeAnswer(q.id,q.kind==='short'?q.acceptedAnswers[0]:q.answer);r.flush();}
    assert.equal(r.value.answered,current.questions.length);r.value.finish(false);r.flush();assert.equal(r.value.confirmation,null);assert.equal(r.value.submitted,true);assert.ok(r.value.score?.ok);
    const score=r.value.score;r.dispose();const reload=mount(store,current);reload.flush();assert.deepEqual(reload.value.score,score);reload.dispose();
  }
});
test('Hết giờ tự nộp qua effect và interval thật của hook, đúng deadline, chỉ nộp một lần',()=>{
  clock=T0;const store=new FakeStore(),r=mount(store);ready(r).begin();r.flush();
  const end=r.value.draft.deadline;clock=end-501;intervals.forEach(fn=>fn());r.flush();assert.equal(r.value.submitted,false);
  clock=end;intervals.forEach(fn=>fn());r.flush();assert.equal(r.value.submitted,true);assert.equal(r.value.draft.submittedAt,end);
  const bytes=store.getItem(draftKey(exam.id));clock+=5000;r.value.finish(true);r.flush();assert.equal(store.getItem(draftKey(exam.id)),bytes);r.dispose();
});
test('Hai thẻ cùng đề: sự kiện storage báo xung đột, giữ RAM và không ghi đè thẻ kia',()=>{
  clock=T0;const store=new FakeStore(),a=mount(store);ready(a).begin();a.flush();const b=mount(store);ready(b).begin();b.flush();
  const event=new Event('storage');Object.assign(event,{key:draftKey(exam.id),storageArea:store});windows.dispatchEvent(event);a.flush();
  a.value.changeAnswer(exam.questions[0].id,'C');a.flush();assert.equal(a.value.draft.answers[exam.questions[0].id],'C');assert.equal(a.value.unsaved,true);assert.match(a.value.notice,/thay đổi/);
  const saved=readDraft(store,exam);assert.ok(saved.ok);assert.notEqual(saved.value?.answers[exam.questions[0].id],'C');a.dispose();b.dispose();
});
test('Reload bài dở: không tự bắt đầu, Tiếp tục giữ attemptId, đáp án và deadline',()=>{
  clock=T0;const store=new FakeStore(),r=mount(store);ready(r).begin();r.flush();r.value.changeAnswer(exam.questions[0].id,'D');r.flush();const previous=r.value.draft;r.dispose();clock+=5000;
  const reload=mount(store);ready(reload);assert.equal(reload.value.draft,null);assert.equal(reload.value.startLabel,'Tiếp tục làm bài');reload.value.begin();reload.flush();
  assert.equal(reload.value.draft.attemptId,previous.attemptId);assert.equal(reload.value.draft.deadline,previous.deadline);assert.deepEqual(reload.value.draft.answers,previous.answers);reload.dispose();
});
test('Nộp thủ công thiếu câu cần xác nhận, reload kết quả giữ nguyên, làm lại giữ lịch sử',()=>{
  clock=T0;const store=new FakeStore(),r=mount(store);ready(r).begin();r.flush();r.value.finish(false);r.flush();assert.equal(r.value.confirmation,'submit');assert.equal(r.value.submitted,false);
  clock+=1000;r.value.finish(false,true);r.flush();const old=r.value.draft;r.dispose();const reload=mount(store);ready(reload);assert.equal(reload.value.submitted,true);assert.equal(reload.value.draft.attemptId,old.attemptId);
  reload.value.retake(true);reload.flush();assert.notEqual(reload.value.draft.attemptId,old.attemptId);assert.equal(reload.value.submitted,false);assert.ok([...store.data.values()].some(v=>v.includes(old.attemptId)));reload.dispose();
});
test('URL thi thử và luyện tập: navigate, Back, Forward, reload giữ path/query/hash nguyên vẹn',()=>{
  for(const [list,attempt] of [
    ['/thi-thu?lop=12&ky=GK1&q=2025','/thi-thu/'+exam.id+'#de'],
    ['/luyen-tap?nhom=10&chuong=1','/luyen-tap?nhom=10&chuong=1&id=mtm-drive-g10-c1-t02-mtm-errata-v1'],
    ['/luyen-tap?nhom=11&chuong=1','/luyen-tap?nhom=11&chuong=1&luot=synthetic-old#ket-qua'],
  ]){
    navigate(list);const r=new Runtime(useRoute);r.flush();navigate(attempt);r.flush();const expected={...r.value};history.back();r.flush();assert.equal(r.value.pathname,new URL(list,location.href).pathname);assert.equal(r.value.search,new URL(list,location.href).search);history.forward();r.flush();assert.deepEqual(r.value,expected);r.dispose();const reload=new Runtime(useRoute);assert.deepEqual(reload.flush(),expected);reload.dispose();
  }
});
test('PDF lỗi hoặc chưa hiện: bắt đầu, tiếp tục, trả lời và nộp vẫn hoạt động',()=>{
  clock=T0;const store=new FakeStore(),r=mount(store);
  r.flush().setPdfReady(false);r.flush();assert.equal(r.value.pdfReady,false);assert.equal(r.value.startDisabled,false);
  r.value.begin();r.flush();assert.ok(r.value.draft);
  r.value.changeAnswer(exam.questions[0].id,'B');r.flush();assert.equal(r.value.draft.answers[exam.questions[0].id],'B');
  const first=r.value.draft;r.dispose();
  const resume=mount(store);resume.flush();assert.equal(resume.value.pdfReady,false);assert.equal(resume.value.startDisabled,false);
  assert.equal(resume.value.startLabel,'Tiếp tục làm bài');resume.value.begin();resume.flush();
  assert.equal(resume.value.draft.attemptId,first.attemptId);assert.equal(resume.value.draft.deadline,first.deadline);
  resume.value.finish(false,true);resume.flush();assert.equal(resume.value.submitted,true);resume.dispose();
});
Date.now=originalNow;
finish({environment:'hook runtime tổng hợp, không phải trình duyệt'});
