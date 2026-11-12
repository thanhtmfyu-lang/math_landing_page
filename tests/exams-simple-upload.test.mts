import assert from 'node:assert/strict';
import {defaultDueLocal,dueLocalToIso,uploadState,uploadTitle} from '../src/native/lesson-upload/simple-intake';
import {LessonSubmitError,pendingAfterFailure} from '../src/native/lesson-upload/submission-receipt';
import type {LessonSession,LessonUpload,UploadStep} from '../src/native/lesson-upload/model';

const session:LessonSession={class_id:'qa-class-a',class_name:'Lớp QA A',lesson_date:'2026-11-12',teacher_key:'qa-teacher',start_time:'17:00',end_time:'19:00'};
const originalTimezone=process.env.TZ;
try{
  // Device timezone must not move a Vietnam classroom's deadline.
  for(const timezone of ['UTC','America/Los_Angeles','Asia/Tokyo']){
    process.env.TZ=timezone;
    assert.equal(defaultDueLocal(session),'2026-11-19T16:30',timezone);
    assert.equal(dueLocalToIso('2026-11-19T16:30'),'2026-11-19T09:30:00.000Z',timezone);
  }
}finally{if(originalTimezone===undefined)delete process.env.TZ;else process.env.TZ=originalTimezone;}

assert.equal(defaultDueLocal({...session,start_time:'00:15'}),'2026-11-18T23:45','30 minutes before a midnight session crosses to the preceding date');
assert.equal(defaultDueLocal({...session,lesson_date:'2026-12-28',start_time:'07:30'}),'2027-01-04T07:00','week passes year boundary');
assert.equal(defaultDueLocal({...session,lesson_date:'2028-02-23',start_time:'17:00:00'}),'2028-03-01T16:30','leap-year week and SQL time with seconds');
assert.equal(defaultDueLocal({...session,lesson_date:'2027-02-23'}),'2027-03-02T16:30','non-leap-year week');
assert.equal(dueLocalToIso('2028-02-29T00:00'),'2028-02-28T17:00:00.000Z','valid leap day');
for(const invalid of ['2026-02-29','2026-02-31','2026-13-01','2026-00-01','not-a-date']){
  assert.equal(defaultDueLocal({...session,lesson_date:invalid}),'',`reject invalid source calendar ${invalid}`);
}
for(const invalid of ['24:00','25:30','17:60','7:00','17:00:60',''])assert.equal(defaultDueLocal({...session,start_time:invalid}),'',`reject invalid source time ${invalid}`);
for(const invalid of ['2026-02-29T17:00','2026-04-31T17:00','2026-11-19T24:00','2026-11-19T16:60','2026-11-19T16:30Z','2026-11-19T16:30:00','2026-11-19','']){
  assert.throws(()=>dueLocalToIso(invalid),Error,`reject invalid submitted deadline ${invalid}`);
}

assert.equal(uploadTitle('  Cực trị · bài 5  ',['unrelated.pdf'],session),'Cực trị · bài 5','explicit title wins');
assert.equal(uploadTitle('',['Phieu_07D.pdf','dap_an.pdf'],session),'Phieu 07D','first source name, no answer filename');
assert.equal(uploadTitle('',[],session),'BTVN Lớp QA A · 2026-11-12','no source filename needs a class/date title');
assert.equal(uploadTitle('a'.repeat(240),[],session).length,200,'server title bound');
assert.equal(uploadTitle('',['a'.repeat(230)+'.pdf'],session).length,200,'derived title bound');
assert.equal(uploadTitle('Cu\u031b\u0323c tri\u0323',[],session),'Cực trị','explicit title NFC normalization');
assert.equal(uploadTitle('',['Cu\u031b\u0323c_tri\u0323.pdf'],session),'Cực trị','derived title NFC normalization');
for(const generic of ['IMG_20261112_123456.jpg','scan_001.png','Screenshot (12).png','20261112_123456.pdf']){
  assert.equal(uploadTitle('',[generic],session),'BTVN Lớp QA A · 2026-11-12',`generic scan name ${generic} needs a useful title`);
}

const done:UploadStep[]=[1,2,3,4,5,6].map(step=>({step,status:'xong',detail:null}));
const upload:LessonUpload={id:'qa-upload',class_ids:[session.class_id],lesson_date:session.lesson_date,teacher_key:session.teacher_key,title:'Bài QA',task_scope:'Câu 5–15, bỏ câu 6',version:1,created_at:'2026-11-12T10:00:00Z',homework_uploaded:true,answer_uploaded:true,steps:done};
assert.equal(uploadState(upload).state,'complete','one complete paper is sufficient when no second paper was supplied');
assert.equal(uploadState({...upload,steps:done.slice(0,5)}).state,'processing','prepared assets are not a publish receipt');
assert.equal(uploadState({...upload,steps:[{step:1,status:'xong',detail:null}]}).state,'processing','received files are not publication');
assert.equal(uploadState({...upload,steps:[{step:1,status:'xong',detail:null}]}).label,'Đã nhận, chờ AI xử lý','queued upload is not an AI worker running');
assert.equal(uploadState({...upload,steps:[{step:1,status:'xong',detail:null},{step:2,status:'dang',detail:'Đang đọc đề.'}]}).label,'AI đang xử lý','worker start is explicit');
assert.equal(uploadState({...upload,homework2_uploaded:true}).state,'processing','second paper requires its own progress');
assert.equal(uploadState({...upload,homework2_uploaded:true,paper2_steps:done}).state,'complete','both papers complete');
assert.equal(uploadState({...upload,homework2_uploaded:false,paper2_steps:[{step:4,status:'loi',detail:'stale paper2'}]}).state,'complete','unused second-paper data does not block a one-paper assignment');
const mismatch=uploadState({...upload,steps:[...done,{step:4,status:'loi',detail:'Đáp án chưa khớp nguồn.'}]});
assert.equal(mismatch.state,'issue','errors take precedence over contradictory completed steps');
assert.equal(mismatch.detail,'Đáp án chưa khớp nguồn.');
const pendingReview=uploadState({...upload,steps:[...done.slice(0,3),{step:4,status:'canh_bao',detail:'Chờ kiểm chéo.'}]});
assert.equal(pendingReview.state,'issue','pending review must not count as independently checked');
assert.equal(pendingReview.detail,'Chờ kiểm chéo.');
const secondMismatch=uploadState({...upload,homework2_uploaded:true,paper2_steps:[{step:4,status:'loi',detail:'Sai đáp án Đề 2.'}]});
assert.equal(secondMismatch.state,'issue');
assert.equal(secondMismatch.detail,'Sai đáp án Đề 2.');

// A failed retry preflight does not resolve a commit whose first response was lost.
const captured={client_request_id:'11111111-1111-4111-8111-111111111111',homework_path:'qa-owner/frozen-batch/homework.pdf',answer_path:'qa-owner/frozen-batch/answer.pdf',task_scope:'Câu 5–15, bỏ câu 6',due_at_by_class:{'qa-class-a':'2026-11-19T09:30:00.000Z'}};
const frozenSnapshot=JSON.stringify(captured);
let pending:Record<string,unknown>|null=null;
pending=pendingAfterFailure(pending,captured,new LessonSubmitError('Response lost after create.','unknown'));
assert.strictEqual(pending,captured,'initial unknown retains the exact captured request');
pending=pendingAfterFailure(pending,captured,new Error('getUser retry preflight unavailable'));
assert.strictEqual(pending,captured,'a plain preflight failure must keep the unknown request locked');
assert.equal(JSON.stringify(pending),frozenSnapshot,'retry must not change idempotency key, source paths, scope or deadline');
const unrelatedPayload={...captured,client_request_id:'22222222-2222-4222-8222-222222222222'};
assert.strictEqual(pendingAfterFailure(pending,unrelatedPayload,new Error('still unavailable')),captured,'generic retry errors cannot replace the retained request');
pending=pendingAfterFailure(pending,captured,new LessonSubmitError('Definitively rejected by database.','rejected'));
assert.equal(pending,null,'known rejected request clears the lock so input may be corrected');
assert.equal(pendingAfterFailure(null,captured,new Error('first preflight failed')),null,'failure before any first RPC does not invent a pending key');
assert.equal(pendingAfterFailure(null,captured,new LessonSubmitError('known rejection','rejected')),null);
console.log('Simple upload: Vietnam deadlines; NFC/useful titles; one/two-paper completion and review gates; unknown → retry preflight failure → known rejection preserves request identity.');
