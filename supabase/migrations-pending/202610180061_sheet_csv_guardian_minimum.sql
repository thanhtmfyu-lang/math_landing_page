-- H3, 18/10/2026: CSV dành riêng cho Apps Script, không xuất thông tin Zalo/phụ huynh.
begin;
create or replace function public.mtm_btvn_sheet_csv6(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text;
begin
 if p_tab<>'hocsinh' then return public.mtm_btvn_sheet_csv5(p_tab); end if;
 head='Học sinh,Lớp,Khoá,Trường,Lịch riêng (ghi trong sổ),Có tài khoản web,Lần nộp BTVN gần nhất,Cập nhật lúc';
 select string_agg(concat_ws(',',mtm_hw_private.csvq(btrim(regexp_replace(s.full_name,'\s*[\(\[].*$',''))),mtm_hw_private.csvq(c.label),mtm_hw_private.csvq(split_part(c.label,' ',1)),
  mtm_hw_private.csvq(coalesce(mtm_hw_private.public_school(ap.school),mtm_hw_private.public_school(s.school))),
  mtm_hw_private.csvq(substring(s.full_name from '\((.*)\)')),mtm_hw_private.csvq(case when exists(select 1 from mtm_hw_private.btvn_work w where w.student_id=s.id) then 'Có' else 'Chưa' end),
  mtm_hw_private.csvq(mtm_hw_private.vn_time((select max((r->>'submittedAt')::numeric) from mtm_hw_private.btvn_work w,jsonb_array_elements(coalesce(w.receipts,'[]'::jsonb)) r where w.student_id=s.id))),
  mtm_hw_private.csvq(mtm_hw_private.vn_ts(current_timestamp))),E'\n' order by c.label,s.full_name) into body
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 join mtm_hw_private.btvn_roster_scope scope on scope.singleton and scope.owner_id=s.owner_id
 left join mtm_hw_private.student_appearance ap on ap.student_id=s.id
 where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%';
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_btvn_sheet_csv6(text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_sheet_csv6(text) to service_role;
commit;
