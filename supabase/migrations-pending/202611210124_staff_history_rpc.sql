-- PostgREST applies this timeout to the report transaction from the RPC's settings.
-- Keep access checks and report filters in the canonical history function.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create function public.mtm_staff_history(p jsonb) returns jsonb
language sql stable security definer
set search_path=''
set statement_timeout='20s'
return mtm_hw_private.lesson_staff_history110(p);

-- Supabase may apply extra default grants when a public function is created.
do $acl$
declare f pg_proc; g record; role_name text;
begin
 select * into strict f from pg_proc where oid='public.mtm_staff_history(jsonb)'::regprocedure;
 for g in select distinct grantee from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) where grantee<>f.proowner loop
  role_name:=case when g.grantee=0 then 'public' else quote_ident((select rolname from pg_roles where oid=g.grantee)) end;
  execute format('revoke all on function public.mtm_staff_history(jsonb) from %s',role_name);
 end loop;
end $acl$;
grant execute on function public.mtm_staff_history(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
