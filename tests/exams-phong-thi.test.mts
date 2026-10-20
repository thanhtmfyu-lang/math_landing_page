import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cham,deCongKhai,normShort,quyenMo,validateDe,type PtDe,type PtKho} from '../server/phong-thi/engine';
import {docVe,dongGoi,kyVe,moGoi,phongThiKey,loadKho,xuLy} from '../server/phong-thi/handler';
import {createPhongThiApi,chuanSdt,bamMatKhau,dungMatKhau} from '../api/phong-thi';

// Đề THPT giả đúng cấu trúc 2025: 12 trắc nghiệm, 4 đúng sai, 6 trả lời ngắn.
const thpt:PtDe={id:'thpt-mau-01',loai:'thpt',tieuDe:'Đề mẫu THPT kiểm thử',nam:2026,nhom:'mtm',tang:'tra-phi',thoiGian:90,nguon:{ten:'MTM kiểm thử'},
 phan:[{ma:'I',ten:'Phần I',kieu:'mc'},{ma:'II',ten:'Phần II',kieu:'ds'},{ma:'III',ten:'Phần III',kieu:'ngan'}],kiemTra:{ketQua:'dat'},
 cau:[...Array.from({length:12},(_,i)=>({ma:'I-'+(i+1),phan:'I',kieu:'mc' as const,de:'Câu $'+i+'$',luaChon:['$1$','$2$','$3$','$4$'],dapAn:'ABCD'[i%4],loiGiai:'Lời giải '+i,chuDe:i<6?'ham-so':'tich-phan'})),
  ...Array.from({length:4},(_,i)=>({ma:'II-'+(i+1),phan:'II',kieu:'ds' as const,de:'Cho ...',y:['a','b','c','d'],dapAn:[true,false,true,false],loiGiai:'...'})),
  ...Array.from({length:6},(_,i)=>({ma:'III-'+(i+1),phan:'III',kieu:'ngan' as const,de:'Tính',dapAn:['12,5','-3','0,25','7','100','1,2'][i],loiGiai:'...'}))]};
assert.deepEqual(validateDe(thpt),[]);

// Trả lời ngắn: dấu phẩy/chấm, số 0 thừa, dấu cộng, -0.
assert.equal(normShort('12.50'),'12,5');assert.equal(normShort(' +3,0 '),'3');assert.equal(normShort('-0'),'0');assert.equal(normShort(',25'),'0,25');
assert.equal(normShort('0012'),'12');assert.equal(normShort('1/2'),'');assert.equal(normShort('abc'),'');assert.equal(normShort(''),'');

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

// Bản quyền: đề sở/trường/tuyển chọn không được đặt tầng bán hay công khai; đề chưa kiểm đáp án bị chặn.
assert.ok(validateDe({...thpt,nhom:'so',tang:'tra-phi'}).some(e=>e.includes('hoc-sinh-mtm')));
assert.deepEqual(validateDe({...thpt,nhom:'truong',tang:'hoc-sinh-mtm'}),[]);
assert.ok(validateDe({...thpt,kiemTra:{ketQua:'chua'}}).some(e=>e.includes('kiểm')));
assert.ok(validateDe({...thpt,cau:[...thpt.cau,thpt.cau[0]]}).some(e=>e.includes('trùng')));
assert.ok(validateDe({...thpt,cau:[{...thpt.cau[0],dapAn:'E'}]}).length>0);
assert.ok(validateDe({...thpt,chum:[{ma:'g1',de:'Dùng chung',cau:['khong-co']}]}).length>0);

// Quyền: học sinh MTM mở mọi tầng; khách chỉ đề công khai; tài khoản có gói đúng loại còn hạn.
const HS={kieu:'hoc-sinh' as const,id:'x',ten:'A'},KHACH={kieu:'khach' as const},now=Date.parse('2026-11-25T00:00:00Z');
const TK=(loai:('thpt'|'hsa'|'tsa')[],den:string)=>({kieu:'tai-khoan' as const,id:'t',ten:'B',goi:[{loai,den}]});
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

// Kho thật trong repo (nếu có khóa ở máy kiểm): mọi đề hợp lệ, công khai không lộ đáp án.
const realKey=phongThiKey(process.env);
if(realKey){const real=loadKho(realKey);for(const d of real.de){assert.deepEqual(validateDe(d),[],d.id);assert.ok(!/dapAn|loiGiai/.test(JSON.stringify(deCongKhai(d))));}
 console.log('phong-thi: kho thật',real.de.length,'đề hợp lệ');}
else console.log('phong-thi: không có MTM_PHONG_THI_KEY, bỏ qua kiểm kho thật');
console.log('phong-thi: ok');
