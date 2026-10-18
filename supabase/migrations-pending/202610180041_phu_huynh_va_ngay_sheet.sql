-- 041 (18/10): (1) phụ huynh + Zalo vào kho (bảng guardians, action guardian_upsert/guardians; uid KHÔNG ra Sheet);
-- (2) ngày trên Sheet là CHỮ "dd/mm/yyyy (Thứ)" để Google không đổi thành số 46313. ĐÃ ÁP (Claude).
begin;
create or replace function mtm_hw_private.vn_date(d date) returns text language sql immutable set search_path='' as $$
 select case when d is null then '' else to_char(d,'DD/MM/YYYY')||' ('||(array['T2','T3','T4','T5','T6','T7','CN'])[extract(isodow from d)::int]||')' end $$;
create or replace function mtm_hw_private.vn_ts(t timestamptz) returns text language sql stable set search_path='' as $$
 select case when t is null then '' else to_char(t at time zone 'Asia/Ho_Chi_Minh','HH24:MI')||' '||mtm_hw_private.vn_date((t at time zone 'Asia/Ho_Chi_Minh')::date) end $$;
create or replace function mtm_hw_private.vn_time(ms numeric) returns text language sql stable set search_path='' as $$
 select case when ms is null then '' else mtm_hw_private.vn_ts(to_timestamp(ms/1000)) end $$;
revoke all on function mtm_hw_private.vn_date(date),mtm_hw_private.vn_ts(timestamptz) from public,anon,authenticated;

create table if not exists mtm_hw_private.guardians(
 student_id uuid not null references mtm_hw_private.students(id), zalo_uid_ph text not null default '', zalo_uid_hs text,
 ph_name text, goi_ph text, status_ph text, status_hs text, source text, confirmed_on date,
 updated_at timestamptz not null default now(), primary key(student_id,zalo_uid_ph));
alter table mtm_hw_private.guardians enable row level security;
revoke all on mtm_hw_private.guardians from public,anon,authenticated;

create or replace function public.mtm_dd_api5(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare rr jsonb; st jsonb; res jsonb='[]'::jsonb;
begin
 if p->>'action'='guardian_upsert' then
  -- {rows:[{student,class,phName,callAs,zaloUidPh,zaloUidHs,statusPh,statusHs,source,confirmedOn}]}; khoá: học sinh + zaloUidPh
  for rr in select x from jsonb_array_elements(coalesce(p->'rows','[]'::jsonb)) x loop
   st=mtm_hw_private.dd_find_student(rr->>'student',rr->>'class');
   if st ? 'error' then res=res||jsonb_build_array(jsonb_build_object('student',rr->>'student','result',st)); continue; end if;
   insert into mtm_hw_private.guardians(student_id,zalo_uid_ph,zalo_uid_hs,ph_name,goi_ph,status_ph,status_hs,source,confirmed_on,updated_at)
   values((st->>'id')::uuid,coalesce(rr->>'zaloUidPh',''),rr->>'zaloUidHs',rr->>'phName',rr->>'callAs',rr->>'statusPh',rr->>'statusHs',rr->>'source',(rr->>'confirmedOn')::date,now())
   on conflict(student_id,zalo_uid_ph) do update set zalo_uid_hs=coalesce(excluded.zalo_uid_hs,mtm_hw_private.guardians.zalo_uid_hs),
    ph_name=coalesce(excluded.ph_name,mtm_hw_private.guardians.ph_name),goi_ph=coalesce(excluded.goi_ph,mtm_hw_private.guardians.goi_ph),
    status_ph=coalesce(excluded.status_ph,mtm_hw_private.guardians.status_ph),status_hs=coalesce(excluded.status_hs,mtm_hw_private.guardians.status_hs),
    source=coalesce(excluded.source,mtm_hw_private.guardians.source),confirmed_on=coalesce(excluded.confirmed_on,mtm_hw_private.guardians.confirmed_on),updated_at=now();
   res=res||jsonb_build_array(jsonb_build_object('student',st->>'fullName','result','ok'));
  end loop;
  return jsonb_build_object('ok',true,'results',res);
 elsif p->>'action'='guardians' then
  return coalesce((select jsonb_agg(jsonb_build_object('student',s.full_name,'class',c.label,'phName',g.ph_name,'callAs',g.goi_ph,'zaloUidPh',g.zalo_uid_ph,
    'zaloUidHs',g.zalo_uid_hs,'statusPh',g.status_ph,'statusHs',g.status_hs,'source',g.source,'confirmedOn',g.confirmed_on) order by c.label,s.full_name)
   from mtm_hw_private.guardians g join mtm_hw_private.students s on s.id=g.student_id join mtm_hw_private.classes c on c.id=s.class_id
   where coalesce(p->>'class','')='' or c.label=p->>'class'),'[]'::jsonb);
 end if;
 return public.mtm_dd_api4(p);
end$$;
revoke all on function public.mtm_dd_api5(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api5(jsonb) to service_role;

create or replace function public.mtm_btvn_sheet_csv(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text; c text; k text; now_vn text;
begin
 now_vn=mtm_hw_private.vn_ts(current_timestamp);
 if p_tab='diem' then
  head = 'Lớp,Học sinh,Ngày buổi,Bài,Hạn nộp,Trạng thái,Số lần vào làm,Vào làm lần đầu,Nộp lần đầu,Điểm lần 1 (xếp hạng),Điểm cao nhất (BTVN),Số lần nộp,Lần 1 nộp muộn,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(x.label),mtm_hw_private.csvq(x.full_name),mtm_hw_private.csvq(mtm_hw_private.vn_date(x.lesson_day)),
    mtm_hw_private.csvq(x.title),mtm_hw_private.csvq(mtm_hw_private.vn_time(extract(epoch from x.due_at)*1000)),
    mtm_hw_private.csvq(case when x.n_sub>0 then 'Đã nộp' when x.n_att>0 then 'Đang làm' else 'Chưa làm' end),
    x.n_att::text,mtm_hw_private.csvq(mtm_hw_private.vn_time(x.first_start)),mtm_hw_private.csvq(mtm_hw_private.vn_time(x.first_at)),
    mtm_hw_private.csvq(mtm_hw_private.vn_num(x.first_score)),mtm_hw_private.csvq(mtm_hw_private.vn_num(x.best_score)),x.n_sub::text,
    mtm_hw_private.csvq(case when x.n_sub=0 then '' when x.first_late then 'Muộn' else 'Đúng hạn' end),mtm_hw_private.csvq(now_vn)),
    E'\n' order by x.label,x.lesson_day desc,x.full_name) into body
  from (
   select c.label,btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')) full_name,
    coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date lesson_day,coalesce(l.exam->>'title',l.code) title,
    coalesce(w.next_actual_class_at,w.expected_due_at,mtm_hw_private.btvn_planned_due(c.label,coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date)) due_at,
    (select count(*) from jsonb_array_elements(case when jsonb_typeof(w.drafts)='array' then w.drafts else '[]' end) d) n_att,
    (select min((d->>'startedAt')::numeric) from jsonb_array_elements(case when jsonb_typeof(w.drafts)='array' then w.drafts else '[]' end) d) first_start,
    r.n_sub,r.first_at,r.first_score,r.best_score,r.first_late
   from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
   join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
   join mtm_hw_private.btvn_lessons l on s.class_id=any(l.class_ids) and l.owner_id=s.owner_id
   left join mtm_hw_private.btvn_work w on w.student_id=s.id and w.lesson_code=l.code
   left join lateral (
    select count(*) n_sub,min(o.submitted_at) first_at,max(o.score) best_score,
     (array_agg(o.score order by o.submitted_at))[1] first_score,
     (array_agg(coalesce((o.receipt->>'late')::boolean,false) order by o.submitted_at))[1] first_late
    from mtm_hw_private.btvn_official_receipts(s.id,l.code) o where o.submitted_at is not null) r on true
   where s.active and c.active and l.active and l.kind='btvn' and coalesce(s.source_identity,'') not like 'qa:%'
    and coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date>='2026-10-01'
    and current_timestamp>=mtm_hw_private.btvn_opens_at(l.material,c.label)
  ) x;
 elsif p_tab='xephang' then
  head = 'Khối,Bảng,Hạng,Học sinh,Lớp,Trường,Điểm,Bài đã nộp,Tổng bài,Cập nhật lúc';
  body = '';
  foreach c in array array['2K9','2K10','2K11','2K12','2K13','2K14'] loop
   foreach k in array array['btvn-tuan','btvn-thang'] loop
    select body||coalesce(string_agg(concat_ws(',',mtm_hw_private.csvq(c),mtm_hw_private.csvq(case k when 'btvn-tuan' then 'Tuần này' else 'Tháng này' end),
      e->>'rank',mtm_hw_private.csvq(e->>'fullName'),mtm_hw_private.csvq(e->>'className'),mtm_hw_private.csvq(e->>'school'),
      mtm_hw_private.csvq(mtm_hw_private.vn_num((e->>'score')::numeric)),coalesce(e->>'submitted',''),coalesce(e->>'total',''),mtm_hw_private.csvq(now_vn))||E'\n',''),'')
    into body from jsonb_array_elements(mtm_hw_private.btvn_rank_rows(c,k,null,null,null)) e;
   end loop;
  end loop;
  body = rtrim(body,E'\n');
 else raise exception 'Invalid tab';
 end if;
 return head||E'\n'||coalesce(body,'');
end$$;

create or replace function public.mtm_btvn_sheet_csv2(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text; q text='mtm_hw_private.csvq'; now_vn text;
begin
 if p_tab in ('diem','xephang') then return public.mtm_btvn_sheet_csv(p_tab); end if;
 now_vn=mtm_hw_private.vn_ts(current_timestamp);
 if p_tab='diemdanh' then
  head='Ngày,Ca (lớp),Học sinh,Lớp gốc,Trạng thái,Nguồn,Giờ vào,Giờ ra,Ghi chú,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(mtm_hw_private.vn_date(a.session_date)),mtm_hw_private.csvq(a.class_label),
   mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(c.label),mtm_hw_private.csvq(mtm_hw_private.dd_status_vn(a.status)),
   mtm_hw_private.csvq(mtm_hw_private.dd_source_vn(a.source)),mtm_hw_private.csvq(a.time_in),mtm_hw_private.csvq(a.time_out),mtm_hw_private.csvq(a.note),
   mtm_hw_private.csvq(mtm_hw_private.vn_ts(a.updated_at))),E'\n' order by a.session_date desc,a.class_label,s.full_name) into body
  from mtm_hw_private.attendance a join mtm_hw_private.students s on s.id=a.student_id join mtm_hw_private.classes c on c.id=s.class_id;
 elsif p_tab in ('zoom','vantay') then
  head='Ngày,'||case when p_tab='zoom' then 'Phòng Zoom,Tên trên Zoom' else 'Máy/File,Tên trên máy vân tay' end||',Khớp học sinh,Lớp,Giờ vào,Giờ ra,Số phút,Các đoạn,Nhận lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(mtm_hw_private.vn_date(r.session_date)),mtm_hw_private.csvq(case when p_tab='zoom' then r.room else coalesce(r.file_ref,r.room) end),
   mtm_hw_private.csvq(r.raw_name),mtm_hw_private.csvq(coalesce(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')),'CHƯA KHỚP')),mtm_hw_private.csvq(r.class_label),
   mtm_hw_private.csvq(r.time_in),mtm_hw_private.csvq(r.time_out),mtm_hw_private.csvq(replace(coalesce(r.minutes::text,''),'.',',')),mtm_hw_private.csvq(r.segments),
   mtm_hw_private.csvq(mtm_hw_private.vn_ts(r.created_at))),E'\n' order by r.session_date desc,r.room,r.time_in) into body
  from mtm_hw_private.attendance_raw r left join mtm_hw_private.students s on s.id=r.student_id
  where r.source=case when p_tab='zoom' then 'zoom' else 'van_tay' end;
 elsif p_tab='chuyenbuoi' then
  head='Học sinh,Từ lớp,Từ ngày,Sang lớp,Sang ngày,Lý do,Người xác nhận,Ghi lúc,Trạng thái';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(m.from_class),
   mtm_hw_private.csvq(mtm_hw_private.vn_date(m.from_date)),mtm_hw_private.csvq(m.to_class),mtm_hw_private.csvq(mtm_hw_private.vn_date(m.to_date)),
   mtm_hw_private.csvq(m.reason),mtm_hw_private.csvq(m.confirmed_by),mtm_hw_private.csvq(mtm_hw_private.vn_ts(m.created_at)),
   mtm_hw_private.csvq(case when m.cancelled_at is null then 'Hiệu lực' else 'Đã huỷ' end)),E'\n' order by m.id desc) into body
  from mtm_hw_private.schedule_moves m join mtm_hw_private.students s on s.id=m.student_id;
 else raise exception 'Invalid tab';
 end if;
 return head||E'\n'||coalesce(body,'');
end$$;

create or replace function public.mtm_btvn_sheet_csv3(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text; td date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date; now_vn text;
begin
 if p_tab not in ('cahomnay','cachitiet','tongquan','hocsinh') then return public.mtm_btvn_sheet_csv2(p_tab); end if;
 now_vn=mtm_hw_private.vn_ts(current_timestamp);
 if p_tab in ('cahomnay','cachitiet') then
  head='Ngày,Ca (lớp),Giờ,Hình thức ca,Học sinh,Lớp gốc,Vì sao học ca này,Trạng thái,Online/Offline,Nguồn điểm danh,Giờ vào,Giờ ra,Ghi chú,BTVN buổi trước,Điểm lần 1 (xếp hạng),Điểm cao nhất (BTVN),Số lần nộp,Nộp muộn,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(mtm_hw_private.vn_date(r.ngay)),mtm_hw_private.csvq(r.ca_lop),mtm_hw_private.csvq(r.gio),mtm_hw_private.csvq(r.che_do),
   mtm_hw_private.csvq(r.hoc_sinh),mtm_hw_private.csvq(r.lop_goc),mtm_hw_private.csvq(r.nguon_dk),mtm_hw_private.csvq(r.trang_thai),mtm_hw_private.csvq(r.hinh_thuc),
   mtm_hw_private.csvq(r.nguon_dd),mtm_hw_private.csvq(r.gio_vao),mtm_hw_private.csvq(r.gio_ra),mtm_hw_private.csvq(r.ghi_chu),mtm_hw_private.csvq(r.btvn_bai),
   mtm_hw_private.csvq(mtm_hw_private.vn_num(r.btvn_lan1)),mtm_hw_private.csvq(mtm_hw_private.vn_num(r.btvn_cao_nhat)),coalesce(r.btvn_so_lan,0)::text,
   mtm_hw_private.csvq(case when r.btvn_so_lan>0 then case when r.btvn_nop_muon then 'Muộn' else 'Đúng hạn' end else '' end),mtm_hw_private.csvq(now_vn)),
   E'\n' order by r.ngay desc,r.gio,r.ca_lop,r.hoc_sinh) into body
  from mtm_hw_private.hv_ca_rows(case when p_tab='cahomnay' then td-1 else td-13 end,td) r;
 elsif p_tab='tongquan' then
  head='Ngày,Ca (lớp),Giờ,Đăng ký học ca,Chuyển đi,Chuyển đến/lịch riêng,Có mặt offline,Có mặt online,Vắng có phép,Vắng không phép,Chưa có điểm danh,Nộp BTVN buổi trước,Điểm TB lần 1,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(mtm_hw_private.vn_date(g.ngay)),mtm_hw_private.csvq(g.ca_lop),mtm_hw_private.csvq(g.gio),
   g.dk::text,g.di::text,g.den::text,g.off::text,g.onl::text,g.phep::text,g.kphep::text,g.chua::text,g.nop::text||'/'||(g.dk-g.di)::text,
   mtm_hw_private.csvq(mtm_hw_private.vn_num(g.tb)),mtm_hw_private.csvq(now_vn)),E'\n' order by g.ngay desc,g.gio,g.ca_lop) into body
  from (select r.ngay,r.ca_lop,r.gio,count(*) dk,count(*) filter (where r.nguon_dk='Đã chuyển đi') di,
    count(*) filter (where r.nguon_dk in ('Chuyển đến','Lịch riêng')) den,count(*) filter (where r.hinh_thuc='Offline') off,
    count(*) filter (where r.hinh_thuc='Online') onl,count(*) filter (where r.trang_thai='Vắng có phép') phep,
    count(*) filter (where r.trang_thai='Vắng không phép') kphep,count(*) filter (where r.trang_thai='Chưa có điểm danh') chua,
    count(*) filter (where r.btvn_so_lan>0 and r.nguon_dk<>'Đã chuyển đi') nop,avg(r.btvn_lan1) filter (where r.nguon_dk<>'Đã chuyển đi') tb
   from mtm_hw_private.hv_ca_rows(td-13,td) r group by r.ngay,r.ca_lop,r.gio) g;
 else
  head='Học sinh,Lớp,Khoá,Trường,Lịch riêng (ghi trong sổ),Có tài khoản web,Lần nộp BTVN gần nhất,Phụ huynh (Zalo),Hồ sơ PH,Hồ sơ HS,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(c.label),mtm_hw_private.csvq(split_part(c.label,' ',1)),
   mtm_hw_private.csvq(coalesce(mtm_hw_private.public_school(ap.school),mtm_hw_private.public_school(s.school))),
   mtm_hw_private.csvq(substring(s.full_name from '\((.*)\)')),mtm_hw_private.csvq(case when exists(select 1 from mtm_hw_private.btvn_work w where w.student_id=s.id) then 'Có' else 'Chưa' end),
   mtm_hw_private.csvq(mtm_hw_private.vn_time((select max((r->>'submittedAt')::numeric) from mtm_hw_private.btvn_work w,jsonb_array_elements(coalesce(w.receipts,'[]'::jsonb)) r where w.student_id=s.id))),
   mtm_hw_private.csvq((select string_agg(trim(coalesce(g.goi_ph,'')||' '||coalesce(g.ph_name,'')),'; ') from mtm_hw_private.guardians g where g.student_id=s.id)),
   mtm_hw_private.csvq((select string_agg(distinct g.status_ph,'; ') from mtm_hw_private.guardians g where g.student_id=s.id)),
   mtm_hw_private.csvq((select string_agg(distinct g.status_hs,'; ') from mtm_hw_private.guardians g where g.student_id=s.id)),
   mtm_hw_private.csvq(now_vn)),E'\n' order by c.label,s.full_name) into body
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
  left join mtm_hw_private.student_appearance ap on ap.student_id=s.id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%';
 end if;
 return head||E'\n'||coalesce(body,'');
end$$;
commit;
