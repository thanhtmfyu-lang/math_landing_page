-- 29/10/2026: CHỈ KIỂM, không ghi. Thi tháng 10 lớp 2K11 9+ tối nay 29/10: 2 bài thi mở 19:30–21:30, 2 bài BTVN mã còn lại mở 21:30,
--   đúng lớp 2K11 9+, đang active. Lệch thì dừng với mã lỗi để sửa trước ca (không sửa ở đây).
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $check$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT l.code, l.kind, l.active, l.opens_at, l.closes_at,
                  (SELECT array_agg(c.label ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)) labels
           FROM mtm_hw_private.btvn_lessons l WHERE l.code LIKE 'thi-thang-2026-10-2k11-9-%' LOOP
    n := n + 1;
    IF NOT r.active THEN RAISE EXCEPTION 'TT2K119_INACTIVE %', r.code; END IF;
    IF r.labels IS DISTINCT FROM ARRAY['2K11 9+'] THEN RAISE EXCEPTION 'TT2K119_CLASS % %', r.code, r.labels; END IF;
    IF r.code LIKE '%-thi-ma-%' AND (r.opens_at IS DISTINCT FROM timestamptz '2026-10-29 19:30+07' OR r.closes_at IS DISTINCT FROM timestamptz '2026-10-29 21:30+07') THEN
      RAISE EXCEPTION 'TT2K119_THI_GIO % % %', r.code, r.opens_at, r.closes_at; END IF;
    IF r.code LIKE '%-btvn-ma-%' AND r.opens_at IS DISTINCT FROM timestamptz '2026-10-29 21:30+07' THEN
      RAISE EXCEPTION 'TT2K119_BTVN_GIO % %', r.code, r.opens_at; END IF;
  END LOOP;
  IF n <> 4 THEN RAISE EXCEPTION 'TT2K119_COUNT %', n; END IF;
END
$check$;
COMMIT;
