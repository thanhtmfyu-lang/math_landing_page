/** Source-only production snapshot; all rows and calls below are local synthetic PGlite. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const fixture=JSON.parse(readFileSync('tests/fixtures/assessment110-due-live-20261113.json','utf8'));
const sql=readFileSync('supabase/migrations-pending/202611130110_lesson_assessment.sql','utf8');
const dueGuard=sql.match(/do \$assessment_due110\$[\s\S]*?end\$assessment_due110\$;/)![0];
const injected=" and l.kind<>'kiem-tra' /*assessment110-no-homework-due*/";
const original=fixture.functions.find((f:any)=>f.signature==='mtm_btvn_sync_due(jsonb,boolean)').definition;
const sourceHash=(s:string)=>createHash('sha256').update(s).digest('hex');
const {db}=await baselineDatabase();let checks=0;
const definition=async()=>(await db.query("select pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure) src")).rows[0].src;
const sourceMeta=async()=>(await db.query("select proowner,proacl::text acl,proconfig from pg_proc where oid='public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure")).rows[0];
const works=async()=>(await db.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w order by student_id,lesson_code')).rows.map((r:any)=>r.value);
try{
 assert.equal(fixture.contains_student_rows,false);
 for(const fn of fixture.functions)assert.equal(sourceHash(fn.definition),fn.definition_sha256);checks++;
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 for(const file of ['202611080106_btvn_han_tu_ghi.sql','202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+file,'utf8'));
 for(const fn of fixture.functions)await db.exec(fn.definition);
 assert.equal(sourceHash(await definition()),'5f15c464edf922b36ce2b7bfde1cf021a2906244fa06ba209ae94db6928ae789');checks++;
 const meta=await sourceMeta();await db.exec(sql);const patched=await definition();await db.exec(sql);
 assert.equal(await definition(),patched);assert.equal(patched,original.replace('and l.active and not l.is_test','and l.active'+injected+' and not l.is_test'));checks++;
 assert.equal(patched.replace(injected,''),original);assert.deepEqual(await sourceMeta(),meta);checks++;
 for(const predicate of ['with eligible as materialized','s.active and not s.is_test and c.active','and l.active'+injected+' and not l.is_test','and matched_by_student ? s.id::text','sessions_by_class->r.label',"expected-interval '30 minutes'"]){assert(patched.includes(predicate),predicate);checks++;}
 // Neither an unknown body nor a copied marker may bypass the source pin.
 for(const drift of [patched.replace('declare owner uuid','declare /*unknown-source*/ owner uuid'),patched.replace(injected,injected+injected),original.replace('declare owner uuid','declare /*assessment110-no-homework-due*/ owner uuid')]){
  await db.exec(drift);await assert.rejects(()=>db.exec(dueGuard),/ASSESSMENT_SYNC_DUE_SOURCE_CHANGED/);assert.equal(await definition(),drift);checks++;
 }
 await db.exec(patched);
 const owner='81111111-1111-4111-8111-111111111111',cid='82222222-2222-4222-8222-222222222222';
 const sid='83333333-3333-4333-8333-333333333331',peer='83333333-3333-4333-8333-333333333332',qa='83333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K9 9+',12)",[cid,owner]);
 for(const [id,name,phone,isTest] of [[sid,'HS tổng hợp được ghép','0900000001',false],[peer,'HS tổng hợp ngoài snapshot','0900000002',false],[qa,'HS tổng hợp QA','0900000003',true]])await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,student_phone,is_test,created_at,public_alias) values($1,$2,$3,$4,'QA','QA',$5,$6,current_date-30,$7)",[id,owner,cid,name,phone,isTest,'MTM-'+String(id).slice(-12)]);
 await db.query("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'synthetic-only',array[$2::uuid,$3::uuid],array[$4::uuid])",[owner,sid,peer,cid]);
 for(const [code,kind,isTest] of [['scope-hw','btvn',false],['scope-monthly','kiem-tra-thang',false],['scope-exam','kiem-tra',false],['scope-test-hw','btvn',true]])await db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,opens_at,closes_at,assessment_id,exam_type,is_test) values($1,$2,array[$3::uuid],$4,'{}',true,'da_dang',$5,'2026-11-02T00:00:00Z','2026-11-30T00:00:00Z',$6,$7,$8)",[code,owner,cid,JSON.stringify({date:'2026-11-02',classDates:{'2K9 9+':'2026-11-02'}}),kind,kind==='kiem-tra'?'84444444-4444-4444-8444-444444444444':null,kind==='kiem-tra'?'custom':null,isTest]);
 const receipts=[{attemptId:'synthetic',submittedAt:1793800000000,score:0,late:false,privateExtra:{preserve:true}},{attemptId:'synthetic-null',submittedAt:1793900000000,score:null,late:true}];
 for(const student of [sid,peer,qa])for(const code of student===qa?['scope-test-hw']:['scope-hw','scope-monthly','scope-exam'])await db.query("insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,receipts,expected_due_at,next_actual_class_at,due_source_identity) values($1,$2,9,$3,'2026-11-03T00:00:00Z','2026-11-03T00:00:00Z','synthetic-seed') on conflict(student_id,lesson_code) do update set revision=9,receipts=excluded.receipts,expected_due_at=excluded.expected_due_at,next_actual_class_at=excluded.next_actual_class_at,due_source_identity=excluded.due_source_identity",[student,code,JSON.stringify(receipts)]);
 const payload={sessions:[2,4,6,9,11,13].map(day=>({label:'2K9 9+',startsAt:`2026-11-${String(day).padStart(2,'0')}T17:30:00+07:00`,sourceIdentity:'synthetic-source-'+day,attendees:[{name:'HS tổng hợp được ghép',phone:'0900000001',status:'C'},{name:'HS tổng hợp QA',phone:'0900000003',status:'C'}]}))};
 const before=await works();let reference:any[],referenceSummary:any;
 // Execute the unmodified live predecessor against only synthetic rows, then
 // roll back its row writes. This preserves the exact current legacy behavior.
 await db.exec(original);
 const rollback=Symbol('rollback-reference');
 try{await db.transaction(async tx=>{referenceSummary=(await tx.query('select public.mtm_btvn_sync_due($1,true) value',[JSON.stringify(payload)])).rows[0].value;reference=(await tx.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w order by student_id,lesson_code')).rows.map((r:any)=>r.value);throw rollback;});}catch(error){if(error!==rollback)throw error;}
 assert.deepEqual(await works(),before);assert.equal(referenceSummary.matchedStudents,1);checks++;
 await db.exec(dueGuard);assert.equal(await definition(),patched);
 const summary=(await db.query('select public.mtm_btvn_sync_due($1,true) value',[JSON.stringify(payload)])).rows[0].value,after=await works();
 const legacy=(rows:any[])=>rows.filter(w=>w.lesson_code!=='scope-exam');
 assert.deepEqual(legacy(after),legacy(reference!));checks++;
 assert.deepEqual(after.filter(w=>w.lesson_code==='scope-exam'),before.filter(w=>w.lesson_code==='scope-exam'));checks++;
 assert.deepEqual(after.filter(w=>w.student_id===peer||w.student_id===qa||w.lesson_code==='scope-test-hw'),before.filter(w=>w.student_id===peer||w.student_id===qa||w.lesson_code==='scope-test-hw'));checks++;
 assert.notDeepEqual(after.find(w=>w.student_id===sid&&w.lesson_code==='scope-hw'),before.find(w=>w.student_id===sid&&w.lesson_code==='scope-hw'));checks++;
 assert.notDeepEqual(after.find(w=>w.student_id===sid&&w.lesson_code==='scope-monthly'),before.find(w=>w.student_id===sid&&w.lesson_code==='scope-monthly'));checks++;
 assert.equal(summary.matchedStudents,1);assert.equal(summary.unmatched,6);assert.equal(summary.expectedDues,referenceSummary.expectedDues-1);checks++;
 const realWork=after.find(w=>w.student_id===sid&&w.lesson_code==='scope-hw');assert.equal(realWork.receipts[0].score,0);assert.equal(realWork.receipts[1].score,null);assert.deepEqual(realWork.receipts[0].privateExtra,{preserve:true});checks++;
 console.log(`${checks} source-pinned live sync_due variant checks PASS; indexed68/QA100/legacy deadlines unchanged, class exams excluded; synthetic PGlite only.`);
}finally{await db.close();}
