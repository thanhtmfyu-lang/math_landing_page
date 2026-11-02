import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=process.env.MTM_PGLITE_MODULE?await import(pathToFileURL(process.env.MTM_PGLITE_MODULE).href):await import('@electric-sql/pglite');
const db=new PGlite();let checks=0;
// PGlite 0.2.17's bundled pgcrypto cannot load EVP_bf_cbc. This isolated
// namespace tests seed invocation/uniqueness and Auth trigger semantics ONLY;
// its digest is NOT bcrypt and must never be used in a deployed database.
await db.exec(`create schema fixture_crypto;
create function fixture_crypto.gen_random_bytes(n int) returns bytea language sql volatile as $$select sha256(convert_to(gen_random_uuid()::text,'UTF8'))$$;
create function fixture_crypto.gen_salt(t text,n int) returns text language sql volatile as $$select gen_random_uuid()::text$$;
create function fixture_crypto.crypt(p text,s text) returns text language sql volatile as $$select encode(sha256(convert_to(p||s,'UTF8')),'hex')$$;`);
await db.exec(`create role anon;create role authenticated;create role service_role;create role mtm_btvn_publisher;
create schema auth;create schema storage;create schema mtm_hw_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create table auth.users(instance_id uuid,id uuid primary key,aud text,role text,email text unique,encrypted_password text,email_confirmed_at timestamptz,
 raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz,confirmation_token text,recovery_token text,
 email_change_token_new text,email_change text,email_change_token_current text,phone_change text,phone_change_token text,reauthentication_token text);
create table auth.identities(id uuid,provider_id text,user_id uuid,identity_data jsonb,provider text,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',created_at timestamptz default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;grant usage on schema public,auth,storage to authenticated,anon,service_role;
grant select,insert on storage.objects to authenticated,anon;
create table mtm_hw_private.classes(id uuid primary key,label text,active boolean default true,owner_id uuid);
create table mtm_hw_private.btvn_publish_scope(singleton boolean,owner_id uuid,class_ids uuid[]);
create table mtm_hw_private.timetable(class_label text,weekday int,start_hm text,end_hm text,teacher text,mode text,updated_at timestamptz);
create table mtm_hw_private.btvn_lessons(code text primary key,class_ids uuid[],material jsonb,exam jsonb,active boolean,publish_status text,kind text default 'btvn',updated_at timestamptz default now(),is_test boolean not null default false);
create table mtm_hw_private.students(id uuid primary key,class_id uuid,is_test boolean not null default false);
create table mtm_hw_private.btvn_work(student_id uuid,lesson_code text,expected_due_at timestamptz,next_actual_class_at timestamptz);
create function mtm_hw_private.btvn_schedule_planned_due(uuid,text) returns timestamptz language sql as $$select null::timestamptz$$;
create function mtm_hw_private.btvn_override_due_before_schedule066(uuid,text) returns timestamptz language sql as $$select null::timestamptz$$;
create table public.mtm_exam_admins(user_id uuid);
create function public.mtm_btvn_pipeline(text,jsonb) returns jsonb language plpgsql security definer as $$begin
 if $1='publish' then
  if $2->'verification'->>'independent'<>'true' then raise exception 'Verification required';end if;
  insert into mtm_hw_private.btvn_lessons(code,class_ids,material,exam,active,publish_status)
   select $2->>'lesson_key',array_agg(c.id),$2->'material',$2->'exam',true,'da_dang'
   from mtm_hw_private.classes c where c.label in (select jsonb_array_elements_text($2->'material'->'classNames'));
  return '{"status":"da_dang"}'::jsonb;
 elsif $1='update_material' then
  update mtm_hw_private.btvn_lessons set material=material||($2->'material') where code=$2->>'lesson_key';return '{"status":"updated"}'::jsonb;
 end if;
 return '{}'::jsonb;
end$$;
revoke all on function public.mtm_btvn_pipeline(text,jsonb) from public;
grant execute on function public.mtm_btvn_pipeline(text,jsonb) to mtm_btvn_publisher;`);
const root=process.env.MTM_ROOT!;
const productionSql=readFileSync(root+'/supabase/migrations-pending/202611020101_cong_up_btvn_gv.sql','utf8');
assert(productionSql.includes("%1$I.crypt(encode(%1$I.gen_random_bytes(32),'hex'),%1$I.gen_salt('bf',12))"));checks++;
assert(!/\$2[aby]\$\d{2}\$/.test(productionSql));checks++;
const sql=productionSql.replace("select n.nspname into crypto_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'","select 'fixture_crypto' into crypto_schema");
await db.exec(sql);checks++;
assert.equal((await db.query('select count(*) n from public.mtm_staff')).rows[0].n,8);checks++;
assert.equal((await db.query('select count(*) n from public.mtm_exam_admins')).rows[0].n,0);checks++;
assert.equal((await db.query('select count(*) n from public.mtm_staff where must_change_password')).rows[0].n,8);checks++;
assert.equal((await db.query('select count(distinct encrypted_password) n from auth.users')).rows[0].n,8);checks++;

const staff=Object.fromEntries((await db.query('select user_id,short_name from public.mtm_staff')).rows.map((r:any)=>[r.short_name,r.user_id]));
await db.query("update auth.users set encrypted_password='fixture-existing-password' where id=$1",[staff.thaytai]);
await db.exec(sql);checks++;
assert.equal((await db.query('select encrypted_password from auth.users where id=$1',[staff.thaytai])).rows[0].encrypted_password,'fixture-existing-password');checks++;
assert.equal((await db.query('select count(*) n from auth.identities')).rows[0].n,8);checks++;
assert.equal((await db.query("select public from storage.buckets where id='mtm-lesson-private'")).rows[0].public,false);checks++;
const cid='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',junior='10000000-0000-4000-8000-000000000003',unknown='10000000-0000-4000-8000-000000000004';
const pairA='10000000-0000-4000-8000-000000000005',pairB='10000000-0000-4000-8000-000000000006';
await db.exec(`insert into mtm_hw_private.classes(id,label) values('${cid}','2K10 9+'),('${other}','2K11'),('${junior}','2K14'),('${unknown}','HSA'),('${pairA}','2K9 9+'),('${pairB}','2K9 8+');
insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values
 ('2K10 9+',1,'17:30','19:30','Trần Thanh Anh Tài'),('2K11',1,'19:30','21:30','Trần Đức Hiếu'),
 ('2K14',1,'17:30','19:30','Nguyễn Duy Hoàng'),('HSA',1,'17:30','19:30','Unknown teacher'),
 ('2K9 9+',1,'17:30','19:30','Thầy Thành'),('2K9 8+',2,'19:30','21:30','Thầy Thành');`);
await db.query('update mtm_hw_private.classes set owner_id=$1',[staff.thaythanh]);
await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,$2)',[staff.thaythanh,[cid,other,junior,unknown,pairA,pairB]]);
async function asRole(role:string,uid:string|undefined,fn:(tx:any)=>Promise<any>){return db.transaction(async(tx:any)=>{
 await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,uid??'']);return fn(tx);
});}
async function rpc(p:any,who='thaytai',role='authenticated'){return asRole(role,staff[who],async(tx:any)=>(await tx.query('select public.mtm_lesson_upload_api($1) result',[JSON.stringify(p)])).rows[0].result);}
// Dedicated Password V2 assertions use the actual seeded locked accounts.
const locked='thayhieu';
await assert.rejects(()=>rpc({action:'dashboard'},locked),/PASSWORD_CHANGE_REQUIRED/);checks++;
assert.equal((await asRole('authenticated',staff[locked],tx=>tx.query('select public.mtm_lesson_storage_access($1,true) allowed',[staff[locked]+'/20000000-0000-4000-8000-000000000099/homework.pdf']))).rows[0].allowed,false);checks++;
await assert.rejects(()=>asRole('authenticated',staff.hang,tx=>tx.query('select public.mtm_staff_password_roster()')),/MANAGER_REQUIRED/);checks++;
await assert.rejects(()=>asRole('authenticated',staff.hang,tx=>tx.query('update public.mtm_staff set must_change_password=false')));checks++;
await db.query("update auth.users set raw_user_meta_data='{\"must_change_password\":false}' where id=$1",[staff[locked]]);
assert.equal((await db.query('select must_change_password flag from public.mtm_staff where user_id=$1',[staff[locked]])).rows[0].flag,true);checks++;
await db.query('update auth.users set encrypted_password=encrypted_password where id=$1',[staff[locked]]);
assert.equal((await db.query('select must_change_password flag from public.mtm_staff where user_id=$1',[staff[locked]])).rows[0].flag,true);checks++;
// Simulate Auth writing new bcrypt hashes; the AFTER UPDATE trigger unlocks.
await db.exec("update auth.users set encrypted_password=fixture_crypto.crypt('synthetic-fixture-only-new-secret',fixture_crypto.gen_salt('bf',4))");
assert.equal((await db.query('select count(*) n from public.mtm_staff where must_change_password')).rows[0].n,0);checks++;
await assert.rejects(()=>asRole('authenticated',staff.hang,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2)',[staff.hang,staff[locked]])));checks++;
await assert.rejects(()=>asRole('service_role',undefined,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2)',[staff.thaytai,staff[locked]])),/MANAGER_REQUIRED/);checks++;
await assert.rejects(()=>asRole('service_role',undefined,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2)',[staff.hang,staff[locked]])),/REGISTERED_EMAIL_REQUIRED/);checks++;
await db.query('update public.mtm_staff set recovery_email=$1,recovery_email_verified_at=now() where user_id=$2',['wrong@example.test',staff[locked]]);
await assert.rejects(()=>asRole('service_role',undefined,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2)',[staff.hang,staff[locked]])),/REGISTERED_EMAIL_REQUIRED/);checks++;
await db.query('update public.mtm_staff set recovery_email=$1 where user_id=$2',[locked+'@minhthanhmath.vn',staff[locked]]);
const reset=await asRole('service_role',undefined,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2) data',[staff.hang,staff[locked]]));
assert.deepEqual(reset.rows[0].data,{email:locked+'@minhthanhmath.vn'});checks++;
await assert.rejects(()=>rpc({action:'dashboard'},locked),/PASSWORD_CHANGE_REQUIRED/);checks++;
await assert.rejects(()=>asRole('service_role',undefined,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2)',[staff.hang,staff[locked]])),/RESET_RATE_LIMIT/);checks++;
await assert.rejects(()=>asRole('service_role',undefined,tx=>tx.query('select public.mtm_staff_password_reset_target($1,$2)',[staff.hang,staff.thaytai])),/RESET_RATE_LIMIT/);checks++;
const roster=(await asRole('authenticated',staff.hang,tx=>tx.query('select public.mtm_staff_password_roster() data'))).rows[0].data;
assert.equal(roster.length,8);assert(!JSON.stringify(roster).includes('@'));checks++;
await db.exec("update auth.users set encrypted_password=fixture_crypto.crypt('synthetic-fixture-second-secret',fixture_crypto.gen_salt('bf',4))");
const range={from:'2026-11-02',to:'2026-11-08'};
const context=await rpc({action:'dashboard',...range});
assert.equal(context.classes.length,1);assert.equal(context.classes[0].id,cid);checks++;
const manager=await rpc({action:'dashboard',...range},'hang');assert.equal(manager.classes.length,4);checks++;
assert(!JSON.stringify(manager).includes('2K14'));assert(!JSON.stringify(manager).includes('Unknown teacher'));checks++;
for(const role of ['anon','authenticated']){
 await assert.rejects(()=>asRole(role,undefined,tx=>tx.query('select public.mtm_lesson_upload_api($1)',[JSON.stringify({action:'dashboard',...range})])));checks++;
 await assert.rejects(()=>asRole(role,undefined,tx=>tx.exec('select * from public.mtm_staff')));checks++;
 await assert.rejects(()=>asRole(role,undefined,tx=>tx.exec('select answer_path,answer_text from mtm_hw_private.lesson_uploads')));checks++;
}
const batch='20000000-0000-4000-8000-000000000001',homework=staff.thaytai+'/'+batch+'/homework.pdf',answer=staff.thaytai+'/'+batch+'/answer.pdf';
const managerHomework=staff.hang+'/'+batch+'/homework.pdf',adminHomework=staff.thaythanh+'/'+batch+'/homework.pdf';
for(const path of [managerHomework,adminHomework])await db.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[path]);
for(const name of [homework,answer])await asRole('authenticated',staff.thaytai,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[name]));
assert.equal((await asRole('authenticated',staff.thayhieu,tx=>tx.query("select * from storage.objects where bucket_id='mtm-lesson-private'"))).rows.length,0);checks++;
assert.equal((await asRole('anon',undefined,tx=>tx.query("select * from storage.objects where bucket_id='mtm-lesson-private'"))).rows.length,0);checks++;
assert.equal((await asRole('authenticated',staff.hang,tx=>tx.query("select * from storage.objects where bucket_id='mtm-lesson-private'"))).rows.length,4);checks++;
await assert.rejects(()=>asRole('authenticated',staff.thayhieu,tx=>tx.query("insert into storage.objects(bucket_id,name) values('mtm-lesson-private',$1)",[staff.thaytai+'/'+batch+'/forged.pdf'])));checks++;
const input={action:'create',class_ids:[cid],lesson_date:'2026-11-02',teacher_key:'thaytai',title:'Fixture only',task_scope:'Câu 1–2',homework_path:homework,answer_path:answer,answer_text:null};
await assert.rejects(()=>rpc({...input,answer_text:'1A 2B'}),/AMBIGUOUS_ANSWER_SOURCE/);checks++;
await assert.rejects(()=>rpc({...input,homework_path:null}),/HOMEWORK_REQUIRED_WITH_ANSWERS/);checks++;
await assert.rejects(()=>rpc({...input,task_scope:'x'.repeat(301)}),/INVALID_TEXT/);checks++;
await assert.rejects(()=>rpc({...input,class_ids:[unknown],teacher_key:'thaytai'}),/SCHEDULE_OR_TEACHER_UNVERIFIED/);checks++;
await assert.rejects(()=>rpc({...input,class_ids:[other],teacher_key:'thayhieu'}),/OTHER_TEACHER/);checks++;
await assert.rejects(()=>rpc({...input,task_scope:''}),/TASK_SCOPE_REQUIRED/);checks++;
await assert.rejects(()=>rpc({...input,video_url:'https://youtube.com.evil.example/watch?v=12345678901'}),/INVALID_VIDEO/);checks++;
await assert.rejects(()=>rpc({...input,homework_path:staff.thayhieu+'/'+batch+'/other.pdf'}),/PRIVATE_FILE_NOT_UPLOADED/);checks++;
const one=await rpc(input);assert.equal(one.version,1);checks++;
const dash=await rpc({action:'dashboard',...range});assert.equal(dash.uploads[0].answer_uploaded,true);assert.equal(dash.uploads[0].steps.filter((x:any)=>x.status==='xong').length,1);checks++;
assert(!JSON.stringify(dash).includes('1A 2B'));assert(!JSON.stringify(dash).includes(answer));checks++;
assert.equal((await rpc({action:'dashboard',...range},'thayhieu')).uploads.length,0);checks++;
await assert.rejects(()=>rpc({...input,homework_path:null,answer_path:null,answer_text:null,video_url:'https://youtu.be/abcdefghijk'}),/FULL_HOMEWORK_REUPLOAD_REQUIRED/);checks++;
const two=await rpc({...input,homework_path:managerHomework,answer_path:null,answer_text:'1C',on_behalf_of:'thaytai'},'hang');assert.equal(two.version,2);checks++;
assert.equal((await rpc({action:'dashboard',...range},'hang')).uploads[0].on_behalf_of,'thaytai');checks++;
const pair=await rpc({...input,class_ids:[pairA],teacher_key:'thaythanh',homework_path:adminHomework,answer_path:null,answer_text:'1A'},'thaythanh');
const paired=(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[pair.upload_id])).rows[0];assert.deepEqual(paired.class_ids.sort(),[pairA,pairB].sort());assert.equal(paired.class_dates[pairB],'2026-11-03');assert.equal(new Date(paired.due_at_by_class[pairB]).toISOString(),'2026-11-10T12:00:00.000Z');checks++;
for(const action of ['worker_claim','worker_checkpoint','worker_publish','sheet_precedence']){await assert.rejects(()=>rpc({action,worker_id:'fixture'}),/SERVICE_ROLE_REQUIRED/);checks++;}
const worker=(p:any)=>rpc(p,'','service_role');
assert.equal((await worker({action:'sheet_precedence',class_id:cid,lesson_date:'2026-11-02'})).web_wins,false);checks++;
// Fixture-only enable to exercise the existing precedence checks after the default-OFF assertion.
await db.exec('update mtm_hw_private.lesson_upload_settings set web_precedence=true where singleton');
assert.equal((await worker({action:'sheet_precedence',class_id:cid,lesson_date:'2026-11-02'})).web_wins,true);checks++;
const job=(await worker({action:'worker_claim',worker_id:'fixture'})).job;assert.equal(job.id,two.upload_id);assert.equal(job.version,2);assert.equal(job.answer_text,'1C');checks++;
assert.equal((await worker({action:'worker_claim',worker_id:'fixture2'})).job.id,pair.upload_id);checks++;
assert.equal((await worker({action:'worker_claim',worker_id:'fixture3'})).job,null);checks++;
await assert.rejects(()=>worker({action:'worker_checkpoint',upload_id:job.id,claim_token:job.claim_token,step:4,status:'xong'}),/PRIOR_STEP_INCOMPLETE/);checks++;
const third=await rpc({...input,answer_path:null,answer_text:'1D'});assert.equal(third.version,3);checks++;
await assert.rejects(()=>worker({action:'worker_assert_current',upload_id:job.id,claim_token:job.claim_token}),/STALE_UPLOAD/);checks++;
const current=(await worker({action:'worker_claim',worker_id:'fixture4'})).job;assert.equal(current.id,third.upload_id);checks++;
const fence={upload_id:current.id,claim_token:current.claim_token};
for(const step of [2,3,4,5])await worker({action:'worker_checkpoint',...fence,step,status:'xong',checkpoint:{['step'+step]:true}});
assert.equal((await db.query('select checkpoint from mtm_hw_private.lesson_uploads where id=$1',[current.id])).rows[0].checkpoint.step2,true);checks++;
await assert.rejects(()=>worker({action:'worker_checkpoint',...fence,step:6,status:'xong'}),/PUBLISH_RECEIPTS_REQUIRED/);checks++;
await db.query("insert into mtm_hw_private.btvn_lessons(code,class_ids,material,active,publish_status) values('sheet-existing',$1,$2,true,'da_dang')",[[cid],JSON.stringify({classDates:{'2K10 9+':'2026-11-02'},date:'2026-11-02'})]);
const payload={lesson_key:current.lesson_code,material:{lessonCode:current.lesson_code,classNames:['2K10 9+'],classDates:{'2K10 9+':'2026-11-02'},date:'2026-11-02'},exam:{questions:[{id:'q1'}]},verification:{independent:true}};
await assert.rejects(()=>worker({action:'worker_publish',...fence,payload:{...payload,material:{...payload.material,classDates:{'2K10 9+':'2026-11-03'}}}}),/CLASS_DATE_MISMATCH/);checks++;
const published=await worker({action:'worker_publish',...fence,payload});assert.equal(published.ok,true);assert(published.publish_receipts[cid]);checks++;
await db.query('insert into mtm_hw_private.students(id,class_id) values($1,$2)',[staff.thaytai,cid]);
await db.query('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$2)',[staff.thaytai,current.lesson_code]);
assert.equal(new Date((await db.query('select expected_due_at from mtm_hw_private.btvn_work')).rows[0].expected_due_at).toISOString(),'2026-11-09T10:00:00.000Z');checks++;
assert.equal(new Date((await db.query('select material from mtm_hw_private.btvn_lessons where code=$1',[current.lesson_code])).rows[0].material.classOpensAt['2K10 9+']).toISOString(),'2026-11-02T12:30:00.000Z');checks++;
assert.equal((await worker({action:'worker_publish',...fence,payload})).already_applied,true);checks++;
const prior=(await db.query("select * from mtm_hw_private.btvn_lessons where code='sheet-existing'")).rows[0];assert.equal(prior.active,false);assert.deepEqual(prior.class_ids,[]);checks++;
const skipped=await asRole('mtm_btvn_publisher',undefined,async(tx:any)=>(await tx.query("select public.mtm_btvn_pipeline('publish',$1) r",[JSON.stringify({...payload,lesson_key:'sheet-late'})])).rows[0].r);assert.equal(skipped.skipped,true);checks++;
await assert.rejects(()=>asRole('mtm_btvn_publisher',undefined,async(tx:any)=>tx.query("select public.mtm_btvn_pipeline('update_material',$1)",[JSON.stringify({lesson_key:current.lesson_code,material:{title:'forged sheet overwrite'}})])),/WEB_PUBLISH_CAPABILITY_REQUIRED/);checks++;
await assert.rejects(()=>asRole('mtm_btvn_publisher',undefined,tx=>tx.query("select public.mtm_btvn_pipeline_before_lesson_upload('publish',$1)",[JSON.stringify({...payload,lesson_key:'bypass'})])));checks++;
await assert.rejects(()=>worker({action:'worker_checkpoint',...fence,step:6,status:'xong',checkpoint:{publish_receipts:{forged:true}}}),/INVALID_CHECKPOINT/);checks++;
await worker({action:'worker_checkpoint',...fence,step:6,status:'xong'});await worker({action:'worker_finish',...fence});checks++;
await assert.rejects(()=>asRole('mtm_btvn_publisher',undefined,async(tx:any)=>{await tx.query("select set_config('mtm.lesson_upload_publish',$1,true)",[current.id]);return tx.query("select public.mtm_btvn_pipeline('update_material',$1)",[JSON.stringify({lesson_key:current.lesson_code,material:{title:'fake GUC'}})]);}),/WEB_PUBLISH_CAPABILITY_REQUIRED/);checks++;
for(const role of ['anon','authenticated','service_role','mtm_btvn_publisher']){await assert.rejects(()=>asRole(role,undefined,tx=>tx.exec('select * from mtm_hw_private.lesson_publish_capability')));checks++;}
assert.equal((await db.query('select count(*) n from mtm_hw_private.lesson_publish_capability')).rows[0].n,0);checks++;
assert.equal((await worker({action:'worker_finish',...fence})).already_applied,true);checks++;
await assert.rejects(()=>worker({action:'worker_checkpoint',...fence,step:6,status:'loi'}),/FINISHED_UPLOAD_IMMUTABLE/);checks++;
assert.equal((await rpc({action:'dashboard',...range})).uploads[0].steps.filter((x:any)=>x.status==='xong').length,6);checks++;
// Expired leases are fenced, and one initial attempt permits at most two retries.
await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second',attempt_count=3 where id=$1",[pair.upload_id]);
assert.equal((await worker({action:'worker_claim',worker_id:'fixture-final'})).job,null);checks++;
assert.equal((await db.query("select status from mtm_hw_private.lesson_upload_steps where upload_id=$1 and step=2",[pair.upload_id])).rows[0].status,'loi');checks++;
// A class appearing twice in the paired group cannot overwrite its own date map.
await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K9 9+',2,'17:30','19:30','Thầy Thành')");
await assert.rejects(()=>rpc({...input,class_ids:[pairA],teacher_key:'thaythanh',homework_path:adminHomework,answer_path:null,answer_text:'fixture'},'thaythanh'),/AMBIGUOUS_PAIRED_SCHEDULE/);checks++;
// Neither private input source paths nor private answer metadata can reach a
// published material/exam. A NULL response is not proof of publication.
const finalUpload=await rpc(input);const finalJob=(await worker({action:'worker_claim',worker_id:'adversarial-fixture'})).job;
assert.equal(finalJob.id,finalUpload.upload_id);checks++;
const finalFence={upload_id:finalJob.id,claim_token:finalJob.claim_token};
for(const step of [2,3,4,5])await worker({action:'worker_checkpoint',...finalFence,step,status:'xong'});
const finalPayload={...payload,lesson_key:finalJob.lesson_code,material:{...payload.material,lessonCode:finalJob.lesson_code}};
await assert.rejects(()=>worker({action:'worker_publish',...finalFence,payload:{...finalPayload,material:{...finalPayload.material,answer_text:'private answer'}}}),/PRIVATE_SOURCE_IN_PUBLISH/);checks++;
await assert.rejects(()=>worker({action:'worker_publish',...finalFence,payload:{...finalPayload,material:{...finalPayload.material,handoutUrl:'https://fixture.invalid/'+homework}}}),/PRIVATE_SOURCE_IN_PUBLISH/);checks++;
const originalPublisher=(await db.query("select pg_get_functiondef('public.mtm_btvn_pipeline_before_lesson_upload(text,jsonb)'::regprocedure) src")).rows[0].src;
await db.exec('create or replace function public.mtm_btvn_pipeline_before_lesson_upload(text,jsonb) returns jsonb language sql as $$select null::jsonb$$');
await assert.rejects(()=>worker({action:'worker_publish',...finalFence,payload:finalPayload}),/PUBLICATION_FAILED/);checks++;
assert.equal((await db.query('select checkpoint from mtm_hw_private.lesson_uploads where id=$1',[finalJob.id])).rows[0].checkpoint.publish_receipts,undefined);checks++;
await db.exec(originalPublisher);
// A conflicting teacher at the same slot is not silently assigned.
await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K10 9+',1,'17:30','19:30','Trần Đức Hiếu')");
assert.equal((await rpc({action:'dashboard',...range})).classes.length,0);checks++;
await assert.rejects(()=>rpc(input),/SCHEDULE_OR_TEACHER_UNVERIFIED/);checks++;
// Existing confirmed per-student extensions still win over the canonical baseline.
await db.exec("create or replace function mtm_hw_private.btvn_override_due_before_schedule066(uuid,text) returns timestamptz language sql as $$select timestamptz '2026-11-10 20:00+07'$$");
await db.query('update mtm_hw_private.btvn_work set expected_due_at=null where lesson_code=$1',[current.lesson_code]);
assert.equal(new Date((await db.query('select next_actual_class_at from mtm_hw_private.btvn_work')).rows[0].next_actual_class_at).toISOString(),'2026-11-10T13:00:00.000Z');checks++;
// Reduced auth schema used by other PGlite tests skips seed writes safely.
await db.exec('alter table auth.users rename encrypted_password to reduced_auth_fixture');await db.exec(sql);checks++;
assert.equal((await db.query('select count(*) n from public.mtm_exam_admins')).rows[0].n,0);checks++;
assert(!/update auth\.users set encrypted_password/i.test(sql));checks++;
await db.close();console.log(`${checks} ca SQL cổng GV: tài khoản/idempotence/RLS/teacher/pair/lease/phiên bản/worker/ưu tiên web đạt; chỉ dữ liệu fixture.`);
