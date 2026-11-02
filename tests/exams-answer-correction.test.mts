import assert from 'node:assert/strict';
import {planAnswerCorrection,handleAnswerCorrection,canonicalCorrection,type CorrectionRequest} from '../server/btvn/answer-correction';
import {createDraft,submitDraft,validateDraft} from '../src/native/exams/store';
import {resultFor} from '../src/native/exams/result';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {createBtvnPublishHandler} from '../server/btvn/publish-handler';
import {MTM_SCORING_VERSION} from '../src/native/exams/mtm-scoring';
import {selfCorrectionFixture} from './answer-correction-self-fixture';
let checks=0;
const request:CorrectionRequest={action:'answer_correction_preview',lesson_key:'fixture-only',request_id:'fixture-correction-20261102',lenh_ref:'fixture-authority-only',approved_via:'fixture-user-scope',patches:[{question_id:'mc-1',answer:'A'},{question_id:'sa-1',acceptedAnswers:['3']}]};
const exam=pipelineFixture().exam;
function must(r:any):any{assert.equal(r.ok,true);return r.value;}
const start=must(createDraft(exam,'submitted-fixture',1000));
const draft=must(submitDraft(exam,{...start,answers:{'mc-1':'A','sa-1':'3'}},3000));
const receipt={attemptId:draft.attemptId,attemptNumber:1,submittedAt:3000,elapsedSeconds:2,score:0,late:false,timedOut:false};
const snapshot={exam,work:[{student_id:'00000000-0000-4000-8000-000000000001',revision:7,drafts:[draft],receipts:[receipt]}]};
const pristine=canonicalCorrection(snapshot);
const plan=await planAnswerCorrection(snapshot,request);
assert.equal(plan.changed,1);assert.equal(plan.attempts,1);assert.equal(plan.plan.work[0].receipts[0].score,6);checks++;
assert.equal(canonicalCorrection(snapshot),pristine);assert.deepEqual(plan.plan.work[0].drafts[0].answers,draft.answers);checks++;
assert.equal(plan.plan.work[0].receipts[0].submittedAt,3000);assert.equal(plan.plan.work[0].receipts[0].late,false);assert.equal(plan.plan.work[0].revision,7);checks++;
assert.notEqual(plan.plan.exam.versionHash,exam.versionHash);assert.deepEqual(plan.plan.exam.questions.map(q=>q.prompt),exam.questions.map(q=>q.prompt));assert.ok(validateDraft(plan.plan.work[0].drafts[0],plan.plan.exam).ok);checks++;
assert.equal((await planAnswerCorrection(snapshot,request)).plan_sha256,plan.plan_sha256);checks++;
for(const bad of [
 {...request,patches:[request.patches[0],request.patches[0]]},
 {...request,patches:[{question_id:'unknown',answer:'A'}]},
 {...request,patches:[{question_id:'mc-1',acceptedAnswers:['1']}]},
 {...request,lenh_ref:''},
 {...request,patches:[{question_id:'mc-1',answer:'A',prompt:'injected'}]},
]) {await assert.rejects(()=>planAnswerCorrection(snapshot,bad as any));checks++;}
await assert.rejects(()=>planAnswerCorrection({...snapshot,work:[{...snapshot.work[0],drafts:[]}]},request));checks++;
await assert.rejects(()=>planAnswerCorrection({...snapshot,work:[{...snapshot.work[0],receipts:[receipt,receipt]}]},request));checks++;
await assert.rejects(()=>planAnswerCorrection({...snapshot,work:[{...snapshot.work[0],receipts:[]}]},request));checks++;
const open=must(createDraft(exam,'open-fixture',1000));
const withOpen={exam,work:[{...snapshot.work[0],drafts:[draft,open]}]};
assert.equal((await planAnswerCorrection(withOpen,request)).plan.work[0].drafts[1].submittedAt,null);checks++;
await assert.rejects(()=>planAnswerCorrection({...snapshot,work:[{...snapshot.work[0],receipts:[{...receipt,officialScore:5}]}]},request),/CORRECTION_MANUAL_OVERRIDE_HOLD/);checks++;
await assert.rejects(()=>planAnswerCorrection({...snapshot,work:[{...snapshot.work[0],receipts:[{...receipt,gradingPending:true}]}]},request),/CORRECTION_MANUAL_OVERRIDE_HOLD/);checks++;
const mtmExam={...exam,rubricVersion:MTM_SCORING_VERSION,answerKeyVersion:'fixture-key-v1',sourceComplete:true,
 questions:exam.questions.map(q=>({...q,maxPoints:{numerator:'10',denominator:'3'},maxMillipoints:10000/3,answerVerified:true,
  ...(q.kind==='tf'?{pointsByCorrectCount:[0,10000/30,10000/12,10000/6,10000/3]}:{}),
  ...(q.kind==='short'?{shortRule:{verified:true,evidence:'fixture-only',mode:'decimal'}}:{})}))} as any;
const mtmStarted=must(createDraft(mtmExam,'mtm-fixture',1000)),mtmDraft=must(submitDraft(mtmExam,{...mtmStarted,answers:{'mc-1':'A','sa-1':'3'}},3000));
const mtmResult=resultFor(mtmExam,mtmDraft)!;assert.ok(mtmResult.mtm);assert.deepEqual(mtmResult.mtm!.pending,[]);
const mtmSnapshot={exam:mtmExam,work:[{...snapshot.work[0],drafts:[mtmDraft],receipts:[{...receipt,attemptId:'mtm-fixture',score:Number(mtmResult.mtm!.officialDisplayTotal),mtm:mtmResult.mtm!}]}]};
const mtmPlan=await planAnswerCorrection(mtmSnapshot,request);assert.equal(mtmPlan.plan.work[0].receipts[0].score,6.67);assert.notEqual(mtmPlan.plan.exam.answerKeyVersion,'fixture-key-v1');assert.ok(validateDraft(mtmPlan.plan.work[0].drafts[0],mtmPlan.plan.exam).ok);checks++;
const calls:string[]=[];const port={rpc:async(action:string,payload:any)=>{calls.push(action);return action==='answer_correction_snapshot'?snapshot:{ok:true,status:'corrected_and_regraded'};},upload:async()=>{throw Error('NO_UPLOAD');}};
const preview=await handleAnswerCorrection(port,request);assert.equal(preview.status,'preview');assert.deepEqual(calls,['answer_correction_snapshot']);checks++;
calls.length=0;await assert.rejects(()=>handleAnswerCorrection(port,{...request,action:'answer_correction_apply',expected_plan_sha256:'0'.repeat(64)}),/CORRECTION_STALE_PREVIEW/);assert.deepEqual(calls,['answer_correction_snapshot']);checks++;
calls.length=0;assert.equal((await handleAnswerCorrection(port,{...request,action:'answer_correction_apply',expected_plan_sha256:plan.plan_sha256})).ok,true);assert.deepEqual(calls,['answer_correction_snapshot','answer_correction_commit']);checks++;
const handler=createBtvnPublishHandler(port,'x'.repeat(40));calls.length=0;
assert.equal((await handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify(request)}))).status,401);assert.equal(calls.length,0);checks++;
const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':'x'.repeat(40)},body:JSON.stringify(request)}));
assert.equal(response.status,200);const publicBody=await response.text();assert.ok(!publicBody.includes('student_id')&&!publicBody.includes('drafts')&&!publicBody.includes('answers'));checks++;
const self=selfCorrectionFixture(),beforeSelf=canonicalCorrection(self.snapshot);
const selfPlan=await planAnswerCorrection(self.snapshot,self.request);
assert.equal(selfPlan.attempts,2);assert.equal(selfPlan.changed,2);
for(let i=0;i<2;i++) {
  const old=self.snapshot.work[0].receipts[i],next=selfPlan.plan.work[0].receipts[i];
  assert.equal(old.score,4); // Only the four TF statements were correct under the old numeric key.
  assert.equal(next.score,7);
  assert.equal(next.score-old.score,3); // Exact weight of sa-1; self contributes zero.
  const {score:oldScore,...oldFields}=old,{score:newScore,...newFields}=next;
  assert.deepEqual(newFields,oldFields);
  assert.deepEqual(selfPlan.plan.work[0].drafts[i].answers,self.snapshot.work[0].drafts[i].answers);
  assert.ok(validateDraft(selfPlan.plan.work[0].drafts[i],selfPlan.plan.exam).ok);checks++;
}
assert.deepEqual(selfPlan.plan.exam.questions.at(-1),self.snapshot.exam.questions.at(-1));
assert.equal(canonicalCorrection(self.snapshot),beforeSelf);checks++;
const noMode={...self.request,patches:[{question_id:'sa-1',acceptedAnswers:['2/3']}]};
await assert.rejects(()=>planAnswerCorrection(self.snapshot,noMode),/CORRECTION_NEW_KEY_INVALID/);checks++;
for(const patches of [
  [{question_id:'sa-1',acceptedAnswers:['2/0'],mode:'rational'}],
  [{question_id:'sa-1',acceptedAnswers:['2/3','4/6'],mode:'rational'}],
  [{question_id:'sa-1',acceptedAnswers:['2/3'],mode:'unsupported'}],
  [{question_id:'sa-1',mode:'rational'}],
  [{question_id:'mc-1',answer:'A',mode:'rational'}],
  [{question_id:'self-1',acceptedAnswers:['2/3'],mode:'rational'}],
  [{question_id:'self-1',answer:'A'}],
]) {await assert.rejects(()=>planAnswerCorrection(self.snapshot,{...self.request,patches} as any));checks++;}
const ruleConflict=structuredClone(self.snapshot);
const short=ruleConflict.exam.questions.find(q=>q.id==='sa-1');
if(short?.kind!=='short')throw Error('fixture short');
short.shortRule={verified:true,evidence:'fixture-only',mode:'decimal'};
await assert.rejects(()=>planAnswerCorrection(ruleConflict,self.request),/CORRECTION_SHORT_RULE_CONFLICT/);checks++;
const numericRulePlan=await planAnswerCorrection(ruleConflict,{...self.request,patches:[{question_id:'sa-1',acceptedAnswers:['3'],mode:'numeric'}]});
const numericQuestion=numericRulePlan.plan.exam.questions[2];assert.equal(numericQuestion.kind,'short');
assert.equal(numericQuestion.kind==='short'&&numericQuestion.mode,'numeric');checks++;
short.shortRule={verified:true,evidence:'fixture-only',mode:'rational'};
assert.equal((await planAnswerCorrection(ruleConflict,self.request)).plan.work[0].receipts[0].score,7);checks++;
const machineOnly=await planAnswerCorrection(self.snapshot,{...self.request,patches:[{question_id:'mc-1',answer:'A'}]});
assert.deepEqual(machineOnly.plan.exam.questions.find(q=>q.id==='sa-1'),self.snapshot.exam.questions.find(q=>q.id==='sa-1'));
assert.equal(machineOnly.plan.work[0].receipts[0].officialScore,8.25);checks++;
assert.notEqual(machineOnly.plan_sha256,selfPlan.plan_sha256);checks++;
console.log(`${checks} ca sửa đáp án/chấm lại đạt (fixture, không kết nối kho).`);
