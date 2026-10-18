-- Chạy sau migration 061 trong cùng transaction trước ROLLBACK hoặc sau khi áp thật.
-- Chỉ báo lỗi tổng quát; không SELECT hàng dữ liệu học sinh ra đầu ra.
do $$
declare header text;
begin
 if has_function_privilege('anon','public.mtm_btvn_sheet_csv6(text)','execute')
    or has_function_privilege('authenticated','public.mtm_btvn_sheet_csv6(text)','execute') then
  raise exception 'H3: anon/authenticated còn quyền gọi CSV';
 end if;
 if not has_function_privilege('service_role','public.mtm_btvn_sheet_csv6(text)','execute') then
  raise exception 'H3: service_role thiếu quyền gọi CSV';
 end if;
 header=split_part(public.mtm_btvn_sheet_csv6('hocsinh'),E'\n',1);
 if header<>'Học sinh,Lớp,Khoá,Trường,Lịch riêng (ghi trong sổ),Có tài khoản web,Lần nộp BTVN gần nhất,Cập nhật lúc'
    or array_length(string_to_array(header,','),1)<>8 then
  raise exception 'H3: tiêu đề hocsinh chưa đúng 8 cột an toàn';
 end if;
 if position('mtm_hw_private.guardians' in pg_get_functiondef('public.mtm_btvn_sheet_csv6(text)'::regprocedure))>0 then
  raise exception 'H3: CSV hocsinh vẫn đọc guardians';
 end if;
end $$;
