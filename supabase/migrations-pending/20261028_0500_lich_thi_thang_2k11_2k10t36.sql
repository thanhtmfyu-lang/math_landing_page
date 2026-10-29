-- 28/10/2026: sửa giờ mở 8 bài thi tháng 10 cho khớp lịch thi anh Thành đã duyệt và gửi HS (tin đính chính 26/10 19:39):
--   2K11 9+ thi thứ Tư 28/10 19:30–21:30; 2K11 8+ thi thứ Năm 29/10 19:30–21:30 (20261027_1730 đặt ngược hai lớp).
--   2K10 Thứ 3, 6 thi CÙNG CA 2K10 9+ thứ Ba 27/10 19:30–21:30 (payload cũ đặt 30/10, HS online tối 27/10 không thấy bài).
-- Chỉ đổi opens_at/closes_at và material.date (ngày hiện trên thẻ bài); tự hủy nếu số dòng khác 12, lịch sau cập nhật lệch, hoặc cột khác bị đổi.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  target_codes constant text[] := ARRAY[
    'thi-thang-2026-10-2k11-9-thi-ma-1',
    'thi-thang-2026-10-2k11-9-thi-ma-2',
    'thi-thang-2026-10-2k11-9-btvn-ma-1',
    'thi-thang-2026-10-2k11-9-btvn-ma-2',
    'thi-thang-2026-10-2k11-8-thi-ma-1',
    'thi-thang-2026-10-2k11-8-thi-ma-2',
    'thi-thang-2026-10-2k11-8-btvn-ma-1',
    'thi-thang-2026-10-2k11-8-btvn-ma-2',
    'thi-thang-2026-10-2k10-thu-3-6-thi-ma-1',
    'thi-thang-2026-10-2k10-thu-3-6-thi-ma-2',
    'thi-thang-2026-10-2k10-thu-3-6-btvn-ma-1',
    'thi-thang-2026-10-2k10-thu-3-6-btvn-ma-2'
  ];
  affected integer;
  target_schedule jsonb;
  before_other_columns jsonb;
  after_other_columns jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(target)) INTO target_schedule
  FROM (VALUES
      ('thi-thang-2026-10-2k11-9-thi-ma-1', 'kiem-tra-thang', '2026-10-28T19:30:00+07:00'::timestamptz, '2026-10-28T21:30:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-9-thi-ma-2', 'kiem-tra-thang', '2026-10-28T19:30:00+07:00'::timestamptz, '2026-10-28T21:30:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-9-btvn-ma-1', 'btvn', '2026-10-28T21:30:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-9-btvn-ma-2', 'btvn', '2026-10-28T21:30:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-8-thi-ma-1', 'kiem-tra-thang', '2026-10-29T19:30:00+07:00'::timestamptz, '2026-10-29T21:30:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-8-thi-ma-2', 'kiem-tra-thang', '2026-10-29T19:30:00+07:00'::timestamptz, '2026-10-29T21:30:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-8-btvn-ma-1', 'btvn', '2026-10-29T21:30:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-8-btvn-ma-2', 'btvn', '2026-10-29T21:30:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k10-thu-3-6-thi-ma-1', 'kiem-tra-thang', '2026-10-27T19:30:00+07:00'::timestamptz, '2026-10-27T21:30:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k10-thu-3-6-thi-ma-2', 'kiem-tra-thang', '2026-10-27T19:30:00+07:00'::timestamptz, '2026-10-27T21:30:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k10-thu-3-6-btvn-ma-1', 'btvn', '2026-10-27T21:30:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k10-thu-3-6-btvn-ma-2', 'btvn', '2026-10-27T21:30:00+07:00'::timestamptz, NULL::timestamptz)
  ) AS target(code, kind, opens_at, closes_at);

  PERFORM 1 FROM mtm_hw_private.btvn_lessons
  WHERE code = ANY(target_codes) ORDER BY code FOR UPDATE;

  SELECT jsonb_object_agg(code, (to_jsonb(l) - ARRAY['opens_at', 'closes_at', 'material']) || jsonb_build_object('material_rest', l.material - 'date'))
  INTO before_other_columns FROM mtm_hw_private.btvn_lessons l
  WHERE code = ANY(target_codes);

  UPDATE mtm_hw_private.btvn_lessons AS l
  SET opens_at = target.opens_at, closes_at = target.closes_at,
      material = CASE WHEN l.material ? 'date'
        THEN jsonb_set(l.material, '{date}', to_jsonb(to_char(target.opens_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')))
        ELSE l.material END
  FROM jsonb_to_recordset(target_schedule)
       AS target(code text, kind text, opens_at timestamptz, closes_at timestamptz)
  WHERE l.code = target.code AND l.kind = target.kind;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 12 THEN
    RAISE EXCEPTION 'LICH_THI_THANG_ROW_COUNT: expected 12, got %', affected;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(target_schedule)
      AS target(code text, kind text, opens_at timestamptz, closes_at timestamptz)
    JOIN mtm_hw_private.btvn_lessons l ON l.code = target.code
    WHERE l.opens_at IS DISTINCT FROM target.opens_at
       OR l.closes_at IS DISTINCT FROM target.closes_at
  ) THEN
    RAISE EXCEPTION 'LICH_THI_THANG_FINAL_SCHEDULE_MISMATCH';
  END IF;

  SELECT jsonb_object_agg(code, (to_jsonb(l) - ARRAY['opens_at', 'closes_at', 'material']) || jsonb_build_object('material_rest', l.material - 'date'))
  INTO after_other_columns FROM mtm_hw_private.btvn_lessons l
  WHERE code = ANY(target_codes);
  IF before_other_columns IS DISTINCT FROM after_other_columns THEN
    RAISE EXCEPTION 'LICH_THI_THANG_UNEXPECTED_COLUMN_CHANGE';
  END IF;
END
$migration$;

COMMIT;
