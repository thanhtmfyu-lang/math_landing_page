// LOCAL candidate112 through the complete canonical migration chain. Synthetic evidence ONLY.
// @ts-nocheck
import {baselineDatabase} from './is-test-db.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='.qa-temp/context112-sql-tests/';mkdirSync(dir,{recursive:true});const raw=readFileSync('supabase/migrations-pending/202611140111_lesson_upload_operator_continuation.sql','utf8');
const target='14227822-ce9a-4f0f-8df3-489a60b11392',owner='d7ec8afe-76bc-4d86-90a6-fd689ea60895',classId='0d31a7f2-1da1-4b03-b248-22c260d1c713';
const source='78cf60e22fa55962e11391814a0fb7c157dc9f1936ce2b3a8d8551e9af89ba45',manifest='a'.repeat(64),runtime='b'.repeat(64),fix='c'.repeat(40),authority='synthetic-fixture-owner-decision';
const {db}=await baselineDatabase();let checks=0;
process.on('uncaughtException',error=>{console.error(JSON.stringify({status:'FAIL',checks,message:error.message,where:error.where,stack:error.stack?.split('\n').slice(-3)}));process.exitCode=1;});
const row=async()=>(await db.query('select to_jsonb(u) v from mtm_hw_private.lesson_uploads u where id=$1',[target])).rows[0].v;
const grantRow=async()=>(await db.query('select to_jsonb(g) v from mtm_hw_private.lesson_continuation142 g')).rows[0]?.v;
const svc=async p=>(await db.query('select public.mtm_lesson_upload_gateway($1) v',[JSON.stringify(p)])).rows[0].v;
const acl=async name=>(await db.query("select jsonb_agg(jsonb_build_object('grantee',x.grantee,'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type) v from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid=$1::regprocedure",[name])).rows[0].v;
const oldRows=async()=>(await db.query('select jsonb_agg(to_jsonb(u) order by id) v from mtm_hw_private.lesson_uploads u where not is_test')).rows[0].v;
const fail=async(change,fn,pattern)=>{await db.exec('begin');await assert.rejects(async()=>{if(change)await db.exec(change);return fn();},pattern);await db.exec('rollback');checks++;};
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec("create or replace function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;alter role service_role bypassrls;select set_config('request.jwt.claim.role','service_role',false)");
 for(const n of ['202611080106_btvn_han_tu_ghi.sql','202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql','202611130108_lesson_upload_retry.sql','202611130109_lesson_staff_history.sql','202611130110_lesson_assessment.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+n,'utf8'));
 await db.query('insert into auth.users values($1)',[owner]);await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture-op','Synthetic operator','admin','thaythanh')",[owner]);
 await db.exec("update mtm_hw_private.lesson_upload_automation set enabled=true,activated_at='2026-11-13T02:49:20.506663Z'");
 const cp={operator_repairs:[{repair_id:'4e1e0b6d-0716-4d5a-9c3b-e1d3d0f6a8b2',retained:{exact:[null,1,'keep']}},{repair_id:'196cd98e-9de7-4db5-96e4-f6a19b58c98d',retained:'second audit exact'}]};
 const insert=`insert into mtm_hw_private.lesson_uploads(id,class_ids,class_dates,start_times,end_times,class_names,due_at_by_class,lesson_date,teacher_key,title,task_scope,homework_path,answer_path,uploaded_by,version,group_key,is_test,created_at,claim_token,lease_until,attempt_count,checkpoint,retry_count,retry_status,last_error_code,failed_step,failed_paper,failure_claim_token,client_request_id,work_kind)
 values($1,array[$2::uuid],jsonb_build_object($2::text,'2026-11-10'),jsonb_build_object($2::text,'17:30'),jsonb_build_object($2::text,'19:30'),jsonb_build_object($2::text,'Fixture class'),jsonb_build_object($2::text,'2026-11-17T12:30:00Z'),'2026-11-10','thaythanh','Fixture title','Fixture scope','fixture-homework.pdf','fixture-answer.pdf',$3,1,$4,$5,$6,'11111111-1111-4111-8111-111111111111',clock_timestamp()-interval '1 second',3,$7,3,'needs_input','NATIVE_DRIVER_FAILED',2,1,'11111111-1111-4111-8111-111111111111',$8,'homework')`;
 await db.query(insert,[target,classId,owner,'fixture-target',true,'2026-11-13T16:54:23.948178Z',JSON.stringify(cp),'8db1f8e3-a8e1-4252-8938-6bad1a724303']);
 for(let n=1;n<=5;n++)await db.query(insert,[`99999999-9999-4999-8999-${String(n).padStart(12,'0')}`,classId,owner,'fixture-old-'+n,false,'2026-11-12',JSON.stringify({historic:n}),`88888888-8888-4888-8888-${String(n).padStart(12,'0')}`]);
 await db.query("insert into mtm_hw_private.lesson_upload_steps select $1,step,case step when 1 then 'xong' when 2 then 'loi' else 'cho' end,'Historic failure evidence','2026-11-13T20:15:25Z' from generate_series(1,6)step",[target]);
 await db.exec("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private','fixture-homework.pdf','{}'),('mtm-lesson-private','fixture-answer.pdf','{}')");
 const hashes=(await db.query("select encode(sha256(convert_to('Fixture scope','UTF8')),'hex')scope,encode(sha256(convert_to('Fixture title','UTF8')),'hex')title,encode(sha256(convert_to(jsonb_build_array('fixture-homework.pdf','fixture-answer.pdf')::text,'UTF8')),'hex')paths,(select encode(sha256(convert_to(jsonb_agg(jsonb_build_object('id',id,'version',version,'attempt_count',attempt_count,'finished_at',finished_at,'published',checkpoint ? 'publish_receipts') order by id)::text,'UTF8')),'hex') from mtm_hw_private.lesson_uploads where not is_test)old")).rows[0];
 const adapted=raw.replaceAll('69998c845d132ca8737e0928699ccbc57dbe7dba3b31e76c408cf3b0af6258f9',hashes.scope).replaceAll('6e36f54c9ab24bd6af9252099f2a11dff16a52a469394a75ed0b650218a8f18b',hashes.title).replaceAll('299a63dc2903e7af6e53636902c38be8686a2c99386d5fe65edff91eafc3fa7b',hashes.paths).replaceAll('f121ccba4da5424452f78d93ce4cd976f81695b17d72aab33d648a1152745336',hashes.old);
 await db.exec(adapted);
 const expires=new Date(Date.now()+45*60000).toISOString();
 await db.query('select mtm_hw_private.lesson_grant_continuation142($1,$2,$3,$4,$5)',[manifest,runtime,fix,authority,expires]);
 const claim111={action:'worker_claim',operator_continuation:true,is_test:true,auto:false,upload_id:target,worker_protocol:111,worker_id:'synthetic-first-credit',runtime_manifest_sha256:manifest};
 const first=(await svc(claim111)).job;
 await svc({action:'worker_record_failure',upload_id:target,claim_token:first.claim_token,step:2,paper:1,code:'NATIVE_DRIVER_FAILED'});
 const oldGrant=await grantRow(),old=await oldRows(),before=await row();
 assert.equal(oldGrant.status,'failed');assert.equal(before.attempt_count,4);assert.equal(before.retry_count,3);checks++;
 const priorSHA=(await db.query("select encode(sha256(convert_to(to_jsonb(g)::text,'UTF8')),'hex') v from mtm_hw_private.lesson_continuation142 g")).rows[0].v;
 const candidate=readFileSync('supabase/migrations-pending/202611140112_lesson_upload_class_context.sql','utf8');
 const credit='22222222-2222-4222-8222-222222222222',diagnosis='d'.repeat(64),newManifest='e'.repeat(64),newReceipt='f'.repeat(64),newFix='1'.repeat(40);
 const candidateAdapted=candidate.replaceAll('f121ccba4da5424452f78d93ce4cd976f81695b17d72aab33d648a1152745336',hashes.old);
 const pins={CREDIT_UUID:credit,PRIOR_GRANT_SHA256:priorSHA,V7_ACTUAL_SHA256:diagnosis,NEW_RUNTIME_MANIFEST_SHA256:newManifest,NEW_RUNTIME_RECEIPT_SHA256:newReceipt,CONCRETE_FIX_COMMIT:newFix};
 const pinned=(omit)=>Object.entries(pins).reduce((sql,[key,value])=>key===omit?sql:sql.replace(`null/* ROOT_PIN_${key} */`,`'${value}'`),candidateAdapted);
 const issue=(overrides={})=>{
  const p={credit,priorSHA,diagnosis,newManifest,newReceipt,newFix,authority,expires,...overrides};
  return db.query('select mtm_hw_private.lesson_grant_continuation112($1,$2,$3,$4,$5,$6,$7,$8) v',[p.credit,p.priorSHA,p.diagnosis,p.newManifest,p.newReceipt,p.newFix,p.authority,p.expires]);
 };
 const creditRow=async()=>(await db.query('select to_jsonb(c) v from mtm_hw_private.lesson_continuation142_credit2 c')).rows[0]?.v;
 const apiAcl=await acl('public.mtm_lesson_upload_api(jsonb)'),gatewayAcl=await acl('public.mtm_lesson_upload_gateway(jsonb)');
 const reasonOID=(await db.query("select 'mtm_hw_private.lesson_retry_reason108(text)'::regprocedure::oid v")).rows[0].v,reasonACL=await acl('mtm_hw_private.lesson_retry_reason108(text)');
 const reason=async code=>(await db.query('select mtm_hw_private.lesson_retry_reason108($1) v',[code])).rows[0].v;
 const oldReasonCodes=['WORKER_RPC_FAILED','INDEPENDENT_ANSWER_MISMATCH','GATEWAY_AUTH_REQUIRED','NATIVE_SOURCE_INVENTORY_REQUIRED','NATIVE_SOURCE_INVENTORY_AMBIGUOUS','NATIVE_SOURCE_INVENTORY_PAGE_UNRESOLVED','NATIVE_SCOPE_UNRESOLVED','NATIVE_SCOPE_AMBIGUOUS','NATIVE_SCOPE_REF_MISSING','NATIVE_EXTRACT_INVENTORY_MISMATCH','NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED',null,'UNKNOWN','SYNTHETIC_PRIVATE_ERROR'];
 const oldReasons=await Promise.all(oldReasonCodes.map(reason));
 // A real inherited default EXECUTE grant must not leak through the new wrapper.
 await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role');
 const preDefaultAcl=await acl('public.mtm_lesson_upload_api(jsonb)');
 // An unlisted custom role inherited through owner default ACLs is detected
 // INSIDE the DDL transaction. Failure must leave no table, alias or new API.
 await db.exec('create role synthetic_unlisted_default_reader;alter default privileges grant execute on functions to synthetic_unlisted_default_reader');
 const originalApiOid=(await db.query("select 'public.mtm_lesson_upload_api(jsonb)'::regprocedure::oid v")).rows[0].v;
 await assert.rejects(()=>db.exec(pinned()),/CONTINUATION112_(API_ACL|GRADE_HELPER_ACL)_CHANGED/);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('mtm_hw_private.lesson_continuation142_credit2') v")).rows[0].v,null);
 assert.equal((await db.query("select to_regprocedure('public.mtm_lesson_upload_api_before_continuation112(jsonb)') v")).rows[0].v,null);
 assert.equal((await db.query("select to_regprocedure('mtm_hw_private.lesson_worker_grade_context112(mtm_hw_private.lesson_uploads)') v")).rows[0].v,null);
 assert.equal((await db.query("select 'public.mtm_lesson_upload_api(jsonb)'::regprocedure::oid v")).rows[0].v,originalApiOid);
 assert.deepEqual(await acl('public.mtm_lesson_upload_api(jsonb)'),preDefaultAcl);assert.deepEqual(await grantRow(),oldGrant);checks++;
 await db.exec('alter default privileges revoke execute on functions from synthetic_unlisted_default_reader;drop role synthetic_unlisted_default_reader');
 // The unfilled candidate and EACH individually absent real proof fail closed.
 for(const missing of [undefined,...Object.keys(pins)]){
  await db.exec('begin');await db.exec((missing===undefined?candidateAdapted:pinned(missing)).replace(/^begin;\s*$/m,'').replace(/commit;\s*$/i,''));
  await assert.rejects(()=>issue(),/CONTINUATION112_ACTUAL_PROOFS_REQUIRED/);
  await db.exec('rollback');assert.deepEqual(await grantRow(),oldGrant);checks++;
 }
 await db.exec(pinned());checks++;
 assert.equal((await db.query("select 'mtm_hw_private.lesson_retry_reason108(text)'::regprocedure::oid v")).rows[0].v,reasonOID);assert.deepEqual(await acl('mtm_hw_private.lesson_retry_reason108(text)'),reasonACL);assert.deepEqual(await Promise.all(oldReasonCodes.map(reason)),oldReasons);checks++;
 for(const [code,hint] of [['NATIVE_CLASS_METADATA_REQUIRED','khối lớp từ danh mục'],['NATIVE_CLASS_GRADE_AMBIGUOUS','khối khác nhau'],['NATIVE_CLASS_GRADE_CONFLICT','Khối ghi rõ trong tài liệu'],['NATIVE_CLASS_GRADE_MISMATCH','Bản dựng chưa khớp'],['NATIVE_CLASS_METADATA_CHANGED','Thông tin lớp đã thay đổi']]){
  assert.ok((await reason(code)).includes(hint));assert.equal((await db.query('select mtm_hw_private.lesson_retryable108($1) v',[code])).rows[0].v,false);checks++;
 }
 assert.deepEqual(await acl('public.mtm_lesson_upload_api(jsonb)'),preDefaultAcl);assert.deepEqual(await acl('public.mtm_lesson_upload_gateway(jsonb)'),gatewayAcl);checks++;
 assert.equal((await db.query("select has_function_privilege('anon','public.mtm_lesson_upload_api(jsonb)','EXECUTE') v")).rows[0].v,false);checks++;
 for(const role of ['anon','authenticated','service_role','mtm_btvn_publisher']){
  assert.equal((await db.query("select has_function_privilege($1,'mtm_hw_private.lesson_grant_continuation112(uuid,text,text,text,text,text,text,timestamptz)','EXECUTE') v",[role])).rows[0].v,false);
  assert.equal((await db.query("select has_function_privilege($1,'public.mtm_lesson_upload_api_before_continuation112(jsonb)','EXECUTE') v",[role])).rows[0].v,false);
  assert.equal((await db.query("select has_table_privilege($1,'mtm_hw_private.lesson_continuation142_credit2','SELECT,INSERT,UPDATE,DELETE') v",[role])).rows[0].v,false);checks++;
  assert.equal((await db.query("select has_function_privilege($1,'mtm_hw_private.lesson_worker_grade_context112(mtm_hw_private.lesson_uploads)','EXECUTE') v",[role])).rows[0].v,false);checks++;
 }
 // Existing authorized normal110/111 claims gain only factual class metadata.
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'Fixture class',11)",[classId,owner]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid])',[owner,classId]);
 const normalId='77777777-7777-4777-8777-777777777777';
 await db.query(insert,[normalId,classId,owner,'fixture-normal-grade',true,'2026-11-13T17:54:23Z','{}','88888888-8888-4888-8888-777777777777']);
 await db.query("update mtm_hw_private.lesson_uploads set attempt_count=0,retry_count=0,retry_status='queued',last_error_code=null,failed_step=null,failed_paper=null,failure_claim_token=null where id=$1",[normalId]);
 await db.query("insert into mtm_hw_private.lesson_upload_steps select $1,step,case step when 1 then 'xong' else 'cho' end,'Synthetic normal claim','2026-11-13T20:15:25Z' from generate_series(1,6)step",[normalId]);
 const normalClaim={action:'worker_claim',worker_protocol:110,is_test:true,worker_id:'normal-grade-context',auto:false};
 await assert.rejects(()=>db.transaction(async tx=>{await tx.exec("set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true)");return tx.query('select public.mtm_lesson_upload_api($1) v',[JSON.stringify(normalClaim)]);}),/SERVICE_ROLE_REQUIRED/);checks++;
 await db.exec('begin');const normal=(await svc(normalClaim)).job;
 assert.equal(normal.id,normalId);assert.equal(normal.attempt_count,1);assert.deepEqual(normal.class_grades,{[classId]:11});assert.equal(normal.grade_source,'managed_class_catalog');assert.equal(normal.class_grade_complete,true);assert.equal(normal.class_grade_issue,null);assert.equal('students' in normal,false);await db.exec('rollback');checks++;
 for(const change of ["update mtm_hw_private.classes set active=false", "update mtm_hw_private.classes set label='Different class'",'update mtm_hw_private.classes set grade=9',"update mtm_hw_private.btvn_publish_scope set class_ids=array[gen_random_uuid()]",`update mtm_hw_private.lesson_uploads set class_ids=array[class_ids[1],gen_random_uuid()] where id='${normalId}'`]){
  await db.exec('begin');await db.exec(change);const held=(await svc(normalClaim)).job;assert.equal(held.id,normalId);assert.equal(held.attempt_count,1);assert.equal(held.class_grade_complete,false);assert.equal(held.class_grade_issue,'CLASS_GRADE_METADATA_REQUIRED');assert.deepEqual(held.class_grades,{});assert.equal((await db.query('select attempt_count v from mtm_hw_private.lesson_uploads where id=$1',[normalId])).rows[0].v,1);await db.exec('rollback');checks++;
 }
 // Scope owner mismatch never exposes a class's grade, even with matching ID/name.
 await db.exec('begin');await db.query("insert into auth.users values('66666666-6666-4666-8666-666666666666')");await db.query("update mtm_hw_private.classes set owner_id='66666666-6666-4666-8666-666666666666'");assert.equal((await svc(normalClaim)).job.class_grade_complete,false);await db.exec('rollback');checks++;
 // Normal metadata fixture must not make another live job eligible during credit issuance.
 await db.query('delete from mtm_hw_private.lesson_upload_steps where upload_id=$1',[normalId]);await db.query('delete from mtm_hw_private.lesson_uploads where id=$1',[normalId]);
 // Exercise the ORIGINAL explicit111 claim branch in a rolled-back synthetic
 // authorized state; the source111 request object itself is unchanged.
 await db.exec('begin');await db.query("update mtm_hw_private.lesson_continuation142 set status='authorized',processing_credits_used=0 where upload_id=$1",[target]);await db.query("update mtm_hw_private.lesson_uploads set attempt_count=3,retry_status='queued' where id=$1",[target]);await db.query("update mtm_hw_private.lesson_upload_steps set status='cho' where upload_id=$1 and step=2",[target]);
 const delegated111=(await svc(claim111)).job;assert.equal(delegated111.attempt_count,4);assert.equal(delegated111.operator_continuation,true);assert.deepEqual(delegated111.class_grades,{[classId]:11});assert.equal(delegated111.class_grade_complete,true);await db.exec('rollback');assert.deepEqual(await grantRow(),oldGrant);assert.deepEqual(await row(),before);checks++;
 assert.equal((await svc({action:'worker_claim',worker_protocol:110,is_test:true,worker_id:'normal-unmodified'})).job,null);checks++;
 await fail('',()=>svc(claim111),/CONTINUATION_NOT_ELIGIBLE/);
 for(const key of ['priorSHA','diagnosis','newManifest','newReceipt','newFix'])await fail('',()=>issue({[key]:null}),/CONTINUATION112_ACTUAL_PROOFS_REQUIRED/);
 await fail('',()=>issue({diagnosis:'2'.repeat(64)}),/CONTINUATION112_ACTUAL_PROOFS_REQUIRED/);
 await fail('',()=>issue({expires:new Date(Date.now()+61*60000).toISOString()}),/CONTINUATION112_EXPIRY_REQUIRED/);
 await fail('',()=>issue({expires:new Date(Date.now()-1000).toISOString()}),/CONTINUATION112_EXPIRY_REQUIRED/);
 await fail("update mtm_hw_private.lesson_continuation142 set audit=audit||'{\"changed\":true}'",()=>issue(),/CONTINUATION112_PRIOR_GRANT_CHANGED/);
 await fail(`update mtm_hw_private.lesson_uploads set title='changed' where id='${target}'`,()=>issue(),/CONTINUATION112_SOURCE_CHANGED/);
 await fail(`update mtm_hw_private.lesson_uploads set retry_status='exhausted' where id='${target}'`,()=>issue(),/CONTINUATION112_TARGET_NOT_FAILED_IDLE/);
 await fail(`update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||'{"publish_receipts":{}}' where id='${target}'`,()=>issue(),/CONTINUATION112_TARGET_NOT_FAILED_IDLE/);
 await fail(`update mtm_hw_private.lesson_uploads set attempt_count=2 where not is_test`,()=>issue(),/CONTINUATION112_OLD5_CHANGED/);
 await fail('update mtm_hw_private.lesson_upload_automation set enabled=false',()=>issue(),/CONTINUATION112_CONTROL_CHANGED/);
 const accepted=(await issue()).rows[0].v;assert.equal(accepted.processing_credits_used,0);assert.equal(accepted.credit_id,credit);checks++;
 assert.equal((await issue()).rows[0].v.already_issued,true);assert.deepEqual(await grantRow(),oldGrant);assert.deepEqual((await row()).checkpoint,before.checkpoint);assert.equal((await row()).claim_token,before.claim_token);assert.equal((await row()).attempt_count,4);assert.equal((await row()).retry_count,3);checks++;
 await fail('update mtm_hw_private.lesson_continuation142 set status=\'authorized\'',()=>Promise.resolve(),/CONTINUATION_PRIOR_GRANT_IMMUTABLE/);
 await fail('delete from mtm_hw_private.lesson_continuation142',()=>Promise.resolve(),/CONTINUATION_PRIOR_GRANT_IMMUTABLE/);
 const claim={action:'worker_claim',operator_continuation:true,operator_credit_id:credit,is_test:true,auto:false,upload_id:target,worker_protocol:112,worker_id:'synthetic-second-credit',runtime_manifest_sha256:newManifest};
 await assert.rejects(()=>db.transaction(async tx=>{await tx.exec("set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true)");return tx.query('select public.mtm_lesson_upload_api($1) v',[JSON.stringify(claim)]);}),/SERVICE_ROLE_REQUIRED/);checks++;
 for(const patch of [{auto:true},{auto:undefined},{is_test:false},{operator_continuation:false},{operator_credit_id:undefined},{worker_protocol:111},{upload_id:'99999999-9999-4999-8999-000000000001'}])await fail('',()=>svc({...claim,...patch}),/CONTINUATION112_EXPLICIT_TEST_SCOPE_REQUIRED/);
 for(const patch of [{operator_credit_id:'33333333-3333-4333-8333-333333333333'},{runtime_manifest_sha256:manifest}])await fail('',()=>svc({...claim,...patch}),/CONTINUATION112_NOT_ELIGIBLE/);
 await fail("update mtm_hw_private.lesson_continuation142_credit2 set created_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second'",()=>svc(claim),/CONTINUATION112_NOT_ELIGIBLE/);
 await fail(`update mtm_hw_private.lesson_uploads set attempt_count=5 where id='${target}'`,()=>Promise.resolve(),/CONTINUATION_CONSUMED_FENCE_REQUIRED/);
 await fail('update mtm_hw_private.lesson_uploads set attempt_count=5 where not is_test',()=>Promise.resolve(),/CONTINUATION_CONSUMED_FENCE_REQUIRED|check constraint/);
 const job=(await svc(claim)).job;assert.equal(job.attempt_count,5);assert.equal(job.operator_credit_id,credit);assert.equal(job.operator_credit_ordinal,2);assert.equal(job.operator_review_resume,false);assert.notEqual(job.claim_token,before.claim_token);assert.deepEqual(await grantRow(),oldGrant);checks++;
 assert.deepEqual(job.class_grades,{[classId]:11});assert.equal(job.grade_source,'managed_class_catalog');assert.equal(job.class_grade_complete,true);assert.equal(job.class_grade_issue,null);checks++;
 await fail('',()=>svc(claim),/CONTINUATION112_NOT_ELIGIBLE/);
 await fail('',()=>svc({action:'worker_checkpoint',upload_id:target,claim_token:before.claim_token,step:2,status:'xong'}),/STALE_UPLOAD_OR_LEASE/);
 await fail('',()=>svc({action:'worker_publish',upload_id:target,claim_token:job.claim_token,payload:{}}),/PRIOR_STEP_INCOMPLETE/);
 // Underlying failure-after-publication no-op must not mark the credit failed.
 await db.exec('begin');await db.query("update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||'{\"publish_receipts\":{}}' where id=$1",[target]);const running=await creditRow();
 await svc({action:'worker_record_failure',upload_id:target,claim_token:job.claim_token,step:2,paper:1,code:'NATIVE_DRIVER_FAILED'});assert.deepEqual(await creditRow(),running);await db.exec('rollback');checks++;
 for(const step of [2,3])await svc({action:'worker_checkpoint',upload_id:target,claim_token:job.claim_token,step,status:'xong',detail:'Synthetic completed cached stage',checkpoint:{}});
 await svc({action:'worker_checkpoint',upload_id:target,claim_token:job.claim_token,step:4,status:'dang',detail:'Synthetic same-request pending review',checkpoint:{}});
 const wait={action:'worker_wait_review',upload_id:target,claim_token:job.claim_token,paper:1,request_hash:'3'.repeat(64),source_version:source};
 assert.equal((await svc(wait)).allowed,false);assert.equal((await row()).attempt_count,4);assert.equal((await creditRow()).status,'waiting_review');assert.equal((await creditRow()).processing_credits_used,1);assert.deepEqual(await grantRow(),oldGrant);checks++;
 const waiting=await creditRow();assert.equal((await svc(wait)).allowed,false);assert.deepEqual(await creditRow(),waiting);assert.equal((await row()).attempt_count,4);checks++;
 const pendingRequest={action:'worker_pending_review',is_test:true};
 await assert.rejects(()=>db.transaction(async tx=>{await tx.exec("set local role authenticated;select set_config('request.jwt.claim.role','authenticated',true)");return tx.query('select public.mtm_lesson_upload_api($1) v',[JSON.stringify(pendingRequest)]);}),/SERVICE_ROLE_REQUIRED/);checks++;
 await db.exec('begin');await db.query('update mtm_hw_private.lesson_uploads set finished_at=clock_timestamp() where id=$1',[target]);
 const pending=(await svc(pendingRequest)).job;assert.equal(pending.id,target);assert.deepEqual(pending.class_grades,{[classId]:11});assert.equal(pending.grade_source,'managed_class_catalog');assert.equal(pending.class_grade_complete,true);assert.equal(pending.class_grade_issue,null);assert.equal(pending.pending_reviews[0].request_hash,wait.request_hash);assert.deepEqual(await grantRow(),oldGrant);checks++;
 await db.exec("update mtm_hw_private.classes set label='MISMATCH';update mtm_hw_private.lesson_review_requests set last_attempt_at=null");const pendingHeld=(await svc(pendingRequest)).job;assert.equal(pendingHeld.id,target);assert.deepEqual(pendingHeld.class_grades,{});assert.equal(pendingHeld.class_grade_complete,false);assert.equal(pendingHeld.class_grade_issue,'CLASS_GRADE_METADATA_REQUIRED');await db.exec('rollback');checks++;
 await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[target]);
 await fail("update mtm_hw_private.lesson_review_requests set request_hash=repeat('4',64)",()=>svc(claim),/CONTINUATION112_REVIEW_RESUME_CHANGED/);
 const resumed=(await svc(claim)).job;assert.equal(resumed.attempt_count,5);assert.equal(resumed.operator_review_resume,true);assert.notEqual(resumed.claim_token,job.claim_token);assert.equal((await creditRow()).review_resume_count,1);checks++;
 await db.exec('begin');await svc({...wait,claim_token:resumed.claim_token});await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[target]);
 const resumed2=(await svc(claim)).job;assert.equal((await creditRow()).review_resume_count,2);await svc({...wait,claim_token:resumed2.claim_token});await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[target]);
 await assert.rejects(()=>svc(claim),/CONTINUATION112_REVIEW_RESUME_LIMIT/);await db.exec('rollback');checks++;
 await fail('',()=>svc({...wait,claim_token:job.claim_token}),/STALE_UPLOAD_OR_LEASE/);
 await db.exec('begin');await db.query("update mtm_hw_private.lesson_upload_steps set status='xong' where upload_id=$1",[target]);await svc({action:'worker_finish',upload_id:target,claim_token:resumed.claim_token});assert.equal((await creditRow()).status,'complete');assert.deepEqual(await grantRow(),oldGrant);await db.exec('rollback');checks++;
 const failure={action:'worker_record_failure',upload_id:target,claim_token:resumed.claim_token,step:4,paper:1,code:'NATIVE_DRIVER_FAILED'};await svc(failure);
 assert.equal((await creditRow()).status,'failed');assert.equal((await row()).attempt_count,5);assert.equal((await row()).retry_count,3);assert.deepEqual((await row()).checkpoint,before.checkpoint);checks++;
 const failedCredit=await creditRow(),failedUpload=await row();await svc(failure);assert.deepEqual(await creditRow(),failedCredit);assert.deepEqual(await row(),failedUpload);checks++;
 await fail('',()=>svc(claim),/CONTINUATION112_NOT_ELIGIBLE/);assert.equal((await issue()).rows[0].v.status,'failed');assert.deepEqual(await grantRow(),oldGrant);assert.deepEqual(await oldRows(),old);checks++;
 assert.deepEqual(await acl('public.mtm_lesson_upload_api(jsonb)'),apiAcl);checks++;
 const report={status:'PASS',checks,SQL_sha256:createHash('sha256').update(candidate).digest('hex'),candidate_only:true,all_actual_proof_pins_still_null:true,synthetic_pins_in_tests_only:true,canonical_111_first_failed_grant_retained:true,paid_AI_calls:0,live_SQL:0};
 writeFileSync(dir+'QA.revision5.safe.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await db.close();}
