-- 054 (18/10, rà bảo mật H1): nhánh "-- 18" của mtm_btvn_forgot cho vào bằng đúng họ tên + SĐT BẤT KỲ. Với PIN, người lạ có thể vào trước và tự đặt PIN, chiếm tài khoản.
-- Sửa: chỉ TẠO PIN lần đầu khi SĐT khớp đúng hồ sơ (HS hoặc PH). SĐT khác hồ sơ: phải nhập PIN đã có; chưa có PIN thì từ chối (pin='phone'), giáo vụ cập nhật SĐT.
-- Khoá chống dò PIN tách đôi: lượt sai từ SĐT lạ không khoá được em thật đang vào bằng đúng SĐT. ĐÃ ÁP (Claude).
begin;
alter table mtm_hw_private.student_pins add column if not exists failed_ph int not null default 0, add column if not exists locked_ph_until timestamptz;

create or replace function public.mtm_btvn_forgot_pin(p_full_name text,p_phone text,p_class_name text,p_pin text,p_new_pin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; raw text; dg bytea; sid uuid; pr record; ph boolean; lk timestamptz; fl int;
begin
 r=public.mtm_btvn_forgot(p_full_name,p_phone,p_class_name);
 if coalesce((r->>'ok')::boolean,false) is not true then return r; end if;
 raw=r->>'session'; dg=mtm_hw_private.token_digest('btvn-identity',raw);
 select x.student_id into sid from mtm_hw_private.btvn_identity_sessions x where x.digest=dg;
 select mtm_hw_private.btvn_phone2(p_phone) in (mtm_hw_private.btvn_phone2(s.student_phone),mtm_hw_private.btvn_phone2(s.parent_phone))
  into ph from mtm_hw_private.students s where s.id=sid;
 ph=coalesce(ph,false);
 select * into pr from mtm_hw_private.student_pins where student_id=sid for update;
 if pr.student_id is null then
  if not ph then
   delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
   return jsonb_build_object('ok',false,'pin','phone');
  end if;
  if p_new_pin ~ '^[0-9]{6}$' and p_new_pin !~ '^(.)\1{5}$' and p_new_pin not in ('123456','654321','012345','098765') then
   insert into mtm_hw_private.student_pins(student_id,pin_hash) values(sid,extensions.crypt(p_new_pin,extensions.gen_salt('bf',8)));
   return r||jsonb_build_object('pinCreated',true);
  end if;
  delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
  return jsonb_build_object('ok',false,'pin',case when p_new_pin is null then 'setup' else 'weak' end);
 end if;
 lk=case when ph then pr.locked_ph_until else pr.locked_until end;
 fl=case when ph then pr.failed_ph else pr.failed end;
 if lk is not null and lk>clock_timestamp() then
  delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
  return jsonb_build_object('ok',false,'pin','locked','until',extract(epoch from lk)*1000);
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
  return jsonb_build_object('ok',false,'pin','required');
 end if;
 if extensions.crypt(p_pin,pr.pin_hash)=pr.pin_hash then
  if ph then update mtm_hw_private.student_pins set failed_ph=0,locked_ph_until=null where student_id=sid;
  else update mtm_hw_private.student_pins set failed=0,locked_until=null where student_id=sid; end if;
  return r;
 end if;
 delete from mtm_hw_private.btvn_identity_sessions where digest=dg;
 if fl+1>=5 then
  if ph then update mtm_hw_private.student_pins set failed_ph=0,locked_ph_until=clock_timestamp()+interval '15 minutes' where student_id=sid;
  else update mtm_hw_private.student_pins set failed=0,locked_until=clock_timestamp()+interval '15 minutes' where student_id=sid; end if;
  return jsonb_build_object('ok',false,'pin','locked','until',extract(epoch from clock_timestamp()+interval '15 minutes')*1000);
 end if;
 if ph then update mtm_hw_private.student_pins set failed_ph=failed_ph+1 where student_id=sid;
 else update mtm_hw_private.student_pins set failed=failed+1 where student_id=sid; end if;
 return jsonb_build_object('ok',false,'pin','wrong','remaining',5-(fl+1));
end$$;
revoke all on function public.mtm_btvn_forgot_pin(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_forgot_pin(text,text,text,text,text) to service_role;
commit;
