-- 093 (21/10, anh Thành: PH Trần Trọng Nhân 2K9 8+ nhập đúng vẫn báo "chưa khớp").
-- Nguyên nhân: so tên bằng btvn_name không bỏ ghi chú lịch trong ngoặc ở full_name ("Tên (T3, CN 9+)") và bắt đúng cả 2 SĐT.
-- Luật mới: tên con khớp có hoặc không dấu, bỏ ghi chú ngoặc (vn_fold) + đúng lớp + 1 trong 2 SĐT (PH hoặc con) khớp
-- bất kỳ số nào trong hồ sơ (student_phone, parent_phone, số phụ đã xác nhận). Vẫn phải ra đúng 1 em; khoá thử sai giữ nguyên.
begin;
create or replace function public.mtm_ph_link(p_parent_phone text,p_parent_name text,p_child_name text,p_child_phone text,p_class_name text,p_pin text,p_new_pin text,p_net text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ph text=mtm_hw_private.btvn_phone2(p_parent_phone);cp text=mtm_hw_private.btvn_phone2(p_child_phone);sid uuid;n int;acc record;
begin
 if p_net is null or length(p_net)<16 then return '{"ok":false}'::jsonb;end if;
 if mtm_hw_private.ph_locked(ph,p_net) then return jsonb_build_object('ok',false,'pin','locked');end if;
 if ph !~ '^0[0-9]{9}$' or cp !~ '^0[0-9]{9}$' or not mtm_hw_private.valid_text(p_child_name,160) or not mtm_hw_private.valid_text(p_class_name,160)
  or (p_parent_name is not null and not mtm_hw_private.valid_text(p_parent_name,160)) then
  perform mtm_hw_private.ph_fail(ph,p_net);return '{"ok":false}'::jsonb;end if;
 select count(*),(array_agg(s.id))[1] into n,sid
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 where s.active and c.active
  and mtm_hw_private.vn_fold(s.full_name)=mtm_hw_private.vn_fold(p_child_name)
  and mtm_hw_private.btvn_name(c.label)=mtm_hw_private.btvn_name(p_class_name)
  and exists(select 1 from (select mtm_hw_private.btvn_phone2(s.student_phone) v union all select mtm_hw_private.btvn_phone2(s.parent_phone)
             union all select mtm_hw_private.btvn_phone2(x.phone) from mtm_hw_private.student_extra_phones x where x.student_id=s.id) k
             where k.v in (ph,cp));
 if n<>1 then perform mtm_hw_private.ph_fail(ph,p_net);return '{"ok":false}'::jsonb;end if;
 select * into acc from mtm_hw_private.parent_accounts where phone=ph for update;
 if acc.phone is null then
  if p_new_pin is null then return jsonb_build_object('ok',false,'pin','setup');end if;
  if mtm_hw_private.ph_weak_pin(p_new_pin) then return jsonb_build_object('ok',false,'pin','weak');end if;
  insert into mtm_hw_private.parent_accounts(phone,parent_name,pin_hash) values(ph,nullif(btrim(p_parent_name),''),extensions.crypt(p_new_pin,extensions.gen_salt('bf',8)));
 else
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'pin','required');end if;
  if extensions.crypt(p_pin,acc.pin_hash)<>acc.pin_hash then
   perform mtm_hw_private.ph_fail(ph,p_net);
   return jsonb_build_object('ok',false,'pin',case when mtm_hw_private.ph_locked(ph,p_net) then 'locked' else 'wrong' end,
    'remaining',greatest(0,5-coalesce((select failed from mtm_hw_private.parent_accounts where phone=ph),0)));
  end if;
  update mtm_hw_private.parent_accounts set failed=0,locked_until=null,updated_at=now(),parent_name=coalesce(nullif(btrim(p_parent_name),''),parent_name) where phone=ph;
 end if;
 insert into mtm_hw_private.parent_links(phone,student_id) values(ph,sid) on conflict do nothing;
 return jsonb_build_object('ok',true,'session',mtm_hw_private.ph_new_session(ph));
end$$;

revoke all on function public.mtm_ph_link(text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_ph_link(text,text,text,text,text,text,text,text) to service_role;
commit;
