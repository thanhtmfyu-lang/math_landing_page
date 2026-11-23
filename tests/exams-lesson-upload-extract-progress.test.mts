import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {handleLessonUploadGateway} from '../server/lesson-upload/gateway';
import {createLessonGatewayClient} from '../server/lesson-upload/publisher-client';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {runUploadOnce,type Pipeline,type PrivateState} from '../server/lesson-upload/worker';
import {extractYield,type ExtractionYield} from '../server/lesson-upload/extract-progress';

const hashes={sourceVersion:'a'.repeat(64),plan_hash:'b'.repeat(64),progress_hash:'c'.repeat(64)};
const yielded:ExtractionYield={...hashes,status:'yielded_extract',progress_count:1};
assert.deepEqual(extractYield(yielded),yielded);
assert.equal(extractYield({...yielded,questions:[]}),null);
assert.equal(extractYield({...yielded,progress_count:129}),null);
assert.equal(extractYield({...yielded,progress_count:1.5}),null);
assert.equal(extractYield({...yielded,plan_hash:'B'.repeat(64)}),null);

const migration=(name:string)=>readFileSync('supabase/migrations-pending/'+name,'utf8');
const {db}=await baselineDatabase();
const id='11111111-1111-4111-8111-111111111111', classId='22222222-2222-4222-8222-222222222222';
const owner='33333333-3333-4333-8333-333333333333',pair='44444444-4444-4444-8444-444444444444';
const svc=async(payload:Record<string,unknown>,route='mtm_lesson_upload_gateway')=>db.transaction(async tx=>{
 await tx.exec("set local role service_role;select set_config('request.jwt.claim.role','service_role',true)");
 return (await tx.query('select public.'+route+'($1) v',[JSON.stringify(payload)])).rows[0].v;
});
const row=async(uploadId=id)=>(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[uploadId])).rows[0];
const claim=(options:Record<string,unknown>={})=>svc({action:'worker_claim',worker_protocol:110,worker_id:'extract-fixture',auto:true,...options});
const expire=async(uploadId=id)=>db.query("update mtm_hw_private.lesson_uploads set next_retry_at=clock_timestamp()-interval '1 second' where id=$1",[uploadId]);
const step=(uploadId:string,token:string,paper:number,n:number,status='dang')=>svc({
 action:'worker_checkpoint',upload_id:uploadId,claim_token:token,paper,step:n,status,detail:'Fixture',checkpoint:{},
});
const evidence=(uploadId:string,token:string,paper:number,count:number,digest:string)=>({
 action:'worker_yield_extract',upload_id:uploadId,claim_token:token,version:1,paper,
 source_version:hashes.sourceVersion,plan_hash:hashes.plan_hash,progress_count:count,progress_hash:digest,
});
try{
 await db.exec(migration('202610270100_is_test.sql'));
 await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 alter role service_role bypassrls;`);
 for(const name of ['202611080106_btvn_han_tu_ghi.sql','202611020101_cong_up_btvn_gv.sql',
  '202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql',
  '202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql','202611130110_lesson_assessment.sql'])await db.exec(migration(name));
 const metadata=async()=>(await db.query(`select oid,proacl::text,proowner,prosecdef,proconfig from pg_proc where oid in
   ('public.mtm_lesson_upload_gateway(jsonb)'::regprocedure,'public.mtm_lesson_upload_api(jsonb)'::regprocedure,
    'mtm_hw_private.lesson_retry_reason108(text)'::regprocedure) order by oid`)).rows;
 const before=await metadata();
 await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role');
 await db.exec(migration('202611230125_lesson_extract_yield.sql'));
  await db.exec(migration('202611230132_lesson_long_pdf_locator_reason.sql'));
  await db.exec(migration('202611230132_lesson_long_pdf_locator_reason.sql'));
 assert.deepEqual(await metadata(),before);
 const privateAcl=(await db.query(`select
  has_function_privilege('service_role','mtm_hw_private.lesson_upload_extract_yield125(jsonb)','EXECUTE') as svc,
  has_table_privilege('authenticated','mtm_hw_private.lesson_upload_extract_progress125','SELECT') as staff,
  has_function_privilege('authenticated','public.mtm_lesson_upload_gateway(jsonb)','EXECUTE') as gateway`)).rows[0];
 assert.deepEqual(privateAcl,{svc:false,staff:false,gateway:false});
 assert.match((await db.query("select mtm_hw_private.lesson_retry_reason108('NATIVE_LONG_PDF_BRANDING_REVIEW_REQUIRED') v")).rows[0].v,/dấu nguồn/);
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture','Fixture','admin','thaythanh')",[owner]);
 const make=async(uploadId:string,isPair=false)=>{
  await db.query(`insert into mtm_hw_private.lesson_uploads(id,class_ids,class_dates,start_times,end_times,class_names,due_at_by_class,
    lesson_date,teacher_key,title,task_scope,homework_path,answer_path,homework2_path,answer2_path,task_scope2,
    uploaded_by,version,group_key,retry_count,attempt_count,last_error_code)
    values($1::uuid,array[$2::uuid],jsonb_build_object($2::uuid::text,$4::text),jsonb_build_object($2::uuid::text,'17:30'),jsonb_build_object($2::uuid::text,'19:30'),
    jsonb_build_object($2::uuid::text,'Fixture class'),jsonb_build_object($2::uuid::text,($4::text::date+7)::text||'T10:00:00Z'),$4::text::date,
    'thaythanh','Fixture long intake','Fixture scope','fixture-hs.pdf','fixture-gv.pdf',$5,$6,$7,$3,1,$1::uuid::text,2,2,'NATIVE_DRIVER_TIMEOUT')`,
    [uploadId,classId,owner,isPair?'2026-11-25':'2026-11-24',isPair?'fixture-hs2.pdf':null,isPair?'fixture-gv2.pdf':null,isPair?'Fixture scope 2':null]);
  await db.query("insert into mtm_hw_private.lesson_upload_steps select $1,step,case step when 1 then 'xong' else 'cho' end,'',clock_timestamp() from generate_series(1,6)step",[uploadId]);
  if(isPair)await db.query("insert into mtm_hw_private.lesson_upload_paper2_steps select $1,step,case step when 1 then 'xong' else 'cho' end,'',clock_timestamp() from generate_series(1,6)step",[uploadId]);
 };
 await svc({action:'worker_automation_config',enabled:true});
 await make(id);
 const originalDue=(await row()).due_at_by_class;
 // Source types outside the bounded protocol keep existing claim shape.
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.query('update mtm_hw_private.lesson_uploads set answer_path=null,answer_text=$2 where id=$1',[id,'Fixture answer key']);
  await tx.exec("set local role service_role;select set_config('request.jwt.claim.role','service_role',true)");
  const legacy=(await tx.query('select public.mtm_lesson_upload_gateway($1) v',[
   JSON.stringify({action:'worker_claim',worker_id:'legacy-fixture'}),
  ])).rows[0].v;
  assert.equal(legacy.job.extract_progress,undefined);
  throw Error('ROLLBACK_FIXTURE');
 }),/ROLLBACK_FIXTURE/);
 let seen:unknown;
 const readPapers:number[]=[];
 const pipeline:Pipeline={extractor:{provider:'codex',model:'fixture'},async read(job){readPapers.push(job.paper??1);seen=job.extract_progress;return yielded;},
  async build(){assert.fail('build after yield');},async review(){assert.fail('review after yield');},
  async materials(){assert.fail('materials after yield');}};
 const state:PrivateState={async save(){assert.fail('whole-source checkpoint after yield');},async load(){assert.fail('unexpected load');}};
 const port={rpc(action:string,payload:Record<string,unknown>){assert.equal(action,'lesson_upload_gateway');return svc(payload);},async upload(){assert.fail('publish asset after yield');}};
 const fakeGateway=createLessonGatewayClient('https://fixture.invalid/functions/v1/mtm-btvn-publish','fixture-only-secret-'.repeat(3),
  async(_url,init)=>Response.json(await handleLessonUploadGateway(port,JSON.parse(String(init?.body)))));
 const repo=createWorkerRepository(fakeGateway,{auto:true});
 const result=await runUploadOnce(repo,pipeline,state,'fixture');
 assert.deepEqual(result,{status:'yielded_extract',uploadId:id});
 assert.deepEqual(seen,{});
 const after=await row();
 assert.equal(after.attempt_count,2);
 assert.equal(after.retry_count,2);
 assert.equal(after.last_error_code,'NATIVE_DRIVER_TIMEOUT');
 assert.equal(after.retry_status,'retry_wait');
 assert.deepEqual(after.checkpoint,{});
 assert.deepEqual(after.due_at_by_class,originalDue);
 assert(after.next_retry_at>after.lease_until);
 assert.equal((await claim()).job,null);
 const replay=evidence(id,after.claim_token,1,1,hashes.progress_hash);
 assert.equal((await svc(replay)).already_applied,true);
 assert.equal((await row()).attempt_count,2);
 await assert.rejects(()=>svc({...replay,progress_count:2}),/EXTRACT_YIELD_CLAIM_ALREADY_CREDITED/);
 await assert.rejects(()=>svc({...replay,version:2}),/STALE_UPLOAD_OR_LEASE/);
 await assert.rejects(()=>handleLessonUploadGateway(port,{action:'lesson_upload_worker',payload:{...replay,sourceVersion:hashes.sourceVersion}}),/INVALID_EXTRACT_YIELD_PAYLOAD/);
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.exec("set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true)");
  return tx.query('select public.mtm_lesson_upload_api($1)',[JSON.stringify(replay)]);
 }),/SERVICE_ROLE_REQUIRED/);
 await expire();
 const second=(await svc({action:'worker_claim',worker_protocol:110,worker_id:'fixture',auto:true},'mtm_lesson_upload_api')).job;
 assert.equal(second.id,id);
 assert.deepEqual(second.extract_progress,{'1':{...hashes,progress_count:1}});
 assert.equal(second.attempt_count,3);
 await assert.rejects(()=>svc(replay),/STALE_UPLOAD_OR_LEASE/);
 const next=evidence(id,second.claim_token,1,2,'d'.repeat(64));
 await assert.rejects(()=>svc({...next,plan_hash:'e'.repeat(64)}),/EXTRACT_YIELD_BINDING_CHANGED/);
 await assert.rejects(()=>svc({...next,source_version:'e'.repeat(64)}),/EXTRACT_YIELD_BINDING_CHANGED/);
 await assert.rejects(()=>svc({...next,progress_count:129}),/EXTRACT_YIELD_PROGRESS_LIMIT/);
 await assert.rejects(()=>svc({...next,progress_count:1}),/EXTRACT_YIELD_PROGRESS_NOT_MONOTONE/);
 await assert.rejects(()=>svc({...next,progress_hash:hashes.progress_hash}),/EXTRACT_YIELD_PROGRESS_NOT_MONOTONE/);
 await assert.rejects(()=>svc({...next,paper:2}),/EXTRACT_YIELD_SCOPE_REQUIRED/);
 assert.equal((await svc(next)).status,'yielded_extract');
 await expire();
 const third=(await claim()).job;
 assert.equal(third.extract_progress['1'].progress_count,2);
 assert.equal(third.attempt_count,3);
 const timeout=await svc({action:'worker_record_failure',upload_id:id,claim_token:third.claim_token,step:2,paper:1,code:'NATIVE_DRIVER_TIMEOUT'});
 assert.equal(timeout.status,'retry_exhausted');
 assert.equal((await row()).retry_count,3);
 assert.equal((await claim()).job,null);

 // A new version of the same row starts its own progress ledger.
 await db.query(`update mtm_hw_private.lesson_uploads set version=2,title='Fixture replacement title',
   homework_path='fixture-hs-v2.pdf',attempt_count=0,retry_status='queued',next_retry_at=null where id=$1`,[id]);
 await db.query("update mtm_hw_private.lesson_upload_steps set status='cho' where upload_id=$1 and step=2",[id]);
 const replacement=(await claim()).job;
 assert.equal(replacement.id,id);
 assert.equal(replacement.version,2);
 assert.deepEqual(replacement.extract_progress,{});
 assert.equal(replacement.extract_progress_invalid,undefined);
 await step(id,replacement.claim_token,1,2);
 const replacementEvidence={...evidence(id,replacement.claim_token,1,1,'9'.repeat(64)),version:2,
   source_version:'8'.repeat(64),plan_hash:'7'.repeat(64)};
 await assert.rejects(()=>svc({...replacementEvidence,version:1}),/STALE_UPLOAD_OR_LEASE/);
 assert.equal((await svc(replacementEvidence)).status,'yielded_extract');
 const receipts=(await db.query(`select version,progress_count from mtm_hw_private.lesson_upload_extract_progress125
   where upload_id=$1 and paper=1 order by version`,[id])).rows;
 assert.deepEqual(receipts,[{version:1,progress_count:2},{version:2,progress_count:1}]);
 await expire();
 const replacementResumed=(await claim()).job;
 assert.deepEqual(replacementResumed.extract_progress,{'1':{sourceVersion:replacementEvidence.source_version,
  plan_hash:replacementEvidence.plan_hash,progress_count:1,progress_hash:replacementEvidence.progress_hash}});
 await db.query("update mtm_hw_private.lesson_uploads set title='Changed in same version' where id=$1",[id]);
 await assert.rejects(()=>svc({...replacementEvidence,claim_token:replacementResumed.claim_token,
  progress_count:2,progress_hash:'6'.repeat(64)}),/EXTRACT_YIELD_BINDING_CHANGED/);
 await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[id]);
 readPapers.length=0;
 assert.deepEqual(await runUploadOnce(repo,pipeline,state,'fixture'),{status:'blocked',uploadId:id,code:'EXTRACT_YIELD_BINDING_CHANGED'});
 assert.deepEqual(readPapers,[]);
 assert.equal((await row()).retry_status,'needs_input');

 // The normal pair path returns after paper 1 yields. Paper 2 and publication never start.
 await make(pair,true);
 assert.deepEqual(await runUploadOnce(repo,pipeline,state,'fixture'),{status:'yielded_extract',uploadId:pair});
 assert.deepEqual(readPapers,[1]);
 const untouchedPaperTwo=(await db.query('select status,detail from mtm_hw_private.lesson_upload_paper2_steps where upload_id=$1 and step=2',[pair])).rows[0];
 assert.deepEqual(untouchedPaperTwo,{status:'cho',detail:''});
 assert.equal((await row(pair)).finished_at,null);
 assert.equal((await row(pair)).checkpoint.publish_receipts,undefined);
 await expire(pair);
 const paired=(await claim()).job;
 assert.equal(paired.id,pair);
 for(const n of [2,3])await step(pair,paired.claim_token,1,n,'xong');
 await step(pair,paired.claim_token,1,4);
 assert.equal((await svc({action:'worker_wait_review',upload_id:pair,claim_token:paired.claim_token,paper:1,request_hash:'e'.repeat(64),source_version:'f'.repeat(64)})).allowed,false);
 assert.equal((await row(pair)).attempt_count,2);
 await step(pair,paired.claim_token,2,2);
 const paperTwo=evidence(pair,paired.claim_token,2,1,'f'.repeat(64));
 assert.equal((await svc(paperTwo)).status,'yielded_extract');
 assert.equal((await row(pair)).attempt_count,2);
 assert.equal((await row(pair)).retry_count,2);
 await expire(pair);
 const resumedPair=(await claim()).job;
 assert.deepEqual(Object.keys(resumedPair.extract_progress).sort(),['1','2']);
 assert.equal(resumedPair.extract_progress['2'].progress_hash,'f'.repeat(64));
  const locatorFailure=await svc({action:'worker_record_failure',upload_id:pair,
   claim_token:resumedPair.claim_token,step:2,paper:2,code:'NATIVE_LONG_PDF_LOCATOR_UNRESOLVED'});
  assert.equal(locatorFailure.can_retry,false);
  assert.equal(locatorFailure.last_error_code,'NATIVE_LONG_PDF_LOCATOR_UNRESOLVED');
  assert.match(locatorFailure.reason,/Kiểm tra số phần, số câu và thứ tự/);
  assert.deepEqual((await db.query('select status,detail from mtm_hw_private.lesson_upload_paper2_steps where upload_id=$1 and step=2',[pair])).rows[0],
    {status:'loi',detail:locatorFailure.reason});
  assert.equal((await row(pair)).retry_status,'needs_input');
 assert.equal((await db.query('select count(*) n from mtm_hw_private.lesson_publish_capability')).rows[0].n,0);
}finally{await db.close();}
console.log('Step-2 yield: parser, Edge worker, direct/service SQL, current/version/paper, one refund, real timeout cap, no publish: passed (PGlite synthetic).');
