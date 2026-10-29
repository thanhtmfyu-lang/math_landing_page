/**
 * Ngày thi cho đồng hồ đếm ngược ở đầu trang chủ (29/10/2026).
 * Giờ Việt Nam (+07:00). `start` = 00:00 ngày thi đầu, `end` = hết ngày thi cuối; qua `end` thì kỳ đó tự ẩn.
 * `official: false` = ngày dự kiến, trên web hiện chữ "dự kiến". Khi có lịch chính thức: sửa ngày, đổi official thành true, ghi nguồn.
 *
 * THPT 2027: Bộ GD&ĐT công bố khung kế hoạch năm học 2026–2027, thi tốt nghiệp THPT dự kiến 11–12/6 hằng năm
 *   (Tiền Phong 08/08/2026: https://tienphong.vn/bo-gddt-cong-bo-thoi-gian-du-kien-thi-tot-nghiep-thpt-nam-2027-post1866130.tpo).
 *   Chờ quy chế/lịch thi chính thức 2027 của Bộ.
 * HSA 2027: đến 29/10/2026 Trung tâm Khảo thí ĐHQGHN (hsa.edu.vn, khaothi.vnu.edu.vn) CHƯA công bố lịch.
 *   Ngày dưới đây ước theo đúng tuần thi của lịch HSA 2026 (đợt 601–605: 07–08/3, 21–22/3, 04–05/4, 18–19/4, 09–10/5/2026,
 *   theo https://huongnghiep.hocmai.vn/danh-gia-nang-luc-hsa trích hsa.edu.vn), dời sang thứ Bảy–Chủ nhật tương ứng năm 2027.
 */
export type ExamDate={id:string;name:string;short:string;start:string;end:string;official:boolean};

export const EXAM_DATES:ExamDate[]=[
 {id:'hsa-1',name:'HSA đợt 1',short:'HSA 1',start:'2027-03-06T00:00:00+07:00',end:'2027-03-07T23:59:59+07:00',official:false},
 {id:'hsa-2',name:'HSA đợt 2',short:'HSA 2',start:'2027-03-20T00:00:00+07:00',end:'2027-03-21T23:59:59+07:00',official:false},
 {id:'hsa-3',name:'HSA đợt 3',short:'HSA 3',start:'2027-04-03T00:00:00+07:00',end:'2027-04-04T23:59:59+07:00',official:false},
 {id:'hsa-4',name:'HSA đợt 4',short:'HSA 4',start:'2027-04-17T00:00:00+07:00',end:'2027-04-18T23:59:59+07:00',official:false},
 {id:'hsa-5',name:'HSA đợt 5',short:'HSA 5',start:'2027-05-08T00:00:00+07:00',end:'2027-05-09T23:59:59+07:00',official:false},
 {id:'thpt-2027',name:'Thi tốt nghiệp THPT 2027',short:'THPT QG',start:'2027-06-11T00:00:00+07:00',end:'2027-06-12T23:59:59+07:00',official:false},
];

/** Kỳ còn hiện: chưa qua ngày thi cuối, sắp theo ngày thi. */
export function upcomingExams(now:number,list:ExamDate[]=EXAM_DATES){return list.filter(x=>Date.parse(x.end)>=now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}

export function splitRemaining(ms:number){const s=Math.max(0,Math.floor(ms/1000));return {days:Math.floor(s/86400),hours:Math.floor(s%86400/3600),minutes:Math.floor(s%3600/60),seconds:s%60};}

/** dd/mm hoặc dd–dd/mm theo giờ Việt Nam. */
export function examDayLabel(x:ExamDate){const d=(iso:string)=>new Date(Date.parse(iso)+7*3600e3);const a=d(x.start),b=d(x.end),p=(n:number)=>String(n).padStart(2,'0');const y=a.getUTCFullYear();return a.getUTCMonth()===b.getUTCMonth()&&a.getUTCDate()!==b.getUTCDate()?`${p(a.getUTCDate())}–${p(b.getUTCDate())}/${p(a.getUTCMonth()+1)}/${y}`:`${p(a.getUTCDate())}/${p(a.getUTCMonth()+1)}/${y}`;}
