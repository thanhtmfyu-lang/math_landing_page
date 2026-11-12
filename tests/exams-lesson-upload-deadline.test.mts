import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {nextWeekDue,validateUploadDeadlines,runUploadOnce,reviewQuestions,type UploadJob,type Pipeline} from '../server/lesson-upload/worker';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {expectedSlots} from '../server/btvn/publish-handler';
import {pipelineFixture} from './btvn-pipeline-fixture';

let checks=0;
const legacy={class_ids:['a','b'],class_dates:{a:'2026-11-09',b:'2026-11-10'},start_times:{a:'17:30',b:'17:30'},end_times:{a:'19:30',b:'19:30'},due_at_by_class:{a:nextWeekDue('2026-11-09','17:30'),b:nextWeekDue('2026-11-10','17:30')}} as UploadJob;
validateUploadDeadlines(legacy);checks++;
const custom={...legacy,due_at_by_class:{...legacy.due_at_by_class,a:'2026-11-12T20:00:00+07:00'},due_at_overrides:{a:'2026-11-12T20:00:00+07:00'}};
validateUploadDeadlines(custom);checks++;
for(const invalid of [
 {...legacy,due_at_by_class:{...legacy.due_at_by_class,a:legacy.due_at_by_class.b}},
 {...custom,due_at_by_class:{...custom.due_at_by_class,a:'2026-11-13T13:00:00Z'}},
 {...custom,due_at_overrides:{a:'2026-11-09T19:30:00+07:00'},due_at_by_class:{...custom.due_at_by_class,a:'2026-11-09T19:30:00+07:00'}},
 {...custom,due_at_overrides:{a:'2027-02-30T20:00:00+07:00'},due_at_by_class:{...custom.due_at_by_class,a:'2027-02-30T20:00:00+07:00'}},
 {...custom,due_at_overrides:{a:'2026-11-12T20:00'},due_at_by_class:{...custom.due_at_by_class,a:'2026-11-12T20:00'}},
 {...custom,due_at_overrides:{outside:'2026-11-12T20:00:00+07:00'}},
 {...legacy,due_at_by_class:{...legacy.due_at_by_class,outside:'2026-11-12T20:00:00+07:00'}},
 {...custom,end_times:undefined},
]){assert.throws(()=>validateUploadDeadlines(invalid));checks++;}

const {db}=await baselineDatabase();
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 alter role service_role bypassrls;
 grant usage on schema storage to service_role,authenticated;
 grant select,insert on storage.objects to service_role,authenticated;`);
 for(const name of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
 await db.exec(readFileSync('supabase/migrations-pending/202611120107_lesson_upload_deadline.sql','utf8'));checks++;
 const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112',outsider='11111111-1111-4111-8111-111111111113';
 const c1='22222222-2222-4222-8222-222222222221',c2='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333';
 const calendar=(await db.query(`select (d-(extract(isodow from d)::int-1))::text monday from (select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date d) x`)).rows[0];
 const monday=calendar.monday,tuesday=new Date(Date.parse(monday+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 await db.query('insert into auth.users values($1),($2),($3)',[owner,teacher,outsider]);
 await db.query(`insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values
 ($1,'fixture-manager','Quản lý giả','admin','thaythanh'),($2,'fixture-teacher','Giáo viên giả','gv','thaytai'),($3,'fixture-other','Giáo viên khác giả','gv','thayhieu')`,[owner,teacher,outsider]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$3,'2K9 9+',12),($2,$3,'2K9 8+',12)",[c1,c2,owner]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid,$3::uuid])',[owner,c1,c2]);
 await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K9 9+',1,'17:30','19:30','thaytai'),('2K9 8+',2,'17:30','19:30','thaytai')");
 await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Học sinh giả local','Trường giả','12 giả','MTM-000000000001')",[sid,owner,c1]);
 async function asRole(role:string,uid:string|undefined,fn:(tx:any)=>Promise<any>){return db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,uid??'']);return fn(tx);});}
 async function call(p:Record<string,unknown>,role='authenticated',uid=teacher){return asRole(role,uid,async tx=>(await tx.query('select public.mtm_lesson_upload_api($1) result',[JSON.stringify(p)])).rows[0].result);}
 const source=teacher+'/44444444-4444-4444-8444-444444444444/homework.pdf';
 await asRole('authenticated',teacher,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[source]));
 const base={action:'create',class_ids:[c1],lesson_date:monday,teacher_key:'thaytai',title:'Synthetic deadline only',task_scope:'Câu 1–3',homework_path:source,answer_text:'1D; ĐS ĐSĐS; TLN 2.5'};
 const defaultUpload=await call(base);checks++;
 const defaultRow=(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[defaultUpload.upload_id])).rows[0];
 assert.equal(Date.parse(defaultRow.due_at_by_class[c1]),Date.parse(nextWeekDue(monday,'17:30')));assert.equal(Date.parse(defaultRow.due_at_by_class[c2]),Date.parse(nextWeekDue(tuesday,'17:30')));assert.deepEqual(defaultRow.due_at_overrides,{});checks++;
 const fullDefault=await call({...base,due_at_by_class:{[c1]:nextWeekDue(monday,'17:30'),[c2]:nextWeekDue(tuesday,'17:30')}});
 assert.deepEqual((await db.query('select due_at_overrides from mtm_hw_private.lesson_uploads where id=$1',[fullDefault.upload_id])).rows[0].due_at_overrides,{});checks++;
 const chosen=new Date(Date.parse(monday+'T20:00:00+07:00')+3*86400000).toISOString();
 const before=(await db.query('select count(*) n from mtm_hw_private.lesson_uploads')).rows[0].n;
 for(const due_at_by_class of [null,[],{outside:chosen},{[c1]:'2027-02-30T20:00:00+07:00'},{[c1]:monday+'T19:30:00+07:00'},{[c1]:monday+'T19:29:59+07:00'},{[c1]:'infinity'},{[c1]:monday+'T20:00'},{[c1]:23}]){
  await assert.rejects(()=>call({...base,due_at_by_class}),/INVALID_HOMEWORK_DEADLINE|CLASS_SCOPE_MISMATCH/);checks++;
 }
 assert.equal((await db.query('select count(*) n from mtm_hw_private.lesson_uploads')).rows[0].n,before);checks++;
 await assert.rejects(()=>call({...base,due_at_overrides:{[c1]:chosen}}),/INVALID_HOMEWORK_DEADLINE/);checks++;
 for(const client_request_id of [null,'',23,'not-a-uuid']){await assert.rejects(()=>call({...base,client_request_id}),/INVALID_CLIENT_REQUEST_ID/);checks++;}
 await assert.rejects(()=>call({...base,due_at_by_class:{[c1]:chosen}},'authenticated',outsider),/OTHER_TEACHER/);checks++;
 await assert.rejects(()=>call({...base,class_ids:[c1,outsider],due_at_by_class:{[c1]:chosen}}),/CLASS_SCOPE_MISMATCH/);checks++;
 const request={...base,due_at_by_class:{[c1]:chosen},client_request_id:'55555555-5555-4555-8555-555555555555'};
 const uploaded=await call(request);checks++;
 const replay=await call(request);assert.equal(replay.already_received,true);assert.equal(replay.upload_id,uploaded.upload_id);assert.equal(replay.version,uploaded.version);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.lesson_uploads where uploaded_by=$1 and client_request_id=$2',[teacher,request.client_request_id])).rows[0].n,1);checks++;
 await assert.rejects(()=>call({...request,task_scope:'Câu 2–3'}),/CLIENT_REQUEST_CONFLICT/);checks++;
 await assert.rejects(()=>call({...request,due_at_by_class:{[c1]:new Date(Date.parse(chosen)+60000).toISOString()}}),/CLIENT_REQUEST_CONFLICT/);checks++;
 await db.query('update public.mtm_staff set active=false where user_id=$1',[teacher]);
 await assert.rejects(()=>call(request),/STAFF_REQUIRED/);checks++;
 await db.query('update public.mtm_staff set active=true,must_change_password=true where user_id=$1',[teacher]);
 await assert.rejects(()=>call(request),/PASSWORD_CHANGE_REQUIRED/);checks++;
 await db.query('update public.mtm_staff set must_change_password=false where user_id=$1',[teacher]);
 const row=(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[uploaded.upload_id])).rows[0];
 assert.equal(Date.parse(row.due_at_by_class[c1]),Date.parse(chosen));assert.equal(Date.parse(row.due_at_by_class[c2]),Date.parse(nextWeekDue(tuesday,'17:30')));assert.deepEqual(Object.keys(row.due_at_overrides),[c1]);checks++;
 const dash=await call({action:'dashboard',from:monday,to:tuesday});
 assert.equal(Date.parse(dash.uploads.find((u:any)=>u.id===uploaded.upload_id).due_at_by_class[c1]),Date.parse(chosen));checks++;
 await asRole('authenticated',teacher,async tx=>{await assert.rejects(()=>tx.exec('select due_at_overrides from mtm_hw_private.lesson_uploads'),/permission denied/);});checks++;
 // Run actual worker + production validator + fenced SQL publisher. Both classes
 // retain separate deadlines and the student work row reads the custom value.
 const fixture=pipelineFixture(),states=new Map<string,unknown>(),stored=new Map<string,Uint8Array>();let rpcError:any;
 const client={async rpc(_name:string,{p}:any){try{return {data:await call(p,'service_role',undefined as any),error:null};}catch(e:any){rpcError=e.message;return {data:null,error:{message:e.message,code:e.code}};}},storage:{from(bucket:string){return {
  async upload(path:string,bytes:Uint8Array,options:any){try{await asRole('service_role',undefined,tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,JSON.stringify({mimetype:options.contentType,size:bytes.length})]));stored.set(path,bytes);return {error:null};}catch(error){return {error};}},
  async download(path:string){return {data:stored.has(path)?new Blob([stored.get(path)!]):null,error:null};}
 };}}};
 const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic'},async read(){return {sourceVersion:'c'.repeat(64),questions:reviewQuestions(fixture.exam),teacherSlots:expectedSlots(fixture.exam),privateAnswerHashes:['e'.repeat(64)]};},async build(){return {exam:fixture.exam,assets:fixture.assets};},async review(){return {provider:'grok',model:'synthetic',receipt_hash:'d'.repeat(64),slots:fixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const state={async save(id:string,stage:string,value:unknown){const key=id+'/'+stage;states.set(key,structuredClone(value));return key;},async load(key:string){return structuredClone(states.get(key));}};
 const result=await runUploadOnce(createWorkerRepository(client),pipeline,state,'synthetic-deadline');assert.equal(result.status,'complete',JSON.stringify({result,rpcError}));checks++;
 const code='web-'+uploaded.upload_id.replaceAll('-','');
 const lesson=(await db.query('select material from mtm_hw_private.btvn_lessons where code=$1',[code])).rows[0];assert.equal(Date.parse(lesson.material.classOpensAt['2K9 9+']),Date.parse(monday+'T19:30:00+07:00'));checks++;
 const actual=(await db.query('select mtm_hw_private.lesson_web_due($1,$2) due',[sid,code])).rows[0].due;assert.equal(new Date(actual).getTime(),Date.parse(chosen));checks++;
 await db.query('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$2) on conflict do nothing',[sid,code]);
 const work=(await db.query('select expected_due_at from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0];assert.equal(new Date(work.expected_due_at).getTime(),Date.parse(chosen));checks++;
 assert.equal((await runUploadOnce(createWorkerRepository(client),pipeline,state,'synthetic-deadline')).status,'idle');checks++;
 // Later upload keeps the published version's deadline and work untouched.
 await call({...base,due_at_by_class:{[c1]:new Date(Date.parse(chosen)+86400000).toISOString()}});
 assert.equal(new Date((await db.query('select expected_due_at from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0].expected_due_at).getTime(),Date.parse(chosen));checks++;
 const lateReplay=await call(request);assert.equal(lateReplay.upload_id,uploaded.upload_id);assert.equal(lateReplay.version,uploaded.version);checks++;
}finally{await db.close();}
console.log(`${checks} ca hạn BTVN: map theo lớp, phân quyền/rollback, mặc định cũ, worker thật + SQL publish + hạn học sinh: đạt; dữ liệu giả, không mạng.`);
