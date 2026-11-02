import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {runMonthlyUploadOnce} from '../server/lesson-upload/monthly-worker';
import {createMonthlyRepository} from '../server/lesson-upload/monthly-repository';
import {reviewQuestions} from '../server/lesson-upload/worker';
import {createLessonGatewayClient} from '../server/lesson-upload/publisher-client';
import {expectedSlots} from '../server/btvn/publish-handler';
import {createBtvnPublishHandler} from '../supabase/functions/mtm-btvn-publish/handler.generated.js';
import {createPublishPort} from '../supabase/functions/mtm-btvn-publish/port.mjs';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
const {db}=await baselineDatabase();
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;`);
 for(const file of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611030101_thi_thang_gv.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+file,'utf8'));
 await db.exec(readFileSync('supabase/migrations-pending/202611030101_thi_thang_gv.sql','utf8'));
 const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112',otherTeacher='11111111-1111-4111-8111-111111111113',manager='11111111-1111-4111-8111-111111111114',cid='22222222-2222-4222-8222-222222222221',cid2='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2),($3),($4)',[owner,teacher,otherTeacher,manager]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture-admin','Admin giả','admin','thaythanh'),($2,'fixture-gv','GV giả','gv','thaytai'),($3,'fixture-gv-b','GV giả B','gv','thayhieu'),($4,'hang','QL giả','ql',null)",[owner,teacher,otherTeacher,manager]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$3,'2K10 9+',11),($2,$3,'2K11 8+',10)",[cid,cid2,owner]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,$2)',[owner,[cid,cid2]]);
 await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K10 9+',1,'17:30','19:30','Trần Thanh Anh Tài'),('2K11 8+',1,'19:30','21:30','Trần Đức Hiếu')");
 const date=(await db.query("select to_char((clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date+1,'YYYY-MM-DD') d")).rows[0].d as string;
 async function asRole(role:string,uid:string|undefined,fn:(tx:any)=>Promise<any>){return db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,uid??'']);return fn(tx);});}
 const call=(name:string,args:any[],role='service_role',uid?:string)=>asRole(role,uid,async tx=>(await tx.query(`select public.${name}(${args.map((_:any,i:number)=>'$'+(i+1)).join(',')}) r`,args.map((v:any)=>typeof v==='object'&&v!==null?JSON.stringify(v):v))).rows[0].r);
 const staff=(p:any,uid=teacher)=>call('mtm_lesson_upload_api',[p],'authenticated',uid);
 const dashboard=await staff({action:'monthly_dashboard',exam_date:date});assert.equal(dashboard.classes.length,1);assert.equal(dashboard.classes[0].class_id,cid);
 for(const name of ['hang','vietanh','dung','quanly']){await db.query('update public.mtm_staff set short_name=$1 where user_id=$2',[name,manager]);assert.equal((await staff({action:'monthly_dashboard',exam_date:date},manager)).classes.length,2);}
 await assert.rejects(()=>staff({action:'monthly_worker_claim',worker_id:'browser'}),/SERVICE_ROLE_REQUIRED/);
 await assert.rejects(()=>asRole('authenticated',teacher,tx=>tx.exec('select * from mtm_hw_private.monthly_uploads')));
 await assert.rejects(()=>asRole('anon',undefined,tx=>tx.exec("select public.mtm_lesson_upload_api('{\"action\":\"monthly_dashboard\"}')")));
 const papers=[101,102].map(code=>({code,homework_path:`${manager}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/monthly${code}.pdf`,answer_path:null,answer_text:code===101?'1D':'1A',essay_max_score:3,essay_rubric:'Rubric giả: hai bước, tổng ba điểm.'}));
 for(const p of papers)await db.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":64}')",[p.homework_path]);
 const payload={action:'monthly_create',title:'Thi giả',class_ids:[cid,cid2],exam_date:date,opens_at:date+'T19:30:00+07:00',closes_at:date+'T21:30:00+07:00',papers};
 await assert.rejects(()=>staff(payload),/CLASS_TEACHER_REQUIRED/);
 const created=await staff(payload,manager);assert.equal(created.ok,true);
 const adminDash=await staff({action:'monthly_dashboard',exam_date:date},owner);assert.equal(adminDash.scheduled_classes,2);assert.equal(adminDash.ready_classes,0);assert.doesNotMatch(JSON.stringify(adminDash),/answer_text|homework_path|1D|claim_token|papers/);
 const objects=new Map<string,Uint8Array>(),secret='monthly-offline-test-only-'.repeat(2);let commitCount=0;
 const handler=createBtvnPublishHandler({async rpc(a,p){assert.equal(a,'lesson_upload_gateway');if(p.action==='monthly_worker_publish'){
  commitCount++;const payloads=p.payloads as any[];
  await assert.rejects(()=>asRole('mtm_btvn_publisher',undefined,tx=>tx.query('select public.mtm_btvn_pipeline($1,$2)',['publish',JSON.stringify(payloads[0])])),/MONTHLY_PUBLISH_CAPABILITY_REQUIRED/);
  await assert.rejects(()=>call('mtm_lesson_upload_gateway',[{...p,payloads:[payloads[0],{...payloads[1],monthly_verification:{...payloads[1].monthly_verification,passed:false}}]}]),/MONTHLY_MATH_REVIEW_REQUIRED/);
  await assert.rejects(()=>call('mtm_lesson_upload_gateway',[{...p,payloads:[payloads[0],{...payloads[1],assets:[]}]}]),/Verification required/);
  assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_lessons')).rows[0].n,0,'failed second code rolls back first code');
 }return call('mtm_lesson_upload_gateway',[p]);},async upload(path,bytes){objects.set(path,bytes);},async readPrivate(bucket,path){assert.equal(bucket,'mtm-btvn');assert(objects.has(path));return {bytes:objects.get(path)!,content_type:'application/pdf'};}},secret);
 const gateway=createLessonGatewayClient('https://fixture.supabase.co/functions/v1/mtm-btvn-publish',secret,async(url,init)=>handler(new Request(url,init)));
 const exams=[pipelineFixture(),pipelineFixture()];(exams[1].exam.questions[0] as any).answer='A';exams[1].verification.slots=expectedSlots(exams[1].exam).map(s=>({...s,actual:s.question_id==='sa-1'?'2.5':s.expected}));
 const memory=new Map<string,any>(),state={async save(_id:string,key:string,v:any){memory.set(key,structuredClone(v));return key;},async load(key:string){return structuredClone(memory.get(key));}};
 const result=await runMonthlyUploadOnce(createMonthlyRepository(gateway),{extractor:{provider:'chatgpt-oauth',model:'fixture'},async read(j){return {sourceVersion:String(j.paper).repeat(64),questions:reviewQuestions(exams[j.paper!-1].exam),teacherSlots:expectedSlots(exams[j.paper!-1].exam)};},async build(j){return {exam:exams[j.paper!-1].exam,assets:exams[j.paper!-1].assets};},async review(input,provider){return {provider,model:'fixture-'+provider,receipt_hash:(provider==='grok'?'a':'b').repeat(64),request_hash:(provider==='grok'?'c':'d').repeat(64),sourceVersion:input.sourceVersion,slots:exams[Number(input.sourceVersion[0])-1].verification.slots};},async sympy(input){return {engine:'sympy',version:'fake-local',sourceVersion:input.sourceVersion,passed:true,receipt_hash:'f'.repeat(64),slots:exams[Number(input.sourceVersion[0])-1].verification.slots};}},state,'fixture');
 assert.equal(result.status,'complete',JSON.stringify(result));assert.equal(commitCount,1);
 const lessons=(await db.query('select * from mtm_hw_private.btvn_lessons where class_ids&&$1 order by code',[[cid,cid2]])).rows;assert.equal(lessons.length,2);for(const l of lessons){assert.equal(l.kind,'kiem-tra-thang');assert.deepEqual(l.class_ids,[cid,cid2]);assert.equal(l.is_test,false);}
 const ready=await staff({action:'monthly_dashboard',exam_date:date},owner);assert.equal(ready.ready_classes,2);assert.equal(ready.scheduled_classes,2);
 const code1=lessons[0].code as string,code2=lessons[1].code as string;
 await assert.rejects(()=>staff(payload,manager),/PUBLISHED_MONTHLY_IMMUTABLE/);
 // Direct student roles cannot read keys, source objects or privileged raw reader.
 await assert.rejects(()=>asRole('authenticated',teacher,tx=>tx.exec('select * from mtm_hw_private.btvn_lessons')));
 await assert.rejects(()=>asRole('anon',undefined,tx=>tx.query('select public.mtm_btvn_read($1,$2)',['f'.repeat(64),code1])));
 const token='f'.repeat(64);await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'HS giả','Trường giả','Lớp giả','MTM-000000000001')",[sid,owner,cid]);
 await db.query("insert into mtm_hw_private.btvn_identity_sessions values(mtm_hw_private.token_digest('btvn-identity',$1),$2,clock_timestamp()+interval '1 hour',null)",[token,sid]);
 const client={async rpc(name:string,args:any){try{return {data:await call(name,Object.values(args)),error:null};}catch(e){return {data:null,error:{message:(e as Error).message}};}}};let signed=0;
 const repo=new SupabaseHomeworkRepository(client,async()=>({}),Date.now,async()=>{signed++;return 'https://fixture.invalid/private';});
 const before=await repo.call(token,'state',code2);assert.equal(before.exam,null);assert.equal(signed,0);
 // Synthetic time windows on the lesson fixture only: real DB and service clock checks.
 await db.query("update mtm_hw_private.btvn_lessons set opens_at=clock_timestamp()-interval '1 minute',closes_at=clock_timestamp()+interval '1 hour' where code in ($1,$2)",[code1,code2]);
 const selected=await repo.call(token,'select',code2);assert(selected.exam);assert.doesNotMatch(JSON.stringify(selected.exam),/acceptedAnswers|\"answer\":|solutionInstructions/);
 const started=await repo.call(token,'start',code2);assert(started.draft);await assert.rejects(()=>repo.call(token,'start',code1));
 const submitted=await repo.call(token,'submit',code2,started.draft!.attemptId,{'mc-1':'A','tf-1':[true,false,true,false],'sa-1':'2.5'});assert.equal(submitted.receipts[0].score,null,'parent score remains pending without paper_scores');assert.equal((await db.query("select receipts->0->>'score' score from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2",[sid,code2])).rows[0].score,'10','original 102 auto-score is internal');assert.equal(submitted.solutionsAvailable,false);assert.doesNotMatch(JSON.stringify(submitted.exam),/acceptedAnswers|\"answer\":/);
 await db.query("update mtm_hw_private.btvn_lessons set closes_at=clock_timestamp()-interval '1 second' where code in ($1,$2)",[code1,code2]);
 assert.equal((await repo.call(token,'state',code2)).solutionsAvailable,true);
 // Existing confirmed-photo rows, same private intake, synthetic only.
 await db.query("update mtm_hw_private.monthly_uploads set opens_at=clock_timestamp()-interval '2 hours',closes_at=clock_timestamp()-interval '16 minutes' where id=$1",[created.upload_id]);
 await db.query("insert into mtm_hw_private.tu_luan_images(student_id,lesson_code,owner_id,attempt_id,sha256,bytes,page_number,storage_path,received_at,uploaded_at) values($1,$2,$3,$4,$5,800,1,'fake-private-photo.jpg',clock_timestamp(),clock_timestamp())",[sid,code2,owner,started.draft!.attemptId,'a'.repeat(64)]);
 const essay=(await call('mtm_lesson_upload_api',[{action:'monthly_worker_essay_claim'}])).job;assert(essay);assert.equal(essay.max_score,3);assert.doesNotMatch(JSON.stringify(essay),/student_id|full_name|school|phone/);
 const fence={upload_id:essay.id,claim_token:essay.claim_token};
 assert.equal((await call('mtm_lesson_upload_gateway',[{...fence,action:'monthly_worker_essay_source',sha256:'a'.repeat(64)}])).bucket,'mtm-tu-luan');
 await assert.rejects(()=>call('mtm_lesson_upload_gateway',[{...fence,action:'monthly_worker_essay_source',sha256:'b'.repeat(64)}]),/ESSAY_IMAGE_REQUIRED/);
 const grades=['grok','agy'].map((provider,i)=>({provider,model:'fixture-'+provider,request_id:'fixture-'+provider,receipt_hash:(i?'d':'c').repeat(64),submission_hash:'a'.repeat(64),rubric_hash:'b'.repeat(64),images_seen:true,max_score:3,score:i?2.26:2}));
 await assert.rejects(()=>call('mtm_lesson_upload_gateway',[{...fence,action:'monthly_worker_essay_result',result:{submission_hash:'a'.repeat(64),rubric_hash:'b'.repeat(64),reviews:grades}}]),/THIRD_ESSAY_REVIEW_REQUIRED/);
 grades.push({...grades[0],provider:'codex',request_id:'fixture-codex',receipt_hash:'e'.repeat(64)});
 assert.equal((await call('mtm_lesson_upload_gateway',[{...fence,action:'monthly_worker_essay_result',result:{submission_hash:'a'.repeat(64),rubric_hash:'b'.repeat(64),reviews:grades}}])).paper_scores_unchanged,true);
 assert.equal((await db.query('select count(*) n from mtm_hw_private.paper_scores')).rows[0].n,0);
 const actualPort=createPublishPort({}, {from(bucket:string){assert.equal(bucket,'mtm-tu-luan');return {async download(path:string){assert.equal(path,'fake-scoped-photo.jpg');return {data:new Blob([new Uint8Array([255,216,255,0,0,0,0,0])],{type:'image/jpeg'}),error:null};}};}});
 assert.equal((await actualPort.readPrivate('mtm-tu-luan','fake-scoped-photo.jpg')).content_type,'image/jpeg');
 await assert.rejects(()=>actualPort.readPrivate('public-bucket','fake-scoped-photo.jpg'),/PRIVATE_SOURCE_UNAVAILABLE/);
 console.log('Monthly SQL + local Edge: replay, QL four aliases, GV class fence, 2-code atomic publish, dashboard, RLS, before-open secrecy, 102 score10, other code lock, solutions after close.');
}finally{await db.close();}
