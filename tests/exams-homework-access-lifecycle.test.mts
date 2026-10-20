import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pipelineFixture} from './btvn-pipeline-fixture';
import type {HomeworkState} from '../src/native/homework/btvn-contract';
import {createHomeworkSaver} from '../src/native/homework/remote-save';
import {createDraft} from '../src/native/exams/store';

const root=process.env.MTM_ROOT!,require=createRequire(join(root,'package.json')),{buildSync}=require('esbuild');
const fixture=join(root,'tests/fixtures/doi-ngu-react.mts');
const code=buildSync({entryPoints:[join(root,'src/native/homework/HomeworkSession.tsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',alias:{react:fixture,'react/jsx-runtime':fixture,'react-dom':fixture},loader:{'.css':'empty'},logLevel:'silent'}).outputFiles[0].text;
const module={exports:{} as any};new Function('require','module','exports',code)((id:string)=>id.endsWith('.css')?{}:require(id),module,module.exports);
const Session=module.exports.default;
class Runtime{
 slots:any[]=[];index=0;changed=false;effects:(()=>void)[]=[];value:any;
 same(a:any,b:any){return a&&b&&a.length===b.length&&a.every((v:any,i:number)=>Object.is(v,b[i]));}
 state(initial:any){const i=this.index++;if(!this.slots[i])this.slots[i]={value:typeof initial==='function'?initial():initial};return[this.slots[i].value,(v:any)=>{const next=typeof v==='function'?v(this.slots[i].value):v;if(!Object.is(next,this.slots[i].value)){this.slots[i].value=next;this.changed=true;}}];}
 ref(value:any){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
 memo(fn:()=>any,deps:any){const i=this.index++;if(!this.slots[i]||!this.same(this.slots[i].deps,deps))this.slots[i]={value:fn(),deps};return this.slots[i].value;}
 effect(fn:any,deps:any){const i=this.index++,old=this.slots[i];if(!old||!this.same(old.deps,deps)){this.slots[i]={deps,cleanup:old?.cleanup};this.effects.push(()=>{old?.cleanup?.();this.slots[i].cleanup=fn();});}}
 flush(){for(let n=0;n<30;n++){(globalThis as any).__doiNguRuntime=this;this.index=0;this.changed=false;this.value=Session({pathname:'/btvn'});this.effects.splice(0).forEach(f=>f());if(!this.changed)return;}throw Error('Runtime hook không ổn định');}
 dispose(){this.slots.forEach(s=>s?.cleanup?.());}
}
const all=(t:any,p:(n:any)=>boolean):any[]=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(n=>all(n,p)):[...(p(t)?[t]:[]),...all(t.props?.children,p)];
// Gate hiện thông báo trong từng form qua prop notice (18/10), không còn ở cha.
const text=(t:any):string=>t==null||typeof t==='boolean'?'':Array.isArray(t)?t.map(text).join(''):typeof t==='object'?text(t.props?.children)+(typeof t.type==='function'&&typeof t.props?.onLogin==='function'?String(t.props.notice??''):''):String(t);
const microtasks=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
class Events extends EventTarget{removeEventListener(type:string,listener:any,options?:any){super.removeEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}}
const win=new Events(),doc=new Events();
Object.assign(globalThis,{window:win,document:Object.assign(doc,{visibilityState:'visible',querySelector:()=>null,getElementById:()=>null}),location:new URL('https://fake.local/btvn'),history:{pushState(){}},requestAnimationFrame:(fn:()=>void)=>fn()});
const f=pipelineFixture();
const state=(name='Người học GIẢ A'):HomeworkState=>({exam:f.exam,fullName:name,className:'LỚP GIẢ',lessonCode:'buoi-gia',dueAt:null,maxAttempts:5,attemptsUsed:0,draft:null,receipts:[],bestScore:null,demo:false,lessons:[],assetsExpiresAt:Date.now()+1000,canStart:true});
type Request={body:any;reply:(status:number,data?:unknown,raw?:string)=>void;fail:()=>void};
async function mount(initial=state(),initialStatus=200){
 const requests:Request[]=[];
 (globalThis as any).fetch=(path:string,init:any)=>{
  assert.equal(path,'/api/btvn','Chỉ transport giả, không kết nối mạng');const body=JSON.parse(init.body);
  if(body.action==='classes')return Promise.resolve(new Response(JSON.stringify({classNames:['LỚP GIẢ']})));
  return new Promise<Response>((resolve,reject)=>requests.push({body,reply:(status,data,raw)=>resolve(new Response(raw??JSON.stringify(data),{status})),fail:()=>reject(Error('Mất mạng giả'))}));
 };
 const runtime=new Runtime();const settle=async()=>{await microtasks();runtime.flush();};runtime.flush();requests[0].reply(initialStatus,initial);await settle();
 const gate=()=>all(runtime.value,n=>typeof n.type==='function'&&typeof n.props?.onLogin==='function')[0];
 const cards=()=>all(runtime.value,n=>typeof n.type==='function'&&typeof n.props?.onHomework==='function')[0];
 const renew=async()=>{win.dispatchEvent(new Event('mtm:retry-assets'));await settle();return requests.at(-1)!;};
 if(initialStatus===200)assert.match(text(runtime.value),/Người học GIẢ A/);return {requests,runtime,settle,gate,cards,renew,dispose:()=>runtime.dispose()};
}
let count=0;async function test(name:string,run:()=>Promise<void>){await run();console.log('ĐẠT '+(++count)+' '+name);}
for(const status of [401,403])await test('Mở cổng chưa có phiên với '+status+' không báo mất bài',async()=>{
 const r=await mount(state(),status);try{
  assert.ok(r.gate());assert.equal(r.gate().props.busy,false);
  assert.equal(all(r.runtime.value,n=>n.props?.role==='alert').length,0,'Không báo mất quyền hoặc mất bài khi chưa có phiên trên trang');
  r.gate().props.onLogin({studentCode:'MA-GIA'});await r.settle();r.requests.at(-1)!.reply(200,state('Người học GIẢ B'));await r.settle();
  assert.match(text(r.runtime.value),/Người học GIẢ B/);
 }finally{r.dispose();}
});
await test('Có bài chưa gửi xong chỉ báo chưa chắc, đăng nhập lại hiển thị bản máy chủ trước lượt mới',async()=>{
 const made=createDraft(f.exam,'fake-relogin-attempt',Date.now());assert.ok(made.ok);
 const r=await mount({...state(),draft:made.value});try{
  const managed=all(r.runtime.value,n=>typeof n.type==='function'&&n.props?.saverRef)[0];assert.ok(managed);
  managed.props.onPendingChange(true);
  const request=await r.renew();request.reply(401);await r.settle();
  assert.ok(r.gate());assert.match(text(r.runtime.value),/chưa gửi xong có thể chưa được tính/);
  assert.doesNotMatch(text(r.runtime.value),/không được tính là đã nộp/);
  r.gate().props.onLogin({studentCode:'MA-GIA'});await r.settle();
  const serverDraft={...made.value,answers:{'mc-1':'B'}};
  r.requests.at(-1)!.reply(200,{...state('Người học GIẢ B'),draft:serverDraft,attemptsUsed:1});await r.settle();
  const restored=all(r.runtime.value,n=>typeof n.type==='function'&&n.props?.saverRef)[0];
  assert.equal(restored.props.state.draft.attemptId,made.value.attemptId);
  assert.deepEqual(restored.props.state.draft.answers,serverDraft.answers);
  assert.equal(r.requests.some(req=>req.body.action==='start'),false,'Không mở lượt mới trước khi hiển thị bản máy chủ');
 }finally{r.dispose();}
});
await test('Request nộp đã được nhận vẫn hiển thị bản đã chấm khi đăng nhập lại',async()=>{
 const made=createDraft(f.exam,'fake-monthly-relogin',Date.now());assert.ok(made.ok);
 const r=await mount({...state(),kind:'kiem-tra-thang',draft:made.value,maxAttempts:1});try{
  const managed=all(r.runtime.value,n=>typeof n.type==='function'&&n.props?.saverRef)[0];managed.props.onPendingChange(true);
  const request=await r.renew();request.reply(403);await r.settle();
  r.gate().props.onLogin({studentCode:'MA-GIA'});await r.settle();const submittedAt=Date.now();
  const confirmed={...state('Người học GIẢ B'),kind:'kiem-tra-thang',draft:{...made.value,submittedAt},attemptsUsed:1,maxAttempts:1,canStart:false,receipts:[{attemptId:made.value.attemptId,submittedAt,score:8}]};
  r.requests.at(-1)!.reply(200,confirmed);await r.settle();
  const overview=all(r.runtime.value,n=>typeof n.type==='function'&&typeof n.props?.onStart==='function')[0];
  assert.ok(overview,'Mở kết quả bản máy chủ đã nhận');assert.equal(overview.props.state.draft.attemptId,made.value.attemptId);
  assert.equal(overview.props.state.receipts[0].score,8);assert.equal(overview.props.state.canStart,false);
  assert.equal(r.requests.some(req=>req.body.action==='start'),false);
 }finally{r.dispose();}
});
for(const status of [401,403])await test('Gia hạn bị '+status+' bỏ nội dung hết quyền, kể cả response không phải JSON',async()=>{
 const r=await mount();try{const request=await r.renew();request.reply(status,undefined,'Từ chối giả');await r.settle();assert.ok(r.gate(),'Trở về cổng nhập mã');assert.equal(r.cards(),undefined);assert.doesNotMatch(text(r.runtime.value),/Người học GIẢ A/);assert.match(text(r.runtime.value),/quyền xem bài/);assert.doesNotMatch(text(r.runtime.value),/chưa gửi xong/,'Không báo có bài chưa gửi khi saver không có pending');}finally{r.dispose();}
});
for(const failure of ['503','network'])await test('Lỗi '+failure+' giữ bài hiện tại và vẫn cho thử lại',async()=>{
 const r=await mount();try{const request=await r.renew();if(failure==='503')request.reply(503,{message:'Máy chủ bận giả'});else request.fail();await r.settle();assert.equal(r.gate(),undefined);assert.ok(r.cards());assert.match(text(r.runtime.value),/Người học GIẢ A/);const retry=await r.renew();retry.reply(200,state());await r.settle();assert.ok(r.cards());}finally{r.dispose();}
});
await test('Phản hồi chọn bài cũ không khôi phục nội dung sau khi quyền bị từ chối',async()=>{
 const r=await mount();try{
  const selecting=r.cards().props.onHomework('buoi-gia-khac');r.runtime.flush();await r.settle();const old=r.requests.at(-1)!;assert.equal(old.body.action,'select');
  const request=await r.renew();request.reply(401,{message:'Hết phiên giả'});await r.settle();assert.ok(r.gate());old.reply(200,state('Nội dung GIẢ đã hết quyền'));await selecting;await r.settle();assert.ok(r.gate());assert.doesNotMatch(text(r.runtime.value),/Nội dung GIẢ đã hết quyền/);
 }finally{r.dispose();}
});
await test('Đăng nhập mới không bị phản hồi cũ thay thế sau thu hồi quyền',async()=>{
 const r=await mount();try{
  const selecting=r.cards().props.onHomework('buoi-gia-khac');r.runtime.flush();await r.settle();const old=r.requests.at(-1)!;
  const request=await r.renew();request.reply(403,{message:'Từ chối giả'});await r.settle();assert.ok(r.gate());
  r.gate().props.onLogin({studentCode:'MA-GIA'});await r.settle();const login=r.requests.at(-1)!;assert.equal(login.body.action,'login');login.reply(200,state('Người học GIẢ B'));await r.settle();assert.match(text(r.runtime.value),/Người học GIẢ B/);
  old.reply(200,state('Người học GIẢ A'));await selecting;await r.settle();assert.match(text(r.runtime.value),/Người học GIẢ B/);assert.doesNotMatch(text(r.runtime.value),/Người học GIẢ A|không còn xác nhận quyền/);
 }finally{r.dispose();}
});
await test('Thu hồi trong lúc chờ flush không đọc saver đã bỏ hoặc ghi đè thông báo quyền',async()=>{
 const made=createDraft(f.exam,'fake-flush-denied',Date.now());assert.ok(made.ok);const r=await mount({...state(),draft:made.value});
 try{
  const managed=all(r.runtime.value,n=>typeof n.type==='function'&&n.props?.saverRef)[0];assert.ok(managed);let finish!:(value:boolean)=>void,discarded=false;
  managed.props.saverRef.current={flush:()=>new Promise(resolve=>{finish=resolve;}),dispose:(options:any)=>{assert.equal(options.flushPending,false);discarded=true;},closed:()=>false};
  const button=all(r.runtime.value,n=>n.type==='button'&&text(n)==='Thoát')[0];button.props.onClick();await r.settle();
  const request=await r.renew();request.reply(401,{message:'Hết quyền GIẢ'});await r.settle();assert.equal(discarded,true);finish(false);await r.settle();
  assert.ok(r.gate());assert.match(text(r.runtime.value),/quyền xem bài/);assert.doesNotMatch(text(r.runtime.value),/Cannot read|Chưa rời bài/);assert.equal(r.requests.some(req=>req.body.action==='logout'),false);
 }finally{r.dispose();}
});
await test('Đăng xuất thành công không bị phản hồi gia hạn cũ mở lại phiên',async()=>{
 const r=await mount();try{const old=await r.renew();const button=all(r.runtime.value,n=>n.type==='button'&&text(n)==='Thoát')[0];button.props.onClick();await r.settle();const logout=r.requests.at(-1)!;assert.equal(logout.body.action,'logout');logout.reply(200,{loggedOut:true});await r.settle();assert.ok(r.gate());old.reply(200,state());await r.settle();assert.ok(r.gate());assert.doesNotMatch(text(r.runtime.value),/Người học GIẢ A/);}finally{r.dispose();}
});
await test('Bỏ phiên hết quyền không gửi nháp đang chờ và không nhận update mới',async()=>{
 const made=createDraft(f.exam,'fake-discard-attempt',Date.now());assert.ok(made.ok);let sent=0,saved=0;
 const saver=createHomeworkSaver({delay:60000,send:async draft=>{sent++;return {...state(),draft};},onSaved:()=>saved++,onStatus:()=>{}});
 saver.update(made.value);assert.equal(saver.pending(),true);saver.dispose({flushPending:false});await saver.settled();
 assert.equal(sent,0);assert.equal(await saver.flush(),true);assert.equal(saver.pending(),false);saver.update(made.value);saver.retry();await saver.settled();assert.equal(sent,0);assert.equal(saved,0);
});
await test('Bỏ phiên khi request cũ đang chạy không xuất callback hoặc gửi thêm',async()=>{
 const made=createDraft(f.exam,'fake-inflight-attempt',Date.now());assert.ok(made.ok);let sent=0,saved=0,statuses=0,respond!:(value:HomeworkState)=>void;
 const saver=createHomeworkSaver({delay:60000,send:()=>{sent++;return new Promise(resolve=>{respond=resolve;});},onSaved:()=>saved++,onStatus:()=>statuses++});
 saver.update(made.value);saver.retry();await Promise.resolve();assert.equal(sent,1);saver.dispose({flushPending:false});const before=statuses;respond({...state(),draft:made.value});await saver.settled();assert.equal(saved,0);assert.equal(statuses,before);assert.equal(sent,1);assert.equal(saver.pending(),false);
});
await test('Response muộn sau bỏ quyền không ghi trạng thái bản máy chủ đã chấm',async()=>{
 const made=createDraft(f.exam,'fake-late-closed-attempt',Date.now());assert.ok(made.ok);let respond!:(value:HomeworkState)=>void,saved=0;
 const saver=createHomeworkSaver({delay:60000,send:()=>new Promise(resolve=>{respond=resolve;}),onSaved:()=>saved++,onStatus:()=>{}});
 saver.update({...made.value,answers:{'mc-1':'B'}});saver.retry();await Promise.resolve();saver.dispose({flushPending:false});
 const submittedAt=Date.now();respond({...state(),draft:{...made.value,answers:{'mc-1':'A'},submittedAt},receipts:[{attemptId:made.value.attemptId,submittedAt,score:0}] as HomeworkState['receipts']});
 await saver.settled();assert.equal(saver.closed(),false,'Bản trả muộn không ghi closedState của saver đã bỏ quyền');saver.acceptClosed();assert.equal(saved,0);
});
await test('Rời trang thông thường vẫn cố gửi nháp như hợp đồng cũ',async()=>{
 const made=createDraft(f.exam,'fake-leave-attempt',Date.now());assert.ok(made.ok);let sent=0,saved=0;
 const saver=createHomeworkSaver({delay:60000,send:async draft=>{sent++;return {...state(),draft};},onSaved:()=>saved++,onStatus:()=>{}});
 saver.update(made.value);saver.dispose();await saver.settled();assert.equal(sent,1);assert.equal(saved,0);assert.equal(saver.pending(),false);
});
console.log(count+' ca lifecycle quyền BTVN đạt; hook/transport giả ngoại tuyến, chưa phải trình duyệt.');
