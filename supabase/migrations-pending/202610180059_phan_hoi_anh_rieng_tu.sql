-- 059 (18/10 15:40, anh Thành qua phiên bot): ảnh BẰNG CHỨNG phản hồi PH/HS (chụp từ tin thật, SĐT đã che) phải RIÊNG TƯ:
-- lưu bucket riêng tư mtm-feedback-proof (không link công khai); Apps Script của Sheet tổng kéo về Drive riêng + ảnh trong ô.
-- feedback_add: Edge tải imagePng vào bucket riêng tư rồi gửi imagePath; kho ghi image_path theo sourceMsg.
-- mtm_btvn_feedback_since: trả phản hồi có id > p_after (cho Apps Script, chỉ service_role). ĐÃ ÁP (Claude).
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mtm-feedback-proof','mtm-feedback-proof',false,2097152,array['image/png'])
on conflict (id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/png'];
alter table mtm_hw_private.student_feedback add column if not exists image_path text;

create or replace function public.mtm_dd_api13(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 r=public.mtm_dd_api12(p);
 if p->>'action'='feedback_add' and coalesce((r->>'ok')::boolean,false) then
  update mtm_hw_private.student_feedback f set image_path=x->>'imagePath'
  from jsonb_array_elements(case when p ? 'rows' then p->'rows' else jsonb_build_array(p) end) x
  where coalesce(x->>'imagePath','')~'^[0-9]{4}-[0-9]{2}/[0-9a-f-]{36}\.png$' and f.source_msg=x->>'sourceMsg' and f.image_path is null;
 end if;
 return r;
end$$;
revoke all on function public.mtm_dd_api13(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api13(jsonb) to service_role;

create or replace function public.mtm_btvn_feedback_since(p_after bigint,p_limit int default 5) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'sourceMsg',f.source_msg,'at',mtm_hw_private.vn_ts(f.at),
   'role',case f.role when 'PH' then 'Phụ huynh' else 'Học sinh' end,'student',f.student_name,'className',f.class_label,'type',f.type,
   'text',f.text,'needAction',f.need_action,'owner',f.owner,'promo',f.usable_for_promo,'imagePath',f.image_path) order by f.id),'[]'::jsonb)
 from (select * from mtm_hw_private.student_feedback where id>coalesce(p_after,0) order by id limit least(greatest(coalesce(p_limit,5),1),20)) f
$$;
revoke all on function public.mtm_btvn_feedback_since(bigint,int) from public,anon,authenticated;
grant execute on function public.mtm_btvn_feedback_since(bigint,int) to service_role;
commit;
