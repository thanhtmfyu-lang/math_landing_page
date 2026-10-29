-- 29/10/2026: đặt lại PIN của 4 HS thử QA (20261029_1531_is_test_qa_seed.sql). Lần kiểm vai HS đầu tiên đã tạo PIN nhưng không lưu lại.
-- Chỉ xóa dòng student_pins của đúng HS is_test có source_identity 'qa:is-test:20261029:<i>'; lần đăng nhập sau web cho đặt PIN mới.
-- Không đụng HS thật. Chạy lại vô hại.
begin;
set local lock_timeout='5s';
do $pin$
declare n integer;
begin
 if exists(select 1 from mtm_hw_private.students where source_identity like 'qa:is-test:20261029:%' and not is_test) then
  raise exception 'IS_TEST_QA_PIN: co HS qa khong phai is_test';end if;
 delete from mtm_hw_private.student_pins p using mtm_hw_private.students s
  where s.id=p.student_id and s.is_test and s.source_identity like 'qa:is-test:20261029:%';
 get diagnostics n=row_count;
 if n>4 then raise exception 'IS_TEST_QA_PIN: xoa % dong, qua 4',n;end if;
 raise notice 'IS_TEST_QA_PIN: dat lai % PIN',n;
end$pin$;
commit;
