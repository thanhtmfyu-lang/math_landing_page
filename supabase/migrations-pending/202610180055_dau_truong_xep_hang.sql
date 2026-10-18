-- 055 (18/10, anh Thành): bảng xếp hạng CÔNG KHAI đầy đủ (họ tên, avatar, trường, lớp ở trường, điểm), "phô trương, cạnh tranh hơn".
-- Đấu trường: một lượt gọi trả cả 3 khối: bảng TỪNG LỚP (top 10 trong lớp, kể cả lớp chưa có ai) rồi bảng TOÀN KHỐI (top 10) + đua lớp (điểm TB, em dẫn đầu).
-- btvn_rank_rows: thêm 'schoolClass'; p_student = uuid 0 trả MỌI hàng (chỉ dùng nội bộ cho đua lớp, ảnh bị bỏ ở bước gộp). ĐÃ ÁP (Claude).
begin;
do $$
declare src text; orig text; fixed text; sc text;
begin
 select pg_get_functiondef('mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid)'::regprocedure) into src; orig=src;
 sc=$a$'schoolClass',nullif(nullif(btrim(coalesce(s.school_class,'')),''),'Chưa cập nhật'),$a$;
 src=replace(src,sc||sc,sc); -- chạy lại an toàn: bỏ bản vá lặp
 fixed=case when position(sc in src)>0 then src else replace(src,$a$'score',round(r.score,2),$a$,$a$'schoolClass',nullif(nullif(btrim(coalesce(s.school_class,'')),''),'Chưa cập nhật'),'score',round(r.score,2),$a$) end;
 fixed=replace(fixed,$a$where (p_student is null and r.rank<=10) or r.id=p_student;$a$,$a$where (p_student is null and r.rank<=10) or r.id=p_student or p_student='00000000-0000-0000-0000-000000000000'::uuid;$a$);
 if position('schoolClass' in fixed)=0 or position('00000000-0000-0000-0000-000000000000' in fixed)=0 then raise exception 'btvn_rank_rows patch did not apply'; end if;
 if fixed<>orig then execute fixed; end if;
end$$;
revoke all on function mtm_hw_private.btvn_rank_rows(text,text,text,text,uuid) from public,anon,authenticated,service_role,mtm_btvn_publisher;

create or replace function public.mtm_btvn_arena(p_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text; rws jsonb; res jsonb='[]'::jsonb;
begin
 if p_kind is null or p_kind not in ('btvn-tuan','btvn-thang','kiem-tra-thang') then raise exception 'Invalid arena kind'; end if;
 foreach c in array array['2K9','2K10','2K11'] loop
  rws=coalesce(mtm_hw_private.btvn_rank_rows(c,p_kind,null,null,'00000000-0000-0000-0000-000000000000'::uuid),'[]'::jsonb);
  res=res||jsonb_build_array(jsonb_build_object('cohort',c,
   'top',coalesce((select jsonb_agg(e order by (e->>'rank')::int) from jsonb_array_elements(rws) e where (e->>'rank')::int<=10),'[]'::jsonb),
   'ranked',jsonb_array_length(rws),
   'perfect',(select count(*) from jsonb_array_elements(rws) e where (e->>'score')::numeric>=10),
   'classes',coalesce((select jsonb_agg(jsonb_build_object('className',k.cls,'students',coalesce(k.n,0),'avg',coalesce(k.avg,0),'best',coalesce(k.best,0),'leader',coalesce(k.leader,''),
      'top',coalesce((select jsonb_agg(e||jsonb_build_object('rank',e2.cr,'cohortRank',(e->>'rank')::int) order by e2.cr)
        from jsonb_array_elements(rws) e cross join lateral (select (select count(*) from jsonb_array_elements(rws) z where z->>'className'=k.cls and (z->>'rank')::int<=(e->>'rank')::int)::int cr) e2
        where e->>'className'=k.cls and e2.cr<=10),'[]'::jsonb)) order by k.n is null,k.avg desc nulls last,k.n desc nulls last,k.cls)
     from (select cl.label cls,g.n,g.avg,g.best,g.leader from mtm_hw_private.classes cl
       left join (select e->>'className' cls,count(*)::int n,round(avg((e->>'score')::numeric),2) avg,max((e->>'score')::numeric) best,
         (array_agg(e->>'fullName' order by (e->>'rank')::int))[1] leader from jsonb_array_elements(rws) e group by e->>'className') g on g.cls=cl.label
       where cl.active and upper(substring(cl.label from '^[^ ]+'))=c
        and exists(select 1 from mtm_hw_private.students s where s.class_id=cl.id and s.active and coalesce(s.source_identity,'') not like 'qa:%')) k),'[]'::jsonb)));
 end loop;
 return jsonb_build_object('kind',p_kind,'cohorts',res);
end$$;
revoke all on function public.mtm_btvn_arena(text) from public,anon,authenticated,mtm_btvn_publisher;
grant execute on function public.mtm_btvn_arena(text) to service_role;
commit;
