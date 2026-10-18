-- 039 (18/10, anh Thành): "cơ sở dữ liệu học vụ" một Sheet: ca hôm nay ai học, ai chuyển đi/đến, điểm danh offline/online/phép/không phép, điểm BTVN web.
-- Thời khoá biểu vào kho (bảng timetable, máy PC đồng bộ từ tkb.csv qua action 'tkb'); lịch riêng ghi trong tên ("HỌC T3, 4, 7 (17h30-19h30)") được hiểu tự động. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.timetable(
 class_label text not null, weekday int not null check (weekday between 1 and 7), start_hm text not null, end_hm text not null,
 mode text not null default '', teacher text, updated_at timestamptz not null default now(), primary key(class_label,weekday,start_hm));
alter table mtm_hw_private.timetable enable row level security;
revoke all on mtm_hw_private.timetable from public,anon,authenticated;

-- Thứ trong tuần kiểu VN: 2..7 = Thứ 2..Thứ 7, 1 = Chủ nhật -> lưu 1..7 với 1=T2 ... 6=T7, 7=CN
create or replace function mtm_hw_private.vn_wd(d date) returns int language sql immutable set search_path='' as $$ select extract(isodow from d)::int $$;

-- Lịch riêng ghi trong tên: "HỌC T3, 4, 7 (17h30-19h30)" -> {2,3,6} (isodow) và giờ bắt đầu '17:30'
create or replace function mtm_hw_private.lich_rieng(full_name text) returns jsonb language plpgsql immutable set search_path='' as $$
declare m text[]; days int[]='{}'; t text; x text;
begin
 m=regexp_match(upper(normalize(coalesce(full_name,''),NFC)),'HỌC\s*T\s*([0-9 ,]+)\s*\(?\s*(\d{1,2})\s*[HG:]\s*(\d{0,2})');
 if m is null then return null; end if;
 foreach x in array regexp_split_to_array(m[1],'[ ,]+') loop
  if x ~ '^[2-8]$' then days=days||(case when x='8' then 7 else x::int-1 end); end if;
 end loop;
 t=lpad(m[2],2,'0')||':'||lpad(coalesce(nullif(m[3],''),'00'),2,'0');
 return jsonb_build_object('days',to_jsonb(days),'start',t);
end$$;

-- Danh sách dự kiến của mọi ca trong khoảng ngày: theo TKB lớp gốc, lịch riêng, chuyển buổi; kèm điểm danh và BTVN.
create or replace function mtm_hw_private.hv_ca_rows(p_from date,p_to date) returns table(
 ngay date, ca_lop text, gio text, che_do text, hoc_sinh text, lop_goc text, nguon_dk text, trang_thai text, hinh_thuc text, nguon_dd text,
 gio_vao text, gio_ra text, ghi_chu text, btvn_bai text, btvn_lan1 numeric, btvn_cao_nhat numeric, btvn_so_lan int, btvn_nop_muon boolean, student_id uuid)
language sql stable security definer set search_path='' as $$
 with days as (select generate_series(p_from,p_to,'1 day')::date d),
 ca as (select d.d ngay,t.* from days d join mtm_hw_private.timetable t on t.weekday=mtm_hw_private.vn_wd(d.d)),
 hs as (select s.id,s.full_name,c.label lop,s.class_id,mtm_hw_private.lich_rieng(s.full_name) lr
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%'),
 dk as (
  -- lớp gốc học đúng TKB (trừ em có lịch riêng)
  select ca.ngay,ca.class_label,ca.start_hm,ca.end_hm,ca.mode,hs.id,'Lớp gốc'::text nguon from ca join hs on hs.lop=ca.class_label where hs.lr is null
  union
  -- lịch riêng: học ca bắt đầu đúng giờ ghi, cùng khoá, đúng thứ ghi
  select ca.ngay,ca.class_label,ca.start_hm,ca.end_hm,ca.mode,hs.id,'Lịch riêng' from ca join hs on hs.lr is not null
   and split_part(ca.class_label,' ',1)=split_part(hs.lop,' ',1) and ca.start_hm=hs.lr->>'start'
   and mtm_hw_private.vn_wd(ca.ngay) in (select jsonb_array_elements_text(hs.lr->'days')::int)
   and ca.class_label in (hs.lop,split_part(hs.lop,' ',1)||' 8+',split_part(hs.lop,' ',1)||' 9+')
  union
  -- chuyển đến (đã xác nhận)
  select m.to_date,m.to_class,coalesce(t.start_hm,''),coalesce(t.end_hm,''),coalesce(t.mode,''),m.student_id,'Chuyển đến'
  from mtm_hw_private.schedule_moves m left join mtm_hw_private.timetable t on t.class_label=m.to_class and t.weekday=mtm_hw_private.vn_wd(m.to_date)
  where m.cancelled_at is null and m.to_date between p_from and p_to
 ),
 dk1 as (
  -- mỗi em một dòng mỗi ca: ưu tiên Chuyển đến > Lịch riêng > Lớp gốc
  select distinct on (dk.ngay,dk.class_label,dk.start_hm,dk.id) dk.* from dk
  order by dk.ngay,dk.class_label,dk.start_hm,dk.id,case dk.nguon when 'Chuyển đến' then 1 when 'Lịch riêng' then 2 else 3 end
 ),
 dk2 as (
  select dk1.*,exists(select 1 from mtm_hw_private.schedule_moves m where m.student_id=dk1.id and m.from_date=dk1.ngay and m.from_class=dk1.class_label
    and m.cancelled_at is null and not (m.to_date=dk1.ngay and m.to_class=dk1.class_label)) chuyen_di,
   -- buổi 'lựa chọn' (TKB ghi, vd 2K10 9+ T6 hoặc CN): đã có mặt ở buổi lựa chọn khác cùng tuần thì không tính thiếu
   (select to_char(a2.session_date,'DD/MM') from mtm_hw_private.attendance a2 where dk1.mode ilike '%lựa chọn%' and a2.student_id=dk1.id and a2.class_label=dk1.class_label
     and a2.session_date<>dk1.ngay and date_trunc('week',a2.session_date)=date_trunc('week',dk1.ngay)
     and a2.status in ('co_mat','hoc_online','di_muon','ve_som')
     and exists(select 1 from mtm_hw_private.timetable t2 where t2.class_label=dk1.class_label and t2.weekday=mtm_hw_private.vn_wd(a2.session_date) and t2.mode ilike '%lựa chọn%') limit 1) buoi_khac
  from dk1
 )
 select dk2.ngay,dk2.class_label,dk2.start_hm||'-'||dk2.end_hm,dk2.mode,btrim(regexp_replace(hs.full_name,'\s*[\(\[].*$','')),hs.lop,
  case when dk2.chuyen_di then 'Đã chuyển đi' else dk2.nguon end,
  case when dk2.chuyen_di then 'Chuyển buổi'
   when a.status in ('co_mat','hoc_online','di_muon','ve_som') then 'Có mặt'
   when a.status='vang_phep' then 'Vắng có phép'
   when a.status='vang' then 'Vắng không phép'
   when dk2.buoi_khac is not null then 'Học buổi khác ('||dk2.buoi_khac||')'
   when (dk2.ngay+dk2.end_hm::time) < (current_timestamp at time zone 'Asia/Ho_Chi_Minh')-interval '45 minutes' then 'Chưa có điểm danh'
   else 'Chưa học' end,
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
revoke all on function mtm_hw_private.hv_ca_rows(date,date),mtm_hw_private.lich_rieng(text),mtm_hw_private.vn_wd(date) from public,anon,authenticated;

-- API: action 'tkb' {rows:[{class,weekday(1=T2..7=CN),start,end,mode,teacher}]} thay toàn bộ TKB; 'ca' {from,to} trả hv_ca_rows.
create or replace function public.mtm_dd_api4(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n int;
begin
 if p->>'action'='tkb' then
  delete from mtm_hw_private.timetable where true;
  insert into mtm_hw_private.timetable(class_label,weekday,start_hm,end_hm,mode,teacher)
  select distinct on (x->>'class',(x->>'weekday')::int,x->>'start') x->>'class',(x->>'weekday')::int,x->>'start',x->>'end',coalesce(x->>'mode',''),x->>'teacher'
  from jsonb_array_elements(coalesce(p->'rows','[]'::jsonb)) x;
  get diagnostics n=row_count;
  return jsonb_build_object('ok',true,'rows',n);
 elsif p->>'action'='ca' then
  return coalesce((select jsonb_agg(to_jsonb(r)-'student_id' order by r.ngay,r.gio,r.ca_lop,r.hoc_sinh)
   from mtm_hw_private.hv_ca_rows(coalesce((p->>'from')::date,current_date),coalesce((p->>'to')::date,current_date)) r),'[]'::jsonb);
 end if;
 return public.mtm_dd_api3(p);
end$$;
revoke all on function public.mtm_dd_api4(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api4(jsonb) to service_role;

-- Sheet: tab 'cahomnay' (hôm nay + hôm qua), 'tongquan' (14 ngày, mỗi ca một dòng), 'cachitiet' (14 ngày), 'hocsinh'.
create or replace function public.mtm_btvn_sheet_csv3(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text; td date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date; now_vn text;
begin
 if p_tab not in ('cahomnay','cachitiet','tongquan','hocsinh') then return public.mtm_btvn_sheet_csv2(p_tab); end if;
 now_vn=to_char(current_timestamp at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI');
 if p_tab in ('cahomnay','cachitiet') then
  head='Ngày,Ca (lớp),Giờ,Hình thức ca,Học sinh,Lớp gốc,Vì sao học ca này,Trạng thái,Online/Offline,Nguồn điểm danh,Giờ vào,Giờ ra,Ghi chú,BTVN buổi trước,Điểm lần 1 (xếp hạng),Điểm cao nhất (BTVN),Số lần nộp,Nộp muộn,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(to_char(r.ngay,'DD/MM/YYYY')),mtm_hw_private.csvq(r.ca_lop),mtm_hw_private.csvq(r.gio),mtm_hw_private.csvq(r.che_do),
   mtm_hw_private.csvq(r.hoc_sinh),mtm_hw_private.csvq(r.lop_goc),mtm_hw_private.csvq(r.nguon_dk),mtm_hw_private.csvq(r.trang_thai),mtm_hw_private.csvq(r.hinh_thuc),
   mtm_hw_private.csvq(r.nguon_dd),mtm_hw_private.csvq(r.gio_vao),mtm_hw_private.csvq(r.gio_ra),mtm_hw_private.csvq(r.ghi_chu),mtm_hw_private.csvq(r.btvn_bai),
   mtm_hw_private.csvq(mtm_hw_private.vn_num(r.btvn_lan1)),mtm_hw_private.csvq(mtm_hw_private.vn_num(r.btvn_cao_nhat)),coalesce(r.btvn_so_lan,0)::text,
   mtm_hw_private.csvq(case when r.btvn_so_lan>0 then case when r.btvn_nop_muon then 'Muộn' else 'Đúng hạn' end else '' end),mtm_hw_private.csvq(now_vn)),
   E'\n' order by r.ngay desc,r.gio,r.ca_lop,r.hoc_sinh) into body
  from mtm_hw_private.hv_ca_rows(case when p_tab='cahomnay' then td-1 else td-13 end,td) r;
 elsif p_tab='tongquan' then
  head='Ngày,Ca (lớp),Giờ,Đăng ký học ca,Chuyển đi,Chuyển đến/lịch riêng,Có mặt offline,Có mặt online,Vắng có phép,Vắng không phép,Chưa có điểm danh,Nộp BTVN buổi trước,Điểm TB lần 1,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(to_char(g.ngay,'DD/MM/YYYY')),mtm_hw_private.csvq(g.ca_lop),mtm_hw_private.csvq(g.gio),
   g.dk::text,g.di::text,g.den::text,g.off::text,g.onl::text,g.phep::text,g.kphep::text,g.chua::text,g.nop::text||'/'||(g.dk-g.di)::text,
   mtm_hw_private.csvq(mtm_hw_private.vn_num(g.tb)),mtm_hw_private.csvq(now_vn)),E'\n' order by g.ngay desc,g.gio,g.ca_lop) into body
  from (select r.ngay,r.ca_lop,r.gio,count(*) dk,count(*) filter (where r.nguon_dk='Đã chuyển đi') di,
    count(*) filter (where r.nguon_dk in ('Chuyển đến','Lịch riêng')) den,count(*) filter (where r.hinh_thuc='Offline') off,
    count(*) filter (where r.hinh_thuc='Online') onl,count(*) filter (where r.trang_thai='Vắng có phép') phep,
    count(*) filter (where r.trang_thai='Vắng không phép') kphep,count(*) filter (where r.trang_thai='Chưa có điểm danh') chua,
    count(*) filter (where r.btvn_so_lan>0 and r.nguon_dk<>'Đã chuyển đi') nop,avg(r.btvn_lan1) filter (where r.nguon_dk<>'Đã chuyển đi') tb
   from mtm_hw_private.hv_ca_rows(td-13,td) r group by r.ngay,r.ca_lop,r.gio) g;
 else
  head='Học sinh,Lớp,Khoá,Trường,Lịch riêng (ghi trong sổ),Có tài khoản web,Lần nộp BTVN gần nhất,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(c.label),mtm_hw_private.csvq(split_part(c.label,' ',1)),
   mtm_hw_private.csvq(coalesce(mtm_hw_private.public_school(ap.school),mtm_hw_private.public_school(s.school))),
   mtm_hw_private.csvq(substring(s.full_name from '\((.*)\)')),mtm_hw_private.csvq(case when exists(select 1 from mtm_hw_private.btvn_work w where w.student_id=s.id) then 'Có' else 'Chưa' end),
   mtm_hw_private.csvq(mtm_hw_private.vn_time((select max((r->>'submittedAt')::numeric) from mtm_hw_private.btvn_work w,jsonb_array_elements(coalesce(w.receipts,'[]'::jsonb)) r where w.student_id=s.id))),
   mtm_hw_private.csvq(now_vn)),E'\n' order by c.label,s.full_name) into body
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  left join mtm_hw_private.student_appearance ap on ap.student_id=s.id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%';
 end if;
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_btvn_sheet_csv3(text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_sheet_csv3(text) to service_role;
commit;
