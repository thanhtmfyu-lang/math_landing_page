-- 045 (18/10, anh Thành chốt 15/10): lớp web "2K10 Thứ 3, 6" CHÍNH LÀ nhóm 2K10 XPS 9+ (T3 cố định + buổi 2 T6/CN).
-- Bảng class_alias ánh xạ nhãn lớp web -> nhãn TKB; kho học vụ (ca, Zoom/vân tay, khớp tên) dùng nhãn chuẩn, KHÔNG đổi lớp trên web
-- (đồng bộ danh sách từ Sheet không bị lệch). BTVN vẫn theo lớp web thật. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.class_alias(label text primary key, as_label text not null);
alter table mtm_hw_private.class_alias enable row level security;
revoke all on mtm_hw_private.class_alias from public,anon,authenticated;
insert into mtm_hw_private.class_alias values ('2K10 Thứ 3, 6','2K10 9+') on conflict(label) do update set as_label=excluded.as_label;
create or replace function mtm_hw_private.lop_chuan(p text) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select a.as_label from mtm_hw_private.class_alias a where a.label=normalize(p,NFC)),p) $$;
revoke all on function mtm_hw_private.lop_chuan(text) from public,anon,authenticated;

create or replace function mtm_hw_private.dd_match_in(p_name text,p_classes text[],p_date date) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare n text=regexp_replace(mtm_hw_private.dd_clean_name(p_name),'\s+',' ','g'); w text[]; rot text; rot2 text; hit uuid[]; one uuid; rule int;
begin
 if n='' then return null; end if;
 select a.student_id into one from mtm_hw_private.attendance_alias a where a.name_fold=n;
 if one is not null then return one; end if;
 w=string_to_array(n,' ');
 rot=case when array_length(w,1)>=2 then array_to_string(w[2:],' ')||' '||w[1] else n end;
 rot2=case when array_length(w,1)>=2 then w[array_length(w,1)]||' '||array_to_string(w[1:array_length(w,1)-1],' ') else n end;
 for rule in 1..5 loop
  select array_agg(distinct s.id) into hit
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  where s.active and coalesce(s.source_identity,'') not like 'qa:%'
   and (mtm_hw_private.lop_chuan(c.label)=any(p_classes) or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=s.id and m.to_class=any(p_classes) and m.to_date=p_date and m.cancelled_at is null))
   and case rule
    when 1 then mtm_hw_private.vn_fold(s.full_name)=n
    when 2 then mtm_hw_private.vn_fold(s.full_name) in (rot,rot2)
    when 3 then array_length(w,1)>=2 and (mtm_hw_private.vn_fold(s.full_name) like '% '||n or mtm_hw_private.vn_fold(s.full_name) like '% '||rot or mtm_hw_private.vn_fold(s.full_name) like '% '||rot2)
    when 4 then array_length(w,1)>=2 and mtm_hw_private.vn_fold(s.full_name) like '%'||n||'%'
    else array_length(w,1)=1 and length(n)>=3 and mtm_hw_private.vn_fold(s.full_name) like '% '||n end;
  if array_length(hit,1)=1 then return hit[1]; end if;
  if array_length(hit,1)>1 then return null; end if; -- trùng nhiều em: không đoán
 end loop;
 return null;
end$$;

create or replace function mtm_hw_private.dd_auto_mark(p_source text,p_date date,p_sessions jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare r record; ss jsonb; cls text; n int=0; best_ov int; ov int; classes text[]; sid uuid; home text;
begin
 select array_agg(distinct c) into classes from (
  select x->>'class' c from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x
  union select x2.class_label from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x
   join mtm_hw_private.xps_slot x1 on x1.class_label=x->>'class' join mtm_hw_private.xps_slot x2 on x2.cohort=x1.cohort) q;
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date
   and (a.student_id is null or not (mtm_hw_private.lop_chuan(a.class_label)=any(coalesce(classes,'{}')))) loop
  sid=mtm_hw_private.dd_match_in(r.raw_name,coalesce(classes,'{}'),p_date);
  if sid is not null then
   select c.label into home from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id where s.id=sid;
   update mtm_hw_private.attendance_raw set student_id=sid,class_label=home where id=r.id;
  end if;
 end loop;
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date and a.student_id is not null loop
  cls=null; best_ov=0;
  for ss in select x from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x loop
   if ss->>'class'=mtm_hw_private.lop_chuan(r.class_label)
    or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=r.student_id and m.to_class=ss->>'class' and m.to_date=p_date and m.cancelled_at is null)
    or exists(select 1 from mtm_hw_private.xps_slot a1 join mtm_hw_private.xps_slot a2 on a2.cohort=a1.cohort
              where a1.class_label=ss->>'class' and a2.class_label=mtm_hw_private.lop_chuan(r.class_label)) then
    if p_source='van_tay' then ov=1000;
    else ov=least(mtm_hw_private.hm(r.time_out),mtm_hw_private.hm(ss->>'end'))-greatest(mtm_hw_private.hm(r.time_in),mtm_hw_private.hm(ss->>'start'));
    end if;
    if ov>best_ov or (ov=best_ov and ov>0 and ss->>'class'=mtm_hw_private.lop_chuan(r.class_label)) then best_ov=ov; cls=ss->>'class'; end if;
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

drop function if exists mtm_hw_private.hv_ca_rows(date,date);
create function mtm_hw_private.hv_ca_rows(p_from date,p_to date) returns table(
 ngay date, ca_lop text, gio text, che_do text, hoc_sinh text, lop_goc text, nguon_dk text, trang_thai text, hinh_thuc text, nguon_dd text,
 gio_vao text, gio_ra text, ghi_chu text, btvn_bai text, btvn_lan1 numeric, btvn_cao_nhat numeric, btvn_so_lan int, btvn_nop_muon boolean, student_id uuid)
language sql stable security definer set search_path='' as $$
 with recursive
 nowvn as (select (current_timestamp at time zone 'Asia/Ho_Chi_Minh') t),
 days as (select generate_series(p_from,p_to,'1 day')::date d),
 ca as (select d.d ngay,t.* from days d join mtm_hw_private.timetable t on t.weekday=mtm_hw_private.vn_wd(d.d)),
 hs as (select s.id,s.full_name,mtm_hw_private.lop_chuan(c.label) lop,s.class_id,split_part(c.label,' ',1) cohort,mtm_hw_private.lich_rieng(s.full_name) lr,
   exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=mtm_hw_private.lop_chuan(c.label)) is_xps
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%'),
 -- ===== ca thường (không thuộc nhóm XPS) =====
 dk as (
  select ca.ngay,ca.class_label,ca.start_hm,ca.end_hm,ca.mode,hs.id,'Lớp gốc'::text nguon,''::text con
  from ca join hs on mtm_hw_private.lop_tai(hs.id,hs.lop,ca.ngay)=ca.class_label
  where not exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=ca.class_label and x.weekday=ca.weekday and x.start_hm=ca.start_hm)
  union
  select m.to_date,m.to_class,coalesce(t.start_hm,''),coalesce(t.end_hm,''),coalesce(t.mode,''),m.student_id,'Chuyển đến',''
  from mtm_hw_private.schedule_moves m left join mtm_hw_private.timetable t on t.class_label=m.to_class and t.weekday=mtm_hw_private.vn_wd(m.to_date)
  where m.cancelled_at is null and m.to_date between p_from and p_to
   and not exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=m.to_class and x.weekday=mtm_hw_private.vn_wd(m.to_date))
 ),
 -- ===== nhóm XPS: mỗi em mỗi buổi đúng một ca =====
 wkd as (select generate_series(date_trunc('week',p_from)::date,(date_trunc('week',p_to)::date+6),'1 day')::date d),
 opt as (select date_trunc('week',w.d)::date wk,x.cohort,x.slot,w.d ngay,t.class_label,t.start_hm,t.end_hm,t.mode
  from wkd w join mtm_hw_private.xps_slot x on x.weekday=mtm_hw_private.vn_wd(w.d)
  join mtm_hw_private.timetable t on t.class_label=x.class_label and t.weekday=x.weekday and t.start_hm=x.start_hm),
 slots as (select distinct wk,cohort,slot from opt where wk between date_trunc('week',p_from)::date and date_trunc('week',p_to)::date),
 pick as (
  select s.wk,s.slot,h.id,ch.*
  from slots s join hs h on h.is_xps and h.cohort=s.cohort
  cross join lateral (
   select o.ngay,o.class_label,o.start_hm,o.end_hm,o.mode,
    case when a.student_id is not null then case when o.class_label=mtm_hw_private.lop_tai(h.id,h.lop,o.ngay) then 'Lớp gốc' else 'Học ca khác cùng buổi' end
     when m.id is not null then 'Chuyển đến'
     when h.lr is not null and mtm_hw_private.vn_wd(o.ngay) in (select jsonb_array_elements_text(h.lr->'days')::int) and o.start_hm=h.lr->>'start' then 'Lịch riêng'
     else 'Lớp gốc' end nguon,
    (select string_agg(to_char(o2.ngay,'DD/MM')||' '||o2.class_label,', ' order by o2.ngay) from opt o2
      where o2.wk=s.wk and o2.cohort=s.cohort and o2.slot=s.slot
       and (o2.ngay+o2.end_hm::time) > (select t from nowvn) and not (o2.ngay=o.ngay and o2.class_label=o.class_label)) con
   from opt o
   left join mtm_hw_private.attendance a on a.student_id=h.id and a.session_date=o.ngay and a.class_label=o.class_label
   left join mtm_hw_private.schedule_moves m on m.student_id=h.id and m.to_date=o.ngay and m.to_class=o.class_label and m.cancelled_at is null
   where o.wk=s.wk and o.cohort=s.cohort and o.slot=s.slot
   order by (a.student_id is not null and a.status in ('co_mat','hoc_online','di_muon','ve_som')) desc,(a.student_id is not null) desc,(m.id is not null) desc,
    (h.lr is not null and mtm_hw_private.vn_wd(o.ngay) in (select jsonb_array_elements_text(h.lr->'days')::int) and o.start_hm=h.lr->>'start') desc,
    (o.class_label=mtm_hw_private.lop_tai(h.id,h.lop,o.ngay)) desc,o.ngay desc,o.start_hm desc
   limit 1) ch
 ),
 allrows as (
  select ngay,class_label,start_hm,end_hm,mode,id,nguon,con from dk
  union all
  select ngay,class_label,start_hm,end_hm,mode,id,nguon,con from pick where ngay between p_from and p_to
 ),
 dk2 as (
  select r.*,exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=r.id and m.from_date=r.ngay and m.from_class=r.class_label
    and m.cancelled_at is null and not (m.to_date=r.ngay and m.to_class=r.class_label)) chuyen_di
  from (select distinct on (ngay,class_label,start_hm,id) * from allrows order by ngay,class_label,start_hm,id,case nguon when 'Chuyển đến' then 1 else 2 end) r
 )
 select dk2.ngay,dk2.class_label,dk2.start_hm||'-'||dk2.end_hm,dk2.mode,btrim(regexp_replace(hs.full_name,'\s*[\(\[].*$','')),mtm_hw_private.lop_tai(hs.id,hs.lop,dk2.ngay),
  case when dk2.chuyen_di then 'Đã chuyển đi' else dk2.nguon end,
  case when dk2.chuyen_di then 'Chuyển buổi'
   when a.status in ('co_mat','hoc_online','di_muon','ve_som') then 'Có mặt'
   when a.status='vang_phep' then 'Vắng có phép'
   when a.status='vang' then 'Vắng không phép'
   when (dk2.ngay+dk2.end_hm::time) > (select t from nowvn)-interval '45 minutes' then 'Chưa học'
   when coalesce(dk2.con,'')<>'' then 'Chưa học (còn ca '||dk2.con||')'
   when (case when dk2.mode ilike '%tại lớp%' then exists(select 1 from mtm_hw_private.attendance_raw rv where rv.source='van_tay' and rv.session_date=dk2.ngay and split_part(coalesce(rv.class_label,''),' ',1)=split_part(dk2.class_label,' ',1)) when dk2.mode ilike '%zoom%' or dk2.mode ilike '%online%' then exists(select 1 from mtm_hw_private.attendance_raw rz where rz.source='zoom' and rz.session_date=dk2.ngay) else false end) then 'Vắng không phép'
   else 'Chưa có điểm danh' end,
  case when a.status='hoc_online' then 'Online' when a.status in ('co_mat','di_muon','ve_som') then 'Offline' else '' end,
  case a.source when 'van_tay' then 'Vân tay' when 'zoom' then 'Zoom' when 'quan_ly' then 'Quản lý' when 'phu_huynh' then 'Phụ huynh'
   when 'hoc_sinh' then 'Học sinh' when 'chuyen_buoi' then 'Chuyển buổi' else
    case when a.status is null and not dk2.chuyen_di and coalesce(dk2.con,'')='' and (dk2.ngay+dk2.end_hm::time) <= (select t from nowvn)-interval '45 minutes' and (case when dk2.mode ilike '%tại lớp%' then exists(select 1 from mtm_hw_private.attendance_raw rv where rv.source='van_tay' and rv.session_date=dk2.ngay and split_part(coalesce(rv.class_label,''),' ',1)=split_part(dk2.class_label,' ',1)) when dk2.mode ilike '%zoom%' or dk2.mode ilike '%online%' then exists(select 1 from mtm_hw_private.attendance_raw rz where rz.source='zoom' and rz.session_date=dk2.ngay) else false end) then 'Tự suy: không có vân tay/Zoom, không xin phép' else '' end end,
  a.time_in,a.time_out,
  concat_ws('; ',nullif(case when a.status='di_muon' then 'Đi muộn' when a.status='ve_som' then 'Về sớm' end,''),
   nullif(case when a.note like 'Zoom%' or a.note='Vân tay' then null else a.note end,'')),
  b.title,b.first_score,b.best_score,b.n,b.first_late,hs.id
 from dk2 join hs on hs.id=dk2.id
 left join mtm_hw_private.attendance a on a.student_id=dk2.id and a.session_date=dk2.ngay and a.class_label=dk2.class_label
 left join lateral (
  select coalesce(l.exam->>'title',l.code) title,
   (select o.score from mtm_hw_private.btvn_official_receipts(hs.id,l.code) o where o.submitted_at is not null order by o.submitted_at limit 1) first_score,
   (select max(o.score) from mtm_hw_private.btvn_official_receipts(hs.id,l.code) o) best_score,
   (select count(*)::int from mtm_hw_private.btvn_official_receipts(hs.id,l.code) o where o.submitted_at is not null) n,
   (select coalesce((o.receipt->>'late')::boolean,false) from mtm_hw_private.btvn_official_receipts(hs.id,l.code) o where o.submitted_at is not null order by o.submitted_at limit 1) first_late
  from mtm_hw_private.btvn_lessons l
  where l.active and l.kind='btvn' and hs.class_id=any(l.class_ids)
   and coalesce(l.material->'classDates'->>(select c3.label from mtm_hw_private.classes c3 where c3.id=hs.class_id),l.material->>'date')::date < dk2.ngay
  order by coalesce(l.material->'classDates'->>(select c3.label from mtm_hw_private.classes c3 where c3.id=hs.class_id),l.material->>'date')::date desc limit 1) b on true
$$;
revoke all on function mtm_hw_private.hv_ca_rows(date,date) from public,anon,authenticated;
commit;
