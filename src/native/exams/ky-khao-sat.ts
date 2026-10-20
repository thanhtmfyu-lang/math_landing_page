import {normalizeRegistration,type Registration} from '../../components/registration-submit';
/** Kỳ khảo sát MTM cuối kỳ I 2026–2027 (anh Thành duyệt mở cho học sinh ngoài 20/10/2026). Trang /ky-khao-sat chỉ nhận đăng ký;
 * ngày thi học sinh vào phòng thi /phong-thi-thu bằng số báo danh. Đăng ký đổ về kho lead (kind dang-ky, nguồn ky-khao-sat-ck1-2026). */
export const KS={ma:'ky-khao-sat-ck1-2026',ten:'Kỳ khảo sát MTM cuối kỳ I năm học 2026–2027',mo:'2026-12-05T08:00:00+07:00',dong:'2026-12-06T21:00:00+07:00',xepHang:'20:00 thứ Hai 07/12/2026',phut:90} as const;
export const KS_LOP=['10','11','12'] as const;
export type KsLop=typeof KS_LOP[number];
export type KsDangKy={hoTen:string;lop:KsLop|'';truong:string;zaloPh:string;dongY:boolean};
const BASE32='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const chuanTen=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
/** Số báo danh cố định theo (SĐT phụ huynh, họ tên, lớp): đăng ký lại vẫn ra đúng số cũ, phòng thi tính lại được. Không phải mật khẩu. */
export async function soBaoDanh(zaloPh:string,hoTen:string,lop:KsLop){
 const raw=new TextEncoder().encode(['ks-ck1-2026',zaloPh,chuanTen(hoTen),lop].join('|'));
 const h=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
 let s='';for(let i=0;i<6;i++)s+=BASE32[h[i]%32];
 return `KS${lop}-${s}`;
}
/** Kiểm phiếu; trả bản ghi gửi kho lead hoặc ném lỗi tiếng Việt. */
export function ksRegistration(f:KsDangKy,sbd:string,leadSource:string):Registration{
 if(!f.hoTen.trim()||!f.lop||!f.truong.trim()||!f.zaloPh.trim())throw new Error('Em điền đủ họ tên, lớp, trường và Zalo phụ huynh nhé.');
 if(f.hoTen.trim().length>80)throw new Error('Họ tên tối đa 80 ký tự.');
 if(f.truong.trim().length>120)throw new Error('Tên trường tối đa 120 ký tự.');
 if(!f.dongY)throw new Error('Em cần đồng ý điều khoản trước khi đăng ký.');
 return normalizeRegistration({studentName:f.hoTen,phone:f.zaloPh,grade:f.lop,message:'online',
  notes:[`${KS.ten} (05–06/12/2026)`,`Số báo danh: ${sbd}`,`Trường: ${f.truong.trim()}`,'SĐT là Zalo phụ huynh để nhận báo cáo 1 trang'].join('\n'),
  leadSource:[KS.ma,leadSource].filter(Boolean).join(' · ')});
}
export const chuanZalo=(v:string)=>v.replace(/[\s().-]/g,'').replace(/^\+84/,'0');
