// 29/10/2026: action mark nhận studentId (em có 2 hồ sơ thật cùng khóa). Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='MARK-ID-SQL'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'MARK-ID-SQL',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111',c9='44444444-4444-4444-8444-444444444444',ch='55555555-5555-4555-8555-555555555555';
const s1='22222222-2222-4222-8222-222222222222',s2='a3333333-3333-4333-8333-333333333333';
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$2,'2K9 9+',12),($3,$2,'2K9 HSA T5',12)",[c9,owner,ch]);
await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids) values(true,$1,'synthetic-mark-id',$2)",[owner,[s1,s2]]);
await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias) values($1,$2,$3,'Em Hai Lớp','Synthetic','12A','MTM-000000000001'),($4,$2,$5,'Em Hai Lớp','Synthetic','12A','MTM-000000000002')",[s1,owner,c9,s2,ch]);
const api=async(p:any)=>(await q('select public.mtm_dd_api($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
const mark=(extra:any)=>api({action:'mark',rows:[{student:'Em Hai Lớp',class:'2K9 8+',date:'2026-10-29',status:'co_mat',source:'van_tay',timeIn:'17:29',timeOut:'19:37',note:'Vân tay',...extra}]});
const diemDanh=async()=>(await q("select student_id::text sid,class_label,status from mtm_hw_private.attendance where session_date='2026-10-29'")).rows;
const def=async()=>(await q("select pg_get_functiondef('public.mtm_dd_api(jsonb)'::regprocedure) d")).rows[0].d as string;
const migration=readFileSync('supabase/migrations-pending/20261029_2310_mark_theo_student_id.sql','utf8');
await db.exec(migration);const sauLan1=await def();await db.exec(migration);

test('không có studentId: vẫn tìm theo tên như cũ (2 hồ sơ cùng khóa → ambiguous, không ghi)', async () => {
  const r=await mark({});
  assert.equal(r.results[0].result.error,'ambiguous');
  assert.deepEqual(await diemDanh(),[]);
});
test('có studentId: ghi đúng hồ sơ đó vào lớp ca 2K9 8+', async () => {
  const r=await mark({studentId:s1});
  assert.equal(r.results[0].result,'ok');
  assert.deepEqual(await diemDanh(),[{sid:s1,class_label:'2K9 8+',status:'co_mat'}]);
});
test('studentId lạ, sai dạng hoặc hồ sơ đã nghỉ: not_found, không ghi', async () => {
  await q('delete from mtm_hw_private.attendance');
  assert.equal((await mark({studentId:'99999999-9999-4999-8999-999999999999'})).results[0].result.error,'not_found');
  assert.equal((await mark({studentId:"x' or 1=1"})).results[0].result.error,'ambiguous');
  await q('update mtm_hw_private.students set active=false where id=$1',[s2]);
  assert.equal((await mark({studentId:s2})).results[0].result.error,'not_found');
  assert.deepEqual(await diemDanh(),[]);
});
test('chạy lại vô hại, mốc cũ có trong 033', async () => {
  assert.ok(readFileSync('supabase/migrations-pending/202610180033_diem_danh_chung.sql','utf8').includes("st=mtm_hw_private.dd_find_student(rr->>'student',rr->>'class');"));
  assert.equal(await def(),sauLan1);
});
await finish();
