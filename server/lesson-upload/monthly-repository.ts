import {createHash} from 'node:crypto';
import type {MonthlyJob,MonthlyRepository} from './monthly-worker';
export function createMonthlyRepository(db:any,isTest=false):MonthlyRepository{
 const call=async(p:unknown)=>{const r=await db.rpc('mtm_lesson_upload_api',{p});if(r.error||!r.data||r.data.ok===false)throw Error('MONTHLY_RPC_FAILED');return r.data;};
 const fenced=(j:MonthlyJob,action:string,p:Record<string,unknown>={})=>call({action,upload_id:j.id,claim_token:j.claim_token,...p});
 return {
  async claim(worker){return (await call({action:'monthly_worker_claim',worker_id:worker,is_test:isTest})).job;},
  async current(j){await fenced(j,'monthly_worker_assert');},async checkpoint(j,checkpoint){await fenced(j,'monthly_worker_checkpoint',{checkpoint});},async wait(j){await fenced(j,'monthly_worker_wait');},async block(j){await fenced(j,'monthly_worker_block');},
  async publish(j,payloads){const r=await fenced(j,'monthly_worker_publish',{payloads});if(!r.receipts)throw Error('MONTHLY_PUBLISH_UNCONFIRMED');},
  assets(j){return {async rpc(){throw Error('INVALID_MONTHLY_RPC');},async upload(path,bytes,type,sha){
   await fenced(j,'monthly_worker_assert');if(!path.startsWith('btvn/'+j.lesson_code+'-thi-ma-'))throw Error('ASSET_OUTSIDE_UPLOAD');
   const store=db.lessonJobStorage?db.lessonJobStorage(j,true):db.storage.from('mtm-btvn');const r=await store.upload(path,bytes,{contentType:type,upsert:false});if(!r.error)return;
   const old=await store.download(path);if(old.error||!old.data||createHash('sha256').update(new Uint8Array(await old.data.arrayBuffer())).digest('hex')!==sha)throw Error('PRIVATE_ASSET_CONFLICT');
  }};}
 };
}
