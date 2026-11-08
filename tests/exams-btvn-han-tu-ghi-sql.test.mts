// 08/11/2026: BTVN tự ghi hạn nộp khi đăng bài (migration 106). Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='HAN-TU-GHI'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'HAN-TU-GHI',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
// Luật hạn đang chạy trên DB thật = thân hàm v3 (075, bước 2) + bản vá cùng thứ 2K9 (29/10).
const v3=readFileSync('supabase/migrations-pending/202610200075_btvn_due_rules_v3.sql','utf8');
const fn=v3.slice(v3.indexOf('create or replace function mtm_hw_private.btvn_planned_due'),v3.indexOf('end $plan$;')+'end $plan$;'.length);
await db.exec(fn);
await db.exec(readFileSync('supabase/migrations-pending/20261029_1215_han_btvn_cung_thu_2k9.sql','utf8'));

const owner='11111111-1111-4111-8111-111111111111';
const c9='44444444-4444-4444-8444-444444444441',c8='44444444-4444-4444-8444-444444444442',c11='44444444-4444-4444-8444-444444444443',
 c109='44444444-4444-4444-8444-444444444444',c108='44444444-4444-4444-8444-444444444445';
const an='22222222-2222-4222-8222-222222222221',binh='22222222-2222-4222-8222-222222222222',chi='22222222-2222-4222-8222-222222222223',
 thu='22222222-2222-4222-8222-222222222224',nghi='22222222-2222-4222-8222-222222222225',dung='22222222-2222-4222-8222-222222222226',
 em109='22222222-2222-4222-8222-222222222227',em108='22222222-2222-4222-8222-222222222228';
await q('insert into auth.users values($1)',[owner]);
await q(`insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$6,'2K9 9+',12),($2,$6,'2K9 8+',12),($3,$6,'2K11 9+',10),($4,$6,'2K10 9+',11),($5,$6,'2K10 8+',11)`,[c9,c8,c11,c109,c108,owner]);
for(const [id,cls,isTest] of [[an,c9,false],[binh,c9,false],[thu,c9,true],[nghi,c9,false],[chi,c8,false],[dung,c11,false],[em109,c109,false],[em108,c108,false]] as const)
  await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test) values($1,$2,$3,$4,'Synthetic','12A',$5,$6)",[id,owner,cls,'HS '+id.slice(-2),'MTM-'+id.slice(-12).toUpperCase(),isTest]);
await q("insert into mtm_hw_private.student_leaves(student_id,leave_date,applied_at) values($1,'2026-11-01',clock_timestamp())",[nghi]);
// Bài cũ đã có dòng + hạn ghi tay trước khi áp migration: giữ nguyên.
const lesson=(code:string,cls:string[],material:object,isTest=false)=>q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,is_test) values($1,$2,$3,$4,$5,true,'da_dang','btvn',$6)",
 [code,owner,cls,JSON.stringify(material),JSON.stringify({title:'BTVN '+code}),isTest]);
await lesson('bai-cu',[c9],{date:'2026-11-02'});
await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,expected_due_at) values($1,'bai-cu','2026-11-09T17:00:00+07:00')",[an]);
await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,'bai-cu')",[binh]);

const migration=readFileSync('supabase/migrations-pending/202611080106_btvn_han_tu_ghi.sql','utf8');
await db.exec(migration);await db.exec(migration); // chạy lại vô hại
const due=async(sid:string,code:string)=>{const r=(await q("select to_char(expected_due_at at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI') d from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2",[sid,code])).rows[0] as any;return r?r.d:undefined;};

test('bù bài cũ: hạn ghi tay giữ nguyên, dòng trống hạn được điền đúng thứ tuần sau', async()=>{
  assert.equal(await due(an,'bai-cu'),'2026-11-09 17:00');
  assert.equal(await due(binh,'bai-cu'),'2026-11-09 17:00');
});
test('đăng bài mới: mọi HS đang học có dòng + hạn cùng thứ tuần sau, giờ vào ca − 30 phút', async()=>{
  await lesson('bai-t2',[c9],{date:'2026-11-09'});
  assert.equal(await due(an,'bai-t2'),'2026-11-16 17:00');
  assert.equal(await due(binh,'bai-t2'),'2026-11-16 17:00');
  await lesson('bai-t3-8',[c8],{date:'2026-11-10'});
  assert.equal(await due(chi,'bai-t3-8'),'2026-11-17 17:00');
  await lesson('bai-11',[c11],{date:'2026-11-12'});
  assert.equal(await due(dung,'bai-11'),'2026-11-19 19:00');
});
test('2K10 9+ và 8+ dùng chung bài: mỗi lớp theo ngày + thứ của chính lớp mình', async()=>{
  await lesson('bai-2k10',[c109,c108],{date:'2026-11-13',classDates:{'2K10 9+':'2026-11-13','2K10 8+':'2026-11-13'}});
  assert.equal(await due(em109,'bai-2k10'),'2026-11-20 19:00');
  assert.equal(await due(em108,'bai-2k10'),'2026-11-20 19:00');
  await lesson('bai-2k10-t3',[c109],{date:'2026-11-10'});
  assert.equal(await due(em109,'bai-2k10-t3'),'2026-11-17 19:00');
});
test('không tạo dòng cho HS thử, HS nghỉ hẳn; bài thử chỉ cho HS thử', async()=>{
  assert.equal(await due(thu,'bai-t2'),undefined);
  assert.equal(await due(nghi,'bai-t2'),undefined);
  await lesson('bai-thu',[c9],{date:'2026-11-09'},true);
  assert.equal(await due(thu,'bai-thu'),'2026-11-16 17:00');
  assert.equal(await due(an,'bai-thu'),undefined);
});
test('đổi ngày bài: hạn tự tính đổi theo, hạn ghi tay khác giữ nguyên', async()=>{
  await lesson('bai-doi',[c9],{date:'2026-11-09'});
  await q("update mtm_hw_private.btvn_work set expected_due_at='2026-11-20T17:00:00+07:00' where student_id=$1 and lesson_code='bai-doi'",[binh]);
  await q(`update mtm_hw_private.btvn_lessons set material='{"date":"2026-11-11"}' where code='bai-doi'`);
  assert.equal(await due(an,'bai-doi'),'2026-11-18 17:00');
  assert.equal(await due(binh,'bai-doi'),'2026-11-20 17:00');
});
test('HS mở bài tạo dòng mới (đường cũ) cũng tự có hạn; hạn đã ghi không bị đè', async()=>{
  await q("delete from mtm_hw_private.btvn_work where student_id=$1 and lesson_code='bai-t2'",[an]);
  await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code) values($1,'bai-t2')",[an]);
  assert.equal(await due(an,'bai-t2'),'2026-11-16 17:00');
  await q("insert into mtm_hw_private.btvn_work(student_id,lesson_code,expected_due_at) values($1,'bai-cu','2026-11-30T10:00:00+07:00') on conflict(student_id,lesson_code) do update set expected_due_at=excluded.expected_due_at",[chi]).catch(()=>{});
  await q("update mtm_hw_private.btvn_work set revision=revision+1 where student_id=$1 and lesson_code='bai-cu'",[an]);
  assert.equal(await due(an,'bai-cu'),'2026-11-09 17:00');
});
test('bài không có ngày hoặc lớp lạ: đăng vẫn thành công, không có hạn', async()=>{
  await lesson('bai-khong-ngay',[c9],{});
  const r=(await q("select count(*)::int n from mtm_hw_private.btvn_lessons where code='bai-khong-ngay'")).rows[0] as any;
  assert.equal(r.n,1);
  assert.equal(await due(an,'bai-khong-ngay'),undefined);
});
test('bài thi/khác BTVN không tạo dòng', async()=>{
  await q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,is_test) values('de-thi',$1,$2,'{\"date\":\"2026-11-09\"}','{}',true,'da_dang','exam',false)",[owner,[c9]]).catch(()=>{});
  assert.equal(await due(an,'de-thi'),undefined);
});
await finish();
