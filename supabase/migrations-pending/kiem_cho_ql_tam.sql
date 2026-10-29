do $$declare a text;b text;c text;begin
select string_agg(trang_thai||'='||n,', ') into a from (select trang_thai,count(*) n from mtm_hw_private.hv_ca_rows('2026-10-29','2026-10-29') group by 1) x;
select string_agg(trang_thai||'='||n,', ') into b from (select trang_thai,count(*) n from mtm_hw_private.hv_ca_rows_real100('2026-10-29','2026-10-29') group by 1) x;
select (position('Chờ QL xác nhận' in pg_get_functiondef('mtm_hw_private.hv_ca_rows_real100(date,date)'::regprocedure))>0)::text into c;
raise exception 'KQ goc[%] web[%] web_co_moc=%',a,b,c;end$$;
