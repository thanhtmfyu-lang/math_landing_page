-- Chỉ chạy khi owner duyệt rollback, sau khi gỡ frontend NM8.
-- Lưu bản sao lịch sử nội bộ trước, vì rollback xóa lịch sử nhãn, không chép dữ liệu riêng vào Git.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
drop function public.mtm_hw_enrollment_set(uuid,text,integer);
drop function public.mtm_hw_enrollment_statuses(uuid[]);
drop table mtm_hw_private.enrollment_status_history;
alter table mtm_hw_private.students drop column enrollment_status,drop column enrollment_version;
commit;
