import assert from 'node:assert/strict';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {runUploadOnce,reviewQuestions,type UploadJob,type Pipeline} from '../server/lesson-upload/worker';
import {expectedSlots} from '../server/btvn/publish-handler';
import {HomeworkService} from '../server/btvn/service';
import {MemoryHomeworkRepository} from '../server/btvn/repository';
import {homeworkLessonCard} from '../server/btvn/lesson-card';
import {overallUploadProgress} from '../src/native/lesson-upload/upload-progress';
import {latestForSession,listSessionAssessments,type LessonUpload,type UploadDashboard} from '../src/native/lesson-upload/model';
import type {LessonMaterial} from '../src/native/homework/btvn-contract';
import {reviewUploadOnce} from '../server/lesson-upload/review-backfill';

// Synthetic sources/providers only. No native AI, account, network or student data.
const assessmentId='11111111-1111-4111-8111-111111111111',cls='Lớp giả kiểm tra';
const open='2026-11-13T10:00:00Z',close='2026-11-13T12:00:00Z';
function harness(){
 const fixture=pipelineFixture();fixture.exam.title='Kiểm tra tự đặt · tháng 11 · Đạo hàm';fixture.exam.durationMinutes=45;
 const job:UploadJob={id:'22222222-2222-4222-8222-222222222222',claim_token:'fixture-lease',work_kind:'exam',assessment_id:assessmentId,exam_type:'custom',exam_config:{opens_at:open,closes_at:close,duration_minutes:45},lesson_code:'web-fixture-class-exam',class_ids:['c1'],class_names:{c1:cls},class_dates:{c1:'2026-11-13'},start_times:{c1:'17:00'},due_at_by_class:{},lesson_date:'2026-11-13',teacher_key:'fixture-teacher',title:fixture.exam.title,task_scope:'Toàn bộ đề',homework_path:'private/hs.pdf',answer_path:'private/gv.pdf',answer_text:null,handout_path:null,video_url:null,version:1,checkpoint:{}};
 let commits=0,reads=0;const stateValues=new Map<string,unknown>(),payloads:any[]=[],marks:any[]=[];
 const state={async save(id:string,stage:string,value:unknown){const key=id+stage;stateValues.set(key,structuredClone(value));return key;},async load(key:string){return structuredClone(stateValues.get(key));}};
 const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic'},async read(){reads++;return {sourceVersion:'a'.repeat(64),questions:reviewQuestions(fixture.exam),teacherSlots:expectedSlots(fixture.exam),privateAnswerHashes:['e'.repeat(64)]};},async build(){return {exam:fixture.exam,assets:fixture.assets};},async review(input){assert.doesNotMatch(JSON.stringify(input),/teacherSlots|acceptedAnswers|expected|solution/);return {provider:'grok',model:'synthetic-independent',receipt_hash:'d'.repeat(64),slots:fixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const repo={async claim(){return job;},async current(){},async step(_j:any,n:number,status:string,detail:string,cp:any){job.checkpoint={...cp};marks.push({n,status,detail});},async finish(){},publisher(){return {async upload(){},async rpc(action:string,payload:any){if(action==='lookup')return {status:null};assert.equal(action,'publish');payloads.push(payload);commits++;return {status:'da_dang'};}};}};
 return {job,fixture,state,pipeline,repo,payloads,marks,stats:()=>({commits,reads})};
}
{
 const h=harness(),result=await runUploadOnce(h.repo,h.pipeline,h.state,'fixture');
 assert.equal(result.status,'complete');assert.equal(h.stats().commits,1);
 const p=h.payloads[0];assert.equal(p.kind,'kiem-tra');assert.equal(p.assessmentId,assessmentId);assert.equal(p.examType,'custom');assert.equal(p.opensAt,open);assert.equal(p.closesAt,close);assert.equal(p.exam.durationMinutes,45);assert.equal(p.material.title,h.job.title);assert.equal(p.exam.title,h.job.title);assert.deepEqual(p.material.classNames,[cls]);
 const calls:any[]=[];
 const db={async rpc(_name:string,{p}:any){calls.push(p);return {error:null,data:p.action==='worker_pending_review'?{job:{...h.job,pending_reviews:[{paper:1,request_hash:'f'.repeat(64),source_version:'a'.repeat(64)}]}}:{ok:true}};}};
 assert.equal((await reviewUploadOnce(db,h.pipeline,h.state,true,false)).status,'reviewed');
 assert.equal(calls[0].worker_protocol,110);assert.equal(calls[1].matched,true,'backfill validates actual custom-test kind and 45-minute duration');
}
for(const mutate of [
 (h:ReturnType<typeof harness>)=>{h.job.work_kind='unknown' as any;},
 h=>{h.job.class_ids.push('c2');h.job.class_names.c2='Khác';},
 h=>{h.job.homework2_path='private/second.pdf';},
 h=>{h.job.exam_config!.duration_minutes=241;},
 h=>{h.job.exam_config!.closes_at=open;},
 h=>{h.job.exam_type='invalid' as any;},
 h=>{h.job.assessment_id=null;},
 h=>{h.job.answer_path=null;},
]){
 const h=harness();mutate(h);assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);assert.equal(h.stats().reads,0,'invalid metadata cannot consume a provider call');
}
for(const mutate of [(h:ReturnType<typeof harness>)=>{h.fixture.exam.title='Tên AI đổi sai';},h=>{h.fixture.exam.durationMinutes=120;},h=>{h.fixture.exam.sourceUrl='https://example.invalid/storage/v1/object/authenticated/mtm-lesson-private/'+h.job.homework_path;}]){
 const h=harness();mutate(h);assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);
}

const fixture=pipelineFixture();fixture.exam.durationMinutes=45;
fixture.exam.questions[0].solutionBlocks=[{type:'text',text:'PRIVATE_STRUCTURED_SOLUTION'}];
const opens=Date.parse(open),closes=Date.parse(close),code='web-custom-assessment';
const material:LessonMaterial={...fixture.material,lessonCode:code,title:fixture.exam.title,classNames:[cls],kind:'kiem-tra',assessmentId,examType:'custom',opensAt:opens,closesAt:closes,durationMinutes:45};
let now=opens-1;
const repo=new MemoryHomeworkRepository([{studentCode:'FAKE-CODE',fullName:'Học sinh tổng hợp',phone:'',className:cls}]);
const service=new HomeworkService(repo,fixture.exam,0,'fixture',code,()=>now,[material]);
const token=service.login({studentCode:'FAKE-CODE'},'fixture');
assert.equal(service.state(token).exam,null);assert.throws(()=>service.start(token),/chưa mở/);
now=opens;const started=service.start(token);assert.equal(started.maxAttempts,1);assert.equal(started.kind,'kiem-tra');assert.equal(started.examType,'custom');assert.equal(started.draft!.deadline-started.draft!.startedAt,45*60000);
assert.ok(!JSON.stringify(started.exam).includes('PRIVATE_STRUCTURED_SOLUTION'),'question-only transport must also strip structured solutions');
assert.equal(service.start(token).draft!.attemptId,started.draft!.attemptId,'reload resumes one stable attempt');
now=opens+1000;const submitted=service.submit(token,started.draft!.attemptId,{});assert.equal(submitted.receipts.length,1);assert.equal(submitted.receipts[0].score,null);assert.equal(submitted.bestScore,null);assert.equal(submitted.solutionsAvailable,false);assert.throws(()=>service.start(token),/hết lượt/);
assert.equal(homeworkLessonCard(material,cls,now,{bestScore:10,submittedAt:now,available:true}).bestScore,null);
now=closes;const released=service.state(token);assert.equal(released.solutionsAvailable,true);assert.equal(released.receipts[0].score,0);assert.equal(released.bestScore,0);
// A late start uses the same saved deadline schema; close still forces submission.
const lateRepo=new MemoryHomeworkRepository([{studentCode:'FAKE-LATE',fullName:'HS tổng hợp khác',phone:'',className:cls}]);
const lateService=new HomeworkService(lateRepo,fixture.exam,0,'fixture',code,()=>now,[material]);
now=closes-1000;const lateToken=lateService.login({studentCode:'FAKE-LATE'},'fixture'),late=lateService.start(lateToken);now=closes;
assert.ok(lateService.save(lateToken,late.draft!.attemptId,{}).draft!.submittedAt!==null);assert.throws(()=>lateService.start(lateToken),/đã đóng|hết lượt/);

const session={class_id:'c1',class_name:cls,lesson_date:'2026-11-13',teacher_key:'t',start_time:'17:00',end_time:'19:00'};
const steps=Array.from({length:6},(_,i)=>({step:i+1,status:'xong' as const,detail:null}));
const base:LessonUpload={id:'hw',class_ids:['c1'],lesson_date:session.lesson_date,teacher_key:'t',title:'BTVN',task_scope:'Câu1',version:1,created_at:open,steps};
const test={...base,id:'test',work_kind:'exam' as const,assessment_id:assessmentId,version:8,created_at:close};
const other={...test,id:'other',assessment_id:'33333333-3333-4333-8333-333333333333'};
assert.equal(latestForSession([base,test,other],session)?.id,'hw');assert.equal(listSessionAssessments([base,test,{...test,id:'old',version:1},other],session).length,2);
const dashboard={staff:{},teachers:[],sessions:[session],uploads:[base,test,other],server_now:'2026-11-14T00:00:00Z'} as unknown as UploadDashboard;
assert.equal(overallUploadProgress(dashboard).publishedCount,1);assert.equal(overallUploadProgress({...dashboard,uploads:[test,other]}).publishedCount,0,'tests cannot count as completed homework');
console.log('Class assessment pipeline: source/title/config fences, timed one-attempt/reveal, class-test identity and homework progress separation verified.');
