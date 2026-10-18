-- 056 (18/10 13:15): HS Hoàng Phúc Châu Anh không tạo được PIN vì nhập SĐT thứ ba (khác SĐT HS và PH trong hồ sơ) -> chặn đúng thiết kế 054 nhưng cần lối hợp lệ.
-- Thêm "số phụ đã xác nhận" (student_extra_phones): tính là đúng SĐT khi tạo PIN. Nguồn: giáo vụ xác nhận qua Zalo -> Javis gọi kho action 'phone_add'.
-- Không hiện SĐT ở đâu; action chỉ trả ok. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.student_extra_phones(
 student_id uuid not null references mtm_hw_private.students(id), phone text not null check (phone ~ '^0[0-9]{9}$'),
 source text, created_at timestamptz not null default now(), primary key(student_id,phone));
alter table mtm_hw_private.student_extra_phones enable row level security;
revoke all on mtm_hw_private.student_extra_phones from public,anon,authenticated;

do $$
declare src text; fixed text;
begin
 select pg_get_functiondef('public.mtm_btvn_forgot_pin(text,text,text,text,text)'::regprocedure) into src;
 fixed=replace(src,$a$ ph=coalesce(ph,false);$a$,$a$ ph=coalesce(ph,false) or exists(select 1 from mtm_hw_private.student_extra_phones x where x.student_id=sid and x.phone=mtm_hw_private.btvn_phone2(p_phone));$a$);
 if fixed=src and position('student_extra_phones' in src)=0 then raise exception 'forgot_pin patch did not apply'; end if;
 if fixed<>src then execute fixed; end if;
end$$;
revoke all on function public.mtm_btvn_forgot_pin(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_forgot_pin(text,text,text,text,text) to service_role;

create or replace function public.mtm_dd_api12(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare st jsonb; ph text;
begin
 if p->>'action'='phone_add' then
  -- {student,class,phone,source}: chỉ gọi SAU KHI giáo vụ xác nhận đúng HS/PH.
  ph=mtm_hw_private.btvn_phone2(coalesce(p->>'phone',''));
  if ph !~ '^0[0-9]{9}$' then return jsonb_build_object('error','phone must be 10 digits'); end if;
  st=mtm_hw_private.dd_find_student(p->>'student',p->>'class');
  if st ? 'error' then return st; end if;
  insert into mtm_hw_private.student_extra_phones(student_id,phone,source) values((st->>'id')::uuid,ph,left(coalesce(p->>'source','javis'),200)) on conflict do nothing;
  return jsonb_build_object('ok',true,'student',st);
 end if;
 return public.mtm_dd_api11(p);
end$$;
revoke all on function public.mtm_dd_api12(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api12(jsonb) to service_role;
commit;

-- 056b (18/10 13:20): lần đầu chưa có PIN mà em đã gõ 6 số vào ô "Mã PIN" thì dùng luôn số đó làm PIN mới (bớt một bước, video HS Châu Anh). ĐÃ ÁP.
begin;
do $$
declare src text; fixed text;
begin
 select pg_get_functiondef('public.mtm_btvn_forgot_pin(text,text,text,text,text)'::regprocedure) into src;
 if position('p_new_pin=coalesce(p_new_pin,case' in src)>0 then return; end if;
 fixed=replace(src,$a$  if p_new_pin ~ '^[0-9]{6}$' and$a$,$a$  p_new_pin=coalesce(p_new_pin,case when p_pin ~ '^[0-9]{6}$' then p_pin end);
  if p_new_pin ~ '^[0-9]{6}$' and$a$);
 if fixed=src then raise exception '056b patch did not apply'; end if;
 execute fixed;
end$$;
revoke all on function public.mtm_btvn_forgot_pin(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_forgot_pin(text,text,text,text,text) to service_role;
commit;
