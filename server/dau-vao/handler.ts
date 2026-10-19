import {createDecipheriv,randomInt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {DV_TRACKS,assemble,grade,isDvTrack,validDate,vnDate,type Banks,type Progress} from './engine';
import progress from './tien-do.json';
export const PROGRESS=progress as unknown as Progress;

// Ngân hàng đề đóng gói mã hóa (scripts/dau-vao-dong-goi.mjs): kho mã công khai nên đáp án chỉ giải mã được trên máy chủ có MTM_DAU_VAO_KEY.
export function dauVaoKey(env:Record<string,string|undefined>){const k=Buffer.from(env.MTM_DAU_VAO_KEY??'','base64');return k.length===32?k:null;}
let cache:{key:string;banks:Banks}|null=null;
export function loadBanks(key:Buffer,root=process.cwd()):Banks{
 const id=key.toString('base64');if(cache?.key===id)return cache.banks;
 const raw=readFileSync(join(root,'server/dau-vao/ngan-hang.bin'));
 const d=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAAD(Buffer.from('dau-vao-ngan-hang'));d.setAuthTag(raw.subarray(12,28));
 const banks=JSON.parse(gunzipSync(Buffer.concat([d.update(raw.subarray(28)),d.final()])).toString('utf8')) as Banks;
 cache={key:id,banks};return banks;
}

type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown};
export type DvResponse={status:number;body:unknown};
const MAX_SKEW_DAYS=3;
/** GET ?khoi=: đề của hôm nay (giờ Việt Nam), không có đáp án. POST {khoi,ngay,seed,answers}: máy chủ ghép lại đúng đề đó rồi chấm.
 * banks: null khi máy chủ chưa có khóa giải mã ngân hàng. */
export function handleDauVao(req:Req,banks:Banks|null,now=Date.now(),prog:Progress=PROGRESS):DvResponse{
 if(req.method!=='GET'&&req.method!=='POST')return {status:405,body:{message:'Chỉ nhận GET hoặc POST.'}};
 if(!banks)return {status:503,body:{message:'Bài kiểm tra đầu vào đang cập nhật. Em nhắn Zalo 0967 365 413 để làm bài cùng trung tâm.'}};
 if(req.method==='GET'){
  const khoi=req.query?.khoi;
  if(!isDvTrack(khoi))return {status:400,body:{message:'Chọn khối: '+DV_TRACKS.join(', ')+'.'}};
  const ngay=vnDate(now),seed=randomInt(1,2**31-1);
  try{return {status:200,body:assemble(khoi,ngay,seed,banks,prog).paper};}catch{return {status:503,body:{message:'Ngân hàng đề của khối này đang cập nhật.'}};}
 }
 let body:any=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return {status:400,body:{message:'Yêu cầu không hợp lệ.'}};}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['khoi','ngay','seed','answers'].includes(k))||!isDvTrack(body.khoi)||!validDate(body.ngay)
  ||!Number.isSafeInteger(body.seed)||body.seed<1||body.seed>=2**31||!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers)||Object.keys(body.answers).length>60)
  return {status:400,body:{message:'Yêu cầu không hợp lệ.'}};
 const skew=Math.abs(Date.parse(body.ngay+'T00:00:00Z')-Date.parse(vnDate(now)+'T00:00:00Z'))/86400000;
 if(skew>MAX_SKEW_DAYS)return {status:410,body:{message:'Đề này đã quá hạn nộp. Em tải lại trang để làm đề của hôm nay.'}};
 try{
  const {paper,picks}=assemble(body.khoi,body.ngay,body.seed,banks,prog);
  return {status:200,body:grade(paper,picks,body.answers,prog.khoi[paper.khoi]?.groups??[])};
 }catch{return {status:503,body:{message:'Chưa chấm được bài. Em thử nộp lại sau ít phút.'}};}
}
/** Ngân hàng của máy chủ hiện tại, hoặc null nếu thiếu khóa / không giải mã được. */
export function serverBanks(env:Record<string,string|undefined>=process.env){const key=dauVaoKey(env);if(!key)return null;try{return loadBanks(key);}catch{return null;}}
