// Schema/RPC thật trên PGlite, toàn bộ danh tính và dữ liệu là fixture giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import {SupabaseHomeworkRepository} from '../server/btvn/supabase-repository';
import {createDurableHomeworkHandler} from '../server/btvn/durable-http';

const {db,applied}=await baselineDatabase();
const migration='202610300201_an_ho_so_trung.sql';
assert.ok(applied.includes(migration),'Migration mới phải chạy được, không bị baseline bỏ qua');
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const scalar=async(sql:string,args:any[]=[]) => (await q(sql,args)).rows[0].r;
const owner='11111111-1111-4111-8111-111111111111';
const duplicate='22222222-2222-4222-8222-222222222222',primary='33333333-3333-4333-8333-333333333333';
const other='66666666-6666-4666-8666-666666666666',classOld='44444444-4444-4444-8444-444444444444',classMain='55555555-5555-4555-8555-555555555555';
const name='Em Hồ Sơ Giả',phone='0900000001',source='synthetic-hide-duplicate';
const tests:[string,()=>unknown][]=[];const test=(n:string,f:()=>unknown)=>tests.push([n,f]);
const hide=(d=duplicate,k=primary,src=source,dc='2K11 8+',kc='2K11 XPT')=>scalar('select public.mtm_student_hide_duplicate($1,$2,$3,$4,$5) r',[d,k,dc,kc,src]);
const find=(n=name,c:string|null=null)=>scalar('select mtm_hw_private.dd_find_student($1,$2) r',[n,c]);
const forgot=(c:string,p=phone)=>scalar('select public.mtm_btvn_forgot($1,$2,$3) r',[name,p,c]);
const pin=(c:string)=>scalar('select public.mtm_btvn_forgot_pin($1,$2,$3,null,null) r',[name,phone,c]);
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K11 8+',10),($3,$2,'2K11 XPT',10)",[classOld,owner,classMain]);
await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids) values(true,$1,'synthetic-duplicate',$2)",[owner,[duplicate,primary]]);
await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,student_phone) values($1,$2,$3,$4,'Synthetic','10A','MTM-000000000001',$5),($6,$2,$7,$4,'Synthetic','10A','MTM-000000000002',$5),($8,$2,$3,'Em Khác Giả','Synthetic','10B','MTM-000000000003','0900000002')",[duplicate,owner,classOld,name,phone,primary,classMain,other]);
await q('insert into mtm_hw_private.memberships(student_id,class_id) values($1,$2),($3,$4)',[duplicate,classOld,primary,classMain]);
await q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam) values('synthetic-history',$1,$2,'{}','{}')",[owner,[classOld]]);
await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,receipts) values($1,'synthetic-history','[{\"score\":8.5,\"submittedAt\":1}]')",[duplicate]);
await q("insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source) values($1,'2K11 8+','2026-10-29','co_mat','quan_ly')",[duplicate]);
await q("insert into mtm_hw_private.paper_scores(student_id,test_code,test_date,score,max_score,unit,subject,source_msg) values($1,'synthetic-test','2026-10-29',8.5,10,'điểm','Toán','synthetic-paper-score')",[duplicate]);
await q("insert into mtm_hw_private.student_pins(student_id,pin_hash) values($1,'synthetic-hash-not-a-pin')",[duplicate]);
const oldSession=(await forgot('2K11 8+')).session;
const code='abcdef0123456789abcdef0123456789';
const codeId=await scalar("insert into mtm_hw_private.codes(student_id,digest,issued_by,expires_at) values($1,mtm_hw_private.token_digest('code',$2),$3,clock_timestamp()+interval '1 day') returning id r",[duplicate,code,owner]);
const codeSession='a'.repeat(64);
await q("insert into mtm_hw_private.sessions(student_id,code_id,digest,expires_at) values($1,$2,mtm_hw_private.token_digest('session',$3),clock_timestamp()+interval '1 day')",[duplicate,codeId,codeSession]);
const untouched=['students','memberships','student_leaves','paper_scores','btvn_work','attendance','student_pins','codes','sessions'];
const snapshot=async()=>Object.fromEntries(await Promise.all(untouched.map(async t=>[t,await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') r from mtm_hw_private.${t} t`)])));
const before=await snapshot();

test('trước ẩn: find mơ hồ; đăng nhập lớp cũ chọn hồ sơ cũ',async()=>{
 assert.equal((await find()).error,'ambiguous');
 assert.equal(await scalar("select student_id::text r from mtm_hw_private.btvn_identity_sessions where digest=mtm_hw_private.token_digest('btvn-identity',$1)",[oldSession]),duplicate);
});
test('từ chối cùng ID, khác người, sai lớp, thiếu nguồn',async()=>{
 assert.equal((await hide(primary,primary)).error,'invalid_duplicate_pair');
 assert.equal((await hide(other,primary)).error,'student_identity_or_class_mismatch');
 assert.equal((await hide(duplicate,primary,source,'2K10 8+')).error,'student_identity_or_class_mismatch');
 assert.equal((await hide(duplicate,primary,'')).error,'invalid_source_msg');
 assert.equal(await scalar('select count(*)::int r from mtm_hw_private.student_duplicate_links'),0);
});
test('ẩn bằng liên kết; lặp đúng nguồn vô hại; không tạo leave hay đổi active',async()=>{
 assert.deepEqual(await hide(),{ok:true,hidden:true});
 assert.deepEqual(await hide(),{ok:true,duplicate:true});
 assert.deepEqual(await snapshot(),before);
});
test('find không lớp/chính xác/lớp cũ đều chỉ còn hồ sơ chính; gợi ý không lộ lớp trùng',async()=>{
 for(const c of [null,'2K11 XPT','2K11 8+'])assert.equal((await find(name,c)).id,primary);
 const r=await find('Hồ Sơ');assert.equal(r.error,'not_found');
 assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].className,'2K11 XPT');
 assert.equal((await find('Em Khác Giả','2K11 8+')).id,other);
});
test('đăng nhập bằng tên/SĐT/chọn lớp cũ không cấp phiên cho hồ sơ trùng',async()=>{
 for(const c of ['2K11 XPT','2K11 8+']){
  const r=await forgot(c);assert.equal(r.ok,true);
  assert.equal(await scalar("select student_id::text r from mtm_hw_private.btvn_identity_sessions where digest=mtm_hw_private.token_digest('btvn-identity',$1)",[r.session]),primary);
 }
 // Cả nhánh SĐT không khớp cũng không chọn hồ sơ ẩn; chưa có PIN sẽ bị chặn ở bước PIN.
 const r=await forgot('2K11 8+','0900000003');
 assert.equal(await scalar("select student_id::text r from mtm_hw_private.btvn_identity_sessions where digest=mtm_hw_private.token_digest('btvn-identity',$1)",[r.session]),primary);
});
test('phiên cũ và mã HS của hồ sơ trùng bị từ chối; không chuyển quyền sang hồ sơ chính',async()=>{
 await assert.rejects(()=>scalar('select mtm_hw_private.btvn_student($1) r',[oldSession]),(e:any)=>e.code==='42501');
 await assert.rejects(()=>scalar('select mtm_hw_private.session_student($1) r',[codeSession]),(e:any)=>e.code==='42501');
 assert.equal((await scalar('select public.mtm_hw_resolve_code($1) r',[code])).ok,false);
 assert.equal((await scalar('select mtm_hw_private.profile($1) r',[duplicate])).centerClass,'2K11 8+','Hàm hồ sơ dùng chung vẫn đọc được lịch sử');
 assert.equal((await scalar('select mtm_hw_private.profile($1) r',[primary])).centerClass,'2K11 XPT');
});
test('XPT giữ bước PIN setup và HTTP 428 qua handler thật, không tạo/đổi PIN',async()=>{
 assert.equal((await pin('2K11 XPT')).pin,'setup');
 assert.equal((await pin('2K11 8+')).pin,'setup','Chọn lớp cũ cũng tới PIN hồ sơ chính, không dùng PIN của hồ sơ ẩn');
 const repo=new SupabaseHomeworkRepository({rpc:async()=>{throw Error('Unexpected state read');}},async body=>{
  assert.equal(body.operation,'forgot');return pin(body.className as string);
 });
 const http=createDurableHomeworkHandler(repo);
 const r=await http({method:'POST',host:'example.test',origin:'https://example.test',secure:true,body:{action:'login',gate:{fullName:name,phone,className:'2K11 XPT'}}});
 assert.equal(r.status,428);assert.equal(r.body.message,'PIN_SETUP');
 assert.deepEqual((await snapshot()).student_pins,before.student_pins);
});
test('không cho chuỗi/vòng liên kết, thay đích hay tái dùng nguồn',async()=>{
 assert.equal((await hide(duplicate,primary,'other-source')).error,'duplicate_link_conflict');
 assert.equal((await hide(primary,duplicate,'reverse','2K11 XPT','2K11 8+')).error,'duplicate_chain_or_source_conflict');
});
test('importer/profile_update thay hồ sơ không mở lại hồ sơ trùng',async()=>{
 // Cùng trường mà importer/profile_update có quyền sửa; active vẫn true từ đầu.
 await q("update mtm_hw_private.students set active=true,school='Synthetic updated' where id=$1",[duplicate]);
 assert.equal((await find()).id,primary);
 assert.equal(await scalar('select mtm_hw_private.student_login_visible($1) r',[duplicate]),false);
 await q("update mtm_hw_private.students set school='Synthetic' where id=$1",[duplicate]);
});
test('migration chạy lại giữ định nghĩa, liên kết và toàn bộ lịch sử',async()=>{
 const defs=()=>q("select oid::regprocedure::text sig,pg_get_functiondef(oid) def from pg_proc where proname in('dd_find_student','mtm_btvn_forgot','profile','session_student','btvn_student_before_sync063','mtm_hw_resolve_code','mtm_hw_confirm') order by sig");
 const first=(await defs()).rows;
 await db.exec(readFileSync('supabase/migrations-pending/'+migration,'utf8'));
 assert.deepEqual((await defs()).rows,first);
 assert.equal(await scalar('select count(*)::int r from mtm_hw_private.student_duplicate_links'),1);
 assert.deepEqual(await snapshot(),before);
});
test('anon/authenticated không đọc bảng, không gọi hàm ghi; service_role chỉ có RPC',async()=>{
 const sig='public.mtm_student_hide_duplicate(uuid,uuid,text,text,text)';
 for(const role of ['anon','authenticated']){
  assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\') r',[role,sig]),false);
  assert.equal(await scalar("select has_table_privilege($1,'mtm_hw_private.student_duplicate_links','select') r",[role]),false);
 }
 assert.equal(await scalar('select has_function_privilege(\'service_role\',$1,\'execute\') r',[sig]),true);
 assert.equal(await scalar("select has_table_privilege('service_role','mtm_hw_private.student_duplicate_links','insert') r"),false);
});
test('service_role gọi find/đăng nhập/PIN qua RPC thật với quyền SECURITY DEFINER',async()=>{
 await db.exec('set role service_role');
 try{
  assert.equal((await scalar("select public.mtm_dd_api15($1::jsonb) r",[JSON.stringify({action:'find',student:name})])).id,primary);
  assert.equal((await forgot('2K11 8+')).ok,true);
  assert.equal((await pin('2K11 XPT')).pin,'setup');
  assert.deepEqual(await hide(),{ok:true,duplicate:true});
 }finally{await db.exec('reset role');}
});
test('khác chủ hàm hoặc thân hàm so với SHA baseline thì migration dừng và rollback',async()=>{
 const sql=readFileSync('supabase/migrations-pending/'+migration,'utf8');
 const getDef=async()=>(await q("select pg_get_functiondef('public.mtm_btvn_forgot(text,text,text)'::regprocedure) r")).rows[0].r as string;
 const saved=await getDef();
 const findDef=()=>scalar("select pg_get_functiondef('mtm_hw_private.dd_find_student(text,text)'::regprocedure) r");
 const savedFind=await findDef();
 await db.exec('alter function public.mtm_btvn_forgot(text,text,text) owner to service_role');
 await assert.rejects(()=>db.exec(sql),/DUPLICATE_LOGIN_OWNER_OR_SECURITY_CHANGED/);
 await db.exec('rollback;alter function public.mtm_btvn_forgot(text,text,text) owner to postgres');
 assert.equal(await findDef(),savedFind);
 await db.exec('alter function public.mtm_btvn_forgot(text,text,text) security invoker');
 await assert.rejects(()=>db.exec(sql),/DUPLICATE_LOGIN_OWNER_OR_SECURITY_CHANGED/);
 await db.exec('rollback;alter function public.mtm_btvn_forgot(text,text,text) security definer');
 await db.exec(saved.replace('declare sid uuid;','-- synthetic drift\ndeclare sid uuid;'));
 await assert.rejects(()=>db.exec(sql),/DUPLICATE_LOGIN_SOURCE_CHANGED/);
 await db.exec('rollback');await db.exec(saved);
 assert.equal(await getDef(),saved);
 assert.equal(await findDef(),savedFind);
});

let failed=0;
for(const [label,fn] of tests){try{await fn();console.log('ok '+label);}catch(e){failed++;console.error('FAIL '+label,e instanceof Error?e.message:String(e));}}
console.log(JSON.stringify({suite:'AN-HO-SO-TRUNG',total:tests.length,passed:tests.length-failed,failed,realData:false,production:false}));
await db.close();process.exitCode=failed?1:0;
