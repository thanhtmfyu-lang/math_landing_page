/** Giấy khen điện tử cho học sinh vào top 10 bảng xếp hạng BTVN (tuần và tháng) trong khối của mình.
 * Chỉ dùng hạng của chính em do /api/xep-hang-cua-em trả theo phiên BTVN; không đọc bảng công khai hay dữ liệu bạn khác.
 * Tên trên giấy là tên đã hiện ở góc học tập của em; lớp là nhãn lớp em đang thấy. Không số điện thoại, không trường. */
import {certificateDate,type CertificateData} from '../../components/mtm-certificate';
export const BTVN_CERT_TOP=10;
export const BTVN_CERT_KINDS=['btvn-tuan','btvn-thang'] as const;
export type BtvnCertKind=typeof BTVN_CERT_KINDS[number];
export const BTVN_CERT_FOOTER='minhthanhmath.vn/xep-hang';
type OwnRow={rank:number;score:number;submitted:number;total:number;className:string};
/** Khối của lớp (cùng cách góc học tập dùng để xem hạng của em). */
export const btvnCohort=(className:string)=>/\b(2K(?:9|1[0-4]))\b/i.exec(className)?.[1].toUpperCase()??null;
/** Hạng 1–10 từ dòng hạng của em; dữ liệu sai hình dạng thì không có giấy khen. */
export function btvnCertificateRank(row:unknown):number|null{
 if(!row||typeof row!=='object')return null;
 const r=row as OwnRow;
 if(!Number.isSafeInteger(r.rank)||typeof r.score!=='number'||!Number.isFinite(r.score)||r.score<0||r.score>10||!Number.isSafeInteger(r.submitted)||!Number.isSafeInteger(r.total)||r.total<1||r.submitted<0||r.submitted>r.total||typeof r.className!=='string')return null;
 return r.rank>=1&&r.rank<=BTVN_CERT_TOP?r.rank:null;
}
const vnDay=(at:number)=>{const d=new Date(at+7*3600_000);return {y:d.getUTCFullYear(),m:d.getUTCMonth(),d:d.getUTCDate(),dow:(d.getUTCDay()+6)%7};};
const dm=(t:number)=>{const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0');};
/** Kỳ theo giờ Việt Nam: tuần thứ Hai–Chủ nhật, tháng dương lịch. */
export function btvnPeriodLabel(kind:BtvnCertKind,now:number){
 const v=vnDay(now);
 if(kind==='btvn-thang')return 'tháng '+String(v.m+1).padStart(2,'0')+'/'+v.y;
 const mon=Date.UTC(v.y,v.m,v.d-v.dow),sun=mon+6*86_400_000;
 return 'tuần '+dm(mon)+'–'+dm(sun)+'/'+new Date(sun).getUTCFullYear();
}
const fmt=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:2});
/** Giấy khen của chính em: kind là kỳ BTVN, row là hạng của em, fullName/classLabel là thông tin đã hiện ở góc học tập. */
export function btvnCertificate({kind,row,fullName,classLabel,cohort,now}:{kind:string;row:unknown;fullName:string;classLabel:string;cohort:string|null;now:number}):CertificateData|null{
 const rank=btvnCertificateRank(row),name=fullName.normalize('NFC').trim().replace(/\s+/g,' ');
 if(!rank||!cohort||!name||!(BTVN_CERT_KINDS as readonly string[]).includes(kind))return null;
 const r=row as OwnRow,period=btvnPeriodLabel(kind as BtvnCertKind,now),date=certificateDate(new Date(now)),label=classLabel.trim();
 return {name,achievementTitle:'Top '+rank+' bảng xếp hạng BTVN '+period,subtitle:['Bài tập về nhà','Khối '+cohort,label&&(/^lớp\b/i.test(label)?label:'Lớp '+label)].filter(Boolean).join(' · '),
  scoreText:'Điểm trung bình '+fmt(r.score)+'/10 · nộp '+r.submitted+'/'+r.total+' bài',rank,dateText:date,footerUrl:BTVN_CERT_FOOTER,
  disclaimer:'Kết quả BTVN tại MTM · hạng trong khối '+cohort+' tính đến ngày '+date};
}
export const btvnCertificateFileName=(kind:BtvnCertKind,rank:number,now:number)=>'giay-khen-mtm-btvn-'+(kind==='btvn-tuan'?'tuan':'thang')+'-'+btvnPeriodLabel(kind,now).replace(/^\S+ /,'').replace(/[/–]/g,'-')+'-hang-'+rank+'.png';
