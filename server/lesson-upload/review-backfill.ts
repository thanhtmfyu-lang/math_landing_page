import {assessmentPublishKind,normalizeWorkKind} from '../../src/native/lesson-upload/assessment-intake';
import {createBtvnPublishHandler,expectedSlots} from '../btvn/publish-handler';
import {reviewQuestions,type Pipeline,type PrivateState} from './worker';
/** Finite post-publication review. Never changes an exam, key, due or work row. */
export async function reviewUploadOnce(db:any,pipeline:Pipeline,state:PrivateState,isTest=false,auto=false){
 const call=async(p:any)=>{const r=await db.rpc('mtm_lesson_upload_api',{p});if(r.error)throw Error(/^[A-Z][A-Z0-9_]{2,70}$/.test(r.error.message??'')?r.error.message:'WORKER_RPC_FAILED');return r.data;};
 const job=(await call({action:'worker_pending_review',worker_protocol:110,is_test:isTest,...(auto?{auto:true}:{})})).job;if(!job)return {status:'idle'};
 for(const pending of job.pending_reviews){
  const cp=job.homework2_path?job.checkpoint['paper'+pending.paper]:job.checkpoint;
  if(!cp?.draft||!cp?.source)throw Error('PRIVATE_REVIEW_CHECKPOINT_REQUIRED');
  const draft=await state.load(cp.draft),source=await state.load(cp.source);
  if(source.sourceVersion!==pending.source_version)throw Error('REVIEW_SOURCE_CHANGED');
  const result=await pipeline.review({questions:reviewQuestions(draft.exam),task_scope:pending.paper===2?job.task_scope2||job.task_scope:job.task_scope,sourceVersion:source.sourceVersion});
  if('status' in result)return {status:'waiting_review'};
  const slots=expectedSlots(draft.exam),proof={validator:true,independent:true,...result,extractor_provider:pipeline.extractor.provider,slots:slots.map(s=>({...s,...result.slots.find(r=>r.question_id===s.question_id&&r.slot===s.slot),expected:s.expected}))};
  const secret='private-backfill-validation-'.repeat(2),handler=createBtvnPublishHandler({async rpc(a){return {status:a==='lookup'?null:'da_dang'};},async upload(){}},secret);
  const body={action:'publish',kind:assessmentPublishKind(normalizeWorkKind(job.work_kind)),...(job.work_kind==='exam'?{assessmentId:job.assessment_id,examType:job.exam_type,opensAt:job.exam_config?.opens_at,closesAt:job.exam_config?.closes_at}:{}),lesson_key:job.lesson_code,source_version:source.sourceVersion,material:{lessonCode:job.lesson_code,classNames:Object.values(job.class_names),classDates:Object.fromEntries(Object.entries(job.class_dates).map(([id,date])=>[job.class_names[id],date])),date:job.lesson_date,title:job.title},...draft,verification:proof};
  const response=await handler(new Request('https://review-backfill.invalid',{method:'POST',headers:{'X-MTM-Publish-Secret':secret},body:JSON.stringify(body)}));
  const code=response.headers.get('X-MTM-Reject-Code');if(!response.ok&&!['REVIEW_MISMATCH','CONVERSION_REVIEW_REQUIRED'].includes(code??''))throw Error('BACKFILL_VALIDATION_FAILED');
  await call({action:'worker_review_result',upload_id:job.id,paper:pending.paper,request_hash:pending.request_hash,source_version:source.sourceVersion,provider:result.provider,model:result.model,receipt_hash:result.receipt_hash,matched:response.ok});
 }
 return {status:'reviewed'};
}
