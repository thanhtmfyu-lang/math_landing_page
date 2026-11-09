-- 106 (08/11/2026): BTVN tự ghi hạn nộp (expected_due_at) ngay khi bài được đăng, không còn chờ máy đồng bộ điểm danh.
--
-- Lỗi gốc: expected_due_at chỉ được ghi trong public.mtm_btvn_sync_due, mà hàm này chỉ chạy khi worker VPS gửi
--   snapshot điểm danh (action sync_due). Từ 26–28/10 điểm danh chuyển sang Sổ chính, worker không còn gửi sync_due,
--   nên mọi BTVN đăng sau đó không có dòng btvn_work / không có hạn (luồng "Đưa đủ BTVN tuần này lên web" phải ghi tay
--   cho 26/10–01/11 và 02–08/11). Báo trước ca, bảng cuối ca, sổ điểm đều đọc w.expected_due_at.
--
-- Sửa (không phụ thuộc VPS hay PC):
--  1. Trigger BEFORE trên btvn_work: dòng chưa có hạn thì tự tính hạn = mtm_hw_private.btvn_planned_due(lớp, ngày bài)
--     (luật lớp đang chạy trên DB: bài thứ nào hạn đúng thứ đó tuần sau, giờ vào ca − 30 phút). 2K10 9+ buổi T6/CN tính
--     theo chính thứ của bài. Không ghi đè hạn đã có (hạn ghi tay, hạn cổng GV, hạn sync_due, gia hạn).
--     Chỉ ghi expected_due_at, không đụng next_actual_class_at (ca thật) hay cờ muộn của bài đã nộp.
--  2. Trigger AFTER trên btvn_lessons: bài BTVN đang mở được đăng / sửa lớp / sửa ngày → tạo dòng btvn_work cho mọi
--     HS đang học của lớp (cùng chủ, cùng is_test, chưa nghỉ hẳn trước ngày bài), như sync_due từng làm. Đổi ngày bài thì
--     dòng nào đang giữ đúng hạn tự tính cũ được tính lại; hạn ghi tay khác giá trị đó giữ nguyên.
--  3. Bù một lần cho bài từ 26/10/2026: chỉ thêm dòng còn thiếu và điền hạn đang trống.
-- Hai trigger nuốt lỗi (WARNING) để không bao giờ chặn việc đăng bài hay nộp bài.
-- Chạy lại vô hại. Không có dữ liệu học sinh trong tệp.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $kiem$
begin
 if to_regprocedure('mtm_hw_private.btvn_planned_due(text,date,integer,jsonb)') is null then raise exception 'HAN_TU_GHI_NO_PLANNED_DUE';end if;
 if not exists(select 1 from information_schema.columns where table_schema='mtm_hw_private' and table_name='btvn_lessons' and column_name='is_test')
  then raise exception 'HAN_TU_GHI_NEEDS_IS_TEST';end if;
end$kiem$;

-- Ngày bài của một lớp: classDates theo nhãn lớp, rồi material.date.
create or replace function mtm_hw_private.btvn_lesson_day(p_material jsonb,p_label text) returns date
language plpgsql immutable set search_path='' as $$
declare v text=coalesce(p_material->'classDates'->>p_label,p_material->>'date');
begin
 if v is null or v !~ '^\d{4}-\d{2}-\d{2}' then return null;end if;
 return left(v,10)::date;
exception when others then return null;
end$$;

-- Hạn tự tính cho một lớp + ngày bài (luật lớp trên DB). 2K10 9+ bài T6/CN: lấy đúng thứ của bài.
create or replace function mtm_hw_private.btvn_auto_due(p_label text,p_day date) returns timestamptz
language plpgsql stable set search_path='' as $$
declare w integer;
begin
 if p_label is null or p_day is null then return null;end if;
 w=extract(isodow from p_day)::integer;
 return mtm_hw_private.btvn_planned_due(p_label,p_day,case when w in (5,7) then w else null end,null);
exception when others then return null;
end$$;

create or replace function mtm_hw_private.btvn_auto_due_for(p_student uuid,p_lesson text) returns timestamptz
language sql stable security definer set search_path='' as $$
 select mtm_hw_private.btvn_auto_due(c.label,mtm_hw_private.btvn_lesson_day(l.material,c.label))
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 join mtm_hw_private.btvn_lessons l on l.code=p_lesson and l.kind='btvn'
 where s.id=p_student
$$;

create or replace function mtm_hw_private.btvn_work_auto_due() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.expected_due_at is null and (TG_OP='INSERT' or old.expected_due_at is null) then
  begin
   new.expected_due_at=mtm_hw_private.btvn_auto_due_for(new.student_id,new.lesson_code);
  exception when others then raise warning 'btvn_work_auto_due: %',sqlerrm;
  end;
 end if;
 return new;
end$$;
-- Tên "a_m..." chạy sau a_lesson_upload_due (hạn cổng GV thắng) và trước btvn_override_receipts.
drop trigger if exists a_mtm_auto_due on mtm_hw_private.btvn_work;
create trigger a_mtm_auto_due before insert or update on mtm_hw_private.btvn_work
 for each row execute function mtm_hw_private.btvn_work_auto_due();

create or replace function mtm_hw_private.btvn_lesson_fill_work(p_code text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into mtm_hw_private.btvn_work(student_id,lesson_code)
 select s.id,l.code from mtm_hw_private.btvn_lessons l
 join mtm_hw_private.students s on s.class_id=any(l.class_ids) and s.owner_id=l.owner_id and s.is_test=l.is_test and s.active
 join mtm_hw_private.classes c on c.id=s.class_id and c.active
 where l.code=p_code and l.active and l.kind='btvn'
  and mtm_hw_private.btvn_lesson_day(l.material,c.label) is not null
  and (mtm_hw_private.nghi_tu(s.id) is null or mtm_hw_private.nghi_tu(s.id)>mtm_hw_private.btvn_lesson_day(l.material,c.label))
  and not exists(select 1 from mtm_test100.cleanup_jobs j where j.student_id=s.id)
 on conflict do nothing;
 get diagnostics n=row_count;
 -- Dòng có sẵn nhưng chưa có hạn (vd tạo lúc HS mở bài trước khi có trigger).
 update mtm_hw_private.btvn_work w set expected_due_at=mtm_hw_private.btvn_auto_due_for(w.student_id,w.lesson_code)
  where w.lesson_code=p_code and w.expected_due_at is null and mtm_hw_private.btvn_auto_due_for(w.student_id,w.lesson_code) is not null;
 return n;
end$$;

create or replace function mtm_hw_private.btvn_lesson_auto_work() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind is distinct from 'btvn' or not new.active then return null;end if;
 begin
  -- Đổi ngày bài: tính lại dòng đang giữ đúng hạn tự tính theo ngày cũ.
  if TG_OP='UPDATE' and old.material is distinct from new.material then
   update mtm_hw_private.btvn_work w set expected_due_at=mtm_hw_private.btvn_auto_due(c.label,mtm_hw_private.btvn_lesson_day(new.material,c.label))
   from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
   where w.lesson_code=new.code and s.id=w.student_id
    and w.expected_due_at=mtm_hw_private.btvn_auto_due(c.label,mtm_hw_private.btvn_lesson_day(old.material,c.label))
    and mtm_hw_private.btvn_auto_due(c.label,mtm_hw_private.btvn_lesson_day(new.material,c.label)) is not null;
  end if;
  perform mtm_hw_private.btvn_lesson_fill_work(new.code);
 exception when others then raise warning 'btvn_lesson_auto_work: %',sqlerrm;
 end;
 return null;
end$$;
drop trigger if exists z_mtm_auto_work on mtm_hw_private.btvn_lessons;
create trigger z_mtm_auto_work after insert or update of active,class_ids,material,kind on mtm_hw_private.btvn_lessons
 for each row execute function mtm_hw_private.btvn_lesson_auto_work();

revoke all on function mtm_hw_private.btvn_lesson_day(jsonb,text),mtm_hw_private.btvn_auto_due(text,date),
 mtm_hw_private.btvn_auto_due_for(uuid,text),mtm_hw_private.btvn_work_auto_due(),
 mtm_hw_private.btvn_lesson_fill_work(text),mtm_hw_private.btvn_lesson_auto_work()
 from public,anon,authenticated,service_role;

-- Kiểm luật (giờ VN) với lớp đang mở trên DB: bài thứ nào hạn đúng thứ đó tuần sau, giờ vào ca − 30 phút.
do $kiem_luat$
declare t record;got timestamptz;n integer=0;
begin
 for t in select * from (values
   ('2K9 9+',  date '2026-11-09', timestamptz '2026-11-16 17:00+07'),
   ('2K9 8+',  date '2026-11-10', timestamptz '2026-11-17 17:00+07'),
   ('2K11 8+', date '2026-11-11', timestamptz '2026-11-18 19:00+07'),
   ('2K11 9+', date '2026-11-12', timestamptz '2026-11-19 19:00+07'),
   ('2K10 8+', date '2026-11-13', timestamptz '2026-11-20 19:00+07'),
   ('2K10 9+', date '2026-11-13', timestamptz '2026-11-20 19:00+07'),
   ('2K10 9+', date '2026-11-10', timestamptz '2026-11-17 19:00+07')) v(label,day,want)
  where exists(select 1 from mtm_hw_private.classes c where c.label=v.label and c.active) loop
  got=mtm_hw_private.btvn_auto_due(t.label,t.day);n=n+1;
  if got is distinct from t.want then raise exception 'HAN_TU_GHI_RULE % % got % want %',t.label,t.day,got,t.want;end if;
 end loop;
 raise notice 'HAN_TU_GHI kiem % moc',n;
end$kiem_luat$;

-- Bù một lần: bài BTVN đang mở có ngày từ 26/10/2026.
do $bu$
declare l record;
begin
 for l in select code from mtm_hw_private.btvn_lessons b where b.active and b.kind='btvn'
  and exists(select 1 from mtm_hw_private.classes c where c.id=any(b.class_ids) and mtm_hw_private.btvn_lesson_day(b.material,c.label)>=date '2026-10-26') loop
  perform mtm_hw_private.btvn_lesson_fill_work(l.code);
 end loop;
end$bu$;
commit;
