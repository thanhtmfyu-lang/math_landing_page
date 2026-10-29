// 29/10/2026: ghi lượt ôn 3 chương xác suất trên schema thật (PGlite, dữ liệu giả), từ handler tới bảng QL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';
import probabilityTests from '../src/native/chapters/probability-tests.json';
import {createOnChuongHandler,ON_CHUONG_EXAM_IDS} from '../server/btvn/on-chuong';

// Khung chung chạy đồng bộ; các phép thử ở đây gọi DB/handler bất đồng bộ nên chờ lần lượt.
const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='ON-CHUONG-SQL'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'ON-CHUONG-SQL',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db,applied}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111',c9='44444444-4444-4444-8444-444444444441',c8='44444444-4444-4444-8444-444444444442',c10='44444444-4444-4444-8444-444444444443';
const an='22222222-2222-4222-8222-222222222221',binh='22222222-2222-4222-8222-222222222222',thu='22222222-2222-4222-8222-222222222223',khac='22222222-2222-4222-8222-222222222224';
const sAn='a'.repeat(64),sThu='b'.repeat(64);
// Gọi RPC như service_role của máy chủ Vercel.
const rpcDb={rpc:async(name:string,args:Record<string,unknown>)=>{
  try{return {data:await db.transaction(async tx=>{await tx.exec('set local role service_role');const k=Object.keys(args);
    return (await tx.query(`select public.${name}(${k.map((x,i)=>x+'=>$'+(i+1)).join(',')}) d`,k.map(x=>args[x]))).rows[0] as any;}).then(r=>r.d),error:null};}
  catch(e){return {data:null,error:{code:(e as {code?:string}).code}};}
}};
const handler=createOnChuongHandler(rpcDb);
type Q={id:string;kind:string;answer:unknown;acceptedAnswers?:string[]};
const exams=(probabilityTests as unknown as {exam:{id:string;versionHash:string;questions:Q[]}}[]).map(p=>p.exam);
const keyOf=(e:typeof exams[number])=>Object.fromEntries(e.questions.map(x=>[x.id,x.kind==='short'?x.acceptedAnswers![0]:x.answer]));
const submit=(i:number,attemptId:string,session:string,answers:Record<string,unknown>=keyOf(exams[i]))=>handler({action:'on-chuong-ghi',examId:exams[i].id,examVersionHash:exams[i].versionHash,attemptId,answers},'mtm_btvn_demo='+session);
const csv=async()=>db.transaction(async tx=>{await tx.exec('set local role service_role');return (await tx.query('select public.mtm_on_chuong_csv() c')).rows[0] as {c:string};}).then(r=>r.c);

assert.ok(applied.includes('20261029_1400_on_chuong_xac_suat.sql'));
await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
await db.exec(readFileSync('supabase/migrations-pending/20261029_1400_on_chuong_xac_suat.sql','utf8')); // chạy lại vô hại
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$4,'2K9 9+',12),($2,$4,'2K9 8+',12),($3,$4,'2K10 9+',11)",[c9,c8,c10,owner]);
for(const [id,cls,name,alias,isTest] of [[an,c9,'Nguyễn Văn An (T2)','MTM-0000000000A1',false],[binh,c8,'Trần Bình','MTM-0000000000A2',false],[thu,c9,'HS thử','MTM-0000000000A3',true],[khac,c10,'Lê Khác','MTM-0000000000A4',false]] as const)
  await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name,school,school_class,public_alias,is_test) values($1,$2,$3,$4,'Synthetic','12A',$5,$6)",[id,owner,cls,name,alias,isTest]);
await q("insert into mtm_hw_private.btvn_roster_scope(singleton,owner_id,sheet_id,protected_student_ids) values(true,$1,'synthetic-on-chuong',$2)",[owner,[an,binh]]);
for(const [sid,s] of [[an,sAn],[thu,sThu]])await q("insert into mtm_hw_private.btvn_identity_sessions(student_id,digest,expires_at) values($1,mtm_hw_private.token_digest('btvn-identity',$2),clock_timestamp()+interval '1 day')",[sid,s]);

test('bảng đề trong DB khớp 22 đề trong kho', async () => {
  assert.deepEqual((await q('select exam_id from mtm_on_chuong.de order by thu_tu')).rows.map((r:any)=>r.exam_id),[...ON_CHUONG_EXAM_IDS]);
});
test('HS đăng nhập nộp bài: máy chủ chấm lại, ghi đúng HS; gửi lại không nhân đôi', async () => {
  let r=await submit(0,'att-1',sAn);
  assert.equal(r.status,200);assert.deepEqual(r.body,{status:'ok',ten:'Nguyễn Văn An',done:1,total:22});
  r=await submit(0,'att-1',sAn);assert.equal((r.body as any).done,1);
  const mc=exams[0].questions.find(x=>x.kind==='mc')!;
  r=await submit(0,'att-2',sAn,{...keyOf(exams[0]),[mc.id]:mc.answer==='A'?'B':'A'});
  r=await submit(9,'att-3',sAn);assert.equal((r.body as any).done,2);
  assert.deepEqual((await q("select attempt_key,diem_milli from mtm_on_chuong.luot where student_id=$1 order by attempt_key",[an])).rows,
    [{attempt_key:'att-1',diem_milli:10000},{attempt_key:'att-2',diem_milli:9750},{attempt_key:'att-3',diem_milli:10000}]);
  const mine=await handler({action:'on-chuong-cua-em'},'mtm_btvn_demo='+sAn);
  assert.deepEqual([...(mine.body as any).done].sort(),[exams[0].id,exams[9].id].sort());
});
test('phiên sai/hết hạn: báo đăng nhập, không ghi', async () => {
  const before=(await q('select count(*)::int n from mtm_on_chuong.luot')).rows[0];
  assert.deepEqual((await submit(1,'att-x','c'.repeat(64))).body,{status:'login'});
  assert.deepEqual((await q('select count(*)::int n from mtm_on_chuong.luot')).rows[0],before);
});
test('bảng QL: chỉ 2K9 XPS, bỏ tài khoản thử, tính trước hạn, lượt sau hạn ghi riêng', async () => {
  await submit(2,'att-thu',sThu);
  await q("insert into mtm_on_chuong.luot(student_id,exam_id,attempt_key,diem_milli,nop_luc) values($1,$2,'muon',8000,'2026-11-09 08:00+07')",[binh,exams[3].id]);
  const lines=(await csv()).trim().split('\n');
  assert.equal(lines.length,3,lines.join('\n'));
  assert.ok(!lines.join('').includes('HS thử')&&!lines.join('').includes('Lê Khác'));
  const a=lines.find(l=>l.includes('"Nguyễn Văn An"'))!,b=lines.find(l=>l.includes('"Trần Bình"'))!;
  assert.ok(a.startsWith('"2K9 9+","Nguyễn Văn An","Chưa đủ","2/22","1/8","1/6","0/8","10"'),a);
  assert.ok(b.startsWith('"2K9 8+","Trần Bình","Chưa làm","0/22"')&&b.includes('"Cả 22 đề"')&&b.includes(',"1",'),b);
});
test('HS và trình duyệt không gọi được hàm trực tiếp', async () => {
  for(const role of ['anon','authenticated'])
    await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select public.mtm_on_chuong_csv()');}));
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select * from mtm_on_chuong.luot');}));
});
await finish();
await db.close();
