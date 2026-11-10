// 10/11/2026: điểm danh cho QL/GV đọc qua quản trị (báo cáo tuần PH). Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='DIEM-DANH-ADMIN-SQL'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'DIEM-DANH-ADMIN-SQL',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111',stranger='99999999-9999-4999-8999-999999999999';
const c8='44444444-4444-4444-8444-444444444442',c10='44444444-4444-4444-8444-444444444443';
const an='22222222-2222-4222-8222-222222222221',binh='22222222-2222-4222-8222-222222222222',chi='22222222-2222-4222-8222-222222222223',
 thu='22222222-2222-4222-8222-222222222224',nghi='22222222-2222-4222-8222-222222222225',khac='22222222-2222-4222-8222-222222222226';
const call=(day:string|null,to:string|null=null,user=owner,role='authenticated')=>db.transaction(async tx=>{await tx.exec('set local role '+role);
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  return (await tx.query('select public.mtm_diem_danh_admin($1::date,$2::date) d',[day,to??day])).rows[0] as any;}).then(r=>r.d);

await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
const migration=readFileSync('supabase/migrations-pending/20261110_1030_diem_danh_admin.sql','utf8');
await db.exec(migration);await db.exec(migration); // chạy lại vô hại
const today=(await q("select (current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date::text d")).rows[0] as {d:string};
const day=today.d,lastWeek=(await q("select ($1::date-7)::text d",[day])).rows[0] as {d:string};
await q('insert into auth.users values($1),($2)',[owner,stranger]);
await q('insert into public.mtm_exam_admins(user_id) values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$3,'2K9 8+',12),($2,$3,'2K10 9+',11)",[c8,c10,owner]);
for(const [id,cls,name,isTest] of [[an,c8,'Nguyễn Văn An',false],[binh,c8,'Trần Bình',false],[chi,c8,'Lê Chi',false],[thu,c8,'HS thử',true],[nghi,c8,'Phạm Nghỉ',false],[khac,c10,'Lê Khác',false]] as const)
  await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test) values($1,$2,$3,$4,'Synthetic','12A',$5,$6)",[id,owner,cls,name,'MTM-'+id.slice(-12).toUpperCase(),isTest]);
await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids) values(true,$1,'synthetic-truoc-ca',$2)",[owner,[an,binh]]);
// Phạm Nghỉ nghỉ hẳn từ hôm qua: không còn trong ca.
await q("insert into mtm_hw_private.student_leaves(student_id,leave_date,applied_at) values($1,$2::date-1,clock_timestamp())",[nghi,day]);
await q("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode) values('2K9 8+',extract(isodow from $1::date)::int,'17:30','19:30','Offline') on conflict do nothing",[day]);
await q("insert into mtm_hw_private.attendance(student_id,class_label,session_date,status,source) values($1,'2K9 8+',$2::date,'co_mat','van_tay')",[an,day]);
const err=async(p:Promise<unknown>,code:string)=>{try{await p;assert.fail('không lỗi');}catch(e:any){assert.match(String(e?.message),new RegExp(code));}};
test('QL đọc được: đúng HS đang học, có trạng thái, không HS thử/nghỉ hẳn', async () => {
  const out=await call(day);const names=out.rows.map((r:any)=>r.hocSinh);
  assert.ok(names.includes('Nguyễn Văn An'),'có An');assert.ok(!names.includes('HS thử'));assert.ok(!names.includes('Phạm Nghỉ'));
  const an1=out.rows.find((r:any)=>r.hocSinh==='Nguyễn Văn An');assert.equal(an1.ca,'2K9 8+');assert.ok(an1.trangThai,'có trạng thái');
  assert.ok(!JSON.stringify(out).match(/phone|sdt|hoc_phi|ghi_chu|gio_vao/i),'không lộ dữ liệu riêng');
});
test('người không phải quản trị bị chặn', async () => {await err(call(day,null,stranger),'MTM_DIEM_DANH_ADMIN_ONLY');});
test('khoảng ngày sai bị chặn', async () => {
  await err(call(day,lastWeek.d),'MTM_DIEM_DANH_RANGE');
  const far=(await q("select ($1::date-20)::text d",[day])).rows[0] as {d:string};await err(call(far.d,day),'MTM_DIEM_DANH_RANGE');
  await err(call(null),'MTM_DIEM_DANH_RANGE');
});
await finish();
