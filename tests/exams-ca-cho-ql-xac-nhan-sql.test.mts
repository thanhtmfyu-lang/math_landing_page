// 29/10/2026: bảng ca sau giờ học ghi "Chờ QL xác nhận" thay cho "Chưa học"/"Chưa có điểm danh". Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='CHO-QL-SQL'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'CHO-QL-SQL',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111',cid='44444444-4444-4444-8444-444444444444',sid='22222222-2222-4222-8222-222222222222';
await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K10 9+',11)",[cid,owner]);
await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids) values(true,$1,'synthetic-cho-ql',$2)",[owner,[sid,'a3333333-3333-4333-8333-333333333333']]);
await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Em giả','Synthetic','11A','MTM-000000000001')",[sid,owner,cid]);
// Ca mỗi ngày trong tuần để có cả ngày đã qua lẫn ngày tới.
for(let d=1;d<=7;d++)await q("insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode) values('2K10 9+',$1,'17:30','19:30','Offline') on conflict do nothing",[d]);
const nhan=async(fn:string,offset:number)=>(await q(`select * from mtm_hw_private.${fn}(current_date+$1::int,current_date+$1::int)`,[offset])).rows
 .filter((r:any)=>JSON.stringify(r).includes('Em giả')).map((r:any)=>Object.values(r).find(v=>typeof v==='string'&&/Chưa học|Chưa có điểm danh|Chờ QL xác nhận|Vắng/.test(v)));
const def=async(fn:string)=>(await q(`select pg_get_functiondef('mtm_hw_private.${fn}(date,date)'::regprocedure) d`)).rows[0].d as string;

// Bộ dựng schema đã chạy migration này; bản is_test chụp _real100 từ hàm đã sửa.
const migration=readFileSync('supabase/migrations-pending/20261029_2240_cho_ql_xac_nhan.sql','utf8');
await db.exec(migration);
const sauLan1=await def('hv_ca_rows');
await db.exec(migration);await db.exec('select mtm_test100.refresh_reports()');

test('ca đã qua lâu, không dữ liệu: "Chờ QL xác nhận" (cả bản web _real100); mốc cũ có trong 050', async () => {
  const goc=readFileSync('supabase/migrations-pending/202610180050_hoc_sinh_nghi_han.sql','utf8');
  assert.ok(goc.includes("else 'Chưa có điểm danh' end,")&&goc.includes("-interval '45 minutes' then 'Chưa học'"));
  assert.deepEqual(await nhan('hv_ca_rows',-7),['Chờ QL xác nhận']);
  assert.deepEqual(await nhan('hv_ca_rows_real100',-7),['Chờ QL xác nhận']);
});
test('ca chưa tới giờ vẫn "Chưa học"', async () => {
  assert.deepEqual(await nhan('hv_ca_rows_real100',7),['Chưa học']);
});
test('thứ tự nhánh: trước giờ ca → còn ca XPS → trong 45 phút sau ca → tự ghi vắng → Chờ QL', async () => {
  const d=await def('hv_ca_rows_real100');
  const i=(s:string)=>{const k=d.indexOf(s);assert.ok(k>0,s);return k;};
  const a=i("> (select t from nowvn) then 'Chưa học'"),b=i("'Chưa học (còn ca '"),c=i("-interval '45 minutes' then 'Chờ QL xác nhận'"),v=i("else false end) then 'Vắng không phép'"),e=i("else 'Chờ QL xác nhận' end,");
  assert.ok(a<b&&b<c&&c<v&&v<e);
  assert.ok(!d.includes("'Chưa có điểm danh'"));assert.ok(!d.includes("-interval '45 minutes' then 'Chưa học'"));
});
test('chạy lại vô hại, không đổi hàm lần hai', async () => {
  assert.equal(await def('hv_ca_rows'),sauLan1);
});
await finish();
