/** Trang /de-giua-ky-1 (Quyết định số 8): đề ôn giữa kỳ I Toán 10, 11, 12 của MTM, chấm theo cấu trúc đề kiểm tra mới.
 * Nội dung đề nằm ở ./de-giua-ky (sinh bằng scripts/convert-de-giua-ky.mjs); tệp này chỉ có cấu hình và phép tính thuần. */
export const GK1_PATH='/de-giua-ky-1';
export const GK1_GRADES=[10,11,12] as const;
export type Gk1Grade=typeof GK1_GRADES[number];
export type Gk1Paper={grade:Gk1Grade;examId:string;scope:string;tone:'sky'|'coral'|'mint'};
export const GK1_PAPERS:Readonly<Record<Gk1Grade,Gk1Paper>>={
 10:{grade:10,examId:'mtm-gk1-toan-10-01',scope:'Mệnh đề và tập hợp · Bất phương trình bậc nhất hai ẩn · Hệ thức lượng trong tam giác',tone:'sky'},
 11:{grade:11,examId:'mtm-gk1-toan-11-01',scope:'Hàm số lượng giác, phương trình lượng giác · Dãy số, cấp số cộng, cấp số nhân',tone:'coral'},
 12:{grade:12,examId:'mtm-gk1-toan-12-01',scope:'Ứng dụng đạo hàm, khảo sát hàm số · Vectơ trong không gian',tone:'mint'},
};
/** Mã đề mỗi lớp (01 mở 19/10; 02, 03 thêm 20/10). Đề mã 01 giữ đường dẫn cũ ?lop=1x; mã khác thêm &de=0y. */
export const GK1_MA=['01','02','03'] as const;
export type Gk1Ma=typeof GK1_MA[number];
export const gk1Paper=(grade:Gk1Grade,ma:Gk1Ma):Gk1Paper=>({...GK1_PAPERS[grade],examId:`mtm-gk1-toan-${grade}-${ma}`});
export function parseGk1Ma(search:string):Gk1Ma{const raw=new URLSearchParams(search).get('de');return (GK1_MA as readonly string[]).includes(raw??'')?raw as Gk1Ma:'01';}
export type Gk1Topic={chuDe:string;mucDo:'NB'|'TH'|'VD'|'VDC'};
/** ?lop=10|11|12 (deep link từ bài đăng, Zalo); giá trị khác trả null để trang hiện phần chọn lớp. */
export function parseGk1Grade(search:string):Gk1Grade|null{const raw=new URLSearchParams(search).get('lop');return raw==='10'||raw==='11'||raw==='12'?Number(raw) as Gk1Grade:null;}
export const gk1Url=(grade:Gk1Grade,ma:Gk1Ma='01')=>GK1_PATH+'?lop='+grade+(ma==='01'?'':'&de='+ma);
/** Điểm thang 10 từ phần nghìn: 7350 -> "7,35". */
export const formatGk1Score=(millipoints:number)=>(Math.round(millipoints)/1000).toLocaleString('vi-VN',{maximumFractionDigits:3});
/** "Chỗ cần vá": chủ đề của các câu chưa đủ điểm, ưu tiên câu mức Vận dụng / Vận dụng cao, rồi câu mất nhiều điểm hơn,
 * rồi thứ tự trong đề; mỗi chủ đề một lần, tối đa `limit` mục. Cùng quy tắc bot Zalo dùng khi chấm bài gửi qua tin nhắn. */
export function gk1Gaps(rows:readonly {id:string;earnedMillipoints:number|null;maxMillipoints:number}[],topics:Readonly<Record<string,Gk1Topic>>,limit=3):Gk1Topic[]{
 const missed=rows.map((r,index)=>({r,index,topic:topics[r.id],lost:r.maxMillipoints-(r.earnedMillipoints??0)})).filter(x=>x.topic&&x.lost>0);
 const hard=(t:Gk1Topic)=>t.mucDo==='VD'||t.mucDo==='VDC'?0:1;
 missed.sort((a,b)=>hard(a.topic)-hard(b.topic)||b.lost-a.lost||a.index-b.index);
 const out:Gk1Topic[]=[];for(const m of missed){if(out.length>=limit)break;if(!out.some(t=>t.chuDe===m.topic.chuDe))out.push(m.topic);}
 return out;
}
/** Ghi chú điền sẵn vào form đăng ký (requestRegistration): lớp, điểm, các chỗ cần vá. Tối đa 300 ký tự như form yêu cầu. */
export function gk1Interest(grade:Gk1Grade,scoreText:string,gaps:readonly Gk1Topic[]){
 const base=`Đề giữa kỳ I Toán ${grade} trên web: ${scoreText}/10`;
 const full=gaps.length?base+'. Cần vá: '+gaps.map(g=>g.chuDe).join('; '):base;
 return full.length<=300?full:full.slice(0,299)+'…';
}
