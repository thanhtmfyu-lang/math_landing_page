import {createClient} from '@supabase/supabase-js';
import {createHomeworkHandler} from '../../supabase/functions/mtm-homework-access/handler';
import {HomeworkError,GATE_ERROR} from './service';
import {SupabaseHomeworkRepository} from './supabase-repository';
import {allowedBtvnOrigin} from './origin-policy';
import {SIGNED_ASSET_SECONDS} from './private-assets';
/** Tên env đã có trong Edge Function. Không đọc env/secret khi import.
 * Claude chỉ gọi factory sau khi kiểm proxy và cấu hình server thực tế.
 * Chạy cùng handler Edge để network HMAC là của HS, không phải IP Vercel.
 * Mọi limiter nằm chung Postgres, không có bản RAM production. */
export function createSupabaseRepository(env:{SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;MTM_HOMEWORK_PUBLISHABLE_KEY:string;VERCEL?:string;VERCEL_ENV?:string;VERCEL_URL?:string},origin:string,trustedNetworkKey:string){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.MTM_HOMEWORK_PUBLISHABLE_KEY||! /^[0-9a-f]{64}$/.test(trustedNetworkKey))throw Error('Thiếu cấu hình server/proxy đã kiểm');
  if(!allowedBtvnOrigin(origin,env))throw Error('Origin chưa được duyệt');
  const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const handler=createHomeworkHandler({publishableKey:env.MTM_HOMEWORK_PUBLISHABLE_KEY,origins:[origin],networkKey:async()=>trustedNetworkKey,rpc:async(name,args)=>await db.rpc(name,args),download:async()=>{throw Error('Adapter BTVN không mở tải PDF');}});
  // 20/10: HS có phiên bị đứng ở "Đang kiểm tra phiên" khi Postgres chậm/khóa. RPC chỉ đọc có hạn chờ
  // để trả 503 + thử lại; RPC ghi (commit, đăng nhập) không cắt giữa chừng để tránh ghi rồi báo lỗi.
  return new SupabaseHomeworkRepository({rpc:async(name,args)=>READ_RPCS.has(name)?await db.rpc(name,args).abortSignal(AbortSignal.timeout(READ_RPC_MS)):await db.rpc(name,args)},async body=>{
    const response=await handler(new Request(env.SUPABASE_URL+'/functions/v1/mtm-homework-access',{method:'POST',headers:{Origin:origin,apikey:env.MTM_HOMEWORK_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    if(!response.ok)throw new HomeworkError(response.status,response.status===429?'Em đã thử nhiều lần. Chờ 15 phút rồi thử lại.':response.status===401?GATE_ERROR:'Chưa kết nối được máy chủ. Em thử lại sau.');return response.json();
  },Date.now,batchSigner(path=>withTimeout(db.storage.from('mtm-btvn').createSignedUrls(path,SIGNED_ASSET_SECONDS),READ_RPC_MS)));
}
export const READ_RPC_MS=8000,READ_RPCS=new Set(['mtm_btvn_read','mtm_btvn_assets','mtm_btvn_classes']);
/** Ký URL ảnh cũng có hạn chờ: quá hạn coi như ảnh chưa sẵn sàng, HS được báo thử lại. */
export function withTimeout<T>(work:PromiseLike<T>,ms:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  return Promise.race([Promise.resolve(work),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout')),ms);})]).finally(()=>clearTimeout(timer));
}
type SignResult={data:{path:string|null;signedUrl:string|null;error:string|null}[]|null;error:unknown};
/** Gom các lần ký cùng một nhịp thành một request createSignedUrls (hạn SIGNED_ASSET_SECONDS như hydratePrivateAssets yêu cầu). */
export function batchSigner(signMany:(paths:string[])=>Promise<SignResult>){
  let queue:{path:string;resolve:(url:string)=>void;reject:(error:Error)=>void}[]=[];
  const flush=async()=>{
    const items=queue;queue=[];
    try{
      const result=await signMany([...new Set(items.map(x=>x.path))]);
      if(result.error||!result.data)throw Error('Private asset unavailable');
      const byPath=new Map(result.data.map(row=>[row.path,row]));
      for(const item of items){const row=byPath.get(item.path);if(!row||row.error||!row.signedUrl)item.reject(Error('Private asset unavailable'));else item.resolve(row.signedUrl);}
    }catch{for(const item of items)item.reject(Error('Private asset unavailable'));}
  };
  return (path:string,seconds:number)=>new Promise<string>((resolve,reject)=>{
    if(seconds!==SIGNED_ASSET_SECONDS)return reject(Error('Private asset unavailable'));
    if(!queue.length)setTimeout(()=>void flush(),0);
    queue.push({path,resolve,reject});
  });
}
