-- 03_kiem_tra.sql  — BẢN v2 (20/10/2026). CHỈ ĐỌC — kiểm tra sau khi chạy 02 v2.
-- Luật nằm trong tệp (= server/btvn/class-rules.json), hạn = giờ bắt đầu buổi hạn − 30 phút; không dùng hàm DB.
-- Mong đợi: so_dong_con_lech = 0, luat_trong_tep_dung = true, so_dong_da_sua = số 02 đã báo,
--   so_dong_da_sua_bi_ghi_de_lai = 0. Chạy lại sau lần đồng bộ điểm danh kế tiếp để phát hiện bị ghi đè.
-- Một dòng kết quả, chỉ số đếm.

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
),
db as (  -- THÔNG TIN: hàm mtm_hw_private.btvn_planned_due trên DB đang tính gì (không dùng để sửa)
  select case
    when coalesce(mtm_hw_private.btvn_planned_due('2K10 XPT', date '2026-10-24') = timestamptz '2026-10-31 15:00+07'
              and mtm_hw_private.btvn_planned_due('2K11 8+', date '2026-10-21') = timestamptz '2026-10-28 19:00+07'
              and mtm_hw_private.btvn_planned_due('2K10 9+', date '2026-10-25') is null, false) then 'DUNG LUAT (da ap 00: gio bat dau - 30 phut)'
    when coalesce(mtm_hw_private.btvn_planned_due('2K10 XPT', date '2026-10-24') = timestamptz '2026-10-31 15:30+07'
              and mtm_hw_private.btvn_planned_due('2K11 8+', date '2026-10-21') = timestamptz '2026-10-28 19:30+07'
              and mtm_hw_private.btvn_planned_due('2K10 9+', date '2026-10-25') is null, false) then 'DUNG NGAY, GIO = GIO BAT DAU (ban repo 020, chua tru 30 phut)'
    else 'SAI LUAT (vd 2K10 XPT 24/10 -> ' || coalesce(to_char(mtm_hw_private.btvn_planned_due('2K10 XPT', date '2026-10-24') at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'), 'null') || ')'
  end as ham_db
)
select
  (select count(distinct (ma_bai, lop)) from hs)                                       as so_cap_bai_lop_trong_tuan,
  (select count(*) from hs where co_work and han_moi is not null)                      as so_dong_work_duoc_so,
  (select count(*) from hs where han_moi is null)                                      as so_hs_khong_tinh_duoc_han,
  (select count(*) from hs where hs.co_work and (hs.e < hs.han_moi or hs.a < hs.han_moi))                                                                          as so_dong_con_lech,
  (select count(distinct (ma_bai, lop)) from hs where co_work and (e < han_moi or a < han_moi)) as so_cap_bai_lop_con_lech,
  (select count(*) from hs where e = han_moi)                                          as so_dong_dung_han_luat,
  (select count(*) from hs where e > han_moi)                                          as so_dong_han_muon_hon_luat_giu_nguyen,
  (select count(*) from hs where co_work and han_moi is not null and e is null)        as so_dong_chua_co_han_du_kien,
  (select count(*) from hs where ca_txt like '5:%')                                     as so_2k10_9_ca_t6,
  (select count(*) from hs where ca_txt like '7:%')                                     as so_2k10_9_ca_cn,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml('select count(*) as n from mtm_hw_private.btvn_sua_han_1925_v2_saoluu', false, true, '')))[1]::text::int
  end                                                                                   as so_dong_da_sua,
  case when to_regclass('mtm_hw_private.btvn_sua_han_1925_v2_saoluu') is not null then
    (xpath('/row/n/text()', query_to_xml(
      'select count(*) as n from mtm_hw_private.btvn_sua_han_1925_v2_saoluu b
         join mtm_hw_private.btvn_work w using (student_id, lesson_code)
        where w.expected_due_at is null or w.expected_due_at < b.han_luat or w.next_actual_class_at < b.han_luat', false, true, '')))[1]::text::int
  end                                                                                   as so_dong_da_sua_bi_ghi_de_lai,
  (select luat_trong_tep_dung from kt)                                                  as luat_trong_tep_dung,
  (select ham_db from db)                                                               as ham_db;
