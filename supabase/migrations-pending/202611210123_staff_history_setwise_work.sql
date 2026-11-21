-- Resolve work dates and build each student/class/day's items once per report.
-- Preserve the authorization, pagination and attendance clocks from SQL114/122.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $history123$
declare
 target regprocedure=to_regprocedure('mtm_hw_private.lesson_staff_history110(jsonb)');
 session_source constant text=$sessions$ session_rows as materialized (
  select r.student_id,c.id class_id,c.label class_name,r.ngay as day,min(split_part(r.gio,'-',1)) start_time,
   count(distinct r.gio)=1 single_attendance_slot
  from mtm_hw_private.lesson_history_sessions114(df,dt,(select coalesce(array_agg(id),array[]::uuid[]) from student_scope)) r join selected_classes c on c.label=r.ca_lop
  join student_scope st on st.id=r.student_id
  where view_mode='session' and r.nguon_dk is distinct from 'Đã chuyển đi'
   and (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(c.label))>0)
  group by r.student_id,c.id,c.label,r.ngay
 ),
$sessions$;
 src text;
 anchor record;
begin
 if target is null then
  raise exception 'HISTORY123_REQUIRES_STAFF_HISTORY';
 end if;
 src=pg_get_functiondef(target);
 if position($clock$'attendance_time_in',attendance_clocks.time_in,'attendance_time_out',attendance_clocks.time_out$clock$ in src)=0 then
  raise exception 'HISTORY123_REQUIRES_ATTENDANCE_CLOCKS';
 end if;

 for anchor in select * from (values
  (1,session_source||$old$ assignment_rows as materialized ($old$,$new$ assignment_rows as materialized ($new$),
  (2,$old$ student_class_candidates as materialized ($old$,
   session_source||$new$ -- Only pairs with a reportable session can contribute work in session mode.
 session_pair_bounds as materialized (
  select student_id,class_id,min(day) first_session,max(day) last_session
  from session_rows group by student_id,class_id
 ),
 student_class_candidates as materialized ($new$),
  (3,$old$join student_scope st on st.id=sc.student_id
  left join mtm_hw_private.btvn_work w on w.student_id=sc.student_id and w.lesson_code=cl.assignment_id
  where (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(cl.class_name))>0)$old$,
   $new$join student_scope st on st.id=sc.student_id
  left join session_pair_bounds p on view_mode='session' and p.student_id=sc.student_id and p.class_id=sc.class_id
  left join mtm_hw_private.btvn_work w on w.student_id=sc.student_id and w.lesson_code=cl.assignment_id
  -- Homework can predate the first session; an exam must be on a session date.
  where (view_mode='assignment' or case when work_kind='homework' then cl.day<p.last_session
         else cl.day between p.first_session and p.last_session end)
   and (term='' or position(term in mtm_hw_private.vn_fold(st.full_name))>0 or position(term in mtm_hw_private.vn_fold(cl.class_name))>0)$new$),
  (4,$old$base_rows as (select * from session_rows union all select * from assignment_rows),
 records as materialized ($old$,
   $new$base_rows as (select * from session_rows union all select * from assignment_rows),
 -- The preceding date group excludes homework assigned on the session's own date.
 prior_work_days as materialized (
  select student_id,class_id,day,prior_day
  from (
   select d.*,max(day) filter (where not is_session) over (
    partition by student_id,class_id order by day
    groups between unbounded preceding and 1 preceding
   ) prior_day
   from (
    select distinct h.student_id,h.class_id,h.day,false is_session
    from eligible_homework h where view_mode='session' and work_kind='homework'
    union all
    select s.student_id,s.class_id,s.day,true is_session
    from session_rows s where work_kind='homework'
   ) d
  ) timeline
  where is_session
 ),
 record_work_keys as materialized (
  select b.*,case when view_mode='session' and work_kind='homework' then p.prior_day else b.day end work_day
  from base_rows b
  left join prior_work_days p on p.student_id=b.student_id and p.class_id=b.class_id and p.day=b.day
 ),
 work_by_day as materialized (
  select h.student_id,h.class_id,h.day,
   jsonb_agg(jsonb_build_object('assignment_id',h.assignment_id,'title',h.title,'lesson_date',h.day,
    'due_at',h.due_at,'score',h.score,'submitted_at',h.submitted_at,'work_kind',work_kind,'exam_type',h.exam_type,'assessment_id',h.assessment_id,'opens_at',h.opens_at,'closes_at',h.closes_at,'duration_minutes',h.duration_minutes,
    'status',case when h.not_released then 'not_released' when h.score is not null then 'submitted' when h.submitted_at is not null then 'pending' else 'not_submitted' end) order by h.assignment_id) items
  from eligible_homework h
  group by h.student_id,h.class_id,h.day
 ),
 records as materialized ($new$),
  (5,$old$from base_rows b join student_scope st on st.id=b.student_id
  left join mtm_hw_private.attendance a on a.student_id=b.student_id and a.class_label=b.class_name and a.session_date=b.day
  left join lateral (
   select jsonb_agg(jsonb_build_object('assignment_id',h.assignment_id,'title',h.title,'lesson_date',h.day,
    'due_at',h.due_at,'score',h.score,'submitted_at',h.submitted_at,'work_kind',work_kind,'exam_type',h.exam_type,'assessment_id',h.assessment_id,'opens_at',h.opens_at,'closes_at',h.closes_at,'duration_minutes',h.duration_minutes,
    'status',case when h.not_released then 'not_released' when h.score is not null then 'submitted' when h.submitted_at is not null then 'pending' else 'not_submitted' end) order by h.assignment_id) items
   from eligible_homework h where h.student_id=b.student_id and h.class_id=b.class_id
    and h.day=case when work_kind='exam' or view_mode='assignment' then b.day else
     (select max(h2.day) from eligible_homework h2 where h2.student_id=b.student_id and h2.class_id=b.class_id and h2.day<b.day) end
  ) hw on true$old$,
   $new$from record_work_keys b join student_scope st on st.id=b.student_id
  left join mtm_hw_private.attendance a on a.student_id=b.student_id and a.class_label=b.class_name and a.session_date=b.day
  left join work_by_day hw on hw.student_id=b.student_id and hw.class_id=b.class_id and hw.day=b.work_day$new$)
 ) edits(step,old_src,new_src) order by step loop
  if length(src)-length(replace(src,anchor.old_src,''))<>length(anchor.old_src) then
   raise exception 'HISTORY123_SOURCE_CHANGED';
  end if;
  src=replace(src,anchor.old_src,anchor.new_src);
 end loop;
 execute src;
end $history123$;

commit;
