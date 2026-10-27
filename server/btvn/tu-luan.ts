import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

export const ESSAY_BUCKET='mtm-tu-luan',MAX_ESSAY_BYTES=3*1024*1024;
export type EssayImage={id:string;sha256:string;bytes:number;pageNumber:number;receivedAt:string|null;path?:string;deadline?:number};
type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:any;error:null|{code?:string}}>;
 storage:{from:(bucket:string)=>{createSignedUploadUrl:(path:string,options:{upsert:boolean})=>Promise<any>;download:(path:string)=>Promise<any>}}};
class EssayError extends Error{constructor(public status:number,message:string){super(message);}}
const invalid=()=>new EssayError(400,'Ảnh hoặc mã bài không hợp lệ. Em tải lại bài rồi thử lại.');
const publicImage=({id,sha256,bytes,pageNumber,receivedAt,deadline}:EssayImage)=>({id,sha256,bytes,pageNumber,receivedAt,deadline});
const sessionFrom=(cookie:string)=>cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('mtm_btvn_demo='))?.slice(14)??'';

/** Same-origin /api/btvn owns origin/proxy checks. This handler never accepts
 * a student ID, owner, object path, deadline or page number from the browser. */
export function createEssayHandler(db:Db){return async(body:Record<string,unknown>,cookie:string)=>{
 try{
  const session=sessionFrom(cookie),action=body.action;
  if(!/^[0-9a-f]{64}$/.test(session))throw new EssayError(401,'Phiên học sinh đã hết. Em vào lại bài để nộp ảnh.');
  const actions={'essay-list':'list','essay-sign':'reserve','essay-confirm':'confirm'} as const;
  if(typeof action!=='string'||!Object.hasOwn(actions,action))throw invalid();
  const operation=actions[action as keyof typeof actions],isList=operation==='list';
  const allowed=['action','lessonCode','attemptId',...(!isList?['sha256','bytes']:[])];
  if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.lessonCode!=='string'||! /^[a-z0-9-]{1,160}$/.test(body.lessonCode)
   ||typeof body.attemptId!=='string'||! /^[a-zA-Z0-9_-]{1,120}$/.test(body.attemptId)
   ||!isList&&(typeof body.sha256!=='string'||! /^[0-9a-f]{64}$/.test(body.sha256)||!Number.isSafeInteger(body.bytes)||Number(body.bytes)<100||Number(body.bytes)>MAX_ESSAY_BYTES))throw invalid();
  const args={p_session:session,p_lesson:body.lessonCode,p_attempt:body.attemptId,p_sha256:isList?null:body.sha256,p_bytes:isList?null:body.bytes};
  const rpc=async(op:string)=>{
   const {data,error}=await db.rpc('mtm_tu_luan_student',{...args,p_action:op});
   if(error){
    if(error.code==='42501')throw new EssayError(403,'Em chỉ được nộp ảnh cho bài thi và mã đề của mình. Em vào lại đúng bài.');
    if(error.code==='P0015')throw new EssayError(409,'Đã hết hạn nộp ảnh (kết thúc ca + 15 phút).');
    if(error.code==='P0064')throw new EssayError(409,'Bài đã đạt giới hạn ảnh hoặc ảnh chờ đối soát. Em liên hệ trung tâm để kiểm tra.');
    if(error.code==='22023')throw invalid();
    throw new EssayError(503,'Chưa kết nối được nơi nhận ảnh. Em giữ ảnh và thử lại.');
   }
   if(!data)throw new EssayError(503,'Chưa xác nhận được bài nộp. Em giữ ảnh và thử lại.');
   return data;
  };
  if(isList)return {status:200,body:await rpc('list')};
  // reserve is itself idempotent and checks permission/deadline in Postgres.
  const reserved=await rpc('reserve') as EssayImage;
  if(reserved.receivedAt)return {status:200,body:{image:publicImage(reserved),duplicate:true}};
  if(!reserved.path)throw new EssayError(503,'Chưa xác nhận được nơi nhận ảnh. Em thử lại.');
  const storagePath=reserved.path;
  const storage=db.storage.from(ESSAY_BUCKET);
  const confirmExisting=async()=>{
   // Confirm only real bytes, not an object name supplied by the student.
   // At most 3 MiB, never base64 through Vercel's request body.
   const {data,error}=await storage.download(storagePath);
   if(error||!data)throw new EssayError(409,'Ảnh chưa tải xong. Em bấm Thử lại; ảnh đã nhận vẫn giữ nguyên.');
   if(data.size!==reserved.bytes||data.size>MAX_ESSAY_BYTES)throw invalid();
   const bytes=new Uint8Array(await data.arrayBuffer());
   if(bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff||createHash('sha256').update(bytes).digest('hex')!==reserved.sha256)throw invalid();
   const image=await rpc('confirm') as EssayImage;
   return {status:200,body:{image:publicImage(image)}};
  };
  if(operation==='confirm')return await confirmExisting();
  // A prior PUT may have succeeded while its ACK was lost. Some Storage
  // versions refuse to sign an existing immutable object: confirm it first.
  const prior=await storage.download(storagePath);
  if(prior.data&&!prior.error)return await confirmExisting();
  const {data,error}=await storage.createSignedUploadUrl(storagePath,{upsert:false});
  if(error||!data?.signedUrl)throw new EssayError(503,'Chưa cấp được đường tải ảnh. Em giữ ảnh và thử lại.');
  return {status:200,body:{image:publicImage(reserved),uploadUrl:data.signedUrl}};
 }catch(error){return {status:error instanceof EssayError?error.status:503,body:{message:error instanceof EssayError?error.message:'Chưa nhận được ảnh. Em giữ trang mở và thử lại.'}};}
};}
export function createProductionEssayHandler(env:{SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string}){
 const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return createEssayHandler(db);
}
