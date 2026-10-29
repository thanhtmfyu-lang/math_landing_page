-- 29/10/2026: luật hạn BTVN anh Thành 28/10 22:44 — "bài giao ở ca thứ X của lớp/thầy nào thì hạn là ca thứ X tuần sau
--   của chính lớp/thầy đó". Đổi luật mặc định trong mtm_hw_private.btvn_planned_due cho 3 lớp còn khác luật này:
--   * 2K9 9+, 2K9 8+: bỏ "pair_next" (hạn buổi cặp kế tiếp) → map cùng thứ tuần sau của chính lớp
--     (ngày bài ghi theo ngày cặp vẫn ra thứ của lớp mình: 8+ ghi T2 → hạn T3 tuần sau).
--   * 2K9 XPT: T2→T2 (giữ), T3→T3 tuần sau (cũ T3→T5 cùng tuần), T5→T5 tuần sau (cũ T5→T3 tuần sau).
-- Khớp server/btvn/class-rules.json (luật web gửi kèm sync_due). Giờ hạn vẫn = giờ vào ca − 30 phút.
-- Chỉ thay 3 đoạn luật trong hằng cấu hình của hàm (mỗi đoạn phải xuất hiện đúng 1 lần), giữ nguyên phần thân, quyền.
-- Hạn lưu trong btvn_work cập nhật ở lần đồng bộ hạn (sync_due) tiếp theo. Chạy lại vô hại.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  fn constant regprocedure := 'mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)'::regprocedure;
  src text; acl_before text; acl_after text; pair text; got timestamptz; t record;
  reps text[][] := array[
    array['"sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K14"',
          '"sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":1,"weeks":1},"3":{"weekday":3,"weeks":1},"4":{"weekday":3,"weeks":1},"5":{"weekday":5,"weeks":1},"6":{"weekday":5,"weeks":1}}}},"2K14"'],
    array['"sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K10 9+"',
          '"sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"map","days":{"1":{"weekday":2,"weeks":1},"2":{"weekday":2,"weeks":1},"3":{"weekday":4,"weeks":1},"4":{"weekday":4,"weeks":1},"5":{"weekday":6,"weeks":1},"6":{"weekday":6,"weeks":1}}}},"2K10 9+"'],
    array['"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":4,"weeks":0},"4":{"weekday":2,"weeks":1}}}',
          '"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":2,"weeks":1},"4":{"weekday":4,"weeks":1}}}']
  ];
  i int; n int;
BEGIN
  src := pg_get_functiondef(fn);
  IF position('"2K9 XPT"' IN src) = 0 THEN RAISE EXCEPTION 'HAN_CUNG_THU_NO_CONFIG'; END IF;
  IF position(reps[1][2] IN src) > 0 AND position(reps[2][2] IN src) > 0 AND position(reps[3][2] IN src) > 0 THEN
    RAISE NOTICE 'HAN_CUNG_THU da ap truoc do';
  ELSE
    FOR i IN 1..3 LOOP
      n := (length(src) - length(replace(src, reps[i][1], ''))) / length(reps[i][1]);
      IF n <> 1 THEN RAISE EXCEPTION 'HAN_CUNG_THU_SNIPPET_% count %', i, n; END IF;
      src := replace(src, reps[i][1], reps[i][2]);
    END LOOP;
    SELECT coalesce(proacl::text, '') INTO acl_before FROM pg_proc WHERE oid = fn;
    EXECUTE src;
    SELECT coalesce(proacl::text, '') INTO acl_after FROM pg_proc WHERE oid = fn;
    IF acl_before IS DISTINCT FROM acl_after THEN RAISE EXCEPTION 'HAN_CUNG_THU_ACL_CHANGED'; END IF;
  END IF;

  -- Kiểm kết quả (giờ VN, hạn = giờ vào − 30 phút).
  FOR t IN SELECT * FROM (VALUES
      ('2K9 9+',  date '2026-10-26', timestamptz '2026-11-02 17:00+07'),
      ('2K9 9+',  date '2026-10-27', timestamptz '2026-11-02 17:00+07'),
      ('2K9 9+',  date '2026-10-30', timestamptz '2026-11-06 17:00+07'),
      ('2K9 8+',  date '2026-10-27', timestamptz '2026-11-03 17:00+07'),
      ('2K9 8+',  date '2026-10-26', timestamptz '2026-11-03 17:00+07'),
      ('2K9 8+',  date '2026-10-31', timestamptz '2026-11-07 17:00+07'),
      ('2K9 XPT', date '2026-10-26', timestamptz '2026-11-02 19:00+07'),
      ('2K9 XPT', date '2026-10-27', timestamptz '2026-11-03 19:00+07'),
      ('2K9 XPT', date '2026-10-29', timestamptz '2026-11-05 19:00+07'),
      ('2K11 XPT', date '2026-10-24', timestamptz '2026-10-31 13:00+07'),
      ('2K11 8+', date '2026-10-21', timestamptz '2026-10-28 19:00+07')
    ) v(lbl, d, want) LOOP
    got := mtm_hw_private.btvn_planned_due(t.lbl, t.d);
    IF got IS DISTINCT FROM t.want THEN RAISE EXCEPTION 'HAN_CUNG_THU_CHECK % % got % want %', t.lbl, t.d, got, t.want; END IF;
  END LOOP;
END
$migration$;
COMMIT;
