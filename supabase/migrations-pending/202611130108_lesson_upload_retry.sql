-- Review-only: new-upload deadline policy (HAN-BTVN-THEO-LOP 03/11 16:42)
-- and bounded same-version retry. No scheduler, secret or existing-row backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_deadline107(jsonb)') is null then raise exception 'LESSON_UPLOAD_107_REQUIRED';end if;
end$$;
alter table mtm_hw_private.lesson_uploads add column if not exists retry_status text;
alter table mtm_hw_private.lesson_uploads add column if not exists retry_count integer not null default 0;
alter table mtm_hw_private.lesson_uploads add column if not exists next_retry_at timestamptz;
alter table mtm_hw_private.lesson_uploads add column if not exists last_error_code text;
alter table mtm_hw_private.lesson_uploads add column if not exists failed_step integer;
alter table mtm_hw_private.lesson_uploads add column if not exists failed_paper integer;
alter table mtm_hw_private.lesson_uploads add column if not exists failure_claim_token uuid;
alter table mtm_hw_private.lesson_uploads add column if not exists retry_requested_at timestamptz;
create table if not exists mtm_hw_private.lesson_upload_automation(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 activated_at timestamptz,last_seen_at timestamptz,status text not null default 'off');
insert into mtm_hw_private.lesson_upload_automation(singleton) values(true) on conflict do nothing;
alter table mtm_hw_private.lesson_upload_automation enable row level security;
revoke all on mtm_hw_private.lesson_upload_automation from public,anon,authenticated,service_role,mtm_btvn_publisher;

create or replace function mtm_hw_private.lesson_retryable108(code text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(code=any(array['WORKER_RPC_FAILED','PRIVATE_UPLOAD_FAILED','PUBLISH_NOT_CONFIRMED','NATIVE_DRIVER_TIMEOUT','GATEWAY_BUSY']),false)
$$;
create or replace function mtm_hw_private.lesson_retry_reason108(code text) returns text
language sql immutable set search_path='' as $$
 select case
 when mtm_hw_private.lesson_retryable108(code) then 'Kết nối hoặc dịch vụ tạm gián đoạn; tiếp tục cùng bản đã gửi.'
 when code in ('INDEPENDENT_ANSWER_MISMATCH','TEACHER_ANSWER_MISMATCH','REVIEW_MISMATCH','INDEPENDENT_REVIEW_REQUIRED') then 'Đáp án hoặc kết quả kiểm chưa khớp; thầy cô kiểm tra nguồn.'
 when code in ('GATEWAY_AUTH_REQUIRED','SERVICE_ROLE_REQUIRED','STAFF_REQUIRED','PASSWORD_CHANGE_REQUIRED','PRIVATE_SOURCE_UNAVAILABLE','PRIVATE_ASSET_CONFLICT') then 'Quyền truy cập hoặc tệp riêng tư cần được kiểm tra.'
 when code is null then 'Chưa có lỗi cần thử lại.'
 else 'Cần kiểm tra nguồn hoặc biên nhận trước khi tiếp tục.' end
$$;
create or replace function mtm_hw_private.lesson_retry_info108(u mtm_hw_private.lesson_uploads) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'status',case when u.checkpoint ? 'publish_receipts' or u.finished_at is not null then 'published'
  when not mtm_hw_private.lesson_upload_current(u) then 'superseded'
  when u.lease_until>clock_timestamp() then 'running'
  when u.attempt_count>=3 or u.retry_status='exhausted' then 'retry_exhausted'
  when u.retry_status='needs_input' or exists(select 1 from mtm_hw_private.lesson_upload_steps s where s.upload_id=u.id and s.status='loi') then 'needs_input'
  when u.next_retry_at>clock_timestamp() then 'retry_wait' else 'queued' end,
 'can_retry',u.finished_at is null and not(u.checkpoint ? 'publish_receipts') and mtm_hw_private.lesson_upload_current(u)
  and (u.lease_until is null or u.lease_until<=clock_timestamp()) and u.attempt_count<3 and mtm_hw_private.lesson_retryable108(u.last_error_code),
 'retry_count',u.retry_count,'attempt_count',u.attempt_count,'next_retry_at',u.next_retry_at,
 'last_error_code',u.last_error_code,'reason',case when u.last_error_code is null and exists(select 1 from mtm_hw_private.lesson_upload_steps s where s.upload_id=u.id and s.status='loi')
  then 'Lỗi cũ chưa có mã xác minh; cần kiểm tra biên nhận.' else mtm_hw_private.lesson_retry_reason108(u.last_error_code) end,
 'failed_step',u.failed_step,'paper',coalesce(u.failed_paper,1))
$$;

-- Unknown/unconfirmed policies do not fall back to an invented date. The caller
-- may supply an explicit valid deadline, while automatic defaults require a real
-- matching future timetable slot. The next lesson may have another teacher.
create or replace function mtm_hw_private.lesson_default_due108(cid uuid,day date,teacher text) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
declare label text;target date;w int=extract(isodow from day)::int;due timestamptz;n int;
begin
 select c.label into label from mtm_hw_private.classes c where c.id=cid and c.active;
 if label in ('2K9 9+','2K9 XPS 9+') then
  target=day+case w when 1 then 2 when 3 then 2 when 5 then 3 end;
 elsif label in ('2K9 8+','2K9 XPS 8+') then
  target=day+case w when 2 then 2 when 4 then 2 when 6 then 3 end;
 elsif label='2K9 XPT' or label ~ '^2K(10|11)( |$)' then target=day+7;
 elsif label in ('HSA.2','HSA .2','HSA 2') then
  select min(s.lesson_date) into target from mtm_hw_private.lesson_sessions(day+1,day+7) s where s.class_id=cid;
 else raise exception 'DEADLINE_POLICY_UNVERIFIED';end if;
 if target is null then raise exception 'DEADLINE_SCHEDULE_UNAVAILABLE';end if;
 select count(*),min((s.lesson_date+s.start_time::time) at time zone 'Asia/Ho_Chi_Minh') into n,due
 from mtm_hw_private.lesson_sessions(target,target) s where s.class_id=cid;
 if n<>1 or due is null then raise exception 'DEADLINE_SCHEDULE_UNAVAILABLE';end if;
 return due;
end$$;

do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_retry108(jsonb)') is null then
  alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_retry108;
 end if;
end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';r jsonb;u mtm_hw_private.lesson_uploads;staff public.mtm_staff;info jsonb;code text;
 st int;paper int;eligible boolean;wait_seconds int;cid uuid;dues jsonb;overrides jsonb;due timestamptz;
 cards jsonb='[]';sessions jsonb='[]';c record;s record;ss record;defaults jsonb;dates jsonb;starts jsonb;policy_error text;
 auto_mode boolean=coalesce((p->>'auto')::boolean,false);control mtm_hw_private.lesson_upload_automation;automation jsonb;
begin
 if a in ('worker_automation_config','worker_heartbeat') then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  select * into control from mtm_hw_private.lesson_upload_automation where singleton for update;
  if a='worker_automation_config' and p ? 'enabled' then
   if jsonb_typeof(p->'enabled') is distinct from 'boolean' then raise exception 'INVALID_AUTOMATION_CONFIG';end if;
   update mtm_hw_private.lesson_upload_automation set enabled=(p->>'enabled')::boolean,
    activated_at=case when not enabled and (p->>'enabled')::boolean then clock_timestamp() else activated_at end,
    status=case when (p->>'enabled')::boolean then 'waiting' else 'off' end where singleton returning * into control;
  elsif a='worker_heartbeat' then
   update mtm_hw_private.lesson_upload_automation set last_seen_at=clock_timestamp(),status=case when enabled then 'waiting' else 'off' end where singleton returning * into control;
  end if;
  return jsonb_build_object('ok',true,'automation',to_jsonb(control)-'singleton');
 end if;
 if a='request_retry' then
  select * into staff from public.mtm_staff where user_id=auth.uid() and active;
  if staff.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
  if staff.must_change_password then raise exception 'PASSWORD_CHANGE_REQUIRED' using errcode='42501';end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
  if u.id is null or (staff.role='gv' and staff.teacher_key is distinct from u.teacher_key)
   or (u.is_test and staff.role not in ('ql','admin')) then raise exception 'UPLOAD_ACCESS_DENIED' using errcode='42501';end if;
  if not mtm_hw_private.lesson_upload_current(u) then raise exception 'STALE_UPLOAD_OR_LEASE' using errcode='40001';end if;
  -- Staff must still be assigned to every class/date, not only own the old row.
  if exists(select 1 from unnest(u.class_ids) ci where not exists(select 1 from mtm_hw_private.lesson_sessions((u.class_dates->>ci::text)::date,(u.class_dates->>ci::text)::date) sc
    where sc.class_id=ci and sc.teacher_key=u.teacher_key and (staff.role in ('ql','admin') or sc.teacher_key=staff.teacher_key)))
   then raise exception 'UPLOAD_ACCESS_DENIED' using errcode='42501';end if;
  info=mtm_hw_private.lesson_retry_info108(u);
  if info->>'status' in ('published','running','retry_exhausted') then
   return info||jsonb_build_object('ok',true,'accepted',false,'upload_id',u.id);
  end if;
  if u.last_error_code is null and not exists(select 1 from mtm_hw_private.lesson_upload_steps z where z.upload_id=u.id and z.status='loi') then
   update mtm_hw_private.lesson_uploads set retry_requested_at=clock_timestamp() where id=u.id;
   return info||jsonb_build_object('ok',true,'accepted',true,'status','already_queued','upload_id',u.id);
  end if;
  if not mtm_hw_private.lesson_retryable108(u.last_error_code) then
   return info||jsonb_build_object('ok',true,'accepted',false,'status','needs_input','upload_id',u.id);
  end if;
  if u.retry_status in ('queued','retry_wait') then
   update mtm_hw_private.lesson_uploads set retry_requested_at=clock_timestamp() where id=u.id;
   return info||jsonb_build_object('ok',true,'accepted',true,'status','already_queued','upload_id',u.id);
  end if;
  -- This is a same-version request, never a budget/attempt reset or lease steal.
  update mtm_hw_private.lesson_uploads set retry_status='retry_wait',retry_requested_at=clock_timestamp(),next_retry_at=greatest(clock_timestamp(),coalesce(next_retry_at,clock_timestamp())) where id=u.id returning * into u;
  return mtm_hw_private.lesson_retry_info108(u)||jsonb_build_object('ok',true,'accepted',true,'status','queued','upload_id',u.id);
 end if;
 if a='worker_pending_review' and auto_mode then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  select * into control from mtm_hw_private.lesson_upload_automation where singleton;
  if not control.enabled or control.activated_at is null then return '{"job":null,"automation_enabled":false}';end if;
  select x.* into u from mtm_hw_private.lesson_uploads x join mtm_hw_private.lesson_review_requests rr on rr.upload_id=x.id
  where x.is_test=coalesce((p->>'is_test')::boolean,false) and x.finished_at is not null and rr.completed_at is null
   and (rr.last_attempt_at is null or rr.last_attempt_at<clock_timestamp()-interval '90 seconds')
   and mtm_hw_private.lesson_upload_current(x) and (x.created_at>=control.activated_at or x.retry_requested_at>=control.activated_at)
  order by coalesce(rr.last_attempt_at,rr.requested_at) limit 1 for update of x skip locked;
  if u.id is null then return '{"job":null}';end if;
  update mtm_hw_private.lesson_review_requests set last_attempt_at=clock_timestamp() where upload_id=u.id and completed_at is null;
  return jsonb_build_object('job',to_jsonb(u)||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),
   'pending_reviews',(select jsonb_agg(jsonb_build_object('paper',rr.paper,'request_hash',rr.request_hash,'source_version',rr.source_version))
    from mtm_hw_private.lesson_review_requests rr where rr.upload_id=u.id and rr.completed_at is null)));
 end if;
 if a in ('worker_record_failure','worker_claim') then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  if a='worker_record_failure' then
   select * into u from mtm_hw_private.lesson_uploads where id=(p->>'upload_id')::uuid for update;
   if u.id is null or u.claim_token is distinct from (p->>'claim_token')::uuid or u.claim_token is null or not mtm_hw_private.lesson_upload_current(u) then raise exception 'STALE_UPLOAD_OR_LEASE' using errcode='40001';end if;
   if u.checkpoint ? 'publish_receipts' or u.finished_at is not null then return mtm_hw_private.lesson_retry_info108(u)||'{"ok":true}'::jsonb;end if;
   if u.failure_claim_token=u.claim_token then return mtm_hw_private.lesson_retry_info108(u)||'{"ok":true,"already_recorded":true}'::jsonb;end if;
   perform public.mtm_lesson_upload_api_before_retry108(jsonb_build_object('action','worker_assert_current','upload_id',u.id,'claim_token',u.claim_token));
   code=p->>'code';st=(p->>'step')::int;paper=coalesce((p->>'paper')::int,1);
   if code is null or code!~'^[A-Z][A-Z0-9_]{2,70}$' or st is null or st not between 2 and 6 or paper not in(1,2) or (paper=2 and u.homework2_path is null) then raise exception 'INVALID_WORKER_FAILURE';end if;
   eligible=mtm_hw_private.lesson_retryable108(code) and u.attempt_count<3;
   wait_seconds=case when u.attempt_count<=1 then 30 else 120 end;
   update mtm_hw_private.lesson_uploads set last_error_code=code,failed_step=st,failed_paper=paper,
    retry_count=least(retry_count+1,3),failure_claim_token=claim_token,
    retry_status=case when eligible then 'retry_wait' when mtm_hw_private.lesson_retryable108(code) then 'exhausted' else 'needs_input' end,
    next_retry_at=case when eligible then clock_timestamp()+make_interval(secs=>wait_seconds) else null end,
    lease_until=clock_timestamp()-interval '1 second' where id=u.id returning * into u;
   if paper=1 then update mtm_hw_private.lesson_upload_steps set status=case when eligible then 'dang' else 'loi' end,detail=mtm_hw_private.lesson_retry_reason108(code),updated_at=clock_timestamp() where upload_id=u.id and step=st;
   else update mtm_hw_private.lesson_upload_paper2_steps set status=case when eligible then 'dang' else 'loi' end,detail=mtm_hw_private.lesson_retry_reason108(code),updated_at=clock_timestamp() where upload_id=u.id and step=st;end if;
   return mtm_hw_private.lesson_retry_info108(u)||'{"ok":true}'::jsonb;
  end if;
  if length(coalesce(p->>'worker_id','')) not between 1 and 100 then raise exception 'WORKER_ID_REQUIRED';end if;
  select * into control from mtm_hw_private.lesson_upload_automation where singleton;
  if auto_mode then
   update mtm_hw_private.lesson_upload_automation set last_seen_at=clock_timestamp(),status=case when enabled then 'waiting' else 'off' end where singleton;
   if not control.enabled or control.activated_at is null then return '{"job":null,"automation_enabled":false}';end if;
  end if;
  -- Same class/test/current-version/material fences as 101; additionally respect
  -- persisted backoff and permanent failures. Existing checkpoints are untouched.
  select x.* into u from mtm_hw_private.lesson_uploads x
  where x.is_test=coalesce((p->>'is_test')::boolean,false) and x.finished_at is null and x.attempt_count<3
   and (x.lease_until is null or x.lease_until<clock_timestamp()) and mtm_hw_private.lesson_upload_current(x)
   and coalesce(x.retry_status,'queued') in ('queued','retry_wait','running') and (x.next_retry_at is null or x.next_retry_at<=clock_timestamp())
   and (not auto_mode or x.created_at>=control.activated_at or x.retry_requested_at>=control.activated_at)
   and (x.homework_path is not null or not exists(select 1 from unnest(x.class_ids) ci where not exists(
    select 1 from mtm_hw_private.btvn_lessons l where l.active and l.kind='btvn' and l.is_test=x.is_test and ci=any(l.class_ids)
     and coalesce(l.material->'classDates'->>(x.class_names->>ci::text),l.material->>'date')=x.class_dates->>ci::text
     and l.class_ids<@x.class_ids and not exists(select 1 from unnest(l.class_ids) ci2 where coalesce(l.material->'classDates'->>(x.class_names->>ci2::text),l.material->>'date') is distinct from x.class_dates->>ci2::text))))
   and not exists(select 1 from mtm_hw_private.lesson_upload_steps z where z.upload_id=x.id and z.status='loi')
   and not exists(select 1 from mtm_hw_private.lesson_upload_paper2_steps z where z.upload_id=x.id and z.status='loi')
  order by x.created_at for update skip locked limit 1;
  if u.id is null then return '{"job":null}';end if;
  update mtm_hw_private.lesson_uploads set claim_token=gen_random_uuid(),worker_id=p->>'worker_id',attempt_count=attempt_count+1,retry_status='running',next_retry_at=null,
   lease_until=clock_timestamp()+make_interval(secs=>least(900,greatest(60,coalesce((p->>'lease_seconds')::int,600)))) where id=u.id returning * into u;
  if auto_mode then update mtm_hw_private.lesson_upload_automation set status='running' where singleton;end if;
  return jsonb_build_object('job',(to_jsonb(u)-'lease_until'-'finished_at')||jsonb_build_object('lesson_code','web-'||replace(u.id::text,'-',''),
   'steps',(select jsonb_agg(to_jsonb(z) order by z.step) from mtm_hw_private.lesson_upload_steps z where z.upload_id=u.id)));
 end if;
 r=public.mtm_lesson_upload_api_before_retry108(p);
 if a='create' then
  if r->>'already_received'='true' then return r;end if;
  select * into u from mtm_hw_private.lesson_uploads where id=(r->>'upload_id')::uuid for update;
  dues=u.due_at_by_class;overrides=u.due_at_overrides;
  foreach cid in array u.class_ids loop
   if not coalesce(p->'due_at_by_class' ? cid::text,false) then
    due=mtm_hw_private.lesson_default_due108(cid,(u.class_dates->>cid::text)::date,u.teacher_key);
    dues=dues||jsonb_build_object(cid::text,due);overrides=overrides||jsonb_build_object(cid::text,due);
   end if;
  end loop;
  update mtm_hw_private.lesson_uploads set due_at_by_class=dues,due_at_overrides=overrides,retry_status='queued' where id=u.id;
  return r||jsonb_build_object('due_at_by_class',dues);
 end if;
 if a in ('dashboard','catalog') then
  for c in select value card from jsonb_array_elements(r->'uploads') loop
   select * into u from mtm_hw_private.lesson_uploads where id=(c.card->>'id')::uuid;
   cards=cards||jsonb_build_array(c.card||jsonb_build_object('retry',mtm_hw_private.lesson_retry_info108(u),'published',u.checkpoint ? 'publish_receipts'));
  end loop;
  for s in select value card from jsonb_array_elements(r->'sessions') loop
   defaults='{}';dates='{}';starts='{}';policy_error=null;
   for ss in select * from mtm_hw_private.lesson_sessions((s.card->>'lesson_date')::date-1,(s.card->>'lesson_date')::date+1) sc where sc.group_key=s.card->>'group_key' loop
    dates=dates||jsonb_build_object(ss.class_id::text,ss.lesson_date);starts=starts||jsonb_build_object(ss.class_id::text,ss.start_time);
    begin
     due=mtm_hw_private.lesson_default_due108(ss.class_id,ss.lesson_date,ss.teacher_key);
     defaults=defaults||jsonb_build_object(ss.class_id::text,due);
    exception when sqlstate 'P0001' then policy_error='Chưa xác minh được lịch hoặc quy luật hạn nộp; điền hạn cho từng lớp.';end;
   end loop;
   sessions=sessions||jsonb_build_array(s.card||jsonb_build_object('default_due_at_by_class',defaults,'class_dates',dates,'class_start_times',starts,'deadline_policy_error',policy_error));
  end loop;
  select to_jsonb(x)-'singleton' into automation from mtm_hw_private.lesson_upload_automation x where singleton;
  return jsonb_set(jsonb_set(r,'{uploads}',cards),'{sessions}',sessions)||jsonb_build_object('automation',automation);
 end if;
 if a='worker_finish' then update mtm_hw_private.lesson_uploads set retry_status='complete',next_retry_at=null where id=(p->>'upload_id')::uuid;end if;
 return r;
end$$;
revoke all on function public.mtm_lesson_upload_api_before_retry108(jsonb),public.mtm_lesson_upload_api(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;

do $$begin
 if to_regprocedure('public.mtm_lesson_upload_gateway_before_retry108(jsonb)') is null then alter function public.mtm_lesson_upload_gateway(jsonb) rename to mtm_lesson_upload_gateway_before_retry108;end if;
end$$;
create or replace function public.mtm_lesson_upload_gateway(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p->>'action' in ('worker_record_failure','worker_automation_config','worker_heartbeat') then
  if coalesce(auth.role(),'')<>'service_role' and coalesce(current_setting('role',true),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
  return public.mtm_lesson_upload_api(p);
 end if;
 return public.mtm_lesson_upload_gateway_before_retry108(p);
end$$;
revoke all on function public.mtm_lesson_upload_gateway_before_retry108(jsonb),public.mtm_lesson_upload_gateway(jsonb) from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_gateway(jsonb) to service_role;
revoke all on function mtm_hw_private.lesson_retryable108(text),mtm_hw_private.lesson_retry_reason108(text),mtm_hw_private.lesson_retry_info108(mtm_hw_private.lesson_uploads),mtm_hw_private.lesson_default_due108(uuid,date,text)
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
commit;
