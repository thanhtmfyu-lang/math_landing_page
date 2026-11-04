-- Administrative temporary-password route. No secrets in this migration or audit.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table if not exists mtm_hw_private.staff_temp_password_audit(
 id bigint generated always as identity primary key,
 user_id uuid not null,
 short_name text not null,
 changed_at timestamptz not null default clock_timestamp()
);
alter table mtm_hw_private.staff_temp_password_audit enable row level security;
revoke all on mtm_hw_private.staff_temp_password_audit from public,anon,authenticated,service_role;

create or replace function mtm_hw_private.staff_set_temp_password(p_short_name text,p_password text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; crypto_schema text; required boolean;
begin
 if p_short_name is null or p_short_name not in
 ('thaythanh','thaytai','thayhieu','thayhoang','thaygiang','hang','vietanh','dung')
 then raise exception 'TEMP_PASSWORD_TARGET_DENIED' using errcode='42501';end if;
 -- bcrypt consumes at most 72 bytes; reject truncation and weak/empty inputs.
 if p_password is null or length(p_password)<16 or octet_length(p_password)>72
 then raise exception 'TEMP_PASSWORD_INVALID' using errcode='22023';end if;
 select s.user_id into uid from public.mtm_staff s where s.short_name=p_short_name and s.active;
 if uid is null then raise exception 'TEMP_PASSWORD_TARGET_DENIED' using errcode='42501';end if;
 perform 1 from auth.users where id=uid for update;
 if not found then raise exception 'TEMP_PASSWORD_TARGET_DENIED' using errcode='42501';end if;
 perform 1 from public.mtm_staff where user_id=uid and short_name=p_short_name and active for update;
 if not found then raise exception 'TEMP_PASSWORD_TARGET_DENIED' using errcode='42501';end if;
 select n.nspname into crypto_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 if crypto_schema is null then raise exception 'PGCRYPTO_REQUIRED';end if;
 execute format('update auth.users set encrypted_password=%1$I.crypt($1,%1$I.gen_salt(''bf'',10)),updated_at=clock_timestamp() where id=$2',crypto_schema) using p_password,uid;
 -- AFTER UPDATE trigger clears the flag; restore it in this same transaction.
 update public.mtm_staff set must_change_password=true where user_id=uid returning must_change_password into required;
 if required is distinct from true then raise exception 'TEMP_PASSWORD_FLAG_FAILED';end if;
 insert into mtm_hw_private.staff_temp_password_audit(user_id,short_name) values(uid,p_short_name);
 return jsonb_build_object('short_name',p_short_name,'must_change_password',required);
end$$;
revoke all on function mtm_hw_private.staff_set_temp_password(text,text) from public,anon,authenticated;
grant usage on schema mtm_hw_private to service_role;
grant execute on function mtm_hw_private.staff_set_temp_password(text,text) to service_role;
commit;
