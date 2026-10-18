import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createExamApi} from '../api/exam';
import {validatePracticeExam, validateQuestionOnlyPracticeExam, readyExams, type PracticeExam} from '../src/native/exams/data';
import {scoreAssessment} from '../src/native/exams/assessment';
import {createDraft, submitDraft} from '../src/native/exams/store';
import {readRemote, saveRemote, remoteKey, validateRemoteResult, hydrateRemoteReview, needsFreshRemote, type RemoteAttempt} from '../src/native/exams/server-attempt';
import {publicExamCatalog} from '../scripts/public-exam-catalog.mjs';
import {suite, FakeStore} from './exams-harness.mts';

const {test, finish} = suite('EXAM-SECURITY-');
const root = process.env.MTM_ROOT ?? process.cwd();
const catalog = JSON.parse(readFileSync(join(root,'src/native/exams/catalog.json'),'utf8')) as PracticeExam[];
const publicCatalog = publicExamCatalog(catalog) as PracticeExam[];
test('Cả 30 đề công khai đi qua validator câu hỏi và danh sách làm bài', () => {
  assert.equal(publicCatalog.length, 30);
  for (const exam of publicCatalog) assert.deepEqual(validateQuestionOnlyPracticeExam(exam), {valid:true,errors:[]}, exam.id);
  assert.equal(readyExams(publicCatalog).length, catalog.length);
  assert.ok(publicCatalog.every(exam=>!validatePracticeExam(exam).valid), 'Đề công khai không được chấm điểm cục bộ.');
});
test('Đề công khai mở, lưu và nộp được draft mà không cần khóa đáp án', () => {
  const exam = publicCatalog[0];
  const started = createDraft(exam,'synthetic-local-attempt',1000);
  assert.ok(started.ok);
  const submitted = submitDraft(exam,started.value,2000);
  assert.ok(submitted.ok);
  assert.equal(submitted.value.submittedAt,2000);
});
for (const field of ['answer','acceptedAnswers','solution','solutionBlocks','shortRule']) {
  test(`Validator câu hỏi công khai từ chối trường riêng ${field}`, () => {
    const exam = structuredClone(publicCatalog[0]) as any;
    exam.questions[0][field] = field==='answer'?'A':field==='solution'?'Lời giải riêng':[];
    assert.equal(validateQuestionOnlyPracticeExam(exam).valid,false);
  });
}

const validId = '00000000-0000-4000-8000-000000000005';
const token = 'a'.repeat(64);
const exam = {...catalog[0],serverGraded:true as const};
delete (exam as any).sourceUrl;
const score = scoreAssessment(exam,{});
assert.ok(score.ok);
const receipt = {attemptId:validId,exam,answers:{},score,startedAt:1000,deadline:1000+exam.durationMinutes*60000,submittedAt:2000,serverNow:2000};
test('Kết quả đầy đủ sau nộp được nhận đúng phiên bản và có khóa thật', () => {
  const result = validateRemoteResult(receipt,exam.id,exam.versionHash);
  assert.equal(result.attemptId,validId);
  assert.equal(result.score.ok,true);
  assert.equal(result.exam.questions[0].kind,exam.questions[0].kind);
});
test('Nhận kết quả JSONB khi thứ tự thuộc tính trong từng dòng điểm thay đổi', () => {
  const fromDatabase=structuredClone(receipt);
  fromDatabase.score.rows=fromDatabase.score.rows.map(row=>({id:row.id,maxMillipoints:row.maxMillipoints,earnedMillipoints:row.earnedMillipoints}));
  assert.equal(validateRemoteResult(fromDatabase,exam.id,exam.versionHash).score.ok,true);
});
for (const [name, mutation] of [
  ['sai đề', (r:any)=>{r.exam.id='mtm-other';}],
  ['sai phiên bản', (r:any)=>{r.exam.versionHash='f'.repeat(64);}],
  ['chỉ có câu hỏi', (r:any)=>{r.exam=publicCatalog[0];}],
  ['thiếu cấu trúc điểm', (r:any)=>{r.score={ok:true};}],
  ['điểm vượt tổng', (r:any)=>{r.score.earnedMillipoints=10001;r.score.finalMillipoints=10001;}],
  ['thiếu đáp án bài làm', (r:any)=>{delete r.answers;}],
  ['mã lượt sai', (r:any)=>{r.attemptId='not-an-attempt';}],
  ['thời gian nộp trước lúc bắt đầu', (r:any)=>{r.submittedAt=500;}],
] as const) {
  test(`Không nhận kết quả máy chủ ${name}`, () => {
    const copy = structuredClone(receipt);mutation(copy);
    assert.throws(()=>validateRemoteResult(copy,exam.id,exam.versionHash));
  });
}
const remote:RemoteAttempt={attemptId:validId,attemptToken:token,versionHash:exam.versionHash,startedAt:1000,deadline:1000+exam.durationMinutes*60000,serverNow:1000};
test('Xem lại kết quả giữ URL PDF câu hỏi vừa ký, khóa và bản nguồn không bị sửa', () => {
  const rawReview=structuredClone(receipt);
  rawReview.exam.sourcePdf!.url='https://storage.invalid/private/questions.pdf';
  const freshExam=structuredClone(publicCatalog[0]);
  freshExam.sourcePdf!.url='https://storage.invalid/signed/questions.pdf?synthetic-signature';
  const hydrated=hydrateRemoteReview(rawReview,freshExam);
  assert.equal(hydrated.exam.sourcePdf!.url,freshExam.sourcePdf!.url);
  assert.deepEqual(hydrated.exam.questions,rawReview.exam.questions);
  assert.equal(hydrated.score,rawReview.score);
  assert.equal(rawReview.exam.sourcePdf!.url,'https://storage.invalid/private/questions.pdf');
});
test('Lượt đã nộp chỉ dùng lại capability khi đúng localAttemptId của bài đang xem', () => {
  const completed:RemoteAttempt={...remote,localAttemptId:'synthetic-local-old',result:receipt};
  assert.equal(needsFreshRemote(completed,{attemptId:'synthetic-local-new'}),true);
  assert.equal(needsFreshRemote(completed,{attemptId:'synthetic-local-old'}),false);
  assert.equal(needsFreshRemote(null,{attemptId:'synthetic-local-new'}),true);
  assert.equal(needsFreshRemote(remote,{attemptId:'synthetic-local-active'}),false);
});
test('Lưu rồi đọc lại capability đúng đề, không đặt token trong URL', () => {
  const storage = new FakeStore();saveRemote(storage,exam.id,remote);
  assert.deepEqual(readRemote(storage,exam),remote);
  assert.equal(readRemote(storage,{...exam,versionHash:'f'.repeat(64)}),null);
  assert.equal(remoteKey(exam.id).includes(token),false);
});
test('Lưu capability thất bại phải báo lỗi thay vì cho rằng đã giữ quyền xem lại', () => {
  assert.throws(()=>saveRemote(null,exam.id,remote));
  const denied=new FakeStore();denied.failSet='denied';assert.throws(()=>saveRemote(denied,exam.id,remote));
  const stale=new FakeStore();stale.getHook=()=>null;assert.throws(()=>saveRemote(stale,exam.id,remote));
});
for (const [name, mutation] of [
  ['token sai', (r:any)=>{r.attemptToken='invalid';}],
  ['mã lượt sai', (r:any)=>{r.attemptId='invalid';}],
  ['deadline trước lúc bắt đầu', (r:any)=>{r.deadline=999;}],
] as const) {
  test(`Không dùng capability lưu hỏng: ${name}`, () => {
    const copy=structuredClone(remote);mutation(copy);
    const storage=new FakeStore({[remoteKey(exam.id)]:JSON.stringify(copy)});
    assert.equal(readRemote(storage,exam),null);
  });
}

type Scenario={access?:any;accessError?:boolean;signError?:boolean;throwRpc?:boolean};
async function apiCall(body:unknown, options:{method?:string;origin?:string;host?:string;configured?:boolean;scenario?:Scenario}={}) {
  const calls:{kind:string;name?:string;args?:unknown;ttl?:number}[]=[];
  const scenario=options.scenario??{};
  const client={async rpc(name:string,args:unknown){calls.push({kind:'rpc',name,args});if(scenario.throwRpc)throw Error('synthetic failure');return {data:scenario.access??null,error:scenario.accessError?{message:'private error'}:null};},storage:{from(name:string){calls.push({kind:'bucket',name});return {async createSignedUrl(_path:string,ttl:number){calls.push({kind:'sign',ttl});return {data:scenario.signError?null:{signedUrl:'https://storage.invalid/signed-synthetic'},error:scenario.signError?{message:'private error'}:null};}};}}};
  const handler=createExamApi(()=>options.configured===false?{}:{SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-a-real-key'},(()=>{calls.push({kind:'client'});return client;}) as any);
  const result={status:0,body:undefined as any,headers:{} as Record<string,string>};
  await handler({method:options.method??'POST',headers:{origin:options.origin??'https://minhthanhmath.vn',host:options.host??'minhthanhmath.vn'},body},{setHeader(k,v){result.headers[k]=v;},status(n){result.status=n;return {json(value){result.body=value;}};}});
  return {...result,calls};
}
const request={action:'solutionPdf',attemptId:validId,attemptToken:token};
const denied=await apiCall(request,{scenario:{accessError:true}});
test('API PDF trước nộp bị từ chối và không gọi ký URL', () => {
  assert.equal(denied.status,403);
  assert.equal(denied.calls.some(c=>c.kind==='sign'),false);
  assert.equal(denied.headers['Cache-Control'],'no-store, private');
  assert.equal(denied.headers['X-Robots-Tag'],'noindex, nofollow');
  assert.doesNotMatch(JSON.stringify(denied.body),/private error|synthetic-not-a-real-key/);
});
const allowed=await apiCall(request,{scenario:{access:{path:'synthetic/solutions.pdf'}}});
test('API chỉ ký PDF sau RPC cho phép, dùng hạn 120 giây', () => {
  assert.equal(allowed.status,200);
  assert.deepEqual(allowed.body,{url:'https://storage.invalid/signed-synthetic'});
  assert.deepEqual(allowed.calls.find(c=>c.kind==='rpc'),{kind:'rpc',name:'mtm_exam_pdf_access',args:{p_attempt:validId,p_token:token,p_kind:'solutions'}});
  assert.equal(allowed.calls.find(c=>c.kind==='sign')?.ttl,120);
});
for (const [name, input, options, expected] of [
  ['GET',request,{method:'GET'},405],
  ['khác origin',request,{origin:'https://other.invalid'},403],
  ['host giả',request,{host:'other.invalid'},403],
  ['JSON hỏng','{',{},400],
  ['token sai',{...request,attemptToken:'bad'},{},400],
  ['mã lượt sai',{...request,attemptId:'bad'},{},400],
  ['path tự chọn',{...request,path:'private/solutions.pdf'},{},400],
  ['thiếu cấu hình',request,{configured:false},503],
] as const) {
  const response=await apiCall(input,options);
  test(`API chặn ${name} trước truy cập kho`, () => {assert.equal(response.status,expected);assert.equal(response.calls.length,0);});
}
for (const [name, scenario, status] of [
  ['chưa có PDF',{access:{}},404],
  ['lỗi RPC',{throwRpc:true},503],
  ['lỗi ký URL',{access:{path:'synthetic/solutions.pdf'},signError:true},503],
] as const) {
  const response=await apiCall(request,{scenario});
  test(`API xử lý ${name} không lộ lỗi nội bộ`, () => {assert.equal(response.status,status);assert.doesNotMatch(JSON.stringify(response.body),/private error|synthetic failure|synthetic-not-a-real-key/);});
}
finish({syntheticOnly:true,networkCalls:0});
