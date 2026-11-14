/** Explicit cached-only boundaries. Fake service/state; no native/provider or publication. */
import assert from 'node:assert/strict';
import {parseWorkerInvocation,createWorkerRepository,OPERATOR_CONTINUATION_RUNTIME_ENV} from '../server/lesson-upload/supabase-worker';
import {prepareNativeDraft,privateStateDigest,OPERATOR_CACHED_DRAFT_CONTRACT,type OperatorCachedDraftBinding} from '../server/lesson-upload/native-draft';
import {nativeCanonicalDigest,NATIVE_PDF_NORMALIZATION_CONTRACT} from '../server/lesson-upload/native-pdf-normalization';
import {validateClassContext} from '../server/lesson-upload/class-context';
import {createLessonUploadPipeline} from '../server/lesson-upload/native-adapter';
import {expectedSlots} from '../server/btvn/publish-handler';
import {reviewQuestions,runUploadOnce,nextWeekDue,type UploadJob,type Extraction,type PrivateState,type Pipeline,type WorkerRepository} from '../server/lesson-upload/worker';
import {nativeDraftFixture,nativeFixtureSource} from './fixtures/lesson-native-draft';

const credit='33333333-3333-4333-8333-333333333333',runtime='9'.repeat(64),environment={[OPERATOR_CONTINUATION_RUNTIME_ENV]:runtime};
const args=['--once','--is-test','--manual','--operator-continuation','--operator-credit',credit,'--cached-draft-only'];
const tests:{name:string;run:()=>unknown|Promise<unknown>}[]=[];
const test=(name:string,run:()=>unknown|Promise<unknown>)=>tests.push({name,run});
function workerFixture(){
 const base=nativeDraftFixture(),cid=base.job.class_ids[0];
 const job:UploadJob={...base.job,id:base.job.id!,version:1,is_test:true,work_kind:'homework',teacher_key:'synthetic-teacher',title:'Synthetic cached draft',task_scope:'Synthetic items 1-3',answer_path:'SYNTHETIC_PRIVATE_KEY.pdf',answer_text:null,handout_path:null,video_url:null,claim_token:'44444444-4444-4444-8444-444444444444',lesson_code:'web-'+base.job.id!.replaceAll('-',''),start_times:{[cid]:'18:00'},end_times:{[cid]:'20:00'},due_at_by_class:{[cid]:nextWeekDue(base.job.class_dates[cid],'18:00')},checkpoint:{},homework_path:base.job.homework_path!};
 const normalized=prepareNativeDraft(job,base.value),source:Extraction={sourceVersion:nativeFixtureSource,questions:reviewQuestions(base.value.draft.exam),teacherSlots:expectedSlots(base.value.draft.exam),privateAnswerHashes:['e'.repeat(64)],contextReceipt:normalized.contextReceipt};
 const sourceHash=privateStateDigest(source),draftHash=privateStateDigest(normalized),receipt=normalized.nativeNormalization!;
 const binding:OperatorCachedDraftBinding={contract:OPERATOR_CACHED_DRAFT_CONTRACT,source_ref:`${job.id}-source-${sourceHash}.json`,source_state_sha256:sourceHash,raw_native_draft_sha256:base.value.native_cache_record_sha256,class_metadata_sha256:base.value.class_metadata_sha256,normalizer_contract:NATIVE_PDF_NORMALIZATION_CONTRACT,normalizer_sha256:'a'.repeat(64),normalization_receipt_sha256:nativeCanonicalDigest(receipt),normalized_record_sha256:receipt.output_record_sha256,normalized_private_draft_sha256:draftHash,normalized_draft_ref:`${job.id}-draft-${draftHash}.json`,source_version:nativeFixtureSource};
 job.operator_cached_draft=binding;job.checkpoint={source:binding.source_ref};
 const stored=new Map<string,unknown>([[binding.source_ref,structuredClone(source)]]),counts={read:0,build:0,review:0,materials:0,publish:0,finish:0},steps:any[]=[],failures:any[]=[];
 const state:PrivateState={async load(ref){if(!stored.has(ref))throw Error('SYNTHETIC_CACHE_MISSING');return structuredClone(stored.get(ref));},async save(id,stage,value){const ref=`${id}-${stage}-${privateStateDigest(value)}.json`;stored.set(ref,structuredClone(value));return ref;}};
 const pipeline:Pipeline={extractor:{provider:'chatgpt-oauth',model:'synthetic-no-provider'},validateContext:validateClassContext,async read(){counts.read++;throw Error('SYNTHETIC_EXTRACTION_FORBIDDEN');},async build(j){counts.build++;return prepareNativeDraft(j,base.value);},async review(){counts.review++;throw Error('SYNTHETIC_REVIEW_STOP');},async materials(){counts.materials++;throw Error('SYNTHETIC_MATERIALS_FORBIDDEN');}};
 const repo:WorkerRepository={async claim(){return job;},async current(){},async step(_j,step,status,detail,checkpoint){steps.push({step,status,detail,checkpoint:structuredClone(checkpoint)});},async recordFailure(_j,step,code){failures.push({step,code});},async finish(){counts.finish++;throw Error('SYNTHETIC_FINISH_FORBIDDEN');},publisher(){counts.publish++;throw Error('SYNTHETIC_PUBLISH_FORBIDDEN');}};
 return {job,raw:base.value,source,normalized,binding,stored,state,pipeline,repo,counts,steps,failures};
}

test('113 requires the complete explicit flag set and preserves default110/credit112 invocations',()=>{
 const parsed=parseWorkerInvocation(args,environment);assert.equal(parsed.mode,'--once');assert.deepEqual(parsed.options,{isTest:true,auto:false,operatorManual:true,operatorContinuation:{uploadId:'14227822-ce9a-4f0f-8df3-489a60b11392',runtimeManifestSha256:runtime,operatorCreditId:credit,cachedDraftOnly:true}});
 assert.deepEqual(parseWorkerInvocation(['--once'],{}),{mode:'--once',options:{isTest:false,auto:false}});
 const prior=parseWorkerInvocation(args.slice(0,-1),environment);assert.deepEqual(prior.options.operatorContinuation,{uploadId:'14227822-ce9a-4f0f-8df3-489a60b11392',runtimeManifestSha256:runtime,operatorCreditId:credit});
 for(const bad of [[],['--cached-draft-only'],['--cached-draft-only',...args.slice(0,-1)],[...args,'--cached-draft-only'],args.filter(x=>x!=='--manual'),args.filter(x=>x!=='--is-test'),args.filter(x=>x!=='--operator-continuation'),args.filter(x=>x!=='--operator-credit'&&x!==credit),args.map(x=>x==='--once'?'--review-once':x),[...args,'--auto'],args.map(x=>x===credit?'not-a-credit':x),args.map(x=>x===credit?'00000000-0000-0000-0000-000000000000':x)])assert.throws(()=>parseWorkerInvocation(bad,environment));
 assert.throws(()=>parseWorkerInvocation(args,{}),/RUNTIME_REQUIRED/);
});

test('RPC113 has exact opt-ins; default110 and112 payloads remain unchanged',async()=>{
 for(const mode of [110,112,113]){
  const calls:any[]=[],options=mode===110?{}:parseWorkerInvocation(mode===112?args.slice(0,-1):args,environment).options;
  const db={async rpc(name:string,{p}:any){calls.push({name,p});return {data:{job:null},error:null};}};await createWorkerRepository(db,options).claim('synthetic-worker');
  const expected:any={action:'worker_claim',worker_protocol:mode,worker_id:'synthetic-worker',lease_seconds:900,is_test:mode!==110};
  if(mode!==110)Object.assign(expected,{operator_continuation:true,upload_id:'14227822-ce9a-4f0f-8df3-489a60b11392',runtime_manifest_sha256:runtime,auto:false,operator_credit_id:credit});
  if(mode===113)expected.operator_cached_draft_only=true;
  assert.equal(calls.length,1);assert.equal(calls[0].name,'mtm_lesson_upload_api');assert.equal(JSON.stringify(calls[0].p),JSON.stringify(expected));
 }
});

test('RPC113 rejects mismatched target/test/version/credit or absent cached binding',async()=>{
 const options=parseWorkerInvocation(args,environment).options;
 for(const change of [{id:'other'},{version:2},{is_test:false},{operator_continuation:false},{operator_credit_id:'55555555-5555-4555-8555-555555555555'},{operator_cached_draft:null},{operator_cached_draft:{contract:'wrong'}}]){
  const job={id:'14227822-ce9a-4f0f-8df3-489a60b11392',version:1,is_test:true,operator_continuation:true,operator_credit_id:credit,operator_cached_draft:{contract:OPERATOR_CACHED_DRAFT_CONTRACT},...change};
  await assert.rejects(createWorkerRepository({async rpc(){return {data:{job},error:null};}},options).claim('synthetic-worker'),/RECEIPT_MISMATCH/);
 }
});

test('Actual native adapter rejects source read before private-source RPC or native child boundary',async()=>{
 const f=workerFixture(),prior=process.env.MTM_LESSON_NATIVE_DRIVER;process.env.MTM_LESSON_NATIVE_DRIVER='SYNTHETIC_NEVER_EXECUTED.py';let sourceCalls=0;
 try{const pipeline=await createLessonUploadPipeline({db:{async rpc(){sourceCalls++;throw Error('NO_SOURCE_RPC');}}});await assert.rejects(pipeline.read(f.job),/CACHED_DRAFT_EXTRACTION_FORBIDDEN/);assert.equal(sourceCalls,0);}
 finally{if(prior===undefined)delete process.env.MTM_LESSON_NATIVE_DRIVER;else process.env.MTM_LESSON_NATIVE_DRIVER=prior;}
});

test('Missing or wrong source checkpoint cannot fall back to extraction',async()=>{
 for(const change of [(f:ReturnType<typeof workerFixture>)=>{delete f.job.checkpoint.source;},(f:ReturnType<typeof workerFixture>)=>{f.job.checkpoint.source='wrong-ref';},(f:ReturnType<typeof workerFixture>)=>{f.stored.delete(f.binding.source_ref);}]){
  const f=workerFixture();change(f);const result=await runUploadOnce(f.repo,f.pipeline,f.state,'synthetic-worker');assert.equal(result.status,'blocked');assert.equal(f.counts.read,0);assert.equal(f.counts.build,0);assert.equal(f.counts.review,0);
 }
});

test('Corrupt source bytes/context/version stop before cached build or review',async()=>{
 for(const mutate of [(s:any)=>{s.questions[0].prompt='changed';},(s:any)=>{s.sourceVersion='0'.repeat(64);},(s:any)=>{s.contextReceipt.metadataSha256='0'.repeat(64);}]){
  const f=workerFixture(),source=structuredClone(f.source);mutate(source);f.stored.set(f.binding.source_ref,source);const result=await runUploadOnce(f.repo,f.pipeline,f.state,'synthetic-worker');assert.equal(result.status,'blocked');assert.equal(result.code,'OPERATOR_CACHED_DRAFT_BINDING_CHANGED');assert.equal(f.counts.read+f.counts.build+f.counts.review,0);
 }
});

test('Missing/wrong/corrupt cached Draft or receipt never triggers extraction, rebuild or review',async()=>{
 for(const variant of ['wrong-ref','missing','math','receipt','record'] as const){
  const f=workerFixture();f.job.checkpoint.draft=f.binding.normalized_draft_ref;f.stored.set(f.binding.normalized_draft_ref,structuredClone(f.normalized));
  if(variant==='wrong-ref')f.job.checkpoint.draft='wrong-draft-ref';
  if(variant==='missing')f.stored.delete(f.binding.normalized_draft_ref);
  const draft=structuredClone(f.normalized);if(variant==='math'){draft.exam.questions[0].prompt='changed';f.stored.set(f.binding.normalized_draft_ref,draft);}
  if(variant==='receipt'){draft.nativeNormalization!.mappings[0].old='changed';f.stored.set(f.binding.normalized_draft_ref,draft);}
  if(variant==='record'){draft.nativeNormalization!.output_record_sha256='0'.repeat(64);f.stored.set(f.binding.normalized_draft_ref,draft);}
  const result=await runUploadOnce(f.repo,f.pipeline,f.state,'synthetic-worker');assert.equal(result.status,'blocked');assert.equal(f.counts.read+f.counts.build+f.counts.review,0);assert.equal(f.counts.publish+f.counts.finish,0);
 }
});

test('Wrong raw/normalization/private-record pins block the real pure cached builder before review',async()=>{
 for(const key of ['raw_native_draft_sha256','normalization_receipt_sha256','normalized_record_sha256','normalized_private_draft_sha256'] as const){
  const f=workerFixture();f.binding[key]='0'.repeat(64);if(key==='normalized_private_draft_sha256')f.binding.normalized_draft_ref=`${f.job.id}-draft-${f.binding[key]}.json`;
  const result=await runUploadOnce(f.repo,f.pipeline,f.state,'synthetic-worker');assert.equal(result.status,'blocked');assert.equal(f.counts.read,0);assert.equal(f.counts.review,0);assert.equal(f.counts.publish+f.counts.finish,0);
 }
});

test('Positive cached build uses actual prepareNativeDraft to reach stage4 and stops explicitly before any publication',async()=>{
 const f=workerFixture(),raw=JSON.stringify(f.raw),source=JSON.stringify(f.source);const result=await runUploadOnce(f.repo,f.pipeline,f.state,'synthetic-worker');
 assert.deepEqual(result,{status:'blocked',uploadId:f.job.id,code:'SYNTHETIC_REVIEW_STOP'});assert.deepEqual(f.counts,{read:0,build:1,review:1,materials:0,publish:0,finish:0});
 assert.ok(f.steps.some(s=>s.step===3&&s.status==='xong'));assert.ok(f.steps.some(s=>s.step===4&&s.status==='dang'));const saved=f.steps.find(s=>s.step===3&&s.status==='xong').checkpoint;
 assert.equal(saved.source,f.binding.source_ref);assert.equal(saved.draft,f.binding.normalized_draft_ref);assert.deepEqual(saved.operator_cached_draft,f.binding);assert.equal(privateStateDigest(f.stored.get(saved.draft)),f.binding.normalized_private_draft_sha256);
 assert.equal(JSON.stringify(f.raw),raw);assert.equal(JSON.stringify(f.stored.get(f.binding.source_ref)),source);assert.deepEqual(f.failures,[{step:4,code:'SYNTHETIC_REVIEW_STOP'}]);
});

test('Same-review cached cp.draft verifies its exact hash and skips the native builder',async()=>{
 const f=workerFixture();f.job.checkpoint.draft=f.binding.normalized_draft_ref;f.job.checkpoint.operator_cached_draft={...f.binding};(f.job as any).operator_review_resume=true;f.stored.set(f.binding.normalized_draft_ref,structuredClone(f.normalized));
 f.pipeline.build=async()=>{f.counts.build++;throw Error('NO_REBUILD_ON_REVIEW_RESUME');};const raw=JSON.stringify(f.raw),result=await runUploadOnce(f.repo,f.pipeline,f.state,'synthetic-worker');
 assert.equal(result.code,'SYNTHETIC_REVIEW_STOP');assert.deepEqual(f.counts,{read:0,build:0,review:1,materials:0,publish:0,finish:0});assert.equal(JSON.stringify(f.raw),raw);assert.equal(nativeCanonicalDigest((f.stored.get(f.binding.normalized_draft_ref) as any).nativeNormalization),f.binding.normalization_receipt_sha256);
});

let failed=0;for(const [index,{name,run}] of tests.entries()){try{await run();console.log(`  ok CACHED113-${index+1} ${name}`);}catch(error){failed++;console.log(`  FAIL CACHED113-${index+1} ${name}: ${error instanceof Error?error.message:'Error'}`);}}
console.log(JSON.stringify({suite:'LESSON-CACHED-ONLY',total:tests.length,passed:tests.length-failed,failed,providerCalls:0,liveSQL:0,publicationCalls:0}));if(failed)process.exitCode=1;
