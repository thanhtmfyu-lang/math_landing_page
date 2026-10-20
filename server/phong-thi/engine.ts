/** Phòng thi thử THPT Quốc gia (/phong-thi-thu): phần lõi thuần dùng chung cho /api/phong-thi và test.
 * Kho đề (đề + đáp án + lời giải) chỉ nằm trong server/phong-thi/kho-de.bin đã mã hóa; ở đây không đọc tệp, không gọi mạng.
 * Đề gửi cho trình duyệt đã bỏ đáp án và lời giải; lời giải theo mã câu chỉ trả về sau khi máy chủ chấm bài nộp. */
export const PT_LOAI=['thpt','hsa','tsa'] as const;
export type PtLoai=typeof PT_LOAI[number];
export const PT_LOAI_TEN:Record<PtLoai,string>={thpt:'Tốt nghiệp THPT',hsa:'HSA · ĐGNL ĐHQGHN',tsa:'TSA · ĐGTD Bách khoa'};
export const PT_NHOM=['de-that','minh-hoa','mtm','so','truong','toanmath'] as const;
export type PtNhom=typeof PT_NHOM[number];
export const PT_NHOM_TEN:Record<PtNhom,string>={'de-that':'Đề thi thật','minh-hoa':'Đề minh họa chính thức',mtm:'Đề MTM biên soạn',so:'Đề thi thử Sở GD&ĐT',truong:'Đề thi thử các trường',toanmath:'Đề tuyển chọn'};
/** cong-khai: ai cũng làm được (kéo khách mới); tra-phi: học sinh MTM và người có gói; hoc-sinh-mtm: chỉ học sinh trung tâm (đề sở, trường, đề tuyển chọn không bán). */
export const PT_TANG=['cong-khai','tra-phi','hoc-sinh-mtm'] as const;
export type PtTang=typeof PT_TANG[number];
export type PtKieu='mc'|'ds'|'ngan'|'nhieu'|'keo-tha';
/** 4 mạch kiến thức phần Toán HSA (QĐ 01/QĐ-ĐTSKT 2026): gắn ở câu bằng nhãn mach để báo cáo gom theo mạch. */
export const PT_MACH=['so-dai-so','hinh-hoc','do-luong','thong-ke-xac-suat'] as const;
export type PtMach=typeof PT_MACH[number];
export const PT_MACH_TEN:Record<PtMach,string>={'so-dai-so':'Số và Đại số','hinh-hoc':'Hình học','do-luong':'Đo lường','thong-ke-xac-suat':'Thống kê, xác suất'};
/** Nhãn dang, nguon, tangBanQuyen, vanTay chỉ để ghép Ngân hàng câu hỏi: máy chủ giữ, không bao giờ gửi trình duyệt. */
export type PtCau={ma:string;phan:string;kieu:PtKieu;de:string;luaChon?:string[];y?:string[];o?:string[];the?:string[];
 dapAn:string|boolean[]|string[]|number[];chapNhan?:string[];loiGiai?:string;chuDe?:string;muc?:number;mach?:PtMach;hinh?:string|null;diem?:number;
 dang?:string;nguon?:{ten:string;url?:string};tangBanQuyen?:'ban-duoc'|'noi-bo';vanTay?:string};
export type PtPhan={ma:string;ten:string;kieu:PtKieu;thoiGian?:number};
export type PtDe={id:string;loai:PtLoai;tieuDe:string;nam:number;nhom:PtNhom;tang:PtTang;thoiGian:number;nguon:{ten:string;url?:string;ghiChu?:string};
 phan:PtPhan[];cau:PtCau[];kiemTra:{ketQua:string;cach?:string;ngay?:string};thangDiem?:number;moTa?:string;stt?:number;
 /** Chùm câu dùng chung một dẫn (bảng số liệu, đoạn đọc): hiện dẫn trước câu đầu của chùm. */
 chum?:PtChum[]};
export type PtChum={ma:string;de:string;cau:string[];hinh?:string|null};
export type PtKho={version:1;dongGoi:string;de:PtDe[]};

/** Thang điểm hiển thị theo kỳ thi; THPT tổng 10, HSA phần Toán 50 câu × 1 điểm, TSA phần Tư duy Toán học thang 40 (mặc định, đề có thể đặt thangDiem). */
const THANG:Record<PtLoai,number>={thpt:10,hsa:50,tsa:40};
/** Điểm tối đa từng câu (phần nghìn điểm). THPT theo quy chế 2025: Phần I 0,25; Phần II 1 (chấm theo số ý đúng); Phần III 0,5. */
export function maxMilli(de:PtDe,c:PtCau){
 if(de.loai==='thpt'){if(c.kieu==='mc')return 250;if(c.kieu==='ds')return 1000;if(c.kieu==='ngan')return 500;}
 return Math.round((c.diem??1)*1000);
}
/** Phần II THPT: đúng 1 ý 0,1; 2 ý 0,25; 3 ý 0,5; 4 ý 1 điểm. Đề khác (TSA đúng sai) mặc định cùng bậc này theo tỉ lệ điểm câu. */
const DS_BAC=[0,100,250,500,1000];

const okId=(v:unknown)=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{2,79}$/.test(v);
const okMa=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(v);
const str=(v:unknown,min=1,max=20000)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
/** Kiểm một đề trước khi đóng gói: sai cấu trúc thì trả danh sách lỗi tiếng Việt, đóng gói dừng. */
export function validateDe(input:unknown):string[]{
 const e:string[]=[],d=input as PtDe;
 if(!d||typeof d!=='object')return ['Đề không hợp lệ'];
 const at=(okId(d.id)?d.id:'?')+': ';
 if(!okId(d.id))e.push(at+'id chỉ gồm a-z, 0-9, dấu gạch (3–80 ký tự)');
 if(!(PT_LOAI as readonly string[]).includes(d.loai))e.push(at+'loai phải là thpt, hsa hoặc tsa');
 if(!(PT_NHOM as readonly string[]).includes(d.nhom))e.push(at+'nhom không hợp lệ');
 if(!(PT_TANG as readonly string[]).includes(d.tang))e.push(at+'tang không hợp lệ');
 // Bản quyền: đề sở, trường, tuyển chọn chỉ dành cho học sinh trung tâm, không đưa vào tầng bán hay công khai.
 if(['so','truong','toanmath'].includes(d.nhom)&&d.tang!=='hoc-sinh-mtm')e.push(at+'đề '+d.nhom+' chỉ được đặt tầng hoc-sinh-mtm (tái tạo theo Chuẩn T rồi mới bán)');
 // Đề tham khảo HSA (ĐHQGHN), TSA (ĐHBK) có bản quyền của trường: chỉ dùng miễn phí, không đưa vào gói bán.
 if(d.nhom==='minh-hoa'&&d.loai!=='thpt'&&d.tang==='tra-phi')e.push(at+'đề tham khảo HSA/TSA chỉ đặt cong-khai hoặc hoc-sinh-mtm (chưa có phép bán)');
 if(!str(d.tieuDe,5,160))e.push(at+'tieuDe 5–160 ký tự');
 if(!Number.isSafeInteger(d.nam)||d.nam<2017||d.nam>2035)e.push(at+'nam không hợp lệ');
 if(!Number.isSafeInteger(d.thoiGian)||d.thoiGian<5||d.thoiGian>240)e.push(at+'thoiGian 5–240 phút');
 if(!d.nguon||!str(d.nguon.ten,3,300))e.push(at+'thiếu nguon.ten');
 if(!d.kiemTra||d.kiemTra.ketQua!=='dat')e.push(at+'đáp án chưa kiểm đạt (kiemTra.ketQua phải là "dat")');
 if(!Array.isArray(d.phan)||!d.phan.length)e.push(at+'thiếu phan');
 if(!Array.isArray(d.cau)||!d.cau.length||d.cau.length>200){e.push(at+'cần 1–200 câu');return e;}
 const phan=new Set((d.phan??[]).map(p=>p.ma)),ma=new Set<string>();
 d.cau.forEach((c,i)=>{
  const q=at+'câu '+(i+1)+' ('+(c?.ma??'?')+'): ';
  if(!c||typeof c!=='object'){e.push(q+'không hợp lệ');return;}
  if(!okMa(c.ma))e.push(q+'mã câu không hợp lệ');else if(ma.has(c.ma))e.push(q+'trùng mã');else ma.add(c.ma);
  if(!phan.has(c.phan))e.push(q+'phan không có trong danh sách phần');
  if(!str(c.de))e.push(q+'thiếu đề');
  if(c.hinh!=null&&!(typeof c.hinh==='string'&&(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(c.hinh)||/^<svg[\s>]/.test(c.hinh.trim()))&&c.hinh.length<=400000))e.push(q+'hinh phải là data URI ảnh hoặc SVG ≤ 400 KB');
  if(c.diem!==undefined&&!(typeof c.diem==='number'&&c.diem>0&&c.diem<=10))e.push(q+'diem 0–10');
  if(c.muc!==undefined&&!(Number.isSafeInteger(c.muc)&&c.muc>=1&&c.muc<=5))e.push(q+'muc là số nguyên 1–5');
  if(c.mach!==undefined&&!(PT_MACH as readonly unknown[]).includes(c.mach))e.push(q+'mach phải là '+PT_MACH.join(', '));
  if(c.tangBanQuyen!==undefined&&c.tangBanQuyen!=='ban-duoc'&&c.tangBanQuyen!=='noi-bo')e.push(q+'tangBanQuyen là ban-duoc hoặc noi-bo');
  // Câu tài liệu nội bộ (đề sở, trường, sách mua) kéo cả đề về tầng học sinh MTM.
  if(c.tangBanQuyen==='noi-bo'&&d.tang!=='hoc-sinh-mtm')e.push(q+'câu tangBanQuyen noi-bo nên cả đề phải để tầng hoc-sinh-mtm');
  if(c.kieu==='mc'){
   if(!Array.isArray(c.luaChon)||c.luaChon.length<2||c.luaChon.length>6||!c.luaChon.every(x=>str(x,1,4000)))e.push(q+'luaChon cần 2–6 phương án');
   else if(typeof c.dapAn!=='string'||!/^[A-F]$/.test(c.dapAn)||'ABCDEF'.indexOf(c.dapAn)>=c.luaChon.length)e.push(q+'dapAn phải là một chữ cái trong số phương án');
  }else if(c.kieu==='ds'){
   if(!Array.isArray(c.y)||c.y.length!==4||!c.y.every(x=>str(x,1,4000)))e.push(q+'cần đúng 4 ý');
   if(!Array.isArray(c.dapAn)||c.dapAn.length!==4||!c.dapAn.every(x=>typeof x==='boolean'))e.push(q+'dapAn cần 4 giá trị true/false');
  }else if(c.kieu==='ngan'){
   if(typeof c.dapAn!=='string'||!normShort(c.dapAn))e.push(q+'dapAn trả lời ngắn phải là số');
   if(c.chapNhan!==undefined&&(!Array.isArray(c.chapNhan)||!c.chapNhan.every(x=>typeof x==='string'&&normShort(x))))e.push(q+'chapNhan phải là danh sách số');
  }else if(c.kieu==='nhieu'){
   if(!Array.isArray(c.luaChon)||c.luaChon.length<2||c.luaChon.length>6)e.push(q+'luaChon cần 2–6 phương án');
   else if(!Array.isArray(c.dapAn)||!c.dapAn.length||!c.dapAn.every(x=>typeof x==='string'&&/^[A-F]$/.test(x)&&'ABCDEF'.indexOf(x)<c.luaChon!.length))e.push(q+'dapAn chọn nhiều phải là mảng chữ cái');
  }else if(c.kieu==='keo-tha'){
   if(!Array.isArray(c.o)||!c.o.length||!Array.isArray(c.the)||c.the.length<2)e.push(q+'kéo thả cần o (chỗ trống) và the (thẻ)');
   else if(!Array.isArray(c.dapAn)||c.dapAn.length!==c.o.length||!c.dapAn.every(x=>Number.isSafeInteger(x)&&(x as number)>=0&&(x as number)<c.the!.length))e.push(q+'dapAn kéo thả là chỉ số thẻ cho từng chỗ trống');
  }else e.push(q+'kieu phải là mc, ds, ngan, nhieu hoặc keo-tha');
 });
 if(d.chum!==undefined){
  if(!Array.isArray(d.chum))e.push(at+'chum phải là danh sách');
  else d.chum.forEach((g,i)=>{if(!g||!okMa(g.ma)||!str(g.de)||!Array.isArray(g.cau)||!g.cau.length||!g.cau.every(m=>ma.has(m)))e.push(at+'chùm '+(i+1)+' cần ma, de và danh sách mã câu có trong đề');});
 }
 return e;
}

/** Chuẩn hóa đáp số trả lời ngắn: dấu thập phân "," hoặc "."; bỏ dấu +, số 0 thừa; "-0" thành "0". Không phải số thì trả ''. */
export function normShort(raw:unknown):string{
 if(typeof raw!=='string'&&typeof raw!=='number')return '';
 let s=String(raw).trim().replace(/\s+/g,'').replace(/\./g,',');
 const ps=/^([+-]?)(\d{1,15})\/(\d{1,15})$/.exec(s);// HSA: phân số a/b, rút gọn về dạng tối giản
 if(ps){let n=BigInt(ps[2]),d=BigInt(ps[3]);if(d===0n)return '';let a=n,b=d;while(b){[a,b]=[b,a%b];}if(a>1n){n/=a;d/=a;}const neg=ps[1]==='-'&&n!==0n;return (neg?'-':'')+n+(d===1n?'':'/'+d);}
 if(!/^[+-]?(?:\d+(?:,\d*)?|,\d+)$/.test(s))return '';
 let neg=s.startsWith('-');s=s.replace(/^[+-]/,'');
 let [i,f='']=s.split(',');i=i.replace(/^0+(?=\d)/,'')||'0';f=f.replace(/0+$/,'');
 const out=i+(f?','+f:'');if(out==='0')neg=false;
 return (neg?'-':'')+out;
}

/** Giá trị đúng của đáp số đã chuẩn hóa (phân số tối giản n/d) để 1,25 và 5/4 cùng một giá trị. */
export function giaTriShort(v:string):string{
 if(!v||v.includes("/"))return v;
 const neg=v.startsWith('-'),[i,f='']=v.replace('-','').split(',');let n=BigInt(i+f),d=10n**BigInt(f.length);let a=n,b=d;while(b){[a,b]=[b,a%b];}if(a>1n){n/=a;d/=a;}
 return (neg&&n!==0n?'-':'')+n+(d===1n?'':'/'+d);
}

export type PtTraLoi=Record<string,unknown>;
/** Câu gửi trình duyệt: không đáp án, không lời giải, không chapNhan. */
export type PtCauCongKhai={so:number;ma:string;phan:string;kieu:PtKieu;de:string;luaChon?:string[];y?:string[];o?:string[];the?:string[];hinh?:string|null;diem:number};
export type PtDeCongKhai={id:string;loai:PtLoai;tieuDe:string;nam:number;nhom:PtNhom;tang:PtTang;thoiGian:number;nguon:string;thangDiem:number;phan:(PtPhan&{soCau:number})[];cau:PtCauCongKhai[];chum:PtChum[]};
export function thangDiem(de:PtDe){return de.thangDiem??THANG[de.loai];}
export function deCongKhai(de:PtDe):PtDeCongKhai{
 const tong=de.cau.reduce((s,c)=>s+maxMilli(de,c),0),k=thangDiem(de)/tong;
 return {id:de.id,loai:de.loai,tieuDe:tenDe(de),nam:de.nam,nhom:de.nhom,tang:de.tang,thoiGian:de.thoiGian,nguon:de.nguon.ten,thangDiem:thangDiem(de),
  phan:de.phan.map(p=>({ma:p.ma,ten:p.ten,kieu:p.kieu,...(p.thoiGian?{thoiGian:p.thoiGian}:{}),soCau:de.cau.filter(c=>c.phan===p.ma).length})),
  cau:de.cau.map((c,i)=>({so:i+1,ma:c.ma,phan:c.phan,kieu:c.kieu,de:c.de,...(c.luaChon?{luaChon:c.luaChon}:{}),...(c.y?{y:c.y}:{}),...(c.o?{o:c.o}:{}),...(c.the?{the:c.the}:{}),hinh:c.hinh??null,
   diem:Math.round(maxMilli(de,c)*k*1000)/1000})),chum:(de.chum??[]).map(g=>({ma:g.ma,de:g.de,cau:g.cau,hinh:g.hinh??null}))};
}

export type PtMucCau={so:number;ma:string;phan:string;kieu:PtKieu;dung:boolean;daLam:boolean;diem:number;toiDa:number;traLoi:unknown;dapAn:unknown;loiGiai:string;chuDe?:string;muc?:number;mach?:PtMach;yDung?:number;giay?:number};
export type PtKetQua={de:string;tieuDe:string;loai:PtLoai;diem:number;thangDiem:number;dung:number;tong:number;
 theoPhan:{ma:string;ten:string;diem:number;toiDa:number;dung:number;tong:number}[];theoChuDe:{chuDe:string;dung:number;tong:number}[];cau:PtMucCau[]};
const LETTERS='ABCDEF';
/** Chấm một bài. Trả lời lạ (sai kiểu) coi như bỏ trống, không ném lỗi. Điểm làm tròn đến 0,01 theo thang của đề. */
export function cham(de:PtDe,traLoi:PtTraLoi):PtKetQua{
 const tong=de.cau.reduce((s,c)=>s+maxMilli(de,c),0),thang=thangDiem(de),k=thang/tong;
 const cau:PtMucCau[]=de.cau.map((c,i)=>{
  const max=maxMilli(de,c),a=traLoi?.[c.ma];let milli=0,daLam=false,yDung:number|undefined,traLoiSach:unknown=null;
  if(c.kieu==='mc'){const v=typeof a==='string'&&/^[A-F]$/.test(a)?a:Number.isSafeInteger(a)&&(a as number)>=0&&(a as number)<6?LETTERS[a as number]:null;
   if(v){daLam=true;traLoiSach=v;if(v===c.dapAn)milli=max;}}
  else if(c.kieu==='ds'){const arr=Array.isArray(a)?a.slice(0,4):[];const v=[0,1,2,3].map(j=>typeof arr[j]==='boolean'?arr[j] as boolean:null);
   daLam=v.some(x=>x!==null);traLoiSach=v;yDung=v.filter((x,j)=>x!==null&&x===(c.dapAn as boolean[])[j]).length;milli=Math.round(DS_BAC[yDung]*max/1000);}
  else if(c.kieu==='ngan'){const v=normShort(a as string);if(v){daLam=true;traLoiSach=v;const ok=[c.dapAn as string,...(c.chapNhan??[])].map(normShort).map(giaTriShort);if(ok.includes(giaTriShort(v)))milli=max;}}
  else if(c.kieu==='nhieu'){const v=Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string'&&/^[A-F]$/.test(x)))].sort():[];
   if(v.length){daLam=true;traLoiSach=v;if(v.join()===[...(c.dapAn as string[])].sort().join())milli=max;}}
  else if(c.kieu==='keo-tha'){const n=c.o?.length??0,arr=Array.isArray(a)?a.slice(0,n):[];const v=Array.from({length:n},(_,j)=>Number.isSafeInteger(arr[j])?arr[j] as number:null);
   daLam=v.some(x=>x!==null);traLoiSach=v;if(v.every((x,j)=>x===(c.dapAn as number[])[j]))milli=max;}
  return {so:i+1,ma:c.ma,phan:c.phan,kieu:c.kieu,dung:milli===max,daLam,diem:Math.round(milli*k*1000)/1000,toiDa:Math.round(max*k*1000)/1000,traLoi:traLoiSach,dapAn:c.dapAn,loiGiai:c.loiGiai??'',
   ...(c.chuDe?{chuDe:c.chuDe}:{}),...(c.muc?{muc:c.muc}:{}),...(c.mach?{mach:c.mach}:{}),...(yDung!==undefined?{yDung}:{})};
 });
 const r2=(x:number)=>Math.round(x*100)/100;
 const diemTho=cau.reduce((s,c)=>s+c.diem,0);
 const theoPhan=de.phan.map(p=>{const cs=cau.filter(c=>c.phan===p.ma);return {ma:p.ma,ten:p.ten,diem:r2(cs.reduce((s,c)=>s+c.diem,0)),toiDa:r2(cs.reduce((s,c)=>s+c.toiDa,0)),dung:cs.filter(c=>c.dung).length,tong:cs.length};});
 const chuDe=new Map<string,{dung:number;tong:number}>();
 for(const c of cau){if(!c.chuDe)continue;const o=chuDe.get(c.chuDe)??{dung:0,tong:0};o.tong++;if(c.dung)o.dung++;chuDe.set(c.chuDe,o);}
 return {de:de.id,tieuDe:tenDe(de),loai:de.loai,diem:r2(diemTho),thangDiem:thang,dung:cau.filter(c=>c.dung).length,tong:cau.length,theoPhan,
  theoChuDe:[...chuDe].map(([k2,v])=>({chuDe:k2,...v})).sort((a,b)=>a.dung/a.tong-b.dung/b.tong),cau};
}

/** Một dòng danh mục: thông tin công khai của đề, không có nội dung câu. */
export type PtMucLuc={id:string;loai:PtLoai;tieuDe:string;stt?:number;nam:number;nhom:PtNhom;tang:PtTang;thoiGian:number;soCau:number;nguon:string;moTa?:string};
/** Số thứ tự cố định trong từng loại kỳ thi (stt trong tệp đề) để học sinh biết mình làm đề nào: "Đề 3 · ...". */
export const tenDe=(d:{tieuDe:string;stt?:number})=>d.stt?`Đề ${d.stt} · ${d.tieuDe}`:d.tieuDe;
export function mucLuc(kho:PtKho):PtMucLuc[]{
 const thuTu:Record<PtNhom,number>={'de-that':0,'minh-hoa':1,mtm:2,so:3,truong:4,toanmath:5};
 return kho.de.map(d=>({id:d.id,loai:d.loai,tieuDe:tenDe(d),nam:d.nam,nhom:d.nhom,tang:d.tang,thoiGian:d.thoiGian,soCau:d.cau.length,nguon:d.nguon.ten,...(d.stt?{stt:d.stt}:{}),...(d.moTa?{moTa:d.moTa}:{})}))
  .sort((a,b)=>PT_LOAI.indexOf(a.loai)-PT_LOAI.indexOf(b.loai)||(a.stt??1e9)-(b.stt??1e9)||b.nam-a.nam||thuTu[a.nhom]-thuTu[b.nhom]||a.tieuDe.localeCompare(b.tieuDe,'vi'));
}

/** Người đang xem: học sinh trung tâm (phiên BTVN hợp lệ), khách có tài khoản phòng thi (kèm các loại đề đã mua), hoặc khách vãng lai. */
export type PtNguoiXem={kieu:'hoc-sinh';id:string|null;ten:string|null}|{kieu:'tai-khoan';id:string;ten:string;goi:{loai:PtLoai[];den:string}[]}|{kieu:'khach'};
/** Quyền mở một đề. Trả lý do để trang hiển thị đúng nút (đăng nhập, mua gói). */
export function quyenMo(de:{tang:PtTang;loai:PtLoai},ai:PtNguoiXem,nay=Date.now()):{mo:true}|{mo:false;lyDo:'hoc-sinh-mtm'|'can-goi'}{
 if(ai.kieu==='hoc-sinh'||de.tang==='cong-khai')return {mo:true};
 if(de.tang==='hoc-sinh-mtm')return {mo:false,lyDo:'hoc-sinh-mtm'};
 if(ai.kieu==='tai-khoan'&&ai.goi.some(g=>g.loai.includes(de.loai)&&Date.parse(g.den)>nay))return {mo:true};
 return {mo:false,lyDo:'can-goi'};
}
/** Tên hiển thị của mã chủ đề trong kho đề; mã lạ hiển thị nguyên văn. */
export const CHU_DE_TEN:Record<string,string>={'ham-so':'Hàm số và đồ thị','dao-ham':'Đạo hàm','nguyen-ham':'Nguyên hàm','tich-phan':'Tích phân và ứng dụng','hinh-khong-gian':'Hình học không gian',
 'toa-do-oxyz':'Tọa độ Oxyz','vecto':'Vectơ','xac-suat':'Xác suất','to-hop':'Tổ hợp','thong-ke':'Thống kê','luong-giac':'Lượng giác','cap-so':'Dãy số, cấp số','mu-log':'Mũ và logarit',
 'thuc-te':'Toán thực tế','gioi-han':'Giới hạn','hinh-phang':'Hình học phẳng','so-phuc':'Số phức','logic':'Logic, suy luận','xu-ly-so-lieu':'Xử lý số liệu'};
export const tenChuDe=(ma:string)=>CHU_DE_TEN[ma]??ma;

/** Thời gian từng câu do trình duyệt đo ({mã câu: số giây}). Hợp lệ khi: mã có trong đề, số nguyên ≥ 0, tổng không vượt gioiHan (giây).
 * Sai thì trả null (bài vẫn chấm, chỉ bỏ số liệu thời gian). Câu không có trong dữ liệu tính 0 giây. */
export function thoiGianCau(de:PtDe,raw:unknown,gioiHan:number):Record<string,number>|null{
 if(raw===undefined||raw===null||typeof raw!=='object'||Array.isArray(raw))return null;
 const ma=new Set(de.cau.map(c=>c.ma)),out:Record<string,number>={};let tong=0;
 for(const [k,v] of Object.entries(raw as Record<string,unknown>)){if(!ma.has(k)||!Number.isSafeInteger(v)||(v as number)<0)return null;out[k]=v as number;tong+=v as number;}
 return tong<=gioiHan?out:null;
}

/** Phổ điểm toàn bài HSA 2026 (thang 150, 116.839 bài), PDF phổ điểm ĐHQGHN: tỉ lệ thí sinh đạt từ mức điểm trở lên.
 * 105: 5,18%; 100: 10,11%; 90: 26,19%; 80: 48,77%; 75: 61,07%; cao nhất 133. Mốc 113 ≈ 1% theo lịch chương trình MTM;
 * mốc 60 và 45 suy từ phân phối chuẩn (trung bình 79,39, độ lệch chuẩn 15,0). ĐHQGHN chưa công bố phổ điểm riêng phần Toán. */
export const HSA_PHO_2026:[number,number][]=[[150,0],[133,0.001],[113,1],[105,5.18],[100,10.11],[90,26.19],[80,48.77],[75,61.07],[60,90],[45,99],[0,100]];
/** Phân vị ước lượng cho điểm phần Toán HSA (thang 50): quy đổi ×3 sang thang 150 rồi nội suy tuyến tính trên phổ toàn bài.
 * Trả {quyDoi, top: % thí sinh có điểm từ mức này trở lên, ướcLuong: luôn true}. Chỉ là tham chiếu. */
export function phanViHsa(diemToan:number,thang=50){
 const x=Math.max(0,Math.min(150,diemToan*150/thang));let top=100;
 for(let i=0;i<HSA_PHO_2026.length-1;i++){const [a,pa]=HSA_PHO_2026[i],[b,pb]=HSA_PHO_2026[i+1];if(x<=a&&x>=b){top=a===b?pa:pb+(pa-pb)*(x-b)/(a-b);break;}}
 return {quyDoi:Math.round(x*10)/10,top:Math.round(top*100)/100,uocLuong:true as const};
}

/** Báo cáo 1 trang sau khi nộp: gom theo 4 mạch (khi đề có nhãn mach) hoặc theo chủ đề, câu tốn thời gian, câu sai cần xem lại, phân vị HSA. */
export type PtBaoCao={theo:'mach'|'chu-de';nhom:{ma:string;ten:string;dung:number;tong:number;diem:number;toiDa:number;giay:number}[];
 lauNhat:{so:number;ma:string;giay:number;dung:boolean}[];canXem:{so:number;ma:string;chuDe?:string;muc?:number;daLam:boolean;giay?:number}[];
 tongGiay:number;coThoiGian:boolean;phanVi:ReturnType<typeof phanViHsa>|null};
export function baoCao(k:PtKetQua,soLauNhat=5):PtBaoCao{
 const coMach=k.cau.some(c=>c.mach),coThoiGian=k.cau.some(c=>(c.giay??0)>0);
 const m=new Map<string,PtBaoCao['nhom'][number]>();
 for(const c of k.cau){
  const ma=coMach?(c.mach??'khac'):(c.chuDe??'khac'),ten=ma==='khac'?'Chưa gắn nhãn':coMach?PT_MACH_TEN[ma as PtMach]:tenChuDe(ma);
  const o=m.get(ma)??{ma,ten,dung:0,tong:0,diem:0,toiDa:0,giay:0};o.tong++;if(c.dung)o.dung++;o.diem+=c.diem;o.toiDa+=c.toiDa;o.giay+=c.giay??0;m.set(ma,o);
 }
 const r2=(x:number)=>Math.round(x*100)/100,thuTu=coMach?(x:{ma:string})=>(PT_MACH as readonly string[]).indexOf(x.ma)+(x.ma==='khac'?99:0):null;
 const nhom=[...m.values()].map(o=>({...o,diem:r2(o.diem),toiDa:r2(o.toiDa)})).sort(thuTu?(a,b)=>thuTu(a)-thuTu(b):(a,b)=>a.dung/a.tong-b.dung/b.tong||b.tong-a.tong);
 const lauNhat=coThoiGian?[...k.cau].filter(c=>(c.giay??0)>0).sort((a,b)=>(b.giay??0)-(a.giay??0)||a.so-b.so).slice(0,soLauNhat).map(c=>({so:c.so,ma:c.ma,giay:c.giay??0,dung:c.dung})):[];
 const canXem=k.cau.filter(c=>!c.dung).map(c=>({so:c.so,ma:c.ma,...(c.chuDe?{chuDe:c.chuDe}:{}),...(c.muc?{muc:c.muc}:{}),daLam:c.daLam,...(c.giay!==undefined?{giay:c.giay}:{})}));
 return {theo:coMach?'mach':'chu-de',nhom,lauNhat,canXem,tongGiay:k.cau.reduce((s,c)=>s+(c.giay??0),0),coThoiGian,phanVi:k.loai==='hsa'?phanViHsa(k.diem,k.thangDiem):null};
}

/** Đợt thi có giờ mở: khai báo ở server/phong-thi/dot.json (chỉ mã đề và giờ). de null = chưa công bố đề; "chua-gan" = ẩn hẳn. */
export const PT_KHOI=['10','11','12'] as const;
export type PtKhoi=typeof PT_KHOI[number];
/** Đợt khảo sát theo khối (có khoi): thí sinh đăng ký lấy SBD dạng {sbd}-{khối}-{số thứ tự 4 chữ số}, đề lấy theo khối; de để null. */
export type PtDot={ma:string;ten:string;de:string|null;mo:string;dong:string;loai:PtLoai;moTa?:string;khoi?:Record<PtKhoi,string|null>;sbd?:string};
export type PtDotCongKhai={ma:string;ten:string;loai:PtLoai;mo:string;dong:string;moTa?:string;trangThai:'sap-mo'|'dang-mo';de:{id:string;tieuDe:string;thoiGian:number;soCau:number;tang:PtTang}|null;
 dangKy?:{khoi:Record<PtKhoi,boolean>};cuaEm?:{sbd:string;khoi:PtKhoi;ten:string}};
const okDotMa=(v:unknown)=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{2,59}$/.test(v);
/** Kiểm danh sách đợt (cũng chạy trong test): mã, giờ ISO có múi giờ, đóng sau mở, loại đúng. */
export function validateDot(ds:unknown):string[]{
 const e:string[]=[];if(!Array.isArray(ds))return ['dot phải là danh sách'];const ma=new Set<string>();
 ds.forEach((t:any,i)=>{const at='đợt '+(i+1)+' ('+(t?.ma??'?')+'): ';
  if(!t||!okDotMa(t.ma))e.push(at+'mã 3–60 ký tự a-z, 0-9, -');else if(ma.has(t.ma))e.push(at+'trùng mã');else ma.add(t.ma);
  if(!str(t?.ten,3,120))e.push(at+'thiếu tên');
  if(!(PT_LOAI as readonly unknown[]).includes(t?.loai))e.push(at+'loai không hợp lệ');
  if(t?.de!==null&&!okId(t?.de))e.push(at+'de là id đề, "chua-gan" hoặc null');
  if(t?.khoi!==undefined){if(t.de!==null)e.push(at+'đợt khảo sát theo khối để de null');
   if(!t.khoi||typeof t.khoi!=='object'||!PT_KHOI.every(k=>t.khoi[k]===null||okId(t.khoi[k]))||Object.keys(t.khoi).some(k=>!(PT_KHOI as readonly string[]).includes(k)))e.push(at+'khoi cần id đề hoặc null cho 10, 11, 12');
   if(typeof t.sbd!=='string'||!/^[A-Z][A-Z0-9]{1,7}$/.test(t.sbd))e.push(at+'sbd là tiền tố số báo danh, ví dụ KS26');}
  const iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(Z|[+-]\d\d:\d\d)$/;
  if(!iso.test(t?.mo??'')||!iso.test(t?.dong??'')||!(Date.parse(t.dong)>Date.parse(t.mo)))e.push(at+'mo, dong là giờ ISO có múi giờ, dong sau mo');
 });
 return e;
}
/** Đợt đang mở cho đề này lúc nay (để mở đề ở chế độ đợt). */
export function dotDangMo(ds:PtDot[],ma:unknown,deId:string,nay:number):PtDot|null{
 const t=ds.find(x=>x.ma===ma);return t&&t.de===deId&&Date.parse(t.mo)<=nay&&nay<Date.parse(t.dong)?t:null;
}
/** Thẻ "Đợt thi sắp tới / đang mở" ở sảnh: bỏ đợt đã đóng, đợt "chua-gan" và đợt gán đề không có trong kho. */
export function dotCongKhai(ds:PtDot[],kho:PtKho,nay:number):PtDotCongKhai[]{
 return ds.filter(t=>t.de!=='chua-gan'&&Date.parse(t.dong)>nay).flatMap(t=>{
  const d=t.de?kho.de.find(x=>x.id===t.de):null;if(t.de&&!d)return [];
  const coDe=(id:string|null)=>!!id&&kho.de.some(x=>x.id===id);
  return [{ma:t.ma,ten:t.ten,loai:t.loai,mo:t.mo,dong:t.dong,...(t.moTa?{moTa:t.moTa}:{}),trangThai:Date.parse(t.mo)<=nay?'dang-mo' as const:'sap-mo' as const,
   de:d?{id:d.id,tieuDe:tenDe(d),thoiGian:d.thoiGian,soCau:d.cau.length,tang:d.tang}:null,
   ...(t.khoi?{dangKy:{khoi:{'10':coDe(t.khoi['10']),'11':coDe(t.khoi['11']),'12':coDe(t.khoi['12'])}}}:{})}];
 }).sort((a,b)=>Date.parse(a.mo)-Date.parse(b.mo));
}

/** Báo lỗi đề: kiểm đề, mã câu có trong kho, nội dung 5–500 ký tự (bỏ ký tự điều khiển). */
export function kiemBaoLoi(body:Record<string,unknown>,kho:PtKho):{de:string;ma:string;noiDung:string}|string{
 const de=typeof body.de==='string'?kho.de.find(d=>d.id===body.de):undefined;if(!de)return 'Không tìm thấy đề này.';
 if(typeof body.ma!=='string'||!de.cau.some(c=>c.ma===body.ma))return 'Không tìm thấy câu này trong đề.';
 const nd=typeof body.noiDung==='string'?body.noiDung.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim():'';
 if(nd.length<5)return 'Em ghi rõ lỗi (ít nhất 5 ký tự).';if(nd.length>500)return 'Nội dung tối đa 500 ký tự.';
 return {de:de.id,ma:body.ma,noiDung:nd};
}

/** Tên rút gọn cho bảng xếp hạng kỳ khảo sát: "Nguyễn Văn An" thành "N. V. An" (giữ tên, viết tắt họ và đệm). */
export function tenRutGon(ten:string){const w=ten.trim().split(/\s+/).filter(Boolean);if(w.length<2)return w[0]??'';return w.slice(0,-1).map(x=>x[0].toUpperCase()+'.').join(' ')+' '+w[w.length-1];}
/** Đăng ký kỳ khảo sát: họ tên chữ cái 2–60, lớp 10/11/12, trường 2–120 (không đường dẫn), SĐT phụ huynh đã chuẩn hóa ở API. */
export function kiemDangKyDot(body:Record<string,unknown>):{ten:string;khoi:PtKhoi;truong:string}|string{
 const ten=typeof body.ten==='string'?body.ten.trim().replace(/\s+/g,' '):'',truong=typeof body.truong==='string'?body.truong.trim().replace(/\s+/g,' '):'',khoi=String(body.khoi??'');
 if(!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(ten)||!/\p{L}.*\s.*\p{L}/u.test(ten))return 'Em ghi đủ họ và tên (chỉ chữ cái).';
 if(!(PT_KHOI as readonly string[]).includes(khoi))return 'Em chọn lớp 10, 11 hoặc 12.';
 if(truong.length<2||truong.length>120||/https?:|www\.|[<>]/i.test(truong))return 'Tên trường 2–120 ký tự.';
 return {ten,khoi:khoi as PtKhoi,truong};
}
