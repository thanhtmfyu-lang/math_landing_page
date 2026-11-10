-- 10/11/2026 (anh Thành: "đọc đi chứ"): báo cáo tuần cho PH cần điểm danh cả lớp, nhưng chỉ đọc được qua token Edge trên VPS.
-- Hàm này cho GV/QL đăng nhập quản trị (mtm_is_exam_admin) đọc điểm danh theo khoảng ngày, giống mtm_truoc_ca_admin.
--  * Nguồn: hv_ca_rows_real100 (TKB lớp, lịch riêng, chuyển buổi; đã bỏ HS nghỉ hẳn và tài khoản thử).
--  * Không trả SĐT, học phí, ghi chú nội bộ, giờ vào/ra. Chỉ đọc. Khoảng tối đa 14 ngày, trong 60 ngày gần nhất.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create or replace function public.mtm_diem_danh_admin(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date=(current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date; out jsonb;
begin
 if not public.mtm_is_exam_admin() then raise exception 'MTM_DIEM_DANH_ADMIN_ONLY' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>13 or p_from<today-60 or p_to>today then
  raise exception 'MTM_DIEM_DANH_RANGE' using errcode='22023'; end if;
 select jsonb_build_object('from',p_from,'to',p_to,'generatedAt',to_char(current_timestamp at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI'),
  'rows',coalesce(jsonb_agg(jsonb_build_object('ngay',x.ngay,'ca',x.ca_lop,'gio',x.gio,'hocSinh',x.hoc_sinh,'lopGoc',x.lop_goc,
   'nguon',x.nguon_dk,'trangThai',x.trang_thai,'hinhThuc',x.hinh_thuc) order by x.ngay,x.gio,x.ca_lop,x.hoc_sinh),'[]'::jsonb)) into out
 from (select distinct ngay,ca_lop,gio,hoc_sinh,lop_goc,nguon_dk,trang_thai,hinh_thuc from mtm_hw_private.hv_ca_rows_real100(p_from,p_to)) x;
 return out;
end$$;
revoke all on function public.mtm_diem_danh_admin(date,date) from public,anon,authenticated,service_role;
grant execute on function public.mtm_diem_danh_admin(date,date) to authenticated;
commit;
