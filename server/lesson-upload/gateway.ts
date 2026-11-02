import type {PublishPort} from '../btvn/publish-handler';
const actions=new Set(['worker_claim','worker_assert_current','worker_checkpoint','worker_finish','worker_publish','worker_materials','worker_wait_review','worker_pending_review','worker_review_result']);
function need(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
/** Called only AFTER the existing Edge publisher has authenticated its secret. */
export async function handleLessonUploadGateway(port:PublishPort,body:any,validate?:(body:any,port:PublishPort)=>Promise<Response>){
 const action=body.action;
 need(['lesson_upload_worker','lesson_upload_source','lesson_upload_asset','lesson_upload_asset_read'].includes(action),'INVALID_LESSON_UPLOAD_ACTION');
 if(action==='lesson_upload_worker'){
  need(Object.keys(body).every(k=>['action','payload'].includes(k))&&body.payload&&actions.has(body.payload.action),'INVALID_LESSON_WORKER_ACTION');
  if(body.payload.action==='worker_publish'){
   need(validate&&port.readPrivate,'WORKER_VALIDATOR_REQUIRED');
   await port.rpc('lesson_upload_gateway',{action:'worker_assert_current',upload_id:body.payload.upload_id,claim_token:body.payload.claim_token});
   for(const field of ['payload','variant_payload']){
    const paper=body.payload[field];if(!paper&&field==='variant_payload')continue;
    need(paper&&Array.isArray(paper.assets)&&paper.assets.length<=500,'INVALID_WORKER_PUBLICATION');const assets=[];
    for(const asset of paper.assets){
     need(asset.storage_path===`btvn/${paper.lesson_key}/${paper.source_version}/${asset.path}`,'INVALID_WORKER_ASSET');
     await port.rpc('lesson_upload_gateway',{action:'worker_asset_authorize',upload_id:body.payload.upload_id,claim_token:body.payload.claim_token,path:asset.storage_path});
     const stored=await port.readPrivate('mtm-btvn',asset.storage_path);assets.push({...asset,data_base64:bytesBase64(stored.bytes)});
    }
    let normalized:any;
    const response=await validate({...paper,action:'publish',assets},{async rpc(a,p){if(a==='lookup')return {status:null};need(a==='publish','INVALID_WORKER_PUBLICATION');normalized=p;return {status:'validated'};},async upload(){}});
    need(response.ok&&normalized,'WORKER_VALIDATION_FAILED');body.payload[field]=normalized;
   }
  }
  return port.rpc('lesson_upload_gateway',body.payload);
 }
 need(Object.keys(body).every(k=>['action','upload_id','claim_token','kind','path','data_base64','content_type','sha256'].includes(k))&&uuid(body.upload_id)&&uuid(body.claim_token),'INVALID_LESSON_UPLOAD_FENCE');
 if(action==='lesson_upload_source'){
  need(['homework','answer','homework2','answer2','handout'].includes(body.kind),'INVALID_LESSON_SOURCE_KIND');
  const source=await port.rpc('lesson_upload_gateway',{action:'worker_source',upload_id:body.upload_id,claim_token:body.claim_token,kind:body.kind});
  need(source?.bucket==='mtm-lesson-private'&&typeof source.path==='string'&&port.readPrivate,'PRIVATE_SOURCE_UNAVAILABLE');
  const file=await port.readPrivate(source.bucket,source.path);
  need(file.bytes.length>0&&file.bytes.length<=20*1024*1024,'PRIVATE_SOURCE_TOO_LARGE');
  return {data_base64:bytesBase64(file.bytes),content_type:file.content_type};
 }
 need(typeof body.path==='string'&&/^btvn\/[a-z0-9-]{1,160}\/[a-f0-9]{64}\/[a-zA-Z0-9_/-]+\.(png|pdf)$/.test(body.path)&&!body.path.includes('..'),'INVALID_LESSON_ASSET');
 await port.rpc('lesson_upload_gateway',{action:'worker_asset_authorize',upload_id:body.upload_id,claim_token:body.claim_token,path:body.path});
 if(action==='lesson_upload_asset_read'){
  need(port.readPrivate,'PRIVATE_SOURCE_UNAVAILABLE');const file=await port.readPrivate('mtm-btvn',body.path);
  return {data_base64:bytesBase64(file.bytes),content_type:file.content_type};
 }
 need(body.content_type===(body.path.endsWith('.png')?'image/png':'application/pdf')&&typeof body.sha256==='string'&&/^[a-f0-9]{64}$/.test(body.sha256),'INVALID_LESSON_ASSET');
 need(typeof body.data_base64==='string'&&body.data_base64.length%4===0&&body.data_base64.length<=21*1024*1024&&/^[A-Za-z0-9+/]*={0,2}$/.test(body.data_base64),'INVALID_LESSON_ASSET');
 const bytes=Uint8Array.from(atob(body.data_base64),c=>c.charCodeAt(0));
 await port.upload(body.path,bytes,body.content_type,body.sha256);
 return {ok:true,status:'uploaded'};
}
function bytesBase64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);}
