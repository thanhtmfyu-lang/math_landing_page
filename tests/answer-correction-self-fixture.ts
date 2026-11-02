import {pipelineFixture} from './btvn-pipeline-fixture';
import {createDraft,submitDraft} from '../src/native/exams/store';
import {resultFor} from '../src/native/exams/result';
import type {PracticeExam} from '../src/native/exams/data';
import type {CorrectionRequest} from '../server/btvn/answer-correction';

/** Synthetic machine + teacher work only; never loads production submissions. */
export function selfCorrectionFixture() {
  const base=pipelineFixture().exam;
  const exam:PracticeExam={...base,rubricVersion:'MTM-BTVN-10-v1',questionCount:4,
    sections:[...base.sections!,{label:'Tự luận giả',kind:'self',count:1}],
    questions:[...base.questions,{id:'self-1',kind:'self',sourceRef:'Câu giả 4',prompt:'Bài tự luận giả',solution:'Lời giải giả để kiểm hệ thống',maxMillipoints:0}]};
  const request:CorrectionRequest={action:'answer_correction_preview',lesson_key:'fixture-self',request_id:'fixture-self-correction',
    lenh_ref:'fixture-authority',approved_via:'fixture-user',patches:[{question_id:'sa-1',acceptedAnswers:['2/3'],mode:'rational'}]};
  function submitted(id:string,answer:string) {
    const start=createDraft(exam,id,1000);if(!start.ok)throw Error('fixture draft');
    const result=submitDraft(exam,{...start.value,answers:{'mc-1':'A','tf-1':[true,false,true,false],'sa-1':answer,'self-1':'Nét viết giả của bài tự luận'}},3000);
    if(!result.ok)throw Error('fixture submit');return result.value;
  }
  const drafts=[submitted('fixture-graded','2/3'),submitted('fixture-pending','4/6')];
  const receipts=drafts.map((d,i)=>{
    const result=resultFor(exam,d);if(!result?.score.ok)throw Error('fixture score');
    return {attemptId:d.attemptId,attemptNumber:i+1,submittedAt:3000,elapsedSeconds:2,
      score:result.score.earnedMillipoints/1000,late:false,timedOut:false,gradingPending:i===1,
      ...(i===0?{officialScore:8.25,teacherGrade:{'self-1':{score:1.25,comment:'Nhận xét giả của GV'}}}:{teacherComment:'Đang chờ GV chấm'})};
  });
  return {request,snapshot:{exam,work:[{student_id:'00000000-0000-4000-8000-000000000003',revision:7,drafts,receipts}]}};
}
