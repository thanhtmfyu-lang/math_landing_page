// 19/11/2026: ô "Miễn – đã làm" BTVN. Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='BTVN-MIEN'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'BTVN-MIEN',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const one=async(sql:string,args:any[]=[])=>(await q(sql,args)).rows[0] as any;
await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
const mig=readFileSync('supabase/migrations-pending/202611190117_btvn_mien.sql','utf8');
await db.exec(mig);await db.exec(mig); // chạy lại không lỗi
// Fixture: điểm chính thức = receipt.score (bộ kiểm điểm thật đã có test riêng).
await db.exec(`create or replace function mtm_hw_private.btvn_receipt_official_score(p_receipt jsonb,p_exam jsonb,p_material jsonb,p_manual_score numeric default null) returns numeric language sql immutable set search_path='' as $f$select (p_receipt->>'score')::numeric$f$;select mtm_test100.refresh_reports();`);
const owner='11111111-1111-4111-8111-111111111111',c8='44444444-4444-4444-8444-444444444441',c9='44444444-4444-4444-8444-444444444442',cx='44444444-4444-4444-8444-444444444443';
const daLam='22222222-2222-4222-8222-222222222221',chiNhap='22222222-2222-4222-8222-222222222222',khac='22222222-2222-4222-8222-222222222223',lopKhac='22222222-2222-4222-8222-222222222224';
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$4,'2K11 8+',10),($2,$4,'2K11 9+',10),($3,$4,'2K9 9+',12)",[c8,c9,cx,owner]);
let k=0;const hs=(id:string,lop:string)=>q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,parent_phone) values($1,$2,$3,'HS giả '||$4,'S','10A','MTM-00000000000'||$4,'090000000'||$4)",[id,owner,lop,String(++k)]);
await hs(daLam,c9);await hs(chiNhap,c8);await hs(khac,c8);await hs(lopKhac,cx);
const bai=(code:string,lop:string[],dang:boolean)=>q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status) values($1,$2,$3,'{\"date\":\"2026-11-18\"}','{\"title\":\"Trả lời ngắn\"}',$4,$5)",[code,owner,lop,dang,dang?'da_dang':'cho_duyet']);
await bai('cu',[c8,c9],false);await bai('moi',[c8,c9],true);await bai('lop-khac',[cx],true);
const t1=Date.parse('2026-11-18T14:00:00Z'),t2=Date.parse('2026-11-18T15:00:00Z');
await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,receipts) values($1,'cu',$2)",[daLam,JSON.stringify([{attemptId:'a1',submittedAt:t1,score:6.5,late:false},{attemptId:'a2',submittedAt:t2,score:8.25,late:false}])]);
await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,drafts,receipts) values($1,'cu','[{\"x\":1}]','[]')",[chiNhap]);
await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,receipts) values($1,'cu',$2)",[lopKhac,JSON.stringify([{attemptId:'b1',submittedAt:t1,score:9,late:false}])]);

const kq=await one("select mtm_hw_private.btvn_mien_tu_bai_cu('cu','moi','Đã làm bài cũ','test') k");
test('chỉ HS đã nộp bài cũ (đúng lớp bài mới) được miễn; nháp không tính',()=>{assert.deepEqual(kq.k,{moi:1,boQua:0});});
test('bài mới: 1 lượt miễn, điểm = điểm cao nhất bài cũ, giờ = lần nộp đầu, không muộn',async()=>{
 const r=(await q("select * from mtm_hw_private.btvn_official_receipts($1,'moi')",[daLam])).rows as any[];
 assert.equal(r.length,1);assert.equal(Number(r[0].score),8.25);assert.equal(Number(r[0].submitted_at),t1);
 assert.equal(r[0].receipt.exempt,true);assert.equal(r[0].receipt.late,false);assert.equal(r[0].receipt.fromLesson,'cu');});
test('HS chỉ có nháp / HS khác / lớp khác: không có lượt',async()=>{
 for(const [s,l] of [[chiNhap,'moi'],[khac,'moi'],[lopKhac,'moi'],[lopKhac,'lop-khac']])
  assert.equal(Number((await one("select count(*) n from mtm_hw_private.btvn_official_receipts($1,$2)",[s,l])).n),0);});
test('bài cũ giữ nguyên 2 lượt thật',async()=>{assert.equal(Number((await one("select count(*) n from mtm_hw_private.btvn_official_receipts($1,'cu')",[daLam])).n),2);});
test('chạy lại không tạo trùng',async()=>{
 assert.deepEqual((await one("select mtm_hw_private.btvn_mien_tu_bai_cu('cu','moi','Đã làm bài cũ','test') k")).k,{moi:0,boQua:0});
 assert.equal(Number((await one("select count(*) n from mtm_hw_private.btvn_mien")).n),1);});
test('bản sao _real100 (bảng cuối ca, lịch sử GV) cũng thấy lượt miễn',async()=>{
 const r=await one("select count(*) n,max(score) d from mtm_hw_private.btvn_official_receipts_real100($1,'moi')",[daLam]);
 assert.equal(Number(r.n),1);assert.equal(Number(r.d),8.25);});
test('bảng cuối ca hv_ca_rows dùng nguồn chung btvn_official_receipts',async()=>{
 const src=(await one("select pg_get_functiondef('mtm_hw_private.hv_ca_rows_real100(date,date)'::regprocedure) s")).s as string;
 assert.match(src,/btvn_official_receipts_real100/);});
const svc=(p:object,role='service_role')=>db.transaction(async tx=>{await tx.exec('set local role '+role);return (await tx.query('select public.mtm_btvn_mien($1::jsonb) r',[JSON.stringify(p)])).rows[0] as any;}).then(r=>r.r);
test('cổng service_role: đặt miễn 1 HS, chạy lại cùng nguồn không trùng, hủy thì mất',async()=>{
 const a=await svc({action:'mien',studentId:khac,lessonCode:'moi',diem:7,lyDo:'QL xác nhận',nguon:'msg-1'});assert.equal(a.ok,true);
 assert.equal((await svc({action:'mien',studentId:khac,lessonCode:'moi',diem:7,lyDo:'QL xác nhận',nguon:'msg-1'})).trung,true);
 assert.equal((await svc({action:'xem',lessonCode:'moi'})).mien.length,2);
 assert.equal(Number((await one("select count(*) n from mtm_hw_private.btvn_official_receipts($1,'moi')",[khac])).n),1);
 assert.equal((await svc({action:'huy',id:a.id})).ok,true);
 assert.equal(Number((await one("select count(*) n from mtm_hw_private.btvn_official_receipts($1,'moi')",[khac])).n),0);});
test('cổng: HS không thuộc lớp bài bị từ chối; điểm ngoài 0–10 bị từ chối',async()=>{
 await assert.rejects(svc({action:'mien',studentId:lopKhac,lessonCode:'moi',diem:7,lyDo:'x',nguon:'msg-2'}),/MIEN_HS_KHONG_THUOC_LOP_BAI/);
 await assert.rejects(svc({action:'mien',studentId:khac,lessonCode:'moi',diem:11,lyDo:'x',nguon:'msg-3'}));});
test('anon/authenticated không gọi được, không đọc được bảng',async()=>{
 for(const role of ['anon','authenticated']){
  assert.equal((await one("select has_function_privilege($1,'public.mtm_btvn_mien(jsonb)','execute') v",[role])).v,false);
  assert.equal((await one("select has_table_privilege($1,'mtm_hw_private.btvn_mien','select') v",[role])).v,false);}});
test('migration dữ liệu 2K11 thiếu bài thì dừng (P0001), không ghi gì',async()=>{
 await assert.rejects(db.exec(readFileSync('supabase/migrations-pending/202611190118_mien_2k11_tra_loi_ngan.sql','utf8')),(e:any)=>e.code==='P0001'&&/MIEN_2K11_THIEU_BAI/.test(e.message));});
test('migration không chứa tên/SĐT/mã HS',()=>{
 for(const f of ['202611190117_btvn_mien.sql','202611190118_mien_2k11_tra_loi_ngan.sql','202611190119_mien_the_bai.sql']){
  const s=readFileSync('supabase/migrations-pending/'+f,'utf8');assert.doesNotMatch(s,/(?<![0-9a-f])0\d{9}(?![0-9a-f])/);assert.doesNotMatch(s,/[0-9a-f]{8}-[0-9a-f]{4}-/);}});

// Thẻ bài (HS + Góc phụ huynh): stub nguồn cũ + phân giải HS, kiểm riêng wrapper 119.
await db.exec(readFileSync('supabase/migrations-pending/202611190119_mien_the_bai.sql','utf8'));
await db.exec(readFileSync('supabase/migrations-pending/202611190119_mien_the_bai.sql','utf8'));
await db.exec(`create or replace function mtm_hw_private.btvn_student(p_session text) returns uuid language sql security definer set search_path='' as $f$select p_session::uuid$f$;
create or replace function public.mtm_btvn_read_before_mien119(p_session text,p_lesson text default null) returns jsonb language sql security definer set search_path='' as $f$
select '{"lessons":[{"lessonCode":"moi","available":true,"submittedAt":null,"bestScore":null},{"lessonCode":"cu","available":true,"submittedAt":1763474400000,"bestScore":8.25,"late":false},{"lessonCode":"lop-khac","available":false}]}'::jsonb$f$;
select mtm_test100.refresh_reports();`);
test('thẻ bài miễn hiện đã nộp, đúng hạn, điểm giữ; thẻ khác giữ nguyên',async()=>{
 const r=(await one("select public.mtm_btvn_read($1,null) r",[daLam])).r;
 const [moi,cu,khac]=r.lessons;
 assert.equal(moi.exempt,true);assert.equal(moi.submittedAt,t1);assert.equal(moi.late,false);assert.equal(Number(moi.bestScore),8.25);assert.equal(moi.pendingGrading,false);
 assert.equal(cu.exempt,undefined);assert.equal(cu.bestScore,8.25);assert.deepEqual(khac,{lessonCode:'lop-khac',available:false});});
test('HS không được miễn: thẻ giữ nguyên chưa nộp',async()=>{
 const r=(await one("select public.mtm_btvn_read($1,null) r",[chiNhap])).r;assert.equal(r.lessons[0].submittedAt,null);assert.equal(r.lessons[0].exempt,undefined);});
test('Góc phụ huynh (mtm_btvn_read_real100) cũng thấy thẻ miễn',async()=>{
 const r=(await one("select public.mtm_btvn_read_real100($1,null) r",[daLam])).r;assert.equal(r.lessons[0].exempt,true);});
test('mtm_btvn_read chỉ service_role gọi được',async()=>{
 for(const role of ['anon','authenticated'])assert.equal((await one("select has_function_privilege($1,'public.mtm_btvn_read(text,text)','execute') v",[role])).v,false);
 assert.equal((await one("select has_function_privilege('service_role','public.mtm_btvn_read(text,text)','execute') v")).v,true);});
await finish();await db.close();
