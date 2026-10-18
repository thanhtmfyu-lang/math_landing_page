-- 036 (18/10): move chống trùng theo sourceMsg (vd mã YC-<ngày>-<số>): gọi lại cùng mã thì trả lần chuyển cũ, không tạo thêm. ĐÃ ÁP (Claude).
begin;
create unique index if not exists schedule_moves_source_msg_uq on mtm_hw_private.schedule_moves(source_msg) where source_msg is not null and cancelled_at is null;
create or replace function public.mtm_dd_api3(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare old record;
begin
 if p->>'action'='move' and coalesce(p->>'sourceMsg','')<>'' then
  select m.id,s.full_name,c.label into old from mtm_hw_private.schedule_moves m join mtm_hw_private.students s on s.id=m.student_id
   join mtm_hw_private.classes c on c.id=s.class_id where m.source_msg=p->>'sourceMsg' and m.cancelled_at is null;
  if found then return jsonb_build_object('ok',true,'duplicate',true,'moveId',old.id,'student',jsonb_build_object('fullName',old.full_name,'className',old.label)); end if;
 end if;
 return public.mtm_dd_api2(p);
end$$;
revoke all on function public.mtm_dd_api3(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api3(jsonb) to service_role;
commit;
