import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {closeSync,mkdtempSync,openSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pipelineFixture} from './btvn-pipeline-fixture';
import {expectedSlots} from '../server/btvn/publish-handler';
import {runUploadOnce,nextWeekDue,reviewQuestions,projectUploadPaper,type UploadJob,type Pipeline} from '../server/lesson-upload/worker';
import {reviewUploadOnce} from '../server/lesson-upload/review-backfill';
import {createLessonUploadPipeline} from '../server/lesson-upload/native-adapter';
import {CLASS_CONTEXT_CONTRACT,canonicalClassJson,managedClassContext,classContextHash,validateClassContext,contextReceiptFromNative} from '../server/lesson-upload/class-context';

const root=process.env.MTM_ROOT??process.cwd(),area=join(root,'.qa-temp','exam-intake-110','checkpoint-class-context');
let passed=0;
async function test(name:string,run:()=>unknown){await run();passed++;console.log('PASS '+name);}
const sourceVersion='c'.repeat(64);
const contextReceipt=(job:any,version=sourceVersion)=>({contract:CLASS_CONTEXT_CONTRACT,metadataSha256:classContextHash(job,version),sourceVersion:version});
function baseJob():UploadJob{return {id:'01234567-0000-4000-8000-000000000001',claim_token:'synthetic-claim',lesson_code:'web-synthetic-context',class_ids:['c1','c2'],class_names:{c1:'Lớp giả B 🧮',c2:'Lớp giả A'},class_grades:{c1:12,c2:12},grade_source:'managed_class_catalog',class_grade_complete:true,class_grade_issue:null,class_dates:{c1:'2026-11-02',c2:'2026-11-03'},start_times:{c1:'17:30',c2:'19:30'},due_at_by_class:{c1:nextWeekDue('2026-11-02','17:30'),c2:nextWeekDue('2026-11-03','19:30')},lesson_date:'2026-11-02',teacher_key:'synthetic-teacher',title:'Bài giả cục bộ',task_scope:'Câu 1–3',homework_path:'synthetic/hs.pdf',answer_path:'synthetic/gv.pdf',answer_text:null,handout_path:null,video_url:null,version:1,checkpoint:{}};}
function harness({pair=false,hook=true}={}){
 const job=baseJob(),fixture=pipelineFixture();if(pair){job.homework2_path='synthetic/hs2.pdf';job.answer2_path='synthetic/gv2.pdf';job.task_scope2='Câu 1–3 đề 2';}
 const stats={reads:0,builds:0,reviews:0,commits:0,bundles:0,uploads:0,failures:[] as string[],failureEvents:[] as {paper:number;step:number;code:string}[],marks:[] as {paper:number;step:number;status:string}[],reviewResults:0};
 const values=new Map<string,any>(),durable:any={};let saves=0;
 const state={async save(id:string,stage:string,value:unknown){const ref=id+':'+stage+':'+(++saves);values.set(ref,structuredClone(value));return ref;},async load(ref:string){assert.ok(values.has(ref));return structuredClone(values.get(ref));}};
 const raw=(j:UploadJob,version=sourceVersion)=>({sourceVersion:version,questions:reviewQuestions(fixture.exam),teacherSlots:expectedSlots(fixture.exam),privateAnswerHashes:['e'.repeat(64)],contextReceipt:contextReceipt(j,version)});
 const draft=(j:UploadJob,version=sourceVersion)=>({exam:structuredClone(fixture.exam),assets:structuredClone(fixture.assets),contextReceipt:contextReceipt(j,version)});
 const pipeline:Pipeline={extractor:{provider:'codex',model:'synthetic'},...(hook?{validateContext:validateClassContext}:{}),async read(j){stats.reads++;return raw(j);},async build(j,s){stats.builds++;return draft(j,s.sourceVersion);},async review(input){stats.reviews++;const text=JSON.stringify(input);for(const privateField of ['contextReceipt','metadataSha256',CLASS_CONTEXT_CONTRACT,'teacherSlots','acceptedAnswers','expected','solution'])assert.ok(!text.includes(privateField));return {provider:'grok',model:'synthetic-independent',receipt_hash:'d'.repeat(64),slots:fixture.verification.slots};},async materials(){return {handoutUrl:null,materialUrl:null};}};
 const checkPublic=(payload:unknown)=>{const text=JSON.stringify(payload);assert.ok(!text.includes('contextReceipt'));assert.ok(!text.includes(CLASS_CONTEXT_CONTRACT));assert.ok(!text.includes('metadataSha256'));};
 const repo={async claim(){return {...job,checkpoint:structuredClone(durable)};},async current(){},async step(_j:any,n:number,status:string,_d:string,cp:any,paper?:1|2){stats.marks.push({step:n,status,paper:paper??_j.paper??1});Object.assign(durable,structuredClone(cp));},async finish(){},async recordFailure(_j:any,n:number,code:string){stats.failures.push(code);stats.failureEvents.push({step:n,code,paper:_j.paper??1});},async publishBundle(_j:any,a:unknown,b:unknown){checkPublic(a);checkPublic(b);stats.bundles++;},publisher(){return {async rpc(action:string,payload?:unknown){if(action==='lookup')return {status:null};assert.equal(action,'publish');checkPublic(payload);stats.commits++;return {status:'da_dang'};},async upload(){stats.uploads++;}};}};
 function cache(paper:1|2=1,{legacySource=false,legacyDraft=false,orphan=false}={}){
  const projected=pair?projectUploadPaper({...job,checkpoint:durable},paper):job,version=paper===1?sourceVersion:'f'.repeat(64),s:any=raw(projected,version),d:any=draft(projected,version),cp:any={};
  if(legacySource)delete s.contextReceipt;if(legacyDraft)delete d.contextReceipt;
  if(!orphan){cp.source='cached-source-'+paper;values.set(cp.source,s);}cp.draft='cached-draft-'+paper;values.set(cp.draft,d);
  if(pair)durable['paper'+paper]=cp;else Object.assign(durable,cp);
  return {s,d,cp,version};
 }
 const backfillDb={async rpc(name:string,{p}:any){assert.equal(name,'mtm_lesson_upload_api');if(p.action==='worker_pending_review')return {data:{job:{...job,checkpoint:structuredClone(durable),pending_reviews:(pair?[1,2]:[1]).map(paper=>({paper,source_version:paper===1?sourceVersion:'f'.repeat(64),request_hash:'a'.repeat(64)}))}},error:null};assert.equal(p.action,'worker_review_result');stats.reviewResults++;return {data:{ok:true},error:null};}};
 return {job,fixture,stats,state,pipeline,repo,cache,values,durable,raw,draft,backfillDb};
}
const noProviders=(h:ReturnType<typeof harness>)=>{assert.equal(h.stats.reads,0);assert.equal(h.stats.builds,0);assert.equal(h.stats.reviews,0);assert.equal(h.stats.commits,0);assert.equal(h.stats.bundles,0);assert.equal(h.stats.reviewResults,0);};

await test('canonical context matches actual Python utility with Unicode and map order',()=>{
 const job=baseJob();job.class_ids.reverse();
 const file=join(root,'tools','lesson-upload','native-driver.py');
 const py="import importlib.util,json,sys,hashlib; s=importlib.util.spec_from_file_location('pure_class_context',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); j=json.loads(sys.stdin.buffer.read().decode('utf-8')); c=m.managed_class_context(j,'"+sourceVersion+"'); r=json.dumps(c,ensure_ascii=False,sort_keys=True,separators=(',',':')); print(json.dumps({'context':c,'hash':hashlib.sha256(r.encode('utf-8')).hexdigest()},ensure_ascii=True))";
 const result=spawnSync('python',['-B','-c',py,file],{input:JSON.stringify(job),encoding:'utf8'});assert.equal(result.status,0,result.stderr);const expected=JSON.parse(result.stdout);
 assert.deepEqual(managedClassContext(job,sourceVersion),expected.context);assert.equal(classContextHash(job,sourceVersion),expected.hash);assert.equal(classContextHash({...job,class_ids:['c1','c2']},sourceVersion),expected.hash);
 assert.equal(canonicalClassJson({'\u{10000}':1,'\ue000':2}),'{"":2,"𐀀":1}');
});
await test('managed facts required; no label inference or grade coercion',()=>{
 for(const patch of [{class_grades:undefined},{grade_source:'label_guess'},{class_grade_complete:false},{class_grade_issue:'unconfirmed'},{class_grades:{c1:'12',c2:12}},{class_names:{c1:'Lớp 12'}},{class_grades:{c1:12,c2:12,extra:12}}])assert.throws(()=>managedClassContext({...baseJob(),...patch} as any,sourceVersion),/NATIVE_CLASS_METADATA_REQUIRED/);
 assert.throws(()=>managedClassContext({...baseJob(),class_grades:{c1:10,c2:12}},sourceVersion),/NATIVE_CLASS_GRADE_AMBIGUOUS/);
 assert.throws(()=>canonicalClassJson('\ud800'),/NATIVE_CLASS_METADATA_REQUIRED/);
});
await test('legacy single source blocks without read/build/review/publish and preserves checkpoint',async()=>{
 const h=harness();h.cache(1,{legacySource:true,legacyDraft:true});const before=structuredClone(h.durable);
 const result=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(result.status,'blocked');assert.equal(result.code,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');assert.deepEqual(h.stats.failureEvents,[{paper:1,step:2,code:'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED'}]);noProviders(h);assert.deepEqual(h.durable,before);
});
await test('valid source plus legacy draft is blocked before review',async()=>{
 const h=harness();h.cache(1,{legacyDraft:true});const r=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(r.status,'blocked');assert.equal(r.code,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');noProviders(h);
});
await test('orphan legacy draft never starts extraction',async()=>{
 const h=harness();h.cache(1,{orphan:true});const r=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(r.code,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');noProviders(h);
});
for(const field of ['label','class_date','lesson_date','grade','sourceVersion','contract','hash'] as const)await test('checkpoint context change rejected: '+field,async()=>{
 const h=harness(),{s}=h.cache();if(field==='label')h.job.class_names.c1+=' đổi';if(field==='class_date'){h.job.class_dates.c1='2026-11-04';h.job.due_at_by_class.c1=nextWeekDue('2026-11-04','17:30');}if(field==='lesson_date')h.job.lesson_date='2026-11-04';if(field==='grade')h.job.class_grades={c1:11,c2:11};if(field==='sourceVersion')s.sourceVersion='b'.repeat(64);if(field==='contract')s.contextReceipt.contract='old';if(field==='hash')s.contextReceipt.metadataSha256='b'.repeat(64);
 const r=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(r.code,'NATIVE_CLASS_METADATA_CHANGED');noProviders(h);
});
await test('draft grade conflict rejected even with matching receipt',async()=>{
 const h=harness(),{d}=h.cache();d.exam.grade=11;const r=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(r.code,'NATIVE_CLASS_GRADE_MISMATCH');noProviders(h);
});
await test('fresh source missing receipt blocks before build',async()=>{
 const h=harness();h.pipeline.read=async j=>{h.stats.reads++;const s:any=h.raw(j);delete s.contextReceipt;return s;};const r=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(r.code,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');assert.equal(h.stats.reads,1);assert.equal(h.stats.builds,0);assert.equal(h.stats.reviews,0);assert.equal(h.stats.commits,0);
});
await test('fresh valid source/draft pass; receipts stay private; resume avoids provider calls',async()=>{
 const h=harness();assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).status,'complete');assert.deepEqual([h.stats.reads,h.stats.builds,h.stats.reviews,h.stats.commits],[1,1,1,1]);
 assert.ok(h.values.get(h.durable.source).contextReceipt);assert.ok(h.values.get(h.durable.draft).contextReceipt);
 assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).status,'complete');assert.deepEqual([h.stats.reads,h.stats.builds,h.stats.reviews],[1,1,1]);
});
await test('valid cached single passes with no extraction/build',async()=>{
 const h=harness();h.cache();assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).status,'complete');assert.deepEqual([h.stats.reads,h.stats.builds,h.stats.reviews,h.stats.commits],[0,0,1,1]);
});
await test('pair prechecks legacy second paper before reviewing valid first paper',async()=>{
 const h=harness({pair:true});h.cache(1);h.cache(2,{legacyDraft:true});const before=structuredClone(h.durable);const r=await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic');assert.equal(r.code,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');assert.deepEqual(h.stats.failureEvents,[{paper:2,step:2,code:'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED'}]);assert.deepEqual(h.stats.marks.filter(m=>m.status==='loi'),[{paper:2,step:2,status:'loi'}]);noProviders(h);assert.deepEqual(h.durable,before);
});
await test('pair prechecks orphan second paper without starting first extraction',async()=>{
 const h=harness({pair:true});h.cache(2,{orphan:true});assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).code,'NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED');noProviders(h);
});
await test('valid cached pair uses per-paper version and exactly one atomic bundle',async()=>{
 const h=harness({pair:true});h.cache(1);h.cache(2);assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).status,'complete');assert.deepEqual([h.stats.reads,h.stats.builds,h.stats.reviews,h.stats.bundles],[0,0,2,1]);assert.equal(h.stats.commits,0);
});
await test('pair stale second source/draft version rejects before either reviewer',async()=>{
 const h=harness({pair:true});h.cache(1);const {d}=h.cache(2);d.contextReceipt=contextReceipt(h.job,sourceVersion);assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).code,'NATIVE_CLASS_METADATA_CHANGED');noProviders(h);
});
await test('backfill single legacy checkpoint blocks without review/result write',async()=>{
 const h=harness();h.cache(1,{legacyDraft:true});await assert.rejects(reviewUploadOnce(h.backfillDb,h.pipeline,h.state,true),/NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED/);noProviders(h);
});
await test('backfill pair prechecks all pending papers before any review/result write',async()=>{
 const h=harness({pair:true});h.cache(1);h.cache(2,{legacySource:true});await assert.rejects(reviewUploadOnce(h.backfillDb,h.pipeline,h.state,true),/NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED/);noProviders(h);
});
await test('backfill valid pair reviews both and writes results with no read/build',async()=>{
 const h=harness({pair:true});h.cache(1);h.cache(2);assert.equal((await reviewUploadOnce(h.backfillDb,h.pipeline,h.state,true)).status,'reviewed');assert.deepEqual([h.stats.reads,h.stats.builds,h.stats.reviews,h.stats.reviewResults],[0,0,2,2]);
});
await test('optional hook preserves generic fake pipeline compatibility',async()=>{
 const h=harness({hook:false});h.cache(1,{legacySource:true,legacyDraft:true});assert.equal((await runUploadOnce(h.repo,h.pipeline,h.state,'synthetic')).status,'complete');
});
await test('native adapter always provides hook and decorates cached/fallback drafts from real local child',async()=>{
 const h=harness(),tmp=mkdtempSync(join(area,'native-child-')),fd=openSync(join(tmp,'synthetic.lock'),'w+'),envKeys=['BTVN_PYTHON','MTM_LESSON_NATIVE_DRIVER','MTM_LESSON_LOCK_FD'] as const,prior=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 let dbCalls=0;const db={sourceOrigin:'https://synthetic.invalid',async rpc(){dbCalls++;return {data:{data_base64:Buffer.from('SYNTHETIC_ONLY').toString('base64')},error:null};}};
 const record:any={class_context_contract:CLASS_CONTEXT_CONTRACT,class_metadata_sha256:classContextHash(h.job,sourceVersion),sourceVersion,extractor:{provider:'chatgpt-oauth',model:'synthetic'},draft:{exam:h.fixture.exam,assets:h.fixture.assets}};
 const file=join(tmp,'fake-native.mjs'),calls=join(tmp,'calls.txt');
 function child(){writeFileSync(file,"import {appendFileSync} from 'node:fs'; let s=''; for await(const c of process.stdin)s+=c; const input=JSON.parse(s); appendFileSync("+JSON.stringify(calls)+",input.stage+'\\n'); process.stdout.write("+JSON.stringify(JSON.stringify(record))+");");}
 try{
  child();process.env.BTVN_PYTHON=process.execPath;process.env.MTM_LESSON_NATIVE_DRIVER=file;process.env.MTM_LESSON_LOCK_FD=String(fd);
  const pipeline=await createLessonUploadPipeline({db});assert.equal(typeof pipeline.validateContext,'function');const s=await pipeline.read(h.job),d=await pipeline.build(h.job,s);await pipeline.validateContext!(h.job,s,d);assert.deepEqual(s.contextReceipt,d.contextReceipt);assert.equal(readFileSync(calls,'utf8'),'prepare\n');assert.equal(dbCalls,2);
  const cold=await createLessonUploadPipeline({db}),fallback=await cold.build(h.job,s);assert.deepEqual(fallback.contextReceipt,s.contextReceipt);assert.equal(readFileSync(calls,'utf8'),'prepare\ndraft\n');assert.equal(dbCalls,2);
  record.class_metadata_sha256='a'.repeat(64);child();await assert.rejects((await createLessonUploadPipeline({db})).read(h.job),/NATIVE_CLASS_METADATA_CHANGED/);
  record.class_metadata_sha256=classContextHash(h.job,sourceVersion);record.draft.exam.grade=11;child();await assert.rejects((await createLessonUploadPipeline({db})).read(h.job),/NATIVE_CLASS_GRADE_MISMATCH/);
  assert.throws(()=>contextReceiptFromNative(h.job,{...record,sourceVersion:'wrong'}),/NATIVE_CLASS_METADATA_REQUIRED/);
 }finally{for(const key of envKeys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}closeSync(fd);}
});
console.log(JSON.stringify({ok:true,passed,scope:'local synthetic, no provider/network/native runtime/cloud calls'}));
