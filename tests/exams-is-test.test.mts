import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {createEssayHandler,ESSAY_BUCKET} from '../server/btvn/tu-luan';
import {cleanupTestStudent} from '../server/btvn/test-cleanup';
import {productionRpc} from '../server/btvn/test-scope';
import {scorebookResult} from '../server/btvn/publish-scorebook';
import {validatePracticeExam,type PracticeExam} from '../src/native/exams/data';
import {createDraft} from '../src/native/exams/store';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createBtvnApi} from '../api/btvn';
import type {createClient} from '@supabase/supabase-js';

const {db,applied}=await baselineDatabase(),checks:string[]=[];
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const one=async(sql:string,args:any[]=[])=>Object.values((await q(sql,args)).rows[0])[0] as any;
const owner='11111111-1111-4111-8111-111111111111',other='99999999-9999-4999-8999-999999999999',nonadmin='77777777-7777-4777-8777-777777777777';
const real='22222222-2222-4222-8222-222222222222',test='a3333333-3333-4333-8333-333333333333',cid='44444444-4444-4444-8444-444444444444';
const lesson='is-test-real-lesson',testLesson='is-test-qa-lesson';
const rpc=(name:string,args:Record<string,any>,role='service_role',actor='')=>db.transaction(async tx=>{
 await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
 const keys=Object.keys(args);return (await tx.query(`select public.${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) data`,keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]))).rows[0].data;
});
const admin=(name:string,args:Record<string,any>,actor=owner)=>rpc(name,args,'authenticated',actor);
const denied=(fn:()=>Promise<any>)=>assert.rejects(fn,(e:any)=>e.code==='42501');
const E_BEGIN='\nbegin\n';
const check=async(name:string,fn:()=>Promise<void>)=>{await fn();checks.push(name);console.log('ĐẠT IS_TEST: '+name);};
const cookie='a'.repeat(64),testCookie='b'.repeat(64),jpeg=new Uint8Array([255,216,255,...Array(250).fill(7)]),sha=createHash('sha256').update(jpeg).digest('hex');
const blobs=new Map<string,Uint8Array>();let removals=0,failRemove=false;
const sqlPort={rpc:async(name:string,args:any)=>{try{return {data:await admin(name,args),error:null};}catch(e:any){return {data:null,error:{code:e.code}};}},
 remove:async(bucket:string,paths:string[])=>{
  removals++;assert.equal(bucket,ESSAY_BUCKET);if(failRemove)return {error:{message:'fixture failure'}};
  for(const path of paths){blobs.delete(bucket+'/'+path);await q('delete from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);}return {error:null};
 }};
// Synthetic credentials only; SQL runs locally in PGlite, never a live service.
const cleanupEnv={MTM_BTVN_ENABLED:'1',VERCEL:'1',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',MTM_HOMEWORK_PUBLISHABLE_KEY:'fixture-public',MTM_BTVN_NETWORK_SECRET:'x'.repeat(32)};
let cleanupClients=0;
const clientFactory=((url:string,key:string,options:any)=>{
 cleanupClients++;assert.equal(url,cleanupEnv.SUPABASE_URL);
 if(key===cleanupEnv.MTM_HOMEWORK_PUBLISHABLE_KEY){
  const auth=options.global.headers.Authorization;
  const actor=auth==='Bearer owner-fixture'?owner:auth==='Bearer other-fixture'?other:nonadmin;
  return {rpc:async(name:string,args:any)=>{try{return {data:await admin(name,args,actor),error:null};}catch(e:any){return {data:null,error:{code:e.code}};}}};
 }
 assert.equal(key,cleanupEnv.SUPABASE_SERVICE_ROLE_KEY);assert.equal(options.global,undefined);
 return {storage:{from:(bucket:string)=>({remove:(paths:string[])=>sqlPort.remove(bucket,paths)})}};
}) as unknown as typeof createClient;
const cleanupApi=createBtvnApi(()=>cleanupEnv,async()=>{throw Error('Cleanup must not use student repository');},{cleanupClient:clientFactory});
const cleanupRequest=async(studentId:unknown,authorization='Bearer owner-fixture',overrides:Record<string,any>={})=>{
 let status=0,body:any;const headers:Record<string,string|string[]>={};
 await cleanupApi({method:'POST',headers:{host:'minhthanhmath.vn',origin:'https://minhthanhmath.vn','x-vercel-forwarded-for':'192.0.2.1',authorization},body:{action:'test-cleanup',studentId},...overrides},
  {setHeader:(k,v)=>{headers[k]=v;},status:s=>{status=s;return {json:v=>{body=v;}};}});
 assert.equal(headers['Cache-Control'],'no-store, private');
 return {status,body};
};
try{
 await q('insert into auth.users values($1),($2),($3)',[owner,other,nonadmin]);
 await q('insert into public.mtm_exam_admins(user_id) values($1),($2)',[owner,other]);
 await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K10 9+',11)",[cid,owner]);
 await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids) values(true,$1,'synthetic-is-test',$2)",[owner,[real,test]]);
 await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Real fixture','Synthetic','11A','MTM-000000000001')",[real,owner,cid]);
 const original=(await q("select p.oid,pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mtm_hw_private') and p.prokind='f'")).rows;
 const before=await one('select to_jsonb(s) from mtm_hw_private.students s where id=$1',[real]);
 await check('migration adds only: existing row values and all original functions preserved',async()=>{
  await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
  assert.deepEqual(await one("select to_jsonb(s)-'is_test' from mtm_hw_private.students s where id=$1",[real]),before);
  assert.equal(await one('select is_test from mtm_hw_private.students where id=$1',[real]),false);
  for(const f of original)assert.equal(await one('select pg_get_functiondef($1::oid)',[f.oid]),f.def);
 });
 await check('refresh_reports: idempotent, and an edited original reaches its _real100 clone',async()=>{
  const count="select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mtm_hw_private') and p.proname ~ '_real100$'";
  const n=await one(count);assert.ok(n>20);
  assert.equal(await one('select mtm_test100.refresh_reports()'),n);assert.equal(await one(count),n);
  const def=await one("select pg_get_functiondef('public.mtm_ph_extras(text,uuid)'::regprocedure)");
  assert.equal(def.split(E_BEGIN).length,2);
  await db.exec(def.replace(E_BEGIN,E_BEGIN+' perform 1; -- refresh-marker\n'));
  assert.ok(!String(await one("select pg_get_functiondef('public.mtm_ph_extras_real100(text,uuid)'::regprocedure)")).includes('refresh-marker'));
  await one('select mtm_test100.refresh_reports()');
  assert.ok(String(await one("select pg_get_functiondef('public.mtm_ph_extras_real100(text,uuid)'::regprocedure)")).includes('refresh-marker'));
  await db.exec(def);await one('select mtm_test100.refresh_reports()');
 });
 await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test) values($1,$2,$3,'Test fixture','Synthetic','11A','MTM-000000000002',true)",[test,owner,cid]);
 const exam=JSON.parse(readFileSync('scripts/fixtures/is-test-exam.json','utf8')) as PracticeExam;
 assert.deepEqual(validatePracticeExam(exam),{valid:true,errors:[]});
 const today=await one("select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date::text");
 for(const [code,isTest] of [[lesson,false],[testLesson,true]] as const){
  const material={lessonCode:code,date:today,title:'Synthetic QA',classNames:['2K10 9+'],classDates:{'2K10 9+':today}};
  await q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,opens_at,closes_at,is_test) values($1,$2,$3,$4,$5,true,'da_dang','kiem-tra-thang',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',$6)",[code,owner,[cid],JSON.stringify(material),JSON.stringify(exam),isTest]);
 }
 for(const [sid,session] of [[real,cookie],[test,testCookie]])await q("insert into mtm_hw_private.btvn_identity_sessions(student_id,digest,expires_at) values($1,mtm_hw_private.token_digest('btvn-identity',$2),clock_timestamp()+interval '1 day')",[sid,session]);
 const created=createDraft(exam,'qa-attempt',Date.now());assert.ok(created.ok);const draft=[created.value];
 for(const [sid,code] of [[real,lesson],[test,testLesson]])await q('insert into mtm_hw_private.btvn_work(student_id,lesson_code,drafts) values($1,$2,$3)',[sid,code,JSON.stringify(draft)]);
 await check('test flag cannot relabel real accounts, lessons or a cleanup target',async()=>{
  await denied(()=>q('update mtm_hw_private.students set is_test=true where id=$1',[real]));
  await denied(()=>q('update mtm_hw_private.btvn_lessons set is_test=true where code=$1',[lesson]));
 });
 await check('real/test cannot write each other lesson; scoped read also rejects',async()=>{
  for(const [sid,code,session] of [[real,testLesson,cookie],[test,lesson,testCookie]]){
   await denied(()=>q('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$2)',[sid,code]));
   await denied(()=>rpc('mtm_btvn_read_scoped100',{p_session:session,p_lesson:code}));
  }
  for(const [session,code] of [[cookie,lesson],[testCookie,testLesson]]){
   const snap=await rpc('mtm_btvn_read_scoped100',{p_session:session,p_lesson:code});
   assert.equal(snap.material.lessonCode,code);assert.deepEqual(snap.lessons.map((x:any)=>x.lessonCode),[code]);
  }
 });
 await check('no test account/lesson in scorebook, admin score export or opening materials',async()=>{
  const book=await rpc('mtm_btvn_scorebook_real100',{p_from:'2026-10-01',p_apply:false});
  assert.ok(book.length>0);assert.ok(book.every((r:any)=>r.studentId===real&&r.lessonCode===lesson));
  const rows=await admin('mtm_btvn_admin_scores_real100',{p_lesson:lesson});assert.equal(rows.length,1);
  await denied(()=>admin('mtm_btvn_admin_scores_real100',{p_lesson:testLesson}));
  const materials=await rpc('mtm_btvn_opening_materials_real100',{p_code:null});assert.ok(materials.every((r:any)=>r.lessonCode!==testLesson));
 });
 await q("insert into mtm_hw_private.btvn_monthly_scores(student_id,month,score) values($1,date_trunc('month',current_date)::date,8),($2,date_trunc('month',current_date)::date,10)",[real,test]);
 await check('rank 1 belongs to real fixture; test excluded before top/arena/averages',async()=>{
  const rows=await rpc('mtm_btvn_leaderboard_class_real100',{p_cohort:'2K10',p_kind:'kiem-tra-thang',p_class:'2K10 9+'});
  assert.deepEqual(rows.map((r:any)=>[r.fullName,r.rank,r.score]),[['Real fixture',1,8]]);
  const mine=await rpc('mtm_btvn_my_rank_real100',{p_session:testCookie,p_cohort:'2K10',p_kind:'kiem-tra-thang',p_class:'2K10 9+'});assert.ok(mine===null||Array.isArray(mine)&&mine.length===0);
  const arena=await rpc('mtm_btvn_arena_real100',{p_kind:'kiem-tra-thang'});const c=arena.cohorts.find((c:any)=>c.cohort==='2K10');assert.equal(c.ranked,1);assert.equal(c.top[0].score,8);assert.equal(c.classes[0].avg,8);
 });
 await check('parent child list/report rejects QA; parent real lesson progress remains visible',async()=>{
  await q("insert into mtm_hw_private.parent_accounts(phone,parent_name,pin_hash) values('0900000001','Synthetic parent','fixture-hash')");
  for(const sid of [real,test])await q("insert into mtm_hw_private.parent_links(phone,student_id) values('0900000001',$1)",[sid]);
  const session='c'.repeat(64);
  await q("insert into mtm_hw_private.parent_sessions(digest,phone,expires_at) values(mtm_hw_private.token_digest('mtm-ph',$1),'0900000001',clock_timestamp()+interval '1 day')",[session]);
  const children=await rpc('mtm_ph_children_real100',{p_session:session});assert.deepEqual(children.children.map((x:any)=>x.id),[real]);
  await denied(()=>rpc('mtm_ph_child_session_real100',{p_session:session,p_student_id:test}));
  await denied(()=>rpc('mtm_ph_extras_real100',{p_session:session,p_student_id:test}));
  const tmp=await rpc('mtm_ph_child_session_real100',{p_session:session,p_student_id:real});
  const snap=await rpc('mtm_btvn_read_real100',{p_session:tmp,p_lesson:lesson});assert.deepEqual(snap.lessons.map((x:any)=>x.lessonCode),[lesson]);
 });
 await check('class sessions and Sheets CSV omit test fixture before reporting',async()=>{
  await q("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode) values('2K10 9+',extract(isodow from current_date)::int,'17:30','19:30','Offline') on conflict do nothing");
  const rows=(await q('select * from mtm_hw_private.hv_ca_rows_real100(current_date,current_date)')).rows;
  assert.ok(rows.length>0);assert.ok(!JSON.stringify(rows).includes('Test fixture'));assert.ok(JSON.stringify(rows).includes('Real fixture'));
  const csv=await rpc('mtm_btvn_sheet_csv6_real100',{p_tab:'cahomnay'});assert.ok(!String(csv).includes('Test fixture'));assert.ok(String(csv).includes('Real fixture'));
 });
 await check('Phong thi rank omits test student and test account before row_number',async()=>{
  const tk=await one("insert into mtm_phong_thi.tai_khoan(sdt,ten,mat_khau,is_test) values('0900000002','Test external','scrypt$fixture$fixture',true) returning id");
  for(const [i,sid,account,score] of [[1,real,null,8],[2,test,null,10],[3,null,tk,10]])await q("insert into mtm_phong_thi.luot(nonce,de,loai,nguoi,hoc_sinh,tai_khoan,diem,thang,dung,tong,giay,qua_gio,chi_tiet,ten_hien_thi) values($1,'qa-pt','thpt',$2,$3,$4,$5,10,1,1,100,false,'{}',$6)",['qa-nonce-'+i,'hs:fixture'+i,sid,account,score,i===1?'Real fixture':'Test fixture']);
  const rows=await rpc('mtm_pt_xep_hang_real100',{p_de:'qa-pt',p_limit:50});assert.equal(rows.length,1);assert.equal(rows[0].hang,1);assert.equal(rows[0].diem,8);
  const args={p_nonce:'qa-write-real',p_de:'qa-pt',p_loai:'thpt',p_nguoi:'hs:'+real,p_hoc_sinh:real,p_tai_khoan:null,p_diem:7,p_thang:10,p_dung:1,p_tong:1,p_giay:100,p_qua_gio:false,p_chi_tiet:{},p_ten:'Real writer',p_dot:null,p_sbd:null};
  const written=await rpc('mtm_pt_ghi_luot_real100',args);assert.equal(written.hang,2);
  const qa={...args,p_nonce:'qa-write-test',p_nguoi:'hs:'+test,p_hoc_sinh:test,p_diem:10,p_ten:'Test writer'};
  const testWrite=await rpc('mtm_pt_ghi_luot_real100',qa);assert.equal(testWrite.isTest,true);assert.equal(testWrite.hang,undefined);
  await rpc('mtm_pt_ghi_luot_real100',qa);assert.equal(await one("select count(*)::int from mtm_phong_thi.luot where nonce='qa-write-test'"),1);
  const ph=await rpc('mtm_pt_bao_phu_huynh_real100',{p_tu:today,p_den:today});assert.ok(ph.length>0);assert.ok(ph.every((r:any)=>r.hocSinh===real));
 });
 await check('official manual grader refuses test student/lesson',async()=>{
  await denied(()=>q("insert into mtm_hw_private.btvn_manual_grades(student_id,lesson_code,attempt_id,score,receipt_hash,context_hash,graded_by) values($1,$2,'qa-attempt',10,sha256('a'::bytea),sha256('b'::bytea),$3)",[test,testLesson,owner]));
 });
 await check('real repository saves/submits valid QA exam via scoped snapshot and actual commit RPC',async()=>{
  const repo=new SupabaseHomeworkRepository({rpc:async(name,args)=>{try{return {data:await rpc(productionRpc(name),args),error:null};}catch(e:any){return {data:null,error:{code:e.code}};}}},async()=>{throw Error('No login transport in fixture');});
  const saved=await repo.call(testCookie,'save',testLesson,'qa-attempt',{'qa-mc':'A'});assert.equal(saved.saveOnly,true);
  const submitted=await repo.call(testCookie,'submit',testLesson,'qa-attempt',{'qa-mc':'A'});assert.equal(submitted.receipts.length,1);assert.equal(submitted.receipts[0].score,null);
  assert.equal((await one('select jsonb_array_length(receipts) from mtm_hw_private.btvn_work where student_id=$1',[test])),1);
 });
 await check('anon, non-admin, another admin and service_role cannot purge; real denied with zero Storage calls',async()=>{
  for(const [role,actor] of [['anon',''],['authenticated',nonadmin],['authenticated',other],['service_role',owner]])await denied(()=>rpc('mtm_test_cleanup_prepare100',{p_student:test},role,actor));
  for(const sid of [real,'00000000-0000-4000-8000-000000000000'])assert.equal((await cleanupTestStudent(sqlPort,sid)).status,403);
  assert.equal(removals,0);assert.equal(await one('select count(*)::int from mtm_test100.cleanup_jobs'),0);
 });
 await check('shared HTTP route denies real accounts, non-admin and other owner before Storage',async()=>{
  for(const [sid,auth] of [[real,'Bearer owner-fixture'],[test,'Bearer nonadmin-fixture'],[test,'Bearer other-fixture']])assert.equal((await cleanupRequest(sid,auth)).status,403);
  assert.equal(removals,0);assert.equal(await one('select count(*)::int from mtm_test100.cleanup_jobs'),0);
 });
 // Real createEssayHandler + 099 reservation/confirm RPC. Bytes are held by an
 // explicit local Storage emulator, not a Supabase service or a metadata-only test.
 const essay=createEssayHandler({rpc:async(name,args)=>{try{return {data:await rpc(name,args),error:null};}catch(e:any){return {data:null,error:{code:e.code}};}},storage:{from:bucket=>({
  createSignedUploadUrl:async(path)=>({data:{signedUrl:'https://storage.invalid/'+path},error:null}),
  download:async(path)=>{const bytes=blobs.get(bucket+'/'+path);return bytes?{data:new Blob([bytes],{type:'image/jpeg'}),error:null}:{data:null,error:{}};}
 })}});
 let testPath='',realPath='';
 await check('submit real JPEG bytes for real and QA through real 099 reserve/confirm',async()=>{
  for(const [sid,code,session] of [[real,lesson,cookie],[test,testLesson,testCookie]]){
   const signed=await essay({action:'essay-sign',lessonCode:code,attemptId:'qa-attempt',sha256:sha,bytes:jpeg.length},'mtm_btvn_demo='+session);assert.equal(signed.status,200);
   const path=await one('select storage_path from mtm_hw_private.tu_luan_images where student_id=$1',[sid]);
   blobs.set(ESSAY_BUCKET+'/'+path,jpeg);
   await q("insert into storage.objects(bucket_id,name,metadata) values('mtm-tu-luan',$1,$2)",[path,JSON.stringify({size:jpeg.length,mimetype:'image/jpeg'})]);
   const received=await essay({action:'essay-confirm',lessonCode:code,attemptId:'qa-attempt',sha256:sha,bytes:jpeg.length},'mtm_btvn_demo='+session);assert.equal(received.status,200);assert.ok((received.body as any).image.receivedAt);
   if(sid===test)testPath=path;else realPath=path;
  }
  const orphan=owner+'/'+test.toUpperCase()+'/orphan.jpg';blobs.set(ESSAY_BUCKET+'/'+orphan,jpeg);blobs.set('unrelated/'+orphan,jpeg);
  await q("insert into storage.objects(bucket_id,name,metadata) values('mtm-tu-luan',$1,'{}'),('unrelated',$1,'{}')",[orphan]);
 });
 const realRows=await one("select jsonb_build_object('work',(select to_jsonb(w) from mtm_hw_private.btvn_work w where student_id=$1),'image',(select to_jsonb(i) from mtm_hw_private.tu_luan_images i where student_id=$1),'object',(select to_jsonb(o) from storage.objects o where name=$2))",[real,realPath]);
 await check('Storage failure leaves receipt/work for retry; finish refuses remaining objects',async()=>{
  failRemove=true;assert.equal((await cleanupRequest(test)).status,503);failRemove=false;
  assert.equal(await one('select count(*)::int from mtm_hw_private.tu_luan_images where student_id=$1',[test]),1);
  const job=await admin('mtm_test_cleanup_prepare100',{p_student:test});await assert.rejects(()=>admin('mtm_test_cleanup_finish100',{p_job:job.jobId}),(e:any)=>e.code==='55000');
  await denied(()=>q('update mtm_hw_private.btvn_work set revision=revision+1 where student_id=$1',[test]));
 });
 await check('retry removes QA bytes + metadata + submission/work; real rows/bytes exactly preserved',async()=>{
  const done=await cleanupRequest(test);assert.equal(done.status,200);assert.equal(done.body.imagesDeleted,1);assert.equal(done.body.worksDeleted,1);
  assert.equal(blobs.has(ESSAY_BUCKET+'/'+testPath),false);assert.equal(await one('select count(*)::int from storage.objects where name=$1',[testPath]),0);
  for(const table of ['tu_luan_images','btvn_work','btvn_monthly_scores'])assert.equal(await one('select count(*)::int from mtm_hw_private.'+table+' where student_id=$1',[test]),0);
  assert.deepEqual(await one("select jsonb_build_object('work',(select to_jsonb(w) from mtm_hw_private.btvn_work w where student_id=$1),'image',(select to_jsonb(i) from mtm_hw_private.tu_luan_images i where student_id=$1),'object',(select to_jsonb(o) from storage.objects o where name=$2))",[real,realPath]),realRows);
  assert.deepEqual(blobs.get(ESSAY_BUCKET+'/'+realPath),jpeg);
  const orphan=owner+'/'+test.toUpperCase()+'/orphan.jpg';assert.equal(blobs.has(ESSAY_BUCKET+'/'+orphan),false);assert.equal(blobs.has('unrelated/'+orphan),true);
  assert.equal((await cleanupTestStudent(sqlPort,real)).status,403);
 });
 await check('retired account cannot resurrect images via old signed path; repeated cleanup idempotent',async()=>{
  await denied(()=>q("insert into storage.objects(bucket_id,name,metadata) values('mtm-tu-luan',$1,'{}')",[testPath]));
  await denied(()=>q("insert into storage.objects(bucket_id,name,metadata) values('mtm-tu-luan',$1,'{}')",[testPath.toUpperCase()]));
  await denied(()=>q('insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,$2)',[test,testLesson]));
  await denied(()=>q('update mtm_hw_private.students set is_test=false where id=$1',[test]));
  const again=await cleanupRequest(test);assert.equal(again.status,200);assert.equal(again.body.alreadyFinished,true);
 });
 await check('web production transports use new RPCs; projection removes explicit test rows',async()=>{
  assert.equal(productionRpc('mtm_btvn_read'),'mtm_btvn_read_scoped100');assert.equal(productionRpc('mtm_btvn_admin_scores'),'mtm_btvn_admin_scores_real100');assert.equal(productionRpc('mtm_btvn_commit'),'mtm_btvn_commit');
  assert.deepEqual(scorebookResult('scorebook',[{is_test:true}]),[]);
 });
 await check('HTTP cleanup rejects wrong method, origin/host, missing JWT and injected fields',async()=>{
  const beforeClients=cleanupClients;
  assert.equal((await cleanupRequest(test,'Bearer owner-fixture',{method:'GET'})).status,405);
  for(const headers of [{host:'foreign.invalid',origin:'https://foreign.invalid'},{host:'foreign.invalid',origin:'https://minhthanhmath.vn'}])assert.equal((await cleanupRequest(test,'',{headers})).status,403);
  for(const auth of ['', 'Basic fixture', 'Bearer invalid token'])assert.equal((await cleanupRequest(test,auth)).status,401);
  for(const extra of [{path:realPath},{bucket:ESSAY_BUCKET},{owner},{is_test:true},{ph:'state'}])assert.equal((await cleanupRequest(test,'Bearer owner-fixture',{body:{action:'test-cleanup',studentId:test,...extra}})).status,400);
  assert.equal(cleanupClients,beforeClients);
  assert.equal((await cleanupRequest('invalid-uuid')).status,400);
 });
 mkdirSync('.qa-temp/is-test',{recursive:true});writeFileSync('.qa-temp/is-test/results.json',JSON.stringify({postgres:await one('select version()'),baselineMigrations:applied,passed:checks.length,checks,storage:'local byte emulator + real PostgreSQL metadata; no native Supabase Storage service',liveDatabaseTouched:false},null,2));
 console.log('IS_TEST SQL+BYTES '+checks.length+'/'+checks.length);
}catch(e:any){console.error('IS_TEST FAILURE',e.message,e.code??'',e.where??'',e.detail??'');process.exitCode=1;}finally{await db.close();}
