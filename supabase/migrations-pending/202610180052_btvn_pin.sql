-- 052 (18/10, anh Thành chọn "Mã PIN riêng"): đăng nhập bằng họ tên + SĐT + lớp phải kèm MÃ PIN 6 số.
-- Lần đầu (em chưa có PIN): bắt buộc tự đặt PIN 6 số rồi mới vào bài. Sai PIN 5 lần: khoá 15 phút. PIN lưu băm bcrypt (pgcrypto), không đọc ngược.
-- Quên PIN: giáo vụ xác nhận PH rồi Javis gọi kho action 'pin_reset' -> lần sau em đặt PIN mới. Đăng nhập bằng mã học sinh (bí mật riêng) giữ nguyên.
-- ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.student_pins(
 student_id uuid primary key references mtm_hw_private.students(id), pin_hash text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 failed int not null default 0, locked_until timestamptz);
alter table mtm_hw_private.student_pins enable row level security;
revoke all on mtm_hw_private.student_pins from public,anon,authenticated;

create or replace function public.mtm_btvn_forgot_pin(p_full_name text,p_phone text,p_class_name text,p_pin text,p_new_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; raw text; dg bytea; sid uuid; pr record;
begin
 r=public.mtm_btvn_forgot(p_full_name,p_phone,p_class_name);
 if coalesce((r->>'ok')::boolean,false) is not true then return r; end if;
 raw=r->>'session'; dg=mtm_hw_private.token_digest('btvn-identity',raw);
 select x.student_id into sid from mtm_hw_private.btvn_identity_sessions x where x.digest=dg;
 select * into pr from mtm_hw_private.student_pins where student_id=sid for update;
 if pr.student_id is not null and pr.locked_until is not null and pr.locked_until>clock_timestamp() then
  delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
  return jsonb_build_object('ok',false,'pin','locked','until',extract(epoch from pr.locked_until)*1000);
 end if;
 if pr.student_id is null then
  if p_new_pin ~ '^[0-9]{6}$' and p_new_pin !~ '^(.)\1{5}$' and p_new_pin not in ('123456','654321','012345','098765') then
   insert into mtm_hw_private.student_pins(student_id,pin_hash) values(sid,extensions.crypt(p_new_pin,extensions.gen_salt('bf',8)));
   return r||jsonb_build_object('pinCreated',true);
  end if;
  delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
  return jsonb_build_object('ok',false,'pin',case when p_new_pin is null then 'setup' else 'weak' end);
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
  return jsonb_build_object('ok',false,'pin','required');
 end if;
 if extensions.crypt(p_pin,pr.pin_hash)=pr.pin_hash then
  update mtm_hw_private.student_pins set failed=0,locked_until=null where student_id=sid;
  return r;
 end if;
 delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
 if pr.failed+1>=5 then
  update mtm_hw_private.student_pins set failed=0,locked_until=clock_timestamp()+interval '15 minutes' where student_id=sid;
  return jsonb_build_object('ok',false,'pin','locked','until',extract(epoch from clock_timestamp()+interval '15 minutes')*1000);
 end if;
 update mtm_hw_private.student_pins set failed=failed+1 where student_id=sid;
 return jsonb_build_object('ok',false,'pin','wrong','remaining',5-(pr.failed+1));
end$$;
revoke all on function public.mtm_btvn_forgot_pin(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_forgot_pin(text,text,text,text,text) to service_role;

-- Kho: Javis đặt lại PIN sau khi giáo vụ xác nhận PH (không bao giờ trả PIN).
create or replace function public.mtm_dd_api10(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; n int;
begin
 if p->>'action'='pin_reset' then
  st=mtm_hw_private.dd_find_student(p->>'student',p->>'class');
  if st ? 'error' then return st; end if;
  delete from mtm_hw_private.student_pins where student_id=(st->>'id')::uuid; get diagnostics n=row_count;
  update mtm_hw_private.btvn_identity_sessions set revoked_at=clock_timestamp() where student_id=(st->>'id')::uuid and revoked_at is null;
  return jsonb_build_object('ok',true,'student',st,'hadPin',n=1);
 elsif p->>'action'='pin_status' then
  return coalesce((select jsonb_build_object('total',count(*),'withPin',count(pp.student_id)) from mtm_hw_private.students s
   left join mtm_hw_private.student_pins pp on pp.student_id=s.id where s.active and coalesce(s.source_identity,'') not like 'qa:%'),'{}'::jsonb);
 end if;
 return public.mtm_dd_api9(p);
end$$;
revoke all on function public.mtm_dd_api10(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api10(jsonb) to service_role;
commit;
