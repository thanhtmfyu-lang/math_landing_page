-- 02_sua_han.sql  — BẢN v2 (20/10/2026). CÓ GHI DỮ LIỆU, một giao dịch.
-- =====================================================================================
-- DIỄN TẬP TRƯỚC: thay dòng "commit;" (dòng đứng riêng, ngay trước "Bước 6") bằng "rollback;" rồi chạy cả tệp.
--   Kết quả cuối phải ra trang_thai = 'CHUA SUA (dien tap ...)' và so_dong_con_lech = số dòng sẽ sửa.
--   Sau đó dán lại tệp gốc (có "commit;") và chạy thật. Kết quả cuối: 'DA SUA (commit)', so_dong_con_lech = 0.
-- Có lỗi đỏ ở bất kỳ bước nào: DỪNG, copy nguyên văn lỗi gửi về, không sửa tay, không chạy kiểu khác.
-- =====================================================================================
-- v2 đổi so với v1:
--   * Hạn = 30 phút TRƯỚC giờ bắt đầu buổi hạn (vd 2K10 XPT T7 24/10 -> T7 31/10 15:00).
--   * Luật nằm ngay trong tệp (bảng "luat" = server/btvn/class-rules.json), KHÔNG gọi hàm DB btvn_planned_due
--     (hàm trên DB đang tính sai). Chạy được dù đã hay chưa chạy 00.
--   * Có sửa 2K10 9+ buổi CN 25/10 theo ca từng em trong sổ điểm danh (T6 -> 19:00 T6 30/10, CN -> 07:30 CN 01/11,
--     không có dữ liệu -> CN 01/11). "2K10 Thứ 3, 6" (= nhóm 2K10 9+, migration 045) buổi CN tính giống vậy.
-- Rào chắn:
--   * Chỉ đụng dòng btvn_work có hạn đang lưu SỚM HƠN hạn mới. Không bao giờ kéo hạn sớm lại: dòng đang có hạn muộn
--     hơn (kể cả muộn hơn chưa tới 30 phút, vd 17:30 so với hạn mới 17:00) thì giữ nguyên.
--   * Hạn thật cũ (next_actual_class_at) sớm hơn hạn mới thì bỏ (lần đồng bộ điểm danh sau tự xác minh lại),
--     cờ "muộn" của các lần nộp đó về null như mtm_btvn_sync_due làm.
--   * Không đụng gia hạn riêng (btvn_student_overrides), lịch riêng (student_schedule_rules).
--   * Tự kiểm tra bảng luật trong tệp ra đúng các mốc mẫu trước khi sửa; sai là dừng.
--   * Khóa giống mtm_btvn_sync_due (pg_advisory_xact_lock 'btvn-due:<owner>').
--   * Sao lưu giá trị cũ vào mtm_hw_private.btvn_sua_han_1925_v2_saoluu (hoàn tác được, xem cuối tệp).
--   * Lượt làm bài không cần nới: hạn làm từng lượt = giờ bắt đầu + thời lượng đề; hạn nộp chỉ quyết định cờ "muộn".
-- Kết quả chỉ có số đếm, không có tên/SĐT.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Bước 1: kiểm tra trước khi sửa
do $kiem_truoc$
declare ok boolean;
begin
  if to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    raise exception 'DUNG: 02 v2 da chay (commit) truoc day, bang sao luu da co. Chay 03, khong chay lai 02.';
  end if;
  if not exists (select 1 from mtm_hw_private.btvn_roster_scope where singleton) then
    raise exception 'DUNG: khong co btvn_roster_scope';
  end if;
  with luat as (  -- bảng luật lớp chép từ server/btvn/class-rules.json (bảng anh chốt 15/10 + 19/10); giờ = giờ BẮT ĐẦU buổi hạn
  select v.lop::text as lop, v.thu::int as thu, v.ca::int as ca, v.cong_ngay::int as cong_ngay, v.gio::text as gio, v.ghi_chu::text as ghi_chu
  from (values
    ('2K9 9+', 1, null, 2, '17:30', ''),
    ('2K9 9+', 3, null, 2, '17:30', ''),
    ('2K9 9+', 5, null, 3, '17:30', ''),
    ('2K10 XPT', 1, null, 7, '19:30', ''),
    ('2K10 XPT', 6, null, 7, '15:30', ''),
    ('2K9 XPT', 1, null, 7, '19:30', ''),
    ('2K9 XPT', 2, null, 2, '19:30', ''),
    ('2K9 XPT', 4, null, 5, '19:30', ''),
    ('2K9 8+', 2, null, 2, '17:30', ''),
    ('2K9 8+', 4, null, 2, '17:30', ''),
    ('2K9 8+', 6, null, 3, '17:30', ''),
    ('2K10 9+', 2, null, 7, '19:30', ''),
    ('2K10 9+', 5, 5, 7, '19:30', ''),
    ('2K10 9+', 5, 7, 9, '08:00', ''),
    ('2K10 9+', 7, 5, 5, '19:30', ''),
    ('2K10 9+', 7, 7, 7, '08:00', ''),
    ('2K11 8+', 3, null, 7, '19:30', ''),
    ('2K11 8+', 7, null, 7, '15:30', ''),
    ('2K11 XPT', 3, null, 7, '19:30', ''),
    ('2K11 XPT', 6, null, 7, '13:30', ''),
    ('HSA.2', 4, null, 7, '14:30', ''),
    ('2K11 9+', 4, null, 7, '19:30', ''),
    ('2K11 9+', 7, null, 7, '13:30', ''),
    ('2K10 8+', 5, null, 7, '19:30', ''),
    ('2K10 8+', 7, null, 7, '10:00', ''),
    ('HSA', 7, null, 7, '17:00', ''),
    ('2K9 HSA (THỨ 5)', 4, null, 7, '14:30', ''),
    ('2K10 Thứ 3, 6', 2, null, 7, '19:30', ''),
    ('2K10 Thứ 3, 6', 5, null, 7, '19:30', ''),
    ('2K9 HSA (CN)', 7, null, 7, '17:00', ''),
    ('2K10 Thứ 3, 6', 7, 5, 5, '19:30', 'alias045'),
    ('2K10 Thứ 3, 6', 7, 7, 7, '08:00', 'alias045')
  ) v(lop, thu, ca, cong_ngay, gio, ghi_chu)
),
  kt as (  -- tự kiểm tra bảng luật trong tệp (KHÔNG dùng hàm DB): hạn = giờ bắt đầu buổi hạn − 30 phút
  select bool_and(g.han is not distinct from v.muon) as luat_trong_tep_dung
  from (values
    ('2K10 XPT', date '2026-10-24', null::int, timestamptz '2026-10-31 15:00+07'),
    ('2K9 XPT',  date '2026-10-19', null, timestamptz '2026-10-26 19:00+07'),
    ('2K9 XPT',  date '2026-10-20', null, timestamptz '2026-10-22 19:00+07'),
    ('2K9 9+',   date '2026-10-19', null, timestamptz '2026-10-21 17:00+07'),
    ('2K9 8+',   date '2026-10-20', null, timestamptz '2026-10-22 17:00+07'),
    ('2K9 8+',   date '2026-10-24', null, timestamptz '2026-10-27 17:00+07'),
    ('2K10 9+',  date '2026-10-20', null, timestamptz '2026-10-27 19:00+07'),
    ('2K10 8+',  date '2026-10-25', null, timestamptz '2026-11-01 09:30+07'),
    ('2K11 8+',  date '2026-10-21', null, timestamptz '2026-10-28 19:00+07'),
    ('2K11 9+',  date '2026-10-22', null, timestamptz '2026-10-29 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 5,    timestamptz '2026-10-30 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 7,    timestamptz '2026-11-01 07:30+07'),
    ('2K10 9+',  date '2026-10-25', null, null::timestamptz)
  ) v(lop, ngay, ca, muon)
  left join lateral (
    select (((v.ngay + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') - interval '30 minutes' as han
    from luat l where l.lop = v.lop and l.thu = extract(isodow from v.ngay)::int and l.ca is not distinct from v.ca
  ) g on true
)
  select luat_trong_tep_dung into ok from kt;
  if not coalesce(ok, false) then
    raise exception 'DUNG: bang luat trong tep khong ra dung cac moc mau. Khong sua.';
  end if;
end
$kiem_truoc$;

-- Bước 2: khóa cùng khóa với mtm_btvn_sync_due
select pg_advisory_xact_lock(hashtextextended('btvn-due:' || owner_id::text, 0)) as da_khoa
from mtm_hw_private.btvn_roster_scope where singleton;

-- Bước 3: danh sách dòng cần sửa = bảng sao lưu (giá trị CŨ + hạn mới)
create table mtm_hw_private.btvn_sua_han_1925_v2_saoluu as
with
luat as (  -- bảng luật lớp chép từ server/btvn/class-rules.json (bảng anh chốt 15/10 + 19/10); giờ = giờ BẮT ĐẦU buổi hạn
  select v.lop::text as lop, v.thu::int as thu, v.ca::int as ca, v.cong_ngay::int as cong_ngay, v.gio::text as gio, v.ghi_chu::text as ghi_chu
  from (values
    ('2K9 9+', 1, null, 2, '17:30', ''),
    ('2K9 9+', 3, null, 2, '17:30', ''),
    ('2K9 9+', 5, null, 3, '17:30', ''),
    ('2K10 XPT', 1, null, 7, '19:30', ''),
    ('2K10 XPT', 6, null, 7, '15:30', ''),
    ('2K9 XPT', 1, null, 7, '19:30', ''),
    ('2K9 XPT', 2, null, 2, '19:30', ''),
    ('2K9 XPT', 4, null, 5, '19:30', ''),
    ('2K9 8+', 2, null, 2, '17:30', ''),
    ('2K9 8+', 4, null, 2, '17:30', ''),
    ('2K9 8+', 6, null, 3, '17:30', ''),
    ('2K10 9+', 2, null, 7, '19:30', ''),
    ('2K10 9+', 5, 5, 7, '19:30', ''),
    ('2K10 9+', 5, 7, 9, '08:00', ''),
    ('2K10 9+', 7, 5, 5, '19:30', ''),
    ('2K10 9+', 7, 7, 7, '08:00', ''),
    ('2K11 8+', 3, null, 7, '19:30', ''),
    ('2K11 8+', 7, null, 7, '15:30', ''),
    ('2K11 XPT', 3, null, 7, '19:30', ''),
    ('2K11 XPT', 6, null, 7, '13:30', ''),
    ('HSA.2', 4, null, 7, '14:30', ''),
    ('2K11 9+', 4, null, 7, '19:30', ''),
    ('2K11 9+', 7, null, 7, '13:30', ''),
    ('2K10 8+', 5, null, 7, '19:30', ''),
    ('2K10 8+', 7, null, 7, '10:00', ''),
    ('HSA', 7, null, 7, '17:00', ''),
    ('2K9 HSA (THỨ 5)', 4, null, 7, '14:30', ''),
    ('2K10 Thứ 3, 6', 2, null, 7, '19:30', ''),
    ('2K10 Thứ 3, 6', 5, null, 7, '19:30', ''),
    ('2K9 HSA (CN)', 7, null, 7, '17:00', ''),
    ('2K10 Thứ 3, 6', 7, 5, 5, '19:30', 'alias045'),
    ('2K10 Thứ 3, 6', 7, 7, 7, '08:00', 'alias045')
  ) v(lop, thu, ca, cong_ngay, gio, ghi_chu)
),
kt as (  -- tự kiểm tra bảng luật trong tệp (KHÔNG dùng hàm DB): hạn = giờ bắt đầu buổi hạn − 30 phút
  select bool_and(g.han is not distinct from v.muon) as luat_trong_tep_dung
  from (values
    ('2K10 XPT', date '2026-10-24', null::int, timestamptz '2026-10-31 15:00+07'),
    ('2K9 XPT',  date '2026-10-19', null, timestamptz '2026-10-26 19:00+07'),
    ('2K9 XPT',  date '2026-10-20', null, timestamptz '2026-10-22 19:00+07'),
    ('2K9 9+',   date '2026-10-19', null, timestamptz '2026-10-21 17:00+07'),
    ('2K9 8+',   date '2026-10-20', null, timestamptz '2026-10-22 17:00+07'),
    ('2K9 8+',   date '2026-10-24', null, timestamptz '2026-10-27 17:00+07'),
    ('2K10 9+',  date '2026-10-20', null, timestamptz '2026-10-27 19:00+07'),
    ('2K10 8+',  date '2026-10-25', null, timestamptz '2026-11-01 09:30+07'),
    ('2K11 8+',  date '2026-10-21', null, timestamptz '2026-10-28 19:00+07'),
    ('2K11 9+',  date '2026-10-22', null, timestamptz '2026-10-29 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 5,    timestamptz '2026-10-30 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 7,    timestamptz '2026-11-01 07:30+07'),
    ('2K10 9+',  date '2026-10-25', null, null::timestamptz)
  ) v(lop, ngay, ca, muon)
  left join lateral (
    select (((v.ngay + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') - interval '30 minutes' as han
    from luat l where l.lop = v.lop and l.thu = extract(isodow from v.ngay)::int and l.ca is not distinct from v.ca
  ) g on true
),
nguon as (
  select to_regclass('mtm_hw_private.attendance') is not null              as co_diem_danh,
         to_regclass('mtm_hw_private.schedule_moves') is not null          as co_chuyen_buoi,
         to_regclass('mtm_hw_private.student_schedule_rules') is not null  as co_lich_066,
         to_regprocedure('mtm_hw_private.lich_rieng(text)') is not null    as co_lich_trong_ten
),
ca_sql as (
  select 'select coalesce('
    || case when co_diem_danh then
         $c$(select case when bool_or(a.session_date = %2$L::date + 7) then '7' else '5' end || ':diem_danh_co_mat'
              from mtm_hw_private.attendance a where a.student_id = %1$L::uuid
               and a.status in ('co_mat','hoc_online','di_muon','ve_som')
               and ((a.session_date = %2$L::date + 5 and a.class_label = '2K10 9+')
                 or (a.session_date = %2$L::date + 7 and a.class_label in ('2K10 9+','2K10 8+'))) having count(*) > 0),
            (select case when bool_or(a.session_date = %2$L::date + 7) then '7' else '5' end || ':diem_danh_khac'
              from mtm_hw_private.attendance a where a.student_id = %1$L::uuid
               and ((a.session_date = %2$L::date + 5 and a.class_label = '2K10 9+')
                 or (a.session_date = %2$L::date + 7 and a.class_label in ('2K10 9+','2K10 8+'))) having count(*) > 0),$c$
       else '' end
    || case when co_chuyen_buoi then
         $c$(select case when bool_or(m.to_date = %2$L::date + 7) then '7' else '5' end || ':chuyen_buoi'
              from mtm_hw_private.schedule_moves m where m.student_id = %1$L::uuid and m.cancelled_at is null
               and ((m.to_date = %2$L::date + 5 and m.to_class = '2K10 9+')
                 or (m.to_date = %2$L::date + 7 and m.to_class in ('2K10 9+','2K10 8+'))) having count(*) > 0),$c$
       else '' end
    || case when co_lich_066 then
         $c$(select case when bool_or(r.weekday = 7) then '7' else '5' end || ':lich_rieng_066'
              from mtm_hw_private.student_schedule_rules r where r.student_id = %1$L::uuid
               and ((r.weekday = 5 and r.start_hm = '19:30' and r.class_label = '2K10 9+')
                 or (r.weekday = 7 and ((r.start_hm = '08:00' and r.class_label = '2K10 9+') or (r.start_hm = '10:00' and r.class_label = '2K10 8+'))))
               and r.from_date <= %2$L::date + 7 and (r.to_date is null or r.to_date >= %2$L::date + 5)
               and (r.cancelled_from is null or r.cancelled_from > %2$L::date + 5) having count(*) > 0),$c$
       else '' end
    || case when co_lich_trong_ten then
         $c$(select case when x.lr->'days' @> '[7]' and x.lr->>'start' in ('08:00','10:00') then '7:lich_rieng_trong_ten'
                         when x.lr->'days' @> '[5]' and x.lr->>'start' = '19:30' then '5:lich_rieng_trong_ten' end
              from (select mtm_hw_private.lich_rieng(s.full_name) as lr from mtm_hw_private.students s where s.id = %1$L::uuid) x),$c$
       else '' end
    || $c$'7:mac_dinh_CN') as n$c$ as q
  from nguon
),
scope as (select owner_id from mtm_hw_private.btvn_roster_scope where singleton),
bai_lop as (
  select l.code as ma_bai, l.active as dang_mo, c.id as class_id, c.label as lop, l.owner_id,
         case when coalesce(l.material->'classDates'->>c.label, l.material->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
              then coalesce(l.material->'classDates'->>c.label, l.material->>'date')::date end as ngay_hoc,
         l.material->'classOpensAt'->>c.label as mo_rieng
  from mtm_hw_private.btvn_lessons l
  join scope on scope.owner_id = l.owner_id
  join mtm_hw_private.classes c on c.owner_id = l.owner_id and c.id = any(l.class_ids) and c.active
  where l.kind = 'btvn' and c.label ~ '^(2K(9|10|11)\M|HSA)'
),
tuan as (
  select b.*, extract(isodow from b.ngay_hoc)::int as thu,
         exists (select 1 from luat l where l.lop = b.lop and l.thu = extract(isodow from b.ngay_hoc)::int and l.ca is not null) as theo_ca
  from bai_lop b
  where b.ngay_hoc between date '2026-10-19' and date '2026-10-25'
),
hs as (  -- từng học sinh; han_moi = hạn theo luật (giờ bắt đầu − 30 phút)
  select t.ma_bai, t.lop, t.class_id, t.dang_mo, t.ngay_hoc, t.mo_rieng, t.theo_ca,
         s.id as sid, (w.student_id is not null) as co_work, w.expected_due_at as e, w.next_actual_class_at as a,
         ca.ca_txt, h.han_moi
  from tuan t
  join mtm_hw_private.students s on s.class_id = t.class_id and s.owner_id = t.owner_id and s.active
  left join mtm_hw_private.btvn_work w on w.student_id = s.id and w.lesson_code = t.ma_bai
  cross join lateral (
    select case when t.theo_ca then
      (xpath('/row/n/text()', query_to_xml(format((select q from ca_sql), s.id, t.ngay_hoc - t.thu), false, true, '')))[1]::text
    end as ca_txt) ca
  left join luat l on l.lop = t.lop and l.thu = t.thu
       and l.ca is not distinct from (case when t.theo_ca then split_part(ca.ca_txt, ':', 1)::int end)
  cross join lateral (
    select (((t.ngay_hoc + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') as bat_dau) r
  cross join lateral (  -- buổi hạn phải sau buổi nguồn và trong vòng 9 ngày, nếu không coi như không có luật
    select case when r.bat_dau >  (t.ngay_hoc::timestamp at time zone 'Asia/Ho_Chi_Minh')
                 and r.bat_dau <  ((t.ngay_hoc + 10)::timestamp at time zone 'Asia/Ho_Chi_Minh')
                then r.bat_dau - interval '30 minutes' end as han_moi) h
)
select w.student_id, w.lesson_code, hs.lop as class_label, hs.ngay_hoc, hs.han_moi as han_luat,
       split_part(hs.ca_txt, ':', 2) as nguon_ca,
       w.expected_due_at as expected_cu, w.next_actual_class_at as actual_cu,
       w.due_source_identity as source_cu, w.receipts as receipts_cu, w.revision as revision_cu,
       clock_timestamp() as luc_sao_luu
from hs
join mtm_hw_private.btvn_work w on w.student_id = hs.sid and w.lesson_code = hs.ma_bai
where hs.han_moi is not null
  and (w.expected_due_at < hs.han_moi or w.next_actual_class_at < hs.han_moi);

alter table mtm_hw_private.btvn_sua_han_1925_v2_saoluu add primary key (student_id, lesson_code);
alter table mtm_hw_private.btvn_sua_han_1925_v2_saoluu enable row level security;
revoke all on mtm_hw_private.btvn_sua_han_1925_v2_saoluu from public, anon, authenticated, service_role;

-- Bước 4 + 5: sửa, rồi tự kiểm tra trong cùng giao dịch (sai là hủy toàn bộ)
do $sua$
declare n_kh int; n_sua int; n_con int; n_som int; n_bo_actual int;
begin
  select count(*), count(*) filter (where actual_cu < han_luat)
    into n_kh, n_bo_actual from mtm_hw_private.btvn_sua_han_1925_v2_saoluu;

  update mtm_hw_private.btvn_work w set
    expected_due_at      = case when w.expected_due_at is null or w.expected_due_at < b.han_luat
                                then b.han_luat else w.expected_due_at end,
    next_actual_class_at = case when w.next_actual_class_at < b.han_luat then null else w.next_actual_class_at end,
    due_source_identity  = case when w.next_actual_class_at < b.han_luat then null else w.due_source_identity end,
    receipts             = case when w.next_actual_class_at < b.han_luat then
                             (select coalesce(jsonb_agg(r || jsonb_build_object('late', null) order by ord), '[]'::jsonb)
                                from jsonb_array_elements(w.receipts) with ordinality x(r, ord))
                           else w.receipts end,
    revision             = w.revision + 1
  from mtm_hw_private.btvn_sua_han_1925_v2_saoluu b
  where w.student_id = b.student_id and w.lesson_code = b.lesson_code
    and w.expected_due_at is not distinct from b.expected_cu
    and w.next_actual_class_at is not distinct from b.actual_cu;
  get diagnostics n_sua = row_count;
  if n_sua <> n_kh then
    raise exception 'DUNG: so dong sua (%) khac ke hoach (%). Da huy, khong doi gi.', n_sua, n_kh;
  end if;

  select count(*) into n_som
  from mtm_hw_private.btvn_sua_han_1925_v2_saoluu b
  join mtm_hw_private.btvn_work w using (student_id, lesson_code)
  where w.expected_due_at < b.expected_cu or w.expected_due_at < b.han_luat
     or (w.next_actual_class_at is not null and w.next_actual_class_at < b.han_luat);
  if n_som <> 0 then
    raise exception 'DUNG: % dong sau sua van som hon luat/truoc. Da huy.', n_som;
  end if;

  with
  luat as (  -- bảng luật lớp chép từ server/btvn/class-rules.json (bảng anh chốt 15/10 + 19/10); giờ = giờ BẮT ĐẦU buổi hạn
  select v.lop::text as lop, v.thu::int as thu, v.ca::int as ca, v.cong_ngay::int as cong_ngay, v.gio::text as gio, v.ghi_chu::text as ghi_chu
  from (values
    ('2K9 9+', 1, null, 2, '17:30', ''),
    ('2K9 9+', 3, null, 2, '17:30', ''),
    ('2K9 9+', 5, null, 3, '17:30', ''),
    ('2K10 XPT', 1, null, 7, '19:30', ''),
    ('2K10 XPT', 6, null, 7, '15:30', ''),
    ('2K9 XPT', 1, null, 7, '19:30', ''),
    ('2K9 XPT', 2, null, 2, '19:30', ''),
    ('2K9 XPT', 4, null, 5, '19:30', ''),
    ('2K9 8+', 2, null, 2, '17:30', ''),
    ('2K9 8+', 4, null, 2, '17:30', ''),
    ('2K9 8+', 6, null, 3, '17:30', ''),
    ('2K10 9+', 2, null, 7, '19:30', ''),
    ('2K10 9+', 5, 5, 7, '19:30', ''),
    ('2K10 9+', 5, 7, 9, '08:00', ''),
    ('2K10 9+', 7, 5, 5, '19:30', ''),
    ('2K10 9+', 7, 7, 7, '08:00', ''),
    ('2K11 8+', 3, null, 7, '19:30', ''),
    ('2K11 8+', 7, null, 7, '15:30', ''),
    ('2K11 XPT', 3, null, 7, '19:30', ''),
    ('2K11 XPT', 6, null, 7, '13:30', ''),
    ('HSA.2', 4, null, 7, '14:30', ''),
    ('2K11 9+', 4, null, 7, '19:30', ''),
    ('2K11 9+', 7, null, 7, '13:30', ''),
    ('2K10 8+', 5, null, 7, '19:30', ''),
    ('2K10 8+', 7, null, 7, '10:00', ''),
    ('HSA', 7, null, 7, '17:00', ''),
    ('2K9 HSA (THỨ 5)', 4, null, 7, '14:30', ''),
    ('2K10 Thứ 3, 6', 2, null, 7, '19:30', ''),
    ('2K10 Thứ 3, 6', 5, null, 7, '19:30', ''),
    ('2K9 HSA (CN)', 7, null, 7, '17:00', ''),
    ('2K10 Thứ 3, 6', 7, 5, 5, '19:30', 'alias045'),
    ('2K10 Thứ 3, 6', 7, 7, 7, '08:00', 'alias045')
  ) v(lop, thu, ca, cong_ngay, gio, ghi_chu)
),
kt as (  -- tự kiểm tra bảng luật trong tệp (KHÔNG dùng hàm DB): hạn = giờ bắt đầu buổi hạn − 30 phút
  select bool_and(g.han is not distinct from v.muon) as luat_trong_tep_dung
  from (values
    ('2K10 XPT', date '2026-10-24', null::int, timestamptz '2026-10-31 15:00+07'),
    ('2K9 XPT',  date '2026-10-19', null, timestamptz '2026-10-26 19:00+07'),
    ('2K9 XPT',  date '2026-10-20', null, timestamptz '2026-10-22 19:00+07'),
    ('2K9 9+',   date '2026-10-19', null, timestamptz '2026-10-21 17:00+07'),
    ('2K9 8+',   date '2026-10-20', null, timestamptz '2026-10-22 17:00+07'),
    ('2K9 8+',   date '2026-10-24', null, timestamptz '2026-10-27 17:00+07'),
    ('2K10 9+',  date '2026-10-20', null, timestamptz '2026-10-27 19:00+07'),
    ('2K10 8+',  date '2026-10-25', null, timestamptz '2026-11-01 09:30+07'),
    ('2K11 8+',  date '2026-10-21', null, timestamptz '2026-10-28 19:00+07'),
    ('2K11 9+',  date '2026-10-22', null, timestamptz '2026-10-29 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 5,    timestamptz '2026-10-30 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 7,    timestamptz '2026-11-01 07:30+07'),
    ('2K10 9+',  date '2026-10-25', null, null::timestamptz)
  ) v(lop, ngay, ca, muon)
  left join lateral (
    select (((v.ngay + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') - interval '30 minutes' as han
    from luat l where l.lop = v.lop and l.thu = extract(isodow from v.ngay)::int and l.ca is not distinct from v.ca
  ) g on true
),
nguon as (
  select to_regclass('mtm_hw_private.attendance') is not null              as co_diem_danh,
         to_regclass('mtm_hw_private.schedule_moves') is not null          as co_chuyen_buoi,
         to_regclass('mtm_hw_private.student_schedule_rules') is not null  as co_lich_066,
         to_regprocedure('mtm_hw_private.lich_rieng(text)') is not null    as co_lich_trong_ten
),
ca_sql as (
  select 'select coalesce('
    || case when co_diem_danh then
         $c$(select case when bool_or(a.session_date = %2$L::date + 7) then '7' else '5' end || ':diem_danh_co_mat'
              from mtm_hw_private.attendance a where a.student_id = %1$L::uuid
               and a.status in ('co_mat','hoc_online','di_muon','ve_som')
               and ((a.session_date = %2$L::date + 5 and a.class_label = '2K10 9+')
                 or (a.session_date = %2$L::date + 7 and a.class_label in ('2K10 9+','2K10 8+'))) having count(*) > 0),
            (select case when bool_or(a.session_date = %2$L::date + 7) then '7' else '5' end || ':diem_danh_khac'
              from mtm_hw_private.attendance a where a.student_id = %1$L::uuid
               and ((a.session_date = %2$L::date + 5 and a.class_label = '2K10 9+')
                 or (a.session_date = %2$L::date + 7 and a.class_label in ('2K10 9+','2K10 8+'))) having count(*) > 0),$c$
       else '' end
    || case when co_chuyen_buoi then
         $c$(select case when bool_or(m.to_date = %2$L::date + 7) then '7' else '5' end || ':chuyen_buoi'
              from mtm_hw_private.schedule_moves m where m.student_id = %1$L::uuid and m.cancelled_at is null
               and ((m.to_date = %2$L::date + 5 and m.to_class = '2K10 9+')
                 or (m.to_date = %2$L::date + 7 and m.to_class in ('2K10 9+','2K10 8+'))) having count(*) > 0),$c$
       else '' end
    || case when co_lich_066 then
         $c$(select case when bool_or(r.weekday = 7) then '7' else '5' end || ':lich_rieng_066'
              from mtm_hw_private.student_schedule_rules r where r.student_id = %1$L::uuid
               and ((r.weekday = 5 and r.start_hm = '19:30' and r.class_label = '2K10 9+')
                 or (r.weekday = 7 and ((r.start_hm = '08:00' and r.class_label = '2K10 9+') or (r.start_hm = '10:00' and r.class_label = '2K10 8+'))))
               and r.from_date <= %2$L::date + 7 and (r.to_date is null or r.to_date >= %2$L::date + 5)
               and (r.cancelled_from is null or r.cancelled_from > %2$L::date + 5) having count(*) > 0),$c$
       else '' end
    || case when co_lich_trong_ten then
         $c$(select case when x.lr->'days' @> '[7]' and x.lr->>'start' in ('08:00','10:00') then '7:lich_rieng_trong_ten'
                         when x.lr->'days' @> '[5]' and x.lr->>'start' = '19:30' then '5:lich_rieng_trong_ten' end
              from (select mtm_hw_private.lich_rieng(s.full_name) as lr from mtm_hw_private.students s where s.id = %1$L::uuid) x),$c$
       else '' end
    || $c$'7:mac_dinh_CN') as n$c$ as q
  from nguon
),
scope as (select owner_id from mtm_hw_private.btvn_roster_scope where singleton),
bai_lop as (
  select l.code as ma_bai, l.active as dang_mo, c.id as class_id, c.label as lop, l.owner_id,
         case when coalesce(l.material->'classDates'->>c.label, l.material->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
              then coalesce(l.material->'classDates'->>c.label, l.material->>'date')::date end as ngay_hoc,
         l.material->'classOpensAt'->>c.label as mo_rieng
  from mtm_hw_private.btvn_lessons l
  join scope on scope.owner_id = l.owner_id
  join mtm_hw_private.classes c on c.owner_id = l.owner_id and c.id = any(l.class_ids) and c.active
  where l.kind = 'btvn' and c.label ~ '^(2K(9|10|11)\M|HSA)'
),
tuan as (
  select b.*, extract(isodow from b.ngay_hoc)::int as thu,
         exists (select 1 from luat l where l.lop = b.lop and l.thu = extract(isodow from b.ngay_hoc)::int and l.ca is not null) as theo_ca
  from bai_lop b
  where b.ngay_hoc between date '2026-10-19' and date '2026-10-25'
),
hs as (  -- từng học sinh; han_moi = hạn theo luật (giờ bắt đầu − 30 phút)
  select t.ma_bai, t.lop, t.class_id, t.dang_mo, t.ngay_hoc, t.mo_rieng, t.theo_ca,
         s.id as sid, (w.student_id is not null) as co_work, w.expected_due_at as e, w.next_actual_class_at as a,
         ca.ca_txt, h.han_moi
  from tuan t
  join mtm_hw_private.students s on s.class_id = t.class_id and s.owner_id = t.owner_id and s.active
  left join mtm_hw_private.btvn_work w on w.student_id = s.id and w.lesson_code = t.ma_bai
  cross join lateral (
    select case when t.theo_ca then
      (xpath('/row/n/text()', query_to_xml(format((select q from ca_sql), s.id, t.ngay_hoc - t.thu), false, true, '')))[1]::text
    end as ca_txt) ca
  left join luat l on l.lop = t.lop and l.thu = t.thu
       and l.ca is not distinct from (case when t.theo_ca then split_part(ca.ca_txt, ':', 1)::int end)
  cross join lateral (
    select (((t.ngay_hoc + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') as bat_dau) r
  cross join lateral (  -- buổi hạn phải sau buổi nguồn và trong vòng 9 ngày, nếu không coi như không có luật
    select case when r.bat_dau >  (t.ngay_hoc::timestamp at time zone 'Asia/Ho_Chi_Minh')
                 and r.bat_dau <  ((t.ngay_hoc + 10)::timestamp at time zone 'Asia/Ho_Chi_Minh')
                then r.bat_dau - interval '30 minutes' end as han_moi) h
)
  select (select count(*) from hs where hs.co_work and (hs.e < hs.han_moi or hs.a < hs.han_moi)) into n_con;
  if n_con <> 0 then
    raise exception 'DUNG: sau sua van con % dong lech. Da huy.', n_con;
  end if;

  raise notice 'Da sua % dong (trong do % dong bo han thuc som). Con lech: 0.', n_sua, n_bo_actual;
end
$sua$;

commit;

-- Bước 6: báo cáo (chạy sau commit/rollback; chỉ số đếm)
with
luat as (  -- bảng luật lớp chép từ server/btvn/class-rules.json (bảng anh chốt 15/10 + 19/10); giờ = giờ BẮT ĐẦU buổi hạn
  select v.lop::text as lop, v.thu::int as thu, v.ca::int as ca, v.cong_ngay::int as cong_ngay, v.gio::text as gio, v.ghi_chu::text as ghi_chu
  from (values
    ('2K9 9+', 1, null, 2, '17:30', ''),
    ('2K9 9+', 3, null, 2, '17:30', ''),
    ('2K9 9+', 5, null, 3, '17:30', ''),
    ('2K10 XPT', 1, null, 7, '19:30', ''),
    ('2K10 XPT', 6, null, 7, '15:30', ''),
    ('2K9 XPT', 1, null, 7, '19:30', ''),
    ('2K9 XPT', 2, null, 2, '19:30', ''),
    ('2K9 XPT', 4, null, 5, '19:30', ''),
    ('2K9 8+', 2, null, 2, '17:30', ''),
    ('2K9 8+', 4, null, 2, '17:30', ''),
    ('2K9 8+', 6, null, 3, '17:30', ''),
    ('2K10 9+', 2, null, 7, '19:30', ''),
    ('2K10 9+', 5, 5, 7, '19:30', ''),
    ('2K10 9+', 5, 7, 9, '08:00', ''),
    ('2K10 9+', 7, 5, 5, '19:30', ''),
    ('2K10 9+', 7, 7, 7, '08:00', ''),
    ('2K11 8+', 3, null, 7, '19:30', ''),
    ('2K11 8+', 7, null, 7, '15:30', ''),
    ('2K11 XPT', 3, null, 7, '19:30', ''),
    ('2K11 XPT', 6, null, 7, '13:30', ''),
    ('HSA.2', 4, null, 7, '14:30', ''),
    ('2K11 9+', 4, null, 7, '19:30', ''),
    ('2K11 9+', 7, null, 7, '13:30', ''),
    ('2K10 8+', 5, null, 7, '19:30', ''),
    ('2K10 8+', 7, null, 7, '10:00', ''),
    ('HSA', 7, null, 7, '17:00', ''),
    ('2K9 HSA (THỨ 5)', 4, null, 7, '14:30', ''),
    ('2K10 Thứ 3, 6', 2, null, 7, '19:30', ''),
    ('2K10 Thứ 3, 6', 5, null, 7, '19:30', ''),
    ('2K9 HSA (CN)', 7, null, 7, '17:00', ''),
    ('2K10 Thứ 3, 6', 7, 5, 5, '19:30', 'alias045'),
    ('2K10 Thứ 3, 6', 7, 7, 7, '08:00', 'alias045')
  ) v(lop, thu, ca, cong_ngay, gio, ghi_chu)
),
kt as (  -- tự kiểm tra bảng luật trong tệp (KHÔNG dùng hàm DB): hạn = giờ bắt đầu buổi hạn − 30 phút
  select bool_and(g.han is not distinct from v.muon) as luat_trong_tep_dung
  from (values
    ('2K10 XPT', date '2026-10-24', null::int, timestamptz '2026-10-31 15:00+07'),
    ('2K9 XPT',  date '2026-10-19', null, timestamptz '2026-10-26 19:00+07'),
    ('2K9 XPT',  date '2026-10-20', null, timestamptz '2026-10-22 19:00+07'),
    ('2K9 9+',   date '2026-10-19', null, timestamptz '2026-10-21 17:00+07'),
    ('2K9 8+',   date '2026-10-20', null, timestamptz '2026-10-22 17:00+07'),
    ('2K9 8+',   date '2026-10-24', null, timestamptz '2026-10-27 17:00+07'),
    ('2K10 9+',  date '2026-10-20', null, timestamptz '2026-10-27 19:00+07'),
    ('2K10 8+',  date '2026-10-25', null, timestamptz '2026-11-01 09:30+07'),
    ('2K11 8+',  date '2026-10-21', null, timestamptz '2026-10-28 19:00+07'),
    ('2K11 9+',  date '2026-10-22', null, timestamptz '2026-10-29 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 5,    timestamptz '2026-10-30 19:00+07'),
    ('2K10 9+',  date '2026-10-25', 7,    timestamptz '2026-11-01 07:30+07'),
    ('2K10 9+',  date '2026-10-25', null, null::timestamptz)
  ) v(lop, ngay, ca, muon)
  left join lateral (
    select (((v.ngay + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') - interval '30 minutes' as han
    from luat l where l.lop = v.lop and l.thu = extract(isodow from v.ngay)::int and l.ca is not distinct from v.ca
  ) g on true
),
nguon as (
  select to_regclass('mtm_hw_private.attendance') is not null              as co_diem_danh,
         to_regclass('mtm_hw_private.schedule_moves') is not null          as co_chuyen_buoi,
         to_regclass('mtm_hw_private.student_schedule_rules') is not null  as co_lich_066,
         to_regprocedure('mtm_hw_private.lich_rieng(text)') is not null    as co_lich_trong_ten
),
ca_sql as (
  select 'select coalesce('
    || case when co_diem_danh then
         $c$(select case when bool_or(a.session_date = %2$L::date + 7) then '7' else '5' end || ':diem_danh_co_mat'
              from mtm_hw_private.attendance a where a.student_id = %1$L::uuid
               and a.status in ('co_mat','hoc_online','di_muon','ve_som')
               and ((a.session_date = %2$L::date + 5 and a.class_label = '2K10 9+')
                 or (a.session_date = %2$L::date + 7 and a.class_label in ('2K10 9+','2K10 8+'))) having count(*) > 0),
            (select case when bool_or(a.session_date = %2$L::date + 7) then '7' else '5' end || ':diem_danh_khac'
              from mtm_hw_private.attendance a where a.student_id = %1$L::uuid
               and ((a.session_date = %2$L::date + 5 and a.class_label = '2K10 9+')
                 or (a.session_date = %2$L::date + 7 and a.class_label in ('2K10 9+','2K10 8+'))) having count(*) > 0),$c$
       else '' end
    || case when co_chuyen_buoi then
         $c$(select case when bool_or(m.to_date = %2$L::date + 7) then '7' else '5' end || ':chuyen_buoi'
              from mtm_hw_private.schedule_moves m where m.student_id = %1$L::uuid and m.cancelled_at is null
               and ((m.to_date = %2$L::date + 5 and m.to_class = '2K10 9+')
                 or (m.to_date = %2$L::date + 7 and m.to_class in ('2K10 9+','2K10 8+'))) having count(*) > 0),$c$
       else '' end
    || case when co_lich_066 then
         $c$(select case when bool_or(r.weekday = 7) then '7' else '5' end || ':lich_rieng_066'
              from mtm_hw_private.student_schedule_rules r where r.student_id = %1$L::uuid
               and ((r.weekday = 5 and r.start_hm = '19:30' and r.class_label = '2K10 9+')
                 or (r.weekday = 7 and ((r.start_hm = '08:00' and r.class_label = '2K10 9+') or (r.start_hm = '10:00' and r.class_label = '2K10 8+'))))
               and r.from_date <= %2$L::date + 7 and (r.to_date is null or r.to_date >= %2$L::date + 5)
               and (r.cancelled_from is null or r.cancelled_from > %2$L::date + 5) having count(*) > 0),$c$
       else '' end
    || case when co_lich_trong_ten then
         $c$(select case when x.lr->'days' @> '[7]' and x.lr->>'start' in ('08:00','10:00') then '7:lich_rieng_trong_ten'
                         when x.lr->'days' @> '[5]' and x.lr->>'start' = '19:30' then '5:lich_rieng_trong_ten' end
              from (select mtm_hw_private.lich_rieng(s.full_name) as lr from mtm_hw_private.students s where s.id = %1$L::uuid) x),$c$
       else '' end
    || $c$'7:mac_dinh_CN') as n$c$ as q
  from nguon
),
scope as (select owner_id from mtm_hw_private.btvn_roster_scope where singleton),
bai_lop as (
  select l.code as ma_bai, l.active as dang_mo, c.id as class_id, c.label as lop, l.owner_id,
         case when coalesce(l.material->'classDates'->>c.label, l.material->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
              then coalesce(l.material->'classDates'->>c.label, l.material->>'date')::date end as ngay_hoc,
         l.material->'classOpensAt'->>c.label as mo_rieng
  from mtm_hw_private.btvn_lessons l
  join scope on scope.owner_id = l.owner_id
  join mtm_hw_private.classes c on c.owner_id = l.owner_id and c.id = any(l.class_ids) and c.active
  where l.kind = 'btvn' and c.label ~ '^(2K(9|10|11)\M|HSA)'
),
tuan as (
  select b.*, extract(isodow from b.ngay_hoc)::int as thu,
         exists (select 1 from luat l where l.lop = b.lop and l.thu = extract(isodow from b.ngay_hoc)::int and l.ca is not null) as theo_ca
  from bai_lop b
  where b.ngay_hoc between date '2026-10-19' and date '2026-10-25'
),
hs as (  -- từng học sinh; han_moi = hạn theo luật (giờ bắt đầu − 30 phút)
  select t.ma_bai, t.lop, t.class_id, t.dang_mo, t.ngay_hoc, t.mo_rieng, t.theo_ca,
         s.id as sid, (w.student_id is not null) as co_work, w.expected_due_at as e, w.next_actual_class_at as a,
         ca.ca_txt, h.han_moi
  from tuan t
  join mtm_hw_private.students s on s.class_id = t.class_id and s.owner_id = t.owner_id and s.active
  left join mtm_hw_private.btvn_work w on w.student_id = s.id and w.lesson_code = t.ma_bai
  cross join lateral (
    select case when t.theo_ca then
      (xpath('/row/n/text()', query_to_xml(format((select q from ca_sql), s.id, t.ngay_hoc - t.thu), false, true, '')))[1]::text
    end as ca_txt) ca
  left join luat l on l.lop = t.lop and l.thu = t.thu
       and l.ca is not distinct from (case when t.theo_ca then split_part(ca.ca_txt, ':', 1)::int end)
  cross join lateral (
    select (((t.ngay_hoc + l.cong_ngay)::text || ' ' || l.gio)::timestamp at time zone 'Asia/Ho_Chi_Minh') as bat_dau) r
  cross join lateral (  -- buổi hạn phải sau buổi nguồn và trong vòng 9 ngày, nếu không coi như không có luật
    select case when r.bat_dau >  (t.ngay_hoc::timestamp at time zone 'Asia/Ho_Chi_Minh')
                 and r.bat_dau <  ((t.ngay_hoc + 10)::timestamp at time zone 'Asia/Ho_Chi_Minh')
                then r.bat_dau - interval '30 minutes' end as han_moi) h
)
select
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is null
       then 'CHUA SUA (dien tap da rollback, hoac co loi o tren)' else 'DA SUA (commit)' end as trang_thai,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml('select count(*) as n from mtm_hw_private.btvn_sua_han_1925_v2_saoluu', false, true, '')))[1]::text::int
  end as so_dong_da_sua,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml('select count(*) as n from mtm_hw_private.btvn_sua_han_1925_v2_saoluu where actual_cu < han_luat', false, true, '')))[1]::text::int
  end as so_dong_bo_han_thuc_som,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml('select count(distinct (lesson_code, class_label)) as n from mtm_hw_private.btvn_sua_han_1925_v2_saoluu', false, true, '')))[1]::text::int
  end as so_cap_bai_lop_da_sua,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml('select string_agg(n || ''='' || k, '', '' order by n) as n from (select nguon_ca as n, count(*) as k from mtm_hw_private.btvn_sua_han_1925_v2_saoluu where nguon_ca <> '''' group by 1) z', false, true, '')))[1]::text
  end as ca_2k10_9_da_sua_theo_nguon,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml('select count(*) as n from mtm_hw_private.btvn_sua_han_1925_v2_saoluu b, jsonb_array_elements(b.receipts_cu) r where r->>''late'' = ''true'' and b.actual_cu < b.han_luat', false, true, '')))[1]::text::int
  end as so_lan_nop_het_bi_tinh_muon,
  (select count(*) from hs where hs.co_work and hs.han_moi is not null) as so_dong_work_trong_pham_vi,
  (select count(*) from hs where hs.co_work and (hs.e < hs.han_moi or hs.a < hs.han_moi)) as so_dong_con_lech;

-- HOÀN TÁC (chỉ khi anh yêu cầu; KHÔNG chạy cùng tệp này). Trả nguyên giá trị cũ từ bảng sao lưu:
-- begin;
-- update mtm_hw_private.btvn_work w set expected_due_at = b.expected_cu, next_actual_class_at = b.actual_cu,
--        due_source_identity = b.source_cu, receipts = b.receipts_cu, revision = w.revision + 1
--   from mtm_hw_private.btvn_sua_han_1925_v2_saoluu b
--  where w.student_id = b.student_id and w.lesson_code = b.lesson_code;
-- drop table mtm_hw_private.btvn_sua_han_1925_v2_saoluu;
-- commit;
