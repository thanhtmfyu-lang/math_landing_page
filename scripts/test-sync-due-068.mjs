// Dữ liệu giả hoàn toàn, PGlite trong RAM, không gọi kho/Sheet/AI hoặc đọc credentials.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const {PGlite}=await import(pathToFileURL(join(process.env.MTM_PGLITE_DIR??'T:/Claude/SanPham/btvn-web-diem-danh/tools-sql/node_modules','@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();
// Mọi input thuộc repo; chỉ thư viện PGlite dùng dependency cài sẵn hoặc MTM_PGLITE_DIR.
const repo=fileURLToPath(new URL('..',import.meta.url));process.chdir(repo);
const artifacts=resolve(process.env.MTM_QA_ARTIFACT_DIR??'.qa-temp');mkdirSync(artifacts,{recursive:true});
const checks=[],timings=[];
const snapshot=JSON.parse(readFileSync('supabase/tests/fixtures/sync_due_before068.json','utf8'));
const migration=readFileSync('supabase/migrations-pending/202610190068_sync_due_indexed_scope.sql','utf8');
const base=readFileSync(join('supabase/tests/fixtures',snapshot.source),'utf8');
assert.equal(createHash('sha256').update(base).digest('hex'),snapshot.sha256,'Fixture source hash changed');
const owner='11111111-1111-4111-8111-111111111111',otherOwner='99999999-9999-4999-8999-999999999999';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const allWork=()=>db.query('select * from mtm_hw_private.btvn_work order by student_id,lesson_code').then(r=>r.rows);
const restore=async rows=>{
 await db.exec('truncate mtm_hw_private.btvn_work');
 for(const r of rows)await db.query('insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,drafts,receipts,next_actual_class_at,due_source_identity,expected_due_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
  [r.student_id,r.lesson_code,r.revision,JSON.stringify(r.drafts),JSON.stringify(r.receipts),r.next_actual_class_at,r.due_source_identity,r.expected_due_at]);
};
const call=(name,payload,apply=true)=>db.transaction(async tx=>(await tx.query('select '+name+'($1::jsonb,$2::boolean) result',[JSON.stringify(payload),apply])).rows[0].result);
const test=async(name,fn)=>{await fn();checks.push(name);console.log('ĐẠT: '+name);};
const equivalent=async(payload,apply=true)=>{
 const initial=await allWork();
 const startedOld=performance.now();const oldSummary=await call('mtm_hw_private.sync_due_before068',payload,apply);const oldMs=performance.now()-startedOld;
 const oldRows=await allWork();await restore(initial);
 const startedNew=performance.now();const newSummary=await call('public.mtm_btvn_sync_due',payload,apply);const newMs=performance.now()-startedNew;
 assert.deepEqual(newSummary,oldSummary);assert.deepEqual(await allWork(),oldRows);
 if(!apply)assert.deepEqual(oldRows,initial);
 return {oldMs,newMs,summary:newSummary};
};
const labels=['2K9 9+','2K9 8+','2K10 9+','2K10 8+','2K9 XPT','2K11 9+','HSA'];
const people=[
 {i:1,cls:0,name:'QA A',phone:'0900000001',parent:'0910000001'},
 {i:2,cls:1,name:'QA B',phone:'0900000002'},
 {i:3,cls:2,name:'QA C',phone:'0900000003'},
 {i:4,cls:3,name:'QA D',phone:'0900000004'},
 {i:5,cls:4,name:'QA E',phone:'0900000005'},
 {i:6,cls:0,name:'QA DUPLICATE',phone:'0900000001'},
 {i:7,cls:1,name:'QA A',phone:'0900000001'},
 {i:8,cls:2,name:'QA A',phone:'0900000001'},
 {i:9,cls:5,name:'QA OUTSIDE',phone:'0900000009'},
 {i:10,cls:6,name:'QA HSA',phone:'0900000010'},
];
const session=(label,day,person,status='C',extra={})=>({label,startsAt:day,sourceIdentity:'qa:'+label+':'+day,
 attendees:person?[{name:person.name,phone:person.phone,status}]:[],...extra});
const config=JSON.parse(readFileSync('server/btvn/class-rules.json','utf8'));
try{
 await test('Khởi tạo schema tối thiểu và đúng nguồn live, không cần migration063-067',async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema mtm_hw_private;
   create table mtm_hw_private.btvn_roster_scope(singleton boolean primary key,owner_id uuid);
   create table mtm_hw_private.classes(id uuid primary key,owner_id uuid,label text,active boolean default true);
   create table mtm_hw_private.students(id uuid primary key,owner_id uuid,class_id uuid references mtm_hw_private.classes(id),full_name text,student_phone text,parent_phone text,active boolean default true);
   create table mtm_hw_private.btvn_lessons(code text primary key,owner_id uuid,class_ids uuid[],material jsonb,active boolean default true);
   create table mtm_hw_private.btvn_work(student_id uuid references mtm_hw_private.students(id),lesson_code text references mtm_hw_private.btvn_lessons(code),revision integer default 0,drafts jsonb default '[]',receipts jsonb default '[]',next_actual_class_at timestamptz,due_source_identity text,expected_due_at timestamptz,primary key(student_id,lesson_code),check(jsonb_typeof(drafts)='array' and jsonb_array_length(drafts)<=5));
   create function mtm_hw_private.btvn_phone(v text) returns text language sql immutable set search_path='' as $fn$select regexp_replace(regexp_replace(coalesce(v,''),'[^0-9]','','g'),'^84','0')$fn$;
   create function mtm_hw_private.btvn_name(v text) returns text language sql immutable set search_path='' as $fn$select lower(regexp_replace(btrim(normalize(v,NFC)),'\\s+',' ','g'))$fn$;`);
  const rules=readFileSync('supabase/migrations-pending/202610150020_btvn_class_due_rules.sql','utf8');
  const start=rules.indexOf('create or replace function mtm_hw_private.btvn_planned_due('),end=rules.indexOf('end $plan$;',start)+'end $plan$;'.length;
  await db.exec(rules.slice(start,end));await db.exec(base);await db.exec(base.replace('public.mtm_btvn_sync_due','mtm_hw_private.sync_due_before068'));
  const actual=await scalar("select encode(sha256(convert_to(pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure),'UTF8')),'hex')");
  assert.equal(actual,snapshot.sha256);
  await db.exec('revoke all on function public.mtm_btvn_sync_due(jsonb,boolean) from public,anon,authenticated;grant execute on function public.mtm_btvn_sync_due(jsonb,boolean) to service_role;');
 });
 await test('Hash guard từ chối nguồn khác, khôi phục rồi áp068 độc lập',async()=>{
  const altered=base.replace('AS $function$','AS $function$\n-- QA different source');await db.exec(altered);
  await assert.rejects(()=>db.exec(migration),e=>String(e.message).includes('068 sync_due source changed'));await db.exec('rollback');
  await db.exec(base);await db.exec(migration);
 });
 await test('Seed nhiều lớp, trùng SĐT/tên, owner khác, draft5 và receipt nhiều lượt',async()=>{
  await db.query('insert into mtm_hw_private.btvn_roster_scope values(true,$1)',[owner]);
  for(const [i,label] of labels.entries())await db.query('insert into mtm_hw_private.classes(id,owner_id,label) values($1,$2,$3)',[uuid(100+i),owner,label]);
  await db.query('insert into mtm_hw_private.classes(id,owner_id,label) values($1,$2,$3)',[uuid(199),otherOwner,'2K9 9+']);
  for(const p of people)await db.query('insert into mtm_hw_private.students(id,owner_id,class_id,full_name,student_phone,parent_phone) values($1,$2,$3,$4,$5,$6)',[uuid(p.i),owner,uuid(100+p.cls),p.name,p.phone,p.parent??'']);
  await db.query('insert into mtm_hw_private.students(id,owner_id,class_id,full_name,student_phone,parent_phone) values($1,$2,$3,$4,$5,$6)',[uuid(99),otherOwner,uuid(199),'QA A','0900000001','']);
  for(const [i,label] of labels.entries())for(const [j,date] of ['2026-10-12','2026-10-14','2026-10-16'].entries()){
   const code='qa-due-'+i+'-'+j;
   await db.query('insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material) values($1,$2,$3,$4)',[code,owner,[uuid(100+i)],JSON.stringify({date,classDates:{[label]:date}})]);
   for(const p of people.filter(p=>p.cls===i))await db.query('insert into mtm_hw_private.btvn_work(student_id,lesson_code,revision,drafts,receipts,next_actual_class_at,due_source_identity,expected_due_at) values($1,$2,7,$3,$4,$5,$6,$5)',
    [uuid(p.i),code,JSON.stringify(Array.from({length:5},(_,n)=>({id:'qa-draft-'+n,answers:{qa:n}}))),JSON.stringify([{id:'qa-1',score:7.5,submittedAt:Date.parse('2026-10-14T17:29:00+07:00'),late:false,manual:{qa:true}},{id:'qa-2',score:9,submittedAt:Date.parse('2026-10-14T17:30:00+07:00'),late:true}]),'2026-10-14T17:30:00+07:00','qa-existing']);
  }
 });
 const cases=[
  ['Snapshot rỗng giữ nguyên mọi dữ liệu',{sessions:[]}],
  ['Đúng lớp phân xử trước tên và owner khác không ghép',{sessions:[session('2K9 8+','2026-10-15T17:30:00+07:00',people[0])]}],
  ['Trùng SĐT trong cùng lớp dùng tên để phân xử',{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',people[0]),session('2K9 9+','2026-10-16T17:30:00+07:00',people[5])]}],
  ['Tên vẫn mơ hồ giữ unmatched, không tạo dấu thật',{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',{name:'QA UNKNOWN',phone:'0900000001'})]}],
  ['SĐT PH chuẩn hóa khớp như nguồn cũ',{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',{name:'QA A',phone:'0910000001'},'ON')]}],
  ['Nhiều khóa và lớp riêng không mượn actual của nhau',{sessions:[session('2K9 XPT','2026-10-19T19:30:00+07:00',people[4]),session('2K10 8+','2026-10-23T19:30:00+07:00',people[3])]}],
  ['Slot T6 theo đúng tuần bài và khung giờ',{sessions:[session('2K10 9+','2026-10-16T19:30:00+07:00',people[2]),session('2K10 9+','2026-10-23T19:30:00+07:00',people[2])]}],
  ['Slot CN theo đúng tuần bài',{sessions:[session('2K10 9+','2026-10-18T08:00:00+07:00',people[2]),session('2K10 9+','2026-10-25T08:00:00+07:00',people[2])]}],
  ['Hai slot cùng tuần giữ trạng thái mơ hồ',{sessions:[session('2K10 9+','2026-10-16T19:30:00+07:00',people[2]),session('2K10 9+','2026-10-18T08:00:00+07:00',people[2])]}],
  ['Nghỉ rõ ràng chọn đúng buổi bù cùng thứ giờ',{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',null,'C',{cancelled:true}),session('2K9 9+','2026-10-21T19:30:00+07:00',people[0]),session('2K9 9+','2026-10-21T17:30:00+07:00',people[0],'ON')]}],
  ['replacesAt chuyển hạn sớm có nguồn rõ',{sessions:[session('2K9 9+','2026-10-13T18:00:00+07:00',people[0],'M',{replacesAt:'2026-10-14T17:30:00+07:00'})]}],
  ['Snapshot thiếu ngày hạn giữ actual/source cũ',{sessions:[session('2K9 9+','2026-10-12T17:30:00+07:00',people[0])]}],
  ['Vắng L/K không suy có mặt hoặc dời hạn',{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',people[0],'L'),session('2K9 8+','2026-10-15T17:30:00+07:00',people[1],'K')]}],
  ['HSA không có prefix2K giữ đúng giới hạn ghép của source cũ',{sessions:[session('HSA','2026-10-18T17:00:00+07:00',people[9])]}],
  ['Luật classRules client được giữ nguyên',{classRules:config,sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',people[0])]}],
 ];
 for(const [name,payload] of cases)await test(name,async()=>{await equivalent(payload);});
 await test('Dry run rollback toàn bộ revision/drafts/receipts/hạn trước và sau giống nhau',async()=>{await equivalent(cases[9][1],false);});
 await test('Apply snapshot lặp không đổi revision hoặc receipt lần nữa',async()=>{
  await call('public.mtm_btvn_sync_due',cases[10][1]);const once=await allWork();await call('public.mtm_btvn_sync_due',cases[10][1]);assert.deepEqual(await allWork(),once);
 });
 await test('Payload lỗi bị chặn trước ghi; sau lỗi dữ liệu giữ nguyên',async()=>{
  for(const payload of [{sessions:[session('NO SUCH CLASS','2026-10-14T17:30:00+07:00',people[0])]},{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',people[0],'INVALID')]},{sessions:[session('2K9 9+','2026-10-14T17:30:00+07:00',people[0],'C',{cancelled:'yes'})]}]){
   const before=await allWork();await assert.rejects(()=>call('public.mtm_btvn_sync_due',payload));assert.deepEqual(await allWork(),before);
  }
 });
 await test('Giữ nguyên quyền service_role và cấu hình security definer',async()=>{
  assert.equal(await scalar("select has_function_privilege('anon','public.mtm_btvn_sync_due(jsonb,boolean)','execute')"),false);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.mtm_btvn_sync_due(jsonb,boolean)','execute')"),false);
  assert.equal(await scalar("select has_function_privilege('service_role','public.mtm_btvn_sync_due(jsonb,boolean)','execute')"),true);
  assert.equal(await scalar("select prosecdef from pg_proc where oid='public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure"),true);
 });
 await test('Snapshot giả lớn: đối chiếu toàn state và đo thời gian trước/sau',async()=>{
  const payload={sessions:[]};
  for(let i=20;i<80;i++){
   const phone='09'+String(i).padStart(8,'0');await db.query('insert into mtm_hw_private.students(id,owner_id,class_id,full_name,student_phone,parent_phone) values($1,$2,$3,$4,$5,$6)',[uuid(1000+i),owner,uuid(100),'QA SCALE '+i,phone,'']);
  }
  const attendees=await db.query('select full_name name,student_phone phone from mtm_hw_private.students where owner_id=$1 and class_id=$2',[owner,uuid(100)]);
  for(const day of ['2026-10-12','2026-10-14','2026-10-16','2026-10-19','2026-10-21','2026-10-23','2026-10-26','2026-10-28'])payload.sessions.push({label:'2K9 9+',startsAt:day+'T17:30:00+07:00',sourceIdentity:'qa-scale:'+day,attendees:attendees.rows.map(p=>({...p,status:'C'}))});
  const result=await equivalent(payload);timings.push({fixtureStudents:70,fixtureAttendees:payload.sessions.reduce((n,s)=>n+s.attendees.length,0),baselineMs:Math.round(result.oldMs),optimizedMs:Math.round(result.newMs)});
 });
 await test('Gói native rollback11ca biên dịch, so khớp và dọn schema QA hoàn toàn',async()=>{
  await db.exec(base);
  const beforeHash=await scalar("select encode(sha256(convert_to(pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure),'UTF8')),'hex')");
  const result=await db.exec(readFileSync('supabase/tests/sync_due_068_rollback.sql','utf8'));
  const qa=result.flatMap(x=>x.rows??[]).find(x=>x.qa)?.qa;assert.equal(qa.passed,11);assert.equal(qa.total,11);
  assert.equal(await scalar("select to_regnamespace('mtm_sync_due_qa068')"),null);
  assert.equal(await scalar("select encode(sha256(convert_to(pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure),'UTF8')),'hex')"),beforeHash);
 });
 await test('Tương tác066: actual giữ nguyên bảo toàn late; actual đổi dùng gia hạn và giữ receipt/draft5',async()=>{
  await db.exec(`alter table mtm_hw_private.btvn_lessons add column kind text default 'btvn';
   create table mtm_hw_private.btvn_student_overrides(id bigint,student_id uuid,lesson_code text,kind text,due_at timestamptz,revoked_at timestamptz);`);
  const source063=readFileSync('supabase/migrations-pending/202610190063_web_sync_guards.sql','utf8');
  const helperStart=source063.indexOf('create function mtm_hw_private.btvn_override_due(');
  const helperEnd=source063.indexOf('$$;',helperStart)+3;
  await db.exec(source063.slice(helperStart,helperEnd).replace('btvn_override_due(', 'btvn_override_due_before_schedule066('));
  const source066=readFileSync('supabase/migrations-pending/202610190066_student_schedule_pause.sql','utf8');
  const triggerStart=source066.indexOf('create or replace function mtm_hw_private.btvn_override_receipts()');
  const triggerEnd=source066.indexOf('end$$;',triggerStart)+7;
  await db.exec(source066.slice(triggerStart,triggerEnd));
  const beforeHash=await scalar("select encode(sha256(convert_to(pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure),'UTF8')),'hex')");
  const result=await db.exec(readFileSync('supabase/tests/sync_due_068_066_rollback.sql','utf8'));
  const qa=result.flatMap(x=>x.rows??[]).find(x=>x.qa)?.qa;assert.equal(qa.passed,2);assert.equal(qa.total,2);
  assert.equal(await scalar("select to_regnamespace('mtm_sync_due_qa068')"),null);
  assert.equal(await scalar("select encode(sha256(convert_to(pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure),'UTF8')),'hex')"),beforeHash);
 });
 const report={at:new Date().toISOString(),passed:checks.length,total:checks.length,checks,realData:false,network:false,engine:'PGlite RAM',baseLiveSha256:snapshot.sha256,migrationSha256:createHash('sha256').update(migration).digest('hex'),timings};
 writeFileSync(join(artifacts,'QA-SYNC-DUE-068-LOCAL.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length,total:checks.length,timings}));
}catch(error){
 console.error(JSON.stringify({suite:'sync_due_068',passed:checks.length,errorCode:error.code??null,error:String(error.message),where:error.where??null}));
 process.exitCode=1;
}finally{await db.close();}
