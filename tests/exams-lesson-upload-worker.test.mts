import assert from 'node:assert/strict';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {expectedSlots} from '../server/btvn/publish-handler';
import {runUploadOnce,nextWeekDue,reviewQuestions,type UploadJob,type Pipeline} from '../server/lesson-upload/worker';
import {createWorkerRepository} from '../server/lesson-upload/supabase-worker';
import {createPrivateFileState} from '../server/lesson-upload/private-state';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

function harness(){
 const fixture=pipelineFixture();
 const job:UploadJob={id:'01234567-0000-4000-8000-000000000001',claim_token:'private-test-claim',lesson_code:'web-01234567000040008000000000000001',class_ids:['c1','c2'],class_names:{c1:'Lớp giả pipeline',c2:'Lớp giả cặp'},class_dates:{c1:'2026-11-02',c2:'2026-11-03'},start_times:{c1:'17:30',c2:'19:30'},due_at_by_class:{c1:nextWeekDue('2026-11-02','17:30'),c2:nextWeekDue('2026-11-03','19:30')},lesson_date:'2026-11-02',teacher_key:'teacher-test',title:'Bài giả',task_scope:'Câu 1–3',homework_path:'fake/private/questions.pdf',answer_path:'fake/private/answers.pdf',answer_text:null,handout_path:null,video_url:null,version:1,checkpoint:{}};
 let reads=0,builds=0,reviews=0,commits=0,uploads=0,lost=false,crashAfterCommit=false;const marks:any[]=[];
 const states=new Map<string,unknown>(),durable:any={};
 const state={async save(id:string,stage:string,value:unknown){const key=id+'-'+stage;states.set(key,structuredClone(value));return key;},async load(ref:string){assert.ok(states.has(ref));return structuredClone(states.get(ref));}};
 const pipeline:Pipeline={extractor:{provider:'codex',model:'fixture-codex'},async read(){reads++;return {sourceVersion:'c'.repeat(64),questions:reviewQuestions(fixture.exam),teacherSlots:expectedSlots(fixture.exam),privateAnswerHashes:['e'.repeat(64)]};},async build(){builds++;return {exam:fixture.exam,assets:fixture.assets};},async review(input){reviews++;const text=JSON.stringify(input);assert.ok(!text.includes('teacherSlots'));assert.ok(!text.includes('acceptedAnswers'));assert.ok(!text.includes('expected'));assert.ok(!text.includes('solution'));return {provider:'grok',model:'fixture-grok',receipt_hash:'d'.repeat(64),slots:fixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const repo={async claim(){return {...job,checkpoint:structuredClone(durable)};},async current(){if(lost)throw Error('CLAIM_LOST');},async step(_job:any,step:number,status:string,detail:string,cp:any){if(lost)throw Error('CLAIM_LOST');if(crashAfterCommit&&step===6&&status==='xong'){crashAfterCommit=false;throw Error('WORKER_RPC_FAILED');}Object.assign(durable,cp);marks.push({step,status,detail});},async finish(){},publisher(){return {async rpc(action:string){if(lost)throw Error('CLAIM_LOST');if(action==='lookup')return {status:null};assert.equal(action,'publish');if(durable.publish_receipts)return {status:'already_published'};commits++;durable.publish_receipts={c1:{receipt:'r1'},c2:{receipt:'r2'}};return {status:'da_dang'};},async upload(){uploads++;}};}};
 return {job,fixture,pipeline,repo,state,marks,stats:()=>({reads,builds,reviews,commits,uploads}),lose:()=>{lost=true;},crash:()=>{crashAfterCommit=true;}};
}
assert.equal(nextWeekDue('2026-11-02','17:30'),'2026-11-09T10:00:00.000Z');
assert.equal(nextWeekDue('2026-11-02','00:15'),'2026-11-08T16:45:00.000Z');
assert.throws(()=>nextWeekDue('2026-02-30','18:00'));
assert.throws(()=>nextWeekDue('2026-11-02','25:00'));
{
 const h=harness();assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'complete');
 assert.deepEqual(h.marks.filter(m=>m.status==='xong').map(m=>m.step),[2,3,4,5,6]);assert.equal(h.stats().commits,1);
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'complete');assert.equal(h.stats().commits,1);assert.equal(h.stats().reads,1);assert.equal(h.stats().reviews,1);
}
{
 const h=harness();h.pipeline.review=async()=>null as any;
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);assert.equal(h.stats().uploads,0);assert.equal(h.marks.at(-1).step,4);
}
{
 const h=harness();h.pipeline.review=async()=>({...h.fixture.verification,provider:'grok',slots:h.fixture.verification.slots.map(s=>({...s,actual:s.question_id==='mc-1'?'A':s.actual}))}) as any;
 const result=await runUploadOnce(h.repo,h.pipeline,h.state,'fixture');assert.equal(result.status,'blocked');assert.equal(h.stats().commits,0);assert.equal(h.stats().uploads,0);assert.equal(h.marks.at(-1).step,4);
}
{
 const h=harness();h.fixture.exam.questions[0].answer='A'; // Teacher source is independently captured from the original expected D.
 const teacher=expectedSlots(pipelineFixture().exam);h.pipeline.read=async()=>({sourceVersion:'a'.repeat(64),questions:reviewQuestions(h.fixture.exam),teacherSlots:teacher,privateAnswerHashes:['e'.repeat(64)]});
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);
}
{
 const h=harness();h.pipeline.review=async()=>({...h.fixture.verification,provider:'codex'}) as any;
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);
}
{
 const h=harness(),read=h.pipeline.read;h.pipeline.read=async job=>({...await read(job),privateAnswerHashes:[h.fixture.assets[0].sha256]});
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);assert.equal(h.stats().uploads,0);
}
{
 const h=harness(),read=h.pipeline.read;h.pipeline.read=async job=>({...await read(job),questions:[{prompt:'Câu khác nguồn'}]});
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().reviews,0);assert.equal(h.stats().commits,0);
}
for(const link of ['https://example.invalid/handout','https://fake.supabase.co/storage/v1/object/public/mtm-btvn/a.pdf','https://fake.supabase.co/storage/v1/object/sign/mtm-btvn/a.pdf?token=fixture']){
 const h=harness();h.job.handout_path='fake/private/handout.pdf';h.pipeline.materials=async()=>({handoutUrl:link,materialUrl:null});
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);assert.equal(h.marks.at(-1).step,5);
}
{
 const h=harness();h.job.homework_path=null;h.job.answer_path=null;h.job.task_scope='';h.job.video_url='https://youtu.be/abcdefghijk';
 const sourceRead=h.pipeline.read;h.pipeline.read=async job=>({...await sourceRead(job),questions:[],teacherSlots:[]});
 let attached=0;const actualAdapter=createWorkerRepository({async rpc(name:string,{p}:any){
  assert.equal(name,'mtm_lesson_upload_api');if(p.action==='worker_assert_current')return {data:{ok:true},error:null};
  assert.equal(p.action,'worker_materials');assert.ok(!('classNames' in p.material));assert.ok(!('titleSource' in p.material));assert.ok(Object.keys(p.material).every(key=>['videoId','videoUrl','materialUrl','handoutUrl','homeworkNote','title','classOpensAt'].includes(key)));assert.equal(p.material.videoId,'abcdefghijk');attached++;return {data:{ok:true,publish_receipts:{c1:{receipt:'r1'},c2:{receipt:'r2'}}},error:null};
 }});h.repo.publisher=job=>actualAdapter.publisher(job);
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'complete');assert.equal(attached,1);assert.equal(h.stats().builds,0);assert.equal(h.stats().reviews,0);assert.ok(h.marks.some(m=>m.step===4&&m.status==='xong'&&m.detail.includes('Không áp dụng')));
}
{
 const h=harness();h.job.due_at_by_class.c2=h.job.due_at_by_class.c1;
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);assert.equal(h.stats().reads,0);
}
{
 const h=harness(),read=h.pipeline.read;h.pipeline.read=async job=>{const result=await read(job);h.lose();return result;};
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'blocked');assert.equal(h.stats().commits,0);assert.ok(!h.marks.some(m=>m.status==='xong'));
}
{
 const h=harness();h.crash();assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'retry');assert.equal(h.stats().commits,1);assert.equal(h.marks.at(-1).status,'dang');
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'fixture')).status,'complete');assert.equal(h.stats().commits,1);assert.equal(h.stats().builds,1);assert.equal(h.stats().reviews,1);
}
{
 // RPC adapter never calls legacy unscoped publisher, stores false-on-overwrite and verifies collision bytes.
 const calls:any[]=[],content=Buffer.from('test'),sha='9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
 const db={async rpc(name:string,args:any){assert.equal(name,'mtm_lesson_upload_api');calls.push(args.p);return {data:args.p.action==='worker_claim'?{job:null}:['worker_publish','worker_materials'].includes(args.p.action)?{ok:true,publish_receipts:{c1:{receipt:'r'}}}:{ok:true},error:null};},storage:{from(bucket:string){assert.equal(bucket,'mtm-btvn');return {async upload(_p:string,_b:any,options:any){assert.equal(options.upsert,false);return {error:{status:409}};},async download(){return {data:new Blob([content]),error:null};}};}}};
 const repo=createWorkerRepository(db),h=harness();assert.equal(await repo.claim('fixture'),null);const publisher=repo.publisher(h.job);
 await publisher.upload('btvn/'+h.job.lesson_code+'/version/a.pdf',content,'application/pdf',sha);
 await assert.rejects(publisher.upload('btvn/'+h.job.lesson_code+'/version/a.pdf',content,'application/pdf','a'.repeat(64)),/PRIVATE_ASSET_CONFLICT/);
 assert.equal((await publisher.rpc('publish',{})).status,'da_dang');assert.ok(calls.some(c=>c.action==='worker_publish'));
 assert.equal((await publisher.rpc('materials_only',{material:{title:'Bài'}})).status,'da_dang');assert.ok(calls.some(c=>c.action==='worker_materials'));
}
{
 const root=process.env.MTM_ROOT??process.cwd(),folder=await mkdtemp(join(root,'.qa-temp','lesson-private-state-'));
 try{
  const state=createPrivateFileState(folder),ref=await state.save('job-1','draft',{private:'fixture-only'});
  assert.deepEqual(await state.load(ref),{private:'fixture-only'});await assert.rejects(state.load('../secret.json'),/INVALID_STATE_REFERENCE/);
  const file=join(folder,ref);assert.ok((await readFile(file,'utf8')).includes('fixture-only'));await writeFile(file,'{"private":"changed"}');
  await assert.rejects(state.load(ref),/STATE_HASH_MISMATCH/);
 }finally{await rm(folder,{recursive:true,force:true});}
 const cli=await import(pathToFileURL(join(root,'scripts/lesson-upload-worker.mjs')).href);
 await assert.rejects(cli.main(['--once'],{}),/VPS_ADAPTER_CONFIG_REQUIRED/);
 await assert.rejects(cli.main([],{}),/EXPLICIT_ONCE_REQUIRED/);
}
console.log('ĐẠT worker upload: deadline đúng từng lớp, kiểm độc lập, không lộ đáp án cho reviewer, chặn lệch, khóa phiên bản, resume/idempotency và private upload.');
