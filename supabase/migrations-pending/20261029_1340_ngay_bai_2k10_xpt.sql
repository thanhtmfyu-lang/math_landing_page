-- 29/10/2026: bài "Đề lượng giác số 2" lớp 2K10 XPT gắn ngày 27/10 (không có ca 2K10 XPT ngày này) nên không tính được hạn nộp.
--   Ca thật theo lịch: Thứ 2 26/10. Gắn bài của lớp này vào 26/10 (material.classDates["2K10 XPT"]); luật lớp
--   same_weekday_next_week cho hạn Thứ 2 02/11 (giờ vào ca − 30 phút). Ghi luôn hạn vào btvn_work của bài (giữ bài nháp, bài nộp, điểm).
-- Không đổi đề, đáp án, giờ mở, lớp khác. Tự hủy nếu không khớp đúng 1 bài, hạn tính ra không phải ngày 02/11, hoặc cột khác bị đổi.
-- Chạy lại vô hại.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  lbl constant text := '2K10 XPT';
  code_ text; n integer; cur text; planned timestamptz; before_other jsonb; after_other jsonb;
BEGIN
  SELECT count(*), min(l.code) INTO n, code_
  FROM mtm_hw_private.btvn_lessons l
  WHERE l.kind = 'btvn' AND l.active
    AND EXISTS (SELECT 1 FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids) AND c.label = lbl AND c.active)
    AND (mtm_hw_private.vn_fold(coalesce(l.material->>'title','')) LIKE '%luong giac%2%'
      OR mtm_hw_private.vn_fold(coalesce(l.material->>'homeworkTitle','')) LIKE '%luong giac%2%'
      OR mtm_hw_private.vn_fold(coalesce(l.exam->>'title','')) LIKE '%luong giac%2%')
    AND coalesce(l.material->'classDates'->>lbl, l.material->>'date') IN ('2026-10-27', '2026-10-26');
  IF n <> 1 THEN RAISE EXCEPTION 'NGAY_2K10XPT_LESSON_COUNT %', n; END IF;

  planned := mtm_hw_private.btvn_planned_due(lbl, date '2026-10-26');
  IF planned IS NULL OR (planned AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <> date '2026-11-02' THEN
    RAISE EXCEPTION 'NGAY_2K10XPT_PLANNED %', planned; END IF;

  PERFORM 1 FROM mtm_hw_private.btvn_lessons WHERE code = code_ FOR UPDATE;
  SELECT coalesce(material->'classDates'->>lbl, material->>'date') INTO cur FROM mtm_hw_private.btvn_lessons WHERE code = code_;
  IF cur <> '2026-10-26' THEN
    SELECT to_jsonb(l) - 'material' || jsonb_build_object('m', l.material - 'classDates', 'cd', coalesce(l.material->'classDates','{}'::jsonb) - lbl)
      INTO before_other FROM mtm_hw_private.btvn_lessons l WHERE code = code_;
    UPDATE mtm_hw_private.btvn_lessons
      SET material = jsonb_set(material, '{classDates}', coalesce(material->'classDates', '{}'::jsonb) || jsonb_build_object(lbl, '2026-10-26'))
      WHERE code = code_;
    SELECT to_jsonb(l) - 'material' || jsonb_build_object('m', l.material - 'classDates', 'cd', coalesce(l.material->'classDates','{}'::jsonb) - lbl)
      INTO after_other FROM mtm_hw_private.btvn_lessons l WHERE code = code_;
    IF before_other IS DISTINCT FROM after_other THEN RAISE EXCEPTION 'NGAY_2K10XPT_OTHER_CHANGED'; END IF;
  END IF;

  UPDATE mtm_hw_private.btvn_work w
    SET expected_due_at = planned, next_actual_class_at = planned
  FROM mtm_hw_private.students s JOIN mtm_hw_private.classes c ON c.id = s.class_id
  WHERE w.lesson_code = code_ AND w.student_id = s.id AND c.label = lbl
    AND (w.expected_due_at IS DISTINCT FROM planned OR w.next_actual_class_at IS DISTINCT FROM planned);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'NGAY_2K10XPT ok: han %, % dong btvn_work doi han', planned, n;
END
$migration$;
COMMIT;
