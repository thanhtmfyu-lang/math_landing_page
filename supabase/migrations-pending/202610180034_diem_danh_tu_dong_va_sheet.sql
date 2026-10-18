-- 034 (18/10, anh Thành): Zoom/vân tay tự ghi điểm danh vào đúng ca + xuất Sheet điểm danh (tổng hợp, Zoom, vân tay, chuyển buổi). ĐÃ ÁP (Claude).
-- Gọi mtm_dd_api action 'raw' kèm "sessions":[{class,start,end}] (ca có Zoom/ca tại lớp trong ngày theo TKB): em nào khớp tên thì tự đánh
-- 'hoc_online' (Zoom) / 'co_mat' (vân tay) vào ca của lớp em, hoặc ca em đã được chuyển đến; trùng giờ ít nhất 30 phút.
begin;
create or replace function mtm_hw_private.hm(x text) returns int language sql immutable set search_path='' as $$
 select case when x ~ '^\d{1,2}:\d{2}' then split_part(x,':',1)::int*60+split_part(x,':',2)::int end $$;

create or replace function mtm_hw_private.dd_auto_mark(p_source text,p_date date,p_sessions jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare r record; ss jsonb; cls text; n int=0; best_ov int; ov int;
begin
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date and a.student_id is not null loop
  cls=null; best_ov=0;
  for ss in select x from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x loop
   if ss->>'class'=r.class_label or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=r.student_id and m.to_class=ss->>'class' and m.to_date=p_date and m.cancelled_at is null) then
    if p_source='van_tay' then ov=1000; -- vân tay chỉ có giờ vào: có quét trong ngày của ca là có mặt
    else ov=least(mtm_hw_private.hm(r.time_out),mtm_hw_private.hm(ss->>'end'))-greatest(mtm_hw_private.hm(r.time_in),mtm_hw_private.hm(ss->>'start'));
    end if;
    if ov>best_ov then best_ov=ov; cls=ss->>'class'; end if;
   end if;
  end loop;
  if cls is not null and best_ov>=30 then
   perform mtm_hw_private.dd_put(r.student_id,cls,p_date,case when p_source='zoom' then 'hoc_online' else 'co_mat' end,p_source,r.time_in,r.time_out,
    case when p_source='zoom' then 'Zoom '||r.room||' '||coalesce(r.minutes::text,'')||' phút' else 'Vân tay' end,null);
   n=n+1;
  end if;
 end loop;
 return n;
end$$;

-- Bọc API: action 'raw' có "sessions" thì tự đánh điểm danh sau khi lưu bản gốc.
create or replace function public.mtm_dd_api2(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 r=public.mtm_dd_api(p);
 if p->>'action'='raw' and p ? 'sessions' and coalesce((r->>'ok')::boolean,false) then
  r=r||jsonb_build_object('marked',mtm_hw_private.dd_auto_mark(p->>'source',(p->>'date')::date,p->'sessions'));
 end if;
 return r;
end$$;
revoke all on function public.mtm_dd_api2(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api2(jsonb) to service_role;
revoke all on function mtm_hw_private.dd_auto_mark(text,date,jsonb),mtm_hw_private.hm(text) from public,anon,authenticated;

create or replace function mtm_hw_private.dd_status_vn(s text) returns text language sql immutable set search_path='' as $$
 select case s when 'co_mat' then 'Có mặt' when 'hoc_online' then 'Học online' when 'di_muon' then 'Đi muộn' when 've_som' then 'Về sớm'
  when 'vang_phep' then 'Vắng có phép' when 'vang' then 'Vắng' when 'chuyen_buoi' then 'Chuyển buổi' when 'du_kien' then 'Dự kiến (chuyển đến)' else coalesce(s,'') end $$;
create or replace function mtm_hw_private.dd_source_vn(s text) returns text language sql immutable set search_path='' as $$
 select case s when 'van_tay' then 'Vân tay' when 'zoom' then 'Zoom' when 'quan_ly' then 'Quản lý' when 'phu_huynh' then 'Phụ huynh'
  when 'hoc_sinh' then 'Học sinh' when 'chuyen_buoi' then 'Chuyển buổi (đã xác nhận)' else coalesce(s,'') end $$;

-- Sheet: thêm tab diemdanh, zoom, vantay, chuyenbuoi (giữ diem, xephang của 032).
create or replace function public.mtm_btvn_sheet_csv2(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text; q text='mtm_hw_private.csvq'; now_vn text;
begin
 if p_tab in ('diem','xephang') then return public.mtm_btvn_sheet_csv(p_tab); end if;
 now_vn=to_char(current_timestamp at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI');
 if p_tab='diemdanh' then
  head='Ngày,Ca (lớp),Học sinh,Lớp gốc,Trạng thái,Nguồn,Giờ vào,Giờ ra,Ghi chú,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(to_char(a.session_date,'DD/MM/YYYY')),mtm_hw_private.csvq(a.class_label),
   mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(c.label),mtm_hw_private.csvq(mtm_hw_private.dd_status_vn(a.status)),
   mtm_hw_private.csvq(mtm_hw_private.dd_source_vn(a.source)),mtm_hw_private.csvq(a.time_in),mtm_hw_private.csvq(a.time_out),mtm_hw_private.csvq(a.note),
   mtm_hw_private.csvq(to_char(a.updated_at at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI'))),E'\n' order by a.session_date desc,a.class_label,s.full_name) into body
  from mtm_hw_private.attendance a join mtm_hw_private.students s on s.id=a.student_id join mtm_hw_private.classes c on c.id=s.class_id;
 elsif p_tab in ('zoom','vantay') then
  head='Ngày,'||case when p_tab='zoom' then 'Phòng Zoom,Tên trên Zoom' else 'Máy/File,Tên trên máy vân tay' end||',Khớp học sinh,Lớp,Giờ vào,Giờ ra,Số phút,Các đoạn,Nhận lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(to_char(r.session_date,'DD/MM/YYYY')),mtm_hw_private.csvq(case when p_tab='zoom' then r.room else coalesce(r.file_ref,r.room) end),
   mtm_hw_private.csvq(r.raw_name),mtm_hw_private.csvq(coalesce(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')),'CHƯA KHỚP')),mtm_hw_private.csvq(r.class_label),
   mtm_hw_private.csvq(r.time_in),mtm_hw_private.csvq(r.time_out),mtm_hw_private.csvq(replace(coalesce(r.minutes::text,''),'.',',')),mtm_hw_private.csvq(r.segments),
   mtm_hw_private.csvq(to_char(r.created_at at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI'))),E'\n' order by r.session_date desc,r.room,r.time_in) into body
  from mtm_hw_private.attendance_raw r left join mtm_hw_private.students s on s.id=r.student_id
  where r.source=case when p_tab='zoom' then 'zoom' else 'van_tay' end;
 elsif p_tab='chuyenbuoi' then
  head='Học sinh,Từ lớp,Từ ngày,Sang lớp,Sang ngày,Lý do,Người xác nhận,Ghi lúc,Trạng thái';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(m.from_class),
   mtm_hw_private.csvq(to_char(m.from_date,'DD/MM/YYYY')),mtm_hw_private.csvq(m.to_class),mtm_hw_private.csvq(to_char(m.to_date,'DD/MM/YYYY')),
   mtm_hw_private.csvq(m.reason),mtm_hw_private.csvq(m.confirmed_by),mtm_hw_private.csvq(to_char(m.created_at at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI')),
   mtm_hw_private.csvq(case when m.cancelled_at is null then 'Hiệu lực' else 'Đã huỷ' end)),E'\n' order by m.id desc) into body
  from mtm_hw_private.schedule_moves m join mtm_hw_private.students s on s.id=m.student_id;
 else raise exception 'Invalid tab';
 end if;
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_btvn_sheet_csv2(text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_sheet_csv2(text) to service_role;
commit;
