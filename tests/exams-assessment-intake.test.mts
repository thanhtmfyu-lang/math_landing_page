import assert from 'node:assert/strict';
import {ASSESSMENT_FULL_SCOPE,assessmentPublishKind,defaultExamConfig,normalizeAssessmentIntake,normalizeExamConfig,normalizeExamType,normalizeWorkKind,sanitizeAssessmentTitle,type AssessmentIntakeInput} from '../src/native/lesson-upload/assessment-intake';

let checks=0;
function check(name:string,fn:()=>void){try{fn();checks++;}catch(error){throw Error(name,{cause:error});}}
const classId='22222222-2222-4222-8222-222222222222',assessmentId='55555555-5555-4555-8555-555555555555';
const config={opens_at:'2026-11-30T17:00:00+07:00',closes_at:'2026-11-30T19:00:00+07:00',duration_minutes:120};
const exam:AssessmentIntakeInput={work_kind:'exam',title:'Kiểm tra kết thúc tháng 11',class_ids:[classId],assessment_id:assessmentId,has_answer:true,exam_config:config};

check('missing business kind remains legacy homework',()=>{
  assert.equal(normalizeWorkKind(undefined),'homework');assert.equal(assessmentPublishKind(undefined),'btvn');
  assert.deepEqual(normalizeAssessmentIntake({title:'BTVN cũ',class_ids:['legacy-class'],has_answer:false,task_scope:'Câu 5–15, bỏ câu 6'}),{work_kind:'homework',title:'BTVN cũ',task_scope:'Câu 5–15, bỏ câu 6'});
});
for(const bad of [null,'','btvn','kiem-tra','monthly',true,1,{}])check(`reject unknown work kind ${JSON.stringify(bad)}`,()=>assert.throws(()=>normalizeWorkKind(bad)));
check('monthly preset is separate from publication routing and QA',()=>{
  const result=normalizeAssessmentIntake(exam);assert.equal(result.work_kind,'exam');
  assert.equal(result.work_kind==='exam'&&result.exam_type,'monthly');assert.equal(assessmentPublishKind('exam'),'kiem-tra');
  assert.equal('is_test' in result,false);assert.equal('class_ids' in result,false);
});
check('custom title and teacher scope survive normalized request',()=>{
  const result=normalizeAssessmentIntake({...exam,exam_type:'custom',title:'  Kiểm tra 45 phút · Vectơ & tọa độ  ',task_scope:' Câu 1–8, bỏ câu 4 '});
  assert.equal(result.title,'Kiểm tra 45 phút · Vectơ & tọa độ');assert.equal(result.task_scope,'Câu 1–8, bỏ câu 4');
  assert.equal(result.work_kind==='exam'&&result.exam_type,'custom');assert.equal(result.work_kind==='exam'&&result.assessment_id,assessmentId);
});
check('empty exam scope means whole uploaded paper',()=>assert.equal(normalizeAssessmentIntake({...exam,task_scope:'  '}).task_scope,ASSESSMENT_FULL_SCOPE));
check('new helper does not invent scope for legacy homework',()=>assert.equal(normalizeAssessmentIntake({title:'Tài liệu cũ',class_ids:['legacy'],has_answer:false}).task_scope,''));
check('NFC title keeps all 200 characters without truncation',()=>{
  assert.equal(sanitizeAssessmentTitle('Cu\u031b\u0323c tri\u0323'),'Cực trị');assert.equal(sanitizeAssessmentTitle('a'.repeat(200)),'a'.repeat(200));
  assert.throws(()=>sanitizeAssessmentTitle('a'.repeat(201)));assert.equal(sanitizeAssessmentTitle('A\nB\u0000C'),'A B C');
});
for(const title of ['', '   ', null, 45, {}])check('invalid title '+JSON.stringify(title),()=>assert.throws(()=>sanitizeAssessmentTitle(title)));
for(const exam_type of ['',null,'kiem-tra-thang','exam',false])check('invalid exam preset '+JSON.stringify(exam_type),()=>assert.throws(()=>normalizeExamType(exam_type)));
for(const class_ids of [[],[classId,classId],[classId,'33333333-3333-4333-8333-333333333333'],['not-a-uuid'],classId])check('exam exactly one UUID class '+JSON.stringify(class_ids),()=>assert.throws(()=>normalizeAssessmentIntake({...exam,class_ids})));
for(const assessment_id of [undefined,null,'','new-id',3])check('exam requires stable assessment UUID '+String(assessment_id),()=>assert.throws(()=>normalizeAssessmentIntake({...exam,assessment_id})));
check('exam teacher answer required; second paper refused',()=>{
  assert.throws(()=>normalizeAssessmentIntake({...exam,has_answer:false}));assert.throws(()=>normalizeAssessmentIntake({...exam,has_second_paper:true}));
});
check('flag types cannot bypass answer/second paper guards',()=>{
  assert.throws(()=>normalizeAssessmentIntake({...exam,has_answer:'true'} as any));assert.throws(()=>normalizeAssessmentIntake({...exam,has_second_paper:'false'} as any));
});
check('homework rejects stale hidden exam configuration',()=>{
  for(const extra of [{assessment_id:assessmentId},{exam_type:'monthly'},{exam_config:config}])assert.throws(()=>normalizeAssessmentIntake({title:'BTVN',class_ids:[classId],has_answer:true,...extra}));
});
check('request preparation never changes caller payload or generates an ID',()=>{
  const snapshot=JSON.stringify(exam),a=normalizeAssessmentIntake(exam),b=normalizeAssessmentIntake(exam);
  assert.equal(JSON.stringify(exam),snapshot);assert.deepEqual(a,b);assert.equal(a.work_kind==='exam'&&a.assessment_id,assessmentId);
});
check('timestamps normalize across zones without moving actual time',()=>assert.deepEqual(normalizeExamConfig(config),{opens_at:'2026-11-30T10:00:00.000Z',closes_at:'2026-11-30T12:00:00.000Z',duration_minutes:120}));
check('duration exact window and 240-minute boundary accepted',()=>{
  assert.equal(normalizeExamConfig({...config,duration_minutes:1}).duration_minutes,1);
  assert.equal(normalizeExamConfig({...config,closes_at:'2026-11-30T21:00:00+07:00',duration_minutes:240}).duration_minutes,240);
});
for(const duration_minutes of [0,-1,1.5,121,241,Infinity,'120',null])check('invalid duration '+String(duration_minutes),()=>assert.throws(()=>normalizeExamConfig({...config,duration_minutes})));
for(const extra of [{closes_at:config.opens_at},{closes_at:'2026-11-30T16:59:00+07:00'},{opens_at:'2026-02-29T17:00:00+07:00'},{opens_at:'2026-11-30T24:00:00+07:00'},{opens_at:'2026-11-30T17:00:00'},{opens_at:'2026-11-30T17:00:00+14:30'},{random:'value'}])check('strict calendar/window/config '+JSON.stringify(extra),()=>assert.throws(()=>normalizeExamConfig({...config,...extra})));
check('real leap day and date/year boundary accepted',()=>assert.equal(normalizeExamConfig({opens_at:'2028-02-29T23:30:00+07:00',closes_at:'2028-03-01T00:30:00+07:00',duration_minutes:60}).closes_at,'2028-02-29T17:30:00.000Z'));
check('defaults use selected class slot; never last calendar day',()=>{
  const result=defaultExamConfig({lesson_date:'2026-11-13',start_time:'17:00',end_time:'19:00'});assert.equal(result.opens_at,'2026-11-13T10:00:00.000Z');assert.equal(result.duration_minutes,120);
  assert.equal(defaultExamConfig({lesson_date:'2026-11-13',start_time:'17:00',end_time:'17:45'}).duration_minutes,45);
});
check('overnight class dates are not reversed',()=>assert.deepEqual(defaultExamConfig({lesson_date:'2026-12-31',start_time:'23:30',end_time:'01:00'}),{opens_at:'2026-12-31T16:30:00.000Z',closes_at:'2026-12-31T18:00:00.000Z',duration_minutes:90}));
check('authenticated server exam defaults take precedence over device/slot inference',()=>assert.deepEqual(defaultExamConfig({lesson_date:'2026-11-13',start_time:'17:00',end_time:'19:00',exam_defaults:{...config,duration_minutes:45}}),normalizeExamConfig({...config,duration_minutes:45})));
check('invalid authoritative default cannot silently fall back',()=>assert.throws(()=>defaultExamConfig({lesson_date:'2026-11-13',start_time:'17:00',end_time:'19:00',exam_defaults:null})));
check('invalid and zero-length class slots are refused',()=>{
  for(const patch of [{lesson_date:'2026-02-30'},{start_time:'24:00'},{end_time:'17:00'}])assert.throws(()=>defaultExamConfig({lesson_date:'2026-11-13',start_time:'17:00',end_time:'19:00',...patch}));
});
console.log(`${checks} assessment-intake checks: strict kind/config, legacy default, stable UUID/title/scope, one-class/answer guards, calendar/window/duration and authoritative defaults passed; no cloud/AI.`);
