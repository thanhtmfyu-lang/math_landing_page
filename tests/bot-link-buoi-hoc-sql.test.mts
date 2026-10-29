// 29/10/2026: bản link buổi học cho bot Zalo làm mới từ dữ liệu web. Schema thật (PGlite), dữ liệu giả.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baselineDatabase} from '../scripts/is-test-db.mjs';

const tests:[string,()=>unknown][]=[];const test=(name:string,fn:()=>unknown)=>{tests.push([name,fn]);};
async function finish(){let failed=0;for(const [i,[name,fn]] of tests.entries()){const id='BOT-LINK-SQL'+String(i+1).padStart(2,'0');
  try{await fn();console.log('  ok  '+id+' '+name);}catch(e){failed++;console.log('  LỖI '+id+' '+name+'\n       '+(e instanceof Error?e.message:String(e)));}}
 console.log(JSON.stringify({suite:'BOT-LINK-SQL',total:tests.length,passed:tests.length-failed,failed}));process.exitCode=failed?1:0;}
const {db}=await baselineDatabase();
const q=(sql:string,args:any[]=[])=>db.query(sql,args);
const owner='11111111-1111-4111-8111-111111111111';
const c9='44444444-4444-4444-8444-444444444441',cx='44444444-4444-4444-8444-444444444442';
const call=(from:string|null,to:string|null,role='service_role')=>db.transaction(async tx=>{await tx.exec('set local role '+role);
  return (await tx.query('select public.mtm_bot_link_buoi_hoc($1::date,$2::date) d',[from,to])).rows[0] as any;}).then(r=>r.d);

await db.exec(readFileSync('supabase/migrations-pending/202610270100_is_test.sql','utf8'));
const migration=readFileSync('supabase/migrations-pending/20261029_2030_bot_link_buoi_hoc.sql','utf8');
await db.exec(migration);await db.exec(migration); // chạy lại vô hại
await q('insert into auth.users values($1)',[owner]);
await q("insert into mtm_hw_private.classes(id,owner_id,label,grade) values($1,$3,'2K9 9+',12),($2,$3,'2K9 XPT',12)",[c9,cx,owner]);
const lesson=(code:string,classes:string[],material:object,opts:{active?:boolean;isTest?:boolean;kind?:string;opens?:string;closes?:string}={})=>
 q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,publish_status,kind,is_test,opens_at,closes_at) values($1,$2,$3,$4,$5,$6,case when $6 then 'da_dang' else 'cho_duyet' end,$7,$8,$9::timestamptz,$10::timestamptz)",
  [code,owner,classes,JSON.stringify({lessonCode:code,...material}),JSON.stringify({title:'Đề '+code}),opts.active??true,opts.kind??'btvn',opts.isTest??false,opts.opens??null,opts.closes??null]);
await lesson('b2710',[c9,cx],{date:'2026-10-27',classDates:{'2K9 XPT':'2026-10-27','2K9 9+':'2026-10-26'},title:'Hàm số mũ',videoId:'abcdefghijk',handoutUrl:'https://drive.google.com/x'});
await lesson('b2810',[cx],{date:'2026-10-28',title:'Logarit'});
await lesson('thang10',[cx],{date:'2026-10-25',title:'Kiểm tra tháng 10'},{kind:'kiem-tra-thang',opens:'2026-10-25T10:00:00Z',closes:'2026-10-25T12:00:00Z'});
await lesson('bai-thu',[cx],{date:'2026-10-27',title:'Bài thử',videoUrl:'https://youtu.be/x'},{isTest:true});
await lesson('bai-tat',[cx],{date:'2026-10-27',title:'Bài tắt',videoUrl:'https://youtu.be/x'},{active:false});
await lesson('bai-sau',[cx],{date:'2026-10-27',title:'Chưa mở'},{opens:'2999-01-01T00:00:00Z'});
await lesson('ngay-hong',[cx],{date:'27/10',title:'Ngày sai định dạng'});

test('mỗi lớp một dòng theo ngày học của lớp, cờ video/handout đúng, kiểm tra tháng có loại riêng', async () => {
  const rows=await call('2026-10-20','2026-10-29') as any[];
  assert.deepEqual(rows.map(r=>[r.lop,r.ngay,r.tieuDe,r.loai,r.coVideo,r.coHandout]),[
   ['2K9 XPT','2026-10-28','Logarit','btvn',false,false],
   ['2K9 XPT','2026-10-27','Hàm số mũ','btvn',true,true],
   ['2K9 9+','2026-10-26','Hàm số mũ','btvn',true,true],
   ['2K9 XPT','2026-10-25','Kiểm tra tháng 10','kiem-tra-thang',false,false]]);
});
test('không lộ link, bài thử, bài tắt, bài chưa mở, ngày sai định dạng', async () => {
  const text=JSON.stringify(await call('2026-10-01','2026-10-31'));
  for(const s of ['abcdefghijk','drive.google','youtu','Bài thử','Bài tắt','Chưa mở','Ngày sai'])assert.ok(!text.includes(s),s);
});
test('khoảng ngày lọc đúng', async () => {
  assert.deepEqual((await call('2026-10-28','2026-10-28') as any[]).map(r=>r.tieuDe),['Logarit']);
  assert.deepEqual(await call('2026-11-01','2026-11-30'),[]);
});
test('chỉ service_role gọi được; khoảng ngày sai bị chặn', async () => {
  await assert.rejects(call('2026-10-20','2026-10-29','authenticated'));
  await assert.rejects(call('2026-10-20','2026-10-29','anon'));
  await assert.rejects(call('2026-10-29','2026-10-20'),(e:any)=>e.code==='22023');
  await assert.rejects(call('2026-01-01','2026-12-31'),(e:any)=>e.code==='22023');
  await assert.rejects(call(null,'2026-10-29'),(e:any)=>e.code==='22023');
});
await finish();
