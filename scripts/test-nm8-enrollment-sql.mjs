// PostgreSQL WASM, dữ liệu tổng hợp trong RAM. Không kết nối kho thật.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const tools=process.env.MTM_PGLITE_DIR??'T:/Claude/SanPham/btvn-web-diem-danh/tools-sql/node_modules';
const {PGlite}=await import(pathToFileURL(join(tools,'@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),checks=[];
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const sid='33333333-3333-4333-8333-333333333333',foreign='44444444-4444-4444-8444-444444444444',fresh='55555555-5555-4555-8555-555555555555';
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const rpc=(name,args,role='authenticated',principal=owner)=>db.transaction(async tx=>{
 await tx.exec('set local role '+role);
 await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[principal??'']);
 return (await tx.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
});
const check=async(name,run)=>{await run();checks.push(name);console.log('ĐẠT: '+name);};
const denied=run=>assert.rejects(run,error=>error.code==='42501');
try{
 await db.exec(`create schema auth;create schema mtm_hw_private;create role anon;create role authenticated;create role service_role;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.mtm_exam_admins(user_id uuid primary key);insert into public.mtm_exam_admins values('${owner}'),('${other}');
  create table mtm_hw_private.students(id uuid primary key,owner_id uuid not null,active boolean default true,full_name text,private_marker text);
  insert into mtm_hw_private.students values('${sid}','${owner}',true,'Học sinh mẫu','PRIVATE-FIXTURE'),('${foreign}','${other}',false,'Mẫu khác','PRIVATE-FIXTURE');
  revoke all on schema mtm_hw_private from public,anon,authenticated,service_role;`);
 // Dùng nguyên hàm kiểm quản trị đang có, không thay bằng stub cho phép tất cả.
 const base=readFileSync('supabase/migrations/202610100003_mtm_homework.sql','utf8');
 await db.exec(base.match(/create function mtm_hw_private\.admin_id\(\)[\s\S]*?end \$\$;/)[0]);
 await check('Áp migration thật, hồ sơ cũ chưa phân loại và giữ nguyên active',async()=>{
  await db.exec(readFileSync('supabase/migrations-pending/202610210092_nm8_enrollment_status.sql','utf8'));
  const rows=(await db.query('select id,enrollment_status,active from mtm_hw_private.students order by id')).rows;
  assert.deepEqual(rows,[{id:sid,enrollment_status:null,active:true},{id:foreign,enrollment_status:null,active:false}]);
 });
 await check('INSERT qua đường hiện có nhận mặc định HOC_THU, không sửa hồ sơ cũ',async()=>{
  await db.query('insert into mtm_hw_private.students(id,owner_id,full_name) values($1,$2,$3)',[fresh,owner,'Mẫu mới']);
  assert.equal(await scalar('select enrollment_status from mtm_hw_private.students where id=$1',[fresh]),'HOC_THU');
 });
 await check('Quản trị đọc đúng tập, thứ tự và không trả dữ liệu riêng',async()=>{
  assert.deepEqual(await rpc('mtm_hw_enrollment_statuses',[[fresh,sid]]),{items:[{studentId:fresh,enrollmentStatus:'HOC_THU',enrollmentVersion:0},{studentId:sid,enrollmentStatus:null,enrollmentVersion:0}]});
  assert.deepEqual(await rpc('mtm_hw_enrollment_statuses',[[]]),{items:[]});
  assert.doesNotMatch(JSON.stringify(await rpc('mtm_hw_enrollment_statuses',[[sid]])),/PRIVATE|phone|pin|fullName/);
 });
 await check('Chặn anon, service_role, HS đăng nhập, quản trị sai owner và truy cập bảng lịch sử',async()=>{
  for(const role of ['anon','service_role']){
   await denied(()=>rpc('mtm_hw_enrollment_statuses',[[sid]],role));
   await denied(()=>rpc('mtm_hw_enrollment_set',[sid,'CHINH_THUC',0],role));
  }
  for(const principal of [null,fresh,other]){
   await denied(()=>rpc('mtm_hw_enrollment_statuses',[[sid]],'authenticated',principal));
   await denied(()=>rpc('mtm_hw_enrollment_set',[sid,'CHINH_THUC',0],'authenticated',principal));
  }
  await denied(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from mtm_hw_private.enrollment_status_history');}));
 });
 await check('Chặn tập trùng, thiếu, đa chiều và quá 100 hồ sơ',async()=>{
  for(const values of [null,[sid,sid],[null],[[sid]],Array(101).fill(sid)])await assert.rejects(()=>rpc('mtm_hw_enrollment_statuses',[values]),e=>e.code==='22023');
  await denied(()=>rpc('mtm_hw_enrollment_statuses',[[sid,foreign]]));
 });
 await check('Đổi đủ bốn trạng thái, kiểm version, no-op không ghi thêm lịch sử',async()=>{
  let version=0;
  for(const status of ['HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC']){
   const out=await rpc('mtm_hw_enrollment_set',[sid,status,version]);version++;
   assert.deepEqual(out,{ok:true,studentId:sid,enrollmentStatus:status,enrollmentVersion:version});
   assert.equal((await rpc('mtm_hw_enrollment_set',[sid,status,version])).enrollmentVersion,version);
  }
  assert.equal(await scalar('select count(*)::int from mtm_hw_private.enrollment_status_history'),4);
  assert.equal(await scalar('select active from mtm_hw_private.students where id=$1',[sid]),true);
  assert.equal(await scalar('select private_marker from mtm_hw_private.students where id=$1',[sid]),'PRIVATE-FIXTURE');
  await assert.rejects(()=>rpc('mtm_hw_enrollment_set',[sid,'HOC_THU',0]),e=>e.code==='40001');
 });
 await check('Chặn trạng thái/version không hợp lệ, mọi lỗi giữ nguyên bản ghi',async()=>{
  for(const [status,version] of [[null,4],['BAD',4],['HOC_THU',null],['HOC_THU',-1]])await assert.rejects(()=>rpc('mtm_hw_enrollment_set',[sid,status,version]),e=>e.code==='22023');
  assert.equal(await scalar('select enrollment_version from mtm_hw_private.students where id=$1',[sid]),4);
  assert.equal(await scalar('select count(*)::int from mtm_hw_private.enrollment_status_history'),4);
  await assert.rejects(()=>rpc('mtm_hw_enrollment_set',[null,'HOC_THU',0]),e=>e.code==='22023');
 });
 await check('Ràng buộc DB chặn nhãn lạ, xóa hồ sơ dọn đúng lịch sử nhãn',async()=>{
  await assert.rejects(()=>db.query('update mtm_hw_private.students set enrollment_status=$1 where id=$2',['BAD',sid]),e=>e.code==='23514');
  await db.query('delete from mtm_hw_private.students where id=$1',[sid]);
  assert.equal(await scalar('select count(*)::int from mtm_hw_private.enrollment_status_history'),0);
  assert.equal(await scalar('select active from mtm_hw_private.students where id=$1',[foreign]),false);
 });
 await check('Rollback thật gỡ riêng phần nhãn, giữ hồ sơ và active còn lại',async()=>{
  await db.exec(readFileSync('supabase/migrations-pending/rollback/202610210092_nm8_enrollment_status.sql','utf8'));
  assert.equal(await scalar('select count(*)::int from mtm_hw_private.students'),2);
  assert.equal(await scalar('select active from mtm_hw_private.students where id=$1',[foreign]),false);
  assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='mtm_hw_private' and table_name='students' and column_name like 'enrollment_%'"),0);
 });
 mkdirSync('.qa-temp/nm8',{recursive:true});
 writeFileSync('.qa-temp/nm8/SQL_RECEIPT.json',JSON.stringify({engine:'PGlite PostgreSQL WASM',scope:'isolated fixture schema and actual migration 092',checks,productionApplied:false},null,2));
}finally{await db.close();}
