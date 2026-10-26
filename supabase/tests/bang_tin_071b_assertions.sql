-- Synthetic fixture for a LOCAL disposable PostgreSQL/PGlite database only.
-- Requires original 071 followed by 071b. This file must not run on production.
begin;
insert into mtm_bang_tin.posts(id,kind,title,day,status) values
 ('qa-071b-approved','tai-lop','QA approved',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date,'da-dang'),
 ('qa-071b-pending','tai-lop','QA pending',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date,'cho-duyet'),
 ('qa-071b-hidden','tai-lop','QA hidden',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date,'an'),
 ('qa-071b-expired','tai-lop','QA expired',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date-181,'da-dang'),
 ('qa-071b-empty','tai-lop','QA no approved photo',(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date,'da-dang');

insert into mtm_bang_tin.photos(post_id,storage_path,sent_at,status,alt)
select id,'2026-10/'||lpad(row_number() over(order by id)::text,64,'0')||'.jpg',clock_timestamp(),'da-dang','QA synthetic'
from mtm_bang_tin.posts where id in ('qa-071b-approved','qa-071b-pending','qa-071b-hidden','qa-071b-expired');
insert into mtm_bang_tin.photos(post_id,storage_path,sent_at,status,alt) values
 ('qa-071b-approved','2026-10/'||repeat('a',64)||'.jpg',clock_timestamp(),'cho-duyet','QA pending photo'),
 ('qa-071b-approved','2026-10/'||repeat('b',64)||'.jpg',clock_timestamp(),'an','QA hidden photo'),
 ('qa-071b-empty','2026-10/'||repeat('c',64)||'.jpg',clock_timestamp(),'cho-duyet','QA pending only');

do $qa$
begin
 if to_regprocedure('public.mtm_bang_tin_doc(text)') is null then
  raise exception '071b removed the legacy overload';
 end if;
 if has_function_privilege('anon','public.mtm_bang_tin_doc()','EXECUTE')
    or has_function_privilege('authenticated','public.mtm_bang_tin_doc()','EXECUTE')
    or not has_function_privilege('service_role','public.mtm_bang_tin_doc()','EXECUTE') then
  raise exception '071b reader ACL is incorrect';
 end if;
end $qa$;

-- Execute under the real database role, not the owner that created the function.
set local role service_role;
do $qa$
declare result jsonb;
begin
 result=public.mtm_bang_tin_doc();
 if jsonb_array_length(result)<>1 or result->0->>'id'<>'qa-071b-approved'
    or jsonb_array_length(result->0->'photos')<>1
    or result->0->'photos'->0->>'alt'<>'QA synthetic' then
  raise exception '071b reader leaked unapproved/hidden/expired content or omitted approved content';
 end if;
end $qa$;
reset role;
rollback;
