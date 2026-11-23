-- Số phễu hằng ngày cho phòng marketing. CHỈ ĐỌC, chỉ số tổng (không tên, SĐT, mã tài khoản).
-- Bỏ tài khoản/học sinh thử (is_test, view mtm_test100.pt_luot). Giờ Việt Nam.
-- __TU__, __DEN__ (YYYY-MM-DD) do workflow thay sau khi đã kiểm đúng dạng.
with l as (select * from mtm_test100.pt_luot where dot='hsa-thu-2026-11'),
ngoai as (
 select t.id from mtm_phong_thi.tai_khoan t where not t.is_test
  and not exists(select 1 from mtm_hw_private.students s where not s.is_test
   and mtm_hw_private.btvn_phone(t.sdt) in (mtm_hw_private.btvn_phone(s.student_phone),mtm_hw_private.btvn_phone(s.parent_phone)))),
ld as (
 select l.kind,coalesce(substring(l.lead_source from 'Mã nguồn: ([A-Za-z0-9_-]+)'),'khong-ma') nguon
 from mtm_lead.leads l
 where (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date between date '__TU__' and date '__DEN__')
select jsonb_build_object(
 'luc',to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI'),
 'tu','__TU__','den','__DEN__',
 'hsa1',jsonb_build_object(
  'baiNop',(select count(*) from l),
  'baiCuaKhach',(select count(*) from l where nguoi='khach'),
  'baiCoTaiKhoan',(select count(*) from l where nguoi like 'tk:%'),
  'baiHsMtm',(select count(*) from l where nguoi like 'hs:%'),
  'nguoiNopKhacNhau',(select count(distinct nguoi) from l where nguoi<>'khach'),
  'taiKhoanNgoaiDaNop',(select count(distinct l.tai_khoan) from l join ngoai on ngoai.id=l.tai_khoan),
  'diemTb10',(select round(avg(diem/nullif(thang,0)*10),2) from l),
  'theoNgay',coalesce((select jsonb_object_agg(ngay,so) from (select (nop_luc at time zone 'Asia/Ho_Chi_Minh')::date::text ngay,count(*) so from l group by 1) x),'{}'::jsonb)),
 'taiKhoanNgoai',jsonb_build_object(
  'tong',(select count(*) from ngoai),
  'moiTrongKhoang',(select count(*) from mtm_phong_thi.tai_khoan t join ngoai on ngoai.id=t.id
    where (t.tao_luc at time zone 'Asia/Ho_Chi_Minh')::date between date '__TU__' and date '__DEN__')),
 'dangKyTheoNguon',coalesce((select jsonb_agg(jsonb_build_object('nguon',nguon,'kind',kind,'so',so) order by so desc,nguon,kind)
   from (select nguon,kind,count(*) so from ld group by 1,2) x),'[]'::jsonb),
 'baiTheoNguon',coalesce((select jsonb_agg(jsonb_build_object('dot',dot,'nguon',nguon,'so',so) order by dot,so desc,nguon)
   from (select coalesce(p.dot,'tu-do') dot,coalesce(p.chi_tiet->>'nguon','khong-ma') nguon,count(*) so from mtm_test100.pt_luot p
    where (p.nop_luc at time zone 'Asia/Ho_Chi_Minh')::date between date '__TU__' and date '__DEN__' group by 1,2) x),'[]'::jsonb),
 -- Kiểm nguồn: số thô chưa lọc, để phân biệt "thật sự 0" với lỗi dữ liệu/lọc.
 'kiemNguon',jsonb_build_object(
  'luotTatCa',(select count(*) from mtm_phong_thi.luot),
  'luotSauLoc',(select count(*) from mtm_test100.pt_luot),
  'luotHsa1Tho',(select count(*) from mtm_phong_thi.luot where dot='hsa-thu-2026-11'),
  'luotMoiNhat',(select to_char(max(nop_luc) at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI') from mtm_phong_thi.luot),
  'dotCoBai',coalesce((select jsonb_object_agg(coalesce(dot,'tu-do'),so) from (select dot,count(*) so from mtm_phong_thi.luot group by 1) x),'{}'::jsonb),
  'taiKhoanTatCa',(select count(*) from mtm_phong_thi.tai_khoan),
  'taiKhoanThu',(select count(*) from mtm_phong_thi.tai_khoan where is_test),
  'leadTatCa',(select count(*) from mtm_lead.leads),
  'leadMoiNhat',(select to_char(max(created_at) at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI') from mtm_lead.leads)),
 'soPheu',public.mtm_pt_so_pheu(date '__TU__',date '__DEN__')) as so;
