// 16/11/2026: W6/W9 số phễu chỉ đọc cho Javis. Schema thật (PGlite), dữ liệu giả; handler với transport giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {createSoPheuApi,khoaSoPheu} from '../server/so-pheu/api';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='SO-PHEU'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'SO-PHEU',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
const mig=readFileSync('supabase/migrations-pending/202611160115_so_pheu.sql','utf8');await db.exec(mig);await db.exec(mig);
const call=(tu:string,den:string,role='service_role')=>db.transaction(async tx=>{await tx.exec('set local role '+role);
 return (await tx.query('select public.mtm_pt_so_pheu($1::date,$2::date) d',[tu,den])).rows[0] as any;}).then(r=>r.d);
const owner='11111111-1111-4111-8111-111111111111',c9='44444444-4444-4444-8444-444444444441';
const hsThat='22222222-2222-4222-8222-222222222221',hsThu='22222222-2222-4222-8222-222222222222';
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K9 9+',12)",[c9,owner]);
await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,parent_phone,is_test) values($1,$3,$4,'Nguyễn Văn An','S','12A','MTM-000000000001','0911000001',false),($2,$3,$4,'HS thử','S','12A','MTM-000000000002','0911000009',true)",[hsThat,hsThu,owner,c9]);
const tk=(sdt:string,ten:string,luc:string,thu=false)=>q("insert into mtm_phong_thi.tai_khoan(sdt,ten,mat_khau,is_test,tao_luc) values($1,$2,'scrypt$aa$bb',$3,$4::timestamptz) returning id",[sdt,ten,thu,luc]).then(r=>(r.rows[0] as any).id as string);
const tPh=await tk('0911000001','Phụ huynh An','2026-11-15 08:00+07');   // trùng SĐT PH học sinh thật → trong
const tNg=await tk('0988000001','Người ngoài','2026-11-15 09:00+07');    // ngoài
const tNg2=await tk('0988000002','Người ngoài 2','2026-11-16 00:30+07'); // ngoài, sang ngày 16 giờ VN
const tThu=await tk('0911000009','Tài khoản thử','2026-11-15 10:00+07',true);
let n=0;const luot=(nguoi:string,tai:string|null,hs:string|null,dot:string|null,luc:string)=>q("insert into mtm_phong_thi.luot(nonce,de,loai,nguoi,hoc_sinh,tai_khoan,diem,thang,dung,tong,giay,qua_gio,chi_tiet,dot,nop_luc) values($1,'hsa-ky-1','hsa',$2,$3,$4,50,150,10,50,3000,false,'{}',$5,$6::timestamptz)",['nonce-'+(++n)+'-xxxx',nguoi,hs,tai,dot,luc]);
await luot('tk:'+tNg,tNg,null,'hsa-thu-2026-11','2026-11-15 10:00+07');
await luot('tk:'+tNg,tNg,null,'thpt-thu-2026-11','2026-11-15 11:00+07');
await luot('hs:'+hsThat,null,hsThat,'hsa-thu-2026-11','2026-11-15 12:00+07');
await luot('khach',null,null,'hsa-thu-2026-11','2026-11-15 23:30+07');
await luot('khach',null,null,null,'2026-11-15 13:00+07');
await luot('tk:'+tThu,tThu,null,'hsa-thu-2026-11','2026-11-15 14:00+07');   // tài khoản thử: bỏ
await luot('hs:'+hsThu,null,hsThu,'hsa-thu-2026-11','2026-11-15 14:00+07');  // HS thử: bỏ
await q("insert into mtm_lead.leads(kind,student_name,phone,grade,study_mode,lead_source,created_at) values('dang-ky','A','0912345678','12','online','Mã nguồn: HSA1-FB · Nguồn: facebook','2026-11-15 09:00+07'),('dang-ky','B','0900000002','12','online','Nguồn: google','2026-11-15 09:10+07'),('dang-ky','C','0900000003','11','online','Mã nguồn: HSA1-FB','2026-11-15 20:00+07')");
await q("insert into mtm_lead.leads(kind,student_name,phone,grade,study_mode,lead_source,created_at) values('kiem-tra-dau-vao','D','0900000004','10','online','Kiểm tra đầu vào web','2026-11-15 15:00+07')");

const d=await call('2026-11-15','2026-11-16');
const n15=d.theoNgay.find((x:any)=>x.ngay==='2026-11-15'),n16=d.theoNgay.find((x:any)=>x.ngay==='2026-11-16');
test('tài khoản mới tách trong/ngoài MTM theo ngày giờ VN, bỏ tài khoản thử',()=>{
 assert.deepEqual(n15.taiKhoanMoi,{trong:1,ngoai:1});assert.deepEqual(n16.taiKhoanMoi,{trong:0,ngoai:1});});
test('đăng ký theo kind + mã ?nguon=, kiểm tra đầu vào đếm riêng',()=>{
 assert.deepEqual(n15.dangKy,[{kind:'dang-ky',nguon:'HSA1-FB',so:2},{kind:'dang-ky',nguon:'khong-ma',so:1}]);assert.equal(n15.kiemTraDauVao,1);assert.equal(n16.kiemTraDauVao,0);});
test('bài nộp theo đợt, bỏ HS và tài khoản thử, tự do ghi tu-do',()=>{
 assert.deepEqual(n15.baiNop,{'hsa-thu-2026-11':3,'thpt-thu-2026-11':1,'tu-do':1});assert.deepEqual(n16.baiNop,{});});
test('số cổng W9',()=>{
 assert.equal(d.cong.taiKhoanNgoai,2);assert.deepEqual(d.cong.baiTheoDot,{'hsa-thu-2026-11':3,'thpt-thu-2026-11':1});
 assert.equal(d.cong.soDotDat,0);assert.equal(d.cong.nguoiThiDot,2);assert.equal(d.cong.quayLai2Dot,1);assert.equal(d.cong.dichTaiKhoanNgoai,2000);});
test('không lộ tên, SĐT',()=>{const s=JSON.stringify(d);for(const x of ['Nguyễn','Người ngoài','0911','0988','0912','0900','Phụ huynh'])assert.ok(!s.includes(x),x);});
test('anon và authenticated không gọi được; khoảng ngày sai bị từ chối',async()=>{
 for(const role of ['anon','authenticated'])await assert.rejects(call('2026-11-15','2026-11-16',role));
 await assert.rejects(call('2026-11-16','2026-11-15'));});
// Handler
const env={SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'srk-thu'};
const run=async(h:Record<string,string>,query:Record<string,string>={},method='GET',e:Record<string,string|undefined>=env)=>{let st=0,body:any=null,sent:any=null;
 const api=createSoPheuApi(()=>e,(async(_u:any,init:any)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({ok:1}),{status:200});}) as any,()=>Date.parse('2026-11-16T01:00:00Z'));
 await api({method,query,headers:h},{setHeader(){},status:(s:number)=>({json:(v:unknown)=>{st=s;body=v;}})});return {st,body,sent};};
test('handler: sai/thiếu khóa 401, đúng khóa gọi RPC với khoảng mặc định 14 ngày giờ VN',async()=>{
 assert.equal((await run({})).st,401);assert.equal((await run({'x-mtm-khoa':'sai'})).st,401);
 const k=khoaSoPheu(env);assert.match(k,/^[0-9a-f]{64}$/);
 const ok=await run({'x-mtm-khoa':k});assert.equal(ok.st,200);assert.deepEqual(ok.sent,{p_tu:'2026-11-03',p_den:'2026-11-16'});
 assert.deepEqual((await run({'x-mtm-khoa':k},{tu:'2026-11-15',den:'2026-11-20'})).sent,{p_tu:'2026-11-15',p_den:'2026-11-20'});
 assert.equal((await run({'x-mtm-khoa':k},{tu:'2026-11-20',den:'2026-11-15'})).st,400);
 assert.equal((await run({'x-mtm-khoa':k},{},'POST')).st,405);
 assert.equal((await run({'x-mtm-khoa':'k2'},{},'GET',{...env,MTM_SO_PHEU_KEY:'k2'})).st,200,'khóa riêng ở Vercel thay khóa suy ra');
 assert.equal((await run({'x-mtm-khoa':''},{},'GET',{})).st,503);});
await finish();
await db.close();
