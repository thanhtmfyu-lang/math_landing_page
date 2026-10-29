-- CHẨN ĐOÁN (29/10, chỉ đọc, không áp lên main): giới hạn thời gian câu lệnh của các vai PostgREST.
do $$declare msg text;begin
 select string_agg(rolname||'='||coalesce(array_to_string(rolconfig,';'),'-'),' | ') into msg from pg_roles where rolname in ('authenticator','service_role','authenticated','anon','postgres');
 raise exception 'CHAN DOAN % | db=%',msg,current_setting('statement_timeout');
end$$;
