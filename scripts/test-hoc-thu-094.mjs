// 094: em học thử (HT) vẫn có trong sổ điểm nhưng ra khỏi xếp hạng. DB RAM PGlite, hàm cũ là bản giả giữ đúng chuỗi neo của bản live.
// Chạy: MTM_PGLITE_DIR=<node_modules có @electric-sql/pglite> node scripts/test-hoc-thu-094.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(join(process.env.MTM_PGLITE_DIR??'T:/Claude/SanPham/btvn-web-diem-danh/tools-sql/node_modules','@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const owner='11111111-1111-4111-8111-111111111111',cls='22222222-2222-4222-8222-222222222222';
const ids=['aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000003'];
await db.exec(`create role anon;create role authenticated;create role service_role;create role mtm_btvn_publisher;
create schema mtm_hw_private;create schema extensions;
create table mtm_hw_private.btvn_roster_scope(singleton boolean primary key,owner_id uuid);
create table mtm_hw_private.classes(id uuid primary key,owner_id uuid,label text,active boolean default true);
create table mtm_hw_private.students(id uuid primary key,owner_id uuid,class_id uuid,full_name text,score numeric,active boolean default true,source_identity text);
insert into mtm_hw_private.btvn_roster_scope values(true,'${owner}');insert into mtm_hw_private.classes values('${cls}','${owner}','2K9 9+',true);
insert into mtm_hw_private.students values('${ids[0]}','${owner}','${cls}','Giả A',9,true,null),('${ids[1]}','${owner}','${cls}','Giả B (HT)',8,true,null),('${ids[2]}','${owner}','${cls}','Giả C',7,true,null);
create function mtm_hw_private.btvn_rank_rows(p_cohort text,p_kind text,p_period text,p_class text,p_student uuid) returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare out_rows jsonb;
begin
 with eligible as (
  select s.id,s.full_name,c.label,s.score from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%' and upper(substring(c.label from '^[^ ]+'))=p_cohort and (p_class is null or c.label=p_class)
 ), ranked as (select row_number() over(order by score desc,id) rank,* from eligible)
 select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'fullName',full_name) order by rank),'[]') into out_rows from ranked where (p_student is null and rank<=10) or id=p_student;
 return out_rows;
end$f$;
create function mtm_hw_private.dd_find_student(p_name text,p_class text) returns jsonb language sql stable set search_path='' as $f$
 select coalesce((select jsonb_build_object('id',s.id) from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id where s.full_name=p_name and c.label=p_class),jsonb_build_object('error','student_not_found'))$f$;
create function mtm_hw_private.sync_dispatch_before_lifecycle067(p jsonb) returns jsonb language sql as $f$select '{}'::jsonb$f$;
create function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb language plpgsql set search_path='' as $f$
begin
 if p ? 'trial' then return jsonb_build_object('error','old dispatch saw trial');end if;
 if p->>'action'='student_upsert' then return jsonb_build_object('ok',true,'created',false,'studentId',(select id from mtm_hw_private.students where full_name=p->>'fullName'));end if;
 return jsonb_build_object('ok',true,'action',p->>'action');
end$f$;
create function public.mtm_dd_api15(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $f$
declare mutating text[]=array['student_upsert','lifecycle_retry']; keep text[]=array['studentId','leavesApplied','lifecycleQuarantined'];
begin return mtm_hw_private.sync_dispatch(p)||jsonb_build_object('mutating',p->>'action'=any(mutating),'keeps',keep); end$f$;
create function public.mtm_btvn_scorebook_before_sync063(p_from date,p_apply boolean) returns jsonb language sql as $f$select '[]'::jsonb$f$;
create function public.mtm_btvn_scorebook(p_from date default '2026-10-15',p_apply boolean default false) returns jsonb language sql stable set search_path='' as $f$
 select coalesce(jsonb_agg(jsonb_build_object('studentId',id,'lessonCode','L1') order by full_name),'[]') from mtm_hw_private.students$f$;`);
const sql=readFileSync('supabase/migrations-pending/202610210094_hoc_thu_khong_xep_hang.sql','utf8');
const names=async()=>(await one(`select mtm_hw_private.btvn_rank_rows('2K9','btvn-tuan',null,null,null)`)).map(r=>r.rank+':'+r.fullName).join(',');
const api=p=>one('select public.mtm_dd_api15($1)',[JSON.stringify(p)]);
assert.equal(await names(),'1:Giả A,2:Giả B (HT),3:Giả C');
await db.exec(sql);await db.exec(sql);console.log('ĐẠT: áp 094 hai lần không lỗi');
assert.equal(await names(),'1:Giả A,2:Giả B (HT),3:Giả C');
const set=await api({action:'student_trial_set',student:'Giả B (HT)',class:'2K9 9+',trial:true});
assert.equal(set.trial,true);assert.equal(set.mutating,true);assert.ok(set.keeps.includes('trial'));
assert.equal(await names(),'1:Giả A,2:Giả C');console.log('ĐẠT: em HT ra khỏi bảng, hạng em sau dồn lên liền mạch');
assert.deepEqual(await one(`select mtm_hw_private.btvn_rank_rows('2K9','btvn-tuan',null,null,'${ids[1]}')`),[]);console.log('ĐẠT: em HT xem "hạng của em" ra rỗng');
const book=await one('select public.mtm_btvn_scorebook()');
assert.equal(book.length,3);assert.deepEqual(book.filter(r=>r.trial).map(r=>r.studentId),[ids[1]]);console.log('ĐẠT: sổ điểm giữ em HT, chỉ gắn trial:true');
const list=await api({action:'student_trial_list'});assert.deepEqual(list.students.map(s=>s.studentId),[ids[1]]);console.log('ĐẠT: student_trial_list trả đúng em HT');
const up=await api({action:'student_upsert',fullName:'Giả B (HT)',class:'2K9 9+',trial:false});
assert.equal(up.ok,true);assert.equal(up.trial,false);assert.equal(await names(),'1:Giả A,2:Giả B (HT),3:Giả C');console.log('ĐẠT: student_upsert trial:false đưa em về xếp hạng');
await api({action:'student_upsert',fullName:'Giả C',class:'2K9 9+',trial:true});assert.equal(await names(),'1:Giả A,2:Giả B (HT)');
assert.equal((await api({action:'student_upsert',fullName:'Giả A',class:'2K9 9+',trial:'yes'})).error,'need trial true|false');
assert.equal((await api({action:'student_trial_set',studentId:'not-a-uuid',trial:true})).error,'invalid studentId');
assert.equal((await api({action:'student_upsert',fullName:'Giả A',class:'2K9 9+'})).trial,undefined);
assert.equal(await one('select count(*)::int from mtm_hw_private.student_trial'),1);console.log('ĐẠT: upsert không kèm trial giữ nguyên cờ, giá trị sai bị chặn');
for(const role of ['anon','authenticated','service_role'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query('select * from mtm_hw_private.student_trial');}));
console.log('ĐẠT: bảng student_trial khóa với anon/authenticated/service_role');
