-- Chẩn đoán chỉ đọc: không ghi gì. Kết quả trả qua thông báo lỗi để workflow in ra.
do $$
declare r text;
begin
 select 'D:'||coalesce(string_agg(to_char(d,'DD')||'='||a||'/'||w||'/'||u,' ' order by d),'')
  ||' PS:'||(select count(*) from mtm_hw_private.paper_scores)
  ||' PL:'||(select count(*) from mtm_hw_private.parent_links)||'/'||(select count(distinct student_id) from mtm_hw_private.parent_links)
  ||' MAX:'||coalesce((select to_char(max(session_date),'DD/MM') from mtm_hw_private.attendance where status<>'du_kien'),'-')
 into r from (
  select d::date d,
   (select count(*) from mtm_hw_private.attendance x where x.session_date=d::date and x.status<>'du_kien') a,
   (select count(*) from mtm_hw_private.attendance_raw y where y.session_date=d::date) w,
   (select count(*) from mtm_hw_private.attendance_raw y where y.session_date=d::date and y.student_id is null) u
  from generate_series(date '2026-10-12', date '2026-10-26', interval '1 day') d) t;
 raise exception 'KQ %', r;
end $$;
