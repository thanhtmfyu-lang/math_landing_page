import {createHash} from 'node:crypto';
import type {WorkerRepository,UploadJob} from './worker';

export const OPERATOR_CONTINUATION_UPLOAD_ID='14227822-ce9a-4f0f-8df3-489a60b11392';
export const OPERATOR_CONTINUATION_RUNTIME_ENV='MTM_OPERATOR_CONTINUATION_RUNTIME_SHA256';
export type WorkerRepositoryOptions={isTest?:boolean;auto?:boolean;operatorManual?:true;operatorContinuation?:{uploadId:string;runtimeManifestSha256:string;operatorCreditId?:string;cachedDraftOnly?:true}};
const creditUUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function creditId(value:unknown){if(typeof value!=='string'||!creditUUID.test(value)||value==='00000000-0000-0000-0000-000000000000')throw Error('OPERATOR_CREDIT_UUID_REQUIRED');return value;}
function operatorOptions(options:WorkerRepositoryOptions){
 const value=options.operatorContinuation;if(value===undefined){if(options.operatorManual!==undefined)throw Error('OPERATOR_CREDIT_OPTIONS_INVALID');return undefined;}
 if(options.isTest!==true||options.auto===true)throw Error('OPERATOR_CONTINUATION_EXPLICIT_TEST_REQUIRED');
 const hasCredit=!!value&&typeof value==='object'&&Object.hasOwn(value,'operatorCreditId');
 const cached=!!value&&typeof value==='object'&&Object.hasOwn(value,'cachedDraftOnly');
 if(cached&&(!hasCredit||value.cachedDraftOnly!==true))throw Error('CACHED_DRAFT_CREDIT_REQUIRED');
 if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!==(cached?'cachedDraftOnly,operatorCreditId,runtimeManifestSha256,uploadId':hasCredit?'operatorCreditId,runtimeManifestSha256,uploadId':'runtimeManifestSha256,uploadId'))throw Error('OPERATOR_CONTINUATION_OPTIONS_INVALID');
 if(value.uploadId!==OPERATOR_CONTINUATION_UPLOAD_ID)throw Error('OPERATOR_CONTINUATION_TARGET_INVALID');
 if(typeof value.runtimeManifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.runtimeManifestSha256))throw Error('OPERATOR_CONTINUATION_RUNTIME_REQUIRED');
 if(hasCredit&&options.operatorManual!==true)throw Error('OPERATOR_CREDIT_EXPLICIT_MANUAL_REQUIRED');
 if(!hasCredit&&options.operatorManual!==undefined)throw Error('OPERATOR_CREDIT_OPTIONS_INVALID');
 return {uploadId:OPERATOR_CONTINUATION_UPLOAD_ID,runtimeManifestSha256:value.runtimeManifestSha256,...(hasCredit?{operatorCreditId:creditId(value.operatorCreditId)}:{}),...(cached?{cachedDraftOnly:true as const}:{})};
}

/** Parse before a gateway/pipeline; no credit is taken from environment. */
export function parseWorkerInvocation(args:readonly string[],environment:Record<string,string|undefined>={}){
 let values=[...args],credit:string|undefined;
 const cached=values.includes('--cached-draft-only');
 if(cached){if(values[0]==='--cached-draft-only'||values.filter(v=>v==='--cached-draft-only').length!==1)throw Error('CACHED_DRAFT_EXPLICIT_ONCE_REQUIRED');values=values.filter(v=>v!=='--cached-draft-only');}
 const index=values.indexOf('--operator-credit');
 if(index>=0){
  if(index===0||index===values.length-1||values.lastIndexOf('--operator-credit')!==index)throw Error('OPERATOR_CREDIT_UUID_REQUIRED');
  credit=creditId(values[index+1]);values=[...values.slice(0,index),...values.slice(index+2)];
  if(values.filter(v=>v==='--manual').length!==1)throw Error('OPERATOR_CREDIT_EXPLICIT_MANUAL_REQUIRED');
  values=values.filter(v=>v!=='--manual');
 }
 if(!['--once','--review-once'].includes(values[0])||new Set(values).size!==values.length||values.slice(1).some(arg=>!['--is-test','--auto','--operator-continuation'].includes(arg)))throw Error('EXPLICIT_ONCE_REQUIRED');
 const options:WorkerRepositoryOptions={isTest:values.includes('--is-test'),auto:values.includes('--auto')};
 if(cached&&credit===undefined)throw Error('CACHED_DRAFT_CREDIT_REQUIRED');
 if(credit!==undefined&&(values[0]!=='--once'||options.isTest!==true||options.auto===true||!values.includes('--operator-continuation')))throw Error('OPERATOR_CREDIT_EXPLICIT_TEST_REQUIRED');
 if(values.includes('--operator-continuation')){
  if(values[0]!=='--once'||options.isTest!==true||options.auto===true)throw Error('OPERATOR_CONTINUATION_EXPLICIT_TEST_REQUIRED');
  options.operatorContinuation={uploadId:OPERATOR_CONTINUATION_UPLOAD_ID,runtimeManifestSha256:environment[OPERATOR_CONTINUATION_RUNTIME_ENV]??'',...(credit!==undefined?{operatorCreditId:credit}:{}),...(cached?{cachedDraftOnly:true}:{})};
  if(credit!==undefined)options.operatorManual=true;
  operatorOptions(options);
 }
 return {mode:values[0] as '--once'|'--review-once',options};
}

/** Service-role client only. No client env access and no raw errors in receipts. */
export function createWorkerRepository(db:any,options:WorkerRepositoryOptions={}):WorkerRepository {
 const operator=operatorOptions(options);
 const call=async(p:Record<string,unknown>)=>{
  const {data,error}=await db.rpc('mtm_lesson_upload_api',{p});
  if(error)throw Error(error.code==='42501'?'GATEWAY_AUTH_REQUIRED':/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message??'')?error.message:error.code?'GATEWAY_REQUEST_REJECTED':'WORKER_RPC_FAILED');
  if(data?.ok===false)throw Error('CLAIM_LOST');
  return data;
 };
 const fenced=(job:UploadJob,action:string,extra:Record<string,unknown>={})=>call({action,upload_id:job.id,claim_token:job.claim_token,...extra});
 return {
  async claim(workerId){
   if(operator&&(options.isTest!==true||options.auto===true))throw Error('OPERATOR_CONTINUATION_EXPLICIT_TEST_REQUIRED');
   if(operator?.operatorCreditId&&options.operatorManual!==true)throw Error('OPERATOR_CREDIT_EXPLICIT_MANUAL_REQUIRED');
   const data=await call({action:'worker_claim',worker_protocol:operator?.cachedDraftOnly?113:operator?.operatorCreditId?112:operator?111:110,worker_id:workerId,lease_seconds:900,is_test:options.isTest===true,...(options.auto?{auto:true}:{}),...(operator?{operator_continuation:true,upload_id:operator.uploadId,runtime_manifest_sha256:operator.runtimeManifestSha256,auto:false}:{}),...(operator?.operatorCreditId?{operator_credit_id:operator.operatorCreditId}:{}),...(operator?.cachedDraftOnly?{operator_cached_draft_only:true}:{})});
   const job=data?.job??null;
   if(operator&&job&&(job.id!==operator.uploadId||job.version!==1||job.is_test!==true||job.operator_continuation!==true))throw Error('OPERATOR_CONTINUATION_RECEIPT_MISMATCH');
   if(operator?.operatorCreditId&&job&&job.operator_credit_id!==operator.operatorCreditId)throw Error('OPERATOR_CREDIT_RECEIPT_MISMATCH');
   if(operator?.cachedDraftOnly&&job&&job.operator_cached_draft?.contract!=='MTM-OPERATOR-CACHED-DRAFT-20261114-v1')throw Error('CACHED_DRAFT_RECEIPT_MISMATCH');
   return job;
  },
  async current(job){const data=await fenced(job,'worker_assert_current');if(data?.ok!==true)throw Error('CLAIM_LOST');},
  async step(job,step,status,detail,checkpoint,paper=1){await fenced(job,'worker_checkpoint',{step,status,detail,checkpoint,paper});},
  async waitReview(job,request){return call({action:'worker_wait_review',upload_id:job.id,claim_token:job.claim_token,paper:job.paper??1,request_hash:request.request_hash,source_version:request.sourceVersion});},
  async recordFailure(job,step,code){await fenced(job,'worker_record_failure',{step,code,paper:job.paper??1});},
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
    const code=result.error.message;
    if(result.error.status===403||result.error.statusCode===403||result.error.code==='42501')throw Error('GATEWAY_AUTH_REQUIRED');
    if(/^[A-Z][A-Z0-9_]{2,70}$/.test(code??'')&&!['PRIVATE_UPLOAD_FAILED','WORKER_RPC_FAILED'].includes(code))throw Error(code);
    // The first attempt can have uploaded before a timeout. Verify identical bytes; never overwrite.
    const prior=await store.download(path);
    if(prior.error||!prior.data)throw Error(/^[A-Z][A-Z0-9_]{2,70}$/.test(prior.error?.message??'')?prior.error.message:'PRIVATE_UPLOAD_FAILED');
    const got=createHash('sha256').update(new Uint8Array(await prior.data.arrayBuffer())).digest('hex');
    if(got!==sha256)throw Error('PRIVATE_ASSET_CONFLICT');
   }
  };}
 };
}
