-- 29/10/2026 03:10: chuyển bản ghi điểm danh 28/10 của 1 em từ hồ sơ trùng (đã tạm dừng, lớp gốc 2K9 9+)
--   sang hồ sơ chính lớp 2K9 XPT, để Góc PH của hồ sơ chính hiện đúng buổi có mặt (chuyển ca 2K9 17:30).
-- Chỉ đổi student_id của đúng 1 dòng attendance + các dòng attendance_raw cùng ngày; giữ trạng thái, ghi chú, nguồn.
-- Sao lưu trước vào mtm_hw_private.merge_backup. Tự hủy nếu hồ sơ không khớp tên, số dòng khác 1, hoặc hồ sơ chính đã có dòng trùng khóa.
-- Chạy lại vô hại: nếu dòng đã nằm ở hồ sơ chính thì không làm gì.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  dup uuid; main_ uuid; n integer; lbl text;
  d date := date '2026-10-28';
BEGIN
  SELECT count(*), min(id::text)::uuid INTO n, dup FROM mtm_hw_private.students WHERE id::text LIKE '06821b66-%';
  IF n <> 1 THEN RAISE EXCEPTION 'DD_MOVE_DUP_NOT_FOUND'; END IF;
  SELECT count(*), min(id::text)::uuid INTO n, main_ FROM mtm_hw_private.students WHERE id::text LIKE '53e6a803-%';
  IF n <> 1 THEN RAISE EXCEPTION 'DD_MOVE_MAIN_NOT_FOUND'; END IF;
  IF (SELECT count(DISTINCT mtm_hw_private.vn_fold(full_name)) FROM mtm_hw_private.students WHERE id IN (dup, main_)) <> 1 THEN
    RAISE EXCEPTION 'DD_MOVE_NAME_MISMATCH';
  END IF;

  SELECT count(*), min(class_label) INTO n, lbl FROM mtm_hw_private.attendance WHERE student_id = dup AND session_date = d;
  IF n = 0 AND EXISTS (SELECT 1 FROM mtm_hw_private.attendance WHERE student_id = main_ AND session_date = d) THEN
    RAISE NOTICE 'DD_MOVE_ALREADY_MOVED'; RETURN;
  END IF;
  IF n <> 1 THEN RAISE EXCEPTION 'DD_MOVE_ROWCOUNT %', n; END IF;
  IF EXISTS (SELECT 1 FROM mtm_hw_private.attendance WHERE student_id = main_ AND session_date = d AND class_label = lbl) THEN
    RAISE EXCEPTION 'DD_MOVE_MAIN_HAS_ROW';
  END IF;

  INSERT INTO mtm_hw_private.merge_backup(kept, merged, kind, data)
  SELECT main_, dup, 'attendance', to_jsonb(a) FROM mtm_hw_private.attendance a WHERE a.student_id = dup AND a.session_date = d;
  INSERT INTO mtm_hw_private.merge_backup(kept, merged, kind, data)
  SELECT main_, dup, 'attendance_raw', to_jsonb(r) FROM mtm_hw_private.attendance_raw r WHERE r.student_id = dup AND r.session_date = d;

  UPDATE mtm_hw_private.attendance SET student_id = main_, updated_at = now()
  WHERE student_id = dup AND session_date = d AND class_label = lbl;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'DD_MOVE_UPDATE %', n; END IF;
  UPDATE mtm_hw_private.attendance_raw SET student_id = main_ WHERE student_id = dup AND session_date = d;
END
$migration$;
COMMIT;
