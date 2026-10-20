import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {cham,deCongKhai,dotCongKhai,mucLuc,quyenMo,thoiGianCau,type PtDe,type PtDot,type PtKetQua,type PtKho,type PtNguoiXem} from './engine';
import goiRaw from './goi.json';
import dotRaw from './dot.json';

/** Gói bán cho người ngoài. gia null = chưa duyệt giá; moBan false = chưa bán. Thanh toán thật còn cần MTM_PHONG_THI_THANH_TOAN=1. */
export type PtGoi={id:string;ten:string;loai:('thpt'|'hsa'|'tsa')[];soNgay:number;gia:number|null;moBan:boolean;moTa:string};
export const GOI=(goiRaw as {goi:PtGoi[]}).goi;
/** Lịch đợt thi (không bí mật: chỉ mã đề và giờ). Sửa server/phong-thi/dot.json rồi deploy, không cần đóng gói lại kho. */
export const DOT=(dotRaw as {dot:PtDot[]}).dot;

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
export type PtVe={d:string;s:number;a:string;n:string;t?:string;k?:string};
const b64=(b:Buffer)=>b.toString('base64url');
const veKey=(key:Buffer)=>createHash('sha256').update('phong-thi-ve:').update(key).digest();
export function kyVe(ve:PtVe,key:Buffer){const body=b64(Buffer.from(JSON.stringify(ve)));return body+'.'+b64(createHmac('sha256',veKey(key)).update(body).digest());}
export function docVe(token:unknown,key:Buffer):PtVe|null{
 if(typeof token!=='string'||token.length>600)return null;const [body,sig]=token.split('.');if(!body||!sig)return null;
 const want=createHmac('sha256',veKey(key)).update(body).digest(),got=Buffer.from(sig,'base64url');
 if(got.length!==want.length||!timingSafeEqual(got,want))return null;
 try{const v=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return v&&typeof v.d==='string'&&Number.isSafeInteger(v.s)&&typeof v.a==='string'&&typeof v.n==='string'&&(v.t===undefined||typeof v.t==='string')&&(v.k===undefined||typeof v.k==='string')?v as PtVe:null;}catch{return null;}
}
/** Khóa người làm ghi trong vé: học sinh/tài khoản theo id, khách theo băm thiết bị. */
export function maNguoi(ai:PtNguoiXem){return ai.kieu==='hoc-sinh'?'hs:'+(ai.id??'phien'):ai.kieu==='tai-khoan'?'tk:'+ai.id:'khach';}
/** Thêm 2 phút cho mạng chậm; nộp sau đó vẫn chấm nhưng đánh dấu quá giờ (không vào bảng xếp hạng). */
export const GIO_THEM_MS=120000;

export type PtTra={status:number;body:unknown};
type Body=Record<string,unknown>;
/** Thí sinh kỳ khảo sát đã đăng ký (api.ts tra từ cookie hoặc SBD + mã tra cứu); chỉ có SBD và khối, không có dữ liệu liên hệ. */
export type PtThiSinh={dot:string;sbd:string;khoi:'10'|'11'|'12';ten:string};
export type PtNgCanh={dot?:PtDot[];thiSinh?:PtThiSinh|null};
const NGOAI_GIO=(t:PtDot,nay:number)=>nay<Date.parse(t.mo)?'Đợt '+t.ten+' chưa mở. Em quay lại lúc '+gioVn(t.mo)+'.':'Đợt '+t.ten+' đã đóng lúc '+gioVn(t.dong)+'. Em vẫn luyện tự do đề này được nếu đề có trong kho.';
export const gioVn=(iso:string)=>new Date(Date.parse(iso)+7*3600000).toISOString().replace(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d).*/,'$4:$5 ngày $3/$2/$1');
/** Lõi API không phụ thuộc HTTP: danh mục, mở đề (tự do hoặc theo đợt), nộp bài. Người xem đã được server/phong-thi/api.ts xác định từ cookie. */
export function xuLy(action:string,body:Body,ai:PtNguoiXem,kho:{key:Buffer;kho:PtKho}|null,nay=Date.now(),ng:PtNgCanh={}):PtTra{
 if(!kho)return {status:503,body:{message:'Phòng thi thử đang cập nhật đề. Em quay lại sau ít phút hoặc nhắn Zalo 0967 365 413.'}};
 const dsDot=ng.dot??DOT,ts=ng.thiSinh??null;
 if(action==='danh-muc')return {status:200,body:{nguoiXem:congKhaiNguoiXem(ai),de:mucLuc(kho.kho).map(d=>({...d,quyen:quyenMo(d,ai,nay)})),goi:GOI.filter(g=>g.moBan).map(({id,ten,loai,soNgay,gia,moTa})=>({id,ten,loai,soNgay,gia,moTa})),
  dot:dotCongKhai(dsDot,kho.kho,nay).map(t=>ts&&ts.dot===t.ma?{...t,cuaEm:{sbd:ts.sbd,khoi:ts.khoi,ten:ts.ten}}:t)}};
 // Chế độ đợt: chỉ mở trong giờ; đợt khảo sát (có khoi) cần SBD, đề lấy theo khối của thí sinh.
 let dot:PtDot|null=null,deId=body.de;
 if(action==='mo'&&body.dot!==undefined){
  dot=dsDot.find(t=>t.ma===body.dot)??null;if(!dot)return {status:404,body:{message:'Không tìm thấy đợt thi này.'}};
  if(dot.khoi){if(!ts||ts.dot!==dot.ma)return {status:403,body:{lyDo:'can-sbd',message:'Đợt khảo sát cần số báo danh. Em đăng ký hoặc nhập SBD và mã tra cứu.'}};deId=dot.khoi[ts.khoi];}
  else if(dot.de!==body.de)return {status:400,body:{message:'Đề không thuộc đợt này.'}};
  if(!deId||deId==='chua-gan')return {status:409,body:{message:'Đề của đợt này sắp công bố.'}};
  if(!(Date.parse(dot.mo)<=nay&&nay<Date.parse(dot.dong)))return {status:403,body:{lyDo:'ngoai-gio',message:NGOAI_GIO(dot,nay)}};
 }
 const de=typeof deId==='string'?kho.kho.de.find(d=>d.id===deId):undefined;
 if(!de)return {status:404,body:{message:'Không tìm thấy đề này.'}};
 // Đề khảo sát mở cho mọi thí sinh đã đăng ký, bất kể tầng: lúc mở theo SBD, lúc nộp theo vé đã ký có SBD của đợt đó.
 const veNop=action==='nop'?docVe(body.ve,kho.key):null,laKs=!!dot?.khoi||!!(veNop?.k&&dsDot.some(t=>t.ma===veNop.t&&t.khoi&&Object.values(t.khoi).includes(de.id)));
 const q=laKs?{mo:true as const}:quyenMo(de,ai,nay);
 if(!q.mo)return {status:403,body:{lyDo:q.lyDo,message:q.lyDo==='hoc-sinh-mtm'?'Đề này dành riêng cho học sinh Minh Thành Math. Em đăng nhập bằng mã học sinh (như khi làm BTVN) để mở.':'Đề này nằm trong gói luyện đề. Em đăng nhập tài khoản đã có gói hoặc kích hoạt gói để làm.'}};
 if(action==='mo'){
  const ve=kyVe({d:de.id,s:nay,a:maNguoi(ai),n:randomBytes(9).toString('base64url'),...(dot?{t:dot.ma}:{}),...(dot?.khoi&&ts?{k:ts.sbd}:{})},kho.key);
  return {status:200,body:{de:deCongKhai(de),ve,batDau:nay,hetGio:nay+de.thoiGian*60000,...(dot?{dot:{ma:dot.ma,ten:dot.ten}}:{})}};
 }
 if(action==='nop'){
  const ve=veNop;
  if(!ve||ve.d!==de.id||ve.s>nay+60000)return {status:400,body:{message:'Lượt làm bài không hợp lệ. Em mở lại đề để làm lượt mới.'}};
  if(ve.a!==maNguoi(ai)&&ve.a!=='khach')return {status:403,body:{message:'Lượt này của tài khoản khác. Em đăng nhập đúng tài khoản rồi nộp lại.'}};
  if(nay-ve.s>de.thoiGian*60000+24*3600000)return {status:410,body:{message:'Lượt làm bài đã quá 24 giờ. Em mở lại đề để làm lượt mới.'}};
  const traLoi=body.traLoi;
  if(!traLoi||typeof traLoi!=='object'||Array.isArray(traLoi)||Object.keys(traLoi).length>de.cau.length)return {status:400,body:{message:'Bài làm không hợp lệ.'}};
  const ketQua=cham(de,traLoi as Record<string,unknown>),giay=Math.max(0,Math.round((nay-ve.s)/1000));
  // Thời gian từng câu: tổng không vượt thời lượng + gia hạn, cũng không vượt thời gian thật từ vé (+60 giây lệch đồng hồ).
  const tg=thoiGianCau(de,body.thoiGian,Math.min(de.thoiGian*60+GIO_THEM_MS/1000,giay+60));
  if(tg)for(const c of ketQua.cau)c.giay=tg[c.ma]??0;
  return {status:200,body:{ketQua,giay,quaGio:nay-ve.s>de.thoiGian*60000+GIO_THEM_MS,nonce:ve.n,thoiGian:tg,...(ve.t?{dot:ve.t}:{}),...(ve.k?{sbd:ve.k}:{})}};
 }
 return {status:400,body:{message:'Yêu cầu không hợp lệ.'}};
}
export function congKhaiNguoiXem(ai:PtNguoiXem){return ai.kieu==='hoc-sinh'?{kieu:'hoc-sinh',ten:ai.ten}:ai.kieu==='tai-khoan'?{kieu:'tai-khoan',ten:ai.ten,goi:ai.goi}:{kieu:'khach'};}
export type {PtKetQua,PtDe};
