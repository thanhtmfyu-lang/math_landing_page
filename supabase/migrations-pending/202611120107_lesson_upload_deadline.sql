-- Review-only. Optional teacher/manager deadlines on NEW uploads only.
-- Apply through the website release owner; never run automatically.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regclass('mtm_hw_private.lesson_uploads') is null
 or to_regprocedure('public.mtm_lesson_upload_api_before_review_gateway(jsonb)') is null then
  raise exception 'LESSON_UPLOAD_SCHEMA_REQUIRED';
 end if;
end$$;
alter table mtm_hw_private.lesson_uploads add column if not exists due_at_overrides jsonb not null default '{}';
alter table mtm_hw_private.lesson_uploads add column if not exists client_request_id uuid;
alter table mtm_hw_private.lesson_uploads add column if not exists client_request_hash text;
create unique index if not exists lesson_uploads_client_request107_idx
 on mtm_hw_private.lesson_uploads(uploaded_by,client_request_id) where client_request_id is not null;

do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_deadline107(jsonb)') is null then
  alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_deadline107;
 end if;
end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text=p->>'action';r jsonb;u mtm_hw_private.lesson_uploads;kv record;due timestamptz;opens timestamptz;
 dues jsonb;overrides jsonb='{}';cards jsonb;request_id uuid;request_hash text;actor public.mtm_staff;
begin
 -- No caller may manufacture the private marker read by a worker. The original
 -- create still performs staff/password, teacher, paired-class, file and version
 -- checks before a new row can be inspected or changed in this transaction.
 if a='create' and p ? 'due_at_overrides' then raise exception 'INVALID_HOMEWORK_DEADLINE';end if;
 if a='create' and p ? 'client_request_id' then
  if jsonb_typeof(p->'client_request_id') is distinct from 'string'
   or p->>'client_request_id' !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'INVALID_CLIENT_REQUEST_ID';end if;
  request_id=(p->>'client_request_id')::uuid;
  select * into actor from public.mtm_staff where user_id=auth.uid() and active;
  if actor.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
  if actor.must_change_password then raise exception 'PASSWORD_CHANGE_REQUIRED' using errcode='42501';end if;
  request_hash=encode(sha256(convert_to((p-'client_request_id')::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('lesson-request107:'||actor.user_id::text||':'||request_id::text,0));
  select * into u from mtm_hw_private.lesson_uploads where uploaded_by=actor.user_id and client_request_id=request_id;
  if u.id is not null then
   if u.client_request_hash is distinct from request_hash then raise exception 'CLIENT_REQUEST_CONFLICT';end if;
   return jsonb_build_object('ok',true,'already_received',true,'upload_id',u.id,'version',u.version,'due_at_by_class',u.due_at_by_class);
  end if;
 end if;
 r=public.mtm_lesson_upload_api_before_deadline107(p);
 if a='create' then
  select * into u from mtm_hw_private.lesson_uploads where id=(r->>'upload_id')::uuid for update;
  if u.id is null or u.uploaded_by is distinct from auth.uid() or u.claim_token is not null
   or u.finished_at is not null or not mtm_hw_private.lesson_upload_current(u) then
   raise exception 'STALE_UPLOAD_OR_LEASE';
  end if;
  dues=u.due_at_by_class;
  if p ? 'due_at_by_class' then
   if jsonb_typeof(p->'due_at_by_class') is distinct from 'object' then raise exception 'INVALID_HOMEWORK_DEADLINE';end if;
   for kv in select key,value from jsonb_each(p->'due_at_by_class') loop
    if not(kv.key=any(array(select unnest(u.class_ids)::text))) then raise exception 'CLASS_SCOPE_MISMATCH';end if;
    if jsonb_typeof(kv.value) is distinct from 'string'
     or (kv.value#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?([Zz]|[+-](0\d|1[0-4]):[0-5]\d)$' then
     raise exception 'INVALID_HOMEWORK_DEADLINE';
    end if;
    begin
     due=(kv.value#>>'{}')::timestamptz;
     opens=((u.class_dates->>kv.key)::date+(u.end_times->>kv.key)::time) at time zone 'Asia/Ho_Chi_Minh';
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_HOMEWORK_DEADLINE';
    end;
    if due is null or not isfinite(due) or opens is null or due<=opens then raise exception 'INVALID_HOMEWORK_DEADLINE';end if;
    if due is distinct from (dues->>kv.key)::timestamptz then overrides=overrides||jsonb_build_object(kv.key,due);end if;
    dues=dues||jsonb_build_object(kv.key,due);
   end loop;
  end if;
  update mtm_hw_private.lesson_uploads set due_at_by_class=dues,due_at_overrides=overrides,
   client_request_id=request_id,client_request_hash=request_hash where id=u.id;
  return r||jsonb_build_object('due_at_by_class',dues);
 end if;
 if a in ('dashboard','catalog') then
  -- Extend only cards already authorized by the original staff/scope filters.
  select coalesce(jsonb_agg(c.card||jsonb_build_object('due_at_by_class',x.due_at_by_class) order by c.ord),'[]') into cards
  from jsonb_array_elements(r->'uploads') with ordinality c(card,ord)
  join mtm_hw_private.lesson_uploads x on x.id=(c.card->>'id')::uuid;
  return jsonb_set(r,'{uploads}',cards);
 end if;
 return r;
end$$;
revoke all on function public.mtm_lesson_upload_api_before_deadline107(jsonb),public.mtm_lesson_upload_api(jsonb)
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;
-- Existing web capability and lesson_web_due/work triggers read the stored map.
-- No old uploads, deadlines, keys, scores, receipts or production flags are edited.
commit;
