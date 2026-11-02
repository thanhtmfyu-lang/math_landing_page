import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=process.env.MTM_PGLITE_MODULE?await import(pathToFileURL(process.env.MTM_PGLITE_MODULE).href):await import('@electric-sql/pglite');
const db=new PGlite();let checks=0;
await db.exec(`create role anon;create role authenticated;create role service_role;create role mtm_btvn_publisher;
 create schema mtm_hw_private;
 create table mtm_hw_private.btvn_lessons(code text primary key,owner_id uuid,class_ids uuid[],exam jsonb,material jsonb,active boolean,updated_at timestamptz,kind text);
 create table mtm_hw_private.btvn_publish_scope(singleton boolean primary key,owner_id uuid,class_ids uuid[]);
 create table mtm_hw_private.btvn_work(student_id uuid,lesson_code text,revision integer,drafts jsonb,receipts jsonb,primary key(student_id,lesson_code));
 create function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) returns jsonb language sql security definer as $$select '{"ok":true}'::jsonb$$;
 grant execute on function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) to service_role;`);
const root=process.env.MTM_ROOT!;
await db.exec(readFileSync(root+'/supabase/migrations-pending/202611020001_btvn_answer_correction.sql','utf8'));checks++;
const owner='00000000-0000-4000-8000-000000000001',cid='00000000-0000-4000-8000-000000000002',sid='00000000-0000-4000-8000-000000000003';
const exam={id:'fixture',rubricVersion:'MTM-EQUAL-QUESTION-10-20261016-v1',answerKeyVersion:'old',questions:[{id:'q1',kind:'mc',answer:'A',prompt:'fixture only'}]};
await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,$2)',[owner,[cid]]);
await db.query("insert into mtm_hw_private.btvn_lessons values('fixture-only',$1,$2,$3,'{}',true,clock_timestamp(),'btvn')",[owner,[cid],JSON.stringify(exam)]);
await db.query("insert into mtm_hw_private.btvn_work values($1,'fixture-only',7,$2,$3)",[sid,JSON.stringify([{attemptId:'fixture',answers:{q1:'D'},answerKeyVersion:'old'}]),JSON.stringify([{attemptId:'fixture',score:0,submittedAt:1000,late:false}])]);
const binding={lesson_key:'fixture-only',request_id:'fixture-correction-20261102',lenh_ref:'fixture-authority',approved_via:'fixture-user',patches:[{question_id:'q1',answer:'D'}]};
async function rpc(action:string,p:any,role='service_role') {return db.transaction(async(tx:any)=>{await tx.exec('set local role '+role);return (await tx.query('select public.mtm_btvn_answer_correction($1,$2) result',[action,JSON.stringify(p)])).rows[0].result;});}
for(const role of ['anon','authenticated','mtm_btvn_publisher']){await assert.rejects(()=>rpc('answer_correction_snapshot',binding,role));checks++;}
const snapshot=await rpc('answer_correction_snapshot',binding);assert.equal(snapshot.work[0].revision,7);checks++;
const newexam={...exam,answerKeyVersion:'new',questions:[{...exam.questions[0],answer:'D'}]};
const newwork=structuredClone(snapshot.work);newwork[0].drafts[0].answerKeyVersion='new';newwork[0].receipts[0].score=10;
const payload={...binding,expected_snapshot:snapshot,new_exam:newexam,updated_work:newwork,plan_sha256:'a'.repeat(64)};
for(const bad of [
 {...payload,expected_snapshot:{...snapshot,work:[]}},
 {...payload,new_exam:{...newexam,questions:[{...newexam.questions[0],prompt:'changed source'}]}},
 {...payload,updated_work:[{...newwork[0],drafts:[{...newwork[0].drafts[0],answers:{q1:'A'}}]}]},
 {...payload,updated_work:[{...newwork[0],receipts:[{...newwork[0].receipts[0],submittedAt:2000}]}]},
 {...payload,patches:[{question_id:'unrequested',answer:'D'}]},
]) {await assert.rejects(()=>rpc('answer_correction_commit',bad));checks++;}
assert.equal((await rpc('answer_correction_snapshot',binding)).work[0].revision,7);checks++;
const result=await rpc('answer_correction_commit',payload);assert.equal(result.status,'corrected_and_regraded');assert.equal(result.changed,1);checks++;
const rows=(await db.query("select revision,drafts,receipts from mtm_hw_private.btvn_work")).rows[0];assert.equal(rows.revision,8);assert.equal(rows.receipts[0].score,10);assert.equal(rows.drafts[0].answers.q1,'D');checks++;
const backup=(await db.query('select original_snapshot from mtm_hw_private.btvn_answer_corrections')).rows[0].original_snapshot;assert.deepEqual(backup,snapshot);checks++;
const replay=await rpc('answer_correction_commit',payload);assert.equal(replay.already_applied,true);assert.deepEqual(replay.result,result);assert.equal((await db.query('select revision from mtm_hw_private.btvn_work')).rows[0].revision,8);checks++;
await assert.rejects(()=>rpc('answer_correction_snapshot',{...binding,patches:[{question_id:'q1',answer:'B'}]}));checks++;
await assert.rejects(()=>db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');return tx.query("select public.mtm_btvn_commit('fixture','fixture-only',8,$1,'[]')",[JSON.stringify([{answerKeyVersion:'old'}])]);}),/CORRECTION_RELOAD_REQUIRED/);checks++;
await assert.rejects(()=>db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');return tx.exec("select public.mtm_btvn_commit_before_answer_correction('fixture','fixture-only',8,'[]','[]')");}));checks++;
const legacy={...exam,rubricVersion:'MTM-FLEX-10-v1',versionHash:'a'.repeat(64)};delete (legacy as any).answerKeyVersion;
await db.query("insert into mtm_hw_private.btvn_lessons values('fixture-legacy',$1,$2,$3,'{}',true,clock_timestamp(),'btvn')",[owner,[cid],JSON.stringify(legacy)]);
await db.query("insert into mtm_hw_private.btvn_work values($1,'fixture-legacy',0,$2,$3)",[sid,JSON.stringify([{attemptId:'legacy',answers:{q1:'D'},examVersionHash:'a'.repeat(64)}]),JSON.stringify([{attemptId:'legacy',score:0,submittedAt:1000,late:false}])]);
const legacyBinding={...binding,lesson_key:'fixture-legacy',request_id:'fixture-legacy-correction'};
const legacySnapshot=await rpc('answer_correction_snapshot',legacyBinding),legacyWork=structuredClone(legacySnapshot.work);
legacyWork[0].drafts[0].examVersionHash='b'.repeat(64);legacyWork[0].receipts[0].score=10;
const legacyPayload={...legacyBinding,expected_snapshot:legacySnapshot,new_exam:{...legacy,versionHash:'b'.repeat(64),questions:[{...legacy.questions[0],answer:'D'}]},updated_work:legacyWork,plan_sha256:'b'.repeat(64)};
await assert.rejects(()=>rpc('answer_correction_commit',{...legacyPayload,new_exam:{...legacyPayload.new_exam,versionHash:'a'.repeat(64)}}),/CORRECTION_VERSION_REQUIRED/);checks++;
assert.equal((await rpc('answer_correction_commit',legacyPayload)).ok,true);checks++;
await assert.rejects(()=>db.transaction(async(tx:any)=>{await tx.exec('set local role service_role');return tx.query("select public.mtm_btvn_commit('fixture','fixture-legacy',1,$1,'[]')",[JSON.stringify([{examVersionHash:'a'.repeat(64)}])]);}),/CORRECTION_RELOAD_REQUIRED/);checks++;
await db.close();console.log(`${checks} ca SQL giao dịch/backup/quyền/chống phát lại đạt trong PGlite; 0 dữ liệu thật.`);
