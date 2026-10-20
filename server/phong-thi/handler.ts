import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {cham,deCongKhai,mucLuc,quyenMo,type PtDe,type PtKetQua,type PtKho,type PtNguoiXem} from './engine';
import goiRaw from './goi.json';

/** Gói bán cho người ngoài. gia null = chưa duyệt giá; moBan false = chưa bán. Thanh toán thật còn cần MTM_PHONG_THI_THANH_TOAN=1. */
export type PtGoi={id:string;ten:string;loai:('thpt'|'hsa'|'tsa')[];soNgay:number;gia:number|null;moBan:boolean;moTa:string};
export const GOI=(goiRaw as {goi:PtGoi[]}).goi;

// Kho mã công khai nên đề và đáp án chỉ có dạng mã hóa: gzip + AES-256-GCM, khóa MTM_PHONG_THI_KEY (base64 32 byte) trên Vercel.
const AAD=Buffer.from('phong-thi-kho-de');
export function phongThiKey(env:Record<string,string|undefined>){const k=Buffer.from(env.MTM_PHONG_THI_KEY??'','base64');return k.length===32?k:null;}
export function dongGoi(kho:PtKho,key:Buffer){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(AAD);const body=Buffer.concat([c.update(gzipSync(JSON.stringify(kho))),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);}
export function moGoi(raw:Buffer,key:Buffer):PtKho{const d=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAAD(AAD);d.setAuthTag(raw.subarray(12,28));return JSON.parse(gunzipSync(Buffer.concat([d.update(raw.subarray(28)),d.final()])).toString('utf8')) as PtKho;}
let cache:{key:string;kho:PtKho}|null=null;
export function loadKho(key:Buffer,root=process.cwd()):PtKho{
 const id=createHash('sha256').update(key).digest('hex');if(cache?.key===id)return cache.kho;
 const kho=moGoi(readFileSync(join(root,'server/phong-thi/kho-de.bin')),key);cache={key:id,kho};return kho;
}
export function serverKho(env:Record<string,string|undefined>=process.env){const key=phongThiKey(env);if(!key)return null;try{return {key,kho:loadKho(key)};}catch{return null;}}

/** Vé làm bài: máy chủ ký (đề, giờ mở đề, người làm, số ngẫu nhiên). Nộp bài phải kèm vé đúng; giờ bắt đầu lấy từ vé, không tin trình duyệt. */
export type PtVe={d:string;s:number;a:string;n:string};
const b64=(b:Buffer)=>b.toString('base64url');
const veKey=(key:Buffer)=>createHash('sha256').update('phong-thi-ve:').update(key).digest();
export function kyVe(ve:PtVe,key:Buffer){const body=b64(Buffer.from(JSON.stringify(ve)));return body+'.'+b64(createHmac('sha256',veKey(key)).update(body).digest());}
export function docVe(token:unknown,key:Buffer):PtVe|null{
 if(typeof token!=='string'||token.length>600)return null;const [body,sig]=token.split('.');if(!body||!sig)return null;
 const want=createHmac('sha256',veKey(key)).update(body).digest(),got=Buffer.from(sig,'base64url');
 if(got.length!==want.length||!timingSafeEqual(got,want))return null;
 try{const v=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return v&&typeof v.d==='string'&&Number.isSafeInteger(v.s)&&typeof v.a==='string'&&typeof v.n==='string'?v as PtVe:null;}catch{return null;}
}
/** Khóa người làm ghi trong vé: học sinh/tài khoản theo id, khách theo băm thiết bị. */
export function maNguoi(ai:PtNguoiXem){return ai.kieu==='hoc-sinh'?'hs:'+(ai.id??'phien'):ai.kieu==='tai-khoan'?'tk:'+ai.id:'khach';}
/** Thêm 2 phút cho mạng chậm; nộp sau đó vẫn chấm nhưng đánh dấu quá giờ (không vào bảng xếp hạng). */
export const GIO_THEM_MS=120000;

export type PtTra={status:number;body:unknown};
type Body=Record<string,unknown>;
/** Lõi API không phụ thuộc HTTP: danh mục, mở đề, nộp bài. Người xem đã được api/phong-thi.ts xác định từ cookie. */
export function xuLy(action:string,body:Body,ai:PtNguoiXem,kho:{key:Buffer;kho:PtKho}|null,nay=Date.now()):PtTra{
 if(!kho)return {status:503,body:{message:'Phòng thi thử đang cập nhật đề. Em quay lại sau ít phút hoặc nhắn Zalo 0967 365 413.'}};
 if(action==='danh-muc')return {status:200,body:{nguoiXem:congKhaiNguoiXem(ai),de:mucLuc(kho.kho).map(d=>({...d,quyen:quyenMo(d,ai,nay)})),goi:GOI.filter(g=>g.moBan).map(({id,ten,loai,soNgay,gia,moTa})=>({id,ten,loai,soNgay,gia,moTa}))}};
 const de=typeof body.de==='string'?kho.kho.de.find(d=>d.id===body.de):undefined;
 if(!de)return {status:404,body:{message:'Không tìm thấy đề này.'}};
 const q=quyenMo(de,ai,nay);
 if(!q.mo)return {status:403,body:{lyDo:q.lyDo,message:q.lyDo==='hoc-sinh-mtm'?'Đề này dành riêng cho học sinh Minh Thành Math. Em đăng nhập bằng mã học sinh (như khi làm BTVN) để mở.':'Đề này nằm trong gói luyện đề. Em đăng nhập tài khoản đã có gói hoặc kích hoạt gói để làm.'}};
 if(action==='mo'){
  const ve=kyVe({d:de.id,s:nay,a:maNguoi(ai),n:randomBytes(9).toString('base64url')},kho.key);
  return {status:200,body:{de:deCongKhai(de),ve,batDau:nay,hetGio:nay+de.thoiGian*60000}};
 }
 if(action==='nop'){
  const ve=docVe(body.ve,kho.key);
  if(!ve||ve.d!==de.id||ve.s>nay+60000)return {status:400,body:{message:'Lượt làm bài không hợp lệ. Em mở lại đề để làm lượt mới.'}};
  if(ve.a!==maNguoi(ai)&&ve.a!=='khach')return {status:403,body:{message:'Lượt này của tài khoản khác. Em đăng nhập đúng tài khoản rồi nộp lại.'}};
  if(nay-ve.s>de.thoiGian*60000+24*3600000)return {status:410,body:{message:'Lượt làm bài đã quá 24 giờ. Em mở lại đề để làm lượt mới.'}};
  const traLoi=body.traLoi;
  if(!traLoi||typeof traLoi!=='object'||Array.isArray(traLoi)||Object.keys(traLoi).length>de.cau.length)return {status:400,body:{message:'Bài làm không hợp lệ.'}};
  const ketQua=cham(de,traLoi as Record<string,unknown>),giay=Math.max(0,Math.round((nay-ve.s)/1000));
  return {status:200,body:{ketQua,giay,quaGio:nay-ve.s>de.thoiGian*60000+GIO_THEM_MS,nonce:ve.n}};
 }
 return {status:400,body:{message:'Yêu cầu không hợp lệ.'}};
}
export function congKhaiNguoiXem(ai:PtNguoiXem){return ai.kieu==='hoc-sinh'?{kieu:'hoc-sinh',ten:ai.ten}:ai.kieu==='tai-khoan'?{kieu:'tai-khoan',ten:ai.ten,goi:ai.goi}:{kieu:'khach'};}
export type {PtKetQua,PtDe};
