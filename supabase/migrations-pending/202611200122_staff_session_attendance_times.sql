-- Pending SQL122. Expose clocks from the canonical attendance row through
-- the existing staff_history authorization, without changing its public RPC.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $history122$
declare
 target regprocedure=to_regprocedure('mtm_hw_private.lesson_staff_history110(jsonb)');
 src text;
 anchor record;
begin
 if target is null then
  raise exception 'HISTORY122_REQUIRES_STAFF_HISTORY';
 end if;
 src=pg_get_functiondef(target);
 for anchor in select * from (values
  ($old$min(split_part(r.gio,'-',1)) start_time$old$,
   $new$min(split_part(r.gio,'-',1)) start_time,
   count(distinct r.gio)=1 single_attendance_slot$new$),
  ($old$h.day,null::text start_time$old$,
   $new$h.day,null::text start_time,false single_attendance_slot$new$),
  ($old$a.status attendance_status,a.source attendance_source,$old$,
   $new$a.status attendance_status,a.source attendance_source,
   a.time_in,a.time_out,b.single_attendance_slot,$new$),
  ($old$'lesson_date',r.day,'start_time',r.start_time,'attendance_status',r.attendance_status,'attendance_source',r.attendance_source,$old$,
   $new$'lesson_date',r.day,'start_time',r.start_time,'attendance_status',r.attendance_status,'attendance_source',r.attendance_source,
   'attendance_time_in',attendance_clocks.time_in,'attendance_time_out',attendance_clocks.time_out,$new$),
  ($old$from page_rows r),'[]')$old$,
   $new$from page_rows r
   left join lateral (
    select
     case when btrim(r.time_in) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      then btrim(r.time_in)::time(0)::text end time_in,
     case when btrim(r.time_out) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      then btrim(r.time_out)::time(0)::text end time_out
    -- Attendance has no slot ID. A same-day duplicate schedule cannot
    -- identify which slot the recorded clock belongs to.
    where r.single_attendance_slot and r.start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     and r.attendance_status in ('co_mat','hoc_online','di_muon','ve_som')
     and not exists (
      select 1 from mtm_hw_private.classes c
      where c.owner_id=center_owner and c.label=r.class_name and c.id<>r.class_id
     )
     and not exists (
      select 1 from mtm_hw_private.timetable t
      where t.class_label=r.class_name and t.weekday=mtm_hw_private.vn_wd(r.day)
      offset 1
     )
   ) attendance_clocks on true),'[]')$new$)
 ) edits(old_src,new_src) loop
  if length(src)-length(replace(src,anchor.old_src,''))<>length(anchor.old_src) then
   raise exception 'HISTORY122_SOURCE_CHANGED';
  end if;
  src=replace(src,anchor.old_src,anchor.new_src);
 end loop;
 execute src;
end $history122$;

commit;
