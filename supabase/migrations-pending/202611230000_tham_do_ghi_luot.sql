-- THĂM DÒ, KHÔNG MERGE: gọi đúng hàm web dùng khi nộp bài, với vai service_role, rồi hủy toàn bộ (raise => rollback).
-- Kết quả đọc ở dòng lỗi của bước Áp migration: PT_THAM_DO OK ... hoặc PT_THAM_DO LOI ...
begin;
set local role service_role;
do $p$ declare r jsonb; n0 bigint; n1 bigint; begin
 select count(*) into n0 from mtm_phong_thi.luot;
 r=public.mtm_pt_ghi_luot_real100('tham-do-'||md5(clock_timestamp()::text),'thpt-thang-11','thpt','khach',null,null,5,10,1,2,60,false,'{"thamDo":true}'::jsonb,null,null,null);
 select count(*) into n1 from mtm_phong_thi.luot;
 raise exception 'PT_THAM_DO OK truoc=% sau=% kq=%', n0, n1, left(r::text,80);
exception when others then
 if sqlerrm like 'PT_THAM_DO OK%' then raise; end if;
 raise exception 'PT_THAM_DO LOI %', left(sqlerrm,160);
end$p$;
rollback;
