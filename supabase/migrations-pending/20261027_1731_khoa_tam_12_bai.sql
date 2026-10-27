-- DỰ PHÒNG: chỉ dispatch riêng nếu migration 1730 lỗi; không chạy cả hai.
-- Chỉ dời cột lịch; không sửa material/classOpensAt hay quy tắc mở BTVN.
-- Bài thi giữ cửa sổ 120 phút để không vi phạm monthly_window.
-- Schema: 005 btvn_lessons.code; 006 publication fields; 013 kind/opens_at/closes_at.
-- Không đổi đề, đáp án, assets, source_version, material, active hoặc updated_at.
-- Giữ nguyên trigger hiện hữu; không ALTER/DISABLE trigger hay session_replication_role.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  target_codes constant text[] := ARRAY[
    'thi-thang-2026-10-2k10-8-thi-ma-1',
    'thi-thang-2026-10-2k10-8-thi-ma-2',
    'thi-thang-2026-10-2k10-8-btvn-ma-1',
    'thi-thang-2026-10-2k10-8-btvn-ma-2',
    'thi-thang-2026-10-2k11-8-thi-ma-1',
    'thi-thang-2026-10-2k11-8-thi-ma-2',
    'thi-thang-2026-10-2k11-8-btvn-ma-1',
    'thi-thang-2026-10-2k11-8-btvn-ma-2',
    'thi-thang-2026-10-2k11-9-thi-ma-1',
    'thi-thang-2026-10-2k11-9-thi-ma-2',
    'thi-thang-2026-10-2k11-9-btvn-ma-1',
    'thi-thang-2026-10-2k11-9-btvn-ma-2'
  ];
  affected integer;
  target_schedule jsonb;
  before_other_columns jsonb;
  after_other_columns jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(target)) INTO target_schedule
  FROM (VALUES
      ('thi-thang-2026-10-2k10-8-thi-ma-1', 'kiem-tra-thang', '2026-12-31T00:00:00+07:00'::timestamptz, '2026-12-31T02:00:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k10-8-thi-ma-2', 'kiem-tra-thang', '2026-12-31T00:00:00+07:00'::timestamptz, '2026-12-31T02:00:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k10-8-btvn-ma-1', 'btvn', '2026-12-31T00:00:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k10-8-btvn-ma-2', 'btvn', '2026-12-31T00:00:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-8-thi-ma-1', 'kiem-tra-thang', '2026-12-31T00:00:00+07:00'::timestamptz, '2026-12-31T02:00:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-8-thi-ma-2', 'kiem-tra-thang', '2026-12-31T00:00:00+07:00'::timestamptz, '2026-12-31T02:00:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-8-btvn-ma-1', 'btvn', '2026-12-31T00:00:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-8-btvn-ma-2', 'btvn', '2026-12-31T00:00:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-9-thi-ma-1', 'kiem-tra-thang', '2026-12-31T00:00:00+07:00'::timestamptz, '2026-12-31T02:00:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-9-thi-ma-2', 'kiem-tra-thang', '2026-12-31T00:00:00+07:00'::timestamptz, '2026-12-31T02:00:00+07:00'::timestamptz),
      ('thi-thang-2026-10-2k11-9-btvn-ma-1', 'btvn', '2026-12-31T00:00:00+07:00'::timestamptz, NULL::timestamptz),
      ('thi-thang-2026-10-2k11-9-btvn-ma-2', 'btvn', '2026-12-31T00:00:00+07:00'::timestamptz, NULL::timestamptz)
  ) AS target(code, kind, opens_at, closes_at);

  -- Khóa đúng các mã đích theo thứ tự cố định, giữ đến COMMIT/ROLLBACK.
  PERFORM 1 FROM mtm_hw_private.btvn_lessons
  WHERE code = ANY(target_codes) ORDER BY code FOR UPDATE;

  SELECT jsonb_object_agg(code, to_jsonb(l) - ARRAY['opens_at', 'closes_at'])
  INTO before_other_columns FROM mtm_hw_private.btvn_lessons l
  WHERE code = ANY(target_codes);

  UPDATE mtm_hw_private.btvn_lessons AS l
  SET opens_at = target.opens_at, closes_at = target.closes_at
  FROM jsonb_to_recordset(target_schedule)
       AS target(code text, kind text, opens_at timestamptz, closes_at timestamptz)
  WHERE l.code = target.code AND l.kind = target.kind;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 12 THEN
    RAISE EXCEPTION 'KHOA_TAM_12_BAI_ROW_COUNT: expected 12, got %', affected;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(target_schedule)
      AS target(code text, kind text, opens_at timestamptz, closes_at timestamptz)
    JOIN mtm_hw_private.btvn_lessons l ON l.code = target.code
    WHERE l.opens_at IS DISTINCT FROM target.opens_at
       OR l.closes_at IS DISTINCT FROM target.closes_at
  ) THEN
    RAISE EXCEPTION 'KHOA_TAM_12_BAI_FINAL_SCHEDULE_MISMATCH';
  END IF;

  SELECT jsonb_object_agg(code, to_jsonb(l) - ARRAY['opens_at', 'closes_at'])
  INTO after_other_columns FROM mtm_hw_private.btvn_lessons l
  WHERE code = ANY(target_codes);
  IF before_other_columns IS DISTINCT FROM after_other_columns THEN
    RAISE EXCEPTION 'KHOA_TAM_12_BAI_UNEXPECTED_COLUMN_CHANGE';
  END IF;
END
$migration$;

COMMIT;

-- Kiểm sau COMMIT: đủ 12 mã và lịch giờ Việt Nam; không trả nội dung đề/HS.
SELECT code, kind,
       opens_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS opens_at_vn,
       closes_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS closes_at_vn
FROM mtm_hw_private.btvn_lessons
WHERE code IN (
    'thi-thang-2026-10-2k10-8-thi-ma-1',
    'thi-thang-2026-10-2k10-8-thi-ma-2',
    'thi-thang-2026-10-2k10-8-btvn-ma-1',
    'thi-thang-2026-10-2k10-8-btvn-ma-2',
    'thi-thang-2026-10-2k11-8-thi-ma-1',
    'thi-thang-2026-10-2k11-8-thi-ma-2',
    'thi-thang-2026-10-2k11-8-btvn-ma-1',
    'thi-thang-2026-10-2k11-8-btvn-ma-2',
    'thi-thang-2026-10-2k11-9-thi-ma-1',
    'thi-thang-2026-10-2k11-9-thi-ma-2',
    'thi-thang-2026-10-2k11-9-btvn-ma-1',
    'thi-thang-2026-10-2k11-9-btvn-ma-2'
)
ORDER BY code;
