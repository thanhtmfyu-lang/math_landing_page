-- 29/10/2026: Góc phụ huynh "Buổi học kế tiếp" luôn hiện "Theo lịch lớp" vì nguồn cũ là dòng điểm danh 'du_kien'
-- (không bao giờ được tạo). Đổi sang buổi kế tiếp thật của chính học sinh từ mtm_hw_private.hv_ca_rows
-- (cùng nguồn bảng ca học: lớp gốc, chuyển ca, lịch riêng, tạm nghỉ), trả 'YYYY-MM-DDTHH:MM' giờ VN.
-- Bỏ buổi đã chuyển đi / đã xin nghỉ; buổi đã bắt đầu thì lấy buổi sau. Không có buổi trong 8 ngày → giữ nguồn cũ.
-- Chỉ thay đúng 1 đoạn trong thân mtm_ph_extras (phải xuất hiện đúng 1 lần), giữ nguyên quyền. Chạy lại vô hại.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  fn constant regprocedure := 'public.mtm_ph_extras(text,uuid)'::regprocedure;
  old_snip constant text := $o$'upcoming',(select min(a.session_date) from mtm_hw_private.attendance a where a.student_id=p_student_id and a.status='du_kien' and a.session_date>=(now() at time zone 'Asia/Ho_Chi_Minh')::date),$o$;
  new_snip constant text := $n$'upcoming',coalesce((select to_char(r.ngay,'YYYY-MM-DD')||'T'||split_part(r.gio,'-',1) from mtm_hw_private.hv_ca_rows((now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date+7) r where r.student_id=p_student_id and r.gio ~ '^[0-9]{2}:[0-9]{2}-' and r.nguon_dk<>'Đã chuyển đi' and r.trang_thai not in ('Chuyển buổi','Vắng có phép') and (r.ngay+split_part(r.gio,'-',1)::time)>(now() at time zone 'Asia/Ho_Chi_Minh') order by r.ngay,r.gio limit 1),(select min(a.session_date)::text from mtm_hw_private.attendance a where a.student_id=p_student_id and a.status='du_kien' and a.session_date>=(now() at time zone 'Asia/Ho_Chi_Minh')::date)),$n$;
  src text; acl_before text; acl_after text; n int; probe jsonb;
BEGIN
  src := pg_get_functiondef(fn);
  IF position(new_snip IN src) > 0 THEN
    RAISE NOTICE 'PH_BUOI_KE_TIEP da ap truoc do';
  ELSE
    n := (length(src) - length(replace(src, old_snip, ''))) / length(old_snip);
    IF n <> 1 THEN RAISE EXCEPTION 'PH_BUOI_KE_TIEP_SNIPPET count %', n; END IF;
    src := replace(src, old_snip, new_snip);
    SELECT coalesce(proacl::text, '') INTO acl_before FROM pg_proc WHERE oid = fn;
    EXECUTE src;
    SELECT coalesce(proacl::text, '') INTO acl_after FROM pg_proc WHERE oid = fn;
    IF acl_before IS DISTINCT FROM acl_after THEN RAISE EXCEPTION 'PH_BUOI_KE_TIEP_ACL_CHANGED'; END IF;
  END IF;
  -- Kiểm biểu thức mới chạy được trên dữ liệu thật (không cần phiên phụ huynh): đếm số HS có buổi kế tiếp.
  SELECT jsonb_build_object('hs_co_buoi', count(DISTINCT r.student_id)) INTO probe
    FROM mtm_hw_private.hv_ca_rows((now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date+7) r
   WHERE r.gio ~ '^[0-9]{2}:[0-9]{2}-' AND (r.ngay+split_part(r.gio,'-',1)::time)>(now() at time zone 'Asia/Ho_Chi_Minh');
  IF (probe->>'hs_co_buoi')::int < 50 THEN RAISE EXCEPTION 'PH_BUOI_KE_TIEP_PROBE %', probe; END IF;
  RAISE NOTICE 'PH_BUOI_KE_TIEP %', probe;
END
$migration$;
COMMIT;
