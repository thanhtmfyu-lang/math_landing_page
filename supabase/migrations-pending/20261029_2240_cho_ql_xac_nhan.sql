-- 29/10/2026 (anh Thành duyệt 22:08): bảng ca sau giờ học không còn ghi "Chưa học".
-- "Chưa học" chỉ dùng trước giờ kết thúc ca. Đã qua giờ mà em đăng ký đúng ca chưa có dữ liệu
-- (chưa vân tay/Zoom, không xin nghỉ/chuyển ca) thì ghi "Chờ QL xác nhận", kể cả khi trước đây ghi "Chưa có điểm danh".
-- "Chưa học (còn ca ...)" của lớp XPS và luật tự ghi vắng sau 45 phút giữ nguyên.
-- Sửa tại chỗ trên bản đang chạy (pg_get_functiondef), dừng nếu mốc chữ đổi; chạy lại vô hại.
begin;
do $m$
declare
 src text:=pg_get_functiondef('mtm_hw_private.hv_ca_rows(date,date)'::regprocedure);
 a1 text:=$q$when (dk2.ngay+dk2.end_hm::time) > (select t from nowvn)-interval '45 minutes' then 'Chưa học'$q$;
 b1 text:=$q$when (dk2.ngay+dk2.end_hm::time) > (select t from nowvn) then 'Chưa học'$q$;
 a2 text:=$q$when coalesce(dk2.con,'')<>'' then 'Chưa học (còn ca '||dk2.con||')'$q$;
 b2 text:=a2||$q$ when (dk2.ngay+dk2.end_hm::time) > (select t from nowvn)-interval '45 minutes' then 'Chờ QL xác nhận'$q$;
 a3 text:=$q$else 'Chưa có điểm danh' end,$q$;
 b3 text:=$q$else 'Chờ QL xác nhận' end,$q$;
 n int;
begin
 if position('Chờ QL xác nhận' in src)>0 then return;end if;
 foreach n in array array[(length(src)-length(replace(src,a1,'')))/length(a1),(length(src)-length(replace(src,a2,'')))/length(a2),(length(src)-length(replace(src,a3,'')))/length(a3)] loop
  if n<>1 then raise exception 'CHO_QL_XAC_NHAN: mốc hv_ca_rows đã đổi, cần xem tay';end if;
 end loop;
 execute replace(replace(replace(src,a1,b1),a2,b2),a3,b3);
end$m$;
-- Bản web đọc hv_ca_rows_real100: chụp lại từ hàm vừa sửa (workflow Áp Supabase cũng gọi sau mỗi lượt).
do $r$begin if to_regprocedure('mtm_test100.refresh_reports()') is not null then perform mtm_test100.refresh_reports();end if;end$r$;
commit;
