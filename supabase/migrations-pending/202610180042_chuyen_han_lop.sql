-- 042 (18/10, anh Thành): CHUYỂN HẲN LỚP (đổi lớp cố định). action transfer/cancel_transfer/transfers, chống trùng theo sourceMsg.
-- Từ effectiveDate: students.class_id đổi sang lớp mới (web BTVN theo lớp mới), memberships giữ lịch sử; các ca TRƯỚC ngày đó vẫn tính lớp cũ
-- (hàm lop_tai). Chuyển có hiệu lực tương lai thì lưu chờ, tự áp ở lần gọi API đầu tiên từ ngày đó. Sheet gốc danh sách HS do Javis sửa
-- để lần đồng bộ sau không kéo về lớp cũ. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.class_transfers(
 id bigserial primary key, student_id uuid not null references mtm_hw_private.students(id), from_class text not null, to_class text not null,
 effective_date date not null, reason text, confirmed_by text, source_msg text, created_at timestamptz not null default now(),
 applied_at timestamptz, cancelled_at timestamptz);
create unique index if not exists class_transfers_src_uq on mtm_hw_private.class_transfers(source_msg) where source_msg is not null and cancelled_at is null;
alter table mtm_hw_private.class_transfers enable row level security;
revoke all on mtm_hw_private.class_transfers from public,anon,authenticated;

create or replace function mtm_hw_private.lop_tai(p_student uuid,p_cur text,p_d date) returns text language sql stable security definer set search_path='' as $$
 select coalesce(
  (select t.from_class from mtm_hw_private.class_transfers t where t.student_id=p_student and t.cancelled_at is null and t.applied_at is not null and t.effective_date>p_d order by t.effective_date limit 1),
  (select t.to_class from mtm_hw_private.class_transfers t where t.student_id=p_student and t.cancelled_at is null and t.applied_at is null and t.effective_date<=p_d order by t.effective_date desc limit 1),
  p_cur) $$;

create or replace function mtm_hw_private.dd_apply_transfers() returns int language plpgsql security definer set search_path='' as $$
declare t record; cid uuid; n int=0;
begin
 for t in select * from mtm_hw_private.class_transfers where applied_at is null and cancelled_at is null
   and effective_date<=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date order by effective_date,id loop
  select c.id into cid from mtm_hw_private.classes c join mtm_hw_private.students s on s.owner_id=c.owner_id
   where s.id=t.student_id and c.label=t.to_class and c.active limit 1;
  if cid is null then continue; end if;
  update mtm_hw_private.students set class_id=cid where id=t.student_id;
  update mtm_hw_private.memberships set left_at=clock_timestamp() where student_id=t.student_id and left_at is null and class_id<>cid;
  if not exists(select 1 from mtm_hw_private.memberships where student_id=t.student_id and left_at is null) then
   insert into mtm_hw_private.memberships(student_id,class_id) values(t.student_id,cid); end if;
  update mtm_hw_private.class_transfers set applied_at=now() where id=t.id; n=n+1;
 end loop;
 return n;
end$$;
revoke all on function mtm_hw_private.lop_tai(uuid,text,date),mtm_hw_private.dd_apply_transfers() from public,anon,authenticated;

create or replace function public.mtm_dd_api6(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; old record; tid bigint; fc text; cid uuid;
begin
 perform mtm_hw_private.dd_apply_transfers();
 if p->>'action'='transfer' then
  if coalesce(p->>'sourceMsg','')<>'' then
   select * into old from mtm_hw_private.class_transfers where source_msg=p->>'sourceMsg' and cancelled_at is null;
   if found then return jsonb_build_object('ok',true,'duplicate',true,'transferId',old.id,'applied',old.applied_at is not null); end if;
  end if;
  st=mtm_hw_private.dd_find_student(p->>'student',coalesce(nullif(p->>'fromClass',''),p->>'toClass'));
  if st ? 'error' then return st; end if;
  if coalesce(p->>'toClass','')='' or (p->>'effectiveDate') is null then return jsonb_build_object('error','need toClass,effectiveDate'); end if;
  select c.id into cid from mtm_hw_private.classes c join mtm_hw_private.students s on s.owner_id=c.owner_id
   where s.id=(st->>'id')::uuid and c.label=p->>'toClass' and c.active limit 1;
  if cid is null then return jsonb_build_object('error','unknown toClass'); end if;
  fc=coalesce(nullif(p->>'fromClass',''),st->>'className');
  insert into mtm_hw_private.class_transfers(student_id,from_class,to_class,effective_date,reason,confirmed_by,source_msg)
  values((st->>'id')::uuid,fc,p->>'toClass',(p->>'effectiveDate')::date,p->>'reason',p->>'confirmedBy',nullif(p->>'sourceMsg','')) returning id into tid;
  perform mtm_hw_private.dd_apply_transfers();
  return jsonb_build_object('ok',true,'transferId',tid,'student',st,
   'applied',(select x.applied_at is not null from mtm_hw_private.class_transfers x where x.id=tid));
 elsif p->>'action'='cancel_transfer' then
  select * into old from mtm_hw_private.class_transfers where id=(p->>'transferId')::bigint and cancelled_at is null;
  if not found then return jsonb_build_object('error','not_found'); end if;
  update mtm_hw_private.class_transfers set cancelled_at=now() where id=old.id;
  if old.applied_at is not null then
   select c.id into cid from mtm_hw_private.classes c join mtm_hw_private.students s on s.owner_id=c.owner_id
    where s.id=old.student_id and c.label=old.from_class and c.active limit 1;
   if cid is not null then
    update mtm_hw_private.students set class_id=cid where id=old.student_id;
    update mtm_hw_private.memberships set left_at=clock_timestamp() where student_id=old.student_id and left_at is null and class_id<>cid;
    if not exists(select 1 from mtm_hw_private.memberships where student_id=old.student_id and left_at is null) then
     insert into mtm_hw_private.memberships(student_id,class_id) values(old.student_id,cid); end if;
   end if;
  end if;
  return jsonb_build_object('ok',true);
 elsif p->>'action'='transfers' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'student',s.full_name,'from',t.from_class,'to',t.to_class,'effectiveDate',t.effective_date,
    'reason',t.reason,'confirmedBy',t.confirmed_by,'applied',t.applied_at is not null,'cancelled',t.cancelled_at is not null) order by t.id desc)
   from mtm_hw_private.class_transfers t join mtm_hw_private.students s on s.id=t.student_id),'[]'::jsonb);
 end if;
 return public.mtm_dd_api5(p);
end$$;
revoke all on function public.mtm_dd_api6(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api6(jsonb) to service_role;

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
