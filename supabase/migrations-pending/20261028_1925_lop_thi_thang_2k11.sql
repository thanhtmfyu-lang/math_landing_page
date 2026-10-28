-- 28/10/2026 19:21 anh Thành chốt và duyệt sửa trong giờ học: "Tối nay lớp 8+ thi, tối mai mới 9+".
--   2K11 8+ thi thứ Tư 28/10 19:30–21:30 (BTVN mã còn lại mở 21:30 28/10);
--   2K11 9+ thi thứ Năm 29/10 19:30–21:30 (BTVN mở 21:30 29/10). 20261028_0500 đặt ngược hai lớp.
-- Đổi lịch cột (opens_at/closes_at), class_ids và material.classNames/classDates/classOpensAt/date;
-- không đổi đề, đáp án, assets, verification.
-- Chạy lại vô hại (idempotent); tự hủy nếu thiếu lớp, số dòng khác 8, hoặc cột khác bị đổi.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  target jsonb := '[
    {"code":"thi-thang-2026-10-2k11-9-thi-ma-1","label":"2K11 9+","date":"2026-10-29"},
    {"code":"thi-thang-2026-10-2k11-9-thi-ma-2","label":"2K11 9+","date":"2026-10-29"},
    {"code":"thi-thang-2026-10-2k11-9-btvn-ma-1","label":"2K11 9+","date":"2026-10-29"},
    {"code":"thi-thang-2026-10-2k11-9-btvn-ma-2","label":"2K11 9+","date":"2026-10-29"},
    {"code":"thi-thang-2026-10-2k11-8-thi-ma-1","label":"2K11 8+","date":"2026-10-28"},
    {"code":"thi-thang-2026-10-2k11-8-thi-ma-2","label":"2K11 8+","date":"2026-10-28"},
    {"code":"thi-thang-2026-10-2k11-8-btvn-ma-1","label":"2K11 8+","date":"2026-10-28"},
    {"code":"thi-thang-2026-10-2k11-8-btvn-ma-2","label":"2K11 8+","date":"2026-10-28"}
  ]'::jsonb;
  codes text[];
  affected integer;
  before_other jsonb;
  after_other jsonb;
BEGIN
  SELECT array_agg(t->>'code') INTO codes FROM jsonb_array_elements(target) t;

  PERFORM 1 FROM mtm_hw_private.btvn_lessons WHERE code = ANY(codes) ORDER BY code FOR UPDATE;

  -- Mỗi nhãn phải khớp đúng 1 lớp đang hoạt động của cùng chủ bài.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(target) t
    JOIN mtm_hw_private.btvn_lessons l ON l.code = t->>'code'
    WHERE (SELECT count(*) FROM mtm_hw_private.classes c
           WHERE c.label = t->>'label' AND c.active AND c.owner_id = l.owner_id) <> 1
  ) THEN
    RAISE EXCEPTION 'LOP_THI_THANG_CLASS_AMBIGUOUS';
  END IF;

  SELECT jsonb_object_agg(code, (to_jsonb(l) - ARRAY['class_ids', 'material', 'opens_at', 'closes_at'])
           || jsonb_build_object('material_rest', l.material - ARRAY['classNames', 'classDates', 'classOpensAt', 'date']))
  INTO before_other FROM mtm_hw_private.btvn_lessons l WHERE code = ANY(codes);

  UPDATE mtm_hw_private.btvn_lessons AS l
  SET opens_at = CASE WHEN l.kind = 'kiem-tra-thang'
                   THEN ((t->>'date')::date + time '19:30') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                   ELSE ((t->>'date')::date + time '21:30') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
      closes_at = CASE WHEN l.kind = 'kiem-tra-thang'
                   THEN ((t->>'date')::date + time '21:30') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                   ELSE NULL END,
      class_ids = ARRAY[(SELECT c.id FROM mtm_hw_private.classes c
                         WHERE c.label = t->>'label' AND c.active AND c.owner_id = l.owner_id)],
      material = (l.material - 'classOpensAt')
        || jsonb_build_object('classNames', jsonb_build_array(t->>'label'),
                              'classDates', jsonb_build_object(t->>'label', t->>'date'),
                              'date', t->>'date')
  FROM jsonb_array_elements(target) t
  WHERE l.code = t->>'code' AND l.kind IN ('kiem-tra-thang', 'btvn');

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 8 THEN
    RAISE EXCEPTION 'LOP_THI_THANG_ROW_COUNT: expected 8, got %', affected;
  END IF;

  SELECT jsonb_object_agg(code, (to_jsonb(l) - ARRAY['class_ids', 'material', 'opens_at', 'closes_at'])
           || jsonb_build_object('material_rest', l.material - ARRAY['classNames', 'classDates', 'classOpensAt', 'date']))
  INTO after_other FROM mtm_hw_private.btvn_lessons l WHERE code = ANY(codes);
  IF before_other IS DISTINCT FROM after_other THEN
    RAISE EXCEPTION 'LOP_THI_THANG_UNEXPECTED_COLUMN_CHANGE';
  END IF;

  -- Kiểm giờ mở BTVN sau sửa: 9+ đúng 21:30 28/10, 8+ đúng 21:30 29/10.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(target) t
    JOIN mtm_hw_private.btvn_lessons l ON l.code = t->>'code'
    WHERE l.kind = 'btvn'
      AND mtm_hw_private.btvn_opens_at(l.material, t->>'label')
          IS DISTINCT FROM ((t->>'date')::date + time '21:30') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ) THEN
    RAISE EXCEPTION 'LOP_THI_THANG_BTVN_OPEN_MISMATCH';
  END IF;
END
$migration$;

COMMIT;
