-- 047 (18/10, anh Thành chốt): BTVN của một buổi lớp xuất phát sớm mở cho MỌI lớp XPS cùng khoá (8+, 9+, "2K10 Thứ 3, 6")
-- từ giờ mở sớm nhất trong các lớp đó (ví dụ 2K9 buổi 1 học T2 hoặc T3: mở cả hai lớp từ T2). Khớp server/btvn/opening-policy.ts. ĐÃ ÁP (Claude).
begin;
create or replace function mtm_hw_private.btvn_own_opens_at(p_material jsonb,p_label text) returns timestamptz
language sql stable set search_path='' as $$
 select coalesce((p_material->'classOpensAt'->>p_label)::timestamptz,
   ((coalesce(p_material->'classDates'->>p_label,p_material->>'date')::date+time '21:30') at time zone 'Asia/Ho_Chi_Minh'))
$$;
create or replace function mtm_hw_private.btvn_opens_at(p_material jsonb,p_label text) returns timestamptz
language sql stable set search_path='' as $$
 select least(mtm_hw_private.btvn_own_opens_at(p_material,p_label),
  (select min(mtm_hw_private.btvn_own_opens_at(p_material,k.label))
   from (select jsonb_object_keys(coalesce(p_material->'classDates','{}'::jsonb)) label
         union select jsonb_object_keys(coalesce(p_material->'classOpensAt','{}'::jsonb))) k
   where p_label ~ '^2K[0-9]{1,2} (8\+|9\+|Thứ 3, 6)$' and k.label ~ '^2K[0-9]{1,2} (8\+|9\+|Thứ 3, 6)$'
    and split_part(k.label,' ',1)=split_part(p_label,' ',1) and k.label<>p_label))
$$;
revoke all on function mtm_hw_private.btvn_own_opens_at(jsonb,text),mtm_hw_private.btvn_opens_at(jsonb,text) from public,anon,authenticated,service_role,mtm_btvn_publisher;
commit;
