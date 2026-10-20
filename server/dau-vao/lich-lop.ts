import type {DvTrack} from './engine';
// Thời khóa biểu lớp cho phiếu học thử: học sinh tick buổi đi được. Nguồn là tab Lich_lop của "MTM — Bảng điều hành trung tâm"
// (chỉ cột Lớp, Thứ, Bắt đầu, Kết thúc; không có học phí). Máy chủ đọc bản CSV công bố của riêng tab đó, 10 phút đọc lại một lần;
// chưa có link hoặc đọc lỗi thì dùng bản chụp dưới đây (đọc Lich_lop ngày 20/10/2026, bỏ TSA).
export const THU=['T2','T3','T4','T5','T6','T7','CN'] as const;
export type Thu=typeof THU[number];
export const THU_LABEL:Record<Thu,string>={T2:'Thứ 2',T3:'Thứ 3',T4:'Thứ 4',T5:'Thứ 5',T6:'Thứ 6',T7:'Thứ 7',CN:'Chủ nhật'};
export type Buoi={id:string;lop:string;thu:Thu;bat:string;ket:string};
const row=(lop:string,thu:Thu,bat:string,ket:string):Buoi=>({id:[lop,thu,bat,ket].join('|'),lop,thu,bat,ket});
export const LICH_CHUP:Buoi[]=[
 row('2K9 XPS 9+','T2','17:30','19:30'),row('2K9 XPS 9+','T4','17:30','19:30'),row('2K9 XPS 9+','T6','17:30','19:30'),
 row('2K9 XPS 8+','T3','17:30','19:30'),row('2K9 XPS 8+','T5','17:30','19:30'),row('2K9 XPS 8+','T7','17:30','19:30'),
 row('2K9 XPT','T2','19:30','21:30'),row('2K9 XPT','T3','19:30','21:30'),row('2K9 XPT','T5','19:30','21:30'),
 row('2K10 XPS 9+','T3','19:30','21:30'),row('2K10 XPS 9+','CN','08:00','10:00'),
 row('2K10 XPS 8+','T6','19:30','21:30'),row('2K10 XPS 8+','CN','10:00','12:00'),
 row('2K10 XPT','T2','19:30','21:30'),row('2K10 XPT','T7','15:30','17:30'),
 row('2K11 XPS 9+','T5','19:30','21:30'),row('2K11 XPS 9+','CN','13:30','15:30'),
 row('2K11 XPS 8+','T4','19:30','21:30'),row('2K11 XPS 8+','CN','15:30','17:30'),
 row('2K11 XPT','T4','19:30','21:30'),row('2K11 XPT','T7','13:30','15:30'),
 row('2K12','T5','18:00','20:00'),row('2K12','CN','15:00','17:00'),
 row('2K13','T3','20:00','22:00'),row('2K13','T6','20:00','22:00'),
 row('2K14','T2','18:00','20:00'),row('2K14','T5','09:00','11:00'),
 row('2K15','T5','18:00','20:00'),row('2K15','CN','14:00','16:00'),
 row('HSA.2','T5','14:30','17:30'),row('HSA','CN','17:00','20:00'),
];
const ORDER=(b:Buoi)=>THU.indexOf(b.thu)*10000+ +b.bat.replace(':','');
const hhmm=(v:string)=>{const m=/^(\d{1,2})[:h](\d{2})/.exec(v.trim());return m&&+m[1]<24&&+m[2]<60?m[1].padStart(2,'0')+':'+m[2]:null;};
function thu(v:string):Thu|null{const s=v.trim().toLowerCase();if(/^(cn|chủ nhật|chu nhat)$/.test(s))return 'CN';const m=/^(?:thứ|thu|t)\s*([2-7])$/.exec(s);return m?('T'+m[1]) as Thu:null;}
function csvRows(text:string){const out:string[][]=[];let cur:string[]=[],cell='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
  else if(c==='"')q=true;else if(c===','){cur.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;cur.push(cell);out.push(cur);cur=[];cell='';}else cell+=c;}
 if(cell||cur.length){cur.push(cell);out.push(cur);}return out;}
/** Đọc CSV tab Lich_lop theo tên cột; dòng thiếu thứ/giờ và lớp TSA bị bỏ. Trả [] nếu không thấy đủ cột. */
export function parseLichCsv(text:string):Buoi[]{
 const rows=csvRows(text.replace(/^﻿/,''));const head=(rows.shift()??[]).map(h=>h.trim().toLowerCase());
 const col=(n:string)=>head.indexOf(n),iL=col('lớp'),iT=col('thứ'),iB=col('bắt đầu'),iK=col('kết thúc');
 if([iL,iT,iB,iK].some(i=>i<0))return [];
 const seen=new Set<string>(),out:Buoi[]=[];
 for(const r of rows){const lop=(r[iL]??'').trim().replace(/\s+/g,' '),t=thu(r[iT]??''),b=hhmm(r[iB]??''),k=hhmm(r[iK]??'');
  if(!lop||lop.length>30||lop.includes('|')||/tsa/i.test(lop)||!t||!b||!k)continue;const x=row(lop,t,b,k);if(!seen.has(x.id)){seen.add(x.id);out.push(x);}}
 return out;}
/** Lớp của khối: lớp 6–12 theo khóa sinh (2K9 là lớp 12 năm học 2026–2027), HSA theo tên lớp có "HSA". */
export function buoiCuaKhoi(all:Buoi[],khoi:DvTrack,today:string){
 if(khoi==='hsa')return all.filter(b=>/hsa/i.test(b.lop)).sort((a,c)=>ORDER(a)-ORDER(c));
 const end=+today.slice(0,4)+(+today.slice(5,7)>=6?1:0),k='2K'+(end-6-+khoi)%100;
 return all.filter(b=>(b.lop===k||b.lop.startsWith(k+' '))&&!/hsa/i.test(b.lop)).sort((a,c)=>a.lop.localeCompare(c.lop)||ORDER(a)-ORDER(c));
}
export type Nhom={id:string;ten:string;ghiChu:string;buoi:{so:number;lua:Buoi[]}[]};
/** Gom lớp học cùng bài: các lớp XPS (8+, 9+) cùng khóa và các lớp HSA là một chương trình; buổi thứ k trong tuần của mỗi lớp là "Buổi k",
 * học sinh chọn mỗi buổi học ở lớp nào. Lớp còn lại (XPT, cấp 2) mỗi lớp một chương trình, buổi cố định. */
export function nhomTuBuoi(bs:Buoi[]):Nhom[]{
 const key=(lop:string)=>/hsa/i.test(lop)?'HSA':/\bXPS\b/i.test(lop)?lop.replace(/\s*XPS.*$/i,'')+' XPS':lop;
 const m=new Map<string,Map<string,Buoi[]>>();
 for(const b of [...bs].sort((a,c)=>ORDER(a)-ORDER(c))){const k=key(b.lop),g=m.get(k)??new Map<string,Buoi[]>();g.set(b.lop,[...(g.get(b.lop)??[]),b]);m.set(k,g);}
 return [...m].sort(([a],[c])=>a.localeCompare(c)).map(([id,g])=>{const lops=[...g.keys()].sort(),n=Math.max(...[...g.values()].map(x=>x.length)),nhieu=lops.length>1;
  const ten=id==='HSA'?'Lớp luyện thi HSA':id.endsWith(' XPS')?'Xuất phát sớm (XPS)':/\bXPT\b/i.test(id)?'Xuất phát thường (XPT)':'Lớp '+id;
  return {id,ten,ghiChu:nhieu?`Các lớp ${lops.join(' và ')} học cùng bài. Mỗi buổi em chọn học ngày nào cũng được, xếp so le giữa các lớp cho khớp lịch của em nhất.`:`Lớp ${lops[0]}, lịch cố định.`,
   buoi:Array.from({length:n},(_,i)=>({so:i+1,lua:lops.map(l=>g.get(l)![i]).filter(Boolean).sort((a,c)=>ORDER(a)-ORDER(c))}))};});
}
export const nhomCuaKhoi=(all:Buoi[],khoi:DvTrack,today:string)=>nhomTuBuoi(buoiCuaKhoi(all,khoi,today));
/** ids theo thứ tự Buổi 1, 2, …: hợp lệ khi chọn đủ mỗi buổi đúng một lựa chọn trong cùng một chương trình. */
export const kiemLuaChon=(nhom:Nhom[],ids:string[])=>nhom.find(n=>ids.length===n.buoi.length&&n.buoi.every((b,i)=>b.lua.some(x=>x.id===ids[i])))??null;
const ID_RE=/^[^|]{2,30}\|(T[2-7]|CN)\|\d{2}:\d{2}\|\d{2}:\d{2}$/;
export const validBuoiId=(v:unknown):v is string=>typeof v==='string'&&ID_RE.test(v);
export function buoiFromId(id:string):Buoi{const [lop,t,bat,ket]=id.split('|');return {id,lop,thu:t as Thu,bat,ket};}
export const buoiText=(b:Buoi)=>`${b.lop} ${THU_LABEL[b.thu]} ${b.bat}–${b.ket}`;
/** Buổi gần nhất từ lúc now (giờ Việt Nam) trong các buổi đã chọn: để bot mời học thử đúng buổi. */
export function buoiGanNhat(ids:string[],now:number){
 const vn=new Date(now+7*3600000),dow=(vn.getUTCDay()+6)%7,mins=vn.getUTCHours()*60+vn.getUTCMinutes();let best:{id:string;ngay:string;gio:string;d:number}|null=null;
 for(const id of ids){const b=buoiFromId(id),w=THU.indexOf(b.thu),m=+b.bat.slice(0,2)*60+ +b.bat.slice(3);let d=(w-dow+7)%7;if(d===0&&m<=mins)d=7;
  const total=d*1440+m;if(!best||total<best.d){const day=new Date(Date.UTC(vn.getUTCFullYear(),vn.getUTCMonth(),vn.getUTCDate()+d));best={id,ngay:day.toISOString().slice(0,10),gio:b.bat,d:total};}}
 return best&&{id:best.id,ngay:best.ngay,gio:best.gio};
}
// Link CSV công bố của riêng tab Lich_lop (Tệp > Chia sẻ > Công bố lên web > Lich_lop > CSV). Đặt MTM_LICH_LOP_CSV trên Vercel thì ưu tiên link đó.
export const LICH_LOP_CSV='';
let cache:{at:number;url:string;buoi:Buoi[]}|null=null;
export async function loadLich(env:Record<string,string|undefined>,transport:typeof fetch=fetch,now=Date.now()):Promise<Buoi[]>{
 const url=env.MTM_LICH_LOP_CSV||LICH_LOP_CSV;if(!url||!/^https:\/\/docs\.google\.com\//.test(url))return LICH_CHUP;
 if(cache&&cache.url===url&&now-cache.at<600000)return cache.buoi;
 try{const r=await transport(url,{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('csv');const buoi=parseLichCsv(await r.text());if(buoi.length<5)throw Error('rỗng');
  cache={at:now,url,buoi};return buoi;}
 catch{return cache?.url===url?cache.buoi:LICH_CHUP;}
}
