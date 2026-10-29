-- 29/10/2026: anh Thành 29/10 02:32 chốt bài "Bất phương trình bậc nhất hai ẩn" của lớp 2K11 XPT (giao buổi 21/10, đăng muộn)
--   "bảo học sinh sẽ nộp trước thứ 7" -> hạn 13:00 Thứ 7 31/10 (30 phút trước buổi 13:30).
-- Không có hạn riêng theo bài, nên gắn bài của lớp này vào buổi Thứ 7 24/10 (material.classDates["2K11 XPT"]):
--   luật same_weekday_next_week của lớp cho đúng 31/10 13:00, lần đồng bộ hạn sau giữ nguyên.
-- Đồng thời ghi luôn hạn mới vào btvn_work của bài này (chưa đổi bài nộp, điểm, receipts).
-- Không đổi đề, đáp án, giờ mở, lớp khác. Tự hủy nếu không khớp đúng 1 bài, hạn tính ra khác 31/10 13:00, hoặc cột khác bị đổi.
-- Chạy lại vô hại.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  lbl constant text := '2K11 XPT';
  want constant timestamptz := timestamptz '2026-10-31 13:00:00+07';
  code_ text; n integer; cur text; planned timestamptz; before_other jsonb; after_other jsonb;
BEGIN
  SELECT count(*), min(l.code) INTO n, code_
  FROM mtm_hw_private.btvn_lessons l
  WHERE l.kind = 'btvn'
    AND EXISTS (SELECT 1 FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids) AND c.label = lbl AND c.active)
    AND mtm_hw_private.vn_fold(l.material->>'title') LIKE '%bat phuong trinh bac nhat%'
    AND coalesce(l.material->'classDates'->>lbl, l.material->>'date') IN ('2026-10-28', '2026-10-24');
  IF n <> 1 THEN RAISE EXCEPTION 'HAN_2K11XPT_LESSON_COUNT %', n; END IF;

  PERFORM 1 FROM mtm_hw_private.btvn_lessons WHERE code = code_ FOR UPDATE;
  SELECT coalesce(material->'classDates'->>lbl, material->>'date') INTO cur FROM mtm_hw_private.btvn_lessons WHERE code = code_;

  planned := mtm_hw_private.btvn_planned_due(lbl, date '2026-10-24');
  IF planned IS DISTINCT FROM want THEN RAISE EXCEPTION 'HAN_2K11XPT_PLANNED %', planned; END IF;

  IF cur <> '2026-10-24' THEN
    SELECT to_jsonb(l) - 'material' || jsonb_build_object('m', l.material - 'classDates', 'cd', (l.material->'classDates') - lbl)
      INTO before_other FROM mtm_hw_private.btvn_lessons l WHERE code = code_;
    UPDATE mtm_hw_private.btvn_lessons
      SET material = jsonb_set(material, '{classDates}', coalesce(material->'classDates', '{}'::jsonb) || jsonb_build_object(lbl, '2026-10-24'))
      WHERE code = code_;
    SELECT to_jsonb(l) - 'material' || jsonb_build_object('m', l.material - 'classDates', 'cd', (l.material->'classDates') - lbl)
      INTO after_other FROM mtm_hw_private.btvn_lessons l WHERE code = code_;
    IF before_other IS DISTINCT FROM after_other THEN RAISE EXCEPTION 'HAN_2K11XPT_OTHER_CHANGED'; END IF;
  END IF;

  UPDATE mtm_hw_private.btvn_work w
    SET expected_due_at = want, next_actual_class_at = want
  FROM mtm_hw_private.students s JOIN mtm_hw_private.classes c ON c.id = s.class_id
  WHERE w.lesson_code = code_ AND w.student_id = s.id AND c.label = lbl
    AND (w.expected_due_at IS DISTINCT FROM want OR w.next_actual_class_at IS DISTINCT FROM want);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'HAN_2K11XPT ok: % dong btvn_work doi han', n;
END
$migration$;
COMMIT;
