// 29/10/2026: báo điểm BTVN trước ca trên web (QL/GV). Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='TRUOC-CA-SQL'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'TRUOC-CA-SQL',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111',stranger='99999999-9999-4999-8999-999999999999';
const c8='44444444-4444-4444-8444-444444444442',c10='44444444-4444-4444-8444-444444444443';
const an='22222222-2222-4222-8222-222222222221',binh='22222222-2222-4222-8222-222222222222',chi='22222222-2222-4222-8222-222222222223',
 thu='22222222-2222-4222-8222-222222222224',nghi='22222222-2222-4222-8222-222222222225',khac='22222222-2222-4222-8222-222222222226';
const call=(day:string|null,user=owner,role='authenticated')=>db.transaction(async tx=>{await tx.exec('set local role '+role);
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  return (await tx.query('select public.mtm_truoc_ca_admin($1::date) d',[day])).rows[0] as any;}).then(r=>r.d);

await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
const migration=readFileSync('supabase/migrations-pending/20261029_2000_bao_diem_truoc_ca.sql','utf8');
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
const lesson=(code:string,cls:string,date:string,isTest=false)=>q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,is_test) values($1,$2,$3,$4,$5,true,'da_dang','btvn',$6)",
 [code,owner,[cls],JSON.stringify({lessonCode:code,date}),JSON.stringify({title:'BTVN '+code}),isTest]);
await lesson('bai-tuan-truoc',c8,lastWeek.d);await lesson('bai-hom-truoc',c8,day);await lesson('bai-thu',c8,lastWeek.d,true);
const due=(sid:string,code:string,at:string,receipts:unknown[]=[])=>q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,expected_due_at,next_actual_class_at,receipts) values($1,$2,$3::timestamptz,$4::timestamptz,$5)",
 [sid,code,at,'2000-01-01T00:00:00Z',JSON.stringify(receipts)]);
const r=(id:string,score:number)=>({attemptId:id,attemptNumber:1,score,submittedAt:Date.now()-3600_000,elapsedSeconds:60,late:false,timedOut:false});
const at17=day+'T17:00:00+07:00';
await due(an,'bai-tuan-truoc',at17,[r('a1',6.5),r('a2',8)]);
await due(binh,'bai-tuan-truoc',at17,[r('b1',5)]);
await due(chi,'bai-tuan-truoc',at17);
await due(thu,'bai-thu',at17,[r('t1',10)]);
// Bài giao hôm nay hạn tuần sau: không phải bài tới hạn ở ca hôm nay.
for(const sid of [an,binh,chi])await due(sid,'bai-hom-truoc',(await q("select ($1::date+7)::text d",[day])).rows[0].d+'T17:00:00+07:00');

test('ca hôm nay: đúng HS đang học, bài tới hạn tuần trước, điểm cao nhất / Chưa làm', async () => {
  const out=await call(day);
  assert.equal(out.day,day);
  const rows=out.rows as any[];
  assert.deepEqual(rows.map(x=>[x.ca,x.hocSinh,x.bai,x.diem,x.soLan]),[
   ['2K9 8+','Lê Chi','BTVN bai-tuan-truoc',null,0],
   ['2K9 8+','Nguyễn Văn An','BTVN bai-tuan-truoc',8,2],
   ['2K9 8+','Trần Bình','BTVN bai-tuan-truoc',5,1]]);
});
test('không lộ HS thử, HS nghỉ hẳn, lớp khác không học ca', async () => {
  const text=JSON.stringify(await call(day));
  for(const name of ['HS thử','Phạm Nghỉ','Lê Khác','bai-thu','bai-hom-truoc'])assert.ok(!text.includes(name),name);
});
test('ngày không có ca: danh sách rỗng', async () => {
  const other=(await q("select ($1::date+1)::text d",[day])).rows[0].d;
  assert.deepEqual((await call(other)).rows,[]);
});
test('chỉ quản trị gọi được; ngày ngoài khoảng bị chặn', async () => {
  await assert.rejects(call(day,stranger),(e:any)=>e.code==='42501');
  await assert.rejects(call(day,owner,'anon'));
  await assert.rejects(call('2000-01-01'),(e:any)=>e.code==='22023');
  await assert.rejects(call(null),(e:any)=>e.code==='22023');
});
await finish();
