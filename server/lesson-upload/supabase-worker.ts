import {createHash} from 'node:crypto';
import type {WorkerRepository,UploadJob} from './worker';

/** Service-role client only. No client env access and no raw errors in receipts. */
export function createWorkerRepository(db:any,options:{isTest?:boolean}={}):WorkerRepository {
 const call=async(p:Record<string,unknown>)=>{
  const {data,error}=await db.rpc('mtm_lesson_upload_api',{p});
  if(error)throw Error(['MATERIAL_LESSON_NOT_PUBLISHED','STALE_UPLOAD_OR_LEASE','PRIOR_STEP_INCOMPLETE'].includes(error.message)?error.message:'WORKER_RPC_FAILED');
  if(data?.ok===false)throw Error('CLAIM_LOST');
  return data;
 };
 const fenced=(job:UploadJob,action:string,extra:Record<string,unknown>={})=>call({action,upload_id:job.id,claim_token:job.claim_token,...extra});
 return {
  async claim(workerId){const data=await call({action:'worker_claim',worker_id:workerId,lease_seconds:900,is_test:options.isTest===true});return data?.job??null;},
  async current(job){const data=await fenced(job,'worker_assert_current');if(data?.ok!==true)throw Error('CLAIM_LOST');},
  async step(job,step,status,detail,checkpoint,paper=1){await fenced(job,'worker_checkpoint',{step,status,detail,checkpoint,paper});},
  async waitReview(job,request){return call({action:'worker_wait_review',upload_id:job.id,claim_token:job.claim_token,paper:job.paper??1,request_hash:request.request_hash,source_version:request.sourceVersion});},
  async publishBundle(job,primary,second){const result=await fenced(job,'worker_publish',{payload:primary,variant_payload:second});if(!result?.publish_receipts)throw Error('PUBLISH_NOT_CONFIRMED');},
  async finish(job){await fenced(job,'worker_finish');},
  publisher(job){return {
   async rpc(action,payload){
    await fenced(job,'worker_assert_current');
    if(action==='lookup')return {status:null}; // Atomic worker_publish owns idempotency, including crash after commit.
    if(action==='publish'){
     const result=await fenced(job,'worker_publish',{payload});
     if(!result?.publish_receipts)throw Error('PUBLISH_NOT_CONFIRMED');
     return {status:result.already_applied===true?'already_published':'da_dang'};
    }
    if(action==='materials_only'){
     const result=await fenced(job,'worker_materials',payload);
     if(!result?.publish_receipts)throw Error('PUBLISH_NOT_CONFIRMED');
     return {status:result.already_applied===true?'already_published':'da_dang'};
    }
    throw Error('INVALID_WORKER_ACTION');
   },
   async upload(path,bytes,type,sha256){
    await fenced(job,'worker_assert_current');
    if(!path.startsWith('btvn/'+job.lesson_code+'/'))throw Error('PRIVATE_ASSET_PATH_INVALID');
    const store=db.lessonJobStorage?db.lessonJobStorage(job):db.storage.from('mtm-btvn');
    const result=await store.upload(path,bytes,{contentType:type,upsert:false});
    if(!result.error)return;
    // The first attempt can have uploaded before a timeout. Verify identical bytes; never overwrite.
    const prior=await store.download(path);
    if(prior.error||!prior.data)throw Error('PRIVATE_UPLOAD_FAILED');
    const got=createHash('sha256').update(new Uint8Array(await prior.data.arrayBuffer())).digest('hex');
    if(got!==sha256)throw Error('PRIVATE_ASSET_CONFLICT');
   }
  };}
 };
}
