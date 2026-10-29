-- Chỉ đọc: báo lỗi nếu tài khoản quản lý chung chưa có, chưa xác nhận email hoặc chưa có quyền quản trị.
do $q$
begin
 if to_regclass('auth.identities') is null then return; end if; -- bộ test PGlite
 if not exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id and i.provider='email'
  join public.mtm_exam_admins a on a.user_id=u.id
  where u.email='quanly@minhthanhmath.vn' and u.email_confirmed_at is not null and u.encrypted_password like '$2a$12$%')
 then raise exception 'MTM_QL_CHUA_CO'; end if;
end
$q$;
