import assert from 'node:assert/strict';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';
import {mount,state,all} from './daily20-session-harness.mts';
import {createDraft} from '../src/native/exams/store';

const id='11600000-0000-4000-8000-000000000001',calls:{name:string;args:any}[]=[];
const repo=new SupabaseHomeworkRepository({async rpc(name,args){calls.push({name,args});return {data:name==='mtm_btvn_qa_class116'?['2K10 QA GIẢ']:['2K10 lớp thường'],error:null};}},async()=>{throw Error('Test danh sách không được gọi auth');});
const handler=createDurableHomeworkHandler(repo);
const request=(body:unknown,origin='https://fixture.invalid')=>handler({method:'POST',host:'fixture.invalid',origin,secure:true,body});
assert.deepEqual((await request({action:'classes'})).body,{classNames:['2K10 lớp thường']});
assert.deepEqual(calls.at(-1),{name:'mtm_btvn_classes',args:{}});
assert.deepEqual((await request({action:'classes',qaClassId:id})).body,{classNames:['2K10 QA GIẢ']});
assert.deepEqual(calls.at(-1),{name:'mtm_btvn_qa_class116',args:{p_class_id:id}});
const before=calls.length;
for(const value of [null,'',true,{},[id],'ABCDEF00-0000-4000-8000-000000000001','invalid-id'])assert.equal((await request({action:'classes',qaClassId:value})).status,400);
for(const body of [{action:'classes',qaClassId:id,includeStudents:true},{action:'classes',is_test:true},{action:'classes',studentId:id}])assert.equal((await request(body)).status,400);
assert.equal((await request({action:'classes',qaClassId:id},'https://other.invalid')).status,403);
assert.equal(calls.length,before,'Payload sai không tới DB/auth');
await assert.rejects(()=>repo.classNames('not-uuid'));

const overview=(r:any)=>all(r.runtime.value,(n:any)=>typeof n.props?.onStart==='function')[0];
for(const kind of ['btvn','kiem-tra'] as const){
 const s={...state(),kind,lessonCode:'fixture-requested'};
 const r=await mount(s,200,{pathname:`/btvn/qa-${id}/fixture-requested`});
 try{
  assert.ok(overview(r),'Link đúng phiếu mở overview ngay cả chưa có draft');
  assert.equal(overview(r).props.state.lessonCode,s.lessonCode);
  assert.deepEqual(r.classRequests,[{action:'classes',qaClassId:id}]);
  assert.deepEqual(r.requests.map(q=>q.body.action),['state'],'Không tự mở lượt hoặc lưu rỗng');
 }finally{r.dispose();}
}
for(const pathname of ['/btvn',`/btvn/${id}/buoi-gia`,'/btvn/qa-invalid/buoi-gia']){
 const r=await mount(state(),401,{pathname,classNames:['2K10 lớp thường']});
 try{assert.deepEqual(r.classRequests,[{action:'classes'}]);assert.equal(r.gate().props.identity.className,'','Route thường không tự chọn lớp');}finally{r.dispose();}
}
const path=`/btvn/qa-${id}/fixture-requested`;
for(const [pathname,search,expected] of [
 [path,'?qaName=QA%20Safari%201611&qaPhone=0000000116','QA Safari 1611'],
 [path,'?qaName=Real%20Name&qaPhone=0000000116',''],
 [path,'?qaName=QA%20Fake&qaPhone=0900000222',''],
 ['/btvn','?qaName=QA%20Safari%201611&qaPhone=0000000116',''],
] as const){
 const r=await mount(state(),401,{pathname,search,classNames:['2K10 QA GIẢ']});
 try{assert.equal(r.gate().props.identity.fullName,expected);assert.equal(r.gate().props.identity.phone,expected?'0000000116':'');assert.equal(r.requests.length,1,'Hint không tự gọi login');}finally{r.dispose();}
}
const r=await mount(state(),401,{pathname:path,classNames:['2K10 QA GIẢ']});
try{
 assert.equal(r.gate().props.identity.className,'2K10 QA GIẢ');
 r.gate().props.onLogin({fullName:'Người thử GIẢ',phone:'0000000000',className:'2K10 QA GIẢ'});await r.settle();
 r.requests.at(-1)!.reply(200,{...state(),lessonCode:'fixture-requested'});await r.settle();
 assert.ok(overview(r),'Đăng nhập xong tới đúng overview chưa tạo lượt');
 assert.equal(r.requests.filter(q=>q.body.action==='start').length,0);
}finally{r.dispose();}
const mismatch=await mount(state(),200,{pathname:path});
try{assert.equal(overview(mismatch),undefined,'Server không trả đúng bài thì không mở nhầm overview');assert.ok(mismatch.cards());}finally{mismatch.dispose();}
const ordinary=await mount(state());
try{assert.equal(overview(ordinary),undefined);assert.ok(ordinary.cards());}finally{ordinary.dispose();}
const made=createDraft(state().exam!,'fake-link-receipt',Date.now());assert.ok(made.ok);
const receipt=await mount({...state(),lessonCode:'fixture-requested',draft:{...made.value,submittedAt:Date.now()},attemptsUsed:1},200,{pathname:path});
try{assert.ok(overview(receipt),'Tải link kết quả giữ biên nhận');assert.equal(receipt.requests.length,1);}finally{receipt.dispose();}
console.log('ĐẠT QA entry: exact class reader, origin/payload fence, overview trước/sau đăng nhập, kết quả tải lại; không start/save/auth thật.');
