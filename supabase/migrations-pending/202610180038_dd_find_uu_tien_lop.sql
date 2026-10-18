-- 038 (18/10): tìm học sinh có tên lớp chính xác thì ưu tiên đúng lớp đó (em học nhiều lớp như 9+ và HSA). ĐÃ ÁP (Claude).
begin;
create or replace function mtm_hw_private.dd_find_student(p_name text,p_class text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n int;
begin
 if coalesce(p_class,'')<>'' then
  select count(*),jsonb_agg(jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label)) into n,r
  from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
  where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%' and c.label=p_class
   and mtm_hw_private.vn_fold(s.full_name)=mtm_hw_private.vn_fold(p_name);
  if n=1 then return r->0; end if;
 end if;
 select count(*),jsonb_agg(jsonb_build_object('id',s.id,'fullName',s.full_name,'className',c.label)) into n,r
 from mtm_hw_private.students s join mtm_hw_private.classes c on c.id=s.class_id
 where s.active and c.active and coalesce(s.source_identity,'') not like 'qa:%'
  and mtm_hw_private.vn_fold(s.full_name)=mtm_hw_private.vn_fold(p_name)
  and (coalesce(p_class,'')='' or c.label=p_class or upper(split_part(c.label,' ',1))=upper(split_part(p_class,' ',1)));
 if n=1 then return r->0; end if;
 if n=0 then
  select jsonb_agg(jsonb_build_object('fullName',s.full_name,'className',c.label)) into r from (
   select s2.full_name,s2.class_id from mtm_hw_private.students s2 where s2.active
    and mtm_hw_private.vn_fold(s2.full_name) like '%'||mtm_hw_private.vn_fold(p_name)||'%' limit 8) s
   join mtm_hw_private.classes c on c.id=s.class_id;
  return jsonb_build_object('error','not_found','candidates',coalesce(r,'[]'::jsonb));
 end if;
 return jsonb_build_object('error','ambiguous','candidates',r);
end$$;
commit;
