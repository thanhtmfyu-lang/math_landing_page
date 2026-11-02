-- Review-only migration. Never apply automatically. No existing password reset.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table if not exists public.mtm_staff(
 user_id uuid primary key references auth.users(id), short_name text unique not null,
 display_name text not null, role text not null check(role in ('gv','ql','admin')),
 teacher_key text, active boolean not null default true);
alter table public.mtm_staff enable row level security;
revoke all on public.mtm_staff from public,anon,authenticated,service_role;
create or replace function public.mtm_lesson_staff() returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(s) from public.mtm_staff s where s.user_id=auth.uid() and s.active
$$;
revoke all on function public.mtm_lesson_staff() from public,anon;
grant execute on function public.mtm_lesson_staff() to authenticated;

-- Exact aliases only. Unknown or missing schedule teacher is never assigned by inference.
create or replace function mtm_hw_private.lesson_teacher(p text) returns text
language sql immutable set search_path='' as $$
 select case lower(regexp_replace(btrim(normalize(p,NFC)),'\s+',' ','g'))
 when 'thaythanh' then 'thaythanh' when 'thầy thành' then 'thaythanh' when 'tô minh thành' then 'thaythanh'
 when 'thaytai' then 'thaytai' when 'thầy tài' then 'thaytai' when 'trần thanh anh tài' then 'thaytai'
 when 'thayhieu' then 'thayhieu' when 'thầy hiếu' then 'thayhieu' when 'trần đức hiếu' then 'thayhieu'
 when 'thayhoang' then 'thayhoang' when 'thầy hoàng' then 'thayhoang' when 'nguyễn duy hoàng' then 'thayhoang'
 when 'thaygiang' then 'thaygiang' when 'thầy giang' then 'thaygiang' when 'giang' then 'thaygiang' end
$$;
create or replace function mtm_hw_private.lesson_sessions(df date,dt date)
returns table(class_id uuid,class_name text,lesson_date date,teacher_key text,start_time text,end_time text,group_key text)
language sql stable security definer set search_path='' as $$
 select distinct c.id,c.label,d::date,mtm_hw_private.lesson_teacher(t.teacher),t.start_hm,t.end_hm,
 case when c.label in ('2K9 9+','2K9 8+') and extract(isodow from d)::int<=6
 then '2k9-pair:'||mtm_hw_private.lesson_teacher(t.teacher)||':'||
  (d::date-((extract(isodow from d)::int-1)%2))::text
 else c.id::text||':'||d::date::text||':'||t.start_hm end
 from mtm_hw_private.timetable t
 join mtm_hw_private.classes c on c.label=t.class_label and c.active
 join mtm_hw_private.btvn_publish_scope ps on ps.singleton and c.owner_id=ps.owner_id and c.id=any(ps.class_ids)
 cross join generate_series(df,dt,interval '1 day') d
 where t.weekday=extract(isodow from d)::int
 and (c.label ~ '^2K(9|10|11)( |$)' or c.label ~ '^HSA([. ]|$)')
 and mtm_hw_private.lesson_teacher(t.teacher) is not null
 and exists(select 1 from public.mtm_staff s where s.active and s.teacher_key=mtm_hw_private.lesson_teacher(t.teacher))
 and t.start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and t.end_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 and not exists(select 1 from mtm_hw_private.timetable t2 where t2.class_label=t.class_label and t2.weekday=t.weekday
  and (mtm_hw_private.lesson_teacher(t2.teacher) is distinct from mtm_hw_private.lesson_teacher(t.teacher)
   or t2.start_hm<>t.start_hm or t2.end_hm<>t.end_hm))
$$;
create table if not exists mtm_hw_private.lesson_uploads(
 id uuid primary key default gen_random_uuid(), class_ids uuid[] not null,
 class_dates jsonb not null, start_times jsonb not null, end_times jsonb not null, class_names jsonb not null,
 due_at_by_class jsonb not null,lesson_date date not null,teacher_key text not null,
 title text not null check(length(title) between 1 and 200), task_scope text not null default '',
 homework_path text,answer_path text,answer_text text,handout_path text,video_url text,
 uploaded_by uuid not null references public.mtm_staff(user_id),on_behalf_of text,
 version integer not null,group_key text not null,is_test boolean not null default false,created_at timestamptz not null default clock_timestamp(),
 claim_token uuid,lease_until timestamptz,worker_id text,attempt_count integer not null default 0 check(attempt_count between 0 and 3),checkpoint jsonb not null default '{}',finished_at timestamptz,
 unique(group_key,version),check(cardinality(class_ids)>0),check(homework_path is null or length(task_scope)>0));
create index if not exists lesson_uploads_date_idx on mtm_hw_private.lesson_uploads(lesson_date,teacher_key,created_at desc);
create index if not exists lesson_uploads_queue_idx on mtm_hw_private.lesson_uploads(created_at) where finished_at is null;
create index if not exists lesson_uploads_group_idx on mtm_hw_private.lesson_uploads(group_key,version desc);
create index if not exists lesson_uploads_classes_idx on mtm_hw_private.lesson_uploads using gin(class_ids);
-- An unforgeable in-transaction capability. Caller-set GUCs are never authority.
create table if not exists mtm_hw_private.lesson_publish_capability(
 txid bigint primary key,upload_id uuid not null references mtm_hw_private.lesson_uploads(id),claim_token uuid not null);
alter table mtm_hw_private.lesson_publish_capability enable row level security;
revoke all on mtm_hw_private.lesson_publish_capability from public,anon,authenticated,service_role,mtm_btvn_publisher;
create table if not exists mtm_hw_private.lesson_upload_steps(
 upload_id uuid not null references mtm_hw_private.lesson_uploads(id),step integer not null check(step between 1 and 6),
 status text not null check(status in ('cho','dang','xong','loi')),detail text not null default '',updated_at timestamptz not null default clock_timestamp(),
 primary key(upload_id,step));
alter table mtm_hw_private.lesson_uploads enable row level security;
alter table mtm_hw_private.lesson_upload_steps enable row level security;
revoke all on mtm_hw_private.lesson_uploads,mtm_hw_private.lesson_upload_steps from public,anon,authenticated,service_role;
-- Answers stay in private tables and this non-public bucket. No UPDATE/upsert/delete policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('mtm-lesson-private','mtm-lesson-private',false,20971520,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.mtm_lesson_storage_access(p_path text,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mtm_staff s where s.user_id=auth.uid() and s.active
 and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-zA-Z0-9_.-]+\.(pdf|jpg|jpeg|png)$'
 and (split_part(p_path,'/',1)=s.user_id::text or (not p_write and s.role in ('ql','admin'))))
$$;
revoke all on function public.mtm_lesson_storage_access(text,boolean) from public,anon;
grant execute on function public.mtm_lesson_storage_access(text,boolean) to authenticated;
drop policy if exists mtm_lesson_private_insert on storage.objects;
create policy mtm_lesson_private_insert on storage.objects for insert to authenticated
 with check(bucket_id='mtm-lesson-private' and public.mtm_lesson_storage_access(name,true));
drop policy if exists mtm_lesson_private_read on storage.objects;
create policy mtm_lesson_private_read on storage.objects for select to authenticated
 using(bucket_id='mtm-lesson-private' and public.mtm_lesson_storage_access(name,false));

create or replace function mtm_hw_private.lesson_upload_current(u mtm_hw_private.lesson_uploads) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from mtm_hw_private.lesson_uploads n where
 ((n.group_key=u.group_key and n.version>u.version) or n.created_at>u.created_at) and n.id<>u.id and n.is_test=u.is_test and n.class_ids&&u.class_ids
 and exists(select 1 from unnest(n.class_ids) c where c=any(u.class_ids) and n.class_dates->>c::text=u.class_dates->>c::text))
$$;
create or replace function mtm_hw_private.lesson_payload_safe(p jsonb,u mtm_hw_private.lesson_uploads) returns boolean
language sql immutable set search_path='' as $$
 select p is not null and p::text !~* 'mtm-lesson-private'
 and not jsonb_path_exists(p,'$.**.answer_path') and not jsonb_path_exists(p,'$.**.answer_text')
 and not jsonb_path_exists(p,'$.**.homework_path') and not jsonb_path_exists(p,'$.**.handout_path')
 and not exists(select 1 from unnest(array[u.homework_path,u.answer_path,u.handout_path]) path
  where nullif(path,'') is not null and position(path in p::text)>0)
$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action'; staff public.mtm_staff; u mtm_hw_private.lesson_uploads; session record;
 df date;dt date;today date=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
 ids uuid[];dates jsonb='{}';names jsonb='{}';starts jsonb='{}';ends jsonb='{}';dues jsonb='{}';opens jsonb='{}';g text;tk text;
 v integer;path text;st integer;stat text;v_detail text;out jsonb;token uuid;payload jsonb;receipt jsonb;old record;
 qa boolean=coalesce((p->>'is_test')::boolean,false);
begin
 if octet_length(p::text)>1048576 then raise exception 'PAYLOAD_TOO_LARGE';end if;
 if a like 'worker_%' or a='sheet_precedence' then
   if coalesce(auth.role(),'')<>'service_role'
   and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if a='sheet_precedence' then
   select x.* into u from mtm_hw_private.lesson_uploads x where (p->>'class_id')::uuid=any(x.class_ids)
    and x.homework_path is not null and x.is_test=qa
    and x.class_dates->>(p->>'class_id')=p->>'lesson_date' order by x.created_at desc limit 1;
   return jsonb_build_object('web_wins',u.id is not null,'upload_id',u.id);
  end if;
  if a='worker_claim' then
   if length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'WORKER_ID_REQUIRED';end if;
   -- One initial attempt plus at most two retries. A new teacher version can retry
   -- after terminal failure; do not silently loop a bad/expensive provider job.
   update mtm_hw_private.lesson_upload_steps z set status='loi',detail='Đã thử 3 lần nhưng chưa hoàn tất. Vui lòng kiểm tra và tải lại buổi học.',updated_at=clock_timestamp()
    from mtm_hw_private.lesson_uploads x where x.id=z.upload_id and x.finished_at is null and x.attempt_count>=3
    and x.lease_until<clock_timestamp() and mtm_hw_private.lesson_upload_current(x)
    and z.step=(select min(step) from mtm_hw_private.lesson_upload_steps zz where zz.upload_id=x.id and zz.status<>'xong');
   select x.* into u from mtm_hw_private.lesson_uploads x
    where x.finished_at is null and x.attempt_count<3 and (x.lease_until is null or x.lease_until<clock_timestamp())
    and mtm_hw_private.lesson_upload_current(x)
    and (x.homework_path is not null or not exists(select 1 from unnest(x.class_ids) ci where not exists(
     select 1 from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and l.is_test=x.is_test and ci=any(l.class_ids)
      and coalesce(l.material->'classDates'->>(x.class_names->>ci::text),l.material->>'date')=x.class_dates->>ci::text
      and l.class_ids<@x.class_ids and not exists(select 1 from unnest(l.class_ids) ci2
       where coalesce(l.material->'classDates'->>(x.class_names->>ci2::text),l.material->>'date') is distinct from x.class_dates->>ci2::text))))
    and not exists(select 1 from mtm_hw_private.lesson_upload_steps s where s.upload_id=x.id and s.status='loi')
    order by x.created_at for update skip locked limit 1;
   if u.id is null then return '{"job":null}'::jsonb;end if;
   update mtm_hw_private.lesson_uploads set claim_token=gen_random_uuid(),worker_id=p->>'worker_id',attempt_count=attempt_count+1,
    lease_until=clock_timestamp()+make_interval(secs=>least(900,greatest(60,coalesce((p->>'lease_seconds')::int,600)))) where id=u.id returning * into u;
   return jsonb_build_object('job',(to_jsonb(u)-'lease_until'-'finished_at')||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),
    'steps',(select jsonb_agg(to_jsonb(s) order by s.step) from mtm_hw_private.lesson_upload_steps s where s.upload_id=u.id)));
  end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  perform pg_advisory_xact_lock(hashtextextended('lesson-upload:'||u.group_key,0));
  if u.id is null or u.claim_token is distinct from (p->>'claim_token')::uuid or u.lease_until<clock_timestamp()
   or u.claim_token is null or not mtm_hw_private.lesson_upload_current(u) then raise exception 'STALE_UPLOAD_OR_LEASE' using errcode='40001';end if;
  if u.finished_at is not null then
   if a='worker_finish' then return '{"ok":true,"already_applied":true}'::jsonb;end if;
   raise exception 'FINISHED_UPLOAD_IMMUTABLE';
  end if;
  if a='worker_assert_current' then
   update mtm_hw_private.lesson_uploads set lease_until=clock_timestamp()+interval '10 minutes' where id=u.id;
   return '{"ok":true}'::jsonb;end if;
  if a='worker_checkpoint' then
   st=(p->>'step')::int;stat=p->>'status';v_detail=left(coalesce(p->>'detail',''),1000);
   if st is null or stat is null or st not between 2 and 6 or stat not in ('cho','dang','xong','loi') then raise exception 'INVALID_STEP';end if;
   if exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<st and status<>'xong') then raise exception 'PRIOR_STEP_INCOMPLETE';end if;
   if st=6 and stat='xong' and not (u.checkpoint ? 'publish_receipts') then raise exception 'PUBLISH_RECEIPTS_REQUIRED';end if;
   if p ? 'checkpoint' and (jsonb_typeof(p->'checkpoint')<>'object'
    or (p->'checkpoint' ? 'publish_receipts' and p->'checkpoint'->'publish_receipts' is distinct from u.checkpoint->'publish_receipts')) then raise exception 'INVALID_CHECKPOINT';end if;
   update mtm_hw_private.lesson_upload_steps set status=stat,detail=v_detail,updated_at=clock_timestamp() where upload_id=u.id and step=st;
   update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||coalesce(p->'checkpoint','{}'),lease_until=clock_timestamp()+interval '10 minutes' where id=u.id;
   return '{"ok":true}'::jsonb;
  end if;
  if a='worker_finish' then
   if exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and status<>'xong') then raise exception 'STEPS_INCOMPLETE';end if;
   update mtm_hw_private.lesson_uploads set finished_at=clock_timestamp(),lease_until=null where id=u.id;
   return '{"ok":true}'::jsonb;
  end if;
  if a='worker_materials' then
   if u.homework_path is not null then raise exception 'HOMEWORK_REQUIRES_PUBLISH';end if;
   if u.checkpoint ? 'publish_receipts' then return jsonb_build_object('ok',true,'publish_receipts',u.checkpoint->'publish_receipts','already_applied',true);end if;
   if exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<5 and status<>'xong') then raise exception 'PRIOR_STEP_INCOMPLETE';end if;
   if jsonb_typeof(p->'material') is distinct from 'object' or p->'material'='{}'::jsonb
    or exists(select 1 from jsonb_object_keys(p->'material') k where k not in ('videoId','videoUrl','handoutUrl','materialUrl','title'))
    or not mtm_hw_private.lesson_payload_safe(p->'material',u) then raise exception 'UNSAFE_MATERIAL_PATCH';end if;
   receipt='{}';
   foreach path in array array(select unnest(u.class_ids)::text) loop
    select l.code into v_detail from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and l.is_test=u.is_test and path::uuid=any(l.class_ids)
     and coalesce(l.material->'classDates'->>(u.class_names->>path),l.material->>'date')=u.class_dates->>path
     and l.class_ids<@u.class_ids and not exists(select 1 from unnest(l.class_ids) ci
      where coalesce(l.material->'classDates'->>(u.class_names->>ci::text),l.material->>'date') is distinct from u.class_dates->>ci::text)
     order by l.updated_at desc limit 1;
    if v_detail is null then raise exception 'MATERIAL_LESSON_NOT_PUBLISHED';end if;
    out=public.mtm_btvn_pipeline_before_lesson_upload('update_material',jsonb_build_object('lesson_key',v_detail,'material',p->'material'));
    if coalesce(out->>'status','')<>'updated' then raise exception 'MATERIAL_UPDATE_NOT_CONFIRMED';end if;
    receipt=receipt||jsonb_build_object(path,jsonb_build_object('lesson_code',v_detail,'receipt',out));
   end loop;
   update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||jsonb_build_object('publish_receipts',receipt) where id=u.id;
   return jsonb_build_object('ok',true,'publish_receipts',receipt);
  end if;
  if a='worker_publish' then
   if u.checkpoint ? 'publish_receipts' then return jsonb_build_object('ok',true,'publish_receipts',u.checkpoint->'publish_receipts','already_applied',true);end if;
   if exists(select 1 from mtm_hw_private.lesson_upload_steps where upload_id=u.id and step<6 and status<>'xong') then raise exception 'PRIOR_STEP_INCOMPLETE';end if;
   payload=p->'payload';
   if not mtm_hw_private.lesson_payload_safe(payload,u) then raise exception 'PRIVATE_SOURCE_IN_PUBLISH';end if;
   if payload->>'lesson_key' is distinct from 'web-'||replace(u.id::text,'-','') then raise exception 'LESSON_CODE_MISMATCH';end if;
   if (select array_agg(x order by x) from jsonb_array_elements_text(payload->'material'->'classNames') x)
    is distinct from (select array_agg(value order by value) from jsonb_each_text(u.class_names)) then raise exception 'CLASS_SCOPE_MISMATCH';end if;
   foreach path in array array(select unnest(u.class_ids)::text) loop
    if payload->'material'->'classDates'->>(u.class_names->>path) is distinct from u.class_dates->>path then raise exception 'CLASS_DATE_MISMATCH';end if;
    opens=opens||jsonb_build_object(u.class_names->>path,((u.class_dates->>path)::date+(u.end_times->>path)::time) at time zone 'Asia/Ho_Chi_Minh');
   end loop;
   payload=jsonb_set(payload,'{material,classOpensAt}',opens);
   -- Only this private row can authorize the guarded original publisher.
   insert into mtm_hw_private.lesson_publish_capability(txid,upload_id,claim_token) values(txid_current(),u.id,u.claim_token);
   out=public.mtm_btvn_pipeline('publish',payload);
   delete from mtm_hw_private.lesson_publish_capability where txid=txid_current();
   if coalesce(out->>'status','') not in ('da_dang','already_published') then raise exception 'PUBLICATION_FAILED';end if;
   -- Preserve records and submissions; remove only superseded class assignments.
   for old in select l.code,l.class_ids from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and l.is_test=u.is_test
    and l.code<>payload->>'lesson_key' and l.class_ids&&u.class_ids for update loop
    select array_agg(c) into ids from unnest(old.class_ids) c where not(c=any(u.class_ids)
     and coalesce((select l.material->'classDates'->>(u.class_names->>c::text) from mtm_hw_private.btvn_lessons l where l.code=old.code),
      (select l.material->>'date' from mtm_hw_private.btvn_lessons l where l.code=old.code))=u.class_dates->>c::text);
    update mtm_hw_private.btvn_lessons set class_ids=coalesce(ids,'{}'),active=cardinality(coalesce(ids,'{}'))>0,
     publish_status=case when cardinality(coalesce(ids,'{}'))>0 then 'da_dang' else 'cho_duyet' end where code=old.code;
   end loop;
   select jsonb_object_agg(c::text,jsonb_build_object('lesson_code',payload->>'lesson_key','receipt',out)) into receipt from unnest(u.class_ids) c;
   update mtm_hw_private.lesson_uploads set checkpoint=checkpoint||jsonb_build_object('publish_receipts',receipt) where id=u.id;
   return jsonb_build_object('ok',true,'publish_receipts',receipt);
  end if;
  raise exception 'UNKNOWN_ACTION';
 end if;
 select * into staff from public.mtm_staff where user_id=auth.uid() and active;
 if staff.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
 if qa and staff.role not in ('ql','admin') then raise exception 'MANAGER_REQUIRED' using errcode='42501';end if;
 df=coalesce((p->>'from')::date,today-(extract(isodow from today)::int-1));dt=coalesce((p->>'to')::date,df+6);
 if dt<df or dt>df+31 then raise exception 'INVALID_DATE_RANGE';end if;
 if a in ('dashboard','catalog') then
  return jsonb_build_object('staff',to_jsonb(staff),'server_now',clock_timestamp(),'week_start',df,'week_end',dt,'schedule_source','mtm_hw_private.timetable',
   'teachers',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'short_name',short_name,'role',role,'teacher_key',teacher_key,'display_name',display_name)) from public.mtm_staff where active and teacher_key is not null),'[]'),
   'classes',coalesce((select jsonb_agg(distinct jsonb_build_object('id',s.class_id,'name',s.class_name,'teacher_key',s.teacher_key)) from mtm_hw_private.lesson_sessions(df,dt) s where staff.role in ('ql','admin') or s.teacher_key=staff.teacher_key),'[]'),
   'sessions',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('class_ids',(select jsonb_agg(distinct ss.class_id) from mtm_hw_private.lesson_sessions(df-1,dt+1) ss where ss.group_key=s.group_key))) from mtm_hw_private.lesson_sessions(df,dt) s where staff.role in ('ql','admin') or s.teacher_key=staff.teacher_key),'[]'),
   'uploads',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'class_ids',x.class_ids,'class_dates',x.class_dates,'lesson_date',x.lesson_date,'teacher_key',x.teacher_key,
    'title',x.title,'task_scope',x.task_scope,'homework_uploaded',x.homework_path is not null,'answer_uploaded',x.answer_path is not null or x.answer_text is not null,
    'handout_uploaded',x.handout_path is not null,'video_uploaded',x.video_url is not null,'video_url',x.video_url,'version',x.version,'created_at',x.created_at,
    'uploaded_by',x.uploaded_by,'on_behalf_of',x.on_behalf_of,'is_current',mtm_hw_private.lesson_upload_current(x),
    'steps',(select jsonb_agg(jsonb_build_object('step',z.step,'status',z.status,'detail',z.detail) order by z.step) from mtm_hw_private.lesson_upload_steps z where z.upload_id=x.id)) order by x.created_at desc)
    from mtm_hw_private.lesson_uploads x where x.is_test=qa and x.lesson_date between df-1 and dt+1 and (staff.role in ('ql','admin') or x.teacher_key=staff.teacher_key)),'[]'));
 end if;
 if a<>'create' then raise exception 'UNKNOWN_ACTION';end if;
 if (p->>'lesson_date')::date not between today-31 and today+31 then raise exception 'LESSON_DATE_OUTSIDE_WINDOW';end if;
 select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(p->'class_ids') x;
 if cardinality(ids) is null or cardinality(ids)>8 then raise exception 'INVALID_CLASSES';end if;
 select * into session from mtm_hw_private.lesson_sessions((p->>'lesson_date')::date,(p->>'lesson_date')::date) s where s.class_id=any(ids) limit 1;
 if not found then raise exception 'SCHEDULE_OR_TEACHER_UNVERIFIED';end if;
 g=session.group_key;tk=session.teacher_key;
 if qa then g=g||':qa';end if;
 if staff.role='gv' and tk is distinct from staff.teacher_key then raise exception 'OTHER_TEACHER' using errcode='42501';end if;
 if p->>'teacher_key' is distinct from tk then raise exception 'TEACHER_MISMATCH';end if;
 if (select count(*)>count(distinct class_id) from mtm_hw_private.lesson_sessions(session.lesson_date-1,session.lesson_date+1) s where s.group_key=session.group_key)
  then raise exception 'AMBIGUOUS_PAIRED_SCHEDULE';end if;
 select array_agg(distinct class_id) into ids from mtm_hw_private.lesson_sessions(session.lesson_date-1,session.lesson_date+1) s where s.group_key=session.group_key;
 -- Submitted class list may be one selected member or full pair, never unrelated IDs.
 if exists(select 1 from jsonb_array_elements_text(p->'class_ids') x where not(x::uuid=any(ids))) then raise exception 'CLASS_SCOPE_MISMATCH';end if;
 for session in select * from mtm_hw_private.lesson_sessions(session.lesson_date-1,session.lesson_date+1) s where s.group_key=session.group_key loop
  dates=dates||jsonb_build_object(session.class_id::text,session.lesson_date);names=names||jsonb_build_object(session.class_id::text,session.class_name);
  starts=starts||jsonb_build_object(session.class_id::text,session.start_time);
  ends=ends||jsonb_build_object(session.class_id::text,session.end_time);
  dues=dues||jsonb_build_object(session.class_id::text,((session.lesson_date+7+session.start_time::time) at time zone 'Asia/Ho_Chi_Minh')-interval '30 minutes');
 end loop;
 if nullif(btrim(p->>'title'),'') is null or length(p->>'title')>200 or length(coalesce(p->>'task_scope',''))>300
 or length(coalesce(p->>'answer_text',''))>20000 then raise exception 'INVALID_TEXT';end if;
 if nullif(p->>'answer_path','') is not null and nullif(btrim(p->>'answer_text'),'') is not null then raise exception 'AMBIGUOUS_ANSWER_SOURCE';end if;
 if nullif(p->>'homework_path','') is null and (nullif(p->>'answer_path','') is not null or nullif(btrim(p->>'answer_text'),'') is not null) then raise exception 'HOMEWORK_REQUIRED_WITH_ANSWERS';end if;
 if nullif(p->>'homework_path','') is not null and nullif(btrim(p->>'task_scope'),'') is null then raise exception 'TASK_SCOPE_REQUIRED';end if;
 if coalesce(nullif(p->>'homework_path',''),nullif(p->>'answer_path',''),nullif(p->>'answer_text',''),nullif(p->>'handout_path',''),nullif(p->>'video_url','')) is null then raise exception 'CONTENT_REQUIRED';end if;
 foreach path in array array[p->>'homework_path',p->>'answer_path',p->>'handout_path'] loop
  if nullif(path,'') is not null and (not public.mtm_lesson_storage_access(path,true) or not exists(select 1 from storage.objects o where o.bucket_id='mtm-lesson-private' and o.name=path
   and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png') and (o.metadata->>'size')::bigint between 1 and 20971520)) then raise exception 'PRIVATE_FILE_NOT_UPLOADED';end if;
 end loop;
 if nullif(p->>'handout_path','') is not null and p->>'handout_path' !~ '\.pdf$' then raise exception 'HANDOUT_REQUIRES_PDF';end if;
 if nullif(p->>'video_url','') is not null and (p->>'video_url' !~ '^https://(www\.)?(youtube\.com/(watch\?v=|live/|shorts/|embed/)|youtu\.be/)[A-Za-z0-9_-]{11}([?&#].*)?$'
  and p->>'video_url' !~ '^https://([a-z0-9-]+\.)?zoom\.us/rec/(share|play)/[A-Za-z0-9_.-]+([?&#].*)?$') then raise exception 'INVALID_VIDEO_URL';end if;
 if staff.role='gv' and nullif(p->>'on_behalf_of','') is not null then raise exception 'MANAGER_REQUIRED';end if;
 if nullif(p->>'on_behalf_of','') is not null and p->>'on_behalf_of'<>tk then raise exception 'BEHALF_MISMATCH';end if;
 perform pg_advisory_xact_lock(hashtextextended('lesson-upload:'||g,0));
 if nullif(p->>'homework_path','') is null and exists(select 1 from mtm_hw_private.lesson_uploads x
  where x.group_key=g and x.is_test=qa and x.homework_path is not null and x.finished_at is null and mtm_hw_private.lesson_upload_current(x))
 then raise exception 'FULL_HOMEWORK_REUPLOAD_REQUIRED';end if;
 select coalesce(max(version),0)+1 into v from mtm_hw_private.lesson_uploads where group_key=g;
 insert into mtm_hw_private.lesson_uploads(class_ids,class_dates,class_names,start_times,end_times,due_at_by_class,lesson_date,teacher_key,title,task_scope,
  homework_path,answer_path,answer_text,handout_path,video_url,uploaded_by,on_behalf_of,version,group_key,is_test)
 values(ids,dates,names,starts,ends,dues,(p->>'lesson_date')::date,tk,btrim(p->>'title'),coalesce(btrim(p->>'task_scope'),''),nullif(p->>'homework_path',''),
  nullif(p->>'answer_path',''),nullif(btrim(p->>'answer_text'),''),nullif(p->>'handout_path',''),nullif(p->>'video_url',''),staff.user_id,
  case when staff.role in ('ql','admin') then tk else null end,v,g,qa) returning * into u;
 insert into mtm_hw_private.lesson_upload_steps(upload_id,step,status) select u.id,n,case when n=1 then 'xong' else 'cho' end from generate_series(1,6) n;
 return jsonb_build_object('ok',true,'upload_id',u.id,'version',v);
end$$;
revoke all on function public.mtm_lesson_upload_api(jsonb) from public,anon;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;
revoke all on function mtm_hw_private.lesson_teacher(text),mtm_hw_private.lesson_sessions(date,date),mtm_hw_private.lesson_upload_current(mtm_hw_private.lesson_uploads),
 mtm_hw_private.lesson_payload_safe(jsonb,mtm_hw_private.lesson_uploads) from public,anon,authenticated,service_role;

-- Guard the existing sheet path without editing protected publisher files.
do $$begin
 if to_regprocedure('public.mtm_btvn_pipeline_before_lesson_upload(text,jsonb)') is null then
  alter function public.mtm_btvn_pipeline(text,jsonb) rename to mtm_btvn_pipeline_before_lesson_upload;
 end if;
end$$;
create or replace function public.mtm_btvn_pipeline(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare authorized uuid;cap_token uuid;u mtm_hw_private.lesson_uploads;mat jsonb;kept text[];excluded text[];result jsonb;
begin
 if p_action in ('publish','update_material','error') then
  mat=p_payload->'material';
  if p_action='update_material' then
   select l.material into mat from mtm_hw_private.btvn_lessons l where l.code=p_payload->>'lesson_key';
  end if;
  select upload_id,claim_token into authorized,cap_token from mtm_hw_private.lesson_publish_capability where txid=txid_current();
  if authorized is null then
   if p_payload->>'lesson_key' ~ '^web-[0-9a-f]{32}$' then raise exception 'WEB_PUBLISH_CAPABILITY_REQUIRED' using errcode='42501';end if;
   if p_action='error' then return public.mtm_btvn_pipeline_before_lesson_upload(p_action,p_payload);end if;
   select array_agg(label) filter(where not blocked),array_agg(label) filter(where blocked) into kept,excluded
   from (select label,exists(select 1 from mtm_hw_private.lesson_uploads x cross join unnest(x.class_ids) c
    where not x.is_test and x.homework_path is not null and x.class_names->>c::text=label
    and x.class_dates->>c::text=coalesce(mat->'classDates'->>label,mat->>'date')) blocked
    from jsonb_array_elements_text(mat->'classNames') label) scope;
   if cardinality(excluded)>0 then
    if p_action='update_material' or coalesce(cardinality(kept),0)=0 then
     return jsonb_build_object('status','web_upload_precedence','skipped',true,'excluded_web_classes',excluded);
    end if;
    -- A shared sheet file may still serve unrelated classes. Keep its validated
    -- exam/assets while excluding only the web-owned class/date assignments.
    mat=jsonb_set(mat,'{classNames}',to_jsonb(kept));
    if mat ? 'classDates' then mat=jsonb_set(mat,'{classDates}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(mat->'classDates') where key=any(kept)),'{}'));end if;
    if mat ? 'classOpensAt' then mat=jsonb_set(mat,'{classOpensAt}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(mat->'classOpensAt') where key=any(kept)),'{}'));end if;
    p_payload=jsonb_set(p_payload,'{material}',mat);
   end if;
  else
   select * into u from mtm_hw_private.lesson_uploads where id=authorized;
   if u.id is null or u.claim_token is distinct from cap_token or u.claim_token is null
    or u.finished_at is not null or u.lease_until is null or u.lease_until<=clock_timestamp() or not mtm_hw_private.lesson_upload_current(u)
    or p_payload->>'lesson_key' is distinct from 'web-'||replace(u.id::text,'-','') then raise exception 'STALE_UPLOAD_OR_LEASE';end if;
  end if;
 end if;
 result=public.mtm_btvn_pipeline_before_lesson_upload(p_action,p_payload);
 return case when cardinality(excluded)>0 then result||jsonb_build_object('excluded_web_classes',excluded) else result end;
end$$;
revoke all on function public.mtm_btvn_pipeline_before_lesson_upload(text,jsonb),public.mtm_btvn_pipeline(text,jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_pipeline(text,jsonb) to mtm_btvn_publisher;
-- Policies store function OIDs across rename; bind the sheet storage path to this
-- wrapper again while keeping the original private implementation inaccessible.
drop policy if exists btvn_pipeline_insert on storage.objects;
create policy btvn_pipeline_insert on storage.objects for insert to mtm_btvn_publisher
 with check(bucket_id='mtm-btvn' and name ~ '^btvn/[a-z0-9-]{1,160}/[0-9a-f]{64}/[a-zA-Z0-9_/-]+\.(png|pdf)$'
  and name !~ '(^|/)\.\.(/|$)' and (public.mtm_btvn_pipeline('lookup',jsonb_build_object('lesson_key',split_part(name,'/',2)))->>'status') is distinct from 'da_dang');

-- Existing is_test100_lesson_flag forbids changing scope after INSERT. Set the
-- scope on the original publisher's INSERT, within the fenced transaction.
create or replace function mtm_hw_private.lesson_web_test_scope() returns trigger
language plpgsql security definer set search_path='' as $$
declare uid uuid;cap_token uuid;u mtm_hw_private.lesson_uploads;
begin
 select upload_id,claim_token into uid,cap_token from mtm_hw_private.lesson_publish_capability where txid=txid_current();
 if uid is not null then
  select * into u from mtm_hw_private.lesson_uploads where id=uid;
  if u.id is null or u.claim_token is distinct from cap_token or u.claim_token is null or u.finished_at is not null
   or u.lease_until is null or u.lease_until<=clock_timestamp() or not mtm_hw_private.lesson_upload_current(u)
   or new.code is distinct from 'web-'||replace(u.id::text,'-','') then raise exception 'TEST_SCOPE_MISMATCH';end if;
  new.is_test=u.is_test;
 end if;
 return new;
end$$;
drop trigger if exists a_lesson_upload_scope on mtm_hw_private.btvn_lessons;
create trigger a_lesson_upload_scope before insert on mtm_hw_private.btvn_lessons
 for each row execute function mtm_hw_private.lesson_web_test_scope();
revoke all on function mtm_hw_private.lesson_web_test_scope() from public,anon,authenticated,service_role,mtm_btvn_publisher;

-- Scope canonical timetable deadlines to web-produced lessons only. Other sources
-- retain their existing personal-schedule and confirmed-extension behavior.
do $$begin
 if to_regprocedure('mtm_hw_private.btvn_schedule_planned_due_before_lesson_upload(uuid,text)') is null then
  alter function mtm_hw_private.btvn_schedule_planned_due(uuid,text) rename to btvn_schedule_planned_due_before_lesson_upload;
 end if;
end$$;
create or replace function mtm_hw_private.lesson_web_due(p_student uuid,p_lesson text) returns timestamptz
language sql stable security definer set search_path='' as $$
 select (u.due_at_by_class->>s.class_id::text)::timestamptz
 from mtm_hw_private.lesson_uploads u join mtm_hw_private.students s on s.id=p_student and s.class_id=any(u.class_ids) and s.is_test=u.is_test
 where u.id=case when p_lesson ~ '^web-[0-9a-f]{32}$' then substring(p_lesson from 5)::uuid else null end
 and (u.checkpoint ? 'publish_receipts' or exists(select 1 from mtm_hw_private.lesson_publish_capability cap
  where cap.txid=txid_current() and cap.upload_id=u.id and cap.claim_token=u.claim_token))
$$;
create or replace function mtm_hw_private.btvn_schedule_planned_due(p_student uuid,p_lesson text) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
begin
 return coalesce(mtm_hw_private.lesson_web_due(p_student,p_lesson),
  mtm_hw_private.btvn_schedule_planned_due_before_lesson_upload(p_student,p_lesson));
end$$;
create or replace function mtm_hw_private.lesson_web_work_due() returns trigger
language plpgsql security definer set search_path='' as $$
declare due timestamptz=mtm_hw_private.lesson_web_due(new.student_id,new.lesson_code);
begin
 if due is not null then
  new.expected_due_at=due;
  new.next_actual_class_at=coalesce(mtm_hw_private.btvn_override_due_before_schedule066(new.student_id,new.lesson_code),due);
 end if;
 return new;
end$$;
drop trigger if exists a_lesson_upload_due on mtm_hw_private.btvn_work;
create trigger a_lesson_upload_due before insert or update on mtm_hw_private.btvn_work
 for each row execute function mtm_hw_private.lesson_web_work_due();
revoke all on function mtm_hw_private.lesson_web_due(uuid,text),mtm_hw_private.btvn_schedule_planned_due(uuid,text),
 mtm_hw_private.btvn_schedule_planned_due_before_lesson_upload(uuid,text),mtm_hw_private.lesson_web_work_due()
 from public,anon,authenticated,service_role;

do $accounts$
declare r record;uid uuid;
begin
 -- PGlite reduced auth schema: skip all auth writes, exercise authorization with fixtures.
 if not exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='encrypted_password')
 or to_regclass('auth.identities') is null then return;end if;
 for r in select * from (values
 ('thaythanh','Thầy Thành','admin','thaythanh','$2a$12$ZKTWqgtMO62CRSHfO7G/O.f5i/xOybzhPVVoOW.HM29CZcqB2hfF.','e94aaa1a-e614-4d64-9593-8af9e7599e85'::uuid),
 ('thaytai','Trần Thanh Anh Tài','gv','thaytai','$2a$12$3ztzgln.CmsqtA2mIXhvIeTLSsIIFB/2b/RNnImFseC4t0ZlDx4Q6','62dbacb9-325a-4b68-961f-c8679d5ef2da'::uuid),
 ('thayhieu','Trần Đức Hiếu','gv','thayhieu','$2a$12$EZvqO/4K0PZ.dNJx9RnyneXfenQa0GnCrvcOuUBBrzZI/2vJrNndK','517eca93-7228-46bf-82fa-3553bab714b9'::uuid),
 ('thayhoang','Nguyễn Duy Hoàng','gv','thayhoang','$2a$12$MCsMAcN2Tr0Tf0po6vdAtuCDfVS1IxDU6VpSBPOn3ziZ1o6b4QQuK','48f2d66d-65cf-4518-84a6-42462a2ff9f9'::uuid),
 ('thaygiang','Giang','gv','thaygiang','$2a$12$xe2PTEAxT2Hjj8pEaLC71.M95Bau0c0YAhyYkGKD3fj/AoBFt/tui','941993d4-070c-4ef7-9d82-594552b039d8'::uuid),
 ('hang','Đào Minh Hằng','ql',null,'$2a$12$weFDz5SekTGAK2SIohGgje2nEKp27iK6joTfJiUC7Ok199QIzhJIS','bbfbb466-5b3f-41db-bf88-4c7c303460c5'::uuid),
 ('vietanh','Cao Việt Anh','ql',null,'$2a$12$TuzKKCaQyq6GhUM7bU9lV.ACCK5PWqsJ946KoyygrDxSoRRHnSg4S','7837e06e-9442-418a-a763-dd41dd821854'::uuid),
 ('dung','Bùi Tiến Dũng','ql',null,'$2a$12$eJxI86jXWQnWaI20DHGez.QoeOwPdEFeo7UtLjpqoarFlpzLqVnwq','67285f91-85a8-4630-bfda-e5902b2a14cb'::uuid)
 ) as seed(short_name,display_name,staff_role,teacher_key,password_hash,new_id) loop
  select id into uid from auth.users where lower(email)=r.short_name||'@minhthanhmath.vn';
  if uid is null then
   uid=r.new_id;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
   values('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',r.short_name||'@minhthanhmath.vn',r.password_hash,now(),
    '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('ten',r.display_name),now(),now(),'','','','','','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),uid::text,uid,jsonb_build_object('sub',uid::text,'email',r.short_name||'@minhthanhmath.vn','email_verified',true),'email',now(),now(),now());
  end if;
  -- Existing passwords/roles remain unchanged on replays; no exam-admin grants.
  insert into public.mtm_staff(user_id,short_name,display_name,role,teacher_key)
   values(uid,r.short_name,r.display_name,r.staff_role,r.teacher_key) on conflict do nothing;
 end loop;
 insert into public.mtm_staff(user_id,short_name,display_name,role)
 select id,'quanly','Quản lý MTM','ql' from auth.users where lower(email)='quanly@minhthanhmath.vn' on conflict do nothing;
end $accounts$;

commit;
