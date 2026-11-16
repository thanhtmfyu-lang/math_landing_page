-- W6 + W9: số phễu cho Javis (chỉ đọc, chỉ số tổng, không tên/SĐT). Gọi qua /api/exam?muc=so-pheu (khóa đọc) hoặc service_role.
-- Bỏ dữ liệu thử: tài khoản/HS is_test, bài qua view mtm_test100.pt_luot. Giờ theo Asia/Ho_Chi_Minh.
-- "Trong MTM" = tài khoản phòng thi có SĐT trùng SĐT học sinh hoặc phụ huynh của một học sinh thật.
-- "Đăng ký theo nguồn" = mtm_lead.leads theo kind và mã ?nguon= (Mã nguồn: ...), không có mã ghi 'khong-ma'.
-- "Kiểm tra đầu vào" = số hồ sơ kiểm tra đầu vào đã gửi (kind kiem-tra-dau-vao); web chưa ghi lượt bấm nút.
create or replace function public.mtm_pt_so_pheu(p_tu date,p_den date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if p_tu is null or p_den is null or p_den<p_tu or p_den-p_tu>366 then raise exception 'Khoảng ngày không hợp lệ' using errcode='22023';end if;
 with tk as (
  select (t.tao_luc at time zone 'Asia/Ho_Chi_Minh')::date ngay,
   exists(select 1 from mtm_hw_private.students s where not s.is_test
    and mtm_hw_private.btvn_phone(t.sdt) in (mtm_hw_private.btvn_phone(s.student_phone),mtm_hw_private.btvn_phone(s.parent_phone))) trong
  from mtm_phong_thi.tai_khoan t where not t.is_test),
 ld as (
  select (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date ngay,l.kind,
   coalesce(substring(l.lead_source from 'Mã nguồn: ([A-Za-z0-9_-]+)'),'khong-ma') nguon
  from mtm_lead.leads l),
 lt as (
  select (l.nop_luc at time zone 'Asia/Ho_Chi_Minh')::date ngay,l.dot,l.nguoi,l.tai_khoan from mtm_test100.pt_luot l),
 ngoai as (
  select t.id from mtm_phong_thi.tai_khoan t where not t.is_test
   and not exists(select 1 from mtm_hw_private.students s where not s.is_test
    and mtm_hw_private.btvn_phone(t.sdt) in (mtm_hw_private.btvn_phone(s.student_phone),mtm_hw_private.btvn_phone(s.parent_phone)))),
 ngay as (select d::date ngay from generate_series(p_tu,p_den,interval '1 day') d)
 select jsonb_build_object(
  'tu',p_tu,'den',p_den,'luc',to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI'),
  'theoNgay',coalesce((select jsonb_agg(jsonb_build_object(
    'ngay',n.ngay,
    'taiKhoanMoi',jsonb_build_object('trong',(select count(*) from tk where tk.ngay=n.ngay and tk.trong),'ngoai',(select count(*) from tk where tk.ngay=n.ngay and not tk.trong)),
    'dangKy',coalesce((select jsonb_agg(jsonb_build_object('kind',x.kind,'nguon',x.nguon,'so',x.so) order by x.so desc,x.kind,x.nguon)
      from (select kind,nguon,count(*) so from ld where ld.ngay=n.ngay and ld.kind<>'kiem-tra-dau-vao' group by 1,2) x),'[]'::jsonb),
    'kiemTraDauVao',(select count(*) from ld where ld.ngay=n.ngay and ld.kind='kiem-tra-dau-vao'),
    'baiNop',coalesce((select jsonb_object_agg(x.dot,x.so) from (select coalesce(dot,'tu-do') dot,count(*) so from lt where lt.ngay=n.ngay group by 1) x),'{}'::jsonb)
   ) order by n.ngay) from ngay n),'[]'::jsonb),
  'cong',jsonb_build_object(
   'taiKhoanNgoai',(select count(*) from ngoai),'dichTaiKhoanNgoai',2000,
   'baiTheoDot',coalesce((select jsonb_object_agg(x.dot,x.so) from (select dot,count(*) so from lt where dot is not null group by 1) x),'{}'::jsonb),
   'dichBaiMoiDot',500,'soDotDat',(select count(*) from (select dot from lt where dot is not null group by 1 having count(*)>=500) x),'dichSoDot',3,
   'ngoaiThi7Ngay',(select count(distinct lt.tai_khoan) from lt join ngoai on ngoai.id=lt.tai_khoan where lt.ngay>(now() at time zone 'Asia/Ho_Chi_Minh')::date-7),
   'nguoiThiDot',(select count(distinct nguoi) from lt where dot is not null and nguoi<>'khach'),
   'quayLai2Dot',(select count(*) from (select nguoi from lt where dot is not null and nguoi<>'khach' group by 1 having count(distinct dot)>=2) x),
   'baoLoi',(select count(*) from mtm_phong_thi.bao_loi))) into r;
 return r;
end$$;
revoke all on function public.mtm_pt_so_pheu(date,date) from public,anon,authenticated;
grant execute on function public.mtm_pt_so_pheu(date,date) to service_role;
