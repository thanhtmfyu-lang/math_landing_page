-- 00_migration_ham_luat_han.sql — BẢN v3 (20/10/2026). SỬA HÀM TRÊN DB (không đụng dữ liệu học sinh). Một giao dịch.
-- Thay bản v2 (giữ ở 00_migration_ham_luat_han_v2.sql để tham khảo). Bản chép cho repo: 202610190071_btvn_due_rules_v2.sql (đã cập nhật = v3). CHƯA ÁP.
-- =====================================================================================
-- DIỄN TẬP TRƯỚC: thay dòng "commit;" (dòng đứng riêng, ngay trước "Bước 5") bằng "rollback;" rồi chạy cả tệp.
--   Không lỗi đỏ, kết quả cuối hien_trang = 'CHUA AP (dien tap ...)'. Sau đó dán lại tệp gốc (có "commit;") và chạy
--   thật MỘT lần: hien_trang = 'DA AP'. Có lỗi đỏ (kể cả "DUNG: ..."): dừng, copy nguyên văn gửi về. Lỗi thì DB giữ nguyên.
-- =====================================================================================
-- v3 đổi so với v2 (v2 dừng ở Bước 1 trên DB thật 00:30 20/10 vì DB có nhánh "LENH-CODEX-2" riêng tuần 19–25/10):
--  * Chỉ chạy khi md5(pg_get_functiondef(sync_due)) = c748541a5bf88fcc8cb6ff5c4f660020 (bản đã đọc 00:20 20/10, xem DB_HIEN_TAI_20261020.sql).
--  * Gỡ nhánh riêng tuần 19–25/10 khỏi CẢ HAI hàm (nhánh tính "ca kế tiếp trong xps_slot", logic anh đã bỏ).
-- Tệp làm 3 việc, trong MỘT giao dịch:
--  1. Thay toàn bộ thân mtm_hw_private.btvn_planned_due(text,date,integer,jsonb) bằng luật lớp của repo
--     (server/btvn/class-rules.json = bảng anh chốt 15/10 + bổ sung 19/10; KHÔNG dùng "ngày giao + 7"),
--     hạn = giờ bắt đầu buổi hạn − 30 phút, không còn nhánh LENH-CODEX-2 / xps_slot. Giữ chữ ký, tên tham số, mặc định,
--     search_path='', quyền (CREATE OR REPLACE giữ ACL, tệp tự so ACL trước/sau). Đổi STABLE -> IMMUTABLE như bản repo 020
--     (hàm không còn đọc bảng; không có index/view nào dựa vào hàm này).
--  2. public.mtm_btvn_sync_due: xóa nguyên khối dòng 68–127 (nhánh tuần 19–25/10, có "continue"), kiểm trước dòng 68 / 126 / 127
--     đúng chữ, khối có xps_slot; dòng 67 cũng bỏ nếu nó chỉ là dòng chú thích ("-- ..."). Sau khi xóa, vá nhánh chuẩn bằng 7 chỗ thay chữ, mỗi chỗ phải xuất hiện ĐÚNG 1 lần:
--     vẫn ghép điểm danh theo GIỜ BẮT ĐẦU buổi, nhưng LƯU hạn = giờ bắt đầu − 30 phút (expected_due_at, next_actual_class_at),
--     cờ "muộn" theo mốc đó; 2K10 9+ buổi T6/CN không rõ ca thì lấy CN (thay vì để trống hạn).
--     Biến khai báo thừa của nhánh cũ (due_cohort, personal, ...) và trường fallbackDues/deadlineNote trong summary được để nguyên
--     (vô hại; fallbackDues sẽ luôn = 0).
--  3. Kiểm sau: 20 mốc hạn (cả mặc định lẫn p_rules = class-rules.json như Edge gửi), ACL không đổi, IMMUTABLE, hai hàm
--     không còn 'LENH-CODEX', 'xps_slot', '2026-10-19'; chạy thử sync_due ở chế độ khô (không ghi) để chắc hàm biên dịch được.
-- Lưu ý: migration 068 (chưa áp) sẽ tự dừng ở kiểm băm sau 00; cần làm lại. Không đụng dữ liệu học sinh.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Bước 1: kiểm tra trước (chưa đổi gì)
do $kiem$
declare fn oid; names text[]; src text; ln text[]; rest text; a text[];
begin
  fn := to_regprocedure('mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)');
  if fn is null then raise exception 'DUNG: khong co ham mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)'; end if;
  if to_regprocedure('mtm_hw_private.btvn_planned_due(text,date)') is not null
     or to_regprocedure('mtm_hw_private.btvn_planned_due(text,date,integer)') is not null then
    raise exception 'DUNG: co them ban btvn_planned_due khac chu ky (2 hoac 3 tham so). Khong sua, bao ve.';
  end if;
  select proargnames into names from pg_proc where oid = fn;
  if names is distinct from array['p_label','p_day','p_slot','p_rules'] then
    raise exception 'DUNG: ten tham so ham hien tai la %, khac p_label,p_day,p_slot,p_rules', names;
  end if;
  if (select prorettype from pg_proc where oid = fn) <> 'timestamptz'::regtype then
    raise exception 'DUNG: ham hien tai khong tra timestamptz';
  end if;
  if to_regprocedure('public.mtm_btvn_sync_due(jsonb,boolean)') is null then
    raise exception 'DUNG: khong co public.mtm_btvn_sync_due(jsonb,boolean)';
  end if;
  src := pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure);
  if position('00-han-30' in src) > 0 then raise exception 'DUNG: 00 da ap truoc day (sync_due da co dau 00-han-30).'; end if;
  if md5(src) <> 'c748541a5bf88fcc8cb6ff5c4f660020' then
    raise exception 'DUNG: sync_due tren DB da doi so voi ban doc 00:20 20/10 (md5 % ), khong sua. Doc lai ham gui ve.', md5(src);
  end if;
  ln := string_to_array(src, E'\n');
  if btrim(ln[68]) <> 'if r.lesson_day::date between date ''2026-10-19'' and date ''2026-10-25'' then' or btrim(ln[126]) <> 'continue;' or btrim(ln[127]) <> 'end if;'
     or position('xps_slot' in array_to_string(ln[68:127], E'\n')) = 0 then
    raise exception 'DUNG: khoi dong 68-127 cua sync_due khong dung nhu da doc. Khong sua.';
  end if;
  -- dòng 67 là dòng chú thích của nhánh cũ (nếu là chú thích thuần) thì bỏ luôn; dòng lệnh thì giữ
  rest := array_to_string(ln[1:(case when btrim(ln[67]) like '--%' then 66 else 67 end)] || ln[128:array_length(ln, 1)], E'\n');
  if position('xps_slot' in rest) > 0 or position('LENH-CODEX' in rest) > 0 or position('2026-10-19' in rest) > 0 then
    raise exception 'DUNG: sau khi bo dong 68-127 van con xps_slot/LENH-CODEX/2026-10-19 o cho khac. Khong sua, bao ve.';
  end if;
  foreach a slice 1 in array array[
    array['planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules);',
     'planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules)+interval ''30 minutes''; /*00-han-30: planned = gio bat dau buoi, han luu = gio bat dau - 30 phut*/'],
    array['if slot_count<>1 then slot_day=null;end if;',
     'if slot_count<>1 then slot_day=7;end if; /*00v3: 2K10 9+ khong ro ca T6/CN -> CN*/'],
    array['previous_work.expected_due_at=expected',
     'previous_work.expected_due_at=expected-interval ''30 minutes'''],
    array['actual=previous_work.next_actual_class_at;src=previous_work.due_source_identity;',
     'actual=previous_work.next_actual_class_at+interval ''30 minutes'';src=previous_work.due_source_identity;'],
    array['(x->>''submittedAt'')::numeric>=extract(epoch from actual)*1000',
     '(x->>''submittedAt'')::numeric>=extract(epoch from actual-interval ''30 minutes'')*1000'],
    array['set expected_due_at=expected,next_actual_class_at=actual,due_source_identity=src,receipts=new_receipts,revision=revision+1',
     'set expected_due_at=expected-interval ''30 minutes'',next_actual_class_at=actual-interval ''30 minutes'',due_source_identity=src,receipts=new_receipts,revision=revision+1'],
    array['is distinct from (expected,actual,src,new_receipts);',
     'is distinct from (expected-interval ''30 minutes'',actual-interval ''30 minutes'',src,new_receipts);']
  ] loop
    if (length(rest) - length(replace(rest, a[1], ''))) / length(a[1]) <> 1 then
      raise exception 'DUNG: sau khi bo khoi 68-127, chuoi neo khong xuat hien dung 1 lan: %', left(a[1], 70);
    end if;
  end loop;
  perform set_config('mtm00.acl_fn', coalesce((select proacl::text from pg_proc where oid = fn), ''), true);
  perform set_config('mtm00.acl_sync', coalesce((select proacl::text from pg_proc where oid = 'public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure), ''), true);
end
$kiem$;

-- Bước 2: thay thân hàm luật hạn (giữ chữ ký, quyền; bỏ nhánh LENH-CODEX-2)
create or replace function mtm_hw_private.btvn_planned_due(p_label text,p_day date,p_slot integer default null,p_rules jsonb default null)
returns timestamptz language plpgsql immutable set search_path='' as $plan$
declare cfg jsonb=coalesce(p_rules,'{"timezone":"Asia/Ho_Chi_Minh","notes":["Cặp T4-T5 mở sau T4; 2K10 Thứ 3, 6 hạn cùng thứ tuần sau theo hai giả định trong thiết kế đợt 24."],"classes":{"2K9 9+":{"sessions":[{"weekday":1,"start":"17:30","end":"19:30"},{"weekday":3,"start":"17:30","end":"19:30"},{"weekday":5,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K14":{"sessions":[{"weekday":1,"start":"18:00","end":"20:00"},{"weekday":4,"start":"09:00","end":"11:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":6,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":4,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":4,"weeks":0},"4":{"weekday":2,"weeks":1}}}},"2K9 8+":{"sessions":[{"weekday":2,"start":"17:30","end":"19:30"},{"weekday":4,"start":"17:30","end":"19:30"},{"weekday":6,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K10 9+":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"08:00","end":"10:00"}],"open":{"type":"paired","sourceLabel":"2K10 9+","days":{"7":5}},"due":{"type":"slot_by_attendance"}},"2K13":{"sessions":[{"weekday":2,"start":"20:00","end":"22:00"},{"weekday":5,"start":"20:00","end":"22:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 8+":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":7,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 XPT":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":6,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA.2":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K12":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"15:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K15":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"14:00","end":"16:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 9+":{"sessions":[{"weekday":4,"start":"19:30","end":"21:30"},{"weekday":7,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 8+":{"sessions":[{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"10:00","end":"12:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"TSA":{"sessions":[{"weekday":7,"start":"14:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K9 HSA (THỨ 5)":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K10 Thứ 3, 6":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 HSA (CN)":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}}}}'::jsonb);r jsonb;w integer=extract(isodow from p_day);target integer=w;days integer=7;first_day integer;next_day integer;tm text;m jsonb;
begin
 r=cfg->'classes'->p_label;if r is null then return null;end if;
 case r->'due'->>'type'
 when 'same_weekday_next_week' then null;
 when 'map' then m=r->'due'->'days'->w::text;if m is null then return null;end if;target=(m->>'weekday')::integer;days=target-w+7*(m->>'weeks')::integer;
 when 'pair_next' then first_day=(r->'open'->'days'->>w::text)::integer;if first_day is null then return null;end if;next_day=case when first_day=5 then 1 else first_day+2 end;target=next_day+case when p_label='2K9 8+' then 1 else 0 end;days=case when next_day<=first_day then 7 else 0 end+target-w;
 when 'slot_by_attendance' then if w<>2 then if p_slot is null or p_slot not in (5,7) then return null;end if;target=p_slot;days=target-w+7;end if;
 when 'next_session' then select (x->>'weekday')::integer,case when ((x->>'weekday')::integer-w+7)%7=0 then 7 else ((x->>'weekday')::integer-w+7)%7 end into target,days from jsonb_array_elements(r->'sessions')x order by 2 limit 1;
 else raise exception 'Invalid due rule';end case;
 select x->>'start' into tm from jsonb_array_elements(r->'sessions')x where (x->>'weekday')::integer=target order by x->>'start' desc limit 1;
 if tm is null then return null;end if;
 -- 00 v3 (20/10/2026): hạn = 30 phút trước giờ bắt đầu buổi hạn (quy định trung tâm). Không còn nhánh riêng tuần 19–25/10.
 return ((p_day+days)::text||'T'||tm||':00+07:00')::timestamptz - interval '30 minutes';
end $plan$;

-- Bước 3: sync_due — bỏ khối dòng 68–127, vá nhánh chuẩn (giữ quyền, timeout, phần còn lại của bản đang chạy)
do $va$
declare src text; ln text[]; fixed text; a text[];
begin
  src := pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure);
  if md5(src) <> 'c748541a5bf88fcc8cb6ff5c4f660020' then raise exception 'DUNG: sync_due vua bi doi giua chung'; end if;
  ln := string_to_array(src, E'\n');
  fixed := array_to_string(ln[1:(case when btrim(ln[67]) like '--%' then 66 else 67 end)] || ln[128:array_length(ln, 1)], E'\n');
  foreach a slice 1 in array array[
    array['planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules);',
     'planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules)+interval ''30 minutes''; /*00-han-30: planned = gio bat dau buoi, han luu = gio bat dau - 30 phut*/'],
    array['if slot_count<>1 then slot_day=null;end if;',
     'if slot_count<>1 then slot_day=7;end if; /*00v3: 2K10 9+ khong ro ca T6/CN -> CN*/'],
    array['previous_work.expected_due_at=expected',
     'previous_work.expected_due_at=expected-interval ''30 minutes'''],
    array['actual=previous_work.next_actual_class_at;src=previous_work.due_source_identity;',
     'actual=previous_work.next_actual_class_at+interval ''30 minutes'';src=previous_work.due_source_identity;'],
    array['(x->>''submittedAt'')::numeric>=extract(epoch from actual)*1000',
     '(x->>''submittedAt'')::numeric>=extract(epoch from actual-interval ''30 minutes'')*1000'],
    array['set expected_due_at=expected,next_actual_class_at=actual,due_source_identity=src,receipts=new_receipts,revision=revision+1',
     'set expected_due_at=expected-interval ''30 minutes'',next_actual_class_at=actual-interval ''30 minutes'',due_source_identity=src,receipts=new_receipts,revision=revision+1'],
    array['is distinct from (expected,actual,src,new_receipts);',
     'is distinct from (expected-interval ''30 minutes'',actual-interval ''30 minutes'',src,new_receipts);']
  ] loop
    fixed := replace(fixed, a[1], a[2]);
  end loop;
  execute fixed;
end
$va$;

-- Bước 4: kiểm tra sau (sai là hủy toàn bộ)
do $sau$
declare v record; bad int := 0; src text; psrc text; a text[]; dry jsonb;
begin
  for v in select * from (values
      ('2K10 XPT', date '2026-10-24', null::int, timestamptz '2026-10-31 15:00+07'),
      ('2K9 XPT', date '2026-10-19', null::int, timestamptz '2026-10-26 19:00+07'),
      ('2K9 XPT', date '2026-10-20', null::int, timestamptz '2026-10-22 19:00+07'),
      ('2K9 9+', date '2026-10-19', null::int, timestamptz '2026-10-21 17:00+07'),
      ('2K9 8+', date '2026-10-20', null::int, timestamptz '2026-10-22 17:00+07'),
      ('2K9 8+', date '2026-10-24', null::int, timestamptz '2026-10-27 17:00+07'),
      ('2K10 9+', date '2026-10-20', null::int, timestamptz '2026-10-27 19:00+07'),
      ('2K10 8+', date '2026-10-25', null::int, timestamptz '2026-11-01 09:30+07'),
      ('2K10 8+', date '2026-10-23', null::int, timestamptz '2026-10-30 19:00+07'),
      ('2K11 8+', date '2026-10-21', null::int, timestamptz '2026-10-28 19:00+07'),
      ('2K11 8+', date '2026-10-25', null::int, timestamptz '2026-11-01 15:00+07'),
      ('2K11 9+', date '2026-10-22', null::int, timestamptz '2026-10-29 19:00+07'),
      ('2K11 9+', date '2026-10-25', null::int, timestamptz '2026-11-01 13:00+07'),
      ('2K11 XPT', date '2026-10-24', null::int, timestamptz '2026-10-31 13:00+07'),
      ('2K10 9+', date '2026-10-25', 5, timestamptz '2026-10-30 19:00+07'),
      ('2K10 9+', date '2026-10-25', 7, timestamptz '2026-11-01 07:30+07'),
      ('2K10 9+', date '2026-10-25', null::int, null::timestamptz),
      ('HSA', date '2026-10-25', null::int, timestamptz '2026-11-01 16:30+07'),
      ('2K9 XPT', date '2026-10-12', null::int, timestamptz '2026-10-19 19:00+07'),
      ('2K10 XPT', date '2026-10-31', null::int, timestamptz '2026-11-07 15:00+07')
    ) t(lop, ngay, ca, muon) loop
    if mtm_hw_private.btvn_planned_due(v.lop, v.ngay, v.ca) is distinct from v.muon
       or mtm_hw_private.btvn_planned_due(v.lop, v.ngay, v.ca, '{"timezone":"Asia/Ho_Chi_Minh","notes":["Cặp T4-T5 mở sau T4; 2K10 Thứ 3, 6 hạn cùng thứ tuần sau theo hai giả định trong thiết kế đợt 24."],"classes":{"2K9 9+":{"sessions":[{"weekday":1,"start":"17:30","end":"19:30"},{"weekday":3,"start":"17:30","end":"19:30"},{"weekday":5,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K14":{"sessions":[{"weekday":1,"start":"18:00","end":"20:00"},{"weekday":4,"start":"09:00","end":"11:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":6,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 XPT":{"sessions":[{"weekday":1,"start":"19:30","end":"21:30"},{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":4,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"map","days":{"1":{"weekday":1,"weeks":1},"2":{"weekday":4,"weeks":0},"4":{"weekday":2,"weeks":1}}}},"2K9 8+":{"sessions":[{"weekday":2,"start":"17:30","end":"19:30"},{"weekday":4,"start":"17:30","end":"19:30"},{"weekday":6,"start":"17:30","end":"19:30"}],"open":{"type":"paired","sourceLabel":"2K9 9+","days":{"1":1,"2":1,"3":3,"4":3,"5":5,"6":5}},"due":{"type":"pair_next"}},"2K10 9+":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"08:00","end":"10:00"}],"open":{"type":"paired","sourceLabel":"2K10 9+","days":{"7":5}},"due":{"type":"slot_by_attendance"}},"2K13":{"sessions":[{"weekday":2,"start":"20:00","end":"22:00"},{"weekday":5,"start":"20:00","end":"22:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 8+":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":7,"start":"15:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 XPT":{"sessions":[{"weekday":3,"start":"19:30","end":"21:30"},{"weekday":6,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA.2":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K12":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"15:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K15":{"sessions":[{"weekday":4,"start":"18:00","end":"20:00"},{"weekday":7,"start":"14:00","end":"16:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K11 9+":{"sessions":[{"weekday":4,"start":"19:30","end":"21:30"},{"weekday":7,"start":"13:30","end":"15:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K10 8+":{"sessions":[{"weekday":5,"start":"19:30","end":"21:30"},{"weekday":7,"start":"10:00","end":"12:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"TSA":{"sessions":[{"weekday":7,"start":"14:00","end":"17:00"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"HSA":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K9 HSA (THỨ 5)":{"sessions":[{"weekday":4,"start":"14:30","end":"17:30"}],"open":{"type":"after_session"},"due":{"type":"next_session"}},"2K10 Thứ 3, 6":{"sessions":[{"weekday":2,"start":"19:30","end":"21:30"},{"weekday":5,"start":"19:30","end":"21:30"}],"open":{"type":"after_session"},"due":{"type":"same_weekday_next_week"}},"2K9 HSA (CN)":{"sessions":[{"weekday":7,"start":"17:00","end":"20:00"}],"open":{"type":"after_session"},"due":{"type":"next_session"}}}}'::jsonb) is distinct from v.muon then
      bad := bad + 1;
      raise warning 'Sai moc: % % ca % -> % (can %)', v.lop, v.ngay, v.ca, mtm_hw_private.btvn_planned_due(v.lop, v.ngay, v.ca), v.muon;
    end if;
  end loop;
  if bad > 0 then raise exception 'DUNG: % moc han sai sau khi thay ham. Da huy.', bad; end if;
  if coalesce((select proacl::text from pg_proc where oid = 'mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)'::regprocedure), '') <> current_setting('mtm00.acl_fn')
     or coalesce((select proacl::text from pg_proc where oid = 'public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure), '') <> current_setting('mtm00.acl_sync') then
    raise exception 'DUNG: quyen (ACL) cua ham bi doi. Da huy.';
  end if;
  if (select provolatile from pg_proc where oid = 'mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)'::regprocedure) <> 'i' then
    raise exception 'DUNG: ham luat khong IMMUTABLE. Da huy.';
  end if;
  src := pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure);
  psrc := pg_get_functiondef('mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)'::regprocedure);
  if position('LENH-CODEX' in src || psrc) > 0 or position('xps_slot' in src || psrc) > 0 or position('2026-10-19' in src || psrc) > 0 then
    raise exception 'DUNG: van con nhanh rieng tuan 19-25/10 (LENH-CODEX/xps_slot). Da huy.';
  end if;
  foreach a slice 1 in array array[
    array['planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules);',
     'planned=mtm_hw_private.btvn_planned_due(r.label,r.lesson_day::date,slot_day,rules)+interval ''30 minutes''; /*00-han-30: planned = gio bat dau buoi, han luu = gio bat dau - 30 phut*/'],
    array['if slot_count<>1 then slot_day=null;end if;',
     'if slot_count<>1 then slot_day=7;end if; /*00v3: 2K10 9+ khong ro ca T6/CN -> CN*/'],
    array['previous_work.expected_due_at=expected',
     'previous_work.expected_due_at=expected-interval ''30 minutes'''],
    array['actual=previous_work.next_actual_class_at;src=previous_work.due_source_identity;',
     'actual=previous_work.next_actual_class_at+interval ''30 minutes'';src=previous_work.due_source_identity;'],
    array['(x->>''submittedAt'')::numeric>=extract(epoch from actual)*1000',
     '(x->>''submittedAt'')::numeric>=extract(epoch from actual-interval ''30 minutes'')*1000'],
    array['set expected_due_at=expected,next_actual_class_at=actual,due_source_identity=src,receipts=new_receipts,revision=revision+1',
     'set expected_due_at=expected-interval ''30 minutes'',next_actual_class_at=actual-interval ''30 minutes'',due_source_identity=src,receipts=new_receipts,revision=revision+1'],
    array['is distinct from (expected,actual,src,new_receipts);',
     'is distinct from (expected-interval ''30 minutes'',actual-interval ''30 minutes'',src,new_receipts);']
  ] loop
    if position(a[2] in src) = 0 then raise exception 'DUNG: sync_due sau va thieu doan: %', left(a[2], 60); end if;
  end loop;
  -- chạy khô (p_apply=false, không ghi gì) để chắc hàm biên dịch và chạy được
  dry := public.mtm_btvn_sync_due('{"sessions":[]}'::jsonb, false);
  if dry is null or dry->>'applied' <> 'false' then raise exception 'DUNG: chay kho sync_due khong ra ket qua. Da huy.'; end if;
  perform mtm_hw_private.btvn_planned_due('2K10 XPT', date '2026-10-24');  -- người gọi 2 tham số
  raise notice '00 v3: ham luat + sync_due da va trong giao dich, % moc dung, chay kho ok.', 20;
end
$sau$;

commit;

-- Bước 5: báo cáo (sau commit/rollback)
select case when position('00-han-30' in pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure)) > 0
            then 'DA AP' else 'CHUA AP (dien tap da rollback, hoac co loi o tren)' end as hien_trang,
       position('xps_slot' in pg_get_functiondef('public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure)) = 0 as sync_due_khong_con_xps_slot,
       (select provolatile from pg_proc where oid = 'mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)'::regprocedure) as ham_luat_volatile,
       to_char(mtm_hw_private.btvn_planned_due('2K10 XPT', date '2026-10-24') at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') as han_2k10_xpt_24_10,
       to_char(mtm_hw_private.btvn_planned_due('2K11 8+', date '2026-10-21') at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') as han_2k11_8_21_10,
       to_char(mtm_hw_private.btvn_planned_due('2K10 9+', date '2026-10-25', 5) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') as han_2k10_9_25_10_ca_t6;
