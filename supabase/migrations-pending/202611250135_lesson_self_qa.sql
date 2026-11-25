-- The owner provisions the dedicated classroom through the existing QA116
-- procedure and then binds it to ONE ready staff login below. An empty table
-- deliberately leaves browser intake unavailable.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';

create table mtm_test100.lesson_self_qa135 (
  singleton boolean primary key default true check (singleton),
  run_ref text unique not null references mtm_test100.classrooms116(run_ref)
    check (run_ref ~ '^qa116:self-btvn:[A-Za-z0-9-]{8,60}$'),
  actor_user_id uuid not null references public.mtm_staff(user_id),
  intake_until timestamptz not null,
  upload_id uuid unique references mtm_hw_private.lesson_uploads(id)
);
alter table mtm_test100.lesson_self_qa135 enable row level security;
revoke all on mtm_test100.lesson_self_qa135 from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- Use the immutable QA116 class/session identity and publication scope. No
-- names, phone numbers or members are returned to the browser.
create function mtm_test100.self_qa_class135(p_run_ref text)
returns mtm_test100.classrooms116
language sql stable set search_path='' as $fn$
  select q.* from mtm_test100.classrooms116 q
  join mtm_hw_private.classes c on c.id=q.class_id and c.owner_id=q.owner_id and c.active and c.is_test
  join mtm_hw_private.btvn_publish_scope s on s.singleton and s.owner_id=c.owner_id and c.id=any(s.class_ids)
  where q.run_ref=p_run_ref
    and exists (select 1 from mtm_hw_private.timetable t
      where t.is_test and t.class_label=c.label and t.teacher=q.teacher_key
        and t.weekday=extract(isodow from q.lesson_date)::int and t.start_hm=q.start_hm and t.end_hm=q.end_hm)
    and (select count(*) from mtm_hw_private.students m
      where m.class_id=c.id and m.owner_id=c.owner_id and m.is_test and m.active and m.id=any(q.student_ids))=2
    and not exists (select 1 from mtm_hw_private.students m
      where m.class_id=c.id and (not m.is_test or not (m.id=any(q.student_ids))))
    and not exists (select 1 from mtm_hw_private.memberships m where m.class_id=c.id and not (m.student_id=any(q.student_ids)))
$fn$;

-- Direct use of the normal intake RPC cannot write to this dedicated class.
-- Ordinary test and real classes remain untouched.
create function mtm_test100.guard_self_qa_intake135()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare config record; request text; prefix text;
begin
  select l.actor_user_id,l.intake_until,q.class_id,q.lesson_date,q.teacher_key,q.run_ref
    into config from mtm_test100.lesson_self_qa135 l
    join mtm_test100.classrooms116 q on q.run_ref=l.run_ref
    where q.class_id=any(new.class_ids);
  if not found then return new;end if;
  request:=current_setting('mtm.self_qa_intake135',true);
  prefix:=config.actor_user_id::text||'/'||request||'/';
  -- The stock intake records client_request_id in its outer wrapper AFTER insert.
  if coalesce(request,'') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
     or (new.client_request_id is not null and new.client_request_id::text<>request)
     or auth.uid() is distinct from config.actor_user_id
     or new.uploaded_by is distinct from config.actor_user_id or new.is_test is distinct from true
     or new.class_ids is distinct from array[config.class_id] or new.lesson_date is distinct from config.lesson_date
     or new.teacher_key is distinct from config.teacher_key or new.work_kind is distinct from 'homework'
     or new.homework_path is distinct from prefix||'homework.pdf'
     or new.answer_path is distinct from prefix||'answer.pdf' or new.version<>1
     or config.intake_until<=clock_timestamp()
     or (mtm_test100.self_qa_class135(config.run_ref)).class_id is distinct from config.class_id then
    raise exception 'SELF_QA_SCOPE' using errcode='42501';
  end if;
  return new;
end
$fn$;
create trigger lesson_upload_guard_self_qa135 before insert on mtm_hw_private.lesson_uploads
for each row execute function mtm_test100.guard_self_qa_intake135();

create function public.mtm_lesson_upload_self_qa(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  staff public.mtm_staff; config mtm_test100.lesson_self_qa135; target mtm_test100.classrooms116;
  result jsonb; source jsonb; sessions jsonb; uploads jsonb;
  action text=p->>'action'; request_id uuid; path_prefix text; due timestamptz;
  today date=(statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into staff from public.mtm_staff
   where user_id=auth.uid() and active and not must_change_password and role in ('admin','ql');
  if staff.user_id is null then raise exception 'SELF_QA_ACCESS' using errcode='42501';end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4000
    or action is null or action not in ('dashboard','create') then raise exception 'SELF_QA_SCOPE';end if;
  if action='create' then
    select * into config from mtm_test100.lesson_self_qa135 where actor_user_id=staff.user_id for update;
  else
    select * into config from mtm_test100.lesson_self_qa135 where actor_user_id=staff.user_id;
  end if;
  target:=mtm_test100.self_qa_class135(config.run_ref);

  if action='dashboard' then
    if p-'action'<>'{}'::jsonb then raise exception 'SELF_QA_SCOPE';end if;
    sessions:='[]'; uploads:='[]';
    if target.class_id is not null and (config.intake_until>statement_timestamp() or config.upload_id is not null) then
      source:=public.mtm_lesson_upload_api(jsonb_build_object('action','dashboard','is_test',true,
        'from',target.lesson_date,'to',target.lesson_date));
      select coalesce(jsonb_agg(item),'[]'::jsonb) into sessions
       from jsonb_array_elements(source->'sessions') item
       where item->>'class_id'=target.class_id::text and item->>'lesson_date'=target.lesson_date::text
         and item->>'teacher_key'=target.teacher_key and left(item->>'start_time',5)=target.start_hm
         and left(item->>'end_time',5)=target.end_hm;
      if jsonb_array_length(sessions)<>1 then raise exception 'SELF_QA_SCOPE';end if;
      sessions:=jsonb_build_array((sessions->0)||jsonb_build_object('class_ids',jsonb_build_array(target.class_id),
        'class_dates',jsonb_build_object(target.class_id,target.lesson_date)));
      select coalesce(jsonb_agg(item),'[]'::jsonb) into uploads
       from jsonb_array_elements(source->'uploads') item
       where item->>'id'=config.upload_id::text and item->'class_ids'=jsonb_build_array(target.class_id)
        and item->>'lesson_date'=target.lesson_date::text and item->>'teacher_key'=target.teacher_key
        and coalesce(item->>'work_kind','homework')='homework' and item->>'version'='1';
      if config.upload_id is not null and jsonb_array_length(uploads)<>1 then raise exception 'SELF_QA_SCOPE';end if;
    end if;
    return jsonb_build_object('self_qa',true,
      'staff',jsonb_build_object('user_id',staff.user_id,'short_name',staff.short_name,'role',staff.role,
        'display_name',staff.display_name,'teacher_key',staff.teacher_key),
      'sessions',sessions,'uploads',uploads,'teachers','[]'::jsonb,
      'week_start',today,'week_end',today,'server_now',clock_timestamp());
  end if;

  if target.class_id is null then raise exception 'SELF_QA_UNAVAILABLE';end if;
  if (p-array['action','client_request_id','class_ids','lesson_date','teacher_key','title','task_scope',
      'homework_path','answer_path','due_at_by_class'])<>'{}'::jsonb
    or p->'class_ids' is distinct from jsonb_build_array(target.class_id)
    or p->>'lesson_date' is distinct from target.lesson_date::text or p->>'teacher_key' is distinct from target.teacher_key
    or coalesce(p->>'client_request_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or jsonb_typeof(p->'title') is distinct from 'string' or length(btrim(p->>'title')) not between 1 and 200
    or jsonb_typeof(p->'task_scope') is distinct from 'string' or length(btrim(p->>'task_scope')) not between 1 and 300
    or jsonb_typeof(p->'due_at_by_class') is distinct from 'object'
    or (p->'due_at_by_class')-target.class_id::text<>'{}'::jsonb
    or coalesce(p->'due_at_by_class'->>target.class_id::text,'') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$'
  then raise exception 'SELF_QA_SCOPE';end if;
  request_id:=(p->>'client_request_id')::uuid;
  path_prefix:=staff.user_id::text||'/'||request_id::text||'/';
  if p->>'homework_path' is distinct from path_prefix||'homework.pdf'
     or p->>'answer_path' is distinct from path_prefix||'answer.pdf' then raise exception 'SELF_QA_SCOPE';end if;
  due:=(p->'due_at_by_class'->>target.class_id::text)::timestamptz;
  if config.upload_id is not null then
    if not exists(select 1 from mtm_hw_private.lesson_uploads u where u.id=config.upload_id
       and u.client_request_id=request_id and u.uploaded_by=staff.user_id and u.is_test and u.version=1)
      then raise exception 'SELF_QA_TAKEN';end if;
  else
    if config.intake_until<=clock_timestamp() then raise exception 'SELF_QA_UNAVAILABLE';end if;
    if due<=greatest(clock_timestamp(),
          (target.lesson_date+target.end_hm::time) at time zone 'Asia/Ho_Chi_Minh')
      then raise exception 'INVALID_HOMEWORK_DEADLINE';end if;
    if not exists(select 1 from mtm_hw_private.lesson_upload_automation
      where singleton and enabled and activated_at is not null
        and last_seen_at>clock_timestamp()-interval '3 minutes') then raise exception 'SELF_QA_WORKER_UNAVAILABLE';end if;
    if exists(select 1 from mtm_hw_private.lesson_uploads u where target.class_id=any(u.class_ids))
       or exists(select 1 from mtm_hw_private.btvn_lessons l where target.class_id=any(l.class_ids))
       then raise exception 'SELF_QA_TAKEN';end if;
  end if;
  perform set_config('mtm.self_qa_intake135',request_id::text,true);
  result:=public.mtm_lesson_upload_api(p||jsonb_build_object('work_kind','homework','is_test',true,'on_behalf_of',target.teacher_key));
  perform set_config('mtm.self_qa_intake135','',true);
  if result->'ok' is distinct from 'true'::jsonb or result->>'version' is distinct from '1'
     or not exists(select 1 from mtm_hw_private.lesson_uploads u
       where u.id::text=result->>'upload_id' and u.is_test and u.work_kind='homework' and u.version=1
       and u.class_ids=array[target.class_id] and u.lesson_date=target.lesson_date and u.teacher_key=target.teacher_key
       and u.uploaded_by=staff.user_id and u.client_request_id=request_id
       and u.homework_path=path_prefix||'homework.pdf' and u.answer_path=path_prefix||'answer.pdf'
       and (u.due_at_by_class->>target.class_id::text)::timestamptz=due) then raise exception 'SELF_QA_SCOPE';end if;
  if config.upload_id is null then
    update mtm_test100.lesson_self_qa135 set upload_id=(result->>'upload_id')::uuid where singleton;
  elsif config.upload_id::text is distinct from result->>'upload_id' then raise exception 'SELF_QA_SCOPE';end if;
  return result;
end
$fn$;

-- Keep the automatic worker's production lane first, and its existing lease,
-- due/class protections, and attempt budget. A stock manual QA claim cannot
-- consume the dedicated browser lane. No change to publish or review authority.
create function mtm_test100.self_qa_claim_scope135(p_upload_id uuid,p jsonb)
returns boolean language sql stable set search_path='' as $fn$
  select case when p ? 'self_qa135_upload' then
    p->'is_test'='true'::jsonb and p->'auto'='true'::jsonb
    and p->>'worker_id'='vps-web-upload-footer-v14' and p->>'worker_protocol'='110'
    and p->>'self_qa135_upload'=p_upload_id::text
    and exists(select 1 from mtm_test100.lesson_self_qa135 l
      join mtm_hw_private.lesson_uploads u on u.id=l.upload_id
      cross join lateral mtm_test100.self_qa_class135(l.run_ref) c
      where l.upload_id=p_upload_id and u.is_test and u.work_kind='homework' and u.version=1
        and u.class_ids=array[c.class_id] and u.lesson_date=c.lesson_date and u.teacher_key=c.teacher_key
        and u.uploaded_by=l.actor_user_id)
  else
    not exists(select 1 from mtm_test100.lesson_self_qa135 l where l.upload_id=p_upload_id)
  end
$fn$;

do $claim$
declare
  f pg_proc%rowtype;
  prior text; adjusted text;
  expected constant text:='df3f1699ed9c5564bf3d63868d3a97f6c247c2046779ae4aca64386ec7f92b68';
  select_anchor constant text:=$n$select x.* into u from mtm_hw_private.lesson_uploads x where x.is_test=coalesce((p->>'is_test')::boolean,false)$n$;
  idle_anchor constant text:=$n$order by x.created_at for update skip locked limit 1;
  if u.id is null then return '{"job":null}';end if;$n$;
  fallback constant text:=$n$order by x.created_at for update skip locked limit 1;
  if u.id is null then
   if p->'auto'='true'::jsonb and p->'is_test'='false'::jsonb and not (p ? 'self_qa135_upload')
      and p->>'worker_id'='vps-web-upload-footer-v14' and p->>'worker_protocol'='110' then
    declare candidate uuid;
    begin
     select upload_id into candidate from mtm_test100.lesson_self_qa135 where singleton;
     if candidate is not null then
      return public.mtm_lesson_upload_api(p||jsonb_build_object('is_test',true,'self_qa135_upload',candidate));
     end if;
    end;
   end if;
   return '{"job":null}';
  end if;$n$;
begin
  select * into strict f from pg_proc where oid='public.mtm_lesson_upload_api_before_continuation142(jsonb)'::regprocedure;
  prior:=pg_get_functiondef(f.oid);
  if pg_get_userbyid(f.proowner)<>current_user or not f.prosecdef or not ('search_path=""'=any(f.proconfig))
    or encode(sha256(convert_to(prior,'UTF8')),'hex')<>expected
    or (length(prior)-length(replace(prior,select_anchor,'')))/length(select_anchor)<>1
    or (length(prior)-length(replace(prior,idle_anchor,'')))/length(idle_anchor)<>1
    or position('lesson_upload_extract_claim125' in prior)=0 or position('self_qa135_upload' in prior)>0
    then raise exception 'SELF_QA_STOCK_CLAIM_CHANGED';end if;
  adjusted:=replace(replace(prior,select_anchor,select_anchor||
    ' and mtm_test100.self_qa_claim_scope135(x.id,p)'),idle_anchor,fallback);
  execute adjusted;
  if not exists(select 1 from pg_proc u where u.oid=f.oid and u.proowner=f.proowner
    and u.prosecdef=f.prosecdef and u.proconfig is not distinct from f.proconfig
    and u.proacl is not distinct from f.proacl and pg_get_functiondef(u.oid)=adjusted)
    then raise exception 'SELF_QA_CLAIM_METADATA_CHANGED';end if;
end
$claim$;

revoke all on function public.mtm_lesson_upload_self_qa(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
revoke all on function mtm_test100.self_qa_class135(text),mtm_test100.guard_self_qa_intake135(),
  mtm_test100.self_qa_claim_scope135(uuid,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $acl$
declare entry record;
begin
  for entry in select distinct p.oid::regprocedure signature,r.rolname from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    join pg_roles r on r.oid=a.grantee
    where p.oid in ('public.mtm_lesson_upload_self_qa(jsonb)'::regprocedure,
      'mtm_test100.self_qa_class135(text)'::regprocedure,'mtm_test100.guard_self_qa_intake135()'::regprocedure,
      'mtm_test100.self_qa_claim_scope135(uuid,jsonb)'::regprocedure) and a.grantee<>p.proowner
  loop
    execute format('revoke execute on function %s from %I',entry.signature,entry.rolname);
  end loop;
  for entry in select distinct r.rolname from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    join pg_roles r on r.oid=a.grantee
    where c.oid='mtm_test100.lesson_self_qa135'::regclass and a.grantee<>c.relowner
  loop
    execute format('revoke all on mtm_test100.lesson_self_qa135 from %I',entry.rolname);
  end loop;
end
$acl$;
grant execute on function public.mtm_lesson_upload_self_qa(jsonb) to authenticated;
commit;
