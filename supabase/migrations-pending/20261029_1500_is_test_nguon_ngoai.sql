-- 29/10/2026: lọc tài khoản/bài thử (is_test) ở các nguồn máy ngoài web đọc qua Edge/DB, trước khi tạo tài khoản thử.
-- Cần 202610270100_is_test.sql (đã áp 29/10). Vá trên bản đang chạy bằng pg_get_functiondef, giữ nguyên quyền.
--  1. Mọi hàm (trừ hàm đã có bản _real100) đang đọc mtm_hw_private.hv_ca_rows(...) đổi sang hv_ca_rows_real100(...):
--     danh sách ca cho điểm danh/nhắc buổi (mtm_dd_api 'ca') và các bộ tự ghi theo ca không thấy tài khoản thử.
--  2. mtm_btvn_sync_due: không ghép SĐT điểm danh vào tài khoản thử, không tính hạn cho tài khoản/bài thử.
--  3. mtm_btvn_support_report: bỏ sự kiện của tài khoản thử.
-- Chạy lại vô hại. Bản *_real100 tự làm mới sau mỗi lần áp (workflow), không ảnh hưởng phần vá này.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $ca$
declare f record; src text; n integer=0;
begin
 if to_regprocedure('mtm_hw_private.hv_ca_rows_real100(date,date)') is null then raise exception 'IS_TEST_NGOAI: chua co hv_ca_rows_real100';end if;
 for f in select p.oid,p.proacl,n0.nspname,p.proname from pg_proc p join pg_namespace n0 on n0.oid=p.pronamespace
  where n0.nspname in ('public','mtm_hw_private') and p.prokind='f'
   and p.proname !~ '_real100$' and p.proname<>'hv_ca_rows'
   and p.prosrc like '%mtm_hw_private.hv_ca_rows(%'
   -- Hàm đã có bản lọc (web gọi bản _real100) giữ nguyên để refresh_reports chụp đúng nguồn.
   and not exists(select 1 from pg_proc c where c.pronamespace=p.pronamespace and c.proname=p.proname||'_real100')
 loop
  src=replace(pg_get_functiondef(f.oid),'mtm_hw_private.hv_ca_rows(','mtm_hw_private.hv_ca_rows_real100(');
  execute src;n=n+1;
  if (select proacl from pg_proc where oid=f.oid) is distinct from f.proacl then raise exception 'IS_TEST_NGOAI_CA_ACL %.%',f.nspname,f.proname;end if;
 end loop;
 if n=0 and not exists(select 1 from pg_proc p join pg_namespace n0 on n0.oid=p.pronamespace
  where n0.nspname='public' and p.proname ~ '^mtm_dd_api[0-9]+$' and p.prosrc like '%mtm_hw_private.hv_ca_rows_real100(%') then
  raise exception 'IS_TEST_NGOAI_CA: khong thay mtm_dd_api doc hv_ca_rows';end if;
end$ca$;

do $due$
declare fn constant regprocedure='public.mtm_btvn_sync_due(jsonb,boolean)'::regprocedure; src text; acl text; a integer; b integer;
begin
 src=pg_get_functiondef(fn);
 if position('not s.is_test' in src)>0 then return;end if;
 select count(*) into a from regexp_matches(src,'s\.active[[:space:]]+and[[:space:]]+c\.active','g');
 select count(*) into b from regexp_matches(src,'c\.active[[:space:]]+and[[:space:]]+l\.active','g');
 if a<2 or b<1 then raise exception 'IS_TEST_NGOAI_DUE: neo doi (s.active % lan, l.active % lan, md5 %)',a,b,md5(src);end if;
 src=regexp_replace(src,'s\.active([[:space:]]+)and([[:space:]]+)c\.active','s.active and not s.is_test\1and\2c.active','g');
 src=regexp_replace(src,'c\.active([[:space:]]+)and([[:space:]]+)l\.active','c.active\1and\2l.active and not l.is_test','g');
 select coalesce(proacl::text,'') into acl from pg_proc where oid=fn;
 execute src;
 if (select coalesce(proacl::text,'') from pg_proc where oid=fn) is distinct from acl then raise exception 'IS_TEST_NGOAI_DUE_ACL';end if;
end$due$;

do $sp$
declare fn constant regprocedure='public.mtm_btvn_support_report(timestamptz)'::regprocedure; src text; acl text; a integer;
begin
 src=pg_get_functiondef(fn);
 if position('t.is_test' in src)>0 then return;end if;
 select count(*) into a from regexp_matches(src,'mtm_hw_private\.support_events[[:space:]]+e[[:space:]]+where[[:space:]]','g');
 if a<>1 then raise exception 'IS_TEST_NGOAI_SUPPORT: neo doi (% lan, md5 %)',a,md5(src);end if;
 src=regexp_replace(src,'(mtm_hw_private\.support_events[[:space:]]+e[[:space:]]+where)([[:space:]])',
  '\1 not exists(select 1 from mtm_hw_private.students t where t.id=e.student_id and t.is_test) and\2');
 select coalesce(proacl::text,'') into acl from pg_proc where oid=fn;
 execute src;
 if (select coalesce(proacl::text,'') from pg_proc where oid=fn) is distinct from acl then raise exception 'IS_TEST_NGOAI_SUPPORT_ACL';end if;
end$sp$;
commit;
