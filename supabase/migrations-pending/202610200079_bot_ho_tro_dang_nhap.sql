-- 079 (20/10, anh Thành 20:36): chatbot Zalo là hỗ trợ kỹ thuật web. HS nhắn họ tên + SĐT + lớp, bot tự tra, đối chiếu sổ và sửa
-- tài khoản không chờ xác nhận. Chỉ service_role (khoá bot giữ ở máy chủ, không ở trình duyệt). Mọi lần tra/sửa ghi nhật ký.
-- Không bao giờ trả PIN hay SĐT trong sổ; chỉ trả "khớp / không khớp". Đặt lại PIN chỉ khi SĐT người nhắn khớp hồ sơ (HS, PH hoặc số phụ đã xác nhận).
-- Luồng Công ty AI áp. Không đụng bảng cũ ngoài student_pins (xoá khoá/xoá PIN đúng 1 em).
begin;
create table if not exists mtm_hw_private.bot_support_log(
 id bigserial primary key, at timestamptz not null default now(), action text not null, student_id uuid,
 actor text, result text not null, detail jsonb not null default '{}'::jsonb);
alter table mtm_hw_private.bot_support_log enable row level security;
revoke all on mtm_hw_private.bot_support_log from public,anon,authenticated;

-- Tìm đúng 1 em theo tên (bỏ dấu, không phân biệt hoa thường) + lớp. Nội bộ.
create or replace function mtm_hw_private.bot_find(p_full_name text,p_class text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_full_name is null or length(trim(p_full_name)) not between 2 and 80 then return '{"error":"thieu-ten"}'::jsonb;end if;
 return mtm_hw_private.dd_find_student(trim(p_full_name),nullif(trim(coalesce(p_class,'')),''));
end$$;
revoke all on function mtm_hw_private.bot_find(text,text) from public,anon,authenticated;

create or replace function mtm_hw_private.bot_phone_kind(p_student uuid,p_phone text) returns text
language sql stable security definer set search_path='' as $$
 select case
  when coalesce(mtm_hw_private.btvn_phone2(p_phone),'')!~'^0[0-9]{9}$' then 'khong-hop-le'
  when mtm_hw_private.btvn_phone2(s.student_phone)=mtm_hw_private.btvn_phone2(p_phone) then 'hoc-sinh'
  when mtm_hw_private.btvn_phone2(s.parent_phone)=mtm_hw_private.btvn_phone2(p_phone) then 'phu-huynh'
  when exists(select 1 from mtm_hw_private.student_extra_phones x where x.student_id=s.id and mtm_hw_private.btvn_phone2(x.phone)=mtm_hw_private.btvn_phone2(p_phone)) then 'so-phu'
  else 'khong-khop' end
 from mtm_hw_private.students s where s.id=p_student
$$;
revoke all on function mtm_hw_private.bot_phone_kind(uuid,text) from public,anon,authenticated;

-- Tra trạng thái tài khoản + chẩn đoán + lời khuyên cho bot gửi lại HS.
create or replace function public.mtm_bot_hs_check(p_full_name text,p_phone text,p_class text,p_actor text default 'zalo-bot') returns jsonb
language plpgsql security definer set search_path='' as $$
declare st jsonb;sid uuid;s record;pr record;kind text;code text;advice text;out jsonb;
begin
 st=mtm_hw_private.bot_find(p_full_name,p_class);
 if st ? 'error' or st->>'id' is null then
  out=jsonb_build_object('found',false,'code','khong-thay-ten',
   'candidates',coalesce(st->'candidates',st->'matches','[]'::jsonb),
   'advice','Chưa tìm thấy đúng một học sinh tên này trong lớp đã nêu. Kiểm tra lại họ tên đầy đủ có dấu và lớp; nếu đúng mà vẫn không thấy, chuyển quản lý thêm em vào sổ.');
  insert into mtm_hw_private.bot_support_log(action,actor,result,detail) values('check',left(p_actor,64),'khong-thay-ten',jsonb_build_object('class',p_class));
  return out;
 end if;
 sid=(st->>'id')::uuid;
 select s2.full_name,c.label class_label,s2.active,c.active class_active into s from mtm_hw_private.students s2 join mtm_hw_private.classes c on c.id=s2.class_id where s2.id=sid;
 select * into pr from mtm_hw_private.student_pins where student_id=sid;
 kind=mtm_hw_private.bot_phone_kind(sid,p_phone);
 code=case
  when kind in ('khong-khop','khong-hop-le') and pr.student_id is null then 'sdt-lech-chua-pin'
  when pr.student_id is not null and ((pr.locked_until is not null and pr.locked_until>clock_timestamp()) or (pr.locked_ph_until is not null and pr.locked_ph_until>clock_timestamp())) then 'khoa-pin'
  when kind in ('khong-khop','khong-hop-le') then 'sdt-lech'
  when pr.student_id is null then 'chua-dat-pin'
  else 'binh-thuong' end;
 advice=case code
  when 'sdt-lech-chua-pin' then 'Số điện thoại em nhắn không khớp hồ sơ nên web chưa cho tạo PIN. Em đăng nhập bằng số đã đăng ký với lớp (số của em hoặc của phụ huynh); nếu đổi số, nhắn quản lý cập nhật.'
  when 'khoa-pin' then 'Tài khoản đang tạm khoá do nhập sai PIN nhiều lần. Bot mở khoá được ngay (mtm_bot_hs_unlock).'
  when 'sdt-lech' then 'Số điện thoại không khớp hồ sơ. Em đăng nhập bằng đúng số đã đăng ký với lớp kèm PIN đã đặt.'
  when 'chua-dat-pin' then 'Em chưa đặt PIN. Vào minhthanhmath.vn/btvn, nhập họ tên đúng như sổ, đúng lớp, đúng số điện thoại, web sẽ hỏi tạo PIN 6 số.'
  else 'Hồ sơ khớp. Nếu em quên PIN, bot đặt lại được (mtm_bot_hs_reset_pin) rồi em tạo PIN mới.' end;
 out=jsonb_build_object('found',true,'code',code,'advice',advice,
  'fullNameInRoster',s.full_name,'className',s.class_label,'active',s.active and s.class_active,
  'phoneMatch',kind,'pinSet',pr.student_id is not null,
  'locked',coalesce(pr.locked_until>clock_timestamp(),false),'lockedFromOtherPhone',coalesce(pr.locked_ph_until>clock_timestamp(),false),
  'failed',coalesce(pr.failed,0),'failedOtherPhone',coalesce(pr.failed_ph,0),
  'nameExact',mtm_hw_private.btvn_name(s.full_name)=mtm_hw_private.btvn_name(p_full_name));
 insert into mtm_hw_private.bot_support_log(action,student_id,actor,result,detail) values('check',sid,left(p_actor,64),code,jsonb_build_object('phoneMatch',kind));
 return out;
end$$;

-- Mở khoá PIN (xoá đếm sai + khoá 15 phút). Không đổi PIN.
create or replace function public.mtm_bot_hs_unlock(p_full_name text,p_class text,p_actor text default 'zalo-bot') returns jsonb
language plpgsql security definer set search_path='' as $$
declare st jsonb;sid uuid;n int;
begin
 st=mtm_hw_private.bot_find(p_full_name,p_class);
 if st ? 'error' or st->>'id' is null then return '{"ok":false,"code":"khong-thay-ten"}'::jsonb;end if;
 sid=(st->>'id')::uuid;
 update mtm_hw_private.student_pins set failed=0,locked_until=null,failed_ph=0,locked_ph_until=null,updated_at=now() where student_id=sid;
 get diagnostics n=row_count;
 insert into mtm_hw_private.bot_support_log(action,student_id,actor,result) values('unlock',sid,left(p_actor,64),case when n=1 then 'ok' else 'chua-co-pin' end);
 return jsonb_build_object('ok',true,'unlocked',n=1,'className',st->>'className','fullNameInRoster',st->>'fullName');
end$$;

-- Đặt lại PIN (HS quên PIN): chỉ khi SĐT người nhắn khớp hồ sơ em đó. Lần đăng nhập sau web hỏi tạo PIN mới.
create or replace function public.mtm_bot_hs_reset_pin(p_full_name text,p_class text,p_phone text,p_actor text default 'zalo-bot') returns jsonb
language plpgsql security definer set search_path='' as $$
declare st jsonb;sid uuid;kind text;n int;
begin
 st=mtm_hw_private.bot_find(p_full_name,p_class);
 if st ? 'error' or st->>'id' is null then return '{"ok":false,"code":"khong-thay-ten"}'::jsonb;end if;
 sid=(st->>'id')::uuid;kind=mtm_hw_private.bot_phone_kind(sid,p_phone);
 if kind not in ('hoc-sinh','phu-huynh','so-phu') then
  insert into mtm_hw_private.bot_support_log(action,student_id,actor,result) values('reset_pin',sid,left(p_actor,64),'tu-choi-sdt');
  return jsonb_build_object('ok',false,'code','sdt-lech','advice','Số điện thoại không khớp hồ sơ nên chưa đặt lại PIN. Phụ huynh nhắn quản lý lớp để xác nhận.');
 end if;
 delete from mtm_hw_private.student_pins where student_id=sid;get diagnostics n=row_count;
 delete from mtm_hw_private.btvn_identity_sessions where student_id=sid;
 insert into mtm_hw_private.bot_support_log(action,student_id,actor,result,detail) values('reset_pin',sid,left(p_actor,64),'ok',jsonb_build_object('phoneMatch',kind,'hadPin',n=1));
 return jsonb_build_object('ok',true,'className',st->>'className','fullNameInRoster',st->>'fullName',
  'advice','Đã đặt lại. Em vào minhthanhmath.vn/btvn, nhập họ tên đúng như sổ ('||(st->>'fullName')||'), lớp '||(st->>'className')||', số điện thoại đã đăng ký; web sẽ hỏi tạo PIN 6 số mới.');
end$$;

-- Phụ huynh quên PIN Góc phụ huynh: bot chỉ làm khi người nhắn đúng là số PH đó (Zalo đã ghép bằng mã 6 số), xoá tài khoản PH để ghép lại.
create or replace function public.mtm_bot_ph_reset_pin(p_parent_phone text,p_zalo_id text,p_actor text default 'zalo-bot') returns jsonb
language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.btvn_phone2(p_parent_phone);
begin
 if not exists(select 1 from mtm_hw_private.parent_zalo z where z.zalo_id=p_zalo_id and z.phone=ph) then
  insert into mtm_hw_private.bot_support_log(action,actor,result) values('ph_reset_pin',left(p_actor,64),'tu-choi-zalo');
  return jsonb_build_object('ok',false,'advice','Zalo này chưa ghép với số phụ huynh đó. Phụ huynh nhắn quản lý lớp để đặt lại.');
 end if;
 perform public.mtm_ph_reset_pin(ph);
 insert into mtm_hw_private.bot_support_log(action,actor,result) values('ph_reset_pin',left(p_actor,64),'ok');
 return jsonb_build_object('ok',true,'advice','Đã đặt lại. Phụ huynh vào minhthanhmath.vn/phu-huynh, chọn "Lần đầu: ghép con" và tạo PIN mới.');
end$$;

revoke all on function public.mtm_bot_hs_check(text,text,text,text),public.mtm_bot_hs_unlock(text,text,text),public.mtm_bot_hs_reset_pin(text,text,text,text),public.mtm_bot_ph_reset_pin(text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_bot_hs_check(text,text,text,text),public.mtm_bot_hs_unlock(text,text,text),public.mtm_bot_hs_reset_pin(text,text,text,text),public.mtm_bot_ph_reset_pin(text,text,text) to service_role;
commit;
