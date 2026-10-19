/** Thi thử HSA (/thi-thu-hsa): phần lõi thuần dùng chung cho trang và /api/hsa-xep-hang.
 * Không đọc trình duyệt, không gọi mạng. Điểm luôn do máy chủ chấm; ở đây chỉ chuẩn hóa tên, lớp và thứ tự hiển thị. */
export const HSA_GRADES=['10','11','12','khac'] as const;
export type HsaGrade=typeof HSA_GRADES[number];
export const HSA_GRADE_LABEL:Record<HsaGrade,string>={'10':'Lớp 10','11':'Lớp 11','12':'Lớp 12',khac:'Khác'};
export const HSA_NAME_MAX=24,HSA_TOP_LIMIT=50;
export const isHsaGrade=(v:unknown):v is HsaGrade=>typeof v==='string'&&(HSA_GRADES as readonly string[]).includes(v);
export const validHsaExamId=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{2,99}$/.test(v);

// Lọc thô từ ngữ tục phổ biến. Bản có dấu so khớp nguyên từ; viết tắt Latin so khớp nguyên từ sau khi bỏ dấu.
const PROFANE_VI=['địt','đụ','đéo','lồn','cặc','buồi','đĩ','đù','đcm','đm','đmm','đkm','vãi'];
const PROFANE_ASCII=['dm','dmm','dcm','dkm','dcmm','vcl','vkl','vl','clm','cmm','cc','dit','djt','deo','lon','buoi','fuck','fck','shit','bitch','sex','porn','du ma','dit me','con cho','oc cho','ngu nhu bo'];
const ascii=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D');
/** Khóa so trùng tên trên một đề: chữ thường, bỏ dấu, chỉ a-z0-9 và một dấu cách. */
export function hsaNameKey(name:string){return ascii(name).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ').slice(0,32).trim();}
function hasProfanity(name:string){
 const words=name.toLocaleLowerCase('vi').split(/[^\p{L}\p{M}0-9]+/u).filter(Boolean);
 if(words.some(w=>PROFANE_VI.includes(w)))return true;
 // Từ Latin chỉ chặn khi được viết không dấu (tránh chặn nhầm "Lớn", "Các", "Đèo"...).
 const plain=words.filter(w=>w===ascii(w)).join(' ');
 return PROFANE_ASCII.some(p=>(' '+plain+' ').includes(' '+p+' '));
}
/** Tên hiển thị công khai: bỏ đường dẫn, email, chuỗi số dài (số điện thoại), ký tự lạ; tối đa 24 ký tự.
 * Trả null khi tên rỗng, quá ngắn hoặc có từ ngữ không phù hợp. */
export function sanitizeDisplayName(raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 let s=raw.normalize('NFC').slice(0,200).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,' ');
 s=s.replace(/\b(?:https?:\/\/|www\.)\S*/gi,' ').replace(/\S+@\S+/g,' ').replace(/\b[\p{L}0-9-]+(?:\.[\p{L}0-9-]+)*\.(?:com|vn|net|org|io|me|xyz|info|link|ly|co|tk|top|site|online|edu)\b\S*/giu,' ');
 s=s.replace(/\+?\d[\d\s.()-]{4,}\d/g,' ').replace(/\d{6,}/g,' ');
 s=s.replace(/[^\p{L}\p{M}0-9 .'_-]+/gu,' ').replace(/\s+/g,' ').trim().replace(/^[.'_-]+|[.'_-]+$/g,'').trim();
 const chars=Array.from(s);if(chars.length>HSA_NAME_MAX)s=chars.slice(0,HSA_NAME_MAX).join('').trim();
 if(hasProfanity(s))return null;
 if((s.match(/\p{L}/gu)||[]).length<2||hsaNameKey(s).length<2)return null;
 return s;
}
export type HsaRankRow={rank:number;name:string;grade:HsaGrade;score:number;seconds:number;date:string};
/** Phép chiếu công khai một dòng RPC: chỉ các trường được duyệt, điểm quy về thang 10. */
export function publicHsaRow(r:any,maxRank=100):HsaRankRow{
 if(!r||!Number.isSafeInteger(r.rank)||r.rank<1||r.rank>maxRank||typeof r.name!=='string'||sanitizeDisplayName(r.name)!==r.name||!isHsaGrade(r.grade)
  ||!Number.isSafeInteger(r.score)||r.score<0||r.score>10000||!Number.isSafeInteger(r.seconds)||r.seconds<0||r.seconds>86400||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('Invalid HSA rank row');
 return {rank:r.rank,name:r.name,grade:r.grade,score:r.score/1000,seconds:r.seconds,date:r.date};
}
export type HsaEntry={name:string;grade:HsaGrade;scoreMillipoints:number;elapsedMs:number;submittedAt:number};
/** Cùng luật với SQL 069: điểm cao hơn, rồi thời gian làm ít hơn, rồi nộp sớm hơn. */
export function rankHsaEntries<T extends HsaEntry>(rows:readonly T[]):(T&{rank:number})[]{
 return [...rows].sort((a,b)=>b.scoreMillipoints-a.scoreMillipoints||a.elapsedMs-b.elapsedMs||a.submittedAt-b.submittedAt).map((r,i)=>({...r,rank:i+1}));
}
export function formatHsaDuration(seconds:number){const s=Math.max(0,Math.round(seconds)),m=Math.floor(s/60);return m+' phút '+String(s%60).padStart(2,'0')+' giây';}
export function formatHsaScore(score:number){return score.toLocaleString('vi-VN',{maximumFractionDigits:2});}
export const HSA_SUBMIT_STATUS=['accepted','already','device','name','late','fast','closed','not_submitted'] as const;
export type HsaSubmitStatus=typeof HSA_SUBMIT_STATUS[number];
export function hsaStatusMessage(status:HsaSubmitStatus,rank?:number|null){
 return ({accepted:rank?`Đã vào bảng xếp hạng: hạng ${rank}.`:'Đã ghi nhận lượt của em.',already:rank?`Lượt này đã có trong bảng xếp hạng: hạng ${rank}.`:'Lượt này đã được ghi nhận.',
  device:'Thiết bị này đã có lượt nộp đầu tiên trong bảng xếp hạng, lượt này chỉ để em tự luyện.',name:'Tên hiển thị này đã có trong bảng xếp hạng của đề. Lượt này chỉ để tự luyện.',
  late:'Bài nộp sau khi hết giờ nên không tính vào bảng xếp hạng.',fast:'Bài nộp quá nhanh so với thời gian của đề nên không tính vào bảng xếp hạng.',closed:'Đề này hiện chưa mở bảng xếp hạng.',not_submitted:'Máy chủ chưa ghi nhận bài nộp của lượt này.'} as Record<HsaSubmitStatus,string>)[status];
}
