-- Tài khoản quản trị dùng chung cho quản lý (đăng nhập "quanly" hoặc quanly@minhthanhmath.vn).
-- Chỉ ghi bcrypt hash; mật khẩu không có trong kho. Quyền = mtm_exam_admins (đề thi, BTVN, báo điểm trước ca);
-- các trang quản trị không có thao tác xóa dữ liệu hay học phí, nháp đề tách theo từng tài khoản.
-- 29/10 22:30: anh Thành muốn mật khẩu dễ nhớ, bản này thay hash.
-- Chạy lại an toàn: tài khoản đã có thì chỉ cập nhật mật khẩu và giữ quyền.
begin;
do $q$
declare v_email text='quanly@minhthanhmath.vn'; v_hash text='$2a$12$UKZz40pyyjWpAFpCtz05P.M.YPCVbyWesRZiwdJN8C931GNrinnkm'; v_id uuid;
begin
 -- Bộ test PGlite chỉ có auth.users rút gọn: bỏ qua, chỉ chạy trên Supabase thật.
 if not exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='encrypted_password')
  or to_regclass('auth.identities') is null then return; end if;
 select id into v_id from auth.users where email=v_email;
 if v_id is null then
  v_id='d7ec8afe-76bc-4d86-90a6-fd689ea60895';
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
   confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
  values('00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',v_email,v_hash,now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{"ten":"Quản lý MTM"}'::jsonb,now(),now(),'','','','','','','','');
  insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  values(gen_random_uuid(),v_id::text,v_id,jsonb_build_object('sub',v_id::text,'email',v_email,'email_verified',true),'email',now(),now(),now());
 else
  update auth.users set encrypted_password=v_hash,email_confirmed_at=coalesce(email_confirmed_at,now()),updated_at=now() where id=v_id;
 end if;
 insert into public.mtm_exam_admins(user_id) values(v_id) on conflict (user_id) do nothing;
end
$q$;
commit;
