-- Chẩn đoán chỉ đọc lần 2 (chỉ đếm, không in tên).
do $$
declare r text;
begin
 select 'HS:'||(select count(*) from mtm_hw_private.students where active)
  ||' HSDD:'||(select count(distinct a.student_id) from mtm_hw_private.attendance a join mtm_hw_private.students s on s.id=a.student_id and s.active where a.session_date between date '2026-10-12' and date '2026-10-26' and a.status<>'du_kien')
  ||' LOP:'||(select count(*) from mtm_hw_private.classes where active)
  ||' LOPDD:'||(select count(distinct class_label) from mtm_hw_private.attendance where session_date between date '2026-10-20' and date '2026-10-26' and status<>'du_kien')
  ||' UZ:'||(select count(distinct lower(raw_name)) from mtm_hw_private.attendance_raw where student_id is null and source='zoom' and session_date>=date '2026-10-12')
  ||' UV:'||(select count(distinct lower(raw_name)) from mtm_hw_private.attendance_raw where student_id is null and source='van_tay' and session_date>=date '2026-10-12')
  ||' AL:'||(select count(*) from mtm_hw_private.attendance_alias)
  ||' PA:'||(select count(*) from mtm_hw_private.parent_accounts)
  ||' SRC:'||(select string_agg(source||'='||n,',') from (select source,count(*) n from mtm_hw_private.attendance where session_date>=date '2026-10-12' and status<>'du_kien' group by 1) z)
 into r;
 raise exception 'KQ %', r;
end $$;
