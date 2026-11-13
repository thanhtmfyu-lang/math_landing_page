import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {runUploadOnce,reviewQuestions,type Pipeline} from '../server/lesson-upload/worker';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {createLessonGatewayClient} from '../server/lesson-upload/publisher-client';
import {reviewUploadOnce} from '../server/lesson-upload/review-backfill';
import {expectedSlots} from '../server/btvn/publish-handler';
let checks=0;
const url='https://fixture.supabase.co/functions/v1/mtm-btvn-publish',secret='fixture-only-secret-'.repeat(3);
assert.equal((await reviewUploadOnce({async rpc(_name:string,{p}:any){assert.equal(p.auto,true);return {data:{job:null},error:null};}},{} as any,{} as any,false,true)).status,'idle');checks++;
for(const [status,body,expected] of [[401,{},'GATEWAY_AUTH_REQUIRED'],[403,{},'GATEWAY_AUTH_REQUIRED'],[429,{},'GATEWAY_BUSY'],[503,{},'WORKER_RPC_FAILED'],[400,{error_code:'PRIVATE_ASSET_CONFLICT'},'PRIVATE_ASSET_CONFLICT'],[400,{error_code:'not safe private error'},'GATEWAY_REQUEST_REJECTED']] as const){
 const client=createLessonGatewayClient(url,secret,async()=>new Response(JSON.stringify(body),{status}));
 assert.equal((await client.rpc('mtm_lesson_upload_api',{p:{action:'worker_claim'}})).error?.message,expected);checks++;
}
const {db}=await baselineDatabase();
try{
 await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
 await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 alter role service_role bypassrls;grant usage on schema storage to service_role,authenticated;grant select,insert on storage.objects to service_role,authenticated;`);
 for(const name of ['202611020101_cong_up_btvn_gv.sql','202611020102_btvn_two_papers.sql','202611020103_lesson_upload_gateway.sql','202611120107_lesson_upload_deadline.sql'])await db.exec(readFileSync('supabase/migrations-pending/'+name,'utf8'));
 const owner='11111111-1111-4111-8111-111111111111',teacher='11111111-1111-4111-8111-111111111112',other='11111111-1111-4111-8111-111111111113';
 const c1='22222222-2222-4222-8222-222222222221',c2='22222222-2222-4222-8222-222222222222',c3='22222222-2222-4222-8222-222222222223';
 const monday=(await db.query(`select (d-(extract(isodow from d)::int-1))::text monday from (select (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date d) x`)).rows[0].monday;
 const day=(offset:number)=>new Date(Date.parse(monday+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 await db.query('insert into auth.users values($1),($2),($3)',[owner,teacher,other]);
 await db.query(`insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key) values($1,'fixture-admin','Quản lý giả','admin','thaythanh'),($2,'fixture-teacher','Giáo viên giả','gv','thaytai'),($3,'fixture-other','Giáo viên giả khác','gv','thayhieu')`,[owner,teacher,other]);
 await db.query("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$4,'2K9 9+',12),($2,$4,'2K9 8+',12),($3,$4,'2K10 XPT',11)",[c1,c2,c3,owner]);
 await db.query('insert into mtm_hw_private.btvn_publish_scope values(true,$1,array[$2::uuid,$3::uuid,$4::uuid])',[owner,c1,c2,c3]);
 await db.exec("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,teacher) values('2K9 9+',1,'17:30','19:30','thaytai'),('2K9 9+',3,'17:30','19:30','thaythanh'),('2K9 9+',5,'17:30','19:30','thaytai'),('2K9 8+',2,'17:30','19:30','thaytai'),('2K9 8+',4,'17:30','19:30','thaythanh'),('2K9 8+',6,'17:30','19:30','thaytai'),('2K10 XPT',1,'17:30','19:30','thaytai')");
 async function asRole(role:string,uid:string|undefined,fn:(tx:any)=>Promise<any>){return db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,uid??'']);return fn(tx);});}
 async function call(p:Record<string,unknown>,role='authenticated',uid=teacher){return asRole(role,uid,async tx=>(await tx.query('select public.mtm_lesson_upload_api($1) result',[JSON.stringify(p)])).rows[0].result);}
 const source=teacher+'/44444444-4444-4444-8444-444444444444/homework.pdf';
 await asRole('authenticated',teacher,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('mtm-lesson-private',$1,'{\"mimetype\":\"application/pdf\",\"size\":1000}')",[source]));
 const base={action:'create',class_ids:[c1],lesson_date:monday,teacher_key:'thaytai',title:'Synthetic retry only',task_scope:'Câu 1–3',homework_path:source,answer_text:'1D; ĐS ĐSĐS; TLN 2.5'};
 const old=await call({...base,class_ids:[c3]});
 const oldReview=await call(base);
 await db.query('update mtm_hw_private.lesson_uploads set finished_at=clock_timestamp() where id=$1',[oldReview.upload_id]);
 await db.query("insert into mtm_hw_private.lesson_review_requests(upload_id,paper,request_hash,source_version) values($1,1,$2,$3)",[oldReview.upload_id,'a'.repeat(64),'c'.repeat(64)]);
 const oldDue=(await db.query('select due_at_by_class from mtm_hw_private.lesson_uploads where id=$1',[old.upload_id])).rows[0].due_at_by_class;
 const sql=readFileSync('supabase/migrations-pending/202611130108_lesson_upload_retry.sql','utf8');await db.exec(sql);await db.exec(sql);checks++;
 assert.deepEqual((await db.query('select due_at_by_class from mtm_hw_private.lesson_uploads where id=$1',[old.upload_id])).rows[0].due_at_by_class,oldDue);checks++;
 const row=async(id:string)=>(await db.query('select * from mtm_hw_private.lesson_uploads where id=$1',[id])).rows[0];
 const svc=(p:Record<string,unknown>)=>call(p,'service_role',undefined as any);
 assert.equal((await svc({action:'worker_automation_config'})).automation.enabled,false);checks++;
 await assert.rejects(()=>call({action:'worker_automation_config',enabled:true}),/SERVICE_ROLE_REQUIRED/);checks++;
 await assert.rejects(()=>call({action:'worker_heartbeat'}),/SERVICE_ROLE_REQUIRED/);checks++;
 const activated=await svc({action:'worker_automation_config',enabled:true});
 assert.equal((await svc({action:'worker_automation_config',enabled:true})).automation.activated_at,activated.automation.activated_at);checks++;
 assert.equal((await svc({action:'worker_pending_review',auto:true})).job,null);checks++;
 await assert.rejects(()=>call({action:'worker_pending_review',auto:true}),/SERVICE_ROLE_REQUIRED/);checks++;
 assert.equal((await svc({action:'worker_pending_review'})).job.id,oldReview.upload_id);checks++;
 assert.equal((await svc({action:'worker_claim',worker_id:'fixture',auto:true})).job,null);checks++;
 assert.equal((await row(old.upload_id)).attempt_count,0);checks++;
 const dashboard=await call({action:'dashboard',from:monday,to:day(6)});
 assert(dashboard.automation.enabled);assert(dashboard.automation.last_seen_at);checks++;
 const mon=dashboard.sessions.find((s:any)=>s.class_id===c1&&s.lesson_date===monday);
 assert.equal(Date.parse(mon.default_due_at_by_class[c1]),Date.parse(day(2)+'T17:30:00+07:00'));assert.equal(Date.parse(mon.default_due_at_by_class[c2]),Date.parse(day(3)+'T17:30:00+07:00'));assert.equal(mon.deadline_policy_error,null);checks++;
 assert.equal(Date.parse(dashboard.sessions.find((s:any)=>s.class_id===c3).default_due_at_by_class[c3]),Date.parse(day(7)+'T17:30:00+07:00'));checks++;
 const marked=await call({action:'request_retry',upload_id:old.upload_id});assert.equal(marked.status,'already_queued');assert.equal(marked.accepted,true);checks++;
 const claimedOld=(await svc({action:'worker_claim',worker_id:'fixture',auto:true})).job;assert.equal(claimedOld.id,old.upload_id);checks++;
 const whileRunning=await call({action:'request_retry',upload_id:old.upload_id});assert.equal(whileRunning.status,'running');assert.equal((await row(old.upload_id)).claim_token,claimedOld.claim_token);checks++;
 const failed={action:'worker_record_failure',upload_id:old.upload_id,claim_token:claimedOld.claim_token,step:2,paper:1,code:'PRIVATE_ASSET_CONFLICT'};
 assert.equal((await svc(failed)).status,'needs_input');checks++;
 assert.equal((await svc(failed)).already_recorded,true);assert.equal((await row(old.upload_id)).retry_count,1);checks++;
 await assert.rejects(()=>svc({...failed,claim_token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),/STALE_UPLOAD_OR_LEASE/);checks++;
 const blocked=await call({action:'request_retry',upload_id:old.upload_id});assert.equal(blocked.status,'needs_input');assert.equal(blocked.accepted,false);checks++;
 await assert.rejects(()=>call({action:'request_retry',upload_id:old.upload_id},'authenticated',other),/UPLOAD_ACCESS_DENIED/);checks++;
 const fresh=await call(base);
 const newDeadline=await row(fresh.upload_id);assert.equal(Date.parse(newDeadline.due_at_by_class[c1]),Date.parse(day(2)+'T17:30:00+07:00'));assert.equal(Date.parse(newDeadline.due_at_by_class[c2]),Date.parse(day(3)+'T17:30:00+07:00'));checks++;
 const fixture=pipelineFixture(),states=new Map<string,unknown>(),stored=new Map<string,Uint8Array>();let reads=0,builds=0,rpcError:any;
 const client={async rpc(_name:string,{p}:any){try{return {data:await svc(p),error:null};}catch(error:any){rpcError=error.message;return {data:null,error:{message:error.message,code:error.code}};}},storage:{from(bucket:string){return {
  async upload(path:string,bytes:Uint8Array,options:any){try{await asRole('service_role',undefined,tx=>tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,JSON.stringify({mimetype:options.contentType,size:bytes.length})]));stored.set(path,bytes);return {error:null};}catch(error){return {error};}},
  async download(path:string){return {data:stored.has(path)?new Blob([stored.get(path)!]):null,error:null};}
 };}}};
 const repo=createWorkerRepository(client,{auto:true});
 const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic'},async read(){reads++;return {sourceVersion:'c'.repeat(64),questions:reviewQuestions(fixture.exam),teacherSlots:expectedSlots(fixture.exam),privateAnswerHashes:['e'.repeat(64)]};},async build(){builds++;throw Error('WORKER_RPC_FAILED');},async review(){return {provider:'grok',model:'synthetic',receipt_hash:'d'.repeat(64),slots:fixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const state={async save(id:string,stage:string,value:unknown){const key=id+'/'+stage;states.set(key,structuredClone(value));return key;},async load(key:string){return structuredClone(states.get(key));}};
 for(let attempt=1;attempt<=3;attempt++){
  const result=await runUploadOnce(repo,pipeline,state,'synthetic-auto');assert.equal(result.status,'retry',JSON.stringify({result,rpcError}));checks++;
  const after=await row(fresh.upload_id);assert.equal(after.attempt_count,attempt);assert.equal(after.retry_count,attempt);assert(after.checkpoint.source);checks++;
  assert.equal((await svc({action:'worker_claim',worker_id:'fixture',auto:true})).job,null);checks++;
  const requested=await call({action:'request_retry',upload_id:fresh.upload_id});
  if(attempt<3){assert.equal(requested.status,'already_queued');assert.equal(Date.parse(requested.next_retry_at),new Date(after.next_retry_at).getTime());assert.equal((await row(fresh.upload_id)).attempt_count,attempt);checks++;
   await db.query("update mtm_hw_private.lesson_uploads set next_retry_at=clock_timestamp()-interval '1 second' where id=$1",[fresh.upload_id]);
  }else{assert.equal(requested.status,'retry_exhausted');assert.equal(requested.accepted,false);checks++;}
 }
 assert.equal(reads,1);assert.equal(builds,3);assert.equal((await row(fresh.upload_id)).attempt_count,3);checks++;
 const good=await call({...base,lesson_date:day(4)});pipeline.build=async()=>({exam:fixture.exam,assets:fixture.assets});
 const published=await runUploadOnce(repo,pipeline,state,'synthetic-auto');assert.equal(published.status,'complete',JSON.stringify({published,rpcError}));checks++;
 const final=await row(good.upload_id);assert(final.checkpoint.publish_receipts);assert.equal(final.retry_status,'complete');checks++;
 const post=await call({action:'request_retry',upload_id:good.upload_id});assert.equal(post.status,'published');assert.equal(post.accepted,false);checks++;
 await db.query("insert into mtm_hw_private.lesson_review_requests(upload_id,paper,request_hash,source_version) values($1,1,$2,$3)",[good.upload_id,'b'.repeat(64),'c'.repeat(64)]);
 assert.equal((await svc({action:'worker_pending_review',auto:true})).job.id,good.upload_id);checks++;
 const replayState=await call({action:'dashboard',from:monday,to:day(6)});assert.equal(replayState.uploads.find((x:any)=>x.id===good.upload_id).published,true);assert.equal(replayState.uploads.find((x:any)=>x.id===fresh.upload_id).retry.status,'retry_exhausted');checks++;
 // Re-activation never reaches back into old queues; manual callers still retain
 // their existing explicit scope and can claim independently of auto enable.
 await svc({action:'worker_automation_config',enabled:false});
 const manual=await call({...base,class_ids:[c3]});
 assert.equal((await svc({action:'worker_claim',worker_id:'fixture',auto:true})).job,null);checks++;
 assert.equal((await svc({action:'worker_claim',worker_id:'fixture'})).job.id,manual.upload_id);checks++;
 await asRole('authenticated',teacher,async tx=>{await assert.rejects(()=>tx.exec('select * from mtm_hw_private.lesson_upload_automation'),/permission denied/);});checks++;
}finally{await db.close();}
console.log(`${checks} ca retry/auto: cutoff job cũ, deadline đúng cặp/giờ ca, quyền, backoff tối đa3, resume cùng source, giữ publication: đạt; PGlite giả, không mạng.`);
