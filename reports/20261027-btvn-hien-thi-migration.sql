-- MAU BAN GIAO, KHONG AP DUNG. Khong nam trong migrations-pending.
-- Owner doc lai sau 22:30 +07 27/10/2026; ghep vao luot migration da co.
-- Khong tao lich, khong sua 8 bai thi/BTVN thuoc dot thi toi nay.
-- Code hien thi khong thay doi due_at, cham muon, pham vi hay quyen lam bai.
-- Doan CHAY DUOC duoi day CHI SELECT va ROLLBACK, khong tra du lieu HS.
BEGIN READ ONLY;

-- 1. Dung cot thuc te: exam.title -> homeworkTitle; material.title la ten buoi.
-- Khong co cot lesson_name/title tren btvn_lessons trong schema da kiem.
SELECT c.label AS class_code, q.code, q.source_version,
       coalesce(q.material->'classDates'->>c.label,q.material->>'date') AS lesson_date,
       q.material->>'title' AS lesson_title, q.exam->>'title' AS exam_title,
       q.material->>'homeworkScope' AS homework_scope
FROM mtm_hw_private.btvn_lessons q
JOIN mtm_hw_private.classes c ON c.id=ANY(q.class_ids)
WHERE q.active AND q.kind='btvn' AND q.code NOT LIKE 'thi-thang-%'
  AND (q.exam->>'title' ~* '\[L[0-9]+\]|\.pdf'
       OR (c.label='2K10 9+' AND coalesce(q.material->'classDates'->>c.label,q.material->>'date') IN ('2026-10-09','2026-10-25','2026-10-27')))
ORDER BY c.label,lesson_date,q.code;

-- 2. Legacy assignments.due_at chi ghep khi dung class + exam identity + version.
-- Khong noi theo title/filename/date don le, khong chon MAX(due_at) tuy tien.
-- Kiem cardinality=1 va lich thuc hoc da doi soat L45 truoc dung gia tri.
SELECT c.label AS class_code, q.code, q.source_version,
       a.id AS assignment_id, a.version_hash, a.due_at
FROM mtm_hw_private.btvn_lessons q
JOIN mtm_hw_private.classes c ON c.id=ANY(q.class_ids)
LEFT JOIN mtm_hw_private.assignments a
  ON a.class_id=c.id AND a.exam->>'id'=q.exam->>'id'
     AND a.version_hash=q.exam->>'versionHash' AND a.visible
WHERE q.active AND q.kind='btvn' AND q.code NOT LIKE 'thi-thang-%'
  AND c.label='2K10 9+'
  AND q.code='btvn-5096431031b527b6d8370147d5d5fb86f609151f-v-88aa45310c6f81ff2846ba56609ad9e6b3724692';

-- 3. Khac ma nhung cung ngay/ten: chi liet ke ung vien; khong tu an.
-- Equal exam payload la bang chung manh hon URL PDF, nhung owner van phai
-- kiem source_version, pham vi, rubric, lich, tham chieu bai nop truoc gop.
SELECT c.label AS class_code, a.code AS code_a, b.code AS code_b,
       a.source_version AS version_a, b.source_version AS version_b,
       a.exam->>'title' AS title_a, b.exam->>'title' AS title_b,
       (a.exam-ARRAY['id','title'])=(b.exam-ARRAY['id','title']) AS same_exam_payload,
       (a.material->'homeworkScope') IS NOT DISTINCT FROM (b.material->'homeworkScope') AS same_scope
FROM mtm_hw_private.btvn_lessons a
JOIN mtm_hw_private.btvn_lessons b ON a.code<b.code AND a.class_ids && b.class_ids
JOIN mtm_hw_private.classes c ON c.id=ANY(a.class_ids) AND c.id=ANY(b.class_ids)
WHERE a.active AND b.active AND a.kind='btvn' AND b.kind='btvn'
  AND a.code NOT LIKE 'thi-thang-%' AND b.code NOT LIKE 'thi-thang-%'
  AND coalesce(a.material->'classDates'->>c.label,a.material->>'date')=coalesce(b.material->'classDates'->>c.label,b.material->>'date')
  AND a.exam->>'title'=b.exam->>'title'
ORDER BY c.label,a.code,b.code;
ROLLBACK;

/* PSEUDOCODE migration sau khi owner doc nguon hien hanh, KHONG CHAY:
   - Ngay 25/10: pin code/source_version + full before payload. Neu
     material.title co ten bai da xac minh, chi doi exam.title sang ten do;
     neu title cung la ten tep/generic, lay ten tu nguon, khong tu sang tac.
   - Ngay 09/10: class 2K10 9+, code chinh xac o SELECT (2). Lay assignment
     due_at neu ghep duy nhat va dung nguon; neu khong, doi soat ca ke tiep
     qua L45 (doi lich/chuyen ca/co phep/QL), han = gio vao ca da xac minh
     theo lenh Thanh luot nay. Khong tu dung plannedDueAt (luat cu -30 phut).
     Adapter mtm_btvn_read can dua han that ra dueAt cho ca CHUA co btvn_work,
     khong phu thuoc HS bat dau lam. Khong auto-tao work de hien thi deadline.
     Khong suy tu expectedDueAt, snapshot lich cu hay ca CN/T6 chua phan xu.
   - Ngay 27/10: pin ma thuc te trong SELECT (3). Cung noi dung/pham vi thi
     chon mot canonical co lich su bai nop, giu cac tham chieu cu; khac bai
     thi dat ten theo noi dung nguon. Thieu bang chung thi giu ca hai.
   - Khong doi 8 slug thi-thang-2026-10-2k10-* trong dot nay. Khong DELETE
     lesson/work/receipts; khong gan hoc sinh/tai khoan that vao fixture.
   - Rowcount/exact before guard; readback sau COMMIT chi do owner co quyen
     thuc hien sau 22:30. Tap nay chua co UPDATE va chua duoc ap o dau.
*/
