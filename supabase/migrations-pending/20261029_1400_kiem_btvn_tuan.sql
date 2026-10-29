-- 29/10/2026: CHỈ KIỂM, không ghi. Luôn dừng bằng một dòng báo cáo (không tên HS, chỉ mã bài và số đếm):
--   A) bài các lớp 2K11 từ 26/10 (ngoài thi tháng): nhãn ngày, lớp gắn, active, đã mở, có chữ "giữa", số HS đã mở;
--   B) số HS đang học lớp "2K10 Thứ 3, 6" và số bài từ 26/10 gắn lớp đó.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $check$
DECLARE a text; b text;
BEGIN
  SELECT string_agg(format('%s[%s|%s|%s|mo=%s|gk=%s|hs=%s]', right(l.code, 8),
           (SELECT string_agg(e.key||':'||right(e.value,5), '+' ORDER BY e.key) FROM jsonb_each_text(l.material->'classDates') e),
           (SELECT string_agg(c.label, '+' ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)),
           CASE WHEN l.active THEN 'on' ELSE 'off' END, coalesce(l.opens_at <= now(), true),
           (l.material::text || coalesce(l.exam->>'title','')) ILIKE '%giữa%',
           (SELECT count(*) FROM mtm_hw_private.btvn_work w WHERE w.lesson_code = l.code)), ' ' ORDER BY l.code)
    INTO a
    FROM mtm_hw_private.btvn_lessons l
   WHERE l.code NOT LIKE 'thi-thang-%'
     AND EXISTS (SELECT 1 FROM jsonb_each_text(l.material->'classDates') e WHERE e.key LIKE '2K11%' AND e.value >= '2026-10-26');
  SELECT format('hs=%s bai=%s', (SELECT count(*) FROM mtm_hw_private.students s JOIN mtm_hw_private.classes c ON c.id = s.class_id WHERE c.label = '2K10 Thứ 3, 6'),
           (SELECT count(*) FROM mtm_hw_private.btvn_lessons l JOIN mtm_hw_private.classes c ON c.id = ANY(l.class_ids)
             WHERE c.label = '2K10 Thứ 3, 6' AND coalesce(l.material->'classDates'->>c.label, l.material->>'date', '') >= '2026-10-26'))
    INTO b;
  RAISE EXCEPTION 'KIEM_BTVN_TUAN B: % | A: %', b, coalesce(a, 'khong co');
END
$check$;
COMMIT;
