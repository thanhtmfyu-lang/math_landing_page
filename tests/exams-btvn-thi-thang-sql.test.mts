// PostgreSQL WASM trong RAM, danh tính/lượt làm giả; không kết nối dịch vụ thật.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';

const root=process.env.MTM_ROOT??process.cwd();
const db=new PGlite(),checks:string[]=[];
const source=(file:string)=>readFileSync(join(root,'supabase/migrations-pending',file),'utf8');
function originalFunction(file:string,name:string){
 const sql=source(file),start=sql.search(new RegExp('create(?: or replace)? function public\\.'+name+'\\('));
 assert.ok(start>=0,'Có hàm nguồn '+name);
 const end=sql.indexOf('end$$;',start);assert.ok(end>=start);
 return sql.slice(start,end+7);
}
const q=(sql:string,args:unknown[]=[])=>db.query(sql,args);
const scalar=async(sql:string,args:unknown[]=[])=>Object.values((await q(sql,args)).rows[0])[0] as any;
const rpc=(name:string,args:unknown[],role='service_role')=>db.transaction(async(tx:any)=>{
 await tx.exec('set local role '+role);
 return (await tx.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
});
const check=async(name:string,fn:()=>Promise<void>)=>{await fn();checks.push(name);console.log('ĐẠT: '+name);};
const sid='22222222-2222-4222-8222-222222222221',peer='22222222-2222-4222-8222-222222222222';
const legacySid='22222222-2222-4222-8222-222222222223';
const owner='11111111-1111-4111-8111-111111111111',cid='44444444-4444-4444-8444-444444444441';
const base='thi-thang-2026-10-lop-gia',code=(phase:string,ma:number,b=base)=>`${b}-${phase}-ma-${ma}`;
const draft=(id:string,at=1000)=>({attemptId:id,startedAt:at,submittedAt:null,answers:{},revision:0,updatedAt:at,deadline:at+7200000});
const receipt=(id:string)=>({attemptId:id,attemptNumber:1,submittedAt:2000,score:7,late:false,timedOut:false,elapsedSeconds:1});
const read=(lesson=code('thi',1),session='fixture-one')=>rpc('mtm_btvn_read',[session,lesson]);
const commit=(lesson:string,revision:number,drafts:unknown[],receipts:unknown[]=[],session='fixture-one')=>rpc('mtm_btvn_commit',[session,lesson,revision,JSON.stringify(drafts),JSON.stringify(receipts)]);
const progress=(snap:any,lesson:string)=>snap.lessons.find((l:any)=>l.lessonCode===lesson);
const upload=(lesson:string,attempt:string,action:string,sha:string|null=null,session='fixture-one',role='service_role')=>rpc('mtm_tu_luan_student',[session,lesson,attempt,action,sha,sha?800:null],role);
const store=async(image:any,createdAt?:string)=>q("insert into storage.objects(bucket_id,name,metadata,created_at) values('mtm-tu-luan',$1,$2,coalesce($3::timestamptz,clock_timestamp()))",[image.path,JSON.stringify({size:800,mimetype:'image/jpeg'}),createdAt??null]);
const addPeriod=async(b:string)=>{
 for(const phase of ['thi','btvn'])for(const ma of [1,2]){
  const lesson=code(phase,ma,b);
  await q(`insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,kind,opens_at,closes_at)
   values($1,$2,$3,$4,'{"title":"Fixture exam","questions":[{"id":"essay-fixture","kind":"self"}]}',true,$5,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`,
  [lesson,owner,[cid],JSON.stringify({lessonCode:lesson,date:'2026-10-30',classNames:['Lớp giả']}),phase==='thi'?'kiem-tra-thang':'btvn']);
 }
};

try{
 // Schema tối thiểu khớp các cột read/commit sử dụng; chạy nguyên hàm SQL gốc,
 // wrapper monthly cũ và guard is_test thật, rồi mới áp migration đang kiểm.
 await db.exec(`create role anon;create role authenticated;create role service_role;create role mtm_btvn_publisher;
 create schema mtm_hw_private;create schema mtm_test100;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
 create table public.mtm_exam_admins(user_id uuid);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,created_at timestamptz default clock_timestamp());
 alter table storage.objects enable row level security;
 create table mtm_hw_private.classes(id uuid primary key,label text);
 create table mtm_hw_private.students(id uuid primary key,owner_id uuid,class_id uuid,full_name text,is_test boolean default false,active boolean default true);
 create table mtm_hw_private.btvn_lessons(code text primary key,owner_id uuid,class_ids uuid[],material jsonb,exam jsonb,active boolean,kind text,opens_at timestamptz,closes_at timestamptz,is_test boolean default false);
 create table mtm_hw_private.btvn_work(student_id uuid,lesson_code text,revision integer default 0,drafts jsonb default '[]',receipts jsonb default '[]',next_actual_class_at timestamptz,primary key(student_id,lesson_code));
 create table mtm_test100.cleanup_jobs(student_id uuid);
 create table mtm_hw_private.fixture_sessions(token text primary key,student_id uuid);
 create function mtm_hw_private.btvn_student(p_session text) returns uuid language plpgsql security definer set search_path='' as $$
 declare sid uuid;begin select student_id into sid from mtm_hw_private.fixture_sessions where token=p_session;
 if sid is null then raise exception 'Student session required' using errcode='42501';end if;return sid;end$$;`);
 // Tên fixture không có whitespace Unicode; shim chỉ phục vụ gate 099 trước nâng cấp.
 await db.exec("create function mtm_hw_private.js_trim(p text) returns text language sql immutable as $$select btrim(p)$$;");
 await db.exec(originalFunction('202610150010_btvn_entry.sql','mtm_btvn_read'));
 await db.exec(originalFunction('202610150005_btvn.sql','mtm_btvn_commit'));
 await db.exec(`alter function public.mtm_btvn_read(text,text) rename to mtm_btvn_read_before_rank;
 alter function public.mtm_btvn_commit(text,text,integer,jsonb,jsonb) rename to mtm_btvn_commit_before_rank;`);
 await db.exec(originalFunction('202610150013_btvn_rank_monthly.sql','mtm_btvn_read'));
 await db.exec(originalFunction('202610150013_btvn_rank_monthly.sql','mtm_btvn_commit'));
 const testSql=source('202610270100_is_test.sql');
 const guardStart=testSql.indexOf('create function mtm_test100.guard_work()'),guardEnd=testSql.indexOf('end$$;',guardStart);
 assert.ok(guardStart>=0&&guardEnd>guardStart);await db.exec(testSql.slice(guardStart,guardEnd+7));
 await db.exec('create trigger is_test100_work before insert or update on mtm_hw_private.btvn_work for each row execute function mtm_test100.guard_work();');
 await db.exec(source('202610270099_tu_luan_upload.sql'));
 await db.exec('create trigger is_test100_images before insert or update on mtm_hw_private.tu_luan_images for each row execute function mtm_test100.guard_work();');
 // scoped100 gọi read theo tên lúc chạy; rename wrapper không được làm mất startedAt.
 await db.exec(originalFunction('202610270100_is_test.sql','mtm_btvn_read_scoped100'));
 await db.exec(`revoke all on function public.mtm_btvn_read_before_rank(text,text),public.mtm_btvn_commit_before_rank(text,text,integer,jsonb,jsonb),public.mtm_btvn_read_scoped100(text,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;
 grant execute on function public.mtm_btvn_read_scoped100(text,text) to service_role;`);
 await q('insert into auth.users values($1)',[owner]);
 await q('insert into mtm_hw_private.classes values($1,$2)',[cid,'Lớp giả']);
 await q("insert into mtm_hw_private.students(id,owner_id,class_id,full_name) values($1,$4,$5,'Fixture one'),($2,$4,$5,'Fixture two'),($3,$4,$5,'Fixture legacy')",[sid,peer,legacySid,owner,cid]);
 await q("insert into mtm_hw_private.fixture_sessions values('fixture-one',$1),('fixture-two',$2),('fixture-legacy',$3)",[sid,peer,legacySid]);
 // Lượt và ảnh đã reserve bằng 099 phải tiếp tục được sau migration101.
 const legacyBase='thi-thang-2025-12-lop-gia';await addPeriod(legacyBase);
 const legacyMa=await scalar("select 1+(get_byte(sha256(convert_to($1||'|fixture legacy|Lớp giả','UTF8')),0)&1)",[legacyBase]);
 const legacyCode=code('thi',legacyMa,legacyBase);
 await read(legacyCode,'fixture-legacy');assert.equal((await commit(legacyCode,0,[draft('legacy-start')],[],'fixture-legacy')).ok,true);
 const legacyImage=await upload(legacyCode,'legacy-start','reserve','e'.repeat(64),'fixture-legacy');
 await db.exec(source('202610300101_thi_thang_choice.sql'));
 await addPeriod(base);

 await check('chưa bắt đầu: cả hai mã không có startedAt; chỉ đọc/chọn chưa khóa',async()=>{
  const s=await read(code('thi',2));assert.equal(progress(s,code('thi',1)).startedAt,null);assert.equal(progress(s,code('thi',2)).startedAt,null);
  assert.equal(await scalar('select sum(jsonb_array_length(drafts)) from mtm_hw_private.btvn_work where student_id=$1',[sid]),0);
 });
 await check('start mã 101 lưu ngay; reload/scoped100 thấy startedAt dù chưa nộp',async()=>{
  await read();assert.equal((await commit(code('thi',1),0,[draft('first')])).ok,true);
  const s=await rpc('mtm_btvn_read_scoped100',['fixture-one',code('thi',2)]);
  assert.equal(progress(s,code('thi',1)).startedAt,1000);assert.equal(progress(s,code('thi',1)).submittedAt,null);
  assert.equal(progress(s,code('thi',2)).startedAt,null);
 });
 await check('hai start từ snapshot cũ: mã đã thắng khóa mã kia, không ghi nháp thứ hai',async()=>{
  assert.equal((await commit(code('thi',2),0,[draft('loser')])).ok,false);
  assert.equal(await scalar('select jsonb_array_length(drafts) from mtm_hw_private.btvn_work where student_id=$1 and lesson_code=$2',[sid,code('thi',2)]),0);
 });
 await check('hai request start song song cho hai mã: chỉ một thắng, reload giữ đúng mã thắng',async()=>{
  // PGlite xếp hàng các transaction trên một kết nối; hai request phía gọi
  // cùng được phát trước khi đợi kết quả. Đây không phải kiểm nhiều kết nối PG.
  const winningCodes=new Set<number>();
  for(const order of [[1,2],[2,1]]){
   const period='thi-thang-2026-04-race-'+order.join('-');await addPeriod(period);
   await Promise.all(order.map(ma=>read(code('thi',ma,period))));
   const initial=(await q('select revision,drafts,receipts from mtm_hw_private.btvn_work where student_id=$1 and lesson_code in ($2,$3)',[sid,code('thi',1,period),code('thi',2,period)])).rows;
   assert.equal(initial.length,2);for(const row of initial)assert.deepEqual(row,{revision:0,drafts:[],receipts:[]});
   let release!:()=>void;
   const ready=new Promise<void>(resolve=>{release=resolve;});
   let dispatched=0;
   const requests=order.map(async ma=>{
    await ready;dispatched++;
    return {ma,result:await commit(code('thi',ma,period),0,[draft('race-'+ma,3000+ma)])};
   });
   release();
   const results=await Promise.all(requests);assert.equal(dispatched,2);
   const winners=results.filter(({result})=>result.ok===true),losers=results.filter(({result})=>result.ok===false);
   assert.equal(winners.length,1);assert.equal(losers.length,1);
   const winner=winners[0].ma,loser=losers[0].ma;
   winningCodes.add(winner);
   const persisted=()=>q('select lesson_code,revision,drafts,receipts from mtm_hw_private.btvn_work where student_id=$1 and lesson_code in ($2,$3) order by lesson_code',[sid,code('thi',1,period),code('thi',2,period)]);
   const saved=(await persisted()).rows;
   assert.equal(saved.length,2);
   for(const row of saved){
    const won=row.lesson_code===code('thi',winner,period);
    assert.equal(row.revision,won?1:0);
    assert.deepEqual(row.drafts,won?[draft('race-'+winner,3000+winner)]:[]);
    assert.deepEqual(row.receipts,[]);
   }
   for(const ma of order){
    const snapshot=await rpc('mtm_btvn_read_scoped100',['fixture-one',code('thi',ma,period)]);
    assert.equal(progress(snapshot,code('thi',winner,period)).startedAt,3000+winner);
    assert.equal(progress(snapshot,code('thi',loser,period)).startedAt,null);
   }
   assert.equal((await commit(code('thi',loser,period),0,[draft('race-loser-retry')])).ok,false);
   assert.deepEqual((await persisted()).rows,saved);
  }
  assert.deepEqual([...winningCodes].sort(),[1,2]);
 });
 await check('giữ khóa qua lưu/khôi phục; không xóa, thay attempt hoặc reset startedAt',async()=>{
  assert.equal((await commit(code('thi',1),1,[{...draft('first'),answers:{q1:'A'}}])).ok,true);
  assert.equal((await commit(code('thi',1),2,[])).ok,false);
  assert.equal((await commit(code('thi',1),2,[draft('replacement')])).ok,false);
  assert.equal((await commit(code('thi',1),2,[draft('first',1500)])).ok,false);
  assert.equal(progress(await read(code('thi',2)),code('thi',1)).startedAt,1000);
 });
 await check('BTVN cùng mã bị chặn ngay sau start, mã còn lại được làm; nộp thi giữ lựa chọn',async()=>{
  await read(code('btvn',1));await read(code('btvn',2));
  assert.equal((await commit(code('btvn',1),0,[draft('wrong-homework')])).ok,false);
  assert.equal((await commit(code('btvn',2),0,[draft('right-homework')])).ok,true);
  assert.equal((await commit(code('thi',1),2,[{...draft('first'),submittedAt:2000}],[receipt('first')])).ok,true);
  assert.equal((await commit(code('thi',2),0,[draft('after-submit')])).ok,false);
 });
 await check('mỗi HS và kỳ riêng: HS khác chọn mã 102 không ảnh hưởng mã 101',async()=>{
  await read(code('thi',2),'fixture-two');assert.equal((await commit(code('thi',2),0,[draft('peer')],[],'fixture-two')).ok,true);
  const s=await read(code('thi',1),'fixture-two');assert.equal(progress(s,code('thi',1)).startedAt,null);assert.equal(progress(s,code('thi',2)).startedAt,1000);
  const another='thi-thang-2026-11-lop-gia';await addPeriod(another);await read(code('thi',2,another));
  assert.equal((await commit(code('thi',2,another),0,[draft('next-period')])).ok,true);
 });
 await check('HS offline: nộp BTVN mã 101 xác nhận làm giấy 102, không được nộp BTVN 102',async()=>{
  const offline='thi-thang-2026-09-lop-gia';await addPeriod(offline);
  await read(code('btvn',1,offline));await read(code('btvn',2,offline));
  assert.equal((await commit(code('btvn',1,offline),0,[{...draft('paper'),submittedAt:2000}],[receipt('paper')])).ok,true);
  assert.equal((await commit(code('btvn',2,offline),0,[draft('wrong-paper')])).ok,false);
 });
 await check('CAS lỗi/start chưa commit không khóa; có thể bắt đầu mã còn lại',async()=>{
  const fresh='thi-thang-2026-08-lop-gia';await addPeriod(fresh);await read(code('thi',1,fresh));await read(code('thi',2,fresh));
  assert.equal((await commit(code('thi',1,fresh),99,[draft('failed')])).ok,false);
  assert.equal((await commit(code('thi',2,fresh),0,[draft('successful')])).ok,true);
 });
 await check('hết ca chưa nộp: reload vẫn giữ mã đã bắt đầu và chỉ cho BTVN mã kia',async()=>{
  const closed='thi-thang-2026-08-lop-gia';
  await q("update mtm_hw_private.btvn_lessons set closes_at=clock_timestamp()-interval '1 second' where code in ($1,$2)",[code('thi',1,closed),code('thi',2,closed)]);
  const s=await read(code('btvn',1,closed));assert.equal(progress(s,code('thi',2,closed)).startedAt,1000);assert.equal(progress(s,code('thi',2,closed)).submittedAt,null);
  await read(code('btvn',2,closed));assert.equal((await commit(code('btvn',2,closed),0,[draft('wrong-after-close')])).ok,false);
  assert.equal((await commit(code('btvn',1,closed),0,[draft('remaining-after-close')])).ok,true);
 });
 await check('mã 102 cũng khóa 101 trước nộp; bài BTVN thường giữ CAS hiện có',async()=>{
  assert.equal((await commit(code('thi',1),0,[draft('peer-loser')],[],'fixture-two')).ok,false);
  const ordinary='btvn-fixture-ordinary';await q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,kind) values($1,$2,$3,$4,'{}',true,'btvn')",[ordinary,owner,[cid],JSON.stringify({lessonCode:ordinary,date:'2026-10-30'})]);
  await read(ordinary);assert.equal((await commit(ordinary,0,[draft('normal')])).ok,true);assert.equal((await commit(ordinary,0,[draft('stale')])).ok,false);
  assert.equal(Object.hasOwn(progress(await read(ordinary),ordinary),'startedAt'),false);
 });
 await check('tự luận: cả mã 101/102 tự chọn khác SHA cũ đều list/reserve/confirm được',async()=>{
  for(const ma of [1,2]){
   let b='thi-thang-2026-06-choice-'+ma;
   while(await scalar("select 1+(get_byte(sha256(convert_to($1||'|fixture one|Lớp giả','UTF8')),0)&1)",[b])===ma)b+='-x';
   await addPeriod(b);const chosen=code('thi',ma,b),wrong=code('thi',3-ma,b),attempt='choice-essay-'+ma;
   await read(chosen);assert.equal((await commit(chosen,0,[draft(attempt)])).ok,true);
   assert.deepEqual((await upload(chosen,attempt,'list')).items,[]);
   const img=await upload(chosen,attempt,'reserve',String(ma).repeat(64));assert.equal(img.receivedAt,null);
   await assert.rejects(()=>upload(chosen,attempt,'confirm',String(ma).repeat(64)),(e:any)=>e.code==='22023');
   await store(img);const confirmed=await upload(chosen,attempt,'confirm',String(ma).repeat(64));assert.equal(confirmed.id,img.id);assert.equal(confirmed.pageNumber,1);assert.ok(confirmed.receivedAt);
   assert.equal((await upload(chosen,attempt,'list')).items.length,1);
   assert.equal((await upload(chosen,attempt,'reserve',String(ma).repeat(64))).id,img.id);
   for(const action of ['list','reserve','confirm']){
    await assert.rejects(()=>upload(wrong,attempt,action,'a'.repeat(64)),(e:any)=>e.code==='42501');
    await assert.rejects(()=>upload(chosen,'forged-attempt',action,'a'.repeat(64)),(e:any)=>e.code==='42501');
    await assert.rejects(()=>upload(chosen,attempt,action,'a'.repeat(64),'fixture-two'),(e:any)=>e.code==='42501');
   }
  }
 });
 await check('tự luận legacy: lượt đang làm và ảnh reserve từ 099 giữ nguyên sau nâng cấp',async()=>{
  assert.deepEqual((await upload(legacyCode,'legacy-start','list',null,'fixture-legacy')).items,[]);
  await store(legacyImage);const confirmed=await upload(legacyCode,'legacy-start','confirm','e'.repeat(64),'fixture-legacy');
  assert.equal(confirmed.id,legacyImage.id);assert.equal(confirmed.pageNumber,1);assert.ok(confirmed.receivedAt);
  const listed=await upload(legacyCode,'legacy-start','list',null,'fixture-legacy');assert.equal(listed.items.length,1);assert.equal(listed.items[0].id,legacyImage.id);
 });
 await check('tự luận giữ hạn 15 phút và khôi phục ACK của object nhận trước hạn',async()=>{
  const b='thi-thang-2026-05-upload-deadline';await addPeriod(b);const lesson=code('thi',1,b),attempt='deadline-attempt';
  await read(lesson);assert.equal((await commit(lesson,0,[draft(attempt)])).ok,true);
  const img=await upload(lesson,attempt,'reserve','f'.repeat(64));await store(img);
  await q("update mtm_hw_private.btvn_lessons set closes_at=clock_timestamp()-interval '16 minutes' where code=$1",[lesson]);
  await q("update storage.objects set created_at=(select closes_at+interval '14 minutes' from mtm_hw_private.btvn_lessons where code=$2) where name=$1",[img.path,lesson]);
  await assert.rejects(()=>upload(lesson,attempt,'reserve','a'.repeat(64)),(e:any)=>e.code==='P0015');
  assert.ok((await upload(lesson,attempt,'confirm','f'.repeat(64))).receivedAt);
  assert.equal((await upload(lesson,attempt,'confirm','f'.repeat(64))).id,img.id);
  assert.equal((await upload(lesson,attempt,'list')).items.length,1);
 });
 await check('giữ phân quyền service_role, không mở hàm cũ hay truy cập test/real chéo',async()=>{
  for(const role of ['anon','authenticated','mtm_btvn_publisher']){
   assert.equal(await scalar("select has_function_privilege($1,'public.mtm_btvn_read(text,text)','EXECUTE')",[role]),false);
   assert.equal(await scalar("select has_function_privilege($1,'public.mtm_btvn_commit(text,text,integer,jsonb,jsonb)','EXECUTE')",[role]),false);
   assert.equal(await scalar("select has_function_privilege($1,'public.mtm_tu_luan_student(text,text,text,text,text,integer)','EXECUTE')",[role]),false);
   await assert.rejects(()=>upload(code('thi',1),'first','list',null,'fixture-one',role),(e:any)=>e.code==='42501');
  }
  assert.equal(await scalar("select has_function_privilege('service_role','public.mtm_btvn_read_before_thi_thang_choice101(text,text)','EXECUTE')"),false);
  assert.equal(await scalar("select has_function_privilege('service_role','public.mtm_btvn_commit_before_thi_thang_choice101(text,text,integer,jsonb,jsonb)','EXECUTE')"),false);
  await assert.rejects(()=>read(code('thi',1),'invalid-fixture'),(e:any)=>e.code==='42501');
  const testCode='thi-thang-2026-07-lop-gia-thi-ma-1';
  await q("insert into mtm_hw_private.btvn_lessons(code,owner_id,class_ids,material,exam,active,kind,is_test) values($1,$2,$3,$4,'{}',true,'kiem-tra-thang',true)",[testCode,owner,[cid],JSON.stringify({lessonCode:testCode,date:'2026-10-30'})]);
  const scoped=await rpc('mtm_btvn_read_scoped100',['fixture-one',code('thi',1)]);assert.ok(!scoped.lessons.some((c:any)=>c.lessonCode===testCode));
  await assert.rejects(()=>rpc('mtm_btvn_read_scoped100',['fixture-one',testCode]),(e:any)=>e.code==='42501');
  for(const action of ['list','reserve','confirm'])await assert.rejects(()=>upload(testCode,'first',action,'a'.repeat(64)),(e:any)=>e.code==='42501');
 });
 console.log(JSON.stringify({suite:'THI-THANG-SQL',passed:checks.length,failed:0,database:'PGlite RAM',network:false,migrationAppliedToCloud:false,parallelStartRequestsTested:true,multiConnectionContentionTested:false}));
}finally{await db.close();}
