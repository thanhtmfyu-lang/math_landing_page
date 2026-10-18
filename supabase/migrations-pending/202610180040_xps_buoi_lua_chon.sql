-- 040 (18/10, anh Thành chốt): lớp xuất phát sớm (XPS) 8+ và 9+ học CÙNG bài; mỗi tuần có Buổi 1, 2, 3, mỗi buổi nhiều ca để chọn,
-- học ca nào trong nhóm cũng được tính. Danh sách lớp 8+/9+ chỉ là lớp gốc, HS được nhảy ca trong cùng buổi.
--  2K9 : B1 T2(9+)/T3(8+); B2 T4(9+)/T5(8+); B3 T6(9+)/T7(8+); 17:30.
--  2K10: B1 T3 19:30(9+)/T6 19:30(8+) [thầy Thành]; B2 T6 19:30(9+, thầy Tài)/CN 08:00(9+)/CN 10:00(8+) [thầy Hiếu].
--  2K11: B1 T4 19:30(8+)/T5 19:30(9+); B2 CN 13:30(9+)/CN 15:30(8+).
-- Mỗi em mỗi buổi hiện đúng MỘT ca: ca em đã điểm danh > ca chuyển đến > ca theo lịch riêng ghi trong tên > ca muộn nhất của lớp gốc.
-- Chưa đi ca nào: còn ca sau trong tuần thì "Chưa học (còn ca dd/mm)", hết mọi ca thì "Chưa có điểm danh". ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.xps_slot(
 cohort text not null, slot int not null, class_label text not null, weekday int not null, start_hm text not null,
 primary key(class_label,weekday,start_hm));
alter table mtm_hw_private.xps_slot enable row level security;
revoke all on mtm_hw_private.xps_slot from public,anon,authenticated;
delete from mtm_hw_private.xps_slot where true;
insert into mtm_hw_private.xps_slot(cohort,slot,class_label,weekday,start_hm) values
 ('2K9',1,'2K9 9+',1,'17:30'),('2K9',1,'2K9 8+',2,'17:30'),
 ('2K9',2,'2K9 9+',3,'17:30'),('2K9',2,'2K9 8+',4,'17:30'),
 ('2K9',3,'2K9 9+',5,'17:30'),('2K9',3,'2K9 8+',6,'17:30'),
 ('2K10',1,'2K10 9+',2,'19:30'),('2K10',1,'2K10 8+',5,'19:30'),
 ('2K10',2,'2K10 9+',5,'19:30'),('2K10',2,'2K10 9+',7,'08:00'),('2K10',2,'2K10 8+',7,'10:00'),
 ('2K11',1,'2K11 8+',3,'19:30'),('2K11',1,'2K11 9+',4,'19:30'),
 ('2K11',2,'2K11 9+',7,'13:30'),('2K11',2,'2K11 8+',7,'15:30');

-- Zoom/vân tay: em lớp XPS được nhận vào mọi ca XPS cùng khoá trong ngày (không chỉ ca lớp gốc).
create or replace function mtm_hw_private.dd_auto_mark(p_source text,p_date date,p_sessions jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare r record; ss jsonb; cls text; n int=0; best_ov int; ov int; classes text[]; sid uuid; home text;
begin
 select array_agg(distinct c) into classes from (
  select x->>'class' c from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x
  union select x2.class_label from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x
   join mtm_hw_private.xps_slot x1 on x1.class_label=x->>'class' join mtm_hw_private.xps_slot x2 on x2.cohort=x1.cohort) q;
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date
   and (a.student_id is null or not (a.class_label=any(coalesce(classes,'{}')))) loop
  sid=mtm_hw_private.dd_match_in(r.raw_name,coalesce(classes,'{}'),p_date);
  if sid is not null then
   select c.label into home from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id where s.id=sid;
   update mtm_hw_private.attendance_raw set student_id=sid,class_label=home where id=r.id;
  end if;
 end loop;
 for r in select * from mtm_hw_private.attendance_raw a where a.source=p_source and a.session_date=p_date and a.student_id is not null loop
  cls=null; best_ov=0;
  for ss in select x from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) x loop
   if ss->>'class'=r.class_label
    or exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=r.student_id and m.to_class=ss->>'class' and m.to_date=p_date and m.cancelled_at is null)
    or exists(select 1 from mtm_hw_private.xps_slot a1 join mtm_hw_private.xps_slot a2 on a2.cohort=a1.cohort
              where a1.class_label=ss->>'class' and a2.class_label=r.class_label) then
    if p_source='van_tay' then ov=1000;
    else ov=least(mtm_hw_private.hm(r.time_out),mtm_hw_private.hm(ss->>'end'))-greatest(mtm_hw_private.hm(r.time_in),mtm_hw_private.hm(ss->>'start'));
    end if;
    if ov>best_ov or (ov=best_ov and ov>0 and ss->>'class'=r.class_label) then best_ov=ov; cls=ss->>'class'; end if;
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
 hs as (select s.id,s.full_name,c.label lop,s.class_id,split_part(c.label,' ',1) cohort,mtm_hw_private.lich_rieng(s.full_name) lr,
   exists(select 1 from mtm_hw_private.xps_slot x where x.class_label=c.label) is_xps
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%'),
 -- ===== ca thường (không thuộc nhóm XPS) =====
 dk as (
  select ca.ngay,ca.class_label,ca.start_hm,ca.end_hm,ca.mode,hs.id,'Lớp gốc'::text nguon,''::text con
  from ca join hs on hs.lop=ca.class_label
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
    case when a.student_id is not null then case when o.class_label=h.lop then 'Lớp gốc' else 'Học ca khác cùng buổi' end
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
    (o.class_label=h.lop) desc,o.ngay desc,o.start_hm desc
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
 select dk2.ngay,dk2.class_label,dk2.start_hm||'-'||dk2.end_hm,dk2.mode,btrim(regexp_replace(hs.full_name,'\s*[\(\[].*$','')),hs.lop,
  case when dk2.chuyen_di then 'Đã chuyển đi' else dk2.nguon end,
  case when dk2.chuyen_di then 'Chuyển buổi'
   when a.status in ('co_mat','hoc_online','di_muon','ve_som') then 'Có mặt'
   when a.status='vang_phep' then 'Vắng có phép'
   when a.status='vang' then 'Vắng không phép'
   when (dk2.ngay+dk2.end_hm::time) > (select t from nowvn)-interval '45 minutes' then 'Chưa học'
   when coalesce(dk2.con,'')<>'' then 'Chưa học (còn ca '||dk2.con||')'
   else 'Chưa có điểm danh' end,
  case when a.status='hoc_online' then 'Online' when a.status in ('co_mat','di_muon','ve_som') then 'Offline' else '' end,
  case a.source when 'van_tay' then 'Vân tay' when 'zoom' then 'Zoom' when 'quan_ly' then 'Quản lý' when 'phu_huynh' then 'Phụ huynh'
   when 'hoc_sinh' then 'Học sinh' when 'chuyen_buoi' then 'Chuyển buổi' else '' end,
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
   and coalesce(l.material->'classDates'->>hs.lop,l.material->>'date')::date < dk2.ngay
  order by coalesce(l.material->'classDates'->>hs.lop,l.material->>'date')::date desc limit 1) b on true
$$;
revoke all on function mtm_hw_private.hv_ca_rows(date,date) from public,anon,authenticated;
commit;
