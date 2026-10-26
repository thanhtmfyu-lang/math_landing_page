import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {baoCao,cham,deCongKhai,dotCongKhai,dotDangMo,kiemBaoLoi,kiemDangKyDot,mucLuc,normShort,tenDe,phanViHsa,quyenMo,tenRutGon,thoiGianCau,validateDe,validateDot,type PtDe,type PtDot,type PtKho} from '../server/phong-thi/engine';
import {DOT,docVe,dongGoi,kyVe,moGoi,phongThiKey,loadKho,xuLy} from '../server/phong-thi/handler';
import {createPhongThiApi,chuanSdt,bamMatKhau,dungMatKhau,ipBam,taoMaTraCuu} from '../server/phong-thi/api';

// Đề THPT giả đúng cấu trúc 2025: 12 trắc nghiệm, 4 đúng sai, 6 trả lời ngắn.
const thpt:PtDe={id:'thpt-mau-01',loai:'thpt',tieuDe:'Đề mẫu THPT kiểm thử',nam:2026,nhom:'mtm',tang:'tra-phi',thoiGian:90,nguon:{ten:'MTM kiểm thử'},
 phan:[{ma:'I',ten:'Phần I',kieu:'mc'},{ma:'II',ten:'Phần II',kieu:'ds'},{ma:'III',ten:'Phần III',kieu:'ngan'}],kiemTra:{ketQua:'dat'},
 cau:[...Array.from({length:12},(_,i)=>({ma:'I-'+(i+1),phan:'I',kieu:'mc' as const,de:'Câu $'+i+'$',luaChon:['$1$','$2$','$3$','$4$'],dapAn:'ABCD'[i%4],loiGiai:'Lời giải '+i,chuDe:i<6?'ham-so':'tich-phan'})),
  ...Array.from({length:4},(_,i)=>({ma:'II-'+(i+1),phan:'II',kieu:'ds' as const,de:'Cho ...',y:['a','b','c','d'],dapAn:[true,false,true,false],loiGiai:'...'})),
  ...Array.from({length:6},(_,i)=>({ma:'III-'+(i+1),phan:'III',kieu:'ngan' as const,de:'Tính',dapAn:['12,5','-3','0,25','7','100','1,2'][i],loiGiai:'...'}))]};
assert.deepEqual(validateDe(thpt),[]);

// Trả lời ngắn: dấu phẩy/chấm, số 0 thừa, dấu cộng, -0.
assert.equal(normShort('12.50'),'12,5');assert.equal(normShort(' +3,0 '),'3');assert.equal(normShort('-0'),'0');assert.equal(normShort(',25'),'0,25');
assert.equal(normShort('0012'),'12');assert.equal(normShort('1/2'),'1/2');assert.equal(normShort('10/4'),'5/2');assert.equal(normShort('4/2'),'2');assert.equal(normShort('-6/8'),'-3/4');assert.equal(normShort('1/0'),'');assert.equal(normShort('1/2/3'),'');assert.equal(normShort('abc'),'');assert.equal(normShort(''),'');

// Bài làm đúng hết = 10 điểm; bỏ trống = 0.
const full:Record<string,unknown>={};for(const c of thpt.cau)full[c.ma]=c.dapAn;
assert.equal(cham(thpt,full).diem,10);assert.equal(cham(thpt,{}).diem,0);
// Phần II theo số ý đúng: 1 ý 0,1; 2 ý 0,25; 3 ý 0,5; 4 ý 1. Ý bỏ trống là sai.
const ds=(a:unknown)=>cham(thpt,{'II-1':a}).diem;
assert.equal(ds([true,null,null,null]),0.1);assert.equal(ds([true,false,null,null]),0.25);assert.equal(ds([true,false,true,true]),0.5);assert.equal(ds([true,false,true,false]),1);assert.equal(ds([false,true,false,true]),0);
// Trắc nghiệm nhận chữ cái hoặc chỉ số; trả lời ngắn nhận "12.5".
const r=cham(thpt,{'I-1':'A','I-2':1,'III-1':'12.5','III-2':'-3,0','III-3':'abc'});
assert.equal(r.diem,0.25+0.25+0.5+0.5);assert.equal(r.theoPhan.find(p=>p.ma==='III')!.dung,2);
assert.equal(r.cau.find(c=>c.ma==='III-3')!.daLam,false);
// Quy chế HSA: đáp số phân số tối giản; chấm theo giá trị (5/4 = 10/8 = 1,25), khác giá trị thì sai.
const phanSo={...thpt,cau:thpt.cau.map(c=>c.ma==='III-1'?{...c,dapAn:'5/4'}:c)} as PtDe;
for(const v of ['5/4','10/8','1,25','1.25'])assert.equal(cham(phanSo,{'III-1':v}).theoPhan.find(p=>p.ma==='III')!.dung,1,v);
for(const v of ['4/5','1,3','5'])assert.equal(cham(phanSo,{'III-1':v}).theoPhan.find(p=>p.ma==='III')!.dung,0,v);
assert.deepEqual(validateDe(phanSo),[]);
// Kiểu lạ, câu không có trong đề: bỏ qua, không lỗi.
assert.equal(cham(thpt,{'I-1':{x:1},'khong-co':'A','II-2':'Đ'}).diem,0);

// Đề gửi trình duyệt không có đáp án, lời giải.
const pub=JSON.stringify(deCongKhai(thpt));assert.ok(!/dapAn|loiGiai|chapNhan|kiemTra/.test(pub),'đề công khai lộ đáp án');
assert.equal(deCongKhai(thpt).cau.length,22);assert.equal(deCongKhai(thpt).thangDiem,10);

// HSA: mỗi câu 1 điểm thang 50; TSA: chọn nhiều, kéo thả đúng hết mới có điểm.
const tsa:PtDe={...thpt,id:'tsa-mau',loai:'tsa',tang:'cong-khai',phan:[{ma:'T',ten:'Tư duy Toán học',kieu:'mc'}],
 cau:[{ma:'t1',phan:'T',kieu:'nhieu',de:'?',luaChon:['a','b','c','d'],dapAn:['A','C']},{ma:'t2',phan:'T',kieu:'keo-tha',de:'?',o:['x','y'],the:['1','2','3'],dapAn:[2,0]},{ma:'t3',phan:'T',kieu:'mc',de:'?',luaChon:['a','b'],dapAn:'B'},{ma:'t4',phan:'T',kieu:'ds',de:'?',y:['a','b','c','d'],dapAn:[true,true,true,true]}]};
assert.deepEqual(validateDe(tsa),[]);
assert.equal(cham(tsa,{t1:['C','A'],t2:[2,0],t3:'B',t4:[true,true,true,true]}).diem,40);
assert.equal(cham(tsa,{t1:['A'],t2:[2,1]}).diem,0);
// BCA: mỗi câu 1 điểm, thang 35 (đề 2 câu thì quy về 35).
const bca:PtDe={...thpt,id:'bca-mau',loai:'bca',tang:'hoc-sinh-mtm',phan:[{ma:'toan',ten:'Phần Toán',kieu:'mc'}],
 cau:[{ma:'b1',phan:'toan',kieu:'mc',de:'?',luaChon:['a','b','c','d'],dapAn:'C'},{ma:'b2',phan:'toan',kieu:'ngan',de:'?',dapAn:'7/4'}]};
assert.deepEqual(validateDe(bca),[]);assert.equal(deCongKhai(bca).thangDiem,35);
assert.equal(cham(bca,{b1:'C',b2:'7/4'}).diem,35);assert.equal(cham(bca,{b1:'C'}).diem,17.5);

// Bản quyền: đề sở/trường/tuyển chọn không được đặt tầng bán hay công khai; đề chưa kiểm đáp án bị chặn.
assert.ok(validateDe({...thpt,nhom:'so',tang:'tra-phi'}).some(e=>e.includes('hoc-sinh-mtm')));
assert.deepEqual(validateDe({...thpt,nhom:'truong',tang:'hoc-sinh-mtm'}),[]);
assert.ok(validateDe({...thpt,kiemTra:{ketQua:'chua'}}).some(e=>e.includes('kiểm')));
assert.ok(validateDe({...thpt,cau:[...thpt.cau,thpt.cau[0]]}).some(e=>e.includes('trùng')));
assert.ok(validateDe({...thpt,cau:[{...thpt.cau[0],dapAn:'E'}]}).length>0);
assert.ok(validateDe({...thpt,chum:[{ma:'g1',de:'Dùng chung',cau:['khong-co']}]}).length>0);

// Quyền: học sinh MTM mở mọi tầng; khách chỉ đề công khai; tài khoản có gói đúng loại còn hạn.
const HS={kieu:'hoc-sinh' as const,id:'x',ten:'A'},KHACH={kieu:'khach' as const},now=Date.parse('2026-11-25T00:00:00Z');
const TK=(loai:('thpt'|'hsa'|'tsa'|'bca')[],den:string)=>({kieu:'tai-khoan' as const,id:'t',ten:'B',goi:[{loai,den}]});
assert.deepEqual(quyenMo({tang:'hoc-sinh-mtm',loai:'thpt'},HS),{mo:true});
assert.deepEqual(quyenMo({tang:'tra-phi',loai:'thpt'},KHACH),{mo:false,lyDo:'can-goi'});
assert.deepEqual(quyenMo({tang:'cong-khai',loai:'thpt'},KHACH),{mo:true});
assert.deepEqual(quyenMo({tang:'hoc-sinh-mtm',loai:'thpt'},TK(['thpt'],'2027-06-30T00:00:00Z'),now),{mo:false,lyDo:'hoc-sinh-mtm'});
assert.deepEqual(quyenMo({tang:'tra-phi',loai:'thpt'},TK(['thpt'],'2027-06-30T00:00:00Z'),now),{mo:true});
assert.deepEqual(quyenMo({tang:'tra-phi',loai:'hsa'},TK(['thpt'],'2027-06-30T00:00:00Z'),now),{mo:false,lyDo:'can-goi'});
assert.deepEqual(quyenMo({tang:'tra-phi',loai:'thpt'},TK(['thpt'],'2026-11-01T00:00:00Z'),now),{mo:false,lyDo:'can-goi'});

// Kho mã hóa: đóng gói rồi mở lại khớp; sai khóa thì lỗi.
const key=randomBytes(32),kho:PtKho={version:1,dongGoi:'t',de:[thpt,tsa]};
assert.deepEqual(moGoi(dongGoi(kho,key),key),kho);assert.throws(()=>moGoi(dongGoi(kho,key),randomBytes(32)));
assert.equal(phongThiKey({MTM_PHONG_THI_KEY:key.toString('base64')})?.length,32);assert.equal(phongThiKey({}),null);

// Vé làm bài: chữ ký sai, sửa giờ bắt đầu đều bị từ chối.
const ve=kyVe({d:'thpt-mau-01',s:now,a:'khach',n:'abcdefgh'},key);
assert.deepEqual(docVe(ve,key),{d:'thpt-mau-01',s:now,a:'khach',n:'abcdefgh'});
assert.equal(docVe(ve,randomBytes(32)),null);
const [b,s]=ve.split('.');const sua=Buffer.from(JSON.stringify({d:'thpt-mau-01',s:now+3600000,a:'khach',n:'abcdefgh'})).toString('base64url');
assert.equal(docVe(sua+'.'+s,key),null);assert.equal(docVe(b,key),null);assert.equal(docVe(123,key),null);

// Luồng mở đề, nộp bài: khách bị chặn đề trả phí; học sinh mở được, nộp trong giờ, giờ tính từ vé.
const K={key,kho};
assert.equal(xuLy('mo',{de:'thpt-mau-01'},KHACH,K,now).status,403);
assert.equal(xuLy('mo',{de:'khong-co'},HS,K,now).status,404);
assert.equal(xuLy('mo',{de:'thpt-mau-01'},HS,null,now).status,503);
const mo=xuLy('mo',{de:'thpt-mau-01'},HS,K,now) as {status:number;body:any};assert.equal(mo.status,200);assert.ok(!/dapAn|loiGiai/.test(JSON.stringify(mo.body)));
const nop=xuLy('nop',{de:'thpt-mau-01',ve:mo.body.ve,traLoi:full},HS,K,now+60*60000) as {status:number;body:any};
assert.equal(nop.status,200);assert.equal(nop.body.ketQua.diem,10);assert.equal(nop.body.quaGio,false);assert.equal(nop.body.giay,3600);
assert.equal((xuLy('nop',{de:'thpt-mau-01',ve:mo.body.ve,traLoi:full},HS,K,now+95*60000) as any).body.quaGio,true);
assert.equal(xuLy('nop',{de:'tsa-mau',ve:mo.body.ve,traLoi:{}},HS,K,now).status,400,'vé đề khác');
assert.equal(xuLy('nop',{de:'thpt-mau-01',ve:mo.body.ve,traLoi:full},TK(['thpt'],'2027-06-30T00:00:00Z'),K,now).status,403,'vé người khác');
assert.equal(xuLy('nop',{de:'thpt-mau-01',ve:mo.body.ve,traLoi:full},HS,K,now+26*3600000).status,410);
assert.equal(xuLy('nop',{de:'thpt-mau-01',ve:mo.body.ve,traLoi:[1]},HS,K,now).status,400);
const dm=xuLy('danh-muc',{},KHACH,K,now) as {status:number;body:any};
assert.deepEqual(dm.body.de.map((d:any)=>[d.id,d.quyen.mo]),[['thpt-mau-01',false],['tsa-mau',true]]);
assert.ok(!/dapAn|loiGiai|"cau"/.test(JSON.stringify(dm.body)),'danh mục chỉ có thông tin đề');

// Tiện ích tài khoản.
assert.equal(chuanSdt('+84 912 345 678'),'0912345678');assert.equal(chuanSdt('0212345678'),null);assert.equal(chuanSdt('09123'),null);
const h=await bamMatKhau('matkhau123');assert.ok(/^scrypt\$[\w-]+\$[\w-]+$/.test(h));assert.equal(await dungMatKhau('matkhau123',h),true);assert.equal(await dungMatKhau('sai',h),false);

// API: nguồn gửi lạ bị chặn; chưa bật CSDL thì tài khoản báo chưa mở, phiên BTVN hợp lệ được coi là học sinh MTM.
type Out={status:number;body:any;headers:Record<string,unknown>};
const call=async(api:ReturnType<typeof createPhongThiApi>,req:any):Promise<Out>=>{const out:Out={status:0,body:null,headers:{}};await api(req,{setHeader:(k,v)=>{out.headers[k]=v;},status:n=>{out.status=n;return {json:v=>{out.body=v;}};}});return out;};
const ORIGIN={origin:'https://minhthanhmath.vn',host:'minhthanhmath.vn'};
const calls:string[]=[];
const transport=(ok:Record<string,unknown>)=>(async(url:string,init:any)=>{const name=String(url).split('/').pop()!;calls.push(name);return name in ok?new Response(JSON.stringify(ok[name]),{status:200}):new Response('{}',{status:401});}) as unknown as typeof fetch;
process.chdir(process.cwd());
const env={SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k',MTM_PHONG_THI_KEY:''};
const api0=createPhongThiApi(()=>env,transport({}),()=>now);
assert.equal((await call(api0,{method:'POST',headers:{origin:'https://evil.vn',host:'minhthanhmath.vn'},body:{action:'mo',de:'x'}})).status,403);
assert.equal((await call(api0,{method:'GET',headers:{}})).status,503,'thiếu khóa thì báo đang cập nhật');
assert.equal((await call(api0,{method:'POST',headers:ORIGIN,body:{action:'dang-ky',sdt:'0912345678',matKhau:'123456',ten:'An'}})).status,503);
assert.match((await call(api0,{method:'POST',headers:ORIGIN,body:{action:'thanh-toan',goi:'luyen-de-thang'}})).body.message,/chuẩn bị/);
assert.equal((await call(api0,{method:'GET',headers:{},query:{'xep-hang':'thpt-mau-01'}})).body.enabled,false);

// Nhãn câu (dang, nguon, tangBanQuyen, vanTay) không bao giờ xuống trình duyệt: đề công khai, danh mục, kết quả chấm.
const nhan:PtDe={...thpt,id:'thpt-nhan',tang:'hoc-sinh-mtm',cau:thpt.cau.map((c,i)=>({...c,dang:'dang-bi-mat-'+i,nguon:{ten:'Nguon-bi-mat',url:'https://x.vn'},tangBanQuyen:'noi-bo' as const,vanTay:'vt-bi-mat-'+i,muc:5}))};
assert.deepEqual(validateDe(nhan),[]);
const lo=(x:unknown)=>/dang-bi-mat|Nguon-bi-mat|vt-bi-mat|tangBanQuyen|vanTay|"dang"/.test(JSON.stringify(x));
assert.ok(!lo(deCongKhai(nhan)),'đề công khai lộ nhãn');assert.ok(!lo(cham(nhan,full)),'kết quả lộ nhãn');assert.ok(!lo(mucLuc({version:1,dongGoi:'t',de:[nhan]})),'danh mục lộ nhãn');
{const K2={key,kho:{version:1 as const,dongGoi:'t',de:[nhan]}};const m=xuLy('mo',{de:'thpt-nhan'},HS,K2,now) as any;assert.ok(!lo(m.body));
 assert.ok(!lo(xuLy('nop',{de:'thpt-nhan',ve:m.body.ve,traLoi:full},HS,K2,now+60000).body));assert.ok(!lo(xuLy('danh-muc',{},HS,K2,now).body));}
// Câu nội bộ chỉ ở đề tầng học sinh MTM; muc 1–5; mach đúng danh sách.
assert.ok(validateDe({...nhan,tang:'tra-phi'}).some(e=>e.includes('noi-bo')));assert.ok(validateDe({...nhan,tang:'cong-khai'}).some(e=>e.includes('noi-bo')));
assert.deepEqual(validateDe({...thpt,cau:thpt.cau.map(c=>({...c,tangBanQuyen:'ban-duoc' as const}))}),[]);
assert.ok(validateDe({...thpt,cau:[{...thpt.cau[0],muc:6}]}).some(e=>e.includes('muc')));assert.ok(validateDe({...thpt,cau:[{...thpt.cau[0],muc:2.5}]}).some(e=>e.includes('muc')));
assert.ok(validateDe({...thpt,cau:[{...thpt.cau[0],mach:'sai' as any}]}).some(e=>e.includes('mach')));

// Thời gian từng câu: số nguyên ≥ 0, mã có trong đề, tổng không vượt giới hạn; sai thì bỏ (bài vẫn chấm).
assert.deepEqual(thoiGianCau(thpt,{'I-1':30,'II-1':0},100),{'I-1':30,'II-1':0});
assert.equal(thoiGianCau(thpt,{'I-1':30,'I-2':80},100),null);assert.equal(thoiGianCau(thpt,{'I-1':-1},100),null);assert.equal(thoiGianCau(thpt,{'I-1':1.5},100),null);
assert.equal(thoiGianCau(thpt,{'x':1},100),null);assert.equal(thoiGianCau(thpt,[1],100),null);assert.equal(thoiGianCau(thpt,undefined,100),null);
{const m=xuLy('mo',{de:'thpt-mau-01'},HS,K,now) as any;
 const n1=xuLy('nop',{de:'thpt-mau-01',ve:m.body.ve,traLoi:full,thoiGian:{'I-1':600,'III-6':1200}},HS,K,now+40*60000) as any;
 assert.deepEqual(n1.body.thoiGian,{'I-1':600,'III-6':1200});assert.equal(n1.body.ketQua.cau.find((c:any)=>c.ma==='I-1').giay,600);assert.equal(n1.body.ketQua.cau.find((c:any)=>c.ma==='I-2').giay,0);
 // Tổng vượt thời gian thật kể từ vé (+60 giây) thì bỏ.
 const n2=xuLy('nop',{de:'thpt-mau-01',ve:m.body.ve,traLoi:full,thoiGian:{'I-1':3000}},HS,K,now+40*60000) as any;assert.equal(n2.status,200);assert.equal(n2.body.thoiGian,null);assert.equal(n2.body.ketQua.cau[0].giay,undefined);
 // Không vượt 90 phút + 2 phút gia hạn dù nộp muộn.
 assert.equal((xuLy('nop',{de:'thpt-mau-01',ve:m.body.ve,traLoi:full,thoiGian:{'I-1':92*60+1}},HS,K,now+5*3600000) as any).body.thoiGian,null);
 assert.ok((xuLy('nop',{de:'thpt-mau-01',ve:m.body.ve,traLoi:full,thoiGian:{'I-1':92*60}},HS,K,now+5*3600000) as any).body.thoiGian);}

// Báo cáo 1 trang: gom theo chủ đề khi chưa có nhãn mạch, theo 4 mạch khi có; câu lâu nhất; câu sai; phân vị chỉ cho HSA.
{const k=cham(thpt,{'I-1':'A','I-2':'A'});k.cau.forEach((c,i)=>c.giay=i===5?300:i===2?200:10);
 const b=baoCao(k);assert.equal(b.theo,'chu-de');assert.deepEqual(b.lauNhat.slice(0,2).map(x=>x.so),[6,3]);assert.equal(b.canXem.length,21);assert.equal(b.phanVi,null);
 assert.equal(b.tongGiay,300+200+20*10);assert.ok(b.nhom.some(n=>n.ten==='Hàm số và đồ thị'&&n.tong===6&&n.dung===1));
 const hsa:PtDe={...thpt,id:'hsa-nhan',loai:'hsa',cau:thpt.cau.map((c,i)=>({...c,mach:(['so-dai-so','hinh-hoc','do-luong','thong-ke-xac-suat'] as const)[i%4]}))};
 const bh=baoCao(cham(hsa,{}));assert.equal(bh.theo,'mach');assert.deepEqual(bh.nhom.map(n=>n.ten),['Số và Đại số','Hình học','Đo lường','Thống kê, xác suất']);assert.ok(bh.phanVi?.uocLuong);assert.equal(bh.lauNhat.length,0);}
// Phân vị HSA ước lượng: 35/50 → 105/150 → top 5,18%; 50/50 → 0%; nội suy giữa mốc.
assert.deepEqual(phanViHsa(35),{quyDoi:105,top:5.18,uocLuong:true});assert.equal(phanViHsa(50).top,0);assert.equal(phanViHsa(0).top,100);
assert.equal(phanViHsa(30).top,26.19);assert.ok(phanViHsa(34).top>5.18&&phanViHsa(34).top<10.11);

// Đợt thi: lịch thật trong dot.json hợp lệ; ngoài giờ không mở được ở chế độ đợt; vẫn luyện tự do; vé ghi mã đợt.
assert.deepEqual(validateDot(DOT),[]);
assert.ok(DOT.some(t=>t.ma==='ks-hk1-2026'&&t.khoi)&&DOT.filter(t=>t.loai==='hsa').length===4);
assert.ok(validateDot([{ma:'x1y',ten:'Đợt',loai:'thpt',de:null,mo:'2026-12-02T07:00:00+07:00',dong:'2026-12-01T07:00:00+07:00'}]).length>0);
assert.ok(validateDot([{ma:'x1y',ten:'Đợt',loai:'thpt',de:null,mo:'2026-12-01 07:00',dong:'2026-12-02T07:00:00+07:00'}]).length>0);
const DS:PtDot[]=[{ma:'dot-thu',ten:'Đợt thử',loai:'thpt',de:'tsa-mau',mo:'2026-11-25T07:00:00+07:00',dong:'2026-11-26T22:00:00+07:00'},
 {ma:'dot-an',ten:'Đợt ẩn',loai:'thpt',de:'chua-gan',mo:'2026-11-25T07:00:00+07:00',dong:'2026-11-26T22:00:00+07:00'},
 {ma:'dot-null',ten:'Đợt chưa đề',loai:'hsa',de:null,mo:'2026-12-25T07:00:00+07:00',dong:'2026-12-26T22:00:00+07:00'},
 {ma:'dot-cu',ten:'Đợt cũ',loai:'thpt',de:'tsa-mau',mo:'2026-10-25T07:00:00+07:00',dong:'2026-10-26T22:00:00+07:00'},
 {ma:'dot-la',ten:'Đợt đề lạ',loai:'thpt',de:'khong-co-de',mo:'2026-12-25T07:00:00+07:00',dong:'2026-12-26T22:00:00+07:00'},
 {ma:'ks-thu',ten:'Khảo sát thử',loai:'thpt',de:null,khoi:{'10':'thpt-mau-01','11':null,'12':null},sbd:'KS26',mo:'2026-11-25T07:00:00+07:00',dong:'2026-11-26T22:00:00+07:00'}];
assert.deepEqual(validateDot(DS),[]);
const trong=Date.parse('2026-11-25T10:00:00+07:00'),truoc=Date.parse('2026-11-24T10:00:00+07:00');
assert.deepEqual(dotCongKhai(DS,kho,trong).map(t=>[t.ma,t.trangThai,t.de?.id??null]),[['dot-thu','dang-mo','tsa-mau'],['ks-thu','dang-mo',null],['dot-null','sap-mo',null]]);
assert.deepEqual(dotCongKhai(DS,kho,trong).find(t=>t.ma==='ks-thu')!.dangKy,{khoi:{'10':true,'11':false,'12':false}});
assert.equal(dotDangMo(DS,'dot-thu','tsa-mau',trong)?.ma,'dot-thu');assert.equal(dotDangMo(DS,'dot-thu','tsa-mau',truoc),null);
{const ngc={dot:DS};
 assert.equal((xuLy('mo',{de:'tsa-mau',dot:'dot-thu'},KHACH,K,truoc,ngc) as any).body.lyDo,'ngoai-gio');
 assert.equal(xuLy('mo',{de:'tsa-mau',dot:'dot-cu'},KHACH,K,trong,ngc).status,403);
 assert.equal(xuLy('mo',{de:'tsa-mau'},KHACH,K,truoc,ngc).status,200,'ngoài giờ vẫn luyện tự do');
 assert.equal(xuLy('mo',{de:'thpt-mau-01',dot:'dot-thu'},HS,K,trong,ngc).status,400,'đề không thuộc đợt');
 assert.equal(xuLy('mo',{de:'x',dot:'dot-null'},HS,K,Date.parse('2026-12-25T10:00:00+07:00'),ngc).status,400);
 assert.equal(xuLy('mo',{de:null,dot:'dot-null'},HS,K,Date.parse('2026-12-25T10:00:00+07:00'),ngc).status,409,'đợt chưa gán đề');
 const m=xuLy('mo',{de:'tsa-mau',dot:'dot-thu'},KHACH,K,trong,ngc) as any;assert.equal(m.status,200);assert.equal(docVe(m.body.ve,key)!.t,'dot-thu');
 const n=xuLy('nop',{de:'tsa-mau',ve:m.body.ve,traLoi:{}},KHACH,K,trong+60000,ngc) as any;assert.equal(n.body.dot,'dot-thu');assert.equal(n.body.sbd,undefined);
 // Luyện tự do: vé không có mã đợt nên lượt không vào bảng đợt.
 const f=xuLy('mo',{de:'tsa-mau'},KHACH,K,trong,ngc) as any;assert.equal((xuLy('nop',{de:'tsa-mau',ve:f.body.ve,traLoi:{}},KHACH,K,trong,ngc) as any).body.dot,undefined);
 // Kỳ khảo sát: cần SBD; đề theo khối, mở được dù đề tầng trả phí và người làm là khách; vé ghi SBD.
 assert.equal((xuLy('mo',{dot:'ks-thu'},KHACH,K,trong,ngc) as any).body.lyDo,'can-sbd');
 const ts10={dot:'ks-thu',sbd:'KS26-10-0001',khoi:'10' as const,ten:'Nguyễn Văn An'},ts11={...ts10,sbd:'KS26-11-0001',khoi:'11' as const};
 assert.equal(xuLy('mo',{dot:'ks-thu'},KHACH,K,trong,{dot:DS,thiSinh:ts11}).status,409);
 assert.equal(xuLy('mo',{dot:'ks-thu'},KHACH,K,trong,{dot:DS,thiSinh:{...ts10,dot:'khac'}}).status,403);
 const mk=xuLy('mo',{dot:'ks-thu'},KHACH,K,trong,{dot:DS,thiSinh:ts10}) as any;assert.equal(mk.status,200);assert.equal(mk.body.de.id,'thpt-mau-01');
 assert.equal(xuLy('mo',{dot:'ks-thu'},KHACH,K,truoc,{dot:DS,thiSinh:ts10}).status,403);
 const nk=xuLy('nop',{de:'thpt-mau-01',ve:mk.body.ve,traLoi:full},KHACH,K,trong+3600000,{dot:DS}) as any;assert.equal(nk.status,200);assert.equal(nk.body.sbd,'KS26-10-0001');assert.equal(nk.body.dot,'ks-thu');
 const dmk=xuLy('danh-muc',{},KHACH,K,trong,{dot:DS,thiSinh:ts10}) as any;assert.deepEqual(dmk.body.dot.find((t:any)=>t.ma==='ks-thu').cuaEm,{sbd:'KS26-10-0001',khoi:'10',ten:'Nguyễn Văn An'});
 assert.ok(!JSON.stringify(dmk.body).includes('truong'));}
// Đăng ký khảo sát, tên rút gọn, mã tra cứu, báo lỗi.
assert.equal(tenRutGon('Nguyễn Văn An'),'N. V. An');assert.equal(tenRutGon('  lê   thị  hồng nhung '),'L. T. H. nhung');assert.equal(tenRutGon('An'),'An');
assert.deepEqual(kiemDangKyDot({ten:' Nguyễn  Văn An ',khoi:10,truong:'THPT Phan Đình Phùng'}),{ten:'Nguyễn Văn An',khoi:'10',truong:'THPT Phan Đình Phùng'});
assert.equal(typeof kiemDangKyDot({ten:'An',khoi:'10',truong:'THPT A'}),'string');assert.equal(typeof kiemDangKyDot({ten:'Nguyễn An 0912345678',khoi:'10',truong:'THPT A'}),'string');
assert.equal(typeof kiemDangKyDot({ten:'Nguyễn An',khoi:'9',truong:'THPT A'}),'string');assert.equal(typeof kiemDangKyDot({ten:'Nguyễn An',khoi:'12',truong:'https://x.vn'}),'string');
assert.match(taoMaTraCuu(),/^[A-Z2-9]{10}$/);assert.notEqual(taoMaTraCuu(),taoMaTraCuu());
assert.equal(ipBam({'x-forwarded-for':'1.2.3.4, 5.6.7.8'},{}),ipBam({'x-forwarded-for':'1.2.3.4'},{}));assert.notEqual(ipBam({'x-forwarded-for':'1.2.3.4'},{}),ipBam({'x-forwarded-for':'1.2.3.4'},{MTM_PHONG_THI_KEY:'k'}));
assert.deepEqual(kiemBaoLoi({de:'thpt-mau-01',ma:'I-1',noiDung:'  Đáp án câu này sai \u0007 '},kho),{de:'thpt-mau-01',ma:'I-1',noiDung:'Đáp án câu này sai'});
assert.equal(typeof kiemBaoLoi({de:'thpt-mau-01',ma:'khong',noiDung:'Đáp án sai'},kho),'string');assert.equal(typeof kiemBaoLoi({de:'x',ma:'I-1',noiDung:'Đáp án sai'},kho),'string');
assert.equal(typeof kiemBaoLoi({de:'thpt-mau-01',ma:'I-1',noiDung:'x'.repeat(501)},kho),'string');assert.equal(typeof kiemBaoLoi({de:'thpt-mau-01',ma:'I-1',noiDung:'sai'},kho),'string');

// API với CSDL bật (giả lập RPC): báo lỗi, đăng ký khảo sát, tra cứu SBD, nộp bài ghi thời gian từng câu và mã đợt.
{const rec:{name:string;args:any}[]=[];
 const fake=(handlers:Record<string,(a:any)=>unknown>)=>(async(url:string,init:any)=>{const name=String(url).split('/').pop()!,args=JSON.parse(init.body);rec.push({name,args});
  return name in handlers?new Response(JSON.stringify(handlers[name](args)),{status:200}):new Response('{}',{status:401});}) as unknown as typeof fetch;
 const envDb={SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k',MTM_PHONG_THI_DB:'1',MTM_PHONG_THI_KEY:key.toString('base64')};
 // Kho thử: ghi tạm bằng khóa thử vào thư mục riêng không làm được vì loadKho đọc cwd; dùng kho thật nếu có khóa thật, không thì chỉ kiểm nhánh thiếu kho.
 let baoLoi=0;const api=createPhongThiApi(()=>envDb,fake({mtm_pt_bao_loi:()=>{baoLoi++;return {status:baoLoi>10?'qua-nhieu':'ok'};},
  mtm_pt_dang_ky_dot:(a)=>({status:'ok',sbd:a.p_tien_to+'-'+a.p_khoi+'-0001',khoi:a.p_khoi}),
  mtm_pt_tra_cuu_dot:(a)=>a.p_sbd==='KS26-10-0001'&&a.p_tra_cuu.length===64?{dot:'ks-hk1-2026',sbd:'KS26-10-0001',khoi:'10',ten:'Nguyễn Văn An',truong:'THPT A',mtm:false}:null,
  mtm_pt_khao_sat:()=>({n:2,em:{hang:1,n:2,diem:9,phanVi:100},cau:{'c1':0.5},bang:[{hang:1,sbd:'KS26-10-0001',ten:'Nguyễn Văn An',mtm:false,diem:9,phanVi:100}]}),
  mtm_pt_xep_hang_dot:()=>[]}),()=>Date.parse('2026-11-20T10:00:00+07:00'));
 const P=(body:any,cookie='')=>call(api,{method:'POST',headers:{...ORIGIN,cookie,'x-forwarded-for':'9.9.9.9'},body});
 // Không giải mã được kho (khóa thử) thì các hành động mới báo đang cập nhật, không gọi CSDL.
 const realKho=!!phongThiKey(process.env);
 if(!realKho){assert.equal((await P({action:'bao-loi',de:'x',ma:'y',noiDung:'Sai đáp án'})).status,503);}
 // Bảng xếp hạng khảo sát: chỉ SBD, tên rút gọn, không trường/SĐT; khối sai bị chặn.
 const g=await call(api,{method:'GET',headers:{},query:{'xep-hang-ks':'ks-hk1-2026',khoi:'10'}});assert.equal(g.status,200);assert.deepEqual(g.body.rows[0],{hang:1,sbd:'KS26-10-0001',ten:'N. V. An',mtm:false,diem:9,phanVi:100});
 assert.equal((await call(api,{method:'GET',headers:{},query:{'xep-hang-ks':'ks-hk1-2026',khoi:'9'}})).status,400);
 assert.equal((await call(api,{method:'GET',headers:{},query:{'xep-hang-ks':'hsa-thu-2026-12',khoi:'10'}})).status,400);
 assert.equal((await call(api,{method:'GET',headers:{},query:{'xep-hang-dot':'hsa-thu-2026-12'}})).status,200);
 if(realKho){
  const kt=loadKho(phongThiKey(process.env)!),d0=kt.de[0];
  const envR={...envDb,MTM_PHONG_THI_KEY:process.env.MTM_PHONG_THI_KEY};
  const apiR=createPhongThiApi(()=>envR,fake({mtm_pt_bao_loi:()=>{baoLoi++;return {status:baoLoi>10?'qua-nhieu':'ok'};},
   mtm_pt_dang_ky_dot:(a)=>({status:a.p_sdt==='0911111111'?'sdt-du':'ok',sbd:a.p_tien_to+'-'+a.p_khoi+'-0001',khoi:a.p_khoi}),
   mtm_pt_tra_cuu_dot:(a)=>a.p_sbd==='KS26-10-0001'?{dot:'ks-hk1-2026',sbd:'KS26-10-0001',khoi:'10',ten:'Nguyễn Văn An',truong:'THPT A',mtm:false}:null,
   mtm_pt_khao_sat:()=>({n:2,em:{hang:1,n:2,diem:9,phanVi:100},cau:{}}),mtm_pt_ghi_luot:()=>({status:'luyen-tap',lan:1})}),()=>Date.parse('2026-11-20T10:00:00+07:00'));
  const PR=(body:any,cookie='')=>call(apiR,{method:'POST',headers:{...ORIGIN,cookie,'x-forwarded-for':'9.9.9.9'},body});
  assert.equal((await PR({action:'bao-loi',de:d0.id,ma:d0.cau[0].ma,noiDung:'Đáp án câu 1 bị sai'})).status,200);
  assert.equal(rec.at(-1)!.name,'mtm_pt_bao_loi');assert.equal(rec.at(-1)!.args.p_nguoi,'khach');assert.match(rec.at(-1)!.args.p_ip,/^[0-9a-f]{64}$/);assert.ok(!JSON.stringify(rec.at(-1)!.args).includes('9.9.9.9'));
  assert.equal((await PR({action:'bao-loi',de:d0.id,ma:'khong-co',noiDung:'Đáp án câu 1 bị sai'})).status,400);
  baoLoi=10;assert.equal((await PR({action:'bao-loi',de:d0.id,ma:d0.cau[0].ma,noiDung:'Đáp án câu 1 bị sai'})).status,429);
  // Đăng ký: SĐT chuẩn hóa, mã tra cứu chỉ gửi băm xuống CSDL, cookie SBD.mã; SĐT đủ 3 thí sinh bị từ chối.
  const dk=await PR({action:'dang-ky-dot',dot:'ks-hk1-2026',ten:'Nguyễn Văn An',khoi:'10',truong:'THPT A',sdt:'+84 912 345 678'});
  assert.equal(dk.status,200);assert.equal(dk.body.sbd,'KS26-10-0001');assert.match(dk.body.maTraCuu,/^[A-Z2-9]{10}$/);
  const a=rec.at(-1)!.args;assert.equal(a.p_sdt,'0912345678');assert.equal(a.p_khoi,10);assert.notEqual(a.p_tra_cuu,dk.body.maTraCuu);assert.ok(!JSON.stringify(a).includes(dk.body.maTraCuu));
  assert.match(String(dk.headers['Set-Cookie']),new RegExp('^mtm_pt_dk=KS26-10-0001\\.'+dk.body.maTraCuu+'; HttpOnly'));
  assert.equal((await PR({action:'dang-ky-dot',dot:'ks-hk1-2026',ten:'Nguyễn Văn An',khoi:'10',truong:'THPT A',sdt:'0911111111'})).status,409);
  assert.equal((await PR({action:'dang-ky-dot',dot:'hsa-thu-2026-12',ten:'Nguyễn Văn An',khoi:'10',truong:'THPT A',sdt:'0912345678'})).status,404);
  assert.equal((await PR({action:'dang-ky-dot',dot:'ks-hk1-2026',ten:'Nguyễn Văn An',khoi:'10',truong:'THPT A',sdt:'123'})).status,400);
  // Tra cứu: đúng SBD + mã thì trả cho chính em (có trường), sai thì 401.
  const ck='mtm_pt_dk=KS26-10-0001.'+dk.body.maTraCuu;
  const tc=await PR({action:'tra-cuu-sbd'},ck);assert.equal(tc.status,200);assert.equal(tc.body.truong,'THPT A');
  assert.equal((await PR({action:'tra-cuu-sbd',sbd:'KS26-11-0009',maTraCuu:'ABCDEFGHJK'})).status,401);
  // Danh mục có đợt, kèm SBD của em; nộp bài ghi thời gian từng câu, mã đợt.
  const dmR=await call(apiR,{method:'GET',headers:{cookie:ck}});assert.equal(dmR.status,200);assert.equal(dmR.body.dot.find((t:any)=>t.ma==='ks-hk1-2026').cuaEm.sbd,'KS26-10-0001');
  const cong=kt.de.find(x=>x.tang==='cong-khai')!;
  const mR=await PR({action:'mo',de:cong.id});const nR=await PR({action:'nop',de:cong.id,ve:mR.body.ve,traLoi:{},thoiGian:{[cong.cau[0].ma]:0}});
  assert.equal(nR.status,200);const gl=rec.find(r=>r.name==='mtm_pt_ghi_luot')!.args;assert.deepEqual(gl.p_chi_tiet.cau[0],[cong.cau[0].ma,0,0,0]);assert.equal(gl.p_dot,null);assert.equal(gl.p_sbd,null);
 }
}

// Kho thật trong repo (nếu có khóa ở máy kiểm): mọi đề hợp lệ, công khai không lộ đáp án.
const realKey=phongThiKey(process.env);
if(realKey){const real=loadKho(realKey);for(const d of real.de){assert.deepEqual(validateDe(d),[],d.id);assert.ok(!/dapAn|loiGiai/.test(JSON.stringify(deCongKhai(d))));}
 console.log('phong-thi: kho thật',real.de.length,'đề hợp lệ');}
else console.log('phong-thi: không có MTM_PHONG_THI_KEY, bỏ qua kiểm kho thật');
// Số thứ tự cố định: thẻ đề, phòng làm bài và kết quả đều hiện "Đề N · ...".
assert.equal(tenDe({tieuDe:'Sở Hà Nội',stt:4}),'Đề 4 · Sở Hà Nội');assert.equal(tenDe({tieuDe:'Sở Hà Nội'}),'Sở Hà Nội');
{const d={...thpt,stt:3};assert.equal(mucLuc({version:1,dongGoi:'',de:[d]} as PtKho)[0].tieuDe,'Đề 3 · '+thpt.tieuDe);assert.equal(deCongKhai(d).tieuDe,'Đề 3 · '+thpt.tieuDe);}
console.log('phong-thi: ok');
