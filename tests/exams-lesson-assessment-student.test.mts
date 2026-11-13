/** Full in-memory SQL chain, synthetic identities only. No provider, live RPC or account. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {validatePracticeExam} from '../src/native/exams/data';
import {createDraft} from '../src/native/exams/store';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';

const {db}=await baselineDatabase(),checks:string[]=[];
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const scalar=async(sql:string,args:any[]=[])=>Object.values((await q(sql,args)).rows[0])[0] as any;
const check=async(name:string,fn:()=>Promise<void>)=>{await fn();checks.push(name);console.log('ASSESSMENT STUDENT PASS: '+name);};
const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112';
const cid='22222222-2222-4222-8222-222222222221',otherClass='22222222-2222-4222-8222-222222222222';
const sid='33333333-3333-4333-8333-333333333331',peer='33333333-3333-4333-8333-333333333332',qa='33333333-3333-4333-8333-333333333333',outside='33333333-3333-4333-8333-333333333334';
const sessions={student:'a'.repeat(64),peer:'b'.repeat(64),qa:'c'.repeat(64),outside:'d'.repeat(64)};
const label='2K10 XPT',assessmentId=(n:number)=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
const names={active:'synthetic-custom-active',future:'synthetic-custom-future',closed:'synthetic-custom-closed',closedUnsubmitted:'synthetic-closed-unsubmitted',zero:'synthetic-closed-zero',empty:'synthetic-closed-empty',qa:'synthetic-qa-class-test',homework:'synthetic-homework-control'};
let now:number,today:string;
const exams=new Map<string,ReturnType<typeof pipelineFixture>['exam']>();

async function rpc(name:string,args:Record<string,unknown>,role='service_role',actor=''){
  return db.transaction(async tx=>{
    await tx.exec('set local role '+role);
    await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,actor]);
    const entries=Object.entries(args);
    return (await tx.query(`select public.${name}(${entries.map(([key],index)=>`${key} => $${index+1}`).join(',')}) result`,entries.map(([,value])=>value!==null&&typeof value==='object'?JSON.stringify(value):value))).rows[0].result;
  });
}
const read=(code:string,session=sessions.student)=>rpc('mtm_btvn_read_scoped100',{p_session:session,p_lesson:code});
const twoPaperRead=(code:string,session=sessions.student)=>rpc('mtm_btvn_two_paper_read',{p_session:session,p_lesson:code});
const assets=(code:string,session=sessions.student)=>rpc('mtm_btvn_assets',{p_session:session,p_lesson:code});
const commit=(code:string,revision:number,drafts:unknown[],receipts:unknown[]=[],session=sessions.student)=>rpc('mtm_btvn_commit',{p_session:session,p_lesson:code,p_revision:revision,p_drafts:drafts,p_receipts:receipts});
const makeDraft=(code:string,id:string,started=now)=>{
  const result=createDraft(exams.get(code)!,id,started);assert.ok(result.ok,JSON.stringify(result));return result.value;
};
const snapshotWork=(code:string,student=sid)=>scalar('select to_jsonb(w) from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,code]);
async function blockedCommit(code:string,revision:number,drafts:unknown[],receipts:unknown[]=[],session=sessions.student,student=sid){
  const before=await snapshotWork(code,student);
  try{const result=await commit(code,revision,drafts,receipts,session);assert.equal(result.ok,false,'a blocked commit must not return ok');}
  catch(error:any){assert.ok(['42501','P0001','22023','23514'].includes(error.code),`unexpected rejection: ${error.message}`);}
  assert.deepEqual(await snapshotWork(code,student),before,'blocked request cannot change canonical work');
}
const iso=(value:number)=>new Date(value).toISOString();
async function addLesson(code:string,{kind='kiem-tra',opens=now-7200000,closes=now+7200000,duration=45,type='custom',id=assessmentId(exams.size+1),isTest=false,score}: {kind?:string;opens?:number;closes?:number;duration?:number;type?:string;id?:string;isTest?:boolean;score?:number}={}){
  const fixture=pipelineFixture(),exam=fixture.exam;
  exam.id='mtm-custom-synthetic-'+code;exam.title='Đề tổng hợp QA · '+code;exam.durationMinutes=duration;
  exam.questions[0].solution='Lời giải nội bộ tổng hợp QA';
  exam.questions[0].sourceContent={questions:[{path:'exam-assets/statement.png',sha256:'1'.repeat(64),sourcePage:1,width:100,height:100}],solutions:[{path:'exam-assets/private-key.png',sha256:'2'.repeat(64),sourcePage:1,width:100,height:100}]};
  assert.deepEqual(validatePracticeExam(exam),{valid:true,errors:[]},'synthetic source must be a valid scoring exam');
  const material={lessonCode:code,date:today,classNames:[label],classDates:{[label]:today},classOpensAt:{[label]:iso(opens)},title:exam.title};
  const allAssets=[{path:exam.sourcePdf!.url.slice(1),sha256:exam.sourcePdf!.sha256,content_type:'application/pdf',bytes:Buffer.from(fixture.assets[0].data_base64,'base64').length,storage_path:`btvn/${code}/questions.pdf`},{path:'exam-assets/statement.png',sha256:'1'.repeat(64),content_type:'image/png',bytes:100,storage_path:`btvn/${code}/statement.png`},{path:'exam-assets/private-key.png',sha256:'2'.repeat(64),content_type:'image/png',bytes:100,storage_path:`btvn/${code}/private-key.png`}];
  await q(`insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,source_version,assets,kind,opens_at,closes_at,assessment_id,exam_type,is_test)
    values($1,$2,array[$3::uuid],$4,$5,true,'da_dang',$6,$7,$8,$9,$10,$11,$12,$13)`,[code,owner,cid,JSON.stringify(material),JSON.stringify(exam),'e'.repeat(64),JSON.stringify(allAssets),kind,iso(opens),iso(closes),kind==='kiem-tra'?id:null,kind==='kiem-tra'?type:null,isTest]);
  exams.set(code,exam);
  if(!isTest){await q('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$3),($2,$3) on conflict do nothing',[sid,peer,code]);}
  else await q('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$2) on conflict do nothing',[qa,code]);
  if(score!==undefined){
    const draft=makeDraft(code,'seed-'+code,opens+60000),submitted=opens+120000;
    draft.submittedAt=submitted;draft.updatedAt=submitted;
    await q('update mtm_hw_private.btvn_work set drafts=$3,receipts=$4 where student_id=$1 and lesson_code=$2',[sid,code,JSON.stringify([draft]),JSON.stringify([{attemptId:draft.attemptId,attemptNumber:1,submittedAt:submitted,elapsedSeconds:60,score,late:false,timedOut:false}])]);
  }
}

try{
  await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
  await db.exec("create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;");
  for(const name of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql','202611130110_lesson_assessment.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
  now=Number(await scalar('select floor(extract(epoch from clock_timestamp())*1000)'));today=await scalar("select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text");
  await q('insert into auth.users values($1),($2)',[owner,teacher]);
  await q("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'synthetic-owner','Quản lý tổng hợp QA','admin','thaythanh'),($2,'synthetic-teacher','Giáo viên tổng hợp QA','gv','thaytai')",[owner,teacher]);
  await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$3,'2K10 XPT',11),($2,$3,'2K11 XPT',10)",[cid,otherClass,owner]);
  await q('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid,$3::uuid])',[owner,cid,otherClass]);
  await q("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K10 XPT',extract(isodow from $1::date)::int,'17:30','19:30','thaytai')",[today]);
  await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'synthetic-only',array[$2::uuid,$3::uuid],array[$4::uuid,$5::uuid])",[owner,sid,peer,cid,otherClass]);
  for(const [student,cls,name,isTest,alias,session] of [[sid,cid,'Học sinh tổng hợp trùng tên',false,'MTM-000000000001',sessions.student],[peer,cid,'Học sinh tổng hợp trùng tên',false,'MTM-000000000002',sessions.peer],[qa,cid,'Danh tính test tổng hợp',true,'MTM-000000000003',sessions.qa],[outside,otherClass,'Học sinh lớp khác tổng hợp',false,'MTM-000000000004',sessions.outside]] as const){
    await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test,created_at) values($1,$2,$3,$4,'Trường tổng hợp','Lớp tổng hợp',$5,$6,current_date-30)",[student,owner,cls,name,alias,isTest]);
    await q("insert into mtm_hw_private.btvn_identity_sessions(student_id,digest,expires_at) values($1,mtm_hw_private.token_digest('btvn-identity',$2),clock_timestamp()+interval '1 day')",[student,session]);
  }
  await addLesson(names.active,{score:8.5});await addLesson(names.future,{opens:now+3600000,closes:now+10800000,type:'monthly'});
  await addLesson(names.closed,{closes:now-60000});await addLesson(names.closedUnsubmitted,{closes:now-60000});
  await addLesson(names.zero,{closes:now-60000,score:0});await addLesson(names.empty,{closes:now-60000});
  await addLesson(names.qa,{isTest:true});await addLesson(names.homework,{kind:'btvn',duration:120,score:7});
  const openNew='synthetic-start-once';await addLesson(openNew);

  await check('canonical metadata survives scoped and two-paper transport without two-code semantics',async()=>{
    for(const readFn of [read,twoPaperRead]){
      const snap=await readFn(names.active),card=snap.lessons.find((item:any)=>item.lessonCode===names.active);
      assert.equal(snap.material.kind,'kiem-tra');assert.equal(card.kind,'kiem-tra');
      for(const item of [snap.material,card]){assert.equal(item.workKind,'exam');assert.equal(item.examType,'custom');assert.equal(item.assessmentId,assessmentId(1));assert.equal(item.title,exams.get(names.active)!.title);assert.equal(item.durationMinutes,45);assert.equal(item.maxAttempts,1);assert.equal(Number(item.opensAt),now-7200000);assert.equal(Number(item.closesAt),now+7200000);}
      assert.ok(!snap.paperChoice,'single-class test never becomes the homework two-paper selector');
    }
  });
  await check('service_role-only transport retains ordinary student scope',async()=>{
    for(const name of ['mtm_btvn_read_scoped100','mtm_btvn_two_paper_read','mtm_btvn_assets'])for(const role of ['anon','authenticated'])await assert.rejects(()=>rpc(name,{p_session:sessions.student,p_lesson:names.active},role,teacher),(error:any)=>error.code==='42501');
    for(const session of [sessions.outside,sessions.qa]){await assert.rejects(()=>read(names.active,session),(error:any)=>error.code==='42501');await assert.rejects(()=>assets(names.active,session),(error:any)=>error.code==='42501');}
    await assert.rejects(()=>read(names.qa),(error:any)=>error.code==='42501');
    assert.equal((await read(names.qa,sessions.qa)).material.kind,'kiem-tra');
  });
  await check('before opens and after closes cannot start or mutate work',async()=>{
    for(const code of [names.future,names.closed]){const snap=await read(code);await blockedCommit(code,snap.revision,[makeDraft(code,'blocked-'+code)]);}
  });
  await check('exact exam-duration deadline accepted; tampered deadline refused',async()=>{
    const snap=await read(openNew),draft=makeDraft(openNew,'one-stable-attempt');
    await blockedCommit(openNew,snap.revision,[{...draft,deadline:draft.deadline+1}]);
    const accepted=await commit(openNew,snap.revision,[draft]);assert.equal(accepted.ok,true);
    const reloaded=await read(openNew);assert.equal(reloaded.work.drafts[0].attemptId,draft.attemptId);assert.equal(reloaded.work.drafts[0].deadline-reloaded.work.drafts[0].startedAt,45*60000);
    await blockedCommit(openNew,reloaded.revision,[draft,makeDraft(openNew,'second-attempt')]);
  });
  await check('question assets only before close; no solution assets after close until submitted',async()=>{
    for(const [code,session] of [[names.active,sessions.student],[names.closedUnsubmitted,sessions.student],[names.zero,sessions.peer]]){
      const result=await assets(code,session),paths=JSON.stringify(result);assert.ok(Array.isArray(result));assert.ok(result.some((item:any)=>item.path==='exam-assets/statement.png'));
      assert.ok(!paths.includes('private-key.png'),'no teacher solution bytes or path may be signed');
    }
    assert.ok(JSON.stringify(await assets(names.zero)).includes('private-key.png'),'submitted closed test can retrieve its own solution assets');
  });
  await check('public repository response hides answer/score before close even after submit',async()=>{
    const transport={async rpc(name:string,args:Record<string,unknown>){try{return {data:await rpc(name==='mtm_btvn_read'?'mtm_btvn_two_paper_read':name,args),error:null};}catch(error:any){return {data:null,error:{code:error.code,message:error.message}};}}};
    const repo=new SupabaseHomeworkRepository(transport,async()=>{throw Error('No Edge/network in SQL fixture.');});
    const state=await repo.call(sessions.student,'state',names.active);assert.equal(state.kind,'kiem-tra');assert.equal(state.examType,'custom');assert.equal(state.maxAttempts,1);assert.equal(state.bestScore,null);assert.equal(state.receipts[0].score,null);assert.equal(state.solutionsAvailable,false);
    const text=JSON.stringify(state);assert.ok(!text.includes('private-key.png'));assert.ok(!text.includes('acceptedAnswers'));assert.ok(!text.includes('Lời giải nội bộ'));assert.ok(!text.includes('"answer":"D"'));
    const done=await repo.call(sessions.student,'state',names.zero);assert.equal(done.solutionsAvailable,true);assert.equal(done.bestScore,0);assert.equal(done.receipts[0].score,0);
  });
  await check('effective close expires an existing exact-duration draft and forbids a second attempt',async()=>{
    const code=names.closedUnsubmitted,draft=makeDraft(code,'late-saved-attempt',now-120000);draft.answers={'mc-1':'D'};
    await q('update mtm_hw_private.btvn_work set drafts=$3 where student_id=$1 and lesson_code=$2',[sid,code,JSON.stringify([draft])]);
    const transport={async rpc(name:string,args:Record<string,unknown>){try{return {data:await rpc(name==='mtm_btvn_read'?'mtm_btvn_two_paper_read':name,args),error:null};}catch(error:any){return {data:null,error:{code:error.code,message:error.message}};}}};
    const repo=new SupabaseHomeworkRepository(transport,async()=>{throw Error('No Edge/network in SQL fixture.');});
    const expired=await repo.call(sessions.student,'save',code,draft.attemptId,{'mc-1':'A'});
    assert.ok(expired.draft?.submittedAt!==null);assert.equal(expired.draft!.deadline-expired.draft!.startedAt,45*60000);assert.equal(expired.draft!.answers['mc-1'],'D','answers arriving after effective close cannot replace last saved answers');
    assert.equal(expired.receipts.length,1);assert.equal(expired.receipts[0].timedOut,true);
    const saved=await read(code);await blockedCommit(code,saved.revision,[...saved.work.drafts,makeDraft(code,'forbidden-second')],saved.work.receipts);
  });
  await check('legacy two-code monthly assessment remains distinct from a new monthly preset',async()=>{
    const base='thi-thang-2026-11-synthetic-class';
    for(const ma of [1,2])await addLesson(`${base}-thi-ma-${ma}`,{kind:'kiem-tra-thang',duration:120});
    const first=await read(`${base}-thi-ma-1`),legacy=first.lessons.filter((item:any)=>item.lessonCode.startsWith(base));
    assert.equal(legacy.length,2);assert.ok(legacy.every((item:any)=>item.kind==='kiem-tra-thang'));
    const current=await read(names.future);assert.equal(current.material.kind,'kiem-tra');assert.equal(current.material.examType,'monthly');
  });
  await check('history separates kinds and suppresses pre-close official grades; zero/null retained after close',async()=>{
    await db.exec('select mtm_test100.refresh_reports()');
    const history=(kind:string)=>rpc('mtm_lesson_upload_api',{p:{action:'staff_history',work_kind:kind,mode:'assignment',from_date:today,to_date:today,class_id:cid,student_id:sid,page:1,page_size:50}},'authenticated',teacher);
    const report=await history('exam');assert.equal(report.work_kind,'exam');assert.equal(report.score_basis,'assessment_date');
    const items=report.rows.flatMap((row:any)=>row.homework),item=(code:string)=>items.find((value:any)=>value.assignment_id===code);
    assert.ok(item(names.active));assert.equal(item(names.active).score,null);assert.equal(item(names.active).status,'not_released');
    assert.equal(item(names.active).exam_type,'custom');assert.equal(item(names.active).assessment_id,assessmentId(1));assert.equal(item(names.active).title,exams.get(names.active)!.title);
    assert.ok(item(names.active).opens_at);assert.ok(item(names.active).closes_at);assert.equal(item(names.active).duration_minutes,45);
    assert.equal(item(names.zero).score,0);assert.equal(item(names.empty).score,null);
    assert.ok(items.some((value:any)=>value.assignment_id.startsWith('thi-thang-')&&value.exam_type==='monthly'&&value.assessment_id===null));
    assert.ok(!items.some((value:any)=>value.assignment_id===names.homework));
    const homework=await history('homework'),homeworkItems=homework.rows.flatMap((row:any)=>row.homework);
    assert.ok(homeworkItems.some((value:any)=>value.assignment_id===names.homework));assert.ok(homeworkItems.every((value:any)=>!items.some((exam:any)=>exam.assignment_id===value.assignment_id)));
    const serialized=JSON.stringify(report);for(const privateKey of ['answer_path','answer_text','receipts','drafts','parent_phone','student_phone','password'])assert.ok(!serialized.includes('"'+privateKey+'"'));
  });
}finally{await db.close();}
console.log(`${checks.length} student assessment SQL groups passed; synthetic PGlite only, no live service/AI. Loaded original 100/101/102/103/107/108/109/110 chain.`);
