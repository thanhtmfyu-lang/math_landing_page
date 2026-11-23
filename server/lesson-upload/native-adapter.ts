import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {expectedSlots} from '../btvn/publish-handler';
import {reviewQuestions,type Pipeline,type UploadJob,type Draft} from './worker';
import {validateClassContext} from './class-context';
import {prepareNativeDraft} from './native-draft';
import {extractProgress,extractYield} from './extract-progress';
const PUBLIC_NATIVE_INPUT_ERRORS=new Set([
 'NATIVE_SOURCE_INVENTORY_REQUIRED','NATIVE_SOURCE_INVENTORY_AMBIGUOUS','NATIVE_SOURCE_INVENTORY_PAGE_UNRESOLVED',
 'NATIVE_PDF_PAGE_LIMIT','NATIVE_PDF_RENDER_INCOMPLETE','NATIVE_DRIVER_TIMEOUT',
 'NATIVE_LONG_PDF_BRANDING_REVIEW_REQUIRED','NATIVE_LONG_PDF_PROGRESS_MISMATCH',
 'NATIVE_LONG_PDF_PROVIDER_OUTCOME_UNKNOWN','NATIVE_LONG_PDF_SEGMENT_REVIEW_REQUIRED','NATIVE_LONG_PDF_LOCATOR_UNRESOLVED',
 'NATIVE_SCOPE_UNRESOLVED','NATIVE_SCOPE_REF_MISSING','NATIVE_SCOPE_AMBIGUOUS',
 'NATIVE_EXTRACT_INVENTORY_MISMATCH','NATIVE_DRAFT_INVENTORY_REVALIDATION_REQUIRED',
 'NATIVE_CLASS_METADATA_REQUIRED','NATIVE_CLASS_GRADE_AMBIGUOUS','NATIVE_CLASS_GRADE_CONFLICT',
 'NATIVE_CLASS_GRADE_MISMATCH','NATIVE_CLASS_METADATA_CHANGED',
 'CACHED_DRAFT_EXTRACTION_FORBIDDEN','OPERATOR_CACHED_DRAFT_BINDING_REQUIRED','OPERATOR_CACHED_DRAFT_BINDING_CHANGED',
]);
/** Existing native pipeline, isolated private state and shared native budget. */
export async function createLessonUploadPipeline({db}:{db:any}):Promise<Pipeline>{
 const driver=process.env.MTM_LESSON_NATIVE_DRIVER;if(!driver)throw Error('NATIVE_DRIVER_REQUIRED');
 const invoke=(input:unknown)=>new Promise<any>((resolve,reject)=>{
  const inherited=Number(process.env.MTM_LESSON_LOCK_FD);if(!Number.isInteger(inherited)||inherited<3)return reject(Error('SHARED_WORKER_LOCK_REQUIRED'));
  const environment:Record<string,string|undefined>={...process.env,MTM_LESSON_LOCK_FD:'3'};delete environment.BTVN_PUBLISH_SECRET;delete environment.BTVN_PUBLISH_URL;delete environment.SUPABASE_SERVICE_ROLE_KEY;
  const child=spawn(process.env.BTVN_PYTHON??'python3',[driver],{stdio:['pipe','pipe','pipe',inherited],env:environment});let output='',nativeError='',errorBytes=0,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},780000);
  child.stdout.on('data',v=>{output+=v;if(output.length>60*1024*1024)child.kill();});
  // Only fixed input-error codes cross the private process boundary. Retain at
  // most256 bytes in memory; provider/auth text is never logged or returned.
  child.stderr.on('data',v=>{errorBytes+=Buffer.byteLength(v);if(errorBytes<=256)nativeError+=v.toString('utf8');});
  child.on('error',()=>reject(Error('NATIVE_DRIVER_FAILED')));
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error();resolve(JSON.parse(output));}catch{const safe=errorBytes<=256&&PUBLIC_NATIVE_INPUT_ERRORS.has(nativeError.trim())?nativeError.trim():'NATIVE_DRIVER_FAILED';reject(Error(timedOut?'NATIVE_DRIVER_TIMEOUT':safe));}});child.stdin.end(JSON.stringify(input));
 });
 const source=async(job:UploadJob,kind:string)=>{const {data,error}=await db.rpc('mtm_lesson_upload_source',{upload_id:job.id,claim_token:job.claim_token,kind});if(error)throw Error(/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message??'')?error.message:'PRIVATE_SOURCE_UNAVAILABLE');if(!data?.data_base64)throw Error('PRIVATE_SOURCE_UNAVAILABLE');return data.data_base64;};
 const drafts=new Map<string,Draft>(),key=(j:UploadJob)=>j.id+':'+(j.paper??1);
 const nativeDraft=(job:UploadJob,value:any):Draft=>prepareNativeDraft(job,value);
 const extractor:Pipeline['extractor']={provider:'chatgpt-oauth',model:'loaded-from-native-receipt'};
 return {extractor,
  validateContext:validateClassContext,
  async read(job){
   if(job.operator_cached_draft)throw Error('CACHED_DRAFT_EXTRACTION_FORBIDDEN');
   if(!job.homework_path)return {sourceVersion:'0'.repeat(64),questions:[],teacherSlots:[]};
   const hs=await source(job,job.paper===2?'homework2':'homework');
   const gv=job.answer_path?await source(job,job.paper===2?'answer2':'answer'):null;
   if(typeof db.sourceOrigin!=='string'||!db.sourceOrigin.startsWith('https://'))throw Error('PRIVATE_SOURCE_ORIGIN_REQUIRED');
   const claimed=job.extract_progress?.[job.paper??1];
   const previous=extractProgress(claimed);
   if(claimed!==undefined&&!previous)throw Error('NATIVE_EXTRACT_YIELD_INVALID');
   const sourceVersion=()=>createHash('sha256').update(Buffer.from(hs,'base64')).update(Buffer.from(gv??'','base64')).digest('hex');
   if(previous && (!gv || previous.sourceVersion!==sourceVersion()))throw Error('NATIVE_EXTRACT_YIELD_INVALID');
   const value=await invoke({stage:'prepare',job,homework_base64:hs,answer_base64:gv,source_origin:db.sourceOrigin});
   if(value?.status!==undefined){
    const pending=extractYield(value);
    if(!pending || !job.extract_progress || !gv || pending.sourceVersion!==sourceVersion() ||
       (previous && (pending.plan_hash!==previous.plan_hash || pending.progress_count<=previous.progress_count ||
                     pending.progress_hash===previous.progress_hash)))throw Error('NATIVE_EXTRACT_YIELD_INVALID');
    return pending;
   }
   if(previous && value?.sourceVersion!==previous.sourceVersion)throw Error('NATIVE_EXTRACT_YIELD_INVALID');
   if(!['chatgpt-oauth','openai','codex'].includes(value.extractor?.provider)||!value.extractor?.model)throw Error('NATIVE_RECEIPT_REQUIRED');
   Object.assign(extractor,value.extractor);
   const draft=nativeDraft(job,value);drafts.set(key(job),draft);
   return {sourceVersion:value.sourceVersion,questions:reviewQuestions(draft.exam),teacherSlots:expectedSlots(draft.exam),privateAnswerHashes:gv?[createHash('sha256').update(Buffer.from(gv,'base64')).digest('hex')]:[],contextReceipt:draft.contextReceipt};
  },
  async build(job,extraction){const cached=drafts.get(key(job));const draft=cached??nativeDraft(job,await invoke({stage:'draft',job,sourceVersion:extraction.sourceVersion}));validateClassContext(job,extraction,draft);return draft;},
  async review(input){return invoke({stage:'review',...input});},
  async materials(job){return {handoutUrl:null,materialUrl:null,...(job.handout_path?{pending:true}:{})};}
 };
}
