-- 053 (18/10, anh Thành qua phiên bot): (1) hồ sơ học sinh: trường + LỚP Ở TRƯỜNG (school_class) nhận từ student_upsert/profile_update;
-- action missing_profile liệt kê em thiếu để Javis chỉ hỏi đúng em (không trả SĐT). (2) Thẻ phản hồi có ảnh: cột image_url (Edge mtm-diem-danh
-- tải ảnh PNG vào bucket công khai mtm-feedback-cards; ảnh là thẻ ẩn danh do Javis vẽ, không phải ảnh chụp tin nhắn). ĐÃ ÁP (Claude).
begin;
alter table mtm_hw_private.student_feedback add column if not exists image_url text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mtm-feedback-cards','mtm-feedback-cards',true,2097152,array['image/png'])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/png'];

create or replace function mtm_hw_private.thieu(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(btrim(v),'') in ('','Chưa cập nhật','chưa cập nhật','MTM') $$;

create or replace function public.mtm_dd_api11(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; st jsonb; sid uuid;
begin
 if p->>'action'='profile_update' then
  -- {student,class,school,schoolClass,sourceMsg}: chỉ ghi trường có giá trị, không xoá dữ liệu cũ
  st=mtm_hw_private.dd_find_student(p->>'student',p->>'class');
  if st ? 'error' then return st; end if;
  update mtm_hw_private.students set
   school=case when coalesce(btrim(p->>'school'),'')<>'' then left(btrim(p->>'school'),200) else school end,
   school_class=case when coalesce(btrim(p->>'schoolClass'),'')<>'' then left(upper(btrim(p->>'schoolClass')),100) else school_class end
  where id=(st->>'id')::uuid;
  return jsonb_build_object('ok',true,'student',st);
 elsif p->>'action'='missing_profile' then
  return coalesce((select jsonb_agg(jsonb_build_object('student',btrim(regexp_replace(s.full_name,'\s*[\(\[].*$','')),'class',c.label,
    'missingSchool',mtm_hw_private.thieu(s.school) and mtm_hw_private.thieu(ap.school),'missingSchoolClass',mtm_hw_private.thieu(s.school_class),
    'hasGuardian',exists(select 1 from mtm_hw_private.guardians g where g.student_id=s.id)) order by c.label,s.full_name)
   from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id left join mtm_hw_private.student_appearance ap on ap.student_id=s.id
   where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%'
    and ((mtm_hw_private.thieu(s.school) and mtm_hw_private.thieu(ap.school)) or mtm_hw_private.thieu(s.school_class))
    and (coalesce(p->>'class','')='' or c.label=p->>'class')),'[]'::jsonb);
 end if;
 r=public.mtm_dd_api10(p);
 if p->>'action'='student_upsert' and coalesce((r->>'ok')::boolean,false) and coalesce(btrim(p->>'schoolClass'),'')<>'' then
  update mtm_hw_private.students set school_class=left(upper(btrim(p->>'schoolClass')),100) where id=(r->>'studentId')::uuid;
 end if;
 if p->>'action'='feedback_add' and coalesce((r->>'ok')::boolean,false) then
  -- gắn link ảnh (Edge đã tải lên) vào đúng phản hồi theo sourceMsg
  update mtm_hw_private.student_feedback f set image_url=x->>'imageUrl'
  from jsonb_array_elements(case when p ? 'rows' then p->'rows' else jsonb_build_array(p) end) x
  where coalesce(x->>'imageUrl','')<>'' and f.source_msg=x->>'sourceMsg' and x->>'imageUrl' ~ '^https://egljwujhgdapaxyrjskj\.supabase\.co/storage/v1/object/public/mtm-feedback-cards/';
 end if;
 return r;
end$$;
revoke all on function public.mtm_dd_api11(jsonb),mtm_hw_private.thieu(text) from public,anon,authenticated;
grant execute on function public.mtm_dd_api11(jsonb) to service_role;

create or replace function public.mtm_btvn_sheet_csv5(p_tab text) returns text
language plpgsql stable security definer set search_path='' as $$
declare head text; body text;
begin
 if p_tab<>'phanhoi' then return public.mtm_btvn_sheet_csv4(p_tab); end if;
 head='Thời gian,Tuần (từ thứ 2),Vai trò,Học sinh,Lớp,Loại,Nội dung,Cần xử lý,Người xử lý,Dùng quảng bá,Nhận lúc,Link ảnh';
 select string_agg(concat_ws(',',mtm_hw_private.csvq(mtm_hw_private.vn_ts(f.at)),
  mtm_hw_private.csvq(mtm_hw_private.vn_date(date_trunc('week',f.at at time zone 'Asia/Ho_Chi_Minh')::date)),
  mtm_hw_private.csvq(case f.role when 'PH' then 'Phụ huynh' else 'Học sinh' end),mtm_hw_private.csvq(f.student_name),mtm_hw_private.csvq(f.class_label),
  mtm_hw_private.csvq(f.type),mtm_hw_private.csvq(f.text),mtm_hw_private.csvq(f.need_action),mtm_hw_private.csvq(f.owner),
  mtm_hw_private.csvq(case when f.usable_for_promo then 'Có' else '' end),mtm_hw_private.csvq(mtm_hw_private.vn_ts(f.created_at)),mtm_hw_private.csvq(f.image_url)),
  E'\n' order by f.at desc,f.id desc) into body
 from mtm_hw_private.student_feedback f;
 return head||E'\n'||coalesce(body,'');
end$$;
revoke all on function public.mtm_btvn_sheet_csv5(text) from public,anon,authenticated;
grant execute on function public.mtm_btvn_sheet_csv5(text) to service_role;
commit;
