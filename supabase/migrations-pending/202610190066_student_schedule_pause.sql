-- 066: Lịch cá nhân theo ngày hiệu lực và tạm nghỉ có hai mốc rõ.
-- Chạy sau 063-065. Không thay tên ghi chú cũ, lịch chung, sender hoặc dữ liệu thật.
begin;
do $guard$
begin
 if encode(sha256(convert_to(pg_get_functiondef('mtm_hw_private.hv_ca_rows(date,date)'::regprocedure),'UTF8')),'hex')
  <> '065f4dabf1ff621c52aed7c1e19d2740da9d6b1c0b7776cfa3ebabf4acdd5a03' then
  raise exception '066 hv_ca_rows source changed';end if;
 if to_regprocedure('mtm_hw_private.btvn_override_due(uuid,text)') is null
  or to_regprocedure('mtm_hw_private.sync_dispatch(jsonb)') is null then raise exception '066 needs 063-065';end if;
end$guard$;

create table mtm_hw_private.student_schedule_rules(
 id bigint generated always as identity primary key,student_id uuid not null references mtm_hw_private.students(id),
 from_date date not null,to_date date,weekday integer not null check(weekday between 1 and 7),
 start_hm text not null check(start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 end_hm text not null check(end_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 class_label text not null,mode text not null check(mode in ('Online','Offline')),
 btvn_due_rule text check(btvn_due_rule is null or btvn_due_rule='next_session'),
 source_msg text not null unique,payload_hash text not null,created_at timestamptz not null default clock_timestamp(),
 cancelled_from date,cancel_source_msg text unique,cancelled_at timestamptz,
 check(from_date between date '2000-01-01' and date '2100-12-31'),
 check(to_date is null or (to_date>=from_date and to_date<=date '2100-12-31')),check(start_hm<end_hm)
);
create index student_schedule_effective_idx on mtm_hw_private.student_schedule_rules(student_id,from_date,to_date);
create table mtm_hw_private.student_pauses(
 id bigint generated always as identity primary key,student_id uuid not null references mtm_hw_private.students(id),
 from_date date not null,to_date date not null,reason text not null check(length(btrim(reason)) between 1 and 1000),
 source_msg text not null unique,payload_hash text not null,created_at timestamptz not null default clock_timestamp(),
 cancelled_from date,cancel_source_msg text unique,cancelled_at timestamptz,
 check(from_date between date '2000-01-01' and date '2100-12-31'),
 check(to_date>=from_date and to_date<=date '2100-12-31')
);
create index student_pause_effective_idx on mtm_hw_private.student_pauses(student_id,from_date,to_date);
alter table mtm_hw_private.student_schedule_rules enable row level security;
alter table mtm_hw_private.student_pauses enable row level security;
revoke all on mtm_hw_private.student_schedule_rules,mtm_hw_private.student_pauses from public,anon,authenticated,service_role;

create function mtm_hw_private.student_has_schedule(p_student uuid,p_day date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from mtm_hw_private.student_schedule_rules r where r.student_id=p_student
  and p_day>=r.from_date and (r.to_date is null or p_day<=r.to_date) and (r.cancelled_from is null or p_day<r.cancelled_from))
$$;
create function mtm_hw_private.student_is_paused(p_student uuid,p_day date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from mtm_hw_private.student_pauses r where r.student_id=p_student
  and p_day between r.from_date and r.to_date and (r.cancelled_from is null or p_day<r.cancelled_from))
$$;

-- Hạn riêng chỉ được bật khi nguồn xác nhận explicit btvnDueRule=next_session.
-- Đây là buổi DỰ KIẾN tiếp theo, không tạo dấu đã học/next_actual_class_at.
create function mtm_hw_private.student_next_scheduled_at(p_student uuid,p_after date,p_effective_before date default null) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
declare r record;candidate date;skip_to date;best timestamptz;value timestamptz;
begin
 for r in select * from mtm_hw_private.student_schedule_rules where student_id=p_student and btvn_due_rule='next_session'
  and (to_date is null or to_date>p_after) and (cancelled_from is null or cancelled_from>p_after)
  and (p_effective_before is null or from_date<=p_effective_before) loop
  candidate=greatest(r.from_date,p_after+1);
  candidate=candidate+((r.weekday-extract(isodow from candidate)::int+7)%7);
  loop
   if (r.to_date is not null and candidate>r.to_date) or (r.cancelled_from is not null and candidate>=r.cancelled_from) then exit;end if;
   select max(least(p.to_date,coalesce(p.cancelled_from-1,p.to_date)))+1 into skip_to
    from mtm_hw_private.student_pauses p where p.student_id=p_student and candidate between p.from_date and p.to_date
     and (p.cancelled_from is null or candidate<p.cancelled_from);
   if skip_to is null then
    value=(candidate+r.start_hm::time) at time zone 'Asia/Ho_Chi_Minh';
    if best is null or value<best then best=value;end if;exit;
   end if;
   candidate=skip_to+((r.weekday-extract(isodow from skip_to)::int+7)%7);
  end loop;
 end loop;
 return best;
end$$;

create function mtm_hw_private.btvn_schedule_planned_due(p_student uuid,p_lesson text) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
declare day date;base_due timestamptz;effective_before date;
begin
 select coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date,
  coalesce(w.expected_due_at,mtm_hw_private.btvn_planned_due(c.label,coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date)) into day,base_due
  from mtm_hw_private.btvn_lessons l join mtm_hw_private.students s on s.id=p_student
  join mtm_hw_private.classes c on c.id=s.class_id left join mtm_hw_private.btvn_work w on w.student_id=s.id and w.lesson_code=l.code
  where l.code=p_lesson and l.owner_id=s.owner_id and l.active and l.kind='btvn';
 if base_due is not null and base_due<current_timestamp then return null;end if;
 effective_before=coalesce((base_due at time zone 'Asia/Ho_Chi_Minh')::date,day);
 if day is null or not exists(select 1 from mtm_hw_private.student_schedule_rules r where r.student_id=p_student
  and r.btvn_due_rule='next_session' and r.from_date<=effective_before and (r.to_date is null or day<r.to_date)
  and (r.cancelled_from is null or day<r.cancelled_from)) then return null;end if;
 return mtm_hw_private.student_next_scheduled_at(p_student,day,effective_before);
end$$;

alter function mtm_hw_private.btvn_override_due(uuid,text) rename to btvn_override_due_before_schedule066;
create function mtm_hw_private.btvn_override_due(p_student uuid,p_lesson text) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
begin
 -- Helper grading chỉ có gia hạn được xác nhận; planned đi trường expectedDueAt riêng.
 return mtm_hw_private.btvn_override_due_before_schedule066(p_student,p_lesson);
end$$;

-- BEFORE trigger phải dùng NEW. Query btvn_work ở đây sẽ nhìn actual của row cũ.
do $receipt_guard$
begin
 if position('due=mtm_hw_private.btvn_override_due(new.student_id,new.lesson_code);'
  in pg_get_functiondef('mtm_hw_private.btvn_override_receipts()'::regprocedure))=0 then
  raise exception '066 receipt trigger source changed';end if;
end$receipt_guard$;
create or replace function mtm_hw_private.btvn_override_receipts() returns trigger
language plpgsql security definer set search_path='' as $$
declare due timestamptz;force_all boolean=coalesce(current_setting('mtm.force_receipt_reclassify',true),'')='1';
begin
 if not exists(select 1 from mtm_hw_private.btvn_lessons l where l.code=new.lesson_code and l.kind='btvn') then return new;end if;
 due=coalesce(mtm_hw_private.btvn_override_due_before_schedule066(new.student_id,new.lesson_code),
  new.next_actual_class_at);
 if TG_OP='INSERT' then force_all=true;
 elsif new.next_actual_class_at is distinct from old.next_actual_class_at then force_all=true;end if;
 select coalesce(jsonb_agg(case
  when not force_all and prior.receipt is not null and prior.receipt->'submittedAt' is not distinct from r->'submittedAt'
   then case when prior.receipt ? 'late' then r||jsonb_build_object('late',prior.receipt->'late') else r-'late' end
  else r||jsonb_build_object('late',case when due is null then 'null'::jsonb
   else to_jsonb((r->>'submittedAt')::numeric>=extract(epoch from due)*1000) end) end order by ord),'[]'::jsonb)
 into new.receipts from jsonb_array_elements(new.receipts) with ordinality x(r,ord)
 left join lateral(select oldrec.receipt from jsonb_array_elements(case when TG_OP='INSERT' then '[]'::jsonb else old.receipts end)
  with ordinality oldrec(receipt,oldord)
  where (coalesce(r->>'attemptId','')<>'' and oldrec.receipt->>'attemptId'=r->>'attemptId')
   or (coalesce(r->>'attemptId','')='' and coalesce(oldrec.receipt->>'attemptId','')='' and oldord=ord)
  order by oldord limit 1) prior on true;
 return new;
end$$;

-- Gia hạn/hủy gia hạn chủ động tính lại; autosave thông thường không được sửa receipt quá khứ.
alter function public.mtm_dd_api14(jsonb) rename to mtm_dd_api14_before_schedule066;
create function public.mtm_dd_api14(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;previous text=coalesce(current_setting('mtm.force_receipt_reclassify',true),'');
begin
 if p->>'action' in ('btvn_extend','btvn_override_cancel') then perform set_config('mtm.force_receipt_reclassify','1',true);end if;
 result=public.mtm_dd_api14_before_schedule066(p);
 perform set_config('mtm.force_receipt_reclassify',previous,true);return result;
exception when others then perform set_config('mtm.force_receipt_reclassify',previous,true);raise;
end$$;
revoke all on function public.mtm_dd_api14_before_schedule066(jsonb),public.mtm_dd_api14(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mtm_dd_api14(jsonb) to service_role;

create function mtm_hw_private.student_schedule_refresh_work(p_student uuid,p_from date,p_to date) returns void
language plpgsql security definer set search_path='' as $$
declare previous text=coalesce(current_setting('mtm.force_receipt_reclassify',true),'');
begin
 perform set_config('mtm.force_receipt_reclassify','1',true);
 with affected as (
  select w.student_id,w.lesson_code,(
  select coalesce(jsonb_agg(r||jsonb_build_object('late',case when due.value is null then null
   else (r->>'submittedAt')::numeric>=extract(epoch from due.value)*1000 end) order by ord),'[]'::jsonb)
  from jsonb_array_elements(w.receipts) with ordinality x(r,ord)
  cross join lateral(select coalesce(mtm_hw_private.btvn_override_due(w.student_id,w.lesson_code),w.next_actual_class_at) value) due) new_receipts
  from mtm_hw_private.btvn_work w join mtm_hw_private.students s on s.id=w.student_id
  join mtm_hw_private.classes c on c.id=s.class_id join mtm_hw_private.btvn_lessons l on l.code=w.lesson_code and l.owner_id=s.owner_id
  cross join lateral(select coalesce(w.next_actual_class_at,w.expected_due_at,
   mtm_hw_private.btvn_planned_due(c.label,coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date)) baseline) ref
  where s.id=p_student and l.kind='btvn' and ref.baseline>=current_timestamp
   and (ref.baseline at time zone 'Asia/Ho_Chi_Minh')::date>=p_from
   and (p_to is null or (ref.baseline at time zone 'Asia/Ho_Chi_Minh')::date<=p_to)
 ) update mtm_hw_private.btvn_work w set revision=w.revision+1,receipts=a.new_receipts
 from affected a where w.student_id=a.student_id and w.lesson_code=a.lesson_code and w.receipts is distinct from a.new_receipts;
 perform set_config('mtm.force_receipt_reclassify',previous,true);
exception when others then perform set_config('mtm.force_receipt_reclassify',previous,true);raise;
end$$;

create function mtm_hw_private.student_schedule_action(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare act text=p->>'action';sid uuid;owner_uuid uuid;df date;dt date;wd integer;tm text;te text;mode_name text;src text;
 phash text;prior record;rid bigint;rule_kind text;cancel_id bigint;
begin
 if coalesce(p->>'studentId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return jsonb_build_object('error','need_student_id');end if;
 select owner_id into owner_uuid from mtm_hw_private.btvn_roster_scope where singleton;
 select id into sid from mtm_hw_private.students where id=(p->>'studentId')::uuid and owner_id=owner_uuid;
 if sid is null then return jsonb_build_object('error','student_not_found');end if;
 if act='student_schedule_read' then
  return jsonb_build_object('ok',true,'studentId',sid,
   'rules',coalesce((select jsonb_agg(to_jsonb(r)-'source_msg'-'cancel_source_msg' order by r.from_date,r.weekday,r.id) from mtm_hw_private.student_schedule_rules r where r.student_id=sid),'[]'::jsonb),
   'pauses',coalesce((select jsonb_agg(to_jsonb(r)-'source_msg'-'cancel_source_msg'-'reason' order by r.from_date,r.id) from mtm_hw_private.student_pauses r where r.student_id=sid),'[]'::jsonb));
 end if;
 src=btrim(p->>'sourceMsg');
 if coalesce(src,'')='' or length(src)>300 or src ~ E'[\r\n]' then return jsonb_build_object('error','need_source_msg');end if;
 if coalesce(p->>'fromDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or (coalesce(p->>'toDate','')<>'' and p->>'toDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then return jsonb_build_object('error','invalid_date_range');end if;
 begin df=(p->>'fromDate')::date;dt=nullif(p->>'toDate','')::date;
 exception when datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('error','invalid_date_range');end;
 if df not between date '2000-01-01' and date '2100-12-31' or (dt is not null and (dt<df or dt>date '2100-12-31')) then return jsonb_build_object('error','invalid_date_range');end if;
 phash=encode(extensions.digest((p-'sourceMsg')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('schedule066:'||sid::text,0));
 if act in ('student_schedule_cancel','student_pause_cancel') then
  if coalesce(p->>'ruleId',p->>'pauseId','') !~ '^[0-9]+$' then return jsonb_build_object('error','need_rule_or_pause_id');end if;
  cancel_id=coalesce(p->>'ruleId',p->>'pauseId')::bigint;
  if act='student_schedule_cancel' then
   select * into prior from mtm_hw_private.student_schedule_rules where id=cancel_id and student_id=sid for update;
  else select * into prior from mtm_hw_private.student_pauses where id=cancel_id and student_id=sid for update;end if;
  if not found then return jsonb_build_object('error','schedule_or_pause_not_found');end if;
  if prior.cancelled_from is not null then
   if prior.cancel_source_msg=src and prior.cancelled_from=df then return jsonb_build_object('ok',true,'duplicate',true);end if;
   return jsonb_build_object('error','already_cancelled');end if;
  if df<prior.from_date then return jsonb_build_object('error','cancel_before_start');end if;
  if act='student_schedule_cancel' then update mtm_hw_private.student_schedule_rules set cancelled_from=df,cancel_source_msg=src,cancelled_at=clock_timestamp() where id=cancel_id;
  else update mtm_hw_private.student_pauses set cancelled_from=df,cancel_source_msg=src,cancelled_at=clock_timestamp() where id=cancel_id;end if;
  perform mtm_hw_private.student_schedule_refresh_work(sid,df,prior.to_date);
  return jsonb_build_object('ok',true,'studentId',sid,'cancelled',true,'effectiveFrom',df);
 end if;
 if act='student_pause' then
  if dt is null or coalesce(btrim(p->>'reason'),'')='' then return jsonb_build_object('error','need_pause_dates_and_reason');end if;
  select * into prior from mtm_hw_private.student_pauses where source_msg=src;
  if found then
   if prior.payload_hash<>phash then return jsonb_build_object('error','source_conflict');end if;
   return jsonb_build_object('ok',true,'duplicate',true,'pauseId',prior.id);end if;
  if exists(select 1 from mtm_hw_private.student_pauses r where r.student_id=sid
    and daterange(r.from_date,least(r.to_date+1,coalesce(r.cancelled_from,r.to_date+1)),'[)') && daterange(df,dt,'[]')) then return jsonb_build_object('error','pause_overlap');end if;
  insert into mtm_hw_private.student_pauses(student_id,from_date,to_date,reason,source_msg,payload_hash)
   values(sid,df,dt,p->>'reason',src,phash) returning id into rid;
  perform mtm_hw_private.student_schedule_refresh_work(sid,df,dt);
  return jsonb_build_object('ok',true,'studentId',sid,'pauseId',rid,'fromDate',df,'toDate',dt);
 end if;
 if act<>'student_schedule_set' then return jsonb_build_object('error','unknown_schedule_action');end if;
 if coalesce(p->>'weekday','') !~ '^[1-7]$' or coalesce(p->>'startHm','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or coalesce(p->>'endHm','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return jsonb_build_object('error','invalid_schedule_slot');end if;
 wd=(p->>'weekday')::int;tm=p->>'startHm';te=p->>'endHm';mode_name=p->>'mode';rule_kind=nullif(p->>'btvnDueRule','');
 if tm>=te or mode_name is null or mode_name not in ('Online','Offline') or (rule_kind is not null and rule_kind<>'next_session') then return jsonb_build_object('error','invalid_schedule_slot_or_rule');end if;
 if not exists(select 1 from mtm_hw_private.classes where owner_id=owner_uuid and label=p->>'classLabel' and active) then return jsonb_build_object('error','unknown_class');end if;
 select * into prior from mtm_hw_private.student_schedule_rules where source_msg=src;
 if found then
  if prior.payload_hash<>phash then return jsonb_build_object('error','source_conflict');end if;
  return jsonb_build_object('ok',true,'duplicate',true,'ruleId',prior.id);end if;
 if exists(select 1 from mtm_hw_private.student_schedule_rules r where r.student_id=sid and r.weekday=wd
   and daterange(r.from_date,least(coalesce(r.to_date+1,'infinity'::date),coalesce(r.cancelled_from,'infinity'::date)),'[)') && daterange(df,dt,'[]')
   and (r.start_hm::time,r.end_hm::time) overlaps (tm::time,te::time)) then return jsonb_build_object('error','schedule_overlap');end if;
 insert into mtm_hw_private.student_schedule_rules(student_id,from_date,to_date,weekday,start_hm,end_hm,class_label,mode,btvn_due_rule,source_msg,payload_hash)
  values(sid,df,dt,wd,tm,te,p->>'classLabel',mode_name,rule_kind,src,phash) returning id into rid;
 perform mtm_hw_private.student_schedule_refresh_work(sid,df,dt);
 return jsonb_build_object('ok',true,'studentId',sid,'ruleId',rid,'fromDate',df,'toDate',dt,'weekdayConvention','ISO_1_Monday_7_Sunday');
end$$;

-- Giữ đúng thân live D07/D08/D16; chỉ thêm nguồn lịch chuẩn và bộ lọc pause theo ngày.
do $projection$
declare src text;anchor text;fixed text;
begin
 src=pg_get_functiondef('mtm_hw_private.hv_ca_rows(date,date)'::regprocedure);
 anchor=' allrows as (';if position(anchor in src)=0 then raise exception '066 allrows anchor changed';end if;
 fixed=replace(src,anchor,' allrows_legacy as (');
 anchor=E' ),\n dk2 as (';if position(anchor in fixed)=0 then raise exception '066 dk2 anchor changed';end if;
 fixed=replace(fixed,anchor,$inject$
 ),
 allrows as (
  select r.* from allrows_legacy r
  where not mtm_hw_private.student_has_schedule(r.id,r.ngay)
   or exists(select 1 from mtm_hw_private.attendance a_keep where a_keep.student_id=r.id and a_keep.session_date=r.ngay and a_keep.class_label=r.class_label
    and a_keep.status in ('co_mat','hoc_online','di_muon','ve_som')
    and (a_keep.source in ('zoom','van_tay','quan_ly') or coalesce(a_keep.time_in,'')<>'' or coalesce(a_keep.time_out,'')<>''))
   or exists(select 1 from mtm_hw_private.schedule_moves m_keep where m_keep.student_id=r.id and m_keep.to_date=r.ngay and m_keep.to_class=r.class_label and m_keep.cancelled_at is null)
  union
  select d.d,r.class_label,r.start_hm,r.end_hm,r.mode,r.student_id,'Lịch riêng chuẩn'::text,''::text
  from days d join mtm_hw_private.student_schedule_rules r on d.d>=r.from_date and (r.to_date is null or d.d<=r.to_date)
   and (r.cancelled_from is null or d.d<r.cancelled_from) and r.weekday=extract(isodow from d.d)::int
  where not exists(select 1 from allrows_legacy old_slot join mtm_hw_private.attendance a_actual
    on a_actual.student_id=old_slot.id and a_actual.session_date=old_slot.ngay and a_actual.class_label=old_slot.class_label
   where old_slot.id=r.student_id and old_slot.ngay=d.d and old_slot.class_label=r.class_label
    and a_actual.status in ('co_mat','hoc_online','di_muon','ve_som')
    and (a_actual.source in ('zoom','van_tay','quan_ly') or coalesce(a_actual.time_in,'')<>'' or coalesce(a_actual.time_out,'')<>''))
 ),
 dk2 as ($inject$);
 anchor='  where (mtm_hw_private.nghi_tu(r.id) is null or r.ngay < mtm_hw_private.nghi_tu(r.id))';
 if position(anchor in fixed)=0 then raise exception '066 pause anchor changed';end if;
 fixed=replace(fixed,anchor,anchor||$inject$
   and (not mtm_hw_private.student_is_paused(r.id,r.ngay)
    or exists(select 1 from mtm_hw_private.attendance a_actual where a_actual.student_id=r.id and a_actual.session_date=r.ngay and a_actual.class_label=r.class_label
     and a_actual.status in ('co_mat','hoc_online','di_muon','ve_som')
     and (a_actual.source in ('zoom','van_tay','quan_ly') or coalesce(a_actual.time_in,'')<>'' or coalesce(a_actual.time_out,'')<>'')))
$inject$);
 anchor='and (not schedule_hs.is_xps or schedule_hs.lr is null';
 if position(anchor in fixed)=0 then raise exception '066 legacy private schedule anchor changed';end if;
 fixed=replace(fixed,anchor,'and (r.nguon=''Lịch riêng chuẩn'' or not schedule_hs.is_xps or schedule_hs.lr is null');
 if fixed=src then raise exception '066 projection patch missing';end if;execute fixed;
end$projection$;

-- Expected hiển thị riêng; không đẩy planned vào dueAt/effectiveDueAt hoặc bảng rank.
alter function public.mtm_btvn_read(text,text) rename to mtm_btvn_read_before_schedule066;
create function public.mtm_btvn_read(p_session text,p_lesson text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;sid uuid;cards jsonb;due timestamptz;
begin
 result=public.mtm_btvn_read_before_schedule066(p_session,p_lesson);sid=mtm_hw_private.btvn_student(p_session);
 due=mtm_hw_private.btvn_schedule_planned_due(sid,result->'material'->>'lessonCode');
 if due is not null and result->'work'->'student' is not null then
  result=jsonb_set(result,'{work,student}',result->'work'->'student'||jsonb_build_object('expectedDueAt',extract(epoch from due)*1000));end if;
 select coalesce(jsonb_agg(case when proposed.due is null then card else card||jsonb_build_object('expectedDueAt',extract(epoch from proposed.due)*1000) end order by ord),'[]'::jsonb)
 into cards from jsonb_array_elements(coalesce(result->'lessons','[]')) with ordinality x(card,ord)
 cross join lateral(select mtm_hw_private.btvn_schedule_planned_due(sid,card->>'lessonCode') due) proposed;
 return result||jsonb_build_object('lessons',cards);
end$$;
revoke all on function public.mtm_btvn_read_before_schedule066(text,text),public.mtm_btvn_read(text,text) from public,anon,authenticated,service_role;
grant execute on function public.mtm_btvn_read(text,text) to service_role;
alter function public.mtm_btvn_scorebook(date,boolean) rename to mtm_btvn_scorebook_before_schedule066;
create function public.mtm_btvn_scorebook(p_from date default '2026-10-15',p_apply boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when proposed.due is null then item else item||jsonb_build_object('expectedDueAt',extract(epoch from proposed.due)*1000) end order by ord),'[]'::jsonb)
 from jsonb_array_elements(public.mtm_btvn_scorebook_before_schedule066(p_from,p_apply)) with ordinality x(item,ord)
 cross join lateral(select mtm_hw_private.btvn_schedule_planned_due((item->>'studentId')::uuid,item->>'lessonCode') due) proposed
$$;
revoke all on function public.mtm_btvn_scorebook_before_schedule066(date,boolean),public.mtm_btvn_scorebook(date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mtm_btvn_scorebook(date,boolean) to service_role;
do $csv_expected$
declare src text;anchor text;fixed text;
begin
 src=pg_get_functiondef('public.mtm_btvn_sheet_csv(text)'::regprocedure);
 anchor='coalesce(mtm_hw_private.btvn_override_due(s.id,l.code),w.next_actual_class_at,w.expected_due_at,';
 if position(anchor in src)=0 then raise exception '066 CSV expected anchor changed';end if;
 fixed=replace(src,anchor,'coalesce(mtm_hw_private.btvn_override_due(s.id,l.code),w.next_actual_class_at,mtm_hw_private.btvn_schedule_planned_due(s.id,l.code),w.expected_due_at,');execute fixed;
end$csv_expected$;

alter function mtm_hw_private.sync_dispatch(jsonb) rename to sync_dispatch_before_schedule066;
create function mtm_hw_private.sync_dispatch(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p->>'action' in ('student_schedule_set','student_schedule_cancel','student_schedule_read','student_pause','student_pause_cancel') then
  return mtm_hw_private.student_schedule_action(p);end if;
 return mtm_hw_private.sync_dispatch_before_schedule066(p);
end$$;
do $api$
declare src text;fixed text;
begin
 src=pg_get_functiondef('public.mtm_dd_api15(jsonb)'::regprocedure);
 if position('''sync_requeue''];' in src)=0 then raise exception '066 API mutation anchor changed';end if;
 fixed=replace(src,'''sync_requeue''];','''sync_requeue'',''student_schedule_set'',''student_schedule_cancel'',''student_pause'',''student_pause_cancel''];');
 fixed=replace(fixed,'''scoreId'',''deliveryId''','''scoreId'',''ruleId'',''pauseId'',''deliveryId''');execute fixed;
end$api$;
alter function mtm_hw_private.sync_sinks(text,text,text[]) rename to sync_sinks_before_schedule066;
create function mtm_hw_private.sync_sinks(p_table text,p_operation text,p_changed text[]) returns text[]
language sql immutable set search_path='' as $$
 select case when p_table in ('student_schedule_rules','student_pauses') then
  array['web','attendance','sheet_import','sheet_roster','sheet_attendance','guardian_report','bot_profile']::text[]
 else mtm_hw_private.sync_sinks_before_schedule066(p_table,p_operation,p_changed) end
$$;
create trigger mtm_sync_capture after insert or update or delete on mtm_hw_private.student_schedule_rules
 for each row execute function mtm_hw_private.sync_capture('id,student_id,from_date,to_date');
create trigger mtm_sync_capture after insert or update or delete on mtm_hw_private.student_pauses
 for each row execute function mtm_hw_private.sync_capture('id,student_id,from_date,to_date');
revoke all on function mtm_hw_private.student_has_schedule(uuid,date),mtm_hw_private.student_is_paused(uuid,date),
 mtm_hw_private.student_next_scheduled_at(uuid,date,date),mtm_hw_private.btvn_override_due_before_schedule066(uuid,text),
 mtm_hw_private.btvn_override_due(uuid,text),mtm_hw_private.btvn_schedule_planned_due(uuid,text),mtm_hw_private.btvn_override_receipts(),
 mtm_hw_private.student_schedule_refresh_work(uuid,date,date),mtm_hw_private.student_schedule_action(jsonb),
 mtm_hw_private.sync_dispatch_before_schedule066(jsonb),mtm_hw_private.sync_dispatch(jsonb),
 mtm_hw_private.sync_sinks_before_schedule066(text,text,text[]),mtm_hw_private.sync_sinks(text,text,text[]) from public,anon,authenticated,service_role;
commit;
