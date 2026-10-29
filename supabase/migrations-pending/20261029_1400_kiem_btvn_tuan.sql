-- 29/10/2026: CHỈ KIỂM, không ghi. Luôn dừng bằng một dòng báo cáo (không tên HS, chỉ mã bài và số đếm):
--   A) bài 2K11 8+ ngày 28/10: lớp gắn, active, đã mở chưa, số HS đã mở bài;
--   B) bài ngày 30/10 của các lớp 2K10: nhãn lớp trong material và lớp gắn thật.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $check$
DECLARE a text; b text;
BEGIN
  SELECT string_agg(format('%s[%s|act=%s|mo=%s|hs=%s]', right(l.code, 28),
           (SELECT string_agg(c.label, '+' ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)),
           l.active, coalesce(l.opens_at <= now(), true),
           (SELECT count(*) FROM mtm_hw_private.btvn_work w WHERE w.lesson_code = l.code)), ' ' ORDER BY l.code)
    INTO a
    FROM mtm_hw_private.btvn_lessons l
   WHERE l.material->'classDates'->>'2K11 8+' = '2026-10-28' AND l.code NOT LIKE 'thi-thang-%';
  SELECT string_agg(format('%s[nhan=%s|gan=%s|act=%s]', right(l.code, 28),
           (SELECT string_agg(k, '+' ORDER BY k) FROM jsonb_object_keys(l.material->'classDates') k),
           (SELECT string_agg(c.label, '+' ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)),
           l.active), ' ' ORDER BY l.code)
    INTO b
    FROM mtm_hw_private.btvn_lessons l
   WHERE EXISTS (SELECT 1 FROM jsonb_each_text(l.material->'classDates') e WHERE e.key LIKE '2K10%' AND e.value = '2026-10-30');
  RAISE EXCEPTION 'KIEM_BTVN_TUAN A: % | B: %', coalesce(a, 'khong co'), coalesce(b, 'khong co');
END
$check$;
COMMIT;
