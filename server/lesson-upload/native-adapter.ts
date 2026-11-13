import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {expectedSlots} from '../btvn/publish-handler';
import {reviewQuestions,type Pipeline,type UploadJob,type Draft} from './worker';
/** Existing native pipeline, isolated private state and shared native budget. */
export async function createLessonUploadPipeline({db}:{db:any}):Promise<Pipeline>{
 const driver=process.env.MTM_LESSON_NATIVE_DRIVER;if(!driver)throw Error('NATIVE_DRIVER_REQUIRED');
 const invoke=(input:unknown)=>new Promise<any>((resolve,reject)=>{
  const inherited=Number(process.env.MTM_LESSON_LOCK_FD);if(!Number.isInteger(inherited)||inherited<3)return reject(Error('SHARED_WORKER_LOCK_REQUIRED'));
  const environment:Record<string,string|undefined>={...process.env,MTM_LESSON_LOCK_FD:'3'};delete environment.BTVN_PUBLISH_SECRET;delete environment.BTVN_PUBLISH_URL;delete environment.SUPABASE_SERVICE_ROLE_KEY;
  const child=spawn(process.env.BTVN_PYTHON??'python3',[driver],{stdio:['pipe','pipe','pipe',inherited],env:environment});let output='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},780000);
  child.stdout.on('data',v=>{output+=v;if(output.length>60*1024*1024)child.kill();});child.stderr.resume();child.on('error',()=>reject(Error('NATIVE_DRIVER_FAILED')));
  child.on('close',code=>{clearTimeout(timer);try{if(code)throw Error();resolve(JSON.parse(output));}catch{reject(Error(timedOut?'NATIVE_DRIVER_TIMEOUT':'NATIVE_DRIVER_FAILED'));}});child.stdin.end(JSON.stringify(input));
 });
 const source=async(job:UploadJob,kind:string)=>{const {data,error}=await db.rpc('mtm_lesson_upload_source',{upload_id:job.id,claim_token:job.claim_token,kind});if(error)throw Error(/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message??'')?error.message:'PRIVATE_SOURCE_UNAVAILABLE');if(!data?.data_base64)throw Error('PRIVATE_SOURCE_UNAVAILABLE');return data.data_base64;};
 const drafts=new Map<string,Draft>(),key=(j:UploadJob)=>j.id+':'+(j.paper??1);
 const extractor:Pipeline['extractor']={provider:'chatgpt-oauth',model:'loaded-from-native-receipt'};
 return {extractor,
  async read(job){
   if(!job.homework_path)return {sourceVersion:'0'.repeat(64),questions:[],teacherSlots:[]};
   const hs=await source(job,job.paper===2?'homework2':'homework');
   const gv=job.answer_path?await source(job,job.paper===2?'answer2':'answer'):null;
   if(typeof db.sourceOrigin!=='string'||!db.sourceOrigin.startsWith('https://'))throw Error('PRIVATE_SOURCE_ORIGIN_REQUIRED');
   const value=await invoke({stage:'prepare',job,homework_base64:hs,answer_base64:gv,source_origin:db.sourceOrigin});
   if(!['chatgpt-oauth','openai','codex'].includes(value.extractor?.provider)||!value.extractor?.model)throw Error('NATIVE_RECEIPT_REQUIRED');
   Object.assign(extractor,value.extractor);
   drafts.set(key(job),value.draft);
   return {sourceVersion:value.sourceVersion,questions:reviewQuestions(value.draft.exam),teacherSlots:expectedSlots(value.draft.exam),privateAnswerHashes:gv?[createHash('sha256').update(Buffer.from(gv,'base64')).digest('hex')]:[]};
  },
  async build(job,extraction){const cached=drafts.get(key(job));return cached??(await invoke({stage:'draft',job,sourceVersion:extraction.sourceVersion})).draft;},
  async review(input){return invoke({stage:'review',...input});},
  async materials(job){return {handoutUrl:null,materialUrl:null,...(job.handout_path?{pending:true}:{})};}
 };
}
