-- Run against a disposable DB with 073 + 093 and a QA-only mock J33 token check.
-- All rows are synthetic; the surrounding transaction rolls back the fixture.
begin;
do $$
declare
 lid uuid='11111111-1111-4111-8111-111111111111';
 eid uuid='22222222-2222-4222-8222-222222222222';
 c jsonb;r jsonb;before_n int;
begin
 insert into mtm_lead.leads(id,kind,student_name,phone,grade,study_mode)
 values(lid,'dang-ky','QA-NM8','0900000001','12','online');
 c=jsonb_build_object('action','set','leadId',lid,'eventId',eid,'status','HOC_THU','expectedStatus',null,
  'expectedEventId',null,'className',null,'effectiveDate',null,'source','manager','actorRef','qa:actor','sourceReceipt','qa:receipt');
 begin
  perform public.mtm_lead_nm8_status('wrong-qa-token',c);
  raise exception 'bad token accepted';
 exception when insufficient_privilege then null;end;
 r=public.mtm_lead_nm8_status('qa-token-only',jsonb_build_object('action','get','leadId',lid));
 if r->>'ok'<>'true' or r->'current'<>'null'::jsonb then raise exception 'initial read';end if;
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->>'ok'<>'true' or r->>'replayed'<>'false' or r->'eventState'->>'status'<>'HOC_THU' then raise exception 'first state';end if;
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->>'replayed'<>'true' or (select count(*) from mtm_lead.nm8_status_events)<>1 then raise exception 'replay duplicated';end if;
 r=public.mtm_lead_nm8_status('qa-token-only',c||'{"status":"KHONG_HOC"}'::jsonb);
 if r->>'code'<>'EVENT_CONFLICT' then raise exception 'event collision accepted';end if;
 c=c||jsonb_build_object('eventId',gen_random_uuid(),'status','DA_HOC_THU');
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->>'code'<>'STATUS_CONFLICT' then raise exception 'stale expected state accepted';end if;
 c=c||jsonb_build_object('expectedStatus','HOC_THU','expectedEventId',eid);
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->'eventState'->>'status'<>'DA_HOC_THU' then raise exception 'second state';end if;
 c=c||jsonb_build_object('eventId',gen_random_uuid(),'status','CHINH_THUC','expectedStatus','DA_HOC_THU','expectedEventId',r->'eventState'->>'last_event_id');
 select count(*) into before_n from mtm_lead.nm8_status_events;
 begin
  perform public.mtm_lead_nm8_status('qa-token-only',c);
  raise exception 'missing official class/date accepted';
 exception when invalid_parameter_value then null;end;
 c=c||'{"className":"QA-2K9","effectiveDate":"2026-02-30"}'::jsonb;
 begin
  perform public.mtm_lead_nm8_status('qa-token-only',c);
  raise exception 'invalid calendar date accepted';
 exception when datetime_field_overflow then null;end;
 if (select count(*) from mtm_lead.nm8_status_events)<>before_n then raise exception 'failed writes persisted';end if;
 c=c||'{"effectiveDate":"2026-10-24"}'::jsonb;
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->'eventState'->>'status'<>'CHINH_THUC' or r->'eventState'->>'class_name'<>'QA-2K9' then raise exception 'third state';end if;
 -- Same status with stale version must not overwrite class/date.
 r=public.mtm_lead_nm8_status('qa-token-only',c||jsonb_build_object('eventId',gen_random_uuid(),'expectedStatus','CHINH_THUC','className','QA-STALE'));
 if r->>'code' is distinct from 'STATUS_CONFLICT' then raise exception 'stale official update accepted';end if;
 select last_event_id into eid from mtm_lead.nm8_status where lead_id=lid;
 c=c||jsonb_build_object('eventId',gen_random_uuid(),'status','KHONG_HOC','expectedStatus','CHINH_THUC','expectedEventId',eid,'className',null,'effectiveDate',null);
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->'eventState'->>'status'<>'KHONG_HOC' then raise exception 'fourth state';end if;
 if (select count(*) from mtm_lead.nm8_status_events where lead_id=lid)<>4 then raise exception 'history missing';end if;
 if not exists(select 1 from mtm_lead.nm8_status_events where lead_id=lid and before_state->>'status'='CHINH_THUC' and before_state->>'class_name'='QA-2K9') then raise exception 'before state lost';end if;
 c=c||jsonb_build_object('eventId',gen_random_uuid(),'expectedStatus','KHONG_HOC','expectedEventId',r->'eventState'->>'last_event_id');
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->>'changed' is distinct from 'false' or r->>'replayed' is distinct from 'false' then raise exception 'no-op not distinguished';end if;
 r=public.mtm_lead_nm8_status('qa-token-only',c);
 if r->>'changed' is distinct from 'false' or r->>'replayed' is distinct from 'true' then raise exception 'no-op replay';end if;
 if (select count(*) from mtm_lead.nm8_status_events where lead_id=lid and changed)<>4 then raise exception 'no-op changed state';end if;
 r=public.mtm_lead_nm8_status('qa-token-only',jsonb_build_object('action','get','leadId',lid));
 if r->'current'->>'status'<>'KHONG_HOC' then raise exception 'readback mismatch';end if;
 if has_function_privilege('anon','public.mtm_lead_nm8_status(text,jsonb)','execute')
  or has_function_privilege('authenticated','public.mtm_lead_nm8_status(text,jsonb)','execute') then raise exception 'public execute';end if;
 if has_table_privilege('service_role','mtm_lead.nm8_status','UPDATE') then raise exception 'direct table write';end if;
 raise notice 'NM8 SQL QA PASS: auth, 4 statuses, CAS, replay, collision, official requirements, failure atomicity, history, readback, ACL';
end $$;
rollback;
