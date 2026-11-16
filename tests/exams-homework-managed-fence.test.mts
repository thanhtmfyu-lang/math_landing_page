import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {createDraft,draftKey,type Draft} from '../src/native/exams/store';
import type {HomeworkState} from '../src/native/homework/btvn-contract';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json')),{buildSync}=require('esbuild');
const hooks=join(root,'tests/fixtures/doi-ngu-react.mts');
// Expose the actual private component and its actual imported error constructor
// in this one test bundle. Production exports and API are unchanged.
const code=buildSync({stdin:{contents:readFileSync(join(root,'src/native/homework/HomeworkSession.tsx'),'utf8')+'\nexport {ManagedAttempt,HomeworkWriteConflict};',sourcefile:'HomeworkSession.tsx',resolveDir:join(root,'src/native/homework'),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:hooks,'react/jsx-runtime':hooks,'react-dom':hooks},loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const module={exports:{} as any};new Function('require','module','exports',code)((name:string)=>name.endsWith('.css')?{}:require(name),module,module.exports);
const {ManagedAttempt,HomeworkWriteConflict}=module.exports;
class Runtime {
  slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;
  constructor(public props:any){}
  same(a:any,b:any){return a&&b&&a.length===b.length&&a.every((v:any,i:number)=>Object.is(v,b[i]));}
  state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return [this.slots[i].value,(value:any)=>{const next=typeof value==='function'?value(this.slots[i].value):value;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
  ref(value:any){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
  memo(fn:()=>any,deps:any){const i=this.index++;if(!this.slots[i]||!this.same(this.slots[i].deps,deps))this.slots[i]={value:fn(),deps};return this.slots[i].value;}
  effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!this.same(old.deps,deps)){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
  flush(){for(let n=0;n<25;n++){(globalThis as any).__doiNguRuntime=this;this.index=0;this.changed=false;this.value=ManagedAttempt(this.props);this.effects.splice(0).forEach(fn=>fn());if(!this.changed)return;}throw Error('Hook fixture did not settle');}
  dispose(){this.slots.forEach(slot=>slot?.cleanup?.());}
}
const all=(tree:any,predicate:(value:any)=>boolean):any[]=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(value=>all(value,predicate)):[...(predicate(tree)?[tree]:[]),...all(tree.props?.children,predicate)];
const microtasks=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
Object.assign(globalThis,{location:new URL('https://fixture.invalid/btvn')});
const f=pipelineFixture(),made=createDraft(f.exam,'fake-managed-fence',Date.now());assert.ok(made.ok);
const initial:HomeworkState={exam:f.exam,draft:{...made.value,revision:10},fullName:'Learner FAKE',className:'Class FAKE',lessonCode:'lesson-fake',dueAt:null,maxAttempts:5,attemptsUsed:1,receipts:[],bestScore:null,demo:false};
type Request={action:string;body:any;resolve:(value:HomeworkState)=>void;reject:(error:Error)=>void};
function mount(){
  const requests:Request[]=[],saved:HomeworkState[]=[],pending:boolean[]=[],saverRef={current:null as any};
  const gateway={call:(action:string,body:any)=>new Promise<HomeworkState>((resolve,reject)=>requests.push({action,body,resolve,reject}))};
  const runtime=new Runtime({state:structuredClone(initial),gateway,saverRef,onState:(next:HomeworkState)=>saved.push(next),onPendingChange:(value:boolean)=>pending.push(value)});runtime.flush();
  const practice=()=>all(runtime.value,node=>node.props?.isHomework&&node.props?.storeOverride)[0];
  const write=(revision:number,choice:string)=>{const draft={...initial.draft!,revision,updatedAt:initial.draft!.updatedAt+revision,answers:{'mc-1':choice}};practice().props.storeOverride.setItem(draftKey(f.exam.id),JSON.stringify(draft));runtime.flush();return draft;};
  const ack=(index:number,sent:Draft,revision:number)=>requests[index].resolve({...initial,draft:{...sent,revision,clientRevision:sent.revision}});
  const settle=async()=>{await microtasks();runtime.flush();};
  return {runtime,requests,saved,pending,saverRef,practice,write,ack,settle,dispose:()=>runtime.dispose()};
}
let count=0;async function test(name:string,run:()=>Promise<void>){await run();console.log('ĐẠT '+(++count)+' '+name);}

await test('Lượt máy chủ mở bật auto-resume nhưng chưa chọn gì không báo đã lưu đáp án',async()=>{
  const r=mount();try{
    assert.equal(r.practice().props.autoResumeServerDraft,true);
    assert.match(r.practice().props.saveStatus,/Chưa có đáp án/);
    assert.doesNotMatch(r.practice().props.saveStatus,/Đã lưu máy chủ/);
    assert.equal(r.requests.length,0,'Mount không tạo save hoặc start rỗng');
    assert.deepEqual(JSON.parse(r.practice().props.storeOverride.getItem(draftKey(f.exam.id))),initial.draft);
    const answer=r.write(11,'B');r.saverRef.current.retry();await r.settle();
    r.ack(0,answer,11);await r.settle();
    r.runtime.props.state=r.saved[0];r.runtime.flush();
    assert.match(r.practice().props.saveStatus,new RegExp('Đã lưu máy chủ · 1/'+f.exam.questions.length+' câu có đáp án'));
    assert.equal(r.requests.length,1);assert.equal(r.saverRef.current.pending(),false);
  }finally{r.dispose();}
});

await test('ACK của batch cũ cập nhật base máy chủ trước khi gửi RAM mới, không thay RAM bằng batch cũ',async()=>{
  const r=mount();try{
    const a=r.write(11,'A');r.saverRef.current.retry();await r.settle();assert.equal(r.requests[0].body.baseRevision,10);
    const b=r.write(12,'B');r.ack(0,a,41);await r.settle();
    assert.equal(r.requests.length,2);assert.equal(r.requests[1].body.baseRevision,41);assert.equal(r.requests[1].body.clientRevision,12);
    assert.deepEqual(r.requests[1].body.answers,{'mc-1':'B'});assert.equal(r.saved.length,0,'Old ACK updates only the base, not the newest UI snapshot');
    assert.deepEqual(JSON.parse(r.practice().props.storeOverride.getItem(draftKey(f.exam.id))).answers,b.answers);
    r.ack(1,b,42);await r.settle();assert.equal(r.saved.length,1);assert.deepEqual(r.saved[0].draft!.answers,b.answers);assert.equal(r.saverRef.current.pending(),false);
  }finally{r.dispose();}
});
await test('409 không tự nhảy base hoặc gửi RAM mới; chỉ nút gửi lại xác nhận một lần',async()=>{
  const r=mount();try{
    r.write(100,'A');r.saverRef.current.retry();await r.settle();
    r.requests[0].reject(new HomeworkWriteConflict('FAKE conflict: explicit retry required',initial.draft!.attemptId,20));await r.settle();
    const held=r.write(101,'B');r.saverRef.current.retry();await r.saverRef.current.settled();await r.settle();
    assert.equal(r.requests.length,1,'A queued automatic attempt cannot silently rebase after conflict');
    assert.deepEqual(JSON.parse(r.practice().props.storeOverride.getItem(draftKey(f.exam.id))).answers,held.answers);
    const explicit=r.practice().props.onRetrySave;assert.equal(typeof explicit,'function');explicit();explicit();await r.settle();
    assert.equal(r.requests.length,2,'Double tap does not enqueue the same snapshot twice');
    assert.equal(r.requests[1].body.baseRevision,20);assert.equal(r.requests[1].body.clientRevision,101);assert.deepEqual(r.requests[1].body.answers,held.answers);
    r.ack(1,held,21);await r.settle();assert.equal(r.saved.length,1);assert.equal(r.saverRef.current.pending(),false);
  }finally{r.dispose();}
});
await test('Phản hồi lệch đáp án không được nâng base hoặc ghi ACK, lần thử sau giữ base đã xác nhận',async()=>{
  const r=mount();try{
    const a=r.write(11,'A');r.saverRef.current.retry();await r.settle();
    r.requests[0].resolve({...initial,draft:{...a,revision:999,answers:{'mc-1':'B'}}});await r.settle();
    assert.equal(r.saved.length,0);assert.equal(r.saverRef.current.pending(),true);
    const next=r.write(12,'C');r.saverRef.current.retry();await r.settle();
    assert.equal(r.requests[1].body.baseRevision,10,'Unacknowledged metadata cannot become a write base');
    assert.deepEqual(r.requests[1].body.answers,next.answers);r.ack(1,next,13);await r.settle();assert.equal(r.saved.length,1);
  }finally{r.dispose();}
});
console.log(count+' ca ManagedAttempt thật qua hook fixture: no browser, real network, auth or learner data.');
