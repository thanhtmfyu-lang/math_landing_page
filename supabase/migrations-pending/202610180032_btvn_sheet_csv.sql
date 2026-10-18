-- 032 (18/10, anh Thành: bảng điểm web + bảng xếp hạng lên Google Sheet tự cập nhật). Xuất CSV cho Edge mtm-btvn-sheet (chỉ service_role gọi được). ĐÃ ÁP (Claude).
begin;
create or replace function mtm_hw_private.csvq(x text) returns text language sql immutable set search_path='' as $$ select '"'||replace(coalesce(x,''),'"','""')||'"' $$;
create or replace function mtm_hw_private.vn_time(ms numeric) returns text language sql immutable set search_path='' as $$
 select case when ms is null then '' else to_char(to_timestamp(ms/1000) at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI') end $$;
create or replace function mtm_hw_private.vn_num(n numeric) returns text language sql immutable set search_path='' as $$
 select case when n is null then '' else replace(trim(to_char(round(n,2),'FM990.00')),'.',',') end $$;

create or replace function public.mtm_btvn_sheet_csv(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text; c text; k text; now_vn text;
begin
 now_vn = to_char(current_timestamp at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI');
 if p_tab='diem' then
  head = 'Lớp,Học sinh,Ngày buổi,Bài,Hạn nộp,Trạng thái,Số lần vào làm,Vào làm lần đầu,Nộp lần đầu,Điểm lần 1 (xếp hạng),Điểm cao nhất (BTVN),Số lần nộp,Lần 1 nộp muộn,Cập nhật lúc';
  select string_agg(concat_ws(',',mtm_hw_private.csvq(x.label),mtm_hw_private.csvq(x.full_name),mtm_hw_private.csvq(to_char(x.lesson_day,'DD/MM/YYYY')),
    mtm_hw_private.csvq(x.title),mtm_hw_private.csvq(mtm_hw_private.vn_time(extract(epoch from x.due_at)*1000)),
    mtm_hw_private.csvq(case when x.n_sub>0 then 'Đã nộp' when x.n_att>0 then 'Đang làm' else 'Chưa làm' end),
    x.n_att::text,mtm_hw_private.csvq(mtm_hw_private.vn_time(x.first_start)),mtm_hw_private.csvq(mtm_hw_private.vn_time(x.first_at)),
    mtm_hw_private.csvq(mtm_hw_private.vn_num(x.first_score)),mtm_hw_private.csvq(mtm_hw_private.vn_num(x.best_score)),x.n_sub::text,
    mtm_hw_private.csvq(case when x.n_sub=0 then '' when x.first_late then 'Muộn' else 'Đúng hạn' end),mtm_hw_private.csvq(now_vn)),
    E'\n' order by x.label,x.lesson_day desc,x.full_name) into body
  from (
   select c.label,btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')) full_name,
    coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date lesson_day,coalesce(l.exam->>'title',l.code) title,
    coalesce(w.next_actual_class_at,w.expected_due_at,mtm_hw_private.btvn_planned_due(c.label,coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date)) due_at,
    (select count(*) from jsonb_array_elements(case when jsonb_typeof(w.drafts)='array' then w.drafts else '[]' end) d) n_att,
    (select min((d->>'startedAt')::numeric) from jsonb_array_elements(case when jsonb_typeof(w.drafts)='array' then w.drafts else '[]' end) d) first_start,
    r.n_sub,r.first_at,r.first_score,r.best_score,r.first_late
   from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
   join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
   join mtm_hw_private.btvn_lessons l on s.class_id=any(l.class_ids) and l.owner_id=s.owner_id
   left join mtm_hw_private.btvn_work w on w.student_id=s.id and w.lesson_code=l.code
   left join lateral (
    select count(*) n_sub,min(o.submitted_at) first_at,max(o.score) best_score,
     (array_agg(o.score order by o.submitted_at))[1] first_score,
     (array_agg(coalesce((o.receipt->>'late')::boolean,false) order by o.submitted_at))[1] first_late
    from mtm_hw_private.btvn_official_receipts(s.id,l.code) o where o.submitted_at is not null) r on true
   where s.active and c.active and l.active and l.kind='btvn' and coalesce(s.source_identity,'') not like 'qa:%'
    and coalesce(l.material->'classDates'->>c.label,l.material->>'date')::date>='2026-10-01'
    and current_timestamp>=mtm_hw_private.btvn_opens_at(l.material,c.label)
  ) x;
 elsif p_tab='xephang' then
  head = 'Khối,Bảng,Hạng,Học sinh,Lớp,Trường,Điểm,Bài đã nộp,Tổng bài,Cập nhật lúc';
  body = '';
  foreach c in array array['2K9','2K10','2K11','2K12','2K13','2K14'] loop
   foreach k in array array['btvn-tuan','btvn-thang'] loop
    select body||coalesce(string_agg(concat_ws(',',mtm_hw_private.csvq(c),mtm_hw_private.csvq(case k when 'btvn-tuan' then 'Tuần này' else 'Tháng này' end),
      e->>'rank',mtm_hw_private.csvq(e->>'fullName'),mtm_hw_private.csvq(e->>'className'),mtm_hw_private.csvq(e->>'school'),
      mtm_hw_private.csvq(mtm_hw_private.vn_num((e->>'score')::numeric)),coalesce(e->>'submitted',''),coalesce(e->>'total',''),mtm_hw_private.csvq(now_vn))||E'\n',''),'')
    into body from jsonb_array_elements(mtm_hw_private.btvn_rank_rows(c,k,null,null,null)) e;
   end loop;
  end loop;
  body = rtrim(body,E'\n');
 else raise exception 'Invalid tab';
 end if;
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_btvn_sheet_csv(text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_sheet_csv(text) to service_role;
revoke all on function mtm_hw_private.csvq(text),mtm_hw_private.vn_time(numeric),mtm_hw_private.vn_num(numeric) from public,anon,authenticated;
commit;
