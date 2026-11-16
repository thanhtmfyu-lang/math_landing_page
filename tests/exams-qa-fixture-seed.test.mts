/** LOCAL synthetic DB-owner fixture seed, never an AI/native publication test. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {productionRpc} from '../server/btvn/test-scope';
import {validatePracticeExam,type PracticeExam} from '../src/native/exams/data';
import {mtmPracticeGradingReadiness} from '../src/native/exams/mtm-assessment';
import {MTM_SCORING_VERSION} from '../src/native/exams/mtm-scoring';
process.on('uncaughtException',(error:any)=>{console.error(JSON.stringify({status:'FAIL',message:error.message,code:error.code,where:error.where,stack:error.stack?.split('\n').slice(-3)}));process.exitCode=1;});
const {db}=await baselineDatabase();
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const value=async(sql:string,args:any[]=[])=>((await db.query(sql,args)).rows[0] as any)?.v;
let checks=0;
const check=async(name:string,run:()=>Promise<void>)=>{await run();console.log('QA FIXTURE PASS '+(++checks)+' '+name);};
const owner='71611111-1111-4111-8111-111111111111',teacher='71611111-1111-4111-8111-111111111112';
const realClass='71622222-2222-4222-8222-222222222222',label='2K10 QA Student Seed';
const homeworkCode='qa116-student-homework',examCode='qa116-student-exam',assessment='71666666-6666-4666-8666-666666666666';
const trace:string[]=[];
async function rpc(name:string,args:Record<string,unknown>,role='service_role',actor=''){
 trace.push(name);
 return db.transaction(async(tx:any)=>{
  await tx.exec('set local role '+role);
  await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,actor]);
  const entries=Object.entries(args);
  return (await tx.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) v`,entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;
 });
}
const signed:string[]=[];
const repository=()=>new SupabaseHomeworkRepository({rpc:async(name,args)=>{
 try{return {data:await rpc(name==='mtm_btvn_read'?'mtm_btvn_two_paper_read':productionRpc(name),args),error:null};}
 catch(error:any){return {data:null,error:{code:error.code,message:error.message}};}
}},async body=>{
 if(body.operation==='resolve')return rpc('mtm_hw_resolve_code',{p_code:body.code});
 if(body.operation==='confirm')return rpc('mtm_hw_confirm',{p_challenge:body.challenge,p_confirm:true});
 throw Error('Only normal local code login is permitted');
},Date.now,async path=>{signed.push(path);return 'https://signed.qa.invalid/'+encodeURIComponent(path);});
const work=(student:string,code:string)=>value('select to_jsonb(w) v from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,code]);
const noProcessing=()=>value("select jsonb_build_array((select count(*) from mtm_hw_private.lesson_uploads),(select count(*) from mtm_hw_private.lesson_upload_steps),(select count(*) from mtm_hw_private.lesson_review_requests),(select count(*) from mtm_hw_private.sync_events),(select count(*) from mtm_hw_private.sync_deliveries)) v");
function exam(count:3|4):PracticeExam{
 const answer=count===3?'B':'C';
 const problems=count===3?[
  ['2 + 3 bằng bao nhiêu?',['4','5','6','7'],'2 + 3 = 5.'],
  ['3x = 12. Giá trị x là gì?',['3','4','5','6'],'x = 12/3 = 4.'],
  ['x > 0 và x² = 9. Giá trị x là gì?',['2','3','4','5'],'x = 3 vì x > 0.'],
 ]:[
  ['2 + 4 bằng bao nhiêu?',['4','5','6','7'],'2 + 4 = 6.'],
  ['x - 5 = 2. Giá trị x là gì?',['5','6','7','8'],'x = 2 + 5 = 7.'],
  ['2² + 3² bằng bao nhiêu?',['9','11','13','15'],'2² + 3² = 4 + 9 = 13.'],
  ['10/2 bằng bao nhiêu?',['3','4','5','6'],'10/2 = 5.'],
 ];
 const questionPdf=Buffer.from('%PDF-1.4\n% synthetic questions fixture, not a teaching document '+count+'\n%%EOF\n');
 const solutionPdf=Buffer.from('%PDF-1.4\n% synthetic solutions fixture, not a teaching document '+count+'\n%%EOF\n');
 const qHash=hash(questionPdf),sHash=hash(solutionPdf);
 return {id:'mtm-custom-qa116-seed-'+count,title:'Phiếu giả kiểm luồng học sinh '+count,grade:11,period:'GK1',durationMinutes:count===3?120:1,
  questionCount:count,rubricVersion:MTM_SCORING_VERSION,versionHash:hash('locked-exam-'+count),answerKeyVersion:'qa116-key-v1-'+count,
  sourceHash:qHash,sourceRef:'Nguồn tổng hợp cục bộ kiểm phần mềm; không giao học sinh thật',sourceUrl:'https://qa.invalid/synthetic',
  publicationVerified:true,questionDisplayVerified:true,answerKeyVerified:true,rubricVerified:true,sourceComplete:true,
  sourceMaterial:{title:'QA synthetic',publisher:'MTM',version:'LOCAL-ONLY',locator:String(count)+' câu giả'},
  sourcePdf:{url:'/exam-assets/'+qHash+'.pdf',sha256:qHash,bytes:questionPdf.length,totalPages:1,questionPages:[1],verified:true},
  mtmDocuments:{questions:{url:'/exam-assets/'+qHash+'.pdf',sha256:qHash},solutions:{url:'/exam-assets/'+sHash+'.pdf',sha256:sHash}},
  questions:problems.map(([prompt,choices,solution],index)=>({id:'q'+(index+1),kind:'mc',prompt,choices,solution,sourceRef:'Câu giả '+(index+1),sourcePdfPage:1,answer,maxPoints:{numerator:'10',denominator:String(count)},maxMillipoints:10000/count}))} as PracticeExam;
}
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations-pending/20261029_1530_is_test_sync_capture.sql','utf8'));
 await db.exec("create or replace function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;alter role service_role bypassrls;");
 for(const file of ['202611080106_btvn_han_tu_ghi.sql','202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql','202611130110_lesson_assessment.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+file,'utf8'));
 // Reuse the two hash-pinned, read-only SQL source fixtures; no copy of cloud
 // data or credential material is needed to install the real QA116 migration.
 const fixtures=readFileSync('tests/exams-qa-classrooms.test.mts','utf8');
 for(const name of ['botSource','dueSource']){
  const found=fixtures.match(new RegExp('const '+name+'=String.raw`([\\s\\S]*?)`;'));assert.ok(found,'read-only source fixture '+name);await db.exec(found[1]+';');
 }
 let sql=readFileSync('supabase/migrations-pending/202611160116_qa_classrooms.sql','utf8').replaceAll('\r\n','\n');
 for(const [signature,pin] of [
  ['mtm_hw_private.sync_capture()','2cda7c3bafeb966be7016fc32ab3d0ef7998ffbdc97ddc0272652ebdf4adb6b0'],
  ['public.mtm_btvn_classes()','6f30d4b2e72ce36a72a91971d5946c0d65a523c439fbd2a5e638760cda7a6609'],
  ['public.mtm_dd_api4(jsonb)','062dc037caa3f4f8153152ba95603e0675825f6124e96e73ef46569a90a4b0b3'],
  ['public.mtm_btvn_bot_catalog(jsonb)','30ff2bd96cfcb723540dbd37777a248bc008f2be27eac307a9f64a9a62b77c71'],
  ['mtm_hw_private.j39_due_rows(text,date)','e7a6d123d52f3b5e8258713d3f2362b41d35aa4be44e8c1cb491d72972b60ca9'],
 ]){assert.equal(sql.split(pin).length,2);sql=sql.replace(pin,hash(await value('select pg_get_functiondef($1::regprocedure) v',[signature])));}
 await db.exec(sql);
 await db.query('insert into auth.users values($1),($2)',[owner,teacher]);
 await db.query('insert into public.mtm_exam_admins(user_id) values($1)',[owner]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key,must_change_password) values($1,'seed-manager','QL tổng hợp','ql',null,false),($2,'seed-teacher','GV tổng hợp','gv','thaythanh',true)",[owner,teacher]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K10 9+',11)",[realClass,owner]);
 await db.query("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'fixture-only',array['71633333-3333-4333-8333-333333333331'::uuid,'71633333-3333-4333-8333-333333333332'::uuid],array[$2::uuid])",[owner,realClass]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid])',[owner,realClass]);
 const day=await value("select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text v");
 const fixture=await value("select mtm_test100.provision_classroom116('qa116:seed-local-20261116',$1,11,$2,$3,'17:30','19:30',$4) v",[label,teacher,day,JSON.stringify([{name:'QA Safari Seed',phone:'0000000801'},{name:'QA Zalo Seed',phone:'0000000802'}])]);
 const beforeProcessing=await noProcessing(),questionExams=[exam(3),exam(4)];
 for(const e of questionExams){assert.deepEqual(validatePracticeExam(e),{valid:true,errors:[]});assert.deepEqual(mtmPracticeGradingReadiness(e),{valid:true,errors:[]});}
 const now=Date.now(),closesAt=now+5000;
 await check('DB-owner seed accepts exact is_test scope with manual fixture provenance and no native/AI receipt',async()=>{
  for(const [index,code] of [homeworkCode,examCode].entries()){
   const e=questionExams[index],kind=index?'kiem-tra':'btvn',source=e.sourceHash;
   const material={lessonCode:code,title:e.title,date:day,classNames:[label],classDates:{[label]:day},classOpensAt:{[label]:new Date(now-60000).toISOString()},videoId:null,materialUrl:null,handoutUrl:null,homeworkUrl:null};
   const assets=[e.mtmDocuments!.questions,e.mtmDocuments!.solutions!].map((p,i)=>({path:p.url.slice(1),sha256:p.sha256,storage_path:`btvn/${code}/${source}/${i?'solutions':'questions'}.pdf`,content_type:'application/pdf',bytes:100}));
   await db.query("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,source_version,assets,verification,is_test,kind,opens_at,closes_at,assessment_id,exam_type) values($1,$2,array[$3::uuid],$4,$5,true,'da_dang',$6,$7,$8,true,$9,$10,$11,$12,$13)",[code,owner,fixture.classId,JSON.stringify(material),JSON.stringify(e),source,JSON.stringify(assets),JSON.stringify({verificationKind:'manual-synthetic-student-e2e',aiProcessing:false,sourceComplete:true}),kind,new Date(now-60000).toISOString(),index?new Date(closesAt).toISOString():null,index?assessment:null,index?'custom':null]);
  }
  assert.deepEqual(await noProcessing(),beforeProcessing);
 });
 const sessions:string[]=[];
 await check('Both synthetic learners use ordinary issue-missing-code→resolve→confirm login; no PIN or session bypass',async()=>{
  for(const student of fixture.studentIds){
   const issued=await rpc('mtm_btvn_issue_missing_code',{p_student_id:student,p_days:1},'authenticated',owner);
   assert.equal(issued.preserved,false);assert.ok(issued.code);
   sessions.push(await repository().login({studentCode:issued.code}));
  }
  assert.equal(sessions.length,2);assert.notEqual(sessions[0],sessions[1]);
  assert.deepEqual(await rpc('mtm_btvn_classes',{}),['2K10 9+']);
  assert.deepEqual(await rpc('mtm_btvn_qa_class116',{p_class_id:fixture.classId}),[label]);
 });
 for(const [index,session] of sessions.entries())for(const [examIndex,code] of [homeworkCode,examCode].entries()){
  await check(`Learner ${index+1} ${examIndex?'EXAM':'BTVN'}: state→start→one answer ACK→fresh repository reload→submit→receipt`,async()=>{
   const repo=repository(),e=questionExams[examIndex],initial=await repo.call(session,'state',code);
   assert.equal(initial.attemptsUsed,0);assert.equal(initial.maxAttempts,examIndex?1:5);
   const started=await repo.call(session,'start',code),d=started.draft!;assert.ok(d);assert.equal(started.attemptsUsed,1);
   assert.equal(d.deadline-d.startedAt,e.durationMinutes*60000);
   if(examIndex)assert.equal(started.closesAt,closesAt);
   const first={q1:examIndex?'C':'B'};await repo.call(session,'save',code,d.attemptId,first,1,d.revision);
   const resumed=await repository().call(session,'state',code);assert.equal(resumed.draft!.attemptId,d.attemptId);assert.equal(resumed.draft!.startedAt,d.startedAt);assert.equal(resumed.draft!.deadline,d.deadline);assert.deepEqual(resumed.draft!.answers,first);
   const full=Object.fromEntries(e.questions.map(q=>[q.id,examIndex?'C':'B']));
   await repo.call(session,'save',code,d.attemptId,full,2,resumed.draft!.revision);
   const ack=await repository().call(session,'state',code);
   const submitted=await repo.call(session,'submit',code,d.attemptId,full,3,ack.draft!.revision);
   assert.ok(submitted.draft!.submittedAt);assert.equal(submitted.receipts.length,1);assert.equal(submitted.attemptsUsed,1);
   if(examIndex){assert.equal(submitted.receipts[0].score,null);assert.equal(submitted.bestScore,null);assert.equal(submitted.solutionsAvailable,false);}
   else assert.equal(submitted.bestScore,10);
   const canonical=await work(fixture.studentIds[index],code);assert.equal(canonical.drafts.length,1);assert.equal(canonical.receipts.length,1);assert.equal(canonical.receipts[0].score,10);assert.deepEqual(canonical.drafts[0].answers,full);
   const snapshot=await repository().call(session,'state',code);assert.equal(snapshot.draft!.attemptId,d.attemptId);assert.equal(snapshot.receipts.length,1);assert.deepEqual(await work(fixture.studentIds[index],code),canonical);
  });
 }
 await check('Before-close EXAM solution assets remain unsigned; after actual SQL close both learners reveal 10 and retain one receipt',async()=>{
  const solutionRef=questionExams[1].mtmDocuments!.solutions!.sha256;
  assert.ok(!signed.some(path=>path.includes(examCode)&&path.endsWith('/solutions.pdf')));
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,closesAt-Date.now()+40)));
  assert.ok(await value('select clock_timestamp()>$1::timestamptz v',[new Date(closesAt).toISOString()]));
  for(const [index,session] of sessions.entries()){
   const before=await work(fixture.studentIds[index],examCode);
   const revealed=await repository().call(session,'state',examCode);assert.equal(revealed.bestScore,10);assert.equal(revealed.receipts[0].score,10);assert.equal(revealed.solutionsAvailable,true);assert.equal(revealed.attemptsUsed,1);assert.equal(revealed.maxAttempts,1);
   assert.ok(revealed.exam?.mtmDocuments?.solutions?.url.startsWith('https://signed.qa.invalid/'));assert.equal(revealed.exam?.mtmDocuments?.solutions?.sha256,solutionRef);
   assert.deepEqual(await work(fixture.studentIds[index],examCode),before);
   await assert.rejects(()=>repository().call(session,'start',examCode),/hết|lượt|đóng|nộp/i);
  }
  assert.ok(signed.some(path=>path.includes(examCode)&&path.endsWith('/solutions.pdf')));
 });
 await check('No teacher/real work, provider, worker, upload, queue, quota or operational outbox was invoked',async()=>{
  assert.deepEqual(await noProcessing(),beforeProcessing);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.btvn_work w join mtm_hw_private.students s on s.id=w.student_id where not s.is_test'),0);
  assert.equal(await value('select count(*)::int v from mtm_hw_private.students where class_id=$1 and not is_test',[fixture.classId]),0);
  assert.equal(await value('select must_change_password v from public.mtm_staff where user_id=$1',[teacher]),true);
  assert.ok(!trace.some(name=>/lesson_upload|pipeline|worker|review|quota/.test(name)));
 });
 console.log(`QA fixture seed LOCAL ${checks} groups PASS; synthetic signer only; no real-phone or AI-publication claim.`);
}finally{await db.close();}
