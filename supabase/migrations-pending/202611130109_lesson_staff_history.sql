-- Read-only staff lookup. Sources: canonical real100 session projection,
-- effective enrollment/transfers, attendance and official web receipts.
-- No attendance/grade/enrollment writes; no new exam-admin grants.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_retry108(jsonb)') is null
 or to_regprocedure('mtm_hw_private.hv_ca_rows_real100(date,date)') is null
 or to_regprocedure('mtm_hw_private.btvn_official_receipts_real100(uuid,text)') is null then raise exception 'STAFF_HISTORY_SOURCE_REQUIRED';end if;
end$$;

create or replace function mtm_hw_private.lesson_history_day109(material jsonb,label text) returns date
language plpgsql immutable set search_path='' as $$
declare v text=coalesce(material->'classDates'->>label,material->>'date');
begin
 if v is null or v!~'^\d{4}-\d{2}-\d{2}$' then return null;end if;
 return v::date;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end$$;

create or replace function mtm_hw_private.lesson_history_enrolled109(sid uuid,cid uuid,day date) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(bool_or(mtm_hw_private.lop_tai(s.id,mtm_hw_private.lop_chuan(current_class.label),day)=mtm_hw_private.lop_chuan(target.label)
  and (mtm_hw_private.nghi_tu(s.id) is null or day<mtm_hw_private.nghi_tu(s.id))
  and ((s.created_at at time zone 'Asia/Ho_Chi_Minh')::date<=day or exists(
   select 1 from mtm_hw_private.memberships m where m.student_id=s.id and m.class_id=target.id
    and (m.joined_at at time zone 'Asia/Ho_Chi_Minh')::date<=day
    and (m.left_at is null or (m.left_at at time zone 'Asia/Ho_Chi_Minh')::date>day)))),false)
 from mtm_hw_private.students s join mtm_hw_private.classes current_class on current_class.id=s.class_id
 join mtm_hw_private.classes target on target.id=cid and target.owner_id=s.owner_id where s.id=sid
$$;

create or replace function mtm_hw_private.lesson_staff_history109(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare staff public.mtm_staff;center_owner uuid;today date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date;
 df date;dt date;cid uuid;sid uuid;term text='';pg int=1;sz int=50;view_mode text=coalesce(p->>'mode','session');out jsonb;
begin
 select * into staff from public.mtm_staff where user_id=auth.uid() and active;
 if staff.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
 if staff.must_change_password then raise exception 'PASSWORD_CHANGE_REQUIRED' using errcode='42501';end if;
 select owner_id into center_owner from mtm_hw_private.btvn_roster_scope where singleton;
 if center_owner is null then raise exception 'STAFF_REPORT_SCOPE_UNAVAILABLE' using errcode='42501';end if;
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4096
 or exists(select 1 from jsonb_object_keys(p) k where k not in ('action','mode','from_date','to_date','class_id','student_id','name','page','page_size'))
 or view_mode not in ('session','assignment') then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
 if (p ? 'from_date' and (jsonb_typeof(p->'from_date') is distinct from 'string' or p->>'from_date'!~'^\d{4}-\d{2}-\d{2}$'))
 or (p ? 'to_date' and (jsonb_typeof(p->'to_date') is distinct from 'string' or p->>'to_date'!~'^\d{4}-\d{2}-\d{2}$')) then raise exception 'STAFF_HISTORY_RANGE' using errcode='22023';end if;
 begin
  df=coalesce((p->>'from_date')::date,today-6);dt=coalesce((p->>'to_date')::date,today);
 exception when invalid_datetime_format or datetime_field_overflow then raise exception 'STAFF_HISTORY_RANGE' using errcode='22023';end;
 if dt<df or dt-df>30 or dt>today then raise exception 'STAFF_HISTORY_RANGE' using errcode='22023';end if;
 if p ? 'page' then
  if jsonb_typeof(p->'page') is distinct from 'number' or p->>'page'!~'^[0-9]{1,6}$' then raise exception 'STAFF_HISTORY_PAGE' using errcode='22023';end if;
  pg=(p->>'page')::int;
 end if;
 if p ? 'page_size' then
  if jsonb_typeof(p->'page_size') is distinct from 'number' or p->>'page_size'!~'^[0-9]{1,3}$' then raise exception 'STAFF_HISTORY_PAGE' using errcode='22023';end if;
  sz=(p->>'page_size')::int;
 end if;
 if pg<1 or sz<1 or sz>100 then raise exception 'STAFF_HISTORY_PAGE' using errcode='22023';end if;
 if p ? 'name' then
  if jsonb_typeof(p->'name') is distinct from 'string' or length(p->>'name')>100 then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
  term=mtm_hw_private.vn_fold(p->>'name');
 end if;
 if p ? 'class_id' then
  if jsonb_typeof(p->'class_id') is distinct from 'string' or p->>'class_id'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
  cid=(p->>'class_id')::uuid;
  if not exists(select 1 from mtm_hw_private.classes c where c.id=cid and c.owner_id=center_owner
   and (staff.role in ('ql','admin') or exists(select 1 from mtm_hw_private.timetable t where t.class_label=c.label and mtm_hw_private.lesson_teacher(t.teacher)=staff.teacher_key)))
   then raise exception 'STAFF_HISTORY_CLASS_DENIED' using errcode='42501';end if;
 end if;
 if p ? 'student_id' then
  if jsonb_typeof(p->'student_id') is distinct from 'string' or p->>'student_id'!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
  sid=(p->>'student_id')::uuid;
 end if;
 with
 allowed_classes as materialized (
  select c.id,c.label,c.owner_id from mtm_hw_private.classes c where c.owner_id=center_owner
  and (staff.role in ('ql','admin') or exists(select 1 from mtm_hw_private.timetable t where t.class_label=c.label and mtm_hw_private.lesson_teacher(t.teacher)=staff.teacher_key))
 ),
 selected_classes as materialized (select * from allowed_classes where cid is null or id=cid),
 student_scope as materialized (
  select s.id,s.full_name,s.class_id,s.active from mtm_hw_private.students s
  where s.owner_id=center_owner and not s.is_test and coalesce(s.source_identity,'') not like 'qa:%'
   and not exists(select 1 from mtm_test100.cleanup_jobs j where j.student_id=s.id)
   and (sid is null or s.id=sid)
 ),
 eligible_homework as materialized (
  select st.id student_id,c.id class_id,c.label class_name,d.day,l.code assignment_id,
   coalesce(nullif(l.exam->>'title',''),nullif(l.material->>'title',''),l.code) title,w.expected_due_at due_at,
   best.score,best.submitted_at
  from student_scope st cross join selected_classes c
  join mtm_hw_private.btvn_lessons l on l.owner_id=center_owner and l.kind='btvn' and not l.is_test
  cross join lateral(select mtm_hw_private.lesson_history_day109(l.material,c.label) as day) d
  left join mtm_hw_private.btvn_work w on w.student_id=st.id and w.lesson_code=l.code
  left join lateral (
   select r.score,to_timestamp((r.submitted_at/1000)::double precision) submitted_at
   from mtm_hw_private.btvn_official_receipts_real100(st.id,l.code) r
   where r.submitted_at between 0 and 253402300799999
   order by r.score desc nulls last,r.submitted_at desc limit 1
  ) best on true
  where d.day is not null and d.day<=dt
   and (view_mode='session' or d.day>=df)
   and (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(c.label))>0)
   and ((c.id=any(l.class_ids) and l.publish_status='da_dang' and mtm_hw_private.lesson_history_enrolled109(st.id,c.id,d.day))
    or (w.student_id is not null and best.submitted_at is not null and mtm_hw_private.lesson_history_enrolled109(st.id,c.id,d.day)
     and (c.id=any(l.class_ids) or (jsonb_typeof(l.material->'classNames')='array' and l.material->'classNames' ? c.label))))
 ),
 session_rows as materialized (
  select r.student_id,c.id class_id,c.label class_name,r.ngay as day,min(split_part(r.gio,'-',1)) start_time
  from mtm_hw_private.hv_ca_rows_real100(df,dt) r join selected_classes c on c.label=r.ca_lop
  join student_scope st on st.id=r.student_id
  where view_mode='session' and r.nguon_dk is distinct from 'Đã chuyển đi'
   and (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(c.label))>0)
  group by r.student_id,c.id,c.label,r.ngay
 ),
 assignment_rows as materialized (
  select h.student_id,h.class_id,h.class_name,h.day,null::text start_time
  from eligible_homework h where view_mode='assignment' group by h.student_id,h.class_id,h.class_name,h.day
 ),
 base_rows as (select * from session_rows union all select * from assignment_rows),
 records as materialized (
  select b.student_id,b.class_id,b.class_name,b.day,b.start_time,
   btrim(regexp_replace(st.full_name,'\s*[\(\[].*$','')) student_name,
   a.status attendance_status,a.source attendance_source,
   case when st.class_id<>b.class_id and exists(select 1 from mtm_hw_private.class_transfers t where t.student_id=st.id and t.cancelled_at is null and t.applied_at is not null and t.from_class=b.class_name and t.effective_date>b.day) then 'transferred'
    when not st.active then 'former'
    when mtm_hw_private.lesson_history_enrolled109(st.id,b.class_id,b.day) then 'active' else 'unknown' end enrollment_status,
   coalesce(hw.items,'[]') homework
  from base_rows b join student_scope st on st.id=b.student_id
  left join mtm_hw_private.attendance a on a.student_id=b.student_id and a.class_label=b.class_name and a.session_date=b.day
  left join lateral (
   select jsonb_agg(jsonb_build_object('assignment_id',h.assignment_id,'title',h.title,'lesson_date',h.day,
    'due_at',h.due_at,'score',h.score,'submitted_at',h.submitted_at,
    'status',case when h.score is not null then 'submitted' when h.submitted_at is not null then 'pending' else 'not_submitted' end) order by h.assignment_id) items
   from eligible_homework h where h.student_id=b.student_id and h.class_id=b.class_id
    and h.day=case when view_mode='assignment' then b.day else
     (select max(h2.day) from eligible_homework h2 where h2.student_id=b.student_id and h2.class_id=b.class_id and h2.day<b.day) end
  ) hw on true
 ),
 page_rows as (
  select r.* from records r order by r.day desc,r.class_name,r.start_time nulls last,mtm_hw_private.vn_fold(r.student_name),r.student_id,r.class_id
  offset (pg-1)*sz limit sz
 )
 select jsonb_build_object('ok',true,'mode',view_mode,'score_basis',case when view_mode='session' then 'previous_assignment_day' else 'assignment_date' end,
  'score_snapshot','current_official_best',
  'authorization_basis','current_class_timetable','from_date',df,'to_date',dt,'page',pg,'page_size',sz,
  'total',(select count(*) from records),'has_more',(select count(*) from records)>pg*sz,'generated_at',current_timestamp,
  'classes',coalesce((select jsonb_agg(jsonb_build_object('class_id',c.id,'class_name',c.label) order by c.label,c.id) from allowed_classes c),'[]'),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('record_id',view_mode||':'||r.day::text||':'||r.class_id::text||':'||r.student_id::text,
   'student_id',r.student_id,'student_name',r.student_name,'display_name',r.student_name,'class_id',r.class_id,'class_name',r.class_name,
   'lesson_date',r.day,'start_time',r.start_time,'attendance_status',r.attendance_status,'attendance_source',r.attendance_source,
   'enrollment_status',r.enrollment_status,'homework',r.homework)
   order by r.day desc,r.class_name,r.start_time nulls last,mtm_hw_private.vn_fold(r.student_name),r.student_id,r.class_id) from page_rows r),'[]'),
  'summary',jsonb_build_object('rows',(select count(*) from records),'students',(select count(distinct student_id) from records),
   'attendance_recorded_rows',(select count(*) from records where attendance_status is not null),
   'attendance_unknown_rows',(select count(*) from records where attendance_status is null),
   'homework_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item),
   'graded_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item where item->'score'<>'null'::jsonb),
   'pending_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item where item->>'status'='pending'),
   'not_submitted_items',(select count(*) from records cross join lateral jsonb_array_elements(homework) item where item->>'status'='not_submitted')))
 into out;
 return out;
end$$;

do $$begin
 if to_regprocedure('public.mtm_lesson_upload_api_before_staff109(jsonb)') is null then alter function public.mtm_lesson_upload_api(jsonb) rename to mtm_lesson_upload_api_before_staff109;end if;
end$$;
create or replace function public.mtm_lesson_upload_api(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p->>'action'='staff_history' then return mtm_hw_private.lesson_staff_history109(p);end if;
 return public.mtm_lesson_upload_api_before_staff109(p);
end$$;
revoke all on function mtm_hw_private.lesson_history_day109(jsonb,text),mtm_hw_private.lesson_history_enrolled109(uuid,uuid,date),mtm_hw_private.lesson_staff_history109(jsonb),
 public.mtm_lesson_upload_api_before_staff109(jsonb),public.mtm_lesson_upload_api(jsonb)
 from public,anon,authenticated,service_role,mtm_btvn_publisher;
grant execute on function public.mtm_lesson_upload_api(jsonb) to authenticated,service_role;
commit;
