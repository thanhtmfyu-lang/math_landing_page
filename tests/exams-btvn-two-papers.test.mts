import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {createBtvnPublishHandler,expectedSlots} from '../server/btvn/publish-handler';
import {runUploadOnce,reviewQuestions,type Pipeline} from '../server/lesson-upload/worker';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {weekProgress} from '../src/native/lesson-upload/model';
import {handleTwoPaperPublication} from '../server/btvn/publish-two-papers';
import {createLessonGatewayClient} from '../server/lesson-upload/publisher-client';
import {handleAnswerCorrection} from '../server/btvn/answer-correction';

const {db}=await baselineDatabase();let checks=0;
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec("alter role service_role bypassrls;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant select,insert on storage.objects to service_role,authenticated;grant usage on schema storage to service_role,authenticated;");
 for(const name of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
 const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112',cid='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2)',[owner,teacher]);
 await db.query("insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture-admin','Admin thử','admin','thaythanh'),($2,'fixture-gv','GV thử','gv','thaytai')",[owner,teacher]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K10 9+',11)",[cid,owner]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid])',[owner,cid]);
 await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K10 9+',1,'17:30','19:30','Trần Thanh Anh Tài')");
 await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Học sinh giả thử','Trường thử','11 thử','MTM-000000000001')",[sid,owner,cid]);
 async function role(name:string,uid:string|undefined,fn:(tx:any)=>Promise<any>){return db.transaction(async(tx:any)=>{await tx.exec('set local role '+name);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[name,uid??'']);return fn(tx);});}
 async function call(name:string,args:Record<string,unknown>,roleName='service_role',uid?:string){return role(roleName,uid,async(tx:any)=>(await tx.query(`select public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) result`,Object.values(args))).rows[0].result);}
 const path1=teacher+'/44444444-4444-4444-8444-444444444444/homework.pdf',path2=path1.replace('homework.pdf','homework2.pdf');
 for(const path of [path1,path2])await role('authenticated',teacher,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[path]));
 const input={action:'create',class_ids:[cid],lesson_date:'2026-10-26',teacher_key:'thaytai',title:'Hai đề thử local',task_scope:'Câu 1–3',homework_path:path1,answer_text:'1D; ĐS: Đ S Đ S; TLN:2.5',homework2_path:path2,answer2_text:'1A; ĐS: Đ S Đ S; TLN:2.5'};
 await assert.rejects(()=>call('mtm_lesson_upload_api',{p:{...input,answer2_text:null}},'authenticated',teacher),/PAPER_TWO_ANSWERS_REQUIRED/);checks++;
 const upload=await call('mtm_lesson_upload_api',{p:input},'authenticated',teacher),code='web-'+upload.upload_id.replaceAll('-','');
 await assert.rejects(()=>call('mtm_lesson_upload_api',{p:{action:'worker_web_precedence',enabled:true}}),/LIVE_WEB_RECEIPT_REQUIRED/);checks++;
 const fixture=pipelineFixture(),second=structuredClone(fixture);
 second.exam.id+='-de-2';second.exam.versionHash='b'.repeat(64);(second.exam.questions[0] as any).answer='A';
 second.verification.slots=second.verification.slots.map(s=>s.question_id==='mc-1'?{...s,actual:'A',expected:'A'}:s);
 let active=fixture,reads=0,reviews=0,builds=0;const stored=new Map<string,Uint8Array>();let rpcError:any;
 const client={async rpc(name:string,args:Record<string,unknown>){try{return {data:await call(name==='mtm_btvn_read'?'mtm_btvn_two_paper_read':name,args),error:null};}catch(error:any){rpcError={code:error.code,message:error.message};return {data:null,error:rpcError};}},storage:{from(bucket:string){return {async upload(path:string,bytes:Uint8Array,opts:any){try{await role('service_role',undefined,tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,JSON.stringify({mimetype:opts.contentType,size:bytes.length})]));stored.set(path,bytes);return {error:null};}catch(error:any){return {error};}},async download(path:string){const bytes=stored.get(path);return bytes?{data:new Blob([bytes]),error:null}:{data:null,error:{message:'missing'}};}};}}};
 const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic-codex'},async read(job){reads++;active=job.homework_path===path2?second:fixture;return {sourceVersion:active===second?'b'.repeat(64):'c'.repeat(64),questions:reviewQuestions(active.exam),teacherSlots:expectedSlots(active.exam)};},async build(){builds++;return {exam:active.exam,assets:active.assets};},async review(input){reviews++;assert(!JSON.stringify(input).includes('expected'));assert(!JSON.stringify(input).includes('acceptedAnswers'));return {provider:'grok',model:'synthetic-grok',receipt_hash:'d'.repeat(64),slots:active.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const stateRows=new Map<string,unknown>(),state={async save(id:string,stage:string,v:unknown){const ref=id+'/'+stage;stateRows.set(ref,structuredClone(v));return ref;},async load(ref:string){return structuredClone(stateRows.get(ref));}};
 const result=await runUploadOnce(createWorkerRepository(client),pipeline,state,'synthetic-pair');assert.equal(result.status,'complete',JSON.stringify({result,rpcError}));checks++;
 assert.equal(reads,2);assert.equal(builds,2);assert.equal(reviews,2);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_lessons where active and $1=any(class_ids)',[cid])).rows[0].n,1);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_second_papers where lesson_code=$1',[code])).rows[0].n,1);checks++;
 assert.equal((await db.query("select count(*) n from mtm_hw_private.lesson_upload_paper2_steps where upload_id=$1 and status='xong'",[upload.upload_id])).rows[0].n,6);checks++;
 const dashboard=await call('mtm_lesson_upload_api',{p:{action:'dashboard',from:'2026-10-26',to:'2026-11-01'}},'authenticated',owner);
 assert(dashboard.uploads[0].homework2_uploaded);assert(dashboard.uploads[0].answer2_uploaded);assert.equal(dashboard.uploads[0].paper2_steps.length,6);assert(!JSON.stringify(dashboard).includes(path2));checks++;
 const progress=weekProgress(dashboard,new Date('2026-11-02T15:30:00Z'));assert.equal(progress.bars[0].done,2);assert.equal(progress.bars[0].total,2);assert.equal(progress.bars[0].percent,100);checks++;
 const token='f'.repeat(64);await db.query("insert into mtm_hw_private.btvn_identity_sessions values(mtm_hw_private.token_digest('btvn-identity',$1),$2,clock_timestamp()+interval '1 hour',null)",[token,sid]);
 const repo=new SupabaseHomeworkRepository(client,async()=>({}),Date.now,async path=>'https://fixture.invalid/'+path+'?token=fixture');
 const selected=await repo.call(token,'select',code+'-de-2');assert.equal(selected.paperChoice?.paper,2);assert.equal(selected.paperChoice?.locked,false);assert.equal(selected.lessons?.length,1);assert.equal(selected.exam?.id,second.exam.id);assert(!JSON.stringify(selected).includes('acceptedAnswers'));assert(!JSON.stringify(selected).includes('"answer":"A"'));checks++;
 const started=await repo.call(token,'start',code+'-de-2');assert(started.draft);checks++;
 await assert.rejects(()=>repo.call(token,'select',code+'-de-1'));checks++;
 const submitted=await repo.call(token,'submit',code+'-de-2',started.draft!.attemptId,{'mc-1':'A','tf-1':[true,false,true,false],'sa-1':'2.5'});
 assert(submitted.receipts.length===1,JSON.stringify({rpcError,submitted}));assert.equal(submitted.receipts[0].score,10,'paper 2 must use its own A key rather than paper 1 D');checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0].n,1);checks++;
 const old=JSON.stringify((await db.query('select receipts from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0].receipts);
 const restored=await repo.call(token,'state',code);assert.equal(restored.paperChoice?.paper,2);assert.equal(restored.paperChoice?.locked,true);checks++;
 assert.equal(JSON.stringify((await db.query('select receipts from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0].receipts),old);checks++;
 const retry=await repo.call(token,'start',code+'-de-2');assert.equal(retry.attemptsUsed,2);checks++;
 const sid2='33333333-3333-4333-8333-333333333334',token2='e'.repeat(64);
 await db.query("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Học sinh giả thứ hai','Trường thử','11 thử','MTM-000000000002')",[sid2,owner,cid]);
 await db.query("insert into mtm_hw_private.btvn_identity_sessions values(mtm_hw_private.token_digest('btvn-identity',$1),$2,clock_timestamp()+interval '1 hour',null)",[token2,sid2]);
 const race=await Promise.allSettled([repo.call(token2,'start',code+'-de-1'),repo.call(token2,'start',code+'-de-2')]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'two concurrent starts must choose one paper');checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid2,code])).rows[0].n,1);checks++;
 const single=await call('mtm_lesson_upload_api',{p:{...input,lesson_date:'2026-11-02',homework2_path:null,answer2_text:null}},'authenticated',teacher);
 assert.equal((await runUploadOnce(createWorkerRepository(client),pipeline,state,'synthetic-single')).status,'complete');checks++;
 const singleCode='web-'+single.upload_id.replaceAll('-','');
 const singleState=await repo.call(token,'state',singleCode);assert.equal(singleState.paperChoice,undefined);checks++;
 const warnings=await call('mtm_lesson_upload_api',{p:{action:'dashboard',from:'2026-11-02',to:'2026-11-08'}},'authenticated',owner);
 assert(warnings.uploads[0].warnings[0].includes('Thiếu Đề 2'));assert(warnings.publisher_warnings[0].warnings[0].includes('Thiếu Đề 2'));checks++;
 assert.equal((await db.query('select warnings from mtm_hw_private.btvn_publication_warnings where lesson_code=$1',[code])).rows.length,0,'a full pair must clear its publication warning');checks++;
 assert.equal(JSON.stringify((await db.query('select receipts from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0].receipts),old);checks++;
 for(const roleName of ['anon','authenticated']){await assert.rejects(()=>role(roleName,undefined,tx=>tx.exec('select * from mtm_hw_private.btvn_second_papers')));checks++;}
 // Prepared backfill uses the existing Edge secret and finite RPC, without
 // staff uploads or direct DB writes. Existing attempts remain on paper 1.
 const firstSingle=await repo.call(token,'start',singleCode);
 const oldSingle=await repo.call(token,'submit',singleCode,firstSingle.draft!.attemptId,{'mc-1':'D','tf-1':[true,false,true,false],'sa-1':'2.5'});
 const singleReceipts=JSON.stringify(oldSingle.receipts),singleDue=oldSingle.dueAt;
 const evidence={grok:{model:'synthetic-grok',receipt_hash:'1'.repeat(64)},agy:{model:'synthetic-agy',receipt_hash:'2'.repeat(64)},sympy:{status:'PASS',receipt_hash:'3'.repeat(64)}};
 const prepared=(f:typeof fixture,key:string,date:string)=>({...f,action:'publish',kind:'btvn',lesson_key:key,material:{...f.material,lessonCode:key,classNames:['2K10 9+'],date,classDates:{'2K10 9+':date}}});
 const secret='synthetic-pair-publication-'.repeat(3);let uploaded=0;
 const publishPort={async rpc(action:string,payload:any){assert(['two_paper_pair_preflight','two_paper_pair_commit','two_paper_variant_preflight','two_paper_variant_commit'].includes(action));return call('mtm_btvn_two_paper_publish',{p_action:action,p_payload:payload});},async upload(path:string,bytes:Uint8Array,type:string){uploaded++;await role('service_role',undefined,tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mtm-btvn',path,JSON.stringify({mimetype:type,size:bytes.length})]));stored.set(path,bytes);}};
 const handler=createBtvnPublishHandler(publishPort,secret);
 const request=(body:any,key=secret)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':key},body:JSON.stringify(body)}));
 const attach={action:'publish_variant',lesson_key:singleCode,expected_source_version:'c'.repeat(64),paper:{...prepared(second,singleCode,'2026-11-02'),source_version:'b'.repeat(64)},review_evidence:evidence};
 assert.equal((await request(attach,'wrong')).status,401);assert.equal(uploaded,0);checks++;
 assert.equal((await request({...attach,review_evidence:{...evidence,sympy:{status:'FAIL',receipt_hash:'3'.repeat(64)}}})).status,422);assert.equal(uploaded,0);checks++;
 assert.equal((await request({...attach,expected_source_version:'d'.repeat(64)})).status,422);assert.equal(uploaded,0);checks++;
 const attached=await request(attach);assert.equal(attached.status,200,attached.headers.get('X-MTM-Reject-Code')??'');checks++;
 const beforeReplay=uploaded;assert.equal((await (await request(attach)).json()).status,'already_published');assert.equal(uploaded,beforeReplay);checks++;
 const unchanged=await repo.call(token,'state',singleCode);assert.equal(unchanged.paperChoice?.paper,1);assert.equal(unchanged.paperChoice?.locked,true);assert.equal(JSON.stringify(unchanged.receipts),singleReceipts);assert.equal(unchanged.dueAt,singleDue);checks++;
 await assert.rejects(()=>repo.call(token,'select',singleCode+'-de-2'));checks++;
 // A future-only primary key version must permit a new attempt while keeping
 // submitted historical drafts/receipts exact, even after adding paper two.
 await db.query("update mtm_hw_private.btvn_lessons set exam=jsonb_set(exam,'{versionHash}',to_jsonb($2::text)) where code=$1",[singleCode,'f'.repeat(64)]);
 const futureRetry=await repo.call(token,'start',singleCode);assert(futureRetry.draft);assert.equal(futureRetry.draft.examVersionHash,'f'.repeat(64));assert.equal(JSON.stringify(futureRetry.receipts),singleReceipts);checks++;
 const pairKey='fixture-pair-publisher',pairBody={action:'publish_pair',primary:prepared(fixture,pairKey,'2026-10-19'),second:{...prepared(second,pairKey,'2026-10-19'),source_version:'b'.repeat(64)},review_evidence:evidence};
 const paired=await request(pairBody);assert.equal(paired.status,200,paired.headers.get('X-MTM-Reject-Code')??'');assert.equal((await paired.json()).papers,2);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_lessons where code=$1',[pairKey])).rows[0].n,1);checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_second_papers where lesson_code=$1',[pairKey])).rows[0].n,1);checks++;
 const beforePairReplay=uploaded;assert.equal((await (await request(pairBody)).json()).status,'already_published');assert.equal(uploaded,beforePairReplay);checks++;
 const beforeInvalid=uploaded;const bad=structuredClone(pairBody);bad.second.exam.questions[0].answer='B';
 assert.equal((await request(bad)).status,422);assert.equal(uploaded,beforeInvalid,'validate both papers before any upload');checks++;
 for(const [label,date,original,recomputed] of [['2K10 8+','2026-10-23','2026-10-20T14:30:00Z','2026-10-23T14:30:00Z'],['2K10 XPT','2026-10-26','2026-10-27T14:30:00Z','2026-10-26T14:30:00Z'],['2K11 9+','2026-10-22','2026-10-21T14:30:00Z','2026-10-22T14:30:00Z']]){
  const canonical={date,classDates:{[label]:date},classNames:[label],classOpensAt:{[label]:original},dueAt:'2026-11-01T15:59:59Z',retained:'original metadata'};let committed:any;
  const pinPort={async rpc(action:string,payload:any){if(action.endsWith('preflight'))return {canonical_material:canonical};committed=payload;return {status:'da_dang'};},async upload(){}};
  await handleTwoPaperPublication(pinPort,{...attach,paper:{action:'publish',kind:'btvn'}},async(_input,p)=>{await p.rpc('publish',{lesson_key:singleCode,material:{...canonical,classOpensAt:{[label]:recomputed}}});return new Response('{}');});
  assert.deepEqual(committed.second.material,canonical);assert.equal(committed.second.material.classOpensAt[label],original);checks++;
 }
 // Missing PC review uses the authoritative immutable DB clock, never a client
 // timestamp. Both papers queue immediately and publish truthfully after 20m.
 const delayed=await call('mtm_lesson_upload_api',{p:input},'authenticated',teacher),delayedCode='web-'+delayed.upload_id.replaceAll('-','');
 await db.query('update mtm_hw_private.lesson_uploads set attempt_count=1 where id=$1',[delayed.upload_id]);
 const pending:Pipeline={...pipeline,async review(input){return {status:'pending',sourceVersion:input.sourceVersion,request_hash:(input.sourceVersion==='b'.repeat(64)?'8':'7').repeat(64)};}};
 const beforeReads=reads;
 assert.equal((await runUploadOnce(createWorkerRepository(client),pending,state,'pending-pair')).status,'waiting_review');checks++;
 assert.equal((await db.query('select attempt_count from mtm_hw_private.lesson_uploads where id=$1',[delayed.upload_id])).rows[0].attempt_count,1,'two paper waits credit this claim once and retain previous failed attempt');checks++;
 assert.equal((await db.query('select count(*) n from mtm_hw_private.lesson_review_requests where upload_id=$1',[delayed.upload_id])).rows[0].n,2);assert.equal((await db.query('select count(*) n from mtm_hw_private.btvn_lessons where code=$1',[delayedCode])).rows[0].n,0);checks++;
 await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[delayed.upload_id]);
 assert.equal((await runUploadOnce(createWorkerRepository(client),pending,state,'pending-pair')).status,'waiting_review');assert.equal(reads,beforeReads+2,'waiting review must reuse extraction');checks++;
 assert.equal((await db.query('select attempt_count from mtm_hw_private.lesson_uploads where id=$1',[delayed.upload_id])).rows[0].attempt_count,1);checks++;
 await db.query("update mtm_hw_private.lesson_review_requests set requested_at=clock_timestamp()-interval '21 minutes' where upload_id=$1",[delayed.upload_id]);
 await db.query("update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()-interval '1 second' where id=$1",[delayed.upload_id]);
 const late=await runUploadOnce(createWorkerRepository(client),pending,state,'pending-pair');assert.equal(late.status,'complete',JSON.stringify({late,rpcError}));checks++;
 const proof=(await db.query('select verification from mtm_hw_private.btvn_lessons where code=$1',[delayedCode])).rows[0].verification;assert.equal(proof.independent,false);assert.equal(proof.status,'teacher-pending');checks++;
 const primaryBefore=JSON.stringify((await db.query('select material,exam from mtm_hw_private.btvn_lessons where code=$1',[delayedCode])).rows[0]);
 const lateReview={action:'worker_review_result',upload_id:delayed.upload_id,paper:1,request_hash:'7'.repeat(64),source_version:'c'.repeat(64),provider:'grok',model:'synthetic-grok',receipt_hash:'9'.repeat(64),matched:false};
 const lateResult=await call('mtm_lesson_upload_gateway',{p:lateReview});assert(lateResult.key_unchanged&&lateResult.grades_unchanged);assert.equal((await db.query('select status from mtm_hw_private.lesson_upload_steps where upload_id=$1 and step=4',[delayed.upload_id])).rows[0].status,'loi');checks++;
 assert.equal((await call('mtm_lesson_upload_gateway',{p:{action:'worker_pending_review'}})).job.id,delayed.upload_id);assert.equal((await call('mtm_lesson_upload_gateway',{p:{action:'worker_pending_review'}})).job,null,'cooldown prevents one missing review blocking the queue head');checks++;
 assert.equal(JSON.stringify((await db.query('select material,exam from mtm_hw_private.btvn_lessons where code=$1',[delayedCode])).rows[0]),primaryBefore);assert.equal(JSON.stringify((await db.query('select receipts from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code])).rows[0].receipts),old);checks++;
 const gatewayPort={...publishPort,async rpc(action:string,payload:any){assert.equal(action,'lesson_upload_gateway');return call('mtm_lesson_upload_gateway',{p:payload});},async readPrivate(bucket:string,path:string){assert(['mtm-btvn','mtm-lesson-private'].includes(bucket));const bytes=stored.get(path);assert(bytes);return {bytes,content_type:path.endsWith('.png')?'image/png':'application/pdf'};}};
 const gatewayHandler=createBtvnPublishHandler(gatewayPort,secret),gatewayUrl='https://synthetic.supabase.co/functions/v1/mtm-btvn-publish';
 const transport:typeof fetch=async(url,init)=>gatewayHandler(new Request(url,init));
 const gatewayClient=createLessonGatewayClient(gatewayUrl,secret,transport);
 const gatewayUpload=await call('mtm_lesson_upload_api',{p:{...input,lesson_date:'2026-11-02'}},'authenticated',teacher);
 const gatewayResult=await runUploadOnce(createWorkerRepository(gatewayClient),pipeline,state,'gateway-pair');assert.equal(gatewayResult.status,'complete',JSON.stringify(gatewayResult));checks++;
 const privateRequest={action:'lesson_upload_source',upload_id:gatewayUpload.upload_id,claim_token:'0'.repeat(8)+'-0000-4000-8000-'+ '0'.repeat(12),kind:'answer'};
 const unauthorized=await gatewayHandler(new Request(gatewayUrl,{method:'POST',body:JSON.stringify(privateRequest)}));assert.equal(unauthorized.status,401);checks++;
 const escaped=await gatewayHandler(new Request(gatewayUrl,{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify({...privateRequest,action:'lesson_upload_asset_read',path:'../private'})}));assert.equal(escaped.status,422);checks++;
 const answer2Path=path1.replace('homework.pdf','answer2.pdf');
 await role('authenticated',teacher,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[answer2Path]));
 stored.set(answer2Path,new TextEncoder().encode('%PDF-1.4 synthetic teacher2 source'));
 await call('mtm_lesson_upload_api',{p:{...input,lesson_date:'2026-10-19',answer2_text:null,answer2_path:answer2Path}},'authenticated',teacher);
 const seen:number[]=[];const mixed:Pipeline={...pipeline,async read(job){
  seen.push(job.paper??1);
  if(job.paper===2){assert.equal(job.answer_path,answer2Path);assert.equal(job.answer_text,null);const downloaded=await gatewayClient.rpc('mtm_lesson_upload_source',{upload_id:job.id,claim_token:job.claim_token,kind:'answer2'});assert.equal(downloaded.error,null);assert.equal(Buffer.from(downloaded.data.data_base64,'base64').toString(),'%PDF-1.4 synthetic teacher2 source');}
  else{assert.equal(job.answer_path,null);assert.equal(job.answer_text,input.answer_text);}
  return {...await pipeline.read(job),privateAnswerHashes:['6'.repeat(64)]};
 }};
 assert.equal((await runUploadOnce(createWorkerRepository(gatewayClient),mixed,state,'mixed-answer-sources')).status,'complete');assert.deepEqual(seen,[1,2]);checks++;
 const futureKey='fixture-future-before-variant';
 const normalHandler=createBtvnPublishHandler({...publishPort,async rpc(a:string,p:any){return call('mtm_btvn_pipeline',{p_action:a,p_payload:p},'mtm_btvn_publisher');}},secret);
 const futurePublished=await normalHandler(new Request('https://fixture.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify({...prepared(fixture,futureKey,'2026-10-19'),source_version:'c'.repeat(64)})}));assert.equal(futurePublished.status,200,futurePublished.headers.get('X-MTM-Reject-Code')??'');checks++;
 const firstFuture=await repo.call(token,'start',futureKey);const oldFuture=await repo.call(token,'submit',futureKey,firstFuture.draft!.attemptId,{'mc-1':'D','tf-1':[true,false,true,false],'sa-1':'2.5'});
 const futureOriginal=(await db.query('select exam,material,source_version from mtm_hw_private.btvn_lessons where code=$1',[futureKey])).rows[0],futureWorkBefore=(await db.query('select * from mtm_hw_private.btvn_work where lesson_code=$1',[futureKey])).rows;
 const correctionPort={upload:publishPort.upload,async rpc(a:string,p:any){return call('mtm_btvn_answer_correction_future_only',{p_action:a,p});}};
 const correction={action:'answer_correction_future_only_preview' as const,lesson_key:futureKey,request_id:'fixture-pair-future-correction',lenh_ref:'fixture-authority-1905',approved_via:'fixture-approved-user',patches:[{question_id:'sa-1',acceptedAnswers:['2/3'],mode:'rational' as const}]};
 const previewFuture=await handleAnswerCorrection(correctionPort,correction);await handleAnswerCorrection(correctionPort,{...correction,action:'answer_correction_future_only_apply',expected_plan_sha256:previewFuture.plan_sha256});
 const correctedBeforeAttach=(await db.query('select exam,material,source_version from mtm_hw_private.btvn_lessons where code=$1',[futureKey])).rows[0];assert.equal(correctedBeforeAttach.source_version,futureOriginal.source_version);assert.deepEqual(correctedBeforeAttach.material,futureOriginal.material);assert.deepEqual((await db.query('select * from mtm_hw_private.btvn_work where lesson_code=$1',[futureKey])).rows,futureWorkBefore);checks++;
 const metadataBeforeAttach=await call('mtm_btvn_publication_receipt',{p_code:futureKey});assert.deepEqual(correctedBeforeAttach.exam.questions[1],futureOriginal.exam.questions[1]);
 assert.equal((await request({...attach,lesson_key:futureKey,paper:{...prepared(second,futureKey,'2026-10-19'),source_version:'b'.repeat(64)}})).status,200);assert.deepEqual((await db.query('select exam,material,source_version from mtm_hw_private.btvn_lessons where code=$1',[futureKey])).rows[0],correctedBeforeAttach);assert.deepEqual((await db.query('select * from mtm_hw_private.btvn_work where lesson_code=$1',[futureKey])).rows,futureWorkBefore);checks++;
 const metadataAfterAttach=await call('mtm_btvn_publication_receipt',{p_code:futureKey});assert.deepEqual(metadataAfterAttach.canonical,metadataBeforeAttach.canonical);assert.equal(metadataAfterAttach.paper_count,2);checks++;
 const afterFutureStart=await repo.call(token,'start',futureKey),afterFutureSubmit=await repo.call(token,'submit',futureKey,afterFutureStart.draft!.attemptId,{'mc-1':'D','tf-1':[true,false,true,false],'sa-1':'2/3'});assert.equal(afterFutureSubmit.receipts.at(-1)!.score,10);assert.deepEqual(afterFutureSubmit.receipts.slice(0,oldFuture.receipts.length),oldFuture.receipts);checks++;
 const newPaper2Start=await repo.call(token2,'start',futureKey+'-de-2'),newPaper2Submit=await repo.call(token2,'submit',futureKey+'-de-2',newPaper2Start.draft!.attemptId,{'mc-1':'A','tf-1':[true,false,true,false],'sa-1':'2.5'});assert.equal(newPaper2Submit.receipts[0].score,10);assert.equal(newPaper2Submit.paperChoice?.paper,2);checks++;
 const inspectPort={...publishPort,async rpc(a:string,p:any){assert.equal(a,'publication_receipt');return call('mtm_btvn_publication_receipt',{p_code:p.lesson_key});}},inspect=createBtvnPublishHandler(inspectPort,secret);
 const inspectRequest=(key:string,auth=secret)=>inspect(new Request('https://fixture.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':auth},body:JSON.stringify({action:'publication_receipt',lesson_key:key})}));
 const receiptResponse=await inspectRequest(futureKey),publication=await receiptResponse.json();assert.equal(receiptResponse.status,200);assert.equal(publication.paper_count,2);assert.equal(publication.canonical.exam_version_hash,correctedBeforeAttach.exam.versionHash);assert.equal(publication.second_paper.source_version,'b'.repeat(64));assert.deepEqual(publication.canonical.material,correctedBeforeAttach.material);assert(Object.hasOwn(publication.canonical.due_by_class,'2K10 9+'));assert.equal(publication.canonical.storage_private,true);assert.match(publication.canonical.exam_sha256,/^[a-f0-9]{64}$/);assert.equal(publication.canonical.exam,undefined);assert(!JSON.stringify(publication).includes('data_base64'));assert(!JSON.stringify(publication).includes('"acceptedAnswers"'));assert(!JSON.stringify(publication).includes(sid));checks++;
 const afterInspect=await (await inspectRequest(futureKey)).json();assert.equal(afterInspect.canonical.work_history_sha256,publication.canonical.work_history_sha256);assert.equal(afterInspect.canonical.work_due_sha256,publication.canonical.work_due_sha256);assert.equal((await inspectRequest(futureKey,'wrong')).status,401);assert.equal((await (await inspectRequest('fixture-missing')).json()).status,'not_found');checks++;
 for(const roleName of ['anon','authenticated','mtm_btvn_publisher']){await assert.rejects(()=>call('mtm_btvn_publication_receipt',{p_code:futureKey},roleName));checks++;}
 console.log(`${checks} ca hai đề full schema: hai key,1buổi,timer20m,hậu kiểm giữđiểm,private gateway,mixed source,future-only trướcvariant,receiptreadonly: đạt; dữ liệu giả local.`);
}finally{await db.close();}
