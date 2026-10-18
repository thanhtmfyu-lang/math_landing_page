-- 049 (18/10, anh Thành chốt): HỌC SINH MỚI đã xác nhận trong nhóm quản lý -> Javis gọi action 'student_upsert', kho/web tự tạo hoặc cập nhật
-- (tài khoản BTVN theo lớp, vào danh sách ca theo TKB; lịch riêng XPS ghi vào tên theo quy ước "(HỌC T2, 4, 7 (17H30-19H30))").
-- Chống trùng: cùng tên (bỏ dấu, bỏ ngoặc) + cùng lớp đang học, hoặc cùng sourceMsg -> cập nhật, không tạo thêm. SĐT nhận nhưng KHÔNG trả ra.
-- Lưu ý: đồng bộ roster chạy tay từ Sheet có thể tạo trùng nếu mã nguồn khác; hồ sơ do Javis tạo mang source_identity 'javis:<sourceMsg>'. ĐÃ ÁP (Claude).
begin;
create or replace function public.mtm_dd_api7(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cls record; sid uuid; created boolean=false; nm text; ps text; ident text; owner uuid;
begin
 if p->>'action'='student_upsert' then
  if coalesce(p->>'fullName','')='' or coalesce(p->>'class','')='' then return jsonb_build_object('error','need fullName,class'); end if;
  select scope.owner_id into owner from mtm_hw_private.btvn_roster_scope scope where scope.singleton;
  select c.id,c.label into cls from mtm_hw_private.classes c where c.owner_id=owner and c.active and c.label=normalize(p->>'class',NFC) limit 1;
  if cls.id is null then return jsonb_build_object('error','unknown class','hint','dùng đúng nhãn lớp web, vd "2K9 8+"'); end if;
  ps=nullif(btrim(coalesce(p->>'privateSchedule','')),'');
  nm=btrim(regexp_replace(normalize(p->>'fullName',NFC),'\s*[\(\[].*$',''))||case when ps is not null then ' (HỌC '||upper(ps)||')' else '' end;
  ident=case when coalesce(p->>'sourceMsg','')<>'' then 'javis:'||(p->>'sourceMsg') end;
  select s.id into sid from mtm_hw_private.students s
   where s.owner_id=owner and ((ident is not null and s.source_identity=ident)
    or (s.active and s.class_id=cls.id and mtm_hw_private.vn_fold(s.full_name)=mtm_hw_private.vn_fold(p->>'fullName')))
   order by (ident is not null and s.source_identity=ident) desc limit 1;
  if sid is null then
   insert into mtm_hw_private.students(owner_id,class_id,full_name,school,school_class,public_alias,student_phone,parent_phone,cohort,source_identity,parent_name)
   values(owner,cls.id,nm,coalesce(nullif(btrim(p->>'school'),''),'Chưa cập nhật'),'Chưa cập nhật', 'MTM-'||upper(substr(md5(gen_random_uuid()::text),1,12)),
    nullif(regexp_replace(coalesce(p->>'phone',''),'\D','','g'),''),nullif(regexp_replace(coalesce(p->>'parentPhone',''),'\D','','g'),''),
    split_part(cls.label,' ',1),coalesce(ident,'javis:'||mtm_hw_private.vn_fold(p->>'fullName')||':'||cls.label),nullif(p->>'phName',''))
   returning id into sid;
   insert into mtm_hw_private.memberships(student_id,class_id) values(sid,cls.id);
   created=true;
  else
   update mtm_hw_private.students set active=true,
    full_name=case when ps is not null then nm else full_name end,
    school=coalesce(nullif(p->>'school',''),school),
    student_phone=coalesce(nullif(regexp_replace(coalesce(p->>'phone',''),'\D','','g'),''),student_phone),
    parent_phone=coalesce(nullif(regexp_replace(coalesce(p->>'parentPhone',''),'\D','','g'),''),parent_phone),
    parent_name=coalesce(nullif(p->>'phName',''),parent_name)
   where id=sid;
  end if;
  return jsonb_build_object('ok',true,'created',created,'studentId',sid,'fullName',(select full_name from mtm_hw_private.students where id=sid),'className',cls.label);
 end if;
 return public.mtm_dd_api6(p);
end$$;
revoke all on function public.mtm_dd_api7(jsonb) from public,anon,authenticated;
grant execute on function public.mtm_dd_api7(jsonb) to service_role;
commit;
