-- REVIEW ONLY. Isolated synthetic classrooms; never apply automatically.
-- No existing classroom/student/lesson/timetable row is changed by this migration.
-- Provisioning is an ungranted SECURITY INVOKER function for the DB owner only.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $preflight$
declare r record;
begin
 if to_regprocedure('mtm_test100.refresh_reports()') is null
  or to_regprocedure('mtm_hw_private.sync_capture()') is null
  or to_regprocedure('public.mtm_lesson_upload_api(jsonb)') is null
  or to_regprocedure('mtm_hw_private.lesson_teacher(text)') is null
  or to_regprocedure('mtm_hw_private.hv_ca_rows(date,date)') is null then
  raise exception 'QA116_REQUIRES_100_1530_101_110';
 end if;
 if position('is_test' in pg_get_functiondef('mtm_hw_private.sync_capture()'::regprocedure))=0 then
  raise exception 'QA116_REQUIRES_IS_TEST_SYNC_FENCE';
 end if;
 -- Exact metadata-only source readback, 16/11/2026. Unknown predecessors HOLD.
 for r in select * from (values
  ('mtm_hw_private.sync_capture()','2cda7c3bafeb966be7016fc32ab3d0ef7998ffbdc97ddc0272652ebdf4adb6b0'),
  ('public.mtm_btvn_classes()','6f30d4b2e72ce36a72a91971d5946c0d65a523c439fbd2a5e638760cda7a6609'),
  ('public.mtm_dd_api4(jsonb)','062dc037caa3f4f8153152ba95603e0675825f6124e96e73ef46569a90a4b0b3'),
  ('public.mtm_btvn_bot_catalog(jsonb)','30ff2bd96cfcb723540dbd37777a248bc008f2be27eac307a9f64a9a62b77c71'),
  ('mtm_hw_private.j39_due_rows(text,date)','e7a6d123d52f3b5e8258713d3f2362b41d35aa4be44e8c1cb491d72972b60ca9')
 ) x(signature,sha) loop
  if to_regprocedure(r.signature) is null or encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(r.signature)),'UTF8')),'hex') is distinct from r.sha then
   raise exception 'QA116_PREDECESSOR_CHANGED: %',r.signature;
  end if;
 end loop;
end$preflight$;

alter table mtm_hw_private.classes add column is_test boolean not null default false;
alter table mtm_hw_private.timetable add column is_test boolean not null default false;
create trigger is_test116_class_flag before update of is_test on mtm_hw_private.classes
 for each row execute function mtm_test100.guard_flag();
create trigger is_test116_timetable_flag before update of is_test on mtm_hw_private.timetable
 for each row execute function mtm_test100.guard_flag();

create table mtm_test100.classrooms116(
 run_ref text primary key check(run_ref ~ '^qa116:[A-Za-z0-9][A-Za-z0-9:-]{7,90}$'),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 class_id uuid unique not null references mtm_hw_private.classes(id),
 owner_id uuid not null references auth.users(id),
 teacher_user_id uuid not null references public.mtm_staff(user_id),
 teacher_key text not null,lesson_date date not null,start_hm text not null,end_hm text not null,
 student_ids uuid[] not null check(cardinality(student_ids)=2),
 created_at timestamptz not null default clock_timestamp());
alter table mtm_test100.classrooms116 enable row level security;
revoke all on mtm_test100.classrooms116 from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- Extend the already reviewed row-level skip; do not disable triggers, delete an
-- outbox entry, or set a caller-controlled "skip sync" session variable.
do $sync$
declare src text;acl text;anchor constant text='TG_TABLE_NAME in (''students'',''btvn_lessons'')';
begin
 src=pg_get_functiondef('mtm_hw_private.sync_capture()'::regprocedure);
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then
  raise exception 'QA116_SYNC_SOURCE_CHANGED';
 end if;
 select coalesce(proacl::text,'') into acl from pg_proc where oid='mtm_hw_private.sync_capture()'::regprocedure;
 execute replace(src,anchor,'TG_TABLE_NAME in (''students'',''btvn_lessons'',''classes'',''timetable'')');
 if (select coalesce(proacl::text,'') from pg_proc where oid='mtm_hw_private.sync_capture()'::regprocedure) is distinct from acl then
  raise exception 'QA116_SYNC_ACL_CHANGED';
 end if;
end$sync$;

create function mtm_test100.guard_class116() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('qa116:label:'||new.label,0));
 if exists(select 1 from mtm_hw_private.classes c where c.label=new.label and c.id<>new.id and (c.is_test or new.is_test)) then
  raise exception 'QA116_CLASS_LABEL_COLLISION' using errcode='23505';
 end if;
 if new.is_test then
  if new.label !~ '^2K(9|10|11) QA [A-Za-z0-9][A-Za-z0-9 -]{2,70}$' or new.grade not between 10 and 12 then
   raise exception 'QA116_CLASS_LABEL_OR_GRADE' using errcode='23514';
  end if;
  if TG_OP='UPDATE' and (new.owner_id,new.label,new.grade) is distinct from (old.owner_id,old.label,old.grade) then
   raise exception 'QA116_CLASS_IDENTITY_IMMUTABLE' using errcode='42501';
  end if;
 end if;
 return new;
end$$;
create trigger qa116_class before insert or update on mtm_hw_private.classes
 for each row execute function mtm_test100.guard_class116();

create function mtm_test100.guard_student_class116() returns trigger
language plpgsql security definer set search_path='' as $$
declare c mtm_hw_private.classes;old_test boolean;
begin
 select * into c from mtm_hw_private.classes where id=new.class_id for key share;
 if c.is_test and (not new.is_test or new.owner_id is distinct from c.owner_id) then
  raise exception 'QA116_REAL_STUDENT_IN_TEST_CLASS' using errcode='42501';
 end if;
 if TG_OP='UPDATE' and old.class_id is distinct from new.class_id then
  select is_test into old_test from mtm_hw_private.classes where id=old.class_id;
  if old_test then raise exception 'QA116_TEST_STUDENT_CLASS_IMMUTABLE' using errcode='42501';end if;
 end if;
 -- Legacy test learners in real classes remain unchanged and supported.
 return new;
end$$;
create trigger qa116_student_class before insert or update on mtm_hw_private.students
 for each row execute function mtm_test100.guard_student_class116();

create function mtm_test100.guard_membership116() returns trigger
language plpgsql security definer set search_path='' as $$
declare s mtm_hw_private.students;c mtm_hw_private.classes;source_test boolean;
begin
 select * into s from mtm_hw_private.students where id=new.student_id for key share;
 select * into c from mtm_hw_private.classes where id=new.class_id for key share;
 select is_test into source_test from mtm_hw_private.classes where id=s.class_id;
 if (c.is_test or source_test) and (not s.is_test or s.class_id is distinct from c.id or s.owner_id is distinct from c.owner_id) then
  raise exception 'QA116_MEMBERSHIP_SCOPE' using errcode='42501';
 end if;
 return new;
end$$;
create trigger qa116_membership before insert or update on mtm_hw_private.memberships
 for each row execute function mtm_test100.guard_membership116();

create function mtm_test100.guard_timetable116() returns trigger
language plpgsql security definer set search_path='' as $$
declare n integer;qa integer;tk text;
begin
 select count(*),count(*) filter(where is_test) into n,qa from mtm_hw_private.classes where label=new.class_label;
 if qa>0 or new.is_test then
  tk=mtm_hw_private.lesson_teacher(new.teacher);
  if n<>1 or qa<>1 or not new.is_test or tk is null
   or not exists(select 1 from public.mtm_staff where active and teacher_key=tk)
   or new.start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or new.end_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or new.end_hm<=new.start_hm then
   raise exception 'QA116_TIMETABLE_SCOPE' using errcode='42501';
  end if;
 end if;
 return new;
end$$;
create trigger qa116_timetable before insert or update on mtm_hw_private.timetable
 for each row execute function mtm_test100.guard_timetable116();

create function mtm_test100.guard_assignment116() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[];qa integer;n integer;
begin
 if TG_TABLE_NAME='assignments' then ids=array[new.class_id];else ids=new.class_ids;end if;
 select count(*),count(*) filter(where is_test) into n,qa from mtm_hw_private.classes where id=any(ids);
 if qa>0 then
  if TG_TABLE_NAME='assignments' then raise exception 'QA116_LEGACY_ASSIGNMENT_UNSCOPED' using errcode='42501';end if;
  if not new.is_test or qa<>n or n<>cardinality(ids)
   or exists(select 1 from mtm_hw_private.students where class_id=any(ids) and not is_test) then
   raise exception 'QA116_MIXED_ASSIGNMENT_SCOPE' using errcode='42501';
  end if;
  if TG_TABLE_NAME='btvn_lessons' then
   if exists(select 1 from mtm_hw_private.classes where id=any(ids) and owner_id is distinct from new.owner_id) then
    raise exception 'QA116_ASSIGNMENT_OWNER_MISMATCH' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end$$;
create trigger qa116_lesson before insert or update on mtm_hw_private.btvn_lessons
 for each row execute function mtm_test100.guard_assignment116();
create trigger qa116_upload before insert or update on mtm_hw_private.lesson_uploads
 for each row execute function mtm_test100.guard_assignment116();
create trigger qa116_assignment before insert or update on mtm_hw_private.assignments
 for each row execute function mtm_test100.guard_assignment116();

create or replace function public.mtm_btvn_classes() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(label order by label),'[]'::jsonb) from (
  select distinct label from mtm_hw_private.classes where active and not is_test
 ) x
$$;

create function public.mtm_btvn_qa_class116(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare label_name text;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then
  raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 select c.label into label_name from mtm_hw_private.classes c
 join mtm_test100.classrooms116 q on q.class_id=c.id and q.owner_id=c.owner_id
 where c.id=p_class_id and c.is_test and c.active
  and not exists(select 1 from mtm_hw_private.students s where s.class_id=c.id and not s.is_test);
 if label_name is null then raise exception 'QA116_CLASS_UNAVAILABLE' using errcode='42501';end if;
 return jsonb_build_array(label_name);
end$$;
-- Supabase may grant EXECUTE through ALTER DEFAULT PRIVILEGES. Clear every
-- actual non-owner grantee of this NEW function, not just familiar role names.
do $qa_reader_acl$
declare r record;role_name text;
begin
 for r in select distinct x.grantee from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
  where p.oid='public.mtm_btvn_qa_class116(uuid)'::regprocedure and x.grantee<>p.proowner loop
  role_name=case when r.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=r.grantee)) end;
  execute 'revoke all on function public.mtm_btvn_qa_class116(uuid) from '||role_name;
 end loop;
end$qa_reader_acl$;
grant execute on function public.mtm_btvn_qa_class116(uuid) to service_role;

-- The MTM timetable importer replaces REAL timetable rows as before. Retain the
-- synthetic row so an ordinary import cannot destroy an in-progress QA run.
-- Do not touch hv_ca_rows/real100: their deployed source is pinned by migration114.
do $timetable_import$
declare src text;acl text;anchor constant text='delete from mtm_hw_private.timetable where true;';
begin
 src=pg_get_functiondef('public.mtm_dd_api4(jsonb)'::regprocedure);
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'QA116_TKB_SOURCE_CHANGED';end if;
 select coalesce(proacl::text,'') into acl from pg_proc where oid='public.mtm_dd_api4(jsonb)'::regprocedure;
 execute replace(src,anchor,'delete from mtm_hw_private.timetable where not is_test;');
 if (select coalesce(proacl::text,'') from pg_proc where oid='public.mtm_dd_api4(jsonb)'::regprocedure) is distinct from acl then raise exception 'QA116_TKB_ACL_CHANGED';end if;
end$timetable_import$;

-- MTM bot/attendance read projections only. Exclude both legacy test lessons in
-- real classes and the newly isolated test class; preserve all other predicates,
-- date windows, sorting, deadlines, source strings, OIDs and ACLs.
do $bot_reads$
declare src text;acl text;fn regprocedure;anchor text;replacement text;r record;
begin
 for r in select * from (values
  ('public.mtm_btvn_bot_catalog(jsonb)',
   'WHERE l.active AND l.publish_status=''da_dang'' AND l.kind=''btvn'' AND c.active',
   'WHERE l.active AND NOT l.is_test AND l.publish_status=''da_dang'' AND l.kind=''btvn'' AND c.active AND NOT c.is_test'),
  ('mtm_hw_private.j39_due_rows(text,date)',
   'where l.active and l.kind=''btvn'' and l.owner_id=s.owner_id and s.class_id=any(l.class_ids)',
   'where l.active and not l.is_test and l.kind=''btvn'' and l.owner_id=s.owner_id and s.class_id=any(l.class_ids)'),
  ('mtm_hw_private.j39_due_rows(text,date)',
   'where s.active and c.active and c.label=p_class',
   'where s.active and not s.is_test and c.active and not c.is_test and c.label=p_class')
 ) x(signature,anchor,replacement) loop
  fn=to_regprocedure(r.signature);src=pg_get_functiondef(fn);anchor=r.anchor;replacement=r.replacement;
  if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'QA116_BOT_SOURCE_CHANGED: %',r.signature;end if;
  select coalesce(proacl::text,'') into acl from pg_proc where oid=fn;
  execute replace(src,anchor,replacement);
  if (select coalesce(proacl::text,'') from pg_proc where oid=fn) is distinct from acl then raise exception 'QA116_BOT_ACL_CHANGED';end if;
 end loop;
end$bot_reads$;

-- Preserve every existing native action and staff permission. Only normal
-- catalogs hide QA classes; test intake still uses the ordinary native pipeline.
create temporary table qa116_native_acl on commit drop as
 select p.proowner owner_id,x.grantee,x.privilege_type,x.is_grantable
 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 where p.oid='public.mtm_lesson_upload_api(jsonb)'::regprocedure;
do $native_owner$begin
 if not exists(select 1 from qa116_native_acl where owner_id=current_user::regrole::oid) then raise exception 'QA116_NATIVE_OWNER_REQUIRED';end if;
end$native_owner$;
alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_qa116;
create function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;items jsonb;a text=p->>'action';qa boolean=coalesce((p->>'is_test')::boolean,false);
begin
 r=public.mtm_lesson_upload_api_before_qa116(p);
 if a in ('catalog','dashboard','staff_history') and not qa then
  if r ? 'classes' then
   select coalesce(jsonb_agg(v order by ord),'[]') into items from jsonb_array_elements(r->'classes') with ordinality x(v,ord)
   where not exists(select 1 from mtm_hw_private.classes c where c.is_test and c.id::text=coalesce(v->>'id',v->>'class_id'));
   r=jsonb_set(r,'{classes}',items);
  end if;
  if r ? 'sessions' then
   select coalesce(jsonb_agg(v order by ord),'[]') into items from jsonb_array_elements(r->'sessions') with ordinality x(v,ord)
   where not exists(select 1 from mtm_hw_private.classes c where c.is_test and c.id::text=v->>'class_id');
   r=jsonb_set(r,'{sessions}',items);
  end if;
 end if;
 return r;
end$$;
revoke all on function public.mtm_lesson_upload_api_before_qa116(jsonb),public.mtm_lesson_upload_api(jsonb) from public;
do $native_acl$
declare r record;role_name text;before_acl jsonb;after_acl jsonb;
begin
 -- Reset the NEW wrapper's complete current ACL first. Otherwise a default
 -- anon/authenticator grant can survive cloning an older, tighter native ACL.
 for r in select distinct x.grantee from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
  where p.oid='public.mtm_lesson_upload_api(jsonb)'::regprocedure and x.grantee<>p.proowner loop
  role_name=case when r.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=r.grantee)) end;
  execute 'revoke all on function public.mtm_lesson_upload_api(jsonb) from '||role_name;
 end loop;
 for r in select distinct grantee,owner_id,is_grantable from qa116_native_acl where grantee<>owner_id loop
  role_name=case when r.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=r.grantee)) end;
  execute 'revoke all on function public.mtm_lesson_upload_api_before_qa116(jsonb) from '||role_name;
  execute 'grant execute on function public.mtm_lesson_upload_api(jsonb) to '||role_name||case when r.is_grantable then ' with grant option' else '' end;
 end loop;
 select jsonb_agg(jsonb_build_array(grantee,privilege_type,is_grantable) order by grantee,privilege_type,is_grantable) into before_acl from qa116_native_acl;
 select jsonb_agg(jsonb_build_array(x.grantee,x.privilege_type,x.is_grantable) order by x.grantee,x.privilege_type,x.is_grantable) into after_acl
 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid='public.mtm_lesson_upload_api(jsonb)'::regprocedure;
 if before_acl is distinct from after_acl then raise exception 'QA116_NATIVE_ACL_CHANGED';end if;
end$native_acl$;

-- Exactly one fresh class, two synthetic learners and one timetable row per
-- run_ref. No code/PIN/session is created or returned. No roster, sender, cron,
-- upload, attempt, grade or old QA record is touched. An identical retry reads
-- its receipt; a changed request or drift fails rather than repairing old rows.
create function mtm_test100.provision_classroom116(
 p_run_ref text,p_class_label text,p_grade integer,p_teacher_user_id uuid,
 p_lesson_date date,p_start_hm text,p_end_hm text,p_learners jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_uuid uuid;roster_owner uuid;tk text;cid uuid;sid uuid;students uuid[]='{}';r jsonb;i integer=0;
 h text;prior mtm_test100.classrooms116;scope_ids uuid[];today date=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 if p_run_ref is null or p_run_ref !~ '^qa116:[A-Za-z0-9][A-Za-z0-9:-]{7,90}$'
  or p_class_label is null or p_class_label !~ '^2K(9|10|11) QA [A-Za-z0-9][A-Za-z0-9 -]{2,70}$'
  or p_grade is null or p_grade not between 10 and 12
  or p_lesson_date is null or p_lesson_date not between today-1 and today+7
  or p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or p_end_hm is null or p_end_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end_hm<=p_start_hm
  or jsonb_typeof(p_learners) is distinct from 'array' or jsonb_array_length(p_learners)<>2 then
  raise exception 'QA116_INVALID_REQUEST' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_learners) x where jsonb_typeof(x) is distinct from 'object'
  or jsonb_typeof(x->'name') is distinct from 'string' or length(x->>'name') not between 4 and 100 or x->>'name' !~ '^QA[[:space:]]'
  or jsonb_typeof(x->'phone') is distinct from 'string' or x->>'phone' !~ '^0000000[0-9]{3}$'
  or (x-'name'-'phone')<>'{}'::jsonb)
  or (select count(distinct x->>'phone') from jsonb_array_elements(p_learners) x)<>2
  or (select count(distinct x->>'name') from jsonb_array_elements(p_learners) x)<>2 then
  raise exception 'QA116_SYNTHETIC_LEARNERS_REQUIRED' using errcode='22023';
 end if;
 select owner_id,class_ids into owner_uuid,scope_ids from mtm_hw_private.btvn_publish_scope where singleton for update;
 select owner_id into roster_owner from mtm_hw_private.btvn_roster_scope where singleton;
 -- This verifies the timetable assignment, not a login as the teacher. A
 -- manager may publish on behalf of an active teacher before that teacher's
 -- first password change, exactly as the normal native schedule permits.
 select teacher_key into tk from public.mtm_staff where user_id=p_teacher_user_id and active;
 if owner_uuid is null or owner_uuid is distinct from roster_owner or tk is null or mtm_hw_private.lesson_teacher(tk) is distinct from tk then
  raise exception 'QA116_OWNER_OR_TEACHER_UNVERIFIED' using errcode='42501';
 end if;
 h=encode(sha256(convert_to(jsonb_build_object('label',p_class_label,'grade',p_grade,'teacher',p_teacher_user_id,'date',p_lesson_date,'start',p_start_hm,'end',p_end_hm,'learners',p_learners)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('qa116:'||p_run_ref,0));
 select * into prior from mtm_test100.classrooms116 where run_ref=p_run_ref;
 if prior.run_ref is not null then
  if prior.request_hash<>h or prior.owner_id<>owner_uuid or prior.teacher_key<>tk
   or not(prior.class_id=any(scope_ids))
   or not exists(select 1 from mtm_hw_private.classes where id=prior.class_id and owner_id=owner_uuid and active and is_test and label=p_class_label and grade=p_grade)
   or (select count(*) from mtm_hw_private.students where class_id=prior.class_id)<>2
   or (select count(*) from mtm_hw_private.students where id=any(prior.student_ids) and class_id=prior.class_id and owner_id=owner_uuid and active and is_test)<>2
   or (select jsonb_agg(jsonb_build_object('name',s.full_name,'phone',s.student_phone) order by array_position(prior.student_ids,s.id))
       from mtm_hw_private.students s where s.id=any(prior.student_ids)) is distinct from p_learners
   or (select count(*) from mtm_hw_private.timetable where class_label=p_class_label)<>1
   or not exists(select 1 from mtm_hw_private.timetable where class_label=p_class_label and is_test and weekday=extract(isodow from p_lesson_date)::int and start_hm=p_start_hm and end_hm=p_end_hm and teacher=tk) then
   raise exception 'QA116_REPLAY_OR_STATE_CHANGED' using errcode='40001';
  end if;
  return jsonb_build_object('ok',true,'preserved',true,'classId',prior.class_id,'studentIds',prior.student_ids,'isTest',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('qa116:label:'||p_class_label,0));
 if exists(select 1 from mtm_hw_private.classes where label=p_class_label)
  or exists(select 1 from mtm_hw_private.timetable where class_label=p_class_label)
  or exists(select 1 from mtm_hw_private.students s cross join jsonb_array_elements(p_learners) x
   where s.source_identity like 'qa:class116:'||p_run_ref||':%' or x->>'phone' in (s.student_phone,s.parent_phone)) then
  raise exception 'QA116_NEW_IDENTITIES_REQUIRED' using errcode='23505';
 end if;
 insert into mtm_hw_private.classes(owner_id,label,grade,is_test) values(owner_uuid,p_class_label,p_grade,true) returning id into cid;
 for r in select value from jsonb_array_elements(p_learners) loop
  i=i+1;
  insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,student_phone,cohort,source_identity,is_test)
  values(owner_uuid,cid,r->>'name','QA INTERNAL','QA','MTM-'||upper(left(replace(gen_random_uuid()::text,'-',''),12)),r->>'phone',split_part(p_class_label,' ',1),'qa:class116:'||p_run_ref||':'||i,true) returning id into sid;
  insert into mtm_hw_private.memberships(student_id,class_id) values(sid,cid);
  students=array_append(students,sid);
 end loop;
 insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode,teacher,is_test)
 values(p_class_label,extract(isodow from p_lesson_date)::int,p_start_hm,p_end_hm,'QA INTERNAL',tk,true);
 update mtm_hw_private.btvn_publish_scope set class_ids=array_append(scope_ids,cid) where singleton and owner_id=owner_uuid;
 insert into mtm_test100.classrooms116(run_ref,request_hash,class_id,owner_id,teacher_user_id,teacher_key,lesson_date,start_hm,end_hm,student_ids)
 values(p_run_ref,h,cid,owner_uuid,p_teacher_user_id,tk,p_lesson_date,p_start_hm,p_end_hm,students);
 if exists(select 1 from mtm_hw_private.sync_events e where
  (e.entity_table='classes' and e.entity_key->>'id'=cid::text)
  or (e.entity_table='timetable' and e.entity_key->>'class_label'=p_class_label)
  or e.entity_key->>'student_id'=any(select unnest(students)::text)
  or (e.entity_table='students' and e.entity_key->>'id'=any(select unnest(students)::text))
  or (e.entity_table='memberships' and e.entity_key->>'id' in (select id::text from mtm_hw_private.memberships where student_id=any(students)))) then
  raise exception 'QA116_OUTBOX_ISOLATION_FAILED';
 end if;
 return jsonb_build_object('ok',true,'preserved',false,'classId',cid,'studentIds',students,'isTest',true);
end$$;
revoke all on function mtm_test100.guard_class116(),mtm_test100.guard_student_class116(),
 mtm_test100.guard_membership116(),mtm_test100.guard_timetable116(),mtm_test100.guard_assignment116(),
 mtm_test100.provision_classroom116(text,text,integer,uuid,date,text,text,jsonb)
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
-- Apply the same default-grant fence to ONLY the six newly created private
-- functions. Existing test100/report/cleanup function permissions stay intact.
do $qa_private_acl$
declare r record;role_name text;
begin
 for r in select distinct p.oid::regprocedure signature,x.grantee from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
  where n.nspname='mtm_test100' and p.proname in ('guard_class116','guard_student_class116','guard_membership116','guard_timetable116','guard_assignment116','provision_classroom116')
   and x.grantee<>p.proowner loop
  role_name=case when r.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=r.grantee)) end;
  execute 'revoke all on function '||r.signature::text||' from '||role_name;
 end loop;
end$qa_private_acl$;
commit;
