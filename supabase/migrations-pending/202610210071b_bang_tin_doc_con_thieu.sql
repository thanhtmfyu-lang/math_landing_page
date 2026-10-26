-- 071b: delta from the original 071 to PR56; do not replay the table/seed migration.
-- CI run 39570697997 proved ngay_le exists and the attempted 071 rolled back.
-- The remaining delta is INFERRED from Git history, not a live catalog inventory:
-- original 071 had mtm_bang_tin_doc(text); PR56 calls mtm_bang_tin_doc() instead.
-- Fail closed if the original board migration is incomplete. Never rebuild/drop data.
begin;

do $guard$
begin
 if to_regclass('mtm_bang_tin.ngay_le') is null
    or to_regclass('mtm_bang_tin.posts') is null
    or to_regclass('mtm_bang_tin.photos') is null
    or to_regprocedure('public.mtm_bang_tin_nhan_anh(text,text,text,text,timestamptz,text,int,int,text)') is null
    or to_regprocedure('public.mtm_bang_tin_cho_duyet(int)') is null
    or to_regprocedure('public.mtm_bang_tin_duyet(text,uuid[],text,text,text,boolean,text,text)') is null
    or to_regprocedure('public.mtm_bang_tin_an(text,uuid)') is null then
  raise exception '071b requires the original 071 board tables and write/review RPCs; inspect the catalog before applying';
 end if;
end $guard$;

-- Keep the legacy session overload and any already installed zero-argument body.
-- A repeat run only reasserts the service-role-only EXECUTE permissions below.
do $migration$
begin
 if to_regprocedure('public.mtm_bang_tin_doc()') is null then
  execute $definition$
create function public.mtm_bang_tin_doc() returns jsonb
language plpgsql stable security definer set search_path='' as $body$
begin
 return (select coalesce(jsonb_agg(x.j order by x.day desc,x.id),'[]'::jsonb) from (
  select p.id,p.day,jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'date',to_char(p.day,'YYYY-MM-DD'),'summary',p.summary,'place',p.place,'pinned',p.pinned,
   'photos',(select jsonb_agg(jsonb_build_object('path',f.storage_path,'alt',f.alt,'width',f.width,'height',f.height) order by f.sent_at)
             from (select * from mtm_bang_tin.photos where post_id=p.id and status='da-dang' order by sent_at limit 60) f)) j
  from mtm_bang_tin.posts p
  where p.status='da-dang' and p.day>=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-180
    and exists(select 1 from mtm_bang_tin.photos f where f.post_id=p.id and f.status='da-dang')
  order by p.day desc limit 30) x);
end $body$;
  $definition$;
 end if;
end $migration$;

revoke all on function public.mtm_bang_tin_doc() from public,anon,authenticated;
grant execute on function public.mtm_bang_tin_doc() to service_role;
commit;
