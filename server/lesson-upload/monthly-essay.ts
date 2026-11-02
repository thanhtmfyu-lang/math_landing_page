import {createHash} from 'node:crypto';
import {reviewQuestions} from './worker';
import {gradeMonthlyEssay,type EssayGrade} from './monthly-worker';
import {createNativeInvoker} from './native-adapter';
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Anonymous photo/rubric request only; no name, class, phone, student or attempt ID enters PC queue. */
export async function reviewMonthlyEssayOnce(db:any,invoke=createNativeInvoker(),isTest=false){
 const call=async(p:any)=>{const r=await db.rpc('mtm_lesson_upload_api',{p});if(r.error||!r.data)throw Error('ESSAY_RPC_FAILED');return r.data;};
 const job=(await call({action:'monthly_worker_essay_claim',is_test:isTest})).job;if(!job)return {status:'idle' as const};
 const fenced=(action:string,p:any={})=>call({action,upload_id:job.id,claim_token:job.claim_token,...p});
 try{
  if(!job.rubric?.trim()||!Number.isFinite(job.max_score)||job.max_score<=0||!Array.isArray(job.images)||!job.images.length)throw Error('ESSAY_RUBRIC_REQUIRED');
  const images=[];let total=0;
  for(const image of job.images){const r=await db.rpc('mtm_lesson_upload_source',{upload_kind:'monthly-essay',upload_id:job.id,claim_token:job.claim_token,kind:'image',sha256:image.sha256});if(r.error||!r.data?.data_base64)throw Error('ESSAY_IMAGE_REQUIRED');
   const bytes=Buffer.from(r.data.data_base64,'base64');total+=bytes.length;
   if(total>20*1024*1024||createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw Error('ESSAY_IMAGE_HASH');
   images.push({sha256:image.sha256,page:image.page,data_base64:r.data.data_base64});
  }
  const submission_hash=digest(images.map(({sha256,page})=>({sha256,page}))),rubric_hash=digest({rubric:job.rubric,max_score:job.max_score}),questions=reviewQuestions({questions:job.questions.filter((q:any)=>q.kind==='self')} as any);
  const request=(provider:string)=>invoke({stage:'monthly_essay',provider,images,questions,rubric:job.rubric,max_score:job.max_score,submission_hash,rubric_hash});
  const firstTwo=await Promise.all(['grok','agy'].map(request));
  const result=await gradeMonthlyEssay({submission_hash,rubric_hash,max_score:job.max_score},async provider=>{
   const r=provider==='grok'?firstTwo[0]:provider==='agy'?firstTwo[1]:await request(provider);
   if(r.status==='pending')throw Error('ESSAY_REVIEW_PENDING');return r as EssayGrade;
  });
  await fenced('monthly_worker_essay_result',{result:{...result,submission_hash,rubric_hash}});return {status:'complete' as const};
 }catch(error){const code=error instanceof Error?error.message:'ESSAY_FAILED';await fenced(code==='ESSAY_REVIEW_PENDING'?'monthly_worker_essay_wait':'monthly_worker_essay_block').catch(()=>{});return {status:code==='ESSAY_REVIEW_PENDING'?'waiting_review' as const:'blocked' as const,code};}
}
