import assert from 'node:assert/strict';
import type {LessonUpload, RetryState, UploadDashboard} from '../src/native/lesson-upload/model';
import {emptyOutcomeLedger, observeUploadOutcomes, readOutcomeLedger, trackAcceptedUpload} from '../src/native/lesson-upload/upload-outcomes';

const base = Date.parse('2026-11-23T09:00:00Z');
const jobId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const retry = (status:string, can_retry=false):RetryState => ({status, can_retry, retry_count:0, attempt_count:0});
const upload = (fields:Partial<LessonUpload>={}):LessonUpload => ({
  id:jobId, version:1, is_current:true, created_at:new Date(base-60000).toISOString(),
  work_kind:'homework', class_ids:['qa-fixture'], lesson_date:'2026-11-23', teacher_key:'qa-fixture',
  title:'Phiếu thử', task_scope:'Câu 1', steps:[{step:1,status:'xong',detail:null}], retry:retry('queued'), ...fields,
});
const dashboard = (offset:number, uploads:LessonUpload[]):UploadDashboard => ({
  staff:{user_id:'fixture-staff',short_name:'qa',display_name:'QA',role:'gv',teacher_key:'qa-fixture'},
  teachers:[], sessions:[], uploads, week_start:'2026-11-23', week_end:'2026-11-29', server_now:new Date(base+offset).toISOString(),
});
const published = (fields:Partial<LessonUpload>={}) => upload({
  retry:retry('published'), steps:[{step:6,status:'xong',detail:null}], ...fields,
});

const historical = observeUploadOutcomes(emptyOutcomeLedger, dashboard(0,[published()]));
assert.deepEqual(historical.notices, [], 'initial historical publications are quiet');
assert.deepEqual(observeUploadOutcomes(historical.ledger,dashboard(1000,[published()])).notices, []);

const started = observeUploadOutcomes(emptyOutcomeLedger,dashboard(0,[upload()])).ledger;
const processing = observeUploadOutcomes(started,dashboard(1000,[upload({retry:retry('retry_wait',true)})]));
assert.deepEqual(processing.notices, [], 'automatic server backoff is quiet');
const noReceipt = observeUploadOutcomes(processing.ledger,dashboard(2000,[upload({retry:retry('published')})]));
assert.deepEqual(noReceipt.notices, [], 'published metadata needs the server completion step');
const waitingSecond = observeUploadOutcomes(noReceipt.ledger,dashboard(3000,[published({homework2_uploaded:true,paper2_steps:[]})]));
assert.deepEqual(waitingSecond.notices, [], 'both papers must finish before announcing a paired upload');
const success = observeUploadOutcomes(waitingSecond.ledger,dashboard(4000,[published({homework2_uploaded:true,paper2_steps:[{step:6,status:'xong',detail:null}]})]));
assert.deepEqual(success.notices,[{key:`${jobId}|1`,status:'published',title:'Đã giao BTVN · Phiếu thử',detail:''}]);
const restored = readOutcomeLedger(JSON.stringify(success.ledger));
assert.deepEqual(observeUploadOutcomes(restored,dashboard(5000,[published()])).notices, [], 'persisted terminal outcome is deduplicated');
assert.equal(observeUploadOutcomes(restored,dashboard(2000,[upload()])).ledger,restored,'stale responses preserve the current ledger');

const tracked = trackAcceptedUpload(historical.ledger, secondId, 2);
const held = observeUploadOutcomes(tracked,dashboard(5000,[upload({id:secondId,version:2,retry:{...retry('needs_input'),reason:'Số câu chưa khớp.'}})]));
assert.deepEqual(held.notices,[{key:`${secondId}|2`,status:'held',title:'AI đã dừng xử lý · Phiếu thử',detail:'Số câu chưa khớp.'}]);
assert.deepEqual(observeUploadOutcomes(tracked,dashboard(5000,[upload({id:secondId,version:2,retry:retry('needs_input',true)})])).notices, [],'a recoverable input state is quiet');
assert.deepEqual(observeUploadOutcomes(tracked,dashboard(5000,[published({id:secondId,version:2,is_current:false})])).notices, [],'superseded jobs cannot announce outcomes');

const submittedThenFinished = observeUploadOutcomes(historical.ledger,dashboard(5000,[published({id:secondId,work_kind:'exam',created_at:new Date(base+1000).toISOString()})]));
assert.equal(submittedThenFinished.notices[0]?.title,'Đề kiểm tra đã sẵn sàng · Phiếu thử');
assert.deepEqual(readOutcomeLedger('{"observedAt":0,"jobs":{"invalid|1":"pending"}}'),emptyOutcomeLedger);

console.log('Staff terminal outcome notifications verified for publish, holds, retry and persisted deduplication.');
