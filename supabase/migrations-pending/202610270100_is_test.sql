-- PREPARED ONLY. Claude reviews/pushes/opens PR; apply AFTER 22:30 Asia/Ho_Chi_Minh.
-- Additive: no existing rows, functions, policies or grants are changed/deleted.
-- trial (a real prospective student) remains independent of is_test (synthetic QA).
begin;
set local lock_timeout='5s';
alter table mtm_hw_private.students add column is_test boolean not null default false;
alter table mtm_hw_private.btvn_lessons add column is_test boolean not null default false;
alter table mtm_phong_thi.tai_khoan add column is_test boolean not null default false;

create schema mtm_test100;
revoke all on schema mtm_test100 from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- New report entry points, retaining current DB customizations. Original functions
-- and their ACL stay intact. Filtering happens BEFORE window ranks/averages/LIMIT.
-- Explicit allowlist, no EXECUTE supplied by HTTP callers. Dependencies in the
-- historical reporting chain are cloned too, with no direct EXECUTE grant.
create table mtm_test100.report_sources(signature text primary key,source_sha256 text not null,source_definition text not null);
-- Clones are snapshots of the originals. Every later migration that edits an original
-- must be followed by refresh_reports(); ap-supabase.yml calls it after each run.
create function mtm_test100.refresh_reports() returns integer
language plpgsql set search_path='' as $reports$
declare f record; g record; src text; audit_src text; qualified text; signature text; root boolean; n integer=0;
 names text[]=array['mtm_btvn_leaderboard','mtm_btvn_leaderboard_class','mtm_btvn_my_rank','mtm_btvn_arena',
 'mtm_btvn_scorebook','mtm_btvn_admin_scores','mtm_btvn_opening_materials',
 'mtm_btvn_sheet_csv','mtm_btvn_sheet_csv2','mtm_btvn_sheet_csv3','mtm_btvn_sheet_csv4','mtm_btvn_sheet_csv5','mtm_btvn_sheet_csv6',
 'mtm_ph_children','mtm_ph_extras','mtm_ph_child_session','mtm_btvn_read','mtm_tu_luan_teacher',
 'mtm_pt_xep_hang','mtm_pt_xep_hang_dot','mtm_pt_khao_sat','mtm_pt_lich_su','mtm_pt_bao_phu_huynh','mtm_pt_ghi_luot'];
begin
-- New columns on base tables reach the views (CREATE OR REPLACE appends columns).
 execute $v$create or replace view mtm_test100.students as select * from mtm_hw_private.students where not is_test$v$;
 execute $v$create or replace view mtm_test100.btvn_lessons as select * from mtm_hw_private.btvn_lessons where not is_test$v$;
 execute $v$create or replace view mtm_test100.btvn_work as select w.* from mtm_hw_private.btvn_work w
 join mtm_test100.students s on s.id=w.student_id join mtm_test100.btvn_lessons l on l.code=w.lesson_code$v$;
 execute $v$create or replace view mtm_test100.tu_luan_images as select i.* from mtm_hw_private.tu_luan_images i
 join mtm_test100.students s on s.id=i.student_id join mtm_test100.btvn_lessons l on l.code=i.lesson_code$v$;
 execute $v$create or replace view mtm_test100.paper_scores as select p.* from mtm_hw_private.paper_scores p
 join mtm_test100.students s on s.id=p.student_id
 where not exists(select 1 from mtm_hw_private.btvn_lessons l where l.code=p.test_code and l.is_test)$v$;
 execute $v$create or replace view mtm_test100.btvn_monthly_scores as select p.* from mtm_hw_private.btvn_monthly_scores p join mtm_test100.students s on s.id=p.student_id$v$;
 execute $v$create or replace view mtm_test100.btvn_manual_grades as select p.* from mtm_hw_private.btvn_manual_grades p
 join mtm_test100.students s on s.id=p.student_id join mtm_test100.btvn_lessons l on l.code=p.lesson_code$v$;
 execute $v$create or replace view mtm_test100.attempts as select p.* from mtm_hw_private.attempts p join mtm_test100.students s on s.id=p.student_id$v$;
 execute $v$create or replace view mtm_test100.pt_luot as select l.* from mtm_phong_thi.luot l
 where not exists(select 1 from mtm_hw_private.students s where s.id=l.hoc_sinh and s.is_test)
 and not exists(select 1 from mtm_phong_thi.tai_khoan t where t.id=l.tai_khoan and t.is_test)
 and not exists(select 1 from mtm_hw_private.btvn_lessons b where b.code=l.de and b.is_test)$v$;
 execute $v$create or replace view mtm_test100.pt_dang_ky_dot as select d.* from mtm_phong_thi.dang_ky_dot d
 where not exists(select 1 from mtm_hw_private.students s where s.id=d.hoc_sinh and s.is_test)$v$;
 delete from mtm_test100.report_sources;
 for g in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','mtm_hw_private') and p.proname ~ '_real100$' loop
  execute 'drop function '||g.sig::text;
 end loop;
 if to_regprocedure('public.mtm_tu_luan_student(text,text,text,text,text,integer)') is null
 or to_regprocedure('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)') is null then
 raise exception '100 requires 099 and the existing ranking schema';end if;
 for f in select p.oid,n.nspname,p.proname,p.proconfig,p.proargnames,p.prorettype,p.prolang,pg_get_function_identity_arguments(p.oid) args
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.proname !~ '_real100$' and ((n.nspname='public' and (p.proname=any(names) or p.proname ~ '^mtm_btvn_(scorebook|read|admin_scores)_before_'))
 or (n.nspname='mtm_hw_private' and p.proname in ('btvn_rank_rows','hv_ca_rows','arena_group','btvn_official_receipts')))
 order by p.oid loop
  src=pg_get_functiondef(f.oid);qualified=format('%I.%I',f.nspname,f.proname);
  if not coalesce(f.proconfig,'{}') @> array['search_path=""'] then raise exception '100 requires empty search_path: %',qualified;end if;
  if src ~* '\mfor[[:space:]]+(update|share)\M' then raise exception '100 report row-lock requires manual review: %',qualified;end if;
  insert into mtm_test100.report_sources values(qualified||'('||f.args||')',encode(sha256(convert_to(src,'UTF8')),'hex'),src);
  -- Preserve DELETE targets: FROM in DELETE FROM is not a report source.
  src=regexp_replace(src,'(delete[[:space:]]+)from\M','\1__mtm_delete_from__','gi');
  -- Only FROM/JOIN sources change; preserve composite types and mutation targets.
  src=regexp_replace(src,'(from|join)([[:space:]]+)mtm_hw_private\.(students|btvn_lessons|btvn_work|tu_luan_images|paper_scores|btvn_monthly_scores|btvn_manual_grades|attempts)\M','\1\2mtm_test100.\3','gi');
  if f.proname='mtm_ph_extras' then
   src=replace(src,E'begin\n',E'begin\n if not exists(select 1 from mtm_test100.students where id=p_student_id) then raise exception ''Test student excluded'' using errcode=''42501'';end if;\n');
  end if;
  src=regexp_replace(src,'(from|join)([[:space:]]+)mtm_phong_thi\.luot\M','\1\2mtm_test100.pt_luot','gi');
  src=regexp_replace(src,'(from|join)([[:space:]]+)mtm_phong_thi\.dang_ky_dot\M','\1\2mtm_test100.pt_dang_ky_dot','gi');
  src=replace(src,'__mtm_delete_from__','from');
  -- Fail closed on dynamic SQL or unconverted base reads (comma joins etc).
  audit_src=regexp_replace(src,'mtm_hw_private\.(students|btvn_lessons|btvn_work|tu_luan_images|paper_scores|btvn_monthly_scores|btvn_manual_grades|attempts)(%ROWTYPE)?([[:space:]]*;)','','gi');
  audit_src=regexp_replace(audit_src,'(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+mtm_hw_private\.[a-z_]+','','gi');
  audit_src=regexp_replace(audit_src,'(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+mtm_phong_thi\.[a-z_]+','','gi');
  if audit_src ~* '\mexecute\M' or audit_src ~ 'mtm_hw_private\.(students|btvn_lessons|btvn_work|tu_luan_images|paper_scores|btvn_monthly_scores|btvn_manual_grades|attempts)\M'
   or audit_src ~ 'mtm_phong_thi\.(luot|dang_ky_dot)\M' then raise exception '100 unconverted report source: %',qualified;end if;
  if f.proname='mtm_pt_ghi_luot' then
   if (length(src)-length(replace(src,'if not found then','')))/length('if not found then')<>1
    or position('insert into mtm_phong_thi.luot' in src)=0
    or position('if not found then' in src)<position('insert into mtm_phong_thi.luot' in src)
    or not f.proargnames @> array['p_hoc_sinh','p_tai_khoan','p_de'] or f.prorettype<>'jsonb'::regtype then raise exception '100 PT write anchor/signature changed';end if;
   src=replace(src,'if not found then',$pt$
   if exists(select 1 from mtm_hw_private.students where id=p_hoc_sinh and is_test)
    or exists(select 1 from mtm_phong_thi.tai_khoan where id=p_tai_khoan and is_test)
    or exists(select 1 from mtm_hw_private.btvn_lessons where code=p_de and is_test) then
    return jsonb_build_object('status','luyen-tap','isTest',true);end if;
   if not found then$pt$);
  end if;
  -- Rewrite function references including the new definition's own name.
  for g in select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.proname !~ '_real100$' and ((n.nspname='public' and (p.proname=any(names) or p.proname ~ '^mtm_btvn_(scorebook|read|admin_scores)_before_'))
   or (n.nspname='mtm_hw_private' and p.proname in ('btvn_rank_rows','hv_ca_rows','arena_group','btvn_official_receipts'))) loop
   src=regexp_replace(src,'\m'||g.nspname||'\.'||g.proname||'\M',g.nspname||'.'||g.proname||'_real100','g');
  end loop;
  src=replace(src,'CREATE OR REPLACE FUNCTION','CREATE FUNCTION');
  -- SQL functions may reference a later clone; resolve when first called.
  perform set_config('check_function_bodies',case when f.prolang=(select oid from pg_language where lanname='sql') then 'off' else 'on' end,true);
  execute src;n=n+1;
  signature=format('%I.%I(%s)',f.nspname,f.proname||'_real100',f.args);
  execute 'revoke all on function '||signature||' from public,anon,authenticated,service_role,mtm_btvn_publisher';
  root=f.nspname='public' and f.proname=any(names);
  if root then
   execute 'grant execute on function '||signature||case when f.proname in ('mtm_btvn_admin_scores','mtm_tu_luan_teacher') then ' to authenticated' else ' to service_role' end;
  end if;
 end loop;
 perform set_config('check_function_bodies','on',true);
 return n;
end$reports$;
revoke all on function mtm_test100.refresh_reports() from public,anon,authenticated,service_role,mtm_btvn_publisher;
select mtm_test100.refresh_reports();

-- Student path: strict test/real lesson separation, retaining ordinary QA access.
create function public.mtm_btvn_read_scoped100(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid=mtm_hw_private.btvn_student(p_session);s mtm_hw_private.students; chosen text; result jsonb;cards jsonb;
begin
 select * into s from mtm_hw_private.students where id=sid;
 if not found then raise exception 'Student session required' using errcode='42501';end if;
 if exists(select 1 from mtm_test100.cleanup_jobs where student_id=sid) then raise exception 'Test account retired' using errcode='42501';end if;
 select code into chosen from mtm_hw_private.btvn_lessons
 where active and owner_id=s.owner_id and s.class_id=any(class_ids) and is_test=s.is_test
 and (p_lesson is null or code=p_lesson) order by material->>'date' desc,code limit 1;
 if chosen is null and p_lesson is not null then raise exception 'Lesson unavailable' using errcode='42501';end if;
 -- Existing RPC inserts work for the selected lesson, so never let its default
 -- select a lesson from the other scope. Empty classes get an explicit snapshot.
 if chosen is null then
  return jsonb_build_object('revision',0,'lessons','[]'::jsonb,'work',jsonb_build_object('student',jsonb_build_object('studentCode','','fullName',s.full_name,'className',(select label from mtm_hw_private.classes where id=s.class_id)),'drafts','[]'::jsonb,'receipts','[]'::jsonb));
 end if;
 result=public.mtm_btvn_read(p_session,chosen);
 if result->'material'->>'lessonCode' is distinct from chosen then raise exception 'Snapshot lesson mismatch' using errcode='42501';end if;
 -- drafts/receipts are already scoped by btvn_work PRIMARY KEY(student_id,lesson_code).
 -- They have no lessonCode property; filtering by a nonexistent field would lose valid work.
 select coalesce(jsonb_agg(x.card order by x.ord),'[]') into cards from jsonb_array_elements(result->'lessons') with ordinality x(card,ord)
 join mtm_hw_private.btvn_lessons l on l.code=card->>'lessonCode' and l.is_test=s.is_test;
 return result||jsonb_build_object('lessons',cards,'isTest',s.is_test);
end$$;
revoke all on function public.mtm_btvn_read_scoped100(text,text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_read_scoped100(text,text) to service_role;

-- Durable tombstone: uploads signed before cleanup cannot recreate an object.
-- A wiped test account is retired; create another QA account for a new run.
create table mtm_test100.cleanup_jobs(
 id uuid primary key default gen_random_uuid(),student_id uuid not null unique references mtm_hw_private.students(id),
 owner_id uuid not null references auth.users(id),paths text[] not null,created_at timestamptz not null default clock_timestamp(),finished_at timestamptz);
alter table mtm_test100.cleanup_jobs enable row level security;
revoke all on all tables in schema mtm_test100 from public,anon,authenticated,service_role,mtm_btvn_publisher;

create function mtm_test100.guard_work() returns trigger language plpgsql security definer set search_path='' as $$
declare st boolean;lt boolean;begin
 select is_test into st from mtm_hw_private.students where id=new.student_id for key share;
 if exists(select 1 from mtm_test100.cleanup_jobs where student_id=new.student_id) then raise exception 'Test account retired' using errcode='42501';end if;
 select is_test into lt from mtm_hw_private.btvn_lessons where code=new.lesson_code;
 if st is distinct from lt then raise exception 'Test scope mismatch' using errcode='42501';end if;
 return new;
end$$;
create trigger is_test100_work before insert or update on mtm_hw_private.btvn_work for each row execute function mtm_test100.guard_work();
create trigger is_test100_images before insert or update on mtm_hw_private.tu_luan_images for each row execute function mtm_test100.guard_work();
create function mtm_test100.guard_storage() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if new.bucket_id='mtm-tu-luan' and split_part(new.name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  sid=split_part(new.name,'/',2)::uuid;
  perform 1 from mtm_hw_private.students where id=sid for key share;
  if exists(select 1 from mtm_test100.cleanup_jobs where student_id=sid) then raise exception 'Test account retired' using errcode='42501';end if;
 end if;return new;
end$$;
create trigger is_test100_storage before insert or update on storage.objects for each row execute function mtm_test100.guard_storage();
create function mtm_test100.guard_flag() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_test is distinct from old.is_test then
  raise exception 'Test flag is immutable; create a new test account/lesson' using errcode='42501';
 end if;return new;
end$$;
create trigger is_test100_student_flag before update of is_test on mtm_hw_private.students for each row execute function mtm_test100.guard_flag();
create trigger is_test100_lesson_flag before update of is_test on mtm_hw_private.btvn_lessons for each row execute function mtm_test100.guard_flag();
create trigger is_test100_pt_flag before update of is_test on mtm_phong_thi.tai_khoan for each row execute function mtm_test100.guard_flag();

-- Even an older external grader cannot finalize a QA attempt as an official grade.
create function mtm_test100.guard_grade() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from mtm_test100.students where id=new.student_id)
 or not exists(select 1 from mtm_test100.btvn_lessons where code=new.lesson_code) then
  raise exception 'Test work excluded from official grading' using errcode='42501';
 end if;return new;
end$$;
create trigger is_test100_grade before insert or update on mtm_hw_private.btvn_manual_grades for each row execute function mtm_test100.guard_grade();

create function public.mtm_test_cleanup_prepare100(p_student uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid=mtm_hw_private.admin_id();s mtm_hw_private.students;j mtm_test100.cleanup_jobs;paths text[];
begin
 select * into s from mtm_hw_private.students where id=p_student for update;
 if s.id is null or s.owner_id is distinct from u or s.is_test is distinct from true then raise exception 'Test student owned by admin required' using errcode='42501';end if;
 -- Include reserved/unconfirmed/orphan objects under EXACT owner/student prefix.
 select coalesce(array_agg(distinct path order by path),'{}') into paths from (
  select storage_path path from mtm_hw_private.tu_luan_images where student_id=s.id and owner_id=u
  union select name from storage.objects where bucket_id='mtm-tu-luan' and lower(split_part(name,'/',1))=u::text and lower(split_part(name,'/',2))=s.id::text
 ) x;
 if exists(select 1 from unnest(paths) p where lower(split_part(p,'/',1))<>u::text or lower(split_part(p,'/',2))<>s.id::text)
 or exists(select 1 from mtm_hw_private.tu_luan_images where student_id=s.id and owner_id<>u) then raise exception 'Invalid test image scope' using errcode='42501';end if;
 insert into mtm_test100.cleanup_jobs(student_id,owner_id,paths) values(s.id,u,paths) on conflict(student_id) do nothing;
 select * into strict j from mtm_test100.cleanup_jobs where student_id=s.id;
 return jsonb_build_object('jobId',j.id,'paths',j.paths,'finished',j.finished_at is not null);
end$$;

create function public.mtm_test_cleanup_finish100(p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid=mtm_hw_private.admin_id();j mtm_test100.cleanup_jobs;s mtm_hw_private.students;images integer;works integer;
begin
 -- Same lock order as prepare and the write guards.
 select s0.* into s from mtm_hw_private.students s0 join mtm_test100.cleanup_jobs j0 on j0.student_id=s0.id where j0.id=p_job for update of s0;
 if s.id is null or s.owner_id is distinct from u or s.is_test is distinct from true then raise exception 'Test student owned by admin required' using errcode='42501';end if;
 select * into strict j from mtm_test100.cleanup_jobs where id=p_job and owner_id=u for update;
 if exists(select 1 from storage.objects where bucket_id='mtm-tu-luan' and lower(split_part(name,'/',1))=u::text and lower(split_part(name,'/',2))=s.id::text) then
  raise exception 'Storage removal incomplete; retry cleanup' using errcode='55000';end if;
 if j.finished_at is not null then return jsonb_build_object('ok',true,'alreadyFinished',true,'imagesDeleted',0,'worksDeleted',0);end if;
 delete from mtm_hw_private.tu_luan_images where student_id=s.id;get diagnostics images=row_count;
 delete from mtm_hw_private.btvn_manual_grades where student_id=s.id;
 delete from mtm_hw_private.btvn_monthly_scores where student_id=s.id;
 delete from mtm_hw_private.btvn_work where student_id=s.id;get diagnostics works=row_count;
 delete from mtm_hw_private.attempts where student_id=s.id;
 delete from mtm_phong_thi.luot where hoc_sinh=s.id;
 update mtm_test100.cleanup_jobs set finished_at=clock_timestamp() where id=j.id;
 return jsonb_build_object('ok',true,'imagesDeleted',images,'worksDeleted',works);
end$$;
revoke all on all functions in schema mtm_test100 from public,anon,authenticated,service_role,mtm_btvn_publisher;
revoke all on function public.mtm_test_cleanup_prepare100(uuid),public.mtm_test_cleanup_finish100(uuid) from public,anon,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_test_cleanup_prepare100(uuid),public.mtm_test_cleanup_finish100(uuid) to authenticated;
commit;
