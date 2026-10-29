-- 29/10/2026: CHỈ KIỂM, không ghi. Luôn dừng bằng một dòng báo cáo (không tên HS, chỉ mã bài và số đếm):
--   A) 4 mã thi tháng 2K11 8+: lớp gắn, active, giờ mở, số HS đã mở;
--   B) các bài từ 26/10 gắn lớp "2K10 Thứ 3, 6": nhãn ngày và lớp gắn.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $check$
DECLARE a text; b text;
BEGIN
  SELECT string_agg(format('%s[%s|%s|mo=%s|hs=%s]', right(l.code, 10),
           (SELECT string_agg(c.label, '+' ORDER BY c.label) FROM mtm_hw_private.classes c WHERE c.id = ANY(l.class_ids)),
           CASE WHEN l.active THEN 'on' ELSE 'off' END, to_char(l.opens_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
           (SELECT count(*) FROM mtm_hw_private.btvn_work w WHERE w.lesson_code = l.code)), ' ' ORDER BY l.code)
    INTO a
    FROM mtm_hw_private.btvn_lessons l WHERE l.code LIKE 'thi-thang-2026-10-2k11-8-%';
  SELECT string_agg(format('%s[%s|%s]', right(l.code, 8),
           (SELECT string_agg(e.key||':'||right(e.value,5), '+' ORDER BY e.key) FROM jsonb_each_text(l.material->'classDates') e),
           (SELECT string_agg(c2.label, '+' ORDER BY c2.label) FROM mtm_hw_private.classes c2 WHERE c2.id = ANY(l.class_ids))), ' ' ORDER BY l.code)
    INTO b
    FROM mtm_hw_private.btvn_lessons l JOIN mtm_hw_private.classes c ON c.id = ANY(l.class_ids)
   WHERE c.label = '2K10 Thứ 3, 6' AND coalesce(l.material->'classDates'->>c.label, l.material->>'date', '') >= '2026-10-26';
  RAISE EXCEPTION 'KIEM_BTVN_TUAN A: % | B: %', coalesce(a, 'khong co'), coalesce(b, 'khong co');
END
$check$;
COMMIT;
