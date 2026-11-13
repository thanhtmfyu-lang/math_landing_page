import type {UploadJob} from './worker';
/** Per-run private client. Existing VPS publish secret stays in server memory. */
export function createLessonGatewayClient(url:string,secret:string,transport:typeof fetch=fetch){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/functions/v1/mtm-btvn-publish'||!secret||secret.length<32)throw Error('LESSON_GATEWAY_CONFIG_REQUIRED');
 const call=async(body:unknown)=>{
  let response:Response;
  try{response=await transport(url,{method:'POST',headers:{'Content-Type':'application/json','X-MTM-Publish-Secret':secret},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(110000)});}catch{throw Error('WORKER_RPC_FAILED');}
  if(!response.ok){
   if(response.status===401||response.status===403)throw Error('GATEWAY_AUTH_REQUIRED');
   if(response.status===429)throw Error('GATEWAY_BUSY');
   if(response.status>=500)throw Error('WORKER_RPC_FAILED');
   const body=await response.json().catch(()=>null);
   throw Error(typeof body?.error_code==='string'&&/^[A-Z][A-Z0-9_]{2,70}$/.test(body.error_code)?body.error_code:'GATEWAY_REQUEST_REJECTED');
  }
  return response.json();
 };
 const fence=(job:UploadJob)=>({upload_id:job.id,claim_token:job.claim_token});
 return {
  sourceOrigin:parsed.origin,
  async rpc(name:string,args:any){
   try{
    if(name==='mtm_lesson_upload_api'||name==='mtm_lesson_upload_gateway')return {data:await call({action:'lesson_upload_worker',payload:args.p}),error:null};
    if(name==='mtm_lesson_upload_source')return {data:await call({action:'lesson_upload_source',...args}),error:null};
    throw Error('INVALID_LESSON_GATEWAY_RPC');
   }catch(error){return {data:null,error:{message:error instanceof Error&&/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message)?error.message:'WORKER_RPC_FAILED'}};}
  },
  lessonJobStorage(job:UploadJob){return {
   async upload(path:string,bytes:Uint8Array,options:{contentType:string},hash?:string){
    const sha=hash??Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    try{await call({action:'lesson_upload_asset',...fence(job),path,data_base64:Buffer.from(bytes).toString('base64'),content_type:options.contentType,sha256:sha});return {error:null};}catch(error){return {error:{message:error instanceof Error&&/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message)?error.message:'PRIVATE_UPLOAD_FAILED'}};}
   },
   async download(path:string){try{const result=await call({action:'lesson_upload_asset_read',...fence(job),path});return {data:new Blob([Buffer.from(result.data_base64,'base64')],{type:result.content_type}),error:null};}catch(error){return {data:null,error:{message:error instanceof Error&&/^[A-Z][A-Z0-9_]{2,70}$/.test(error.message)?error.message:'PRIVATE_UPLOAD_FAILED'}};}}
  };}
 };
}
