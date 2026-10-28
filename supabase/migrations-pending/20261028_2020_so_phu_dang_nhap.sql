-- 28/10/2026 20:20: HS mới tạo hồ sơ tối nay (SĐT chính trống, SĐT mẹ + con chỉ có ở student_extra_phones qua phone_add)
-- nhập đúng số vẫn bị "Số điện thoại chưa khớp hồ sơ". Nguyên nhân: bước 1 mtm_btvn_forgot chỉ so student_phone/parent_phone,
-- nên không ra ứng viên → rơi sang nhánh tự thêm từ điểm danh / nhánh 18 (có thể trỏ hồ sơ khác hoặc không ra ai);
-- bước 2 (056) mới xét số phụ thì đã muộn. Sửa: số phụ đã xác nhận được tính là SĐT khớp ngay ở bước 1 (cùng mức tin như 056 khi tạo PIN).
-- Chỉ vá đúng biểu thức so SĐT trong danh sách ứng viên; chạy lại vô hại.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $migration$
DECLARE src text; fixed text;
BEGIN
  SELECT pg_get_functiondef('public.mtm_btvn_forgot(text,text,text)'::regprocedure) INTO src;
  IF position('student_extra_phones' IN src) > 0 THEN RETURN; END IF;
  fixed := replace(src,
    $a$and mtm_hw_private.btvn_phone2(p_phone) in (mtm_hw_private.btvn_phone2(s.student_phone),mtm_hw_private.btvn_phone2(s.parent_phone))$a$,
    $a$and (mtm_hw_private.btvn_phone2(p_phone) in (mtm_hw_private.btvn_phone2(s.student_phone),mtm_hw_private.btvn_phone2(s.parent_phone))
   or exists(select 1 from mtm_hw_private.student_extra_phones x where x.student_id=s.id and x.phone=mtm_hw_private.btvn_phone2(p_phone)))$a$);
  IF fixed = src THEN RAISE EXCEPTION 'SO_PHU_DANG_NHAP_PATCH_NOT_APPLIED'; END IF;
  EXECUTE fixed;
END
$migration$;
REVOKE ALL ON FUNCTION public.mtm_btvn_forgot(text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mtm_btvn_forgot(text,text,text) TO service_role;
COMMIT;
