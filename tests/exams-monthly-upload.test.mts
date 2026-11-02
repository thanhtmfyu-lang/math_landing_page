import assert from 'node:assert/strict';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {expectedSlots} from '../server/btvn/publish-handler';
import {runMonthlyUploadOnce,gradeMonthlyEssay,type MonthlyJob,type MonthlyPipeline,type MonthlyRepository} from '../server/lesson-upload/monthly-worker';
import {reviewQuestions} from '../server/lesson-upload/worker';
import {monthlyWindow,validateMonthlyPapers} from '../src/native/lesson-upload/monthly-model';
import {scoreAssessment} from '../src/native/exams/assessment';

function harness(){
 const exams=[pipelineFixture(),pipelineFixture()];(exams[1].exam.questions[0] as any).answer='A';exams[1].verification.slots[0].expected='A';exams[1].verification.slots[0].actual='A';
 const job:MonthlyJob={id:'10000000-0000-4000-8000-000000000001',claim_token:'fixture-lease',lesson_code:'thi-thang-2026-11-web-fixture',class_ids:['c1'],class_names:{c1:'Lớp giả pipeline'},class_dates:{c1:'2026-11-15'},teacher_keys:{c1:'fixture'},exam_date:'2026-11-15',opens_at:'2026-11-15T12:00:00Z',closes_at:'2026-11-15T14:00:00Z',title:'Kỳ thi giả',version:1,papers:[101,102].map(code=>({code,homework_path:'fake-'+code+'.pdf',answer_path:'key-'+code+'.pdf',answer_text:null})),checkpoint:{}};
 let committed:any[]=[],blocked=0,waited=0,read=0;const values=new Map<string,any>();const reviews:any[]=[];
 const state={async save(_id:string,key:string,value:any){values.set(key,structuredClone(value));return key;},async load(key:string){return structuredClone(values.get(key));}};
 const pipeline:MonthlyPipeline={extractor:{provider:'chatgpt-oauth',model:'fake-extractor'},async read(j){read++;const f=exams[j.paper!-1];return {sourceVersion:String(j.paper).repeat(64),questions:reviewQuestions(f.exam),teacherSlots:expectedSlots(f.exam),privateAnswerHashes:['e'.repeat(64)]};},async build(j){return {exam:exams[j.paper!-1].exam,assets:exams[j.paper!-1].assets};},async review(input,provider){
  const raw=JSON.stringify(input);assert.doesNotMatch(raw,/acceptedAnswers|expected|teacherSlots|solution|answer_path/);
  reviews.push({provider,source:input.sourceVersion});return {provider,model:'fake-'+provider,receipt_hash:(provider==='grok'?'a':'b').repeat(64),request_hash:(provider==='grok'?'c':'d').repeat(64),sourceVersion:input.sourceVersion,slots:exams[Number(input.sourceVersion[0])-1].verification.slots};
 },async sympy(input){return {engine:'sympy',version:'fixture-only',sourceVersion:input.sourceVersion,passed:true,receipt_hash:'f'.repeat(64),slots:exams[Number(input.sourceVersion[0])-1].verification.slots};}};
 const repo:MonthlyRepository={async claim(){return job;},async current(){},async checkpoint(_j,cp){job.checkpoint={...cp};},async wait(){waited++;},async block(){blocked++;},async publish(_j,p){committed=p;},assets(){return {async rpc(){throw Error('not used');},async upload(){}};}};
 return {job,pipeline,repo,state,exams,reviews,stats:()=>({committed,blocked,waited,read})};
}
{
 const h=harness(),r=await runMonthlyUploadOnce(h.repo,h.pipeline,h.state,'test');assert.equal(r.status,'complete',JSON.stringify(r));
 const p=h.stats().committed;assert.equal(p.length,2);assert.equal(p[0].exam.questions[0].answer,'D');assert.equal(p[1].exam.questions[0].answer,'A');assert.equal(p[1].lesson_key,h.job.lesson_code+'-thi-ma-2');assert.equal(p[0].kind,'kiem-tra-thang');assert.deepEqual(h.reviews.map(r=>r.provider),['grok','agy','grok','agy']);
 // Actual existing auto-grader grades the selected 102 key, never key101.
 const wrong=scoreAssessment(h.exams[0].exam,{[h.exams[0].exam.questions[0].id]:'A'}),right=scoreAssessment(h.exams[1].exam,{[h.exams[1].exam.questions[0].id]:'A'});assert.ok(right.ok&&wrong.ok&&right.earnedMillipoints>wrong.earnedMillipoints);
}
{
 const h=harness();h.pipeline.review=async(input)=>({status:'pending',request_hash:'a'.repeat(64),sourceVersion:input.sourceVersion});assert.equal((await runMonthlyUploadOnce(h.repo,h.pipeline,h.state,'test')).status,'waiting_review');assert.equal(h.stats().committed.length,0);assert.equal(h.stats().waited,1);
}
{
 const h=harness(),original=h.pipeline.review;h.pipeline.review=async(input,p)=>{const r:any=await original(input,p);return {...r,slots:r.slots.map((s:any)=>({...s,actual:s.question_id==='mc-1'?'B':s.actual}))};};assert.equal((await runMonthlyUploadOnce(h.repo,h.pipeline,h.state,'test')).status,'blocked');assert.equal(h.stats().committed.length,0);
}
{
 const h=harness();h.pipeline.sympy=async(input)=>({engine:'sympy',version:'fixture',sourceVersion:input.sourceVersion,passed:false,receipt_hash:'f'.repeat(64),slots:[]});assert.equal((await runMonthlyUploadOnce(h.repo,h.pipeline,h.state,'test')).status,'blocked');assert.equal(h.stats().committed.length,0);
}
{
 const h=harness(),original=h.pipeline.review;let pending=true;h.pipeline.review=async(input,p)=>pending&&p==='agy'?{status:'pending',request_hash:'f'.repeat(64),sourceVersion:input.sourceVersion}:original(input,p);assert.equal((await runMonthlyUploadOnce(h.repo,h.pipeline,h.state,'test')).status,'waiting_review');pending=false;assert.equal((await runMonthlyUploadOnce(h.repo,h.pipeline,h.state,'test')).status,'complete');assert.equal(h.stats().read,2,'resume reuses private extraction');assert.equal(h.reviews.filter(r=>r.provider==='grok').length,2);
}
for(const delta of [0.25,0.26]){
 const calls:string[]=[];const result=await gradeMonthlyEssay({submission_hash:'a'.repeat(64),rubric_hash:'b'.repeat(64),max_score:3},async provider=>{calls.push(provider);return {provider,model:'fixture-only',request_id:'request-'+provider,receipt_hash:(provider==='grok'?'c':provider==='agy'?'d':'e').repeat(64),submission_hash:'a'.repeat(64),rubric_hash:'b'.repeat(64),score:provider==='agy'?2+delta:2,max_score:3,images_seen:true};});
 assert.deepEqual(calls,delta>0.25?['grok','agy','codex']:['grok','agy']);assert.equal(result.paper_scores_unchanged,true);
}
assert.throws(()=>monthlyWindow('2026-02-30','19:00','21:00'));assert.throws(()=>monthlyWindow('2026-11-03','21:00','19:00'));assert.equal(monthlyWindow('2026-11-03','19:30','21:30').opensAt,'2026-11-03T12:30:00.000Z');assert.match(validateMonthlyPapers([{files:[] as any,answers:[],text:''}])!,/hai mã/);
console.log('Monthly: two separate keys, actual 102 auto-grader, 2 providers + CAS gate, waiting/resume, mismatch hold, >0.25 third provider; synthetic only.');
