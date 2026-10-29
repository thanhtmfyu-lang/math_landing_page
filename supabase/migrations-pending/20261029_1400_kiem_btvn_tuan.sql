-- 29/10/2026: CHỈ KIỂM, không ghi. Luôn dừng bằng một dòng báo cáo (không tên HS, chỉ mã bài và số đếm):
--   A) bài 2K11 8+ ngày 28/10: lớp gắn, active, đã mở chưa, số HS đã mở bài;
--   B) bài ngày 30/10 của các lớp 2K10: nhãn lớp trong material và lớp gắn thật.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $check$
DECLARE a text; b text;
BEGIN
  SELECT string_agg(format('%s[%s|ngay=%s|act=%s|mo=%s|hs=%s]', right(l.code, 12),
           (SELECT string_agg(c.label, '+' ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)),
           coalesce(l.material->'classDates'->>'2K11 8+', l.material->>'date'), l.active, coalesce(l.opens_at <= now(), true),
           (SELECT count(*) FROM mtm_hw_private.btvn_work w WHERE w.lesson_code = l.code)), ' ' ORDER BY l.code)
    INTO a
    FROM mtm_hw_private.btvn_lessons l
   WHERE l.code NOT LIKE 'thi-thang-%' AND coalesce(l.material->'classDates'->>'2K11 8+', l.material->>'date', '') >= '2026-10-26'
     AND EXISTS (SELECT 1 FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids) AND c.label = '2K11 8+');
  SELECT string_agg(format('%s[nhan=%s|gan=%s|act=%s]', right(l.code, 12),
           (SELECT string_agg(e.key||':'||right(e.value,5), '+' ORDER BY e.key) FROM jsonb_each_text(l.material->'classDates') e),
           (SELECT string_agg(c.label, '+' ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)),
           l.active), ' ' ORDER BY l.code)
    INTO b
    FROM mtm_hw_private.btvn_lessons l
   WHERE l.code NOT LIKE 'thi-thang-%'
     AND EXISTS (SELECT 1 FROM jsonb_each_text(l.material->'classDates') e WHERE e.key LIKE '2K10%' AND e.value >= '2026-10-26');
  RAISE EXCEPTION 'KIEM_BTVN_TUAN A: % | B: %', coalesce(a, 'khong co'), coalesce(b, 'khong co');
END
$check$;
COMMIT;
