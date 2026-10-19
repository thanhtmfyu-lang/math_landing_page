import {isDvTrack,type DvTrack} from './engine';
// Phiếu thông tin học thử điền trước khi làm bài kiểm tra đầu vào. Dùng chung cho trình duyệt (kiểm trước khi gửi) và máy chủ (kiểm lại trước khi ghi).
// Các cột theo danh sách "Học sinh mới" quản lý lớp vẫn lấy: lớp, họ tên, trường, ngày sinh, SĐT, lịch học, ghi chú; thêm phụ huynh và hình thức học.
export const HS_DAYS=['T2','T3','T4','T5','T6','T7','CN'] as const;
// Ca theo giờ lớp thật của trung tâm: tối 18h–20h, 20h–22h; cuối tuần sáng 8h–12h, chiều 14h–16h.
export const HS_SLOTS=['toi-18','toi-20','sang-cuoi-tuan','chieu-cuoi-tuan'] as const;
export const HS_SLOT_LABEL:Record<typeof HS_SLOTS[number],string>={'toi-18':'Tối 18h–20h','toi-20':'Tối 20h–22h','sang-cuoi-tuan':'Sáng cuối tuần','chieu-cuoi-tuan':'Chiều cuối tuần'};
export const HS_GOALS=['theo-kip','diem-cao','thi-vao-10','thi-chuyen','tot-nghiep','hsa','hsg'] as const;
export const HS_GOAL_LABEL:Record<typeof HS_GOALS[number],string>={'theo-kip':'Theo kịp chương trình trên lớp','diem-cao':'Lên điểm cao trên lớp','thi-vao-10':'Ôn thi vào 10','thi-chuyen':'Thi vào lớp chuyên Toán','tot-nghiep':'Thi tốt nghiệp THPT','hsa':'Thi Đánh giá năng lực HSA','hsg':'Học sinh giỏi'};
export const HS_HEARD=['facebook','tiktok','zalo','ban-be','phu-huynh-khac','google','di-ngang','khac'] as const;
export const HS_HEARD_LABEL:Record<typeof HS_HEARD[number],string>={facebook:'Facebook',tiktok:'TikTok',zalo:'Zalo','ban-be':'Bạn bè giới thiệu','phu-huynh-khac':'Phụ huynh khác giới thiệu',google:'Tìm trên Google','di-ngang':'Đi ngang qua trung tâm',khac:'Khác'};
export type HoSo={khoi:DvTrack;hoTen:string;ngaySinh:string;truong:string;lopTruong:string;phuHuynh:string;sdtPh:string;sdtHs:string;hinhThuc:'truc-tiep'|'online';ngayRanh:string[];caRanh:string[];mucTieu:string;nguon:string;ghiChu:string;dongY:true;leadSource:string};
const KEYS=['khoi','hoTen','ngaySinh','truong','lopTruong','phuHuynh','sdtPh','sdtHs','hinhThuc','ngayRanh','caRanh','mucTieu','nguon','ghiChu','dongY','leadSource'];
const clean=(v:unknown)=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
/** Số di động Việt Nam 10 chữ số; null nếu sai. */
export function normalizeVnPhone(v:string){const p=v.replace(/[\s().-]/g,'').replace(/^\+84/,'0');return /^0[35789]\d{8}$/.test(p)?p:null;}
/** Năm sinh hợp lý theo khối (cho phép lệch 2 năm vì học sớm/muộn); HSA tính như lớp 12. */
function birthYearOk(khoi:DvTrack,iso:string,today:string){const y=+iso.slice(0,4),school=+today.slice(0,4)-(+today.slice(5,7)<6?1:0),grade=khoi==='hsa'?12:+khoi;const expect=school-grade-5;return y>=expect-2&&y<=expect+2;}
/** Kiểm phiếu; trả phiếu đã chuẩn hóa hoặc câu lỗi tiếng Việt đúng ô cần sửa. today: yyyy-mm-dd giờ Việt Nam. */
export function validateHoSo(raw:unknown,today:string):HoSo|string{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!KEYS.includes(k)))return 'Phiếu thông tin không hợp lệ.';
 const b=raw as Record<string,unknown>;
 if(!isDvTrack(b.khoi))return 'Em chọn khối đang học.';
 const hoTen=clean(b.hoTen);if(hoTen.length<2||hoTen.length>60||/\d/.test(hoTen))return 'Nhập họ tên học sinh (2–60 chữ, không có số).';
 const ngaySinh=clean(b.ngaySinh);if(!/^\d{4}-\d{2}-\d{2}$/.test(ngaySinh)||Number.isNaN(Date.parse(ngaySinh+'T00:00:00Z'))||new Date(ngaySinh+'T00:00:00Z').toISOString().slice(0,10)!==ngaySinh)return 'Nhập ngày sinh của học sinh.';
 if(!birthYearOk(b.khoi,ngaySinh,today))return 'Ngày sinh chưa khớp với khối đã chọn, em kiểm tra lại năm sinh hoặc khối.';
 const truong=clean(b.truong);if(truong.length<2||truong.length>80)return 'Nhập trường đang học (ví dụ: THPT Kim Liên).';
 const lopTruong=clean(b.lopTruong);if(lopTruong.length>20)return 'Lớp trên trường tối đa 20 ký tự (ví dụ: 10A1).';
 const phuHuynh=clean(b.phuHuynh);if(phuHuynh.length<2||phuHuynh.length>60||/\d/.test(phuHuynh))return 'Nhập họ tên phụ huynh (2–60 chữ).';
 const sdtPh=normalizeVnPhone(clean(b.sdtPh));if(!sdtPh)return 'Số điện thoại phụ huynh chưa đúng: nhập số di động 10 chữ số (số có Zalo).';
 let sdtHs='';if(clean(b.sdtHs)){const v=normalizeVnPhone(clean(b.sdtHs));if(!v)return 'Số điện thoại của em chưa đúng, hoặc để trống.';sdtHs=v;}
 if(b.hinhThuc!=='truc-tiep'&&b.hinhThuc!=='online')return 'Chọn học trực tiếp tại trung tâm hay học online.';
 const list=(v:unknown,allowed:readonly string[])=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&allowed.includes(x))?[...new Set(v as string[])].sort((a,c)=>allowed.indexOf(a)-allowed.indexOf(c)):null;
 const ngayRanh=list(b.ngayRanh??[],HS_DAYS),caRanh=list(b.caRanh??[],HS_SLOTS);if(!ngayRanh||!caRanh)return 'Lịch rảnh không hợp lệ.';
 const mucTieu=clean(b.mucTieu);if(mucTieu&&!(HS_GOALS as readonly string[]).includes(mucTieu))return 'Mục tiêu không hợp lệ.';
 const nguon=clean(b.nguon);if(nguon&&!(HS_HEARD as readonly string[]).includes(nguon))return 'Nguồn biết MTM không hợp lệ.';
 const ghiChu=typeof b.ghiChu==='string'?b.ghiChu.trim().slice(0,500):'';
 if(b.dongY!==true)return 'Phụ huynh cần đồng ý để MTM nhận thông tin và liên hệ xếp lớp học thử.';
 const leadSource=clean(b.leadSource).slice(0,200);
 return {khoi:b.khoi,hoTen,ngaySinh,truong,lopTruong,phuHuynh,sdtPh,sdtHs,hinhThuc:b.hinhThuc,ngayRanh,caRanh,mucTieu,nguon,ghiChu,dongY:true,leadSource};
}
/** Lịch rảnh dạng chữ cho quản lý lớp, ví dụ "T3, T5 · Tối 20h–22h". */
export function lichRanhText(h:Pick<HoSo,'ngayRanh'|'caRanh'>){return [h.ngayRanh.join(', '),h.caRanh.map(c=>HS_SLOT_LABEL[c as keyof typeof HS_SLOT_LABEL]).join(', ')].filter(Boolean).join(' · ')||'Chưa chọn';}
