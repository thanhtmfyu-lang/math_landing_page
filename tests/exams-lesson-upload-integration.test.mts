/** Synthetic integration: original migration chain 001..014 and production worker,
 * publisher validator, RPC adapter and student repository. No network/live DB.
 * Later timetable/deadline helper prerequisites use their exact signatures because
 * running every historical migration requires live fingerprint/operational state.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {expectedSlots,createBtvnPublishHandler} from '../server/btvn/publish-handler';
import {runUploadOnce,reviewQuestions,type Pipeline} from '../server/lesson-upload/worker';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
const {PGlite}=process.env.MTM_PGLITE_MODULE?await import(pathToFileURL(process.env.MTM_PGLITE_MODULE).href):await import('@electric-sql/pglite');
const db=new PGlite(),root=process.env.MTM_ROOT!;let checks=0;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
grant usage on schema auth to anon,authenticated,service_role;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,created_at timestamptz default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;grant usage on schema storage to service_role,authenticated;
grant select,insert on storage.objects to service_role,authenticated;`);
for(const f of readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(root+'/supabase/migrations/'+f,'utf8').replace(/^\uFEFF/,''));
const key=(f:string)=>f.replace(/^(\d+)_([0-9]+)_/,'$1~$2_').replace(/^(\d+)_/,'$1!_');
for(const f of readdirSync(root+'/supabase/migrations-pending').filter(f=>f.endsWith('.sql')&&f.slice(0,12)>='202610150005'&&f.slice(0,12)<='202610150014').sort((a,b)=>key(a).localeCompare(key(b))))await db.exec(readFileSync(root+'/supabase/migrations-pending/'+f,'utf8').replace(/^\uFEFF/,''));
await db.exec(`create table mtm_hw_private.timetable(class_label text not null,weekday int not null,start_hm text not null,end_hm text not null,
 mode text not null default '',teacher text,updated_at timestamptz default now(),primary key(class_label,weekday,start_hm));
create function mtm_hw_private.btvn_schedule_planned_due(uuid,text) returns timestamptz language sql as $$select null::timestamptz$$;
create function mtm_hw_private.btvn_override_due_before_schedule066(uuid,text) returns timestamptz language sql as $$select null::timestamptz$$;`);
await db.exec('alter table mtm_hw_private.students add column is_test boolean not null default false;alter table mtm_hw_private.btvn_lessons add column is_test boolean not null default false;');
// Reuse the real 100 immutable flag and student scope functions, without loading
// unrelated trial/attendance/report/cleanup operations requiring later schemas.
const isolation=readFileSync(root+'/supabase/migrations-pending/202610270100_is_test.sql','utf8');
await db.exec('create schema mtm_test100;create table mtm_test100.cleanup_jobs(student_id uuid);');
await db.exec(isolation.slice(isolation.indexOf('create function mtm_test100.guard_flag()'),isolation.indexOf('create trigger is_test100_pt_flag')));
await db.exec(isolation.slice(isolation.indexOf('create function public.mtm_btvn_read_scoped100('),isolation.indexOf('-- Durable tombstone:')));
await db.exec(readFileSync(root+'/supabase/migrations-pending/202611020101_cong_up_btvn_gv.sql','utf8'));checks++;
const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112',cid='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333';
await db.query('insert into auth.users values($1),($2)',[owner,teacher]);
await db.query("insert into public.mtm_staff values($1,'thaytai','Trần Thanh Anh Tài','gv','thaytai',true)",[teacher]);
await db.query("insert into public.mtm_staff values($1,'thaythanh','Thầy Thành','admin','thaythanh',true)",[owner]);
await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K10 9+',11)",[cid,owner]);
await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid])',[owner,cid]);
await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K10 9+',1,'17:30','19:30','Trần Thanh Anh Tài')");
await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Học sinh giả local','Trường giả','11 giả','MTM-000000000001')",[sid,owner,cid]);
// Exercise the capability window by creating work from an AFTER INSERT trigger,
// before the publisher returns and before publish_receipts can be committed.
await db.exec(`create table integration_precommit_due(code text,due timestamptz,has_capability boolean,has_receipt boolean);
create function integration_create_work() returns trigger language plpgsql as $$begin
 insert into mtm_hw_private.btvn_work(student_id,lesson_code)
 select s.id,new.code from mtm_hw_private.students s where s.class_id=any(new.class_ids) and s.is_test=new.is_test on conflict do nothing;
 insert into public.integration_precommit_due
 select new.code,w.expected_due_at,exists(select 1 from mtm_hw_private.lesson_publish_capability where txid=txid_current()),u.checkpoint ? 'publish_receipts'
 from mtm_hw_private.btvn_work w join mtm_hw_private.lesson_uploads u on new.code='web-'||replace(u.id::text,'-','') where w.lesson_code=new.code;
 return new;end$$;
create trigger integration_create_work after insert on mtm_hw_private.btvn_lessons for each row execute function integration_create_work();`);
async function role(role:string,uid:string|undefined,fn:(tx:any)=>Promise<any>){return db.transaction(async(tx:any)=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,uid??'']);return fn(tx);});}
async function call(name:string,args:Record<string,unknown>,roleName='service_role',uid?:string){return role(roleName,uid,async(tx:any)=>(await tx.query(`select public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) result`,Object.values(args))).rows[0].result);}
const sourcePath=teacher+'/44444444-4444-4444-8444-444444444444/homework.pdf';
await role('authenticated',teacher,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[sourcePath]));
const upload=await call('mtm_lesson_upload_api',{p:{action:'create',class_ids:[cid],lesson_date:'2026-10-26',teacher_key:'thaytai',title:'Synthetic production integration',task_scope:'Câu 1–3',homework_path:sourcePath,answer_text:'1D; ĐS: Đ S Đ S; TLN:2.5'}},'authenticated',teacher);checks++;
const fixture=pipelineFixture(),stored=new Map<string,Uint8Array>();let rpcError:any=null;
const client={async rpc(name:string,args:Record<string,unknown>){try{return {data:await call(name==='mtm_btvn_read'?'mtm_btvn_read_scoped100':name,args),error:null};}catch(error:any){rpcError={code:error.code,message:error.message};return {data:null,error:rpcError};}},storage:{from(bucket:string){return {async upload(path:string,bytes:Uint8Array,opts:any){try{await role('service_role',undefined,tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,JSON.stringify({mimetype:opts.contentType,size:bytes.length})]));stored.set(path,bytes);return {error:null};}catch(error:any){return {error};}},async download(path:string){const bytes=stored.get(path);return bytes?{data:new Blob([bytes]),error:null}:{data:null,error:{message:'Missing fixture'}};}};}}};
const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic-codex'},async read(){return {sourceVersion:'c'.repeat(64),questions:reviewQuestions(fixture.exam),teacherSlots:expectedSlots(fixture.exam),privateAnswerHashes:['e'.repeat(64)]};},async build(){return {exam:fixture.exam,assets:fixture.assets};},async review(input){assert(!JSON.stringify(input).includes('expected'));return {provider:'grok',model:'synthetic-grok',receipt_hash:'d'.repeat(64),slots:fixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
const stateRows=new Map<string,unknown>(),state={async save(id:string,stage:string,v:unknown){const ref=id+'/'+stage;stateRows.set(ref,structuredClone(v));return ref;},async load(ref:string){return structuredClone(stateRows.get(ref));}};
const result=await runUploadOnce(createWorkerRepository(client),pipeline,state,'synthetic-worker');
assert.equal(result.status,'complete',JSON.stringify({result,rpcError}));checks++;
const row=(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[upload.upload_id])).rows[0];assert(row.finished_at);assert(row.checkpoint.publish_receipts[cid]);checks++;
assert.equal((await db.query("select count(*) n from mtm_hw_private.lesson_upload_steps where upload_id=$1 and status='xong'",[upload.upload_id])).rows[0].n,6);checks++;
const lessonCode=row.checkpoint.publish_receipts[cid].lesson_code;
const published=(await db.query('select * from mtm_hw_private.btvn_lessons where code=$1',[lessonCode])).rows[0];assert.equal(published.active,true);assert.equal(published.publish_status,'da_dang');assert.equal(published.verification.provider,'grok');checks++;
assert.equal(new Date(published.material.classOpensAt['2K10 9+']).toISOString(),'2026-10-26T12:30:00.000Z');checks++;
assert.equal(stored.size,1);assert(![...stored.keys()].some(k=>k.includes('answer')));checks++;
const precommit=(await db.query('select * from integration_precommit_due where code=$1',[lessonCode])).rows[0];assert.equal(precommit.has_capability,true);assert.equal(precommit.has_receipt,false);assert.equal(precommit.due.toISOString(),'2026-11-02T10:00:00.000Z');checks++;
const token='f'.repeat(64);await db.query("insert into mtm_hw_private.btvn_identity_sessions values(mtm_hw_private.token_digest('btvn-identity',$1),$2,clock_timestamp()+interval '1 hour',null)",[token,sid]);
const studentRepo=new SupabaseHomeworkRepository(client,async()=>({}),Date.now,async(path:string)=>{assert(stored.has(path));return 'https://fixture.invalid/'+path+'?token=fixture';});
const student=await studentRepo.call(token,'state',lessonCode);assert.equal(student.lessonCode,lessonCode);assert(student.exam);assert.equal(student.lessons?.length,1);checks++;
const studentJson=JSON.stringify(student);assert(!studentJson.includes('answer_text'));assert(!studentJson.includes('answer_path'));assert(!studentJson.includes(sourcePath));assert(!studentJson.includes('acceptedAnswers'));assert(!studentJson.includes('"answer":"D"'));checks++;
assert.equal(student.dueAt,new Date('2026-11-02T10:00:00Z').getTime());checks++;
for(const r of ['anon','authenticated']){await assert.rejects(()=>role(r,undefined,tx=>tx.exec('select answer_text,answer_path from mtm_hw_private.lesson_uploads')));checks++;}
await assert.rejects(()=>studentRepo.call('0'.repeat(64),'state',lessonCode));checks++;
const repeated=await runUploadOnce(createWorkerRepository(client),pipeline,state,'synthetic-worker');assert.equal(repeated.status,'idle');checks++;
// Same Storage policy used by the sheet fallback must point at the new wrapper,
// because PostgreSQL policies bind function OIDs across ALTER FUNCTION RENAME.
await role('mtm_btvn_publisher',undefined,tx=>tx.query("insert into storage.objects(bucket_id,name) values('mtm-btvn',$1)",['btvn/sheet-fallback-fixture/'+'a'.repeat(64)+'/question.pdf']));checks++;
// A QA upload sharing a real slot must neither supersede production nor block
// the sheet fallback. Setting QA at INSERT also respects real immutable flags.
const qaSource=owner+'/44444444-4444-4444-8444-444444444444/homework.pdf';
await role('authenticated',owner,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[qaSource]));
let qaCurrentCode='';const qaCodes:string[]=[];
for(const date of ['2026-10-26','2026-11-02']){
 const qaUpload=await call('mtm_lesson_upload_api',{p:{action:'create',class_ids:[cid],lesson_date:date,teacher_key:'thaytai',title:'QA fixture only',task_scope:'Câu 1–3',homework_path:qaSource,answer_text:'fixture',is_test:true}},'authenticated',owner);
 const qaRun=await runUploadOnce(createWorkerRepository(client),pipeline,state,'qa-fixture');assert.equal(qaRun.status,'complete',JSON.stringify({qaRun,rpcError}));checks++;
 const qaRow=(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[qaUpload.upload_id])).rows[0];
 qaCurrentCode=qaRow.checkpoint.publish_receipts[cid].lesson_code;
 qaCodes.push(qaCurrentCode);
 assert.equal((await db.query('select is_test from mtm_hw_private.btvn_lessons where code=$1',[qaCurrentCode])).rows[0].is_test,true);checks++;
}
assert.equal((await db.query('select active from mtm_hw_private.btvn_lessons where code=$1',[lessonCode])).rows[0].active,true);checks++;
assert.equal((await studentRepo.call(token,'state',lessonCode)).lessons?.length,1);checks++;
const prodDashboard=await call('mtm_lesson_upload_api',{p:{action:'dashboard',from:'2026-10-26',to:'2026-11-08'}},'authenticated',owner);
assert.equal(prodDashboard.uploads.length,1);assert.equal(prodDashboard.uploads[0].id,upload.upload_id);checks++;
const qaDashboard=await call('mtm_lesson_upload_api',{p:{action:'dashboard',from:'2026-10-26',to:'2026-11-08',is_test:true}},'authenticated',owner);assert.equal(qaDashboard.uploads.length,2);checks++;
await assert.rejects(()=>studentRepo.call(token,'state',qaCurrentCode));checks++;
const qaStudent='33333333-3333-4333-8333-333333333334',qaToken='e'.repeat(64);
await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test) values($1,$2,$3,'QA giả local','Trường giả','11 giả','MTM-000000000002',true)",[qaStudent,owner,cid]);
await db.query("insert into mtm_hw_private.btvn_identity_sessions values(mtm_hw_private.token_digest('btvn-identity',$1),$2,clock_timestamp()+interval '1 hour',null)",[qaToken,qaStudent]);
assert.equal((await studentRepo.call(qaToken,'state',qaCodes[0])).exam!==null,true);checks++;
await assert.rejects(()=>studentRepo.call(qaToken,'state',lessonCode));checks++;
for(const code of [lessonCode,qaCurrentCode])await assert.rejects(()=>role('mtm_btvn_publisher',undefined,async(tx:any)=>{await tx.query("select set_config('mtm.lesson_upload_publish',$1,true)",[code.replace('web-','')]);return tx.query("select public.mtm_btvn_pipeline('update_material',$1)",[JSON.stringify({lesson_key:code,material:{title:'forged GUC'}})]);}),/WEB_PUBLISH_CAPABILITY_REQUIRED/);checks++;
assert.equal((await call('mtm_lesson_upload_api',{p:{action:'sheet_precedence',class_id:cid,lesson_date:'2026-11-02'}})).web_wins,false);checks++;
await assert.rejects(()=>call('mtm_lesson_upload_api',{p:{action:'create',class_ids:[cid],lesson_date:'2026-11-02',teacher_key:'thaytai',title:'Forged QA',task_scope:'fixture',homework_path:sourcePath,answer_text:'fixture',is_test:true}},'authenticated',teacher));checks++;
// Video-first remains queued until a real sheet lesson exists; a newer QA lesson
// for the same class/date must not satisfy or receive the production attachment.
const videoUpload=await call('mtm_lesson_upload_api',{p:{action:'create',class_ids:[cid],lesson_date:'2026-11-02',teacher_key:'thaytai',title:'Video-first fixture',video_url:'https://youtu.be/abcdefghijk'}},'authenticated',teacher);
assert.equal((await runUploadOnce(createWorkerRepository(client),pipeline,state,'video-fixture')).status,'idle');checks++;
assert.equal((await call('mtm_lesson_upload_api',{p:{action:'sheet_precedence',class_id:cid,lesson_date:'2026-11-02'}})).web_wins,false);checks++;
const sheet=pipelineFixture();sheet.lesson_key='sheet-materials-fixture';sheet.material={...sheet.material,lessonCode:sheet.lesson_key,classNames:['2K10 9+'],date:'2026-11-02',classDates:{'2K10 9+':'2026-11-02'}} as any;
const secret='fixture-publish-secret-'.repeat(3);
const sheetHandler=createBtvnPublishHandler({async rpc(action,payload){return call('mtm_btvn_pipeline',{p_action:action,p_payload:payload},'mtm_btvn_publisher');},async upload(path,bytes,type){await role('mtm_btvn_publisher',undefined,tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mtm-btvn',path,JSON.stringify({mimetype:type,size:bytes.length})]));stored.set(path,bytes);}},secret);
const sheetResponse=await sheetHandler(new Request('https://fixture.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify(sheet)}));assert.equal(sheetResponse.status,200);assert.equal((await sheetResponse.json()).status,'da_dang');checks++;
await db.query("update mtm_hw_private.btvn_lessons set updated_at=clock_timestamp()+interval '1 hour' where code=$1",[qaCurrentCode]);
const materialJob=(await call('mtm_lesson_upload_api',{p:{action:'worker_claim',worker_id:'material-guard-fixture'}})).job;
assert.equal(materialJob.id,videoUpload.upload_id);checks++;
const materialFence={upload_id:materialJob.id,claim_token:materialJob.claim_token};
for(const step of [2,3,4])await call('mtm_lesson_upload_api',{p:{action:'worker_checkpoint',...materialFence,step,status:'xong'}});
for(const material of [{classNames:['2K11'],videoId:'abcdefghijk'},{videoUrl:'https://fixture.invalid/storage/v1/object/sign/mtm-lesson-private/answer.pdf'}]){
 await assert.rejects(()=>call('mtm_lesson_upload_api',{p:{action:'worker_materials',...materialFence,material}}),/UNSAFE_MATERIAL_PATCH/);checks++;
}
const originalPublisher=(await db.query("select pg_get_functiondef('public.mtm_btvn_pipeline_before_lesson_upload(text,jsonb)'::regprocedure) src")).rows[0].src;
await db.exec('create or replace function public.mtm_btvn_pipeline_before_lesson_upload(p_action text,p_payload jsonb) returns jsonb language sql as $$select null::jsonb$$');
await assert.rejects(()=>call('mtm_lesson_upload_api',{p:{action:'worker_materials',...materialFence,material:{videoId:'abcdefghijk'}}}),/MATERIAL_UPDATE_NOT_CONFIRMED/);checks++;
assert.equal((await db.query('select checkpoint from mtm_hw_private.lesson_uploads where id=$1',[videoUpload.upload_id])).rows[0].checkpoint.publish_receipts,undefined);checks++;
await db.exec(originalPublisher);
const unrelatedClass='22222222-2222-4222-8222-222222222223';
await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K11 fixture',11)",[unrelatedClass,owner]);
await db.query('update mtm_hw_private.btvn_lessons set class_ids=$1 where code=$2',[[cid,unrelatedClass],sheet.lesson_key]);
await assert.rejects(()=>call('mtm_lesson_upload_api',{p:{action:'worker_materials',...materialFence,material:{videoId:'abcdefghijk'}}}),/MATERIAL_LESSON_NOT_PUBLISHED/);checks++;
await db.query('update mtm_hw_private.btvn_lessons set class_ids=$1 where code=$2',[[cid],sheet.lesson_key]);
await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[videoUpload.upload_id]);
const videoRun=await runUploadOnce(createWorkerRepository(client),pipeline,state,'video-fixture');assert.equal(videoRun.status,'complete',JSON.stringify({videoRun,rpcError}));checks++;
assert.equal((await db.query('select material from mtm_hw_private.btvn_lessons where code=$1',[sheet.lesson_key])).rows[0].material.videoId,'abcdefghijk');checks++;
assert.equal((await db.query('select material from mtm_hw_private.btvn_lessons where code=$1',[qaCurrentCode])).rows[0].material.videoId,null);checks++;
assert.equal((await db.query('select finished_at from mtm_hw_private.lesson_uploads where id=$1',[videoUpload.upload_id])).rows[0].finished_at instanceof Date,true);checks++;
// Mixed-class fallback preserves the unrelated class instead of skipping its
// homework because another class/date is owned by a teacher's web upload.
await db.query('update mtm_hw_private.btvn_publish_scope set class_ids=$1',[[cid,unrelatedClass]]);
const mixed=pipelineFixture();mixed.lesson_key='sheet-mixed-classes-fixture';mixed.material={...mixed.material,lessonCode:mixed.lesson_key,classNames:['2K10 9+','2K11 fixture'],date:'2026-10-26',classDates:{'2K10 9+':'2026-10-26','2K11 fixture':'2026-10-26'}} as any;
const mixedResponse=await sheetHandler(new Request('https://fixture.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify(mixed)}));assert.equal(mixedResponse.status,200);
const mixedResult=await mixedResponse.json();assert.equal(mixedResult.status,'da_dang');assert.deepEqual(mixedResult.excluded_web_classes,['2K10 9+']);checks++;
const mixedRow=(await db.query('select class_ids,material from mtm_hw_private.btvn_lessons where code=$1',[mixed.lesson_key])).rows[0];assert.deepEqual(mixedRow.class_ids,[unrelatedClass]);assert.deepEqual(mixedRow.material.classNames,['2K11 fixture']);assert.deepEqual(Object.keys(mixedRow.material.classDates),['2K11 fixture']);checks++;
await db.close();console.log(`${checks} ca tích hợp SQL publisher nguyên bản + worker/repository thật + state HS: đạt, dữ liệu giả, không mạng.`);
