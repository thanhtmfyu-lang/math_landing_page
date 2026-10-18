-- 051 (18/10, anh Thành): phản hồi học tuần của PH/HS (Javis xin phản hồi CN 20:00) LƯU trong kho + tab "Phản hồi PH, HS" của Sheet tổng.
-- action feedback_add {date,role,student,class,type,text,needAction,owner,usableForPromo,sourceMsg} hoặc {rows:[...]}; chống trùng theo sourceMsg.
-- Không nhận/không hiện uid, SĐT. ĐÃ ÁP (Claude).
begin;
create table if not exists mtm_hw_private.student_feedback(
 id bigserial primary key, at timestamptz not null, role text not null check (role in ('PH','HS')),
 student_id uuid references mtm_hw_private.students(id), student_name text, class_label text,
 type text not null default 'khác', text text not null, need_action text, owner text, usable_for_promo boolean not null default false,
 source_msg text, created_at timestamptz not null default now());
create unique index if not exists student_feedback_src_uq on mtm_hw_private.student_feedback(source_msg) where source_msg is not null;
alter table mtm_hw_private.student_feedback enable row level security;
revoke all on mtm_hw_private.student_feedback from public,anon,authenticated;

create or replace function public.mtm_dd_api9(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare rr jsonb; st jsonb; res jsonb='[]'::jsonb; n int;
begin
 if p->>'action'='feedback_add' then
  for rr in select x from jsonb_array_elements(case when p ? 'rows' then p->'rows' else jsonb_build_array(p) end) x loop
   if coalesce(rr->>'text','')='' or coalesce(rr->>'role','') not in ('PH','HS') or (rr->>'date') is null then
    res=res||jsonb_build_array(jsonb_build_object('sourceMsg',rr->>'sourceMsg','error','need date, role PH|HS, text')); continue; end if;
   st=case when coalesce(rr->>'student','')<>'' then mtm_hw_private.dd_find_student(rr->>'student',rr->>'class') end;
   insert into mtm_hw_private.student_feedback(at,role,student_id,student_name,class_label,type,text,need_action,owner,usable_for_promo,source_msg)
   values(((rr->>'date')::timestamp at time zone 'Asia/Ho_Chi_Minh'),rr->>'role',
    case when st is not null and not (st ? 'error') then (st->>'id')::uuid end,
    coalesce(case when st is not null and not (st ? 'error') then btrim(regexp_replace(st->>'fullName','\s*[\(\[].*$','')) end,nullif(rr->>'student','')),
    coalesce(case when st is not null and not (st ? 'error') then st->>'className' end,nullif(rr->>'class','')),
    coalesce(nullif(rr->>'type',''),'khác'),rr->>'text',nullif(rr->>'needAction',''),nullif(rr->>'owner',''),
    coalesce((rr->>'usableForPromo')::boolean,false),nullif(rr->>'sourceMsg',''))
   on conflict (source_msg) where source_msg is not null do nothing;
   get diagnostics n=row_count;
   res=res||jsonb_build_array(jsonb_build_object('sourceMsg',rr->>'sourceMsg','result',case when n=1 then 'ok' else 'duplicate' end,
    'studentMatched',st is not null and not (st ? 'error')));
  end loop;
  return jsonb_build_object('ok',true,'results',res);
 end if;
 return public.mtm_dd_api8(p);
end$$;
revoke all on function public.mtm_dd_api9(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api9(jsonb) to service_role;

create or replace function public.mtm_btvn_sheet_csv4(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text;
begin
 if p_tab<>'phanhoi' then return public.mtm_btvn_sheet_csv3(p_tab); end if;
 head='Thời gian,Tuần (từ thứ 2),Vai trò,Học sinh,Lớp,Loại,Nội dung,Cần xử lý,Người xử lý,Dùng quảng bá,Nhận lúc';
 select string_agg(concat_ws(',',mtm_hw_private.csvq(mtm_hw_private.vn_ts(f.at)),
  mtm_hw_private.csvq(mtm_hw_private.vn_date(date_trunc('week',f.at at time zone 'Asia/Ho_Chi_Minh')::date)),
  mtm_hw_private.csvq(case f.role when 'PH' then 'Phụ huynh' else 'Học sinh' end),mtm_hw_private.csvq(f.student_name),mtm_hw_private.csvq(f.class_label),
  mtm_hw_private.csvq(f.type),mtm_hw_private.csvq(f.text),mtm_hw_private.csvq(f.need_action),mtm_hw_private.csvq(f.owner),
  mtm_hw_private.csvq(case when f.usable_for_promo then 'Có' else '' end),mtm_hw_private.csvq(mtm_hw_private.vn_ts(f.created_at))),E'\n' order by f.at desc,f.id desc) into body
 from mtm_hw_private.student_feedback f;
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_btvn_sheet_csv4(text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_sheet_csv4(text) to service_role;
commit;
