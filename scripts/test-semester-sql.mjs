// CSDL PostgreSQL WASM riêng trong RAM. Không đọc .env hoặc chạm CSDL thật.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const dir=process.env.MTM_PGLITE_DIR || 'T:/Claude/SanPham/btvn-web-diem-danh/tools-sql/node_modules';
const {PGlite}=await import(pathToFileURL(join(dir,'@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(), checks=[];
const sid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const token='a'.repeat(64),token2='b'.repeat(64),hash='c'.repeat(64),bad='d'.repeat(64);
const req=i=>`33333333-3333-4333-8333-${String(i).padStart(12,'0')}`;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const rpc=(name,args,role='service_role')=>db.transaction(async tx=>{await tx.exec('set local role '+role);return (await tx.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;});
const access=(action,video='',request=null,digest='',session=token,grade='12')=>rpc('mtm_hk1_access',[session,action,grade,video,request,digest]);
const register=(session=token,grade='12')=>rpc('mtm_hk1_register',[session,'on-cuoi-ky-1','Học sinh mẫu','0900000001',grade,'online',false,'','',false,'','on-cuoi-ky-1']);
async function check(name,fn){await fn();checks.push(name);console.log('ĐẠT: '+name);}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema mtm_hw_private;create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table mtm_hw_private.classes(id uuid primary key,active boolean);
 create table mtm_hw_private.students(id uuid primary key,class_id uuid references mtm_hw_private.classes,active boolean);
 create table mtm_hw_private.btvn_identity_sessions(digest bytea primary key,student_id uuid,expires_at timestamptz,revoked_at timestamptz);
 create function mtm_hw_private.token_digest(salt text,token text) returns bytea language sql as $$select decode(md5(salt||token),'hex')$$;
 create function mtm_hw_private.session_student(token text) returns uuid language plpgsql as $$begin raise exception 'Invalid session' using errcode='42501';end$$;
 insert into mtm_hw_private.classes values('${sid}',true);
 insert into mtm_hw_private.students values('${sid}','${sid}',true),('${other}','${sid}',true);
 insert into mtm_hw_private.btvn_identity_sessions values(mtm_hw_private.token_digest('btvn-identity','${token}'),'${sid}',now()+interval '4 hours',null),(mtm_hw_private.token_digest('btvn-identity','${token2}'),'${other}',now()+interval '4 hours',null);`);
 const btvn=readFileSync('supabase/migrations-pending/202610150005_btvn.sql','utf8');
 await db.exec(btvn.match(/create function mtm_hw_private\.btvn_student\([\s\S]*?end\$\$;/)[0]);
 await db.exec(readFileSync('supabase/migrations-pending/202610200073_lead_web.sql','utf8'));
 await check('Áp nguyên migration 093 và mặc định 3 lượt, bucket private, chỉ placeholder',async()=>{
  await db.exec(readFileSync('supabase/migrations-pending/202610260098_on_cuoi_ky_1.sql','utf8'));
  assert.equal(await scalar('select count(*)::int from mtm_hk1.videos'),24);
  assert.equal(await scalar('select min(max_views) from mtm_hk1.settings'),3);
  assert.equal(await scalar("select public from storage.buckets where id='mtm-semester'"),false);
  assert.equal(await scalar('select count(*)::int from mtm_hk1.videos where enabled or private_path is not null'),0);
 });
 await check('Chặn role công khai, đọc mã/bộ đếm và sinh mã trực tiếp',async()=>{
  for(const role of ['anon','authenticated']){
   await assert.rejects(()=>rpc('mtm_hk1_access',[token,'state','12','',null,''],role),e=>e.code==='42501');
   await assert.rejects(()=>rpc('mtm_hk1_register',[token,'on-cuoi-ky-1','Mẫu','0900000001','12','online',false,'','',false,'',''],role),e=>e.code==='42501');
   await assert.rejects(()=>rpc('mtm_hk1_issue_code',[hash,'12','2027-12-31'],role),e=>e.code==='42501');
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select * from mtm_hk1.book_codes');}),e=>e.code==='42501');
  }
 });
 await check('Phiên giả, hết hạn, revoked và HS inactive đều bị từ chối',async()=>{
  assert.equal((await access('state','',null, '',bad)).status,'login');
  for(const sql of ["update mtm_hw_private.btvn_identity_sessions set expires_at=now()-interval '1 second' where student_id=$1","update mtm_hw_private.btvn_identity_sessions set expires_at=now()+interval '4 hours',revoked_at=now() where student_id=$1","update mtm_hw_private.students set active=false where id=$1"]){
   await db.query(sql,[sid]);assert.equal((await register()).status,'login');
   await db.query('update mtm_hw_private.students set active=true where id=$1',[sid]);await db.query("update mtm_hw_private.btvn_identity_sessions set expires_at=now()+interval '4 hours',revoked_at=null where student_id=$1",[sid]);
  }
 });
 await check('Chưa đăng ký không xem/activate; đăng ký lặp một lead, gắn đúng tài khoản',async()=>{
  assert.equal((await access('play','hk1-12-w1-core',req(1))).status,'register');
  assert.equal((await access('activate','',null,hash)).status,'register');
  assert.equal((await register()).status,'accepted');assert.equal((await register()).status,'already');
  assert.equal(await scalar('select count(*)::int from mtm_lead.leads'),1);
  assert.equal((await access('state')).registered,true);assert.equal((await access('state','',null, '',token2)).registered,false);
  assert.doesNotMatch(JSON.stringify(await access('state')),/private_path|digest|student_id|090000/);
 });
 await check('Video chưa có, chưa tới ngày và nâng cao bị chặn trước bộ đếm',async()=>{
  assert.equal((await access('play','hk1-12-w1-core',req(1))).status,'missing');
  await db.exec("update mtm_hk1.videos set enabled=true,private_path='hk1/sample.mp4'");
  await db.exec("update mtm_hk1.settings set opens_at=now()+interval '1 day'");
  assert.equal((await access('play','hk1-12-w1-core',req(1))).status,'closed');
  await db.exec("update mtm_hk1.settings set opens_at=now()-interval '1 day'");
  assert.equal((await access('play','hk1-12-w2-core',req(1))).status,'closed');
  assert.equal((await access('play','hk1-12-w1-advanced',req(1))).status,'advanced');
  assert.equal(await scalar('select count(*)::int from mtm_hk1.views'),0);
 });
 await check('3 lượt, retry không tăng hoặc gia hạn, request không đổi video; chuỗi 20 yêu cầu không vượt N',async()=>{
  const first=await access('play','hk1-12-w1-core',req(1));assert.equal(first.views,1);
  assert.deepEqual(await access('play','hk1-12-w1-core',req(1)),first);
  assert.equal((await access('play','hk1-12-w1-advanced',req(1))).status,'advanced');
  const all=await Promise.all(Array.from({length:20},(_,i)=>access('play','hk1-12-w1-core',req(i+2))));
  assert.equal(all.filter(x=>x.status==='ok').length,2);assert.equal(all.filter(x=>x.status==='limit').length,18);
  assert.equal(await scalar('select used from mtm_hk1.views'),3);
  assert.equal((await access('play','hk1-12-w1-core',req(100))).status,'limit');
  assert.deepEqual(await access('play','hk1-12-w1-core',req(1)),{...first,views:3});
 });
 await check('Cấu hình N từng video/khối và mỗi tài khoản đếm riêng',async()=>{
  await register(token2);await db.exec("update mtm_hk1.videos set max_views=1 where id='hk1-12-w1-core'");
  assert.equal((await access('play','hk1-12-w1-core',req(1),'',token2)).views,1);
  assert.equal((await access('play','hk1-12-w1-core',req(2),'',token2)).status,'limit');
  await db.exec("update mtm_hk1.settings set max_views=2;update mtm_hk1.videos set max_views=null;");
  assert.equal((await access('state')).lessons[0].limit,2);
 });
 await check('Mã băm: sai khối/hết hạn/tái dùng khác người bị chặn, đúng người mở nâng cao',async()=>{
  assert.equal(await rpc('mtm_hk1_issue_code',[hash,'12','2027-12-31']),true);
  assert.equal((await access('activate','',null,bad)).status,'invalid');
  await register(token,'11');assert.equal((await access('activate','',null,hash,token,'11')).status,'invalid');
  await db.query('update mtm_hk1.book_codes set expires_at=now()-interval \'1 second\' where digest=$1',[hash]);
  assert.equal((await access('activate','',null,hash)).status,'invalid');
  await db.query('update mtm_hk1.book_codes set expires_at=now()+interval \'1 year\' where digest=$1',[hash]);
  assert.equal((await access('activate','',null,hash)).advanced,true);
  assert.equal((await access('activate','',null,hash)).advanced,true);
  assert.equal((await access('activate','',null,hash,token2)).status,'invalid');
  assert.equal((await access('state')).advanced,true);
  assert.equal((await access('play','hk1-12-w1-advanced',req(200))).views,1);
  assert.equal((await access('play','hk1-12-w1-core',req(200))).status,'invalid');
  assert.deepEqual((await db.query("select column_name from information_schema.columns where table_schema='mtm_hk1' and table_name='book_codes'")).rows.map(x=>x.column_name),['digest','grade','expires_at','redeemed_by','redeemed_at']);
 });
 await check('Rate limit kích hoạt được commit, reset sau cửa sổ',async()=>{
  for(let i=0;i<10;i++)await access('activate','',null,bad);
  assert.equal((await access('activate','',null,hash)).status,'rate');
  await db.query("update mtm_hk1.activation_limits set until_at=now()-interval '1 second' where student_id=$1",[sid]);
  assert.equal((await access('activate','',null,hash)).status,'ok');
 });
 mkdirSync('.qa-temp',{recursive:true});writeFileSync('.qa-temp/SQL_RECEIPT.json',JSON.stringify({engine:'PGlite',checks,scope:'actual migration with synthetic identity fixtures; Promise queue is not multi-connection PostgreSQL concurrency',productionApplied:false},null,2));
}finally{await db.close();}
