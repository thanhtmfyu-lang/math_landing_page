-- Pending SQL114. Keeps existing private history function OID/ACL and public routing.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $history114_guard$
begin
 if to_regprocedure('mtm_hw_private.lesson_staff_history110(jsonb)') is null or to_regprocedure('mtm_hw_private.hv_ca_rows_real100(date,date)') is null or to_regprocedure('mtm_hw_private.lop_tai(uuid,text,date)') is null or to_regprocedure('mtm_hw_private.btvn_official_receipts_real100(uuid,text)') is null then raise exception 'HISTORY114_SOURCE_REQUIRED';end if;
 if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid='mtm_hw_private.lesson_staff_history110(jsonb)'::regprocedure) is distinct from '61498a70a3488e9d77d8ee8729a71ca3555cdeca3d56164c3b9ab3b1dd415e05' then raise exception 'HISTORY114_SOURCE_CHANGED';end if;
 if encode(sha256(convert_to(pg_get_functiondef('mtm_hw_private.hv_ca_rows_real100(date,date)'::regprocedure),'UTF8')),'hex') is distinct from 'b1b16c870d5caeb6ac43df0627de6b80500f895ec4d0f8cded61972ef974c8cc' then raise exception 'HISTORY114_SESSION_SOURCE_CHANGED';end if;
 if encode(sha256(convert_to(pg_get_functiondef('mtm_hw_private.lop_tai(uuid,text,date)'::regprocedure),'UTF8')),'hex') is distinct from '102b6fee8a9bf76a44651c23d780fcb37004e4ebee0511d38bf3faf7aa328b34' then raise exception 'HISTORY114_ENROLLMENT_SOURCE_CHANGED';end if;
 if encode(sha256(convert_to(pg_get_functiondef('mtm_hw_private.btvn_official_receipts_real100(uuid,text)'::regprocedure),'UTF8')),'hex') is distinct from '2ca6afea4685c18b2b48e51f420d89589c0064ec26bef368e36812690b82eaaf' then raise exception 'HISTORY114_RECEIPTS_SOURCE_CHANGED';end if;
end$history114_guard$;
CREATE OR REPLACE FUNCTION mtm_hw_private.lesson_history_sessions114(p_from date,p_to date,p_student_ids uuid[])
RETURNS TABLE(student_id uuid,ngay date,ca_lop text,gio text,nguon_dk text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $session114$
 with recursive
 nowvn as (select (current_timestamp at time zone 'Asia/Ho_Chi_Minh') t),
 days as (select generate_series(p_from,p_to,'1 day')::date d),
 ca as (select d.d ngay,t.* from days d join mtm_hw_private.timetable t on t.weekday=mtm_hw_private.vn_wd(d.d)),
 hs as (select s.id,s.full_name,mtm_hw_private.lop_chuan(c.label) lop,s.class_id,split_part(c.label,' ',1) cohort,mtm_hw_private.lich_rieng(s.full_name) lr,
   case when upper(normalize(coalesce(s.full_name,''),NFC)) ~ 'HỌC\s*(CN|CHỦ\s*NHẬT)' then date '2026-10-19' else '-infinity'::date end lr_from,
   exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=mtm_hw_private.lop_chuan(c.label)) is_xps
  from mtm_test100.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  where coalesce(s.id=any(p_student_ids),false) and (s.active or mtm_hw_private.nghi_tu(s.id) is not null) and c.active and coalesce(s.source_identity,'') not like 'qa:%'),
 -- ===== ca thường (không thuộc nhóm XPS) =====
 dk as (
  select ca.ngay,ca.class_label,ca.start_hm,ca.end_hm,ca.mode,hs.id,'Lớp gốc'::text nguon,''::text con
  from ca join hs on mtm_hw_private.lop_tai(hs.id,hs.lop,ca.ngay)=ca.class_label
  where not exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=ca.class_label and x.weekday=ca.weekday and x.start_hm=ca.start_hm)
  union
  select m.to_date,m.to_class,coalesce(t.start_hm,''),coalesce(t.end_hm,''),coalesce(t.mode,''),m.student_id,'Chuyển đến',''
  from mtm_hw_private.schedule_moves m left join mtm_hw_private.timetable t on t.class_label=m.to_class and t.weekday=mtm_hw_private.vn_wd(m.to_date)
  where m.cancelled_at is null and m.to_date between p_from and p_to
   and not exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=m.to_class and x.weekday=mtm_hw_private.vn_wd(m.to_date))
 ),
 -- ===== nhóm XPS: mỗi em mỗi buổi đúng một ca =====
 wkd as (select generate_series(date_trunc('week',p_from)::date,(date_trunc('week',p_to)::date+6),'1 day')::date d),
 opt as (select date_trunc('week',w.d)::date wk,x.cohort,x.slot,w.d ngay,t.class_label,t.start_hm,t.end_hm,t.mode
  from wkd w join mtm_hw_private.xps_slot x on x.weekday=mtm_hw_private.vn_wd(w.d)
  join mtm_hw_private.timetable t on t.class_label=x.class_label and t.weekday=x.weekday and t.start_hm=x.start_hm),
 slots as (select distinct wk,cohort,slot from opt where wk between date_trunc('week',p_from)::date and date_trunc('week',p_to)::date),
 pick as (
  select s.wk,s.slot,h.id,ch.*
  from slots s join hs h on h.is_xps and h.cohort=s.cohort
  cross join lateral (
   select o.ngay,o.class_label,o.start_hm,o.end_hm,o.mode,
    case when a.student_id is not null then case when o.class_label=mtm_hw_private.lop_tai(h.id,h.lop,o.ngay) then 'Lớp gốc' else 'Học ca khác cùng buổi' end
     when m.id is not null then 'Chuyển đến'
     when h.lr is not null and o.ngay>=h.lr_from and mtm_hw_private.vn_wd(o.ngay) in (select jsonb_array_elements_text(h.lr->'days')::int) and o.start_hm=h.lr->>'start' then 'Lịch riêng'
     else 'Lớp gốc' end nguon,
    (select string_agg(to_char(o2.ngay,'DD/MM')||' '||o2.class_label,', ' order by o2.ngay) from opt o2
      where o2.wk=s.wk and o2.cohort=s.cohort and o2.slot=s.slot
       and (o2.ngay+o2.end_hm::time) > (select t from nowvn) and not (o2.ngay=o.ngay and o2.class_label=o.class_label)) con
   from opt o
   left join mtm_hw_private.attendance a on a.student_id=h.id and a.session_date=o.ngay and a.class_label=o.class_label
   left join mtm_hw_private.schedule_moves m on m.student_id=h.id and m.to_date=o.ngay and m.to_class=o.class_label and m.cancelled_at is null
   where o.wk=s.wk and o.cohort=s.cohort and o.slot=s.slot
   order by (a.student_id is not null and a.status in ('co_mat','hoc_online','di_muon','ve_som')) desc,(a.student_id is not null) desc,(m.id is not null) desc,
    (h.lr is not null and o.ngay>=h.lr_from and mtm_hw_private.vn_wd(o.ngay) in (select jsonb_array_elements_text(h.lr->'days')::int) and o.start_hm=h.lr->>'start') desc,
    (o.class_label=mtm_hw_private.lop_tai(h.id,h.lop,o.ngay)) desc,o.ngay desc,o.start_hm desc
   limit 1) ch
 ),
 allrows_legacy as (
  select ngay,class_label,start_hm,end_hm,mode,id,nguon,con from dk
  union all
  select ngay,class_label,start_hm,end_hm,mode,id,nguon,con from pick where ngay between p_from and p_to

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
 dk2 as (
  select r.*,exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=r.id and m.from_date=r.ngay and m.from_class=r.class_label
    and m.cancelled_at is null and not (m.to_date=r.ngay and m.to_class=r.class_label)) chuyen_di
  from (select distinct on (ngay,class_label,start_hm,id) * from allrows order by ngay,class_label,start_hm,id,case nguon when 'Chuyển đến' then 1 else 2 end) r
  join hs schedule_hs on schedule_hs.id=r.id
  where (mtm_hw_private.nghi_tu(r.id) is null or r.ngay < mtm_hw_private.nghi_tu(r.id))
   and (not mtm_hw_private.student_is_paused(r.id,r.ngay)
    or exists(select 1 from mtm_hw_private.attendance a_actual where a_actual.student_id=r.id and a_actual.session_date=r.ngay and a_actual.class_label=r.class_label
     and a_actual.status in ('co_mat','hoc_online','di_muon','ve_som')
     and (a_actual.source in ('zoom','van_tay','quan_ly') or coalesce(a_actual.time_in,'')<>'' or coalesce(a_actual.time_out,'')<>'')))

   and (r.nguon='Lịch riêng chuẩn' or not schedule_hs.is_xps or schedule_hs.lr is null or r.ngay<schedule_hs.lr_from
    or (mtm_hw_private.vn_wd(r.ngay) in (select jsonb_array_elements_text(schedule_hs.lr->'days')::int) and r.start_hm=schedule_hs.lr->>'start')
    or exists(select 1 from mtm_hw_private.attendance a_history where a_history.student_id=r.id and a_history.session_date=r.ngay and a_history.class_label=r.class_label)
    or exists(select 1 from mtm_hw_private.schedule_moves m_history where m_history.student_id=r.id and m_history.to_date=r.ngay and m_history.to_class=r.class_label and m_history.cancelled_at is null))
 )
 select hs.id as student_id,dk2.ngay,dk2.class_label as ca_lop,dk2.start_hm||'-'||dk2.end_hm as gio,
  case when dk2.chuyen_di then 'Đã chuyển đi' else dk2.nguon end as nguon_dk
 from dk2 join hs on hs.id=dk2.id
$session114$;

create or replace function mtm_hw_private.lesson_staff_history110(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare staff public.mtm_staff;center_owner uuid;today date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date;
 df date;dt date;cid uuid;sid uuid;term text='';pg int=1;sz int=50;view_mode text=coalesce(p->>'mode','session');work_kind text=coalesce(p->>'work_kind','homework');out jsonb;
begin
 select * into staff from public.mtm_staff where user_id=auth.uid() and active;
 if staff.user_id is null then raise exception 'STAFF_REQUIRED' using errcode='42501';end if;
 if staff.must_change_password then raise exception 'PASSWORD_CHANGE_REQUIRED' using errcode='42501';end if;
 select owner_id into center_owner from mtm_hw_private.btvn_roster_scope where singleton;
 if center_owner is null then raise exception 'STAFF_REPORT_SCOPE_UNAVAILABLE' using errcode='42501';end if;
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>4096
 or exists(select 1 from jsonb_object_keys(p) k where k not in ('action','mode','from_date','to_date','class_id','student_id','name','page','page_size','work_kind'))
 or view_mode not in ('session','assignment') or work_kind not in ('homework','exam') or (p ? 'work_kind' and jsonb_typeof(p->'work_kind') is distinct from 'string') then raise exception 'STAFF_HISTORY_FILTER_INVALID' using errcode='22023';end if;
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
 student_class_candidates as materialized (
  -- lop_tai can return only current class, applied-transfer FROM or pending-transfer TO.
  -- Memberships are an additional safe superset; canonical enrollment still decides.
  select st.id student_id,c.id class_id from student_scope st
   join mtm_hw_private.classes cur on cur.id=st.class_id
   join selected_classes c on mtm_hw_private.lop_chuan(c.label)=mtm_hw_private.lop_chuan(cur.label)
  union
  select st.id,c.id from student_scope st join mtm_hw_private.class_transfers t on t.student_id=st.id and t.cancelled_at is null
   join selected_classes c on mtm_hw_private.lop_chuan(c.label) in (mtm_hw_private.lop_chuan(t.from_class),mtm_hw_private.lop_chuan(t.to_class))
  union
  select st.id,c.id from student_scope st join mtm_hw_private.memberships m on m.student_id=st.id
   join selected_classes c on c.id=m.class_id
 ),
 class_lessons as materialized (
  select c.id class_id,c.label class_name,d.day,l.code assignment_id,
   coalesce(nullif(l.exam->>'title',''),nullif(l.material->>'title',''),l.code) title,
   (c.id=any(l.class_ids) and l.publish_status='da_dang') current_assignment,
   l.assessment_id,case when l.kind='kiem-tra-thang' then 'monthly' else l.exam_type end exam_type,l.opens_at,l.closes_at,
   (l.exam->>'durationMinutes')::int duration_minutes
  from selected_classes c join mtm_hw_private.btvn_lessons l on l.owner_id=center_owner
   and ((work_kind='homework' and l.kind='btvn') or (work_kind='exam' and l.kind in ('kiem-tra','kiem-tra-thang'))) and not l.is_test
   and (c.id=any(l.class_ids) or (jsonb_typeof(l.material->'classNames')='array' and l.material->'classNames' ? c.label))
  cross join lateral(select mtm_hw_private.lesson_history_day109(l.material,c.label) as day) d
  where d.day is not null and d.day<=dt and ((view_mode='session' and work_kind='homework') or d.day>=df)
 ),
 potential_homework as materialized (
  select sc.student_id,cl.*,w.expected_due_at,case when jsonb_typeof(w.receipts)='array' then jsonb_array_length(w.receipts)>0 else false end has_receipts
  from student_class_candidates sc join class_lessons cl on cl.class_id=sc.class_id
  join student_scope st on st.id=sc.student_id
  left join mtm_hw_private.btvn_work w on w.student_id=sc.student_id and w.lesson_code=cl.assignment_id
  where (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(cl.class_name))>0)
   and (cl.current_assignment or (w.student_id is not null and case when jsonb_typeof(w.receipts)='array' then jsonb_array_length(w.receipts)>0 else false end))
 ),
 enrollment_keys as materialized (select distinct student_id,class_id,day from potential_homework),
 enrolled_pairs as materialized (
  select e.* from enrollment_keys e where mtm_hw_private.lesson_history_enrolled109(e.student_id,e.class_id,e.day)
 ),
 enrolled_homework as materialized (
  select h.* from potential_homework h join enrolled_pairs e using(student_id,class_id,day)
 ),
 receipt_keys as materialized (select distinct student_id,assignment_id from enrolled_homework where has_receipts),
 official_best as materialized (
  -- The canonical function reads ONLY btvn_work.receipts. Never call it for an empty work row.
  select k.student_id,k.assignment_id,best.score,best.submitted_at
  from receipt_keys k cross join lateral (
   select r.score,to_timestamp((r.submitted_at/1000)::double precision) submitted_at
   from mtm_hw_private.btvn_official_receipts_real100(k.student_id,k.assignment_id) r
   where r.submitted_at between 0 and 253402300799999
   order by r.score desc nulls last,r.submitted_at desc limit 1
  ) best
 ),
 eligible_homework as materialized (
  select h.student_id,h.class_id,h.class_name,h.day,h.assignment_id,h.title,
   case when work_kind='exam' then h.closes_at else h.expected_due_at end due_at,
   case when work_kind='exam' and current_timestamp<h.closes_at then null else b.score end score,b.submitted_at,
   h.assessment_id,h.exam_type,h.opens_at,h.closes_at,h.duration_minutes,
   (work_kind='exam' and current_timestamp<h.closes_at) not_released
  from enrolled_homework h left join official_best b using(student_id,assignment_id)
  where h.current_assignment or b.submitted_at is not null
 ),
 session_rows as materialized (
  select r.student_id,c.id class_id,c.label class_name,r.ngay as day,min(split_part(r.gio,'-',1)) start_time
  from mtm_hw_private.lesson_history_sessions114(df,dt,(select coalesce(array_agg(id),array[]::uuid[]) from student_scope)) r join selected_classes c on c.label=r.ca_lop
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
    'due_at',h.due_at,'score',h.score,'submitted_at',h.submitted_at,'work_kind',work_kind,'exam_type',h.exam_type,'assessment_id',h.assessment_id,'opens_at',h.opens_at,'closes_at',h.closes_at,'duration_minutes',h.duration_minutes,
    'status',case when h.not_released then 'not_released' when h.score is not null then 'submitted' when h.submitted_at is not null then 'pending' else 'not_submitted' end) order by h.assignment_id) items
   from eligible_homework h where h.student_id=b.student_id and h.class_id=b.class_id
    and h.day=case when work_kind='exam' or view_mode='assignment' then b.day else
     (select max(h2.day) from eligible_homework h2 where h2.student_id=b.student_id and h2.class_id=b.class_id and h2.day<b.day) end
  ) hw on true
 ),
 page_rows as (
  select r.* from records r order by r.day desc,r.class_name,r.start_time nulls last,mtm_hw_private.vn_fold(r.student_name),r.student_id,r.class_id
  offset (pg-1)*sz limit sz
 )
 select jsonb_build_object('ok',true,'work_kind',work_kind,'mode',view_mode,'score_basis',case when work_kind='exam' then 'assessment_date' when view_mode='session' then 'previous_assignment_day' else 'assignment_date' end,
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


revoke all on function mtm_hw_private.lesson_history_sessions114(date,date,uuid[]) from public,anon,authenticated,service_role,mtm_btvn_publisher;
do $history114_acl$begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='mtm_hw_private.lesson_history_sessions114(date,date,uuid[])'::regprocedure and a.grantee<>p.proowner) then raise exception 'HISTORY114_PRIVATE_ACL_CHANGED';end if;
end$history114_acl$;
commit;
