-- NM8: pending only. Reuses the live J33 worker-token check; no token/ACL changes.
-- Apply only after 073/074 and the existing mtm_lead_javis_kiem(text) gateway.
begin;
create table mtm_lead.nm8_status (
 lead_id uuid primary key references mtm_lead.leads(id),
 status text not null check(status in ('HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC')),
 class_name text,
 effective_date date,
 last_event_id uuid not null,
 updated_at timestamptz not null default now(),
 check((status='CHINH_THUC' and class_name is not null and effective_date is not null)
   or (status<>'CHINH_THUC' and class_name is null and effective_date is null))
);
create table mtm_lead.nm8_status_events (
 seq bigint generated always as identity unique,
 event_id uuid primary key,
 lead_id uuid not null references mtm_lead.leads(id),
 command jsonb not null,
 before_state jsonb,
 after_state jsonb not null,
 changed boolean not null,
 created_at timestamptz not null default now()
);
create index nm8_status_events_lead_idx on mtm_lead.nm8_status_events(lead_id,created_at);
alter table mtm_lead.nm8_status enable row level security;
alter table mtm_lead.nm8_status_events enable row level security;
revoke all on mtm_lead.nm8_status,mtm_lead.nm8_status_events from public,anon,authenticated,service_role;

-- Only Edge's service-role connection may execute this RPC. The caller must also
-- possess the *existing* J33 token; a Supabase anon key is insufficient.
create function public.mtm_lead_nm8_status(p_token text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_lead uuid; v_event uuid; v_expected_event uuid; v_action text; v_status text; v_expected text; v_key text;
 v_current mtm_lead.nm8_status%rowtype; v_existing mtm_lead.nm8_status_events%rowtype;
 v_before jsonb; v_after jsonb; v_date date; v_class text; v_keys text[]; v_changed boolean;
begin
 begin
  perform public.mtm_lead_javis_kiem(p_token);
 exception when invalid_authorization_specification or insufficient_privilege or raise_exception then
  raise exception using errcode='42501',message='NM8_AUTH';
 end;
 if p_command is null or jsonb_typeof(p_command)<>'object' or octet_length(p_command::text)>8192 then
  raise exception using errcode='22023',message='NM8_INPUT';
 end if;
 v_action=p_command->>'action';
 if coalesce(p_command->>'leadId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception using errcode='22023',message='NM8_INPUT';
 end if;
 v_lead=(p_command->>'leadId')::uuid;
 select array_agg(k order by k) into v_keys from jsonb_object_keys(p_command) k;
 if v_action='get' then
  if v_keys<>array['action','leadId'] then raise exception using errcode='22023',message='NM8_INPUT';end if;
  if not exists(select 1 from mtm_lead.leads where id=v_lead) then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  select * into v_current from mtm_lead.nm8_status where lead_id=v_lead;
  return jsonb_build_object('ok',true,'leadId',v_lead,'current',case when v_current.lead_id is null then null else to_jsonb(v_current) end);
 end if;
 if v_action is distinct from 'set' or v_keys<>array['action','actorRef','className','effectiveDate','eventId','expectedEventId','expectedStatus','leadId','source','sourceReceipt','status'] then
  raise exception using errcode='22023',message='NM8_INPUT';
 end if;
 foreach v_key in array array['action','actorRef','eventId','leadId','source','sourceReceipt','status'] loop
  if jsonb_typeof(p_command->v_key) is distinct from 'string' then raise exception using errcode='22023',message='NM8_INPUT';end if;
 end loop;
 foreach v_key in array array['className','effectiveDate','expectedEventId','expectedStatus'] loop
  if jsonb_typeof(p_command->v_key) not in ('string','null') then raise exception using errcode='22023',message='NM8_INPUT';end if;
 end loop;
 if p_command->>'expectedEventId' is not null and p_command->>'expectedEventId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception using errcode='22023',message='NM8_INPUT';
 end if;
 v_expected_event=(p_command->>'expectedEventId')::uuid;
 v_status=p_command->>'status'; v_expected=p_command->>'expectedStatus';
 if v_status is null or v_status not in ('HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC')
  or (v_expected is not null and v_expected not in ('HOC_THU','DA_HOC_THU','CHINH_THUC','KHONG_HOC'))
  or coalesce(p_command->>'eventId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or coalesce(p_command->>'source','') not in ('web','bot-zalo','manager','l10')
  or coalesce(p_command->>'actorRef','') !~ '^[a-zA-Z][a-zA-Z0-9_.:/-]{0,159}$'
  or coalesce(p_command->>'sourceReceipt','') !~ '^[a-zA-Z][a-zA-Z0-9_.:/-]*$'
  or char_length(p_command->>'sourceReceipt')>300 then
  raise exception using errcode='22023',message='NM8_INPUT';
 end if;
 v_event=(p_command->>'eventId')::uuid;
 v_class=p_command->>'className';
 if v_status='CHINH_THUC' then
  if v_class is null or char_length(btrim(v_class)) not between 1 and 100
   or coalesce(p_command->>'effectiveDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   raise exception using errcode='22023',message='NM8_CLASS_DATE_REQUIRED';
  end if;
  v_class=btrim(v_class);v_date=(p_command->>'effectiveDate')::date;
 else
  if v_class is not null or p_command->>'effectiveDate' is not null then
   raise exception using errcode='22023',message='NM8_CLASS_DATE_ONLY_OFFICIAL';
  end if;
 end if;
 -- Serialize the same event even if replayed against a different lead.
 perform pg_advisory_xact_lock(hashtextextended('mtm-nm8-event:'||v_event::text,0));
 select * into v_existing from mtm_lead.nm8_status_events where event_id=v_event;
 if found then
  if v_existing.command<>p_command then return jsonb_build_object('ok',false,'code','EVENT_CONFLICT');end if;
  return jsonb_build_object('ok',true,'replayed',true,'changed',v_existing.changed,'eventId',v_event,'leadId',v_lead,'eventState',v_existing.after_state);
 end if;
 -- A lead row exists even before its first NM8 status, providing a row lock.
 perform 1 from mtm_lead.leads where id=v_lead for no key update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
 select * into v_current from mtm_lead.nm8_status where lead_id=v_lead;
 if v_current.status is distinct from v_expected or v_current.last_event_id is distinct from v_expected_event then return jsonb_build_object('ok',false,'code','STATUS_CONFLICT');end if;
 v_before=case when v_current.lead_id is null then null else to_jsonb(v_current) end;
 v_changed=v_current.status is distinct from v_status or v_current.class_name is distinct from v_class or v_current.effective_date is distinct from v_date;
 if v_changed then
 insert into mtm_lead.nm8_status(lead_id,status,class_name,effective_date,last_event_id)
 values(v_lead,v_status,v_class,v_date,v_event)
 on conflict(lead_id) do update set status=excluded.status,class_name=excluded.class_name,
  effective_date=excluded.effective_date,last_event_id=excluded.last_event_id,updated_at=now()
 returning to_jsonb(nm8_status.*) into v_after;
 else v_after=v_before;end if;
 insert into mtm_lead.nm8_status_events(event_id,lead_id,command,before_state,after_state,changed)
 values(v_event,v_lead,p_command,v_before,v_after,v_changed);
 return jsonb_build_object('ok',true,'replayed',false,'changed',v_changed,'eventId',v_event,'leadId',v_lead,'eventState',v_after);
end $$;
revoke all on function public.mtm_lead_nm8_status(text,jsonb) from public,anon,authenticated;
grant execute on function public.mtm_lead_nm8_status(text,jsonb) to service_role;
commit;
