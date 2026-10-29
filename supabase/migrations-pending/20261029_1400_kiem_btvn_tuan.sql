-- 29/10/2026: CHỈ KIỂM, không ghi. Sau khi áp is_test: các bản *_real100 web đang gọi chạy được trên dữ liệu thật
--   và cho cùng kết quả với hàm gốc (chưa có tài khoản thử nào). Luôn dừng bằng một dòng báo cáo, không in dữ liệu.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $check$
DECLARE r text := ''; a jsonb; b jsonb; t1 text; t2 text; n1 int; n2 int;
BEGIN
  a := public.mtm_btvn_arena('kiem-tra-thang'); b := public.mtm_btvn_arena_real100('kiem-tra-thang');
  r := r || format('arena=%s ', a = b);
  SELECT count(*) INTO n1 FROM mtm_hw_private.hv_ca_rows(current_date - 3, current_date + 3);
  SELECT count(*) INTO n2 FROM mtm_hw_private.hv_ca_rows_real100(current_date - 3, current_date + 3);
  r := r || format('ca=%s/%s ', n1, n2);
  t1 := public.mtm_btvn_sheet_csv6('cahomnay'); t2 := public.mtm_btvn_sheet_csv6_real100('cahomnay');
  r := r || format('csv6=%s ', t1 = t2);
  a := to_jsonb(public.mtm_btvn_leaderboard_class('2K10', 'kiem-tra-thang', '2K10 9+'));
  b := to_jsonb(public.mtm_btvn_leaderboard_class_real100('2K10', 'kiem-tra-thang', '2K10 9+'));
  r := r || format('lop=%s ', a = b);
  SELECT count(*) INTO n1 FROM mtm_hw_private.students WHERE is_test;
  SELECT count(*) INTO n2 FROM pg_proc WHERE proname ~ '_real100$';
  r := r || format('hs_thu=%s clone=%s', n1, n2);
  RAISE EXCEPTION 'KIEM_IS_TEST %', r;
END
$check$;
COMMIT;
