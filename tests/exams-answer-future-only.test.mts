import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {handleAnswerCorrection,planAnswerCorrection} from '../server/btvn/answer-correction';
import {createBtvnPublishHandler} from '../server/btvn/publish-handler';
import {selfCorrectionFixture} from './answer-correction-self-fixture';
import {createDraft} from '../src/native/exams/store';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
const {PGlite}=process.env.MTM_PGLITE_MODULE?await import(pathToFileURL(process.env.MTM_PGLITE_MODULE).href):await import('@electric-sql/pglite');
const db=new PGlite();let checks=0;
const owner='00000000-0000-4000-8000-000000000001',cid='00000000-0000-4000-8000-000000000002',sid='00000000-0000-4000-8000-000000000003';
await db.exec(`create role anon;create role authenticated;create role service_role;create role mtm_btvn_publisher;
 create schema mtm_hw_private;
 create table mtm_hw_private.btvn_lessons(code text primary key,owner_id uuid,class_ids uuid[],exam jsonb,material jsonb,active boolean,updated_at timestamptz,kind text);
 create table mtm_hw_private.btvn_publish_scope(singleton boolean primary key,owner_id uuid,class_ids uuid[]);
 create table mtm_hw_private.btvn_work(student_id uuid,lesson_code text,revision integer,drafts jsonb,receipts jsonb,primary key(student_id,lesson_code));
 create function mtm_hw_private.btvn_student(text) returns uuid language sql as $$select '${sid}'::uuid$$;
 create function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) returns jsonb language sql security definer as $$select '{"ok":true}'::jsonb$$;`);
for(const file of ['202611020001_btvn_answer_correction.sql','202611020002_btvn_answer_correction_self_short_mode.sql','202611020003_btvn_answer_future_only.sql'])await db.exec(readFileSync(process.env.MTM_ROOT+'/supabase/migrations-pending/'+file,'utf8'));
const f=selfCorrectionFixture(),req={...f.request,action:'answer_correction_future_only_preview' as const};
await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,$2)',[owner,[cid]]);
await db.query("insert into mtm_hw_private.btvn_lessons values($1,$2,$3,$4,'{}',true,clock_timestamp(),'btvn')",[req.lesson_key,owner,[cid],JSON.stringify(f.snapshot.exam)]);
// Load the actual read-only captured commit chain and receipt trigger, rather than an always-ok commit.
await db.exec(`alter table mtm_hw_private.btvn_lessons add column opens_at timestamptz,add column closes_at timestamptz;
 alter table mtm_hw_private.btvn_work add column next_actual_class_at timestamptz;
 create table mtm_hw_private.students(id uuid primary key,class_id uuid);
 insert into mtm_hw_private.students values('${sid}','${cid}');
 create function mtm_hw_private.btvn_access_class(uuid,text) returns text language sql as $$select 'fixture class'::text$$;
 create function mtm_hw_private.btvn_opens_at(jsonb,text) returns timestamptz language sql as $$select '2026-10-01'::timestamptz$$;
 create function mtm_hw_private.btvn_override_due_before_schedule066(uuid,text) returns timestamptz language sql as $$select null::timestamptz$$;`);
await db.exec(readFileSync(process.env.MTM_ROOT+'/tests/fixtures/btvn-commit-chain-20261102.sql','utf8'));
await db.exec('create trigger receipt_history before insert or update on mtm_hw_private.btvn_work for each row execute function mtm_hw_private.btvn_override_receipts();');
await db.query('insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,drafts,receipts) values($1,$2,7,$3,$4)',[sid,req.lesson_key,JSON.stringify(f.snapshot.work[0].drafts),JSON.stringify(f.snapshot.work[0].receipts)]);
async function rpc(action:string,p:any,role='service_role'){return db.transaction(async(tx:any)=>{await tx.exec('set local role '+role);return (await tx.query('select public.mtm_btvn_answer_correction_future_only($1,$2) result',[action,JSON.stringify(p)])).rows[0].result;});}
const port={rpc:(action:string,p:any)=>rpc(action,p),upload:async()=>{throw Error('NO_UPLOAD');}};
const original=(await db.query('select * from mtm_hw_private.btvn_work')).rows;
const snap=await rpc('answer_correction_future_snapshot',req),plan=await planAnswerCorrection(snap,req);
const active=structuredClone(snap);active.work[0].drafts[0].submittedAt=null;
await assert.rejects(()=>planAnswerCorrection(active,req),/CORRECTION_ACTIVE_ATTEMPT_HOLD/);checks++;
assert.deepEqual(plan.plan.work,snap.work);assert.equal(plan.changed,0);assert.equal(plan.attempts,0);checks++;
const preview=await handleAnswerCorrection(port,req);assert.equal(preview.changed,0);checks++;
assert.deepEqual((await db.query('select * from mtm_hw_private.btvn_work')).rows,original);checks++;
for(const role of ['anon','authenticated','mtm_btvn_publisher']){await assert.rejects(()=>rpc('answer_correction_future_snapshot',req,role));checks++;}
await assert.rejects(()=>handleAnswerCorrection(port,{...req,action:'answer_correction_future_only_apply',expected_plan_sha256:'0'.repeat(64)}),/CORRECTION_STALE_PREVIEW/);checks++;
const p={...req,expected_snapshot:snap,new_exam:plan.plan.exam,updated_work:plan.plan.work,plan_sha256:plan.plan_sha256};
await db.query("insert into mtm_hw_private.btvn_lessons select 'fixture-active',owner_id,class_ids,exam,material,active,updated_at,kind from mtm_hw_private.btvn_lessons where code=$1",[req.lesson_key]);
await db.query("insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,drafts,receipts) values($1,'fixture-active',7,$2,$3)",[sid,JSON.stringify(active.work[0].drafts),JSON.stringify(active.work[0].receipts)]);
const activeReq={...req,lesson_key:'fixture-active',request_id:'fixture-active-future-only'};
const activeSnap=await rpc('answer_correction_future_snapshot',activeReq);
await assert.rejects(()=>rpc('answer_correction_future_commit',{...p,...activeReq,expected_snapshot:activeSnap,updated_work:activeSnap.work}),/CORRECTION_ACTIVE_ATTEMPT_HOLD/);checks++;
await db.query("delete from mtm_hw_private.btvn_work where lesson_code='fixture-active'");
await db.query("delete from mtm_hw_private.btvn_lessons where code='fixture-active'");
for(const mutate of [(x:any)=>x.updated_work[0].receipts[0].score=10,(x:any)=>x.updated_work[0].drafts[0].answerKeyVersion='changed',(x:any)=>x.expected_snapshot.work=[]]){
 const bad=structuredClone(p);mutate(bad);await assert.rejects(()=>rpc('answer_correction_future_commit',bad));checks++;
}
const mismatch=structuredClone(p);mismatch.new_exam.questions[2].acceptedAnswers=['3/4'];await assert.rejects(()=>rpc('answer_correction_future_commit',mismatch),/CORRECTION_SHORT_MODE|CORRECTION_PATCH_MISMATCH/);checks++;
const mcMismatch=structuredClone(p);mcMismatch.new_exam.questions[0].answer='D';mcMismatch.patches.push({question_id:'mc-1',answer:'A'});await assert.rejects(()=>rpc('answer_correction_future_commit',mcMismatch),/CORRECTION_PATCH_MISMATCH/);checks++;
const mtmExam={...f.snapshot.exam,rubricVersion:'MTM-EQUAL-QUESTION-10-20261016-v1',answerKeyVersion:'old-key'};
await db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,exam,material,active,updated_at,kind) values('fixture-mtm-version',$1,$2,$3,'{}',true,clock_timestamp(),'btvn')",[owner,[cid],JSON.stringify(mtmExam)]);
const mtmReq={...req,lesson_key:'fixture-mtm-version',request_id:'fixture-mtm-version-future'},mtmSnap=await rpc('answer_correction_future_snapshot',mtmReq);
const mtmPayload={...p,...mtmReq,expected_snapshot:mtmSnap,updated_work:[],new_exam:{...p.new_exam,rubricVersion:mtmExam.rubricVersion,answerKeyVersion:'old-key',versionHash:mtmExam.versionHash}};
await assert.rejects(()=>rpc('answer_correction_future_commit',mtmPayload),/CORRECTION_VERSION_REQUIRED/);checks++;
await db.query("delete from mtm_hw_private.btvn_lessons where code='fixture-mtm-version'");
const apply={...req,action:'answer_correction_future_only_apply',expected_plan_sha256:preview.plan_sha256};
const result=await handleAnswerCorrection(port,apply);assert.equal(result.status,'corrected_future_only');assert.equal(result.changed,0);checks++;
assert.deepEqual((await db.query('select * from mtm_hw_private.btvn_work')).rows,original);checks++;
const nextExam=(await db.query('select exam from mtm_hw_private.btvn_lessons')).rows[0].exam;
assert.equal(nextExam.questions[2].mode,'rational');assert.deepEqual(nextExam.questions[2].acceptedAnswers,['2/3']);checks++;
assert.deepEqual(await handleAnswerCorrection(port,apply),result);checks++;
await assert.rejects(()=>rpc('answer_correction_future_snapshot',{...req,patches:[]}),/CORRECTION_REQUEST_CONFLICT/);checks++;
const backup=(await db.query('select original_snapshot,binding from mtm_hw_private.btvn_answer_corrections')).rows[0];assert.deepEqual(backup.original_snapshot,snap);assert.equal(backup.binding.mode,'future_only');checks++;
const now=Date.parse('2026-11-02T23:00:00+07:00');
const started=createDraft(nextExam,'new-after-future-key',now);assert.equal(started.ok,true);if(!started.ok)throw Error('fixture');
const oldDrafts=original[0].drafts,oldReceipts=original[0].receipts;
async function commit(drafts:any,receipts:any){return db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');return (await tx.query('select public.mtm_btvn_commit($1,$2,7,$3,$4) result',['fixture',req.lesson_key,JSON.stringify(drafts),JSON.stringify(receipts)])).rows[0].result;});}
await assert.rejects(()=>commit([...oldDrafts,{...started.value,examVersionHash:f.snapshot.exam.versionHash}],oldReceipts),/CORRECTION_RELOAD_REQUIRED/);checks++;
await assert.rejects(()=>commit([started.value],oldReceipts),/CORRECTION_HISTORY_CHANGED/);checks++;
await assert.rejects(()=>commit([...oldDrafts,started.value],[{...oldReceipts[0],score:10},oldReceipts[1]]),/CORRECTION_HISTORY_CHANGED/);checks++;
assert.equal((await commit([...oldDrafts,started.value],oldReceipts)).ok,true);checks++;
const afterStart=(await db.query('select * from mtm_hw_private.btvn_work')).rows[0];
assert.deepEqual(afterStart.drafts.slice(0,oldDrafts.length),oldDrafts);assert.deepEqual(afterStart.receipts,oldReceipts);assert.equal(afterStart.revision,8);checks++;
// Exercise the actual server adapter hydrate -> service -> SQL commit path. Browser sends answers only.
function makeAdapter(lessonKey:string,currentExam:any){
const material={lessonCode:lessonKey,classNames:['fixture class'],date:'2026-11-02',title:'Synthetic only',videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null,classOpensAt:{'fixture class':'2026-11-02T00:00:00+07:00'}};
return new SupabaseHomeworkRepository({rpc:async(name,args)=>{
 if(name==='mtm_btvn_read'){
  const row=(await db.query('select * from mtm_hw_private.btvn_work where lesson_code=$1',[lessonKey])).rows[0];
  return {data:{revision:row.revision,work:{student:{studentCode:'SYNTHETIC',fullName:'Synthetic only',phone:'',className:'fixture class'},drafts:row.drafts,receipts:row.receipts},exam:currentExam,material,lessons:[material]},error:null};
 }
 if(name==='mtm_btvn_commit')return {data:await db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');return (await tx.query('select public.mtm_btvn_commit($1,$2,$3,$4,$5) result',[args.p_session,args.p_lesson,args.p_revision,JSON.stringify(args.p_drafts),JSON.stringify(args.p_receipts)])).rows[0].result;}),error:null};
 throw Error('Unexpected fixture RPC '+name);
}},async()=>({}),()=>now+1000);}
const adapter=makeAdapter(req.lesson_key,nextExam);
await adapter.call('fixture','submit',req.lesson_key,started.value.attemptId,{'sa-1':'2/3'});
const afterAdapter=(await db.query('select * from mtm_hw_private.btvn_work')).rows[0];
assert.deepEqual(afterAdapter.drafts.slice(0,oldDrafts.length),oldDrafts);assert.deepEqual(afterAdapter.receipts.slice(0,oldReceipts.length),oldReceipts);assert.equal(afterAdapter.receipts.length,3);checks++;
await adapter.call('fixture','start',req.lesson_key);
assert.deepEqual((await db.query('select receipts from mtm_hw_private.btvn_work')).rows[0].receipts.slice(0,oldReceipts.length),oldReceipts);checks++;
const currentRow=(await db.query('select * from mtm_hw_private.btvn_work where lesson_code=$1',[req.lesson_key])).rows[0];
const noLate=currentRow.receipts.map((r:any)=>{const {late,...rest}=r;return rest;});
await db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');const committed=(await tx.query('select public.mtm_btvn_commit($1,$2,$3,$4,$5) result',['fixture',req.lesson_key,currentRow.revision,JSON.stringify(currentRow.drafts),JSON.stringify(noLate)])).rows[0].result;assert.equal(committed.ok,true);});
assert.deepEqual((await db.query('select receipts from mtm_hw_private.btvn_work where lesson_code=$1',[req.lesson_key])).rows[0].receipts,currentRow.receipts);checks++;
await db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,exam,material,active,updated_at,kind) values('fixture-normal',$1,$2,$3,'{}',true,clock_timestamp(),'btvn')",[owner,[cid],JSON.stringify(f.snapshot.exam)]);
await db.query("insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,drafts,receipts) values($1,'fixture-normal',7,$2,$3)",[sid,JSON.stringify(f.snapshot.work[0].drafts),JSON.stringify(f.snapshot.work[0].receipts)]);
const normalBefore=(await db.query("select * from mtm_hw_private.btvn_work where lesson_code='fixture-normal'")).rows[0];
await makeAdapter('fixture-normal',f.snapshot.exam).call('fixture','start','fixture-normal');
const normalAfter=(await db.query("select * from mtm_hw_private.btvn_work where lesson_code='fixture-normal'")).rows[0];
assert.deepEqual(normalAfter.receipts,normalBefore.receipts);assert.deepEqual(normalAfter.drafts.slice(0,2),normalBefore.drafts);checks++;
await db.query("delete from mtm_hw_private.btvn_work where lesson_code='fixture-normal'");await db.query("delete from mtm_hw_private.btvn_lessons where code='fixture-normal'");
for(const role of ['anon','authenticated','mtm_btvn_publisher']){await assert.rejects(()=>db.transaction(async(tx:any)=>{await tx.exec('set local role '+role);return tx.exec("select public.mtm_btvn_commit('fixture','fixture-self',8,'[]','[]')");}));checks++;}
await assert.rejects(()=>db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');return tx.exec("select public.mtm_btvn_commit_before_answer_correction('fixture','fixture-self',8,'[]','[]')");}));checks++;
const handler=createBtvnPublishHandler(port,'x'.repeat(40));
const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':'x'.repeat(40)},body:JSON.stringify(req)}));assert.equal(response.status,200);assert.ok(!(await response.text()).includes('student_id'));checks++;
await db.query("update mtm_hw_private.btvn_lessons set kind='kiem-tra-thang'");await assert.rejects(()=>rpc('answer_correction_future_snapshot',{...req,request_id:'fixture-monthly-future-hold'}),/CORRECTION_MONTHLY_HOLD/);checks++;
await db.close();console.log(checks+' future-only logic/SQL/route checks passed; no live data.');
