// Chỉ dữ liệu tổng hợp trong RAM và RPC giả, không đọc hồ sơ hoặc gọi mạng.
import assert from 'node:assert/strict';
import {HomeworkError,HomeworkService} from '../server/btvn/service';
import {MemoryHomeworkRepository,type StudentWork} from '../server/btvn/repository';
import {SupabaseHomeworkRepository,type DurableSnapshot} from '../server/btvn/supabase-repository';
import {homeworkLessonCard} from '../server/btvn/lesson-card';
import {createDraft,type Draft} from '../src/native/exams/store';
import type {PracticeExam} from '../src/native/exams/data';
import type {HomeworkLesson,LessonMaterial,HomeworkReceipt} from '../src/native/homework/btvn-contract';
import {MTM_SCORING_VERSION} from '../src/native/exams/mtm-scoring';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {suite} from './exams-harness.mts';

const {test,finish}=suite('DAILY17-AFTER-SERVICE-');
const T0=Date.UTC(2026,9,16,3),closesAt=T0+60000;
const clone=<T,>(value:T):T=>structuredClone(value);
function fixture(monthly=false){
  const f=pipelineFixture();
  const exam:PracticeExam={...f.exam,rubricVersion:MTM_SCORING_VERSION,answerKeyVersion:'fixture-key-v1',sourceComplete:true,questionCount:1,
    sections:[{label:'Trắc nghiệm tổng hợp',kind:'mc',count:1}],questions:[{id:'q-fake',kind:'mc',sourceRef:'Câu tổng hợp',prompt:'1 + 1 = ?',choices:['2','3','4','5'],answer:'A',maxMillipoints:10000,maxPoints:{numerator:'10',denominator:'1'}}]};
  const material:LessonMaterial={...f.material,kind:monthly?'kiem-tra-thang':'btvn',...(monthly?{opensAt:T0-1000,closesAt}:{}),
    videoId:'fixture-video',videoUrl:'https://video.invalid/fixture',materialUrl:'/fixture/material.pdf',handoutUrl:'/fixture/handout.pdf',homeworkUrl:'/fixture/homework.pdf',homeworkUrls:['/fixture/homework.pdf']};
  const student={studentCode:'SYNTHETIC-NOT-A-STUDENT',fullName:'Người dùng tổng hợp',phone:'0000000000',className:material.classNames[0]};
  return {exam,material,student,answers:{'q-fake':'A'}};
}
function draftFor(exam:PracticeExam,id='fixture-old-attempt'){
  const made=createDraft(exam,id,T0);assert.ok(made.ok);return made.value;
}
function isReadiness409(error:unknown){return error instanceof HomeworkError&&error.status===409&&/chưa sẵn sàng chấm/.test(error.message);}
async function asyncTest(name:string,fn:()=>Promise<void>){const error=await fn().then(()=>null,error=>error);test(name,()=>{if(error)throw error;});}
function durableFixture(f:ReturnType<typeof fixture>,draft:Draft|null,clock:()=>number){
  let snapshot:DurableSnapshot={revision:0,exam:f.exam,material:f.material,lessons:[f.material],work:{student:f.student,drafts:draft?[draft]:[],receipts:[]}};
  const commits:HomeworkReceipt[][]=[];
  const durable=new SupabaseHomeworkRepository({async rpc(name,args){
    if(name==='mtm_btvn_read')return {data:clone(snapshot),error:null};
    if(name==='mtm_btvn_commit'){
      assert.equal(args.p_revision,snapshot.revision);
      const drafts=clone(args.p_drafts as StudentWork['drafts']),receipts=clone(args.p_receipts as HomeworkReceipt[]);
      commits.push(receipts);snapshot={...snapshot,revision:snapshot.revision+1,work:{...snapshot.work,drafts,receipts}};
      return {data:{ok:true},error:null};
    }
    throw Error('RPC ngoài phạm vi dữ liệu tổng hợp: '+name);
  }},async()=>{throw Error('Không gọi Edge trong kiểm thử');},clock);
  return {durable,commits,getSnapshot:()=>snapshot};
}

test('Readiness không chặn constructor/state, chỉ từ chối tạo lượt mới bằng 409',()=>{
  const f=fixture();f.exam.sourceComplete=false;
  const repo=new MemoryHomeworkRepository([f.student]),service=new HomeworkService(repo,f.exam,0,'fixture',f.material.lessonCode,()=>T0,[f.material]);
  const token=service.login({studentCode:f.student.studentCode},'fixture-ip');
  assert.equal(service.state(token).draft,null);
  assert.throws(()=>service.start(token),isReadiness409);
  assert.equal(repo.get(f.student.studentCode)!.drafts.length,0);
});

test('Đề buổi khác chưa sẵn sàng không chặn mở lượt của buổi đã đủ nguồn',()=>{
  const f=fixture(),other={...f.material,lessonCode:'fixture-unready',date:'2026-10-14'},unready=clone(f.exam);unready.sourceComplete=false;
  const repo=new MemoryHomeworkRepository([f.student]),service=new HomeworkService(repo,f.exam,0,'fixture',f.material.lessonCode,()=>T0,[f.material,other],{[other.lessonCode]:unready});
  const token=service.login({studentCode:f.student.studentCode},'fixture-ip');
  assert.ok(service.start(token).draft);
  assert.equal(service.select(token,other.lessonCode).draft,null);
  assert.throws(()=>service.start(token),isReadiness409);
  assert.equal(repo.get(f.student.studentCode)!.drafts.length,1);
  assert.equal(repo.get(f.student.studentCode)!.lessons?.[other.lessonCode]?.drafts.length??0,0);
});

for(const reason of ['sourceComplete','answer'] as const)test(`Lượt cũ vẫn state/resume/save/submit khi readiness lỗi ${reason}`,()=>{
  const f=fixture(),draft=draftFor(f.exam);
  if(reason==='sourceComplete')f.exam.sourceComplete=false;else delete (f.exam.questions[0] as {answer?:string}).answer;
  let now=T0+1;const repo=new MemoryHomeworkRepository([f.student]);repo.put({student:f.student,drafts:[draft],receipts:[]});
  const service=new HomeworkService(repo,f.exam,0,'fixture',f.material.lessonCode,()=>now,[f.material]),token=service.login({studentCode:f.student.studentCode},'fixture-ip');
  assert.equal(service.state(token).draft!.attemptId,draft.attemptId);
  assert.equal(service.start(token).draft!.attemptId,draft.attemptId);
  assert.deepEqual(service.save(token,draft.attemptId,f.answers).draft!.answers,f.answers);now++;
  const submitted=service.submit(token,draft.attemptId,f.answers),stored=repo.get(f.student.studentCode)!;
  assert.equal(submitted.receipts.length,1);assert.equal(stored.receipts[0].score,null);
  assert.ok(stored.receipts[0].mtm!.pending.length);assert.equal(stored.drafts[0].answerKeyVersion,draft.answerKeyVersion);
  assert.equal(stored.drafts[0].examVersionHash,draft.examVersionHash);assert.deepEqual(stored.drafts[0].answers,f.answers);
  assert.throws(()=>service.start(token),isReadiness409);
  assert.equal(repo.get(f.student.studentCode)!.drafts.length,1);
});

await asyncTest('Durable vẫn commit save/submit lượt cũ khi readiness đã hạ',async()=>{
  const f=fixture(),draft=draftFor(f.exam);f.exam.sourceComplete=false;
  let now=T0+1;const h=durableFixture(f,draft,()=>now);
  assert.equal((await h.durable.call('fixture-session','state')).draft!.attemptId,draft.attemptId);
  assert.equal((await h.durable.call('fixture-session','start')).draft!.attemptId,draft.attemptId);
  const saved=await h.durable.call('fixture-session','save',f.material.lessonCode,draft.attemptId,f.answers);
  assert.equal(saved.saveOnly,true);now++;
  const submitted=await h.durable.call('fixture-session','submit',f.material.lessonCode,draft.attemptId,f.answers);
  const work=h.getSnapshot().work;assert.equal(submitted.receipts.length,1);assert.equal(work.receipts[0].score,null);
  assert.deepEqual(work.drafts[0].answers,f.answers);assert.equal(work.drafts[0].answerKeyVersion,draft.answerKeyVersion);
  const commits=h.commits.length;
  await assert.rejects(h.durable.call('fixture-session','start'),isReadiness409);
  assert.equal(h.commits.length,commits);assert.equal(work.drafts.length,1);
});

await asyncTest('Start lượt cũ hết giờ commit bản tự nộp trước khi chặn lượt kế tiếp',async()=>{
  const f=fixture(),draft={...draftFor(f.exam),answers:f.answers};f.exam.sourceComplete=false;
  const h=durableFixture(f,draft,()=>draft.deadline);
  const submitted=await h.durable.call('fixture-session','start');
  assert.equal(submitted.draft!.attemptId,draft.attemptId);assert.ok(submitted.draft!.submittedAt!==null);
  assert.equal(h.commits.length,1);assert.equal(h.getSnapshot().work.receipts.length,1);
  assert.equal(h.getSnapshot().work.receipts[0].timedOut,true);assert.equal(h.getSnapshot().work.drafts.length,1);
  await assert.rejects(h.durable.call('fixture-session','start'),isReadiness409);
  assert.equal(h.commits.length,1);
});

await asyncTest('Start lượt thường thứ năm hết giờ vẫn commit receipt, không tạo lượt thứ sáu',async()=>{
  const f=fixture(),draft={...draftFor(f.exam,'fixture-attempt-5'),answers:f.answers};
  const h=durableFixture(f,draft,()=>draft.deadline),snapshot=h.getSnapshot();
  snapshot.work.drafts=[...Array.from({length:4},(_,index)=>({...draftFor(f.exam,'fixture-attempt-'+(index+1)),submittedAt:T0+1,updatedAt:T0+1,revision:1})),draft];
  snapshot.work.receipts=snapshot.work.drafts.slice(0,4).map((previous,index)=>({attemptId:previous.attemptId,attemptNumber:index+1,submittedAt:T0+1,elapsedSeconds:1,score:10,late:null,timedOut:false}));
  const submitted=await h.durable.call('fixture-session','start');
  assert.equal(submitted.draft!.attemptId,draft.attemptId);assert.ok(submitted.draft!.submittedAt!==null);
  assert.equal(h.commits.length,1);assert.equal(h.getSnapshot().work.drafts.length,5);assert.equal(h.getSnapshot().work.receipts.length,5);
  assert.equal(h.getSnapshot().work.receipts.at(-1)!.timedOut,true);assert.equal(h.getSnapshot().work.receipts.at(-1)!.score,10);
  await assert.rejects(h.durable.call('fixture-session','start'),error=>error instanceof HomeworkError&&error.status===409&&/hết lượt/.test(error.message));
  assert.equal(h.commits.length,1);assert.equal(h.getSnapshot().work.drafts.length,5);
});

test('Hàm thẻ chung giấu mọi liên kết, điểm và muộn trước đóng, giữ mốc nộp',()=>{
  const f=fixture(true),progress={startedAt:T0,dueAt:T0,bestScore:10,late:true,submittedAt:T0+1,available:true};
  const card=homeworkLessonCard(f.material,f.student.className,closesAt-1,progress);
  for(const key of ['bestScore','late','videoId','videoUrl','materialUrl','handoutUrl','homeworkUrl'] as const)assert.equal(card[key],null,key);
  assert.deepEqual(card.homeworkUrls,[]);assert.equal(card.startedAt,progress.startedAt);assert.equal(card.submittedAt,progress.submittedAt);assert.equal(card.available,true);
  const opened=homeworkLessonCard(f.material,f.student.className,closesAt,progress);
  for(const key of ['videoId','videoUrl','materialUrl','handoutUrl','homeworkUrl'] as const)assert.equal(opened[key],f.material[key],key);
  assert.equal(opened.bestScore,10);assert.equal(opened.late,true);assert.equal(opened.startedAt,progress.startedAt);
  const regular=homeworkLessonCard({...f.material,kind:'btvn'},f.student.className,closesAt-1,progress);
  assert.equal(regular.bestScore,10);assert.equal(regular.videoId,f.material.videoId);
});

await asyncTest('Service và durable dựng cùng thẻ tháng trước đóng và mở đúng closesAt',async()=>{
  const f=fixture(true);let now=T0;
  const repo=new MemoryHomeworkRepository([f.student]),service=new HomeworkService(repo,f.exam,0,'fixture',f.material.lessonCode,()=>now,[f.material]);
  const token=service.login({studentCode:f.student.studentCode},'fixture-ip');
  const dbCard={...f.material,dueAt:null,bestScore:null,late:null,submittedAt:null,available:true} as HomeworkLesson;
  const snapshot:DurableSnapshot={revision:0,exam:f.exam,material:f.material,lessons:[dbCard],work:repo.get(f.student.studentCode)!};
  const durable=new SupabaseHomeworkRepository({async rpc(name){assert.equal(name,'mtm_btvn_read');return {data:clone(snapshot),error:null};}},async()=>{throw Error('Không gọi Edge trong kiểm thử');},()=>now);
  assert.deepEqual(service.state(token).lessons![0],(await durable.call('fixture-session','state')).lessons![0]);
  assert.equal(service.state(token).lessons![0].startedAt,null);
  const id=service.start(token).draft!.attemptId;now++;
  snapshot.work=repo.get(f.student.studentCode)!;
  assert.deepEqual(service.state(token).lessons![0],(await durable.call('fixture-session','state')).lessons![0]);
  assert.equal(service.state(token).lessons![0].startedAt,T0);
  service.submit(token,id,f.answers);
  const work=repo.get(f.student.studentCode)!,receipt=work.receipts[0];
  snapshot.work=work;snapshot.lessons=[{...dbCard,bestScore:receipt.score,late:receipt.late,submittedAt:receipt.submittedAt} as HomeworkLesson];
  for(const time of [closesAt-1,closesAt]){
    now=time;const card=service.state(token).lessons![0],db=(await durable.call('fixture-session','state')).lessons![0];
    assert.deepEqual(card,db);assert.equal(card.startedAt,T0);assert.equal(card.submittedAt,receipt.submittedAt);
    assert.equal(card.bestScore,time<closesAt?null:10);assert.equal(card.videoId,time<closesAt?null:f.material.videoId);
  }
  assert.deepEqual(repo.get(f.student.studentCode)!.receipts,[receipt],'Dựng thẻ không sửa biên nhận đầy đủ trong kho');
});

finish();
