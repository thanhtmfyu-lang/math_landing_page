-- Chờ duyệt. Chỉ cài cơ chế; KHÔNG chứa dữ liệu hay tự chọn hồ sơ thật.
-- Liên kết hồ sơ trùng để ẩn khỏi find/đăng nhập; không chuyển/xóa lịch sử,
-- không thay active, membership, student_leaves, điện thoại hoặc PIN.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists mtm_hw_private.student_duplicate_links (
 duplicate_id uuid primary key references mtm_hw_private.students(id),
 primary_id uuid not null references mtm_hw_private.students(id),
 source_msg text not null unique check(length(btrim(source_msg)) between 1 and 300),
 created_at timestamptz not null default clock_timestamp(),
 check(duplicate_id <> primary_id)
);
alter table mtm_hw_private.student_duplicate_links enable row level security;
revoke all on mtm_hw_private.student_duplicate_links from public,anon,authenticated,service_role;

create or replace function mtm_hw_private.student_login_visible(p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from mtm_hw_private.student_duplicate_links where duplicate_id=p_student)
$$;
revoke all on function mtm_hw_private.student_login_visible(uuid) from public,anon,authenticated,service_role;

-- SQL/RPC service_role riêng; không mở action bot hoặc đổi Edge đang chạy.
-- Nhãn lớp kỳ vọng là điều kiện so khớp nguồn ngay trước ghi, không phải lệnh chuyển lớp.
create or replace function public.mtm_student_hide_duplicate(
 p_duplicate uuid,p_primary uuid,p_duplicate_class text,p_primary_class text,p_source_msg text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d mtm_hw_private.students; k mtm_hw_private.students; old_link mtm_hw_private.student_duplicate_links;
begin
 if p_duplicate is null or p_primary is null or p_duplicate=p_primary then
  return jsonb_build_object('error','invalid_duplicate_pair');end if;
 if coalesce(length(btrim(p_source_msg)),0) not between 1 and 300 or p_source_msg ~ E'[\r\n]' then
  return jsonb_build_object('error','invalid_source_msg');end if;
 -- Một khóa cho thao tác liên kết, ngăn A->B và B->A hoặc A->B->C đồng thời.
 perform pg_advisory_xact_lock(hashtextextended('mtm:student-duplicate-links',0));
 perform 1 from mtm_hw_private.students where id in(p_duplicate,p_primary) order by id for update;
 select * into d from mtm_hw_private.students where id=p_duplicate;
 select * into k from mtm_hw_private.students where id=p_primary;
 if d.id is null or k.id is null or d.owner_id<>k.owner_id
  or not exists(select 1 from mtm_hw_private.btvn_roster_scope where singleton and owner_id=k.owner_id)
  or coalesce(d.source_identity,'') like 'qa:%' or coalesce(k.source_identity,'') like 'qa:%' then
  return jsonb_build_object('error','student_scope_mismatch');end if;
 if not k.active or not exists(select 1 from mtm_hw_private.classes where id=k.class_id and active)
  or mtm_hw_private.vn_fold(d.full_name) is distinct from mtm_hw_private.vn_fold(k.full_name)
  or not exists(select 1 from mtm_hw_private.classes where id=d.class_id and label=p_duplicate_class)
  or not exists(select 1 from mtm_hw_private.classes where id=k.class_id and label=p_primary_class) then
  return jsonb_build_object('error','student_identity_or_class_mismatch');end if;
 select * into old_link from mtm_hw_private.student_duplicate_links where duplicate_id=p_duplicate;
 if found then
  if old_link.primary_id=p_primary and old_link.source_msg=p_source_msg then
   return jsonb_build_object('ok',true,'duplicate',true);end if;
  return jsonb_build_object('error','duplicate_link_conflict');end if;
 if exists(select 1 from mtm_hw_private.student_duplicate_links
  where duplicate_id=p_primary or primary_id=p_duplicate or source_msg=p_source_msg) then
  return jsonb_build_object('error','duplicate_chain_or_source_conflict');end if;
 insert into mtm_hw_private.student_duplicate_links(duplicate_id,primary_id,source_msg)
 values(p_duplicate,p_primary,p_source_msg);
 return jsonb_build_object('ok',true,'hidden',true);
end$$;
revoke all on function public.mtm_student_hide_duplicate(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mtm_student_hide_duplicate(uuid,uuid,text,text,text) to service_role;

-- Chỉ nhận đúng thân hàm của baseline đã kiểm, hoặc bản đã vá tương ứng.
-- SHA là của prosrc UTF-8, không phụ thuộc định dạng pg_get_functiondef.
-- Hotfix live khác baseline: DỪNG và đối soát, không tự ghi đè.
-- profile() dùng chung cho lịch sử được giữ nguyên; chặn riêng resolve/confirm mã.
do $patch$
declare sig text; src text; body text; canonical text; expected_n integer; anchor text; replacement text; pinned text;
begin
 for sig,expected_n,anchor,replacement,pinned in select * from (values
  ('mtm_hw_private.dd_find_student(text,text)',2,'s.active and c.active','s.active and mtm_hw_private.student_login_visible(s.id) and c.active','7cae9856537f414fbe0767368e49b3403ecedf9cc5eebac8e92f630df809a3d8'),
  ('public.mtm_btvn_forgot(text,text,text)',2,'s.active and c.active','s.active and mtm_hw_private.student_login_visible(s.id) and c.active','3afbf7b683ca6a4c63d873160f0d3f47aa7b92f3b14a83104e41675afe941a7a'),
  ('mtm_hw_private.session_student(text)',1,'s.active and cl.active','s.active and mtm_hw_private.student_login_visible(s.id) and cl.active','09aeec28388979242ca6d05d1410da2ea31daa66d90eb0556b4be52bd37ea318'),
  ('mtm_hw_private.btvn_student_before_sync063(text)',1,'s.active and c.active','s.active and mtm_hw_private.student_login_visible(s.id) and c.active','7068b70968aa4160db65140112ac3404ef63ef79bb9c04a06ac8fb04128b8c1c'),
  ('public.mtm_hw_resolve_code(text)',1,'mtm_hw_private.profile(c.student_id) is null','(not mtm_hw_private.student_login_visible(c.student_id) or mtm_hw_private.profile(c.student_id) is null)','c4dd1d5d551b4c32e4988b552a01c6443b28ce4357966361dfb73f7fcbb60793'),
  ('public.mtm_hw_confirm(text,boolean)',1,'mtm_hw_private.profile(x.student_id) is null','(not mtm_hw_private.student_login_visible(x.student_id) or mtm_hw_private.profile(x.student_id) is null)','691bdb3415ab058948b8c47fb3be8ded5eaadd7eb3ef1bde59d292e23d3e03d3')
 ) as targets(signature,anchors,old_predicate,new_predicate,source_sha256) loop
  if not exists(select 1 from pg_proc p where p.oid=sig::regprocedure and p.prosecdef
   and p.proowner=(select proowner from pg_proc where oid='mtm_hw_private.student_login_visible(uuid)'::regprocedure)) then
   raise exception 'DUPLICATE_LOGIN_OWNER_OR_SECURITY_CHANGED: %',sig;end if;
  select prosrc into body from pg_proc where oid=sig::regprocedure;
  canonical=replace(body,replacement,anchor);
  if sig='mtm_hw_private.dd_find_student(text,text)' then
   canonical=replace(canonical,'s2.active and mtm_hw_private.student_login_visible(s2.id)','s2.active');
  end if;
  if encode(sha256(convert_to(canonical,'UTF8')),'hex')<>pinned then
   raise exception 'DUPLICATE_LOGIN_SOURCE_CHANGED: %',sig;end if;
  if (length(canonical)-length(replace(canonical,anchor,'')))/length(anchor)<>expected_n then
   raise exception 'DUPLICATE_LOGIN_ANCHOR_CHANGED: %',sig;end if;
  src=pg_get_functiondef(sig::regprocedure);
  src=replace(src,replacement,anchor);
  src=replace(src,anchor,replacement);
  if sig='mtm_hw_private.dd_find_student(text,text)' and position('s2.active and mtm_hw_private.student_login_visible(s2.id)' in src)=0 then
   src=replace(src,'s2.active','s2.active and mtm_hw_private.student_login_visible(s2.id)');
  end if;
  execute src;
 end loop;
end$patch$;
commit;
