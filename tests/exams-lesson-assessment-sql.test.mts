/** Synthetic PGlite only. No live SQL, account, private source or provider call. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {validatePracticeExam} from '../src/native/exams/data';
import {runUploadOnce,reviewQuestions,type Pipeline} from '../server/lesson-upload/worker';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
const {db}=await baselineDatabase();let checks=0;
const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112',other='11111111-1111-4111-8111-111111111113',manager='11111111-1111-4111-8111-111111111114';
const c1='22222222-2222-4222-8222-222222222221',c2='22222222-2222-4222-8222-222222222222',c3='22222222-2222-4222-8222-222222222223';
const aid=(n:number)=>`55555555-5555-4555-8555-${String(n).padStart(12,'0')}`,request=(n:number)=>`66666666-6666-4666-8666-${String(n).padStart(12,'0')}`;
let monday:string;const day=(n:number)=>new Date(Date.parse(monday+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
async function role(name:string,uid:string|null,fn:(tx:any)=>Promise<any>){return db.transaction(async tx=>{await tx.exec('set local role '+name);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[name,uid??'']);return fn(tx);});}
const call=(p:any,who=teacher,name='authenticated')=>role(name,who,async tx=>(await tx.query('select public.mtm_lesson_upload_api($1) result',[JSON.stringify(p)])).rows[0].result);
const svc=(p:any)=>call(p,owner,'service_role');
const row=async(id:string)=>(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[id])).rows[0];
const oldHash=async(ids:string[])=>(await db.query("select encode(sha256(convert_to(jsonb_agg(jsonb_build_object('id',u.id,'version',u.version,'classes',u.class_ids,'dates',u.class_dates,'due',u.due_at_by_class,'claim',u.claim_token,'attempt',u.attempt_count,'finished',u.finished_at,'checkpoint',u.checkpoint,'current',mtm_hw_private.lesson_upload_current(u)) order by u.id)::text,'UTF8')),'hex') h from mtm_hw_private.lesson_uploads u where u.id=any($1::uuid[])",[ids])).rows[0].h;
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec("create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;alter role service_role bypassrls;grant usage on schema storage to authenticated,service_role;grant select,insert on storage.objects to authenticated,service_role;");
 for(const name of ['202611080106_btvn_han_tu_ghi.sql','202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
 monday=(await db.query("select (d-(extract(isodow from d)::int-1))::text d from (select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date d)x")).rows[0].d;
 await db.query('insert into auth.users values($1),($2),($3),($4)',[owner,teacher,other,manager]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture-owner','Quản trị giả','admin','thaythanh'),($2,'fixture-gv','GV giả','gv','thaytai'),($3,'fixture-other','GV khác giả','gv','thayhieu'),($4,'fixture-manager','Quản lý giả','ql',null)",[owner,teacher,other,manager]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$4,'2K9 9+',12),($2,$4,'2K9 8+',12),($3,$4,'2K10 XPT',11)",[c1,c2,c3,owner]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid,$3::uuid,$4::uuid])',[owner,c1,c2,c3]);
 await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) select '2K9 9+',n,'17:30','19:30','thaytai' from unnest(array[1,3,5])n;insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) select '2K9 8+',n,'17:30','19:30','thaytai' from unnest(array[2,4,6])n;insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K10 XPT',1,'17:30','19:30','thaytai')");
 const source=teacher+'/44444444-4444-4444-8444-444444444444/homework.pdf',answer=teacher+'/44444444-4444-4444-8444-444444444444/answer.pdf';
 for(const path of [source,answer])await role('authenticated',teacher,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[path]));
 const homework={action:'create',class_ids:[c1],lesson_date:monday,teacher_key:'thaytai',title:'BTVN synthetic',task_scope:'Câu1–3',homework_path:source,answer_path:answer};
 const old=[];for(const offset of [0,2,4,7,9])old.push((await call({...homework,lesson_date:day(offset)})).upload_id);
 const before=await oldHash(old);const sql=readFileSync('supabase/migrations-pending/202611130110_lesson_assessment.sql','utf8');await db.exec(sql);await db.exec(sql);checks++;
 assert.equal(await oldHash(old),before);checks++;
 const overnight=(await db.query("select mtm_hw_private.lesson_exam_window110($1::date,'23:30','01:00') w",[monday])).rows[0].w;assert.equal(Date.parse(overnight.closes_at)-Date.parse(overnight.opens_at),90*60000);assert.equal(overnight.duration_minutes,90);checks++;
 await assert.rejects(()=>db.query("select mtm_hw_private.lesson_exam_window110($1::date,'23:30','23:30')",[monday]),/INVALID_EXAM_WINDOW/);checks++;
 await assert.rejects(()=>db.query("select mtm_hw_private.lesson_exam_window110($1::date,'23:30','01:00',$2)",[monday,JSON.stringify({closes_at:monday+'T01:00:00+07:00'})]),/INVALID_EXAM_WINDOW/);checks++;
 const control=await svc({action:'worker_automation_config',enabled:true});assert.equal(control.assessment_protocol,110);assert.equal(control.runtime_readiness,true);assert.equal(control.active_leases.count,0);assert.equal(control.old_auto_eligible,0);assert(Number.isFinite(Date.parse(control.active_leases.observed_at)));const cutoff=control.automation.activated_at;assert.equal((await svc({action:'worker_heartbeat'})).assessment_protocol,110);checks++;
 const base={...homework,work_kind:'exam',exam_type:'custom',assessment_id:aid(1),client_request_id:request(1),title:'Kiểm tra riêng · tọa độ không gian'};
 const first=await call(base);assert.equal(first.work_kind,'exam');assert.equal(first.version,1);assert.equal(first.exam_config.duration_minutes,120);assert.equal((await row(first.upload_id)).class_ids.length,1);assert.deepEqual((await row(first.upload_id)).class_ids,[c1]);checks++;
 assert.equal(Date.parse(first.exam_config.opens_at),Date.parse(monday+'T17:30:00+07:00'));assert.equal(Date.parse(first.exam_config.closes_at),Date.parse(monday+'T19:30:00+07:00'));checks++;
 const replay=await call(base);assert.equal(replay.already_received,true);assert.equal(replay.upload_id,first.upload_id);assert.equal(replay.version,1);checks++;
 await assert.rejects(()=>call({...base,title:'Changed title with same request'}),/CLIENT_REQUEST_CONFLICT/);checks++;
 const distinct=await call({...base,assessment_id:aid(2),client_request_id:request(2),exam_type:'monthly',title:'Kiểm tra kết thúc tháng'});assert.equal(distinct.version,1);assert.equal((await row(first.upload_id)).assessment_id,aid(1));assert.equal((await row(distinct.upload_id)).assessment_id,aid(2));checks++;
 const edited=await call({...base,client_request_id:request(3),title:'Custom title preserved exactly',exam_config:{duration_minutes:45,opens_at:new Date(Date.now()-3600000).toISOString(),closes_at:new Date(Date.now()+3600000).toISOString()}});assert.equal(edited.version,2);assert.equal((await row(edited.upload_id)).title,'Custom title preserved exactly');assert.equal((await db.query('select mtm_hw_private.lesson_upload_current(u) v from mtm_hw_private.lesson_uploads u where id=$1',[first.upload_id])).rows[0].v,false);checks++;
 assert.equal(await oldHash(old),before);checks++;
 const managerSource=source.replace(teacher,manager),managerAnswer=answer.replace(teacher,manager);
 for(const path of [managerSource,managerAnswer])await role('authenticated',manager,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[path]));
 await assert.rejects(()=>call({...base,client_request_id:request(4),homework_path:managerSource,answer_path:managerAnswer},manager),/ASSESSMENT_OWNER_SCOPE_MISMATCH/);checks++;
 for(const invalid of [
  {...base,assessment_id:aid(9),client_request_id:request(9),class_ids:[c1,c2]},
  {...base,assessment_id:aid(9),client_request_id:request(9),exam_type:'global'},
  {...base,assessment_id:'wrong',client_request_id:request(9)},
  {...base,assessment_id:aid(9),client_request_id:request(9),work_kind:'bogus'},
  {...base,assessment_id:aid(9),client_request_id:request(9),homework2_path:source},
  {...base,assessment_id:aid(9),client_request_id:request(9),homework_path:answer},
  {...base,assessment_id:aid(9),client_request_id:request(9),exam_config:{duration_minutes:241}},
  {...base,assessment_id:aid(9),client_request_id:request(9),exam_config:{duration_minutes:45,opens_at:monday+'T17:30:00+07:00',closes_at:monday+'T18:00:00+07:00'}},
  {...base,assessment_id:aid(9),client_request_id:request(9),exam_config:{duration_minutes:'45'}},
  {...base,assessment_id:aid(9),client_request_id:request(9),exam_config:{unknown:true}}
 ]){await assert.rejects(()=>call(invalid));checks++;}
 await assert.rejects(()=>call({...base,assessment_id:aid(10),client_request_id:request(10)},other),/OTHER_TEACHER/);checks++;
 await assert.rejects(()=>call({...base,assessment_id:aid(10),client_request_id:request(10),is_test:true}),/MANAGER_REQUIRED/);checks++;
 // A worker408 only receives a new homework. It never receives either exam.
 const freshHomework=await call({...homework,class_ids:[c3],work_kind:'homework',client_request_id:request(20)});
 const oldWorker=(await svc({action:'worker_claim',worker_id:'legacy408',auto:true})).job;assert.equal(oldWorker.id,freshHomework.upload_id);assert.equal(oldWorker.work_kind,'homework');checks++;
 assert.equal((await svc({action:'worker_claim',worker_id:'legacy408',auto:true})).job,null);checks++;
 for(const protocol of [109,111,'110',null,{}]){await assert.rejects(()=>svc({action:'worker_claim',worker_id:'wrong-protocol',auto:true,worker_protocol:protocol}),/UNSUPPORTED_WORKER_PROTOCOL/);checks++;}
 const job=(await svc({action:'worker_claim',worker_id:'protocol110',auto:true,worker_protocol:110})).job;assert.equal(job.id,distinct.upload_id);assert.equal(job.work_kind,'exam');assert.equal(job.exam_type,'monthly');assert.equal(job.exam_config.duration_minutes,120);assert.equal((await svc({action:'worker_automation_config'})).active_leases.count,2);checks++;
 const wait={action:'worker_wait_review',upload_id:job.id,claim_token:job.claim_token,paper:1,request_hash:'b'.repeat(64),source_version:'c'.repeat(64)};
 await db.query("insert into mtm_hw_private.lesson_review_requests(upload_id,paper,request_hash,source_version,requested_at) values($1,1,$2,$3,clock_timestamp()-interval '25 minutes')",[job.id,'b'.repeat(64),'c'.repeat(64)]);
 assert.equal((await svc(wait)).allowed,false);assert.equal((await row(job.id)).attempt_count,0);assert.equal((await svc(wait)).allowed,false);assert.equal((await row(job.id)).attempt_count,0);checks++;
 const fakePending={status:'teacher-pending',independent:false,teacher_source:true,request_hash:'b'.repeat(64)};
 assert.equal((await db.query('select mtm_hw_private.lesson_teacher_pending_allowed(u,$2,$3,1) allowed from mtm_hw_private.lesson_uploads u where id=$1',[job.id,JSON.stringify(fakePending),'c'.repeat(64)])).rows[0].allowed,false);checks++;
 for(const step of [2,3,4,5])await svc({action:'worker_checkpoint',upload_id:job.id,claim_token:job.claim_token,step,status:'xong',checkpoint:{}});
 const fixture=pipelineFixture(),stored=await row(job.id),code='web-'+job.id.replaceAll('-','');fixture.exam.title=stored.title;fixture.exam.durationMinutes=stored.exam_duration_minutes;fixture.exam.versionHash='c'.repeat(64);assert.equal(validatePracticeExam(fixture.exam).valid,true);checks++;
 const assets=[];for(const asset of fixture.assets){const bytes=Buffer.from(asset.data_base64,'base64');const path=`btvn/${code}/${fixture.source_version}/${asset.path}`;await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mtm-btvn',path,JSON.stringify({mimetype:asset.content_type,size:bytes.length})]);assets.push({path:asset.path,sha256:asset.sha256,content_type:asset.content_type,bytes:bytes.length,storage_path:path});}
 const payload={kind:'kiem-tra',assessmentId:stored.assessment_id,examType:stored.exam_type,opensAt:stored.exam_opens_at.toISOString(),closesAt:stored.exam_closes_at.toISOString(),lesson_key:code,source_version:fixture.source_version,exam:fixture.exam,assets,material:{lessonCode:code,title:stored.title,classNames:['2K9 9+'],classDates:{'2K9 9+':monday},date:monday},verification:{...fixture.verification,provider:'grok',model:'grok-synthetic',extractor_provider:'codex'}};
 const publish=(value:any)=>svc({action:'worker_publish',upload_id:job.id,claim_token:job.claim_token,payload:value});
 await assert.rejects(()=>role('mtm_btvn_publisher',null,tx=>tx.query("select public.mtm_btvn_pipeline('publish',$1)",[JSON.stringify(payload)])),/ASSESSMENT_PUBLISH_CAPABILITY_REQUIRED/);checks++;
 for(const modified of [{...payload,title:'wrong',material:{...payload.material,title:'wrong'}},{...payload,kind:'btvn'},{...payload,assessmentId:aid(90)},{...payload,examType:'custom'},{...payload,exam:{...payload.exam,durationMinutes:45}},{...payload,closesAt:new Date(stored.exam_closes_at.getTime()+60000).toISOString()},{...payload,verification:{...payload.verification,independent:false,status:'teacher-pending'}},{...payload,material:{...payload.material,classNames:['2K9 8+']}}]){await assert.rejects(()=>publish(modified));checks++;}
 assert.equal((await db.query('select count(*) n from mtm_hw_private.lesson_publish_capability')).rows[0].n,0);checks++;
 assert.equal((await publish(payload)).ok,true);checks++;
 const canonical=(await db.query('select * from mtm_hw_private.btvn_lessons where code=$1',[code])).rows[0];assert.equal(canonical.kind,'kiem-tra');assert.equal(canonical.assessment_id,stored.assessment_id);assert.equal(canonical.material.title,stored.title);assert.equal(canonical.material.maxAttempts,1);assert.equal(canonical.is_test,false);checks++;
 assert.equal((await publish(payload)).already_applied,true);assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_lessons where code=$1',[code])).rows[0].n,1);checks++;
 await svc({action:'worker_checkpoint',upload_id:job.id,claim_token:job.claim_token,step:6,status:'xong',checkpoint:{}});await svc({action:'worker_finish',upload_id:job.id,claim_token:job.claim_token});
 assert.equal((await svc({action:'worker_pending_review',auto:true})).job,null);checks++;
 const pending=(await svc({action:'worker_pending_review',auto:true,worker_protocol:110})).job;assert.equal(pending.id,job.id);assert.equal(pending.exam_config.duration_minutes,120);assert.equal(Date.parse(pending.exam_config.opens_at),stored.exam_opens_at.getTime());checks++;
 // Exercise the real TypeScript worker/repository and BOTH validator passes,
 // with a deterministic in-memory source/provider. This is not a live AI call.
 const stateMap=new Map<string,unknown>(),assetMap=new Map<string,Uint8Array>();let builtFor45=false,rpcError:any;
 const dbClient={async rpc(_name:string,{p}:any){try{return {data:await svc(p),error:null};}catch(e:any){rpcError={message:e.message,where:e.where};return {data:null,error:{message:e.message,code:e.code}};}},storage:{from(bucket:string){return {async upload(path:string,bytes:Uint8Array,opts:any){await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,JSON.stringify({mimetype:opts.contentType,size:bytes.length})]);assetMap.set(path,bytes);return {error:null};},async download(path:string){return {data:assetMap.has(path)?new Blob([assetMap.get(path)!]):null,error:null};}};}}};
 const actualFixture=pipelineFixture();actualFixture.exam.title='Custom title preserved exactly';actualFixture.exam.durationMinutes=45;actualFixture.exam.versionHash='c'.repeat(64);
 const student='33333333-3333-4333-8333-333333333331',session='a'.repeat(64),studentCode='web-'+edited.upload_id.replaceAll('-','');
 await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,created_at) values($1,$2,$3,'Học sinh tổng hợp QA','Trường tổng hợp','Lớp tổng hợp','MTM-000000000001',current_date-30)",[student,owner,c1]);
 await db.query("insert into mtm_hw_private.btvn_identity_sessions(student_id,digest,expires_at) values($1,mtm_hw_private.token_digest('btvn-identity',$2),clock_timestamp()+interval '1 day')",[student,session]);
 const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic-only'},async read(claimed){assert.equal(claimed.id,edited.upload_id);assert.equal(claimed.work_kind,'exam');assert.equal(claimed.exam_config?.duration_minutes,45);return {sourceVersion:'c'.repeat(64),questions:reviewQuestions(actualFixture.exam),teacherSlots:actualFixture.verification.slots,privateAnswerHashes:['9'.repeat(64)]};},async build(claimed){assert.equal(claimed.exam_config?.duration_minutes,45);builtFor45=true;return {exam:actualFixture.exam,assets:actualFixture.assets};},async review(){return {provider:'grok',model:'grok-synthetic-only',receipt_hash:'d'.repeat(64),slots:actualFixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const state={async save(id:string,stage:string,value:unknown){const ref=id+'/'+stage;stateMap.set(ref,structuredClone(value));return ref;},async load(ref:string){return structuredClone(stateMap.get(ref));}};
 const actual=await runUploadOnce(createWorkerRepository(dbClient,{auto:true}),pipeline,state,'synthetic-protocol110');assert.equal(actual.status,'complete',JSON.stringify({actual,rpcError}));assert.equal(builtFor45,true);checks++;
 const stored45=(await db.query('select * from mtm_hw_private.btvn_lessons where code=$1',['web-'+edited.upload_id.replaceAll('-','')])).rows[0];assert.equal(stored45.kind,'kiem-tra');assert.equal(stored45.exam.durationMinutes,45);assert.equal(stored45.exam.title,'Custom title preserved exactly');assert.equal(stored45.material.assessmentId,aid(1));assert.equal(stored45.material.classNames.length,1);assert.equal((await row(edited.upload_id)).retry_status,'complete');checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].n,0);checks++;
 const studentTransport={async rpc(name:string,args:any){try{const entries=Object.entries(args);const data=await role('service_role',null,async tx=>(await tx.query(`select public.${name==='mtm_btvn_read'?'mtm_btvn_two_paper_read':name}(${entries.map(([k],i)=>k+' => $'+(i+1)).join(',')}) result`,entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].result);return {data,error:null};}catch(e:any){return {data:null,error:{code:e.code,message:e.message}};}}};
 const studentRepo=new SupabaseHomeworkRepository(studentTransport,async()=>({ok:false}),Date.now,async(path:string)=>'https://fixture.invalid/signed/'+path);
 const room=await studentRepo.call(session,'state',studentCode);assert.equal(room.kind,'kiem-tra');assert.equal(room.maxAttempts,1);assert(room.lessons?.some(l=>l.lessonCode===studentCode));assert.equal(room.exam?.durationMinutes,45);assert.equal(room.exam?.title,'Custom title preserved exactly');assert.equal(room.solutionsAvailable,false);assert.equal((room.exam!.questions[0] as any).answer,undefined);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].n,1);checks++;
 // Match a synthetic attendance row so this exercises the real reconciliation
 // loop, rather than obtaining a vacuous no-op from an unmatched student.
 const peer='33333333-3333-4333-8333-333333333332';await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,created_at) values($1,$2,$3,'Học sinh tổng hợp QA khác','Trường tổng hợp','Lớp tổng hợp','MTM-000000000002',current_date-30)",[peer,owner,c1]);
 await db.query("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids,synced_class_ids) values(true,$1,'synthetic-only',array[$2::uuid,$3::uuid],array[$4::uuid])",[owner,student,peer,c1]);
 await db.query("update mtm_hw_private.students set student_phone='0900000001' where id=$1",[student]);
 const beforeDue=(await db.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].value;
 const sync={sessions:[{label:'2K9 9+',startsAt:day(7)+'T17:30:00+07:00',sourceIdentity:'synthetic-attendance-only',attendees:[{name:'Học sinh tổng hợp QA',phone:'0900000001',status:'P'}]}]};
 const synced=await role('service_role',null,async tx=>(await tx.query('select public.mtm_btvn_sync_due($1,true) result',[JSON.stringify(sync)])).rows[0].result);assert.equal(synced.matchedStudents,1);assert.equal(synced.receiptsChanged,0);assert.deepEqual((await db.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].value,beforeDue);checks++;
 await db.query('insert into public.mtm_exam_admins(user_id) values($1)',[owner]);
 await assert.rejects(()=>role('authenticated',owner,tx=>tx.query('select public.mtm_btvn_set_due($1,$2,clock_timestamp()+interval \'1 day\',\'synthetic-only\')',[student,studentCode])),/ASSESSMENT_NOT_HOMEWORK_DEADLINE/);assert.deepEqual((await db.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].value,beforeDue);checks++;
 // Interleaving race: create a replacement while v1 remains available, then a
 // student starts the old source before the replacement AI finishes. Publish
 // must not deactivate that active attempt. Both paths share assessment lock.
 const replacement=await call({...base,client_request_id:request(30),title:'Interleaving replacement',exam_config:{duration_minutes:45,opens_at:(await row(edited.upload_id)).exam_opens_at.toISOString(),closes_at:(await row(edited.upload_id)).exam_closes_at.toISOString()}});
 const started=await studentRepo.call(session,'start',studentCode);assert(started.draft);assert.equal(started.draft.submittedAt,null);checks++;
 const startedWork=(await db.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].value;
 const replacementJob=(await svc({action:'worker_claim',worker_id:'replacement-race',auto:true,worker_protocol:110})).job;assert.equal(replacementJob.id,replacement.upload_id);
 for(const step of [2,3,4,5])await svc({action:'worker_checkpoint',upload_id:replacementJob.id,claim_token:replacementJob.claim_token,step,status:'xong',checkpoint:{}});
 const replacementCode='web-'+replacementJob.id.replaceAll('-',''),replacementFixture=pipelineFixture();replacementFixture.exam.title='Interleaving replacement';replacementFixture.exam.durationMinutes=45;replacementFixture.exam.versionHash='c'.repeat(64);
 const replacementAssets=[];for(const asset of replacementFixture.assets){const bytes=Buffer.from(asset.data_base64,'base64'),path=`btvn/${replacementCode}/c${'c'.repeat(63)}/${asset.path}`;await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mtm-btvn',path,JSON.stringify({mimetype:asset.content_type,size:bytes.length})]);replacementAssets.push({path:asset.path,sha256:asset.sha256,content_type:asset.content_type,bytes:bytes.length,storage_path:path});}
 const replacementPayload={...payload,assessmentId:aid(1),examType:'custom',lesson_key:replacementCode,opensAt:replacementJob.exam_config.opens_at,closesAt:replacementJob.exam_config.closes_at,exam:replacementFixture.exam,assets:replacementAssets,material:{...payload.material,lessonCode:replacementCode,title:'Interleaving replacement'}};
 await assert.rejects(()=>svc({action:'worker_publish',upload_id:replacementJob.id,claim_token:replacementJob.claim_token,payload:replacementPayload}),/ASSESSMENT_ALREADY_STARTED/);assert.equal((await db.query('select active from mtm_hw_private.btvn_lessons where code=$1',[studentCode])).rows[0].active,true);assert.deepEqual((await db.query('select to_jsonb(w) value from mtm_hw_private.btvn_work w where student_id=$1 and lesson_code=$2',[student,studentCode])).rows[0].value,startedWork);assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_lessons where code=$1',[replacementCode])).rows[0].n,0);checks++;
 assert.equal(await oldHash(old),before);assert.equal((await svc({action:'worker_automation_config'})).automation.activated_at,cutoff);checks++;
 const dashboard=await call({action:'dashboard',from:monday,to:day(6)});assert.equal(dashboard.assessment_protocol,110);assert.equal(dashboard.sessions.find((s:any)=>s.class_id===c1&&s.lesson_date===monday).exam_defaults.duration_minutes,120);assert.deepEqual(dashboard.uploads.find((u:any)=>u.id===job.id).warnings,[]);checks++;
 await assert.rejects(()=>svc({action:'worker_web_precedence',enabled:true}),/LIVE_WEB_RECEIPT_REQUIRED/);checks++;
 await db.query("update mtm_hw_private.lesson_uploads set retry_requested_at=clock_timestamp() where id=$1",[old[0]]);assert.equal((await svc({action:'worker_automation_config'})).old_auto_eligible,1);checks++;
 await db.query('update mtm_hw_private.lesson_uploads set retry_requested_at=null where id=$1',[old[0]]);assert.equal((await svc({action:'worker_automation_config'})).old_auto_eligible,0);assert.equal(await oldHash(old),before);checks++;
 console.log(`${checks} assessment SQL checks: create/idempotency/stable-lane/old5/protocol408-v110/capability/source-title-window/positivefixture/publication/control PASS; PGlite only.`);
}finally{await db.close();}
