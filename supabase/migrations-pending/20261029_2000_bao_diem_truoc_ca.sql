-- 29/10/2026 19:45 (anh Thành): "Phần trước ca học báo điểm trên web vẫn chưa có".
-- Trang /quan-tri/truoc-ca (GV/QL đăng nhập quản trị) đọc hàm này: mỗi ca trong ngày, các em học ca đó và BTVN tới hạn ở ca.
--  * Ca + HS: hv_ca_rows_real100 (TKB lớp, lớp gốc, lịch riêng, chuyển buổi; đã bỏ HS nghỉ hẳn và tài khoản thử).
--    Em đã chuyển đi khỏi ca thì không hiện ở ca đó. Không có cột điểm danh (bảng đầu ca).
--  * BTVN tới hạn: btvn_work.expected_due_at (hạn lớp theo luật "giao thứ nào nộp đúng thứ đó tuần sau",
--    = giờ vào ca − 30 phút) rơi đúng ngày đó và không muộn hơn giờ vào ca. KHÔNG dùng hạn cá nhân next_actual_class_at.
--  * Điểm: điểm cao nhất trong các lần nộp chính thức; chưa nộp lần nào = "Chưa làm"; ca không có bài tới hạn = "Chưa có bài".
-- Chỉ đọc, chỉ quản trị (mtm_is_exam_admin). Áp SAU 22:30. Chạy lại vô hại.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create or replace function public.mtm_truoc_ca_admin(p_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date; out jsonb;
begin
 if not public.mtm_is_exam_admin() then raise exception 'MTM_TRUOC_CA_ADMIN_ONLY' using errcode='42501'; end if;
 if p_day is null or p_day<today-14 or p_day>today+7 then raise exception 'MTM_TRUOC_CA_DAY' using errcode='22023'; end if;
 with r as (
  select x.ca_lop,x.gio,x.hoc_sinh,x.lop_goc,x.nguon_dk,x.student_id,split_part(x.gio,'-',1) start_hm
  from mtm_hw_private.hv_ca_rows_real100(p_day,p_day) x
  where x.nguon_dk is distinct from 'Đã chuyển đi'
 ),
 d as (
  select r.*,l.code,coalesce(nullif(l.exam->>'title',''),l.code) title,
   (select max(o.score) from mtm_hw_private.btvn_official_receipts(r.student_id,l.code) o where o.submitted_at is not null) best,
   (select count(*)::int from mtm_hw_private.btvn_official_receipts(r.student_id,l.code) o where o.submitted_at is not null) n
  from r
  left join lateral (
   select l2.* from mtm_hw_private.btvn_work w join mtm_hw_private.btvn_lessons l2 on l2.code=w.lesson_code
   where w.student_id=r.student_id and l2.active and l2.kind='btvn'
    and coalesce((to_jsonb(l2)->>'is_test')::boolean,false)=false
    and w.expected_due_at is not null
    and (w.expected_due_at at time zone 'Asia/Ho_Chi_Minh')::date=p_day
    and (r.start_hm !~ '^[0-9]{2}:[0-9]{2}$' or w.expected_due_at<=(p_day::text||'T'||r.start_hm||':00+07:00')::timestamptz)
  ) l on true
 )
 select jsonb_build_object('day',p_day,'generatedAt',to_char(current_timestamp at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI'),
  'rows',coalesce(jsonb_agg(jsonb_build_object('ca',d.ca_lop,'gio',d.gio,'hocSinh',d.hoc_sinh,'lopGoc',d.lop_goc,'nguon',d.nguon_dk,
   'bai',d.title,'diem',d.best,'soLan',coalesce(d.n,0)) order by d.gio,d.ca_lop,d.hoc_sinh,d.title),'[]'::jsonb)) into out
 from d;
 return out;
end$$;
revoke all on function public.mtm_truoc_ca_admin(date) from public,anon,authenticated,service_role;
grant execute on function public.mtm_truoc_ca_admin(date) to authenticated;
commit;
